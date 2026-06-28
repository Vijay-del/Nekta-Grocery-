// ═══════════════════════════════════════════════════════════════
// NEKTA DASHBOARD — Full Logic
// Handles: login, admin panel, rider panel, all Firestore ops
// ═══════════════════════════════════════════════════════════════
'use strict';

// ─── CONSTANTS ───────────────────────────────────────────────
// DEPRECATED: SHA-256 hash kept for backwards compatibility only
// (ADMIN_PIN_HASH is also declared in admin-auth.js — use window reference to avoid conflict)
// Admin PIN hash — verified via verifyAdminPin() in admin-auth.js

// Category mapping — same as user side to ensure consistency
const _catAlias = {
  EGGS: 'DAIRY', BAKERY: 'DAIRY',
  FLOURS: 'GRAINS',
  BEVERAGES: 'DRINKS',
  'DRY FRUITS': 'SNACKS',
  SUGAR: 'CONDIMENTS',
  PULSES: 'DALS',
  FROZEN: 'EASYCOOK',
  MILLETS: 'GRAINS',
  MASALAS: 'SPICES',
  MASALA: 'SPICES',
  PICKLE: 'PICKLES',
  CHOCOLATE: 'CHOCOLATES',
  ICECREAM: 'ICECREAMS',
  'ICE CREAM': 'ICECREAMS',
  BISCUITS: 'SNACKS',
  NOODLES: 'SNACKS',
  CHIPS: 'SNACKS',
  PAN: 'PANSHOP',
  SMOKE: 'PANSHOP',
  TOBACCO: 'PANSHOP',
};

// ─── DEBUG HELPERS ───────────────────────────────────────────
window.verifyPassword = async function(pwd) {
  // Use bcrypt if available (recommended)
  if(window.verifyAdminPin) return await window.verifyAdminPin(pwd);
  // Fallback to SHA-256 (DEPRECATED - for backwards compatibility only)
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
  const hash = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  console.warn('⚠️ Using legacy SHA-256 - migrate to bcrypt for better security');
  return hash === window._ADMIN_PIN_HASH;
};

// ─── STATE ───────────────────────────────────────────────────
let _role        = null; // 'admin' | 'rider'
let _riderPhone  = null;
let _riderName   = null;
let _adminL      = null; // live order listener unsubscribe
let _ridersL     = null;
let _productsL   = null; // live products listener unsubscribe
let _allOrders   = [];
let _allRiders   = [];
let _allProducts = [];
let _settings    = {};
let stockFilter  = 'all';
let _charts      = {};
let _notifs      = [];
let _notifUnread = 0;
let _clockTimer  = null;

// ─── WAIT FOR FIREBASE ───────────────────────────────────────
function waitDB(fn, tries=0) {
  if (window.db && window.firebaseReady) { fn(); return; }
  if (tries > 40) { fn(); return; }
  setTimeout(() => waitDB(fn, tries+1), 300);
}

// ─── TOAST ───────────────────────────────────────────────────
function toast(msg, type='info') {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    document.body.appendChild(stack);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  t.textContent = (icons[type]||'') + ' ' + msg;
  stack.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ─── PAGE NAVIGATION ─────────────────────────────────────────
function showPage(name, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  const p = document.getElementById('page-' + name);
  if (p) p.classList.add('on');
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('on'));
  if (el) el.classList.add('on');
  const titles = {
    overview:'Dashboard', orders:'Orders', riders:'Riders',
    products:'Products', stock:'Stock', analytics:'Analytics',
    customers:'Customers', homepage:'Home Control', 'home-editor':'User Side Editor', promotions:'Promotions',
    settings:'Settings', 'rider-home':'My Orders',
    'rider-earnings':'Earnings', 'rider-history':'Delivery History'
  };
  const tb = document.getElementById('page-title');
  if (tb) tb.textContent = titles[name] || name;
  // Lazy-load page data
  if (name === 'livecontrol') { renderLiveControl(); }
  if (name === 'orders')    renderOrders();
  if (name === 'riders')    renderRidersPage();
  if (name === 'inventory') { loadAllCategories(); renderInventory(); loadInventoryStats(); }
  if (name === 'analytics') loadAnalytics();
  if (name === 'customers') renderCustomers();
  if (name === 'homepage')  loadHomePage();
  if (name === 'home-editor') { waitDB(async () => { await loadHomeEditorData(); renderHomeEditor(); }); }
  if (name === 'promotions') loadPromotions();
  if (name === 'settings')  loadSettings();
  if (name === 'rider-home')     renderRiderHome();
  if (name === 'rider-earnings') renderRiderEarnings();
  if (name === 'rider-history')  renderRiderHistory();
  if (name === 'reports') setTimeout(function(){ if (typeof loadAllReports === 'function') loadAllReports(); }, 80);
}
window.showPage = showPage;

// ─── CLOCK ───────────────────────────────────────────────────
function startClock() {
  const el = document.getElementById('tb-time');
  function tick() {
    if (el) {
      const n = new Date();
      el.textContent = n.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    }
  }
  tick();
  _clockTimer = setInterval(tick, 1000);
}

// ─── LOGIN ───────────────────────────────────────────────────
let _loginRole = 'admin';
let _logoClicks = 0;
let _logoClickTimer = null;

function handleLogoClick() {
  _logoClicks++;
  
  // Reset counter after 3 seconds of inactivity
  clearTimeout(_logoClickTimer);
  _logoClickTimer = setTimeout(() => {
    _logoClicks = 0;
  }, 3000);
  
  // After 7 clicks, ask for password
  if (_logoClicks === 7) {
    _logoClicks = 0;
    const pwd = prompt('🔐 Admin Password:');
    if (pwd) {
      (async () => {
        let ok = false;
        if (window.verifyAdminPin) { try { ok = await window.verifyAdminPin(pwd); } catch(e){} }
        if (!ok && window._ADMIN_PIN_HASH) {
          const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
          const hash = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
          ok = (hash === window._ADMIN_PIN_HASH);
        }
        if (ok) {
          alert('✅ Admin access granted!');
          _role = 'admin';
          sessionStorage.setItem('nk_dash_role', 'admin');
          sessionStorage.setItem('nk_dash_login_time', new Date().toISOString());
          enterDashboard(); initLiveControl();
        } else {
          console.warn('❌ Wrong password');
          alert('❌ Wrong password');
        }
      })();
    }
  }
}
window.handleLogoClick = handleLogoClick;

function setLoginRole(r) {
  _loginRole = r;
  
  const tabAdmin = document.getElementById('tab-admin');
  const tabRider = document.getElementById('tab-rider');
  const adminFields = document.getElementById('admin-fields');
  const riderFields = document.getElementById('rider-fields');
  
  if (tabAdmin) tabAdmin.classList.toggle('on', r === 'admin');
  if (tabRider) tabRider.classList.toggle('on', r === 'rider');
  if (adminFields) {
    adminFields.style.display = r === 'admin' ? 'flex' : 'none';
  } else {
    console.error('❌ admin-fields element not found');
  }
  if (riderFields) {
    riderFields.style.display = r === 'rider' ? 'flex' : 'none';
  } else {
    console.error('❌ rider-fields element not found');
  }
}
window.setLoginRole = setLoginRole;

async function doLogin() {
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-err');
  if (!btn || !err) return;
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Checking…';

  try {
    if (_loginRole === 'admin') {
      const pass = document.getElementById('admin-pass');
      if (!pass) { err.textContent = '❌ Password field not found'; btn.disabled = false; btn.textContent = '🚀 Enter Dashboard'; return; }
      const passValue = pass.value.trim();
      if (!passValue) { err.textContent = 'Enter password'; btn.disabled = false; btn.textContent = '🚀 Enter Dashboard'; return; }

      // Step 1: Try verifyAdminPin (SHA-256 + bcrypt via admin-auth.js)
      let pinOk = false;
      if (window.verifyAdminPin) {
        try { pinOk = await window.verifyAdminPin(passValue); } catch(ve) { console.warn('verifyAdminPin:', ve.message); }
      }

      // Step 2: SHA-256 fallback against window._ADMIN_PIN_HASH
      if (!pinOk && window._ADMIN_PIN_HASH) {
        const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(passValue));
        const inputHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
        if (inputHash === window._ADMIN_PIN_HASH) pinOk = true;

        // Step 3: Firestore-stored hash (set by changePassword)
        if (!pinOk) {
          try {
            if (window.db && window.firebaseReady) {
              const doc = await window.db.collection('app_overrides').doc('admin').get();
              if (doc.exists && doc.data().passwordHash && inputHash === doc.data().passwordHash) pinOk = true;
            }
          } catch(fe) { console.warn('Firestore hash check:', fe.message); }
        }
      }

      if (pinOk) {
        _role = 'admin';
        sessionStorage.setItem('nk_dash_role', 'admin');
        sessionStorage.setItem('nk_dash_login_time', new Date().toISOString());
        btn.textContent = '✅ Welcome!';
        setTimeout(() => { try { enterDashboard(); } catch(ex) { err.textContent = '❌ Dashboard error: ' + ex.message; btn.disabled = false; btn.textContent = '🚀 Enter Dashboard'; } }, 100);
        return;
      }

      err.textContent = '❌ Wrong password';
      btn.disabled = false;
      btn.textContent = '🚀 Enter Dashboard';

    } else {
      // Rider login
      const phElem   = document.getElementById('rider-phone');
      const nameElem = document.getElementById('rider-name');
      if (!phElem || !nameElem) { err.textContent = '❌ Form fields not found'; btn.disabled = false; btn.textContent = '🚀 Enter Dashboard'; return; }
      const ph   = phElem.value.trim();
      const name = nameElem.value.trim();
      if (!/^[6-9]\d{9}$/.test(ph)) { err.textContent = 'Enter valid 10-digit phone'; btn.disabled = false; btn.textContent = '🚀 Enter Dashboard'; return; }
      if (!name) { err.textContent = 'Enter your name'; btn.disabled = false; btn.textContent = '🚀 Enter Dashboard'; return; }

      // Verify rider is registered before allowing login
      if (window.db && window.firebaseReady) {
        try {
          const snap = await window.db.collection('riders').where('phone','==',ph).limit(1).get();
          if (snap.empty || !snap.docs[0].data().isActive) {
            err.textContent = '\u274c Phone not registered as a rider. Contact admin.';
            btn.disabled = false; btn.textContent = '\uD83D\uDE80 Enter Dashboard';
            return;
          }
          // Use the name from Firestore, not what rider typed
          const riderDoc = snap.docs[0].data();
          _riderName = riderDoc.name || name;
        } catch(e) { console.warn('Rider verify:', e.message); }
      }

      // Riders have their own dedicated app — redirect to rider.html
      sessionStorage.setItem('nk_dash_rider_phone', ph);
      sessionStorage.setItem('nk_dash_rider_name', _riderName || name);
      btn.textContent = '✅ Redirecting...';
      setTimeout(() => { window.location.href = 'rider.html'; }, 150);
    }
  } catch(e) {
    console.error('Login error:', e.message);
    err.textContent = '❌ Error: ' + (e.message || 'Unknown');
    btn.disabled = false;
    btn.textContent = '🚀 Enter Dashboard';
  }
}
window.doLogin = doLogin;

// ─── IMPROVED LOGIN INITIALIZATION ───────────────────────────
function initializeLoginScreen() {
  
  // Check if already logged in
  // Check sessionStorage first, then localStorage (cross-tab auth from index.html)
  let savedRole = sessionStorage.getItem('nk_dash_role');
  let savedTime = sessionStorage.getItem('nk_dash_login_time');
  if (!savedRole) {
    const lsRole = localStorage.getItem('nk_dash_role');
    const lsTime = localStorage.getItem('nk_dash_login_time');
    if (lsRole && lsTime && (Date.now() - new Date(lsTime).getTime()) < 300000) {
      savedRole = lsRole;
      savedTime = lsTime;
      sessionStorage.setItem('nk_dash_role', lsRole);
      sessionStorage.setItem('nk_dash_login_time', lsTime);
      localStorage.removeItem('nk_dash_role');
      localStorage.removeItem('nk_dash_login_time');
      localStorage.removeItem('nk_dash_token');
    }
  }
  const sessionTimeout = 12 * 60 * 60 * 1000; // 12 hours
  
  if (savedRole && savedTime) {
    const now = new Date().getTime();
    const loginTime = new Date(savedTime).getTime();
    
    if (now - loginTime < sessionTimeout) {
      _role = savedRole;
      
      if (savedRole === 'admin') {
        _role = 'admin';
      } else {
        // Riders belong in rider.html
        window.location.href = 'rider.html';
        return;
      }
      
      setTimeout(() => {
        waitDB(() => enterDashboard());
      }, 500);
      return;
    }
  }
  
  // Ensure login screen elements exist
  const loginScreen = document.getElementById('login-screen');
  const adminFields = document.getElementById('admin-fields');
  const riderFields = document.getElementById('rider-fields');
  
  if (!loginScreen) {
    console.error('❌ Login screen not found in DOM');
    return;
  }
  
  if (!adminFields) {
    console.warn('⚠️ Admin fields not found, creating...');
    // This shouldn't happen but provide fallback
  }
  
  // Start with admin tab selected
  setLoginRole('admin');
  
  // Setup keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !loginScreen.classList.contains('hidden')) {
      doLogin();
    }
  });
  
}

// ─── CHECK SESSION STORAGE (from app-core redirect) ─────────
function checkSession() {
  const role = sessionStorage.getItem('nk_dash_role');
  if (role === 'admin') {
    _role = 'admin';
    enterDashboard();
    return true;
  }
  if (role === 'rider') {
    // Riders belong in rider.html, not the admin dashboard
    window.location.href = 'rider.html';
    return true;
  }
  return false;
}
window.checkSession = checkSession;

// ─── ENTER DASHBOARD ─────────────────────────────────────────
function enterDashboard() {
  try {
    // Hide login, show dashboard
    const loginScreen = document.getElementById('login-screen');
    const app = document.getElementById('app');
    
    if (loginScreen) loginScreen.classList.add('hidden');
    if (app) app.classList.remove('hidden');
    
    
    startClock();

    if (_role === 'admin') {
      try {
        document.getElementById('sb-admin-nav').style.display = 'block';
        document.getElementById('sb-rider-nav').style.display = 'none';
        document.getElementById('user-ava').textContent = 'A';
        document.getElementById('user-name').textContent = 'Admin';
        document.getElementById('user-role-label').textContent = 'Administrator';
      } catch(e) { console.warn('UI update failed:', e.message); }
      
      // Load data asynchronously
      setTimeout(() => {
        try {
          if (window.db && window.firebaseReady) {
            loadOverview();
            startLiveListeners();
            checkRainStatus();
          } else {
            console.warn('⏳ Firebase not ready yet, retrying...');
            waitDB(() => {
              try {
                loadOverview();
                startLiveListeners();
              } catch(e) { console.error('Listener error:', e.message); }
            });
          }
        } catch(e) { console.error('Admin setup error:', e.message); }
      }, 500);
      
    } else {
      try {
        document.getElementById('sb-admin-nav').style.display = 'none';
        document.getElementById('sb-rider-nav').style.display = 'block';
        document.getElementById('user-ava').textContent = (_riderName||'R')[0].toUpperCase();
        document.getElementById('user-name').textContent = _riderName || 'Rider';
        document.getElementById('user-role-label').textContent = '🚴 Rider';
        // Pre-fill rider display
        const rd = document.getElementById('rd-name-display');
        const rp = document.getElementById('rd-phone-display');
        const ra = document.getElementById('rd-ava');
        if (rd) rd.textContent = _riderName || 'Rider';
        if (rp) rp.textContent = _riderPhone || '';
        if (ra) ra.textContent = (_riderName||'R')[0].toUpperCase();
      } catch(e) { console.warn('Rider UI update failed:', e.message); }
      
      // Status UI will be set correctly after Firestore read in doLoad below

      setTimeout(() => {
        try {
          const doLoad = () => {
            // Read current status from Firestore — do NOT overwrite it
            window.db.collection('riders').where('phone','==',_riderPhone).limit(1).get()
              .then(snap => {
                if (!snap.empty) {
                  const data = snap.docs[0].data();
                  _riderStatus = data.status || 'offline';
                } else {
                  _riderStatus = 'offline';
                }
                const isOn = _riderStatus === 'online' || _riderStatus === 'busy';
                const tog  = document.getElementById('rd-status-tog');
                const pill = document.getElementById('rd-status-pill');
                const lbl  = document.getElementById('rd-status-lbl');
                if (tog)  tog.classList.toggle('on', isOn);
                if (pill) { pill.textContent = isOn ? '🟢 Online' : '⚫ Offline'; pill.className = 'status-pill ' + (isOn ? 'sp-online' : 'sp-offline'); }
                if (lbl)  lbl.textContent = isOn ? 'Go Offline' : 'Go Online';
                renderRiderHome();
              })
              .catch(() => { _riderStatus = 'offline'; renderRiderHome(); });
          };
          if (window.db && window.firebaseReady) { doLoad(); }
          else { waitDB(doLoad); }
        } catch(e) { console.error('Rider setup error:', e.message); }
      }, 500);
    }
  } catch(e) {
    console.error('❌ enterDashboard failed:', e.message);
    alert('Dashboard error: ' + e.message);
  }
}
window.enterDashboard = enterDashboard;

// ─── LOGOUT ──────────────────────────────────────────────────
function logout() {
  sessionStorage.clear();
  if (_adminL) { try { _adminL(); } catch {} }
  if (_ridersL) { try { _ridersL(); } catch {} }
  if (_productsL) { try { _productsL(); } catch {} }
  if (_clockTimer) clearInterval(_clockTimer);
  location.reload();
}
window.logout = logout;

// ═══════════════════════════════════════════════════════════════
// ADMIN — LIVE LISTENERS
// ═══════════════════════════════════════════════════════════════
function startLiveListeners() {
  function _processOrders(snap) {
    // Load ALL orders — admin sees everything (shop orders show masked customer info)
    _allOrders = snap.docs
      .map(function(d){ return Object.assign({ id: d.id }, d.data()); });
    window._allOrders = _allOrders;
    updateKPIs();
    renderOverviewOrders();
    renderOrders();
    updateOrderBadge();
    checkNewOrderNotif();
    updateLiveControlKPIs();
    var lcPage = document.getElementById('page-livecontrol');
    if (lcPage && lcPage.classList.contains('on')) { renderLCOrders(); renderLCCustomers(); }
  }

  // Orders — ALL orders. Admin sees Nekta-direct + shop orders (shop orders mask customer PII).
  _adminL = window.db.collection('orders')
    .orderBy('createdAt', 'desc').limit(500)
    .onSnapshot(_processOrders, function() {
      // Index not ready — fallback without orderBy
      _adminL = window.db.collection('orders').limit(500)
        .onSnapshot(_processOrders, function(e){ console.warn('orders fallback:', e.message); });
    });

  // Riders real-time — listen to ALL status changes
  _ridersL = window.db.collection('riders')
    .onSnapshot(snap => {
      _allRiders = snap.docs
        .map(d => ({ id:d.id, ...d.data() }))
        .filter(r => r.isActive !== false);
      updateKPIs();
      renderOverviewRiders();
      renderRidersPage();
      updateRidersActivityRow();
      updateLiveControlKPIs();
      var lcPage = document.getElementById('page-livecontrol');
      if (lcPage && lcPage.classList.contains('on')) renderLCRiders();
      if (_role === 'rider') loadRiderStats();
    }, err => console.warn('riders listener:', err.message));

  // RTDB: sync rider online presence in real time (rider.html writes here)
  function _startRiderPresenceListener() {
    if (!window.rtdb) { setTimeout(_startRiderPresenceListener, 800); return; }
    window.rtdb.ref('riderOnlineTime').on('value', snap => {
      const presenceMap = snap.val() || {};
      const now = Date.now();
      _allRiders.forEach(r => {
        const key = r.phone;
        const rec = presenceMap[key];
        if (rec && rec.status === 'online' && (now - (rec.ts||0)) < 120000) {
          // Rider pinged online in last 2 minutes via RTDB
          if (r.status !== 'busy') r.status = 'online';
        }
      });
      renderRidersPage();
      updateKPIs();
    }, () => {});
  }
  _startRiderPresenceListener();

  // Products real-time listener
  _productsL = window.db.collection('products').onSnapshot(snap => {
    const firebaseProducts = snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
    // Firestore only — no seed
    _allProducts = firebaseProducts;
    // Apply app_overrides so stock/outOfStock overrides are reflected
    window.db.collection('app_overrides').doc('products').get().then(ov => {
      if (ov.exists) {
        const overrides = ov.data() || {};
        _allProducts.forEach((p, i) => {
          const o = overrides[String(p.id)];
          if (o) Object.assign(_allProducts[i], o);
        });
      }
      _allProducts = _allProducts.filter(p => !p.hidden);
      window.allProducts = _allProducts;
      window._allProducts = _allProducts;
      renderInventory();
      loadInventoryStats();
      updateKPIs();
      _refreshCatDropdowns();
    }).catch(() => {
      _allProducts = _allProducts.filter(p => !p.hidden);
      window.allProducts = _allProducts;
      window._allProducts = _allProducts;
      renderInventory();
      loadInventoryStats();
      updateKPIs();
      _refreshCatDropdowns();
    });
  }, err => console.warn('products listener:', err.message));

  // Settings
  window.db.collection('app_overrides').doc('settings').onSnapshot(doc => {
    if (doc.exists) _settings = doc.data() || {};
    loadSettings();
  }, () => {});

  // app_overrides/products — re-render inventory when overrides change (e.g. after bulk upload)
  window.db.collection('app_overrides').doc('products').onSnapshot(() => {
    loadAllProducts().then(() => { renderInventory(); loadInventoryStats(); });
  }, () => {});

  // Load custom categories
  loadAllCategories();
  startCustomCategoriesListener();
}

