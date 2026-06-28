'use strict';

window._NK = window._NK || {
  productOverrides: {},
  settings: { minOrder:100, deliveryBase:20, expressFee:10, storeOpen:true, expressMode:false, announcementBanner:null, freeDeliveryAbove:0 },
  home: { sections:null, slides:null, featured:[], banners:[] },
  _unsubs: [],
};

// ── EXPAND PRODUCT VARIANTS ─────────────────────────────────────
// Splits a product with halfPrice/quarterPrice into separate item cards:
// - If quarterPrice exists → 3 cards: 250g, 500g, 1kg (at their respective prices)
// - If halfPrice exists   → 2 cards: 500g, 1kg
// - Otherwise            → 1 card as-is
// Non-weight units (Pc, Pack, Bunch, etc.) are NEVER split.
function expandProductVariants(products) {
  if (!Array.isArray(products)) return [];
  const expanded = [];
  products.forEach(p => {
    // Only weight-based products can be split
    const isWeight = p.unit === 'Kg' || (p.unit && p.unit.startsWith('Kg (')) ||
                     p.unit === 'L'  || (p.unit && p.unit.startsWith('L ('));
    // If not a weight unit OR has no variant pricing → show product as-is (1 card)
    if (!isWeight || (!p.halfPrice && !p.quarterPrice)) {
      expanded.push(p);
      return;
    }
    const isL = p.unit && p.unit.includes('L');
    // Always add full-size card (1Kg or 1L)
    // NOTE: Inherit outOfStock only if parent is explicitly marked — don't auto-inherit undefined status
    expanded.push(Object.assign({}, p, {
      id: p.id,
      price: p.price,
      unit: isL ? '1L' : '1Kg',
      halfPrice: undefined,
      quarterPrice: undefined,
      outOfStock: p.outOfStock === true, // Only true if parent is explicitly true
      _variantOf: p.id,
      _variantQty: 1
    }));
    // Add 500g / 500ml card if halfPrice exists
    if (p.halfPrice) {
      expanded.push(Object.assign({}, p, {
        id: String(p.id) + '-h',
        price: p.halfPrice,
        unit: isL ? '500ml' : '500g',
        halfPrice: undefined,
        quarterPrice: undefined,
        slashedPrice: p.slashedPrice ? Math.round(p.slashedPrice * 0.5) : undefined,
        outOfStock: p.outOfStock === true, // Only true if parent is explicitly true
        _variantOf: p.id,
        _variantQty: 0.5
      }));
    }
    // Add 250g / 250ml card if quarterPrice exists
    if (p.quarterPrice) {
      expanded.push(Object.assign({}, p, {
        id: String(p.id) + '-q',
        price: p.quarterPrice,
        unit: isL ? '250ml' : '250g',
        halfPrice: undefined,
        quarterPrice: undefined,
        slashedPrice: p.slashedPrice ? Math.round(p.slashedPrice * 0.25) : undefined,
        outOfStock: p.outOfStock === true, // Only true if parent is explicitly true
        _variantOf: p.id,
        _variantQty: 0.25
      }));
    }
  });
  return expanded;
}
window.expandProductVariants = expandProductVariants;

// Apply overrides onto products array — always wins over Firestore data
function applyProductOverrides() {
  if (!window.products) return;
  const overrides = window._NK.productOverrides || {};
  window.products.forEach((p, idx) => {
    const ov = overrides[String(p.id)];
    if (!ov) return;
    Object.keys(ov).forEach(f => { window.products[idx][f] = ov[f]; });
  });
  if (typeof normalizeProductImages === 'function') {
    window.products = normalizeProductImages(window.products);
  }
  window._allProducts = window.products;
}

// ─── GET VISIBLE PRODUCTS ───────────────────────────────────────
// Returns all non-hidden products — out-of-stock items ARE included
// so users can see them in the catalog with the "Out of Stock" label.
window.getVisibleProducts = function() {
  if (!window.products) return [];
  return window.products.filter(p => !p.hidden);
};

