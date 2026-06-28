// ── NEKTA FCM — Push Notifications ──────────────────────────
// FCM is optional. Set window.__FCM_VAPID_KEY__ to enable.
// Without it, app works fully — just no background push notifications.
// To enable: Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → copy VAPID key
// Then set: window.__FCM_VAPID_KEY__ = 'YOUR_VAPID_KEY'; in config-loader.js

(function() {
  'use strict';
  var VAPID = window.__FCM_VAPID_KEY__ || '';
  if (!VAPID) return; // FCM disabled — no key set

  window.addEventListener('firebaseReady', function() {
    if (!firebase.messaging) return;
    try {
      var messaging = firebase.messaging();
      messaging.getToken({ vapidKey: VAPID }).then(function(token) {
        if (!token) return;
        var phone = localStorage.getItem('custPhone');
        if (phone && window.db) {
          window.db.collection('fcm_tokens').doc(phone).set({
            token: token, phone: phone, updatedAt: new Date().toISOString()
          }, { merge: true }).catch(function(){});
        }
      }).catch(function(){});

      messaging.onMessage(function(payload) {
        var n = payload.notification || {};
        if (!n.title) return;
        // Show in-app notification
        var el = document.createElement('div');
        el.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#06131c;color:#fff;padding:12px 18px;border-radius:16px;font-size:13px;font-weight:700;z-index:99999;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.4);display:flex;align-items:center;gap:10px';
        el.innerHTML = '<span style="font-size:18px">🔔</span><div><div>' + n.title + '</div>' + (n.body ? '<div style="font-size:11px;opacity:.75;margin-top:2px">' + n.body + '</div>' : '') + '</div>';
        document.body.appendChild(el);
        setTimeout(function() { if (document.body.contains(el)) document.body.removeChild(el); }, 5000);
      });
    } catch(e) {}
  }, { once: true });
})();