// ─── LOAD PRODUCTS ───────────────────────────────────────────
async function loadAllProducts() {
  try {
    // Firestore only — ignore seed entirely
    const snap = await window.db.collection('products').get();
    _allProducts = snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
    // Apply app_overrides on top
    const ov = await window.db.collection('app_overrides').doc('products').get();
    if (ov.exists) {
      const overrides = ov.data() || {};
      _allProducts.forEach((p, i) => {
        const o = overrides[String(p.id)];
        if (o) Object.assign(_allProducts[i], o);
      });
    }
    // Filter hidden products
    _allProducts = _allProducts.filter(p => !p.hidden);
    window.allProducts = _allProducts;
    window._allProducts = _allProducts;
    // Clear any stale bulk selection
    if (typeof _invSelected !== 'undefined') _invSelected.clear();
  } catch(e) { console.warn('loadAllProducts:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// OVERVIEW PAGE
// ═══════════════════════════════════════════════════════════════
function loadOverview() {
  renderOverviewOrders();
  renderOverviewRiders();
  updateKPIs();
  loadRevenueChart('7d', null);
}

function updateKPIs() {
  // Also update live control KPIs whenever overview KPIs update
  if (typeof updateLiveControlKPIs === 'function') updateLiveControlKPIs();
  const today = new Date(); today.setHours(0,0,0,0);
  const todayOrds = _allOrders.filter(o => {
    const ts = o.createdAt?.seconds ? new Date(o.createdAt.seconds*1000) : new Date(o.createdAt||0);
    return ts >= today;
  });
  const rev = todayOrds.filter(o=>o.status==='delivered').reduce((s,o)=>s+(o.totalPrice||0),0);
  const active = _allOrders.filter(o=>['placed','packing','assigned','picked'].includes(o.status)).length;
  const online = _allRiders.filter(r=>r.status==='online'||r.status==='busy').length;
  const onDel  = _allRiders.filter(r=>r.status==='busy').length;

  _set('kpi-rev', '₹'+rev.toLocaleString('en-IN'));
  _set('kpi-rev-sub', todayOrds.length + ' orders today');
  _set('kpi-active', active);
  _set('kpi-active-sub', active > 0 ? 'Needs attention' : 'All clear ✅');
  _set('kpi-riders', online);
  _set('kpi-riders-sub', onDel + ' on delivery');

  // Low stock
  const thresh = (_settings.lowStockThreshold || 10);
  const all = window.allProducts || _allProducts || [];
  const low = all.filter(p=>(p.stock||0) > 0 && (p.stock||0) <= thresh).length;
  _set('kpi-low', low);
  const lsa = document.getElementById('low-stock-alert');
  if (lsa) {
    lsa.style.display = low > 0 ? 'block' : 'none';
    if (low > 0) lsa.innerHTML = '<div class="alert-strip">⚠️ <span>'+low+' items need restocking</span></div>';
  }
}

function renderOverviewOrders() {
  // Pipeline breakdown counts
  const today = new Date(); today.setHours(0,0,0,0);
  const todayOrds = _allOrders.filter(o => {
    const ts = o.createdAt?.seconds ? new Date(o.createdAt.seconds*1000) : new Date(o.createdAt||0);
    return ts >= today;
  });
  _set('ov-placed',    todayOrds.filter(o=>o.status==='placed').length);
  _set('ov-packing',   todayOrds.filter(o=>o.status==='packing').length);
  _set('ov-onway',     todayOrds.filter(o=>['assigned','picked'].includes(o.status)).length);
  _set('ov-delivered', todayOrds.filter(o=>o.status==='delivered').length);

  // Top selling today
  const delivered = todayOrds.filter(o=>o.status==='delivered');
  const topEl = document.getElementById('ov-top-today');
  if (topEl) {
    const counts = {};
    delivered.forEach(o=>(o.items||[]).forEach(i=>{ counts[i.name]=(counts[i.name]||0)+(i.qty||1); }));
    const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if (!top.length) {
      topEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2);font-size:13px">No deliveries yet today</div>';
    } else {
      const max = top[0][1];
      topEl.innerHTML = top.map(([name,qty]) =>
        `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1;font-size:13px;font-weight:600">${esc(name)}</div>
          <div style="width:80px;background:var(--bg3);border-radius:4px;height:6px;overflow:hidden">
            <div style="height:100%;background:var(--green);width:${Math.round(qty/max*100)}%"></div>
          </div>
          <div style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--green);width:24px;text-align:right">${qty}</div>
        </div>`
      ).join('');
    }
  }

  // Today at a glance
  const glanceEl = document.getElementById('ov-glance');
  if (glanceEl) {
    const rev = delivered.reduce((s,o)=>s+(o.totalPrice||0),0);
    const aov = delivered.length ? Math.round(rev/delivered.length) : 0;
    const cancelled = todayOrds.filter(o=>o.status==='cancelled').length;
    const mins = delivered.filter(o=>o.deliveryMins>0).map(o=>o.deliveryMins);
    const avgMins = mins.length ? Math.round(mins.reduce((s,v)=>s+v,0)/mins.length) : null;
    const phones = new Set(todayOrds.map(o=>o.customerPhone).filter(Boolean));
    glanceEl.innerHTML = [
      ['&#128101; Unique Customers', phones.size],
      ['&#128176; Avg Order Value', '&#8377;'+aov],
      ['&#9203; Avg Delivery Time', avgMins ? avgMins+' min' : '—'],
      ['&#10060; Cancelled', cancelled],
      ['&#128230; Total Orders', todayOrds.length],
      ['&#128176; Total Revenue', '&#8377;'+rev.toLocaleString('en-IN')],
    ].map(([label,val]) =>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;color:var(--text2)">${label}</span>
        <span style="font-size:14px;font-weight:700;font-family:var(--mono)">${val}</span>
      </div>`
    ).join('');
  }
}

function renderOverviewRiders() {
  // Rider status is shown in Live Control — Dashboard only shows KPI counts (updated in updateKPIs)
}

// ═══════════════════════════════════════════════════════════════
// ORDERS PAGE
// ═══════════════════════════════════════════════════════════════
let _orderPeriod = 'today';

function setOrderPeriod(p) {
  _orderPeriod = p;
  // Update tab styles
  ['today','week','all','date'].forEach(t => {
    const btn = document.getElementById('ord-tab-'+t);
    if (btn) { btn.className = 'btn-sm ' + (t === p ? 'bg-green' : 'bg-ghost'); }
  });
  const datePick = document.getElementById('ord-date-pick');
  if (datePick) {
    datePick.style.display = p === 'date' ? 'inline-block' : 'none';
    if (p === 'date' && !datePick.value) {
      datePick.value = new Date().toISOString().slice(0,10);
    }
  }
  renderOrders();
}
window.setOrderPeriod = setOrderPeriod;

function renderOrders() {
  // Also refresh live control KPIs whenever orders render
  updateLiveControlKPIs();
  if (document.getElementById('page-livecontrol') &&
      document.getElementById('page-livecontrol').classList.contains('on')) {
    renderLiveControl();
  }
  const el = document.getElementById('orders-list');
  if (!el) return;
  const search = (document.getElementById('ord-search')||{}).value||'';
  const status = (document.getElementById('ord-status')||{}).value||'';
  // Source filter: 'all' | 'nekta' | 'shop'
  const source = (document.getElementById('ord-source')||{}).value||'all';
  let list = [..._allOrders];

  // Source filter — admin can isolate Nekta-direct vs shop orders
  if (source === 'nekta') list = list.filter(o => !o.shopId);
  else if (source === 'shop') list = list.filter(o => !!o.shopId);

  // Period filter
  const now = new Date();
  if (_orderPeriod === 'today') {
    const start = new Date(now); start.setHours(0,0,0,0);
    const end   = new Date(now); end.setHours(23,59,59,999);
    list = list.filter(o => { const ts = _orderTs(o); return ts >= start && ts <= end; });
  } else if (_orderPeriod === 'week') {
    const start = new Date(now); start.setHours(0,0,0,0);
    start.setDate(start.getDate() - 6);
    list = list.filter(o => { const ts = _orderTs(o); return ts >= start; });
  } else if (_orderPeriod === 'date') {
    const dateVal = (document.getElementById('ord-date-pick')||{}).value;
    if (dateVal) {
      const start = new Date(dateVal); start.setHours(0,0,0,0);
      const end   = new Date(dateVal); end.setHours(23,59,59,999);
      list = list.filter(o => { const ts = _orderTs(o); return ts >= start && ts <= end; });
    }
  }

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(o =>
      (o.customerName||'').toLowerCase().includes(q) ||
      (o.customerPhone||'').includes(q) ||
      (o.shopName||'').toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q) ||
      o.id.slice(-6).toUpperCase().includes(q.toUpperCase())
    );
  }
  if (status) list = list.filter(o => o.status === status);

  const countEl = document.getElementById('ord-period-count');
  const nektaCount = _allOrders.filter(o => !o.shopId).length;
  const shopCount  = _allOrders.filter(o => !!o.shopId).length;
  if (countEl) countEl.textContent = list.length + ' order' + (list.length !== 1 ? 's' : '') +
    (source === 'all' ? ' (' + nektaCount + ' Nekta · ' + shopCount + ' Shop)' : '');

  if (!list.length) { el.innerHTML = '<div class="empty"><div class="ico">📭</div><p>No orders found</p></div>'; return; }
  el.innerHTML = list.map(o => renderOrderCard(o)).join('');
}
window.filterOrders = renderOrders;

function _orderTs(o) {
  return o.createdAt?.seconds ? new Date(o.createdAt.seconds*1000) : new Date(o.createdAt||0);
}

function renderOrderCard(o) {
  const sm = statusMeta(o.status);
  const ts = o.createdAt?.seconds ? new Date(o.createdAt.seconds*1000) : new Date(o.createdAt||0);
  const timeStr = isNaN(ts) ? '—' : ts.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  const dateStr = isNaN(ts) ? '' : ts.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  const isNew = o.status==='placed';
  const isShopOrder = !!o.shopId;
  const items = Array.isArray(o.items) ? o.items : [];
  const itemsText = items.map(i=>i.name+' x'+i.qty).join(', ');

  // Admin sees full customer details for ALL orders — both Nekta and shop orders
  const displayName  = esc(o.customerName  || '—');
  const displayPhone = esc(o.customerPhone || '—');
  const displayAddr  = esc(o.address || '');

  let btns = '';
  if (!isShopOrder) {
    // Nekta-direct orders: admin has full control
    if (o.status==='placed')   btns += '<button class="btn-sm bg-green" onclick="confirmOrder(\''+o.id+'\')">✅ Confirm</button>';
    if (o.status==='packing')  btns += '<button class="btn-sm bg-blue" onclick="openAssignRider(\''+o.id+'\')">🚴 Assign Rider</button>';
    if (o.status==='assigned') btns += '<button class="btn-sm bg-orange" onclick="markPicked(\''+o.id+'\')">📦 Picked Up</button>';
    if (!['delivered','cancelled'].includes(o.status)) {
      btns += '<button class="btn-sm bg-red" onclick="cancelOrder(\''+o.id+'\')">✕ Cancel</button>';
    }
    if (o.customerPhone) {
      btns += '<a href="https://wa.me/91'+o.customerPhone+'?text=Hi+'+encodeURIComponent(o.customerName||'')+'%2C+your+Nekta+order+is+'+encodeURIComponent(sm.label)+'!" target="_blank" rel="noopener" class="btn-sm bg-ghost" style="text-decoration:none">💬 WA</a>';
    }
    if (o.latitude) {
      btns += '<a href="https://maps.google.com/?q='+o.latitude+','+o.longitude+'" target="_blank" rel="noopener" class="btn-sm bg-ghost" style="text-decoration:none">📍 Map</a>';
    }
  } else {
    // Shop orders: seller handles 'placed' stage; admin takes over from 'packing' onward
    if (o.status === 'placed') {
      btns += '<span style="font-size:11px;color:var(--text2);padding:4px 8px;background:var(--bg3);border-radius:6px">🏪 Waiting for Seller</span>';
    }
    // Admin can assign rider once seller has confirmed (packing)
    if (o.status === 'packing') {
      btns += '<button class="btn-sm bg-blue" onclick="openAssignRider(\''+o.id+'\')">🚴 Assign Rider</button>';
    }
    if (o.status === 'assigned') {
      btns += '<button class="btn-sm bg-orange" onclick="adminMarkPickedShop(\''+o.id+'\')">📦 Picked Up</button>';
    }
    // Admin can cancel any shop order that isn't delivered
    if (!['delivered','cancelled'].includes(o.status)) {
      btns += '<button class="btn-sm bg-red" onclick="cancelOrder(\''+o.id+'\')">✕ Cancel</button>';
    }
    // Admin can contact customer of shop order
    if (o.customerPhone) {
      btns += '<a href="https://wa.me/91'+o.customerPhone+'?text=Hi+'+encodeURIComponent(o.customerName||'')+'%2C+your+Nekta+order+is+'+encodeURIComponent(sm.label)+'!" target="_blank" rel="noopener" class="btn-sm bg-ghost" style="text-decoration:none">💬 WA</a>';
    }
    if (o.latitude) {
      btns += '<a href="https://maps.google.com/?q='+o.latitude+','+o.longitude+'" target="_blank" rel="noopener" class="btn-sm bg-ghost" style="text-decoration:none">📍 Map</a>';
    }
  }
  btns += '<button class="btn-sm bg-ghost" onclick="openOrderDetail(\''+o.id+'\')">👁 Details</button>';

  return '<div class="order-row" style="border-left:4px solid '+(isShopOrder?'#8b5cf6':isNew?'#ffd600':sm.color||'#00e676')+';margin-bottom:10px">'
    + '<div class="order-row-top">'
    +   '<span class="order-id" title="Full ID: '+o.id+'">'+(isNew&&!isShopOrder?'🆕 ':'')+(isShopOrder?'🏪 ':'')+'#'+o.id.slice(-6).toUpperCase()+'</span>'
    +   '<span class="status-pill sp-'+o.status+'">'+sm.icon+' '+sm.label+'</span>'
    +   '<span style="font-size:11px;color:var(--text2)">'+dateStr+' '+timeStr+'</span>'
    +   '<span class="order-amt">₹'+(o.totalPrice||0).toLocaleString('en-IN')+'</span>'
    + '</div>'
    + '<div class="order-row-mid">'
    +   '<span>👤 '+displayName+'</span>'
    +   '<span>📞 '+displayPhone+'</span>'
    +   (o.shopName ? '<span>🏪 '+esc(o.shopName)+'</span>' : '')
    +   (o.riderName ? '<span>🚴 '+esc(o.riderName)+'</span>' : '')
    +   (o.deliveryMins ? '<span style="color:var(--green)">⏱ '+o.deliveryMins+' min</span>' : '')
    + '</div>'
    + (displayAddr ? '<div style="font-size:12px;color:var(--text2);margin:4px 0">📍 '+displayAddr+'</div>' : '')
    + (itemsText ? '<div style="font-size:12px;background:linear-gradient(135deg,rgba(0,185,107,.08),rgba(0,185,107,.04));border-left:3px solid var(--g);padding:8px 12px;border-radius:6px;margin:6px 0;font-weight:600;color:var(--dark)"><span style="font-weight:900">📦 Items:</span> '+esc(itemsText)+'</div>' : '')
    + '<div class="order-actions">'+btns+'</div>'
    + '</div>';
}

function statusMeta(s) {
  const m = {
    placed:    { label:'Placed',       icon:'🕐' },
    packing:   { label:'Packing',      icon:'📦' },
    assigned:  { label:'Assigned',     icon:'🚴' },
    picked:    { label:'On Way',       icon:'🛵' },
    delivered: { label:'Delivered',    icon:'✅' },
    cancelled: { label:'Cancelled',    icon:'✕'  },
  };
  return m[s] || { label: s, icon:'•' };
}

function updateOrderBadge() {
  const placed = _allOrders.filter(o=>o.status==='placed').length;
  const active = _allOrders.filter(o=>['placed','packing','assigned','picked'].includes(o.status)).length;
  const b = document.getElementById('sb-ord-badge');
  if (b) {
    b.style.display = active>0 ? 'inline-flex' : 'none';
    b.textContent = active;
    b.style.background = placed>0 ? 'var(--red)' : '#f59e0b';
    b.style.animation = placed>0 ? 'badgePulse 1s ease infinite' : 'none';
  }
}

async function confirmOrder(id) {
  if (!confirm('Confirm this order?')) return;
  const o = _allOrders.find(x => x.id === id) || {};
  // Shop orders at 'placed' stage are confirmed by seller — admin should not override
  if (o.shopId && o.status === 'placed') {
    toast('This shop order is waiting for seller confirmation first', 'warning');
    return;
  }
  
  // Query online riders BEFORE confirming to show them
  let onlineRiders = [];
  try {
    const ridersSnap = await window.db.collection('riders')
      .where('status', '==', 'online')
      .limit(50)
      .get();
    onlineRiders = ridersSnap.docs.map(d => Object.assign({id: d.id}, d.data()));
  } catch(e) {
    console.warn('Error fetching online riders:', e.message);
  }
  
  const ok = await window.db.collection('orders').doc(id).update({
    status: 'packing',
    assignedRider: null,
    riderPhone: null,
    riderName: null,
    updatedAt: new Date().toISOString(),
    statusHistory: firebase.firestore.FieldValue.arrayUnion({ status: 'packing', ts: new Date().toISOString() })
  }).then(()=>true).catch(e=>{toast(e.message,'error');return false;});
  stopDashAlarm();
  if (ok) {
    toast('Order confirmed — now packing','success');
    
    // Show online riders modal
    if (onlineRiders.length > 0) {
      const ridersHtml = onlineRiders.map(r => {
        const dist = (r.latitude && r.longitude && window.STORE_LAT && window.STORE_LNG) 
          ? Math.sqrt(Math.pow(r.latitude - window.STORE_LAT, 2) + Math.pow(r.longitude - window.STORE_LNG, 2)) * 111
          : 'N/A';
        const distStr = typeof dist === 'number' ? dist.toFixed(1) + ' km' : dist;
        return `
          <div style="background:#f8fafc;border-radius:12px;padding:12px;margin-bottom:8px;border-left:4px solid #10b981">
            <div style="display:flex;justify-content:space-between;align-items:start">
              <div>
                <p style="font-weight:700;font-size:13px;color:#1f2937">${r.name||'Rider'}</p>
                <p style="font-size:12px;color:#6b7280;margin-top:2px">📱 ${r.phone||'N/A'}</p>
              </div>
              <div style="text-align:right">
                <p style="font-weight:700;font-size:12px;color:#10b981">${distStr}</p>
                <p style="font-size:11px;color:#9ca3af">from store</p>
              </div>
            </div>
            <p style="font-size:11px;color:#6b7280;margin-top:6px">🏍 ${r.bike||'Bike'} • Earnings: ₹${r.totalEarnings||0}</p>
          </div>
        `;
      }).join('');
      
      showMdl(`
        <div style="padding:6px 0">
          <h3 style="font-weight:900;font-size:18px;margin-bottom:12px;color:#1f2937">✅ Order Confirmed!</h3>
          <p style="font-size:13px;color:#6b7280;margin-bottom:16px">This order is now visible to <strong>${onlineRiders.length} online rider${onlineRiders.length!==1?'s':''}</strong></p>
          <div style="background:#dcfce7;border:1px solid #86efac;border-radius:12px;padding:12px;margin-bottom:16px">
            <p style="font-size:12px;font-weight:700;color:#166534">🟢 Online Riders Notified</p>
            <p style="font-size:11px;color:#166534;margin-top:4px">Riders will see this order in their app immediately</p>
          </div>
          <h4 style="font-weight:700;font-size:12px;color:#6b7280;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">Active Riders</h4>
          <div style="max-height:300px;overflow-y:auto;margin-bottom:14px">
            ${ridersHtml}
          </div>
          <div style="background:#f3f4f6;border-radius:12px;padding:12px;margin-bottom:14px">
            <p style="font-size:12px;font-weight:700;color:#374151;margin-bottom:4px">📍 Order Location</p>
            <p style="font-size:11px;color:#6b7280">${o.address||'No address provided'}</p>
          </div>
          <button class="pbtn" onclick="closeMdl()" style="width:100%;padding:12px">Done</button>
        </div>
      `);
    } else {
      showMdl(`
        <div style="text-align:center;padding:20px">
          <div style="font-size:36px;margin-bottom:12px">⚠️</div>
          <h3 style="font-weight:900;font-size:18px;color:#1f2937;margin-bottom:8px">No Online Riders</h3>
          <p style="font-size:13px;color:#6b7280;margin-bottom:16px">Order is confirmed but no riders are currently online. They'll see it when they go online.</p>
          <button class="pbtn" onclick="closeMdl()">Got it</button>
        </div>
      `);
    }
    
    try {
      const snap = await window.db.collection('orders').doc(id).get();
      if (snap.exists) {
        const od = snap.data();
        const ph = (od.customerPhone||'').replace(/\D/g,'');
        const name = od.customerName || 'Customer';
        if (ph.length >= 10) {
          const msg = encodeURIComponent('Hi ' + name + '! ✅ Your Nekta order #' + id.slice(-6).toUpperCase() + ' has been confirmed and is being packed. We will deliver soon! 🛒');
          window.open('https://wa.me/91' + ph + '?text=' + msg, '_blank');
        }
      }
    } catch(e) { console.warn('WA notify:', e.message); }
  }
}
window.confirmOrder = confirmOrder;

async function markPicked(id) {
  await window.db.collection('orders').doc(id).update({
    status:'picked', updatedAt: new Date().toISOString(),
    statusHistory: firebase.firestore.FieldValue.arrayUnion({ status: 'picked', ts: new Date().toISOString() })
  }).then(()=>toast('Marked as picked up','success')).catch(e=>toast(e.message,'error'));
}
window.markPicked = markPicked;

// Admin override: mark shop order as picked (rider collected from seller shop)
async function adminMarkPickedShop(id) {
  if (!confirm('Mark this shop order as picked up by rider?')) return;
  await window.db.collection('orders').doc(id).update({
    status: 'picked',
    updatedAt: new Date().toISOString(),
    statusHistory: firebase.firestore.FieldValue.arrayUnion({ status: 'picked', ts: new Date().toISOString() })
  }).then(()=>toast('Shop order marked as picked up ✅','success')).catch(e=>toast(e.message,'error'));
}
window.adminMarkPickedShop = adminMarkPickedShop;

async function cancelOrder(id) {
  if (!confirm('Cancel this order?')) return;
  await window.db.collection('orders').doc(id).update({
    status: 'cancelled',
    updatedAt: new Date().toISOString(),
    statusHistory: firebase.firestore.FieldValue.arrayUnion({ status: 'cancelled', ts: new Date().toISOString() })
  }).then(async () => {
    toast('Order cancelled','info');
    // Notify customer
    try {
      const snap = await window.db.collection('orders').doc(id).get();
      if (snap.exists) {
        const od = snap.data();
        const ph = (od.customerPhone||'').replace(/\D/g,'');
        if (ph.length >= 10) {
          const msg = encodeURIComponent('❌ We are sorry! Your Nekta order #' + id.slice(-6).toUpperCase() + ' has been cancelled. Please place a new order or contact us for help. 🙏');
          window.open('https://wa.me/91' + ph + '?text=' + msg, '_blank');
        }
      }
    } catch(e) { console.warn('WA cancel notify:', e.message); }
  }).catch(e=>toast(e.message,'error'));
}
window.cancelOrder = cancelOrder;

function openOrderDetail(id) {
  const o = _allOrders.find(x=>x.id===id);
  if (!o) return;
  const sm = statusMeta(o.status);
  const ts = o.createdAt?.seconds ? new Date(o.createdAt.seconds*1000) : new Date(o.createdAt||0);
  const items = Array.isArray(o.items) ? o.items : [];
  const itemsHtml = items.map(i =>
    '<div class="item-row"><span>'+i.name+' × '+i.qty+'</span><span>₹'+(i.cost||0)+'</span></div>'
  ).join('');
  const sub = items.reduce((s,i)=>s+(i.cost||0),0);
  const delCharge = o.deliveryCharge ?? 20;
  // totalPrice is stored as grand total (items + delivery); use it directly
  const total = o.totalPrice || (sub + delCharge);
  showModal('<h3>Order #'+o.id.slice(-6).toUpperCase()+'</h3>'
    + '<div style="font-size:11px;color:var(--text2);margin-top:-10px;font-family:var(--mono)">Full ID: '+o.id+'</div>'
    + '<div class="order-detail-grid">'
    +   '<div class="detail-field"><div style="font-size:11px;color:var(--text2)">Customer</div><div style="font-weight:600">'+esc(o.customerName||'—')+'</div></div>'
    +   '<div class="detail-field"><div style="font-size:11px;color:var(--text2)">Phone</div><div style="font-weight:600">'+esc(o.customerPhone||'—')+'</div></div>'
    +   '<div class="detail-field"><div style="font-size:11px;color:var(--text2)">Status</div><div><span class="status-pill sp-'+o.status+'">'+sm.icon+' '+sm.label+'</span></div></div>'
    +   '<div class="detail-field"><div style="font-size:11px;color:var(--text2)">Ordered</div><div>'+ts.toLocaleString('en-IN')+'</div></div>'
    +   '<div class="detail-field" style="grid-column:span 2"><div style="font-size:11px;color:var(--text2)">Address</div><div>'+esc(o.address||'—')+'</div></div>'
    +   (o.riderName ? '<div class="detail-field"><div style="font-size:11px;color:var(--text2)">Rider</div><div>'+esc(o.riderName)+'</div></div>' : '')
    + '</div>'
    + '<div class="items-table">'
    +   '<div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text2)">ITEMS</div>'
    +   itemsHtml
    +   '<div class="bill-row" style="margin-top:8px"><span>Items Subtotal</span><span>₹'+sub+'</span></div>'
    +   '<div class="bill-row"><span>Delivery</span><span>'+( delCharge===0 ? '<span style="color:var(--green)">FREE</span>' : '₹'+delCharge )+'</span></div>'
    +   '<div class="bill-total"><span>Total</span><span>₹'+total+'</span></div>'
    + '</div>'
  );
}
window.openOrderDetail = openOrderDetail;

// ─── ASSIGN RIDER MODAL ──────────────────────────────────────
function openAssignRider(orderId) {
  const online = _allRiders.filter(r => r.status === 'online' || r.status === 'busy');
  const offline = _allRiders.filter(r => r.status === 'offline');
  const mkCard = r => '<div class="rider-option" onclick="assignRider(\''+orderId+'\',\''+r.id+'\',\''+esc(r.name)+'\',\''+r.phone+'\',\''+esc(r.bikeNumber||'')+'\')">'
    + '<div class="rider-ava" style="background:'+(r.status==='online'?'var(--green)':'var(--bg4)')+';color:'+(r.status==='online'?'#000':'var(--text2)')+'">'+r.name[0].toUpperCase()+'</div>'
    + '<div style="flex:1"><div style="font-size:13px;font-weight:600">'+esc(r.name)+'</div><div style="font-size:11px;color:var(--text2)">📞 '+r.phone+(r.bikeNumber?' · '+r.bikeNumber:'')+'</div></div>'
    + '<span class="status-pill '+(r.status==='online'?'sp-online':'sp-offline')+'">'+r.status+'</span>'
    + '</div>';
  const onlineHtml = online.length
    ? '<div style="font-size:11px;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">🟢 Online Riders</div>' + online.map(mkCard).join('')
    : '<p style="color:var(--text2);font-size:13px;margin-bottom:10px">No riders online right now</p>';
  const offlineHtml = offline.length
    ? '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin:10px 0 6px">⚫ Offline Riders</div>' + offline.map(mkCard).join('')
    : '';
  showModal('<h3>Assign Rider — #'+orderId.slice(-6).toUpperCase()+'</h3>'+onlineHtml+offlineHtml);
}
window.openAssignRider = openAssignRider;

async function assignRider(orderId, riderId, riderName, riderPhone, riderBike) {
  closeModal();
  const ok = await assignRiderToOrderFirebase(orderId, riderId, riderName, riderPhone, riderBike)
    .catch(function(e){ toast(e.message,'error'); return false; });
  if (ok) {
    toast('Rider ' + riderName + ' assigned ✅','success');
    // Notify rider via WhatsApp
    try {
      const snap = await window.db.collection('orders').doc(orderId).get();
      if (snap.exists) {
        const od = snap.data();
        const rPh = (riderPhone||'').replace(/\D/g,'');
        if (rPh.length >= 10) {
          const items = Array.isArray(od.items) ? od.items.slice(0,3).map(i=>i.name).join(', ') : '';
          nktaNotifyWA(rPh, '\uD83D\uDEF5 Order #' + orderId.slice(-6).toUpperCase() + ' assigned to you! Earning: \u20B9' + (od.deliveryCharge||20) + '. Head to store now! \uD83C\uDFEA', 'Notify Rider');
        }
        // Also notify customer that rider is assigned
        const cPh = (od.customerPhone||'').replace(/\D/g,'');
        if (cPh.length >= 10) {
          const cmsg = encodeURIComponent('🛵 Your Nekta order #' + orderId.slice(-6).toUpperCase() + ' has been assigned to ' + riderName + '! They will pick up and deliver soon. Track your order in the app. 🚀');
          setTimeout(() => window.open('https://wa.me/91' + cPh + '?text=' + cmsg, '_blank'), 1000);
        }
      }
    } catch(e) { console.warn('WA assign notify:', e.message); }
  }
}
window.assignRider = assignRider;

// ─── DOWNLOAD ORDERS CSV ─────────────────────────────────────
function downloadOrders() {
  const period = (document.getElementById('dl-period')||{}).value||'today';
  const today = new Date(); today.setHours(0,0,0,0);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate()-7);
  let list = _allOrders;
  if (period==='today') list = list.filter(o=>{ const ts=o.createdAt?.seconds?new Date(o.createdAt.seconds*1000):new Date(o.createdAt||0); return ts>=today; });
  if (period==='week')  list = list.filter(o=>{ const ts=o.createdAt?.seconds?new Date(o.createdAt.seconds*1000):new Date(o.createdAt||0); return ts>=weekAgo; });
  const rows = [['Order ID','Customer','Phone','Status','Items','Total (₹)','Delivery (₹)','Date']];
  list.forEach(o=>{
    const ts=o.createdAt?.seconds?new Date(o.createdAt.seconds*1000):new Date(o.createdAt||0);
    const items=(o.items||[]).map(i=>i.name+' x'+i.qty).join('; ');
    rows.push([o.id.slice(-6).toUpperCase(),o.customerName||'',o.customerPhone||'',o.status,items,o.totalPrice||0,o.deliveryCharge||0,isNaN(ts)?'':ts.toLocaleDateString('en-IN')]);
  });
  if (typeof saveXlsx === 'function') {
    saveXlsx(rows, 'Orders', 'nekta-orders-'+period+'-'+new Date().toISOString().slice(0,10)+'.xlsx');
  } else {
    const csv = rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
    const a = document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
    a.download='nekta-orders-'+period+'.csv'; a.click();
  }
}
window.downloadOrders = downloadOrders;

// ═══════════════════════════════════════════════════════════════
// RIDERS PAGE
// ═══════════════════════════════════════════════════════════════
function renderRidersPage() {
  updateLiveControlKPIs();
  if (document.getElementById('page-livecontrol') &&
      document.getElementById('page-livecontrol').classList.contains('on')) {
    renderLCRiders();
  }
  const el = document.getElementById('riders-grid');
  if (!el) return;

  // Sort: online first, then by todayEarnings desc
  const sorted = [..._allRiders].sort((a,b) => {
    const aOn = (a.status==='online'||a.status==='busy') ? 1 : 0;
    const bOn = (b.status==='online'||b.status==='busy') ? 1 : 0;
    if (bOn !== aOn) return bOn - aOn;
    return (b.todayEarnings||0) - (a.todayEarnings||0);
  });

  if (!sorted.length) { el.innerHTML='<div class="empty" style="grid-column:span 3"><div class="ico">🚴</div><p>No riders yet. Click + Add Rider.</p></div>'; return; }

  el.innerHTML = sorted.map((r, idx) => {
    const isOnline  = r.status === 'online';
    const isBusy    = r.status === 'busy';
    const isOffline = !isOnline && !isBusy;
    const dotColor  = isOnline ? 'var(--green)' : isBusy ? 'var(--yellow)' : 'var(--text3)';
    const dotAnim   = (isOnline||isBusy) ? 'animation:pulse 1.5s infinite' : '';
    const cardBorder = isOnline ? 'border-color:rgba(0,230,118,.35);border-width:1.5px' : isBusy ? 'border-color:rgba(255,214,0,.35)' : '';
    const statusLabel = isOnline ? '🟢 Online' : isBusy ? '🟡 Delivering' : '⚫ Offline';
    const topBadge = idx===0 && (isOnline||isBusy) ? '<span style="background:var(--yellow);color:#000;font-size:9px;font-weight:800;padding:2px 8px;border-radius:20px;margin-left:6px">⭐ TOP</span>' : '';

    // Online time
    const secs = r.todayOnlineSecs||0;
    const oh = Math.floor(secs/3600), om = Math.floor((secs%3600)/60);
    const onlineStr = secs>0 ? (oh>0?oh+'h '+om+'m':om+'m') : '—';

    // Incentive badges
    const todayDels = r.todayDeliveries||0;
    const hits15 = todayDels>=15;
    const rainOn = r.rainBonusActive||false;

    const lastSeenStr = r.lastSeen ? new Date(r.lastSeen).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : null;
    const lastSeenHtml = lastSeenStr ? '<span style="font-size:10px;color:var(--text3);margin-left:4px">· last seen '+lastSeenStr+'</span>' : '';

    return '<div class="rider-card" style="'+cardBorder+'">'
      + '<div class="rider-ava" style="background:'+(isOffline?'var(--bg4)':'var(--green)')+';color:'+(isOffline?'var(--text2)':'#000')+'">'+r.name[0].toUpperCase()+'</div>'
      + '<div class="rider-info">'
      +   '<h4 style="display:flex;align-items:center;gap:4px">'+esc(r.name)+topBadge+'</h4>'
      +   '<p style="font-size:11px;color:var(--text2)">📞 '+r.phone+(r.bikeNumber?' · 🛵 '+r.bikeNumber:'')+'</p>'
      +   '<div style="display:flex;align-items:center;gap:6px;margin-top:6px">'
      +     '<div style="width:8px;height:8px;border-radius:50%;background:'+dotColor+';flex-shrink:0;'+dotAnim+'"></div>'
      +     '<span style="font-size:11px;font-weight:700;color:'+(isOnline?'var(--green)':isBusy?'var(--yellow)':'var(--text3)')+'">'+statusLabel+'</span>'
      +     lastSeenHtml
      +   '</div>'
      +   '<div class="rider-stats" style="margin-top:8px">'
      +     '<div class="rider-stat"><div class="val" style="color:var(--green)">₹'+(r.todayEarnings||0)+'</div><div class="lbl">Today</div></div>'
      +     '<div class="rider-stat"><div class="val">'+todayDels+'</div><div class="lbl">Orders</div></div>'
      +     '<div class="rider-stat"><div class="val" style="color:var(--yellow)">'+onlineStr+'</div><div class="lbl">Online</div></div>'
      +     '<div class="rider-stat"><div class="val">'+(r.rating||4.5)+'★</div><div class="lbl">Rating</div></div>'
      +   '</div>'
      +   '<div style="display:flex;gap:5px;margin-top:8px;flex-wrap:wrap">'
      +     (hits15?'<span style="font-size:10px;font-weight:800;color:var(--orange);background:rgba(255,107,53,.12);padding:3px 8px;border-radius:6px">🏆 15-order bonus!</span>':'')
      +     (rainOn?'<span style="font-size:10px;font-weight:800;color:#1565C0;background:#E3F2FD;padding:3px 8px;border-radius:6px">🌧️ Rain bonus ON</span>':'')
      +   '</div>'
      + '</div>'
      + '<div class="rider-actions">'
      +   '<button class="btn-sm bg-blue" onclick="openRiderDetail(\''+r.id+'\',\''+esc(r.phone)+'\',\''+esc(r.name)+'\')">👁 View</button>'
      +   '<button class="btn-sm" style="background:rgba(21,101,192,.12);color:var(--blue);border:1px solid rgba(21,101,192,.2)" onclick="toggleRainBonus(\''+r.id+'\','+rainOn+')">🌧️ Rain</button>'
      +   '<button class="btn-sm bg-red" onclick="removeRider(\''+r.id+'\')">Remove</button>'
      +   '<a href="https://wa.me/91'+r.phone+'" target="_blank" class="btn-sm bg-ghost" style="text-decoration:none">💬 WA</a>'
      + '</div>'
      + '</div>';
  }).join('');
}

async function openRiderDetail(riderId, riderPhone, riderName) {
  showModal(
    '<h3>🛵 '+esc(riderName)+'</h3>'
    + '<p style="font-size:12px;color:var(--text2);margin-top:-8px">📞 '+esc(riderPhone)+'</p>'
    + '<div id="rd-detail-body" style="margin-top:12px"><div style="text-align:center;padding:20px;color:var(--text2)">Loading...</div></div>'
  );

  try {
    const r = _allRiders.find(x => x.id === riderId) || {};
    const isOn = r.status === 'online' || r.status === 'busy';

    const oSnap = await window.db.collection('orders')
      .where('riderPhone','==',riderPhone)
      .where('status','==','delivered')
      .orderBy('deliveredAt','desc').limit(30).get()
      .catch(() => window.db.collection('orders').where('riderPhone','==',riderPhone).get());

    const orders = oSnap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(o=>o.status==='delivered')
      .sort((a,b)=>(b.deliveredAt?.seconds||0)-(a.deliveredAt?.seconds||0));

    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const weekStart  = new Date(); weekStart.setHours(0,0,0,0);
    const wd = weekStart.getDay(); weekStart.setDate(weekStart.getDate()-(wd===0?6:wd-1));
    const todayOrds = orders.filter(o=>{ const t=o.deliveredAt?.seconds?new Date(o.deliveredAt.seconds*1000):new Date(o.deliveredAt||0); return t>=todayStart; });
    const weekOrds  = orders.filter(o=>{ const t=o.deliveredAt?.seconds?new Date(o.deliveredAt.seconds*1000):new Date(o.deliveredAt||0); return t>=weekStart; });
    const todayEarn = todayOrds.reduce((s,o)=>s+(o.riderEarnings||o.deliveryCharge||20),0);
    const weekEarn  = weekOrds.reduce((s,o)=>s+(o.riderEarnings||o.deliveryCharge||20),0);
    const totalEarn = orders.reduce((s,o)=>s+(o.riderEarnings||o.deliveryCharge||20),0);

    const aSnap = await window.db.collection('orders').where('riderPhone','==',riderPhone).get();
    const active = aSnap.docs.map(d=>({id:d.id,...d.data()})).filter(o=>['assigned','picked'].includes(o.status));

    let liveLocHtml = '<p style="font-size:12px;color:var(--text3)">No active delivery</p>';
    if (active.length && window.rtdb) {
      const locSnap = await window.rtdb.ref('riderLocations/'+active[0].id).once('value').catch(()=>null);
      const loc = locSnap?.val();
      if (loc && loc.lat && loc.lng) {
        liveLocHtml = '<iframe src="https://maps.google.com/maps?q='+loc.lat+','+loc.lng+'&z=15&output=embed" style="width:100%;height:180px;border:none;border-radius:10px"></iframe>'
          + '<div style="font-size:11px;color:var(--green);margin-top:6px;font-family:var(--mono)">● Live — '+loc.lat.toFixed(4)+', '+loc.lng.toFixed(4)+'</div>';
      }
    }

    // Online time
    const secs = r.todayOnlineSecs||0;
    const oh = Math.floor(secs/3600), om = Math.floor((secs%3600)/60);
    const onlineTimeStr = secs>0?(oh>0?oh+'h '+om+'m':om+'m'):'—';

    // Incentive summary
    const hits15 = (r.todayDeliveries||0)>=15;
    const incHtml = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">'
      + (hits15?'<span style="font-size:11px;font-weight:800;color:var(--orange);background:rgba(255,107,53,.1);padding:4px 10px;border-radius:6px">🏆 15-order bonus earned!</span>':'')
      + ((r.rainBonusActive)?'<span style="font-size:11px;font-weight:800;color:#1565C0;background:#E3F2FD;padding:4px 10px;border-radius:6px">🌧️ Rain bonus active</span>':'')
      + '</div>';

    const histHtml = orders.length ? orders.slice(0,10).map(o => {
      const ts = o.deliveredAt?.seconds ? new Date(o.deliveredAt.seconds*1000) : new Date(o.deliveredAt||0);
      const earned = o.riderEarnings||o.deliveryCharge||20;
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">'
        + '<div style="flex:1"><div style="font-size:13px;font-weight:600">'+(o.customerName||'—')+'</div>'
        + '<div style="font-size:11px;color:var(--text2)">#'+o.id.slice(-6).toUpperCase()+(o.deliveryMins?' · ⏱ '+o.deliveryMins+' min':'')+' · '+ts.toLocaleDateString('en-IN',{day:'numeric',month:'short'})+' '+ts.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})+'</div></div>'
        + '<div style="font-size:14px;font-weight:800;color:var(--green)">+₹'+earned+(o.rainBonus?'<span style=\'font-size:10px;color:#1565C0\'>+₹'+o.rainBonus+' 🌧️</span>':'')+'</div>'
        + '</div>';
    }).join('') : '<p style="font-size:13px;color:var(--text3);padding:8px 0">No deliveries yet</p>';

    const el = document.getElementById('rd-detail-body');
    if (!el) return;
    el.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px">'
      + '<div style="background:var(--bg3);border-radius:10px;padding:10px;text-align:center"><div style="font-size:10px;color:var(--text2);margin-bottom:3px">TODAY</div><div style="font-size:18px;font-weight:800;color:var(--green)">₹'+todayEarn+'</div><div style="font-size:10px;color:var(--text3)">'+todayOrds.length+' orders</div></div>'
      + '<div style="background:var(--bg3);border-radius:10px;padding:10px;text-align:center"><div style="font-size:10px;color:var(--text2);margin-bottom:3px">WEEK</div><div style="font-size:18px;font-weight:800;color:var(--yellow)">₹'+weekEarn+'</div><div style="font-size:10px;color:var(--text3)">'+weekOrds.length+' orders</div></div>'
      + '<div style="background:var(--bg3);border-radius:10px;padding:10px;text-align:center"><div style="font-size:10px;color:var(--text2);margin-bottom:3px">ALL TIME</div><div style="font-size:18px;font-weight:800;color:var(--purple,#9C27B0)">₹'+totalEarn+'</div><div style="font-size:10px;color:var(--text3)">'+orders.length+' total</div></div>'
      + '<div style="background:var(--bg3);border-radius:10px;padding:10px;text-align:center"><div style="font-size:10px;color:var(--text2);margin-bottom:3px">ONLINE</div><div style="font-size:18px;font-weight:800;color:#80CBC4">'+onlineTimeStr+'</div><div style="font-size:10px;color:var(--text3)">today</div></div>'
      + '</div>'
      + incHtml
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">'
      + '<span class="status-pill '+(isOn?'sp-online':'sp-offline')+'">'+r.status+'</span>'
      + (active.length ? '<span style="font-size:12px;color:var(--orange)">📦 On delivery: #'+active[0].id.slice(-6).toUpperCase()+' → '+esc(active[0].customerName||'—')+'</span>' : '<span style="font-size:12px;color:var(--text3)">No active order</span>')
      + '</div>'
      + '<div style="margin-bottom:16px"><div style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">📍 Live Location</div>'+liveLocHtml+'</div>'
      + '<div><div style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">📅 Recent Deliveries</div>'+histHtml+'</div>';

  } catch(e) {
    const el = document.getElementById('rd-detail-body');
    if (el) el.innerHTML = '<p style="color:var(--red)">Error: '+esc(e.message)+'</p>';
  }
}
window.openRiderDetail = openRiderDetail;

async function toggleRainBonus(riderId, currentlyOn) {
  const newVal = !currentlyOn;
  try {
    await window.db.collection('riders').doc(riderId).update({ rainBonusActive: newVal });
    // Also toggle global RTDB flag
    if (window.rtdb) window.rtdb.ref('incentives/rain').set({ active: newVal, updatedAt: Date.now() });
    toast('🌧️ Rain bonus '+(newVal?'ACTIVATED':'deactivated')+' for rider', newVal?'success':'info');
  } catch(e) { toast('Error: '+e.message,'error'); }
}
window.toggleRainBonus = toggleRainBonus;

// ─── MANUAL ORDER (for testing Rapido flow) ───────────────────────────
function openManualOrder() {
  showModal('<h3>📦 Place Manual Order</h3>'
    + '<p style="font-size:12px;color:var(--text2);margin-bottom:16px">This order will be visible to ALL online riders. First to accept gets it.</p>'
    + '<div class="form-group"><label>Customer Name</label><input id="mo-name" placeholder="Test Customer"></div>'
    + '<div class="form-group"><label>Phone</label><input id="mo-phone" type="tel" placeholder="10-digit number" maxlength="10"></div>'
    + '<div class="form-group"><label>Address</label><textarea id="mo-addr" placeholder="Full delivery address" rows="2"></textarea></div>'
    + '<div class="form-row"><div class="form-group"><label>Total Amount (₹)</label><input id="mo-total" type="number" value="150"></div>'
    + '<div class="form-group"><label>Delivery Charge (₹)</label><input id="mo-del" type="number" value="20"></div></div>'
    + '<div class="form-group"><label>Items (one per line)</label><textarea id="mo-items" placeholder="Tomato 1kg\nOnion 500g\nMilk 1L" rows="3"></textarea></div>'
    + '<div style="background:rgba(0,230,118,.08);border:1px solid rgba(0,230,118,.2);border-radius:10px;padding:12px;margin-bottom:14px;font-size:12px;color:var(--text2);line-height:1.6">'
    + '🚨 <strong>How it works:</strong><br>'
    + '1. Order created with status = <code>packing</code><br>'
    + '2. All online riders see it in "Available Orders"<br>'
    + '3. First rider to tap Accept gets it<br>'
    + '4. Order moves to their "My Orders" section<br>'
    + '5. Other riders can\'t see it anymore'
    + '</div>'
    + '<div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveManualOrder()">Place Order</button></div>'
  );
}
window.openManualOrder = openManualOrder;

// ─── DIRECT ASSIGN (pick order + rider from lists) ───────────
// ── ADMIN MANUAL ASSIGN ──────────────────────────────
// Admin picks an existing packing order + picks a rider → assigns directly
// This replaces the wrong "fill a form" approach

window.openAssignOrder = function() {
  var packingOrders = (window._allOrders || []).filter(function(o){
    return o.status === 'packing' && !o.assignedRider;
  });

  if (!packingOrders.length) {
    toast('No unassigned orders right now. Orders appear here when customers place them.', 'info');
    return;
  }

  var allRiders = window._allRiders || [];
  var online  = allRiders.filter(function(r){ return r.status === 'online' || r.status === 'busy'; });
  var offline = allRiders.filter(function(r){ return r.status !== 'online' && r.status !== 'busy'; });

  function orderCard(o) {
    var ts = o.createdAt && o.createdAt.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || 0);
    var timeStr = isNaN(ts) ? '' : ts.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'});
    return '<div class="rider-option" onclick="_selMOrder(this,\'' + o.id + '\')">'
      + '<div style="flex:1">'
        + '<div style="font-size:13px;font-weight:700">#' + o.id.slice(-6).toUpperCase() + ' &mdash; ' + esc(o.customerName || '&mdash;') + '</div>'
        + '<div style="font-size:11px;color:var(--text2)">' + esc(o.customerPhone || '') + ' &middot; &#8377;' + (o.totalPrice || 0) + ' &middot; ' + timeStr + '</div>'
        + '<div style="font-size:11px;color:var(--text2);margin-top:2px">&#128205; ' + esc((o.address || '').slice(0, 50)) + '</div>'
      + '</div>'
    + '</div>';
  }

  function riderCard(r) {
    var isOn = r.status === 'online' || r.status === 'busy';
    return '<div class="rider-option" onclick="_selMRider(this,\'' + r.id + '\',\'' + esc(r.name) + '\',\'' + r.phone + '\')">'
      + '<div class="rider-ava" style="background:' + (isOn ? 'var(--green)' : 'var(--bg4)') + ';color:' + (isOn ? '#000' : 'var(--text2)') + '">' + r.name[0].toUpperCase() + '</div>'
      + '<div style="flex:1"><div style="font-size:13px;font-weight:600">' + esc(r.name) + '</div><div style="font-size:11px;color:var(--text2)">' + r.phone + '</div></div>'
      + '<span class="status-pill ' + (isOn ? 'sp-online' : 'sp-offline') + '">' + r.status + '</span>'
    + '</div>';
  }

  var html = '<h3>&#128692; Assign Order to Rider</h3>'
    + '<div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Step 1 — Select Order (' + packingOrders.length + ' waiting)</div>'
    + packingOrders.map(orderCard).join('')
    + '<div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin:14px 0 8px">Step 2 — Select Rider</div>'
    + (online.length
        ? '<div style="font-size:11px;color:var(--green);font-weight:700;margin-bottom:6px">&#128994; Online (' + online.length + ')</div>' + online.map(riderCard).join('')
        : '<p style="font-size:12px;color:var(--text2);margin-bottom:8px">No riders online right now</p>')
    + (offline.length
        ? '<div style="font-size:11px;color:var(--text3);font-weight:700;margin:10px 0 6px">&#9899; Offline</div>' + offline.map(riderCard).join('')
        : '')
    + '<div id="ma-err" style="color:var(--red);font-size:12px;min-height:18px;margin-top:10px"></div>'
    + '<div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="doManualAssign()">&#9989; Assign Now</button></div>';

  showModal(html);
  window._maOrderId = null;
  window._maRiderId = null;
  window._maRiderName = null;
  window._maRiderPhone = null;
};

window._selMOrder = function(el, orderId) {
  document.querySelectorAll('.rider-option').forEach(function(e) {
    if (e.getAttribute('onclick') && e.getAttribute('onclick').indexOf('_selMOrder') > -1) {
      e.classList.remove('sel');
    }
  });
  el.classList.add('sel');
  window._maOrderId = orderId;
};

window._selMRider = function(el, riderId, riderName, riderPhone) {
  document.querySelectorAll('.rider-option').forEach(function(e) {
    if (e.getAttribute('onclick') && e.getAttribute('onclick').indexOf('_selMRider') > -1) {
      e.classList.remove('sel');
    }
  });
  el.classList.add('sel');
  window._maRiderId = riderId;
  window._maRiderName = riderName;
  window._maRiderPhone = riderPhone;
};

window.doManualAssign = async function() {
  var err = document.getElementById('ma-err');
  if (!window._maOrderId)  { if (err) err.textContent = 'Please select an order first'; return; }
  if (!window._maRiderId)  { if (err) err.textContent = 'Please select a rider'; return; }
  try {
    await window.db.collection('orders').doc(window._maOrderId).update({
      status: 'assigned',
      assignedRider: window._maRiderId,
      riderPhone: window._maRiderPhone,
      riderName: window._maRiderName,
      assignedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    closeModal();
    toast('&#9989; Order assigned to ' + window._maRiderName, 'success');
  } catch(e) {
    if (err) err.textContent = 'Error: ' + e.message;
  }
};

async function saveManualOrder() {
  const name  = (document.getElementById('mo-name')||{}).value?.trim();
  const phone = (document.getElementById('mo-phone')||{}).value?.trim();
  const addr  = (document.getElementById('mo-addr')||{}).value?.trim();
  const total = parseFloat((document.getElementById('mo-total')||{}).value) || 150;
  const del   = parseFloat((document.getElementById('mo-del')||{}).value) || 20;
  const itemsRaw = (document.getElementById('mo-items')||{}).value?.trim() || '';
  
  if (!name || !phone || !addr) { toast('Fill name, phone, address','error'); return; }
  if (!/^[6-9]\d{9}$/.test(phone)) { toast('Invalid phone','error'); return; }
  
  const itemsArr = itemsRaw.split('\n').filter(Boolean).map((line, i) => ({
    id: Date.now() + i,
    name: line.trim(),
    qty: 1,
    cost: Math.round((total - del) / Math.max(1, itemsRaw.split('\n').filter(Boolean).length))
  }));
  
  if (!itemsArr.length) { toast('Add at least one item','error'); return; }
  
  try {
    await window.db.collection('orders').add({
      customerName: name,
      customerPhone: phone,
      address: addr,
      items: itemsArr,
      totalPrice: total,
      deliveryCharge: del,
      status: 'packing',
      source: 'manual_admin',
      assignedRider: null,
      riderName: null,
      riderPhone: null,
      latitude: null,
      longitude: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    closeModal();
    toast('✅ Manual order placed! All online riders can see it now.','success');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}
window.saveManualOrder = saveManualOrder;

function openAddRider() {
  showModal('<h3>➕ Add New Rider</h3>'
    + '<div class="form-group"><label>Full Name</label><input id="nr-name" placeholder="Rider full name"></div>'
    + '<div class="form-group"><label>Phone Number</label><input id="nr-phone" type="tel" placeholder="10-digit mobile" maxlength="10"></div>'
    + '<div class="form-group"><label>Bike Number</label><input id="nr-bike" placeholder="e.g. TS09 AB 1234"></div>'
    + '<div style="background:rgba(12,139,74,.08);border:1px solid rgba(12,139,74,.2);border-radius:10px;padding:12px;margin-bottom:14px;font-size:12px;color:var(--text2);line-height:1.6">'
    + '📲 <strong>Share invite link with rider:</strong><br>'
    + '<span style="font-family:monospace;font-size:11px;color:var(--green)">'+window.location.origin+'/rider.html</span>'
    + '</div>'
    + '<div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveNewRider()">Add Rider</button></div>'
  );
}
window.openAddRider = openAddRider;

async function saveNewRider() {
  const name  = (document.getElementById('nr-name')||{}).value?.trim();
  const phone = (document.getElementById('nr-phone')||{}).value?.trim();
  const bike  = (document.getElementById('nr-bike')||{}).value?.trim()||'';
  if (!name || !phone || !/^[6-9]\d{9}$/.test(phone)) { toast('Fill name + valid phone','error'); return; }
  const existing = await window.db.collection('riders').where('phone','==',phone).limit(1).get().catch(()=>({empty:true}));
  if (!existing.empty) {
    const doc = existing.docs[0];
    if (doc.data().isActive === false) {
      // Rider was soft-deleted — restore them
      await doc.ref.update({
        name, bikeNumber: bike, isActive: true,
        status: 'offline',
        todayEarnings:0, weekEarnings:0,
        todayDeliveries:0,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(()=>{ closeModal(); toast('✅ Rider restored and re-activated!','success'); })
        .catch(e=>toast(e.message,'error'));
      return;
    }
    toast('Rider with this phone already exists and is active','error'); return;
  }
  await window.db.collection('riders').add({
    name, phone, bikeNumber: bike, status:'offline',
    todayEarnings:0, weekEarnings:0, totalEarnings:0,
    deliveriesCompleted:0, todayDeliveries:0, weekDeliveries:0,
    rating:4.5, isActive:true, rainBonusActive:false,
    todayOnlineSecs:0,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(()=>{ closeModal(); toast('✅ Rider added! Share the app link to invite them.','success'); })
    .catch(e=>toast(e.message,'error'));
}
window.saveNewRider = saveNewRider;

async function removeRider(id) {
  if (!confirm('Remove this rider?')) return;
  await window.db.collection('riders').doc(id).update({ isActive:false })
    .then(()=>toast('Rider removed','info')).catch(e=>toast(e.message,'error'));
}
window.removeRider = removeRider;

// ─── RESTORE DEACTIVATED RIDERS ──────────────────────────────
async function restoreAllDeactivatedRiders() {
  if (!confirm('⚠️ This will restore ALL deactivated riders to isActive=true. Continue?')) return;
  toast('⏳ Restoring deactivated riders...','info');
  try {
    const snap = await window.db.collection('riders').where('isActive','==',false).get();
    if (snap.empty) { toast('✅ No deactivated riders found','success'); return; }
    let restored = 0;
    const batch = window.db.batch();
    snap.docs.forEach(doc => {
      batch.update(doc.ref, { isActive: true });
      restored++;
    });
    await batch.commit();
    toast(`✅ Restored ${restored} riders! They can now login.`,'success');
  } catch(e) { toast('❌ Error: '+e.message,'error'); }
}
window.restoreAllDeactivatedRiders = restoreAllDeactivatedRiders;

// ─── CHECK DEACTIVATED RIDERS ───────────────────────────────
async function checkDeactivatedRiders() {
  try {
    const snap = await window.db.collection('riders').where('isActive','==',false).get();
    if (snap.empty) {
      toast('✅ No deactivated riders','success');
      alert('Good news! No riders are currently deactivated.');
      return;
    }
    let msg = `Found ${snap.size} DEACTIVATED riders:\n\n`;
    snap.docs.forEach(doc => {
      const r = doc.data();
      msg += `• ${r.name||'Unknown'} (${r.phone})\n`;
    });
    msg += '\n🔧 Run: window.restoreAllDeactivatedRiders() to restore all';
    alert(msg);
  } catch(e) { toast('Error: '+e.message,'error'); }
}
window.checkDeactivatedRiders = checkDeactivatedRiders;

// ─── RIDERS ACTIVITY SUMMARY ─────────────────────────────────
function updateRidersActivityRow() {
  const online = _allRiders.filter(r=>r.status==='online').length;
  const busy   = _allRiders.filter(r=>r.status==='busy').length;
  const earn   = _allRiders.reduce((s,r)=>s+(r.todayEarnings||0),0);
  const orders = _allRiders.reduce((s,r)=>s+(r.todayDeliveries||0),0);
  const raOnline=document.getElementById('ra-online');
  const raBusy=document.getElementById('ra-busy');
  const raEarn=document.getElementById('ra-earn');
  const raOrders=document.getElementById('ra-orders');
  if(raOnline)raOnline.textContent=online;
  if(raBusy)raBusy.textContent=busy;
  if(raEarn)raEarn.textContent='₹'+earn;
  if(raOrders)raOrders.textContent=orders;
}
window.updateRidersActivityRow = updateRidersActivityRow;

// ─── GLOBAL RAIN INCENTIVE TOGGLE ───────────────────────────
async function toggleGlobalRain() {
  // Wait for RTDB if not ready
  if (!window.rtdb) {
    toast('Connecting to database...','info');
    let tries = 0;
    while (!window.rtdb && tries < 20) {
      await new Promise(r => setTimeout(r, 300));
      tries++;
    }
    if (!window.rtdb) { toast('❌ Database not ready. Refresh and try again.','error'); return; }
  }
  try {
    const snap = await window.rtdb.ref('incentives/rain').once('value');
    const current = !!(snap.val() && snap.val().active);
    const newVal = !current;
    await window.rtdb.ref('incentives/rain').set({ active: newVal, updatedAt: Date.now() });
    const raRain = document.getElementById('ra-rain');
    if (raRain) { raRain.textContent = newVal ? '🌧️ ON' : 'Off'; raRain.style.color = newVal ? '#1565C0' : 'var(--text2)'; }
    // Update button text in riders page header
    const rainBtn = document.getElementById('rain-toggle-btn');
    if (rainBtn) {
      rainBtn.textContent = newVal ? '🌧️ Rain: ON — Click to OFF' : '🌧️ Rain Incentive';
      rainBtn.style.background = newVal ? 'rgba(21,101,192,.25)' : 'rgba(21,101,192,.12)';
      rainBtn.style.color = newVal ? '#1565C0' : '#1565C0';
      rainBtn.style.border = newVal ? '1.5px solid #1565C0' : '1px solid rgba(21,101,192,.2)';
    }
    toast('🌧️ Rain incentive ' + (newVal ? 'ACTIVATED — +₹10/order for all riders!' : 'deactivated'), newVal ? 'success' : 'info');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}
window.toggleGlobalRain = toggleGlobalRain;

// Check rain status on load
function checkRainStatus() {
  if (!window.rtdb) { setTimeout(checkRainStatus, 500); return; }
  window.rtdb.ref('incentives/rain').on('value', snap => {
    const active = !!(snap && snap.val() && snap.val().active);
    const raRain = document.getElementById('ra-rain');
    if (raRain) { raRain.textContent = active ? '🌧️ ON' : 'Off'; raRain.style.color = active ? '#1565C0' : 'var(--text2)'; }
    const rainBtn = document.getElementById('rain-toggle-btn');
    if (rainBtn) {
      rainBtn.textContent = active ? '🌧️ Rain: ON — Click to OFF' : '🌧️ Rain Incentive';
      rainBtn.style.background = active ? 'rgba(21,101,192,.25)' : 'rgba(21,101,192,.12)';
      rainBtn.style.border = active ? '1.5px solid #1565C0' : '1px solid rgba(21,101,192,.2)';
    }
  });
}

// ─── ACTIVE CATEGORY FILTER ─────────────────────────────────
let _activeProdCat = '';

function renderCatPills() {
  const el = document.getElementById('prod-cat-pills');
  if (!el) return;
  // Build unique categories from actual products
  const cats = [...new Set((_allProducts||[]).map(p=>(p.category||'').toUpperCase()).filter(Boolean))].sort();
  const catLabels = {
    VEGETABLES:'🥦 Vegetables', LEAFY:'🌿 Leafy', FRUITS:'🍎 Fruits',
    DAIRY:'🥛 Dairy', GRAINS:'🌾 Grains', DALS:'🫘 Dals',
    OILS:'🫙 Oils', SPICES:'🌶 Spices', SNACKS:'🍿 Snacks',
    CHOCOLATES:'🍫 Chocolates', DRINKS:'🥤 Drinks', NONVEG:'🍗 Non-Veg',
    EASYCOOK:'🍳 Easy Cook', PERSONALCARE:'🧴 Personal Care',
    CLEANING:'🧹 Cleaning', PUJA:'🪔 Puja',
    PANSHOP:'🚬 Pan Shop', COMBOS:'🎁 Combos',
  };
  el.innerHTML = `<button onclick="setProdCat('')" style="padding:6px 14px;border-radius:20px;border:1px solid ${_activeProdCat===''?'var(--green)':'var(--border)'};background:${_activeProdCat===''?'var(--green)':'transparent'};color:${_activeProdCat===''?'#000':'var(--text2)'};font-family:var(--font);font-size:12px;font-weight:600;cursor:pointer">All</button>`
    + cats.map(c=>`<button onclick="setProdCat('${c}')" style="padding:6px 14px;border-radius:20px;border:1px solid ${_activeProdCat===c?'var(--green)':'var(--border)'};background:${_activeProdCat===c?'var(--green)':'transparent'};color:${_activeProdCat===c?'#000':'var(--text2)'};font-family:var(--font);font-size:12px;font-weight:600;cursor:pointer">${catLabels[c]||c}</button>`).join('');
}

function setProdCat(cat) {
  _activeProdCat = cat;
  renderCatPills();
}
window.setProdCat = setProdCat;

// ═══════════════════════════════════════════════════════════════
// PRODUCTS PAGE
// ═══════════════════════════════════════════════════════════════
function renderProductsPage() {
  const tbody = document.getElementById('products-tbody');
  if (!tbody) return;

  // Rebuild pills whenever products load
  renderCatPills();

  const search = (document.getElementById('prod-search')||{}).value||'';
  const dropdownCat = (document.getElementById('prod-cat-filter')||{}).value||'';
  let list = (_allProducts || []).filter(p => !p.hidden);

  // Filter by dropdown category
  if (dropdownCat) {
    list = list.filter(p => (p.category||'').toUpperCase() === dropdownCat.toUpperCase());
  }

  // Filter by active category pill (legacy support)
  if (_activeProdCat && !dropdownCat) {
    list = list.filter(p => (p.category||'').toUpperCase() === _activeProdCat);
  }

  // Filter by search
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(p => (p.name||'').toLowerCase().includes(q) || (p.teluguName||'').toLowerCase().includes(q));
  }

  // Show count
  const countEl = document.getElementById('prod-count');
  if (countEl) countEl.textContent = list.length + ' item' + (list.length !== 1 ? 's' : '');

  if (!list.length) {
    tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text2)">'
      + (search || dropdownCat ? 'No products found' : '⏳ Loading products...')
      + '</td></tr>';
    return;
  }
  
  // Render products
  tbody.innerHTML = list.map(p=>{
    const st = p.stock||0;
    const sc = st===0?'sp-out':st<10?'sp-low':'sp-ok';
    const stxt = st===0?'Out of Stock':st<10?'⚠ Low':'✓ OK';
    const _rawImg = p.img||'';
    const imgUrl = (_rawImg.startsWith('http') && !_rawImg.includes('google.com') && !_rawImg.includes('search?')) ? _rawImg : (_rawImg.replace(/^\.\//,'').replace(/^images\//,'') ? 'images/'+_rawImg.replace(/^\.\//,'').replace(/^images\//,'') : 'images/nektaIcon.svg');
    const docId = p._docId||'';
    return '<tr>'
      + '<td><input type="checkbox" class="prod-chk" data-docid="'+docId+'" data-name="'+esc(p.name||'')+'" data-seed="'+(docId?'0':'1')+'" style="cursor:pointer;width:15px;height:15px" onchange="updateBulkButtons()"></td>'
      + '<td><div style="display:flex;align-items:center;gap:10px">'
      +   '<img src="'+imgUrl+'" onerror="this.src=\'images/nektaIcon.svg\'" style="width:44px;height:44px;border-radius:10px;object-fit:cover;background:var(--bg3);flex-shrink:0">'
      +   '<div><div style="font-weight:600;font-size:13px">'+esc(p.name||'')+'</div>'
      +   '<div style="font-size:11px;color:var(--text2)">'+esc(p.unit||'')+'</div></div>'
      + '</div></td>'
      + '<td style="font-size:12px">'+esc(p.category||'UNCATEGORIZED')+'</td>'
      + '<td style="font-family:var(--mono)">₹'+(p.price||0)+'</td>'
      + '<td style="font-family:var(--mono)">'+(p.halfPrice?'₹'+p.halfPrice:'—')+'</td>'
      + '<td style="font-family:var(--mono);color:'+(st<10?'var(--red)':'var(--green)')+'">'+st+'</td>'
      + '<td><span class="status-pill '+sc+'">'+stxt+'</span></td>'
      + '<td><div style="display:flex;gap:5px"><button class="btn-sm bg-blue" onclick="openEditProduct(\''+p.id+'\')">Edit</button><button class="btn-sm bg-red" onclick="deleteProduct(\''+docId+'\','+JSON.stringify(p.name||'')+')" style="font-size:11px">Del</button></div></td>'
      + '</tr>';
  }).join('');
}
window.filterProducts = renderProductsPage;

function openAddProduct() {
  const catOpts = (window._allCategories || [
    'VEGETABLES','LEAFY','FRUITS','DAIRY','GRAINS','DALS','OILS','SPICES',
    'CONDIMENTS','PICKLES','SNACKS','CHOCOLATES','ICECREAMS','DRINKS',
    'NONVEG','COMBOS','EASYCOOK','PERSONALCARE','CLEANING','PUJA','PANSHOP'
  ]).map(c => '<option value="'+c+'">'+c+'</option>').join('');

  showModal('<h3>&#10133; Add Product</h3>'
    // Row 1: Name + Telugu Name
    + '<div class="form-row">'
    +   '<div class="form-group"><label>Name *</label><input id="pm-name" placeholder="e.g. Tomato (Local)"></div>'
    +   '<div class="form-group"><label>Telugu Name</label><input id="pm-tel" placeholder="e.g. &#3335;&#3374;&#3390;&#3335;"></div>'
    + '</div>'
    // Row 2: Category + Unit
    + '<div class="form-row">'
    +   '<div class="form-group"><label>Category *</label><select id="pm-cat" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text);font-family:var(--font)">'+catOpts+'</select></div>'
    +   '<div class="form-group"><label>Unit *</label><input id="pm-unit" placeholder="e.g. Kg, Pack, Pc, Bunch"></div>'
    + '</div>'
    // Helper text for prices
    + '<div style="background:rgba(100,200,255,.1);border:1px solid rgba(100,200,255,.3);border-radius:8px;padding:10px;margin:10px 0;font-size:12px;color:var(--text2)">'
    + '💡 <strong>Fill only what you need:</strong><br>Price (1kg) = Required | Half Price (500g) = Optional | Quarter Price (250g) = Optional'
    + '</div>'
    // Row 3: Price + Half Price + Quarter Price
    + '<div class="form-row">'
    +   '<div class="form-group"><label>Price &#8377; (1kg) *</label><input id="pm-price" type="number" min="0" placeholder="65"></div>'
    +   '<div class="form-group"><label>Half Price &#8377; (500g)</label><input id="pm-half" type="number" min="0" placeholder="35"></div>'
    +   '<div class="form-group"><label>Quarter Price &#8377; (250g)</label><input id="pm-quarter" type="number" min="0" placeholder="20"></div>'
    + '</div>'
    // Row 4: Slashed Price + Stock + Brand
    + '<div class="form-row">'
    +   '<div class="form-group"><label>Slashed Price &#8377;</label><input id="pm-slash" type="number" min="0" placeholder="MRP e.g. 80"></div>'
    +   '<div class="form-group"><label>Stock</label><input id="pm-stock" type="number" min="0" value="100"></div>'
    +   '<div class="form-group"><label>Brand</label><input id="pm-brand" placeholder="e.g. Amul, Tata"></div>'
    + '</div>'
    // Row 5: Barcode
    + '<div class="form-group"><label>Barcode / SKU</label><input id="pm-barcode" placeholder="e.g. 8901030567475 (optional)"></div>'
    // Row 6: Image
    + '<div class="form-group"><label>Image Filename or URL</label><input id="pm-img" placeholder="Tomato.jpg or https://..."></div>'
    // Row 7: Description
    + '<div class="form-group"><label>Description</label><textarea id="pm-desc" placeholder="Short product description..." rows="2"></textarea></div>'
    // Row 8: Out of Stock toggle
    + '<div class="form-group"><label>Status</label><select id="pm-oos" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text);font-family:var(--font)"><option value="false">&#9989; In Stock</option><option value="true">&#128308; Out of Stock</option></select></div>'
    + '<div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveNewProduct()">&#10133; Add Product</button></div>'
  );
}
window.openAddProduct = openAddProduct;

async function saveNewProduct() {
  const name  = (document.getElementById('pm-name')||{}).value?.trim();
  const cat   = (document.getElementById('pm-cat')||{}).value;
  const priceVal = (document.getElementById('pm-price')||{}).value?.trim();
  const halfVal  = (document.getElementById('pm-half')||{}).value?.trim();
  const quarterVal = (document.getElementById('pm-quarter')||{}).value?.trim();
  const slashVal = (document.getElementById('pm-slash')||{}).value?.trim();
  const unit  = (document.getElementById('pm-unit')||{}).value?.trim()||'';
  const stockVal = (document.getElementById('pm-stock')||{}).value?.trim();
  const img   = (document.getElementById('pm-img')||{}).value?.trim()||'';
  const desc  = (document.getElementById('pm-desc')||{}).value?.trim()||'';
  
  if (!name || !priceVal) { toast('Name and price required','error'); return; }
  
  const price = parseFloat(priceVal);
  const stock = stockVal ? parseInt(stockVal) : 100;
  
  if (isNaN(price)) { toast('Invalid price','error'); return; }
  if (isNaN(stock)) { toast('Invalid stock','error'); return; }
  
  const newId = Date.now();
  const resolvedImg = img ? (img.startsWith('http') ? img : './images/' + img.replace(/^\.?\/?images\/?/,'')) : '';
  const productData = { 
    id: newId, 
    name, 
    category: cat, 
    price, 
    unit, 
    stock, 
    img: resolvedImg, 
    description: desc, 
    outOfStock: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  // Only include halfPrice if provided
  if (halfVal) {
    const half = parseFloat(halfVal);
    if (!isNaN(half)) productData.halfPrice = half;
  }
  
  // Only include quarterPrice if provided
  if (quarterVal) {
    const quarter = parseFloat(quarterVal);
    if (!isNaN(quarter)) productData.quarterPrice = quarter;
  }
  
  // Only include slashedPrice if provided
  if (slashVal) {
    const slash = parseFloat(slashVal);
    if (!isNaN(slash)) productData.slashedPrice = slash;
  }
  
  await window.db.collection('products').add(productData)
    .then(()=>{ closeModal(); toast('✅ Product added successfully','success'); loadAllProducts(); renderInventory(); loadInventoryStats(); })
    .catch(e=>toast('Error: '+e.message,'error'));
}
window.saveNewProduct = saveNewProduct;

function openEditProduct(pid) {
  const p = _allProducts.find(x=>x.id==pid);
  if (!p) return;
  const catOpts = (window._allCategories || ['VEGETABLES','LEAFY','FRUITS','DAIRY','GRAINS','DALS','OILS','SPICES','CONDIMENTS','PICKLES','SNACKS','CHOCOLATES','ICECREAMS','DRINKS','NONVEG','COMBOS','EASYCOOK','PERSONALCARE','CLEANING','PUJA','PANSHOP'])
    .map(c=>'<option value="'+c+'"'+(p.category===c?' selected':'')+'>'+c+'</option>').join('');
  showModal('<h3>✏️ Edit: '+esc(p.name)+'</h3>'
    + '<div class="form-row"><div class="form-group"><label>Name</label><input id="ep-name" value="'+esc(p.name||'')+'"></div>'
    + '<div class="form-group"><label>Telugu Name</label><input id="ep-tel" value="'+esc(p.teluguName||'')+'"></div></div>'
    + '<div class="form-row"><div class="form-group"><label>Category</label><select id="ep-cat" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text);font-family:var(--font)">'+catOpts+'</select></div>'
    + '<div class="form-group"><label>Unit</label><input id="ep-unit" value="'+esc(p.unit||'')+'"></div></div>'
    + '<div style="background:rgba(100,200,255,.1);border:1px solid rgba(100,200,255,.3);border-radius:8px;padding:10px;margin:10px 0;font-size:12px;color:var(--text2)">'
    + '💡 <strong>Fill only what you need:</strong><br>Price (1kg) = Required | Half Price (500g) = Optional | Quarter Price (250g) = Optional'
    + '</div>'
    + '<div class="form-row"><div class="form-group"><label>Price (1kg)</label><input id="ep-price" type="number" placeholder="Required" value="'+(p.price||0)+'"></div>'
    + '<div class="form-group"><label>Half Price (500g)</label><input id="ep-half" type="number" placeholder="Optional" value="'+(p.halfPrice||'')+'"></div></div>'
    + '<div class="form-row"><div class="form-group"><label>Quarter Price (250g)</label><input id="ep-quarter" type="number" placeholder="Optional" value="'+(p.quarterPrice||'')+'"></div>'
    + '<div class="form-group"><label>Slashed Price</label><input id="ep-slash" type="number" placeholder="For discount %" value="'+(p.slashedPrice||'')+'"></div></div>'
    + '<div class="form-row"><div class="form-group"><label>Stock</label><input id="ep-stock" type="number" value="'+(p.stock||0)+'"></div>'
    + '<div class="form-group"><label>Out of Stock</label><select id="ep-oos" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text)">'
    + '<option value="false"'+(p.outOfStock?'':' selected')+'>In Stock</option>'
    + '<option value="true"'+(p.outOfStock?' selected':'')+'>Out of Stock</option>'
    + '</select></div></div>'
    + '<div class="form-group"><label>Image URL or Filename</label><input id="ep-img" placeholder="https://... or Tomato.jpg" value="'+esc((p.img||'').startsWith('http') ? (p.img||'') : (p.img||'').replace('./images/',''))+'"></div>'
    + '<div class="form-group"><label>Description</label><textarea id="ep-desc">'+esc(p.description||'')+'</textarea></div>'
    + '<div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveEditProduct('+pid+')">💾 Save</button></div>'
  );
}
window.openEditProduct = openEditProduct;

async function saveEditProduct(pid) {
  const name     = (document.getElementById('ep-name')||{}).value?.trim();
  const telugu   = (document.getElementById('ep-tel')||{}).value?.trim();
  const cat      = (document.getElementById('ep-cat')||{}).value;
  const unit     = (document.getElementById('ep-unit')||{}).value?.trim();
  const priceVal = (document.getElementById('ep-price')||{}).value?.trim();
  const halfVal  = (document.getElementById('ep-half')||{}).value?.trim();
  const quarterVal = (document.getElementById('ep-quarter')||{}).value?.trim();
  const stockVal = (document.getElementById('ep-stock')||{}).value?.trim();
  const slashVal = (document.getElementById('ep-slash')||{}).value?.trim();
  const imgVal   = (document.getElementById('ep-img')||{}).value?.trim();
  const desc     = (document.getElementById('ep-desc')||{}).value?.trim();
  const oos      = document.getElementById('ep-oos').value === 'true';

  if (!name) { toast('Name is required','error'); return; }
  const price = parseFloat(priceVal);
  const stock = parseInt(stockVal);
  if (isNaN(price) || price <= 0) { toast('Invalid price','error'); return; }

  const update = { name, category: cat, unit, price, stock: isNaN(stock)?0:stock, outOfStock: oos, description: desc };
  if (telugu) update.teluguName = telugu;
  if (imgVal) update.img = imgVal.startsWith('http') ? imgVal : './images/' + imgVal.replace(/^\.?\/?images\/?/,'');
  if (halfVal) { const h = parseFloat(halfVal); if (!isNaN(h)) update.halfPrice = h; } else { update.halfPrice = null; }
  if (quarterVal) { const q = parseFloat(quarterVal); if (!isNaN(q)) update.quarterPrice = q; } else { update.quarterPrice = null; }
  if (slashVal) { const s = parseFloat(slashVal); if (!isNaN(s)) update.slashedPrice = s; } else { update.slashedPrice = null; }

  const ovRef = window.db.collection('app_overrides').doc('products');
  await ovRef.set({ [String(pid)]: update }, { merge:true }).catch(e=>toast('Update failed: '+e.message,'error'));
  const p = _allProducts.find(x=>x.id==pid);
  if (p && p._docId) {
    await window.db.collection('products').doc(p._docId).update(update).catch(()=>{});
  }
  closeModal();
  toast('✅ Product updated','success');
  loadAllProducts(); renderInventory(); loadInventoryStats();
}
window.saveEditProduct = saveEditProduct;

async function deleteProduct(docId, productName) {
  if (!docId) {
    // Seed product — hide it via app_overrides instead
    if (!confirm('"'+productName+'" is a built-in product.\nClick OK to HIDE it from the catalog (customers won\'t see it).')) return;
    const p = (_allProducts||[]).find(x=>(x.name||'')===(productName||''));
    if (!p) { toast('Product not found','error'); return; }
    try {
      await window.db.collection('app_overrides').doc('products')
        .set({ [String(p.id)]: { outOfStock: true, hidden: true } }, { merge: true });
      toast('✅ "'+productName+'" hidden from catalog','success');
      loadAllProducts(); renderInventory(); loadInventoryStats();
    } catch(e) { toast('Failed: '+e.message,'error'); }
    return;
  }
  if (!confirm('Delete "'+productName+'"? This cannot be undone.')) return;
  try {
    await window.db.collection('products').doc(docId).delete();
    // Also remove from app_overrides
    const p = (_allProducts||[]).find(x=>x._docId===docId);
    if (p) {
      await window.db.collection('app_overrides').doc('products')
        .set({ [String(p.id)]: { hidden: true } }, { merge: true }).catch(()=>{});
    }
    toast('✅ "'+productName+'" deleted','success');
    loadAllProducts(); renderInventory(); loadInventoryStats();
  } catch(e) {
    toast('Delete failed: '+e.message,'error');
  }
}
window.deleteProduct = deleteProduct;

// ─── BULK ACTIONS ─────────────────────────────────────────
function updateBulkButtons() {
  const selected = document.querySelectorAll('.prod-chk:checked').length;
  const delBtn = document.getElementById('bulk-delete-btn');
  const arcBtn = document.getElementById('bulk-archive-btn');
  if (delBtn) {
    delBtn.style.display = selected > 0 ? 'inline-flex' : 'none';
    if (selected > 0) delBtn.textContent = '🗑 Delete ' + selected;
  }
  if (arcBtn) {
    arcBtn.style.display = selected > 0 ? 'inline-flex' : 'none';
    if (selected > 0) arcBtn.textContent = '📦 Archive ' + selected;
  }
  // Update or create the selection count label next to the buttons
  let countLabel = document.getElementById('bulk-count-label');
  if (!countLabel && selected > 0) {
    countLabel = document.createElement('span');
    countLabel.id = 'bulk-count-label';
    countLabel.style.cssText = 'font-size:12px;font-weight:600;color:var(--green);align-self:center;margin-right:4px';
    const ref = delBtn || arcBtn;
    if (ref && ref.parentNode) ref.parentNode.insertBefore(countLabel, ref);
  }
  if (countLabel) {
    countLabel.style.display = selected > 0 ? 'inline' : 'none';
    if (selected > 0) countLabel.textContent = '✓ ' + selected + ' selected  ';
  }
}
window.updateBulkButtons = updateBulkButtons;

function toggleSelectAllProducts(cb) {
  document.querySelectorAll('.prod-chk').forEach(c => { c.checked = cb.checked; });
  updateBulkButtons();
}
window.toggleSelectAllProducts = toggleSelectAllProducts;

async function doBulkDelete() {
  const selected = Array.from(document.querySelectorAll('.prod-chk:checked')).map(c => ({
    docId: c.dataset.docid,
    name: c.dataset.name,
    isSeed: c.dataset.seed === '1'
  }));
  
  if (!selected.length) { toast('No products selected','warning'); return; }
  
  const msg = selected.length === 1 
    ? 'Delete "' + selected[0].name + '"?' 
    : 'Delete ' + selected.length + ' products?';
  
  if (!confirm(msg + ' This cannot be undone.')) return;
  
  const delBtn = document.getElementById('bulk-delete-btn');
  if (delBtn) { delBtn.disabled = true; delBtn.textContent = 'Deleting...'; }
  
  let deleted = 0, failed = 0;
  
  for (const item of selected) {
    if (!item.docId) {
      failed++;
      continue;
    }
    try {
      await window.db.collection('products').doc(item.docId).delete();
      deleted++;
    } catch (e) {
      console.error('Delete failed:', e);
      failed++;
    }
  }
  
  closeModal();
  toast('✅ Deleted ' + deleted + ' product' + (deleted !== 1 ? 's' : '') + (failed > 0 ? ' (' + failed + ' failed)' : ''), deleted > 0 ? 'success' : 'error');
  
  if (delBtn) { delBtn.disabled = false; delBtn.textContent = '🗑 Delete'; }
  document.querySelectorAll('.prod-chk').forEach(c => { c.checked = false; });
  updateBulkButtons();
  loadAllProducts();
}
window.doBulkDelete = doBulkDelete;

async function doBulkArchive() {
  const selected = Array.from(document.querySelectorAll('.prod-chk:checked')).map(c => ({
    docId: c.dataset.docid,
    name: c.dataset.name,
    isSeed: c.dataset.seed === '1'
  }));
  
  if (!selected.length) { toast('No products selected','warning'); return; }
  
  if (!confirm('Archive ' + selected.length + ' product' + (selected.length !== 1 ? 's' : '') + '? They will be hidden from the catalog.')) return;
  
  const arcBtn = document.getElementById('bulk-archive-btn');
  if (arcBtn) { arcBtn.disabled = true; arcBtn.textContent = 'Archiving...'; }
  
  let archived = 0, failed = 0;
  const BATCH = 400;
  
  // Batch update for Firestore products
  for (let i = 0; i < selected.length; i += BATCH) {
    const batch = window.db.batch();
    const batch_items = selected.slice(i, i + BATCH).filter(x => x.docId);
    
    batch_items.forEach(({ docId }) => {
      batch.update(window.db.collection('products').doc(docId), { archived: true });
      archived++;
    });
    
    if (batch_items.length > 0) {
      await batch.commit().catch(e => {
        console.error('Batch error:', e);
        archived -= batch_items.length;
        failed += batch_items.length;
      });
    }
  }
  
  closeModal();
  toast('✅ Archived ' + archived + ' product' + (archived !== 1 ? 's' : '') + (failed > 0 ? ' (' + failed + ' failed)' : ''), archived > 0 ? 'success' : 'error');
  
  if (arcBtn) { arcBtn.disabled = false; arcBtn.textContent = '📦 Archive'; }
  document.querySelectorAll('.prod-chk').forEach(c => { c.checked = false; });
  updateBulkButtons();
  loadAllProducts();
}
window.doBulkArchive = doBulkArchive;

function downloadProductList() {
  const all = window.allProducts || _allProducts || [];
  if (!all.length) { toast('No products to export','warning'); return; }
  const rows=[['ID','Name','Telugu Name','Category','Price (₹)','Half Price (₹)','Stock','Out of Stock']];
  all.forEach(p=>rows.push([p.id,p.name||'',p.teluguName||'',p.category||'',p.price||0,p.halfPrice||'',p.stock||0,p.outOfStock?'Yes':'No']));
  if (typeof saveXlsx === 'function') {
    saveXlsx(rows, 'Stock', 'nekta-stock-'+new Date().toISOString().slice(0,10)+'.xlsx');
  } else {
    const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download='nekta-stock.csv';a.click();
  }
  toast('✅ Exported '+all.length+' products','success');
}
window.downloadProductList = downloadProductList;

// ═══════════════════════════════════════════════════════════════
// STOCK PAGE
// ═══════════════════════════════════════════════════════════════
function filterStock(f) { stockFilter=f; window.stockFilter=f; }

function renderStockFiltered(q) {
  const tbody = document.getElementById('stock-tbody');
  if (!tbody) return;
  const thresh = (_settings.lowStockThreshold||10);
  let list = window.allProducts || _allProducts || [];
  if (stockFilter==='low') list = list.filter(p=>(p.stock||0)<thresh);
  if (q && q.trim()) list = list.filter(p=>(p.name||'').toLowerCase().includes(q.toLowerCase()));
  renderStockRows(list, thresh, tbody);
}
window.renderStockFiltered = renderStockFiltered;

function renderStock() {
  const tbody = document.getElementById('stock-tbody');
  if (!tbody) return;
  const thresh = (_settings.lowStockThreshold||10);
  let list = window.allProducts || _allProducts || [];
  if (stockFilter==='low') list=list.filter(p=>(p.stock||0)<thresh);
  // Also apply search if typed
  const q = (document.getElementById('stock-search-top')||{}).value||'';
  if (q.trim()) list = list.filter(p=>(p.name||'').toLowerCase().includes(q.toLowerCase()));
  renderStockRows(list, thresh, tbody);
}
window.renderStock = renderStock;

function renderStockRows(list, thresh, tbody) {
  if (!list.length) { tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text2)">✅ No items found</td></tr>'; return; }
  tbody.innerHTML = list.map(p=>{
    try {
      const st=p.stock||0;
      const isOOS=p.outOfStock===true;
      const color=isOOS||st===0?'var(--red)':st<thresh?'var(--yellow)':'var(--green)';
      const sc=isOOS||st===0?'out':st<thresh?'low':'ok';
      const stxt=isOOS?'🔴 Out of Stock':st===0?'Out of Stock':st<thresh?'⚠ Low Stock':'✓ In Stock';
      const pct=Math.min(100,(st/Math.max(thresh*2,50))*100);
      const docId=p._docId||'';
      const raw=p.img||'';
      const imgUrl=(raw.startsWith('http')&&!raw.includes('google.com')&&!raw.includes('search?'))
        ? raw
        : (raw.replace(/^\.\//,'').replace(/^images\//,'')
            ? 'images/'+raw.replace(/^\.\//,'').replace(/^images\//,'')
            : 'images/nektaIcon.svg');
      return '<tr style="'+(isOOS?'opacity:.6':'')+'">'
        + '<td><div style="display:flex;align-items:center;gap:10px">'
        +   '<img src="'+imgUrl+'" onerror="this.src=\'images/nektaIcon.svg\'" style="width:44px;height:44px;border-radius:10px;object-fit:cover;background:var(--bg3);flex-shrink:0">'
        +   '<div><div style="font-size:13px;font-weight:600">'+esc(p.name||'')+'</div><div style="font-size:11px;color:var(--text2)">'+esc(p.unit||'')+'</div></div>'
        + '</div></td>'
        + '<td style="font-size:12px">'+esc(p.category||'')+'</td>'
        + '<td style="font-family:var(--mono);font-weight:700;color:'+color+'">'+st+'</td>'
        + '<td><div class="stock-bar-wrap"><div class="stock-bar"><div class="stock-bar-fill" style="width:'+pct+'%;background:'+color+'"></div></div></div></td>'
        + '<td><span class="status-pill sp-'+sc+'">'+stxt+'</span></td>'
        + '<td><div style="display:flex;gap:6px">'
        +   '<button class="btn-sm bg-green" onclick="quickStockAdd(\''+docId+'\','+st+',10,'+p.id+')">+10</button>'
        +   '<button class="btn-sm bg-ghost" onclick="quickStockAdd(\''+docId+'\','+st+',50,'+p.id+')">+50</button>'
        +   '<button class="btn-sm bg-blue" onclick="openStockModal(\''+docId+'\',\''+esc(p.name||'')+'\','+st+','+p.id+')">Set</button>'
        +   '<button class="btn-sm '+(isOOS?'bg-green':'bg-red')+'" onclick="markOutOfStock(\''+docId+'\','+p.id+','+isOOS+')">'+(isOOS?'✓ Restore':'Mark OOS')+'</button>'
        + '</div></td>'
        + '</tr>';
    } catch(e) {
      console.warn('renderStockRows: skipping bad product', p?.id, e.message);
      return '';
    }
  }).join('');
  const all = window.allProducts || _allProducts || [];
  const low=all.filter(p=>(p.stock||0)>0 && (p.stock||0)<=thresh);
  const az=document.getElementById('stock-alert-zone');
  if(az) az.innerHTML=low.length?'<div class="alert-strip"><span>⚠ '+low.length+' items need restocking</span></div>':'';
  const badge=document.getElementById('sb-low-badge');
  if(badge){badge.style.display=low.length?'inline-flex':'none';badge.textContent=low.length;}
  _set('kpi-low',low.length);
}
window.renderStock = renderStock;

async function quickStockAdd(docId, current, amount, productId) {
  const newStock = (current||0) + amount;
  const update = { stock: newStock };
  // Auto-clear outOfStock if stock > 0
  if (newStock > 0) update.outOfStock = false;
  try {
    await window.db.collection('app_overrides').doc('products')
      .set({ [String(productId)]: update }, { merge: true });
    if (docId) await window.db.collection('products').doc(docId)
      .update(update).catch(()=>{});
    toast('+'+amount+' stock added','success');
    loadAllProducts();
  } catch(e) { toast(e.message,'error'); }
}
window.quickStockAdd = quickStockAdd;

function openStockModal(docId, name, current, productId) {
  showModal('<h3>Set Stock: '+esc(name)+'</h3>'
    + '<div class="form-group"><label>New Stock Quantity</label>'
    + '<input id="stock-qty" type="number" min="0" value="'+current+'"></div>'
    + '<div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '<button class="btn-primary" onclick="setStock(\''+docId+'\','+productId+')">Set Stock</button></div>'
  );
}
window.openStockModal = openStockModal;

async function setStock(docId, productId) {
  const qty = parseInt((document.getElementById('stock-qty')||{}).value)||0;
  const update = { stock: qty };
  // Auto-clear outOfStock if stock > 0
  if (qty > 0) update.outOfStock = false;
  try {
    await window.db.collection('app_overrides').doc('products')
      .set({ [String(productId)]: update }, { merge: true });
    if (docId) await window.db.collection('products').doc(docId)
      .update(update).catch(()=>{});
    closeModal();
    toast('Stock set to '+qty,'success');
    loadAllProducts();
  } catch(e) { toast(e.message,'error'); }
}
window.setStock = setStock;

async function markOutOfStock(docId, productId, isCurrentlyOOS) {
  const newOOS = !isCurrentlyOOS;
  try {
    await window.db.collection('app_overrides').doc('products')
      .set({ [String(productId)]: { outOfStock: newOOS } }, { merge: true });
    if (docId) await window.db.collection('products').doc(docId)
      .update({ outOfStock: newOOS }).catch(()=>{});
    toast(newOOS ? '🔴 Marked out of stock' : '✅ Restored to in stock', 'success');
    loadAllProducts();
  } catch(e) { toast(e.message, 'error'); }
}
window.markOutOfStock = markOutOfStock;

function openBulkStock() {
  toast('Bulk stock update: use individual Set buttons or export CSV','info');
}
window.openBulkStock = openBulkStock;

// ═══════════════════════════════════════════════════════════════
// ANALYTICS PAGE
// ═══════════════════════════════════════════════════════════════
function loadAnalytics() {
  const allDel = _allOrders.filter(o=>o.status==='delivered');
  const total  = allDel.reduce((s,o)=>s+(o.totalPrice||0),0);
  const aov    = allDel.length ? Math.round(total/allDel.length) : 0;
  const delRate= _allOrders.length ? Math.round(allDel.length/_allOrders.length*100) : 0;

  _set('ana-total','₹'+total.toLocaleString('en-IN'));
  _set('ana-total-sub',allDel.length+' delivered orders');
  _set('ana-orders',_allOrders.length);
  _set('ana-aov','₹'+aov);
  _set('ana-del',delRate+'%');

  loadTrendChart('7d',null);
  loadStatusChart();
  loadCatChart();
  loadHourlyChart();
  loadTopProducts();
}

function loadRevenueChart(period, btn) {
  if (btn) { document.querySelectorAll('.chart-period button').forEach(b=>b.classList.remove('on')); btn.classList.add('on'); }
  const days = period==='30d'?30:7;
  const labels=[]; const data=[];
  for (let i=days-1;i>=0;i--) {
    const d=new Date(); d.setDate(d.getDate()-i); d.setHours(0,0,0,0);
    const next=new Date(d); next.setDate(next.getDate()+1);
    labels.push(d.toLocaleDateString('en-IN',{day:'numeric',month:'short'}));
    data.push(_allOrders.filter(o=>{
      const ts=o.createdAt?.seconds?new Date(o.createdAt.seconds*1000):new Date(o.createdAt||0);
      return o.status==='delivered'&&ts>=d&&ts<next;
    }).reduce((s,o)=>s+(o.totalPrice||0),0));
  }
  renderLineChart('chart-revenue',labels,data,'Revenue (₹)','#00e676');
}
window.loadRevenueChart = loadRevenueChart;

function loadTrendChart(period, btn) {
  if (btn) { document.querySelectorAll('#page-analytics .chart-period button').forEach(b=>b.classList.remove('on')); if(btn)btn.classList.add('on'); }
  const days = period==='90d'?90:period==='30d'?30:7;
  const labels=[]; const data=[];
  for (let i=days-1;i>=0;i--) {
    const d=new Date(); d.setDate(d.getDate()-i); d.setHours(0,0,0,0);
    const next=new Date(d); next.setDate(next.getDate()+1);
    labels.push(d.toLocaleDateString('en-IN',{day:'numeric',month:'short'}));
    data.push(_allOrders.filter(o=>{
      const ts=o.createdAt?.seconds?new Date(o.createdAt.seconds*1000):new Date(o.createdAt||0);
      return ts>=d&&ts<next;
    }).length);
  }
  renderLineChart('chart-trend',labels,data,'Orders','#2979ff');
}
window.loadTrendChart = loadTrendChart;

function loadStatusChart() {
  const states = window.ORDER_STATES || ['placed','packing','assigned','picked','delivered','cancelled'];
  const counts={};
  states.forEach(s=>{ counts[s]=_allOrders.filter(o=>o.status===s).length; });
  renderDoughnutChart('chart-status',Object.keys(counts),Object.values(counts),
    ['#ffd600','#2979ff','#d500f9','#ff6d00','#00e676','#ff1744']);
}

function loadCatChart() {
  const cats={};
  _allOrders.forEach(o=>(o.items||[]).forEach(i=>{
    const cat=i.category||'Other';
    cats[cat]=(cats[cat]||0)+(i.qty||1);
  }));
  const sorted=Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,6);
  renderDoughnutChart('chart-cats',sorted.map(x=>x[0]),sorted.map(x=>x[1]),
    ['#00e676','#2979ff','#ff6d00','#d500f9','#ffd600','#ff1744']);
}

function loadHourlyChart() {
  const hours=Array(24).fill(0);
  _allOrders.forEach(o=>{
    const ts=o.createdAt?.seconds?new Date(o.createdAt.seconds*1000):new Date(o.createdAt||0);
    if(!isNaN(ts)) hours[ts.getHours()]++;
  });
  renderBarChart('chart-hourly',Array.from({length:24},(_,i)=>i+'h'),hours,'Orders','#2979ff');
}

function loadTopProducts() {
  const el=document.getElementById('top-products-list');
  if(!el) return;
  const counts={};
  _allOrders.forEach(o=>(o.items||[]).forEach(i=>{
    counts[i.name]=(counts[i.name]||0)+(i.qty||1);
  }));
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  if(!top.length){el.innerHTML='<p style="color:var(--text2);font-size:13px;padding:16px">No data yet</p>';return;}
  const max=top[0][1];
  el.innerHTML=top.map(([name,qty])=>`
    <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;font-size:13px">${esc(name)}</div>
      <div style="width:100px;background:var(--bg3);border-radius:4px;height:6px;overflow:hidden">
        <div style="height:100%;background:var(--green);width:${Math.round(qty/max*100)}%"></div>
      </div>
      <div style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--green);width:28px;text-align:right">${qty}</div>
    </div>`).join('');
}

// ─── CHART HELPERS ───────────────────────────────────────────
function renderLineChart(id, labels, data, label, color) {
  const canvas = document.getElementById(id);
  if (!canvas || typeof Chart==='undefined') return;
  if (_charts[id]) _charts[id].destroy();
  _charts[id] = new Chart(canvas, {
    type:'line',
    data:{ labels, datasets:[{ label, data, borderColor:color, backgroundColor:color+'22', fill:true, tension:.4, pointRadius:3 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ x:{ticks:{color:'#90a0b7',font:{size:10}},grid:{color:'rgba(255,255,255,.04)'}},
               y:{ticks:{color:'#90a0b7',font:{size:10}},grid:{color:'rgba(255,255,255,.04)'}} } }
  });
}

function renderBarChart(id, labels, data, label, color) {
  const canvas=document.getElementById(id);
  if(!canvas||typeof Chart==='undefined') return;
  if(_charts[id])_charts[id].destroy();
  _charts[id]=new Chart(canvas,{type:'bar',data:{labels,datasets:[{label,data,backgroundColor:color+'88',borderColor:color,borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:'#90a0b7',font:{size:9}},grid:{display:false}},
              y:{ticks:{color:'#90a0b7',font:{size:10}},grid:{color:'rgba(255,255,255,.04)'}}}}});
}

function renderDoughnutChart(id, labels, data, colors) {
  const canvas=document.getElementById(id);
  if(!canvas||typeof Chart==='undefined') return;
  if(_charts[id])_charts[id].destroy();
  _charts[id]=new Chart(canvas,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:'#90a0b7',font:{size:11},boxWidth:12}}}}});
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMERS PAGE
// ═══════════════════════════════════════════════════════════════
function renderCustomers() {
  const tbody=document.getElementById('customers-tbody');
  if(!tbody) return;
  const search=((document.getElementById('cust-search')||{}).value||'').toLowerCase();
  const custMap={};
  // Privacy: only build customer list from Nekta-direct orders (not shop orders)
  _allOrders.filter(o=>!o.shopId).forEach(o=>{
    const ph=o.customerPhone||'';
    if(!ph) return;
    if(!custMap[ph]) custMap[ph]={name:o.customerName||'—',phone:ph,orders:0,spent:0,last:null};
    custMap[ph].orders++;
    custMap[ph].spent+=(o.totalPrice||0);
    const ts=o.createdAt?.seconds?new Date(o.createdAt.seconds*1000):new Date(o.createdAt||0);
    if(!custMap[ph].last||ts>custMap[ph].last) custMap[ph].last=ts;
  });
  let list=Object.values(custMap).sort((a,b)=>b.spent-a.spent);
  if(search) list=list.filter(c=>(c.name||'').toLowerCase().includes(search)||c.phone.includes(search));
  if(!list.length){tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text2)">No customers yet</td></tr>';return;}
  tbody.innerHTML=list.map(c=>`
    <tr>
      <td><div style="font-weight:600;font-size:13px">${esc(c.name)}</div></td>
      <td style="font-family:var(--mono);font-size:12px">${c.phone}</td>
      <td style="font-family:var(--mono)">${c.orders}</td>
      <td style="font-family:var(--mono);color:var(--green)">₹${c.spent.toLocaleString('en-IN')}</td>
      <td style="font-size:12px">${c.last?c.last.toLocaleDateString('en-IN'):'—'}</td>
      <td><a href="https://wa.me/91${c.phone}" target="_blank" class="btn-sm bg-ghost" style="text-decoration:none">💬 WA</a></td>
    </tr>`).join('');
}
window.filterCustomers = renderCustomers;

function downloadCustomers() {
  const custMap={};
  _allOrders.forEach(o=>{const ph=o.customerPhone||'';if(!ph)return;if(!custMap[ph])custMap[ph]={name:o.customerName||'',phone:ph,orders:0,spent:0};custMap[ph].orders++;custMap[ph].spent+=(o.totalPrice||0);});
  const rows=[['Customer Name','Phone','Total Orders','Total Spent (₹)']];
  Object.values(custMap).sort((a,b)=>b.spent-a.spent).forEach(c=>rows.push([c.name,c.phone,c.orders,c.spent]));
  if (typeof saveXlsx === 'function') {
    saveXlsx(rows, 'Customers', 'nekta-customers-'+new Date().toISOString().slice(0,10)+'.xlsx');
  } else {
    const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download='nekta-customers.csv';a.click();
  }
}
window.downloadCustomers = downloadCustomers;

// ═══════════════════════════════════════════════════════════════
// SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════
function loadSettings() {
  const s=_settings;
  _setVal('set-minord',  s.minOrd||s.minOrder||100);
  _setVal('set-delbase', s.delBase||20);
  _setVal('set-lowstock',s.lowStockThreshold||10);
  _togSet('tog-store',   s.storeOpen!==false);
  _togSet('tog-express', !!s.expressMode);
  _togSet('tog-autoconf',!!s.autoconf);
  // Load store status settings
  _setVal('store-closed-msg',s.storeClosedMsg||'');
  _togSet('tog-store-open', s.storeOpen!==false);
}

async function toggleSetting(key, el) {
  el.classList.toggle('on');
  const on=el.classList.contains('on');
  const map={store:'storeOpen',express:'expressMode',sound:'soundAlerts',autoconf:'autoconf'};
  if(map[key]) await window.db.collection('app_overrides').doc('settings').set({[map[key]]:on},{merge:true}).catch(()=>{});
}
window.toggleSetting = toggleSetting;

async function saveSetting(key, val) {
  await window.db.collection('app_overrides').doc('settings').set({[key]:isNaN(val)?val:Number(val)},{merge:true})
    .then(()=>toast('Saved','success')).catch(e=>toast(e.message,'error'));
}
window.saveSetting = saveSetting;

async function sendBroadcast() {
  const msg=(document.getElementById('broadcast-msg')||{}).value?.trim();
  const type=(document.getElementById('broadcast-type')||{}).value||'info';
  if(!msg){toast('Enter a message','error');return;}
  await window.db.collection('app_overrides').doc('settings').set({
    announcementBanner:{on:true,text:msg,type}
  },{merge:true}).then(()=>toast('Broadcast sent','success')).catch(e=>toast(e.message,'error'));
}
window.sendBroadcast = sendBroadcast;

async function changePassword() {
  const cur=(document.getElementById('pass-cur')||{}).value?.trim();
  const nw =(document.getElementById('pass-new')||{}).value?.trim();
  const con=(document.getElementById('pass-confirm')||{}).value?.trim();
  if(!cur||!nw||!con){toast('Fill all fields','error');return;}
  if(nw.length < 6){toast('New password must be at least 6 characters','error');return;}
  if(nw!==con){toast('Passwords do not match','error');return;}
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(cur));
  const curHash=Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(curHash!==window._ADMIN_PIN_HASH){toast('Current password is wrong','error');return;}
  const newBuf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(nw));
  const newHash=Array.from(new Uint8Array(newBuf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  try {
    await window.db.collection('app_overrides').doc('admin').set({passwordHash:newHash,updatedAt:new Date().toISOString()},{merge:true});
    toast('✅ Password updated! Use new password on next login.','success');
    document.getElementById('pass-cur').value='';
    document.getElementById('pass-new').value='';
    document.getElementById('pass-confirm').value='';
  } catch(e){ toast('Save failed: '+e.message,'error'); }
}
window.changePassword = changePassword;

// ═══════════════════════════════════════════════════════════════
// HOME CONTROL
// ═══════════════════════════════════════════════════════════════
let _homeConfig={slides:[],sections:[],featured:[],banners:[]};

async function loadHomePage() {
  try {
    const doc=await window.db.collection('app_overrides').doc('home_config').get();
    if(doc.exists) _homeConfig={slides:[],sections:[],featured:[],banners:[],...doc.data()};
  } catch(e){ console.warn('loadHomePage:',e.message); }
  renderSlides(); renderSections(); renderFeatured(); renderBanners();
}
window.loadHomePage = loadHomePage;

const _DEFAULT_DASHBOARD_SLIDES = [
  {h:'Fresh Groceries',sub:"Kothagudem's fastest delivery",bg:'linear-gradient(135deg,#059669,#047857)',tag:'⚡ DELIVERY IN 20 MINS',e:'🚴',on:true,_default:true},
  {h:'Fresh Milk @ ₹24 Only',sub:'Farm fresh, delivered daily',bg:'linear-gradient(135deg,#f59e0b,#d97706)',tag:'🥛 DAIRY DEALS',e:'🥛',on:true,_default:true},
  {h:'Flat 50% OFF On Selected Items',sub:'Limited time offer - grab now!',bg:'linear-gradient(135deg,#ef4444,#dc2626)',tag:'🎉 MEGA SALE',e:'🛒',on:true,_default:true},
  {h:'Chicken, Fish & Mutton Daily',sub:'Cleaned & ready to cook',bg:'linear-gradient(135deg,#7c3aed,#6d28d9)',tag:'🍗 NON-VEG FRESH',e:'🍗',on:true,_default:true},
];

function renderSlides() {
  const el=document.getElementById('slides-list');
  if(!el) return;
  const slides = (_homeConfig.slides && _homeConfig.slides.length > 0) ? _homeConfig.slides : _DEFAULT_DASHBOARD_SLIDES;
  const isDefault = !_homeConfig.slides || _homeConfig.slides.length === 0;
  
  let html = '';
  
  if(isDefault) {
    // SHOWING DEFAULTS — Read-only, no buttons
    html = slides.map((s,i)=>`
      <div style="display:flex;align-items:center;gap:12px;padding:10px;background:var(--bg3);border-radius:10px;margin-bottom:8px;opacity:0.6">
        <div style="flex:1">
          <div style="font-weight:600">${esc(s.h||'Slide '+(i+1))}</div>
          <div style="font-size:12px;color:var(--text2)">${esc(s.sub||'')} ${s.img?'📸 Has Image':''}</div>
        </div>
        <span style="font-size:11px;color:var(--text2);background:var(--bg4);padding:4px 8px;border-radius:6px">DEFAULT</span>
      </div>`).join('');
  } else {
    // SHOWING CUSTOM SLIDERS — With up/down + toggle + delete buttons
    html = slides.map((s,i)=>`
      <div style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--bg3);border-radius:10px;margin-bottom:8px">
        <div style="flex-shrink:0;font-size:12px;font-weight:700;color:var(--text2);background:var(--bg4);padding:4px 8px;border-radius:4px;min-width:32px;text-align:center">${i+1}/${slides.length}</div>
        <div style="flex:1">
          <div style="font-weight:600">${esc(s.h||'Slide '+(i+1))}</div>
          <div style="font-size:12px;color:var(--text2)">${esc(s.sub||'')} ${s.img?'📸 Has Image':''}</div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          ${i>0?'<button class="btn-sm bg-ghost" onclick="moveSlideUp('+i+')" title="Move up">⬆️</button>':'<button class="btn-sm bg-ghost" disabled style="opacity:0.3">⬆️</button>'}
          ${i<slides.length-1?'<button class="btn-sm bg-ghost" onclick="moveSlideDown('+i+')" title="Move down">⬇️</button>':'<button class="btn-sm bg-ghost" disabled style="opacity:0.3">⬇️</button>'}
        </div>
        <div class="toggle ${s.on!==false?'on':''}" onclick="toggleSlide(${i},this)" style="flex-shrink:0" title="Toggle on/off"></div>
        <button class="btn-sm bg-red" onclick="removeSlide(${i})" title="Delete this slider">✕</button>
      </div>`).join('');
    
    // Add reset button
    html += '<div style="margin-top:12px"><button class="btn-sm bg-ghost" onclick="clearAllSlides()" title="Remove all custom sliders and show defaults">🔄 Reset to Defaults</button></div>';
  }
  
  el.innerHTML = html;
}

function addSlide() {
  showModal('<h3>Add Slider</h3>'
    +'<div style="background:rgba(0,185,107,.08);border:1px solid rgba(0,185,107,.2);border-radius:10px;padding:10px;margin-bottom:14px;font-size:12px;color:var(--text2)">'
    +'📸 <strong>Image URL (recommended):</strong> Paste any image link (Google Drive, WhatsApp saved, etc.) — it will show as full-cover background.<br>'
    +'🎨 <strong>No image?</strong> Fill Heading + Gradient color and it shows a colored slide.'
    +'</div>'
    +'<div class="form-group"><label>🖼 Image URL <span style="color:var(--green);font-weight:700">(recommended — paste any image link)</span></label>'
    +'<input id="sl-img" placeholder="https://... (leave empty to use gradient color)" type="url" style="border:2px solid var(--g)">'
    +'<div id="sl-img-preview" style="margin-top:8px;display:none;border-radius:10px;overflow:hidden;height:100px"><img id="sl-img-preview-img" style="width:100%;height:100px;object-fit:cover" onerror="document.getElementById(\'sl-img-preview\').style.display=\'none\'"></div></div>'
    +'<script>document.getElementById(\'sl-img\').addEventListener(\'input\',function(){var v=this.value.trim();var p=document.getElementById(\'sl-img-preview\');var i=document.getElementById(\'sl-img-preview-img\');if(v){i.src=v;p.style.display=\'block\';}else{p.style.display=\'none\';}});<\/script>'
    +'<div class="form-group"><label>Heading</label><input id="sl-h" placeholder="e.g. Fresh Vegetables!"></div>'
    +'<div class="form-group"><label>Subtitle</label><input id="sl-sub" placeholder="Delivered in 20 min"></div>'
    +'<div class="form-group"><label>Tag (small badge text)</label><input id="sl-tag" placeholder="e.g. ⚡ SPECIAL OFFER"></div>'
    +'<div class="form-group"><label>Background Color (used only if no image)</label><input id="sl-bg" placeholder="linear-gradient(135deg,#059669,#047857)"></div>'
    +'<div class="form-group"><label>Emoji (used only if no image)</label><input id="sl-em" placeholder="🥬" maxlength="4"></div>'
    +'<div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveSlide()">Add & Go Live ✅</button></div>'
  );
}
window.addSlide = addSlide;

function saveSlide() {
  const h=  (document.getElementById('sl-h')||{}).value?.trim()||'New Slide';
  const sub=(document.getElementById('sl-sub')||{}).value?.trim()||'';
  const bg= (document.getElementById('sl-bg')||{}).value?.trim()||'linear-gradient(135deg,#00e676,#007a47)';
  const e=  (document.getElementById('sl-em')||{}).value?.trim()||'🛒';
  const tag=(document.getElementById('sl-tag')||{}).value?.trim()||'';
  const img=(document.getElementById('sl-img')||{}).value?.trim()||'';
  _homeConfig.slides=_homeConfig.slides||[];
  _homeConfig.slides.push({h,sub,bg,e,tag,img,on:true});
  // Auto-save to Firestore immediately so user app updates instantly
  window.db.collection('app_overrides').doc('home_config').set(_homeConfig,{merge:true})
    .then(()=>{ closeModal(); renderSlides(); toast('Slider added & live! ✅','success'); })
    .catch(e=>toast('Error: '+e.message,'error'));
}
window.saveSlide = saveSlide;

function removeSlide(i) {
  _homeConfig.slides.splice(i,1);
  // Auto-save — if 0 slides left, user app falls back to default slides
  window.db.collection('app_overrides').doc('home_config').set(_homeConfig,{merge:true})
    .then(()=>{ renderSlides(); toast(_homeConfig.slides.length===0?'Removed — default slides restored ✅':'Slider deleted','info'); })
    .catch(e=>toast('Error: '+e.message,'error'));
}
window.removeSlide = removeSlide;

function moveSlideUp(i) {
  if(i > 0) {
    [_homeConfig.slides[i-1], _homeConfig.slides[i]] = [_homeConfig.slides[i], _homeConfig.slides[i-1]];
    // Update order field
    _homeConfig.slides.forEach((s,idx) => s.order = idx);
    window.db.collection('app_overrides').doc('home_config').set(_homeConfig,{merge:true})
      .then(()=>{renderSlides(); toast('Slider moved up ⬆️','info');})
      .catch(e=>toast('Error: '+e.message,'error'));
  }
}
window.moveSlideUp = moveSlideUp;

function moveSlideDown(i) {
  if(i < _homeConfig.slides.length-1) {
    [_homeConfig.slides[i], _homeConfig.slides[i+1]] = [_homeConfig.slides[i+1], _homeConfig.slides[i]];
    // Update order field
    _homeConfig.slides.forEach((s,idx) => s.order = idx);
    window.db.collection('app_overrides').doc('home_config').set(_homeConfig,{merge:true})
      .then(()=>{renderSlides(); toast('Slider moved down ⬇️','info');})
      .catch(e=>toast('Error: '+e.message,'error'));
  }
}
window.moveSlideDown = moveSlideDown;

function clearAllSlides() {
  if(confirm('Clear all custom sliders and show defaults?')) {
    _homeConfig.slides = [];
    window.db.collection('app_overrides').doc('home_config').set(_homeConfig,{merge:true})
      .then(()=>{ renderSlides(); toast('Reset to default slides ✅','success'); })
      .catch(e=>toast('Error: '+e.message,'error'));
  }
}
window.clearAllSlides = clearAllSlides;

function toggleSlide(i,el) { 
  el.classList.toggle('on'); 
  _homeConfig.slides[i].on=el.classList.contains('on'); 
  // Auto-save immediately
  window.db.collection('app_overrides').doc('home_config').set(_homeConfig,{merge:true})
    .then(()=>toast((el.classList.contains('on')?'✅ Enabled':'🔒 Disabled') + ' slider','info'))
    .catch(e=>toast('Error: '+e.message,'error'));
}
window.toggleSlide = toggleSlide;

function renderSections() {
  const el=document.getElementById('sections-list');
  if(!el) return;
  const defaults=[
    {id:'combos',      label:'🎁 Smart Combos',        on:true},
    {id:'buyagain',    label:'🔄 Buy Again',            on:true},
    {id:'quickpicks',  label:'⚡ Quick Picks',          on:true},
    {id:'deals',       label:'🏷️ Deals of the Day',    on:true},
    {id:'trending',    label:'🔥 Trending Now',         on:true},
    {id:'timebased',   label:'⏰ Time-Based Picks',     on:true},
    {id:'fastdelivery',label:'🚀 Fast Delivery',        on:true},
    {id:'newarrivals', label:'✨ New Arrivals',         on:true},
  ];
  // Merge saved config with defaults so new sections always appear
  const saved = _homeConfig.sections || [];
  let merged;
  if (saved.length > 0) {
    // Saved order exists - preserve it and merge with defaults
    merged = saved.map(s => {
      const def = defaults.find(d => d.id === s.id);
      return def ? { ...def, ...s } : s;
    });
    // Add any new defaults not yet in saved
    defaults.forEach(def => {
      if (!merged.find(s => s.id === def.id)) merged.push(def);
    });
  } else {
    // No saved config - use defaults
    merged = defaults.slice();
  }
  _homeConfig.sections = merged;

  el.innerHTML = merged.map((s,i) => {
    const prodCount = (s.products && s.products.length) ? s.products.length : 0;
    const allProds = window.allProducts || _allProducts || [];
    const prodNames = (s.products || []).slice(0,2).map(pid => {
      const p = allProds.find(x => x.id == pid);
      return p ? p.name : `ID:${pid}`;
    });
    return `
    <div style="display:flex;align-items:center;gap:8px;padding:12px;border-bottom:1px solid var(--border);background:${s.on!==false?'transparent':'rgba(255,23,68,.04)'}">
      <div style="flex-shrink:0;font-size:12px;font-weight:700;color:var(--text2);background:var(--bg4);padding:4px 8px;border-radius:4px;min-width:32px;text-align:center">${i+1}/${merged.length}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600;color:${s.on!==false?'var(--text)':'var(--text3)'}">${esc(s.label||s.id)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${s._custom?'Custom: '+prodCount+' products':'ID: '+esc(s.id)}</div>
        ${prodNames.length > 0 ? '<div style="font-size:10px;color:var(--text2);margin-top:3px">📦 '+esc(prodNames.join(', '))+'...</div>':''}
      </div>
      <span style="font-size:11px;font-weight:700;color:${s.on!==false?'var(--green)':'var(--red)'}">${s.on!==false?'VISIBLE':'HIDDEN'}</span>
      <div style="display:flex;gap:4px;flex-shrink:0">
        ${i>0?'<button class="btn-sm bg-ghost" onclick="moveSectionUp('+i+')" title="Move up">⬆️</button>':'<button class="btn-sm bg-ghost" disabled style="opacity:0.3">⬆️</button>'}
        ${i<merged.length-1?'<button class="btn-sm bg-ghost" onclick="moveSectionDown('+i+')" title="Move down">⬇️</button>':'<button class="btn-sm bg-ghost" disabled style="opacity:0.3">⬇️</button>'}
      </div>
      <div class="toggle ${s.on!==false?'on':''}" onclick="toggleSection(${i},this)"></div>
      ${s._custom ? `<button class="btn-sm bg-red" onclick="removeCustomSection(${i})" title="Delete">✕</button>` : ''}
    </div>`;
  }).join('')
  + `<div style="padding:12px;border-top:1px solid var(--border);margin-top:4px">
      <button class="btn-sm bg-green" onclick="openAddCustomSection()">+ Add Custom Section</button>
    </div>`;
}

function toggleSection(i,el) { 
  el.classList.toggle('on'); 
  _homeConfig.sections[i].on=el.classList.contains('on'); 
  // Auto-save immediately
  window.db.collection('app_overrides').doc('home_config').set(_homeConfig,{merge:true})
    .then(()=>toast((el.classList.contains('on')?'✅ Shown':'🔒 Hidden') + ' section','info'))
    .catch(e=>toast('Error: '+e.message,'error'));
  renderSections(); 
}
window.toggleSection = toggleSection;

function moveSectionUp(i) {
  if(i > 0) {
    // Swap positions
    [_homeConfig.sections[i-1], _homeConfig.sections[i]] = [_homeConfig.sections[i], _homeConfig.sections[i-1]];
    // Update order field for app sorting
    _homeConfig.sections.forEach((s,idx) => s.order = idx);
    window.db.collection('app_overrides').doc('home_config').set(_homeConfig,{merge:true})
      .then(()=>{renderSections(); toast('Section moved up ⬆️','info');})
      .catch(e=>toast('Error: '+e.message,'error'));
  }
}
window.moveSectionUp = moveSectionUp;

function moveSectionDown(i) {
  if(i < _homeConfig.sections.length-1) {
    // Swap positions
    [_homeConfig.sections[i], _homeConfig.sections[i+1]] = [_homeConfig.sections[i+1], _homeConfig.sections[i]];
    // Update order field for app sorting
    _homeConfig.sections.forEach((s,idx) => s.order = idx);
    window.db.collection('app_overrides').doc('home_config').set(_homeConfig,{merge:true})
      .then(()=>{renderSections(); toast('Section moved down ⬇️','info');})
      .catch(e=>toast('Error: '+e.message,'error'));
  }
}
window.moveSectionDown = moveSectionDown;

function openAddCustomSection() {
  const allProds = window.allProducts || _allProducts || [];
  const prodOptions = allProds.slice(0,50).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  showModal('<h3>Add Custom Section</h3>'
    +'<div class="form-group"><label>Section Title</label><input id="cs-label" placeholder="e.g. 🌱 Organic Picks"></div>'
    +'<div class="form-group"><label>Select Products (Hold Ctrl/Cmd for multiple)</label>'
    +'<select id="cs-products" multiple style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text);font-family:var(--font);min-height:150px;width:100%">'
    +prodOptions
    +'</select></div>'
    +'<div style="font-size:11px;color:var(--text2);margin-bottom:12px">💡 Tip: Ctrl+Click (or Cmd+Click on Mac) to select multiple products</div>'
    +'<div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveCustomSection()">Add Section</button></div>'
  );
}
window.openAddCustomSection = openAddCustomSection;

function saveCustomSection() {
  const label = (document.getElementById('cs-label')||{}).value?.trim();
  const prodSelect = document.getElementById('cs-products');
  if (!label) { toast('Enter a section title','error'); return; }
  if (!prodSelect || prodSelect.selectedOptions.length === 0) { toast('Select at least one product','error'); return; }
  
  const productIds = Array.from(prodSelect.selectedOptions).map(opt => Number(opt.value));
  _homeConfig.sections = _homeConfig.sections || [];
  _homeConfig.sections.push({ id: 'custom_'+Date.now(), label, products: productIds, on: true, _custom: true });
  
  // Auto-save to Firebase
  window.db.collection('app_overrides').doc('home_config').set(_homeConfig,{merge:true})
    .then(()=>{
      closeModal();
      renderSections();
      toast('Section added & saved! ✅','success');
    })
    .catch(e=>toast('Error: '+e.message,'error'));
}
window.saveCustomSection = saveCustomSection;

function removeCustomSection(i) {
  if(confirm('Delete this custom section?')) {
    _homeConfig.sections.splice(i, 1);
    // Auto-save to Firebase
    window.db.collection('app_overrides').doc('home_config').set(_homeConfig,{merge:true})
      .then(()=>{
        renderSections();
        toast('Section deleted ✓','info');
      })
      .catch(e=>toast('Error: '+e.message,'error'));
  }
}
window.removeCustomSection = removeCustomSection;

function renderFeatured() {
  const el=document.getElementById('featured-list');
  if(!el) return;
  if(!_homeConfig.featured?.length){el.innerHTML='<p style="color:var(--text2);font-size:13px">No featured products</p>';return;}
  const all = window.allProducts || _allProducts || [];
  el.innerHTML=_homeConfig.featured.map((pid,i)=>{
    const p=all.find(x=>x.id==pid);
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid var(--border)">
      <div style="flex:1;font-size:13px">${esc(p?.name||'ID:'+pid)}</div>
      <button class="btn-sm bg-red" onclick="removeFeatured(${i})">✕</button>
    </div>`;
  }).join('');
}