// Re-render whatever is currently on screen
var _reRenderTimer = null;
function _reRenderAll() {
  // Cancel any pending render and schedule fresh one
  if (_reRenderTimer) clearTimeout(_reRenderTimer);
  _reRenderTimer = setTimeout(function() {
    _reRenderTimer = null;
    var v = window.curview || 'home';
    if (typeof renderHCats  === 'function') renderHCats();
    if (v === 'home'    && typeof renderHSecs === 'function') renderHSecs();
    if (v === 'catalog' && typeof renderCGrid === 'function') renderCGrid(window.activecat || 'ALL');
    if (v === 'cart'    && typeof renderCart  === 'function') renderCart();
    if (typeof updateFCart  === 'function') updateFCart();
    if (typeof updateBadge  === 'function') updateBadge();
    // Also re-render home sections even if on catalog (for background sync)
    if (v !== 'home' && typeof renderHSecs === 'function') setTimeout(renderHSecs, 200);
  }, 300);
}

let _listenersStarted = false;

// ── ONE-TIME MIGRATION: push hardcoded seed products to Firestore ──
async function _migrateSeedProducts(db) {
  const seed = window._SEED_PRODUCTS || [];
  if (!seed.length) return;
  // Check if migration already done
  const flag = await db.collection('app_overrides').doc('seed_migrated').get().catch(() => null);
  if (flag && flag.exists) return;
  console.log('🌱 Migrating', seed.length, 'seed products to Firestore...');
  const BATCH = 400;
  for (let i = 0; i < seed.length; i += BATCH) {
    const batch = db.batch();
    seed.slice(i, i + BATCH).forEach(p => {
      // Use prod_{id} as doc ID to avoid duplicates
      const ref = db.collection('products').doc('prod_' + p.id);
      const clean = { ...p };
      Object.keys(clean).forEach(k => { if (clean[k] === undefined) delete clean[k]; });
      clean.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      batch.set(ref, clean, { merge: true });
    });
    await batch.commit().catch(e => console.warn('Migration batch error:', e.message));
  }
  // Mark migration done
  await db.collection('app_overrides').doc('seed_migrated').set({ done: true, ts: new Date().toISOString() });
  console.log('✅ Seed migration complete!');
}

