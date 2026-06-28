// ═══════════════════════════════════════════════════════
// NEKTA FEATURES MODULE
// OTP Login, Referral, Shopping Lists, Gestures, Express
// ═══════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 1. FIREBASE OTP LOGIN
// ─────────────────────────────────────────────
let confirmationResult = null;
let recaptchaVerifier = null;

function closeOTPModal() {
  const m = document.getElementById('otp-modal');
  if (m) m.style.display = 'none';
  const ps = document.getElementById('otp-phone-step');
  const vs = document.getElementById('otp-verify-step');
  if (ps) ps.style.display = 'block';
  if (vs) vs.style.display = 'none';
  const inp = document.getElementById('otp-phone');
  if (inp) inp.value = '';
  const code = document.getElementById('otp-code');
  if (code) code.value = '';
}
window.closeOTPModal = closeOTPModal;

function initOTPLogin() {
  if (typeof firebase === 'undefined' || !firebase.auth) return;
  // Invisible recaptcha
  try {
    if (!recaptchaVerifier) {
      recaptchaVerifier = new firebase.auth.RecaptchaVerifier('otp-recaptcha', {
        size: 'invisible',
        callback: () => {},
      });
    }
  } catch(e) {
 }
}

async function sendOTP(phone) {
  if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
    showToastMsg('Enter valid 10-digit phone number', 'error'); return;
  }
  try {
    showToastMsg('Sending OTP...', 'info');
    if (!recaptchaVerifier) initOTPLogin();
    confirmationResult = await firebase.auth().signInWithPhoneNumber('+91' + phone, recaptchaVerifier);
    showOTPStep(phone);
    showToastMsg('OTP sent to +91' + phone, 'success');
    startOTPTimer();
  } catch(e) {
    // If Firebase Phone Auth not enabled in console, use name+phone fallback
    if (e.code === 'auth/operation-not-allowed' || e.code === 'auth/invalid-api-key' || e.message?.includes('not enabled')) {
      showToastMsg('Saving your details...', 'info');
      localStorage.setItem('custPhone', phone);
      localStorage.setItem('nk_loggedIn', 'true');
      closeOTPModal();
      onLoginSuccess(phone);
    } else if (e.code === 'auth/too-many-requests' || e.code === 'auth/quota-exceeded') {
      // SMS daily limit hit - do NOT bypass auth, show proper error
      showToastMsg('OTP limit reached. Please try again after some time.', 'error');
      if (recaptchaVerifier) { try { recaptchaVerifier.clear(); } catch(re){} recaptchaVerifier = null; }
    } else if (e.code === 'auth/captcha-check-failed' || e.code === 'auth/invalid-app-credential') {
      // reCAPTCHA failed - reset and retry
      if (recaptchaVerifier) { try { recaptchaVerifier.clear(); } catch(re){} recaptchaVerifier = null; }
      showToastMsg('Security check failed. Please refresh and try again.', 'error');
    } else {
      // Generic error - show message, do NOT bypass auth
      showToastMsg('Login failed: ' + (e.message || 'Unknown error. Try again.'), 'error');
      if (recaptchaVerifier) { try { recaptchaVerifier.clear(); } catch(re){} recaptchaVerifier = null; }
    }
  }
}

async function verifyOTP(otp) {
  if (!otp || otp.length !== 6) { showToastMsg('Enter 6-digit OTP', 'error'); return; }
  try {
    showToastMsg('Verifying...', 'info');
    if (confirmationResult) {
      const result = await confirmationResult.confirm(otp);
      const phone = result.user.phoneNumber.replace('+91', '');
      localStorage.setItem('custPhone', phone);
      localStorage.setItem('nk_loggedIn', 'true');
      closeOTPModal();
      onLoginSuccess(phone);
      showToastMsg('✅ Logged in successfully!', 'success');
    }
  } catch(e) {
    showToastMsg('Wrong OTP. Try again.', 'error');
  }
}

