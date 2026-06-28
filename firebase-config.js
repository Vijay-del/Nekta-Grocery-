// ═══════════════════════════════════════════════════════════════
// NEKTA FIREBASE CONFIG — PRODUCTION v7
// ═══════════════════════════════════════════════════════════════
const ORDER_STATES = ['placed','packing','assigned','picked','delivered','cancelled'];
const ORDER_STATE_META = {
  placed:    { label:'Order Placed',   icon:'🕐', color:'#f59e0b' },
  packing:   { label:'Packing',        icon:'📦', color:'#3b82f6' },
  assigned:  { label:'Rider Assigned', icon:'🚴', color:'#7c3aed' },
  picked:    { label:'On the Way',     icon:'🛵', color:'#059669' },
  delivered: { label:'Delivered!',     icon:'🎉', color:'#059669' },
  cancelled: { label:'Cancelled',      icon:'❌', color:'#ef4444' },
};
window.ORDER_STATES = ORDER_STATES;
window.ORDER_STATE_META = ORDER_STATE_META;

const STORE_LAT = 17.549395259963312;
const STORE_LNG = 80.6274729902068;
const STORE_ADDRESS = '3-1-54/3 Hanumanbasthi, Kothagudem 507101';
window.STORE_LAT = STORE_LAT;
window.STORE_LNG = STORE_LNG;
window.STORE_ADDRESS = STORE_ADDRESS;

const firebaseConfig = {
  apiKey:            "AIzaSyBcfCWXmx5lCcaFIsgx5XZqUcWhQ_TbCcQ",
  authDomain:        "nekta-grocery.firebaseapp.com",
  databaseURL:       "https://nekta-grocery-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "nekta-grocery",
  storageBucket:     "nekta-grocery.firebasestorage.app",
  messagingSenderId: "373439438456",
  appId:             "1:373439438456:web:b40c2335d20b0c5f37578d",
  measurementId:     "G-BDW7Z82SPY"
};

let db, auth, rtdb, firebaseReady = false;

function initializeFirebase() {
  try {
    if (typeof firebase === 'undefined') { setTimeout(initializeFirebase, 100); return; }
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db   = firebase.firestore();
    auth = firebase.auth();
    rtdb = firebase.database();

    // FIX #10: Offline persistence was previously removed entirely due to IndexedDB conflicts.
    // Restored with proper error handling:
    //   - failed-precondition = multiple tabs open → gracefully skip (expected in PWAs)
    //   - unimplemented       = browser doesn't support IndexedDB (e.g. Firefox private mode) → skip
    // Both cases fall back to online-only mode silently; app still works, just no offline cache.
    db.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
      if (err.code === 'failed-precondition') {
        // Multiple tabs open at once — persistence only works in one tab at a time.
        console.info('Firestore offline cache disabled: multiple tabs open.');
      } else if (err.code === 'unimplemented') {
        // Browser does not support the required IndexedDB features.
        console.info('Firestore offline cache not supported in this browser.');
      } else {
        console.warn('Firestore persistence error:', err.code);
      }
    });

    firebaseReady = true;
    window.db = db; window.auth = auth; window.rtdb = rtdb;
    window.firebaseReady = true;
    window.dispatchEvent(new Event('firebaseReady'));
  } catch(e) {
    if (e.code === 'app/duplicate-app') {
      db = firebase.firestore(); auth = firebase.auth(); rtdb = firebase.database();
      firebaseReady = true;
      window.db = db; window.auth = auth; window.rtdb = rtdb;
      window.firebaseReady = true;
      window.dispatchEvent(new Event('firebaseReady'));
    } else {
      setTimeout(initializeFirebase, 300);
    }
  }
}
initializeFirebase();

