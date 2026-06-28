// ═══════════════════════════════════════════════════
// NEKTA RIDER — RAPIDO-STYLE ORDER SYSTEM
// ═══════════════════════════════════════════════════

var _availOrders = [];
var _myOrder     = null;
var _availUnsub  = null;
var _myUnsub     = null;

// Expose to window for cross-script access
window._availOrders = _availOrders;

// Safe esc — rider-orders.js may load before rider.html inline script defines esc()
function _resc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function esc(s) { return _resc(s); }

// ── RAPIDO-STYLE RIDER ALARM ─────────────────────────────────
var _riderAlarmInterval = null;
var _riderAlarmAudio    = null;
var _riderAlarmOrderId  = null;
var _riderAlarmBuilt    = false;

function _buildRiderAlarm() {
  if (_riderAlarmBuilt) return;
  _riderAlarmBuilt = true;
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var sr  = ctx.sampleRate;
    var buf = ctx.createBuffer(1, sr * 1.5, sr);
    var ch  = buf.getChannelData(0);
    // Rapido-style: 3 rising double-beeps
    [0, 0.18, 0.36, 0.54, 0.72, 0.90].forEach(function(t, i) {
      var freq = 880 + i * 120;
      var s = Math.floor(t * sr), e = Math.floor((t + 0.13) * sr);
      for (var j = s; j < e && j < ch.length; j++) {
        var env = Math.sin(Math.PI * (j - s) / (e - s));
        ch[j] = (Math.sin(6.28 * freq * (j / sr)) * 0.7 + Math.sin(6.28 * freq * 2 * (j / sr)) * 0.3) * env;
      }
    });
    var nb = ch.length * 2, ab = new ArrayBuffer(44 + nb), v = new DataView(ab);
    var ws = function(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0,'RIFF'); v.setUint32(4,36+nb,true); ws(8,'WAVE'); ws(12,'fmt ');
    v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
    v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true);
    ws(36,'data'); v.setUint32(40,nb,true);
    for (var i = 0; i < ch.length; i++) {
      var s2 = Math.max(-1, Math.min(1, ch[i]));
      v.setInt16(44 + i * 2, s2 < 0 ? s2 * 0x8000 : s2 * 0x7FFF, true);
    }
    _riderAlarmAudio = new Audio(URL.createObjectURL(new Blob([ab], {type:'audio/wav'})));
    _riderAlarmAudio.volume = 1.0;
    ctx.close();
  } catch(e) { _riderAlarmAudio = null; }
}
['click','touchstart'].forEach(function(ev) {
  document.addEventListener(ev, _buildRiderAlarm, {once: true, passive: true});
});

function _ringRiderAlarm() {
  if (_riderAlarmAudio) {
    _riderAlarmAudio.currentTime = 0;
    _riderAlarmAudio.play().catch(function() { _riderAlarmFallback(); });
  } else {
    _riderAlarmFallback();
  }
}
function _riderAlarmFallback() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var now = ctx.currentTime;
    [0, 0.18, 0.36, 0.54].forEach(function(t, i) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880 + i * 120;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0, now + t);
      g.gain.linearRampToValueAtTime(0.8, now + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.13);
      o.start(now + t); o.stop(now + t + 0.14);
    });
    setTimeout(function() { ctx.close(); }, 2000);
  } catch(e) {}
}

