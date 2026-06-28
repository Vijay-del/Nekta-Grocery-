// ═══════════════════════════════════════════════════
// NEKTA RIDER MAP v2 — Full Rapido-style tracking
// Wires: ETA banner, dist/eta/earn cards, PIN strip,
//        live route, smooth marker animation, gmaps btn
// ═══════════════════════════════════════════════════

var _riderMap       = null;
var _riderMarkerL   = null;
var _riderArrow     = null;
var _custMarkerL    = null;
var _routeLineL     = null;
var _storeUserLine  = null;
var _routeTimer     = null;
var _lastHeading    = 0;
var _animFrame      = null;

var _STORE_LAT = window.STORE_LAT || 17.549395259963312;
var _STORE_LNG = window.STORE_LNG || 80.6274729902068;
// Per-order shop location (overrides default when seller order)
window._ORDER_STORE_LAT = null;
window._ORDER_STORE_LNG = null;
function _getStoreLat() { return window._ORDER_STORE_LAT || _STORE_LAT; }
function _getStoreLng() { return window._ORDER_STORE_LNG || _STORE_LNG; }

// ── Preload Leaflet ──────────────────────────────
(function(){
  if (!document.getElementById('lf-css')) {
    var c = document.createElement('link');
    c.id = 'lf-css'; c.rel = 'stylesheet';
    c.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(c);
  }
  if (!window.L && !document.getElementById('lf-js')) {
    var s = document.createElement('script');
    s.id = 'lf-js';
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    document.head.appendChild(s);
  }
})();

function _waitLeaflet(cb) {
  if (window.L) { cb(); return; }
  var t = 0;
  var iv = setInterval(function() {
    if (window.L) { clearInterval(iv); cb(); }
    if (++t > 80) clearInterval(iv);
  }, 100);
}

// ── Icons ────────────────────────────────────────
function _mkIcon(emoji, size, anchor) {
  if (!window.L) return null;
  return window.L.divIcon({
    html: '<div style="font-size:' + size + 'px;line-height:1;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))">' + emoji + '</div>',
    className: '', iconAnchor: [anchor || Math.floor(size/2), anchor || size]
  });
}

// ── Haversine ────────────────────────────────────
function _hav(la1, ln1, la2, ln2) {
  var R = 6371, dL = (la2-la1)*Math.PI/180, dl = (ln2-ln1)*Math.PI/180;
  var a = Math.sin(dL/2)*Math.sin(dL/2) + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dl/2)*Math.sin(dl/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function _fmtD(km) { return km < 1 ? Math.round(km*1000)+'m' : km.toFixed(1)+'km'; }
// FIX: use 20km/h (realistic city speed) instead of 22
function _fmtE(km) { var m = Math.max(1, Math.ceil((km/20)*60)); return m < 60 ? m+' min' : Math.floor(m/60)+'h '+(m%60)+'m'; }

// ── OSRM road routing (public OSRM — no API key, real roads) ──
var _osrmCache = {};
var _OSRM_CACHE_TTL = 120000; // 2 minutes — expire so moving rider gets fresh route
function _osrm(la1, ln1, la2, ln2, cb) {
  var key = la1.toFixed(3)+ln1.toFixed(3)+la2.toFixed(3)+ln2.toFixed(3);
  if (_osrmCache[key] && Date.now()-_osrmCache[key].ts < _OSRM_CACHE_TTL) { cb(_osrmCache[key]); return; }
  fetch('https://router.project-osrm.org/route/v1/driving/'+ln1+','+la1+';'+ln2+','+la2+'?overview=full&geometries=geojson',
    { signal: AbortSignal.timeout(7000) })
    .then(function(r) { return r.json(); })
    .then(function(j) {
      if (j.code !== 'Ok' || !j.routes.length) { cb(null); return; }
      var result = {
        distKm: j.routes[0].distance / 1000,
        coords: j.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; }),
        ts: Date.now()
      };
      _osrmCache[key] = result;
      cb(result);
    })
    .catch(function() { cb(null); });
}
window._osrm = _osrm; // expose so user-side updateTMap can reuse

