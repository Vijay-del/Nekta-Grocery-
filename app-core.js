// ---------------------------------------------------
// NEKTA APP CORE - State, Init, Views, Cart, Order
// ---------------------------------------------------
'use strict';

// Always get freshest product list (seed + Firestore overrides)
function _getProds() {
  return (window._activeShopId && window._shopOverrideProducts)
    ? window._shopOverrideProducts
    : (window._allProducts || window.products || products);
}
window._getProds = _getProds;

const BPHONE='919398448938';
let MIN_ORD = 100; // overridable from admin dashboard

// --- SANITIZER → prevents XSS from user data in innerHTML ---
function esc(str){return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
// ?? SECURITY: Use bcrypt instead of SHA-256 (see admin-auth.js for details)

// --- PRODUCT IMAGE HELPER ---------------------------------------------------
// Accepts: full https:// URL, ./images/name.jpg, images/name.jpg, or just filename.jpg
// Works with both the local images/ folder and any external CDN/Firebase Storage URL.
function getItemImage(p) {
  if (!p) return 'images/nektaIcon.svg';
  const stored = (p.img || p.imageUrl || p.image || '').trim();
  if (!stored) return 'images/nektaIcon.svg';
  if (/^(https?:|data:|blob:)/.test(stored)) return stored;
  if (stored.startsWith('/')) return stored;
  let cleaned = stored.startsWith('./') ? stored.slice(2) : stored;
  cleaned = cleaned.replace(/^(images\/)+/, '');
  return 'images/' + cleaned;
}

// ─── BROKEN IMAGE FIXER ────────────────────────────────────────────────────
// Periodically scans all <img> tags and replaces any that failed to load
// (covers CDN images that return 0-byte/CORS-blocked responses silently)
(function _brokenImgFixer() {
  var LOGO = 'images/nektaIcon.svg';
  function _fixAll() {
    document.querySelectorAll('img').forEach(function(img) {
      // Skip logo itself and images already replaced
      if (!img.src || img.src.indexOf('nektaIcon') !== -1) return;
      // If loaded but has no size → broken CDN image
      if (img.complete && img.naturalWidth === 0) {
        img.src = LOGO;
      }
    });
  }
  // Run after page load, then every 2s for the first 30s
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(_fixAll, 1000);
    setTimeout(_fixAll, 3000);
    var _count = 0;
    var _interval = setInterval(function() {
      _fixAll();
      if (++_count >= 12) clearInterval(_interval); // stop after 24s
    }, 2000);
  });
})();

// Global image error handler — catches CDN failures that don't trigger onerror
// (e.g. ImageKit returning a 0x0 image or CORS block)
(function _initImgFallback() {
  function _checkBroken(img) {
    if (!img.complete || img.naturalWidth === 0) {
      img.src = 'images/nektaIcon.svg';
    }
  }
  // Patch all future images via a MutationObserver
  const _obs = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(node) {
        if (node.tagName === 'IMG') {
          node.addEventListener('load', function() { _checkBroken(node); });
          node.addEventListener('error', function() { node.src = 'images/nektaIcon.svg'; });
        } else if (node.querySelectorAll) {
          node.querySelectorAll('img').forEach(function(img) {
            img.addEventListener('load', function() { _checkBroken(img); });
            img.addEventListener('error', function() { img.src = 'images/nektaIcon.svg'; });
          });
        }
      });
    });
  });
  document.addEventListener('DOMContentLoaded', function() {
    _obs.observe(document.body, { childList: true, subtree: true });
  });
})();