// ── HAVERSINE ─────────────────────────────────────────────────
function haversineKm(lat1,lng1,lat2,lng2){
  var R=6371,dL=(lat2-lat1)*Math.PI/180,dl=(lng2-lng1)*Math.PI/180,
    a=Math.sin(dL/2)*Math.sin(dL/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dl/2)*Math.sin(dl/2);
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
window.haversineKm = haversineKm;

// ── DELIVERY CHARGE ───────────────────────────────────────────
function calculateDeliveryCharge(lat,lng){
  if(!lat||!lng||isNaN(lat)||isNaN(lng)) return 20;
  var d=haversineKm(STORE_LAT,STORE_LNG,parseFloat(lat),parseFloat(lng));
  if(d<=1)return 20; if(d<=2)return 25; if(d<=3)return 30;
  if(d<=4)return 35; if(d<=5)return 40; if(d<=6)return 50;
  if(d<=8)return 60; if(d<=10)return 80;
  return Math.round(80+(d-10)*10);
}
window.calculateDeliveryCharge = calculateDeliveryCharge;

// ── ORDER FUNCTIONS ───────────────────────────────────────────
async function saveOrderToFirebase(orderData) {
  if (!db) return null;
  try {
    // Use PIN passed from placeOrder if available, otherwise generate securely
    var deliveryPin = orderData.deliveryPin || String(1000 + (function(){
      var a = new Uint16Array(1); crypto.getRandomValues(a); return a[0] % 9000;
    }()));
    // Attach shopId from active shop session so seller receives the order
    var shopId   = orderData.shopId   || window._activeShopId   || null;
    var shopName = orderData.shopName || window._activeShopName || null;
    var ref = await db.collection('orders').add({
      customerName:  orderData.customerName  || '',
      customerPhone: orderData.customerPhone || '',
      items:         orderData.items         || [],
      address:       orderData.address       || '',
      totalPrice:    orderData.totalPrice    || 0,
      deliveryCharge:orderData.deliveryCharge|| 20,
      deliveryPin:   deliveryPin,
      status:        'placed',
      source:        orderData.source || 'app',
      shopId:        shopId,
      shopName:      shopName,
      assignedRider: null, riderName: null, riderPhone: null,
      latitude:      orderData.latitude  || null,
      longitude:     orderData.longitude || null,
      expressMode:   orderData.expressMode || false,
      eta:           orderData.expressMode ? 10 : 20,
      statusHistory: [{ status:'placed', ts:new Date().toISOString() }],
      createdAt:     firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt:     firebase.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
  } catch(e) { console.error('saveOrderToFirebase:', e.message); return null; }
}
window.saveOrderToFirebase = saveOrderToFirebase;

async function updateOrderStatus(orderId, status, extra) {
  if (!db) return false;
  extra = extra || {};
  try {
    await db.collection('orders').doc(orderId).update(Object.assign({
      status: status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      statusHistory: firebase.firestore.FieldValue.arrayUnion({ status:status, ts:new Date().toISOString() })
    }, extra));
    return true;
  } catch(e) { console.error('updateOrderStatus:', e.message); return false; }
}
window.updateOrderStatus = updateOrderStatus;

// Rider location — RTDB for real-time, Firestore every 10s
var _custCoordCache = {};
var _riderLocThrottle = {};
function updateRiderLocationFirebase(orderId, riderPhone, lat, lng, heading, speed) {
  if (!rtdb && !db) return;
  heading = heading||0; speed = speed||0;
  var locData = { lat:lat, lng:lng, latitude:lat, longitude:lng, heading:heading, speed:speed, ts:Date.now() };
  if (rtdb) {
    rtdb.ref('riderLocations/'+orderId).set(locData);
    if (riderPhone) rtdb.ref('riderLocations/'+riderPhone).set(locData);
  }
  var now = Date.now();
  if (!_riderLocThrottle[orderId] || now - _riderLocThrottle[orderId] > 8000) {
    _riderLocThrottle[orderId] = now;
    if (db) {
      db.collection('orders').doc(orderId).update({
        riderLat: lat, riderLng: lng,
        'riderLocation.lat': lat, 'riderLocation.lng': lng,
        'riderLocation.latitude': lat, 'riderLocation.longitude': lng,
        'riderLocation.heading': heading, 'riderLocation.speed': speed,
        'riderLocation.ts': now,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function(){});
    }
  }
}
window.updateRiderLocationFirebase = updateRiderLocationFirebase;

function listenToRiderLocationRTDB(orderId, callback) {
  if (!rtdb) return function(){};
  var ref = rtdb.ref('riderLocations/'+orderId);
  ref.on('value', function(snap){ var v=snap.val(); if(v) callback(v); });
  return function(){ ref.off(); };
}
window.listenToRiderLocationRTDB = listenToRiderLocationRTDB;

// FIX #11: Old implementation queried customerPhone with exact string match, so a phone stored as
// "9876543210" wouldn't match a query for "+919876543210" and vice versa — customer sees no active order.
// Normalize to bare 10-digit format (strip +91 / 91 prefix) and query both stored forms.
async function getActiveOrderForCustomer(customerPhone) {
  if (!db || !customerPhone) return null;
  try {
    // Normalize to bare 10-digit number
    var bare = String(customerPhone).replace(/\D/g, '');
    if (bare.length === 12 && bare.startsWith('91')) bare = bare.slice(2);
    if (bare.length === 11 && bare.startsWith('0'))  bare = bare.slice(1);
    var withCountry = '+91' + bare;

    // Query both stored formats (old records may have bare; new records may have +91...)
    var snapBare = await db.collection('orders').where('customerPhone','==',bare).limit(50).get().catch(()=>({empty:true,docs:[]}));
    var snapFull = await db.collection('orders').where('customerPhone','==',withCountry).limit(50).get().catch(()=>({empty:true,docs:[]}));

    var allDocs = [...(snapBare.docs||[]), ...(snapFull.docs||[])];
    if (!allDocs.length) return null;

    var active = allDocs
      .map(function(d){ return Object.assign({id:d.id},d.data()); })
      .filter(function(o){ return ['placed','packing','assigned','picked'].includes(o.status); })
      .sort(function(a,b){ return (b.createdAt&&b.createdAt.seconds||0)-(a.createdAt&&a.createdAt.seconds||0); });
    return active[0]||null;
  } catch(e) { return null; }
}
window.getActiveOrderForCustomer = getActiveOrderForCustomer;

async function assignRiderToOrderFirebase(orderId, riderId, riderName, riderPhone, riderBike) {
  if (!db) return false;
  try {
    await db.collection('orders').doc(orderId).update({
      assignedRider:riderId, riderName:riderName, riderPhone:riderPhone,
      riderBike:riderBike||'', status:'assigned',
      assignedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt:  firebase.firestore.FieldValue.serverTimestamp(),
      statusHistory: firebase.firestore.FieldValue.arrayUnion({ status:'assigned', ts:new Date().toISOString() })
    });
    return true;
  } catch(e) { console.error('assignRider:', e.message); return false; }
}
window.assignRiderToOrderFirebase = assignRiderToOrderFirebase;

async function updateRiderEarningsFirebase(riderPhone, amount) {
  if (!db) return;
  try {
    var snap = await db.collection('riders').where('phone','==',riderPhone).limit(1).get();
    if (!snap.empty) {
      await snap.docs[0].ref.update({
        todayEarnings:       firebase.firestore.FieldValue.increment(amount),
        weekEarnings:        firebase.firestore.FieldValue.increment(amount),
        totalEarnings:       firebase.firestore.FieldValue.increment(amount),
        deliveriesCompleted: firebase.firestore.FieldValue.increment(1),
        todayDeliveries:     firebase.firestore.FieldValue.increment(1),
        lastDeliveryAt:      new Date().toISOString(),
        lastSeen:            new Date().toISOString()
      });
    }
  } catch(e) {}
}
window.updateRiderEarningsFirebase = updateRiderEarningsFirebase;

// ── CONFIRM ORDER (placed → packing) ─────────────────────────
async function confirmOrderFirebase(orderId) {
  if (!db) return false;
  try {
    await db.collection('orders').doc(orderId).update({
      status: 'packing',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      statusHistory: firebase.firestore.FieldValue.arrayUnion({ status:'packing', ts:new Date().toISOString() })
    });
    return true;
  } catch(e) { console.error('confirmOrderFirebase:', e.message); return false; }
}
window.confirmOrderFirebase = confirmOrderFirebase;

// ── GET ORDERS ────────────────────────────────────────────────
async function getOrdersFromFirebase(limit) {
  if (!db) return [];
  try {
    var snap = await db.collection('orders').orderBy('createdAt','desc').limit(limit||100).get()
      .catch(function(){ return db.collection('orders').limit(limit||100).get(); });
    return snap.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
  } catch(e) { return []; }
}
window.getOrdersFromFirebase = getOrdersFromFirebase;

// ── GET RIDERS ────────────────────────────────────────────────
async function getRidersFromFirebase() {
  if (!db) return [];
  try {
    var snap = await db.collection('riders').where('isActive','==',true).get();
    return snap.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
  } catch(e) { return []; }
}
window.getRidersFromFirebase = getRidersFromFirebase;

// ── ADD RIDER ─────────────────────────────────────────────────
async function addRiderToFirebase(data) {
  if (!db) return null;
  try {
    var ref = await db.collection('riders').add(Object.assign({
      status:'offline', todayEarnings:0, weekEarnings:0, totalEarnings:0,
      deliveriesCompleted:0, todayDeliveries:0, weekDeliveries:0,
      rating:4.5, isActive:true, rainBonusActive:false, todayOnlineSecs:0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, data));
    return ref.id;
  } catch(e) { console.error('addRiderToFirebase:', e.message); return null; }
}
window.addRiderToFirebase = addRiderToFirebase;

// ── GET ASSIGNED ORDERS FOR RIDER ────────────────────────────
async function getAssignedOrdersForRider(riderPhone) {
  if (!db) return [];
  try {
    var snap = await db.collection('orders').where('riderPhone','==',riderPhone)
      .where('status','in',['assigned','picked']).get();
    return snap.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
  } catch(e) { return []; }
}
window.getAssignedOrdersForRider = getAssignedOrdersForRider;

// ── COMPLETE DELIVERY ─────────────────────────────────────────
async function completeDeliveryFirebase(orderId, riderPhone, deliveryMins, photoBase64) {
  if (!db) return false;
  try {
    var riderEarns = 20;
    var snap = await db.collection('orders').doc(orderId).get();
    if (snap.exists) riderEarns = snap.data().deliveryCharge || 20;
    await db.collection('orders').doc(orderId).update({
      status:'delivered', deliveredAt:new Date().toISOString(),
      deliveryMins: deliveryMins||0,
      riderEarnings: riderEarns,
      proofOfDelivery: photoBase64||null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      statusHistory: firebase.firestore.FieldValue.arrayUnion({status:'delivered',ts:new Date().toISOString()})
    });
    await updateRiderEarningsFirebase(riderPhone, riderEarns);
    return true;
  } catch(e) { console.error('completeDeliveryFirebase:', e.message); return false; }
}
window.completeDeliveryFirebase = completeDeliveryFirebase;

// ── LISTEN TO ORDER STATUS ────────────────────────────────────
function listenToOrderStatusChange(orderId, callback) {
  if (!db) return function(){};
  var unsub = db.collection('orders').doc(orderId).onSnapshot(function(snap){
    if (snap.exists) callback(Object.assign({id:snap.id}, snap.data()));
  }, function(){});
  return unsub;
}
window.listenToOrderStatusChange = listenToOrderStatusChange;

// ── ITEMS LIST HTML ───────────────────────────────────────────
function mkItemsListHtml(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return '<div style="background:#f8fafc;border-radius:12px;padding:12px;margin-bottom:10px">'
    +'<p style="font-weight:800;font-size:12px;color:#374151;margin-bottom:8px">📦 Items</p>'
    +items.map(function(i){
      return '<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid #f1f5f9">'
        +'<span>'+String(i.name||'')+'</span>'
        +'<span style="font-weight:700">x'+i.qty+' · ₹'+(i.cost||0)+'</span></div>';
    }).join('')
    +'</div>';
}
window.mkItemsListHtml = mkItemsListHtml;

// ── WA NOTIFY ─────────────────────────────────────────────────
function nktaNotifyWA(phone, msg, label) {
  var ph = String(phone||'').replace(/\D/g,'');
  if (ph.length < 10) return;
  window.open('https://wa.me/91'+ph+'?text='+encodeURIComponent(msg),'_blank','noopener,noreferrer');
}
window.nktaNotifyWA = nktaNotifyWA;

function mkBillHtml(order) {
  var items=order.items||[], del=order.deliveryCharge!=null?order.deliveryCharge:20;
  var sub=items.reduce(function(s,i){return s+(i.cost||0);},0)||Math.max(0,(order.totalPrice||0)-del);
  var total=order.totalPrice||(sub+del);
  return '<div style="background:#f8fafc;border-radius:14px;padding:14px;margin-top:10px">'
    +'<p style="font-weight:800;font-size:13px;color:#374151;margin-bottom:10px">🧾 Bill</p>'
    +'<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>Items ('+items.length+')</span><span style="font-weight:700">₹'+sub.toFixed(0)+'</span></div>'
    +'<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:10px"><span>Delivery</span><span style="font-weight:700">₹'+del+'</span></div>'
    +'<div style="display:flex;justify-content:space-between;font-weight:900;font-size:15px;border-top:2px dashed #e5e7eb;padding-top:10px"><span>Total</span><span style="color:#059669">₹'+total.toFixed(0)+'</span></div>'
    +'</div>';
}
window.mkBillHtml = mkBillHtml;

// ═══════════════════════════════════════════════════════════════
// VERSION CHECKING FOR PRODUCT UPDATES (Smart Refresh System)
// ═══════════════════════════════════════════════════════════════

// Get stored product version from localStorage
function getStoredProductVersion() {
  try {
    return JSON.parse(localStorage.getItem('nk_product_version') || '0');
  } catch(e) {
    return 0;
  }
}
window.getStoredProductVersion = getStoredProductVersion;

// Fetch latest product version from Firestore
async function getLatestProductVersion() {
  if (!db) return 0;
  try {
    var doc = await db.collection('config').doc('products').get();
    if (doc.exists) {
      var data = doc.data();
      return data.version || 0;
    }
    return 0;
  } catch(e) {
    console.warn('Failed to fetch product version:', e.message);
    return 0;
  }
}
window.getLatestProductVersion = getLatestProductVersion;

// Check if product updates are available
async function checkProductUpdates() {
  var stored = getStoredProductVersion();
  var latest = await getLatestProductVersion();
  return { stored, latest, hasUpdates: latest > stored };
}
window.checkProductUpdates = checkProductUpdates;

// Store current product version in localStorage
function storeProductVersion(version) {
  try {
    localStorage.setItem('nk_product_version', JSON.stringify(version));
    return true;
  } catch(e) {
    console.warn('Failed to store product version:', e.message);
    return false;
  }
}
window.storeProductVersion = storeProductVersion;