// ── Update Rapido-style info panels ─────────────
function _updateInfoPanels(distKm, isDelivering, riderEarns) {
  // FIX: 20km/h to match _fmtE
  var mins = Math.max(1, Math.ceil((distKm/20)*60));

  // Banner
  var banner = document.getElementById('rider-eta-banner');
  var phaseLabel = document.getElementById('rider-phase-label');
  var etaVal = document.getElementById('rider-eta-val');
  var distVal = document.getElementById('rider-dist-val');
  if (banner && phaseLabel && etaVal && distVal) {
    if (isDelivering) {
      banner.className = 'eta-banner deliver';
      phaseLabel.textContent = '🚀 Delivering to Customer';
      etaVal.textContent = 'Arriving in ' + _fmtE(distKm);
    } else {
      banner.className = 'eta-banner pickup';
      phaseLabel.textContent = '🏪 Heading to Store';
      etaVal.textContent = 'Reaching in ' + _fmtE(distKm);
    }
    distVal.textContent = _fmtD(distKm);
  }

  // ETA card
  var dicEta = document.getElementById('dic-eta');
  if (dicEta) dicEta.innerHTML = mins + '<span> min</span>';
  // Also update order card delivery header if visible
  var ocEta = document.getElementById('oc-eta-'+orderId);
  if (ocEta) ocEta.textContent = mins;

  // Dist card
  var dicDist = document.getElementById('dic-dist');
  if (dicDist) dicDist.innerHTML = distKm < 1 ? Math.round(distKm*1000) + '<span> m</span>' : distKm.toFixed(1) + '<span> km</span>';
  // Also update order card delivery header if visible
  var ocDist = document.getElementById('oc-dist-'+orderId);
  if (ocDist) ocDist.textContent = distKm.toFixed(1);

  // Phase chips
  var dicPhase = document.getElementById('dic-phase');
  var dicDistPhase = document.getElementById('dic-dist-phase');
  if (dicPhase) { dicPhase.textContent = isDelivering ? 'To Customer' : 'To Store'; dicPhase.className = 'dic-phase ' + (isDelivering ? 'cust' : 'store'); }
  if (dicDistPhase) { dicDistPhase.textContent = 'Remaining'; dicDistPhase.className = 'dic-phase ' + (isDelivering ? 'cust' : 'store'); }

  // gps-label-text (legacy small label)
  var lbl = document.getElementById('gps-label-text');
  if (lbl) lbl.textContent = _fmtD(distKm) + ' · ' + _fmtE(distKm);

  // Earnings card
  var dicEarn = document.getElementById('dic-earn');
  if (dicEarn && riderEarns) dicEarn.innerHTML = '₹' + riderEarns;
  // Also update order card delivery header if visible
  var ocEarn = document.getElementById('oc-earn-'+orderId);
  if (ocEarn && riderEarns) ocEarn.textContent = '₹' + riderEarns;
}

// ── Show/hide delivery PIN ───────────────────────
function _showRiderPIN(pin) {
  // PIN should ONLY be shown to customer for verification
  // DO NOT show to rider — this prevents accidental PIN exposure
  // The PIN verification happens in the POD modal (pod-pin-section)
  // so rider still needs to verify, but PIN digits never display on map
  if (!pin) return;
  // rider-pin-strip is HIDDEN intentionally — PIN never shown to rider
}

// ── Google Maps button ───────────────────────────
function _updateGMapsBtn(rLat, rLng, cLat, cLng) {
  var btn = document.getElementById('rider-gmaps-btn');
  if (!btn) {
    btn = document.createElement('a');
    btn.id = 'rider-gmaps-btn'; btn.target = '_blank'; btn.rel = 'noopener';
    btn.style.cssText = 'margin-left:auto;background:#4285F4;color:#fff;font-size:11px;font-weight:800;padding:5px 12px;border-radius:20px;text-decoration:none;white-space:nowrap;flex-shrink:0';
    var bar = document.querySelector('.gps-status');
    if (bar) bar.appendChild(btn);
  }
  var myOrder = window._myOrder;
  var isDelivering = myOrder && (myOrder.status === 'picked' || myOrder.status === 'en_route');
  if (isDelivering && cLat && cLng) {
    btn.href = 'https://www.google.com/maps/dir/' + rLat + ',' + rLng + '/' + cLat + ',' + cLng;
    btn.textContent = '🗺 To Customer';
  } else {
    btn.href = 'https://www.google.com/maps/dir/' + rLat + ',' + rLng + '/' + _getStoreLat() + ',' + _getStoreLng();
    btn.textContent = '🗺 To Store';
  }
}

