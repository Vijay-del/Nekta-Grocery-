// ═══════════════════════════════════════════════════
// NEKTA ADDRESS PICKER v3 — Rapido Style
// ═══════════════════════════════════════════════════

const _AP = {
  STORE_LAT: window.STORE_LAT || 17.549395259963312,
  STORE_LNG: window.STORE_LNG || 80.6274729902068,
  MAX_KM: 15,
  origPlaceOrder: null,
  map: null,
  selectedCoords: null,
  routeLayer: null,
  routeCache: {},   // key: "lat,lng" → { distKm, coords }
  BOUNDARY: [
    [17.6993,80.6275],[17.6820,80.7200],[17.6200,80.7800],
    [17.5494,80.7774],[17.4700,80.7500],[17.4000,80.6800],
    [17.3994,80.6275],[17.4200,80.5500],[17.4800,80.4800],
    [17.5494,80.4776],[17.6200,80.5000],[17.6700,80.5500],
    [17.6993,80.6275]
  ]
};

// ── Wait for app-core placeOrder to be defined, then wrap it ──
(function waitAndWrap() {
  if (!window.placeOrder) { setTimeout(waitAndWrap, 100); return; }

  _AP.origPlaceOrder = window.placeOrder;

  window.placeOrder = async function() {
    if (window._isPlacingOrder) { if(window.toast) toast('Order already being placed…','info'); return; }

    const name    = localStorage.getItem('custName');
    const phone   = localStorage.getItem('custPhone');
    const address = localStorage.getItem('custAddress');
    const lat     = parseFloat(localStorage.getItem('custLatitude'));
    const lng     = parseFloat(localStorage.getItem('custLongitude'));

    const hasDetails  = !!(name && phone && address);
    const hasLocation = !!(lat && lng && !isNaN(lat) && !isNaN(lng));
    const locationOk  = hasLocation && window.haversineKm &&
                        haversineKm(_AP.STORE_LAT, _AP.STORE_LNG, lat, lng) <= _AP.MAX_KM;

    // No details at all — show welcome flow
    if (!hasDetails && !hasLocation) { _AP.showFirstTime(); return; }

    // Has details but no valid location — ask for location
    if (hasDetails && !locationOk) { _AP.showLocationOnly(); return; }

    // No details but has location — ask for name/phone
    if (!hasDetails && locationOk) { openDModal(true); return; }

    // Has BOTH details and valid location — show quick confirm then place
    if (hasDetails && locationOk) { _AP.showQuickConfirm(lat, lng); return; }
  };

})();

// ── Call original placeOrder safely ──
_AP.doOriginalOrder = function() {
  window._isPlacingOrder = false; // reset so origPlaceOrder can run
  if (_AP.origPlaceOrder) _AP.origPlaceOrder();
  else console.error('origPlaceOrder missing');
};

// ══════════════════════════════════════════════════
// FIRST TIME FLOW
// ══════════════════════════════════════════════════
_AP.showFirstTime = function() {
  showMdl(`
    <div style="text-align:center;padding:12px 0 8px">
      <div style="font-size:48px;margin-bottom:12px">🎉</div>
      <h3 style="font-weight:900;font-size:20px;color:var(--dark);font-family:'Nunito',sans-serif;margin-bottom:6px">Welcome to Nekta!</h3>
      <p style="font-size:13px;color:var(--pale);margin-bottom:20px;line-height:1.5">First, set your delivery location</p>
    </div>
    <button onclick="closeMdl();_AP.useGPSThenDetails()"
      style="width:100%;background:linear-gradient(135deg,#00b96b,#007a44);color:#fff;padding:16px;border-radius:14px;font-weight:800;font-size:14px;cursor:pointer;border:none;font-family:var(--font);display:flex;align-items:center;gap:12px;margin-bottom:10px;box-shadow:0 4px 16px rgba(0,185,107,.3)">
      <div style="width:44px;height:44px;background:rgba(255,255,255,.2);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px">📱</div>
      <div style="text-align:left;flex:1">
        <div style="font-size:14px;font-weight:800">Use My Current Location</div>
        <div style="font-size:11px;opacity:0.85;margin-top:2px">Auto-detect via GPS</div>
      </div>
    </button>
    <button onclick="closeMdl();_AP.openMap(true)"
      style="width:100%;background:var(--card);color:var(--dark);padding:16px;border-radius:14px;font-weight:800;font-size:14px;cursor:pointer;border:1.5px solid var(--border);font-family:var(--font);display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <div style="width:44px;height:44px;background:#fef3c7;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px">🗺️</div>
      <div style="text-align:left;flex:1">
        <div style="font-size:14px;font-weight:800">Choose on Map</div>
        <div style="font-size:11px;color:var(--pale);margin-top:2px">Pick exact location or gift to someone</div>
      </div>
    </button>
    <div style="background:#fef9c3;border-radius:12px;padding:11px 14px;display:flex;gap:9px;align-items:flex-start;border:1px solid #fde68a">
      <span style="font-size:16px">💡</span>
      <p style="font-size:11px;color:#92400e;font-weight:600;line-height:1.5">Ordering for someone else? Use map to pick their address in Kothagudem</p>
    </div>
  `);
};