function triggerRiderAlarm(order) {
  if (_riderAlarmOrderId === order.id) return; // already alarming for this order
  _riderAlarmOrderId = order.id;
  _buildRiderAlarm();

  // Show full-screen alarm overlay
  var overlay = document.getElementById('rider-alarm-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'rider-alarm-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:linear-gradient(160deg,#0C8B4A 0%,#0A6B38 55%,#064d28 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px';
    overlay.innerHTML = [
      '<div style="width:110px;height:110px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;margin-bottom:20px;animation:riderAlarmPulse .5s ease infinite alternate">',
        '<span style="font-size:56px">🛵</span>',
      '</div>',
      '<h2 style="color:#fff;font-size:28px;font-weight:900;font-family:Nunito,sans-serif;margin-bottom:8px">📦 New Order!</h2>',
      '<p id="rider-alarm-msg" style="color:rgba(255,255,255,.85);font-size:14px;margin-bottom:8px;line-height:1.6">A new order is ready for pickup</p>',
      '<p id="rider-alarm-earn" style="color:#6ee7b7;font-size:26px;font-weight:900;font-family:Roboto Mono,monospace;margin-bottom:28px">₹--</p>',
      '<div style="display:flex;gap:12px;width:100%;max-width:320px">',
        '<button onclick="riderAcceptAlarm()" style="flex:2;padding:18px;background:#fff;color:#0C8B4A;border:none;border-radius:16px;font-weight:900;font-size:16px;cursor:pointer;font-family:Nunito,sans-serif;box-shadow:0 4px 20px rgba(255,255,255,.3)">✅ Accept</button>',
        '<button onclick="riderDismissAlarm()" style="flex:1;padding:18px;background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:16px;font-weight:700;font-size:14px;cursor:pointer">Skip</button>',
      '</div>',
      '<style>@keyframes riderAlarmPulse{from{transform:scale(1) rotate(-8deg)}to{transform:scale(1.1) rotate(8deg)}}</style>'
    ].join('');
    document.body.appendChild(overlay);
  }

  // Fill order info
  var items = Array.isArray(order.items) ? order.items : [];
  var earn  = order.deliveryCharge || _safeCalcDeliveryCharge(order.latitude, order.longitude);
  if (_isRainActive()) earn += 10;
  var msg = document.getElementById('rider-alarm-msg');
  var earnEl = document.getElementById('rider-alarm-earn');
  if (msg) msg.textContent = (order.customerName || 'Customer') + ' · ' + items.length + ' items · ' + (order.address || '').split(',')[0];
  if (earnEl) earnEl.textContent = '₹' + earn + ' earning';
  overlay.style.display = 'flex';
  overlay.dataset.orderId = order.id;

  // Ring continuously — auto-dismiss after 60s so it doesn't ring forever
  clearInterval(_riderAlarmInterval);
  clearTimeout(window._riderAlarmAutoStop);
  _ringRiderAlarm();
  _riderAlarmInterval = setInterval(function() {
    if (!window._isOnline || _myOrder) { riderDismissAlarm(); return; }
    _ringRiderAlarm();
  }, 1800);
  // Auto-dismiss after 60 seconds if rider ignores it
  window._riderAlarmAutoStop = setTimeout(function() {
    riderDismissAlarm();
  }, 60000);
}
window.triggerRiderAlarm = triggerRiderAlarm;

window.riderAcceptAlarm = function() {
  var orderId = (document.getElementById('rider-alarm-overlay') || {}).dataset && document.getElementById('rider-alarm-overlay').dataset.orderId;
  riderDismissAlarm();
  if (orderId) window.riderAcceptOrder(orderId);
};

window.riderDismissAlarm = function() {
  clearInterval(_riderAlarmInterval);
  _riderAlarmInterval = null;
  _riderAlarmOrderId  = null;
  var overlay = document.getElementById('rider-alarm-overlay');
  if (overlay) overlay.style.display = 'none';
};
window.riderDismissAlarm = window.riderDismissAlarm;

// Safe references to functions/vars defined in rider.html inline script
function _safeCalcDeliveryCharge(lat, lng) {
  return (typeof calcDeliveryCharge === 'function') ? calcDeliveryCharge(lat, lng) : 20;
}
function _safeCalcDist(lat, lng) {
  return (typeof calcDist === 'function') ? calcDist(lat, lng) : null;
}
function _isRainActive() {
  return (typeof _rainActive !== 'undefined') ? _rainActive : false;
}

// Update rain surge indicator in header
function updateRainSurgeIndicator() {
  const rainIndicator = document.getElementById('rain-surge-indicator');
  if (!rainIndicator) return;
  
  if (_isRainActive()) {
    rainIndicator.classList.remove('off');
    rainIndicator.classList.add('on');
    const rainAmount = document.getElementById('rain-amount');
    if (rainAmount) rainAmount.textContent = '+₹10';
  } else {
    rainIndicator.classList.remove('on');
    rainIndicator.classList.add('off');
  }
}

// Call on page load and whenever rain status changes
window.updateRainSurgeIndicator = updateRainSurgeIndicator;


window.startOrdersListener = function() {
  // Get phone from both window scope and local scope
  var _phone = window._phone || (typeof _riderPhone !== 'undefined' ? _riderPhone : '');
  
  // If still no phone, wait a moment and retry (might be loading)
  if (!_phone) {
    console.warn('startOrdersListener: waiting for phone to be set...');
    setTimeout(function() { window.startOrdersListener(); }, 500);
    return;
  }
  
  if (_myUnsub)    { try { _myUnsub();    } catch(e){} _myUnsub = null; }
  if (_availUnsub) { try { _availUnsub(); } catch(e){} _availUnsub = null; }
  if (window._ordersUnsub) { try { window._ordersUnsub(); } catch(e){} window._ordersUnsub = null; }

  console.log('[RiderOrders] Starting listeners for phone:', _phone);

  // 1. MY active orders (assigned/picked/en_route) — FIX: include en_route
  _myUnsub = window.db.collection('orders')
    .where('riderPhone', '==', _phone)
    .where('status', 'in', ['assigned', 'picked', 'en_route'])
    .limit(3)
    .onSnapshot(function(snap) {
      var orders = snap.docs
        .map(function(d){ return Object.assign({id: d.id}, d.data()); })
        .sort(function(a,b){
          return (b.createdAt && b.createdAt.seconds || 0) - (a.createdAt && a.createdAt.seconds || 0);
        });
      // sync to global _orders used by renderOrders() in rider.html
      if (typeof window._orders !== 'undefined') window._orders = orders;
      // also update the local var if in same scope
      try { _orders = orders; } catch(e) {}
      _myOrder = orders[0] || null;
      window._myOrder = _myOrder;
      if (typeof renderOrders === 'function') renderOrders();
      window.renderAvailSection();
      snap.docChanges().forEach(function(ch){
        if (ch.type === 'added') {
          if (typeof toast === 'function') toast('\ud83d\udce6 New order assigned!', 'success');
        }
      });
    }, function(err){ console.warn('my-order listener:', err.message); });

  window._ordersUnsub = _myUnsub;

  // 2. Available orders — listen for 'packing' OR 'confirmed' status orders
  // FIX: 'confirmed' = admin has confirmed the order and may have pre-assigned a rider
  // ONLY show to ONLINE riders (offline riders won't see available orders)
  var _knownAvailIds = new Set();
  var _firstAvailSnap = true;
  _availUnsub = window.db.collection('orders')
    .where('status', 'in', ['packing', 'confirmed'])
    .limit(50)
    .onSnapshot(function(snap) {
      // Filter: either unassigned OR assigned specifically to this rider
      _availOrders = snap.docs
        .map(function(d){ return Object.assign({id: d.id}, d.data()); })
        .filter(function(o){ 
          var isUnassigned = !o.assignedRider && !o.riderPhone;
          // FIX: admin-assigned to THIS rider (cpt assignment)
          var assignedToMe = (o.assignedRider === _phone || o.riderPhone === _phone);
          var riderIsOnline = window._isOnline === true;
          return (isUnassigned || assignedToMe) && riderIsOnline;
        })
        .sort(function(a,b){
          return (a.createdAt && a.createdAt.seconds || 0) - (b.createdAt && b.createdAt.seconds || 0);
        });

      // Sync to window scope
      window._availOrders = _availOrders;

      console.log('[RiderOrders] Available orders (Online):', _availOrders.length);
      window.renderAvailSection();

      if (_firstAvailSnap) {
        snap.docs.forEach(function(d){ _knownAvailIds.add(d.id); });
        _firstAvailSnap = false;
        return;
      }

      // Ring alarm for genuinely NEW confirmed orders
      snap.docChanges().forEach(function(ch) {
        if (ch.type === 'added' && !_knownAvailIds.has(ch.doc.id)) {
          var o = Object.assign({id: ch.doc.id}, ch.doc.data());
          // FIX: ring for unassigned orders OR orders admin assigned to this rider (cpt passing)
          var isForMe = (!o.assignedRider && !o.riderPhone) ||
                        (o.assignedRider === _phone || o.riderPhone === _phone);
          if (isForMe && window._isOnline && !_myOrder) {
            triggerRiderAlarm(o);
          }
        }
        _knownAvailIds.add(ch.doc.id);
      });
    }, function(err){ console.warn('avail-order listener:', err.message); });

  // Expose to window for cleanup
  window._availUnsub = _availUnsub;

  // *** Watch for online status changes and refresh available orders ***
  // When rider goes online → show available orders
  // When rider goes offline → hide available orders
  var _lastOnlineStatus = window._isOnline;
  var _onlineCheckInterval = setInterval(function() {
    if (window._isOnline !== _lastOnlineStatus) {
      _lastOnlineStatus = window._isOnline;
      console.log('[RiderOrders] Online status changed to:', window._isOnline);
      // Re-filter and refresh available orders based on new online status
      window.renderAvailSection();
    }
  }, 1000); // Check every 1 second
  
  // Expose interval ID for cleanup
  window._onlineCheckInterval = _onlineCheckInterval;
};

window.renderAvailSection = function() {
  var sec      = document.getElementById('avail-section');
  var list     = document.getElementById('avail-list');
  var cnt      = document.getElementById('avail-count');
  var myTitle  = document.getElementById('my-orders-title');
  var navBadge = document.getElementById('order-badge');
  if (!sec || !list) return;

  var isOnline = !!window._isOnline;
  var availOrders = window._availOrders || _availOrders || [];

  // If rider has active order, hide available section
  if (window._myOrder || _myOrder) {
    sec.style.display = 'none';
    if (myTitle) myTitle.textContent = 'My Active Order';
    return;
  }

  // No available orders
  if (!availOrders.length) {
    sec.style.display = 'none';
    if (myTitle) myTitle.textContent = 'My Orders';
    if (navBadge) { navBadge.classList.remove('on'); navBadge.style.display = 'none'; }
    return;
  }

  // Show available orders
  sec.style.display = 'block';
  if (cnt) cnt.textContent = availOrders.length;
  if (myTitle) myTitle.textContent = 'My Orders';
  if (navBadge) { navBadge.classList.add('on'); navBadge.textContent = availOrders.length; navBadge.style.display = 'flex'; }

  list.innerHTML = availOrders.map(function(o) {
    var items = Array.isArray(o.items) ? o.items : [];
    var lat   = o.latitude || o.lat;
    var lng   = o.longitude || o.lng;
    var base  = o.deliveryCharge || _safeCalcDeliveryCharge(lat, lng);
    var earn  = base + (_isRainActive() ? 10 : 0);
    var dist  = _safeCalcDist(lat, lng);
    var ts    = o.createdAt && o.createdAt.seconds ? new Date(o.createdAt.seconds * 1000) : new Date();
    var age   = Math.floor((Date.now() - ts.getTime()) / 60000);
    var shopBadge = o.shopName
      ? '<span style="background:#f0fff8;color:#065f46;font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;margin-left:6px">\uD83C\uDFEA ' + esc(o.shopName) + '</span>'
      : '';
    var rainBadge = _isRainActive()
      ? '<span style="background:#E3F2FD;color:#1565C0;font-size:10px;font-weight:800;padding:2px 7px;border-radius:20px;margin-left:5px">+\u20b910 Rain</span>'
      : '';

    // If offline, show a nudge instead of accept button
    var acceptBtn = isOnline
      ? '<button class="btn-accept" id="accept-' + o.id + '" onclick="riderAcceptOrder(\'' + o.id + '\')">\ud83d\udef5 Accept \u2014 \u20b9' + earn + '</button>'
      : '<div style="text-align:center;padding:10px;background:#fff8e1;border-radius:10px;font-size:12px;font-weight:700;color:#92400e">\u26a0\ufe0f Go Online to accept this order</div>';

    return '<div class="avail-card">'
      + '<div class="avail-card-top">'
        + '<div>'
          + '<span style="font-size:11px;font-weight:800;color:#1565C0">#' + o.id.slice(-6).toUpperCase() + '</span>'
          + shopBadge
          + '<span style="font-size:10px;color:#5C6BC0;margin-left:8px">' + age + ' min ago</span>'
        + '</div>'
        + '<span class="avail-new-badge">\ud83d\udce6 NEW</span>'
      + '</div>'
      + '<div style="padding:12px 14px">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
          + '<div>'
            + '<div style="font-size:15px;font-weight:900;color:var(--text)">' + esc(o.customerName || 'Customer') + '</div>'
            + '<div style="font-size:12px;color:var(--text2);margin-top:2px">\ud83d\udccd ' + (dist ? dist + ' km' : 'N/A') + '</div>'
          + '</div>'
          + '<div style="text-align:right">'
            + '<div style="font-size:22px;font-weight:900;color:var(--green);font-family:var(--mono)">\u20b9' + earn + rainBadge + '</div>'
            + '<div style="font-size:10px;color:var(--text2)">your earning</div>'
          + '</div>'
        + '</div>'
        + '<div style="background:var(--bg);border-radius:10px;padding:9px 12px;margin-bottom:8px;font-size:12px;color:var(--text2)">'
          + '\ud83d\udccd ' + esc(o.address || 'No address')
        + '</div>'
        + '<div style="font-size:11px;color:var(--text2);margin-bottom:12px">'
          + '\ud83d\udce6 ' + items.length + ' item' + (items.length !== 1 ? 's' : '')
          + ' \u00b7 \u20b9' + (o.totalPrice || 0) + ' total'
        + '</div>'
        + acceptBtn
      + '</div>'
    + '</div>';
  }).join('');
};

// Atomic transaction — prevents two riders accepting same order simultaneously
// Track pending accepts to prevent duplicate requests
var _pendingAccepts = new Set();
var _acceptRetryMap = {};

window.riderAcceptOrder = async function(orderId) {
  var _phone = window._phone || '';
  var _name  = window._name  || '';
  if (_myOrder) { toast('Complete your current delivery first!', 'error'); return; }
  if (!_phone)  { toast('Session error. Please refresh.', 'error'); return; }

  // Prevent duplicate accept requests for same order
  if (_pendingAccepts.has(orderId)) {
    toast('Order acceptance already in progress...', 'warning');
    return;
  }

  var btn = document.getElementById('accept-' + orderId);
  if (btn) { btn.disabled = true; btn.textContent = 'Accepting...'; }

  _pendingAccepts.add(orderId);

  try {
    var ref = window.db.collection('orders').doc(orderId);
    var fullOrderData = null;

    // Use transaction so only ONE rider can accept — atomic read+write
    await window.db.runTransaction(async function(tx) {
      var snap = await tx.get(ref);
      if (!snap.exists) throw new Error('Order not found');
      var d = snap.data();
      // Accept if status is placed OR packing and not yet assigned to someone else
      if (d.status !== 'packing' || (d.assignedRider && d.assignedRider !== _phone)) {
        throw new Error('Order already taken by another rider');
      }
      tx.update(ref, {
        status:        'assigned',
        assignedRider: _phone,
        riderPhone:    _phone,
        riderName:     _name || '',
        assignedAt:    new Date().toISOString(),
        updatedAt:     new Date().toISOString(),
        statusHistory: firebase.firestore.FieldValue.arrayUnion({ status: 'assigned', ts: new Date().toISOString(), rider: _name || _phone })
      });
      // Cache the order data from transaction to avoid redundant read
      fullOrderData = Object.assign({id: snap.id}, snap.data());
    });

    _myOrder = { id: orderId };
    window._myOrder = _myOrder;
    
    // Use cached data from transaction instead of fetching again
    if (fullOrderData) {
      _orders = [fullOrderData];
      window._orders = _orders;
    }
    
    // Clear retry counter on success
    delete _acceptRetryMap[orderId];
    
    riderDismissAlarm();
    if (window.renderOrders) window.renderOrders();
    window.renderAvailSection();
    toast('\u2705 Order accepted! Head to the store.', 'success');
  } catch(e) {
    var isResourceExhausted = e.code === 'resource-exhausted';
    var retryCount = _acceptRetryMap[orderId] || 0;
    var msg;

    if (isResourceExhausted) {
      if (retryCount < 2) {
        // Auto-retry with backoff for resource-exhausted errors
        _acceptRetryMap[orderId] = retryCount + 1;
        var delayMs = Math.min(2000, 500 * Math.pow(2, retryCount)); // 500ms, 1s, 2s
        console.log('[RiderOrders] Retrying accept due to rate limit, attempt', retryCount + 2);
        toast('Server busy, retrying...', 'warning');
        _pendingAccepts.delete(orderId);
        setTimeout(function() {
          window.riderAcceptOrder(orderId);
        }, delayMs);
        return;
      } else {
        msg = 'Server quota exceeded. Please try again in a few moments.';
      }
    } else if (e.message.includes('already taken')) {
      msg = 'Sorry! Another rider just took this order';
    } else {
      msg = e.message;
    }

    toast(msg, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '\ud83d\udef5 Accept'; }
    // Refresh available orders so the taken order disappears immediately
    if (window.renderAvailSection) window.renderAvailSection();
  } finally {
    _pendingAccepts.delete(orderId);
  }
};