// ── Draw route line ──────────────────────────────
function _drawRoute(la1, ln1, la2, ln2, color, dashed, onDone) {
  if (!_riderMap || !window.L) return;
  _osrm(la1, ln1, la2, ln2, function(r) {
    if (!_riderMap) return; // FIX: map may have been destroyed while fetch was in-flight
    var coords = r ? r.coords : [[la1, ln1], [la2, ln2]];
    var line = window.L.polyline(coords, {
      color: color, weight: dashed ? 4 : 5.5,
      opacity: dashed ? 0.65 : 0.95,
      dashArray: dashed ? '10,6' : null,
      lineJoin: 'round', lineCap: 'round'
    }).addTo(_riderMap);
    if (onDone) onDone(line, r);
  });
}

// ── Build map ────────────────────────────────────
function _buildRiderMap(lat, lng, custLat, custLng, riderEarns) {
  var el = document.getElementById('rider-map-el');
  if (!el || !window.L) { console.warn('Map init failed'); return; }
  if (_riderMap) {
    _riderMap.remove(); _riderMap = null;
    _riderMarkerL = null; _riderArrow = null;
    _custMarkerL = null; _routeLineL = null; _storeUserLine = null;
  }

  var sLat = _getStoreLat();
  var sLng = _getStoreLng();

  _riderMap = window.L.map(el, { zoomControl: false, attributionControl: false });
  _riderMap.setView([lat, lng], 14);
  window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 20, subdomains: 'abcd' }).addTo(_riderMap);

  // Markers
  window.L.marker([sLat, sLng], { icon: _mkIcon('🏪', 26, 13) })
    .addTo(_riderMap).bindPopup('<b>🏪 Store / Shop</b>');
  _riderMarkerL = window.L.marker([lat, lng], { icon: _mkIcon('🛵', 30, 15) })
    .addTo(_riderMap).bindPopup('<b>🛵 You</b>');

  var myOrder = window._myOrder;
  var isDelivering = myOrder && (myOrder.status === 'picked' || myOrder.status === 'en_route');

  if (custLat && custLng) {
    _custMarkerL = window.L.marker([custLat, custLng], { icon: _mkIcon('🏠', 26, 13) })
      .addTo(_riderMap).bindPopup('<b>🏠 Customer</b>');

    // Green dashed: Store → Customer (static delivery path)
    _drawRoute(sLat, sLng, custLat, custLng, '#00b96b', true, function(line) {
      _storeUserLine = line;
    });

    if (isDelivering) {
      // Orange: Rider → Customer
      _drawRoute(lat, lng, custLat, custLng, '#f97316', false, function(line, r) {
        _routeLineL = line;
        if (r) _updateInfoPanels(r.distKm, true, riderEarns);
        else _updateInfoPanels(_hav(lat, lng, custLat, custLng), true, riderEarns);
      });
    } else {
      // Orange: Rider → Store/Shop
      _drawRoute(lat, lng, sLat, sLng, '#f97316', false, function(line, r) {
        _routeLineL = line;
        if (r) _updateInfoPanels(r.distKm, false, riderEarns);
        else _updateInfoPanels(_hav(lat, lng, sLat, sLng), false, riderEarns);
      });
    }

    var bounds = [[lat, lng], [custLat, custLng], [sLat, sLng]];
    _riderMap.fitBounds(window.L.latLngBounds(bounds), { padding: [45, 45] });
  } else {
    _drawRoute(lat, lng, sLat, sLng, '#f97316', false, function(line, r) {
      _routeLineL = line;
      if (r) _updateInfoPanels(r.distKm, false, riderEarns);
      else _updateInfoPanels(_hav(lat, lng, sLat, sLng), false, riderEarns);
    });
    _riderMap.fitBounds([[lat, lng], [sLat, sLng]], { padding: [45, 45] });
  }

  _updateGMapsBtn(lat, lng, custLat, custLng);
}