// GPS → Details → Order (first time)
_AP.useGPSThenDetails = function() {
  toast('Getting your location...', 'info');
  if (!navigator.geolocation) {
    toast('GPS not supported — use map', 'error');
    setTimeout(() => _AP.openMap(true), 800);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      const dist = window.haversineKm ? haversineKm(_AP.STORE_LAT, _AP.STORE_LNG, lat, lng) : 0;
      if (dist > _AP.MAX_KM) {
        toast('You are ' + dist.toFixed(1) + 'km away — pick Kothagudem location', 'warning');
        setTimeout(() => _AP.openMap(true), 1000);
        return;
      }
      localStorage.setItem('custLatitude', lat);
      localStorage.setItem('custLongitude', lng);
      localStorage.setItem('custLocTs', Date.now());
      const charge = window.calculateDeliveryCharge ? calculateDeliveryCharge(lat, lng) : 20;
      toast('Location set! Delivery: ₹' + charge, 'success');
      setTimeout(() => openDModal(true), 400);
    },
    () => { toast('GPS failed — use map', 'error'); setTimeout(() => _AP.openMap(true), 800); },
    { enableHighAccuracy: true, timeout: 10000 }
  );
};

// ══════════════════════════════════════════════════
// LOCATION ONLY (has details, needs location)
// ══════════════════════════════════════════════════
_AP.showLocationOnly = function() {
  showMdl(`
    <h3 style="font-weight:900;font-size:18px;margin-bottom:6px">📍 Set Delivery Location</h3>
    <p style="font-size:12px;color:var(--pale);margin-bottom:16px">Choose your delivery location to continue</p>
    <button onclick="closeMdl();_AP.useGPSAndOrder()"
      style="width:100%;background:var(--g3);border:1.5px solid var(--border);color:var(--g);padding:14px;border-radius:13px;font-weight:700;font-size:13px;cursor:pointer;font-family:var(--font);display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
      <div style="flex:1;text-align:left">
        <div style="font-size:13px;font-weight:800">Use My Current Location</div>
        <div style="font-size:11px;opacity:0.7;margin-top:2px">Auto-detect via GPS</div>
      </div>
    </button>
    <button onclick="closeMdl();_AP.openMap(false)"
      style="width:100%;background:var(--card);border:1.5px solid var(--border);color:var(--mid);padding:14px;border-radius:13px;font-weight:700;font-size:13px;cursor:pointer;font-family:var(--font);display:flex;align-items:center;gap:10px">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/></svg>
      <div style="flex:1;text-align:left">
        <div style="font-size:13px;font-weight:800">Choose on Map</div>
        <div style="font-size:11px;opacity:0.7;margin-top:2px">For gifting to family/friends</div>
      </div>
    </button>
  `);
};

