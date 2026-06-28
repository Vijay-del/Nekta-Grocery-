// ── NEKTA AUTH — Email + Phone + Profile + FCM Token Save ──────
'use strict';

// ── 1. EMAIL LOGIN / REGISTER ──────────────────────────────────
// Call: loginWithEmail('user@gmail.com', 'password123')
async function loginWithEmail(email, password) {
  if (!email || !password) { toast('Enter email and password', 'error'); return; }
  if (!/\S+@\S+\.\S+/.test(email)) { toast('Enter valid email', 'error'); return; }
  if (password.length < 6) { toast('Password must be 6+ characters', 'error'); return; }

  try {
    toast('Signing in...', 'info');
    let result;
    try {
      result = await firebase.auth().signInWithEmailAndPassword(email, password);
    } catch(e) {
      if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
        // Auto-create account if not found
        result = await firebase.auth().createUserWithEmailAndPassword(email, password);
        toast('Account created! Welcome 🎉', 'success');
      } else {
        throw e;
      }
    }
    const user = result.user;
    localStorage.setItem('nk_loggedIn', 'true');
    // Save email as identifier so profile works
    if (!localStorage.getItem('custName') && user.displayName) {
      localStorage.setItem('custName', user.displayName);
    }
    // Close OTP modal if open
    const m = document.getElementById('otp-modal');
    if (m) { m.style.display = 'none'; m.classList.remove('on'); }
    onEmailLoginSuccess(user);
  } catch(e) {
    const msgs = {
      'auth/wrong-password':        'Wrong password. Try again.',
      'auth/invalid-email':         'Invalid email address.',
      'auth/too-many-requests':     'Too many attempts. Try later.',
      'auth/email-already-in-use':  'Email already registered. Try signing in.',
      'auth/weak-password':         'Password too weak (min 6 chars).',
      'auth/network-request-failed':'No internet connection.',
    };
    toast(msgs[e.code] || e.message, 'error');
  }
}
window.loginWithEmail = loginWithEmail;

function onEmailLoginSuccess(user) {
  const email = user.email || '';
  toast('Welcome! ' + (user.displayName || email) + ' 👋', 'success');
  if (window.loadProfileUI) loadProfileUI();
  // Sync profile from Firestore
  _syncEmailUserProfile(user);
  // Save FCM token for this user
  _saveFCMTokenForUser(user.uid, email);
}

async function _syncEmailUserProfile(user) {
  if (!window.db) return;
  try {
    const doc = await window.db.collection('users').doc(user.uid).get();
    if (doc.exists) {
      const d = doc.data();
      // Restore profile data
      if (d.name)    localStorage.setItem('custName',    d.name);
      if (d.phone)   localStorage.setItem('custPhone',   d.phone);
      if (d.address) localStorage.setItem('custAddress', d.address);
      if (d.lat)     localStorage.setItem('custLatitude',  String(d.lat));
      if (d.lng)     localStorage.setItem('custLongitude', String(d.lng));
      // Restore cart, favs, history only if local is empty
      if (d.cart && d.cart !== '{}' && (!localStorage.getItem('nk_cart') || localStorage.getItem('nk_cart') === '{}'))
        localStorage.setItem('nk_cart', d.cart);
      if (d.favs && d.favs !== '[]' && (!localStorage.getItem('nk_favs') || localStorage.getItem('nk_favs') === '[]'))
        localStorage.setItem('nk_favs', d.favs);
      if (d.hist && d.hist !== '[]' && (!localStorage.getItem('nk_hist') || localStorage.getItem('nk_hist') === '[]'))
        localStorage.setItem('nk_hist', d.hist);
    }
    // Update last login timestamp
    await window.db.collection('users').doc(user.uid).set({
      email:       user.email || '',
      lastLogin:   firebase.firestore.FieldValue.serverTimestamp(),
      loginMethod: 'email',
    }, { merge: true });
  } catch(e) {}
  if (window.loadProfileUI) loadProfileUI();
  if (window.loadCart) loadCart();
  if (window.updateFCart) updateFCart();
  if (window.updateBadge) updateBadge();
}