// ── Smooth marker animation ──────────────────────
function _animateMarker(from, to, duration) {
  if (!_riderMarkerL) return;
  var start = null;
  var fromLat = from[0], fromLng = from[1];
  var toLat = to[0], toLng = to[1];
  function step(ts) {
    if (!start) start = ts;
    var p = Math.min((ts - start) / duration, 1);
    // ease out cubic
    p = 1 - Math.pow(1 - p, 3);
    _riderMarkerL.setLatLng([fromLat + (toLat - fromLat) * p, fromLng + (toLng - fromLng) * p]);
    if (p < 1) _animFrame = requestAnimationFrame(step);
  }
  if (_animFrame) cancelAnimationFrame(_animFrame);
  _animFrame = requestAnimationFrame(step);
}

// ── Update marker position ───────────────────────
var _routeRedrawCount = 0;
function _updateRiderMarker(lat, lng, custLat, custLng, heading, riderEarns) {
  if (!_riderMap || !window.L) return;
  var prev = _riderMarkerL ? [_riderMarkerL.getLatLng().lat, _riderMarkerL.getLatLng().lng] : [lat, lng];
  _animateMarker(prev, [lat, lng], 1500);
  _riderMap.panTo([lat, lng], { animate: true, duration: 1.5, easeLinearity: 0.5 });
  // Redraw route every 2 updates
  _routeRedrawCount++;
  if (_routeRedrawCount >= 2) {
    _routeRedrawCount = 0;
    clearTimeout(_routeTimer);
    _routeTimer = setTimeout(function() {
      if (!_riderMap) return; // FIX: guard against null after stopGPS()
      var myOrder = window._myOrder;
      var isDelivering = myOrder && (myOrder.status === 'picked' || myOrder.status === 'en_route');
      var dest = (isDelivering && custLat && custLng) ? [custLat, custLng] : [_getStoreLat(), _getStoreLng()];
      if (_routeLineL) { _riderMap.removeLayer(_routeLineL); _routeLineL = null; }
      _drawRoute(lat, lng, dest[0], dest[1], '#f97316', false, function(line, r) {
        if (!_riderMap) return; // FIX: guard in async callback
        _routeLineL = line;
        if (r) _updateInfoPanels(r.distKm, isDelivering, riderEarns);
        else _updateInfoPanels(_hav(lat, lng, dest[0], dest[1]), isDelivering, riderEarns);
      });
      _updateGMapsBtn(lat, lng, custLat, custLng);
    }, 500);
  } else {
    // Quick haversine update for UI freshness without re-routing
    var myOrder = window._myOrder;
    var isDelivering = myOrder && (myOrder.status === 'picked' || myOrder.status === 'en_route');
    var dest = (isDelivering && custLat && custLng) ? [custLat, custLng] : [_getStoreLat(), _getStoreLng()];
    _updateInfoPanels(_hav(lat, lng, dest[0], dest[1]), isDelivering, riderEarns);
  }
}