function showOTPStep(phone) {
  document.getElementById('otp-phone-step').style.display = 'none';
  document.getElementById('otp-verify-step').style.display = 'block';
  document.getElementById('otp-phone-display').textContent = '+91 ' + phone;
}

let otpTimer = null;
function startOTPTimer() {
  let secs = 30;
  const el = document.getElementById('otp-timer');
  if (el) el.textContent = `Resend in ${secs}s`;
  otpTimer = setInterval(() => {
    secs--;
    if (el) el.textContent = secs > 0 ? `Resend in ${secs}s` : 'Resend OTP';
    if (secs <= 0) { clearInterval(otpTimer); }
  }, 1000);
}

function onLoginSuccess(phone) {
  if (window.loadProfileUI) loadProfileUI();
  showToastMsg('Welcome! 👋', 'success');
  // ── Sync user data from Firestore (cross-device support) ──────
  _syncUserFromFirestore(phone);
}

// Sync cart, favourites, order history from Firestore to localStorage
// This enables cross-device access and prevents data loss on browser clear
async function _syncUserFromFirestore(phone) {
  if (!window.db || !phone) return;
  try {
    var doc = await window.db.collection('users').doc(phone).get();
    if (doc.exists) {
      var data = doc.data();
      // Restore cart if localStorage is empty
      if (data.cart && Object.keys(JSON.parse(localStorage.getItem('nk_cart') || '{}')).length === 0) {
        localStorage.setItem('nk_cart', JSON.stringify(data.cart));
        if (window.loadCart) loadCart();
      }
      // Restore favourites if localStorage is empty
      if (data.favs && JSON.parse(localStorage.getItem('nk_favs') || '[]').length === 0) {
        localStorage.setItem('nk_favs', JSON.stringify(data.favs));
      }
      // Restore name/address if missing
      if (data.name && !localStorage.getItem('custName'))
        localStorage.setItem('custName', data.name);
      if (data.address && !localStorage.getItem('custAddress'))
        localStorage.setItem('custAddress', data.address);
    }
  } catch(e) { console.warn('Firestore sync failed:', e); }
}
window._syncUserFromFirestore = _syncUserFromFirestore;