_AP.useGPSAndOrder = function() {
  toast('Getting location...', 'info');
  if (!navigator.geolocation) {
    toast('GPS not supported', 'error');
    setTimeout(() => _AP.openMap(false), 800);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      const dist = window.haversineKm ? haversineKm(_AP.STORE_LAT, _AP.STORE_LNG, lat, lng) : 0;
      if (dist > _AP.MAX_KM) {
        toast('Outside delivery area — pick Kothagudem location', 'warning');
        setTimeout(() => _AP.openMap(false), 1000);
        return;
      }
      localStorage.setItem('custLatitude', lat);
      localStorage.setItem('custLongitude', lng);
      localStorage.setItem('custLocTs', Date.now());
      const charge = window.calculateDeliveryCharge ? calculateDeliveryCharge(lat, lng) : 20;
      toast('Location set! Delivery: ₹' + charge, 'success');
      _AP.doOriginalOrder();
    },
    () => { toast('GPS failed', 'error'); setTimeout(() => _AP.openMap(false), 800); },
    { enableHighAccuracy: true, timeout: 10000 }
  );
};

// ══════════════════════════════════════════════════
// QUICK CONFIRM (returning user)
// ══════════════════════════════════════════════════
_AP.showQuickConfirm = function(lat, lng) {
  const address = localStorage.getItem('custAddress') || 'Kothagudem';
  const dist = window.haversineKm ? haversineKm(_AP.STORE_LAT, _AP.STORE_LNG, lat, lng).toFixed(1) : '—';
  const charge = window.calculateDeliveryCharge ? calculateDeliveryCharge(lat, lng) : 20;

  showMdl(`
    <h3 style="font-weight:900;font-size:18px;margin-bottom:6px">📍 Confirm Delivery Location</h3>
    <p style="font-size:12px;color:var(--pale);margin-bottom:16px">Using your saved location</p>
    <div style="background:var(--g3);border-radius:14px;padding:14px;margin-bottom:16px;border:1px solid var(--border)">
      <div style="display:flex;gap:12px;align-items:flex-start">
        <div style="width:44px;height:44px;background:var(--g);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📍</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:800;color:var(--gd);margin-bottom:4px">Delivery Address</div>
          <div style="font-size:12px;color:var(--g);line-height:1.5">${address}</div>
          <div style="font-size:11px;color:var(--pale);margin-top:4px">${dist} km from store · Delivery: ₹${charge}</div>
        </div>
      </div>
    </div>
    <button onclick="closeMdl();_AP.doOriginalOrder()" class="pbtn" style="margin-bottom:10px">
      ✓ Confirm & Place Order
    </button>
    <button onclick="closeMdl();_AP.showLocationOnly()" class="sbtn">
      Change Location
    </button>
  `);
};