function removeFeatured(i){_homeConfig.featured.splice(i,1);renderFeatured();}
window.removeFeatured = removeFeatured;

function openFeaturedPicker(){
  const all = window.allProducts || _allProducts || [];
  if (!all.length) { toast('Load products first','warning'); return; }
  const renderOpts = (q) => all
    .filter(p => !q || (p.name||'').toLowerCase().includes(q.toLowerCase()))
    .slice(0,100)
    .map(p=>'<option value="'+p.id+'">'+esc(p.name||'')+(p.category?' ('+p.category+')':'')+'</option>')
    .join('');
  showModal('<h3>Add Featured Product</h3>'
    +'<div class="form-group"><label>Search</label><input id="fp-search" placeholder="Type to filter..." oninput="document.getElementById(\'fp-sel\').innerHTML=window._fpOpts(this.value)" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 14px;color:var(--text);font-family:var(--font);font-size:13px;outline:none;width:100%"></div>'
    +'<div class="form-group"><label>Product ('+all.length+' total)</label><select id="fp-sel" size="8" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:6px;color:var(--text);width:100%;font-size:13px">'+renderOpts('')+'</select></div>'
    +'<div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="addFeatured()">Add</button></div>'
  );
  window._fpOpts = renderOpts;
}
window.openFeaturedPicker = openFeaturedPicker;