// ── 2. PASSWORD RESET ──────────────────────────────────────────
// Call: resetPassword('user@gmail.com')
async function resetPassword(email) {
  if (!email) { toast('Enter your email first', 'error'); return; }
  try {
    await firebase.auth().sendPasswordResetEmail(email);
    toast('Reset email sent! Check your inbox 📧', 'success');
  } catch(e) {
    toast(e.message, 'error');
  }
}
window.resetPassword = resetPassword;

// ── 3. LOGOUT ──────────────────────────────────────────────────
async function doLogout() {
  var user = firebase.auth ? firebase.auth().currentUser : null;

  // Save all data to Firestore BEFORE signing out so it restores on next login
  if (user && window.db) {
    try {
      await window.db.collection('users').doc(user.uid).set({
        name:    localStorage.getItem('custName')    || '',
        phone:   localStorage.getItem('custPhone')   || '',
        address: localStorage.getItem('custAddress') || '',
        cart:    localStorage.getItem('nk_cart')     || '{}',
        favs:    localStorage.getItem('nk_favs')     || '[]',
        hist:    localStorage.getItem('nk_hist')     || '[]',
        lat:     localStorage.getItem('custLatitude')  || '',
        lng:     localStorage.getItem('custLongitude') || '',
        savedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch(e) {}
  }

  // Sign out from Firebase only
  try { await firebase.auth().signOut(); } catch(e) {}

  // Only remove auth flag — keep ALL profile/cart/history/address data
  localStorage.removeItem('nk_loggedIn');
  localStorage.removeItem('userRole');
  localStorage.removeItem('nk_ob_done'); // so sign-in screen shows after logout

  if (window.loadProfileUI) loadProfileUI();
  toast('Logged out 👋', 'info');
  if (window.showView) showView('home');
  // Show sign-in screen after short delay
  setTimeout(function(){
    if (window._checkOnboarding) window._checkOnboarding();
  }, 400);
}
window.doLogout = doLogout;

// ── 4. UPDATE USER PROFILE TO FIRESTORE ───────────────────────
// Call: saveUserProfile() — reads from localStorage, saves to Firestore
async function saveUserProfile(extraData) {
  const user  = firebase.auth ? firebase.auth().currentUser : null;
  const phone = localStorage.getItem('custPhone');
  if (!window.db) return;

  const docId = (user && user.uid) ? user.uid : phone;
  if (!docId) return;

  const profileData = Object.assign({
    name:      localStorage.getItem('custName')    || '',
    phone:     phone || (user && user.phoneNumber) || '',
    email:     (user && user.email)                || '',
    address:   localStorage.getItem('custAddress') || '',
    lat:       parseFloat(localStorage.getItem('custLatitude'))  || null,
    lng:       parseFloat(localStorage.getItem('custLongitude')) || null,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, extraData || {});

  try {
    await window.db.collection('users').doc(docId).set(profileData, { merge: true });
    toast('Profile saved ✅', 'success');
  } catch(e) {
    toast('Save failed: ' + e.message, 'error');
  }
}
window.saveUserProfile = saveUserProfile;

// ── 5. LOAD PROFILE FROM FIRESTORE ────────────────────────────
// Call: loadUserProfile() — fetches from Firestore, syncs to localStorage
async function loadUserProfile() {
  const user  = firebase.auth ? firebase.auth().currentUser : null;
  const phone = localStorage.getItem('custPhone');
  if (!window.db) return;

  const docId = (user && user.uid) ? user.uid : phone;
  if (!docId) return;

  try {
    const doc = await window.db.collection('users').doc(docId).get();
    if (doc.exists) {
      const d = doc.data();
      if (d.name)    localStorage.setItem('custName',    d.name);
      if (d.phone)   localStorage.setItem('custPhone',   d.phone);
      if (d.address) localStorage.setItem('custAddress', d.address);
      if (d.lat)     localStorage.setItem('custLatitude',  d.lat);
      if (d.lng)     localStorage.setItem('custLongitude', d.lng);
      if (window.loadProfileUI) loadProfileUI();
    }
  } catch(e) {}
}
window.loadUserProfile = loadUserProfile;

// ── 6. AUTH STATE LISTENER — auto-sync on login/logout ────────
// This fires automatically whenever auth state changes
firebase.auth && firebase.auth().onAuthStateChanged(function(user) {
  if (user) {
    localStorage.setItem('nk_loggedIn', 'true');
    // Sync profile data from Firestore on every login
    _syncEmailUserProfile(user);
    // Save FCM token
    _saveFCMTokenForUser(user.uid, user.email || user.phoneNumber || '');
  }
});

// ── 7. FCM TOKEN SAVE (ties push notifications to user account) ─
function _saveFCMTokenForUser(uid, identifier) {
  if (!window.__FCM_VAPID_KEY__ || !firebase.messaging) return;
  try {
    const messaging = firebase.messaging();
    messaging.getToken({ vapidKey: window.__FCM_VAPID_KEY__ }).then(function(token) {
      if (!token || !window.db) return;
      window.db.collection('fcm_tokens').doc(uid || identifier).set({
        token:      token,
        uid:        uid        || '',
        identifier: identifier || '',
        updatedAt:  new Date().toISOString(),
      }, { merge: true }).catch(function(){});
    }).catch(function(){});
  } catch(e) {}
}
window._saveFCMTokenForUser = _saveFCMTokenForUser;

// ── 8. GET ALL USER ORDERS FROM FIRESTORE ─────────────────────
// Call: getUserOrders() — returns array of this user's orders
async function getUserOrders() {
  if (!window.db) return [];
  const phone = localStorage.getItem('custPhone');
  const user  = firebase.auth ? firebase.auth().currentUser : null;
  if (!phone && !user) return [];

  try {
    const bare = String(phone || '').replace(/\D/g, '').slice(-10);
    const withCountry = '+91' + bare;
    const snapBare = bare ? await window.db.collection('orders')
      .where('customerPhone', '==', bare)
      .orderBy('createdAt', 'desc').limit(20).get()
      .catch(function() { return { docs: [] }; }) : { docs: [] };
    const snapFull = await window.db.collection('orders')
      .where('customerPhone', '==', withCountry)
      .orderBy('createdAt', 'desc').limit(20).get()
      .catch(function() { return { docs: [] }; });

    const seen = new Set();
    return [...snapBare.docs, ...snapFull.docs]
      .filter(function(d) {
        if (seen.has(d.id)) return false;
        seen.add(d.id); return true;
      })
      .map(function(d) { return Object.assign({ id: d.id }, d.data()); })
      .sort(function(a, b) {
        return ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0);
      });
  } catch(e) { return []; }
}
window.getUserOrders = getUserOrders;

// ── 9. SEND PUSH NOTIFICATION (from admin — calls Cloud Function or RTDB trigger) ─
// Call: sendPushToUser(phone, 'Order Ready!', 'Your order is packed.')
async function sendPushToUser(phone, title, body) {
  if (!window.db) return;
  try {
    // Write to a 'notifications_queue' collection — your Cloud Function can pick this up
    await window.db.collection('notifications_queue').add({
      phone:     phone,
      title:     title,
      body:      body,
      sent:      false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch(e) {}
}
window.sendPushToUser = sendPushToUser;

// ── 10. LIVE LOCATION WATCHER ─────────────────────────────────
// Call: startLiveLocationWatch() — continuously updates user location in Firestore
let _locationWatchId = null;
function startLiveLocationWatch() {
  if (!navigator.geolocation) return;
  if (_locationWatchId) return; // already watching

  _locationWatchId = navigator.geolocation.watchPosition(function(pos) {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    localStorage.setItem('custLatitude',  lat);
    localStorage.setItem('custLongitude', lng);
    localStorage.setItem('custLocTs',     Date.now());

    // Save to Firestore user doc (throttled — only if changed significantly)
    const phone = localStorage.getItem('custPhone');
    const user  = firebase.auth ? firebase.auth().currentUser : null;
    const docId = (user && user.uid) ? user.uid : phone;
    if (docId && window.db) {
      window.db.collection('users').doc(docId).update({
        lat: lat, lng: lng, locUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function(){});
    }
  }, function() {}, { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 });
}
window.startLiveLocationWatch = startLiveLocationWatch;

function stopLiveLocationWatch() {
  if (_locationWatchId) {
    navigator.geolocation.clearWatch(_locationWatchId);
    _locationWatchId = null;
  }
}
window.stopLiveLocationWatch = stopLiveLocationWatch;