// ══════════════════════════════════════════════════
// MAP PICKER — Fullscreen with polygon boundary
// ══════════════════════════════════════════════════
_AP.openMap = function(openDetailsAfter) {
  const modal = document.createElement('div');
  modal.id = 'addr-map-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:950;background:var(--bg);display:flex;flex-direction:column';
  modal.innerHTML = `
    <div style="background:linear-gradient(135deg,#004d27,#00894c);padding:calc(14px + var(--st,0px)) 16px 10px;flex-shrink:0">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <button onclick="_AP.closeMap()" style="background:rgba(255,255,255,.15);border:none;color:#fff;width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        </button>
        <div style="flex:1">
          <div style="color:#fff;font-weight:900;font-size:16px;font-family:'Nunito',sans-serif">Pick Delivery Location</div>
          <div style="color:rgba(255,255,255,.75);font-size:11px;margin-top:1px">Search or drag map to pin</div>
        </div>
      </div>
      <div style="position:relative">
        <input id="ap-search-input" type="text" placeholder="Search: railway station, hospital, area name…"
          oninput="_AP.onSearchInput(this.value)"
          style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.95);border:none;border-radius:12px;padding:11px 40px 11px 14px;font-size:13px;font-weight:600;color:#1a1a1a;outline:none;font-family:var(--font)"/>
        <span id="ap-search-clear" onclick="_AP.clearSearch()" style="display:none;position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:18px;cursor:pointer;color:#6b7280">✕</span>
        <div id="ap-search-results" style="display:none;position:absolute;top:calc(100% + 6px);left:0;right:0;background:#fff;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:2000;max-height:220px;overflow-y:auto"></div>
      </div>
    </div>
    <div style="flex:1;position:relative;overflow:hidden">
      <div id="addr-picker-map" style="width:100%;height:100%"></div>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-100%);z-index:1000;pointer-events:none;filter:drop-shadow(0 4px 10px rgba(0,0,0,.4))">
        <svg width="40" height="52" viewBox="0 0 40 52"><path d="M20 0C11.16 0 4 7.16 4 16c0 11 16 36 16 36s16-25 16-36c0-8.84-7.16-16-16-16z" fill="#ef4444"/><circle cx="20" cy="16" r="7" fill="#fff"/><circle cx="20" cy="16" r="4" fill="#ef4444"/></svg>
      </div>
      <div id="ap-status" style="position:absolute;top:14px;left:50%;transform:translateX(-50%);z-index:1000;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);color:#fff;font-size:12px;font-weight:700;padding:8px 18px;border-radius:20px;transition:all .3s;white-space:nowrap">Drag map to location</div>
      <div id="ap-dist" style="position:absolute;top:54px;left:50%;transform:translateX(-50%);z-index:1000;background:rgba(255,255,255,.95);color:var(--dark);font-size:11px;font-weight:700;padding:6px 14px;border-radius:20px;display:none;white-space:nowrap">-- km</div>
      <div id="ap-addr-label" style="position:absolute;bottom:16px;left:12px;right:12px;z-index:1000;background:rgba(255,255,255,.97);backdrop-filter:blur(6px);color:#1a1a1a;font-size:12px;font-weight:600;padding:10px 14px;border-radius:14px;display:none;line-height:1.5;box-shadow:0 2px 16px rgba(0,0,0,.18)">
        <div id="ap-addr-text" style="color:#111">📍 Locating…</div>
        <div id="ap-addr-coords" style="font-size:10px;color:#94a3b8;margin-top:2px;font-family:monospace"></div>
      </div>
    </div>
    <div style="background:var(--card);border-top:1.5px solid var(--border);padding:14px 16px;padding-bottom:calc(14px + var(--sb,0px));flex-shrink:0">
      <div id="ap-info" style="background:var(--g4);border-radius:12px;padding:12px;margin-bottom:12px;display:none;border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="flex:1">
            <div id="ap-info-status" style="font-size:13px;font-weight:800;color:var(--g)"></div>
            <div id="ap-info-detail" style="font-size:11px;color:var(--pale);margin-top:3px"></div>
          </div>
          <div id="ap-info-charge" style="font-size:18px;font-weight:900;color:var(--g);font-family:'Nunito',sans-serif"></div>
        </div>
      </div>
      <button id="ap-confirm-btn" onclick="_AP.confirmMap(${openDetailsAfter ? 'true' : 'false'})" disabled
        style="width:100%;background:#9ca3af;color:#fff;padding:15px;border-radius:14px;font-weight:800;font-size:15px;border:none;cursor:not-allowed;font-family:var(--font);transition:all .3s">
        Move pin inside green zone
      </button>
    </div>
  `;
  document.body.appendChild(modal);

  function buildMap() {
    const el = document.getElementById('addr-picker-map');
    if (!el || !window.L) return;
    _AP.map = window.L.map(el, { center: [_AP.STORE_LAT, _AP.STORE_LNG], zoom: 15, zoomControl: false, attributionControl: false });
    // Carto Voyager — shows shops, roads, addresses, POIs like Google Maps
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20, subdomains: 'abcd'
    }).addTo(_AP.map);
    window.L.control.zoom({ position: 'bottomright' }).addTo(_AP.map);
    // Green delivery zone
    window.L.polygon(_AP.BOUNDARY, { color: '#00b96b', weight: 3, fillColor: '#00b96b', fillOpacity: 0.12, dashArray: '8,6' }).addTo(_AP.map);
    // Red outside zone
    window.L.polygon([[ [-90,-180],[-90,180],[90,180],[90,-180] ], _AP.BOUNDARY], { color: 'transparent', fillColor: '#ef4444', fillOpacity: 0.06, interactive: false }).addTo(_AP.map);
    // Store marker
    window.L.marker([_AP.STORE_LAT, _AP.STORE_LNG], {
      icon: window.L.divIcon({ html: '<div style="background:#00b96b;color:#fff;font-size:20px;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 3px 12px rgba(0,185,107,.6)">🏪</div>', className: '', iconAnchor: [22, 22] })
    }).addTo(_AP.map).bindPopup('<b>🏪 Nekta Store</b>');
    _AP.map.on('move', () => {
      _AP.updateMapStatus();
      // Update coords live while dragging
      const c = _AP.map.getCenter();
      const coordsEl = document.getElementById('ap-addr-coords');
      const lbl = document.getElementById('ap-addr-label');
      if (lbl) lbl.style.display = 'block';
      if (coordsEl) coordsEl.textContent = `${c.lat.toFixed(6)}\u00b0N, ${c.lng.toFixed(6)}\u00b0E`;
    });
    _AP.map.on('moveend', () => { _AP.updateMapStatus(); _AP.reverseGeocode(); });
    _AP.updateMapStatus();
    _AP.reverseGeocode(); // show address immediately on open
  }

  if (!window.L) {
    if (!document.getElementById('lf-css')) {
      const css = document.createElement('link'); css.id = 'lf-css'; css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
    }
    const js = document.createElement('script'); js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.onload = () => setTimeout(buildMap, 100); document.head.appendChild(js);
  } else { setTimeout(buildMap, 100); }
};