function addFeatured(){const v=document.getElementById('fp-sel').value;_homeConfig.featured=_homeConfig.featured||[];_homeConfig.featured.push(Number(v));closeModal();renderFeatured();}
window.addFeatured = addFeatured;

function renderBanners(){
  const el=document.getElementById('banners-list');
  if(!el) return;
  if(!_homeConfig.banners?.length){el.innerHTML='<p style="color:var(--text2);font-size:13px">No banners</p>';return;}
  el.innerHTML=_homeConfig.banners.map((b,i)=>`
    <div style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid var(--border)">
      <div style="flex:1"><div style="font-size:13px;font-weight:600">${esc(b.text||'Banner')}</div><div style="font-size:11px;color:var(--text2)">${esc(b.type||'info')}</div></div>
      <button class="btn-sm bg-red" onclick="removeBanner(${i})">✕</button>
    </div>`).join('');
}

function addOfferBanner(){
  showModal('<h3>Add Banner</h3>'
    +'<div class="form-group"><label>Text</label><input id="ob-text" placeholder="e.g. Flat 20% off today!"></div>'
    +'<div class="form-group"><label>Type</label><select id="ob-type" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text)"><option value="info">Info</option><option value="success">Offer</option><option value="warning">Warning</option></select></div>'
    +'<div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveBanner()">Add</button></div>'
  );
}
window.addOfferBanner = addOfferBanner;

