// ═══════════════════════════════════════════════════════════
// CONFIG LOADER — Secure API Key Management
// ═══════════════════════════════════════════════════════════
// This script loads configuration from environment variables
// Call this BEFORE any Firebase or API initialization

(function() {
  'use strict';

  // Load from window object (injected by build process or HTML)
  window.__CONFIG = window.__CONFIG || {};

  // API key is provided via firebase-config.js fallback

  // Google Maps API Key — optional, Haversine used as fallback

  // Export as window globals for backward compatibility
  window.__FIREBASE_API_KEY__ = window.__CONFIG.firebaseApiKey || window.__FIREBASE_API_KEY__ || '';
  // Google Maps key — set window.__GMAPS_API_KEY__ above to enable
  window.__GMAPS_API_KEY__ = window.__GMAPS_API_KEY__ || (window.__CONFIG && window.__CONFIG.mapsApiKey) || '';
  window.__ORS_API_KEY__ = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjAwNTU1MTJiYmQ0MTQ5YjBhYzc2YWEwZjc0OGVkZmVlIiwiaCI6Im11cm11cjY0In0=';

  // FCM Web Push VAPID key — enables push notifications for orders
  window.__FCM_VAPID_KEY__ = 'BMhik8n6FYUPDHqsBv0T7J1cL04BSXBVYcx0pemyT6Js-DYwOwTXn1c-ZKRbTbsJzIZnJ8W8hDxrHxOabm0P-ec';

  // Helper to get any config value
  window.getConfig = function(key, defaultValue) {
    return window.__CONFIG[key] || window['__' + key.toUpperCase()] || defaultValue || '';
  };

})();