// ── Search (Nominatim) ──
_AP._searchTimer = null;
_AP.onSearchInput = function(val) {
  const clear = document.getElementById('ap-search-clear');
  const box   = document.getElementById('ap-search-results');
  if (clear) clear.style.display = val ? 'block' : 'none';
  if (!val || val.length < 2) { if (box) box.style.display = 'none'; return; }
  clearTimeout(_AP._searchTimer);
  _AP._searchTimer = setTimeout(() => _AP.doSearch(val), 400);
};

// Kothagudem center for search bias
_AP.BBOX = '80.4776,17.3994,80.7800,17.6993';

_AP.placeIcon = function(r) {
  const t = (r.osm_value||r.type||'').toLowerCase();
  const c = (r.osm_key||r.class||'').toLowerCase();
  if (['station','halt','railway','subway'].some(x=>t.includes(x)||c.includes(x))) return '🚉';
  if (['hospital','clinic','health'].some(x=>t.includes(x)||c.includes(x))) return '🏥';
  if (['school','college','university','education'].some(x=>t.includes(x)||c.includes(x))) return '🏫';
  if (['bank','atm'].some(x=>t.includes(x)||c.includes(x))) return '🏦';
  if (['pharmacy','chemist','drug'].some(x=>t.includes(x)||c.includes(x))) return '💊';
  if (['restaurant','food','cafe','fast_food','hotel'].some(x=>t.includes(x)||c.includes(x))) return '🍽️';
  if (['temple','mosque','church','worship'].some(x=>t.includes(x)||c.includes(x))) return '🛕';
  if (['park','garden','ground'].some(x=>t.includes(x)||c.includes(x))) return '🌳';
  if (['police','fire'].some(x=>t.includes(x)||c.includes(x))) return '🚨';
  if (['bus','stop','stand'].some(x=>t.includes(x)||c.includes(x))) return '🚌';
  if (c==='shop') return '🛒';
  if (c==='amenity') return '📌';
  return '📍';
};