function saveBanner(){const t=(document.getElementById('ob-text')||{}).value?.trim();const tp=(document.getElementById('ob-type')||{}).value||'info';if(!t){toast('Enter text','error');return;}_homeConfig.banners=_homeConfig.banners||[];_homeConfig.banners.push({text:t,type:tp});closeModal();renderBanners();}
window.saveBanner = saveBanner;

function removeBanner(i){_homeConfig.banners.splice(i,1);renderBanners();}
window.removeBanner = removeBanner;

async function saveHomePageSettings() {
  await window.db.collection('app_overrides').doc('home_config').set(_homeConfig,{merge:true})
    .then(()=>toast('Home page saved & pushed to app! ✅','success'))
    .catch(e=>toast(e.message,'error'));
}
window.saveHomePageSettings = saveHomePageSettings;

// ═══════════════════════════════════════════════════════════════
// PROMOTIONS PAGE
// ═══════════════════════════════════════════════════════════════
async function loadPromotions() {
  try {
    const doc=await window.db.collection('app_overrides').doc('settings').get();
    if(doc.exists){
      const d=doc.data()||{};
      const ba=d.announcementBanner||{};
      _setVal('promo-banner-text',ba.text||'');
      const pt=document.getElementById('promo-banner-type');if(pt)pt.value=ba.type||'info';
      const bs=document.getElementById('banner-status');
      if(bs){bs.textContent=ba.on?'ON':'OFF';bs.className='status-pill '+(ba.on?'sp-ok':'sp-out');}
      _setVal('free-del-above',d.freeDeliveryAbove||0);
    }
    // Promo codes
    const pd=await window.db.collection('app_overrides').doc('promos').get();
    const codes=pd.exists?(pd.data()||{}).codes||[]:[];
    renderPromoCodes(codes);
  } catch(e){ console.warn('loadPromotions:',e.message); }
}

function renderPromoCodes(codes) {
  const el=document.getElementById('promo-codes-list');
  if(!el) return;
  if(!codes.length){el.innerHTML='<p style="color:var(--text2);font-size:13px;padding:8px">No promo codes</p>';return;}
  el.innerHTML=codes.map((c,i)=>`
    <div style="display:flex;align-items:center;gap:12px;padding:10px;background:var(--bg3);border-radius:10px;margin-bottom:6px">
      <div style="font-family:var(--mono);font-weight:700;font-size:14px;color:var(--green)">${esc(c.code)}</div>
      <div style="flex:1;font-size:12px;color:var(--text2)">${c.discountType==='percent'?c.discount+'% off':'₹'+c.discount+' off'} · Min ₹${c.minOrder||0}</div>
      <div class="toggle ${c.active?'on':''}" onclick="togglePromo(${i},this)"></div>
      <button class="btn-sm bg-red" onclick="deletePromo(${i})">✕</button>
    </div>`).join('');
  window._promoCodes=codes;
}

function openAddPromo(){
  showModal('<h3>Add Promo Code</h3>'
    +'<div class="form-group"><label>Code</label><input id="pc-code" placeholder="e.g. SAVE20" style="text-transform:uppercase"></div>'
    +'<div class="form-row"><div class="form-group"><label>Discount</label><input id="pc-disc" type="number" min="1" placeholder="20"></div>'
    +'<div class="form-group"><label>Type</label><select id="pc-type" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text)"><option value="percent">Percent (%)</option><option value="flat">Flat (₹)</option></select></div></div>'
    +'<div class="form-group"><label>Min Order (₹)</label><input id="pc-min" type="number" min="0" value="100"></div>'
    +'<div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="savePromo()">Add</button></div>'
  );
}
window.openAddPromo = openAddPromo;

async function savePromo() {
  const code=(document.getElementById('pc-code')||{}).value?.trim().toUpperCase();
  const disc=parseFloat((document.getElementById('pc-disc')||{}).value)||0;
  const type=(document.getElementById('pc-type')||{}).value||'percent';
  const min= parseInt((document.getElementById('pc-min')||{}).value)||0;
  if(!code||!disc){toast('Fill code and discount','error');return;}
  const codes=window._promoCodes||[];
  codes.push({code,discount:disc,discountType:type,minOrder:min,active:true});
  await window.db.collection('app_overrides').doc('promos').set({codes},{merge:false})
    .then(()=>{closeModal();toast('Promo added','success');renderPromoCodes(codes);})
    .catch(e=>toast(e.message,'error'));
}
window.savePromo = savePromo;

async function togglePromo(i,el){el.classList.toggle('on');const codes=window._promoCodes||[];codes[i].active=el.classList.contains('on');await window.db.collection('app_overrides').doc('promos').set({codes}).catch(()=>{});}
window.togglePromo = togglePromo;

async function deletePromo(i){const codes=window._promoCodes||[];codes.splice(i,1);await window.db.collection('app_overrides').doc('promos').set({codes}).then(()=>{toast('Deleted','info');renderPromoCodes(codes);}).catch(e=>toast(e.message,'error'));}
window.deletePromo = deletePromo;

async function saveBannerAnnouncement(show) {
  const text=(document.getElementById('promo-banner-text')||{}).value?.trim()||'';
  const type=(document.getElementById('promo-banner-type')||{}).value||'info';
  await window.db.collection('app_overrides').doc('settings').set({announcementBanner:{on:show,text,type}},{merge:true})
    .then(()=>{toast(show?'Banner shown':'Banner hidden','success');const bs=document.getElementById('banner-status');if(bs){bs.textContent=show?'ON':'OFF';bs.className='status-pill '+(show?'sp-ok':'sp-out');}})
    .catch(e=>toast(e.message,'error'));
}
window.saveBannerAnnouncement = saveBannerAnnouncement;

async function saveFreeDelivery() {
  const v=parseFloat((document.getElementById('free-del-above')||{}).value)||0;
  await window.db.collection('app_overrides').doc('settings').set({freeDeliveryAbove:v},{merge:true})
    .then(()=>toast('Saved','success')).catch(e=>toast(e.message,'error'));
}
window.saveFreeDelivery = saveFreeDelivery;

async function toggleStoreOpen(el) {
  // Deprecated - using toggleSetting('store', el) instead for consistency
  el.classList.toggle('on');
  const on=el.classList.contains('on');
  await window.db.collection('app_overrides').doc('settings').set({storeOpen:on},{merge:true}).catch(()=>{});
}
window.toggleStoreOpen = toggleStoreOpen;

async function saveStoreStatus() {
  const msg=(document.getElementById('store-closed-msg')||{}).value?.trim()||'';
  const on=document.getElementById('tog-store')?.classList.contains('on');
  await window.db.collection('app_overrides').doc('settings').set({storeOpen:!!on,storeClosedMsg:msg},{merge:true})
    .then(()=>toast('Store status saved','success')).catch(e=>toast(e.message,'error'));
}
window.saveStoreStatus = saveStoreStatus;

// ═══════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════
let _seenOrderIds=new Set(),_dAlarmAudio=null,_dAlarmTimer=null,_dAlarmOn=false;(function(){function build(){if(_dAlarmAudio)return;try{var ctx=new(window.AudioContext||window.webkitAudioContext)();var sr=ctx.sampleRate,buf=ctx.createBuffer(1,sr*1.2,sr),ch=buf.getChannelData(0);[0,0.12,0.35,0.47,0.70,0.82].forEach(function(t){var s=Math.floor(t*sr),e=Math.floor((t+0.09)*sr);for(var i=s;i<e&&i<ch.length;i++){var env=Math.sin(Math.PI*(i-s)/(e-s));ch[i]=(Math.sin(6.28*1400*(i/sr))*0.7+Math.sin(6.28*2800*(i/sr))*0.3)*env;}});var nb=ch.length*2,ab=new ArrayBuffer(44+nb),v=new DataView(ab);function ws(o,s){for(var i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));}ws(0,'RIFF');v.setUint32(4,36+nb,true);ws(8,'WAVE');ws(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);ws(36,'data');v.setUint32(40,nb,true);for(var i=0;i<ch.length;i++){var s2=Math.max(-1,Math.min(1,ch[i]));v.setInt16(44+i*2,s2<0?s2*0x8000:s2*0x7FFF,true);}var url=URL.createObjectURL(new Blob([ab],{type:'audio/wav'}));_dAlarmAudio=new Audio(url);_dAlarmAudio.volume=1.0;ctx.close();}catch(e){_dAlarmAudio=null;}}['click','mousedown','keydown','touchstart'].forEach(function(ev){document.addEventListener(ev,build,{passive:true});});})();function _ringDash(){if(_dAlarmAudio){_dAlarmAudio.currentTime=0;_dAlarmAudio.play().catch(function(){_ringDashFB();});}else{_ringDashFB();}}function _ringDashFB(){try{var ctx=new(window.AudioContext||window.webkitAudioContext)();function go(){var m=ctx.createGain();m.gain.value=1;m.connect(ctx.destination);var n=ctx.currentTime;[[0,.09],[.12,.09],[.35,.09],[.47,.09],[.70,.09],[.82,.09]].forEach(function(p){var o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=1400;o.connect(g);g.connect(m);g.gain.setValueAtTime(0,n+p[0]);g.gain.linearRampToValueAtTime(.9,n+p[0]+.01);g.gain.exponentialRampToValueAtTime(.001,n+p[0]+p[1]);o.start(n+p[0]);o.stop(n+p[0]+p[1]+.01);});setTimeout(function(){ctx.close();},2000);}ctx.state==='suspended'?ctx.resume().then(go):go();}catch(e){}}function startDashAlarm(){if(_dAlarmOn)return;_dAlarmOn=true;_ringDash();_dAlarmTimer=setInterval(function(){if(_dAlarmOn)_ringDash();},1500);}function stopDashAlarm(){_dAlarmOn=false;if(_dAlarmTimer){clearInterval(_dAlarmTimer);_dAlarmTimer=null;}if(_dAlarmAudio){_dAlarmAudio.pause();_dAlarmAudio.currentTime=0;}} function checkNewOrderNotif() { var recent=_allOrders.filter(function(o){return o.status==='placed';}); var count=recent.length; _set('notif-count',count); var newOnes=recent.filter(function(o){return !_seenOrderIds.has(o.id);}); if(newOnes.length>0){newOnes.forEach(function(o){_seenOrderIds.add(o.id);}); _notifUnread+=newOnes.length; addNotif(newOnes.length+' new order waiting!','placed'); startDashAlarm();} if(count===0)stopDashAlarm(); }

function addNotif(msg, type) {
  _notifs.unshift({msg, type, ts:new Date()});
  if(_notifs.length>20) _notifs.pop();
  const panel=document.getElementById('notif-panel');
  if(panel) renderNotifPanel();
}

function renderNotifPanel() {
  const panel=document.getElementById('notif-panel');
  if(!panel) return;
  panel.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div style="font-size:14px;font-weight:700">Notifications</div><button class="btn-ghost" onclick="toggleNotif()" style="padding:4px 10px;font-size:12px">✕ Close</button></div>'
    + (_notifs.length ? _notifs.map(n=>`
      <div class="notif-item unread">
        <div style="font-size:13px;font-weight:500">${esc(n.msg)}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:3px">${n.ts.toLocaleTimeString('en-IN')}</div>
      </div>`).join('') : '<p style="color:var(--text2);font-size:13px">No notifications yet</p>');
}