// Save user data to Firestore (call this when cart/favs change)
async function _saveUserToFirestore(phone) {
  if (!window.db || !phone) return;
  try {
    await window.db.collection('users').doc(phone).set({
      cart: JSON.parse(localStorage.getItem('nk_cart') || '{}'),
      favs: JSON.parse(localStorage.getItem('nk_favs') || '[]'),
      name: localStorage.getItem('custName') || '',
      address: localStorage.getItem('custAddress') || '',
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch(e) { console.warn('Firestore save failed:', e); }
}
window._saveUserToFirestore = _saveUserToFirestore;

// ─────────────────────────────────────────────
// 2. REFERRAL SYSTEM
// ─────────────────────────────────────────────
function generateReferralCode() {
  const name = localStorage.getItem('custName') || 'USER';
  const code = 'NEKTA' + name.replace(/\s/g,'').toUpperCase().slice(0,4) + Math.random().toString(36).slice(2,5).toUpperCase();
  localStorage.setItem('nk_ref_code', code);
  return code;
}
function getReferralCode() {
  return localStorage.getItem('nk_ref_code') || generateReferralCode();
}
function applyReferralCode(code) {
  if (!code) { showToastMsg('Enter referral code', 'error'); return; }
  const myCode = getReferralCode();
  if (code === myCode) { showToastMsg("You can't use your own code!", 'warning'); return; }
  const used = localStorage.getItem('nk_ref_used');
  if (used) { showToastMsg('Referral already applied', 'warning'); return; }
  localStorage.setItem('nk_ref_used', code);
  showToastMsg('Referral code saved!', 'success');
}
function shareReferral() {
  const code = getReferralCode();
  const msg = `🛒 Order fresh groceries on Nekta app in Kothagudem!\nUse my referral code *${code}* and get ₹50 off your first order!\nDownload: ${window.location.href}`;
  if (navigator.share) {
    navigator.share({ title: 'Nekta Groceries', text: msg });
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }
}

// Register user's referral code in Firebase
function registerReferralCode() {
  const code = getReferralCode();
  const phone = localStorage.getItem('custPhone');
  if (!phone || !window.db) return;
  window.db.collection('referrals').doc(code).set({ code, phone, createdAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
}

// ─────────────────────────────────────────────
// 3. SHOPPING LISTS
// ─────────────────────────────────────────────
function getShoppingLists() {
  return JSON.parse(localStorage.getItem('nk_lists') || '[]');
}
function saveShoppingLists(lists) {
  localStorage.setItem('nk_lists', JSON.stringify(lists));
}
function createShoppingList(name) {
  if (!name.trim()) { showToastMsg('Enter list name', 'error'); return; }
  const lists = getShoppingLists();
  lists.push({ id: Date.now(), name: name.trim(), items: [], createdAt: new Date().toISOString() });
  saveShoppingLists(lists);
  showToastMsg(`"${name}" list created!`, 'success');
  return lists[lists.length - 1];
}
function addToShoppingList(listId, productId) {
  const lists = getShoppingLists();
  const list = lists.find(l => l.id === listId);
  if (!list) return;
  if (!list.items.includes(productId)) {
    list.items.push(productId);
    saveShoppingLists(lists);
    const p = products?.find(x => x.id === productId);
    showToastMsg(`Added to "${list.name}"`, 'success');
  }
}
function loadListToCart(listId) {
  const lists = getShoppingLists();
  const list = lists.find(l => l.id === listId);
  if (!list || !list.items.length) { showToastMsg('List is empty', 'warning'); return; }
  list.items.forEach(id => {
    if (!window.cart[id]) window.cart[id] = { qty: 1, cost: window.itemCost ? window.itemCost(id, 1) : 0 };
  });
  if (window.saveCart) window.saveCart();
  if (window.updateFCart) window.updateFCart();
  if (window.updateBadge) window.updateBadge();
  showToastMsg(`${list.items.length} items added to cart!`, 'success');
}
function deleteShoppingList(listId) {
  const lists = getShoppingLists().filter(l => l.id !== listId);
  saveShoppingLists(lists);
}

// ─────────────────────────────────────────────
// 4. 10-MINUTE EXPRESS DELIVERY
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// 8. SCHEDULED DELIVERY
// ─────────────────────────────────────────────
const TIME_SLOTS = [
  { id: 'asap', label: 'ASAP', sub: '15–20 minutes', icon: '⚡' },
  { id: 'express', label: '10-Min Express', sub: 'Ultra fast delivery', icon: '🚀', extraFee: 10 },
  { id: 'slot1', label: '7 AM – 9 AM', sub: 'Early morning', icon: '🌅' },
  { id: 'slot2', label: '9 AM – 12 PM', sub: 'Morning', icon: '☀️' },
  { id: 'slot3', label: '12 PM – 3 PM', sub: 'Afternoon', icon: '🌤️' },
  { id: 'slot4', label: '3 PM – 6 PM', sub: 'Evening', icon: '🌇' },
  { id: 'slot5', label: '6 PM – 9 PM', sub: 'Night', icon: '🌙' },
  { id: 'slot6', label: '9 PM – 11 PM', sub: 'Late night', icon: '🌃' },
];
function getSelectedSlot() { return localStorage.getItem('nk_delivery_slot') || 'asap'; }
function setDeliverySlot(slotId) {
  localStorage.setItem('nk_delivery_slot', slotId);
  const slot = TIME_SLOTS.find(s => s.id === slotId);
  showToastMsg(`${slot?.icon} Delivery slot: ${slot?.label}`, 'success');
}

// ─────────────────────────────────────────────
// 9. MOBILE GESTURE SYSTEM
// ─────────────────────────────────────────────
function initGestures() {
  let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
  let isPullRefreshing = false;

  document.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }, { passive: true });

  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const dt = Date.now() - touchStartTime;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);

    // Swipe RIGHT from left edge → go back
    if (touchStartX < 30 && dx > 80 && absDy < 60 && dt < 400) {
      handleBackGesture();
    }

    // Swipe LEFT on catalog → next category
    if (absDx > 80 && absDy < 40 && dt < 300) {
      const curview = window.curview;
      if (curview === 'catalog') {
        if (dx < 0) swipeCatalogNext();
        else swipeCatalogPrev();
      }
    }

    // Double tap to favourite (on product cards)
    if (absDx < 10 && absDy < 10 && dt < 300) {
      const card = e.target.closest('[id^="fpc-"]');
      if (card) {
        const id = parseInt(card.id.replace('fpc-', ''));
        handleDoubleTap(id, e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      }
    }
  }, { passive: true });

  // Pull to refresh
  document.addEventListener('touchmove', e => {
    const view = document.getElementById(`view-${window.curview}`);
    if (!view) return;
    if (view.scrollTop === 0) {
      const dy = e.touches[0].clientY - touchStartY;
      if (dy > 60 && !isPullRefreshing) {
        showPullRefreshIndicator();
        isPullRefreshing = true;
      }
    }
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (isPullRefreshing) {
      hidePullRefreshIndicator();
      isPullRefreshing = false;
      handlePullRefresh();
    }
  }, { passive: true });

  // Keyboard handling for desktop
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      // Close any open modal
      document.querySelectorAll('.mov').forEach(m => m.remove());
      document.querySelectorAll('.lottie-overlay.on').forEach(m => m.classList.remove('on'));
    }
    if (e.key === 'Backspace' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      handleBackGesture();
    }
  });

  // Android hardware back button via History API
  window.history.pushState({ page: 'home' }, '');
  window.addEventListener('popstate', () => {
    handleBackGesture();
    window.history.pushState({ page: 'current' }, '');
  });
}