_AP.doSearch = async function(q) {
  const box = document.getElementById('ap-search-results');
  if (!box) return;
  box.style.display = 'block';
  box.innerHTML = '<div style="padding:12px 14px;font-size:12px;color:#6b7280">Searching…</div>';
  try {
    // Photon — OSM-powered, much better local search than Nominatim
    // bias to Kothagudem center, search within ~20km
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${_AP.STORE_LAT}&lon=${_AP.STORE_LNG}&limit=8&lang=en`;
    const res  = await fetch(url);
    const json = await res.json();
    let items = (json.features || []);

    // Filter to within ~25km of store so we don’t get results from other cities
    items = items.filter(f => {
      const [ln, la] = f.geometry.coordinates;
      return window.haversineKm ? haversineKm(_AP.STORE_LAT, _AP.STORE_LNG, la, ln) <= 25 : true;
    });

    // Fallback: Nominatim bounded search if Photon gives nothing local
    if (!items.length) {
      const u2 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q+' Kothagudem')}&format=json&limit=8&addressdetails=1&countrycodes=in&viewbox=${_AP.BBOX}&bounded=0`;
      const r2 = await fetch(u2, { headers:{'Accept-Language':'en'} });
      const l2 = await r2.json();
      if (!l2.length) { box.innerHTML='<div style="padding:12px 14px;font-size:12px;color:#6b7280">No results — try a different name</div>'; return; }
      // convert Nominatim format to display
      box.innerHTML = l2.map(r => {
        const a = r.address||{};
        const line1 = [a.house_number, a.road||a.pedestrian||a.footway, r.name].filter(Boolean).join(' ') || r.display_name.split(',')[0];
        const line2 = [a.neighbourhood||a.suburb||a.village, a.city||a.town].filter(Boolean).join(', ');
        const full  = [line1,line2].filter(Boolean).join(', ');
        return `<div onclick="_AP.selectSearchResult(${r.lat},${r.lon},'${full.replace(/'/g,"\\'")}')"
          style="padding:11px 14px;cursor:pointer;border-bottom:1px solid #f1f5f9;display:flex;gap:10px;align-items:flex-start"
          onmouseover="this.style.background='#f0fdf4'" onmouseout="this.style.background=''">
          <span style="font-size:18px;flex-shrink:0;margin-top:2px">📍</span>
          <div><div style="font-size:13px;font-weight:700;color:#1a1a1a">${line1}</div>${line2?`<div style="font-size:11px;color:#6b7280;margin-top:2px">${line2}</div>`:''}</div>
        </div>`;
      }).join('');
      return;
    }

    box.innerHTML = items.map(f => {
      const p = f.properties || {};
      const [ln, la] = f.geometry.coordinates;
      const name    = p.name || p.street || '';
      const street  = p.street ? (p.housenumber ? p.housenumber+' '+p.street : p.street) : '';
      const area    = [p.district||p.suburb||p.locality||p.neighbourhood, p.city||p.county].filter(Boolean).join(', ');
      const line1   = name || street || area.split(',')[0];
      const line2   = name ? [street, area].filter(Boolean).join(', ') : area;
      const full    = [line1, line2].filter(Boolean).join(', ');
      const icon    = _AP.placeIcon(p);
      return `<div onclick="_AP.selectSearchResult(${la},${ln},'${full.replace(/'/g,"\\'")}')"
        style="padding:11px 14px;cursor:pointer;border-bottom:1px solid #f1f5f9;display:flex;gap:10px;align-items:flex-start"
        onmouseover="this.style.background='#f0fdf4'" onmouseout="this.style.background=''">
        <span style="font-size:18px;flex-shrink:0;margin-top:2px">${icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:#1a1a1a;line-height:1.3">${line1}</div>
          ${line2?`<div style="font-size:11px;color:#6b7280;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${line2}</div>`:''}
        </div>
      </div>`;
    }).join('');
  } catch(e) { box.innerHTML='<div style="padding:12px 14px;font-size:12px;color:#ef4444">Search failed — check connection</div>'; }
};

_AP.selectSearchResult = function(lat, lng, label) {
  lat = parseFloat(lat); lng = parseFloat(lng);
  const inp = document.getElementById('ap-search-input');
  const box = document.getElementById('ap-search-results');
  if (inp) inp.value = label;
  if (box) box.style.display = 'none';
  if (_AP.map) {
    _AP.map.setView([lat, lng], 17, { animate: true });
    _AP._pendingAddress = label;
    const lbl = document.getElementById('ap-addr-label');
    if (lbl) { lbl.style.display = 'block'; lbl.textContent = '📍 ' + label; }
  }
};

_AP.clearSearch = function() {
  const inp  = document.getElementById('ap-search-input');
  const box  = document.getElementById('ap-search-results');
  const clr  = document.getElementById('ap-search-clear');
  if (inp) inp.value = '';
  if (box) box.style.display = 'none';
  if (clr) clr.style.display = 'none';
};

// ── Reverse geocode pin center → show address label on map ──
_AP._rgTimer = null;
_AP.reverseGeocode = function() {
  if (!_AP.map) return;
  const c = _AP.map.getCenter();
  const addrEl   = document.getElementById('ap-addr-text');
  const coordsEl = document.getElementById('ap-addr-coords');
  const lbl      = document.getElementById('ap-addr-label');
  if (!lbl) return;
  lbl.style.display = 'block';
  if (addrEl) addrEl.textContent = '📍 Locating…';
  if (coordsEl) coordsEl.textContent = `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`;
  clearTimeout(_AP._rgTimer);
  _AP._rgTimer = setTimeout(async () => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${c.lat}&lon=${c.lng}&format=json&addressdetails=1&zoom=18`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const json = await res.json();
      if (!_AP.map) return;
      const a = json.address || {};
      const parts = [
        [a.house_number, a.road || a.pedestrian || a.footway || a.path].filter(Boolean).join(' '),
        a.neighbourhood || a.quarter || a.suburb || a.village || '',
        a.city_district || '',
        a.city || a.town || a.county || '',
        a.postcode || ''
      ].filter(Boolean);
      const text = parts.length ? parts.join(', ') : (json.display_name||'').split(',').slice(0,4).join(',').trim();
      if (addrEl)  addrEl.innerHTML = `<span style="color:#059669;font-weight:800">📍</span> ${text}`;
      if (coordsEl) coordsEl.textContent = `${c.lat.toFixed(6)}°N, ${c.lng.toFixed(6)}°E`;
      _AP._pendingAddress = text;
    } catch {
      if (addrEl) addrEl.textContent = '📍 Could not detect address';
    }
  }, 500);
};