function toggleNotif() {
  const panel=document.getElementById('notif-panel');
  if(panel) panel.classList.toggle('on');
  renderNotifPanel();
}
window.toggleNotif = toggleNotif;

// ═══════════════════════════════════════════════════════════════
// RIDER HOME
// ═══════════════════════════════════════════════════════════════
let _riderStatus = 'offline';

async function renderRiderHome() {
  if(!_riderPhone) return;
  const el=document.getElementById('rider-orders-list');
  if(el) el.innerHTML='<div style="text-align:center;padding:20px;color:var(--text2)">Loading...</div>';
  try {
    await loadRiderStats();
    const snap=await window.db.collection('orders').where('riderPhone','==',_riderPhone).get();
    const active=snap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(o=>['assigned','picked'].includes(o.status))
      .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    if(!el) return;
    if(!active.length){el.innerHTML='<div class="empty"><div class="ico">📭</div><p>No active orders assigned to you</p></div>';return;}
    el.innerHTML=active.map(o=>renderRiderOrderCard(o)).join('');
  } catch(e){ if(el) el.innerHTML='<div class="empty"><div class="ico">⚠️</div><p>Error: '+esc(e.message)+'</p></div>'; }
}
window.renderRiderHome = renderRiderHome;

function renderRiderOrderCard(o) {
  const items=(o.items||[]).map(i=>'• '+i.name+' x'+i.qty).join('<br>');
  const canPick=o.status==='assigned';
  const canDeliver=o.status==='picked';
  return '<div class="order-row" style="margin-bottom:12px">'
    + '<div class="order-row-top">'
    +   '<span class="order-id">#'+o.id.slice(-6).toUpperCase()+'</span>'
    +   '<span class="status-pill sp-'+o.status+'">'+(o.status==='assigned'?'🚴 Assigned':'🛵 On Way')+'</span>'
    +   '<span class="order-amt">₹'+(o.totalPrice||0)+'</span>'
    + '</div>'
    + '<div style="font-size:12px;color:var(--text2);margin-bottom:8px">👤 '+esc(o.customerName||'—')+' · 📞 '+esc(o.customerPhone||'—')+'</div>'
    + '<div style="font-size:12px;color:var(--text2);margin-bottom:6px;line-height:1.6">'+items+'</div>'
    + '<div style="font-size:12px;background:var(--bg3);padding:8px;border-radius:8px;margin-bottom:10px">📍 '+esc(o.address||'No address')+'</div>'
    + '<div class="order-actions">'
    + (canPick ? '<button class="btn-sm bg-orange" onclick="riderPickUp(\''+o.id+'\')">📦 Picked Up</button>' : '')
    + (canDeliver ? '<button class="btn-sm bg-green" onclick="riderDeliver(\''+o.id+'\',\''+esc(o.customerName||'')+'\',\''+esc(o.customerPhone||'')+'\')">✅ Mark Delivered</button>' : '')
    + '<a href="https://wa.me/91'+o.customerPhone+'" target="_blank" class="btn-sm bg-ghost" style="text-decoration:none">💬 Message</a>'
    + (o.latitude&&o.longitude ? '<a href="https://maps.google.com/?q='+o.latitude+','+o.longitude+'" target="_blank" class="btn-sm bg-blue" style="text-decoration:none">🗺 Navigate</a>' : '')
    + '</div>'
    + '</div>';
}

async function riderPickUp(orderId) { const now = new Date().toISOString(); await window.db.collection('orders').doc(orderId).update({ status: 'picked', pickedAt: now, updatedAt: now }).then(function(){ toast('Marked as picked up','success'); renderRiderHome(); }).catch(function(e){ toast(e.message,'error'); }); } window.riderPickUp = riderPickUp;

async function riderDeliver(orderId, custName, custPhone) {
  if(!confirm('Mark this order as delivered?')) return;
  let deliveryMins=0, riderEarns=20, orderData=null;
  try {
    const snap=await window.db.collection('orders').doc(orderId).get();
    if(snap.exists){
      const d=snap.data(); orderData=d;
      const placed=d.createdAt?.toDate?d.createdAt.toDate():new Date(d.createdAt||0);
      deliveryMins=Math.round((Date.now()-placed.getTime())/60000);
      riderEarns=d.riderEarnings||d.deliveryCharge||(typeof calculateDeliveryCharge==='function'?calculateDeliveryCharge(d.latitude,d.longitude):20)||20;
    }
  } catch{}
  const ok=await window.db.collection('orders').doc(orderId).update({
    status:'delivered', deliveredAt: new Date().toISOString(),
    deliveryMins, riderEarnings: riderEarns, updatedAt: new Date().toISOString()
  }).then(()=>true).catch(e=>{toast(e.message,'error');return false;});
  if(!ok) return;
  // Update rider earnings
  try {
    const rs=await window.db.collection('riders').where('phone','==',_riderPhone).limit(1).get();
    if(!rs.empty) await rs.docs[0].ref.update({
      todayEarnings: firebase.firestore.FieldValue.increment(riderEarns),
      weekEarnings:  firebase.firestore.FieldValue.increment(riderEarns),
      totalEarnings: firebase.firestore.FieldValue.increment(riderEarns),
      deliveriesCompleted: firebase.firestore.FieldValue.increment(1),
      todayDeliveries: firebase.firestore.FieldValue.increment(1),
      weekDeliveries: firebase.firestore.FieldValue.increment(1),
      lastDeliveryAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    });
  } catch{}
  toast('Delivered in '+deliveryMins+' min! +₹'+riderEarns+' earned','success');
  renderRiderHome();
}
window.riderDeliver = riderDeliver;

async function loadRiderStats() {
  if (!_riderPhone) return;
  try {
    const snap = await window.db.collection('riders').where('phone','==',_riderPhone).limit(1).get();
    if (snap.empty) {
      _riderStatus = 'offline';
      _set('rd-earn', '₹0'); _set('rd-del', 0); _set('rd-total-earn', '₹0');
      const tog = document.getElementById('rd-status-tog');
      const pill = document.getElementById('rd-status-pill');
      const lbl  = document.getElementById('rd-status-lbl');
      if (tog)  tog.classList.remove('on');
      if (pill) { pill.textContent = '⚫ Offline'; pill.className = 'status-pill sp-offline'; }
      if (lbl)  lbl.textContent = 'Go Online';
      return;
    }
    const r = snap.docs[0].data();
    // Always read status FROM Firestore — never trust local _riderStatus here
    _riderStatus = r.status || 'offline';
    const isOn = _riderStatus === 'online' || _riderStatus === 'busy';
    _set('rd-earn', '₹' + (r.todayEarnings || 0));
    _set('rd-del', r.deliveriesCompleted || 0);
    _set('rd-total-earn', '₹' + (r.totalEarnings || r.weekEarnings || 0));
    const tog  = document.getElementById('rd-status-tog');
    const pill = document.getElementById('rd-status-pill');
    const lbl  = document.getElementById('rd-status-lbl');
    if (tog)  tog.classList.toggle('on', isOn);
    if (pill) { pill.textContent = isOn ? '🟢 Online' : '⚫ Offline'; pill.className = 'status-pill ' + (isOn ? 'sp-online' : 'sp-offline'); }
    if (lbl)  lbl.textContent = isOn ? 'Go Offline' : 'Go Online';
  } catch(e) { console.warn('loadRiderStats:', e.message); }
}

async function toggleRiderStatus() {
  const newStatus = _riderStatus === 'online' ? 'offline' : 'online';
  try {
    const snap = await window.db.collection('riders').where('phone','==',_riderPhone).limit(1).get();

    if (snap.empty) {
      // Rider not in Firestore yet — create them
      await window.db.collection('riders').add({
        name: _riderName || 'Rider',
        phone: _riderPhone,
        bikeNumber: '',
        status: newStatus,
        todayEarnings: 0,
        weekEarnings: 0,
        deliveriesCompleted: 0,
        rating: 4.5,
        isActive: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      await snap.docs[0].ref.update({
        status: newStatus,
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    _riderStatus = newStatus;
    const isOn = newStatus === 'online';
    const tog  = document.getElementById('rd-status-tog');
    const pill = document.getElementById('rd-status-pill');
    const lbl  = document.getElementById('rd-status-lbl');
    if (tog)  tog.classList.toggle('on', isOn);
    if (pill) { pill.textContent = isOn ? '🟢 Online' : '⚫ Offline'; pill.className = 'status-pill ' + (isOn ? 'sp-online' : 'sp-offline'); }
    if (lbl)  lbl.textContent = isOn ? 'Go Offline' : 'Go Online';
    toast(isOn ? '🟢 You are now Online — orders will be assigned to you' : '⚫ You are Offline', isOn ? 'success' : 'info');
  } catch(e) { toast(e.message, 'error'); }
}
window.toggleRiderStatus = toggleRiderStatus;

// ─── RIDER EARNINGS ──────────────────────────────────────────
async function renderRiderEarnings() {
  if(!_riderPhone) return;
  try {
    const snap=await window.db.collection('riders').where('phone','==',_riderPhone).limit(1).get();
    if(!snap.empty){
      const r=snap.docs[0].data();
      _set('re-today','₹'+(r.todayEarnings||0));
      _set('re-week','₹'+(r.weekEarnings||0));
      _set('re-total','₹'+(r.totalEarnings||r.weekEarnings||0));
      const el=document.getElementById('rd-stats-detail');
      if(el) el.innerHTML=`
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:8px 0">
          <div><div style="font-size:12px;color:var(--text2)">Total Deliveries</div><div style="font-size:22px;font-weight:700;font-family:var(--mono);color:var(--green)">${r.deliveriesCompleted||0}</div></div>
          <div><div style="font-size:12px;color:var(--text2)">Rating</div><div style="font-size:22px;font-weight:700;font-family:var(--mono);color:var(--yellow)">${(r.rating||4.5).toFixed(1)}★</div></div>
          <div><div style="font-size:12px;color:var(--text2)">Per Delivery</div><div style="font-size:18px;font-weight:700;font-family:var(--mono)" id="rd-per-del">&#8377;—</div></div>
        </div>`;
    }
    // Build earnings chart from orders
    const ords=await window.db.collection('orders').where('riderPhone','==',_riderPhone).where('status','==','delivered').limit(50).get().catch(()=>null);
    // Sort by deliveredAt client-side (avoids composite index requirement)
    const sortedOrds = (ords?.docs||[]).slice().sort((a,b)=>{
      const ta=a.data().deliveredAt||''; const tb=b.data().deliveredAt||''; return tb.localeCompare(ta);
    }).slice(0,30);
    const byDay={};
    sortedOrds.forEach(d=>{
      const o=d.data();
      const ts=o.deliveredAt?.seconds?new Date(o.deliveredAt.seconds*1000):new Date();
      const k=ts.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
      byDay[k]=(byDay[k]||0)+(o.riderEarnings||o.deliveryCharge||20);
    });
    const labels=Object.keys(byDay).slice(-7);
    const data=labels.map(k=>byDay[k]||0);
    renderBarChart('chart-rider-earnings',labels,data,'Earnings (₹)','#00e676');
  } catch(e){ console.warn('renderRiderEarnings:',e.message); }
}
window.renderRiderEarnings = renderRiderEarnings;

// ─── RIDER HISTORY ───────────────────────────────────────────
async function renderRiderHistory() {
  if(!_riderPhone) return;
  const el=document.getElementById('rider-history-list');
  if(el) el.innerHTML='<div style="text-align:center;padding:20px;color:var(--text2)">Loading...</div>';
  try {
    const snap=await window.db.collection('orders')
      .where('riderPhone','==',_riderPhone)
      .where('status','==','delivered')
      .orderBy('deliveredAt','desc').limit(50).get()
      .catch(()=>window.db.collection('orders').where('riderPhone','==',_riderPhone).get());
    const delivered=snap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(o=>o.status==='delivered')
      .sort((a,b)=>(b.deliveredAt?.seconds||b.createdAt?.seconds||0)-(a.deliveredAt?.seconds||a.createdAt?.seconds||0));
    if(!el) return;
    if(!delivered.length){el.innerHTML='<div class="empty"><div class="ico">📦</div><p>No deliveries yet</p></div>';return;}
    el.innerHTML=delivered.map(o=>{
      const ts=o.deliveredAt?.seconds?new Date(o.deliveredAt.seconds*1000):new Date(o.createdAt?.seconds*1000||0);
      return '<div class="order-row" style="margin-bottom:8px">'
        +'<div class="order-row-top">'
        +  '<span class="order-id">#'+o.id.slice(-6).toUpperCase()+'</span>'
        +  '<span class="status-pill sp-delivered">✅ Delivered</span>'
        +  '<span style="font-size:11px;color:var(--text2)">'+ts.toLocaleDateString('en-IN',{day:'numeric',month:'short'})+'</span>'
        +  '<span class="order-amt" style="color:var(--green)">+₹'+(o.riderEarnings||o.deliveryCharge||20)+'</span>'
        +'</div>'
        +'<div style="font-size:12px;color:var(--text2)">👤 '+esc(o.customerName||'—')
        +(o.deliveryMins?' · ⏱ '+o.deliveryMins+' min':'')+'</div>'
        +'</div>';
    }).join('');
  } catch(e){ if(el) el.innerHTML='<div class="empty"><div class="ico">⚠️</div><p>'+esc(e.message)+'</p></div>'; }
}
window.renderRiderHistory = renderRiderHistory;

// ═══════════════════════════════════════════════════════════════
// MODAL SYSTEM
// ═══════════════════════════════════════════════════════════════
let _modal=null;
function showModal(html) {
  closeModal();
  _modal=document.createElement('div');
  _modal.className='modal-bg on';
  _modal.innerHTML='<div class="modal">'+html+'</div>';
  _modal.addEventListener('click',function(e){if(e.target===_modal)closeModal();});
  document.body.appendChild(_modal);
}
window.showModal = showModal;

function closeModal() {
  if(_modal){_modal.remove();_modal=null;}
}
window.closeModal = closeModal;

// ═══════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function _set(id,v){const el=document.getElementById(id);if(el)el.textContent=v;}
function _setVal(id,v){const el=document.getElementById(id);if(el)el.value=v;}
function _togSet(id,on){const el=document.getElementById(id);if(el){el.classList.toggle('on',!!on);}}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  // Restore session if already logged in (e.g. page refresh)
  const savedRole = sessionStorage.getItem('nk_dash_role');
  const savedTime = sessionStorage.getItem('nk_dash_login_time');
  if (savedRole && savedTime) {
    const age = Date.now() - new Date(savedTime).getTime();
    if (age < 12 * 60 * 60 * 1000) {
      if (savedRole === 'rider') {
        window.location.href = 'rider.html';
        return;
      }
      _role = savedRole;
      waitDB(() => enterDashboard());
      return;
    }
  }
  setLoginRole('admin');
  window.initializeLoginScreen = initializeLoginScreen;
});

// ═══════════════════════════════════════════════════════════════
// UNIFIED INVENTORY SYSTEM
// Replaces separate Products + Stock tabs — one view, all actions
// ═══════════════════════════════════════════════════════════════

var _invSelected = new Set();

// ── Stats ────────────────────────────────────────────────────
function loadInventoryStats() {
  var allList = window._allProducts || [];
  // Filter: exclude hidden products (Sync Mode support)
  var list = allList.filter(p => !p.hidden);
  var thresh = (_settings && _settings.lowStockThreshold) || 10;
  document.getElementById('inv-total-products') && (document.getElementById('inv-total-products').textContent = list.length);
  document.getElementById('inv-low-stock') && (document.getElementById('inv-low-stock').textContent = list.filter(p => (p.stock||0) > 0 && (p.stock||0) <= thresh).length);
  document.getElementById('inv-out-stock') && (document.getElementById('inv-out-stock').textContent = list.filter(p => p.outOfStock || (p.stock||0) === 0).length);
  var val = list.reduce(function(s, p){ return s + ((p.price||0) * (p.stock||0)); }, 0);
  document.getElementById('inv-total-value') && (document.getElementById('inv-total-value').textContent = '₹' + val.toLocaleString('en-IN'));
  // Update sidebar badge
  var badge = document.getElementById('sb-low-badge');
  var lowCount = list.filter(p => (p.stock||0) > 0 && (p.stock||0) <= thresh).length;
  if (badge) { badge.textContent = lowCount; badge.style.display = lowCount > 0 ? '' : 'none'; }
}
window.loadInventoryStats = loadInventoryStats;

// ── Main render ──────────────────────────────────────────────
function renderInventory() {
  var tbody = document.getElementById('inventory-tbody');
  if (!tbody) return;
  var search = ((document.getElementById('inv-search')||{}).value||'').toLowerCase();
  var cat = (document.getElementById('inv-category-filter')||{}).value||'';
  var sf = (document.getElementById('inv-stock-filter')||{}).value||'';
  var thresh = (_settings && _settings.lowStockThreshold) || 10;

  var list = (window._allProducts||[]).filter(function(p) {
    if (p.hidden) return false;
    var ms = !search || (p.name||'').toLowerCase().includes(search) || (p.barcode||'').includes(search) || (p.category||'').toLowerCase().includes(search);
    var mc = !cat || (_catAlias[(p.category||'').toUpperCase()] || (p.category||'').toUpperCase()) === cat;
    var mst = true;
    if (sf === 'low') mst = (p.stock||0) > 0 && (p.stock||0) <= thresh;
    else if (sf === 'out') mst = p.outOfStock || (p.stock||0) === 0;
    else if (sf === 'instock') mst = !p.outOfStock && (p.stock||0) > 0;
    return ms && mc && mst;
  });

  var countEl = document.getElementById('inv-count');
  if (countEl) countEl.textContent = list.length + ' items';

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text2)"><div style="font-size:32px;margin-bottom:8px">📦</div><div style="font-weight:700">No products found</div></td></tr>';
    _updateInvBulkBar(); return;
  }

  // Group products by category
  var grouped = {};
  list.forEach(function(p) {
    var cat = p.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(p);
  });
  
  // Sort categories alphabetically
  var sortedCats = Object.keys(grouped).sort();
  
  var rows = [];
  sortedCats.forEach(function(cat) {
    var items = grouped[cat];
    // Add category header
    rows.push('<tr style="background:var(--bg3);border-bottom:2px solid var(--border)">'
      + '<td colspan="9" style="padding:12px 16px;font-weight:700;font-size:14px;color:var(--text)">'
      + '📂 ' + esc(cat) + ' (' + items.length + ' items)'
      + '</td></tr>');
    
    // Add products under this category
    items.forEach(function(p) {
      var st = p.stock||0;
      var isOut = p.outOfStock || st === 0;
      var isLow = !isOut && st <= thresh;
      var sc = isOut ? 'sp-out' : isLow ? 'sp-low' : 'sp-ok';
      var stxt = isOut ? '🔴 Out' : isLow ? '⚠ Low' : '✓ OK';
      var pct = Math.min(100, (st / Math.max(thresh*2, 50)) * 100);
      var raw = p.img||'';
      var imgUrl = raw.startsWith('http') ? raw : (raw ? 'images/' + raw.replace(/^\.\/?images\//,'') : 'images/nektaIcon.svg');
      var docId = p._docId||'';
      var sel = _invSelected.has(p.id||docId);
      rows.push('<tr style="' + (isOut ? 'opacity:.65' : '') + '">'
        + '<td><input type="checkbox" ' + (sel?'checked':'') + ' onchange="toggleInvSelect(\'' + (p.id||docId) + '\')" style="cursor:pointer;width:15px;height:15px"></td>'
        + '<td><div style="display:flex;align-items:center;gap:10px">'
        +   '<img src="' + imgUrl + '" onerror="this.src=\'images/nektaIcon.svg\'" style="width:44px;height:44px;border-radius:10px;object-fit:cover;background:var(--bg3);flex-shrink:0">'
        +   '<div><div style="font-weight:700;font-size:13px">' + esc(p.name||'') + '</div>'
        +   '<div style="font-size:10px;color:var(--text2);font-family:var(--mono)">' + (p.barcode||'No barcode') + ' · ' + esc(p.unit||'') + '</div></div>'
        + '</div></td>'
        + '<td style="font-size:12px">' + esc(p.category||'—') + '</td>'
        + '<td style="font-family:var(--mono);font-weight:700">₹' + (p.price||0) + '</td>'
        + '<td style="font-family:var(--mono);color:var(--text2)">' + (p.halfPrice ? '₹'+p.halfPrice : '—') + '</td>'
        + '<td style="text-align:center"><div style="display:flex;align-items:center;justify-content:center;gap:6px">'
        +   '<button onclick="quickStockInv(\'' + docId + '\',' + (p.id||'') + ',-1)" style="width:24px;height:24px;border-radius:6px;border:none;background:var(--bg3);color:var(--text);cursor:pointer;font-weight:700;font-size:14px">−</button>'
        +   '<span style="font-weight:900;font-size:14px;min-width:28px;text-align:center;color:' + (isOut?'var(--red)':isLow?'var(--yellow)':'var(--green)') + '">' + st + '</span>'
        +   '<button onclick="quickStockInv(\'' + docId + '\',' + (p.id||'') + ',1)" style="width:24px;height:24px;border-radius:6px;border:none;background:var(--bg3);color:var(--text);cursor:pointer;font-weight:700;font-size:14px">+</button>'
        + '</div></td>'
        + '<td><div class="stock-bar-wrap" style="min-width:60px"><div class="stock-bar"><div class="stock-bar-fill" style="width:'+pct+'%;background:'+(isOut?'var(--red)':isLow?'var(--yellow)':'var(--green)')+'"></div></div></div></td>'
        + '<td><span class="status-pill ' + sc + '">' + stxt + '</span></td>'
        + '<td><div style="display:flex;gap:4px">'
        +   '<button class="btn-sm bg-blue" onclick="openEditProduct(\'' + (p.id||'') + '\')">Edit</button>'
        +   '<button class="btn-sm bg-red" onclick="deleteProduct(\'' + docId + '\',' + JSON.stringify(p.name||'') + ')">Del</button>'
        + '</div></td>'
        + '</tr>');
    });
  });
  
  tbody.innerHTML = rows.join('');
  _updateInvBulkBar();
}
window.renderInventory = renderInventory;

// ── Quick stock +/- ──────────────────────────────────────────
async function quickStockInv(docId, seedId, change) {
  var all = window._allProducts || [];
  var p = all.find(function(x){ return x._docId===docId || x.id===seedId; });
  if (!p) return;
  var newSt = Math.max(0, (p.stock||0) + change);
  const update = { stock: newSt, lastStockUpdate: new Date().toISOString() };
  // Auto-clear outOfStock if stock > 0
  if (newSt > 0 && p.outOfStock) update.outOfStock = false;
  try {
    if (docId) {
      await window.db.collection('products').doc(docId).update(update);
    }
    // Also sync to app_overrides for instant user-side update
    const ovUpdate = { stock: newSt };
    if (update.outOfStock !== undefined) ovUpdate.outOfStock = update.outOfStock;
    await window.db.collection('app_overrides').doc('products')
      .set({ [String(p.id)]: ovUpdate }, { merge: true })
      .catch(()=>{});
    p.stock = newSt; if (update.outOfStock !== undefined) p.outOfStock = update.outOfStock;
    renderInventory(); loadInventoryStats();
  } catch(e) { toast('Stock update failed', 'error'); }
}
window.quickStockInv = quickStockInv;

// ── Selection / bulk bar ─────────────────────────────────────
function toggleInvSelect(id) {
  if (_invSelected.has(id)) _invSelected.delete(id); else _invSelected.add(id);
  _updateInvBulkBar();
}
window.toggleInvSelect = toggleInvSelect;

function toggleSelectAllInv(cb) {
  var list = window._allProducts||[];
  if (cb.checked) list.forEach(function(p){ _invSelected.add(p.id||p._docId); });
  else _invSelected.clear();
  renderInventory();
}
window.toggleSelectAllInv = toggleSelectAllInv;

function clearInvSelection() { _invSelected.clear(); renderInventory(); }
window.clearInvSelection = clearInvSelection;

async function bulkDeleteSelected() {
  if (_invSelected.size === 0) return;
  if (!confirm('Delete ' + _invSelected.size + ' selected products? This cannot be undone!')) return;
  var ids = Array.from(_invSelected);
  var ok = 0;
  for (var i = 0; i < ids.length; i++) {
    try {
      await window.db.collection('products').doc(ids[i]).delete();
      ok++;
    } catch(e) { console.warn('Delete failed:', ids[i], e.message); }
  }
  toast('Deleted ' + ok + ' products', 'success');
  _invSelected.clear();
  loadAllProducts();
}
window.bulkDeleteSelected = bulkDeleteSelected;

function _updateInvBulkBar() {
  var bar = document.getElementById('inv-bulk-bar');
  var cnt = document.getElementById('inv-bulk-count');
  if (!bar) return;
  if (_invSelected.size > 0) { bar.style.display = 'flex'; if (cnt) cnt.textContent = _invSelected.size + ' selected'; }
  else bar.style.display = 'none';
}

async function bulkUpdateStock() {
  var val = prompt('Enter new stock quantity for ' + _invSelected.size + ' selected items:');
  if (val === null || isNaN(val)) return;
  var n = Math.max(0, parseInt(val));
  var ids = Array.from(_invSelected);
  try {
    // Prepare batch update
    const batch = window.db.batch();
    const overrides = {};
    let updated = 0;
    
    for (var i = 0; i < ids.length; i++) {
      var selId = ids[i];
      var p = (window._allProducts||[]).find(function(x){ return String(x.id)===String(selId) || x._docId===selId; });
      if (!p) continue;

      var update = { stock: n, updatedAt: new Date().toISOString() };
      if (n > 0) update.outOfStock = false;

      // Only batch-update Firestore docs that have a real _docId
      if (p._docId) {
        batch.update(window.db.collection('products').doc(p._docId), update);
      }

      p.stock = n;
      if (n > 0) p.outOfStock = false;
      overrides[String(p.id)] = { stock: n, outOfStock: n > 0 ? false : !!p.outOfStock };
      updated++;
    }
    
    // Commit Firestore batch
    await batch.commit();
    
    // Sync to app_overrides for instant user-side update
    if (Object.keys(overrides).length > 0) {
      await window.db.collection('app_overrides').doc('products')
        .set(overrides, { merge: true })
        .catch(()=>{});
    }
    
    toast('✅ Updated stock for ' + updated + ' products', 'success');
    _invSelected.clear(); renderInventory(); loadInventoryStats();
  } catch(e) { toast('❌ Bulk update failed: ' + e.message, 'error'); }
}
window.bulkUpdateStock = bulkUpdateStock;

// ── Export ───────────────────────────────────────────────────
function exportInventory() {
  if (!window.XLSX) { toast('XLSX library not loaded', 'error'); return; }
  var data = (window._allProducts||[]).map(function(p){
    return {
      barcode:      p.barcode || p.id,
      name:         p.name        || '',
      teluguname:   p.teluguName  || '',
      category:     p.category    || '',
      price:        p.price       || 0,
      halfprice:    p.halfPrice   || '',
      quarterprice: p.quarterPrice|| '',
      slashedprice: p.slashedPrice|| '',
      stock:        p.stock       || 0,
      unit:         p.unit        || '',
      brand:        p.brand       || '',
      imageurl:     p.img         || '',
      description:  p.description || '',
      outofstock:   p.outOfStock  ? 'true' : 'false'
    };
  });
  var ws = XLSX.utils.json_to_sheet(data);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
  XLSX.writeFile(wb, 'nekta_inventory_' + new Date().toISOString().slice(0,10) + '.xlsx');
  toast('Inventory exported with all fields! ✅', 'success');
}
window.exportInventory = exportInventory;

// ── Bulk Upload (new products) ───────────────────────────────
function openBulkUpload() {
  showModal('<h3>&#128228; Bulk Upload — Add New Products</h3>'
    + '<p style="font-size:12px;color:var(--text2);margin-bottom:14px">Upload Excel/CSV. Required columns: barcode, name, category, price. <a href="#" onclick="downloadInvTemplate(\'upload\')" style="color:var(--green)">Download template</a></p>'
    + '<div style="border:2px dashed var(--border);border-radius:12px;padding:24px;text-align:center;margin-bottom:14px;cursor:pointer" onclick="document.getElementById(\'bu-file\').click()">'
    +   '<div style="font-size:32px;margin-bottom:8px">📄</div><div style="font-weight:700">Click to select Excel/CSV file</div>'
    +   '<div style="font-size:11px;color:var(--text2);margin-top:4px">.xlsx, .xls, .csv supported</div>'
    + '</div>'
    + '<input type="file" id="bu-file" style="display:none" accept=".xlsx,.xls,.csv" onchange="handleInvFile(this,\'upload\')">'
    + '<div id="bu-preview" style="display:none;margin-bottom:14px;font-size:12px;color:var(--text2)"></div>'
    + '<div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '<button class="btn-primary" id="bu-confirm" onclick="confirmBulkUpload()" disabled>Upload Products</button></div>'
  );
}
window.openBulkUpload = openBulkUpload;

// ── Bulk Update (edit existing) ──────────────────────────────
function openBulkUpdate() {
  showModal('<h3>&#128260; Bulk Update — Edit Existing Products</h3>'
    + '<p style="font-size:12px;color:var(--text2);margin-bottom:14px">Upload Excel with barcodes to update price, stock, name etc. <a href="#" onclick="downloadInvTemplate(\'update\')" style="color:var(--green)">Download template</a></p>'
    + '<div style="border:2px dashed var(--border);border-radius:12px;padding:24px;text-align:center;margin-bottom:14px;cursor:pointer" onclick="document.getElementById(\'upd-file\').click()">'
    +   '<div style="font-size:32px;margin-bottom:8px">📝</div><div style="font-weight:700">Click to select update file</div>'
    + '</div>'
    + '<input type="file" id="upd-file" style="display:none" accept=".xlsx,.xls,.csv" onchange="handleInvFile(this,\'update\')">'
    + '<div id="upd-preview" style="display:none;margin-bottom:14px;font-size:12px;color:var(--text2)"></div>'
    + '<div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '<button class="btn-primary" id="upd-confirm" onclick="confirmBulkUpdate()" disabled>Update Products</button></div>'
  );
}
window.openBulkUpdate = openBulkUpdate;

var _pendingUpload = [], _pendingUpdate = [];

function handleInvFile(input, type) {
  var file = input.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    if (!window.XLSX) { toast('XLSX library not loaded', 'error'); return; }
    var data = new Uint8Array(e.target.result);
    var wb = XLSX.read(data, { type: 'array' });
    var ws = wb.Sheets[wb.SheetNames[0]];
    var rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    var headers = (rows[0]||[]).map(function(h){ return String(h).toLowerCase().trim(); });
    var body = rows.slice(1).filter(function(r){ return r.some(function(c){ return c !== undefined && c !== ''; }); });
    var parsed = body.map(function(row) {
      var obj = {}; headers.forEach(function(h,i){ obj[h] = row[i]; }); return obj;
    });
    
    if (type === 'upload') {
      _pendingUpload = parsed;
      
      // Validate categories
      var validCats = window._allCategories || _builtinCats;
      var unknownCats = new Set();
      parsed.forEach(function(item) {
        var cat = (item.category || 'SNACKS').toUpperCase();
        if (!validCats.includes(cat)) unknownCats.add(cat);
      });
      
      var prev = document.getElementById('bu-preview');
      var msg = '✅ ' + parsed.length + ' products ready to upload';
      if (unknownCats.size > 0) {
        msg += ' ⚠️ Unknown categories: ' + Array.from(unknownCats).join(', ');
        if (prev) prev.style.color = 'var(--yellow)';
      }
      if (prev) { prev.style.display = ''; prev.textContent = msg; }
      var btn = document.getElementById('bu-confirm'); if (btn) btn.disabled = false;
    } else {
      _pendingUpdate = parsed;
      var prev2 = document.getElementById('upd-preview');
      if (prev2) { prev2.style.display = ''; prev2.textContent = '✅ ' + parsed.length + ' products ready to update'; }
      var btn2 = document.getElementById('upd-confirm'); if (btn2) btn2.disabled = false;
    }
  };
  reader.readAsArrayBuffer(file);
}
window.handleInvFile = handleInvFile;

async function confirmBulkUpload() {
  var btn = document.getElementById('bu-confirm'); if (btn) { btn.disabled = true; btn.textContent = 'Uploading...'; }
  var ok = 0, skip = 0;
  for (var i = 0; i < _pendingUpload.length; i++) {
    var item = _pendingUpload[i];
    var barcode = String(item.barcode||'').trim(); if (!barcode) { skip++; continue; }
    var product = {
      barcode:     barcode,
      name:        item.name        || 'Unnamed',
      teluguName:  item.teluguname  || item.teluguName || '',
      category:    (item.category   || 'SNACKS').toUpperCase(),
      price:       Number(item.price)  || 0,
      stock:       Number(item.stock)  || 0,
      unit:        item.unit        || 'pcs',
      brand:       item.brand       || '',
      img:         item.imageurl    || item.image_url || item.img || '',
      description: item.description || '',
      outOfStock:  String(item.outofstock||item.outOfStock||'false').toLowerCase() === 'true',
      createdAt:   new Date().toISOString(),
      updatedAt:   new Date().toISOString()
    };
    if (item.halfprice   !== undefined && item.halfprice   !== '') product.halfPrice    = Number(item.halfprice);
    if (item.halfPrice   !== undefined && item.halfPrice   !== '') product.halfPrice    = Number(item.halfPrice);
    if (item.quarterprice!== undefined && item.quarterprice!== '') product.quarterPrice = Number(item.quarterprice);
    if (item.quarterPrice!== undefined && item.quarterPrice!== '') product.quarterPrice = Number(item.quarterPrice);
    if (item.slashedprice!== undefined && item.slashedprice!== '') product.slashedPrice = Number(item.slashedprice);
    if (item.slashedPrice!== undefined && item.slashedPrice!== '') product.slashedPrice = Number(item.slashedPrice);
    // Remove empty string fields
    Object.keys(product).forEach(function(k){ if (product[k] === '') delete product[k]; });
    try { await window.db.collection('products').doc(barcode).set(product, { merge: true }); ok++; } catch(e) { skip++; }
  }
  toast('Uploaded: ' + ok + ' products' + (skip ? ', skipped: ' + skip : ''), ok > 0 ? 'success' : 'warning');
  closeModal(); loadAllProducts(); _pendingUpload = [];
}
window.confirmBulkUpload = confirmBulkUpload;

async function confirmBulkUpdate() {
  var btn = document.getElementById('upd-confirm'); if (btn) { btn.disabled = true; btn.textContent = 'Updating...'; }
  var ok = 0, notFound = 0;
  for (var i = 0; i < _pendingUpdate.length; i++) {
    var item = _pendingUpdate[i];
    var barcode = String(item.barcode||'').trim(); if (!barcode) continue;
    var updates = { updatedAt: new Date().toISOString() };
    if (item.name)        updates.name        = item.name;
    if (item.teluguname || item.teluguName)  updates.teluguName  = item.teluguname || item.teluguName;
    if (item.category)    updates.category    = item.category.toUpperCase();
    if (item.unit)        updates.unit        = item.unit;
    if (item.brand)       updates.brand       = item.brand;
    if (item.description) updates.description = item.description;
    if (item.price        !== undefined && item.price        !== '') updates.price        = Number(item.price);
    // halfPrice — if column present but empty → DELETE field so user app shows no 500g option
    if (item.halfprice !== undefined || item.halfPrice !== undefined) {
      var _hp = item.halfprice !== undefined ? item.halfprice : item.halfPrice;
      updates.halfPrice = (_hp !== '' && _hp !== null && _hp !== undefined && !isNaN(Number(_hp)) && Number(_hp) > 0)
        ? Number(_hp)
        : firebase.firestore.FieldValue.delete();
    }
    // quarterPrice — same logic
    if (item.quarterprice !== undefined || item.quarterPrice !== undefined) {
      var _qp = item.quarterprice !== undefined ? item.quarterprice : item.quarterPrice;
      updates.quarterPrice = (_qp !== '' && _qp !== null && _qp !== undefined && !isNaN(Number(_qp)) && Number(_qp) > 0)
        ? Number(_qp)
        : firebase.firestore.FieldValue.delete();
    }
    // slashedPrice — same logic
    if (item.slashedprice !== undefined || item.slashedPrice !== undefined) {
      var _sp = item.slashedprice !== undefined ? item.slashedprice : item.slashedPrice;
      updates.slashedPrice = (_sp !== '' && _sp !== null && _sp !== undefined && !isNaN(Number(_sp)) && Number(_sp) > 0)
        ? Number(_sp)
        : firebase.firestore.FieldValue.delete();
    }
    if (item.stock        !== undefined && item.stock        !== '') updates.stock        = Number(item.stock);
    if (item.imageurl || item.image_url || item.img) updates.img = item.imageurl || item.image_url || item.img;
    if (item.outofstock   !== undefined && item.outofstock   !== '') updates.outOfStock   = String(item.outofstock).toLowerCase() === 'true';
    if (item.outOfStock   !== undefined && item.outOfStock   !== '') updates.outOfStock   = String(item.outOfStock).toLowerCase() === 'true';
    try {
      var doc = await window.db.collection('products').doc(barcode).get();
      if (!doc.exists) { notFound++; continue; }
      await window.db.collection('products').doc(barcode).update(updates); ok++;
    } catch(e) { notFound++; }
  }
  toast('Updated: ' + ok + (notFound ? ', not found: ' + notFound : ''), 'success');
  closeModal(); loadAllProducts(); _pendingUpdate = [];
}
window.confirmBulkUpdate = confirmBulkUpdate;

function downloadInvTemplate(type) {
  if (!window.XLSX) { toast('XLSX not loaded', 'error'); return; }

  if (type === 'upload') {
    // Upload template — 2 example rows showing all columns
    var uploadRows = [
      { barcode:'8901030567475', name:'Aashirvaad Atta', teluguname:'ఆశీర్వాద్ అట్ట', category:'GRAINS', price:245, halfprice:125, quarterprice:'', slashedprice:'', stock:50, unit:'5kg', brand:'Aashirvaad', imageurl:'./images/Ragulu (Finger Millet).jpg', description:'Whole wheat flour', outofstock:'false' },
      { barcode:'8901030732439', name:'Tata Salt',       teluguname:'టాటా ఉప్పు',      category:'SPICES', price:28,  halfprice:'',  quarterprice:'', slashedprice:'', stock:100, unit:'1kg', brand:'Tata', imageurl:'./images/Chicken_Masala.jpg', description:'Iodized salt', outofstock:'false' }
    ];
    var ws = XLSX.utils.json_to_sheet(uploadRows);
    ws['!cols'] = Object.keys(uploadRows[0]).map(function(k){ return { wch: Math.min(Math.max(k.length, 12), 40) }; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Upload Template');
    XLSX.writeFile(wb, 'nekta_upload_template.xlsx');
    toast('Upload template downloaded!', 'success');
    return;
  }

  // UPDATE template — ALL products pre-filled
  // Collect from every possible source and deduplicate by id
  var seen = {};
  var allProds = [];
  var sources = [
    window._allProducts,
    window.allProducts,
    window.PRODUCT_SEED,
    (typeof _allProducts !== 'undefined' ? _allProducts : null),
    (typeof products !== 'undefined' ? products : null)
  ];
  sources.forEach(function(src) {
    if (!src || !Array.isArray(src)) return;
    src.forEach(function(p) {
      var key = String(p.barcode || p.id || '');
      if (key && !seen[key]) { seen[key] = true; allProds.push(p); }
    });
  });

  if (!allProds.length) {
    toast('Products not loaded yet — please wait a few seconds and try again.', 'warning');
    return;
  }

  var rows = allProds.map(function(p) {
    return {
      barcode:      String(p.barcode || p.id || ''),
      name:         p.name         || '',
      teluguname:   p.teluguName   || '',
      category:     p.category     || '',
      price:        p.price        !== undefined ? p.price        : '',
      halfprice:    p.halfPrice    !== undefined ? p.halfPrice    : '',
      quarterprice: p.quarterPrice !== undefined ? p.quarterPrice : '',
      slashedprice: p.slashedPrice !== undefined ? p.slashedPrice : '',
      stock:        p.stock        !== undefined ? p.stock        : '',
      unit:         p.unit         || '',
      brand:        p.brand        || '',
      imageurl:     p.img          || '',
      description:  p.description  || '',
      outofstock:   p.outOfStock   ? 'true' : 'false'
    };
  });

  var ws = XLSX.utils.json_to_sheet(rows);
  // Auto-fit columns
  var headers = Object.keys(rows[0]);
  ws['!cols'] = headers.map(function(h) {
    var max = h.length;
    rows.forEach(function(r) { var v = String(r[h] !== undefined ? r[h] : ''); if (v.length > max) max = v.length; });
    return { wch: Math.min(max + 2, 45) };
  });

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'All Products');
  XLSX.writeFile(wb, 'nekta_bulk_update_' + new Date().toISOString().slice(0,10) + '.xlsx');
  toast('✅ Downloaded ' + rows.length + ' products. Edit and re-upload to update.', 'success');
}
window.downloadInvTemplate = downloadInvTemplate;

// ═══════════════════════════════════════════════════════════════
// LIVE CONTROL CENTER
// Admin sees ALL users, ALL riders, ALL orders in real-time
// Full control: confirm, assign, call, WhatsApp, track, cancel
// ═══════════════════════════════════════════════════════════════

var _lcOrdersUnsub = null;
var _lcRidersUnsub = null;
var _lcRTDBListeners = {};

function initLiveControl() {
  renderLiveControl();
  updateLiveControlKPIs();
}
window.initLiveControl = initLiveControl;

// ── KPI strip update ─────────────────────────────────────────
function updateLiveControlKPIs() {
  var newOrds  = _allOrders.filter(function(o){ return o.status==='placed'; }).length;
  var active   = _allOrders.filter(function(o){ return ['placed','packing','assigned','picked'].includes(o.status); }).length;
  var online   = _allRiders.filter(function(r){ return r.status==='online'||r.status==='busy'; }).length;
  var deliver  = _allRiders.filter(function(r){ return r.status==='busy'; }).length;
  var today    = new Date(); today.setHours(0,0,0,0);
  var rev      = _allOrders.filter(function(o){ var t=o.createdAt&&o.createdAt.seconds?new Date(o.createdAt.seconds*1000):new Date(o.createdAt||0); return t>=today&&o.status==='delivered'; }).reduce(function(s,o){ return s+(o.totalPrice||0); },0);

  var set = function(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; };
  set('lc-new-orders',  newOrds);
  set('lc-active-orders', active);
  set('lc-riders-online', online);
  set('lc-delivering',  deliver);
  set('lc-revenue',    '₹'+rev.toLocaleString('en-IN'));

  // Live badge in sidebar
  var badge = document.getElementById('sb-live-badge');
  if (badge) { badge.textContent=newOrds; badge.style.display=newOrds>0?'':'none'; }

  // Update timestamp
  var ts = document.getElementById('lc-last-update');
  if (ts) ts.textContent = 'Last updated: ' + new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
window.updateLiveControlKPIs = updateLiveControlKPIs;

// ── Main render ──────────────────────────────────────────────
function renderLiveControl() {
  renderLCOrders();
  renderLCRiders();
  renderLCCustomers();
  updateLiveControlKPIs();
}
window.renderLiveControl = renderLiveControl;

// ── Active Orders panel ──────────────────────────────────────
function renderLCOrders() {
  var el = document.getElementById('lc-orders-list');
  if (!el) return;

  var active = _allOrders.filter(function(o){
    return ['placed','packing','assigned','picked'].includes(o.status);
  }).sort(function(a,b){
    var order = ['placed','packing','assigned','picked'];
    return order.indexOf(a.status) - order.indexOf(b.status);
  });

  if (!active.length) {
    el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text2)">'
      + '<div style="font-size:32px;margin-bottom:8px">✅</div>'
      + '<div style="font-weight:700;font-size:13px">All orders delivered!</div>'
      + '<div style="font-size:12px;margin-top:4px">No active orders right now</div></div>';
    return;
  }

  el.innerHTML = active.map(function(o) {
    var sm = statusMeta(o.status);
    var ts = o.createdAt&&o.createdAt.seconds ? new Date(o.createdAt.seconds*1000) : new Date(o.createdAt||0);
    var timeStr = isNaN(ts)?'—':ts.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    var items = Array.isArray(o.items) ? o.items.slice(0,3).map(function(i){ return i.name+' x'+i.qty; }).join(', ') : '';
    var isNew = o.status==='placed';

    var statusColors = {
      placed:'#ffd600', packing:'#3b82f6', assigned:'#f97316', picked:'#00b96b'
    };
    var borderColor = statusColors[o.status] || '#00e676';

    // Action buttons based on status
    var btns = '';
    if (o.status==='placed') {
      btns += '<button class="btn-sm bg-green" onclick="lcConfirmOrder(\''+o.id+'\')">✅ Confirm</button>';
    }
    if (o.status==='packing') {
      btns += '<button class="btn-sm bg-blue" onclick="openAssignRider(\''+o.id+'\')">🚴 Assign</button>';
    }
    if (o.status==='assigned' || o.status==='picked') {
      btns += '<button class="btn-sm bg-ghost" onclick="lcTrackOrder(\''+o.id+'\','+
        (o.latitude||0)+','+( o.longitude||0)+')">📍 Track</button>';
    }
    if (!['delivered','cancelled'].includes(o.status)) {
      btns += '<button class="btn-sm bg-red" onclick="cancelOrder(\''+o.id+'\')">✕</button>';
    }
    if (o.customerPhone) {
      btns += '<a href="https://wa.me/91'+o.customerPhone+'" target="_blank" class="btn-sm bg-ghost" style="text-decoration:none;color:var(--green)">💬</a>';
    }
    if (o.customerPhone) {
      btns += '<a href="tel:'+o.customerPhone+'" class="btn-sm bg-ghost" style="text-decoration:none">📞</a>';
    }

    return '<div style="background:var(--bg2);border:1px solid var(--border);border-left:3px solid '+borderColor+';border-radius:12px;padding:12px">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
      +   '<div style="display:flex;align-items:center;gap:8px">'
      +     (isNew?'<div style="width:8px;height:8px;border-radius:50%;background:#ef4444;animation:pulse 1s infinite;flex-shrink:0"></div>':'')
      +     '<span style="font-weight:800;font-size:13px;font-family:var(--mono)">#'+o.id.slice(-6).toUpperCase()+'</span>'
      +     '<span style="font-size:10px;font-weight:700;background:var(--bg3);padding:2px 8px;border-radius:8px;color:var(--text2)">'+sm.icon+' '+sm.label+'</span>'
      +   '</div>'
      +   '<span style="font-size:11px;color:var(--text2)">'+timeStr+' · <b style="color:var(--green)">₹'+(o.totalPrice||0)+'</b></span>'
      + '</div>'
      + '<div style="font-size:13px;font-weight:700;margin-bottom:4px">👤 '+esc(o.customerName||'—')+'</div>'
      + '<div style="font-size:11px;color:var(--text2);margin-bottom:6px">📞 '+esc(o.customerPhone||'—')
      +   (o.address?' · 📍 '+esc(o.address.substring(0,40))+'…':'')+'</div>'
      + (items?'<div style="font-size:11px;color:var(--text3);margin-bottom:8px">📦 '+esc(items)+(o.items&&o.items.length>3?' +more':'')+'</div>':'')
      + (o.riderName?'<div style="font-size:11px;font-weight:700;color:var(--orange);margin-bottom:6px">🛵 '+esc(o.riderName)+'</div>':'')
      + '<div style="display:flex;gap:5px;flex-wrap:wrap">'+btns+'</div>'
      + '</div>';
  }).join('');
}
window.renderLCOrders = renderLCOrders;

// ── Live Riders panel ────────────────────────────────────────
function renderLCRiders() {
  var el = document.getElementById('lc-riders-list');
  if (!el) return;

  if (!_allRiders.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text2);font-size:12px">No riders registered yet</div>';
    return;
  }

  var sorted = [..._allRiders].sort(function(a,b){
    var ao = (a.status==='online'||a.status==='busy')?1:0;
    var bo = (b.status==='online'||b.status==='busy')?1:0;
    return bo-ao;
  });

  el.innerHTML = sorted.map(function(r) {
    var isOnline  = r.status==='online';
    var isBusy    = r.status==='busy';
    var isOffline = !isOnline && !isBusy;
    var dotColor  = isOnline?'#00e676':isBusy?'#ffd600':'var(--text3)';
    var statusTxt = isOnline?'Online':isBusy?'Delivering':'Offline';

    // Find active order for this rider
    var riderOrder = _allOrders.find(function(o){
      return o.riderPhone===r.phone && ['assigned','picked'].includes(o.status);
    });

    return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:10px;display:flex;align-items:center;gap:10px">'
      + '<div style="width:38px;height:38px;border-radius:50%;background:'+(isOffline?'var(--bg4)':isOnline?'rgba(0,230,118,.2)':'rgba(255,214,0,.2)')+';display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:'+(isOffline?'var(--text3)':isOnline?'var(--green)':'var(--yellow)')+';flex-shrink:0">'+r.name[0].toUpperCase()+'</div>'
      + '<div style="flex:1;min-width:0">'
      +   '<div style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px">'
      +     esc(r.name)
      +     '<div style="width:7px;height:7px;border-radius:50%;background:'+dotColor+';flex-shrink:0'+(isOffline?'':';animation:pulse 1.5s infinite')+'" title="'+statusTxt+'"></div>'
      +   '</div>'
      +   '<div style="font-size:11px;color:var(--text2)">📞 '+r.phone+' · ₹'+(r.todayEarnings||0)+' today · '+(r.todayDeliveries||0)+' orders</div>'
      +   (riderOrder?'<div style="font-size:10px;font-weight:700;color:var(--orange);margin-top:2px">🛵 Delivering #'+riderOrder.id.slice(-6).toUpperCase()+' → '+esc((riderOrder.customerName||'').split(' ')[0])+'</div>':'')
      + '</div>'
      + '<div style="display:flex;gap:4px;flex-shrink:0">'
      +   '<a href="https://wa.me/91'+r.phone+'" target="_blank" class="btn-sm bg-ghost" style="text-decoration:none;padding:5px 8px">💬</a>'
      +   '<a href="tel:'+r.phone+'" class="btn-sm bg-ghost" style="text-decoration:none;padding:5px 8px">📞</a>'
      +   '<button class="btn-sm bg-blue" style="padding:5px 8px" onclick="openRiderDetail(\''+r.id+'\',\''+r.phone+'\',\''+esc(r.name)+'\')">👁</button>'
      + '</div>'
      + '</div>';
  }).join('');
}
window.renderLCRiders = renderLCRiders;

// ── Recent Customers panel ───────────────────────────────────
function renderLCCustomers() {
  var el = document.getElementById('lc-customers-list');
  if (!el) return;

  // Build customer map from all orders
  var custMap = {};
  _allOrders.forEach(function(o) {
    var ph = o.customerPhone||''; if (!ph) return;
    if (!custMap[ph]) custMap[ph] = { name:o.customerName||'—', phone:ph, orders:0, spent:0, last:null, lastStatus:null };
    custMap[ph].orders++;
    custMap[ph].spent += (o.totalPrice||0);
    var ts = o.createdAt&&o.createdAt.seconds?new Date(o.createdAt.seconds*1000):new Date(o.createdAt||0);
    if (!custMap[ph].last || ts > custMap[ph].last) { custMap[ph].last=ts; custMap[ph].lastStatus=o.status; }
  });

  var list = Object.values(custMap).sort(function(a,b){ return b.last-a.last; }).slice(0,15);

  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text2);font-size:12px">No customers yet</div>';
    return;
  }

  el.innerHTML = list.map(function(c) {
    var isActive = c.lastStatus && ['placed','packing','assigned','picked'].includes(c.lastStatus);
    return '<div style="background:var(--bg2);border:1px solid '+(isActive?'rgba(0,185,107,.3)':'var(--border)')+';border-radius:10px;padding:9px 12px;display:flex;align-items:center;gap:10px">'
      + '<div style="width:32px;height:32px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:var(--text2);flex-shrink:0">'+esc((c.name||'?')[0].toUpperCase())+'</div>'
      + '<div style="flex:1;min-width:0">'
      +   '<div style="font-size:12px;font-weight:700">'+esc(c.name)+(isActive?'<span style="font-size:10px;font-weight:800;color:var(--green);margin-left:6px;background:rgba(0,185,107,.1);padding:1px 6px;border-radius:6px">● Active</span>':'')+'</div>'
      +   '<div style="font-size:11px;color:var(--text2)">'+c.phone+' · '+c.orders+' orders · ₹'+c.spent.toLocaleString('en-IN')+'</div>'
      + '</div>'
      + '<div style="display:flex;gap:4px;flex-shrink:0">'
      +   '<a href="https://wa.me/91'+c.phone+'" target="_blank" class="btn-sm bg-ghost" style="text-decoration:none;padding:4px 8px;font-size:13px">💬</a>'
      +   '<a href="tel:'+c.phone+'" class="btn-sm bg-ghost" style="text-decoration:none;padding:4px 8px;font-size:13px">📞</a>'
      + '</div>'
      + '</div>';
  }).join('');
}
window.renderLCCustomers = renderLCCustomers;