const viewHistory = ['home'];
window.viewHistory = viewHistory;
function handleBackGesture() {
  // Close modals first
  const modals = document.querySelectorAll('.mov');
  if (modals.length) { modals[modals.length - 1].remove(); return; }

  const overlays = document.querySelectorAll('.lottie-overlay.on');
  if (overlays.length) { overlays[0].classList.remove('on'); return; }

  // Close rider login screen if open
  const rlScreen = document.getElementById('rl-screen');
  if (rlScreen && rlScreen.classList.contains('on')) {
    if (window.cancelRider) cancelRider(); return;
  }

  if (document.getElementById('srch-ov').classList.contains('on')) {
    if (window.closeSearch) closeSearch(); return;
  }

  if (document.getElementById('d-modal').classList.contains('open')) {
    if (window.closeDModal) closeDModal(); return;
  }

  const pdPage = document.getElementById('pd-page');
  if (pdPage && pdPage.classList.contains('on')) {
    if (window.closeProductDetail) closeProductDetail(); return;
  }

  // If on admin/rider view, use backFromSpecial to properly clean up
  const curview = window.curview;
  if (curview === 'admin' || curview === 'rider') {
    if (window.backFromSpecial) backFromSpecial(); return;
  }

  // Navigate back in view history
  if (viewHistory.length > 1) {
    viewHistory.pop();
    const prev = viewHistory[viewHistory.length - 1];
    if (window.showView) showView(prev);
  }
}

let doubleTapTimer = null, lastTapId = null;
function handleDoubleTap(id, x, y) {
  if (lastTapId === id && doubleTapTimer) {
    // Double tap detected
    clearTimeout(doubleTapTimer);
    doubleTapTimer = null;
    lastTapId = null;
    if (window.toggleFav) {
      toggleFav(id);
      showHeartAnimation(x, y);
    }
  } else {
    lastTapId = id;
    doubleTapTimer = setTimeout(() => { doubleTapTimer = null; lastTapId = null; }, 400);
  }
}

