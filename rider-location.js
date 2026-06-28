// ===================================================
// NEKTA RIDER - LOCATION TRACKING + DISTANCE STRIP
// Handles: online GPS, RTDB writes, distance strip
// Map rendering is handled by rider-map.js
// ===================================================

// STORE_LAT/STORE_LNG set by firebase-config.js (loaded before this file)
var _RL_STORE_LAT = window.STORE_LAT || 17.549395259963312;
var _RL_STORE_LNG = window.STORE_LNG || 80.6274729902068;

var _riderLat = null;
var _riderLng = null;
var _onlineGPSWatch = null;

function _haversineKmRL(lat1, lng1, lat2, lng2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2)
        + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)
        * Math.sin(dLng/2)*Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function _fmtDist(km) {
  if (!km && km !== 0) return '--';
  if (km < 1) return Math.round(km * 1000) + ' m';
  return km.toFixed(1) + ' km';
}

function _fmtETA(km, speedKmh) {
  speedKmh = speedKmh || 25;
  var mins = Math.ceil((km / speedKmh) * 60);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return mins + ' min';
  return Math.floor(mins/60) + 'h ' + (mins%60) + 'm';
}

// -- Write rider location to RTDB ---------------------
function writeRiderLocation(lat, lng, heading, speed) {
  var phone = window._phone || (typeof _phone !== 'undefined' ? _phone : null);
  var locData = { lat: lat, lng: lng, latitude: lat, longitude: lng, heading: heading || 0, speed: speed || 0, ts: Date.now() };
  if (!window.rtdb) return;
  // Always write online presence by phone number
  if (phone) window.rtdb.ref('riderLocations/' + phone).set(locData);
  // Write by orderId ONLY when not actively delivering
  // (rider-map.js handles this more frequently during active delivery)
  var myOrder = window._myOrder || (window._orders && window._orders[0]);
  var isDelivering = myOrder && (myOrder.status === 'picked' || myOrder.status === 'en_route');
  if (myOrder && myOrder.id && !isDelivering) {
    window.rtdb.ref('riderLocations/' + myOrder.id).set(locData);
    window.rtdb.ref('orders/' + myOrder.id + '/riderLocation').set(locData);
  }
}

// -- Start/stop online GPS ----------------------------
window.startOnlineGPS = function() {
  if (_onlineGPSWatch || !navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(function(pos) {
    _riderLat = pos.coords.latitude;
    _riderLng = pos.coords.longitude;
    writeRiderLocation(_riderLat, _riderLng, 0, 0);
    _updateDistanceInfo();
  }, function(){}, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });

  _onlineGPSWatch = navigator.geolocation.watchPosition(function(pos) {
    _riderLat = pos.coords.latitude;
    _riderLng = pos.coords.longitude;
    writeRiderLocation(_riderLat, _riderLng, pos.coords.heading || 0, pos.coords.speed || 0);
    _updateDistanceInfo();
  }, function(){}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
};

window.stopOnlineGPS = function() {
  if (_onlineGPSWatch) {
    navigator.geolocation.clearWatch(_onlineGPSWatch);
    _onlineGPSWatch = null;
  }
};

// -- Update distance info on order cards (uses OSRM road distance) ------
function _updateDistanceInfo() {
  if (!_riderLat || !_riderLng) return;
  // Try OSRM road distance first, fall back to haversine
  fetch('https://router.project-osrm.org/route/v1/driving/'
    + _RL_STORE_LNG+','+_RL_STORE_LAT+';'+_riderLng+','+_riderLat
    + '?overview=false',
    { signal: AbortSignal.timeout(4000) })
    .then(function(r) { return r.json(); })
    .then(function(j) {
      var dist = (j.code === 'Ok' && j.routes && j.routes.length)
        ? j.routes[0].distance / 1000
        : _haversineKmRL(_riderLat, _riderLng, _RL_STORE_LAT, _RL_STORE_LNG);
      _setDistanceUI(dist);
    })
    .catch(function() {
      var dist = _haversineKmRL(_riderLat, _riderLng, _RL_STORE_LAT, _RL_STORE_LNG);
      _setDistanceUI(dist);
    });
}
function _setDistanceUI(dist) {
  var el = document.getElementById('rider-to-store-info');
  if (el) el.textContent = _fmtDist(dist) + ' from store · ' + _fmtETA(dist) + ' to reach';
}

// -- Hook into toggleOnline ---------------------------
var _origToggleOnline = window.toggleOnline;
window.toggleOnline = async function() {
  if (_origToggleOnline) await _origToggleOnline();
  if (window._isOnline) window.startOnlineGPS();
  else window.stopOnlineGPS();
};

// -- Add distance strip to available order cards ------
var _origRenderAvailSection = window.renderAvailSection;
window.renderAvailSection = function() {
  if (_origRenderAvailSection) _origRenderAvailSection();
  var sec = document.getElementById('avail-section');
  if (!sec || sec.style.display === 'none' || !_riderLat || !_riderLng) return;

  var dist = _haversineKmRL(_riderLat, _riderLng, _RL_STORE_LAT, _RL_STORE_LNG);
  var eta  = _fmtETA(dist);
  var existing = document.getElementById('rider-to-store-strip');
  if (!existing) {
    var strip = document.createElement('div');
    strip.id = 'rider-to-store-strip';
    strip.style.cssText = 'margin:8px 16px 0;background:linear-gradient(135deg,#E8F5E9,#C8E6C9);border-radius:12px;padding:10px 14px;display:flex;align-items:center;gap:10px;border:1px solid rgba(12,139,74,.2)';
    strip.innerHTML =
      '<div style="font-size:22px">\uD83C\uDFEA</div>' +
      '<div style="flex:1"><div style="font-size:12px;font-weight:800;color:#0C8B4A" id="rider-to-store-info">' +
        _fmtDist(dist) + ' from store · ' + eta + ' to reach' +
      '</div><div style="font-size:11px;color:#2E7D32;margin-top:2px">Distance to store</div></div>' +
      '<div style="text-align:right"><div style="font-size:16px;font-weight:900;color:#0C8B4A;font-family:var(--mono)">' + eta + '</div>' +
      '<div style="font-size:10px;color:#388E3C">ETA to store</div></div>';
    var list = document.getElementById('avail-list');
    if (list) sec.insertBefore(strip, list);
  } else {
    var info = document.getElementById('rider-to-store-info');
    if (info) info.textContent = _fmtDist(dist) + ' from store · ' + eta + ' to reach';
  }
};