// ── Quick action: Confirm from Live Control ──────────────────
async function lcConfirmOrder(id) {
  var o = _allOrders.find(function(x){ return x.id === id; }) || {};
  if (o.shopId && o.status === 'placed') {
    toast('This shop order is waiting for seller confirmation first', 'warning');
    return;
  }
  var ok = await window.db.collection('orders').doc(id).update({
    status:'packing', updatedAt:new Date().toISOString(),
    statusHistory:firebase.firestore.FieldValue.arrayUnion({status:'packing',ts:new Date().toISOString()})
  }).then(function(){ return true; }).catch(function(e){ toast(e.message,'error'); return false; });
  stopDashAlarm();
  if (ok) {
    toast('Order confirmed ✅','success');
    try {
      var snap = await window.db.collection('orders').doc(id).get();
      if (snap.exists) {
        var od = snap.data();
        var ph = (od.customerPhone||'').replace(/\D/g,'');
        if (ph.length>=10) {
          window.open('https://wa.me/91'+ph+'?text='+encodeURIComponent('Hi '+( od.customerName||'')+'! Your Nekta order #'+id.slice(-6).toUpperCase()+' confirmed. Packing now! ✅'),'_blank');
        }
      }
    } catch(e) {}
  }
}
window.lcConfirmOrder = lcConfirmOrder;

// ── Track order on Google/Leaflet map ───────────────────────
function lcTrackOrder(orderId, lat, lng) {
  if (lat && lng) {
    window.open('https://maps.google.com/?q='+lat+','+lng,'_blank');
  } else {
    window.open('tracking.html?orderId='+orderId,'_blank');
  }
}
window.lcTrackOrder = lcTrackOrder;

// ── Refresh ──────────────────────────────────────────────────
function refreshLiveControl() {
  renderLiveControl();
  toast('Live Control refreshed','success');
}
window.refreshLiveControl = refreshLiveControl;

// ── Broadcast modal ──────────────────────────────────────────
function openBroadcast() {
  showModal('<h3>&#128226; Broadcast Message</h3>'
    + '<p style="font-size:12px;color:var(--text2);margin-bottom:14px">Send announcement to all customers. Shows as a banner in the app.</p>'
    + '<div class="form-group"><label>Message</label>'
    + '<textarea id="bc-msg" rows="3" placeholder="e.g. Store closed today. Will reopen tomorrow at 8 AM."></textarea></div>'
    + '<div class="form-group"><label>Type</label>'
    + '<select id="bc-type" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text);font-family:var(--font)">'
    + '<option value="info">ℹ️ Info</option>'
    + '<option value="warning">⚠️ Warning</option>'
    + '<option value="success">✅ Good News</option>'
    + '<option value="error">🚨 Urgent</option>'
    + '</select></div>'
    + '<div class="modal-footer">'
    + '<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '<button class="btn-primary" onclick="sendBroadcastMsg()">&#128226; Send Broadcast</button>'
    + '</div>'
  );
}
window.openBroadcast = openBroadcast;

async function sendBroadcastMsg() {
  var msg = (document.getElementById('bc-msg')||{}).value?.trim();
  var type = (document.getElementById('bc-type')||{}).value || 'info';
  if (!msg) { toast('Enter a message', 'error'); return; }
  await window.db.collection('app_overrides').doc('settings').set({
    announcementBanner: { on: true, text: msg, type: type, sentAt: new Date().toISOString() }
  }, { merge: true })
    .then(function() { closeModal(); toast('✅ Broadcast sent to all customers!', 'success'); })
    .catch(function(e) { toast('Failed: ' + e.message, 'error'); });
}
window.sendBroadcastMsg = sendBroadcastMsg;


// ═══════════════════════════════════════════════════════════════
// CATEGORY MANAGEMENT
// Admin can add/delete custom categories — syncs to user side
// ═══════════════════════════════════════════════════════════════

var _builtinCats = [
  'VEGETABLES','LEAFY','FRUITS','DAIRY','GRAINS','DALS','OILS','SPICES',
  'CONDIMENTS','PICKLES','SNACKS','CHOCOLATES','ICECREAMS','DRINKS','NONVEG',
  'EASYCOOK','COMBOS','PERSONALCARE','CLEANING','PUJA','PANSHOP'
];

// Load custom categories from Firestore and merge with builtins
var _customCatsListener = null;
async function loadAllCategories() {
  try {
    const doc = await window.db.collection('app_overrides').doc('custom_categories').get();
    const custom = doc.exists ? (doc.data().list || []) : [];
    window._allCategories = [..._builtinCats, ...custom.filter(c => !_builtinCats.includes(c.toUpperCase()))];
    // Refresh category dropdowns in inventory filter
    _refreshCatDropdowns();
  } catch(e) { window._allCategories = [..._builtinCats]; }
}

// Start REAL-TIME listener for custom categories (so changes show immediately)
function startCustomCategoriesListener() {
  if (_customCatsListener || !window.db) return;
  _customCatsListener = window.db.collection('app_overrides').doc('custom_categories').onSnapshot(
    function(doc) {
      // Whenever custom_categories doc changes, reload categories
      loadAllCategories();
    },
    function(err) { console.warn('Custom categories listener error:', err.message); }
  );
}
window.loadAllCategories = loadAllCategories;
window.startCustomCategoriesListener = startCustomCategoriesListener;

function _refreshCatDropdowns() {
  // Get categories from multiple sources: user-defined + product actual categories
  const cats = window._allCategories || _builtinCats;
  
  // Also include any actual category from products not in our list
  const productCats = new Set((window._allProducts || []).map(p => (p.category || '').toUpperCase()).filter(c => c));
  const allCats = [...new Set([...cats, ...Array.from(productCats)])];
  allCats.sort();
  
  // Inventory filter dropdown
  const sel = document.getElementById('inv-category-filter');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = '<option value="">All Categories</option>' +
      allCats.map(c => '<option value="'+c+'"'+(c===cur?' selected':'')+'>'+c+'</option>').join('');
  }
}

function openManageCategories() {
  const cats = window._allCategories || _builtinCats;
  const customCats = cats.filter(c => !_builtinCats.includes(c));

  const builtinHtml = _builtinCats.map(c =>
    '<div style="display:inline-flex;align-items:center;gap:6px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:5px 12px;font-size:12px;font-weight:600;color:var(--text2);margin:3px">'
    + c + '</div>'
  ).join('');

  const customHtml = customCats.length
    ? customCats.map(c =>
        '<div style="display:inline-flex;align-items:center;gap:8px;background:rgba(213,0,249,.1);border:1px solid rgba(213,0,249,.3);border-radius:8px;padding:5px 12px;font-size:12px;font-weight:700;color:#e040fb;margin:3px">'
        + c
        + '<button onclick="deleteCustomCategory(\''+c+'\')" style="background:none;border:none;color:#e040fb;cursor:pointer;font-size:14px;line-height:1;padding:0">✕</button>'
        + '</div>'
      ).join('')
    : '<p style="font-size:12px;color:var(--text2)">No custom categories yet</p>';

  showModal(
    '<h3>&#127991; Manage Categories</h3>'
    + '<p style="font-size:12px;color:var(--text2);margin-bottom:16px">Custom categories appear on the user app alongside built-in ones.</p>'

    + '<div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Built-in (cannot delete)</div>'
    + '<div style="margin-bottom:16px">'+builtinHtml+'</div>'

    + '<div style="font-size:11px;font-weight:700;color:#e040fb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Custom Categories</div>'
    + '<div id="custom-cats-list" style="margin-bottom:16px">'+customHtml+'</div>'

    + '<div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Add New Category</div>'
    + '<div style="display:flex;gap:8px;margin-bottom:8px">'
    +   '<input id="new-cat-name" placeholder="e.g. BEVERAGES" style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 14px;color:var(--text);font-family:var(--font);font-size:13px;outline:none;text-transform:uppercase" oninput="this.value=this.value.toUpperCase()">'
    +   '<input id="new-cat-emoji" placeholder="🧃" style="width:60px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text);font-family:var(--font);font-size:18px;outline:none;text-align:center">'
    + '</div>'
    + '<div style="font-size:11px;color:var(--text2);margin-bottom:14px">Use UPPERCASE letters only. Emoji is optional but recommended for user app display.</div>'
    + '<div class="modal-footer">'
    +   '<button class="btn-ghost" onclick="closeModal()">Close</button>'
    +   '<button class="btn-primary" onclick="saveCustomCategory()">&#10133; Add Category</button>'
    + '</div>'
  );
}
window.openManageCategories = openManageCategories;

async function saveCustomCategory() {
  const name  = (document.getElementById('new-cat-name')||{}).value?.trim().toUpperCase();
  const emoji = (document.getElementById('new-cat-emoji')||{}).value?.trim() || '🏷️';
  if (!name) { toast('Enter a category name','error'); return; }
  if (!/^[A-Z0-9_]+$/.test(name)) { toast('Use uppercase letters only (A-Z)','error'); return; }
  if ((window._allCategories||_builtinCats).includes(name)) { toast('Category already exists','error'); return; }

  try {
    const doc = await window.db.collection('app_overrides').doc('custom_categories').get();
    const existing = doc.exists ? (doc.data().list || []) : [];
    const existingEmojis = doc.exists ? (doc.data().emojis || {}) : {};
    existing.push(name);
    existingEmojis[name] = emoji;
    await window.db.collection('app_overrides').doc('custom_categories').set({ list: existing, emojis: existingEmojis }, { merge: false });
    toast('✅ Category "'+name+'" added — visible on user app now!','success');
    await loadAllCategories();
    closeModal();
    openManageCategories();
  } catch(e) { toast('Error: '+e.message,'error'); }
}
window.saveCustomCategory = saveCustomCategory;

async function deleteCustomCategory(name) {
  if (!confirm('Delete category "'+name+'"?\n\nProducts in this category will still exist but won\'t show in the category filter.')) return;
  try {
    const doc = await window.db.collection('app_overrides').doc('custom_categories').get();
    const existing = doc.exists ? (doc.data().list || []) : [];
    const existingEmojis = doc.exists ? (doc.data().emojis || {}) : {};
    const updated = existing.filter(c => c !== name);
    delete existingEmojis[name];
    await window.db.collection('app_overrides').doc('custom_categories').set({ list: updated, emojis: existingEmojis }, { merge: false });
    toast('Category "'+name+'" deleted','info');
    await loadAllCategories();
    closeModal();
    openManageCategories();
  } catch(e) { toast('Error: '+e.message,'error'); }
}
window.deleteCustomCategory = deleteCustomCategory;