// ── Fetch real road route from OSRM (free, no API key) ──
_AP.fetchRoute = async function(toLat, toLng) {
  const key = toLat.toFixed(5) + ',' + toLng.toFixed(5);
  if (_AP.routeCache[key]) return _AP.routeCache[key];
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${_AP.STORE_LNG},${_AP.STORE_LAT};${toLng},${toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.code !== 'Ok' || !json.routes.length) return null;
    const route = json.routes[0];
    const distKm = route.distance / 1000;
    const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const result = { distKm, coords };
    _AP.routeCache[key] = result;
    return result;
  } catch { return null; }
};

// ── Draw route polyline on map ──
_AP.drawRoute = function(coords) {
  if (_AP.routeLayer) { _AP.map.removeLayer(_AP.routeLayer); _AP.routeLayer = null; }
  if (!coords || !coords.length) return;
  _AP.routeLayer = window.L.polyline(coords, {
    color: '#00b96b', weight: 5, opacity: 0.85, dashArray: null,
    lineJoin: 'round', lineCap: 'round'
  }).addTo(_AP.map);
};

// ── Delivery charge based on road distance ──
_AP.chargeFromRoadDist = function(km) {
  if (km <= 1) return 20;
  if (km <= 2) return 25;
  if (km <= 3) return 30;
  if (km <= 4) return 35;
  if (km <= 5) return 40;
  if (km <= 6) return 50;
  if (km <= 8) return 60;
  if (km <= 10) return 80;
  return Math.round(80 + (km - 10) * 10);
};