// ─── NORMALIZE ALL PRODUCT IMAGES ON LOAD ──────────────────────────────────
// Fixes corrupted image paths in products array
function normalizeProductImages(prods) {
  if (!Array.isArray(prods)) return prods;
  return prods.map(p => {
    if (p && (p.img || p.imageUrl || p.image)) {
      const src = (p.img || p.imageUrl || p.image || '').trim();
      // Keep full URLs (ImageKit, https://, etc.) as-is
      if (/^(https?:|data:|blob:)/.test(src) || src.startsWith('/')) {
        p.img = src;
      } else {
        // Local path — normalize and store as bare filename
        p.img = getItemImage(p).replace(/^images\//, '');
      }
    }
    return p;
  });
}

// Apply normalization to global products array
if (typeof products !== 'undefined' && Array.isArray(products)) {
  products = normalizeProductImages(products);
}

async function _checkPin(input){
  // Use bcrypt verification (admin-auth.js)
  if(window.verifyAdminPin) return await window.verifyAdminPin(input);
  return false;
}

// --- LOTTIE URLS ---
const LA={
  splash:'https://lottie.host/4db68bbd-ee10-4fcf-8f85-9b0eff8cffe8/GE7RbkvsBH.json',
  success:'https://lottie.host/e8b6dae4-e0de-4ee7-9a0a-89d0e9a7d0db/Sn3V3jk9pb.json',
  confetti:'https://lottie.host/6ec29b47-e3a7-4a95-a7d6-d54a2b7f6e9b/d6w3ylLfMl.json',
  delivery:'https://lottie.host/58d9c957-e3e2-49a4-91db-f1a1e0eab88e/4jyXfW9bAO.json',
  empty:'https://lottie.host/75a4dbb9-69e7-48cd-8869-5e43c3c3a67d/ZdcxX1Nqnq.json',
  rider:'https://lottie.host/9da9a9a3-e9ce-4a19-b7e2-3da6d7e5a9f3/vJwgXm5c6Y.json',
  bell:'https://lottie.host/b99d1e03-e85e-4b9e-bedf-6c20b0f7b1b2/m2VctlJJq.json',
};
const la={};
function lplay(id,url,loop=true){
  if(!window.lottie)return;
  const el=document.getElementById(id);if(!el)return;
  if(la[id]){la[id].destroy();la[id]=undefined;delete la[id];}
  el.innerHTML='';
  la[id]=lottie.loadAnimation({container:el,renderer:'svg',loop,autoplay:true,path:url});
  return la[id];
}
function lstop(id){if(la[id]){la[id].destroy();la[id]=undefined;delete la[id];}}
function closeLO(id){
  lstop('lo-s-anim');lstop('lo-d-anim');lstop('lo-conf-anim');
  const el=document.getElementById(id);if(el)el.classList.remove('on');
}

// --- STATE ---
let cart={}, favs=new Set(), activecat='ALL', curview='home';
let adminTaps=0, deferPrompt=null, curSlide=0, expressMode=false;
let _ordL=null, _locL=null, riderW=null;
let adminL=null, allOrders=[], alarmOId=null, isFirstSnap=true;
let _pdProduct=null, selectedCut=null, selectedPdQty=1;
let isAlarm=false;
const viewStack=['home'];

// --- SPLASH PROGRESS BAR ---
function _splashProgress(pct, label) {
  var bar = document.getElementById('splash-progress-bar');
  var lbl = document.getElementById('splash-progress-label');
  if (bar) bar.style.width = pct + '%';
  if (lbl && label) lbl.textContent = label;
}

// --- INIT ---
window.addEventListener('load',()=>{
  _splashProgress(10, 'Starting up…');
  loadCart(); loadFavs();
  initPWA();
  if(typeof initSlider === 'function') initSlider();
  if(window.initGestures) initGestures();
  initSwipeBack();
  // Firebase ready → jump to 40%
  window.addEventListener('firebaseReady', function() {
    _splashProgress(40, 'Connected…');
  }, {once: true});
  setTimeout(boot, 400);
});

function boot(){
  // Products now load from Firestore via app-overrides.js
  // Boot immediately, Firestore listener will re-render once products arrive
  if(typeof products==='undefined') window.products=[];
  {
    // Wait for Firestore products if not yet loaded (max 15s)
    if(!window._bootRetry) window._bootRetry=0;
    if(!window.products.length && window._bootRetry < 100){
      window._bootRetry++;
      _splashProgress(Math.min(35 + window._bootRetry * 0.4, 75), 'Loading products…');
      setTimeout(boot, 150);
      return;
    }
    if(!window.products.length){
      var _bsp=document.getElementById('splash');
      if(_bsp){_bsp.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;padding:32px;text-align:center"><div style="font-size:48px">📡</div><h2 style="color:#fff;font-family:Nunito,sans-serif;font-size:18px">Connection Error</h2><p style="color:rgba(255,255,255,.7);font-size:13px;margin-bottom:8px">Products failed to load. Please check your internet connection and try again.</p><button onclick="location.reload()" style="background:#fff;color:#006b3a;border:none;padding:12px 28px;border-radius:12px;font-weight:800;font-size:13px;cursor:pointer;margin-top:8px">⚡ Retry</button></div>';}
      return;
    }
  }

  _splashProgress(80, 'Preparing app…');

  // Render immediately with seed data
  renderHCats();
  renderHSecs();
  renderCCats();
  renderCGrid('ALL');
  renderSlotPicker();
  updateFCart();
  loadProfileUI();
  initTracking();

  // Scroll to top on home
  const homeEl=document.getElementById('view-home');
  if(homeEl)homeEl.scrollTop=0;

  // Prewarm images then hide splash at 100%
  setTimeout(function(){
    if(window.products && window.prewarmImageCache) prewarmImageCache(window.products);
    _splashProgress(100, 'Ready!');
    setTimeout(function(){
      var sp = document.getElementById('splash');
      if(sp) sp.classList.add('off');
      // Show onboarding for new/logged-out users after splash fades
      setTimeout(function(){
        if(window._checkOnboarding) window._checkOnboarding();
      }, 500);
    }, 350);
  }, 400);

  const role=localStorage.getItem('userRole');
  if(role==='rider'){const ph=localStorage.getItem('riderPhone');if(ph)setTimeout(()=>launchRider(ph),400);}
  updateBadge();
  // Show notification dot if not seen yet
  if(!localStorage.getItem('nk_notif_seen')){
    const dot=document.getElementById('notif-dot');
    if(dot) dot.style.display='block';
  }
  if(window.registerReferralCode) registerReferralCode();
  if(window.applyLanguage) applyLanguage();
  // Load home config from Firebase (admin changes reflect here)
  loadHomeConfigFromFirebase();
  // Load shops for home screen
  if(window.firebaseReady && window.db){
    if(window.loadShopsForHome) window.loadShopsForHome().then(function(){ if(window._renderShops) window._renderShops(); });
  } else {
    window.addEventListener('firebaseReady', function(){
      if(window.loadShopsForHome) window.loadShopsForHome().then(function(){ if(window._renderShops) window._renderShops(); });
    }, {once:true});
  }
  // Init FCM push notifications after Firebase is ready
  if(window.firebaseReady){setTimeout(()=>{if(window.initFCM)initFCM();},2000);}
  else window.addEventListener('firebaseReady',()=>{setTimeout(()=>{if(window.initFCM)initFCM();},2000);},{once:true});

  // Check for product updates after Firebase is ready
  var _checkUpdates = function(){
    if(!window.checkProductUpdates) return;
    window.checkProductUpdates().then(function(res){
      if(res.hasUpdates){
        var m = document.getElementById('update-modal');
        if(m) m.style.display='flex';
      } else {
        window.storeProductVersion(res.latest);
      }
    }).catch(function(){});
  };
  if(window.firebaseReady) setTimeout(_checkUpdates, 3000);
  else window.addEventListener('firebaseReady', function(){ setTimeout(_checkUpdates, 3000); }, {once:true});

  // Pull-to-refresh on home view
  (function(){
    var view = document.getElementById('view-home');
    var ind  = document.getElementById('ptr-indicator');
    var icon = document.getElementById('ptr-icon');
    if(!view||!ind) return;
    var startY=0, pulling=false, triggered=false;
    var THRESHOLD = 72;
    view.addEventListener('touchstart', function(e){
      if(view.scrollTop===0) { startY=e.touches[0].clientY; pulling=true; triggered=false; }
    }, {passive:true});
    view.addEventListener('touchmove', function(e){
      if(!pulling) return;
      var dy = Math.max(0, e.touches[0].clientY - startY);
      var pull = Math.min(dy * 0.4, THRESHOLD);
      ind.style.transform = 'translateY(' + (pull - 56) + 'px)';
      if(icon) icon.style.transform = 'rotate(' + (pull/THRESHOLD*360) + 'deg)';
      triggered = (pull >= THRESHOLD);
    }, {passive:true});
    view.addEventListener('touchend', function(){
      if(!pulling) return;
      pulling=false;
      ind.style.transform = 'translateY(-56px)';
      if(triggered) { triggered=false; location.reload(); }
    }, {passive:true});
  })();
}

// --- SWIPE BACK GESTURE ---
// Swipe right from left edge (within 30px) to trigger handleBack()
// Ignores swipes that start on horizontal scrollers
function initSwipeBack(){
  var startX=0, startY=0, tracking=false;
  var EDGE=30, MIN_DIST=60, MAX_VERT=80;

  document.addEventListener('touchstart',function(e){
    var t=e.touches[0];
    tracking = t.clientX <= EDGE;
    if(tracking){ startX=t.clientX; startY=t.clientY; }
  },{passive:true});

  document.addEventListener('touchend',function(e){
    if(!tracking) return;
    tracking=false;
    var t=e.changedTouches[0];
    var dx=t.clientX-startX, dy=Math.abs(t.clientY-startY);
    if(dx>=MIN_DIST && dy<=MAX_VERT) handleBack();
  },{passive:true});

  document.addEventListener('touchmove',function(e){
    if(!tracking) return;
    // Cancel if finger moves more vertically than horizontally (scrolling)
    var t=e.touches[0];
    if(Math.abs(t.clientY-startY) > Math.abs(t.clientX-startX)) tracking=false;
  },{passive:true});
}

// Home config is handled by app-overrides.js via app_overrides/home_config
function loadHomeConfigFromFirebase(){
  // startOverrideListeners has its own guard → safe to call multiple times
  if(typeof startOverrideListeners==='function'){
    if(window.firebaseReady && window.db){
      startOverrideListeners();
    } else {
      // Firebase not ready yet → wait for it
      window.addEventListener('firebaseReady', function(){
        startOverrideListeners();
      }, {once:true});
    }
  }
}

// --- VIEW ROUTING ---
function showView(v){
  // Always close product detail page when navigating to any view
  var _pd=document.getElementById('pd-page');
  if(_pd&&_pd.classList.contains('on')){_pd.classList.remove('on');_pdProduct=null;}
  document.getElementById('srch-ov').classList.remove('on');
  const spec=['admin','rider'];
  const bnav=document.getElementById('bnav');
  if(bnav) bnav.style.display=spec.includes(v)?'none':'flex';
  ['home','catalog','cart','profile','admin','rider'].forEach(n=>{
    const el=document.getElementById('view-'+n);
    if(el) el.classList.remove('on');
  });
  const t=document.getElementById('view-'+v);
  if(t) t.classList.add('on');
  curview=v; window.curview=v;
  ['home','catalog','cart','profile'].forEach(n=>{
    const el=document.getElementById('nb-'+n);
    if(el) el.classList.remove('on');
  });
  if(!spec.includes(v)){const nb=document.getElementById('nb-'+v);if(nb)nb.classList.add('on');}
  if(viewStack[viewStack.length-1]!==v) viewStack.push(v);
  if(window.viewHistory&&(window.viewHistory[window.viewHistory.length-1]!==v)) window.viewHistory.push(v);
  if(v==='cart') renderCart();
  if(v==='profile'){loadProfileUI();initTracking();}
  if(v==='catalog') renderCGrid(activecat);
  if(v==='admin'){
    // Start real-time admin listener when admin panel opens
    if(typeof loadAdminDash==='function') loadAdminDash();
  }
  if(v!=='cart') updateFCart();
}
window.showView=showView;

function handleBack(){
  // 1. Contact sheet
  var _cs=document.getElementById('contact-sheet');
  if(_cs&&_cs.style.display==='flex'){closeContactSheet();return;}
  // 2. OTP modal
  var _otpM=document.getElementById('otp-modal');
  if(_otpM&&_otpM.classList.contains('on')){
    if(window.closeOTPModal)closeOTPModal();
    else{_otpM.style.display='none';_otpM.classList.remove('on');}
    return;
  }
  // 3. Cart conflict modal
  var _ccm=document.getElementById('cart-conflict-modal');
  if(_ccm&&_ccm.style.display==='flex'){closeCartConflict();return;}
  // 4. Update modal
  var _um=document.getElementById('update-modal');
  if(_um&&_um.style.display==='flex'){_um.style.display='none';return;}
  // 5. Delivery modal
  if(document.getElementById('d-modal').classList.contains('open')){closeDModal();return;}
  // 6. Product detail page
  const pdPage=document.getElementById('pd-page');
  if(pdPage&&pdPage.classList.contains('on')){closePD();return;}
  // 7. Generic .mov modals
  const mods=document.querySelectorAll('.mov');
  if(mods.length){mods[mods.length-1].remove();return;}
  // 8. Search overlay
  if(document.getElementById('srch-ov').classList.contains('on')){closeSearch();return;}
  // 9. Navigate back
  if(viewStack.length>1){viewStack.pop();_navTo(viewStack[viewStack.length-1]);}
  else _navTo('home');
}
window.handleBack=handleBack;

function _navTo(v){
  // Always close product detail page when navigating to any view
  var _pd=document.getElementById('pd-page');
  if(_pd&&_pd.classList.contains('on')){_pd.classList.remove('on');_pdProduct=null;}
  document.getElementById('srch-ov').classList.remove('on');
  const spec=['admin','rider'];
  const bnav=document.getElementById('bnav');
  if(bnav) bnav.style.display=spec.includes(v)?'none':'flex';
  ['home','catalog','cart','profile','admin','rider'].forEach(n=>{
    const el=document.getElementById('view-'+n);if(el)el.classList.remove('on');
  });
  const t=document.getElementById('view-'+v);if(t)t.classList.add('on');
  curview=v;window.curview=v;
  ['home','catalog','cart','profile'].forEach(n=>{
    const el=document.getElementById('nb-'+n);if(el)el.classList.remove('on');
  });
  if(!spec.includes(v)){const nb=document.getElementById('nb-'+v);if(nb)nb.classList.add('on');}
  if(v==='cart') renderCart();
  if(v==='profile'){loadProfileUI();initTracking();}
  if(v==='catalog') renderCGrid(activecat);
  if(v==='admin'){
    if(typeof loadAdminDash==='function') loadAdminDash();
  }
  if(v!=='cart') updateFCart();
}
window._navTo=_navTo;

function adminTap(){adminTaps++;if(adminTaps>=7){adminTaps=0;doSwitchToAdmin();}}

function toggleExpressMode(){
  expressMode=!expressMode;
  localStorage.setItem('nk_express',expressMode);
  const tog=document.getElementById('express-toggle');
  if(tog){
    tog.style.background=expressMode?'rgba(255,255,255,.5)':'rgba(255,255,255,.2)';
    tog.firstElementChild.style.transform=expressMode?'translateX(20px)':'translateX(0)';
  }
  toast(expressMode?'⚡ Express 10-min mode ON!':'Standard delivery selected','info');
}

// --- HERO SLIDER ---
// Slides → can be overridden by Firebase home config from admin dashboard
const _DEFAULT_SLIDES=[
  {bg:'linear-gradient(135deg,#059669,#047857)',tag:'⚡ DELIVERY IN 20 MINS',h:'Fresh Groceries\nAt Your Door',sub:"Kothagudem's fastest delivery",e:'🚚'},
  {bg:'linear-gradient(135deg,#f59e0b,#d97706)',tag:'🥛 DAIRY DEALS',h:'Fresh Milk\n@ ₹24 Only',sub:'Farm fresh, delivered daily',e:'🥛'},
  {bg:'linear-gradient(135deg,#ef4444,#dc2626)',tag:'🛍 MEGA SALE',h:'Flat 50% OFF\nOn Selected Items',sub:'Limited time offer - grab now!',e:'🛍'},
  {bg:'linear-gradient(135deg,#7c3aed,#6d28d9)',tag:'🍗 NON-VEG FRESH',h:'Chicken, Fish\n& Mutton Daily',sub:'Cleaned & ready to cook',e:'🍗'},
];
// initSlider and goSlide → defined and auto-run by slider-fix.js (loaded after app-core)

// --- CATEGORIES ---
// Use CATS_V2 from catalog-ui.js for rich gradient icons
// Fallback list if catalog-ui hasn't loaded yet
const CATS_FALLBACK=[
  {id:'ALL',        l:'All',        e:'\uD83D\uDED2', g:'linear-gradient(135deg,#00b96b,#007a47)', sh:'rgba(0,185,107,.35)'},
  {id:'VEGETABLES', l:'Veggies',    e:'\uD83E\uDD66', g:'linear-gradient(135deg,#43a047,#1b5e20)', sh:'rgba(67,160,71,.35)'},
  {id:'LEAFY',      l:'Leafy',      e:'\uD83C\uDF3F', g:'linear-gradient(135deg,#66bb6a,#2e7d32)', sh:'rgba(102,187,106,.35)'},
  {id:'FRUITS',     l:'Fruits',     e:'\uD83C\uDF4E', g:'linear-gradient(135deg,#ef5350,#b71c1c)', sh:'rgba(239,83,80,.35)'},
  {id:'DAIRY',      l:'Dairy',      e:'\uD83E\uDD5B', g:'linear-gradient(135deg,#42a5f5,#1565c0)', sh:'rgba(66,165,245,.35)'},
  {id:'GRAINS',     l:'Grains',     e:'\uD83C\uDF3E', g:'linear-gradient(135deg,#ffa726,#e65100)', sh:'rgba(255,167,38,.35)'},
  {id:'DALS',       l:'Dals',       e:'\uD83E\uDED8', g:'linear-gradient(135deg,#a5d6a7,#2e7d32)', sh:'rgba(165,214,167,.35)'},
  {id:'OILS',       l:'Oils',       e:'\uD83E\uDED9', g:'linear-gradient(135deg,#ffca28,#f57f17)', sh:'rgba(255,202,40,.35)'},
  {id:'SPICES',     l:'Spices',     e:'\uD83C\uDF36', g:'linear-gradient(135deg,#ff7043,#bf360c)', sh:'rgba(255,112,67,.35)'},
  {id:'SNACKS',     l:'Snacks',     e:'\uD83C\uDF7F', g:'linear-gradient(135deg,#ffee58,#f9a825)', sh:'rgba(255,238,88,.35)'},
  {id:'DRINKS',     l:'Drinks',     e:'\uD83E\uDD64', g:'linear-gradient(135deg,#26c6da,#006064)', sh:'rgba(38,198,218,.35)'},
  {id:'NONVEG',     l:'Non-Veg',    e:'\uD83C\uDF57', g:'linear-gradient(135deg,#ec407a,#880e4f)', sh:'rgba(236,64,122,.35)'},
  {id:'PERSONALCARE',l:'Care',      e:'\uD83E\uDDF4', g:'linear-gradient(135deg,#5c6bc0,#1a237e)', sh:'rgba(92,107,192,.35)'},
  {id:'CLEANING',   l:'Cleaning',   e:'\uD83E\uDDF9', g:'linear-gradient(135deg,#26c6da,#00838f)', sh:'rgba(38,198,218,.35)'},
  {id:'PUJA',       l:'Puja',       e:'\uD83E\uDEA9', g:'linear-gradient(135deg,#ff8f00,#e65100)', sh:'rgba(255,143,0,.35)'},
  {id:'COMBOS',     l:'Combos',     e:'\uD83C\uDF81', g:'linear-gradient(135deg,#f06292,#ad1457)', sh:'rgba(240,98,146,.35)'},
  {id:'BAKERY',     l:'Bakery',     e:'\uD83E\uDD50', g:'linear-gradient(135deg,#ffb74d,#e65100)', sh:'rgba(255,183,77,.35)'},
  {id:'FROZEN',     l:'Frozen',     e:'\u2744\uFE0F',  g:'linear-gradient(135deg,#4fc3f7,#0277bd)', sh:'rgba(79,195,247,.35)'},
];
function _getCats(){ return (typeof CATS_V2!=='undefined' && CATS_V2.length) ? CATS_V2 : CATS_FALLBACK; }

// renderHCats, renderCCats, renderCatSidebar, toCat, setCat → defined in catalog-ui.js

// --- HOME SECTIONS ---
function renderHSecs(){
  const c=document.getElementById('hsecs');
  if(!c||typeof products==='undefined'){setTimeout(renderHSecs,200);return;}
  const sections=[];
  const fnMap={
    combos:mkCombosSlider, buyagain:mkBuyAgainSlider,
    quickpicks:mkQuickPicksSlider, deals:mkDealsSlider,
    trending:mkTrendingSlider, timebased:mkTimeBasedSlider,
    fastdelivery:mkFastDeliverySlider, newarrivals:mkNewArrivalsSlider,
    puja:mkPujaSlider,
    // NEW ZEPTO SECTIONS
    recommendations:mkRecommendationsSlider,
    flashsales:mkFlashSalesSlider,
    quickreorder:mkQuickReorderSlider,
    locationoffers:mkLocationOffersSlider,
    recentlyviewed:mkRecentlyViewedSlider,
  };
  // DEFAULT SECTION ORDER (can be overridden by admin config)
  const DEFAULT=['recommendations','flashsales','quickreorder','combos','buyagain','quickpicks','deals','trending','timebased','fastdelivery','newarrivals','recentlyviewed','puja'];
  const cfgSections = window._NK && window._NK.home && window._NK.home.sections;
  const sectionList = (cfgSections && cfgSections.length)
    ? cfgSections.slice().sort((a,b)=>(a.order||0)-(b.order||0))
    : DEFAULT.map(id=>({id:id, on:true}));
  sectionList.forEach(function(s){
    if(s.on===false) return;
    if(fnMap[s.id]){
      var h=fnMap[s.id](); if(h) sections.push(h);
    } else if(s._custom || (s.products && s.products.length)){
      var ps = [];
      const allVisible = window.getVisibleProducts && window.getVisibleProducts().length ? window.getVisibleProducts() : products;
      if(s.products && s.products.length) {
        // Products can be: [{id,name,price}] objects (he_sections) or plain IDs (legacy)
        ps = s.products.map(function(item){
          var pid = (typeof item === 'object') ? item.id : item;
          return _getProds().find(function(p){ return String(p.id) === String(pid); });
        }).filter(function(p){ return p && !p.hidden && !p.outOfStock; }).slice(0,8);
      } else if(s.cat) {
        // Legacy: category-based custom section
        ps = allVisible.filter(p=>p.category===s.cat).slice(0,8);
      }
      if(ps.length){
        var h='<div class="sec"><div class="sec-hdr"><span class="sec-title">'+s.label+'</span>'
          +'<button class="seeall" onclick="toCat(\''+(s.cat||'ALL')+'\')">See all</button></div>'
          +'<div class="hs-slider">'+ps.map(p=>mkSmCard(p,false,'120px','82px')).join('')+'</div></div>';
        sections.push(h);
      }
    }
  });
  c.innerHTML=sections.join('');
  c.querySelectorAll('img[data-src]').forEach(function(img){ if(window.observeImg) window.observeImg(img); });
  // Show featured products section if configured
  if(window._NK?.home?.featured?.length){
    const featHtml=mkFeaturedSlider();
    if(featHtml) c.innerHTML=featHtml+c.innerHTML;
  }
  // Show Deal of the Day if configured
  if(window._NK?.home?.deals && Object.keys(window._NK.home.deals).length){
    const dealHtml=mkDealOfDaySlider();
    if(dealHtml) c.innerHTML=dealHtml+c.innerHTML;
  }
  // Show announcement banners from admin
  if(window._NK?.home?.banners?.length){
    const activeBanners=window._NK.home.banners.filter(b=>b.on!==false);
    if(activeBanners.length){
      const bannersHtml=`<div class="sec" style="padding:0 0 8px">${
        activeBanners.map(b=>`<div onclick="${b.action?`toCat('${b.action}')`:''}" style="margin:0 16px 8px;border-radius:16px;padding:16px 18px;background:${b.bg||b.bgColor||'linear-gradient(135deg,#059669,#047857)'};cursor:${b.action?'pointer':'default'}">
          <div style="font-weight:800;font-size:15px;color:#fff">${b.title||''}</div>
          ${b.text?`<div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:3px">${b.text}</div>`:(b.sub?`<div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:3px">${b.sub}</div>`:'')}
        </div>`).join('')
      }</div>`;
      c.innerHTML=bannersHtml+c.innerHTML;
    }
  }
}

function mkBuyAgainSlider(){
  const hist=JSON.parse(localStorage.getItem('nk_hist')||'[]');
  const ids=[...new Set(hist.flatMap(o=>o.itemIds||[]))].slice(0,8);
  const allVisible = window.getVisibleProducts && window.getVisibleProducts().length ? window.getVisibleProducts() : products;
  const ps=ids.length?ids.map(id=>allVisible.find(p=>String(p.id)===String(id))).filter(Boolean):allVisible.filter(p=>[1100,1101,400,401,402,500,501,21,607,608].includes(p.id));
  if(!ps.length)return'';
  return`<div class="sec"><div class="sec-hdr"><span class="sec-title">🔄 Buy Again</span><button class="seeall" onclick="showView('catalog')">See all</button></div><div class="hs-slider">${ps.slice(0,6).map(p=>mkSmCard(p,false,'120px','82px')).join('')}</div></div>`;
}
function mkQuickPicksSlider(){
  const h=new Date().getHours();
  const allVisible = window.getVisibleProducts && window.getVisibleProducts().length ? window.getVisibleProducts() : products;
  // Pick quick-grab items relevant to time
  let cats;
  if(h>=5&&h<11) cats=['DAIRY','DRINKS','SNACKS'];
  else if(h<17)  cats=['DRINKS','SNACKS','GRAINS'];
  else           cats=['DRINKS','SNACKS','CHOCOLATES'];
  const ps=allVisible.filter(p=>cats.includes(p.category)).slice(0,8);
  if(!ps.length)return'';
  return`<div class="sec"><div class="sec-hdr"><span class="sec-title">⚡ Quick Picks</span><button class="seeall" onclick="toCat('SNACKS')">See all</button></div><div class="hs-slider">${ps.slice(0,6).map(p=>mkSmCard(p,false,'120px','82px')).join('')}</div></div>`;
}
function mkDealsSlider(){
  const allVisible = window.getVisibleProducts && window.getVisibleProducts().length ? window.getVisibleProducts() : products;
  const deals=[
    {label:'Under ₹99',bg:'linear-gradient(135deg,#fef9c3,#fde047)',color:'#854d0e',cat:'ALL',filter:p=>p.price<=99},
    {label:'Sale Items',bg:'linear-gradient(135deg,#fee2e2,#fca5a5)',color:'#991b1b',cat:'ALL',filter:p=>!!p.slashedPrice},
    {label:'Fresh Veggies',bg:'linear-gradient(135deg,#dcfce7,#86efac)',color:'#14532d',cat:'VEGETABLES',filter:p=>p.category==='VEGETABLES'},
    {label:'Dals & Grains',bg:'linear-gradient(135deg,#f3e8ff,#e9d5ff)',color:'#4c0519',cat:'DALS',filter:p=>p.category==='DALS'},
    {label:'Spices & Oils',bg:'linear-gradient(135deg,#fef3c7,#fef08a)',color:'#713f12',cat:'SPICES',filter:p=>p.category==='SPICES'},
    {label:'Personal Care',bg:'linear-gradient(135deg,#ede9fe,#ddd6fe)',color:'#5b21b6',cat:'PERSONALCARE',filter:p=>p.category==='PERSONALCARE'},
  ];
  return`<div class="sec"><div class="sec-hdr"><span class="sec-title">🏷️ Deals of the Day</span></div><div class="hs-slider">${deals.map(d=>{
    const cnt=allVisible.filter(d.filter).length;
    if(!cnt)return'';
    return`<div class="deal-card" style="background:${d.bg}" onclick="toCat('${d.cat}')"><p style="font-weight:900;font-size:13px;color:${d.color};line-height:1.2">${d.label}</p><p style="font-size:10px;color:${d.color};opacity:.7;margin-top:3px">${cnt} items</p><div style="margin-top:8px;background:rgba(0,0,0,.08);display:inline-block;padding:4px 10px;border-radius:20px;font-size:10px;font-weight:800;color:${d.color}">Shop</div></div>`;
  }).join('')}</div></div>`;
}
function mkTrendingSlider(){
  const allVisible = window.getVisibleProducts && window.getVisibleProducts().length ? window.getVisibleProducts() : products;
  const hist=JSON.parse(localStorage.getItem('nk_hist')||'[]');
  const freq={};
  hist.forEach(o=>(o.itemIds||[]).forEach(id=>{freq[String(id)]=(freq[String(id)]||0)+1;}));
  let ps=[];
  if(Object.keys(freq).length>=4){
    // Use real purchase history
    ps=Object.entries(freq).sort((a,b)=>b[1]-a[1])
      .map(([id])=>allVisible.find(p=>String(p.id)===id))
      .filter(Boolean).slice(0,6);
  }
  if(ps.length<4){
    // Fallback: one popular item from each main category
    const fallbackCats=['VEGETABLES','DAIRY','NONVEG','FRUITS','SNACKS','DRINKS','GRAINS','SPICES'];
    const seen=new Set(ps.map(p=>String(p.id)));
    fallbackCats.forEach(cat=>{
      if(ps.length>=6)return;
      const item=allVisible.find(p=>p.category===cat&&!seen.has(String(p.id)));
      if(item){ps.push(item);seen.add(String(item.id));}
    });
  }
  if(!ps.length)return'';
  return`<div class="sec"><div class="sec-hdr"><span class="sec-title">🔥 Trending Now</span><button class="seeall" onclick="showView('catalog')">See all</button></div><div class="hs-slider">${ps.map((p,i)=>
    `<div style="position:relative"><div style="position:absolute;top:6px;left:6px;z-index:3;background:#ef4444;color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:6px">#${i+1} Hot</div>${mkSmCard(p,false,'120px','82px')}</div>`
  ).join('')}</div></div>`;
}
function mkCombosSlider(){
  const allVisible = window.getVisibleProducts && window.getVisibleProducts().length ? window.getVisibleProducts() : products;
  const ps=allVisible.filter(p=>p.category==='COMBOS').slice(0,6);
  if(!ps.length)return'';
  return`<div class="sec"><div class="sec-hdr"><span class="sec-title">🎁 Smart Combos</span><button class="seeall" onclick="toCat('COMBOS')">See all</button></div><div class="hs-slider">${ps.map(p=>mkSmCard(p,true,'140px','72px')).join('')}</div></div>`;
}
function mkTimeBasedSlider(){
  const allVisible = window.getVisibleProducts && window.getVisibleProducts().length ? window.getVisibleProducts() : products;
  const h=new Date().getHours();
  let label,cats,emoji;
  if(h>=5&&h<9){
    label='Good Morning! ☀️ Breakfast Picks';
    emoji='☕';
    cats=['DAIRY','GRAINS','SNACKS'];
  } else if(h>=9&&h<12){
    label='Mid-Morning Essentials 🌤️';
    emoji='🥛';
    cats=['DAIRY','FRUITS','DRINKS'];
  } else if(h>=12&&h<15){
    label='Lunch Time Essentials 🍽️';
    emoji='🍛';
    cats=['VEGETABLES','LEAFY','SPICES','OILS','NONVEG','DALS'];
  } else if(h>=15&&h<18){
    label='Afternoon Snack Time 🌇';
    emoji='🍿';
    cats=['SNACKS','DRINKS','CHOCOLATES','ICECREAMS'];
  } else if(h>=18&&h<21){
    label='Dinner Time Essentials 🌙';
    emoji='🍲';
    cats=['VEGETABLES','NONVEG','SPICES','OILS','GRAINS','DALS'];
  } else {
    label='Late Night Cravings 🌛';
    emoji='🍫';
    cats=['SNACKS','DRINKS','DAIRY','CHOCOLATES'];
  }
  // Pick one product from each category, shuffle slightly for variety
  const seen=new Set();
  const ps=[];
  cats.forEach(cat=>{
    const items=allVisible.filter(p=>p.category===cat&&!p.outOfStock&&!seen.has(p.id));
    if(items.length){ps.push(items[0]);seen.add(items[0].id);}
  });
  // Fill remaining slots from the same cats if needed
  if(ps.length<6){
    cats.forEach(cat=>{
      allVisible.filter(p=>p.category===cat&&!p.outOfStock&&!seen.has(p.id)).forEach(p=>{
        if(ps.length<6){ps.push(p);seen.add(p.id);}
      });
    });
  }
  if(!ps.length)return'';
  return`<div class="sec"><div class="sec-hdr"><span class="sec-title">${label}</span></div><div class="hs-slider">${ps.slice(0,6).map(p=>mkSmCard(p,false,'120px','82px')).join('')}</div></div>`;
}
function mkFastDeliverySlider(){
  const allVisible = window.getVisibleProducts && window.getVisibleProducts().length ? window.getVisibleProducts() : products;
  // Pick from everyday essentials that are always in stock
  const fastCats=['DAIRY','GRAINS','DALS','DRINKS','SNACKS'];
  const seen=new Set();
  const ps=[];
  fastCats.forEach(cat=>{
    const item=allVisible.find(p=>p.category===cat&&!p.outOfStock&&!seen.has(p.id));
    if(item){ps.push(item);seen.add(item.id);}
  });
  if(!ps.length)return'';
  return`<div class="sec"><div class="sec-hdr"><span class="sec-title">⚡ Fast Delivery (10-20 min)</span></div><div class="hs-slider">${ps.map(p=>`<div style="position:relative"><div class="fast-badge">Fast</div>${mkSmCard(p,false,'120px','82px')}</div>`).join('')}</div></div>`;
}
function mkNewArrivalsSlider(){
  const allVisible = window.getVisibleProducts && window.getVisibleProducts().length ? window.getVisibleProducts() : products;
  // Sort by createdAt descending — newest products first
  const ps=[...allVisible].sort(function(a,b){
    var at=a.createdAt&&a.createdAt.seconds?a.createdAt.seconds:(a.createdAt?new Date(a.createdAt)/1000:0);
    var bt=b.createdAt&&b.createdAt.seconds?b.createdAt.seconds:(b.createdAt?new Date(b.createdAt)/1000:0);
    return bt-at;
  }).filter(p=>!p.outOfStock).slice(0,6);
  if(!ps.length)return'';
  return`<div class="sec"><div class="sec-hdr"><span class="sec-title">🆕 New Arrivals</span><button class="seeall" onclick="showView('catalog')">See all</button></div><div class="hs-slider">${ps.map(p=>`<div style="position:relative"><div style="position:absolute;top:6px;left:6px;z-index:3;background:#2563eb;color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:6px">NEW</div>${mkSmCard(p,false,'120px','82px')}</div>`).join('')}</div></div>`;
}
function mkPujaSlider(){
  const allVisible = window.getVisibleProducts && window.getVisibleProducts().length ? window.getVisibleProducts() : products;
  const ps=allVisible.filter(p=>p.category==='PUJA'&&!p.outOfStock).slice(0,8);
  if(!ps.length)return'';
  return`<div class="sec">
    <div style="margin:0 16px 12px;border-radius:16px;padding:14px 16px;background:linear-gradient(135deg,#ff8f00,#e65100);display:flex;align-items:center;gap:12px">
      <span style="font-size:28px">🪔</span>
      <div>
        <div style="font-weight:900;font-size:14px;color:#fff;font-family:'Nunito',sans-serif">Pooja Essentials</div>
        <div style="font-size:11px;color:rgba(255,255,255,.8);margin-top:2px">Agarbatti, Camphor, Kumkum & more</div>
      </div>
      <button class="seeall" onclick="toCat('PUJA')" style="margin-left:auto;background:rgba(255,255,255,.2);color:#fff;border-color:transparent">See all</button>
    </div>
    <div class="hs-slider">${ps.map(p=>mkSmCard(p,false,'120px','82px')).join('')}</div>
  </div>`;
}
function mkFeaturedSlider(){
  const allVisible = window.getVisibleProducts && window.getVisibleProducts().length ? window.getVisibleProducts() : products;
  const featured=window._NK?.home?.featured||[];
  if(!featured.length)return'';
  const ps=featured.map(f=>allVisible.find(p=>String(p.id)===String(f.id))).filter(Boolean);
  if(!ps.length)return'';
  return`<div class="sec"><div class="sec-hdr"><span class="sec-title">⭐ Featured For You</span></div><div class="hs-slider">${ps.map(p=>mkSmCard(p,false,'120px','82px')).join('')}</div></div>`;
}
function mkDealOfDaySlider(){
  const allVisible = window.getVisibleProducts && window.getVisibleProducts().length ? window.getVisibleProducts() : products;
  const deals=window._NK?.home?.deals||{};
  const entries=Object.entries(deals);
  if(!entries.length)return'';
  const ps=entries.map(([pid,deal])=>{
    const p=allVisible.find(x=>String(x.id)===String(pid));
    if(!p||p.hidden||p.outOfStock)return null;
    return Object.assign({},p,{_dealDiscount:deal.discount,_dealBadge:deal.badge||'DEAL',_dealEnd:deal.endTime||''});
  }).filter(Boolean);
  if(!ps.length)return'';
  return`<div class="sec"><div class="sec-hdr"><span class="sec-title">💰 Deal of the Day</span></div><div class="hs-slider">${
    ps.map(p=>{
      const discPrice=Math.round(p.price*(1-p._dealDiscount/100));
      return`<div class="pc fu" style="min-width:120px;max-width:120px;position:relative" onclick="openPD(${typeof p.id==='string'?"'"+p.id.replace(/'/g,"\\'")+"'":p.id})">
        <span style="position:absolute;top:4px;left:4px;z-index:3;background:#ef4444;color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:6px">${p._dealBadge}</span>
        <img src="${getItemImage(p)}" alt="${p.name}" loading="lazy" style="height:82px;background:#f0fdf8;border-radius:10px" onerror="this.src='images/nektaIcon.svg'">
        <div class="pname" style="font-size:11px;font-weight:700">${p.name}</div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:4px">
          <span class="pprice">₹${discPrice}</span>
          <span style="font-size:10px;text-decoration:line-through;color:#94a3b8">₹${p.price}</span>
        </div>
      </div>`;
    }).join('')
  }</div></div>`;
}

// ═══════════════════════════════════════════════════════════
// NEW ZEPTO-LEVEL SECTIONS (From zepto-features.js)
// ═══════════════════════════════════════════════════════════

// 1. PERSONALIZED RECOMMENDATIONS SECTION
function mkRecommendationsSlider(){
  if(!window.generateRecommendations) return '';
  const recs = window.generateRecommendations();
  if(!recs.length) return '';
  return `<div class="sec">
    <div class="sec-hdr">
      <span class="sec-title">🎯 Recommended for You</span>
      <button class="seeall" onclick="showView('catalog')">See all</button>
    </div>
    <div class="hs-slider">
      ${recs.map(p => {
        if(!p || p.hidden || p.outOfStock) return '';
        const idQuoted = typeof p.id === 'string' ? "'"+p.id.replace(/'/g,"\\'")+"'" : p.id;
        return `<div style="position:relative;min-width:120px;max-width:120px" onclick="trackViewedProduct(${JSON.stringify(p).replace(/"/g,'&quot;')});openPD(${idQuoted})">
          ${window.addSocialProofBadge?window.addSocialProofBadge(p):''}
          ${mkSmCard(p, false, '120px', '82px')}
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// 2. FLASH SALES WITH COUNTDOWN
function mkFlashSalesSlider(){
  if(!window.getFlashSales) return '';
  const flash = window.getFlashSales();
  if(!flash.length) return '';
  
  const products = _getProds();
  const flash_html = flash.map(sale => {
    const items = products.filter(p => 
      sale.categories.includes(p.category) && 
      !p.outOfStock && 
      !p.hidden
    ).slice(0, 6);
    
    if(!items.length) return '';
    
    const hours = Math.floor(sale.timeLeft / 60);
    const mins = sale.timeLeft % 60;
    const timeStr = `${hours}h ${mins}m left`;
    
    return `<div class="sec">
      <div style="margin:0 16px 12px;border-radius:16px;padding:14px 16px;background:linear-gradient(135deg,${sale.badgeColor},${sale.badgeColor}dd);display:flex;align-items:center;gap:12px;color:#fff">
        <span style="font-size:24px;animation:pulse 2s ease-in-out infinite">⚡</span>
        <div>
          <div style="font-weight:900;font-size:14px;font-family:'Nunito',sans-serif">${sale.name}</div>
          <div style="font-size:11px;opacity:.8;margin-top:2px;display:flex;align-items:center;gap:6px">
            <span style="display:inline-block;width:8px;height:8px;background:#fff;border-radius:50%;animation:countdown 1s infinite"></span>
            ${timeStr}
          </div>
        </div>
        <div style="margin-left:auto;background:rgba(255,255,255,.2);padding:6px 12px;border-radius:12px;font-weight:800;font-size:12px">-${sale.discount}%</div>
      </div>
      <div class="hs-slider">
        ${items.map(p => {
          const discPrice = Math.round(p.price * (1 - sale.discount / 100));
          const idQuoted = typeof p.id === 'string' ? "'"+p.id.replace(/'/g,"\\'")+"'" : p.id;
          return `<div class="pc fu" style="min-width:120px;max-width:120px;position:relative" onclick="openPD(${idQuoted})">
            <span style="position:absolute;top:4px;left:4px;z-index:3;background:${sale.badgeColor};color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:6px">⚡ -${sale.discount}%</span>
            <img src="${getItemImage(p)}" alt="${p.name}" loading="lazy" style="height:82px;background:#f0fdf8;border-radius:10px" onerror="this.src='images/nektaIcon.svg'">
            <div class="pname" style="font-size:11px;font-weight:700">${p.name}</div>
            <div style="display:flex;align-items:center;gap:4px;margin-top:4px">
              <span class="pprice">₹${discPrice}</span>
              <span style="font-size:10px;text-decoration:line-through;color:#94a3b8">₹${p.price}</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
  
  return flash_html;
}

// 3. QUICK REORDER (Last 3 items bought)
function mkQuickReorderSlider(){
  const hist = JSON.parse(localStorage.getItem('nk_hist') || '[]');
  if(!hist.length) return '';
  
  const products = _getProds();
  const lastOrder = hist[hist.length - 1];
  if(!lastOrder || !lastOrder.itemIds || !lastOrder.itemIds.length) return '';
  
  const items = lastOrder.itemIds
    .map(id => products.find(p => String(p.id) === String(id)))
    .filter(p => p && !p.hidden && !p.outOfStock)
    .slice(0, 6);
  
  if(!items.length) return '';
  
  return `<div class="sec">
    <div class="sec-hdr">
      <span class="sec-title">🔁 Reorder from Last Order</span>
      <button class="seeall" onclick="showOrderHistory()">Orders</button>
    </div>
    <div class="hs-slider">
      ${items.map(p => {
        const idQuoted = typeof p.id === 'string' ? "'"+p.id.replace(/'/g,"\\'")+"'" : p.id;
        return `<div style="position:relative;min-width:120px;max-width:120px">
          <div style="position:absolute;top:6px;right:6px;z-index:4">
            <button onclick="event.stopPropagation();quickAddToCart(${idQuoted})" style="
              background:var(--g);color:#fff;border:none;width:32px;height:32px;
              border-radius:50%;cursor:pointer;font-size:18px;display:flex;
              align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,185,107,.3)
            ">+</button>
          </div>
          ${mkSmCard(p, false, '120px', '82px')}
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// 4. LOCATION-BASED OFFERS
function mkLocationOffersSlider(){
  if(!window.getLocationPromos) return '';
  const promos = window.getLocationPromos();
  if(!promos.length) return '';
  
  return `<div class="sec">
    <div class="sec-hdr"><span class="sec-title">📍 Area Exclusive Offers</span></div>
    <div style="display:flex;gap:8px;overflow-x:auto;padding:0 12px;margin-bottom:12px">
      ${promos.map(p => `
        <div style="
          flex:0 0 auto;
          background:linear-gradient(135deg,#667eea,#764ba2);
          color:#fff;
          border-radius:14px;
          padding:12px 16px;
          cursor:pointer
        " onclick="applyPromo('${p.promo}')">
          <div style="font-weight:800;font-size:13px">${p.title}</div>
          <div style="font-size:11px;opacity:.85;margin-top:4px">${p.desc}</div>
          ${p.discount ? `<div style="margin-top:6px;background:rgba(255,255,255,.2);padding:4px 8px;border-radius:8px;font-size:10px;font-weight:800;display:inline-block">${p.discount}% off</div>` : ''}
        </div>
      `).join('')}
    </div>
  </div>`;
}

// 6. RECENTLY VIEWED
function mkRecentlyViewedSlider(){
  if(!window.getRecentlyViewed) return '';
  const viewed = window.getRecentlyViewed().slice(0, 6);
  if(!viewed.length) return '';
  
  const products = _getProds();
  const items = viewed.map(v => products.find(p => String(p.id) === String(v.id))).filter(Boolean);
  if(!items.length) return '';
  
  return `<div class="sec">
    <div class="sec-hdr">
      <span class="sec-title">👀 Recently Viewed</span>
      <button class="seeall" onclick="clearRecentlyViewed()">Clear</button>
    </div>
    <div class="hs-slider">
      ${items.map(p => {
        const idQuoted = typeof p.id === 'string' ? "'"+p.id.replace(/'/g,"\\'")+"'" : p.id;
        return `<div style="position:relative;min-width:120px;max-width:120px" onclick="openPD(${idQuoted})">
          ${mkSmCard(p, false, '120px', '82px')}
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

window.clearRecentlyViewed = function(){
  localStorage.removeItem('nk_viewed');
  window._zeptoFeatures.viewedProducts = [];
  renderHSecs();
};

function mkSec(title,ids,cat,isCombo=false){
  const ps=ids.map(id=>products.find(p=>p.id===id)).filter(Boolean);
  if(!ps.length)return'';
  const w=isCombo?'132px':'120px', ih=isCombo?'70px':'82px';
  return`<div class="sec"><div class="sec-hdr"><span class="sec-title">${title}</span><button class="seeall" onclick="toCat('${cat}')">See all</button></div><div class="hscroll">${ps.map(p=>mkSmCard(p,isCombo,w,ih)).join('')}</div></div>`;
}
function mkSmCard(p,isCombo,w,ih){
  const oos=p.outOfStock===true;
  const idQuoted = typeof p.id === 'string' ? "'"+p.id.replace(/'/g,"\\'")+"'" : p.id;
  if(isCombo){
    // Combo cards → special gold design, show included items clearly
    const items=p.description?p.description.split('+').map(s=>s.trim()).filter(Boolean):[];
    return`<div class="pc fu" style="min-width:${w};max-width:${w};border:1.5px solid #fde68a;background:linear-gradient(135deg,#fffbeb,#fef3c7);padding:10px;border-radius:16px" onclick="openPD(${idQuoted})">
      <div style="position:relative">
        <img src="${getItemImage(p)}" alt="${p.name}" loading="lazy" decoding="async" style="height:${ih};width:100%;object-fit:cover;border-radius:10px;background:#f0fdf4" onerror="this.src='images/nektaIcon.svg'">
        <span style="position:absolute;top:4px;left:4px;background:#f59e0b;color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:6px;letter-spacing:.3px">COMBO</span>
      </div>
      <div style="font-size:11px;font-weight:800;color:#78350f;margin-top:7px;line-height:1.3;font-family:'Plus Jakarta Sans',sans-serif">${p.name}</div>
      ${p.teluguName?`<div style="font-size:9px;color:#92400e;margin-top:1px;font-family:'Noto Sans Telugu',sans-serif">${p.teluguName}</div>`:''}
      ${items.length?`<div style="font-size:9px;color:#b45309;margin-top:4px;line-height:1.4">${items.slice(0,2).join(' · ')}${items.length>2?' +more':''}</div>`:''}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:3px;margin-top:6px" onclick="event.stopPropagation()">
        <span style="font-weight:900;font-size:13px;color:#059669;font-family:'Nunito',sans-serif;flex-shrink:0">&#8377;${p.price}</span>
        <div id="hbtn-${p.id}" style="flex-shrink:0">${oos?'<span style="font-size:9px;color:#ef4444;font-weight:700">Out</span>':getBtnHtml(p.id,'h')}</div>
      </div>
    </div>`;
  }
  // Each product is a flat single-price item after expandProductVariants
  const smDisplayPrice = p.price;
  const smUnit = p.unit || '';
  return`<div class="pc fu" style="min-width:${w};max-width:${w}" onclick="openPD(${idQuoted})">
    <div class="pc-img-wrap" style="border-radius:10px">
      ${p.slashedPrice?'<span class="sale-tag">SALE</span>':''}
      <img src="${getItemImage(p)}" alt="${p.name}" loading="lazy" decoding="async" style="background:#f0fdf4" onerror="this.src='images/nektaIcon.svg'">
    </div>
    <div class="pname" style="font-size:11px;font-weight:700">${p.name}</div>
    ${p.teluguName?`<div class="ptel">${p.teluguName}</div>`:''}
    <div style="display:flex;align-items:center;justify-content:space-between;gap:3px;margin-top:4px;min-height:28px" onclick="event.stopPropagation()">
      <div style="flex-shrink:0">
        <span class="pprice">₹${smDisplayPrice}</span>
        <div style="font-size:8px;color:#94a3b8;font-weight:600;margin-top:1px">${smUnit}</div>
      </div>
      <div id="hbtn-${p.id}" style="flex-shrink:0">${oos?'<span style="font-size:9px;color:#ef4444;font-weight:700">Out</span>':getBtnHtml(p.id,'h')}</div>
    </div>
    ${oos?'<div class="pstock">Out of Stock</div>':''}
  </div>`;
}
window.mkSmCard=mkSmCard;

// --- CATALOG ---
// renderCGrid, filterCat → defined in catalog-ui.js (loaded after app-core)
function mkFullCard(p){
  const oos=p.outOfStock===true;
  const discount=p.slashedPrice?Math.round((1-p.price/p.slashedPrice)*100):0;
  // Each product is a flat single-price item — just show p.price and p.unit directly
  const fcDisplayPrice = p.price;
  const fcUnit = p.unit ? '/ '+p.unit : '';
  const idQuoted = typeof p.id === 'string' ? "'"+p.id.replace(/'/g,"\\'")+"'" : p.id;
  return`<div class="pc fu" id="fpc-${p.id}" onclick="openPD(${idQuoted})">
    <div class="pc-img-wrap">
      <img src="${getItemImage(p)}" alt="${p.name}" loading="lazy" style="background:#f0fdf4" onerror="this.src='images/nektaIcon.svg'">
      ${discount>=5?`<span class="sale-tag">${discount}%<br>OFF</span>`:''}
    </div>
    <div class="pname">${p.name}</div>
    ${p.teluguName?`<div class="ptel" style="font-size:10px;margin-bottom:2px">${p.teluguName}</div>`:''}
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;gap:2px">
      <div>
        <span class="pprice">&#8377;${fcDisplayPrice}</span>
        ${p.slashedPrice?`<span class="pslash">&#8377;${p.slashedPrice}</span>`:''}
        ${fcUnit?`<div style="font-size:8.5px;color:#94a3b8;font-weight:600;margin-top:1px">${fcUnit}</div>`:''}
      </div>
    </div>
    <div onclick="event.stopPropagation()"><div id="cbtn-${p.id}">${oos?'<div style="text-align:center;font-size:10px;font-weight:700;color:#ef4444;padding:5px 0">Out of Stock</div>':getBtnHtml(p.id,'c')}</div></div>
    ${oos?'<div class="pstock">Out of Stock</div>':''}
  </div>`;
}
window.mkFullCard=mkFullCard;
function mkWBtns(p){
  const idQuoted = typeof p.id==='string' ? "'"+p.id.replace(/'/g,"\\'")+"'" : p.id;
  const opts = getUnitOptions(p);
  // Only render variant buttons if there are 2+ options
  if(opts.length < 2) return '';
  return`<div class="wgrid" style="grid-template-columns:repeat(${opts.length},1fr)">${
    opts.map(o=>`<button class="wbtn" onclick="setQty(${idQuoted},${o.qty});toast('${o.label} added ✅','success')"><div style="font-size:12px;font-weight:700">${o.label}</div><div style="color:#059669;font-weight:800;font-size:12px">₹${o.price}</div></button>`).join('')
  }</div>`;
}

// --- PRODUCT DETAIL ---
function openPD(id){
  // Close search overlay if open
  var _so=document.getElementById('srch-ov');
  if(_so&&_so.classList.contains('on'))_so.classList.remove('on');
  const _prods=(window._activeShopId&&window._shopOverrideProducts)?window._shopOverrideProducts:(window._allProducts||products);
  // FIX: compare as strings to handle Firestore string IDs vs numeric seed IDs
  const p=_prods.find(x=>String(x.id)===String(id))||products.find(x=>String(x.id)===String(id));if(!p)return;
  _pdProduct=p; selectedCut=null;
  // FIX: always use the resolved product's own id for info lookup, not the raw passed-in id
  const info=window.getProductInfo?getProductInfo(p.id):null;
  const isFav=favs.has(id);
  document.getElementById('pd-img').src=getItemImage(p);
  document.getElementById('pd-name').textContent=p.name;
  document.getElementById('pd-tel').textContent=p.teluguName||'';
  document.getElementById('pd-cat').textContent=p.category;
  document.getElementById('pd-tagline').textContent=p.category==='COMBOS'?'Complete meal kit – everything in one pack! 🎁 ':(info?.tagline||'Fresh delivered to your door');
  document.getElementById('pd-freshness').textContent=info?.freshness||'Best consumed fresh';
  document.getElementById('pd-origin').textContent=info?.origin?'📍 '+info.origin:'';
  document.getElementById('pd-fav-btn').textContent=isFav?'❤️':'🤍';
  document.getElementById('pd-stock-tag').style.display=p.outOfStock?'block':'none';
  const pp=document.getElementById('pd-prices');pp.innerHTML='';
  // Each product is a flat single-price item — show price + unit, no variant selector
  pp.innerHTML=`<div><span class="pprice" style="font-size:28px;font-family:'Nunito',sans-serif">₹${p.price}</span> <span style="font-size:13px;color:#94a3b8">${p.unit}</span>${p.slashedPrice?` <span class="pslash" style="font-size:14px">₹${p.slashedPrice}</span>`:''}</div>`;
  selectedPdQty=1;
  const cuttingSec=document.getElementById('pd-cutting-sec');
  if(info?.cuttingOptions?.length){
    cuttingSec.style.display='block';
    document.getElementById('pd-cutting-opts').innerHTML=info.cuttingOptions.map(c=>`<span class="cut-chip" onclick="selectCut(this,'${c}')">${c}</span>`).join('');
  } else cuttingSec.style.display='none';
  // For COMBOS: show included items, not health benefits
  const benefitsEl=document.getElementById('pd-benefits');
  const comboIncEl=document.getElementById('pd-combo-items');
  if(p.category==='COMBOS'){
    // Hide benefits section, show combo items
    const benefitsSec=document.getElementById('pd-benefits-sec');
    if(benefitsSec) benefitsSec.style.display='none';
    if(comboIncEl){
      comboIncEl.style.display='block';
      const comboItems=p.description?p.description.split('+').map(s=>s.trim()).filter(Boolean):[];
      comboIncEl.innerHTML=`
        <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1.5px solid #fde68a;border-radius:16px;padding:14px;margin:10px 0">
          <div style="font-weight:800;font-size:13px;color:#92400e;margin-bottom:10px;display:flex;align-items:center;gap:6px">
            📦 Combo Includes
          </div>
          ${comboItems.map(item=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #fde68a">
            <span style="color:#f59e0b;font-size:14px">✅</span>
            <span style="font-size:13px;font-weight:600;color:#78350f">${item}</span>
          </div>`).join('')}
          <div style="margin-top:10px;background:#f59e0b;color:#fff;text-align:center;padding:8px;border-radius:10px;font-weight:800;font-size:12px">
            🎁 Save time – everything in one order!
          </div>
        </div>`;
    } else {
      // fallback → inject into benefits el
      if(benefitsEl){
        const comboItems=p.description?p.description.split('+').map(s=>s.trim()).filter(Boolean):[];
        benefitsEl.innerHTML=comboItems.map(item=>`<span class="benefit-chip" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a">✅ ${item}</span>`).join('');
      }
    }
  } else {
    const benefitsSec=document.getElementById('pd-benefits-sec');
    if(benefitsSec) benefitsSec.style.display='block';
    if(comboIncEl) comboIncEl.style.display='none';
    if(benefitsEl) benefitsEl.innerHTML=(info?.benefits||['✅ Fresh & quality assured','✅ Sourced locally','✅ Delivered same day']).map(b=>`<span class="benefit-chip">${b.startsWith('✅')?b:'✅ '+b}</span>`).join('');
  }
  const nutrSec=document.getElementById('pd-nutr-sec');
  if(p.category==='COMBOS'){
    if(nutrSec) nutrSec.style.display='none';
  } else if(info?.nutrition){
    nutrSec.style.display='block';
    document.getElementById('pd-nutr').innerHTML=`
      <div class="nutr-cell"><div class="val">${info.nutrition.cal}</div><div class="lbl">Calories</div></div>
      <div class="nutr-cell"><div class="val">${info.nutrition.protein}</div><div class="lbl">Protein</div></div>
      <div class="nutr-cell"><div class="val">${info.nutrition.carbs}</div><div class="lbl">Carbs</div></div>
      <div class="nutr-cell"><div class="val">${info.nutrition.fiber}</div><div class="lbl">Fiber</div></div>
      <div class="nutr-cell" style="grid-column:span 2"><div class="val" style="font-size:12px">${info.nutrition.vitamins}</div><div class="lbl">Vitamins</div></div>`;
  } else nutrSec.style.display='none';
  const recipeSec=document.getElementById('pd-recipe-sec');
  if(info?.recipes?.length){
    recipeSec.style.display='block';
    document.getElementById('pd-recipes').innerHTML=info.recipes.map(r=>`<span class="recipe-chip">✅ ${r}</span>`).join('');
    const tEl=document.querySelector('#pd-tips span');
    if(tEl){tEl.textContent=info.tips||'';document.getElementById('pd-tips').style.display=info.tips?'flex':'none';}
  } else recipeSec.style.display='none';
  renderPDReviews(id);
  const related=products.filter(x=>x.category===p.category&&x.id!==id).slice(0,6);
  document.getElementById('pd-related').innerHTML=related.map(r=>mkSmCard(r,false,'110px','72px')).join('');
  document.getElementById('pd-related').querySelectorAll('img[data-src]').forEach(function(img){ if(window.observeImg) window.observeImg(img); });
  _renderPdBottom(p, id);
  document.getElementById('pd-page').classList.add('on');
  document.getElementById('pd-body').scrollTop=0;
}
function _renderPdBottom(p, id){
  var cartKey=Object.keys(cart).find(function(k){return String(k)===String(id);});
  var item=cartKey!==undefined?cart[cartKey]:undefined;
  var inCart=item&&item.qty>0;
  var addArea=document.getElementById('pd-add-area');
  var cartBar=document.getElementById('pd-cart-bar');
  // update inline add/qty button
  if(addArea) addArea.innerHTML=getBtnHtml(id,'pd');
  // show/hide sticky cart bar at bottom
  if(cartBar){
    if(inCart){
      var cnt=cartCnt();
      cartBar.style.display='block';
      cartBar.innerHTML='<div onclick="closePD();showView(\'cart\')" style="display:flex;align-items:center;width:100%;background:#1a2e23;cursor:pointer">'
        +'<div style="flex:1;display:flex;align-items:center;gap:10px;padding:12px 14px">'
        +'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>'
        +'<span style="color:rgba(255,255,255,.9);font-size:13px;font-weight:700">'+cnt+' item'+(cnt>1?'s':'')+'</span>'
        +'<span style="color:rgba(255,255,255,.35);font-size:11px">|</span>'
        +'<span style="color:#fff;font-weight:900;font-size:14px;font-family:\'Nunito\',sans-serif">&#8377;'+cartSub()+'</span>'
        +'</div>'
        +'<div style="background:linear-gradient(135deg,#00b96b,#00d97e);padding:12px 18px;display:flex;align-items:center;gap:6px">'
        +'<span style="color:#fff;font-weight:900;font-size:13px">View Cart</span>'
        +'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
        +'</div>'
        +'</div>';
    } else {
      cartBar.style.display='none';
      cartBar.innerHTML='';
    }
  }
}
function closePD(){document.getElementById('pd-page').classList.remove('on');_pdProduct=null;}
window.closeProductDetail=closePD;
function pdToggleFav(){if(_pdProduct){toggleFav(_pdProduct.id);document.getElementById('pd-fav-btn').textContent=favs.has(_pdProduct.id)?'❤️':'🤍';}}
function selectCut(el,cut){document.querySelectorAll('.cut-chip').forEach(c=>c.classList.remove('sel'));el.classList.add('sel');selectedCut=cut;}
function renderPDReviews(id){
  const revs=window.getProductReviews?getProductReviews(id):[];
  const el=document.getElementById('pd-reviews');
  if(!revs.length){el.innerHTML='<p style="font-size:13px;color:#94a3b8;padding:8px 0">No reviews yet. Be the first! 😊</p>';return;}
  // XSS FIX: Escape user input (review text and names) to prevent injection
  el.innerHTML=revs.slice(0,5).map(r=>`<div class="review-item"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>${'⭐'.repeat(r.rating||5)}</span><span style="font-size:11px;color:#94a3b8">${new Date(r.ts).toLocaleDateString('en-IN')}</span></div><p style="font-size:13px;color:#374151">${esc(r.text)}</p><p style="font-size:11px;color:#94a3b8;margin-top:4px">• ${esc(r.name||'Customer')}</p></div>`).join('');
}
function showAddReview(){
  if(!_pdProduct)return;
  showMdl(`<h3 style="font-weight:900;font-size:18px;margin-bottom:16px">📝 Write Review</h3>
    <div class="fg"><label class="flbl">Rating</label><div style="display:flex;gap:10px">${[1,2,3,4,5].map(n=>`<span style="font-size:32px;cursor:pointer" onclick="window._selR=${n};document.querySelectorAll('.rstar').forEach((s,i)=>s.style.opacity=i<${n}?'1':'.3')" class="rstar">⭐</span>`).join('')}</div></div>
    <div class="fg"><label class="flbl">Your Name</label><input id="rev-name" class="fi" placeholder="Your name"></div>
    <div class="fg"><label class="flbl">Review</label><textarea id="rev-text" class="fi" rows="3" placeholder="How was the freshness? Taste?" style="resize:none"></textarea></div>
    <button class="pbtn" onclick="submitReview()">Submit Review</button>`);
}
window._selR=5;
function submitReview(){
  if(!_pdProduct)return;
  const text=document.getElementById('rev-text')?.value.trim();
  if(!text){toast('Write something','error');return;}
  const name=document.getElementById('rev-name')?.value.trim();
  if(window.saveProductReview) saveProductReview(_pdProduct.id,{rating:window._selR||5,name,text});
  closeMdl(); renderPDReviews(_pdProduct.id);
  toast('Review submitted! 👍','success');
}

// --- CART OPS ---
function _isWeightUnit(unit){
  // Only treat as weight if unit is exactly Kg, starts with 'Kg (', or is exactly 'L' or starts with 'L ('
  // Excludes: '1L', '500ml', '200ml', 'Pack', 'Pc', 'Bunch' etc.
  return unit==='Kg'||unit.startsWith('Kg (')||unit==='L'||unit.startsWith('L (');
}
function getUnitOptions(p){
  if(!p)return[];
  if(_isWeightUnit(p.unit)){
    const opts=[];
    if(p.quarterPrice) opts.push({qty:0.25, label:'250g', price:p.quarterPrice});
    if(p.halfPrice)    opts.push({qty:0.5,  label:'500g', price:p.halfPrice});
    opts.push({qty:1, label:p.unit==='L'?'1L':'1Kg', price:p.price});
    return opts;
  }
  // For all other units: only add variant buttons if halfPrice/quarterPrice exist
  const opts=[{qty:1, label:'1 '+p.unit, price:p.price}];
  if(p.halfPrice)    opts.push({qty:2, label:'2 '+p.unit, price:p.halfPrice});
  if(p.quarterPrice) opts.push({qty:3, label:'3 '+p.unit, price:p.quarterPrice});
  return opts;
}
function itemCost(id,qty){
  var _prods=(window._activeShopId&&window._shopOverrideProducts)?window._shopOverrideProducts:(window._allProducts||products);
  var shopProds=window._shopOverrideProducts||[];
  var p=_prods.find(function(x){return String(x.id)===String(id);})||shopProds.find(function(x){return String(x.id)===String(id);});
  if(!p)return 0;
  // Each product is a flat single-price item — cost = price × qty
  return Math.round(p.price*qty);
}
function addPackItem(id,qty){
  const _prods=(window._activeShopId&&window._shopOverrideProducts)?window._shopOverrideProducts:(window._allProducts||products);
  const p=_prods.find(x=>x.id===id);if(!p)return;
  const cost=qty===1?p.halfPrice:p.price;
  cart[id]={qty,cost};
  saveCart();refreshBtn(id,'c');updateFCart();updateBadge();
  toast((p.name)+' added 🎉','success');
}
window.addPackItem=addPackItem;
function getBtnHtml(id,pfx){
  pfx=pfx||'';
  var cartKey=Object.keys(cart).find(function(k){return String(k)===String(id);});
  var item=cartKey!==undefined?cart[cartKey]:undefined;
  var _prods=(window._activeShopId&&window._shopOverrideProducts)?window._shopOverrideProducts:(window._allProducts||products);
  var shopProds=window._shopOverrideProducts||[];
  var p=_prods.find(function(x){return String(x.id)===String(id);})||shopProds.find(function(x){return String(x.id)===String(id);});
  var oos=p&&p.outOfStock;
  var idQuoted=typeof id==='string'?'\''+id+'\'':id;
  if(oos)return '<span style="font-size:10px;color:#ef4444;font-weight:700">Out of stock</span>';
  // FIX #8: Block products with price=0 from being added to cart (173 products had price=0 from incomplete XLSX sync).
  // They display as "Price TBD" instead of letting customers order them for free.
  if(p && (!p.price || p.price === 0))return '<span style="font-size:10px;color:#94a3b8;font-weight:700">Price TBD</span>';
  if(!item||item.qty<=0){
    return '<button class="addbtn" onclick="event.stopPropagation();addItem('+idQuoted+',\''+pfx+'\')" aria-label="Add to cart">+ Add</button>';
  }
  // Each product is a flat single-price item — always step by 1
  var step=1;
  var displayQty=item.qty+' '+(p&&p.unit?p.unit:'');
  var cost=item.cost||itemCost(id,item.qty);
  // For home screen (pfx='h'), show just quantity. For others, show quantity + price
  var lbl=(pfx==='h'||pfx==='pd')?displayQty:displayQty+' - ₹'+cost;
  return ['<div class="qtyc" onclick="event.stopPropagation()">',
    '<button class="qty-minus" onclick="chgQty('+idQuoted+',-'+step+',\''+pfx+'\')" aria-label="Decrease">−</button>',
    '<span style="color:#fff;font-size:10px;font-weight:800;flex:1;text-align:center;white-space:nowrap;padding:0 4px">'+lbl+'</span>',
    '<button class="qty-plus" onclick="chgQty('+idQuoted+','+step+',\''+pfx+'\')" aria-label="Increase">+</button>',
    '</div>'].join('');
}
window.getBtnHtml=getBtnHtml;
function fmtQty(qty,unit){
  if(!unit)return qty.toFixed(2).replace(/\.?0+$/,'');
  if(unit.includes('Kg')||unit.includes('L')){
    const isL=unit.includes('L');
    if(qty===0.25)return isL?'250ml':'250g';
    if(qty===0.5)return isL?'500ml':'500g';
    if(qty===0.75)return isL?'750ml':'750g';
    if(Math.abs(qty-1)<0.01)return isL?'1L':'1Kg';
    // For other weights
    if(isL){
      const ml=Math.round(qty*1000);
      return ml<1000?ml+'ml':qty+'L';
    }else{
      const g=Math.round(qty*1000);
      return g<1000?g+'g':qty+'Kg';
    }
  }
  if(unit==='Bunch')return qty+'Bunch';
  if(unit==='Pc'||unit==='Doz'||unit==='DozBundle')return qty+unit;
  if(unit==='Pack')return qty+'Pack';
  return qty;
}
function getQtyDisplay(qty,unit){
  // Used for showing in cart: "1Kg Tomato → ₹65 = ₹65"
  return fmtQty(qty,unit);
}
// ── CART CONFLICT DIALOG ─────────────────────────────────────────────────────
var _cartConflictCallback = null;

function showCartConflict(fromShopName, toShopName, onConfirm) {
  _cartConflictCallback = onConfirm;
  var msg = document.getElementById('cart-conflict-msg');
  var btn = document.getElementById('cart-conflict-confirm');
  if (msg) {
    var from = fromShopName || 'current store';
    var to   = toShopName   || 'this store';
    msg.textContent = 'Your cart has items from "' + from + '". Clear them and start a fresh cart from "' + to + '"?';
  }
  if (btn) {
    btn.onclick = function() {
      closeCartConflict();
      if (typeof _cartConflictCallback === 'function') _cartConflictCallback();
    };
  }
  var modal = document.getElementById('cart-conflict-modal');
  if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}

function closeCartConflict() {
  var modal = document.getElementById('cart-conflict-modal');
  if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
  _cartConflictCallback = null;
}
window.closeCartConflict = closeCartConflict;

document.addEventListener('click', function(e) {
  var modal = document.getElementById('cart-conflict-modal');
  if (modal && e.target === modal) closeCartConflict();
});

// ── ADD ITEM ─────────────────────────────────────────────────────────────────
function addItem(id, pfx) {
  pfx = pfx || '';
  var _prods = (window._activeShopId && window._shopOverrideProducts)
    ? window._shopOverrideProducts
    : (window._allProducts || products);
  var p = _prods.find(function(x) { return String(x.id) === String(id); });
  if (p && p.outOfStock) { toast('Out of stock', 'warning'); return; }
  // FIX #8: Block ordering zero-price products — price hasn't been set yet
  if (p && (!p.price || p.price === 0)) { toast('Price not set — check back soon', 'warning'); return; }

  var incomingShopId   = window._activeShopId   || null;
  var incomingShopName = window._activeShopName  || 'Nekta Store';

  var cartKeys     = Object.keys(cart);
  var cartHasItems = cartKeys.length > 0;

  if (cartHasItems) {
    var cartShopId   = localStorage.getItem('nk_cart_shopId')   || null;
    var cartShopName = localStorage.getItem('nk_cart_shopName') || 'Nekta Store';
    // Normalise: empty string = null (Nekta store)
    if (cartShopId === '') cartShopId = null;

    var isConflict = String(incomingShopId) !== String(cartShopId);

    if (isConflict) {
      showCartConflict(cartShopName, incomingShopName, function() {
        cart = {};
        localStorage.setItem('nk_cart_shopId',   incomingShopId   || '');
        localStorage.setItem('nk_cart_shopName', incomingShopName || '');
        saveCart(); updateFCart(); updateBadge();
        _doAddItem(id, pfx, p);
      });
      return;
    }
  } else {
    // Cart is empty — stamp with this shop's source
    localStorage.setItem('nk_cart_shopId',   incomingShopId   || '');
    localStorage.setItem('nk_cart_shopName', incomingShopName || '');
  }

  _doAddItem(id, pfx, p);
}

function _doAddItem(id, pfx, p) {
  if (!p) return;
  // Each product is a flat single-price item — always add 1 unit
  cart[id] = { qty: 1, cost: itemCost(id, 1) };
  saveCart(); refreshBtn(id, pfx); updateFCart(); updateBadge();

}

// NEW: Show "Item Added to Cart" modal (Zepto-style)
function addItemWithModal(id, pfx) {
  pfx = pfx || '';
  var _prods = (window._activeShopId && window._shopOverrideProducts)
    ? window._shopOverrideProducts
    : (window._allProducts || products);
  var p = _prods.find(function(x) { return String(x.id) === String(id); });
  if (p && p.outOfStock) { toast('Out of stock', 'warning'); return; }
  if (p && (!p.price || p.price === 0)) { toast('Price not set — check back soon', 'warning'); return; }

  var incomingShopId   = window._activeShopId   || null;
  var incomingShopName = window._activeShopName  || 'Nekta Store';
  var cartKeys     = Object.keys(cart);
  var cartHasItems = cartKeys.length > 0;

  if (cartHasItems) {
    var cartShopId   = localStorage.getItem('nk_cart_shopId')   || null;
    var cartShopName = localStorage.getItem('nk_cart_shopName') || 'Nekta Store';
    if (cartShopId === '') cartShopId = null;
    var isConflict = String(incomingShopId) !== String(cartShopId);
    if (isConflict) {
      showCartConflict(cartShopName, incomingShopName, function() {
        cart = {};
        localStorage.setItem('nk_cart_shopId',   incomingShopId   || '');
        localStorage.setItem('nk_cart_shopName', incomingShopName || '');
        saveCart(); updateFCart(); updateBadge();
        _doAddItem(id, pfx, p);
      });
      return;
    }
  } else {
    localStorage.setItem('nk_cart_shopId',   incomingShopId   || '');
    localStorage.setItem('nk_cart_shopName', incomingShopName || '');
  }
  _doAddItem(id, pfx, p);
}

function showItemAddedModal(id, product, initialQty) {
  var mdl = document.getElementById('item-added-modal');
  if (!mdl) {
    mdl = document.createElement('div');
    mdl.id = 'item-added-modal';
    mdl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:999;display:none;align-items:flex-end;justify-content:center;backdrop-filter:blur(8px)';
    mdl.onclick = function(e) { if (e.target === mdl) closeItemAddedModal(); };
    document.body.appendChild(mdl);
  }

  var imgSrc = getItemImage(product);
  var pricePer = product.halfPrice || product.price;
  var qtyDisplay = fmtQty(initialQty, product.unit);
  var totalPrice = (product.cost || itemCost(id, initialQty)) || 0;

  mdl.innerHTML = `<div style="background:var(--card);border-radius:24px 24px 0 0;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;animation:slideUp .3s cubic-bezier(.34,1.56,.64,1)">
    <div style="padding:20px;display:flex;gap:14px;align-items:center;border-bottom:1px solid var(--border)">
      <img src="${imgSrc}" alt="${product.name}" onerror="this.src='images/nektaIcon.svg'" style="width:70px;height:70px;border-radius:12px;object-fit:cover;background:var(--bg)">
      <div style="flex:1">
        <div style="font-weight:900;font-size:15px;color:var(--dark);font-family:var(--font2);line-height:1.2">${product.name}</div>
        ${product.teluguName ? '<div style="font-size:11px;color:var(--g);margin-top:2px">' + product.teluguName + '</div>' : ''}
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
          <span style="font-weight:900;font-size:14px;color:var(--g)">₹${totalPrice}</span>
          <span style="font-size:11px;color:var(--pale);font-weight:600">${qtyDisplay}</span>
        </div>
      </div>
      <button onclick="closeItemAddedModal()" style="background:none;border:none;cursor:pointer;color:var(--mid);font-size:18px;width:32px;height:32px;display:flex;align-items:center;justify-content:center">✕</button>
    </div>
    
    <div style="padding:20px">
      <div style="background:var(--g3);border-radius:14px;border:2px solid rgba(0,185,107,.3);padding:12px;margin-bottom:18px;display:flex;align-items:center;gap:10px">
        <span style="font-size:24px">✓</span>
        <div>
          <div style="font-weight:900;font-size:13px;color:var(--g);letter-spacing:.3px">ADDED TO CART</div>
          <div style="font-size:11px;color:var(--gd);margin-top:2px">Item queued for checkout</div>
        </div>
      </div>

      <div style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:var(--pale);margin-bottom:8px;letter-spacing:.5px">QUANTITY</div>
        <div class="qtyc" style="background:linear-gradient(135deg,var(--g),var(--g2))">
          <button class="qty-minus" onclick="event.stopPropagation();chgQtyInModal(${id},-0.25)" style="flex-shrink:0">−</button>
          <span id="modal-qty-display" style="color:#fff;font-size:12px;font-weight:800;flex:1;text-align:center">${qtyDisplay}</span>
          <button class="qty-plus" onclick="event.stopPropagation();chgQtyInModal(${id},0.25)" style="flex-shrink:0">+</button>
        </div>
      </div>

      <div style="display:flex;gap:10px">
        <button onclick="closeItemAddedModal();showView('cart')" style="flex:1;background:linear-gradient(135deg,var(--g),var(--g2));color:#fff;border:none;padding:14px;border-radius:12px;font-weight:900;font-size:14px;cursor:pointer;font-family:var(--font);box-shadow:0 4px 12px rgba(0,185,107,.3);transition:all .2s">
          🛒 View Cart
        </button>
        <button onclick="closeItemAddedModal()" style="flex:1;background:var(--card);color:var(--g);border:2px solid var(--g);padding:12px;border-radius:12px;font-weight:900;font-size:14px;cursor:pointer;font-family:var(--font);transition:all .2s">
          Continue Shopping
        </button>
      </div>

      <button onclick="showView('cart')" style="width:100%;margin-top:12px;background:var(--g4);color:var(--g);border:1.5px solid var(--border);padding:11px;border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;font-family:var(--font);letter-spacing:.3px">
        📋 View Cart Items
      </button>
    </div>
  </div>`;

  mdl.style.display = 'flex';
}

function closeItemAddedModal() {
  var mdl = document.getElementById('item-added-modal');
  if (mdl) mdl.style.display = 'none';
}

function chgQtyInModal(id, delta) {
  var ck = Object.keys(cart).find(function(k) { return String(k) === String(id); }) || id;
  if (!cart[ck]) cart[ck] = { qty: 0, cost: 0 };
  var nq = Math.round((cart[ck].qty + delta) * 100) / 100;
  if (nq <= 0.25) nq = 0.25;
  
  var _prods = (window._activeShopId && window._shopOverrideProducts) ? window._shopOverrideProducts : (window._allProducts || products);
  var p = _prods.find(function(x) { return String(x.id) === String(id); });
  
  cart[ck] = { qty: nq, cost: itemCost(id, nq) };
  saveCart(); refreshBtn(id, ''); updateFCart(); updateBadge();
  
  // Update display in modal
  var display = document.getElementById('modal-qty-display');
  if (display) display.textContent = fmtQty(nq, p ? p.unit : undefined);
}

function setQty(id,qty){
  const _prods=(window._activeShopId&&window._shopOverrideProducts)?window._shopOverrideProducts:(window._allProducts||products);
  const p=_prods.find(x=>String(x.id)===String(id));
  const cost=itemCost(id,qty);
  cart[id]={qty,cost};
  saveCart();refreshBtn(id,'c');updateFCart();updateBadge();
  if(p) toast((p.name)+' updated to '+fmtQty(qty,p.unit)+' ✓','info');
}
function chgQty(id,delta,pfx){
  pfx=pfx||'';
  var ck=Object.keys(cart).find(function(k){return String(k)===String(id);})||id;
  if(!cart[ck])cart[ck]={qty:0,cost:0};
  var nq=Math.round((cart[ck].qty+delta)*100)/100;
  if(nq<=0){delete cart[ck];saveCart();refreshBtn(id,pfx);updateFCart();updateBadge();return;}
  cart[ck]={qty:nq,cost:itemCost(id,nq)};
  saveCart();refreshBtn(id,pfx);updateFCart();updateBadge();
}

function refreshBtn(id,pfx){
  const hEl=document.getElementById('hbtn-'+id);if(hEl)hEl.innerHTML=getBtnHtml(id,'h');
  const cEl=document.getElementById('cbtn-'+id);if(cEl)cEl.innerHTML=getBtnHtml(id,'c');
  const sEl=document.getElementById('sbtn-'+id);if(sEl)sEl.innerHTML=getBtnHtml(id,'c');
  if(_pdProduct?.id===id) _renderPdBottom(_pdProduct, id);
  if(curview==='cart')renderCart();
}
function saveCart(){const s={};Object.keys(cart).forEach(k=>{if(cart[k].qty>0)s[k]=cart[k].qty;});localStorage.setItem('nk_cart',JSON.stringify(s));}
window.saveCart=saveCart;
function loadCart(){
  try{
    // If an order was just placed, clear any stale cart data
    var lastOid = localStorage.getItem('lastOrderId');
    var lastOts  = parseInt(localStorage.getItem('lastOrderTs') || '0');
    if(lastOid && (Date.now() - lastOts) < 300000) { // 5 min window
      localStorage.removeItem('nk_cart');
      localStorage.removeItem('nk_cart_shopId');
      localStorage.removeItem('nk_cart_shopName');
      cart = {};
      return;
    }
    var s=JSON.parse(localStorage.getItem('nk_cart')||'{}');
    cart={};
    Object.keys(s).forEach(function(k){
      // Keep as string if it contains non-numeric characters (variant IDs like "148-500g")
      var id = (isNaN(Number(k)) || k.indexOf('-') !== -1) ? k : Number(k);
      var qty=s[k];
      if(qty>0)cart[id]={qty:qty,cost:itemCost(id,qty)};
    });
  }catch(e){cart={};}
}

function applyPromoCode(){
  const code=(document.getElementById('promo-inp')?.value||'').trim().toUpperCase();
  const res=document.getElementById('promo-result');
  if(!code){if(res)res.textContent='Enter a code';return;}
  const promo=window.validatePromoCode?validatePromoCode(code):null;
  if(!promo){
    if(res){res.textContent='⚠️ Invalid or expired code';res.style.color='#ef4444';}
    return;
  }
  // Apply promo
  const sub=cartSub();
  if(promo.type==='percent'){
    const disc=Math.round(sub*(promo.value/100));
    localStorage.setItem('nk_promo_disc',disc);
    localStorage.setItem('nk_promo_code',code);
    if(res){res.textContent=`₹${promo.value}% off applied! You save ₹${disc}`;res.style.color='#059669';}
  } else if(promo.type==='flat'){
    localStorage.setItem('nk_promo_disc',promo.value);
    localStorage.setItem('nk_promo_code',code);
    if(res){res.textContent=`₹${promo.value} off applied!`;res.style.color='#059669';}
  } else if(promo.type==='freedel'){
    localStorage.setItem('nk_free_delivery','true');
    if(res){res.textContent='✅ Free delivery applied!';res.style.color='#059669';}
  }
  renderCart();
  toast('Promo code applied! 🎉','success');
}
function clearCart(){
  if(!Object.keys(cart).length){toast('Cart is empty','info');return;}
  var clearedIds=Object.keys(cart);
  cart={};
  localStorage.removeItem('nk_cart_shopId');
  localStorage.removeItem('nk_cart_shopName');
  saveCart();
  // Refresh every product button on home + catalog so qty steppers reset to "+ Add"
  clearedIds.forEach(function(k){ refreshBtn(isNaN(Number(k))?k:Number(k),''); });
  updateFCart();updateBadge();renderCart();
}
function cartCnt(){return Object.keys(cart).filter(k=>cart[k].qty>0).length;}
function cartItemCnt(){
  // Returns total count of items (considering quantities)
  // E.g., 2Kg + 3 bunches = count of 5 "items"
  let cnt=0;
  Object.values(cart).forEach(i=>{
    cnt+=Math.round(i.qty*100)/100;  // Count partial kgs as fractional
  });
  return Math.ceil(cnt);  // Round up
}
function cartSub(){let s=0;Object.values(cart).forEach(i=>s+=i.cost);return s;}
function updateFCart(){
  const cnt=cartCnt(),fc=document.getElementById('fcart');
  if(cnt>0&&curview!=='cart'&&curview!=='admin'&&curview!=='rider'){
    fc.classList.remove('off');
    var badge=document.getElementById('fc-badge');
    if(badge) badge.textContent=cnt>99?'99+':cnt;
    document.getElementById('fc-tot').innerHTML='&#8377;'+cartSub();
  } else fc.classList.add('off');
}
window.updateFCart=updateFCart;
function updateBadge(){
  const cnt=cartCnt();
  // Update navbar badge
  const b=document.getElementById('cart-badge');
  if(b){
    if(cnt>0){
      b.textContent=cnt>99?'99+':cnt;
      b.classList.add('on');
      b.style.background='#ef4444';
      b.style.color='#fff';
      b.style.fontWeight='900';
      b.style.fontSize='10px';
      b.style.padding='2px 5px';
      b.style.borderRadius='50%';
      b.style.display='inline-flex';
      b.style.alignItems='center';
      b.style.justifyContent='center';
      b.style.minWidth='20px';
      b.style.minHeight='20px';
    }else{
      b.textContent='0';
      b.classList.remove('on');
      b.style.display='none';
    }
  }
  // Update floating cart badge
  const fcBadge=document.getElementById('fc-badge');
  if(fcBadge){
    fcBadge.textContent=cnt>99?'99+':cnt;
    fcBadge.style.display=cnt>0?'flex':'none';
  }
}
window.updateBadge=updateBadge;
function loadFavs(){try{favs=new Set(JSON.parse(localStorage.getItem('nk_favs')||'[]'));}catch{favs=new Set();}}
function saveFavs(){localStorage.setItem('nk_favs',JSON.stringify([...favs]));}
function toggleFav(id){
  if(favs.has(id))favs.delete(id);else favs.add(id);
  saveFavs();
  const el=document.getElementById('fav-'+id);if(el)el.textContent=favs.has(id)?'❤️':'🤍';
  const fc=document.getElementById('pfav-c');if(fc)fc.textContent=favs.size+' saved';
  toast(favs.has(id)?'Added to favourites ❤️':'Removed from favourites','info');
}

// --- SLOT PICKER ---
function renderSlotPicker(){
  const c=document.getElementById('slot-picker');if(!c)return;
  const sel=window.getSelectedSlot?getSelectedSlot():'asap';
  const slots=window.TIME_SLOTS||[{id:'asap',label:'ASAP',sub:'15-20 min',icon:'⚡'},{id:'slot2',label:'Morning',sub:'9-12 PM',icon:'☀️'},{id:'slot4',label:'Evening',sub:'3-6 PM',icon:'🌇'},{id:'slot5',label:'Night',sub:'6-9 PM',icon:'🌙'}];
  c.innerHTML=slots.map(s=>`<div onclick="if(window.setDeliverySlot)setDeliverySlot('${s.id}');renderSlotPicker()" style="flex-shrink:0;background:${s.id===sel?'#059669':'#f0fdf8'};color:${s.id===sel?'#fff':'#1e3a5f'};border:1.5px solid ${s.id===sel?'#059669':'#e2f0eb'};border-radius:12px;padding:8px 12px;cursor:pointer;text-align:center;min-width:80px;transition:all .2s"><div style="font-size:16px">${s.icon}</div><div style="font-size:11px;font-weight:800;margin-top:2px">${s.label}</div><div style="font-size:10px;opacity:.8">${s.sub}</div></div>`).join('');
}

// --- RENDER CART ---
function renderCart(){
  updateFCart();renderSlotPicker();
  const c=document.getElementById('cart-body');
  const keys=Object.keys(cart).filter(k=>cart[k].qty>0);
  if(!keys.length){
    c.innerHTML=`<div class="empty" style="padding:30px 20px 40px;text-align:center;margin:20px">
        <dotlottie-wc
          src="https://lottie.host/0c7b77f6-97f0-48b7-92af-8d6f7bc938a5/X5IkXoQUpK.lottie"
          style="width: 160px;height: 160px;margin:0 auto 16px;display:block"
          autoplay
          loop
        ></dotlottie-wc>
      
      <h3 style="font-weight:900;font-size:22px;color:var(--dark);margin:0 0 6px;font-family:'Nunito',sans-serif">Your Cart is Empty!</h3>
      <p style="font-size:13px;color:#64748b;margin:0 0 20px;line-height:1.5;font-weight:500">Fresh veggies & groceries waiting for you 🎉🎉</p>
      
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="emtbtn" onclick="showView('home')" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:12px 28px;border-radius:12px;font-weight:700;font-size:13px;cursor:pointer;transition:all 0.3s;box-shadow:0 4px 12px rgba(16,185,129,0.3)">
          <span style="display:inline-block;margin-right:8px">🛒</span>Home
        </button>
        <button class="emtbtn" onclick="showView('catalog')" style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border:none;padding:12px 28px;border-radius:12px;font-weight:700;font-size:13px;cursor:pointer;transition:all 0.3s;box-shadow:0 4px 12px rgba(59,130,246,0.3)">
          <span style="display:inline-block;margin-right:8px">🛒</span>Shop Now
        </button>
      </div></div>`;
    
    // Add vibrant animations
    if(!document.getElementById('colorful-cart-style')){
      const style=document.createElement('style');
      style.id='colorful-cart-style';
      style.textContent='@keyframes sway{0%,100%{transform:translateY(0) scale(1) rotateZ(0deg)}25%{transform:translateY(-8px) scale(1.01) rotateZ(-1deg)}50%{transform:translateY(-12px) scale(1.02) rotateZ(0deg)}75%{transform:translateY(-6px) scale(1.01) rotateZ(1deg)}}@keyframes bounce1{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-6px) scale(1.05)}}@keyframes bounce2{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-8px) scale(1.06)}}@keyframes bounce3{0%,100%{transform:translateY(0) scale(1) rotateZ(0deg)}50%{transform:translateY(-10px) scale(1.07) rotateZ(5deg)}}@keyframes twinkle{0%,100%{opacity:0.3;transform:scale(1)}50%{opacity:1;transform:scale(1.2)}}@keyframes pulse{0%,100%{r:110}50%{r:115}}.emtbtn{transition:all 0.3s cubic-bezier(0.34,1.56,0.64,1)!important}.emtbtn:hover{box-shadow:0 8px 20px rgba(16,185,129,0.5)!important;transform:translateY(-3px)!important}.emtbtn:active{transform:scale(0.95)!important}';
      document.head.appendChild(style);
    }
    return;
  }
  const sub=cartSub();
  const lat=parseFloat(localStorage.getItem('custLatitude')),lng=parseFloat(localStorage.getItem('custLongitude'));
  const savedCharge = parseFloat(localStorage.getItem('custDeliveryCharge'));
  const del = (savedCharge && !isNaN(savedCharge) && savedCharge > 0)
    ? savedCharge
    : (window.calculateDeliveryCharge ? calculateDeliveryCharge(lat||null, lng||null) : 20);
  const freeAbove=window._nkFreeDeliveryAbove||0;
  const freeDel=localStorage.getItem('nk_free_delivery')==='true'||(freeAbove>0&&cartSub()>=freeAbove);
  const tot=sub+(freeDel?0:del);
  const b=window.getDeliveryBreakdown?getDeliveryBreakdown(lat,lng):{base:20,distFee:0,total:del,dist:0};
  // Check if active shop is closed
  const _cartActiveShop = window._activeShopId
    ? (window._shopsCache||[]).find(s => s.id === window._activeShopId)
    : null;
  const _cartShopClosed = _cartActiveShop && _cartActiveShop.online === false;
  const _isAnyClosed = window._storeClosed || _cartShopClosed;
  const _closedLabel = _cartShopClosed
    ? '\uD83D\uDD34 ' + (_cartActiveShop.name||'Shop') + ' is Closed'
    : '\uD83D\uDD51 Store Closed \u2014 Tap to see info';
  let html=keys.map(k=>{
    const id=(isNaN(Number(k))||k.indexOf('-')!==-1)?k:Number(k),p=_getProds().find(x=>String(x.id)===String(id)),item=cart[k];
    if(!p||!item)return'';
    const step=1;
    const qtyDisplay=item.qty+(p.unit?' '+p.unit:'');
    // Each product is flat — price × qty
    const unitPrice=p.price;
    const unitLabel=item.qty+' × '+p.unit;
    const btnKey = typeof id === 'string' ? id.replace(/'/g,"\\'") : id;
    return '<div class="ci">'
    +'<img src="'+getItemImage(p)+'" alt="'+p.name+'" onerror="this.onerror=null;this.src=\'images/nektaIcon.svg\'">'
    +'<div style="flex:1;min-width:0">'
    +'<div style="font-weight:700;font-size:13px;color:var(--dark)">'+p.name+'</div>'
    +(p.teluguName?'<div style="font-size:10px;color:#059669;margin-top:1px">'+p.teluguName+'</div>':'')
    +'<div style="font-size:11px;color:#94a3b8;margin-top:2px">'+unitLabel+' · ₹'+unitPrice+' = <b style="color:#059669">₹'+(item.cost||0)+'</b></div>'
    +'</div>'
    +'<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">'
    +'<span style="font-weight:900;font-size:14px;color:#059669;font-family:Nunito,sans-serif">₹'+(item.cost||0)+'</span>'
    +'<div id="cbtn-'+btnKey+'">'+getBtnHtml(id,'c')+'</div>'
    +'</div></div>';
  }).join('');
  // Promo code section
  html+=`<div style="margin:0 12px 12px;background:var(--g3);border-radius:14px;padding:12px;border:1px solid var(--border)">
    <div style="font-size:12px;font-weight:700;color:var(--gd);margin-bottom:8px">🎁 Have a promo code?</div>
    <div style="display:flex;gap:8px">
      <input id="promo-inp" class="fi" placeholder="Enter code" style="flex:1;border-radius:10px;padding:8px 12px;font-size:13px">
      <button onclick="applyPromoCode()" style="background:#059669;color:#fff;border:none;border-radius:10px;padding:8px 14px;font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap">Apply</button>
    </div>
    <div id="promo-result" style="font-size:11px;margin-top:6px"></div>
  </div>`;
  html+=`<div class="bill">
    <div style="font-weight:900;font-size:15px;margin-bottom:12px;font-family:'Nunito',sans-serif">Bill Details</div>
    <div class="brow"><span>Items Total</span><span>&#8377;${sub}</span></div>
    <div class="brow"><span style="display:flex;align-items:center;gap:6px">Delivery Fee${b.dist>0?' ('+b.dist+' km)':''}<span onclick="showRates()" style="background:#f0fdf8;color:#059669;font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;cursor:pointer;border:1px solid #d1fae5">Rate Card</span></span><span>${freeDel?'<span style="color:#059669;font-weight:700">FREE 🎉</span>':'&#8377;'+del}</span></div>
    ${(!freeDel&&b.distFee>0)?`<div style="font-size:11px;color:#94a3b8;text-align:right;margin-bottom:6px;margin-top:-6px">Base &#8377;${b.base} + ${b.dist}km extra &#8377;${b.distFee}</div>`:''}
    ${window._rainBonusActive?`<div style="background:linear-gradient(135deg,#E3F2FD,#BBDEFB);border-radius:10px;padding:9px 12px;margin-bottom:8px;display:flex;align-items:center;gap:8px;border:1px solid #90CAF9"><span style="font-size:16px">🌧️</span><div style="flex:1"><div style="font-size:12px;font-weight:800;color:#1565C0">Rain Surcharge</div><div style="font-size:11px;color:#1976D2;margin-top:1px">+₹10 to support riders in rain</div></div><span style="font-weight:900;color:#1565C0;font-size:13px">+&#8377;10</span></div>`:''}
    ${sub<(window.MIN_ORD||MIN_ORD)?`<div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:10px;margin:8px 0;font-size:12px;color:#854d0e">⚠️ Add ₹${(window.MIN_ORD||MIN_ORD)-sub} more (min ₹${MIN_ORD})</div>`:''}
    <div class="brow tot"><span>Total Payable</span><span style="font-family:'Nunito',sans-serif">&#8377;${Math.max(0,tot+(window._rainBonusActive&&!freeDel?10:0))}</span></div>
  </div>
  <div style="padding:0 12px 20px">
    ${sub>=MIN_ORD
      ? `<button class="pobtn" onclick="placeOrder()" ${_isAnyClosed?'style="background:linear-gradient(135deg,#ef4444,#dc2626);box-shadow:0 6px 28px rgba(239,68,68,.4)"':''}>${_isAnyClosed?_closedLabel:'🛒 Place Order · ₹'+tot}</button>`
      : `<button class="pobtn" disabled>\uD83D\uDD12 Min. \u20B9${MIN_ORD} Required</button>`}
    <button onclick="showView('catalog')" style="margin-top:8px;width:100%;background:#f0fdf8;color:#059669;border:none;padding:12px;border-radius:14px;font-weight:700;font-size:13px;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif"><i class="fas fa-plus" style="margin-right:8px"></i>Add More Items</button>
  </div>`;
  c.innerHTML=html;
}

// --- PLACE ORDER ---
let _isPlacingOrder=false;
async function placeOrder(){
  if(_isPlacingOrder){toast('Order already being placed','info');return;}
  // -- Store closed check → global store OR active shop closed --
  const _activeShop = window._activeShopId
    ? (window._shopsCache||[]).find(s => s.id === window._activeShopId)
    : null;
  const _shopClosed = _activeShop && _activeShop.online === false;
  if(window._storeClosed || _shopClosed){
    const msg = _shopClosed
      ? ((_activeShop.name || 'This shop') + ' is currently closed')
      : (window._storeClosedMsg || 'We are currently closed');
    showMdl(`
      <div style="text-align:center;padding:12px 8px 8px">
        <div style="font-size:56px;margin-bottom:12px">\uD83D\uDCFD\uFE0F</div>
        <h3 style="font-weight:900;font-size:20px;color:var(--dark);font-family:'Nunito',sans-serif;margin-bottom:8px">Store is Closed</h3>
        <p style="font-size:14px;color:var(--pale);line-height:1.6;margin-bottom:6px">${msg}</p>
        <div style="background:var(--g3);border-radius:14px;padding:14px;margin:14px 0;border:1px solid var(--border)">
          <p style="font-size:13px;font-weight:700;color:var(--g)">\u26A1 We're working on it \u2022 please wait a little while!</p>
          <p style="font-size:12px;color:var(--pale);margin-top:5px">You can still browse our catalog and add items to cart. We'll be back soon! \uD83D\uDE4B</p>
        </div>
        <button class="pbtn" onclick="closeMdl()">Got it, I'll wait \uD83D\uDE4B</button>
        <button class="sbtn" style="margin-top:8px" onclick="closeMdl();showView('catalog')">Browse Catalog \uD83D\uDED2</button>
      </div>`);
    return;
  }
  const name=localStorage.getItem('custName'),phone=localStorage.getItem('custPhone'),address=localStorage.getItem('custAddress');
  if(!name||!phone||!address){openDModal(true);return;}
  _isPlacingOrder=true;
  try{
  // Use saved coords from address-picker (already GPS/map confirmed)
  // Only call freshGPS if no coords saved at all
  const cachedLat = parseFloat(localStorage.getItem('custLatitude'));
  const cachedLng = parseFloat(localStorage.getItem('custLongitude'));
  const cachedTs  = parseInt(localStorage.getItem('custLocTs')||'0');
  const cacheOk   = cachedLat && cachedLng && !isNaN(cachedLat) && (Date.now()-cachedTs) < 600000; // 10 min
  let lat = cacheOk ? cachedLat : null;
  let lng = cacheOk ? cachedLng : null;
  if(!cacheOk){
    toast('Getting location...','info');
    try{ const loc=await freshGPS(); lat=loc?.lat||null; lng=loc?.lng||null; }catch(e){}
  }
  if(lat&&lng&&window.haversineKm){
    const _dist=haversineKm(window.STORE_LAT,window.STORE_LNG,lat,lng);
    if(_dist>15){
      _isPlacingOrder=false;
      showMdl('<div style="text-align:center;padding:20px 12px"><div style="font-size:52px;margin-bottom:10px">&#x1F6AB;</div><h3 style="font-weight:900;font-size:19px;color:#ef4444;margin-bottom:8px">Outside Delivery Area</h3><p style="font-size:13px;color:var(--pale);margin-bottom:12px">You are <b>'+_dist.toFixed(1)+' km</b> from our store. We only deliver within 15 km.</p><div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:12px;margin-bottom:14px"><p style="font-size:12px;font-weight:700;color:#dc2626;margin-bottom:4px">Delivery areas:</p><p style="font-size:12px;color:#7f1d1d">Kothagudem &bull; Ramavaram &bull; Rudrampur &bull; nearby areas within 15 km</p></div><button class="pbtn" onclick="closeMdl()" style="background:linear-gradient(135deg,#ef4444,#dc2626)">Got it</button></div>');
      return;
    }
  }
  if(!lat||!lng){
    _isPlacingOrder=false;
    showMdl('<div style="text-align:center;padding:20px 12px"><div style="font-size:52px;margin-bottom:10px">\uD83D\uDCCD</div><h3 style="font-weight:900;font-size:18px;color:#ef4444;margin-bottom:8px">Location Required</h3><p style="font-size:13px;color:var(--pale);margin-bottom:14px">We could not get your delivery location. Please set your address using the map picker so we can calculate delivery charge and route your rider correctly.</p><button class="pbtn" onclick="closeMdl();openDModal(true)">\uD83D\uDCCD Set My Location</button></div>');
    return;
  }
  const items=Object.keys(cart).filter(k=>cart[k].qty>0).map(k=>{
    const p=products.find(x=>x.id===Number(k));
    return{id:Number(k),name:p?p.name:'Item',qty:cart[k].qty,cost:cart[k].cost};
  });
  const sub=cartSub();
  // Use road-distance charge saved by address-picker if available
  const savedCharge = parseFloat(localStorage.getItem('custDeliveryCharge'));
  const del = (savedCharge && !isNaN(savedCharge) && savedCharge > 0)
    ? savedCharge
    : (window.calculateDeliveryCharge ? calculateDeliveryCharge(lat, lng) : 20);
  const freeAbove=window._nkFreeDeliveryAbove||0;
  const freeDel=localStorage.getItem('nk_free_delivery')==='true'||(freeAbove>0&&sub>=freeAbove);
  const promoDisc=parseInt(localStorage.getItem('nk_promo_disc')||'0');
  const promoCode=localStorage.getItem('nk_promo_code')||'';
  const tot=Math.max(0,sub+(freeDel?0:del)-promoDisc);
  toast('Placing your order...','info');
  // deliveryPin is generated securely inside saveOrderToFirebase() using crypto.getRandomValues
  const oid=await saveOrderToFirebase({
    customerName:name,customerPhone:phone,address,items,
    totalPrice:tot,deliveryCharge:freeDel?0:del,
    latitude:lat,longitude:lng,expressMode:expressMode,
    shopId:   window._activeShopId   || null,
    shopName: window._activeShopName || null,
  });
  if(oid){
    _isPlacingOrder=false;
    localStorage.setItem('lastOrderId',oid);
    localStorage.setItem('lastOrderPhone',phone);
    localStorage.setItem('lastOrderTs', Date.now());
    if(freeDel) localStorage.removeItem('nk_free_delivery');
    if(promoCode){ localStorage.removeItem('nk_promo_disc'); localStorage.removeItem('nk_promo_code'); }
    localStorage.removeItem('custDeliveryCharge'); // clear so next order recalculates
    const hist=JSON.parse(localStorage.getItem('nk_hist')||'[]');
    hist.unshift({id:oid,total:tot,items:items.length,itemIds:items.map(i=>i.id),itemDetails:items.map(i=>{const p=products.find(x=>x.id===i.id);return{id:i.id,name:i.name,qty:i.qty,cost:i.cost,unit:p?.unit||'',img:p?.img||''};}).slice(0,20),ts:new Date().toISOString()});
    localStorage.setItem('nk_hist',JSON.stringify(hist.slice(0,30)));
    cart={};
    localStorage.removeItem('nk_cart');
    localStorage.removeItem('nk_cart_shopId');
    localStorage.removeItem('nk_cart_shopName');
    saveCart();updateFCart();updateBadge();
    lplay('lo-s-anim',LA.success,false);
    document.getElementById('lo-success').classList.add('on');
    // Wait 4s for Firestore to propagate, then retry up to 3 times if order not found yet
    let _trackRetry = 0;
    function _startTracking() {
      initTracking();
      // If tracking didn't find order, retry after 4 more seconds (up to 3 attempts)
      setTimeout(function() {
        const trackSec = document.getElementById('track-section');
        if (trackSec && trackSec.innerHTML.includes('mkNoOrder()')) {
          if (++_trackRetry < 3) _startTracking();
        }
      }, 4000);
    }
    setTimeout(_startTracking, 4000);
  } else { _isPlacingOrder=false; toast('Failed to place order. Try again.','error'); }
  }catch(e){_isPlacingOrder=false;console.error('placeOrder error:',e);toast('Something went wrong. Try again.','error');}
}
async function freshGPS(){
  return new Promise(function(resolve){
    if(!navigator.geolocation){resolve(null);return;}
    var cachedLat=parseFloat(localStorage.getItem('custLatitude'));
    var cachedLng=parseFloat(localStorage.getItem('custLongitude'));
    var cachedTs=parseInt(localStorage.getItem('custLocTs')||'0');
    var cacheOk=cachedLat&&cachedLng&&!isNaN(cachedLat)
      &&(window.validateServiceArea?validateServiceArea(cachedLat,cachedLng):true);
    if(cachedLat&&cachedLng&&!isNaN(cachedLat)&&!cacheOk){
      localStorage.removeItem('custLatitude');
      localStorage.removeItem('custLongitude');
      localStorage.removeItem('custLocTs');
      console.warn('Cleared bad cached location - outside Kothagudem');
    }
    if(cacheOk&&(Date.now()-cachedTs)<180000){resolve({lat:cachedLat,lng:cachedLng});return;}
    var done=false;
    function save(lat,lng){
      if(done)return;
      if(window.validateServiceArea&&!validateServiceArea(lat,lng)){fail();return;}
      done=true;
      localStorage.setItem('custLatitude',lat);
      localStorage.setItem('custLongitude',lng);
      localStorage.setItem('custLocTs',Date.now());
      resolve({lat:lat,lng:lng});
    }
    function fail(){
      if(done)return;done=true;
      if(cacheOk)resolve({lat:cachedLat,lng:cachedLng});
      else resolve(null);
    }
    navigator.geolocation.getCurrentPosition(
      function(pos){save(pos.coords.latitude,pos.coords.longitude);},
      function(){
        navigator.geolocation.getCurrentPosition(
          function(pos){save(pos.coords.latitude,pos.coords.longitude);},
          function(){fail();},
          {enableHighAccuracy:false,timeout:12000,maximumAge:300000}
        );
      },
      {enableHighAccuracy:true,timeout:10000,maximumAge:60000}
    );
    setTimeout(fail,20000);
  });
}

// --- DELIVERY MODAL ---
let _afterSave=false;
function openDModal(after=false){
  _afterSave=after;
  document.getElementById('dn').value=localStorage.getItem('custName')||'';
  document.getElementById('dph').value=localStorage.getItem('custPhone')||'';
  const addr=localStorage.getItem('custAddress')||'',pts=addr.split(', ');
  document.getElementById('dh').value=pts[0]||'';document.getElementById('da').value=pts[1]||'';
  document.getElementById('dl').value='';
  const m=document.getElementById('d-modal');m.style.display='flex';m.classList.add('open');
}
function closeDModal(){const m=document.getElementById('d-modal');m.style.display='none';m.classList.remove('open');}
const _dm=document.getElementById('d-modal');if(_dm)_dm.addEventListener('click',e=>{if(e.target.id==='d-modal')closeDModal();});
async function captureGPS(){
  const txtEl=document.getElementById('gps-txt');
  const stEl=document.getElementById('gps-st');
  if(txtEl) txtEl.textContent='Getting your location...';
  if(stEl){ stEl.textContent='Please wait...'; stEl.style.color='#6b7280'; }

  // Not supported
  if(!navigator.geolocation){
    if(txtEl) txtEl.textContent='Location not supported on this device';
    if(stEl){ stEl.textContent='Please enter your address manually below'; stEl.style.color='#ef4444'; }
    toast('GPS not supported - please enter address manually','warning');
    return;
  }

  // Check permission state first
  if(navigator.permissions){
    try{
      const perm=await navigator.permissions.query({name:'geolocation'});
      if(perm.state==='denied'){
        if(txtEl) txtEl.textContent='Location permission blocked';
        if(stEl){
          stEl.innerHTML='<b>How to fix:</b><br>'
            +'Android: Settings > Apps > Browser > Permissions > Location > Allow<br>'
            +'iPhone: Settings > Safari > Location > Allow<br>'
            +'Chrome: tap the lock icon in address bar > Location > Allow';
          stEl.style.color='#ef4444';
        }
        toast('Location blocked - see instructions below','error');
        return;
      }
    }catch(e){}
  }

  let resolved=false;
  const doResolve=async(lat,lng)=>{
    if(resolved)return;
    // Reject if outside 15km delivery area
    if(window.haversineKm){
      const d=haversineKm(window.STORE_LAT,window.STORE_LNG,lat,lng);
      if(d>15){
        if(txtEl) txtEl.textContent='You are outside our delivery area';
        if(stEl){ stEl.textContent='We deliver within 15 km of Kothagudem only'; stEl.style.color='#ef4444'; }
        toast('Outside delivery area ('+d.toFixed(1)+' km from store)','error');
        return;
      }
    }
    resolved=true;
    localStorage.setItem('custLatitude',lat);
    localStorage.setItem('custLongitude',lng);
    localStorage.setItem('custLocTs',Date.now());
    if(txtEl) txtEl.textContent='Location captured!';
    // Calculate road distance via OSRM and save charge
    const _sLat=window.STORE_LAT,_sLng=window.STORE_LNG;
    try{
      const _osrmUrl='https://router.project-osrm.org/route/v1/driving/'
        +_sLng+','+_sLat+';'+lng+','+lat
        +'?overview=false';
      const _res=await fetch(_osrmUrl,{signal:AbortSignal.timeout(5000)});
      const _json=await _res.json();
      if(_json.code==='Ok'&&_json.routes.length){
        const roadKm=_json.routes[0].distance/1000;
        const charge=window.calculateDeliveryCharge?calculateDeliveryCharge(lat,lng,roadKm):20;
        localStorage.setItem('custDeliveryCharge',charge);
        if(stEl){ stEl.textContent=lat.toFixed(4)+', '+lng.toFixed(4)+' \u00B7 Road: '+roadKm.toFixed(1)+'km \u00B7 Delivery: \u20B9'+charge; stEl.style.color='#059669'; }
        toast('Location found! Road distance: '+roadKm.toFixed(1)+'km \u00B7 Delivery: \u20B9'+charge,'success');
        return;
      }
    }catch(e){}
    // fallback to haversine charge
    const charge=window.calculateDeliveryCharge?calculateDeliveryCharge(lat,lng):20;
    localStorage.setItem('custDeliveryCharge',charge);
    if(stEl){ stEl.textContent=lat.toFixed(4)+', '+lng.toFixed(4)+' - Delivery: \u20B9'+charge; stEl.style.color='#059669'; }
    toast('Location found! Delivery charge: \u20B9'+charge,'success');
  };
  const doFail=(errCode)=>{
    if(resolved)return; resolved=true;
    const clat=parseFloat(localStorage.getItem('custLatitude'));
    const clng=parseFloat(localStorage.getItem('custLongitude'));
    const cacheOk=clat&&clng&&!isNaN(clat)&&(window.validateServiceArea?validateServiceArea(clat,clng):true);
    if(cacheOk){
      if(txtEl) txtEl.textContent='Using saved location';
      if(stEl){ stEl.textContent=clat.toFixed(4)+', '+clng.toFixed(4)+' (saved)'; stEl.style.color='#f59e0b'; }
      return;
    }
    // Show helpful error based on error code
    let msg='Could not get location - tap to try again';
    let sub='Order will use default delivery charge ₹20';
    if(errCode===1){
      msg='Location permission denied';
      sub='Go to browser Settings > Site Settings > Location > Allow for this site';
    } else if(errCode===2){
      msg='GPS signal not found';
      sub='Move to open area or enable WiFi for better accuracy, then try again';
    } else if(errCode===3){
      msg='Location timed out';
      sub='Tap the GPS button again - make sure Location is ON in phone settings';
    }
    if(txtEl) txtEl.textContent=msg;
    if(stEl){ stEl.textContent=sub; stEl.style.color='#f59e0b'; }
    toast(msg,'warning');
  };

  navigator.geolocation.getCurrentPosition(
    pos=>doResolve(pos.coords.latitude,pos.coords.longitude),
    err=>{
      navigator.geolocation.getCurrentPosition(
        pos=>doResolve(pos.coords.latitude,pos.coords.longitude),
        err2=>doFail(err2?err2.code:0),
        {enableHighAccuracy:false,timeout:12000,maximumAge:300000}
      );
    },
    {enableHighAccuracy:true,timeout:10000,maximumAge:30000}
  );
  setTimeout(()=>doFail(3),18000);
}
function saveDDetails(){
  const n=document.getElementById('dn').value.trim(),ph=document.getElementById('dph').value.trim();
  const h=document.getElementById('dh').value.trim(),a=document.getElementById('da').value.trim(),l=document.getElementById('dl').value.trim();
  if(!n){toast('Enter your name','error');return;}
  if(!ph||!/^[6-9]\d{9}$/.test(ph)){toast('Enter valid 10-digit phone','error');return;}
  if(!h||!a){toast('Enter house number and area','error');return;}
  localStorage.setItem('custName',n);
  localStorage.setItem('custPhone',ph);
  // Build address → if address-picker already saved a geocoded address, prepend house no to it
  const existingAddr = localStorage.getItem('custAddress')||'';
  const manualAddr = h+', '+a+(l?', '+l:'')+', Kothagudem';
  // Use manual address (user just typed it in the form)
  localStorage.setItem('custAddress', manualAddr);
  closeDModal();loadProfileUI();toast('Details saved! ✅','success');
  // Sync to Firestore
  if(window.saveUserProfile) saveUserProfile({ name:n, phone:ph, address:manualAddr });
  if(_afterSave){
    _isPlacingOrder=false;
    setTimeout(()=>{ if(_AP&&_AP.origPlaceOrder) _AP.origPlaceOrder(); else placeOrder(); },400);
  }
}

// --- OTP ---
function openOTPModal(){
  const m=document.getElementById('otp-modal');
  if(m){m.style.display='flex';m.classList.add('on');}
  if(window.initOTPLogin)initOTPLogin();
}
const _om=document.getElementById('otp-modal');
if(_om)_om.addEventListener('click',e=>{
  if(e.target.id==='otp-modal'){
    if(window.closeOTPModal)closeOTPModal();
    else{_om.style.display='none';_om.classList.remove('on');}
  }
});

// --- PROFILE ---
function loadProfileUI(){
  const n=localStorage.getItem('custName'),ph=localStorage.getItem('custPhone'),addr=localStorage.getItem('custAddress');
  const loggedIn=localStorage.getItem('nk_loggedIn')==='true';
  document.getElementById('pname').textContent=n||(loggedIn?'My Account':'Welcome!');
  document.getElementById('psub').textContent=ph?'📱 '+ph:(loggedIn?'Account active':'Tap below to sign in');
  document.getElementById('paddr-s').textContent=addr?addr.split(',').slice(0,2).join(','):'Tap to set address';
  const cnt=cartCnt();document.getElementById('pcart-c').textContent=cnt+' item'+(cnt!==1?'s':'');
  const fc=document.getElementById('pfav-c');if(fc)fc.textContent=favs.size+' saved';
  const pav=document.getElementById('pav');if(n&&pav)pav.textContent=n.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)||'👤';
  // Show sign-in button only when not logged in
  var loginBtn=document.getElementById('prof-login-btn');
  if(loginBtn) loginBtn.style.display=loggedIn?'none':'block';
  // Smart greeting with time-of-day + festive detection
  const greetEl=document.getElementById('prof-greeting');
  if(greetEl){
    const h=new Date().getHours();
    const now=new Date();
    const md=`${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    // Indian festive dates (MM-DD)
    const festive={
      '01-14':'🪁 Happy Makar Sankranti!','01-26':'🇮🇳 Happy Republic Day!',
      '03-25':'🎨 Happy Holi!','03-26':'🎨 Happy Holi!',
      '04-14':'🌸 Happy Ugadi!','04-15':'🌸 Happy Ugadi!',
      '08-15':'🇮🇳 Happy Independence Day!','08-19':'🪔 Happy Raksha Bandhan!',
      '10-02':'🙏 Gandhi Jayanti','10-20':'🪔 Happy Diwali!','10-21':'🪔 Happy Diwali!',
      '10-22':'🪔 Happy Diwali!','11-01':'🇹🇪 Telugu Pride Day',
      '12-25':'🎄 Merry Christmas!','01-01':'🎆 Happy New Year!'
    };
    let greet;
    if(festive[md]){
      greet=festive[md];
    } else if(h<5){
      greet='🌙 Late night shopping';
    } else if(h<12){
      greet='☀️ Good morning'+(n?', '+n.split(' ')[0]:'')+'!';
    } else if(h<17){
      greet='🌤️ Good afternoon'+(n?', '+n.split(' ')[0]:'')+'!';
    } else if(h<21){
      greet='🌇 Good evening'+(n?', '+n.split(' ')[0]:'')+'!';
    } else {
      greet='🌙 Good night'+(n?', '+n.split(' ')[0]:'')+'!';
    }
    greetEl.textContent=greet;
  }
}

// --- TRACKING ---
var _custOrderListener=null;
async function initTracking(){
  const sec=document.getElementById('track-sec');if(!sec)return;
  const ph=localStorage.getItem('custPhone');
  if(!ph){sec.innerHTML=mkNoOrder();return;}
  if(!window.db||!window.firebaseReady){setTimeout(initTracking,600);return;}
  // Show loading state while fetching order
  if(!sec.innerHTML||sec.innerHTML===mkNoOrder()){
    sec.innerHTML='<div style="text-align:center;padding:40px;color:var(--pale)"><div style="font-size:36px;margin-bottom:8px">⏳</div><p style="font-size:13px;font-weight:600">Checking your order…</p></div>';
  }
  if(_ordL){_ordL();_ordL=null;}if(_locL){_locL();_locL=null;}
  if(_custOrderListener){_custOrderListener();_custOrderListener=null;}
  try{
    const order=await getActiveOrderForCustomer(ph);
    if(!order){
      sec.innerHTML=mkNoOrder();
      setTimeout(()=>lplay('no-ord-lot',LA.empty,true),50);
      // Set up real-time listener for NEW orders placed after profile opened
      setupCustomerOrderListener(ph,sec);
      return;
    }
    renderTrack(order);
    _ordL=listenToOrderStatusChange(order.id,upd=>{
      renderTrack(upd);
      // Start live map as soon as rider is assigned (not just picked)
      if(upd.status==='assigned'||upd.status==='picked'){
        if(!_locL){
          _locL=window.listenToRiderLocationRTDB
            ?listenToRiderLocationRTDB(upd.id,loc=>updateTMap(loc,upd))
            :listenToRiderLocation(upd.id,loc=>updateTMap(loc,upd));
        }
      }
      if(upd.status==='delivered'){
        if(_lmap){_lmap.remove();_lmap=null;_riderMarker=null;_custMarker=null;_routeLine=null;}
        if(_ordL){_ordL();_ordL=null;}if(_locL){_locL();_locL=null;}
        const mins=upd.deliveryMins||0;
        const minsText=mins>0?`in ${mins} minute${mins!==1?'s':''}`:'just now';
        sec.innerHTML=`<div class="tcard" style="text-align:center;padding:32px 20px">
          <div style="font-size:64px;margin-bottom:12px">\uD83D\uDCB3</div>
          <h2 style="font-weight:900;font-size:22px;color:#059669;font-family:'Nunito',sans-serif;margin-bottom:8px">Order Delivered!</h2>
          <p style="font-size:14px;color:#374151;margin-bottom:6px">Thank you for ordering from <strong>Nekta</strong> 🎉</p>
          <p style="font-size:13px;color:#94a3b8;margin-bottom:20px">Delivered ${minsText}</p>
          <div style="background:#f0fdf8;border-radius:14px;padding:14px;margin-bottom:20px">
            <p style="font-size:12px;color:#059669;font-weight:700">🎉 Enjoy your fresh groceries!</p>
            <p style="font-size:11px;color:#94a3b8;margin-top:4px">We hope to serve you again soon</p>
          </div>
          <button class="emtbtn" onclick="showView('home')">Order Again 🛒</button>
        </div>`;
        lplay('lo-d-anim',LA.delivery,false);lplay('lo-conf-anim',LA.confetti,false);
        document.getElementById('lo-delivered').classList.add('on');
        toast('🎉 Order delivered! Thank you for choosing Nekta!','success');
        setTimeout(()=>{
          document.getElementById('lo-delivered').classList.remove('on');
          sec.innerHTML=mkNoOrder();
          setTimeout(()=>lplay('no-ord-lot',LA.empty,true),50);
        },30000);
      }
    });
    // Start rider location listener for assigned/picked orders
    if(order.status==='assigned'||order.status==='picked'){
      _locL=window.listenToRiderLocationRTDB
        ?listenToRiderLocationRTDB(order.id,loc=>updateTMap(loc,order))
        :listenToRiderLocation(order.id,loc=>updateTMap(loc,order));
    }
  }catch(e){console.error('tracking error:',e);sec.innerHTML=mkNoOrder();}
}

// Real-time listener for new orders placed after profile opened
function setupCustomerOrderListener(ph,sec){
  if(!window.db)return;
  var bare=String(ph).replace(/\D/g,'');
  if(bare.length===12&&bare.startsWith('91'))bare=bare.slice(2);
  if(bare.length===11&&bare.startsWith('0'))bare=bare.slice(1);
  var withCountry='+91'+bare;
  
  // Listen for orders with either phone format
  _custOrderListener=window.db.collection('orders')
    .where('customerPhone','in',[bare,withCountry])
    .where('status','in',['placed','packing','assigned','picked'])
    .orderBy('createdAt','desc')
    .limit(1)
    .onSnapshot(function(snap){
      if(snap.docs.length>0){
        var order=Object.assign({id:snap.docs[0].id},snap.docs[0].data());
        if(order.status&&['placed','packing','assigned','picked'].includes(order.status)){
          sec.innerHTML='';
          renderTrack(order);
          if(_ordL){_ordL();_ordL=null;}
          _ordL=listenToOrderStatusChange(order.id,upd=>{
            renderTrack(upd);
            if(upd.status==='assigned'||upd.status==='picked'){
              if(!_locL){
                _locL=window.listenToRiderLocationRTDB
                  ?listenToRiderLocationRTDB(upd.id,loc=>updateTMap(loc,upd))
                  :listenToRiderLocation(upd.id,loc=>updateTMap(loc,upd));
              }
            }
            if(upd.status==='delivered'){
              if(_lmap){_lmap.remove();_lmap=null;_riderMarker=null;_custMarker=null;_routeLine=null;}
              if(_ordL){_ordL();_ordL=null;}if(_locL){_locL();_locL=null;}
              const mins=upd.deliveryMins||0;
              const minsText=mins>0?`in ${mins} minute${mins!==1?'s':''}`:'just now';
              sec.innerHTML=`<div class="tcard" style="text-align:center;padding:32px 20px"><div style="font-size:64px;margin-bottom:12px">\uD83D\uDCB3</div><h2 style="font-weight:900;font-size:22px;color:#059669;font-family:'Nunito',sans-serif;margin-bottom:8px">Order Delivered!</h2><p style="font-size:14px;color:#374151;margin-bottom:6px">Thank you for ordering from <strong>Nekta</strong> 🎉</p><p style="font-size:13px;color:#94a3b8;margin-bottom:20px">Delivered ${minsText}</p><div style="background:#f0fdf8;border-radius:14px;padding:14px;margin-bottom:20px"><p style="font-size:12px;color:#059669;font-weight:700">🎉 Enjoy your fresh groceries!</p><p style="font-size:11px;color:#94a3b8;margin-top:4px">We hope to serve you again soon</p></div><button class="emtbtn" onclick="showView('home')">Order Again 🛒</button></div>`;
              lplay('lo-d-anim',LA.delivery,false);lplay('lo-conf-anim',LA.confetti,false);
              document.getElementById('lo-delivered').classList.add('on');
              toast('🎉 Order delivered! Thank you for choosing Nekta!','success');
              setTimeout(()=>{
                document.getElementById('lo-delivered').classList.remove('on');
                sec.innerHTML=mkNoOrder();
                setTimeout(()=>lplay('no-ord-lot',LA.empty,true),50);
              },30000);
            }
          });
        }
      }
    },function(err){console.warn('customer order listener:',err.message);});
}
function mkNoOrder(){
  return`
  <div style="background:var(--card);border-radius:24px;overflow:hidden;box-shadow:var(--sh2);margin-bottom:12px">
    <div style="background:linear-gradient(160deg,#003d20 0%,#005c32 50%,#007a43 100%);padding:16px 20px 20px;text-align:center;position:relative;overflow:hidden">
      <dotlottie-wc
        src="https://lottie.host/6a4ff1c1-95e6-4353-9eb2-7e6863595068/SVFPR0Eq0A.lottie"
        style="width:140px;height:140px;margin:0 auto;display:block"
        autoplay loop>
      </dotlottie-wc>
      <p style="font-weight:900;color:#fff;font-size:17px;font-family:'Nunito',sans-serif;letter-spacing:-.4px;margin-top:4px">No Active Orders</p>
      <p style="font-size:12px;color:rgba(255,255,255,.65);margin-top:4px;line-height:1.5">Place an order and track it live here</p>
    </div>
    <div style="padding:16px;display:flex;gap:10px">
      <button class="pobtn" onclick="showView('home')" style="font-size:14px;flex:1">🛒 Start Shopping</button>
      <button onclick="showOrderHistory()" style="background:var(--g3);color:var(--g);border:1.5px solid var(--border);border-radius:14px;padding:0 16px;font-weight:700;font-size:13px;cursor:pointer;font-family:var(--font);white-space:nowrap">History</button>
    </div>
  </div>`;
}
function renderTrack(order){
  const sec=document.getElementById('track-sec');if(!sec)return;
  const meta=window.ORDER_STATE_META||{};
  const states=window.ORDER_STATES||['placed','packing','assigned','picked','delivered'];
  const ci=states.indexOf(order.status);
  const curMeta=meta[order.status]||{label:order.status,icon:'🚚',color:'#059669',desc:'Processing your order'};
  const ts=order.createdAt?.toDate?order.createdAt.toDate().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'—';
  const eta=order.eta||20;
  const isMoving=order.status==='picked';
  const rLat=order.riderLat||order.riderLocation?.latitude;
  const rLng=order.riderLng||order.riderLocation?.longitude;
  const cLat=parseFloat(localStorage.getItem('custLatitude'));
  const cLng=parseFloat(localStorage.getItem('custLongitude'));
  const storeLat=window.STORE_LAT,storeLng=window.STORE_LNG;
  const custLat=order.latitude||cLat,custLng=order.longitude||cLng;
  const dist=window.haversineKm&&custLat&&custLng?haversineKm(storeLat,storeLng,custLat,custLng):0;
  const distKm=Math.round(dist*10)/10;

  // -- 1. Full-bleed animated status banner --
  const placedDate = order.createdAt?.toDate ? order.createdAt.toDate() : (order.createdAt ? new Date(order.createdAt) : null);
  const elapsedMins = (placedDate && !isNaN(placedDate.getTime())) ? Math.floor((Date.now() - placedDate.getTime()) / 60000) : 0;
  const isLate = elapsedMins > 25 && order.status !== 'delivered';
  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
  const delCharge = order.deliveryCharge || 0;
  const elapsedStr = elapsedMins < 60 ? elapsedMins+' min' : Math.floor(elapsedMins/60)+'h '+(elapsedMins%60)+'m';
  const delFeeStr = delCharge > 0 ? '\u20b9'+delCharge : 'FREE \ud83c\udf89';
  const etaChip = isMoving ? '<div style="background:rgba(255,255,255,.22);border-radius:20px;padding:5px 12px;display:flex;align-items:center;gap:5px" id="eta-banner"><span style="width:7px;height:7px;background:#6ee7b7;border-radius:50%;animation:dpulse 1.4s infinite;flex-shrink:0"></span><span style="color:#fff;font-size:11px;font-weight:800">\u23f1 ~'+eta+' min away</span></div>' : '';
  const distChip = distKm > 0 ? '<div style="background:rgba(255,255,255,.15);border-radius:20px;padding:5px 12px"><span style="color:rgba(255,255,255,.9);font-size:11px;font-weight:600">\ud83d\udccd '+distKm+' km</span></div>' : '';
  const delayGrid = isLate ? '<div style="background:rgba(239,68,68,.25);border:1px solid rgba(239,68,68,.4);border-radius:12px;padding:9px 13px;margin-top:10px;display:flex;align-items:center;gap:8px"><span style="font-size:16px;flex-shrink:0">\u26a0\ufe0f</span><p style="color:#fff;font-size:12px;font-weight:700">Taking longer than usual \u2014 we apologise! <span onclick="openSupport()" style="text-decoration:underline;cursor:pointer">Contact support</span></p></div>' : '';

  const bannerHtml = '<div style="background:linear-gradient(135deg,'+curMeta.color+'ee,'+curMeta.color+');padding:22px 18px 16px;position:relative;overflow:hidden">'
    +'<div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.08)"></div>'
    +'<div style="position:absolute;bottom:-20px;left:-20px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.06)"></div>'
    +'<div style="display:flex;align-items:center;gap:14px;position:relative">'
      +'<div style="width:54px;height:54px;border-radius:18px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;'+(isMoving?'animation:mapbounce 1.6s ease-in-out infinite':'')+'">'+curMeta.icon+'</div>'
      +'<div style="flex:1;min-width:0">'
        +'<div style="color:rgba(255,255,255,.75);font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;margin-bottom:3px">Order Status</div>'
        +'<div style="color:#fff;font-weight:900;font-size:18px;font-family:\'Nunito\',sans-serif;line-height:1.2" id="tk-status-lbl">'+curMeta.label+'</div>'
        +'<div style="color:rgba(255,255,255,.82);font-size:12px;margin-top:3px" id="tk-status-desc">'+curMeta.desc+'</div>'
      +'</div>'
      +'<div style="background:rgba(255,255,255,.18);border-radius:14px;padding:8px 13px;text-align:center;flex-shrink:0">'
        +'<div style="color:rgba(255,255,255,.7);font-size:9px;font-weight:700;letter-spacing:.5px">TOTAL</div>'
        +'<div style="color:#fff;font-weight:900;font-size:16px;font-family:\'Nunito\',sans-serif">\u20b9'+(order.totalPrice||0).toFixed(0)+'</div>'
      +'</div>'
    +'</div>'
    +'<div style="display:flex;gap:7px;margin-top:13px;flex-wrap:wrap;position:relative">'+etaChip+'<div style="background:rgba(255,255,255,.15);border-radius:20px;padding:5px 12px"><span style="color:rgba(255,255,255,.9);font-size:11px;font-weight:600">\ud83d\udd50 '+ts+'</span></div>'+distChip+'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:12px;position:relative">'
      +'<div style="background:rgba(255,255,255,.13);border-radius:12px;padding:9px 12px;display:flex;align-items:center;gap:8px"><span style="font-size:16px">\u23f3</span><div><div style="color:rgba(255,255,255,.7);font-size:9px;font-weight:700;letter-spacing:.4px">TIME ELAPSED</div><div style="color:#fff;font-size:13px;font-weight:800">'+elapsedStr+'</div></div></div>'
      +'<div style="background:'+(isLate?'rgba(239,68,68,.35)':'rgba(255,255,255,.13)')+';border-radius:12px;padding:9px 12px;display:flex;align-items:center;gap:8px;'+(isLate?'border:1px solid rgba(239,68,68,.5)':'')+'"><span style="font-size:16px">'+(isLate?'\u26a0\ufe0f':'\u26a1')+'</span><div><div style="color:rgba(255,255,255,.7);font-size:9px;font-weight:700;letter-spacing:.4px">'+(isLate?'DELAYED':'ON TIME')+'</div><div style="color:#fff;font-size:13px;font-weight:800">'+(isLate?'Taking longer':'~15\u201320 min')+'</div></div></div>'
      +'<div style="background:rgba(255,255,255,.13);border-radius:12px;padding:9px 12px;display:flex;align-items:center;gap:8px"><span style="font-size:16px">\ud83d\udeb4</span><div><div style="color:rgba(255,255,255,.7);font-size:9px;font-weight:700;letter-spacing:.4px">DELIVERY FEE</div><div style="color:#fff;font-size:13px;font-weight:800">'+delFeeStr+'</div></div></div>'
      +'<div style="background:rgba(255,255,255,.13);border-radius:12px;padding:9px 12px;display:flex;align-items:center;gap:8px"><span style="font-size:16px">\ud83d\udce6</span><div><div style="color:rgba(255,255,255,.7);font-size:9px;font-weight:700;letter-spacing:.4px">ITEMS</div><div style="color:#fff;font-size:13px;font-weight:800">'+itemCount+' item'+(itemCount!==1?'s':'')+'</div></div></div>'
    +'</div>'
    +delayGrid
    +'</div>';

  // -- 2. Horizontal progress stepper (Zepto-style) --
  const stepLabels=['Placed','Packing','Assigned','On Way','Delivered'];
  const stepIcons=[String.fromCodePoint(9989),String.fromCodePoint(128230),String.fromCodePoint(128692),String.fromCodePoint(128757),String.fromCodePoint(127881)];
  const _tStates=['placed','packing','assigned','picked','delivered'];const _tci=_tStates.indexOf(order.status);const fillPct=Math.min(100,Math.round((Math.max(0,_tci)/(_tStates.length-1))*100));const stepDots=_tStates.map(function(s,i){
    const done=i<_tci,cur=i===_tci;
    const bg=done?'linear-gradient(135deg,'+curMeta.color+','+curMeta.color+'bb)':cur?curMeta.color:'var(--border2)';
    const clr=done||cur?'#fff':'var(--pale)';
    const sh=cur?'0 4px 16px '+curMeta.color+'55':done?'0 2px 8px '+curMeta.color+'33':'none';
    const sc=cur?'scale(1.18)':'scale(1)';
    const fw=cur?'800':'600';
    const tc=cur?curMeta.color:done?'var(--mid)':'var(--pale)';
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;position:relative;z-index:1">'
      +'<div style="width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:'+(done||cur?'14':'12')+'px;font-weight:800;transition:all .4s;background:'+bg+';color:'+clr+';box-shadow:'+sh+';transform:'+sc+'">'
      +(done?'\u2713':stepIcons[i])
      +'</div>'
      +'<span style="font-size:9px;font-weight:'+fw+';color:'+tc+';text-align:center;line-height:1.2">'+stepLabels[i]+'</span>'
      +'</div>';
  }).join('');
  const stepperHtml='<div style="padding:18px 16px 14px;background:var(--card)">'
    +'<div style="display:flex;align-items:flex-start;position:relative">'
    +'<div style="position:absolute;top:16px;left:16px;right:16px;height:3px;background:var(--border2);border-radius:2px;z-index:0">'
    +'<div style="height:100%;background:linear-gradient(90deg,'+curMeta.color+','+curMeta.color+'aa);border-radius:2px;transition:width .6s ease;width:'+fillPct+'%"></div>'
    +'</div>'
    +stepDots
    +'</div></div>';

  // -- 3. Map / status visual --
  var mapHtml='';
  if(isMoving){
    const gmapsUrl = custLat&&custLng
      ? 'https://www.google.com/maps/dir/?api=1&origin='+rLat+','+rLng+'&destination='+custLat+','+custLng+'&travelmode=driving'
      : 'https://www.google.com/maps/search/?api=1&query='+custLat+','+custLng;
    mapHtml=
      // Live map container
      '<div style="position:relative;margin:0 12px 12px;border-radius:18px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.15)">'
      // Leaflet map
      +'<div id="live-track-map" style="width:100%;height:260px;background:#e8f5e9"></div>'
      // Top-left: live pulse + ETA badge
      +'<div style="position:absolute;top:10px;left:10px;display:flex;flex-direction:column;gap:6px;z-index:1000">'
        +'<div style="background:rgba(0,0,0,.72);backdrop-filter:blur(6px);color:#fff;font-size:11px;font-weight:800;padding:6px 12px;border-radius:20px;display:flex;align-items:center;gap:6px">'
          +'<span style="width:7px;height:7px;background:#6ee7b7;border-radius:50%;animation:dpulse 1.2s infinite;flex-shrink:0"></span>'
          +'<span id="eta-map-badge">🌟 ~'+eta+' min</span>'
        +'</div>'
        +'<div id="dist-map-badge" style="background:rgba(5,150,105,.9);backdrop-filter:blur(6px);color:#fff;font-size:10px;font-weight:700;padding:4px 10px;border-radius:20px;display:'+(rLat&&custLat?'flex':'none')+';align-items:center;gap:4px">'
          +'📍 <span id="dist-map-val">'+(rLat&&custLat&&window.haversineKm?haversineKm(rLat,rLng,custLat,custLng).toFixed(1)+' km away':'...')+'</span>'
        +'</div>'
      +'</div>'
      // Top-right: Rider Live badge
      +'<div style="position:absolute;top:10px;right:10px;background:#059669;color:#fff;font-size:10px;font-weight:800;padding:5px 11px;border-radius:20px;z-index:1000;display:flex;align-items:center;gap:5px">'
        +'<span style="width:6px;height:6px;background:#fff;border-radius:50%;animation:dpulse 1s infinite"></span>'
        +'🚴 Rider Live'
      +'</div>'
      // Bottom bar: distance info + Open in Google Maps button
      +'<div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,rgba(0,0,0,.85) 0%,rgba(0,0,0,.4) 70%,transparent 100%);padding:10px 12px 12px;z-index:1000;display:flex;align-items:center;justify-content:space-between;gap:8px">'
        +'<div>'
          +'<div style="color:#fff;font-size:12px;font-weight:800" id="rider-dist-label">🚴 Rider is on the way</div>'
          +'<div style="color:rgba(255,255,255,.75);font-size:10px;margin-top:2px" id="rider-dist-sub">Live tracking active</div>'
        +'</div>'
        +'<a href="'+gmapsUrl+'" target="_blank" rel="noopener noreferrer" '
          +'style="background:#fff;color:#059669;font-size:11px;font-weight:800;padding:8px 14px;border-radius:20px;text-decoration:none;display:flex;align-items:center;gap:5px;white-space:nowrap;flex-shrink:0">'
          +'🗺 Google Maps'
        +'</a>'
      +'</div>'
      +'</div>';
  } else {
    // Not yet picked → show static route map (store → customer) + Google Maps button
    var statusCards={
      placed:{bg:'linear-gradient(135deg,#d1fae5,#a7f3d0)',icon:'\u2705',title:'Order Received!',sub:'Store is reviewing your order',tc:'#065f46',sc:'#059669'},
      packing:{bg:'linear-gradient(135deg,#dbeafe,#bfdbfe)',icon:'\ud83d\udce6',title:'Packing Your Order',sub:'Fresh items being carefully picked',tc:'#1d4ed8',sc:'#3b82f6'},
      assigned:{bg:'linear-gradient(135deg,#ede9fe,#ddd6fe)',icon:'\ud83d\udeb4',title:'Rider Assigned',sub:'Heading to store to pick up your order',tc:'#5b21b6',sc:'#7c3aed'},
      delivered:{bg:'linear-gradient(135deg,#d1fae5,#a7f3d0)',icon:'\ud83c\udf89',title:'Delivered!',sub:'Enjoy your fresh groceries',tc:'#065f46',sc:'#059669'},
    };
    var sc2=statusCards[order.status]||statusCards.placed;
    const gmapsStaticUrl = custLat&&custLng
      ? 'https://www.google.com/maps/dir/?api=1&origin='+storeLat+','+storeLng+'&destination='+custLat+','+custLng+'&travelmode=driving'
      : '';
    mapHtml='<div style="margin:0 12px 12px;border-radius:18px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1)">'
      +'<div style="background:'+sc2.bg+';padding:14px 16px;display:flex;align-items:center;gap:12px">'
        +'<div style="font-size:32px">'+sc2.icon+'</div>'
        +'<div style="flex:1"><p style="font-weight:800;font-size:14px;color:'+sc2.tc+'">'+sc2.title+'</p>'
        +'<p style="font-size:12px;color:'+sc2.sc+';margin-top:2px">'+sc2.sub+'</p></div>'
        +(gmapsStaticUrl
          ?'<a href="'+gmapsStaticUrl+'" target="_blank" rel="noopener noreferrer" '
            +'style="background:rgba(0,0,0,.12);color:'+sc2.tc+';font-size:10px;font-weight:800;padding:6px 11px;border-radius:14px;text-decoration:none;white-space:nowrap;display:flex;align-items:center;gap:4px">'
            +'🗺 Maps</a>'
          :'')
      +'</div>'
      +(custLat&&custLng
        ?'<div style="position:relative;height:160px">'
          +'<iframe src="https://maps.google.com/maps?saddr='+storeLat+','+storeLng+'&daddr='+custLat+','+custLng+'&output=embed" loading="lazy" sandbox="allow-scripts allow-same-origin" style="width:100%;height:160px;border:none;display:block"></iframe>'
          +'<div style="position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,.7);color:#fff;font-size:10px;font-weight:800;padding:4px 10px;border-radius:20px">\uD83C\uDFEA Store · You · '+distKm+' km</div>'
          +'</div>'
        :'')
      +'</div>';
  }

  // -- 4. Rider card --
  var riderHtml=order.riderName
    ?'<div style="margin:0 12px 12px;background:var(--card);border-radius:18px;padding:14px 16px;border:1.5px solid var(--border2);display:flex;align-items:center;gap:12px">'
      +'<div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#059669,#047857);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:20px;color:#fff;flex-shrink:0;position:relative">'
      +order.riderName.charAt(0)
      +'<span style="position:absolute;bottom:0;right:0;width:13px;height:13px;background:#22c55e;border-radius:50%;border:2px solid var(--card)"></span></div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-weight:800;font-size:14px;color:var(--dark)">'+esc(order.riderName)+'</div>'
      +'<div style="font-size:11px;color:var(--pale);margin-top:2px">★ 4.8 · \uD83D\uDE98 '+esc(order.riderBike||'Bike')+' · Your delivery partner</div></div>'
      +'<div style="display:flex;gap:8px;flex-shrink:0">'
      +'<a href="tel:'+esc(order.riderPhone)+'" style="width:40px;height:40px;border-radius:50%;background:#d1fae5;display:flex;align-items:center;justify-content:center;font-size:18px;text-decoration:none">\uD83D\uDCDE</a>'
      +'<a href="https://wa.me/91'+esc(order.riderPhone)+'?text=Hi+I%27m+waiting+for+my+Nekta+order" target="_blank" rel="noopener noreferrer" style="width:40px;height:40px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;font-size:18px;text-decoration:none">💬</a>'
      +'</div></div>'
    :'';

  // -- 4.5. Delivery PIN display (shows when rider assigned and en route) --
  const showPinStatuses = ['assigned','picked','en_route'];
  var pinHtml = '';
  if(order.deliveryPin && showPinStatuses.includes(order.status)){
    const pinStr = String(order.deliveryPin).padStart(4,'0');
    const pinDigits = pinStr.split('').map(d=>'<div style="width:36px;height:42px;background:rgba(21,101,192,.15);border:1.5px solid rgba(21,101,192,.4);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;font-family:\'Roboto Mono\',monospace;color:#1565C0">'+d+'</div>').join('');
    pinHtml='<div style="margin:0 12px 12px;background:linear-gradient(135deg,#0D47A1,#1565C0);border-radius:16px;padding:14px 16px;border:1px solid rgba(21,101,192,.3)">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
        +'<div><div style="font-size:10px;font-weight:800;color:rgba(255,255,255,.75);text-transform:uppercase;letter-spacing:.5px">🔐 Delivery PIN</div>'
        +'<div style="font-size:12px;color:rgba(255,255,255,.85);margin-top:3px;font-weight:600">Share with rider on arrival</div></div>'
      +'</div>'
      +'<div style="display:flex;gap:6px;justify-content:space-between">'
        +pinDigits
      +'</div></div>';
  }

  // -- 5. Order summary strip --
  var iCnt=Array.isArray(order.items)?order.items.length:0;
  var summaryHtml='<div style="margin:0 12px 12px;background:var(--g3);border-radius:16px;padding:13px 15px;border:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">'
    +'<div style="display:flex;align-items:center;gap:10px"><span style="font-size:20px">\uD83D\uDCCD</span>'
    +'<div><p style="font-size:12px;font-weight:800;color:var(--gd)">Order #'+(order.id||'').slice(-6).toUpperCase()+'</p>'
    +'<p style="font-size:11px;color:var(--g);margin-top:1px">'+iCnt+' item'+(iCnt!==1?'s':'')+' \u00b7 \u20B9'+(order.totalPrice||0).toFixed(0)+'</p></div></div>'
    +'<button onclick="openSupport()" style="background:var(--g);color:#fff;border:none;padding:7px 14px;border-radius:22px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font);display:flex;align-items:center;gap:5px">'
    +'<i class="fas fa-headset"></i> Help</button></div>';

  sec.innerHTML='<div style="border-radius:24px;overflow:hidden;box-shadow:var(--sh2);margin-bottom:12px;background:var(--card)">'
    +bannerHtml
    +stepperHtml
    +'</div>'
    +mapHtml
    +riderHtml
    +pinHtml
    +summaryHtml;

  if(isMoving&&rLat&&rLng){
    setTimeout(function(){initLiveMap(rLat,rLng,cLat,cLng);},100);
  }
}
// --- LIVE MAP (Leaflet) ---
// --- LIVE MAP (Leaflet) ---
let _lmap=null, _riderMarker=null, _custMarker=null, _routeLine=null;

function _mkIcon(htmlEntity,size,anchor){
  return window.L.divIcon({
    html:'<div style="font-size:'+size+'px;line-height:1;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))">'+htmlEntity+'</div>',
    className:'',iconAnchor:[anchor,anchor]
  });
}

function initLiveMap(rLat,rLng,cLat,cLng){
  var el=document.getElementById('live-track-map');
  if(!el)return;
  if(!window.L){
    if(!document.getElementById('lf-css')){
      var css=document.createElement('link');
      css.id='lf-css';css.rel='stylesheet';
      css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
    }
    var js=document.createElement('script');
    js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.onload=function(){_buildMap(el,rLat,rLng,cLat,cLng);};
    document.head.appendChild(js);
    return;
  }
  _buildMap(el,rLat,rLng,cLat,cLng);
}

function _buildMap(el,rLat,rLng,cLat,cLng){
  if(_lmap){_lmap.remove();_lmap=null;_riderMarker=null;_custMarker=null;_routeLine=null;}
  _lmap=window.L.map(el,{zoomControl:false,attributionControl:false});
  window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:20,subdomains:'abcd'}).addTo(_lmap);
  var sLat=window.STORE_LAT,sLng=window.STORE_LNG;
  window.L.marker([sLat,sLng],{icon:_mkIcon('&#x1F3EA;',22,11)})
    .addTo(_lmap).bindPopup('<b>&#x1F3EA; Nekta Store</b>');
  _riderMarker=window.L.marker([rLat,rLng],{icon:_mkIcon('&#x1F6F5;',32,16)})
    .addTo(_lmap).bindPopup('<b>&#x1F6F5; Your Rider</b>');
  if(cLat&&cLng){
    _custMarker=window.L.marker([cLat,cLng],{icon:_mkIcon('&#x1F3E0;',28,14)})
      .addTo(_lmap).bindPopup('<b>&#x1F3E0; Your Location</b>');
    _lmap.fitBounds([[rLat,rLng],[cLat,cLng]],{padding:[55,55]});
    // Draw real road route via OSRM
    _fetchOSRMRoute(rLat,rLng,cLat,cLng,function(coords){
      if(_routeLine){_lmap.removeLayer(_routeLine);_routeLine=null;}
      _routeLine=window.L.polyline(coords,{
        color:'#f97316',weight:5,opacity:0.9,lineCap:'round',lineJoin:'round'
      }).addTo(_lmap);
    });
  } else {
    _lmap.setView([rLat,rLng],15);
  }
}

function _fetchOSRMRoute(lat1,lng1,lat2,lng2,cb){
  // Use OSRM with alternatives=false and a tighter timeout; fall back to straight line
  var url='https://router.project-osrm.org/route/v1/driving/'
    +lng1+','+lat1+';'+lng2+','+lat2
    +'?overview=full&geometries=geojson&alternatives=false&steps=false';
  fetch(url,{signal:AbortSignal.timeout(8000)})
    .then(function(r){return r.json();})
    .then(function(j){
      if(j.code!=='Ok'||!j.routes||!j.routes.length){cb([[lat1,lng1],[lat2,lng2]]);return;}
      var coords=j.routes[0].geometry.coordinates.map(function(c){return[c[1],c[0]];});
      cb(coords);
    })
    .catch(function(){cb([[lat1,lng1],[lat2,lng2]]);});
}

var _routeUpdateTimer=null;
function updateLiveMap(rLat,rLng,cLat,cLng){
  if(!window.L||!_lmap)return;
  if(_riderMarker) _riderMarker.setLatLng([rLat,rLng]);
  if(cLat&&cLng){
    _lmap.fitBounds([[rLat,rLng],[cLat,cLng]],{padding:[55,55],maxZoom:16,animate:true,duration:1});
    // Redraw road route from current rider position every ~4s (debounced)
    clearTimeout(_routeUpdateTimer);
    _routeUpdateTimer=setTimeout(function(){
      _fetchOSRMRoute(rLat,rLng,cLat,cLng,function(coords){
        if(_routeLine){_lmap.removeLayer(_routeLine);_routeLine=null;}
        if(!_lmap)return;
        _routeLine=window.L.polyline(coords,{
          color:'#f97316',weight:5,opacity:0.9,lineCap:'round',lineJoin:'round'
        }).addTo(_lmap);
      });
    },4000);
  } else {
    _lmap.panTo([rLat,rLng],{animate:true,duration:1});
  }
}

function updateTMap(loc,order){
  var lat=loc.lat||loc.latitude;
  var lng=loc.lng||loc.longitude;
  if(!lat||!lng)return;
  var clat=parseFloat(localStorage.getItem('custLatitude'))||(order&&order.latitude)||null;
  var clng=parseFloat(localStorage.getItem('custLongitude'))||(order&&order.longitude)||null;
  var mapEl=document.getElementById('live-track-map');
  if(mapEl){
    if(!_lmap) initLiveMap(lat,lng,clat,clng);
    else updateLiveMap(lat,lng,clat,clng);
  }
  // Road distance from current rider position → customer
  if(clat&&clng){
    fetch('https://router.project-osrm.org/route/v1/driving/'+lng+','+lat+';'+clng+','+clat+'?overview=false&alternatives=false',
      {signal:AbortSignal.timeout(6000)})
      .then(function(r){return r.json();})
      .then(function(j){
        var d=(j.code==='Ok'&&j.routes&&j.routes.length)
          ?j.routes[0].distance/1000
          :haversineKm(lat,lng,clat,clng);
        _applyRiderDistUI(d);
      })
      .catch(function(){
        _applyRiderDistUI(haversineKm(lat,lng,clat,clng));
      });
  }
}
function _applyRiderDistUI(d){
  var eta=Math.max(1,Math.ceil((d/20)*60));
  var b=document.getElementById('eta-map-badge');
  if(b) b.textContent='\u23F1 ~'+eta+' min';
  var eb=document.getElementById('eta-banner');
  if(eb) eb.innerHTML='<span style="width:7px;height:7px;background:#6ee7b7;border-radius:50%;animation:dpulse 1.4s infinite;flex-shrink:0"></span>'
    +'<span style="color:#fff;font-size:11px;font-weight:800">\u23F1 ~'+eta+' min away</span>';
  var dv=document.getElementById('dist-map-val');
  if(dv) dv.textContent=d.toFixed(1)+' km away';
  var db=document.getElementById('dist-map-badge');
  if(db) db.style.display='flex';
  var rl=document.getElementById('rider-dist-label');
  var rs=document.getElementById('rider-dist-sub');
  if(d<0.3){
    if(rl) rl.textContent='Your rider is right outside!';
    if(rs) rs.textContent='Please be ready at the door';
  } else if(d<0.8){
    if(rl) rl.textContent='Rider is very close!';
    if(rs) rs.textContent='Less than 1 min away';
  } else if(d<2){
    if(rl) rl.textContent='Rider is nearby \u2014 '+d.toFixed(1)+' km';
    if(rs) rs.textContent='~'+eta+' min \u00B7 Live tracking active';
  } else {
    if(rl) rl.textContent='Rider on the way \u2014 '+d.toFixed(1)+' km';
    if(rs) rs.textContent='~'+eta+' min estimated arrival';
  }
  var dl=document.getElementById('tk-status-desc');
  if(dl) dl.textContent=d<0.3?'Right outside your door!'
    :d<0.8?'Almost there \u2014 less than 1 min!'
    :'On the way \u2014 '+d.toFixed(1)+' km \u00B7 ~'+eta+' min';
}
function rateDelivery(){
  showMdl(`<h3 style="font-weight:900;font-size:20px;margin-bottom:16px">⭐ Rate Your Delivery 🚴</h3>
    <div style="display:flex;justify-content:center;gap:10px;margin-bottom:20px">${[1,2,3,4,5].map(n=>`<span style="font-size:36px;cursor:pointer;opacity:0.3;transition:opacity 0.2s" onclick="window._selR=${n};document.querySelectorAll('.dstar').forEach((s,i)=>s.style.opacity=i<${n}?'1':'.3')" class="dstar">⭐</span>`).join('')}</div>
    <div class="fg"><textarea id="rate-text" class="fi" rows="2" placeholder="Tell us about your experience (optional)" style="resize:none"></textarea></div>
    <button class="pbtn" onclick="closeMdl();toast('Thank you for your feedback! 🙏','success')">Submit</button>`);
  window._selR=5;
  document.querySelectorAll('.dstar').forEach((s,i)=>s.style.opacity=i<5?'1':'.3');
}

// --- SECURE LOCK MODAL ---
function _showLock({title,subtitle,icon,color,onSubmit,inputType='text',placeholder='Enter PIN'}){
  closeMdl();
  _mdl=document.createElement('div');_mdl.className='mov';
  _mdl.innerHTML=`
    <div class="msh" style="border-radius:26px 26px 0 0">
      <div class="mhdl"></div>
      <div style="padding:0 24px 32px;text-align:center">
        <div style="width:64px;height:64px;border-radius:20px;background:${color}18;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 14px">${icon}</div>
        <h3 style="font-weight:900;font-size:20px;color:#0a1628;font-family:'Nunito',sans-serif;margin-bottom:6px">${title}</h3>
        <p style="font-size:13px;color:#94a3b8;margin-bottom:24px">${subtitle}</p>
        <div style="position:relative;margin-bottom:16px">
          <input id="_lock-inp" type="${inputType}" class="fi" placeholder="${placeholder}"
            style="text-align:center;font-size:20px;letter-spacing:6px;font-weight:800;padding-right:48px"
            autocomplete="off" inputmode="${inputType==='tel'?'numeric':'text'}"
            onkeydown="if(event.key==='Enter')document.getElementById('_lock-btn').click()">
          <button onclick="const i=document.getElementById('_lock-inp');i.type=i.type==='password'?'text':'password'"
            style="position:absolute;right:14px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:18px;color:#94a3b8">\uD83D\uDD0D</button>
        </div>
        <div id="_lock-err" style="color:#ef4444;font-size:12px;font-weight:700;min-height:18px;margin-bottom:12px"></div>
        <button id="_lock-btn" class="pbtn" style="background:linear-gradient(135deg,${color},${color}cc)" onclick="_lockSubmit()">Unlock</button>
        <button class="sbtn" style="margin-top:10px" onclick="closeMdl()">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(_mdl);
  setTimeout(()=>document.getElementById('_lock-inp')?.focus(),300);
  window._lockOnSubmit=onSubmit;
}
async function _lockSubmit(){
  const val=document.getElementById('_lock-inp')?.value.trim();
  const err=document.getElementById('_lock-err');
  const btn=document.getElementById('_lock-btn');
  if(!val){err.textContent='Please enter a value';return;}
  btn.textContent='Checking...';btn.disabled=true;
  const ok=await window._lockOnSubmit(val);
  if(!ok){
    err.textContent='⚠️ Incorrect. Try again.';
    btn.textContent='Unlock';btn.disabled=false;
    const inp=document.getElementById('_lock-inp');if(inp){inp.value='';inp.focus();}
  }
}

// --- ADMIN ---
function doSwitchToAdmin(){
  _showLock({
    title:'Admin Panel',
    subtitle:'Enter your admin PIN to continue',
    icon:'🔔',
    color:'#4f46e5',
    placeholder:'Admin PIN',
    async onSubmit(pin){
      const ok=await _checkPin(pin);
      if(ok){
        closeMdl();
        // Use localStorage with short-lived token so new tab can read it
        const token = Date.now().toString();
        localStorage.setItem('nk_dash_role','admin');
        localStorage.setItem('nk_dash_login_time', new Date().toISOString());
        localStorage.setItem('nk_dash_expires_at', (Date.now() + 2*60*60*1000).toString());
        localStorage.setItem('nk_dash_token', token);
        sessionStorage.setItem('nk_dash_role','admin');
        sessionStorage.setItem('nk_dash_login_time', new Date().toISOString());
        window.open('dashboard.html','_blank');
      }
      return ok;
    }
  });
}
window.doSwitchToAdmin=doSwitchToAdmin;
function waitFB(fn,max=10000){const t=Date.now();const c=()=>{if(window.firebaseReady&&window.db){fn();return;}if(Date.now()-t>max){fn();return;}setTimeout(c,300);};c();}
function aTab(tab){
  ['orders','riders','products','analytics','stock','contacts'].forEach(t=>{const el=document.getElementById('at-'+t);if(el)el.style.display=t===tab?'block':'none';});
  document.querySelectorAll('.atab').forEach((b,i)=>b.classList.toggle('on',['orders','riders','products','analytics','stock','notify','contacts'][i]===tab));
  if(tab==='orders')refreshAOrders();if(tab==='riders')loadARiders();
  if(tab==='products')loadAProducts();if(tab==='analytics')loadAnalytics();if(tab==='stock')loadStockList();
  if(tab==='contacts')loadAdminContacts();
}
let _adminStarted=false;
async function loadAdminDash(){
  aTab('orders');loadAStats();
  if(!_adminStarted){_adminStarted=true;startAL();}
}
async function loadAStats(){
  try{
    const orders=await getOrdersFromFirebase(200);const today=new Date().toDateString();
    const todO=orders.filter(o=>{const d=o.createdAt?.toDate?o.createdAt.toDate():new Date(o.createdAt);return !isNaN(d.getTime())&&d.toDateString()===today;});
    const se=id=>document.getElementById(id);
    if(se('s-tod-o'))se('s-tod-o').textContent=todO.length;
    if(se('s-tod-r'))se('s-tod-r').textContent='₹'+todO.reduce((s,o)=>s+(o.totalPrice||0),0).toFixed(0);
    const activeStates=['placed','packing','assigned','picked'];
    if(se('s-pend'))se('s-pend').textContent=orders.filter(o=>activeStates.includes(o.status)).length;
    if(se('s-deliv'))se('s-deliv').textContent=orders.filter(o=>o.status==='delivered').length;
  }catch{}
}
function startAL(){
  if(adminL)adminL();
  if(!window.db){setTimeout(startAL,400);return;}
  // Track known order IDs to avoid alarming on existing orders at startup
  const _knownIds=new Set();
  const _sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  adminL=window.db.collection('orders')
    .where('createdAt','>=',_sevenDaysAgo)
    .orderBy('createdAt','desc')
    .limit(100)
    .onSnapshot(snap=>{
    const orders=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    allOrders=orders;renderAOrders(orders);loadAStats();
    if(!isFirstSnap){
      snap.docChanges().forEach(ch=>{
        if(ch.type==='added' && !_knownIds.has(ch.doc.id)){
          const o={id:ch.doc.id,...ch.doc.data()};
          if(o.status==='placed'){alarmOId=o.id;triggerAlarm(o);}
        }
      });
    } else {
      // On first load → mark all existing orders as known so alarm doesn't fire
      snap.docs.forEach(d=>_knownIds.add(d.id));
    }
    snap.docs.forEach(d=>_knownIds.add(d.id));
    isFirstSnap=false;
  },err=>{console.error('startAL:',err.message);_adminStarted=false;setTimeout(startAL,2000);});
}
async function refreshAOrders(){const orders=await getOrdersFromFirebase(100);allOrders=orders;renderAOrders(orders);}
function applyOrderFilter(){const f=document.getElementById('ord-filter').value;renderAOrders(f==='all'?allOrders:allOrders.filter(o=>o.status===f));}
function renderAOrders(orders){
  const c=document.getElementById('aorders-list');if(!c)return;
  if(!orders.length){c.innerHTML=`<div class="empty"><div class="emj">\uD83C\uDFED</div><h3>No orders yet</h3></div>`;return;}
  const meta=window.ORDER_STATE_META||{};
  c.innerHTML=orders.map(o=>{
    const ts=o.createdAt?.toDate?o.createdAt.toDate().toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
    const isNew=o.status==='placed';
    const sm=meta[o.status]||{label:o.status,icon:'🔔',color:'#94a3b8'};
    const btns=[];
    if(o.status==='placed') btns.push(`<button onclick="aConfirm('${o.id}')" style="background:#dbeafe;color:#1d4ed8;border:none;padding:7px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font)">✅ Confirm Order</button>`);
    if(o.status==='packing') btns.push(`<button onclick="showAssign('${o.id}')" style="background:#ede9fe;color:#5b21b6;border:none;padding:7px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font)">🚴 Assign Rider</button>`);
    if(o.status==='assigned'||o.status==='picked') btns.push(`<button onclick="aUS('${o.id}','delivered')" style="background:#059669;color:#fff;border:none;padding:7px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font)">✅ Mark Delivered</button>`);
    if(o.latitude) btns.push(`<a href="https://maps.google.com/?q=${o.latitude},${o.longitude}" target="_blank" rel="noopener noreferrer" style="background:#f0fdf8;color:#059669;padding:7px 12px;border-radius:8px;font-size:11px;font-weight:700;text-decoration:none">📍 Map</a>`);
    btns.push(`<button onclick="aViewDetails('${o.id}')" style="background:#f1f5f9;color:#374151;border:none;padding:7px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font)">📝 Details</button>`);
    btns.push(`<a href="https://wa.me/91${esc(o.customerPhone)}?text=Hi+${encodeURIComponent(o.customerName||'')}%2C+your+order+is+${encodeURIComponent(sm.label)}!" target="_blank" rel="noopener noreferrer" style="background:#d1fae5;color:#059669;padding:7px 12px;border-radius:8px;font-size:11px;font-weight:700;text-decoration:none">💬 WA</a>`);
    return`<div class="ocard${isNew?' new-ping':''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div><p style="font-weight:800;font-size:14px">${esc(o.customerName)||'—'}</p><p style="font-size:12px;color:#94a3b8;margin-top:2px">\uD83D\uDCDE ${esc(o.customerPhone)||'—'} · ${ts}</p></div>
        <div style="text-align:right"><p style="font-weight:900;color:#059669;font-size:16px;font-family:'Nunito',sans-serif">&#8377;${(o.totalPrice||0).toFixed(0)}</p>
        <span style="font-size:10px;font-weight:800;color:${sm.color};background:${sm.color}22;padding:2px 8px;border-radius:8px">${isNew?'🔔 ':''}${sm.icon} ${sm.label}</span></div>
      </div>
      <p style="font-size:12px;color:#94a3b8;margin-bottom:10px">\uD83D\uDCCD ${esc(o.address)||'—'} · ${Array.isArray(o.items)?o.items.length:0} items${o.expressMode?' · \u26A1 Express':''}</p>
      ${o.riderName?`<p style="font-size:12px;color:#7c3aed;margin-bottom:8px;font-weight:600">\uD83D\uDE98 ${esc(o.riderName)} (${esc(o.riderPhone)})</p>`:''}
      <div style="display:flex;flex-wrap:wrap;gap:6px">${btns.join('')}</div>
    </div>`;
  }).join('');
}
async function aConfirm(id){if(await confirmOrderFirebase(id))toast('Order confirmed! Packing... 📦','success');}
async function aUS(id,st){if(await updateOrderStatus(id,st))toast('Status updated: '+st,'success');}

// ── ADMIN: CONTACT REQUESTS ─────────────────────────────────
var _allContacts = [];
var _contactFilter = 'all';

async function loadAdminContacts(){
  const el = document.getElementById('contacts-list');
  if(!el) return;
  el.innerHTML = '<div style="text-align:center;padding:24px"><div class="spinner"></div></div>';
  try {
    const snap = await db.collection('contacts').orderBy('createdAt','desc').limit(100).get()
      .catch(()=>db.collection('contacts').limit(100).get());
    _allContacts = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderAdminContacts();
  } catch(e) {
    el.innerHTML = '<div style="padding:16px;text-align:center;color:#dc2626;font-size:13px">❌ Failed to load: '+e.message+'</div>';
  }
}

function filterContacts(type){
  _contactFilter = type;
  ['all','new','support','seller','rider'].forEach(t=>{
    const b=document.getElementById('cf-'+t);
    if(!b) return;
    const active = t===type;
    b.style.borderColor = active ? 'var(--g)' : 'var(--border)';
    b.style.background  = active ? 'var(--g3)' : '#fff';
    b.style.color       = active ? 'var(--g)' : 'var(--mid)';
  });
  renderAdminContacts();
}

function renderAdminContacts(){
  const el = document.getElementById('contacts-list');
  if(!el) return;
  let list = _allContacts;
  if(_contactFilter === 'new')     list = list.filter(c=>c.status==='new');
  else if(_contactFilter !== 'all') list = list.filter(c=>c.type===_contactFilter);

  if(!list.length){
    el.innerHTML='<div style="text-align:center;padding:32px;color:var(--pale);font-size:13px">📭 No contacts found</div>';
    return;
  }
  const typeColors = {support:'#dbeafe,#1e40af,🆘',seller:'#ede9fe,#4c1d95,🏪',rider:'#ffedd5,#9a3412,🛵'};
  el.innerHTML = list.map(c=>{
    const ts = c.createdAt?.seconds ? new Date(c.createdAt.seconds*1000).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
    const [bg,fg,ico] = (typeColors[c.type]||'#f1f5f9,#475569,💬').split(',');
    const isNew = c.status==='new';
    return `<div style="background:var(--card);border-radius:12px;padding:12px;margin-bottom:10px;border-left:4px solid ${isNew?'var(--g)':'var(--border)'}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="background:${bg};color:${fg};padding:3px 9px;border-radius:20px;font-size:10px;font-weight:800">${ico} ${(c.type||'support').toUpperCase()}</span>
          ${isNew?'<span style="background:#dcfce7;color:#166534;padding:3px 8px;border-radius:20px;font-size:10px;font-weight:800">NEW</span>':''}
        </div>
        <span style="font-size:10px;color:var(--pale)">${ts}</span>
      </div>
      <div style="font-weight:800;font-size:13px;color:var(--dark);margin-bottom:2px">${esc(c.name||'—')}</div>
      <div style="font-size:12px;color:var(--g);font-weight:700;margin-bottom:6px">📱 ${esc(c.phone||'—')}</div>
      <div style="font-size:12px;color:var(--mid);background:var(--bg);border-radius:8px;padding:8px;margin-bottom:10px;line-height:1.5">${esc(c.message||'')}</div>
      <div style="display:flex;gap:8px">
        <a href="https://wa.me/91${c.phone}?text=${encodeURIComponent('Hi '+c.name+'! This is Nekta support.')}" target="_blank" rel="noopener" style="flex:1;background:#dcfce7;color:#166534;border:none;padding:8px;border-radius:9px;font-size:12px;font-weight:800;cursor:pointer;text-decoration:none;text-align:center;font-family:var(--font)">💬 Reply on WhatsApp</a>
        ${isNew?`<button onclick="markContactReplied('${c.id}')" style="background:var(--g3);color:var(--g);border:none;padding:8px 12px;border-radius:9px;font-size:12px;font-weight:800;cursor:pointer;font-family:var(--font)">✅ Mark Replied</button>`:''}
      </div>
    </div>`;
  }).join('');
}

async function markContactReplied(id){
  try{
    await db.collection('contacts').doc(id).update({status:'replied', repliedAt: firebase.firestore.FieldValue.serverTimestamp()});
    const idx = _allContacts.findIndex(c=>c.id===id);
    if(idx>=0) _allContacts[idx].status='replied';
    renderAdminContacts();
    toast('✅ Marked as replied','success');
  }catch(e){ toast('❌ '+e.message,'error'); }
}
window.loadAdminContacts=loadAdminContacts;
window.filterContacts=filterContacts;
window.markContactReplied=markContactReplied;
async function showAssign(orderId){
  const riders=await getRidersFromFirebase();
  if(!riders.length){toast('No riders. Add riders first.','warning');return;}
  showMdl(`<h3 style="font-weight:900;font-size:18px;margin-bottom:16px">🚴 Assign Rider</h3>${riders.map(r=>`<div onclick="doAssign('${r.id}','${esc(r.id)}','${esc(r.name)}','${esc(r.phone)}')" style="background:#f8fafc;border-radius:14px;padding:14px;margin-bottom:8px;cursor:pointer;border:1.5px solid #e2f0eb;display:flex;align-items:center;justify-content:space-between"><div style="display:flex;align-items:center;gap:10px"><div style="width:44px;height:44px;border-radius:50%;background:#d1fae5;display:flex;align-items:center;justify-content:center;font-weight:900;color:#059669;font-size:18px">${esc(r.name.charAt(0))}</div><div><p style="font-weight:700;font-size:14px">${esc(r.name)}</p><p style="font-size:12px;color:#94a3b8">\uD83D\uDCDE ${esc(r.phone)} \u00b7 &#8377;${r.todayEarnings||0} today</p></div></div><span class="sbadge ${r.status==='online'?'s-on_the_way':'s-pending'}">${esc(r.status||'offline')}</span></div>`).join('')}`);
}
async function doAssign(oId,rId,rName,rPhone){closeMdl();if(await assignRiderToOrderFirebase(oId,rId,rName,rPhone))toast(rName+' assigned! ✅','success');}
async function aViewDetails(oId){
  const doc=await window.db?.collection('orders').doc(oId).get();if(!doc?.exists)return;
  const o={id:doc.id,...doc.data()};
  const billHtml=window.mkBillHtml?mkBillHtml(o):'';
  const itemsHtml=window.mkItemsListHtml?mkItemsListHtml(o.items):'';
  showMdl(`<h3 style="font-weight:900;font-size:18px;margin-bottom:16px">Order Details</h3>
    <div style="background:#f8fafc;border-radius:13px;padding:12px;margin-bottom:12px">
      <p style="font-weight:800;font-size:14px">${o.customerName}</p>
      <p style="font-size:12px;color:#94a3b8;margin-top:4px">📱 ${esc(o.customerPhone)}</p>
      <p style="font-size:12px;color:#94a3b8;margin-top:2px">📍 ${esc(o.address)}</p>
      ${o.riderName?`<p style="font-size:12px;color:#7c3aed;margin-top:4px;font-weight:600">🚴 ${esc(o.riderName)} – ${esc(o.riderPhone)}</p>`:''}
      ${o.deliveryMins?`<p style="font-size:12px;color:#059669;margin-top:4px;font-weight:600">⚡ Delivered in ${o.deliveryMins} min</p>`:''}
    </div>
    ${o.proofOfDelivery?`<div style="margin-bottom:12px"><p style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px">📸 Proof of Delivery</p><img src="${o.proofOfDelivery}" style="width:100%;border-radius:12px;object-fit:cover;max-height:200px"></div>`:''}
    ${itemsHtml}${billHtml}
    ${o.latitude?`<a href="https://maps.google.com/?q=${o.latitude},${o.longitude}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;gap:8px;background:#d1fae5;color:#059669;padding:13px;border-radius:13px;font-weight:700;text-decoration:none;margin-top:10px;margin-bottom:8px">🗺 Open on Google Maps</a>`:''}
    <a href="https://wa.me/91${esc(o.customerPhone)}?text=Hi+${encodeURIComponent(o.customerName||'')}%2C+your+Nekta+order+is+${encodeURIComponent(o.status)}!" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;gap:8px;background:#059669;color:#fff;padding:13px;border-radius:13px;font-weight:700;text-decoration:none">💬 Message Customer</a>`);
}
async function loadARiders(){
  const c=document.getElementById('ariders-list');if(!c)return;
  c.innerHTML='<div style="text-align:center;padding:24px;color:#94a3b8">Loading...</div>';
  const riders=await getRidersFromFirebase();
  if(!riders.length){c.innerHTML=`<div class="empty"><div class="emj">🚴</div><h3>No riders yet</h3><button class="emtbtn" onclick="showAddRider()">+ Add Rider</button></div>`;return;}
  c.innerHTML=riders.map(r=>`<div class="ocard"><div style="display:flex;justify-content:space-between;align-items:center"><div style="display:flex;align-items:center;gap:12px"><div style="width:48px;height:48px;background:#d1fae5;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:20px;color:#059669">${esc(r.name.charAt(0))}</div><div><p style="font-weight:700;font-size:14px">${esc(r.name)}</p><p style="font-size:12px;color:#94a3b8">📱 ${esc(r.phone)} – 🚲 ${esc(r.bikeNumber||'🛈')}</p><p style="font-size:11px;color:#94a3b8;margin-top:2px">⭐ ${r.rating||4.5} – ${r.deliveriesCompleted||0} deliveries</p></div></div><div style="text-align:right"><p style="font-weight:900;color:#059669;font-family:'Nunito',sans-serif">&#8377;${r.todayEarnings||0}</p><span class="sbadge ${r.status==='online'?'s-on_the_way':'s-pending'}">${esc(r.status||'offline')}</span></div></div></div>`).join('');
}
function showAddRider(){showMdl(`<h3 style="font-weight:900;font-size:18px;margin-bottom:20px">Add Rider</h3><div class="fg"><label class="flbl">Full Name</label><input id="nr-n" class="fi" placeholder="Rider full name"></div><div class="fg"><label class="flbl">Phone</label><input id="nr-p" type="tel" class="fi" placeholder="10-digit number" maxlength="10"></div><div class="fg"><label class="flbl">Bike Number</label><input id="nr-b" class="fi" placeholder="e.g. TS09 AB 1234"></div><button class="pbtn" onclick="saveNewRider()">Save Rider</button>`);}
async function saveNewRider(){
  const n=document.getElementById('nr-n')?.value.trim(),p=document.getElementById('nr-p')?.value.trim(),b=document.getElementById('nr-b')?.value.trim();
  if(!n||!p||!b){toast('Fill all fields','error');return;}if(!/^[6-9]\d{9}$/.test(p)){toast('Invalid phone','error');return;}
  const id=await addRiderToFirebase({name:n,phone:p,bikeNumber:b});closeMdl();
  if(id){toast('Rider added! ?','success');loadARiders();}
}
function loadAProducts(){
  // Load all products data first
  if (typeof loadAllProducts === 'function') {
    loadAllProducts();
  }
  // Then render the products page with the new UI
  setTimeout(() => {
    if (typeof renderProductsPage === 'function') {
      renderProductsPage();
    }
  }, 100);
}
function showAddProduct(){
  const CATS=['VEGETABLES','LEAFY','FRUITS','DAIRY','GRAINS','DALS','OILS','SPICES','SNACKS','DRINKS','NONVEG','PERSONALCARE','CLEANING','PUJA','COMBOS'];
  showMdl(`<h3 style="font-weight:900;font-size:18px;margin-bottom:16px">Add Product</h3>
    <div class="fg"><label class="flbl">Product Name *</label><input id="np-name" class="fi" placeholder="e.g. Tomato"></div>
    <div class="fg"><label class="flbl">Telugu Name</label><input id="np-tel" class="fi" placeholder="e.g. టమాటో"></div>
    <div class="fg"><label class="flbl">Price (&#8377;) *</label><input id="np-price" type="number" class="fi" placeholder="e.g. 65"></div>
    <div class="fg"><label class="flbl">Slashed Price (&#8377;)</label><input id="np-slash" type="number" class="fi" placeholder="Optional MRP"></div>
    <div class="fg"><label class="flbl">Half Price (&#8377;)</label><input id="np-half" type="number" class="fi" placeholder="Optional 500g price"></div>
    <div class="fg"><label class="flbl">Unit *</label><input id="np-unit" class="fi" placeholder="e.g. Kg, Pc, Pack, Bunch"></div>
    <div class="fg"><label class="flbl">Category *</label><select id="np-cat" class="fsel"><option value="">Select category</option>${CATS.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>
    <div class="fg"><label class="flbl">Image URL</label><input id="np-img" class="fi" placeholder="./images/filename.jpg"></div>
    <button class="pbtn" onclick="saveNewProduct()">Save Product</button>`);
}
function saveNewProduct(){
  const name=document.getElementById('np-name')?.value.trim();
  const price=parseFloat(document.getElementById('np-price')?.value);
  const unit=document.getElementById('np-unit')?.value.trim();
  const cat=document.getElementById('np-cat')?.value;
  if(!name){toast('Enter product name','error');return;}
  if(!price||price<=0){toast('Enter valid price','error');return;}
  if(!unit){toast('Enter unit','error');return;}
  if(!cat){toast('Select category','error');return;}
  const slash=parseFloat(document.getElementById('np-slash')?.value)||undefined;
  const half=parseFloat(document.getElementById('np-half')?.value)||undefined;
  const img=document.getElementById('np-img')?.value.trim()||'images/nektaIcon.svg';
  const tel=document.getElementById('np-tel')?.value.trim()||undefined;
  const newId=Math.max(...products.map(p=>p.id))+1;
  const newProduct={id:newId,name,price,unit,category:cat,img,...(tel&&{teluguName:tel}),...(slash&&{slashedPrice:slash}),...(half&&{halfPrice:half})};
  products.push(newProduct);
  closeMdl();toast(name+' added! ?','success');
  loadAProducts();renderHSecs();renderCGrid(window.activecat||'ALL');
}
Object.assign(window,{showAddProduct,saveNewProduct});
async function loadAnalytics(){
  const c=document.getElementById('aanalytics-body');if(!c)return;
  c.innerHTML='<div style="text-align:center;padding:24px;color:#94a3b8">Loading...</div>';
  const orders=await getOrdersFromFirebase(200);
  const now=new Date();const last7=[];
  for(let i=6;i>=0;i--){const d=new Date(now);d.setDate(d.getDate()-i);last7.push(d.toDateString());}
  const byDay=last7.map(ds=>{
    const os=orders.filter(o=>{const d=o.createdAt?.toDate?o.createdAt.toDate():new Date(o.createdAt);return !isNaN(d.getTime())&&d.toDateString()===ds;});
    return{date:ds.split(' ').slice(1,3).join(' '),cnt:os.length,rev:os.reduce((s,o)=>s+(o.totalPrice||0),0)};
  });
  const maxRev=Math.max(...byDay.map(d=>d.rev),1);
  const topCats={};orders.forEach(o=>{(o.items||[]).forEach(i=>{const p=_getProds().find(x=>x.id===i.id);if(p){topCats[p.category]=(topCats[p.category]||0)+1;}});});
  const srtCats=Object.entries(topCats).sort((a,b)=>b[1]-a[1]).slice(0,5);
  c.innerHTML=`<div class="tcard" style="margin-bottom:12px"><p style="font-weight:900;font-size:15px;margin-bottom:16px;font-family:'Nunito',sans-serif">📊 Revenue · Last 7 Days</p><div style="display:flex;align-items:flex-end;gap:6px;height:130px">${byDay.map(d=>`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><span style="font-size:9px;color:#94a3b8;font-weight:600">${d.rev>999?Math.round(d.rev/1000)+'k':d.rev}</span><div style="width:100%;background:linear-gradient(180deg,#10b981,#059669);border-radius:6px 6px 0 0;height:${Math.round((d.rev/maxRev)*100)+5}px;transition:height .5s ease"></div><span style="font-size:9px;color:#94a3b8">${d.date}</span><span style="font-size:9px;font-weight:800;color:#059669">${d.cnt}</span></div>`).join('')}</div></div>
  <div class="tcard"><p style="font-weight:900;font-size:15px;margin-bottom:12px;font-family:'Nunito',sans-serif">⭐ Top Categories</p>${srtCats.map(([cat,cnt],i)=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:${i<srtCats.length-1?'1px solid #e2f0eb':'none'}"><span style="font-weight:600;font-size:13px">${['🥇','🥈','🥉','4🌟','5🌟'][i]} ${cat}</span><span style="font-weight:900;color:#059669;font-family:'Nunito',sans-serif">${cnt}</span></div>`).join('')}</div>`;
}
function loadStockList(q=''){
  const c=document.getElementById('stock-list');if(!c)return;
  const list=q?_getProds().filter(p=>p.name.toLowerCase().includes(q.toLowerCase())):_getProds().slice(0,40);
  c.innerHTML='';
  list.forEach(function(p){
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e2f0eb';
    const info=document.createElement('div');
    info.style.cssText='display:flex;align-items:center;gap:8px';
    info.innerHTML='<img src="'+getItemImage(p)+'" style="width:40px;height:40px;border-radius:10px;object-fit:cover" onerror="this.src=\'images/nektaIcon.svg\'"><div><p style="font-size:13px;font-weight:600">'+p.name+'</p><p style="font-size:10px;color:#94a3b8">'+p.unit+' · ₹'+p.price+'</p></div>';
    const btn=document.createElement('button');
    btn.textContent=p.outOfStock?'Mark In Stock':'Mark Out';
    btn.style.cssText='background:'+(p.outOfStock?'#fee2e2':'#d1fae5')+';color:'+(p.outOfStock?'#ef4444':'#059669')+';border:none;padding:6px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer';
    btn.addEventListener('click',function(){toggleStock(p.id);});
    row.appendChild(info);row.appendChild(btn);c.appendChild(row);
  });
}
function filterStockList(q){loadStockList(q);}
async function toggleStock(id){
  const p=_getProds().find(x=>String(x.id)===String(id));if(!p)return;
  const newVal=!p.outOfStock;
  p.outOfStock=newVal;
  loadStockList(document.getElementById('stock-srch')?.value||'');
  toast(p.name+' marked '+(newVal?'out of stock':'in stock'),newVal?'warning':'success');
  // Persist to Firebase so users see the change instantly
  if(window.db){
    try{
      await window.db.collection('app_overrides').doc('products')
        .set({[String(id)]:{outOfStock:newVal}},{merge:true});
      if(p._docId){
        await window.db.collection('products').doc(p._docId)
          .update({outOfStock:newVal}).catch(()=>{});
      }
    }catch(e){toast('Save failed: '+e.message,'error');}
  }
}

// --- ALARM AUDIO → uses HTML Audio element (works without user gesture on admin page) ---
if(typeof _alarmAudio==='undefined') var _alarmAudio=null;
if(typeof _alarmLoopTimer==='undefined') var _alarmLoopTimer=null;

// Build alarm audio using base64 encoded short beep (no file needed)
function _buildAlarmAudio(){
  // Generate alarm sound via AudioContext and encode to blob URL
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    const sr=ctx.sampleRate;
    const dur=1.2; // seconds
    const buf=ctx.createBuffer(1,sr*dur,sr);
    const ch=buf.getChannelData(0);
    // Alarm clock pattern: 3 double-beep bursts
    const beepAt=[0,0.12, 0.35,0.47, 0.70,0.82];
    beepAt.forEach(t=>{
      const start=Math.floor(t*sr);
      const end=Math.floor((t+0.09)*sr);
      for(let i=start;i<end&&i<ch.length;i++){
        const env=Math.sin(Math.PI*(i-start)/(end-start));
        ch[i]=(Math.sin(2*Math.PI*1400*(i/sr))*0.7+Math.sin(2*Math.PI*2800*(i/sr))*0.3)*env;
      }
    });
    // Convert buffer to WAV blob
    const wav=_bufToWav(buf);
    const blob=new Blob([wav],{type:'audio/wav'});
    const url=URL.createObjectURL(blob);
    _alarmAudio=new Audio(url);
    _alarmAudio.volume=1.0;
    ctx.close();
  }catch(e){
    // Fallback: simple Audio beep via data URI
    _alarmAudio=null;
  }
}
function _bufToWav(buf){
  const ch=buf.getChannelData(0);
  const sr=buf.sampleRate;
  const nb=ch.length*2;
  const ab=new ArrayBuffer(44+nb);
  const v=new DataView(ab);
  const ws=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  ws(0,'RIFF');v.setUint32(4,36+nb,true);ws(8,'WAVE');
  ws(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);
  ws(36,'data');v.setUint32(40,nb,true);
  for(let i=0;i<ch.length;i++){const s=Math.max(-1,Math.min(1,ch[i]));v.setInt16(44+i*2,s<0?s*0x8000:s*0x7FFF,true);}
  return ab;
}

// Pre-build audio on first user interaction
let _alarmReady=false;
(function(){
  const prep=()=>{
    if(_alarmReady)return;
    _alarmReady=true;
    _buildAlarmAudio();
  };
  ['touchstart','mousedown','click','keydown'].forEach(ev=>document.addEventListener(ev,prep,{once:true,passive:true}));
})();

// --- ALARM ---
function triggerAlarm(order){
  if(isAlarm)return;isAlarm=true;alarmOId=order.id;
  document.getElementById('alarm-msg').textContent='New order from '+(esc(order.customerName)||'customer')+' for ?'+(order.totalPrice||0).toFixed(0)+'. Confirm to assign a rider.';
  document.getElementById('alarm').classList.add('on');
  try{lplay('al-anim',LA.bell,true);}catch{}
  playAlarm();
}
function playAlarm(){
  if(_alarmLoopTimer){clearInterval(_alarmLoopTimer);_alarmLoopTimer=null;}
  _ringOnce();
  _alarmLoopTimer=setInterval(()=>{
    if(!isAlarm){clearInterval(_alarmLoopTimer);_alarmLoopTimer=null;return;}
    _ringOnce();
  },1500);
}
function _ringOnce(){
  if(_alarmAudio){
    _alarmAudio.currentTime=0;
    _alarmAudio.play().catch(()=>_ringFallback());
  } else {
    _ringFallback();
  }
}
function _ringFallback(){
  // Pure Web Audio fallback → works if AudioContext was already unlocked
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    if(ctx.state==='suspended'){ctx.resume().then(()=>_doRing(ctx));}
    else _doRing(ctx);
  }catch{}
}
function _doRing(ctx){
  const master=ctx.createGain();master.gain.value=1.0;master.connect(ctx.destination);
  const now=ctx.currentTime;
  [[0,0.09],[0.12,0.09],[0.35,0.09],[0.47,0.09],[0.70,0.09],[0.82,0.09]].forEach(([t,d])=>{
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type='sine';o.frequency.value=1400;
    o.connect(g);g.connect(master);
    g.gain.setValueAtTime(0,now+t);
    g.gain.linearRampToValueAtTime(0.9,now+t+0.01);
    g.gain.exponentialRampToValueAtTime(0.001,now+t+d);
    o.start(now+t);o.stop(now+t+d+0.01);
  });
  setTimeout(()=>ctx.close(),2000);
}
function dismissAlarm(){
  document.getElementById('alarm').classList.remove('on');
  lstop('al-anim');isAlarm=false;
  if(_alarmLoopTimer){clearInterval(_alarmLoopTimer);_alarmLoopTimer=null;}
  if(_alarmAudio){_alarmAudio.pause();_alarmAudio.currentTime=0;}
}
function acceptAlarm(){dismissAlarm();if(alarmOId)aConfirm(alarmOId);}

// --- RIDER ---
function doSwitchToRider(){
  _showLock({
    title:'Rider Login',
    subtitle:'Enter your registered WhatsApp number',
    icon:'🔔',
    color:'#059669',
    inputType:'tel',
    placeholder:'10-digit mobile number',
    async onSubmit(ph){
      if(!/^[6-9]\d{9}$/.test(ph)){
        document.getElementById('_lock-err').textContent='⚠️ Enter valid 10-digit number';
        return false;
      }
      try{
        if(window.db){
          const snap=await window.db.collection('riders').where('phone','==',ph).limit(1).get();
          if(snap.empty){
            document.getElementById('_lock-err').textContent='⚠️ Phone not registered as rider';
            return false;
          }
        }
      }catch{/* offline fallback → allow */}
      closeMdl();
      sessionStorage.setItem('nk_dash_role','rider');
      sessionStorage.setItem('nk_dash_rider_phone',ph);
      sessionStorage.setItem('nk_rider_name_tmp',ph); // phone as fallback name
      window.open('rider.html','_blank');
      return true;
    }
  });
}
function cancelRider(){
  const s=document.getElementById('rl-screen');if(s){s.style.display='none';s.classList.remove('on');}
  lstop('rl-lot');
  const bnav=document.getElementById('bnav');if(bnav)bnav.style.display='flex';
  ['home','catalog','cart','profile'].forEach(n=>{const el=document.getElementById('nb-'+n);if(el)el.classList.remove('on');});
  const nb=document.getElementById('nb-'+curview);if(nb)nb.classList.add('on');
}
window.cancelRider=cancelRider;
function confirmRider(){
  const ph=document.getElementById('rl-ph').value.trim();
  if(!/^[6-9]\d{9}$/.test(ph)){toast('Enter valid phone number','error');return;}
  const s=document.getElementById('rl-screen');if(s){s.style.display='none';s.classList.remove('on');}
  lstop('rl-lot');
  localStorage.setItem('nk_rider_phone',ph);
  window.open('rider.html','_blank');
}
window.confirmRider=confirmRider;
function launchRider(ph){showView('rider');waitFB(()=>loadRDash(ph));}
async function loadRDash(ph){
  document.getElementById('rid-st').textContent='🚴 '+ph;
  try{
    const snap=await window.db?.collection('riders').where('phone','==',ph).limit(1).get();
    if(snap&&!snap.empty){
      const d=snap.docs[0].data();
      document.getElementById('r-today').textContent='₹'+(d.todayEarnings||0);
      document.getElementById('r-week').textContent='₹'+(d.weekEarnings||0);
      document.getElementById('r-del').textContent=d.deliveriesCompleted||0;
      document.getElementById('rid-st').textContent=(d.name||'Rider')+' · 📞 '+ph;
    }
  }catch{}
  loadROrders(ph);
  if(window.db){
    window.db.collection('orders').where('riderPhone','==',ph)
      .orderBy('createdAt','desc').limit(50)
      .onSnapshot(snap=>{
      const hasActive=snap.docs.some(d=>['assigned','picked'].includes(d.data().status));
      if(hasActive)loadROrders(ph);
    },()=>{});
  }
}
async function loadROrders(ph){
  const c=document.getElementById('r-orders');if(!c)return;
  c.innerHTML='<div style="text-align:center;padding:24px;color:#94a3b8"><div style="width:32px;height:32px;border:3px solid #d1fae5;border-top-color:#059669;border-radius:50%;margin:0 auto 8px;animation:spin 1s linear infinite"></div>Loading...</div>';
  try{
    const orders=await getAssignedOrdersForRider(ph);
    if(!orders.length){
      c.innerHTML='<div class="empty"><div id="r-el" style="width:160px;height:160px;margin:0 auto -8px"></div><h3>No deliveries</h3><p>New orders appear here!</p></div>';
      setTimeout(()=>lplay('r-el',LA.delivery,true),50);return;
    }
    const meta=window.ORDER_STATE_META||{};
    c.innerHTML=orders.map(o=>{
      const sm=meta[o.status]||{label:o.status,icon:'🔔',color:'#059669'};
      let actionBtn='';
      if(o.status==='assigned'){
        actionBtn=`<button class="rab pri" onclick="rAction('${o.id}','${ph}','picked')" style="background:linear-gradient(135deg,#059669,#047857)">📦 Picked Up · Start Delivery</button>`;
      } else if(o.status==='picked'){
        actionBtn=`<button class="rab pri" onclick="rAction('${o.id}','${ph}','delivered')" style="background:linear-gradient(135deg,#2563eb,#1d4ed8);font-size:14px;padding:14px">✅ Mark as Delivered</button>`;
      }
      return`<div class="roc">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div><p style="font-weight:800;font-size:15px">${esc(o.customerName)}</p><p style="font-size:12px;color:#94a3b8;margin-top:2px">📞 ${esc(o.customerPhone)}</p></div>
          <div style="text-align:right"><p style="font-weight:900;color:#059669;font-size:16px;font-family:'Nunito',sans-serif">&#8377;${(o.totalPrice||0).toFixed(0)}</p>
          <span style="font-size:10px;font-weight:800;color:${sm.color};background:${sm.color}22;padding:2px 8px;border-radius:8px">${sm.icon} ${sm.label}</span></div>
        </div>
        ${window.mkItemsListHtml?mkItemsListHtml(o.items):`<div style="background:#f0fdf8;border-radius:12px;padding:10px 12px;margin-bottom:10px"><p style="font-size:12px;font-weight:700;color:#065f46;margin-bottom:4px">📦 Items</p><p style="font-size:12px;color:#374151;line-height:1.7">${Array.isArray(o.items)?o.items.map(i=>'• '+i.name+' x '+i.qty).join('<br>'):''}</p></div>`}
        ${window.mkBillHtml?mkBillHtml(o):`<div style="background:#fef9c3;border-radius:12px;padding:10px 12px;margin-bottom:10px;display:flex;gap:8px"><span>📍</span><div><p style="font-size:12px;font-weight:700;color:#854d0e">Delivery Address</p><p style="font-size:12px;color:#92400e;margin-top:2px">${o.address}</p></div></div>`}
        <div style="background:#fef9c3;border-radius:12px;padding:10px 12px;margin-bottom:12px;display:flex;gap:8px">
          <span>📍</span><div><p style="font-size:12px;font-weight:700;color:#854d0e">Delivery Address</p><p style="font-size:12px;color:#92400e;margin-top:2px">${o.address}</p></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${actionBtn}
          <div style="display:flex;gap:8px">
            <a href="tel:${esc(o.customerPhone)}" class="rab sec" style="display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;flex:1">📞 Call</a>
            ${o.latitude?`<a href="https://www.google.com/maps/dir/?api=1&origin=current+location&destination=${o.latitude},${o.longitude}&travelmode=driving" target="_blank" rel="noopener noreferrer" class="rab sec" style="display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;flex:1">🧭 Navigate</a>`:''}
          </div>
        </div>
      </div>`;
    }).join('');
  }catch{c.innerHTML='<p style="text-align:center;color:#ef4444;padding:24px">Failed to load</p>';}
}
async function rAction(oId,ph,nextStatus){
  if(nextStatus==='picked'){
    const ok=await updateOrderStatus(oId,'picked');
    if(!ok){toast('Failed to update','error');return;}
    document.getElementById('r-map-sec').style.display='block';
    toast('🚴 Delivery started! Live tracking ON','success');
    if('geolocation'in navigator){
      const gpsOpts={enableHighAccuracy:true,maximumAge:5000,timeout:15000};
      const gpsFallback={enableHighAccuracy:false,maximumAge:10000,timeout:20000};
      const onPos=pos=>{
        const{latitude,longitude,heading,speed}=pos.coords;
        updateRiderLocationFirebase(oId,ph,latitude,longitude,heading||0,speed||0);
        updateRMap(latitude,longitude);
      };
      const onErr=err=>{
        if(riderW)navigator.geolocation.clearWatch(riderW);
        riderW=navigator.geolocation.watchPosition(onPos,function(){},{enableHighAccuracy:false,maximumAge:15000,timeout:30000});
      };
      riderW=navigator.geolocation.watchPosition(onPos,onErr,gpsOpts);
    }
    loadROrders(ph);return;
  }
  if(nextStatus==='delivered'){
    showProofOfDelivery(oId,ph);
  }
}

// --- PROOF OF DELIVERY ---
// UPI PAYMENT — PhonePe QR + Screenshot Confirm (replaces old COD POD flow)
const _UPI_ID='7702907454@ybl';
const _UPI_NAME='MAISA VIJAY KUMAR';
const _UPI_PHONE='7702907454';
const _UPI_QR_B64='iVBORw0KGgoAAAANSUhEUgAABDgAAAhrCAYAAAChqnyiAAAAAXNSR0IArs4c6QAAAARzQklUCAgICHwIZIgAACAASURBVHic7N15eJ1lnT/+T7qmSZvuG12gtKUbu1AsVBAoUBCBYcYBFAQcZlBZRJGfKC6gougX1EFkAJ0RUdGZkU3LUiiLUIFSdtpSoFC6b6FL0qRJmza/P/jqFyEnOUmTPOdOX6/r8sIrz32e55P7PEnzvM+9FNXX19cHAAAAQMI6ZV0AAAAAwM4ScAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkTcAAAAADJE3AAAAAAyRNwAAAAAMkT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fvGLcdVVVzXa7rHHHovy8vIYMGBAq1178+bN8Ze//CXmzJkTL7/8cqxcuTIqKytjxIgRMXTo0DjwwANj8uTJccABB0SXLq3/Z0xVVVXMnTs35s2bF6+99losXrw41q9fH+vXr4+BAwdG//79Y8yYMTFu3Lg44IADYt99941u3bq1+Hrz58+Pj33sY422WbhwYRQXF3+gzieeeCLmzp0bL7/8cqxYsaJd+2njxo3x9NNPx/z582PBggWxcuXKWLduXdTW1sbAgQNj2LBhMX78+Nh7773j4IMPjt12263Va9hZ7XWfd4S+AkiFgAPgfZa/viHrEv6mfMXmKF+xueWvX7450+k2hTJ6IyKibtuOeGdlVfTfrTTrUpJw8sknN/ngFxGxePHiVgk4tm/fHn/4wx/ixz/+caxe/cF7dsGCBbFgwYJ4+OGHIyLiQx/6UFxyySXxkY98ZKevHfHu9/Gb3/wmfv/73+fcHnTZsmWxbNmyePHFF//2tSFDhsTZZ58dn/jEJ1o16Hmv964VUVdXF3fccUdce+21sW7dB0clvb+fDjrooLjkkkti6tSprVLL66+/Hr/85S/jzjvvjNra2gbbVFZWxltvvRVPPPHE37523HHHxZlnnhlTp06NoqKiVqmlNbTlfd7R+gogBQIOgPdZtdgn/c1xzVkP5DxWXbG1IEZv/NWqxZsEHHnq169fHHroofHkk0822m7ZsmVx8MEH79S1qqqq4mtf+1rcc889eb/mueeei7POOisuvvjiuPjii1s8SqGqqir+4z/+I2644YYWvX716tXxgx/8IG688ca44oor4hOf+ER07ty5RefKZceOHRHx7sPw17/+9Wb107PPPhtnnnlmfPGLX4wLLrigxf1UWVkZ119/ffz85z9v0etnzpwZM2fOjOnTp8fll18ee+yxR4vO09ra4j7vqH0FkAJrcAC8j6kMzbNwzuqc/1v66vqsy/s7axZXZF1CUkaNGtVkm8rKyp26Rm1tbXz5y19u1kP7e11//fXx7W9/O+rr65v92iVLlsRpp53W4nDjvSorK+Pyyy+Piy66KCoqWvc+2759e9TW1sZll13W4n768Y9/HN/97ndb1E9vv/12nH766S1+YH+vBx54IE499dQmA4X21Jr3eUfvK4BCJ+AAeB8jODqu1W97b5ujtLTp0S5btmzZqWv8/Oc/3+ldKm677ba44447mvWaN954I84888yYN2/eTl37/e677744//zzY8OG1pvqtn379rj55pvjgQdyj5bKx6233trsgOSNN96Is846K+bPn79T136v9evXx6c//en485//3Grn3BmtdZ/vCn0FUOgEHADvs2ntzj2wUbg2rKnOuoSkbNrUdCDUo0ePFp9/wYIFce2117b49e/1rW99K8rLy/Nqu27duvjc5z4Xy5Yta5Vrv99TTz0VX/3qV2Pr1taZnjV//vz40Y9+1Crn+uY3v5l3+PLOO+/EBRdc0Cb9VFdXFxdddFEsXLiw1c/dXK1xn+8qfQVQ6AQcAO9TW1PXdCOStGXztqxLSEo+n0T36tWrxef/6U9/+oGvdenSJUaNGhXDhw9v1rmqqqrirrvuarJdfX19XHnllbFoUf67C5WWlsaYMWOie/fueb/mgQceiF/+8pd5t29Ma/ZTRUVFXqM46uvr49vf/na8/vrreZ97yJAhzeqnioqK+MY3vpFzAc72srP3+a7UVwCFTsAB8D5bqwUcHVV1ZeEseFroli5dmtf0jZEjR7b4Gu/dreS4446L//mf/4l58+bFo48+GrNnz46XX345brrpppg4cWJe57vtttuaXGNi1qxZce+99zZ5rl69esW3vvWteOKJJ2LevHkxa9asWLBgQcycOTMuuOCCvOr58Y9/HG+//XZebRvz7LPP/u3/t0Y//eY3v2myzWOPPZZXEHLooYfGrbfeGi+//HI8/fTTMWvWrJg/f37ce++9cfbZZzf5+rlz58add96ZV91toTXu812lrwBSIOAAeJ/aLQKOjmqLgCNvv//97/Nqt+eee+70tS6//PK46aabYvLkyVFcXPy3r5eVlcX06dPj9ttvz2ub02XLlsWSJUtyHt++fXv8+7//e5Pn2X333ePuu++Oc889N0aMGPG3rTo7d+4c48aNi8suuyxuv/32v6u1ITU1NXHrrbc2eb18tVY/LVq0KFasWJHz+I4dO/LqpwsvvDBuu+22+OhHPxplZWV/+3qXLl1i0qRJcdVVV8XPf/7zJnduueWWWzIbmbCz9/mu1FcAKRBwALyPgKPjMkUlP0899VTceOONTbabNm1a9OvXb6eu9clPfjLOP//8v4UIDenTp098//vfbzJQiIhG1ymYM2dOXp/WX3/99TF69OhG2xx66KHxve99r8lz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euCBB7y/JScna/78+cVWVuRv165dltdNBg4caEluZKlWrZqGDx9u+W3nzp3FXr6iKl++vPr166dx48ZZfp89e3aQSgQ4G/tU6eTm7e7xeLx9gUlSt27d1KhRI7Vu3dr726effhqMogEopUhwAIZYu3atZXjUqFGKiIjwadqQkBA9+OCDqlGjhve3JUuWKCMjw9Yy4vxyd7DWqlWrAsdt0KCBZTghIaFYymSHvn37qnHjxt7hVatW6ciRI0EsEeBs7FOlkxu3+/bt27Vp0ybvcFZLjRtvvNH72+LFi40+xwFwF15RAQyxe/duy3BhzV5zi4iIUL9+/fTjjz96f0tKSlLVqlV9mn7Xrl1as2aNNm3apJ07d+r48eOqVq2aGjRooFatWqlTp05q0aKFXz2/79y5U19//bV++ukn/frrrzp8+LAqVaqkBg0a6JJLLlGbNm3UsWNHhYWF+TS/nM1fb7zxRr322muSMr8+s379eq1cuVLff/+99u3bp6pVq6pevXq68sordeONN6p+/fpFLr+vKlWqZBlOT08vcNxTp05ZhqtUqVIsZbJDhQoVdOutt2rSpEne33bs2KGaNWsWOq1d2/7pp5/2voYlSe+++67atm1bpPUYO3aspZXUokWLLE8ZnSwjI0M//vij1q5dq++//16HDh3S4cOHVaNGDTVq1EitWrVSly5ddPHFFxc6L18/SxqM/fDs2bNau3atvvjiC23atEkHDhxQ5cqVddFFF6lDhw666aabvK96nTp1Si1atPBOO378ePXv39+v5dotkH0qi8fj0U8//aSlS5dq27Zt2rVrl0JDQ2073uV3TrjwwgvVsGFDtWzZUp06ddKll17q8zkhWMftHTt2aM2aNfrhhx+0a9cuJSYmKjo6WhdffLHatm2rTp06ldjrgYFud5PWJcvKlSu9/w4PD9fll18uSWrfvr3397S0NH3++ecF9ldSkJx15pprrtG//vUv7982btyoZcuW6aefftL+/fsVEhKihg0bqnXr1urcubNatmzpV90szuUAKBkkOABDnDlzxjLsT+uLkSNHFnmao0eP6pVXXtG7776b52/Jyck6cOCAvvzyS02dOlWdOnXSY489pr/+9a8+zXv37t2aMGGCpdPNLElJSTp69Ki+/fZbzZ49Ww0aNNCYMWN0zTXXFKn8WXE6duyYRo8enecrMklJSTp48KC++eYbvfTSSxo5cqSGDBmi8uXLF2k5voiKirIM//LLL7ruuuvyHTd3j/OxsbG2l8dOuW+MC3vqaPe2v/nmmy0Jjs8++6xICY5Tp07pww8/9A7Hxsbm+/qQE+3YsUOTJk3SF198kedvWZ+pXL16tV566SUNHDhQjzzyiM/JRF+VxH64efNmPffcc9q8ebPl98TERB08eFDr1q3TP//5T40bN059+vQJfKWKWVH3qZwSEhI0ZswYffbZZ3n+ljPOw4cP19ChQ4sU58LOCQcPHtSXX36pf/zjH7rmmmv0xBNPWFol+KIk6kt8fLwmT56sxYsX5/lbUlKSfv31Vy1dulRSZmehI0eOVLVq1Yq0Hv7wZ7ubui5paWl6//33vcM33XSTKleuLCmzw+LY2Fhv56qLFi0qcoIjP6mpqRo/fny+r+EeO3ZM69ev14wZM3Tdddfp6aef9rsvspJaDgD78YoKYIicr5dImc0+i9uWLVt066235nshm58vvvhCPXv2tPSWXpBVq1apW7du+d7g5mfPnj269957ffq8ak4ZGRlKSkrS4MGDffpE7iuvvKLnnntOHo+nSMvxRZ06ddSuXTvv8Lx58/K01JCkDz/80NKSoEePHsXassQO4eHhluGUlJQCxy2Obd+qVSs1adLEO7xo0SLv14N88eWXXyo5Odk7fPvtt6tMGeefAr/99lv16tUr3+RGfmbPnq3hw4crLS3N1nIU9374ySef6LbbbsuT3MgtNTVVjz/+uKVPAFMVZZ/K6fTp0xo0aFC+yY3c/vGPf+iZZ57xOc5FPSesWbNG3bt31/Lly30aP0tx15fNmzerZ8+e+SYE8jN//nz17t3b2/FzcSrqdjd5Xb777jvFx8d7h3Mm9ENCQtS9e3fv8Lfffqtff/01oOVlZGRozJgxPvUxtmrVKvXs2VNbt241djkAigctOABD5H6aPGHCBP373//Ok/iwy+7du3XXXXcpMTHR+1tMTIxuv/12xcbGqmrVqkpOTtauXbu0aNEi71OY1NRUPfTQQ6pcubKuvvrqfOe9ceNGDRs2zHITVbNmTfXu3VvNmzfXhRdeqPT0dB06dEiffPKJ5eZs7NixatGihc8tGjIyMjRjxgxt2rRJoaGh6tevn9q2basaNWooNTVVO3fu1Ntvv63ff//dO828efPUrl073XDDDUWKmS/uvvturVu3TlLmk9Dp06d7e873eDyaN2+enn76ae/49evXd8SnAk+fPm0ZrlixYr7jFde2L1u2rPr166dnnnlGUuZTy2+++cbnbZjz5qBcuXK6/vrrfZrOZHv27NH9999vSdzUqVNH/fv3V4MGDVStWjUlJSVp69at+ve//+3tAHf58uWaOXNmno5uA1Gc++HatWv10EMPWX5r0KCBbr/9djVr1kwVK1bUyZMn9eOPP2rRokWKj4/XmDFjVLduXdvWrzj4uk/lNmPGDP3www8+x3nBggW68sordfPNN593vr6eE3bv3q0PPvjAck544IEH9NZbb/n8SeHirC+//vqr7rnnnjzr0b9/fzVs2FAXXnihkpKStG3bNr3zzjs6ePCgd/2HDBmihQsX5mmNZ6eibHfT1yWr1YiU+ZrlFVdcYfn71VdfrRdffNE7vGLFiiK39sny559/6r333vMmL5s3b66ePXuqQYMGqly5sv744w9t2rRJ8+fP9z5YOHbsmO69914tXrxYtWvXNmo5AIqRB4ARTp8+7enUqZOnbt263v+uvvpqz5o1azzp6em2Lis1NdVzyy23WJY1YsQIz8mTJwscf+rUqZbx27dv7/njjz/yHbdbt26WcYcOHeo5ceJEvvPOyMjwzJo1yzL+Qw89dN7yP/TQQ95xO3To4GnYsKGnZ8+enj179uQ7flJSkufhhx+2LKNHjx6eP//8s5BIFV1GRoZn6NChlmWtWrXKc+LECc+IESMsv7dp08azfft228uQ24YNGyzLnTZtWpHnMW3aNMs8vvjiizzjFPe2P3TokGXcwYMH+1T2/fv3W6Z75JFHfFtpH9gR25zWrVtnmd+sWbMKHHfs2LGWcSdOnOhJSUnJd9z9+/d7Onfu7B23YcOGnn379uU7bu79qyAlsR8mJiZ62rdvb5lmzJgxntOnT+c7fkJCgicuLs5Tt25dT+PGjS3TzZs3r8DlFFVJ7VMejzXOWetU1Dh369btvOcRf84J//jHPyzjt27d2nPkyJECl1ES9SU1NdXTo0cPyzQvvfRSgfvFyZMnPY888ojPx6CS3O7FvS6BSkhIsOxjY8eOzXe8nj17WrZ7amqqz8vIWWdy/jdjxowC53Po0CHP3//+d8v4gwYN8mRkZAR9OQBKhvPb5wIuER4ergkTJqhcueyGVXv27NE999yj7t27a/bs2fr1119tebViyZIllqbeXbt21YQJEwr8aktoaKgefvhhPfjgg97fDh48qCVLluQZd+/evQoNDfUOd+nSRVOmTNGFF16Y77xDQkJ0//33W578LVu2LN9XO/Jz4MABRUdH67XXXivwNY/KlStr/PjxllccfvzxR+3bt8+nZRRFSEiIxowZo5iYGO9vjz32mG677bY8fUC88847hX4G2ARpaWl5mkfn1w9LcW/7WrVqqUePHt7h5cuXW5pHFyR3E/hbbrml0GlMl5GRoWXLlnmHW7Vqdd6+NerUqaNXX33VO3zRRRfpt99+s608xbUfLly40PtUWpJ69eqlp59+Ok8z/yzVqlXTxIkT1bFjR9tfw7GTr/tUftPVqVOnyHH++eefLa0hcvPnnBAXF6dhw4Z5fzt+/LjPnz0trvqyePFiS0fbTzzxhEaNGlXgfhEREaEJEyZY+v/5+OOP9dNPP/m0HkVVlO1u+rp8/vnnln2sa9eu+Y7397//3fvvAwcOaMOGDQEtd+jQoXrwwQct55qcatWqpZkzZ1paAq5YsULr1683cjkA7EeCAzDIlVdeqTfffDPPaynbtm3TCy+8oC5duuiaa67R+PHjtWLFCh07dqzIy0hPT9fcuXO9w+XKldPo0aML7XQwJCREgwcPVrVq1VSnTh3dd999+X6RoUmTJlq0aJG++OILvfDCCxo7dqxP8875SbmsVxh8NXTo0EKb4VauXFn33HOP5bfieke5Zs2amjp1qjdZdeLECctXcvr06aMFCxYY3+9GlrfffttS/m7duikyMjLPeCWx7XMnJ1avXn3e+WdkZFj6Y6hfv36Rv75iouTkZO8rJ1LmK245k6P5iY2N1YIFC/TVV19p9erVBb5i5i+798O0tDRLx7JVqlTRY489VmhHkxUrVjT+tS9f96n8+Bvngvo/COScMGzYMDVq1Mj727x583w+L9ldX9LT0/XWW295hzt06KD777+/0HJUqFBBTz75pOU3X/u7KCpft7sT1iXnfGvVqlXgF6k6d+5sGf7000/9XuZFF12kBx54oNDxIiMjNWrUKMtvixYtMm45AIoHCQ7AMB07dtQnn3xS4OcMf//9d82ZM0eDBw/W3/72Nw0cOFAff/yx5T3889m+fbvlAvHuu+/2+bNyVatW1bJly/Tll19q7Nixlg41c6tXr57uuOMOn3sW/8tf/mIZLkoHkh06dPBpvEsvvdQy/Mcff/i8jKI6fvx4vu9WP/7445o4caLPn+8NpnPnzmn+/Pl67rnnLL/fd999552uOLd9u3btVKtWLe/wokWLztuqacuWLZYOe/v27VssX9ApaRUrVrQ8Wdy2bZtPrbvatWuniy66qFg+a2j3frhlyxZLC5377rsvT10pSGxsrM/9QZQkf/epnPyN84kTJ/IdL5BzQlhYmIYMGeIdTktL8/ZBVBi768uOHTu0Y8cO7/Ddd99daNIvy8UXX2zpl2f16tV+fcmsIEXd7iaviyT99ttvls9H33bbbQW2dIiKirK0vFu8eHGBdbEw/fr18/mT6v/3f/+nyy67zDv86aef5vlaXbCXA6B40MkoYKDo6GiNHz9e999/vz799FN9/PHHBT59W7VqlVatWqWoqCjFxcWpV69eBV5oSLI0eZWkq666qkhlq1mzZpHG99XOnTstw+np6T5NFxoa6nOnXrk/m5e7szc7pKamavLkyfrXv/6V79+XLl2q3r17q3r16rYv21dHjhzJUw+ynDt3TqdOndIvv/yipUuXejsSzDJs2DC1atXK1vIUZduHhoaqb9++evnllyVl1uft27cX2Clt7q87FEfHssFQrlw5de7c2fuayvr16zVnzhzde++9Klu2bImXpzj2wy1btliGz5dQzc/111/v89dlAlVS+1RxxDnQc0LuFlEbNmyw3NDmpyTWo02bNj7NP0vHjh21YsUKSdL+/fu1f/9+1atX77zTFNd2D8a6FEXu1/66dOly3vG7d+/ufaU1LS1Nn3/+ueXVFV/5mhSTpDJlyqhz587eWKampurXX3+1JCOCvRwAxYMEB2CwevXqadiwYRo6dKh2796t77//XmvXrtV///tfpaamWsY9evSonnrqKS1dulRTp04tsOlv7vfumzdvXmzlz09ycrKOHj2q//3vf/rf//6n+Ph4bdy4Mc+rBr72NRIZGenz0+jcT+7//PNP3wrto+PHjysuLi7PE8yWLVt632//+eefNWLECM2cObPAfgSK2/z58336/F1uAwcO1MMPP+z3cu3a9jfccIM3wSFlvvecX4IjJSXF8nrKDTfc4HOrEie4++67Lf1wvPDCC/rss8902223qWXLlmrYsGGJtVYpjv0wd58RTZs2LVKZ/P1agz9Kap8KJM4FJQ4DPSfExMSo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jHD0zUjnzp0trWVmzpyp11577bzrdPjwYT3//POaM2dOnr/NmTOnRL8AYYdgbfvIyEhLgmHNmjWWDvluuukmv+ftq0suuUR33XWXdzgtLU1Dhw71+QJ57969evDBB/XLL794f7vssst0yy23FDhNSkqKPv/8c6WlpSk5OVnTpk0r9Kn7J598YukroXPnzkH52kVRDB482DI8depUvf766wXWmVOnTum5554r0hNY+HdOOHjwoB566CHLb3FxcUGtU/fff7/33+np6XrooYcKbeHk8Xg0a9YsbdiwQVu3btWrr76qd999N+ivCJq0Llu2bNHPP//sHb755pv9ThxHRkbqhhtu8A6vW7dOu3bt8nn6J598stAHQP/+978tDxoiIyMtLUdMWg4A+5HgAAwxYsQIy2dBN2/erO7du2v69OnavXt3nv41/vzzT+3YsUP//Oc/1bVrV8uNS0xMjIYOHVrgsho3bqzHH3/cO5ycnKwBAwZo/vz5eV41SE1N1fLly3XnnXdaLq569eqlK6+8Ms+8c/Z3cOzYMQ0YMEArVqzIc0Ny4sQJffDBB+rRo4e2bNmS7+s0ThEREeH9ek2WyZMnq3v37po1a5a+/PJLbdq0Sd98843ef/99PfLII+rUqZPmzp2b7/xWrFhhaY3jFMHa9jkvKN98801vL/+tWrVS8+bNA5q3r0aNGmV5ch0fH68777zT26fOuXPn8kyze/duvfbaa7rlllssr9VUq1ZNkydPPu9nbbt06WI5Xrz55pt6/PHH87ymJmUmJ1955RXFxcVZfu/bt2+R1jEYGjdurKefftry28SJE9WrVy/NnTtXX375pX744Qd9/vnnmjZtmm666Sb95z//Ubly5Qr8XDHyKso5ISUlRZ999pnuuOMOyznh1ltv1XXXXVdiZc5PbGysRo4c6R3evXu3evXqpTlz5uTpwNfj8WjLli169NFHNXnyZO/v5cqV05AhQ0qszAUxaV1yvoIhKeDtfOONN553/vm54IILdO211+rgwYO67bbbtGTJkjxfdImPj9ekSZP0zDPPWH4fPXq0LrjgAp/KVlLLAVB8+IoKYIioqCjNnj1bAwcO9D75TkxM1JQpUzRlyhRFRkaqYcOGqlKliv744w/t3bs3309SRkZGaubMmZabn/wMHDhQ+/bt0zvvvCMp88nnmDFj9Oyzz+rSSy9VjRo1lJSUpE2bNuV5n/eKK67Ic9ORpXfv3lq2bJm3X4UdO3Zo8ODBCg8PV+PGjVWtWjXFx8dr165d3ifO9evX19ixY3XvvfcWLWgGue666zR58mSNHj3au16//PKLJkyYUOi0devW1eTJk/XGG294O8p89dVX1axZM3Xt2rVYy22nYG37Nm3aqG7dutq3b5+lFUOfPn1K7ClsRESE3njjDcXFxVmSFVn96oSFhalBgwaKjo5WYmKifvvtNyUmJuaZT61atTRz5sxCvxZStWpVPf/88xo0aJD3t0WLFmnRokWqWbOmGjVqpNDQUB04cMDSeW2W4cOH+/z1gmAbMGCAEhISLEm/rVu3auvWrQVO8/TTTwetLwinCuSc0KFDB40bNy4on4fNbciQITp06JD31bfExESNHz9e48ePV5MmTRQTE6OUlBTt2rXL0uoxy8SJE/N08hksJqxLamqq3nvvPe9wlSpVAt632rdvr/DwcCUnJ0uS3nvvPQ0aNOi8X2SpUqWKXnjhBf388886cuSIHn74YYWHh6tZs2a68MILdfjwYUsrkyz33nvveVvDBWs5AIoPCQ7AIC1atNC7776r8ePH5/nu/bFjx/K9gMnpmmuu0bPPPmv5vGJBypUrp+eff161atXSK6+84v09PT1dP/zwQ4HT9enTR2PGjFGVKlXy/XvlypU1Y8YMDR482NKqJDk5Od9+CerXr6833njD8iUSp+rdu7eaNGmiSZMmad26dYWOHx4ergEDBmjAgAGKjIxU7dq1tWXLFm/i6rHHHlPDhg2L7ROndgvWtq9QoYL69u2riRMnen8LCwsr8afJkZGRmjt3rmbNmqXp06dbki2pqanavn37eb+G0KNHDz3++OM+t2jp0qWLpk2bpkcffdRyw3nkyJE8T3izhIaGatSoUZbm76YrU6aMRo0apWbNmmnixIk6ePBggeOGhobqySef1J133nne8ZCXv+eE22+/XaNHjy72vm58Vb58eY0fP1516tTJ04rnl19+sbwKltMFF1ygiRMnGpVUNmFd1q1bZ3mY0qNHD1WuXDmgeUZERKhHjx5asGCBpMyOOjdu3Kj27dufd7qoqCjNnDlTd999t06dOqXk5OTzdlIdFxenuLi4Iie6S2o5AIpH8FPtACzq1aunWbNmad68efr73/+ep/PG3MLDw/X3v/9d8+fP19y5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0rlzZ0/Lvffee+X//u//HKe9+eab8l//9V8iYm7bNeaVV16R2267rcHno0aNkscee8zTMk1ss/vvv1+eeuop1+XfcccdzWrT0aNH5bvf/a5s2LDBcfrvf/97GTFiRLOWKWJuG73//vvy3e9+Vw4cOOA4fd68eTJ8+HDjf1dE5L333pOrrrrKcVpxcXGDz+hrnTU1Lifr3r27nHXWWdKjRw/p16+fXHDBBdKrV69m/20AsBl3cABAIxYvXizHjx9v9nzLli1rgdbUKisrkxdeeKHR31m1apV88cUXLdYGN2VlZfLEE09IXl6e3HjjjTJ79mz5xz/+IZ999pmUl5fLgQMHZNu2bfL666/LE088IbfddptceOGF8sgjj8iePXt8/+0g43LllVe6TluzZo2nZVZUVMiLL77oOO3iiy8+UdwIK1Pb7M4775TU1FTHaXPmzJEdO3Y0q12vvvqqa3Hjsssuk8suu6xZyzNpx44dcvvtt7sWNx566KGI4kZY0Nee3o4dO2TTpk3y7LPPyowZM+Tyyy+XSZMmSUFBQav8fQAIAwocANCILVu2yAcffNCseXbv3i0vvfRSC7VIZPXq1XL48OHT/t5rr73WYm1wsmnTJrn66qvll7/8pezbt6/J81VUVMicOXNkzJgx8tZbb3n++0HHZciQIRIb63xj5Msvv+xpmRs2bJCKigrHaWPGjPG0TE1MbbPOnTvLvffe6zjt0KFD8vvf/77JbTp8+LDMnj3bcVpsbKz89Kc/lZiYmCYvz6SysjK58847XU+op0yZIuPHj2/lVplBX+vNq6++Ktdcc43rHUwAEG0ocADAaaxYsaJZv+/2mIIpTT2gX7Jkiacrol6sXbtWrr/+evnss888L+PLL7+UG2+8UVatWuVp/qDjkpaWJldccYXjtFdeeUX+9a9/NXuZjZ04DRkypNnL08bkNrvmmmtkwIABjtOeeuqpJp88v/jii1JYWOg47fbbb5evfe1rTVqOaYcPH5Z7771XNm/e7Dj9mmuukR/96EeBFV9MoK/1pqamRu6//37561//GlgbAEALChwAcBpLliyR6urqJv/+0qVLW6wte/bscTzodrpzoKCgQD788MMWa0udkpISueOOO+TQoUOuv3POOefIRRddJP369ZMzzjjD9fdqamrkhz/8oZSUlDSrDVriMnr0aNdpq1evbtayqqqqXG+Pv/zyy6VLly7NWp42prdZu3btZNq0aa7TZ8+efdqT0IqKCte7N8455xyZNGlSo/O3lOPHj8svf/lLWb58ueP0iy66SGbOnOl6B1FY0NfWGjp0qFx66aUn/hs6dKj0799fkpKSGp1v6tSprdLnA4BmFDgA4CTx8fENPtuxY4e88847TZr/s88+k7Vr1zb4vFOnTr7bJiLyxhtvOH7u9nK+lStXGvm7jXniiSdcH0m55ZZb5I033pDVq1fL008/Lc8995wUFBTIyy+/LDfccIPjPOXl5c1+aZ+WuAwePNj1hanNfUzlnXfekf379ztOGzVqVLPbpk1LbLN+/frJTTfd5Dht+fLljvvmyRYvXizbtm1znPbTn/5UUlJSTtuGljBv3jzXfaJXr17ym9/85rQnv9rQ17p78skn5Y9//OOJ/xYsWCDPPvusbNq0SRYtWiQXX3yx67xz58411g4ACCMKHABwksGDBzveYeB25fRUTo8UJCUlSV5enu+2iYjjFf3Y2Fi58cYbHa8sLlq0SI4cOWLkbzspKytz/YaPe++9V6ZPny4ZGRkRn8fExEivXr1k5syZcv/99zvOu3DhwkbvCDmVlrgkJSXJtdde6zjt1VdflS+//LLJy3J7VCc+Pr7RE5ywaKltNnnyZNdvrPn1r38tNTU1jtP2798vc+bMcZx2ySWXBFZUevnll2XWrFmO07p06SJz5871/A09QaKvbb74+HgZMGCAzJs3z/VFty+++KLvFzYDQJhR4ACAk8TFxTl+A8Fzzz0n5eXljc57/PhxefbZZxt8PmzYMElISPDdti+++MLxquJFF10k55xzjuNJ7/bt212f2Tfh448/dn0J3/XXX3/a+SdMmNCgACJS+6jA559/3qQ2aIvLyJEjXac19TGVw4cPy/PPP+84bcyYMdKxY0dPbdOiJbdZYy8cfffdd13fq/DMM8+4nhjee++90rZt29P+bdM2bdokP/rRjxynJSQkyOOPPy5f/epXW7lVZtDXehcfHy8//vGPXaf/85//bJV2AIBGFDgA4CTV1dVy0UUXNfj8wIEDp/2qz8LCQscXGQ4ePLhZz5W7cXuhXt0VS6d2i9S+4LKllJaWuk5ryi3zcXFxcvfdd8vPfvazBv8lJiY2qQ3a4nL++efLOeec4zitqS8t3LRpk+zdu9dxWn5+vue2adHS2+yqq66SCy+80HHab37zmwbfTLN792554oknHH//1ltvlezs7Cb9XT/atIk8JCsuLpbbb7/d9U6mRx99VPr379/i7Wop9LX+ZGZmSnp6uuM0Ly80BgBbUOAAgJMcPnxYzj//fMdpL774YqPz/uMf/3D8vH///q63xTeH2wv16k5yLrjgAsfpS5Yscf2qUb/i4uJcp23atKlJyxgzZoz84Ac/aPCf050dTrTFpV27dq6PqaxatapJL1B1O8FKTk52PXEPk5beZrGxsTJ16lTHaZ9//rksXrw44rM///nPcuDAgQa/26VLF/nBD35w2r9nwsl3iJSXl8tdd90lu3fvdvzdBx54IPSFLvpaf2JiYlwLHG7v7gGAaECBAwBOcvjwYenRo4fk5OQ0mLZs2TLXE47q6mrHW6YzMjLkvPPOa9b7JJx88sknji/fS0hIkKysLBGpvaKXmpra4Hf2798vb7/9tq+/76axb/K455575K233mrRr0/UGhe35+NFTv+YSnV1teu3p1x99dWhe5nkqVprm/Xp00duueUWx2lz5syRsrIyERHZuXOnzJ8/3/H3fvrTnzq2w7TY2NgTX+969OhRmTFjhhQUFDj+7q233ur6osswoa/1z+2RqsYKzwBgOwocAHCSuoNjt6ujTi+2E6l9tv+LL75o8Hl+fr60adPG9T0VTeX2wsnhw4dL+/btRaT2uWy39z809dGI5urZs6fr4xjbtm2TCRMmyLe//W1ZtGiRbNu2zXixQ2tcsrKyHE/cRGpP3hpTUFDgepfHiBEjfLctaK25zW6//XbHItyePXtkyZIlIlL7Qlun/XPQoEEyduzYJv8tP+rWW0RkwYIFrncQXHnllXLPPfecKIaEGX2tP8XFxa7f+BP2r5AGAD8ocADASeoOjgcPHuw4/bnnnnP83O2W6brlVFVVeW7T8ePHXf/uqd8Y4PbtGs8//3yj78vwKjY2Vn74wx82+jsbNmyQe+65R4YMGSKXXXaZPPjgg/L88887nqQ0h+a4xMTEuD6m8uabbza67m6Pp3Tp0sX11viwaO1tlpqaKj/72c8cpy1YsED27Nkjf/nLXxyn33vvvY7fltES6r4yddOmTfLQQw85/s6FF14os2bNknbt2rVKm1oafa13NTU1Mnv2bNfpmZmZLfr3AUAzChwAcJLKykoREcnOznb86sUNGzbI1q1bIz6rqKhwvGU6ISHhxDPbfq4qfvDBB44v1BORBs+wDxgwwPH3ampq5M033/TchsZcffXVTfrGFJHa278XLFggd911l1x88cVy1VVXyZ///GdPJwTa43LppZe6Tnvrrbdc2+P27SnXXnvtiRPhsApim40ZM8bxpZBffPGF/OQnP3H8xo7vf//70q9fvyb/Db/i4uLk4MGDct9997n+zte//nXHr1UNK/ra5qupqZHNmzfLHXfc4RgHEZF+/frJeeed1yJ/HwDCgAIHAJyk7rbp+Ph4GTNmjOPvnPqG/02bNjm+1O3yyy8/cULi56D71Vdfdfz8q1/9aoMD2c6dO8vQoUMdf9/ttne/2rZtKw888IDcfffdzZ73vffek5///OdyySWXyJw5c06c9DSF9rhkZGTIJZdc4jjN7R0bhYWFsn37dsdpTl+pGTZBbLPGXjjqdCKampoqU6ZMafLyTWjXrp387ne/cz25Fql9EarbYxthRF/r7rbbbpObb775xH833XSTXHfdddKvXz+5+uqrZfny5a7z3nHHHVY8wgQAXlHgAICTHDly5MT/u12BP/URgvXr1zv+3snvSzh69Kin9tTU1LheqRs1alSDr5Y89e+e7PXXX/f9WIibuLg4ueOOO+Tll1+Wq666qtnzV1RUyCOPPCLf+ta35NNPPz3t74clLm7vcFi7dq3jezbcXlD4la98Rfr06WO0ba0tyG2WnZ3d5G9Dufvuu+Wss85q8rJN2Llzpzz55JOn/b377rvP9cWSYUNf627VqlXy2muvnfhv1apV8s477zh+08/Jvv/97zd65xgARAMKHABwkpMPugcMGOD4srbXX3894rZ2p3cmJCQkRDxbfuzYMU/tee+991xfJDdkyBDHz93uGhBxf3GfKb169ZJHH31UVq9eLbNmzZIRI0Y067GK999/X2677bbTfpVqWOIyZMgQ1/c4OBUzVqxY4fi71157bau9D6KlBL3NbrvtNtev1azTr18/13entKSmfrVpSUmJPPTQQy36zUSthb7WrJtuukmmT5/O3RsAoh4FDgBwER8fL+PGjXOcVncr+e7du+X9999vMP2aa66RlJQU321wu2U6PT1dvvGNbzhO69atm+ut00uWLGmVk6NzzjlHxo8fL7///e9l8+bN8uyzz8p///d/y5gxY077NaeffPKJTJ8+vdETlbDEpVOnTjJ69GjHaW+88UbEzzt37pRNmzY5/q5bu8Mk6G125plnur5wtM7PfvYzFe85+d73vuf6FbdLly51fRFmWNHXete3b19ZsGCB/PznP+frYQFARMJ9OQgAWtjIkSNlzpw5DT4vKCiQQYMGuT4zf/nll/v+24cPH3Y9kTly5Eijt9wXFxc7fl5QUCAffvihZGVl+W5fUyUmJkr//v2lf//+8r3vfU8qKipkw4YNsnDhQtdvRFi1apVs3ry5wYv9RMIXl9GjRzs+k79ixQqpqKg4UfBxK27k5OS06vZqCVq22ejRo+Vvf/ub40ter732Whk4cGCTl9VSrrrqKpk+fbpUV1fLm2++KR999FGD33nggQfk/PPPl4yMjABa2DLoa7256aabrCiAAoApFDgAoBE5OTmSk5PT4Mrhhg0b5NZbb5X33nuvwTxnn3225Obm+v7bGzdulN27dztO27Nnj+dboF999dVAT5iTkpJk6NChMnToUHnxxRfljjvucPy9jRs3OhY4whaXvLw8SU5ObvBtHS2JvhQAACAASURBVIcOHZJ//vOfJ26vd3v/xtVXX238tvO5c+fKH/7whwafT5gwwdPLYk9HyzZr27atZGZmOhY4NHy15vDhw+Xhhx+W+Ph4iY+Pl4ceesjxzoby8nK5//77Zd68eU362tjGHm+qrq5u1pV/t69h9fsNL/S19T7++OMG22Ty5Mny0ksvNfjdRx99VIYPH37aO+MAIFrwiAoANCImJsbxBOOtt96SQ4cOycaNGxtMu+6664zc5u72Pga/Fi9eHPH8u1fl5eWyZs2aBv+53Yng5IorrpDvfOc7jtPcvk1Ee1xOlZSUJNdcc43jtA0bNohI7TsY3O5m+eY3v2m8TUePHpX9+/c3+M/r+ju9gPFkYdtmQRg0aJD8+te/lsTExBOfDRgwwLUA+MYbb8hTTz3VpGU3dvL75ZdfNqudbu/H6dq1a7OWcyr62sa5fbPP559/LosXLzbyNwDABhQ4AOA0nN5Kf+jQIdm0adOJE9STub1ZvzkqKirk73//u+/lONm+fXuzihBuDh48KOPHj2/w32233dasbzI499xzHT93WkYY4uJk5MiRjp/XXRn++OOPHb8dY9CgQa7x8cPthNft6nyduq/2PFVj70AI6zZrbb/97W8lOTm5wee33367ZGdnO87zi1/8QgoLC0+77M6dO0vHjh0dp61evbpZ7XzllVccP3drY3PQ17rLzs6Wb3/7247Tfvvb30ppaamRvwMAYUeBAwBO45xzzpHhw4c3+Pwvf/lLg28/yMrKkt69e/v+m2+//XaDRxpMMnHFMi0tzfHW9z179rh+naOToqIix887d+7c4LMwxMXJ+eefL927d2/weUFBgZSUlMg///lPx/ncvmbWrzPPPNPxc6eXOJ5s69atzVqeSHi3WWtzi2FSUpLMnDnTcVpNTY1Mnz5dKisrG112bGys69eHPvbYY7Jr164mtXHVqlWu8TbxqAh9beNuvfVWxz5337598uc//9nY3wGAMKPAAQBNcOWVVzb47OWXX27w2XXXXWfkfQnLly93/Lxjx45SVFQkxcXFTfrP7QV8S5YskYqKCl9tjI+Pd/2GkAcffFB27tx52mW8+eabsmTJEsdpvXr1avBZGOLiJC4uzvXrRwsKClzfv+H29ZR+ff3rX3f8fNOmTfLuu+86Ttu3b58sWrTIcVpOTo7r3wrrNtOkf//+8sMf/tBx2nvvvSePPfbYaZcxZswYx8/37Nkjd95552m/mnndunXyk5/8xHFafHy8awGluehr3Z177rly0003OU578skn5YsvvjDydwAgzChwAEATDBkypEkvcTNxkF9WViYvvPCC47Qrr7xSEhISmrys/Px8x8/379/velLdHFdccYXj5x999JFce+218te//lX+9a9/RUw7fvy4bNu2TWbPni0333yz4/wJCQmSl5cX8VmY4uLksssuc/z8zTfflFWrVjX4fPjw4ZKent4ibcnMzHS8o0RE5Ec/+pGsXbs24mt6P/nkE7nrrrscX8QYGxsr/fv3d1xW2LeZJj/4wQ+kT58+jtPmzJlz2hhccsklMmjQIMdp77zzjlx55ZXyhz/8QT766COpqKiQmpoaKSsrk3fffVceeOAB+c53viP79u1znH/y5MnSpUuX5q2QC/raxt10002O7Tp8+LA8+eSTxv4OAIQVBQ4AaIKUlBS5+uqrG/2dIUOGSI8ePXz/rdWrV8vhw4cdpzX36wAvuugi129QWLZsWbPbdqphw4a5Pgf/5ZdfytSpUyU3N1cuvfRSueGGG+T666+Xiy++WIYMGSK//vWvG9x2Xmfq1KkN3hkQprg4yc7OdrzTYeHChXLgwIEGn7sVj0yIjY2V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j4ADAAAAAABYHgEHAAAAAACwPAIOAAAAAABgeQQcAAAAAADA8gg4AAAAAACA5RFwAAAAAAAAyyPgAAAAAAAAlkfAAQAAAAAALI+AAwAAAAAAWB4BBwAAAAAAsDwCDgAAAAAAYHkEHAAAAAAAwPIIOAAAAAAAgOURcAAAAAAAAMsj4AAAAAAAAJZHwAEAAAAAACyPgAMAAAAAAFgeAQcAAAAAALA8Ag4AAAAAAGB5BBwAAAAAAMDyCDgAAAAAAIDlEXAAAAAAAADLI+AAAAAAAACWR8ABAAAAAAAsj4ADAAAAAABYHgEHAAAAAACwPAIOAAAAAABgeQQcAAAAAADA8gg4AAAAAACA5RFwAAAAAAAAyyPgAAAAAAAAlkfAAQAAAAAALI+AAwAAAAAAWB4BBwAAAAAAsDwCDgAAAAAAYHkEHAAAAAAAwPIIOAAAAAAAgOURcAAAAAAAAMsj4AAAAAAAAJZHwAEAAAAAACyPgAMAAAAAAFgeAQcAAAAAALA8Ag4AAAAAAGB5BBwAAAAAAMDyCDgAAAAAAIDlEXAAAAAAAADLI+AAAAAAAACWR8ABAAAAAAAsj4ADAAAAAABYHgEHAAAAAACwPAIOAAAAAABgeQQcAAAAAADA8gg4AAAAAACA5RFwAAAAAAAAyyPgAAAAAAAAlkfAAQAAAAAALI+AAwAAAAAAWB4BBwAAAAAAsDwCDgAAAAAAYHkEHAAAAAAAwPIIOAAAAAAAgOURcAAAAAAAAMsj4AAAAAAAAJZHwAEAAAAAACyPgAMAAAAAAFgeAQcAAAAAALA8Ag4AAAAAAGB5BBwAAAAAAMDyCDgAAAAAAIDlEXAAAAAAAADLI+AAAAAAAACWR8ABAAAAAAAsj4ADAAAAAABYHgEHAAAAAACwPAIOAAAAAABgeQQcAAAAAADA8gg4AAAAAACA5RFwAAAAAAAAyyPgAAAAAAAAlkfAAQAAAAAALI+AAwAAAAAAWB4BBwAAAAAAsDwCDgAAAAAAYHkEHAAAAAAAwPIIOAAAAAAAgOURcAAAAAAAAMsj4AAAAAAAAJZHwAEAAAAAACyPgAMAAAAAAFgeAQcAAAAAALA8Ag4AAAAAAGB5BBwAAAAAAMDyCDgAAAAAAIDlEXAAAAAAAADLI+AAAAAAAACWR8ABAAAAAAAsj4ADAAAAAABYHgEHAAAAAACwPAIOAAAAAABgeQQcAAAAAADA8gg4AAAAAACA5RFwAAAAAAAAyyPgAAAAAAAAlkfAAQAAAAAALI+AAwAAAAAAWB4BBwAAAAAAsDwCDgAAAAAAYHkEHAAAAAAAwPIIOAAAAAAAgOURcAAAAAAAAMsj4AAAAAAAAJZHwAEAAAAAACyPgAMAAAAAAFgeAQcAAAAAALA8Ag4AAAAAAGB5BBwAAAAAAMDyCDgAAAAAAIDlEXAAAAAAAADLI+AAAAAAAACWR8ABAAAAAAAsj4ADAAAAAABYHgEHAAAAAACwPAIOAAAAAABgeQQcAAAAAADA8gg4AAAAAACA5RFwAAAAAAAAyyPgAAAAAAAAlkfAAQAAAAAALI+AAwAAAAAAWB4BBwAAAAAAsDwCDgAAAAAAYHkEHAAAAAAAwPIIOAAAAAAAgOURcAAAAAAAAMsj4AAAAAAAAJZHwAEAAAAAACyPgAMAAAAAAFgeAQcAAAAAALA8Ag4AAAAAAGB5BBwAAAAAAMDyCDgAAAAAAIDlEXAAAAAAAADLI+AAAAAAAACWR8ABAAAAAAAsj4ADAAAAAABYHgEHAAAAAACwPAIOAAAAAABgeQQcAAAAAADA8gg4AAAAAACA5RFwAAAAAAAAyyPgAAAAAAAAlkfAAQAAAAAALI+AAwAAAAAAWB4BBwAAAAAAsDwCDgAAAAAAYHkEHAAAAAAAwPIIOAAAAAAAgOURcAAAAAAAAMsj4AAAAAAAAJZHwAEAAAAAACyPgAMAAAAAAFgeAQcAAAAAALA8Ag4AAAAAAGB5BBwAAAAAAMDyCDgAAAAAAIDlEXAAAAAAAADLI+AAAAAAAACWR8ABAAAAAAAsj4ADAAAAAABYHgEHAAAAAACwPAIOAAAAAABgeQQcAAAAAADA8gg4AAAAAACA5RFwAAAAAAAAyyPgAAAAAAAAlkfAAQAAAAAALI+AAwAAAAAAWB4BBwAAAAAAsDwCDgAAAAAAYHkEHAAAAAAAwPIIOAAAAAAAgOURcAAAAAAAAMsj4AAAAAAAAJZHwAEAAAAAACyPgAMAAAAAAFgeAQcAAAAAALA8Ag4AAAAAAGB5BBwAAAAAAMDyCDgAAAAAAIDlEXAAAAAAAADLI+AAAAAAAACWR8ABAAAAAAAsj4ADAAAAAABYHgEHAAAAAACwPAIOAAAAAABgeQQcAAAAAADA8gg4AAAAAACA5RFw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NGigixcvSpL69u2rN998M/3xDz/8UDNmzMhxPV5eXrr33ntVunRpVa9eXUFBQWrYsKG8vb2zfI7ZsTRr1iy1atUqj1uDNM7cbwXBXbdnzZo16t27t01Zhw4dNG3aNKe8HmyZfS46d+6sDz74oIBqlLPg4GBD64oZM2aYhhTSzTE2pk+fblM2YsQIvfrqq+l/X758WfXq1VNSUpLNcpGRkSpTpoyDag7gVuFV0BUAAMBZDh06lB5uSFJAQECe1pOSkqKEhAQlJCRo165dmjdvnipUqKBJkyapdu3ajqouHOxW22+u3p69e/caylavXq2pU6eqUKFCDn89V/n222/1zz//2JQ1btxY/v7+BVQj13DH7T516pShrF69ejZ/Fy1aVG3bttWyZctsyjdu3KiePXs6tX4ArIeAAwBwy8o82n7JkiUdtu4jR46oY8eOGj9+vIKDgx22XjjXrbbfnLk9tWvX1ty5c23KWrdubelwQ5I+/vhjnT592qZsyZIlt3zA4Y7bfeTIEZu//fz8VLlyZcNyjRs3NgQca9euJeAAYMAYHACAW9a6dets/nZkwJFm9OjR2rp1q8PXC+e61fabM7bnySef1JQpU1StWjUFBASoV69eGjt2rENfA/9eycnJiouLsylr1aqVbrvtNsOyjzzyiKFs165dOnv2rNPqB8CaaMEBALglnTp1SgcPHrQp8/Pzy/F5bdq00VtvvWVT9ueff+rEiRNaunSp6ej9w4cP1/r16+Xj45O/SiPPbrX95g7b4+HhoWeffVbPPvusQ9YHZPTbb78Zyho1amS6bEBAgCpUqGBo8fHTTz/pgQcecEr9AFgTLTgAALek3bt32/zt7+8vX1/fHJ/n4+OjgIAAm3+VKlVS69attWDBAtMm0efOnVNERITD6o7cu9X22622PUBmv/76q6Esq7FkPDw8VL9+fUP5oUOHHF4vANZGCw4AeXbixAk9++yzunDhgk15nTp19Pnnn6tIkSKSzGeTWL9+vcqXL6+UlBRt3LhRq1ev1v79+/XHH38oICBAdevWVevWrVW3bl2765OYmKjNmzdr+/btOnjwoM6ePasbN26oZMmSqlatmho2bKimTZuqaNGips/fvXu36Z3KrEZqP3z4sJ588kmbsgYNGmjJkiWm6584caKhP3vFihW1Zs0aeXh4SHLde5WTf/75Rz/++KO2bt2qAwcO6JdfflFiYqICAgJUunRp1atXTw0bNlSFChXsXuevv/6qyMhI7d+/XzExMUpISFBycnJ6n+s6deqoefPmDutGsnnzZpu/K1WqlO91enl5afDgwQoPDzfcfdyxY0eWMwVkduPGDe3cuVMrV65UXFycTp48KX9/fwUGBqp169aGQfayk9/PfRpXffauXLmiTZs2afv27YqOjtbZs2fl5eWlsmXLqmbNmmrUqJGCgoJ0++23273OnOR1vxVEXe2Rm+0x269ff/21goKCdPz4cS1dulRRUVGKi4tTSkqKjh07lj7GRk6zav30009q3769oX7ffPONAgMDs92G9957T3PmzLEpCwwM1DfffGO6fH7PSVOmTNEnn3ySZX26detm8/fJkyezXNZdPxdmHLXdycnJioiI0Lp167Rv3z5dvHhRAQEBCgoK0jPPPJOn8+u5c+ds/m7evLnuvvvuLJc3e41du3bl+nUB3NoIOADkyeXLlzVgwABDuOHv76+PP/44PdzISkpKiv766y8NHz5c33//vc1jsbGxio2N1cKFCxUcHKwRI0aocOHC2a5v/fr1GjNmjOGCSZIuXbqk2NhYhYaGqnjx4ho5cqSefvppw3LVq1eXr6+vrly5YlMeFxdnGnCY3TmKiorS5cuXTX9MZh7wUrrZxz0t3MiKo9+rnOzZs0cTJkzQgQMHDI+lvd4PP/wgSerUqZOGDRuWbdePpKQkzZo1S7Nnz1ZycrLh8atXryo+Pl5hYWGaOHGiBg8erJ49e8rLK+9fUVevXjWMv1G2bNk8ry8jHx8ftWjRQl9++aVN+c8//2zX8//++2+98847Wr58uU152nv7xRdfqEePHho5cqRLPvfZcfRnb/Xq1RozZozOnz9veOzixYvau3ev5s+fr0qVKmnUqFFq2LBhruqbndzut4Ksqz3y+zmMiorSq6++qqtXr+a5DtWqVVPlypUVGxtrU75ly5ZsA46UlBStXr3aUN6xY0fT5R19TsoPd/9cOMORI0c0dOhQQ5e/tPf+888/14QJE9S1a9dcrffMmTM2fz/22GPZLl++fHlD2Z49e/TXX3/pzjvvzNVrA7h10UUFQK6lpKRo1KhRhosdb29vTZ8+3a4R2a9du6a3337b8KMpsy+//FKTJ0/O8vHr169r2rRp6tWrl+mPvMwuXLiggQMHasKECYYf297e3mrVqpXhOZm3M43ZFIqSDIOmSdL58+dNA5EGDRrkWGdHvVf2CA8PV9euXU1/SJhZtmyZgoOD9csvv5g+npycrH79+ikkJMQ03DBbftKkSRo9erRu3LiRq7pntH//fsPr5XWKWDP33Xefoex///tfjs9LTU01DTcyW7RokSZMmKDU1FTTxx35uc+OI4/TDz/8UH379jX9YZhZXFycunfvrtDQULvrag979pu71NUeef0cXrlyRYMGDcpXuCFJnp6epqHEqlWrdP369SyfFx0dbfhxK5n/wHX0OSmvrPS5cKSjR4/queeey/J7ULp5TfDWW28pMjIyV+vO3Fokp5Zr//nPf0zLzcbyAPDvRcABINc+/fRThYWFGcqnTJmiWrVq2bWOVatWaeXKlXYtu3DhQsN4CmmWLl2qkJAQu9aT0bx58zR//nxDeVBQkKHMrOXFjRs3TAf5k25evGdmdle1SJEiqlmzZo51ddR7lZOYmBgNGDBAKSkpuXre4cOHNXToUNPnff3119qwYUOu67J48WJD0/jc2LFjh6HMkVMh/vHHH4ayu+66K8fnfffddzmGG2kWLVpk+tmTHP+5z4qjPnuhoaGaMWOG3a+bZvjw4dq+fXuun5cVe/abu9TVHnn9HE6bNs1hPwqbNWtmKDtx4kS2LUnM3qd27doZWl0445yUV1b6XDhKcnKyhgwZYlegI0kTJkxQQkKC3es/evRo+v/LlSunhx56KNvlS5QoYVpOwAEgI7qoAMiV1atX66OPPjKUDxw4UE899ZTd60nre92/f381b95cvr6+Onv2rObPn69NmzYZll++fLmhyfPRo0f17rvvGpYtWbKkBg4cqBo1asjT01NxcXGaPn264uPjbZb74IMPVL9+fZtQpk6dOob1HThwQBcvXtQ999yTXnby5EnTO5DSzT7BvXr1simLiYkxLNeiRQvdcccdpuvIyBHvlT1CQkIMPwj8/f3Vu3dv1ahRQ3feeafOnTunzz//3DCQ4a5du7Rv3z6bsRhSU1P11VdfGV6nePHiGjRokGrWrClvb2+dOXNGX3zxhWFbQkJC9NRTT5lOGZidGzdupDdXzyiru3+5ldYXPTOz5tOZrV+/XpL9+3LZsmWGJu7O+NxnxRGfvfj4eI0fP96wbLNmzdSjRw+VKlVKN27cUFxcnD777DPDsTJmzBiFh4fL29s7x/pmx5795i51tUd+PodpM1G0b99enTt31v3336/ExEQdPnxYnp65u/dVpkwZPfroo4Yxb7Zu3aoqVaoYlk9NTVV4eLihvG3btoYyR56Tevbsmd6FokuXLoaWT9OnTzedilSy1ucis/xs94oVK0xbbvznP/9JP4d7enoqNjZWISEhhnNNdq5du2bT2rFly5Y5dtf09vZWuXLlDK9jbwAD4N+BgAOA3WJiYjRs2DBDefv27dWvX79cr2/69Ok2oUjZsmUVGBiobt26ad++fTbLRkRE6MaNGzYX3/PmzVNSUpLNcn5+flqyZIlKly6dXla+fHnVr19fXbp00YkTJ2yWnzVrls3AnyVLllRgYKDhTvTPP/9s80Mzu5Hbt27dqqSkJJvxCMzubDdp0iTLdWSW3/cqJ1euXJGvr6+qVq2avm0lSpTQkiVLbLp2PPTQQ6pdu7Y6duxo6Ipz6NAhm4Dj6tWrhvdbunn3uHHjxul/lytXTg0aNFCfPn3Sf6SULFlSlStX1u+//57rKQA9PT0NP7YcaeHChabbZTbCv5nc7suUlBSb8Uic8bl3ZH3tOU47duyo999/32a7ypcvr0aNGqlTp046fvx4enl8fLwiIiJMu4/lhj37zV3qao/8fg4HDx6s/v3/396dx0ZVvX8c/wClLZSlVsaCgBopFCmCMlgtCLKEUKUJ+xq2EhYXFGUL4gKV+IVEMEUNAYJEDaISlLCF1VplEUE2oSAIKlLBFtSyVItL+vuj6fx6e8+0M2VmmCvv11+dM3funOk9vb33mec852nLTeW9995bpb707t3b9je3ceNGTZgwwXbT+t1339nOHfXq1bNlzwX6nBQXF+cJUpcWUS3L5XJ5ncbmpHFRXlU/d3Fxsa2+i1QSoF65cqXuvvtuT1vpuWbIkCHGMWlSs2ZNvwIipUxFSP/44w+/9wPgv4spKgB8kp+fr4kTJ6qwsNDS7na7NWfOHL8LQiYnJxtXLoiKitITTzxha8/Ly9PVq1c9jy9duqSPP/7Ytt2kSZMsN3mlbrvtNk2dOtXWvm3bNmMl9/LKBzQOHjxoeZyQkOD5uaioSCdOnLA8NqUom7JFTK73d+WLevXqaf78+dqwYYNOnDih7OxsrVy50njhW7t2bWPhvN9++83y2FuAJTY21tYWFRWljIwMrVu3TgcOHNDu3bu1ePFiv4MbwVBcXKw//vhDOTk5mjVrlubOnWvbJiYmxjhuyvP3WBYUFKigoMDzOJjjPhD9LT/2Ll++rNWrV1u2iYiI0IwZM4znjLi4OE2fPt3W7u/cfsn/43Yj++qLQI7DxMREPf7445V+Y+6rLl262LITjhw5YrnJL2WaPjZgwADb1JpgnJOqItzHRbCcOXPGmHk4ceJES3CjVHx8vPELkEAzTcEqf10C4OZGBgeASv3++++aNm2a7ZuZ22+/XZmZmapXr57f+3z44Ye9XlybLp6kkouY0vc6duyYcX51RRf3Xbp0UUxMjO1i6MiRI5alSU2FzsoXFN2xY4fn5+joaI0cOVIvv/yyZZ9t27aVVPKNZflv/9xut88379f7u/JXVFSUcdWYUhcuXDCmLf/999+Wx3Xq1DFmw8yePVszZsxQmzZtLDdFTZs2DWgh0KpatWqVVq1a5ddrpk2b5nV+eFlVOZZlv50M5rgPVH/Ljr2cnBxbfzt37lzh78o0vcqXujLXe9xC2VdfBHMc9ujRI6BLmMbFxSktLc0WfNu1a5etrsKWLVtsr09NTa1w/4E6J1VFuI2LUDEFpyRzzZVSjzzyiKKjo23/7wLJNG4DWWsFgPMR4ABQqczMTGP7woULq3xDalpGtZQpBVWSZUWJs2fP2p5PSEgwripQKiYmRm6321YctHy1/VatWsnlclnm9e7evVt//fWXIiMj9fPPP1tSazt27Ci3223Zx6FDhzR8+HBJsi2hKJXcYPjqen9XVVFcXKzc3Fz9+OOPOnfunPLz83Xu3DmdPHnS6+oxJk8++aTS09Mtbfv379fAgQMVGxur5ORktW7dWi1atFDz5s111113GdOow9nw4cM9x7oyVTmWZVeTCea4NwnG32lWVlaFN6sm33//va5duxbQGgblj1s499UX/oxDX4Ig/jIFODZv3qyRI0d6Hufm5toK5955550+1YMJ1DnJX04fF1VlKtwZHx9fYbHmmJgYtW/fXjt37gxav0zZGoEM1gFwPgIcAKrszJkzVSpmGQiXL1+2tfmSEdGoUaNK9xUZGanU1FRLgczSehKJiYm2gIXb7VazZs0s31zt3LnTU4vAtKqKr/PkQ62goEBr1qzRBx984ClEeD26du2qefPm6cUXX7R9y1ZQUKCtW7dq69atnramTZtq4MCBGjx4sG1FhXATExOj6dOna/jw4SELygRz3AdDIN8jUDeH3o5bOPbVFzdiHJqkpKSoQYMGunjxoqdt9+7dOnfunCdTaM+ePbbXDRo0qMIpjoE+J/nLqePiepkCCU2aNKl0WlNFwdZAuHTpkq0tJiYmqO8JwFmowQGgyjIyMmzr2N9IvswnN2U2mNpMy8WWLnt4+PBhS3vr1q0VHR1tec0vv/zi+Ya8/Jxzl8ulVq1aVdrXUMvJyVHv3r2VkZFR4Y1ESkqKUlJSfN7vkCFDtGXLFo0fP14NGjSocNuzZ8/q9ddfV8+ePYNaKLSqoqKi1LlzZ82ePVtZWVkaNWrUDc84CeS4D2fX099QH7dg/27DcRxGR0erf//+tvayGRumVV8qymYL1jnpRnHS35zpvOJL/4P5Gf/991/L0rKlKvu/AuDmQgYHgCq7cuWKZs2apWXLlvm9lOf1qlu3rq3N27KtZZnSbk1p+OWnnEj/f7G9d+9eS3tpsCIlJUWffvqpp/3bb79VrVq1bHOZH3300bBLqc3Pz9fo0aNty+0lJiZqwIABatmypRo2bKjGjRurdu3aeuutt2yp5hVp1qyZZs6cqWnTpun06dM6efKkjh8/rkOHDhn3U1BQoAkTJmjDhg2WAq6h0KtXL82YMcPSVq1aNUVFRSk2NjbkY72sYI/7QDMVBBw9erRmz54d8Pe63uMWyr76IpzHoTc9e/bUkiVLLG07d+5U//79dfXqVcv5USoptNyiRQvjvoJ9TvJVuI2LUDFlRZw9e1bFxcUVBlXz8vKC1qdff/3VWN8j3LP9AIQWAQ4APnnppZf0559/av78+Zb2zz//XCtWrLDVWQg2U+2PU6dOKT8/32uKbGFhoXGutmlfLpdLnTp1shQT3b9/vwoLCy1LYyYnJ3u+PSq/KsrRo0eNhT5N2SE32qZNm2w3Ev369dPcuXONKdVl60L4o2bNmmrZsqVatmzpWXq0oKBAmzZt0uzZs3Xt2jXPtkVFRVqzZk1IKvOXFRMTExbFTk2CPe4DzTRf37QyQyBc73ELZV99Ec7j0Ju2bdsqISHBUqNo+/btKioq0jfffGP5+5ZkzPgoFapzUmXCbVyESsOGDW1tFy5cUG5urtdxWf7/Y6B5yxi94447gvaeAJyHKSoAKjV06FCNGTNGY8eONS5tOm/ePB0/fjykfUpKSjLO296+fbvX12RnZxvnFbdu3dq4fbdu3SyP9+/fr8OHD1tqSZStKN+qVStLquyBAweMlehN2SE3mqlOyMCBA73OFzdtb1JYWKjvvvtOn332md59910dOnTItk1sbKyGDh2qsWPH2p4rnRaEEqEY94F0zz332Nr27dtnTDMvVVRUpC+++EI//fRTSFdHcFJfw1WNGjU0cOBAS9uVK1d07Ngx441v+XNsWcE6J/nrZh0X3jLnytZMKi87OzuoK6iYrjPatGlT5RXDAPw3EeAAUKmWLVuqWrVqio6O1pw5c2wXmNeuXdMLL7wQ1Aub8urXr68+ffrY2hcuXGhcHeLChQtasGCBrb179+5eq8InJyfb2tauXWt5XHZJ2cjISPXs2dPzeO/evbaL+i5duoTlfGHTsfO2ysb69eu1bdu2Sve5evVqJSUlqUePHkpPT9esWbM0b948Y9G+4uJi4zQKpxTkC5VQjPtAuvXWW5WWlmZrz8jI8DoO3n77bY0cOVKdO3dWu3btNGbMGNvf3c3e13BmWkb06NGjtql9aWlpFU4tCMY5qZQpSHjlyhXjtv+lceHP527SpInuu+8+W/ubb76p06dP29rz8vJsGZ6BZspE69y5c1DfE4DzMEUFgF/uueceTZ8+XXPmzLG0HzhwQIsXL9azzz4bsr6MGzdO69evt6Q95+XladiwYZo0aZLatm2r6tWr69ixY3rjjTeM2RRPPfWU1/0nJiaqSZMmlhoHZZdBbNCgga1YaMeOHfX+++9Lkv755x+tW7fO8nzXrl39+5AhYpre8Morr6ioqEjt27dXVFSUzp8/r7Vr12r16tU+7fP++++3te3Zs0ejRo1Senq6mjdvrsjISOXn52vdunW2JSYl+bR85M0m2OM+0MaMGaMNGzZY2nbu3KnBgwdr7Nixat26tSIiInT+/HmtWbPGMg4uX76srKwsy1Kj9DW8JSQkqEOHDpbiyllZWfrqq68s25mCBmUF45xUqmHDhvrhhx8sbcuWLZPL5VK9evV09epVtW3b1vNcOI2LwsJC49K13pRd+cSfz12tWjWNGDHClnVXUFCgYcOG6bnnnlO7du1UvXp15eTkKDMz07bvQLp69aoxe8SUVQrg5kaAA4DfRowYoc8++8y21n1mZqYefvjhkF1wJCYm6sUXX9RLL71kac/NzfWpbsPUqVMrvIGOiIhQamqqli1b5mkrm26cmppqKxZafvpJ+fRkU1ZIOEhOTtby5cstbYWFhZo1a5Zx+6SkpErnoTdr1kwjR47Ue++9Z2k/ePCgDh48WGmfXC6XevfuXel2N5tgj/tAa9eunSZMmGArPnn8+HFNmTKl0tenpqbqkUceCVb3LJzU13DWp08fS4AjOzvb8nzdunUrrUUUjHNSKbfbbStIunfvXvXt21dSSdHKPXv2eAID4TQuNm7cqI0bN/q8/cmTJz3/p/z93GlpaVqxYoXtfJ2Xl2crgCuVBP1vvfVWnThxwq/P5IuDBw/asnrq1q17w5aqBxC+mKICwG+RkZHKyMgwVlmfOXOmMW03WIYNG6ann37a79elp6dr3LhxlW7XoUMHr8+ZLtDj4+O9BjHuvPNOJSYm+t7JEOrWrZvPF4put1uTJ0/2advp06erU6dOfvfH5XJp6dKlcrlcfr/2ZhDscR9okydP1uDBg/1+3QMPPKC5c+f6tBRuoDipr+Gqa9euxukQpQYMGGBcEaisYJ2TJKlv374VTn/Ly8vT+fPnLW3/hXHh7+eOiorSa6+9Ziw4ajJz5kxL5ksglV+BRyr5PKbrEAA3NwIcAKqkWbNmeuGFF2ztJ0+eVGZmZsj6UaNGDU2ZMkWLFy/2aam42NhYLViwQC+//LJP9R3cbrfXC3VvxUJNc9ClkuVhq1cPz9NuZGSkFi1apC5dulS43UMPPaRFixYpOjrap/3WqVNHS5cu1TPPPONzPY3evXvro48+Mk5xQYlgj/tAi4qK0quvvqr//e9/iouL8+k1jz/+uN555x3dcsstQe6dlZP6Gq5cLpd69erl9fnU1NRK9xGsc5JU8v9r4cKFFb6m/HSL/8K4qMrnTkhI0IoVKyrN+nr++ec9mSCBVlhYqE8++cTWToYfABOmqACoskGDBikrK8u2gsPy5cvVqVOnkNabSE1NVceOHZWdna3du3fryJEjnoJ0jRs3ViTmj28AAARQSURBVFJSkjp06KBu3bopNjbW5/3Wr19fXbt2tRWw69Chg9dlOb1lcKSkpPj8vjeCy+XSsmXLtGPHDm3fvl1ff/21zp07p0aNGql58+Z67LHH1L17d0VHR1uWgaxMrVq1NHnyZA0dOlTZ2dnat2+fcnJydP78eUVERKhx48Zq2rSpHnzwQSUnJxtXLYBZsMZ9MERERGjYsGHq1auXsrOztWfPHh05ckS5ubn6999/FR8fr1atWsntdqtbt243dIlUJ/U1XKWlpRkLa95xxx0+T5EK1jlJKvnb2bx5s9auXasvv/xSp06d0rVr1xQfH6+kpCRjEOC/MC6q8rkTEhL04Ycf6tNPP9XWrVt14MABXbx4UU2aNFFKSor69eunNm3aBK3Pu3btsmWGut1uguAAjKoVFxcX3+hOAAAAAEB548ePtxUYXbJkiWXVMgAoFZ650gAAAABuaqdOnbIFN0ozZADAhAAHAAAAgLBTfql1SZoyZYpq1qx5A3oDwAmYogIAAAAAAByPDA4AAAAAAOB4BDgAAAAAAIDjEeAAAAAAAACOR4ADAAAAAAA4HgEOAAAAAADgeAQ4AAAAAACA4xHgAAAAAAAAjkeAAwAAAAAAOB4BDgAAAAAA4HgEOAAAAAAAgOMR4AAAAAAAAI5HgAMAAAAAADgeAQ4AAAAAAOB4BDgAAAAAAIDjEeAAAAAAAACOR4ADAAAAAAA4HgEOAAAAAADgeAQ4AAAAAACA4xHgAAAAAAAAjkeAAwAAAAAAOB4BDgAAAAAA4HgEOAAAAAAAgOMR4AAAAAAAAI5HgAMAAAAAADgeAQ4AAAAAAOB4BDgAAAAAAIDjEeAAAAAAAACOR4ADAAAAAAA4HgEOAAAAAADgeAQ4AAAAAACA4xHgAAAAAAAAjkeAAwAAAAAAOB4BDgAAAAAA4HgEOAAAAAAAgOMR4AAAAAAAAI5HgAMAAAAAADgeAQ4AAAAAAOB4BDgAAAAAAIDjEeAAAAAAAACOR4ADAAAAAAA4HgEOAAAAAADgeAQ4AAAAAACA4xHgAAAAAAAAjkeAAwAAAAAAOB4BDgAAAAAA4HgEOAAAAAAAgOMR4AAAAAAAAI5HgAMAAAAAADgeAQ4AAAAAAOB4BDgAAAAAAIDjEeAAAAAAAACOR4ADAAAAAAA4HgEOAAAAAADgeAQ4AAAAAACA4xHgAAAAAAAAjkeAAwAAAAAAOB4BDgAAAAAA4HgEOAAAAAAAgOMR4AAAAAAAAI5HgAMAAAAAADgeAQ4AAAAAAOB4BDgAAAAAAIDjEeAAAAAAAACOR4ADAAAAAAA4HgEOAAAAAADgeAQ4AAAAAACA4xHgAAAAAAAAjkeAAwAAAAAAOB4BDgAAAAAA4HgEOAAAAAAAgOMR4AAAAAAAAI5HgAMAAAAAADgeAQ4AAAAAAOB4BDgAAAAAAIDjEeAAAAAAAACOR4ADAAAAAAA4HgEOAAAAAADgeP8HS+SrMK0Mm0wAAAAASUVORK5CYII=';
let _upiOrderId=null,_upiRiderPh=null,_upiAmount=0,_upiSsPhoto=null;

function showProofOfDelivery(oId,ph){
  _upiOrderId=oId;_upiRiderPh=ph;_upiSsPhoto=null;_upiAmount=0;
  if(window.db){
    window.db.collection('orders').doc(oId).get().then(snap=>{
      if(snap.exists)_upiAmount=snap.data().totalPrice||0;
      _showUPIModal();
    }).catch(()=>_showUPIModal());
  }else{_showUPIModal();}
}

function _showUPIModal(){
  const amt=Math.round(_upiAmount);
  const upiLink=`upi://pay?pa=${_UPI_ID}&pn=${encodeURIComponent(_UPI_NAME)}&am=${amt}&cu=INR&tn=${encodeURIComponent('Nekta Order')}`;
  showMdl(`
    <div id='upi-root' style='font-family:var(--font,sans-serif)'>
      <div id='upi-s1'>
        <div style='text-align:center;margin-bottom:10px'>
          <div style='display:inline-flex;align-items:center;gap:7px;background:#f3f0ff;border-radius:30px;padding:5px 14px;margin-bottom:6px'>
            <span style='font-size:14px'>&#128241;</span>
            <span style='font-weight:800;font-size:12px;color:#5b21b6'>Show this screen to customer</span>
          </div>
          <h2 style='font-weight:900;font-size:20px;color:#1a1a2e;margin:0 0 2px'>Scan &amp; Pay</h2>
          <p style='font-size:11px;color:#94a3b8;margin:0'>PhonePe &bull; GPay &bull; Paytm &bull; Any UPI app</p>
        </div>
        <div style='background:linear-gradient(135deg,#5b21b6,#7c3aed);border-radius:16px;padding:14px;text-align:center;margin-bottom:12px;box-shadow:0 8px 24px rgba(91,33,182,.35)'>
          <p style='font-size:10px;font-weight:700;color:#c4b5fd;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 3px'>Amount to Pay</p>
          <p style='font-size:42px;font-weight:900;color:#fff;margin:0;line-height:1'>&#8377;${amt}</p>
        </div>
        <div style='background:#fff;border:3px solid #7c3aed;border-radius:18px;padding:12px;text-align:center;margin-bottom:10px;box-shadow:0 4px 20px rgba(124,58,237,.15)'>
          <img src='data:image/png;base64,${_UPI_QR_B64}' style='width:100%;max-width:220px;height:auto;display:block;margin:0 auto' alt='PhonePe QR'>
          <div style='margin-top:8px;background:#f5f3ff;border-radius:10px;padding:7px'>
            <p style='font-size:10px;color:#7c3aed;font-weight:700;margin:0 0 2px'>UPI ID</p>
            <p style='font-size:13px;font-weight:900;color:#3730a3;margin:0'>${_UPI_ID}</p>
          </div>
        </div>
        <div style='display:flex;align-items:center;gap:8px;margin-bottom:10px'>
          <div style='flex:1;height:1px;background:#e2e8f0'></div>
          <span style='font-size:10px;color:#94a3b8;font-weight:700;white-space:nowrap'>OR OPEN UPI APP</span>
          <div style='flex:1;height:1px;background:#e2e8f0'></div>
        </div>
        <div style='display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px'>
          <a href='${upiLink}' style='text-decoration:none'><button style='width:100%;background:#5f259f;color:#fff;border:none;border-radius:12px;padding:11px 6px;font-weight:800;font-size:12px;cursor:pointer'>&#128241; PhonePe</button></a>
          <a href='${upiLink}' style='text-decoration:none'><button style='width:100%;background:#1a73e8;color:#fff;border:none;border-radius:12px;padding:11px 6px;font-weight:800;font-size:12px;cursor:pointer'>G GPay</button></a>
          <a href='${upiLink}' style='text-decoration:none'><button style='width:100%;background:#00BAF2;color:#fff;border:none;border-radius:12px;padding:11px 6px;font-weight:800;font-size:12px;cursor:pointer'>&#8377; Paytm</button></a>
          <a href='tel:${_UPI_PHONE}' style='text-decoration:none'><button style='width:100%;background:#f1f5f9;color:#334155;border:1.5px solid #e2e8f0;border-radius:12px;padding:11px 6px;font-weight:800;font-size:12px;cursor:pointer'>&#128222; ${_UPI_PHONE}</button></a>
        </div>
        <div style='background:#fef9c3;border:1.5px solid #fde047;border-radius:12px;padding:10px;margin-bottom:12px'>
          <p style='font-size:11px;font-weight:800;color:#854d0e;margin:0 0 3px'>Rider: Wait for customer to pay</p>
          <p style='font-size:11px;color:#92400e;margin:0'>Once customer shows payment screenshot &rarr; tap below</p>
        </div>
        <button onclick='_upiNext()' style='width:100%;background:linear-gradient(135deg,#059669,#047857);color:#fff;border:none;border-radius:14px;padding:15px;font-size:14px;font-weight:900;cursor:pointer;box-shadow:0 6px 20px rgba(5,150,105,.4)'>&#9989; Customer Has Paid &mdash; Verify Screenshot</button>
      </div>
      <div id='upi-s2' style='display:none'>
        <div style='text-align:center;margin-bottom:12px'>
          <div style='font-size:36px;margin-bottom:5px'>&#128248;</div>
          <h2 style='font-weight:900;font-size:19px;color:#1a1a2e;margin:0 0 3px'>Verify Payment</h2>
          <p style='font-size:11px;color:#94a3b8;margin:0'>Upload customer payment success screenshot</p>
        </div>
        <div id='upi-ss-prev' onclick="document.getElementById('upi-ss-inp').click()"
             style='width:100%;min-height:140px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:2.5px dashed #059669;border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;margin-bottom:12px;overflow:hidden'>
          <div style='text-align:center;padding:18px;color:#059669'>
            <div style='font-size:30px;margin-bottom:6px'>&#128444;</div>
            <p style='font-weight:800;font-size:12px;margin:0 0 3px'>Tap to upload screenshot</p>
            <p style='font-size:10px;color:#4ade80;margin:0'>Customer payment success screen</p>
          </div>
        </div>
        <input type='file' id='upi-ss-inp' accept='image/*' style='display:none' onchange='_upiSsSelected(this)'>
        <div style='background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;padding:12px;margin-bottom:12px'>
          <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:6px'>
            <span style='font-size:12px;font-weight:700;color:#065f46'>Order Amount</span>
            <span style='font-size:18px;font-weight:900;color:#059669'>&#8377;${amt}</span>
          </div>
          <div style='display:flex;justify-content:space-between;align-items:center'>
            <span style='font-size:11px;color:#059669'>Paid to</span>
            <span style='font-size:11px;font-weight:700;color:#064e3b'>${_UPI_ID}</span>
          </div>
        </div>
        <label style='display:flex;align-items:center;gap:10px;background:#fff;border:1.5px solid #d1fae5;border-radius:12px;padding:12px;margin-bottom:8px;cursor:pointer'>
          <input type='checkbox' id='upi-chk1' style='width:20px;height:20px;accent-color:#059669'>
          <span style='font-size:12px;font-weight:700;color:#065f46'>Screenshot shows &#8377;${amt} paid &#10003;</span>
        </label>
        <label style='display:flex;align-items:center;gap:10px;background:#fff;border:1.5px solid #d1fae5;border-radius:12px;padding:12px;margin-bottom:14px;cursor:pointer'>
          <input type='checkbox' id='upi-chk2' style='width:20px;height:20px;accent-color:#059669'>
          <span style='font-size:12px;font-weight:700;color:#065f46'>Payment shows success / green tick &#9989;</span>
        </label>
        <div style='display:grid;grid-template-columns:1fr 2fr;gap:10px'>
          <button onclick='_upiBack()' style='background:#f1f5f9;color:#334155;border:1.5px solid #e2e8f0;border-radius:12px;padding:13px;font-weight:700;font-size:13px;cursor:pointer'>&larr; Back</button>
          <button id='upi-confirm-btn' onclick='_upiConfirm()' style='background:linear-gradient(135deg,#059669,#047857);color:#fff;border:none;border-radius:12px;padding:13px;font-size:14px;font-weight:900;cursor:pointer;box-shadow:0 6px 20px rgba(5,150,105,.35)'>&#127881; Confirm Delivery</button>
        </div>
      </div>
    </div>
  `);
}

window._upiNext=function(){document.getElementById('upi-s1').style.display='none';document.getElementById('upi-s2').style.display='block';};
window._upiBack=function(){document.getElementById('upi-s1').style.display='block';document.getElementById('upi-s2').style.display='none';};
window._upiSsSelected=function(input){
  const file=input.files[0];if(!file)return;
  _upiSsPhoto=file;
  const reader=new FileReader();
  reader.onload=e=>{
    const prev=document.getElementById('upi-ss-prev');
    if(prev)prev.innerHTML=`<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:14px;min-height:140px">`;
  };
  reader.readAsDataURL(file);
};
window._upiConfirm=async function(){
  if(!_upiSsPhoto){toast('Upload payment screenshot first','error');return;}
  if(!document.getElementById('upi-chk1')?.checked||!document.getElementById('upi-chk2')?.checked){
    toast('Tick both checkboxes to confirm','error');return;
  }
  const btn=document.getElementById('upi-confirm-btn');
  if(btn){btn.textContent='Saving...';btn.disabled=true;}
  let photoBase64=null;
  try{
    photoBase64=await new Promise((res,rej)=>{
      const reader=new FileReader(),img=new Image();
      img.onload=()=>{
        const maxW=600,scale=Math.min(1,maxW/img.width);
        const canvas=document.createElement('canvas');
        canvas.width=img.width*scale;canvas.height=img.height*scale;
        canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
        res(canvas.toDataURL('image/jpeg',0.75));
      };
      img.onerror=rej;
      reader.onload=e=>img.src=e.target.result;
      reader.onerror=rej;
      reader.readAsDataURL(_upiSsPhoto);
    });
  }catch{toast('Photo error, try again','error');if(btn){btn.textContent='Confirm Delivery';btn.disabled=false;}return;}
  let deliveryMins=0;
  try{
    const snap=await window.db.collection('orders').doc(_upiOrderId).get();
    if(snap.exists){const d=snap.data();const placed=d.createdAt?.toDate?d.createdAt.toDate():new Date(d.createdAt);deliveryMins=Math.round((Date.now()-placed.getTime())/60000);}
  }catch{}
  if(riderW){navigator.geolocation.clearWatch(riderW);riderW=null;}
  const mapSec=document.getElementById('r-map-sec');if(mapSec)mapSec.style.display='none';
  const ok=await completeDeliveryFirebase(_upiOrderId,_upiRiderPh,deliveryMins,photoBase64);
  try{
    await window.db.collection('orders').doc(_upiOrderId).update({
      paymentMethod:'upi',
      paymentNote:'UPI screenshot verified by rider',
      paymentScreenshot:photoBase64,
      paidAt:firebase.firestore.FieldValue.serverTimestamp()
    });
  }catch{}
  closeMdl();
  if(ok){
    toast('Delivered in '+deliveryMins+' min! UPI payment confirmed','success');
    try{const odSnap=await window.db.collection('orders').doc(_upiOrderId).get();if(odSnap.exists&&window._sendDeliveryConfirmWA)window._sendDeliveryConfirmWA(_upiOrderId,odSnap.data(),deliveryMins);}catch{}
    loadRDash(_upiRiderPh);
  }else{toast('Failed to mark delivered','error');}
};
function updateRMap(lat,lng){
  const ph=document.getElementById('r-map-ph');
  if(ph)ph.outerHTML=`<iframe id="r-live-map" src="https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed" style="width:100%;height:220px;border:none"></iframe>`;
  else{const iframe=document.getElementById('r-live-map');if(iframe)iframe.src='https://maps.google.com/maps?q='+lat+','+lng+'&z=15&output=embed';}
  const gs=document.getElementById('r-gps-st');if(gs)gs.textContent=lat.toFixed(4)+', '+lng.toFixed(4);
}
function refreshROrders(){const ph=localStorage.getItem('riderPhone');if(ph)loadROrders(ph);}
function backFromSpecial(){
  try{if(riderW){navigator.geolocation.clearWatch(riderW);riderW=null;}}catch{}
  try{if(adminL){adminL();adminL=null;}}catch{}
  isFirstSnap=true;
  localStorage.removeItem('userRole');localStorage.removeItem('riderPhone');
  ['admin','rider'].forEach(v=>{const el=document.getElementById('view-'+v);if(el)el.classList.remove('on');});
  const bnav=document.getElementById('bnav');if(bnav)bnav.style.display='flex';
  const cleanStack=v=>v.filter(x=>x!=='admin'&&x!=='rider');
  viewStack.length=0;cleanStack(['home','profile']).forEach(v=>viewStack.push(v));
  if(window.viewHistory){const vh=window.viewHistory;vh.length=0;cleanStack(['home','profile']).forEach(v=>vh.push(v));}
  curview='profile';window.curview='profile';
  ['home','catalog','cart','profile'].forEach(n=>{const el=document.getElementById('nb-'+n);if(el)el.classList.remove('on');});
  const nbp=document.getElementById('nb-profile');if(nbp)nbp.classList.add('on');
  const vp=document.getElementById('view-profile');if(vp)vp.classList.add('on');
  loadProfileUI();initTracking();
}
window.backFromSpecial=backFromSpecial;

// --- MODAL SYSTEM ---
let _mdl=null;
function showMdl(html){
  closeMdl();
  _mdl=document.createElement('div');_mdl.className='mov';
  _mdl.innerHTML=`<div class="msh"><div class="mhdl"></div><div style="padding:0 20px 20px">${html}</div></div>`;
  _mdl.addEventListener('click',e=>{if(e.target===_mdl)closeMdl();});
  document.body.appendChild(_mdl);
}
function closeMdl(){if(_mdl){_mdl.remove();_mdl=null;}}

// --- TOAST ---
let _tt=null;
const TICO={success:'fa-check-circle',error:'fa-times-circle',warning:'fa-exclamation-triangle',info:'fa-info-circle'};
function toast(msg,type='info'){
  const el=document.getElementById('toast');
  const icoEl=document.getElementById('t-ico');
  const msgEl=document.getElementById('t-msg');
  
  // Fix: use setAttribute for SVG elements which have readonly className
  if(icoEl){
    try {
      icoEl.className.baseVal ? icoEl.setAttribute('class','fas '+(TICO[type]||TICO.info)) : (icoEl.className='fas '+(TICO[type]||TICO.info));
    } catch(e) {
      icoEl.setAttribute('class','fas '+(TICO[type]||TICO.info));
    }
  }
  
  if(msgEl) msgEl.textContent=msg;
  if(el) {
    try {
      el.className='show '+type;
    } catch(e) {
      el.setAttribute('class','show '+type);
    }
  }
  if(_tt)clearTimeout(_tt);
  _tt=setTimeout(()=>{ if(el) el.className=''; },3200);
}
window.toast=toast;

// --- PWA ---
function initPWA(){
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferPrompt=e;});
  window.addEventListener('appinstalled',()=>{toast('App installed! 🎉','success');});
}
function showInstallOption(){
  if(deferPrompt){deferPrompt.prompt();deferPrompt.userChoice.then(()=>{deferPrompt=null;});}
  else toast('On iPhone: tap Share then Add to Home Screen','info');
}

// --- MISC ---
function openNotifs(){
  // Mark dot as seen
  const dot=document.getElementById('notif-dot');
  if(dot) dot.style.display='none';
  localStorage.setItem('nk_notif_seen','1');

  const notifs=[
    {icon:'⚡',title:'Fast Delivery Active',sub:'Orders delivered in 15–20 mins today',time:'Now'},
    {icon:'🔔',title:'Welcome to Nekta!',sub:'Fresh groceries at your door in Kothagudem',time:'Today'},
    {icon:'🏷',title:'Use Promo Codes',sub:'Apply codes in cart to get discounts',time:'Today'},
    {icon:'🔔',title:'Share Your Location',sub:'Enable GPS for accurate delivery charges',time:'Tip'},
  ];
  showMdl(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h3 style="font-weight:900;font-size:18px">🔔 Notifications</h3>
      <span style="font-size:11px;color:var(--pale);font-weight:600">All caught up</span>
    </div>
    ${notifs.map(n=>`
      <div style="display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--border2)">
        <div style="width:42px;height:42px;border-radius:13px;background:var(--g3);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${n.icon}</div>
        <div style="flex:1;min-width:0">
          <p style="font-weight:700;font-size:13px;color:var(--dark)">${n.title}</p>
          <p style="font-size:12px;color:var(--pale);margin-top:2px;line-height:1.4">${n.sub}</p>
        </div>
        <span style="font-size:10px;color:var(--pale);font-weight:600;flex-shrink:0;margin-top:2px">${n.time}</span>
      </div>`).join('')}
    <p style="text-align:center;font-size:12px;color:var(--pale);margin-top:14px">You're all caught up! ✅</p>
  `);
}
function openSupport(){window.open('https://wa.me/'+BPHONE+'?text=Hi+Nekta+Support!+I+need+help.','_blank','noopener,noreferrer');}
function showStoreAddr(){
  const addr=window.STORE_ADDRESS||'3-1-54/3 Hanumanbasthi, Kothagudem 507101';
  showMdl(`<h3 style="font-weight:900;font-size:17px;margin-bottom:14px">📍 Store Location</h3>
    <div style="background:#f0fdf8;border-radius:14px;padding:16px;margin-bottom:14px">
      <p style="font-size:13px;font-weight:800;color:#065f46;margin-bottom:4px">Nekta Grocery Store</p>
      <p style="font-size:13px;color:#374151;line-height:1.6">${addr}</p>
    </div>
    <a href="https://maps.google.com/?q=${window.STORE_LAT},${window.STORE_LNG}" target="_blank" rel="noopener noreferrer"
      style="display:flex;align-items:center;justify-content:center;gap:8px;background:#d1fae5;color:#059669;padding:13px;border-radius:13px;font-weight:700;text-decoration:none;font-size:13px">
      <i class="fas fa-map-marker-alt"></i> Open in Google Maps
    </a>`);
}
window.showStoreAddr=showStoreAddr;
function showRates(){
  const rates=[
    {km:'0–1 km',price:20},
    {km:'1–2 km',price:25},
    {km:'2–3 km',price:30},
    {km:'3–4 km',price:35},
    {km:'4–5 km',price:40},
    {km:'5–6 km',price:50},
    {km:'6–8 km',price:60},
    {km:'8–10 km',price:80},
    {km:'10+ km',price:90,extra:true},
  ];
  const maxPrice=Math.max(...rates.map(r=>r.price));
  const bars=rates.map(r=>{
    const pct=Math.round((r.price/maxPrice)*100);
    return`<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px">
      <div style="width:52px;font-size:10px;font-weight:700;color:var(--mid);flex-shrink:0;text-align:right">${r.km}</div>
      <div style="flex:1;background:var(--g4);border-radius:8px;overflow:hidden;height:28px">
        <div style="width:${pct}%;height:100%;background:${r.extra?'linear-gradient(90deg,#f59e0b,#d97706)':'linear-gradient(90deg,#00b96b,#00d97e)'};border-radius:8px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;min-width:40px">
          <span style="font-size:11px;font-weight:800;color:#fff">₹${r.price}${r.extra?'+':''}</span>
        </div>
      </div>
    </div>`;
  }).join('');
  showMdl(`
    <h3 style="font-weight:900;font-size:18px;margin-bottom:4px">🚚 Delivery Rates</h3>
    <p style="font-size:12px;color:var(--pale);margin-bottom:14px">Auto-calculated based on your GPS distance from store</p>

    <div style="background:var(--g3);border-radius:12px;padding:11px 14px;margin-bottom:14px;display:flex;align-items:center;gap:9px;border:1px solid var(--border)">
      <span style="font-size:20px">📍</span>
      <div>
        <p style="font-size:12px;font-weight:800;color:var(--gd)">Live GPS Distance Pricing</p>
        <p style="font-size:11px;color:var(--g);margin-top:2px">We detect your location &amp; charge the exact slab · no rounding up</p>
      </div>
    </div>

    ${bars}

    <div style="background:#fef3c7;border-radius:12px;padding:11px 14px;margin-top:10px;display:flex;align-items:flex-start;gap:9px;border:1px solid #fde68a">
      <span style="font-size:18px;flex-shrink:0">💰</span>
      <p style="font-size:12px;color:#92400e;font-weight:600">Beyond 10 km: ₹80 base + ₹10 for every extra km<br><span style="font-weight:400">e.g. 12 km = ₹80 + ₹20 = ₹100</span></p>
    </div>

    <div style="display:flex;gap:8px;margin-top:10px">
      <div style="flex:1;background:var(--g3);border-radius:10px;padding:10px;text-align:center;border:1px solid var(--border)">
        <div style="font-size:18px">💳</div>
        <div style="font-size:11px;font-weight:800;color:var(--gd);margin-top:4px">Min. charge</div>
        <div style="font-size:16px;font-weight:900;color:var(--g);font-family:'Nunito',sans-serif">₹20</div>
      </div>
      <div style="flex:1;background:var(--g3);border-radius:10px;padding:10px;text-align:center;border:1px solid var(--border)">
        <div style="font-size:18px">📦</div>
        <div style="font-size:11px;font-weight:800;color:var(--gd);margin-top:4px">Min. order</div>
        <div style="font-size:16px;font-weight:900;color:var(--g);font-family:'Nunito',sans-serif">₹${window.MIN_ORD||100}</div>
      </div>
      <div style="flex:1;background:var(--g3);border-radius:10px;padding:10px;text-align:center;border:1px solid var(--border)">
        <div style="font-size:18px">⚡</div>
        <div style="font-size:11px;font-weight:800;color:var(--gd);margin-top:4px">Delivery</div>
        <div style="font-size:16px;font-weight:900;color:var(--g);font-family:'Nunito',sans-serif">15 min</div>
      </div>
    </div>
    ${window._rainBonusActive?`<div style="background:linear-gradient(135deg,#E3F2FD,#BBDEFB);border-radius:12px;padding:12px 14px;margin-top:10px;display:flex;align-items:center;gap:10px;border:1px solid #90CAF9"><span style="font-size:22px">🌧️</span><div><p style="font-size:13px;font-weight:800;color:#1565C0">Rain Surcharge Active</p><p style="font-size:11px;color:#1976D2;margin-top:2px">+₹10 added to delivery fee to support our riders braving the rain for you!</p></div></div>`:''}
  `);
}
function showOrderHistory(){
  const h=JSON.parse(localStorage.getItem('nk_hist')||'[]');
  if(!h.length){
    showMdl(`
      <div style="text-align:center;padding:32px 16px">
        <div style="font-size:56px;margin-bottom:12px">📋</div>
        <h3 style="font-weight:900;font-size:18px;color:var(--dark);font-family:'Nunito',sans-serif;margin-bottom:8px">No Orders Yet</h3>
        <p style="font-size:13px;color:var(--pale);margin-bottom:20px">Your order history will appear here</p>
        <button class="pbtn" onclick="closeMdl();showView('home')">Start Shopping 🛂</button>
      </div>`);
    return;
  }
  const cards=h.map((entry,i)=>{
    const date=new Date(entry.ts);
    const dateStr=date.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
    const timeStr=date.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    const orderNum=h.length-i;
    // Build items list
    const itemIds=entry.itemIds||[];
    const itemDetails=entry.itemDetails||[];
    let itemsHtml='';
    if(itemDetails.length){
      // Rich item details saved
      itemsHtml=itemDetails.slice(0,4).map(it=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border2)">
          <div style="display:flex;align-items:center;gap:8px;min-width:0">
            <img src="${it.img||'images/nektaIcon.svg'}" style="width:32px;height:32px;border-radius:8px;object-fit:cover;flex-shrink:0;background:var(--g4)" onerror="this.src='images/nektaIcon.svg'">
            <div style="min-width:0">
              <div style="font-size:12px;font-weight:600;color:var(--dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">${it.name}</div>
              <div style="font-size:10px;color:var(--pale);margin-top:1px">x${it.qty} – ${it.unit||''}</div>
            </div>
          </div>
          <div style="font-size:12px;font-weight:800;color:var(--g);font-family:'Nunito',sans-serif;flex-shrink:0">₹${it.cost}</div>
        </div>`).join('');
      if(itemDetails.length>4) itemsHtml+=`<div style="font-size:11px;color:var(--pale);padding:6px 0">+${itemDetails.length-4} more items</div>`;
    } else if(itemIds.length){
      // Fallback: look up from products array
      const ps=itemIds.slice(0,4).map(id=>_getProds().find(p=>p.id===id)).filter(Boolean);
      itemsHtml=ps.map(p=>`
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border2)">
          <img src="${getItemImage(p)}" style="width:32px;height:32px;border-radius:8px;object-fit:cover;flex-shrink:0;background:var(--g4)" onerror="this.src='images/nektaIcon.svg'">
          <div style="font-size:12px;font-weight:600;color:var(--dark);flex:1">${p.name}</div>
          <div style="font-size:11px;color:var(--pale)">₹${p.halfPrice||p.price}</div>
        </div>`).join('');
      if(itemIds.length>4) itemsHtml+=`<div style="font-size:11px;color:var(--pale);padding:5px 0">+${itemIds.length-4} more items</div>`;
    }
    return`
      <div style="background:var(--card);border-radius:18px;border:1.5px solid var(--border2);margin-bottom:12px;overflow:hidden;box-shadow:var(--sh1)">
        <!-- Order Header -->
        <div style="background:linear-gradient(135deg,var(--g),var(--gd));padding:12px 14px;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="color:#fff;font-weight:900;font-size:14px;font-family:'Nunito',sans-serif">Order #${orderNum}</div>
            <div style="color:rgba(255,255,255,.8);font-size:10px;margin-top:2px">${dateStr} – ${timeStr}</div>
          </div>
          <div style="text-align:right">
            <div style="color:#fff;font-weight:900;font-size:18px;font-family:'Nunito',sans-serif">₹${(entry.total||0).toFixed(0)}</div>
            <div style="background:rgba(255,255,255,.22);color:#fff;font-size:9px;font-weight:800;padding:2px 8px;border-radius:10px;margin-top:3px">${entry.items} item${entry.items!==1?'s':''}</div>
          </div>
        </div>
        <!-- Items List -->
        ${itemsHtml?`<div style="padding:10px 14px">${itemsHtml}</div>`:''}
        <!-- Bill Summary -->
        <div style="padding:10px 14px;background:var(--g4);display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border2)">
          <div style="font-size:12px;color:var(--pale)">📦 Order ID: <span style="font-weight:700;color:var(--mid)">#${(entry.id||'').slice(-6).toUpperCase()||'—'}</span></div>
          <div style="font-size:13px;font-weight:900;color:var(--g);font-family:'Nunito',sans-serif">Total ₹${(entry.total||0).toFixed(0)}</div>
        </div>
        <!-- Reorder Button -->
        <div style="padding:10px 14px">
          <button onclick="_reorderEntry(${i});closeMdl()" style="width:100%;background:var(--g3);color:var(--g);border:1.5px solid var(--border);padding:10px;border-radius:12px;font-weight:800;font-size:13px;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:7px">
            🛒 Reorder All Items
          </button>
        </div>
      </div>`;
  }).join('');
  showMdl(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h3 style="font-weight:900;font-size:18px;color:var(--dark);font-family:'Nunito',sans-serif">🕐 Order History</h3>
      <span style="background:var(--g3);color:var(--g);font-size:11px;font-weight:800;padding:4px 10px;border-radius:20px">${h.length} orders</span>
    </div>
    ${cards}`);
}
function _reorderEntry(idx){
  const h=JSON.parse(localStorage.getItem('nk_hist')||'[]');
  const entry=h[idx]; if(!entry) return;
  const ids=entry.itemIds||[];
  if(!ids.length){toast('No items to reorder','info');return;}
  ids.forEach(id=>{
    const p=products.find(x=>x.id===id); if(!p||p.outOfStock) return;
    const step=_isWeightUnit(p.unit)?(p.quarterPrice?0.25:p.halfPrice?0.5:1):1;
    if(!cart[id]) cart[id]={qty:step,cost:itemCost(id,step)};
  });
  saveCart();updateFCart();updateBadge();
  toast('Items added to cart! 🛒','success');
  setTimeout(()=>showView('cart'),300);
}
Object.assign(window,{_reorderEntry});
function showFavourites(){
  if(!favs.size){toast('No favourites yet. Tap ❤️ on products!','info');return;}
  const items=_getProds().filter(p=>favs.has(p.id));
  showMdl(`<h3 style="font-weight:900;font-size:18px;margin-bottom:16px">❤️ Favourites</h3><div class="cgrid" style="padding:0">${items.map(p=>mkFullCard(p)).join('')}</div>`);
}
function showShops(){
  // Load and display all available shops
  if(window.loadShopsForHome) {
    window.loadShopsForHome().then(function(){
      var shops = window._shopsCache || [];
      if(!shops.length) { toast('No shops available yet','info'); return; }
      var shopsHTML = shops.map(function(s,i){ return (window._mkShopCard ? window._mkShopCard(s,i) : '<div style="min-width:160px;height:100px;background:#f0f0f0;border-radius:10px;display:flex;align-items:center;justify-content:center"><p>'+s.name+'</p></div>'); }).join('');
      showMdl(`<h3 style="font-weight:900;font-size:18px;margin-bottom:16px">🏪 Available Shops</h3><div style="display:flex;gap:12px;overflow-x:auto;padding:0;-webkit-overflow-scrolling:touch">${shopsHTML}</div>`);
    });
  } else {
    toast('Shops feature loading...','info');
  }
}
function showShoppingLists(){
  const lists=window.getShoppingLists?getShoppingLists():[];
  showMdl(`<h3 style="font-weight:900;font-size:18px;margin-bottom:16px">📝 Shopping Lists</h3>
    ${lists.length?lists.map(l=>`<div style="background:#f8fafc;border-radius:13px;padding:13px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center"><div><p style="font-weight:700;font-size:14px">${l.name}</p><p style="font-size:12px;color:#94a3b8">${l.items.length} items</p></div><div style="display:flex;gap:8px"><button onclick="if(window.loadListToCart)loadListToCart(${l.id});closeMdl();showView('cart')" style="background:#d1fae5;color:#059669;border:none;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">Add to Cart</button><button onclick="if(window.deleteShoppingList)deleteShoppingList(${l.id});showShoppingLists()" style="background:#fee2e2;color:#ef4444;border:none;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">Delete</button></div></div>`).join(''):'<p style="color:#94a3b8;font-size:14px;margin-bottom:16px">No lists yet.</p>'}
    <div style="display:flex;gap:8px;margin-top:8px"><input id="new-list-name" class="fi" placeholder="List name e.g. Weekly Groceries" style="flex:1"><button onclick="if(window.createShoppingList)createShoppingList(document.getElementById('new-list-name').value);showShoppingLists()" class="pbtn" style="width:auto;padding:13px 16px;white-space:nowrap">+ Create</button></div>`);
}
function showReferral(){
  const code=window.getReferralCode?getReferralCode():'NEKTA'+Math.random().toString(36).slice(2,7).toUpperCase();
  showMdl(`<h3 style="font-weight:900;font-size:20px;margin-bottom:6px">🎁 Refer & Earn</h3>
    <p style="font-size:13px;color:#94a3b8;margin-bottom:20px">Share your code → you get 100 coins, friend gets &#8377;50 off!</p>
    <div style="background:#f0fdf8;border-radius:14px;padding:20px;text-align:center;margin-bottom:16px">
      <p style="font-size:11px;color:#94a3b8;font-weight:700;margin-bottom:8px">YOUR REFERRAL CODE</p>
      <p style="font-size:32px;font-weight:900;color:#059669;letter-spacing:4px;font-family:'Nunito',sans-serif">${code}</p>
    </div>
    <button class="pbtn" onclick="if(window.shareReferral)shareReferral();closeMdl()" style="margin-bottom:10px"><i class="fab fa-whatsapp" style="margin-right:8px"></i>Share via WhatsApp</button>
    <div style="border-top:1px solid #e2f0eb;padding-top:14px;margin-top:4px">
      <p style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">Have a referral code?</p>
      <div style="display:flex;gap:8px"><input id="ref-code-inp" class="fi" placeholder="Enter code e.g. NEKTAABC" style="flex:1;text-transform:uppercase"><button onclick="if(window.applyReferralCode)applyReferralCode(document.getElementById('ref-code-inp').value.trim());closeMdl()" class="pbtn" style="width:auto;padding:13px 16px;white-space:nowrap">Apply</button></div>
    </div>`);
}
function showCoinsPage(){toast('Coins feature removed','info');}
function showBadgesPage(){toast('Badges feature removed','info');}
function doLogout(){
  ['custName','custPhone','custAddress','custLatitude','custLongitude','userRole','riderPhone','nk_cart','nk_favs','nk_hist'].forEach(k=>localStorage.removeItem(k));
  cart={};favs=new Set();updateFCart();updateBadge();loadProfileUI();showView('home');toast('Logged out','info');
}
function checkLogin(fn){if(!localStorage.getItem('custPhone')){openOTPModal();}else if(typeof fn==='function')fn();}
function toggleLanguage(){
  if(window.toggleLanguage_feat) window.toggleLanguage_feat();
  else toast('Language feature loading...','info');
  const btn=document.getElementById('lang-btn');
  if(btn)btn.textContent=localStorage.getItem('nk_lang')==='te'?'🇮🇳 English':'🇮🇳 తెలుగు';
}

// --- HIDE/SHOW HEADER ON SCROLL ---
(function(){
  const homeView = document.getElementById('view-home');
  const hdr = document.querySelector('.hdr');
  if(!homeView || !hdr) return;
  let lastY = 0;
  homeView.addEventListener('scroll', function(){
    const y = homeView.scrollTop;
    if(y > lastY && y > 60){
      hdr.classList.add('hide-hdr');
    } else {
      hdr.classList.remove('hide-hdr');
    }
    lastY = y;
  }, {passive: true});
})();

// --- ANDROID HARDWARE BACK BUTTON ---
(function(){
  // Push a state so there's always something to pop
  history.pushState({nk:true}, '');
  window.addEventListener('popstate', function(){
    // Re-push so the back button keeps working
    history.pushState({nk:true}, '');
    if(window.handleBack) handleBack();
  });
})();

// --- EXPOSE ALL FUNCTIONS TO WINDOW ---
Object.assign(window,{
  cancelRider,confirmRider,launchRider,_navTo,
  doSwitchToRider,doSwitchToAdmin,backFromSpecial,
  showView,handleBack,adminTap,toggleExpressMode,
  openDModal,closeDModal,captureGPS,saveDDetails,
  openOTPModal,loadProfileUI,
  placeOrder,clearCart,
  openPD,closePD,pdToggleFav,selectCut,showAddReview,submitReview,
  addItem,chgQty,setQty,
  toCat:(...a)=>window.toCat&&window.toCat(...a)||typeof toCat!=='undefined'&&toCat(...a),
  setCat:(...a)=>window.setCat&&window.setCat(...a)||typeof setCat!=='undefined'&&setCat(...a),
  goSlide:(...a)=>window.goSlide&&window.goSlide(...a)||typeof goSlide!=='undefined'&&goSlide(...a),
  aTab,refreshAOrders,applyOrderFilter,showAssign,doAssign,aViewDetails,aUS,aConfirm,loadAdminContacts,filterContacts,markContactReplied,
  showAddRider,saveNewRider,loadARiders,
  filterStockList,toggleStock,
  acceptAlarm,dismissAlarm,
  rAction,refreshROrders,updateRMap,
  showMdl,closeMdl,
  showRates,showStoreAddr,showOrderHistory,showFavourites,showShops,showShoppingLists,
  showReferral,
  doLogout,checkLogin,openSupport,openNotifs,showInstallOption,
  toggleLanguage,rateDelivery,
  showNotifComposer:(...a)=>window.showNotifComposer&&window.showNotifComposer(...a),
});

// --- ADMIN FUNCTION ALIASES ---
// These map HTML onclick handlers to the correct function names
window.openAddProduct = window.showAddProduct || function(){ if(window.showAddProduct) showAddProduct(); };
window.openBulkUpload = function(){
  if(window._openBulkUpload) return window._openBulkUpload();
  // Fallback: open the standalone bulk manager
  window.open('nekta-bulk-manager.html', '_blank');
};
window.exportAllProducts = function(){
  if(window._exportAllProducts) return window._exportAllProducts();
  toast('Export available in Admin Dashboard tab', 'info');
};
window.openCategoryManager = function(){
  if(window._openCategoryManager) return window._openCategoryManager();
  toast('Category manager available in Admin Dashboard tab', 'info');
};
window.renderProductsPage = function(){
  if(window._renderProductsPage) return window._renderProductsPage();
  loadAProducts();
};
window.loadAllProducts = function(){
  if(window._loadAllProducts) return window._loadAllProducts();
  return Promise.resolve(window.products || []);
};
window.toggleSelectAllProducts = function(cb){ /* handled by catalog manager */ };
window.doBulkDelete = function(){ toast('Select products first', 'info'); };
window.doBulkArchive = function(){ toast('Select products first', 'info'); };


// ── PRODUCT UPDATE APPLY ────────────────────────────────────
function applyProductUpdate(){
  document.getElementById('update-modal').style.display='none';
  if(window.getLatestProductVersion){
    window.getLatestProductVersion().then(function(v){
      window.storeProductVersion(v);
      location.reload();
    }).catch(function(){ location.reload(); });
  } else {
    location.reload();
  }
}
window.applyProductUpdate = applyProductUpdate;

// ═══════════════════════════════════════════════════════════════════════════
// ─── RIDER MANAGEMENT CONSOLE HELPERS (Available on all pages) ────────────
// ═══════════════════════════════════════════════════════════════════════════

// View Active Riders List
window.showActiveRidersList = async function() {
  if (!window.db) { console.error('❌ Database not initialized'); return; }
  try {
    const snap = await window.db.collection('riders').where('isActive','==',true).get();
    if (snap.empty) {
      console.log('❌ No active riders');
      return [];
    }
    const riders = [];
    snap.docs.forEach(doc => {
      const r = doc.data();
      riders.push({
        id: doc.id,
        name: r.name,
        phone: r.phone,
        status: r.status,
        isActive: r.isActive,
        lastSeen: r.lastSeen
      });
    });
    console.table(riders);
    console.log(`✅ Total active riders: ${riders.length}`);
    return riders;
  } catch(e) { console.error('Error:', e.message); }
};

// Verify Rider Deletion
window.verifyRiderDeletion = async function(phone) {
  if (!window.db) { console.error('❌ Database not initialized'); return false; }
  console.log(`🔍 Checking if rider deleted: ${phone}`);
  try {
    const riderSnap = await window.db.collection('riders').where('phone','==',phone).get();
    if (!riderSnap.empty) {
      console.log('❌ Rider STILL EXISTS in database:');
      riderSnap.docs.forEach(doc => console.log('  Doc:', doc.id, doc.data()));
      return false;
    }
    const ordersSnap = await window.db.collection('orders').where('riderPhone','==',phone).limit(50).get();
    if (!ordersSnap.empty) {
      console.log('❌ Rider orders STILL EXIST:');
      ordersSnap.docs.forEach(doc => console.log('  Order:', doc.id));
      return false;
    }
    console.log('✅ Rider completely deleted (no records found)');
    return true;
  } catch(e) { console.error('Error:', e.message); return false; }
};

// Manual Cleanup for Orphaned Data
window.cleanupOrphanedRiderData = async function(phone) {
  if (!window.db) { console.error('❌ Database not initialized'); return; }
  if (!confirm(`🗑️ Delete ALL data for: ${phone}?`)) return;
  console.log('⏳ Cleaning up...');
  try {
    const batch = window.db.batch();
    const riderSnap = await window.db.collection('riders').where('phone','==',phone).get();
    riderSnap.docs.forEach(doc => batch.delete(doc.ref));
    const ordersSnap = await window.db.collection('orders').where('riderPhone','==',phone).orderBy('createdAt','desc').limit(200).get();
    ordersSnap.docs.forEach(doc => batch.delete(doc.ref));
    for (const doc of riderSnap.docs) {
      const ordersSnap2 = await window.db.collection('orders').where('assignedRider','==',doc.id).limit(50).get();
      ordersSnap2.docs.forEach(d => batch.delete(d.ref));
    }
    await batch.commit();
    console.log(`✅ Cleaned up all data for ${phone}`);
  } catch(e) { console.error('Error:', e.message); }
};

// Check Deactivated Riders
window.checkDeactivatedRiders = async function() {
  if (!window.db) { console.error('❌ Database not initialized'); return; }
  try {
    const snap = await window.db.collection('riders').where('isActive','==',false).get();
    if (snap.empty) {
      console.log('✅ No deactivated riders');
      return [];
    }
    const riders = [];
    snap.docs.forEach(doc => {
      const r = doc.data();
      riders.push({
        id: doc.id,
        name: r.name || 'Unknown',
        phone: r.phone,
        isActive: false
      });
    });
    console.table(riders);
    console.log(`⚠️ Found ${riders.length} deactivated riders`);
    return riders;
  } catch(e) { console.error('Error:', e.message); }
};