// ═══════════════════════════════════════════════════════════════
// INVENTORY — EXTRA FEATURES
// 1. Sort columns
// 2. Duplicate product
// 3. Hide / Show product
// 4. Price history
// 5. Per-product low stock threshold
// 6. Restock reminder
// 7. Image preview
// ═══════════════════════════════════════════════════════════════

// ── 1. SORT ──────────────────────────────────────────────────
var _invSortCol = '';
var _invSortDir = 1; // 1 = asc, -1 = desc

function sortInventory(col) {
  if (_invSortCol === col) {
    _invSortDir *= -1;
  } else {
    _invSortCol = col;
    _invSortDir = 1;
  }
  // Update header arrows
  ['name','category','price','stock','status'].forEach(function(c) {
    var el = document.getElementById('sort-' + c);
    if (!el) return;
    el.textContent = c === col ? (_invSortDir === 1 ? '▲' : '▼') : '';
  });
  renderInventory();
}
window.sortInventory = sortInventory;

// Patch renderInventory to apply sort before rendering
var _origRenderInventory = window.renderInventory;
window.renderInventory = function() {
  if (_invSortCol && window._allProducts) {
    window._allProducts.sort(function(a, b) {
      var av, bv;
      if (_invSortCol === 'name')     { av = (a.name||'').toLowerCase();     bv = (b.name||'').toLowerCase(); }
      if (_invSortCol === 'category') { av = (a.category||'').toLowerCase(); bv = (b.category||'').toLowerCase(); }
      if (_invSortCol === 'price')    { av = a.price||0;                     bv = b.price||0; }
      if (_invSortCol === 'stock')    { av = a.stock||0;                     bv = b.stock||0; }
      if (_invSortCol === 'status')   { av = a.outOfStock?1:0;               bv = b.outOfStock?1:0; }
      if (av < bv) return -1 * _invSortDir;
      if (av > bv) return  1 * _invSortDir;
      return 0;
    });
  }
  if (_origRenderInventory) _origRenderInventory();
};

// ── 2. DUPLICATE PRODUCT ─────────────────────────────────────
async function duplicateProduct(pid) {
  var p = (window._allProducts||[]).find(function(x){ return x.id == pid; });
  if (!p) return;
  if (!confirm('Duplicate "' + p.name + '"?')) return;
  var copy = Object.assign({}, p);
  delete copy._docId;
  copy.id   = Date.now();
  copy.name = p.name + ' (Copy)';
  copy.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  try {
    await window.db.collection('products').add(copy);
    toast('✅ Duplicated — edit the copy now', 'success');
    loadAllProducts();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}
window.duplicateProduct = duplicateProduct;

// ── 3. HIDE / SHOW PRODUCT ───────────────────────────────────
async function toggleHideProduct(docId, pid, currentlyHidden) {
  var newVal = !currentlyHidden;
  try {
    // Save in app_overrides so it survives seed reloads
    await window.db.collection('app_overrides').doc('products')
      .set({ [String(pid)]: { hidden: newVal } }, { merge: true });
    if (docId) await window.db.collection('products').doc(docId)
      .update({ hidden: newVal }).catch(function(){});
    toast(newVal ? '🙈 Product hidden from customers' : '👁 Product visible to customers', 'info');
    loadAllProducts();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}
window.toggleHideProduct = toggleHideProduct;

// ── 4. PRICE HISTORY ─────────────────────────────────────────
async function openPriceHistory(pid, productName) {
  showModal(
    '<h3>📈 Price History — ' + esc(productName) + '</h3>'
    + '<div id="ph-body" style="margin-top:12px"><div style="text-align:center;padding:20px;color:var(--text2)">Loading...</div></div>'
  );
  try {
    var snap = await window.db.collection('price_history')
      .where('productId', '==', String(pid))
      .orderBy('changedAt', 'desc').limit(20).get()
      .catch(function() {
        return window.db.collection('price_history').where('productId', '==', String(pid)).get();
      });
    var el = document.getElementById('ph-body');
    if (!el) return;
    if (snap.empty) {
      el.innerHTML = '<p style="color:var(--text2);font-size:13px;padding:8px 0">No price history recorded yet.<br><span style="font-size:11px">Price changes will be tracked from now on when you edit this product.</span></p>';
      return;
    }
    var rows = snap.docs.map(function(d) { return d.data(); })
      .sort(function(a,b){ return (b.changedAt||'') > (a.changedAt||'') ? 1 : -1; });
    el.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:13px">'
      + '<thead><tr>'
      + '<th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);color:var(--text2);font-size:11px">Date</th>'
      + '<th style="text-align:right;padding:8px;border-bottom:1px solid var(--border);color:var(--text2);font-size:11px">Old Price</th>'
      + '<th style="text-align:right;padding:8px;border-bottom:1px solid var(--border);color:var(--text2);font-size:11px">New Price</th>'
      + '<th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);color:var(--text2);font-size:11px">Changed By</th>'
      + '</tr></thead><tbody>'
      + rows.map(function(r) {
          var ts = r.changedAt ? new Date(r.changedAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
          var diff = (r.newPrice||0) - (r.oldPrice||0);
          var color = diff > 0 ? 'var(--red)' : diff < 0 ? 'var(--green)' : 'var(--text2)';
          var arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '—';
          return '<tr>'
            + '<td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.03);font-size:12px;color:var(--text2)">' + ts + '</td>'
            + '<td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.03);text-align:right;font-family:var(--mono)">₹' + (r.oldPrice||0) + '</td>'
            + '<td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.03);text-align:right;font-family:var(--mono);color:' + color + '">' + arrow + ' ₹' + (r.newPrice||0) + '</td>'
            + '<td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.03);font-size:11px;color:var(--text2)">' + esc(r.changedBy||'Admin') + '</td>'
            + '</tr>';
        }).join('')
      + '</tbody></table>';
  } catch(e) {
    var el2 = document.getElementById('ph-body');
    if (el2) el2.innerHTML = '<p style="color:var(--red)">Error: ' + esc(e.message) + '</p>';
  }
}
window.openPriceHistory = openPriceHistory;

// Record price change whenever saveEditProduct is called — patch it
var _origSaveEditProduct = window.saveEditProduct;
window.saveEditProduct = async function(pid) {
  // Find old price before saving
  var p = (window._allProducts||[]).find(function(x){ return x.id == pid; });
  var oldPrice = p ? (p.price||0) : null;
  await _origSaveEditProduct(pid);
  // After save, check if price changed
  if (oldPrice !== null) {
    var pNew = (window._allProducts||[]).find(function(x){ return x.id == pid; });
    var newPrice = pNew ? (pNew.price||0) : null;
    if (newPrice !== null && newPrice !== oldPrice) {
      window.db.collection('price_history').add({
        productId:  String(pid),
        productName: p.name || '',
        oldPrice:   oldPrice,
        newPrice:   newPrice,
        changedAt:  new Date().toISOString(),
        changedBy:  'Admin'
      }).catch(function(){});
    }
  }
};

// ── 5. PER-PRODUCT LOW STOCK THRESHOLD ───────────────────────
function openSetLowStockThreshold(docId, pid, productName, currentThreshold) {
  showModal(
    '<h3>⚠️ Low Stock Alert — ' + esc(productName) + '</h3>'
    + '<p style="font-size:12px;color:var(--text2);margin-bottom:16px">Set a custom alert threshold for this product. When stock falls below this number, it shows as Low Stock.</p>'
    + '<div class="form-group"><label>Alert when stock below</label>'
    + '<input id="lst-val" type="number" min="0" value="' + (currentThreshold||10) + '" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 14px;color:var(--text);font-family:var(--font);font-size:14px;width:100%;outline:none">'
    + '</div>'
    + '<p style="font-size:11px;color:var(--text2);margin-bottom:14px">Global default is ' + ((_settings&&_settings.lowStockThreshold)||10) + ' units. Leave blank to use global.</p>'
    + '<div class="modal-footer">'
    + '<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '<button class="btn-primary" onclick="saveLowStockThreshold(\'' + docId + '\',' + pid + ')">Save</button>'
    + '</div>'
  );
}
window.openSetLowStockThreshold = openSetLowStockThreshold;

async function saveLowStockThreshold(docId, pid) {
  var val = parseInt((document.getElementById('lst-val')||{}).value);
  if (isNaN(val) || val < 0) { toast('Enter a valid number', 'error'); return; }
  try {
    await window.db.collection('app_overrides').doc('products')
      .set({ [String(pid)]: { lowStockThreshold: val } }, { merge: true });
    if (docId) await window.db.collection('products').doc(docId)
      .update({ lowStockThreshold: val }).catch(function(){});
    closeModal();
    toast('✅ Alert set — will warn when stock < ' + val, 'success');
    loadAllProducts();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}
window.saveLowStockThreshold = saveLowStockThreshold;

// ── 6. RESTOCK REMINDER ──────────────────────────────────────
async function toggleRestockReminder(docId, pid, productName, currentlyFlagged) {
  var newVal = !currentlyFlagged;
  try {
    await window.db.collection('app_overrides').doc('products')
      .set({ [String(pid)]: { restockNeeded: newVal } }, { merge: true });
    if (docId) await window.db.collection('products').doc(docId)
      .update({ restockNeeded: newVal }).catch(function(){});
    toast(newVal ? '🛒 "' + productName + '" flagged for restock' : '✅ Restock flag removed', newVal ? 'warning' : 'success');
    loadAllProducts();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}
window.toggleRestockReminder = toggleRestockReminder;

// Show restock list
function openRestockList() {
  var list = (window._allProducts||[]).filter(function(p){ return p.restockNeeded; });
  if (!list.length) { toast('No products flagged for restock', 'info'); return; }
  showModal(
    '<h3>🛒 Restock Reminder List (' + list.length + ')</h3>'
    + '<p style="font-size:12px;color:var(--text2);margin-bottom:14px">These products are flagged for restock.</p>'
    + list.map(function(p) {
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">'
          + '<div><div style="font-size:13px;font-weight:600">' + esc(p.name||'') + '</div>'
          + '<div style="font-size:11px;color:var(--text2)">' + esc(p.category||'') + ' · Stock: ' + (p.stock||0) + '</div></div>'
          + '<button class="btn-sm bg-green" onclick="toggleRestockReminder(\'' + (p._docId||'') + '\',' + p.id + ',\'' + esc(p.name||'') + '\',true);closeModal()">✅ Done</button>'
          + '</div>';
      }).join('')
    + '<div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Close</button></div>'
  );
}
window.openRestockList = openRestockList;

// ── 7. IMAGE PREVIEW ─────────────────────────────────────────
function previewProductImage(imgSrc, productName) {
  showModal(
    '<h3>🖼️ ' + esc(productName) + '</h3>'
    + '<div style="text-align:center;padding:8px 0">'
    + '<img src="' + imgSrc + '" onerror="this.src=\'images/nektaIcon.svg\'" '
    + 'style="max-width:100%;max-height:400px;border-radius:14px;object-fit:contain;background:var(--bg3)">'
    + '</div>'
    + '<div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Close</button></div>'
  );
}
window.previewProductImage = previewProductImage;

// ── PATCH renderInventory to add new action buttons ──────────
// Override the tbody rendering to inject new buttons into each row
var _patchedInv = false;
(function patchInvRender() {
  if (_patchedInv) return;
  _patchedInv = true;

  var _baseRender = window.renderInventory;
  window.renderInventory = function() {
    _baseRender();
    // After base render, patch each row's action cell
    var tbody = document.getElementById('inventory-tbody');
    if (!tbody) return;
    var rows = tbody.querySelectorAll('tr');
    rows.forEach(function(tr) {
      // Find the Edit button to get pid
      var editBtn = tr.querySelector('button[onclick*="openEditProduct"]');
      if (!editBtn) return;
      var match = editBtn.getAttribute('onclick').match(/openEditProduct\('?([^')]+)'?\)/);
      if (!match) return;
      var pid = match[1];
      var p = (window._allProducts||[]).find(function(x){ return String(x.id) === String(pid); });
      if (!p) return;
      var docId = p._docId || '';
      var isHidden = !!p.hidden;
      var isRestock = !!p.restockNeeded;
      var thresh = p.lowStockThreshold !== undefined ? p.lowStockThreshold : ((_settings&&_settings.lowStockThreshold)||10);
      var imgSrc = p.img ? (p.img.startsWith('http') ? p.img : p.img.replace('./','')) : 'images/nektaIcon.svg';

      // Patch image cell to be clickable
      var imgEl = tr.querySelector('img');
      if (imgEl && !imgEl.getAttribute('data-preview-patched')) {
        imgEl.setAttribute('data-preview-patched','1');
        imgEl.style.cursor = 'pointer';
        imgEl.title = 'Click to preview';
        imgEl.onclick = function(e) {
          e.stopPropagation();
          previewProductImage(imgSrc, p.name||'');
        };
      }

      // Patch action cell — add new buttons
      var actionCell = tr.querySelector('td:last-child div');
      if (!actionCell || actionCell.getAttribute('data-patched')) return;
      actionCell.setAttribute('data-patched','1');

      // Duplicate
      var dupBtn = document.createElement('button');
      dupBtn.className = 'btn-sm bg-ghost';
      dupBtn.title = 'Duplicate product';
      dupBtn.textContent = '⧉';
      dupBtn.onclick = function(){ duplicateProduct(pid); };
      actionCell.appendChild(dupBtn);

      // Hide/Show
      var hideBtn = document.createElement('button');
      hideBtn.className = 'btn-sm bg-ghost';
      hideBtn.title = isHidden ? 'Show to customers' : 'Hide from customers';
      hideBtn.textContent = isHidden ? '👁' : '🙈';
      hideBtn.style.color = isHidden ? 'var(--green)' : 'var(--text2)';
      hideBtn.onclick = function(){ toggleHideProduct(docId, pid, isHidden); };
      actionCell.appendChild(hideBtn);

      // Restock flag
      var restockBtn = document.createElement('button');
      restockBtn.className = 'btn-sm bg-ghost';
      restockBtn.title = isRestock ? 'Remove restock flag' : 'Flag for restock';
      restockBtn.textContent = '🛒';
      restockBtn.style.color = isRestock ? 'var(--yellow)' : 'var(--text2)';
      restockBtn.onclick = function(){ toggleRestockReminder(docId, pid, p.name||'', isRestock); };
      actionCell.appendChild(restockBtn);

      // Price history
      var histBtn = document.createElement('button');
      histBtn.className = 'btn-sm bg-ghost';
      histBtn.title = 'Price history';
      histBtn.textContent = '📈';
      histBtn.onclick = function(){ openPriceHistory(pid, p.name||''); };
      actionCell.appendChild(histBtn);

      // Low stock threshold
      var lstBtn = document.createElement('button');
      lstBtn.className = 'btn-sm bg-ghost';
      lstBtn.title = 'Set low stock alert (current: ' + thresh + ')';
      lstBtn.textContent = '⚠️';
      lstBtn.onclick = function(){ openSetLowStockThreshold(docId, pid, p.name||'', thresh); };
      actionCell.appendChild(lstBtn);
    });
  };
})();

// Bulk restock all out-of-stock items with 100 units
async function restockAllOutOfStock() {
  var list = (window._allProducts||[]).filter(function(p){ return p.outOfStock || (p.stock||0) === 0; });
  if (!list.length) { toast('No out-of-stock items', 'info'); return; }
  if (!confirm('Add 100 units to ' + list.length + ' out-of-stock items? They will be marked as in-stock.')) return;
  
  try {
    const batch = window.db.batch();
    const overrides = {};
    let updated = 0;
    
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p._docId) continue;
      
      var update = { stock: 100, outOfStock: false, restockedAt: new Date().toISOString() };
      batch.update(window.db.collection('products').doc(p._docId), update);
      
      p.stock = 100;
      p.outOfStock = false;
      overrides[String(p.id)] = { stock: 100, outOfStock: false };
      updated++;
    }
    
    // Commit Firestore batch
    if (updated > 0) {
      await batch.commit();
      
      // Sync to app_overrides for instant user-side update
      if (Object.keys(overrides).length > 0) {
        await window.db.collection('app_overrides').doc('products')
          .set(overrides, { merge: true })
          .catch(()=>{});
      }
    }
    
    toast('✅ Restocked ' + updated + ' out-of-stock items with 100 units each!', 'success');
    renderInventory(); loadInventoryStats();
  } catch(e) { toast('❌ Restock failed: ' + e.message, 'error'); }
}
window.restockAllOutOfStock = restockAllOutOfStock;

// Add Restock buttons to inventory header
(function addRestockBtn() {
  var inv = document.getElementById('page-inventory');
  if (!inv) { setTimeout(addRestockBtn, 500); return; }
  var hdr = inv.querySelector('div > div');
  if (!hdr) return;
  
  // Get out of stock count
  var outOfStockCount = (window._allProducts||[]).filter(function(p){ return p.outOfStock || (p.stock||0) === 0; }).length;
  
  // Restock All Out of Stock button
  var btn1 = document.createElement('button');
  btn1.className = 'btn-sm';
  btn1.style.cssText = 'background:rgba(34,197,94,.15);color:var(--green);border:1px solid rgba(34,197,94,.3);margin-right:6px';
  btn1.innerHTML = '📦 Restock Out of Stock (' + outOfStockCount + ')';
  btn1.onclick = restockAllOutOfStock;
  hdr.appendChild(btn1);
  
  // Restock List button (for manual flagged items)
  var btn2 = document.createElement('button');
  btn2.className = 'btn-sm';
  btn2.style.cssText = 'background:rgba(255,214,0,.15);color:var(--yellow);border:1px solid rgba(255,214,0,.3)';
  btn2.innerHTML = '🛒 Restock List';
  btn2.onclick = openRestockList;
  hdr.appendChild(btn2);
})();

// ═══════════════════════════════════════════════════════════════
// MULTI-VENDOR — Shops & Sellers (Master Admin)
// ═══════════════════════════════════════════════════════════════

var _adminShops   = [];
var _adminSellers = [];

// ── Render Shops page ─────────────────────────────────────────
async function renderShopsAdmin() {
  var listEl = document.getElementById('shops-admin-list');
  if (!listEl) return;
  listEl.innerHTML = '<p style="color:var(--text3);font-size:13px;text-align:center;padding:20px">Loading…</p>';

  // Platform analytics
  try {
    var today = new Date(); today.setHours(0,0,0,0);
    var [ordSnap, shopSnap, riderSnap] = await Promise.all([
      db.collection('orders').where('createdAt','>=',firebase.firestore.Timestamp.fromDate(today)).get(),
      db.collection('shops').get(),
      db.collection('riders').get()
    ]);
    var totalRev = ordSnap.docs.reduce(function(s,d){ return s+(d.data().totalPrice||0); }, 0);
    var activeShops = shopSnap.docs.filter(function(d){ return d.data().online; }).length;
    var onlineRiders = riderSnap.docs.filter(function(d){ return d.data().isActive||d.data().online; }).length;
    var set = function(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; };
    set('pk-rev',    '₹'+totalRev.toLocaleString('en-IN'));
    set('pk-ord',    ordSnap.size);
    set('pk-shops',  activeShops+'/'+shopSnap.size);
    set('pk-riders-count', onlineRiders+'/'+riderSnap.size);

    // Build shop stats map
    var shopStats = {};
    ordSnap.docs.forEach(function(d){
      var o = d.data();
      var sids = o.shopId ? [o.shopId] : [];
      sids.forEach(function(sid){
        if(!shopStats[sid]) shopStats[sid]={orders:0,revenue:0};
        shopStats[sid].orders++;
        shopStats[sid].revenue += (o.totalPrice||0);
      });
    });

    _adminShops = shopSnap.docs.map(function(d){
      var s = Object.assign({id:d.id},d.data());
      s.todayOrders  = (shopStats[d.id]||{}).orders  || 0;
      s.todayRevenue = (shopStats[d.id]||{}).revenue || 0;
      return s;
    });
  } catch(e) {
    try {
      var snap2 = await db.collection('shops').get();
      _adminShops = snap2.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
    } catch(e2) {}
  }

  var areaF = (document.getElementById('shop-area-filter')||{}).value || '';
  var filtered = areaF ? _adminShops.filter(function(s){ return s.area===areaF; }) : _adminShops;

  if (!filtered.length) {
    listEl.innerHTML = '<p style="color:var(--text3);font-size:13px;text-align:center;padding:24px">No shops yet. Click + Add Shop above.</p>';
    return;
  }

  var catIcon = function(cat){ return {grocery:'🛒',pickles:'🥒',dairy:'🥛',fruits:'🍎',bakery:'🍞',nonveg:'🍖'}[cat]||'🏪'; };

  listEl.innerHTML = filtered.map(function(s) {
    var open = s.online !== false;
    return '<div style="background:var(--bg2);border-radius:14px;padding:14px;margin-bottom:10px;border:1px solid var(--border)">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
        +'<div style="display:flex;align-items:center;gap:10px">'
          +'<div style="width:38px;height:38px;border-radius:10px;background:var(--green3);display:flex;align-items:center;justify-content:center;font-size:20px">'+catIcon(s.category)+'</div>'
          +'<div><p style="font-size:14px;font-weight:700;color:var(--text)">'+esc(s.name||'')+'</p>'
          +'<p style="font-size:11px;color:var(--text3)">📍 '+esc(s.area||'')+' · '+esc(s.category||'grocery')+'</p></div>'
        +'</div>'
        +'<span style="background:'+(open?'rgba(0,230,118,.15)':'rgba(255,23,68,.15)')+';color:'+(open?'var(--green)':'var(--red)')+';border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700">'+(open?'🟢 Open':'🔴 Closed')+'</span>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px">'
        +'<div style="background:var(--bg3);border-radius:8px;padding:8px;text-align:center"><p style="font-size:10px;color:var(--text3)">Today Orders</p><p style="font-size:16px;font-weight:900;color:var(--green)">'+(s.todayOrders||0)+'</p></div>'
        +'<div style="background:var(--bg3);border-radius:8px;padding:8px;text-align:center"><p style="font-size:10px;color:var(--text3)">Today Rev</p><p style="font-size:16px;font-weight:900;color:var(--green)">₹'+(s.todayRevenue||0).toLocaleString('en-IN')+'</p></div>'
        +'<div style="background:var(--bg3);border-radius:8px;padding:8px;text-align:center"><p style="font-size:10px;color:var(--text3)">Min Order</p><p style="font-size:16px;font-weight:900;color:var(--green)">₹'+(s.minOrder||0)+'</p></div>'
      +'</div>'
      +'<div style="display:flex;gap:6px">'
        +'<button onclick="adminToggleShop(\''+s.id+'\','+open+')" style="flex:1;padding:7px;background:'+(open?'rgba(255,23,68,.12)':'rgba(0,230,118,.12)')+';color:'+(open?'var(--red)':'var(--green)')+';border:1px solid '+(open?'rgba(255,23,68,.3)':'rgba(0,230,118,.3)')+';border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font)">'+(open?'🔴 Close':'🟢 Open')+'</button>'
        +'<button onclick="viewShopProducts(\''+s.id+'\',\''+esc(s.name||'').replace(/'/g,"\\'")+'\')" style="flex:1;padding:7px;background:var(--blue2);color:var(--blue);border:1px solid rgba(41,121,255,.3);border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font)">📦 Products</button>'
        +'<button onclick="adminRemoveShop(\''+s.id+'\')" style="padding:7px 10px;background:var(--bg3);color:var(--text3);border:1px solid var(--border);border-radius:8px;font-size:11px;cursor:pointer">🗑</button>'
      +'</div>'
    +'</div>';
  }).join('');
}
window.renderShopsAdmin = renderShopsAdmin;

async function adminToggleShop(shopId, curOpen) {
  await db.collection('shops').doc(shopId).update({ online:!curOpen, updatedAt:new Date().toISOString() });
  toast(!curOpen?'🟢 Shop opened':'🔴 Shop closed','success');
  renderShopsAdmin();
}
window.adminToggleShop = adminToggleShop;

async function adminRemoveShop(shopId) {
  if (!confirm('Deactivate this shop? It will be hidden from customers.')) return;
  await db.collection('shops').doc(shopId).update({ active:false, online:false });
  toast('Shop deactivated','success');
  renderShopsAdmin();
}
window.adminRemoveShop = adminRemoveShop;

async function viewShopProducts(shopId, shopName) {
  var snap = await db.collection('shops').doc(shopId).collection('products').get();
  var prods = snap.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
  var m = document.createElement('div');
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9990;display:flex;align-items:center;justify-content:center;padding:16px';
  m.innerHTML='<div style="background:var(--bg2);border-radius:20px;padding:20px;width:100%;max-width:500px;max-height:85vh;overflow-y:auto;border:1px solid var(--border)">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
      +'<h3 style="font-size:15px;font-weight:700;color:var(--text)">📦 '+esc(shopName)+' ('+prods.length+')</h3>'
      +'<button onclick="this.closest(\'[style]\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3)">✕</button>'
    +'</div>'
    +(prods.length ? prods.map(function(p){
      return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">'
        +'<img src="'+(p.image_url||p.img||'images/nektaIcon.svg')+'" style="width:36px;height:36px;border-radius:8px;object-fit:cover" onerror="this.src=\'images/nektaIcon.svg\'">'
        +'<div style="flex:1"><p style="font-size:13px;font-weight:700;color:var(--text)">'+esc(p.name||'')+'</p><p style="font-size:11px;color:var(--text3)">₹'+(p.price||0)+' · '+(p.unit||'Pc')+'</p></div>'
        +'<span style="font-size:10px;background:'+(p.outOfStock||p.stock===0?'rgba(255,23,68,.15)':'rgba(0,230,118,.15)')+';color:'+(p.outOfStock||p.stock===0?'var(--red)':'var(--green)')+';border-radius:20px;padding:2px 7px;font-weight:700">'+(p.outOfStock||p.stock===0?'OOS':'In Stock')+'</span>'
      +'</div>';
    }).join('') : '<p style="color:var(--text3);text-align:center;padding:20px">No products</p>')
  +'</div>';
  document.body.appendChild(m);
}
window.viewShopProducts = viewShopProducts;

function openAddShopModal() { document.getElementById('add-shop-modal').style.display='flex'; }
window.openAddShopModal = openAddShopModal;

async function submitAddShop() {
  var name  = (document.getElementById('as-name')||{}).value?.trim()||'';
  var area  = (document.getElementById('as-area')||{}).value||'';
  var cat   = (document.getElementById('as-cat')||{}).value||'grocery';
  var phone = ((document.getElementById('as-phone')||{}).value||'').trim();
  var pin   = ((document.getElementById('as-pin')||{}).value||'').trim();
  if (!name||!area) { toast('Shop name and area required','error'); return; }
  if (phone && !/^[6-9]\d{9}$/.test(phone)) { toast('Enter valid 10-digit seller phone','error'); return; }
  if (pin && (pin.length !== 4 || isNaN(Number(pin)))) { toast('PIN must be exactly 4 digits','error'); return; }
  try {
    var shopData = { name, area, category:cat, online:false, active:true, rating:0, minOrder:0, createdAt:new Date().toISOString() };
    if (phone) shopData.sellerPhone = phone;
    if (pin)   shopData.sellerPin   = pin;
    var ref = await db.collection('shops').add(shopData);
    document.getElementById('add-shop-modal').style.display='none';
    ['as-name','as-area','as-cat','as-phone','as-pin'].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
    var msg = '\u2705 Shop "'+name+'" added!'+(phone?' Seller can login with phone '+phone+' + PIN '+pin:'');
    toast(msg,'success');
    renderShopsAdmin();
  } catch(e) { toast('Failed: '+e.message,'error'); }
}
window.submitAddShop = submitAddShop;

// ── Sellers page ──────────────────────────────────────────────
async function renderSellersPage() {
  var listEl = document.getElementById('sellers-list');
  if (!listEl) return;
  listEl.innerHTML = '<p style="color:var(--text3);font-size:13px;text-align:center;padding:20px">Loading…</p>';
  try {
    var sSnap = await db.collection('shops').where('active','==',true).get();
    var shops = sSnap.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
    _adminSellers = shops.map(function(s){ return Object.assign({shop_id:s.id},s); });
    if (!shops.length) {
      listEl.innerHTML='<p style="color:var(--text3);font-size:13px;text-align:center;padding:24px">No shops yet. Click + Add Seller to create one.</p>';
      return;
    }
    var shopsMap = {};
    shops.forEach(function(s){ shopsMap[s.id]=s; });
    listEl.innerHTML = _adminSellers.map(function(s) {
      var shop = shopsMap[s.shop_id]||{};
      var hasPin = shop.sellerPhone && shop.sellerPin;
      return '<div style="background:var(--bg2);border-radius:14px;padding:14px;margin-bottom:10px;border:1px solid var(--border)">'
        +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">'
          +'<div><p style="font-size:14px;font-weight:700;color:var(--text)">'+esc(shop.name||s.shopName||s.name||'—')+'</p>'
          +'<p style="font-size:11px;color:var(--text3);margin-top:2px">📍 '+esc(s.area||shop.area||'')+'</p>'
          +(hasPin?'<p style="font-size:11px;color:var(--green);margin-top:2px">📱 '+esc(shop.sellerPhone)+' · PIN: '+esc(shop.sellerPin)+'</p>':'<p style="font-size:11px;color:var(--yellow);margin-top:2px">⚠️ No PIN set — edit shop settings</p>')
          +'</div>'
          +'<span style="background:'+(hasPin?'rgba(0,230,118,.15)':'rgba(255,214,0,.15)')+';color:'+(hasPin?'var(--green)':'var(--yellow)')+';border-radius:20px;padding:3px 10px;font-size:10px;font-weight:700">'+(hasPin?'✅ PIN Set':'⏳ No PIN')+'</span>'
        +'</div>'
        +'<div style="display:flex;gap:6px">'
          +'<button onclick="window.open(\'seller.html\',\'_blank\')" style="flex:1;padding:7px;background:var(--green3);color:var(--green);border:1px solid rgba(0,230,118,.3);border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font)">🔗 Open Dashboard</button>'
        +'<button onclick="copySellerLink()" style="flex:1;padding:7px;background:var(--blue2,rgba(41,121,255,.12));color:var(--blue,#2979ff);border:1px solid rgba(41,121,255,.3);border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font)">📋 Copy Link</button>'
          +'<button onclick="adminRemoveSeller(\''+s.id+'\')" style="padding:7px 10px;background:var(--red2);color:var(--red);border:1px solid rgba(255,23,68,.3);border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font)">🗑 Remove</button>'
        +'</div>'
      +'</div>';
    }).join('');
  } catch(e) { listEl.innerHTML='<p style="color:var(--red);font-size:13px;text-align:center;padding:20px">Error: '+esc(e.message)+'</p>'; }
}
window.renderSellersPage = renderSellersPage;

async function adminRemoveSeller(sellerId) {
  if (!confirm('Remove this seller? Their shop will be deactivated.')) return;
  await db.collection('shops').doc(sellerId).update({ active:false, online:false }).catch(function(){});
  toast('Seller removed','success');
  renderSellersPage();
}
window.adminRemoveSeller = adminRemoveSeller;

// Hook into showPage for shops/sellers
var _origShowPage2 = window.showPage;
window.showPage = function(name, el) {
  if (typeof _origShowPage2 === 'function') _origShowPage2(name, el);
  if (name === 'shops')   renderShopsAdmin();
  if (name === 'sellers') renderSellersPage();
};

// ── Copy seller dashboard link ─────────────────────────────
function copySellerLink() {
  var link = window.location.origin + (window.location.pathname.replace('dashboard.html','')) + 'seller.html';
  var copy = function(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function() {
        toast('📋 Seller link copied! Share: ' + text, 'success');
      }).catch(function() { fallback(text); });
    } else { fallback(text); }
  };
  var fallback = function(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('📋 Copied: ' + text, 'success'); } catch(e) {}
    document.body.removeChild(ta);
  };
  copy(link);
}
window.copySellerLink = copySellerLink;