function showHeartAnimation(x, y) {
  const heart = document.createElement('div');
  heart.textContent = '❤️';
  heart.style.cssText = `position:fixed;left:${x}px;top:${y}px;font-size:36px;z-index:9999;pointer-events:none;animation:heartFloat 1s ease forwards`;
  const style = document.createElement('style');
  style.textContent = '@keyframes heartFloat{0%{transform:scale(0);opacity:1}50%{transform:scale(1.5);opacity:1}100%{transform:scale(1) translateY(-80px);opacity:0}}';
  document.head.appendChild(style);
  document.body.appendChild(heart);
  setTimeout(() => heart.remove(), 1000);
}

function showPullRefreshIndicator() {
  let ind = document.getElementById('pull-refresh');
  if (!ind) {
    ind = document.createElement('div');
    ind.id = 'pull-refresh';
    ind.style.cssText = 'position:fixed;top:calc(var(--st,0px) + 10px);left:50%;transform:translateX(-50%);background:#059669;color:#fff;padding:8px 20px;border-radius:20px;font-size:12px;font-weight:700;z-index:9999;font-family:var(--font);display:flex;align-items:center;gap:6px';
    ind.innerHTML = '<i class="fas fa-sync-alt" style="animation:spin 1s linear infinite"></i> Refreshing…';
    document.body.appendChild(ind);
  }
}
function hidePullRefreshIndicator() {
  const ind = document.getElementById('pull-refresh');
  if (ind) setTimeout(() => ind.remove(), 800);
}
function handlePullRefresh() {
  const v = window.curview;
  if (v === 'home' && window.renderHSecs) renderHSecs();
  if (v === 'catalog' && window.renderCGrid) renderCGrid(window.activecat || 'ALL');
  if (v === 'profile' && window.initTracking) initTracking();
}

let catIdx = 0;
const catList = ['ALL','VEGETABLES','LEAFY','FRUITS','DAIRY','GRAINS','OILS','SPICES','SNACKS','CHOCOLATES','DRINKS','NONVEG','EASYCOOK','PERSONALCARE','PANSHOP'];
function swipeCatalogNext() { catIdx = (catIdx + 1) % catList.length; if(window.setCat) setCat(catList[catIdx]); }
function swipeCatalogPrev() { catIdx = (catIdx - 1 + catList.length) % catList.length; if(window.setCat) setCat(catList[catIdx]); }

// ─────────────────────────────────────────────
// 11. TELUGU LANGUAGE TOGGLE
// ─────────────────────────────────────────────
let currentLang = localStorage.getItem('nk_lang') || 'en';
const TRANSLATIONS = {
  en: {
    'home': 'Home', 'catalog': 'Catalog', 'cart': 'Cart', 'profile': 'Profile',
    'add': 'ADD', 'search': 'Search milk, veggies, snacks…',
    'place_order': 'Place Order', 'deliver_to': 'Delivering to',
    'your_cart': 'Your Cart', 'total': 'Total Payable',
    'delivery_fee': 'Delivery Fee', 'items_total': 'Items Total',
  },
  te: {
    'home': 'హోమ్', 'catalog': 'కేటలాగ్', 'cart': 'కార్ట్', 'profile': 'ప్రొఫైల్',
    'add': 'జోడించు', 'search': 'పాలు, కూరగాయలు వెతకండి…',
    'place_order': 'ఆర్డర్ చేయండి', 'deliver_to': 'డెలివరీ చేయడానికి',
    'your_cart': 'మీ కార్ట్', 'total': 'మొత్తం చెల్లించవలసింది',
    'delivery_fee': 'డెలివరీ చార్జి', 'items_total': 'వస్తువుల మొత్తం',
  }
};
function t(key) { return TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS.en[key] || key; }
function toggleLanguage_feat() {
  currentLang = currentLang === 'en' ? 'te' : 'en';
  localStorage.setItem('nk_lang', currentLang);
  applyLanguage();
  showToastMsg(currentLang === 'te' ? 'తెలుగు భాష ఎంచుకున్నారు! 🙏' : 'English selected!', 'success');
}
window.toggleLanguage_feat = toggleLanguage_feat;
function applyLanguage() {
  document.querySelectorAll('[data-t]').forEach(el => {
    const key = el.getAttribute('data-t');
    el.textContent = t(key);
  });
}