function startOverrideListeners() {
  if (_listenersStarted) return;
  const db = window.db;
  if (!db) { setTimeout(startOverrideListeners, 400); return; }
  _listenersStarted = true;

  // Run one-time seed migration
  _migrateSeedProducts(db);

  // ── 1. app_overrides/products (stock, outOfStock, price etc from dashboard) ──
  db.collection('app_overrides').doc('products').onSnapshot(doc => {
    window._NK.productOverrides = doc.exists ? (doc.data() || {}) : {};
    applyProductOverrides();
    _reRenderAll();
  }, err => console.warn('overrides/products:', err.message));

  // ── 2. products collection — Firestore is the SINGLE SOURCE OF TRUTH ──
  // Cache key for localStorage
  const PROD_CACHE_KEY = 'nk_products_cache';
  const PROD_CACHE_TS_KEY = 'nk_products_cache_ts';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  // Try serving from cache immediately so boot doesn't wait for Firestore
  try {
    const cacheTs = parseInt(localStorage.getItem(PROD_CACHE_TS_KEY) || '0', 10);
    const cacheAge = Date.now() - cacheTs;
    if (cacheAge < CACHE_TTL_MS) {
      const cached = JSON.parse(localStorage.getItem(PROD_CACHE_KEY) || 'null');
      if (cached && cached.length) {
        let cachedProds = cached;
        if (typeof expandProductVariants === 'function') cachedProds = expandProductVariants(cachedProds);
        if (typeof normalizeProductImages === 'function') cachedProds = normalizeProductImages(cachedProds);
        window.products = cachedProds;
        window._allProducts = cachedProds;
        applyProductOverrides();
        // Unblock boot immediately from cache
        if (window._bootRetry && window._bootRetry > 0) {
          window._bootRetry = 0;
          if (typeof boot === 'function') boot();
        }
      }
    }
  } catch(e) {}

  // Live Firestore listener — only active, non-hidden products
  db.collection('products')
    .where('isActive', '==', true)
    .onSnapshot(snap => {
      let firestoreProducts = snap.docs.map(d => ({ ...d.data(), _docId: d.id })).filter(p => !p.hidden);
      if (firestoreProducts.length > 0) {
        if (typeof expandProductVariants === 'function') {
          firestoreProducts = expandProductVariants(firestoreProducts);
        }
        window.products = firestoreProducts;
        // Update localStorage cache
        try {
          localStorage.setItem(PROD_CACHE_KEY, JSON.stringify(snap.docs.map(d => ({ ...d.data(), _docId: d.id }))));
          localStorage.setItem(PROD_CACHE_TS_KEY, String(Date.now()));
        } catch(e) {}
      } else if (!window.products || window.products.length === 0) {
        // Fallback: Use seed products.js if Firestore is empty or no isActive products yet
        window.products = (typeof products !== 'undefined' ? products : []);
      }
      window._allProducts = window.products;
      if (typeof normalizeProductImages === 'function') {
        window.products = normalizeProductImages(window.products);
        window._allProducts = window.products;
      }
      applyProductOverrides();
      if (window._bootRetry && window._bootRetry > 0) {
        window._bootRetry = 0;
        if (typeof boot === 'function') boot();
      }
      _reRenderAll();
    }, err => console.warn('products listener:', err.message));

  // ── 3. Settings ──
  db.collection('app_overrides').doc('settings').onSnapshot(doc => {
    if (!doc.exists) return;
    const d = doc.data();
    Object.assign(window._NK.settings, d);
    applySettingsToApp(d);
  }, () => {});

  // ── 4. Home config (reads both legacy and he_ prefixed fields) ──
  db.collection('app_overrides').doc('home_config').onSnapshot(doc => {
    if (!doc.exists) return;
    const d = doc.data();

    // Hero sliders — he_slides takes priority over legacy slides
    const rawSlides = d.he_slides || d.slides;
    if (rawSlides !== undefined) {
      const activeSlides = rawSlides.filter(s => s.on !== false);
      if (activeSlides.length > 0) {
        window._NK.home.slides = activeSlides;
        window._nkSlides = activeSlides.map(s => ({ bg:s.bg, tag:s.tag||'', h:s.h, sub:s.sub, e:s.e||s.emoji, img:s.img||'' }));
      } else {
        window._nkSlides = undefined;
      }
      if (typeof initSlider === 'function') initSlider();
    }

    // Product sections — he_sections takes priority
    const rawSections = d.he_sections || d.sections;
    if (rawSections) {
      window._NK.home.sections = rawSections.filter(s => s.on !== false);
    }

    // Featured products — he_featured takes priority
    const rawFeatured = d.he_featured || d.featured;
    if (rawFeatured) window._NK.home.featured = rawFeatured;

    // Offer banners — he_banners takes priority
    const rawBanners = d.he_banners || d.banners;
    if (rawBanners) window._NK.home.banners = rawBanners.filter(b => b.on !== false);

    // Categories order
    if (d.he_categories && d.he_categories.length) {
      window._NK.home.categories = d.he_categories;
      _applyCustomCategoryOrder(d.he_categories);
    }

    // Deal of the day
    if (d.he_deals) {
      window._NK.home.deals = d.he_deals;
    }

    if (d.announcementBanner && d.announcementBanner.on) showAnnouncementBanner(d.announcementBanner);
    else hideAnnouncementBanner();
    if (typeof renderHSecs === 'function' && window.curview === 'home') setTimeout(renderHSecs, 50);
  }, () => {});

  // ── 5. Promo codes ──
  db.collection('app_overrides').doc('promos').onSnapshot(doc => {
    if (doc.exists) window._NK.promoCodes = doc.data().codes || [];
  }, () => {});

}