// ── startGPS — main entry point ──────────────────
function startGPS(orderId) {
  if (window._riderW) { navigator.geolocation.clearWatch(window._riderW); window._riderW = null; }
  if (startGPS._unsub) { startGPS._unsub(); startGPS._unsub = null; }
  if (!('geolocation' in navigator)) return;

  // Store active orderId so we can restore on reload
  try { localStorage.setItem('nk_active_gps_order', orderId); } catch(e) {}

  var _custLat = null, _custLng = null, _riderEarns = null, _deliveryPin = null;

  // Show strip immediately so it doesn't hide
  var strip = document.getElementById('live-map-strip');
  if (strip) strip.style.display = 'block';

  // Load order data once — also load seller shop location if present
  if (window.db) {
    window.db.collection('orders').doc(orderId).get().then(function(doc) {
      if (!doc.exists) return;
      var d = doc.data();
      // FIX: read both lat/lng field naming conventions
      _custLat = d.latitude || d.lat || null;
      _custLng = d.longitude || d.lng || null;
      _deliveryPin = d.deliveryPin || null;
      var dc = d.deliveryCharge || 0;
      if (window._rainActive) dc += 10;
      _riderEarns = dc;
      window._myOrder = { id: orderId, status: d.status, latitude: _custLat, longitude: _custLng };
      if (_deliveryPin) _showRiderPIN(_deliveryPin);
      var earnEl = document.getElementById('dic-earn');
      if (earnEl && _riderEarns) earnEl.innerHTML = '&#8377;' + _riderEarns;
      // Load seller shop location if this order came from a seller
      if (d.shopId) {
        window.db.collection('shops').doc(d.shopId).get().then(function(shopDoc) {
          if (!shopDoc.exists) return;
          var s = shopDoc.data();
          if (s.latitude && s.longitude) {
            window._ORDER_STORE_LAT = s.latitude;
            window._ORDER_STORE_LNG = s.longitude;
          }
        }).catch(function() {});
      }
    }).catch(function() {});
  }

  // Also listen for status changes to switch route phase
  var _orderUnsub = null;
  if (window.db) {
    _orderUnsub = window.db.collection('orders').doc(orderId).onSnapshot(function(doc) {
      if (!doc.exists) return;
      var d = doc.data();
      // FIX: always update customer lat/lng from snapshot so pin is always fresh
      _custLat = d.latitude || d.lat || _custLat;
      _custLng = d.longitude || d.lng || _custLng;
      _deliveryPin = d.deliveryPin || _deliveryPin;
      var dc = d.deliveryCharge || 0;
      if (window._rainActive) dc += 10;
      _riderEarns = dc;
      window._myOrder = { id: orderId, status: d.status, latitude: _custLat, longitude: _custLng };
      if (_deliveryPin) _showRiderPIN(_deliveryPin);
      // FIX: update customer marker on map when location arrives
      if (_riderMap && _custLat && _custLng) {
        if (_custMarkerL) {
          _custMarkerL.setLatLng([_custLat, _custLng]);
        } else {
          _custMarkerL = window.L.marker([_custLat, _custLng], { icon: _mkIcon('🏠', 26, 13) })
            .addTo(_riderMap).bindPopup('<b>🏠 Customer</b>');
        }
      }
      // Keep strip visible on any status change
      showLiveMap();
    });
  }

  var _mapBuilt = false;

  var onPos = function(pos) {
    var lat = pos.coords.latitude, lng = pos.coords.longitude;
    var heading = pos.coords.heading || 0;

    // Update GPS coords display
    var ce = document.getElementById('gps-coords');
    if (ce) ce.textContent = lat.toFixed(4) + ', ' + lng.toFixed(4);

    // Write to RTDB — both by orderId and phone so user-side listener picks it up
    if (window.rtdb) {
      var loc = { lat: lat, lng: lng, latitude: lat, longitude: lng,
                  heading: heading, speed: pos.coords.speed || 0, ts: Date.now() };
      window.rtdb.ref('riderLocations/' + orderId).set(loc);
      window.rtdb.ref('orders/' + orderId + '/riderLocation').set(loc);
      // Also write by phone for the online presence strip
      if (window._phone) window.rtdb.ref('riderLocations/' + window._phone).set(loc);
    }

    // Write to Firestore every 10s
    if (!startGPS._fsLast) startGPS._fsLast = {};
    var now = Date.now();
    if (!startGPS._fsLast[orderId] || now - startGPS._fsLast[orderId] > 10000) {
      startGPS._fsLast[orderId] = now;
      if (window.db) window.db.collection('orders').doc(orderId).update({
        riderLat: lat, riderLng: lng,
        'riderLocation.latitude': lat, 'riderLocation.longitude': lng,
        'riderLocation.timestamp': new Date().toISOString()
      }).catch(function() {});
    }

    // Build or update map
    if (!_mapBuilt) {
      _mapBuilt = true;
      _waitLeaflet(function() {
        _buildRiderMap(lat, lng, _custLat, _custLng, _riderEarns);
        // After build, call showLiveMap so strip stays in order card
        showLiveMap();
      });
    } else {
      _updateRiderMarker(lat, lng, _custLat, _custLng, heading, _riderEarns);
      // FIX: re-inject map after each position update in case DOM was re-rendered
      showLiveMap();
    }
  };

  window._riderW = navigator.geolocation.watchPosition(
    onPos,
    function() {
      navigator.geolocation.watchPosition(onPos, function() {}, {
        enableHighAccuracy: false, maximumAge: 10000, timeout: 20000
      });
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );

  // Cleanup on stop
  startGPS._unsub = _orderUnsub;
}

// ── showLiveMap — moves map strip into the active order card ──
// Called on startGPS and after every renderOrders() re-render
function showLiveMap() {
  var strip = document.getElementById('live-map-strip');
  if (!strip) return;

  strip.style.display = 'block';
  strip.style.margin = '0';
  strip.style.borderRadius = '0';
  strip.style.border = 'none';
  strip.style.boxShadow = 'none';

  // Find the active order's inject slot
  var order = window._myOrder;
  var slot = order ? document.getElementById('live-map-inject-' + order.id) : null;

  if (slot && !slot.contains(strip)) {
    // Move the strip DOM node into the card slot
    slot.innerHTML = '';
    slot.appendChild(strip);
  } else if (!slot) {
    // Fallback: show at top of orders section
    var ordersEl = document.getElementById('orders-list');
    if (ordersEl && !ordersEl.contains(strip)) {
      ordersEl.insertBefore(strip, ordersEl.firstChild);
    }
  }

  // Trigger map resize after DOM move — critical to prevent blank map
  setTimeout(function() {
    if (_riderMap) {
      _riderMap.invalidateSize();
    }
  }, 100);
  setTimeout(function() {
    if (_riderMap) {
      _riderMap.invalidateSize();
    }
  }, 400);
}
// Expose so renderOrders() in rider.html can call it after re-render
window.showLiveMap = showLiveMap;

// ── stopGPS — only call this after delivery confirmed ────────
function stopGPS() {
  if (window._riderW) { navigator.geolocation.clearWatch(window._riderW); window._riderW = null; }
  if (startGPS._unsub) { startGPS._unsub(); startGPS._unsub = null; }
  clearTimeout(_routeTimer);
  if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
  if (_riderMap) {
    _riderMap.remove(); _riderMap = null;
    _riderMarkerL = null; _custMarkerL = null;
    _routeLineL = null; _storeUserLine = null;
  }
  // Clear saved order so map doesn't restore on next reload
  try { localStorage.removeItem('nk_active_gps_order'); } catch(e) {}
  var s = document.getElementById('live-map-strip');
  if (s) s.style.display = 'none';
}
window.stopGPS = stopGPS;

// ── restoreGPSIfNeeded — called on app load ───────────────────
function restoreGPSIfNeeded() {
  var savedOrderId;
  try { savedOrderId = localStorage.getItem('nk_active_gps_order'); } catch(e) {}
  if (!savedOrderId) return;
  if (!window.db) { setTimeout(restoreGPSIfNeeded, 500); return; }
  window.db.collection('orders').doc(savedOrderId).get().then(function(doc) {
    if (!doc.exists) { try { localStorage.removeItem('nk_active_gps_order'); } catch(e) {} return; }
    var status = doc.data().status;
    if (status === 'picked' || status === 'assigned') {
      startGPS(savedOrderId);
    } else {
      try { localStorage.removeItem('nk_active_gps_order'); } catch(e) {}
    }
  }).catch(function() {});
}
window.restoreGPSIfNeeded = restoreGPSIfNeeded;