// ─────────────────────────────────────────────
// 12. REORDER (One Tap)
// ─────────────────────────────────────────────
function reorder(historyIndex) {
  const hist = JSON.parse(localStorage.getItem('nk_hist') || '[]');
  const order = hist[historyIndex];
  if (!order || !order.itemIds) { showToastMsg('Cannot reorder this item', 'warning'); return; }
  order.itemIds.forEach(id => {
    if (window.cart && window.itemCost) {
      window.cart[id] = { qty: 1, cost: window.itemCost(id, 1) };
    }
  });
  if (window.saveCart) saveCart();
  if (window.updateFCart) updateFCart();
  if (window.updateBadge) updateBadge();
  showToastMsg(`${order.itemIds.length} items added to cart! 🛒`, 'success');
  if (window.showView) showView('cart');
}

// ─────────────────────────────────────────────
// 13. GROUP / COLONY ORDERING
// ─────────────────────────────────────────────
function createGroupOrder() {
  const groupId = 'GRP' + Date.now().toString(36).toUpperCase();
  const shareUrl = `${window.location.href}?group=${groupId}`;
  const msg = `🏘️ Join our Nekta group order!\n\nAdd your items and we'll deliver together to our colony.\n\nGroup link: ${shareUrl}\n\nSave ₹10 on delivery when we order together! 🛒`;
  if (navigator.share) {
    navigator.share({ title: 'Nekta Group Order', url: shareUrl, text: msg });
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }
  showToastMsg('Group order link shared!', 'success');
}

// Helper: Show toast from this module
function showToastMsg(msg, type) {
  if (window.toast) { window.toast(msg, type); }
  else {
 }
}

// ─────────────────────────────────────────────
// 14. DELIVERY DISTANCE & CHARGE CALCULATION
// Store: 3-1-54/3 Hanumanbasthi, Kothagudem
// ─────────────────────────────────────────────
// STORE_LAT/STORE_LNG are set by firebase-config.js (loaded before features.js)
const _STORE_LAT = window.STORE_LAT || 17.549395259963312;
const _STORE_LNG = window.STORE_LNG || 80.6274729902068;
// Max valid radius from store (50 km) — rejects IP-based Hyderabad coords
const _MAX_VALID_KM = 15; // Delivery area: Kothagudem + Ramavaram + Rudrampur (~15km radius)
const _GMAPS_API_KEY = window.__GMAPS_API_KEY__ || window.__FIREBASE_API_KEY__ || '';
const _DISTANCE_CACHE = {}; // Cache for Google Maps distances to avoid API calls

// 🔴 STRAIGHT-LINE DISTANCE (HAVERSINE) — FALLBACK ONLY
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2)
    + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180)
    * Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
window.haversineKm = haversineKm;

// 🟢 ESTIMATED ROUTE DISTANCE (async)
// Returns {distanceKm, durationMins, isRouteDistance: false}
// Note: Uses Haversine formula * 1.3 road factor (not actual Google Maps route)
async function getActualRouteDistance(lat1, lng1, lat2, lng2) {
  // Google Maps Distance Matrix API is CORS blocked in browser.
  // Using Haversine * 1.3 road-factor — good estimate for Kothagudem.
  try {
    const cacheKey = lat1.toFixed(4) + ',' + lng1.toFixed(4) + '-' + lat2.toFixed(4) + ',' + lng2.toFixed(4);
    if (_DISTANCE_CACHE[cacheKey] && Date.now() - _DISTANCE_CACHE[cacheKey].time < 3600000) {
      return _DISTANCE_CACHE[cacheKey].data;
    }
    const straightKm = haversineKm(lat1, lng1, lat2, lng2);
    const roadKm = parseFloat((straightKm * 1.3).toFixed(2));
    const result = {
      distanceKm: roadKm,
      durationMins: Math.ceil((roadKm / 20) * 60),
      isRouteDistance: false  // Not a real route distance — Haversine estimate
    };
    _DISTANCE_CACHE[cacheKey] = { data: result, time: Date.now() };
    return result;
  } catch (error) {
    console.warn('getActualRouteDistance failed:', error.message);
    return null;
  }
}
window.getActualRouteDistance = getActualRouteDistance;