function applySettingsToApp(s) {
  if (s.minOrd   !== undefined) window.MIN_ORD = s.minOrd;
  if (s.minOrder  !== undefined) window.MIN_ORD = s.minOrder;
  if (s.storeOpen === false) showStoreClosed(s.storeClosedMsg);
  else hideStoreClosed();
  if (s.freeDeliveryAbove > 0) window._nkFreeDeliveryAbove = s.freeDeliveryAbove;
  if (s.announcementBanner && s.announcementBanner.on) showAnnouncementBanner(s.announcementBanner);
  if (typeof renderCart === 'function' && window.curview === 'cart') renderCart();
}

function showStoreClosed(msg) {
  let el = document.getElementById('store-closed-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'store-closed-banner';
    // Improved mobile-friendly styling
    el.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 9998;
      background: linear-gradient(135deg, #b91c1c, #7f1d1d);
      color: #fff;
      padding: 12px 16px;
      padding-top: max(12px, env(safe-area-inset-top));
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,.15);
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.4;
      width: 100%;
      box-sizing: border-box;
    `;
    document.body.appendChild(el);
  }
  const displayMsg = msg || 'We are currently closed';
  el.innerHTML = `
    <span style="font-size:18px;flex-shrink:0;line-height:1">🏪</span>
    <div style="flex:1;text-align:left;min-width:0">
      <div style="font-weight:700;font-size:13px;letter-spacing:.3px;line-height:1.2">Store Closed</div>
      <div style="font-size:11px;color:rgba(255,255,255,.85);margin-top:2px;font-weight:500;word-wrap:break-word">${displayMsg}</div>
    </div>
  `;
  el.style.display = 'flex';
  const app = document.getElementById('app');
  if (app) {
    const bannerHeight = el.offsetHeight || 60;
    app.style.top = bannerHeight + 'px';
    app.style.transition = 'top 0.3s ease';
  }
  window._storeClosedMsg = msg || null;
  window._storeClosed = true;
}
function hideStoreClosed() {
  const el = document.getElementById('store-closed-banner');
  if (el) el.style.display = 'none';
  const app = document.getElementById('app');
  if (app) {
    app.style.top = '0';
    app.style.transition = 'top 0.3s ease';
  }
  window._storeClosed = false;
  window._storeClosedMsg = null;
}

function showAnnouncementBanner(banner) {
  let el = document.getElementById('announcement-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'announcement-banner';
    el.style.cssText = 'position:fixed;bottom:calc(62px + env(safe-area-inset-bottom,0px));left:0;right:0;z-index:2990;padding:10px 16px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:480px;margin:0 auto;border-radius:12px 12px 0 0;';
    document.body.appendChild(el);
  }
  const colors = { info:'linear-gradient(135deg,#1d4ed8,#2563eb)', success:'linear-gradient(135deg,#059669,#047857)', warning:'linear-gradient(135deg,#d97706,#b45309)', error:'linear-gradient(135deg,#dc2626,#b91c1c)', offer:'linear-gradient(135deg,#7c3aed,#6d28d9)' };
  el.style.background = colors[banner.type] || colors.info;
  el.style.color = '#fff';
  el.innerHTML = `<span style="flex:1">${banner.text||''}</span><button onclick="document.getElementById('announcement-banner').style.display='none'" style="background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:20px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer">✕</button>`;
  el.style.display = 'flex';
}
function hideAnnouncementBanner() {
  const el = document.getElementById('announcement-banner');
  if (el) el.style.display = 'none';
}

function validatePromoCode(code) {
  const codes = window._NK.promoCodes || [];
  return codes.find(c => c.code && c.code.toUpperCase() === code.toUpperCase() && c.active) || null;
}
window.validatePromoCode = validatePromoCode;

// Apply category order from home editor to CATS_V2
function _applyCustomCategoryOrder(catList) {
  if (!window.CATS_V2 || !catList || !catList.length) return;
  const ordered = [];
  const allCat = window.CATS_V2.find(c => c.id === 'ALL');
  if (allCat) ordered.push(allCat);
  catList.forEach(id => {
    const cat = window.CATS_V2.find(c => c.id === id);
    if (cat && cat.id !== 'ALL') ordered.push(cat);
  });
  window.CATS_V2.forEach(c => {
    if (!ordered.find(o => o.id === c.id)) ordered.push(c);
  });
  window.CATS_V2 = ordered;
  if (typeof renderHCats === 'function' && window.curview === 'home') renderHCats();
  if (typeof renderCatSidebar === 'function') renderCatSidebar();
}

function isSectionVisible(sectionId) {
  const sections = window._NK.home.sections;
  if (!sections) return true;
  const s = sections.find(x => x.id === sectionId);
  return s ? s.on !== false : true;
}
window.isSectionVisible = isSectionVisible;

// Start only once — guard against duplicate calls from app-core
window.startOverrideListeners = startOverrideListeners;
window.addEventListener('firebaseReady', startOverrideListeners);
if (window.firebaseReady && window.db) startOverrideListeners();


// ── Custom Categories — load from Firestore and merge into CATS_V2 ──
(function() {
  function _loadCustomCats() {
    if (!window.db) { setTimeout(_loadCustomCats, 600); return; }
    window.db.collection('app_overrides').doc('custom_categories').onSnapshot(function(doc) {
      if (!doc.exists) {
        // If doc doesn't exist, just return (no custom categories)
        return;
      }
      var data = doc.data() || {};
      var customList = data.list || [];
      var emojis = data.emojis || {};
      
      if (!customList.length) return;

      // Default gradient colors for custom categories
      var defaultGradients = [
        'linear-gradient(135deg,#6366f1,#4f46e5)',
        'linear-gradient(135deg,#ec4899,#be185d)',
        'linear-gradient(135deg,#14b8a6,#0f766e)',
        'linear-gradient(135deg,#f59e0b,#b45309)',
        'linear-gradient(135deg,#8b5cf6,#6d28d9)',
        'linear-gradient(135deg,#10b981,#047857)',
        'linear-gradient(135deg,#0ea5e9,#0369a1)',
        'linear-gradient(135deg,#f43f5e,#be123c)',
      ];

      // Get existing IDs in CATS_V2
      var existingIds = (window.CATS_V2 || []).map(function(c) { return c.id; });

      // Remove old custom categories (those not in the current list from Firestore)
      if (window.CATS_V2) {
        var builtinIds = ['ALL','VEGETABLES','LEAFY','FRUITS','DAIRY','GRAINS','DALS','OILS','SPICES','CONDIMENTS','PICKLES','SNACKS','CHOCOLATES','ICECREAMS','DRINKS','NONVEG','COMBOS','EASYCOOK','PERSONALCARE','CLEANING','PUJA','PANSHOP'];
        window.CATS_V2 = window.CATS_V2.filter(function(c) {
          // Keep it if it's a built-in category OR if it's in the custom list
          return builtinIds.includes(c.id) || customList.includes(c.id);
        });
        existingIds = window.CATS_V2.map(function(c) { return c.id; });
      }

      // Add new custom categories
      var added = false;
      customList.forEach(function(catId, i) {
        if (existingIds.includes(catId)) return; // already there
        var emoji = emojis[catId] || '🏷️';
        var label = catId.charAt(0).toUpperCase() + catId.slice(1).toLowerCase().replace(/_/g,' ');
        var grad  = defaultGradients[i % defaultGradients.length];
        var sh    = 'rgba(99,102,241,.4)';
        if (window.CATS_V2) {
          window.CATS_V2.push({ id: catId, l: label, e: emoji, g: grad, sh: sh });
          added = true;
        }
      });

      // Re-render category UI if visible AND if categories were actually added/changed
      if (added) {
        if (typeof renderHCats === 'function') renderHCats();
        if (typeof renderCatSidebar === 'function') renderCatSidebar();
        if (typeof renderCGrid === 'function' && window.curview === 'catalog') renderCGrid(window.activecat || 'ALL');
      }
    }, function(err) { console.warn('Custom categories listener error:', err.message); });
  }

  if (window.firebaseReady && window.db) {
    _loadCustomCats();
  } else {
    window.addEventListener('firebaseReady', _loadCustomCats, { once: true });
  }
})();