_AP.updateMapStatus = function() {
  if (!_AP.map || !window.haversineKm) return;
  const c = _AP.map.getCenter();
  const straightDist = haversineKm(_AP.STORE_LAT, _AP.STORE_LNG, c.lat, c.lng);
  const inZone = straightDist <= _AP.MAX_KM;

  const statusEl = document.getElementById('ap-status');
  const distEl   = document.getElementById('ap-dist');
  const infoEl   = document.getElementById('ap-info');
  const statusTx = document.getElementById('ap-info-status');
  const detailTx = document.getElementById('ap-info-detail');
  const chargeTx = document.getElementById('ap-info-charge');
  const btn      = document.getElementById('ap-confirm-btn');

  if (!inZone) {
    _AP.selectedCoords = null;
    _AP.drawRoute(null);
    const dk = straightDist.toFixed(1);
    if (distEl) { distEl.style.display = 'block'; distEl.textContent = dk + ' km'; distEl.style.background = 'rgba(239,68,68,.95)'; distEl.style.color = '#fff'; }
    if (statusEl) { statusEl.style.background = 'rgba(239,68,68,.9)'; statusEl.textContent = '❌ Outside zone (' + dk + 'km)'; }
    if (infoEl) infoEl.style.display = 'block';
    if (statusTx) { statusTx.textContent = '❌ Outside delivery area'; statusTx.style.color = '#ef4444'; }
    if (detailTx) detailTx.textContent = 'Move pin inside green zone';
    if (chargeTx) chargeTx.textContent = '';
    if (btn) { btn.disabled = true; btn.style.background = '#9ca3af'; btn.style.cursor = 'not-allowed'; btn.textContent = 'Move pin inside green zone'; }
    return;
  }

  // Inside zone — show straight-line distance immediately, then fetch road route
  _AP.selectedCoords = { lat: c.lat, lng: c.lng };
  const quickCharge = window.calculateDeliveryCharge ? calculateDeliveryCharge(c.lat, c.lng) : 20;
  const dk = straightDist.toFixed(1);
  if (distEl) { distEl.style.display = 'block'; distEl.textContent = dk + ' km'; distEl.style.background = 'rgba(5,150,105,.95)'; distEl.style.color = '#fff'; }
  if (statusEl) { statusEl.style.background = 'rgba(5,150,105,.9)'; statusEl.textContent = '🛣️ Getting road route…'; }
  if (infoEl) infoEl.style.display = 'block';
  if (statusTx) { statusTx.textContent = '✅ Delivery available'; statusTx.style.color = '#059669'; }
  if (detailTx) detailTx.textContent = dk + ' km (straight)';
  if (chargeTx) chargeTx.textContent = '₹' + quickCharge;
  if (btn) { btn.disabled = false; btn.style.background = 'linear-gradient(135deg,#00a85e,#007a44)'; btn.style.cursor = 'pointer'; btn.textContent = '✓ Confirm This Location'; }

  // Async: fetch real road route, draw line, update charge
  const snapLat = c.lat, snapLng = c.lng;
  _AP.fetchRoute(snapLat, snapLng).then(route => {
    // Make sure pin hasn't moved since we started fetching
    const cur = _AP.map && _AP.map.getCenter();
    if (!cur || Math.abs(cur.lat - snapLat) > 0.0005 || Math.abs(cur.lng - snapLng) > 0.0005) return;
    if (!route) return; // OSRM failed — keep straight-line values
    const roadKm = route.distKm.toFixed(1);
    const roadCharge = _AP.chargeFromRoadDist(route.distKm);
    _AP.selectedCoords.roadKm = route.distKm;
    _AP.selectedCoords.roadCharge = roadCharge;
    _AP.drawRoute(route.coords);
    if (distEl) distEl.textContent = roadKm + ' km (road)';
    if (statusEl) statusEl.textContent = '✅ Route found · ' + roadKm + ' km';
    if (detailTx) detailTx.textContent = roadKm + ' km road distance';
    if (chargeTx) chargeTx.textContent = '₹' + roadCharge;
  });
};

_AP.confirmMap = function(openDetailsAfter) {
  if (!_AP.selectedCoords) { toast('Select a location inside the green zone', 'error'); return; }
  const { lat, lng, roadCharge } = _AP.selectedCoords;
  localStorage.setItem('custLatitude', lat);
  localStorage.setItem('custLongitude', lng);
  localStorage.setItem('custLocTs', Date.now());
  localStorage.setItem('nk_manual_address', 'true');
  // Use road-distance charge if available, else fallback to haversine charge
  const charge = roadCharge || (window.calculateDeliveryCharge ? calculateDeliveryCharge(lat, lng) : 20);
  localStorage.setItem('custDeliveryCharge', charge);
  // Save reverse-geocoded address so it shows in order details
  if (_AP._pendingAddress) localStorage.setItem('custAddress', _AP._pendingAddress);
  _AP.closeMap();
  toast('Location confirmed! Delivery: ₹' + charge, 'success');
  if (openDetailsAfter) {
    setTimeout(() => openDModal(true), 400);
  } else {
    setTimeout(() => _AP.doOriginalOrder(), 400);
  }
};

_AP.closeMap = function() {
  const modal = document.getElementById('addr-map-modal');
  if (modal) {
    if (_AP.routeLayer) { _AP.routeLayer = null; }
    if (_AP.map) { _AP.map.remove(); _AP.map = null; }
    _AP.routeCache = {};
    modal.remove();
  }
};

// ── Expose to window for onclick handlers ──
Object.assign(window, { _AP });

