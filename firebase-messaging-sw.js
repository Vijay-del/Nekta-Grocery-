// Nekta FCM Service Worker — background push notifications
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyBcfCWXmx5lCcaFIsgx5XZqUcWhQ_TbCcQ",
  authDomain:        "nekta-grocery.firebaseapp.com",
  projectId:         "nekta-grocery",
  storageBucket:     "nekta-grocery.firebasestorage.app",
  messagingSenderId: "373439438456",
  appId:             "1:373439438456:web:b40c2335d20b0c5f37578d"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const title = payload.notification?.title || 'Nekta';
  const body  = payload.notification?.body  || 'You have a new update';
  const icon  = payload.notification?.icon  || '/images/nektaIcon.svg';
  const click = payload.data?.click_action  || '/';
  self.registration.showNotification(title, {
    body, icon, badge:'/images/nektaIcon.svg',
    data:{ url:click }, vibrate:[200,100,200],
    tag:'nekta-notif', renotify:true,
    actions:[
      { action:'open',    title:'📦 Track Order' },
      { action:'dismiss', title:'Dismiss' }
    ]
  });
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  if (e.action === 'dismiss') return;
  var url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true }).then(function(list) {
      for (var c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