// Get actual distance with fallback to haversine
async function getDistance(userLat, userLng) {
  // First try Google Maps API
  const routeData = await getActualRouteDistance(_STORE_LAT, _STORE_LNG, userLat, userLng);
  
  if (routeData && routeData.isRouteDistance) {
    return routeData.distanceKm;
  }
  
  // Fallback to haversine if API fails
  return haversineKm(_STORE_LAT, _STORE_LNG, userLat, userLng);
}

// Returns delivery charge in ₹ based on ACTUAL ROUTE distance from store
function calculateDeliveryCharge(lat, lng, actualDistanceKm = null) {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) return 20;
  
  // Use provided distance or calculate from haversine (synchronous fallback)
  const dist = actualDistanceKm !== null ? actualDistanceKm : haversineKm(_STORE_LAT, _STORE_LNG, lat, lng);
  
  // Reject coordinates that are too far — likely IP-based (e.g. Hyderabad)
  if (dist > _MAX_VALID_KM) {
    console.warn('📍 Location too far from store (' + dist.toFixed(1) + ' km) — likely IP-based. Using default ₹20.');
    return 20;
  }
  if (dist <= 1)  return 20;
  if (dist <= 2)  return 25;
  if (dist <= 3)  return 30;
  if (dist <= 4)  return 35;
  if (dist <= 5)  return 40;
  if (dist <= 6)  return 50;
  if (dist <= 8)  return 60;
  if (dist <= 10) return 80;
  // Beyond 10 km: ₹80 base + ₹10 per extra km
  return 80 + Math.ceil(dist - 10) * 10;
}
window.calculateDeliveryCharge = calculateDeliveryCharge;

// Returns breakdown object used in cart bill details
function getDeliveryBreakdown(lat, lng, actualDistanceKm = null) {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    return { base: 20, distFee: 0, total: 20, dist: 0, distanceType: 'fallback' };
  }
  
  const dist = actualDistanceKm !== null ? actualDistanceKm : haversineKm(_STORE_LAT, _STORE_LNG, lat, lng);
  
  if (dist > _MAX_VALID_KM) {
    return { base: 20, distFee: 0, total: 20, dist: 0, distanceType: 'fallback' };
  }
  const total = calculateDeliveryCharge(lat, lng, actualDistanceKm);
  const base = 20;
  const distFee = Math.max(0, total - base);
  return { base, distFee, total, dist: Math.round(dist * 10) / 10, distanceType: actualDistanceKm ? 'route' : 'fallback' };
}
window.getDeliveryBreakdown = getDeliveryBreakdown;

// Async version that fetches actual route distance
async function getDeliveryBreakdownAsync(lat, lng) {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    return { base: 20, distFee: 0, total: 20, dist: 0, distanceType: 'fallback' };
  }
  
  const actualDist = await getDistance(lat, lng);
  return getDeliveryBreakdown(lat, lng, actualDist);
}
window.getDeliveryBreakdownAsync = getDeliveryBreakdownAsync;

// Validates that GPS coords are within service area (Kothagudem ~50km radius)
// Call this after getting GPS to warn user if location looks wrong
function validateServiceArea(lat, lng) {
  if (!lat || !lng) return false;
  const dist = haversineKm(_STORE_LAT, _STORE_LNG, lat, lng);
  return dist <= _MAX_VALID_KM;
}
window.validateServiceArea = validateServiceArea;
