// ═══════════════════════════════════════════════════════════════
// NEKTA MULTI-VENDOR — Shop & Seller Logic
// Handles: shop listing, area filter, nearby sort, seller auth,
//          shop products, seller dashboard data loading
// ═══════════════════════════════════════════════════════════════
'use strict';

// ── KOTHAGUDEM AREAS ─────────────────────────────────────────
const KOTHAGUDEM_AREAS = [
  'Hanumanbasthi', 'Old Market', 'New Market', 'Pedagaddi',
  'Bhagyanagar', 'Ram Nagar', 'Kothagudem Town', 'Paloncha Road',
  'Station Road', 'Nehru Nagar'
];
window.KOTHAGUDEM_AREAS = KOTHAGUDEM_AREAS;

// ── SHOP CACHE ───────────────────────────────────────────────
let _shopsCache   = [];
let _sellerRole   = null; // 'master_admin' | 'seller' | null
let _sellerShopId = null;
let _sellerUid    = null;

window._shopsCache   = _shopsCache;

// ── LOAD ALL SHOPS (for customer home screen) ─────────────────
// Starts a real-time listener so _shopsCache is always current
let _shopsUnsub = null;
function loadShopsForHome() {
  if (!window.db) return Promise.resolve([]);
  // If already listening, just return current cache
  if (_shopsUnsub) return Promise.resolve(_shopsCache);
  return new Promise(function(resolve) {
    _shopsUnsub = window.db.collection('shops')
      .onSnapshot(function(snap) {
        _shopsCache = snap.docs
          .map(function(d) { return Object.assign({ id: d.id }, d.data()); })
          .filter(function(s) { return s.active !== false; });
        window._shopsCache = _shopsCache;
        // Re-render shop cards on home screen whenever data changes
        if (window._renderShops) window._renderShops();
        resolve(_shopsCache);
      }, function(e) {
        console.warn('loadShopsForHome listener:', e.message);
        resolve(_shopsCache);
      });
  });
}
window.loadShopsForHome = loadShopsForHome;

// ── LOAD PRODUCTS FOR A SPECIFIC SHOP ────────────────────────
async function loadShopProducts(shopId) {
  if (!window.db) return [];
  try {
    const snap = await window.db.collection('shops').doc(shopId).collection('products').get();
    let prods = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Normalize image paths
    if (typeof normalizeProductImages === 'function') {
      prods = normalizeProductImages(prods);
    }
    return prods;
  } catch(e) {
    console.warn('loadShopProducts:', e.message);
    return [];
  }
}
window.loadShopProducts = loadShopProducts;

// ── HAVERSINE (reuse from firebase-config.js if available) ────
function _shopDist(userLat, userLng, shopLat, shopLng) {
  if (window.haversineKm) return window.haversineKm(userLat, userLng, shopLat, shopLng);
  const R = 6371, dL = (shopLat - userLat) * Math.PI / 180,
    dl = (shopLng - userLng) * Math.PI / 180,
    a = Math.sin(dL/2)**2 + Math.cos(userLat*Math.PI/180)*Math.cos(shopLat*Math.PI/180)*Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── FILTER + SORT SHOPS ───────────────────────────────────────
// sortBy: 'nearby' | 'name' | 'area'
function filterAndSortShops(shops, { search = '', area = '', sortBy = 'nearby', userLat = null, userLng = null } = {}) {
  let list = shops.filter(s => s.active !== false);

  if (area) list = list.filter(s => (s.area || '').toLowerCase().includes(area.toLowerCase()));

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.area || '').toLowerCase().includes(q) ||
      (s.category || '').toLowerCase().includes(q)
    );
  }

  if (sortBy === 'nearby' && userLat && userLng) {
    list = list.map(s => ({
      ...s,
      _dist: (s.latitude && s.longitude)
        ? _shopDist(userLat, userLng, s.latitude, s.longitude)
        : 99
    })).sort((a, b) => a._dist - b._dist);
  } else if (sortBy === 'name') {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (sortBy === 'area') {
    list.sort((a, b) => (a.area || '').localeCompare(b.area || ''));
  }

  return list;
}
window.filterAndSortShops = filterAndSortShops;

// ── RENDER SHOP CARD ──────────────────────────────────────────
function renderShopCard(shop) {
  const dist = shop._dist ? shop._dist.toFixed(1) + ' km' : '';
  const open = shop.online !== false;
  const cat  = shop.category || 'Grocery';
  const catIcon = { grocery: '🛒', pickles: '🥒', dairy: '🥛', fruits: '🍎', bakery: '🍞', nonveg: '🍖' }[cat.toLowerCase()] || '🏪';

  // Show product categories if available
  const catBadges = (shop.categories || []).length > 0 
    ? shop.categories.slice(0, 3).map(c => {
        const icons = { VEGETABLES: '🥬', FRUITS: '🍎', DAIRY: '🥛', GRAINS: '🌾', SPICES: '🌶️', PICKLES: '🥒', SNACKS: '🍿', NONVEG: '🍖', GENERAL: '📦' };
        return `<span style="background:#f0fff8;color:#00894c;border-radius:14px;padding:3px 10px;font-size:9px;font-weight:700;display:inline-block;margin:2px">${icons[c] || '📦'} ${c}</span>`;
      }).join('')
    : '';

  return `<div class="shop-card" onclick="openShopPage('${shop.id}')" style="
    background:var(--card);border-radius:16px;padding:14px;margin-bottom:12px;
    box-shadow:var(--sh1);border:1.5px solid var(--border);cursor:pointer;
    opacity:${open ? 1 : 0.6};position:relative;overflow:hidden">
    ${!open ? '<div style="position:absolute;top:10px;right:10px;background:#ef4444;color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px">CLOSED</div>' : ''}
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:52px;height:52px;border-radius:14px;background:var(--g3);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">
        ${shop.logoEmoji || catIcon}
      </div>
      <div style="flex:1;min-width:0">
        <p style="font-weight:800;font-size:14px;color:var(--dark);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc2(shop.name)}</p>
        <p style="font-size:11px;color:var(--pale);margin-bottom:4px">${catIcon} ${esc2(cat)} · 📍 ${esc2(shop.area || '')}${dist ? ' · ' + dist : ''}</p>
        ${catBadges ? `<div style="margin-bottom:6px;display:flex;flex-wrap:wrap;gap:4px">${catBadges}</div>` : ''}
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${shop.rating ? `<span style="background:#fef9c3;color:#854d0e;border-radius:20px;padding:1px 7px;font-size:10px;font-weight:700">⭐ ${shop.rating}</span>` : ''}
          <span style="background:${open ? '#d1fae5' : '#fee2e2'};color:${open ? '#065f46' : '#ef4444'};border-radius:20px;padding:1px 7px;font-size:10px;font-weight:700">${open ? '🟢 Open' : '🔴 Closed'}</span>
          ${shop.minOrder ? `<span style="background:#e0f2fe;color:#075985;border-radius:20px;padding:1px 7px;font-size:10px;font-weight:700">Min ₹${shop.minOrder}</span>` : ''}
        </div>
      </div>
    </div>
  </div>`;
}
window.renderShopCard = renderShopCard;

function esc2(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── OPEN SHOP PAGE ────────────────────────────────────────────
let _currentShopId = null;
let _shopProductsUnsub = null;

async function openShopPage(shopId) {
  _currentShopId = shopId;

  // Always fetch fresh from Firestore — never trust stale cache for open/closed
  let shop = {};
  if (window.db) {
    try {
      const doc = await window.db.collection('shops').doc(shopId).get();
      if (doc.exists) {
        shop = { id: doc.id, ...doc.data() };
        // Update both cache references
        const idx = _shopsCache.findIndex(s => s.id === shopId);
        if (idx >= 0) _shopsCache[idx] = shop; else _shopsCache.push(shop);
        window._shopsCache = _shopsCache;
      }
    } catch(e) {
      // Fallback to cache
      shop = _shopsCache.find(s => s.id === shopId) || window._shopsCache?.find(s => s.id === shopId) || {};
    }
  } else {
    shop = _shopsCache.find(s => s.id === shopId) || window._shopsCache?.find(s => s.id === shopId) || {};
  }

  if (!shop.id) {
    if (window.toast) window.toast('Shop not found', 'error');
    return;
  }

  // Don't block — show closed banner inside but allow browsing (like Swiggy/Zomato)
  const shopIsClosed = shop.online === false;

  window._activeShopId = shopId;
  window._activeShopName = shop.name || 'Shop';

  // Switch to catalog view WITHOUT triggering catalog-ui's renderCGrid
  // Set _activeShopId FIRST so the renderCGrid patch blocks it
  const spec = ['admin', 'rider'];
  const bnav = document.getElementById('bnav');
  if (bnav) bnav.style.display = 'flex';
  ['home','catalog','cart','profile','admin','rider'].forEach(n => {
    const el = document.getElementById('view-' + n);
    if (el) el.classList.remove('on');
  });
  const catView = document.getElementById('view-catalog');
  if (catView) catView.classList.add('on');
  window.curview = 'catalog';
  ['home','catalog','cart','profile'].forEach(n => {
    const el = document.getElementById('nb-' + n);
    if (el) el.classList.remove('on');
  });
  const nbCat = document.getElementById('nb-catalog');
  if (nbCat) nbCat.classList.add('on');

  // Push back-stack so hardware/gesture back returns to home
  if (window.viewStack) {
    if (window.viewStack[window.viewStack.length - 1] !== 'catalog') window.viewStack.push('catalog');
  }

  // Inject shop header above the grid
  _renderShopHeader(shop);

  // Show shop location map
  _renderShopMap(shop);

  // Show loading
  const grid = document.getElementById('cgrid');
  if (grid) grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--pale)">Loading products…</div>';

  // Unsubscribe previous real-time listener
  if (_shopProductsUnsub) { _shopProductsUnsub(); _shopProductsUnsub = null; }

  // Real-time shop status listener — open/close reflects instantly (no reload needed)
  let _shopStatusUnsub = null;
  if (window.db) {
    _shopStatusUnsub = window.db.collection('shops').doc(shopId).onSnapshot(snap => {
      if (!snap.exists) return;
      const updated = { id: snap.id, ...snap.data() };
      // Update cache
      const idx = _shopsCache.findIndex(s => s.id === shopId);
      if (idx >= 0) _shopsCache[idx] = updated; else _shopsCache.push(updated);
      window._shopsCache = _shopsCache;
      // Update header banner live
      const hdr = document.getElementById('shop-page-header');
      if (hdr) {
        const open = updated.online !== false;
        const badge = hdr.querySelector('span[style*="border-radius:20px"]');
        if (badge) { badge.style.background = open ? '#d1fae5' : '#fee2e2'; badge.style.color = open ? '#065f46' : '#ef4444'; badge.textContent = open ? '🟢 Open' : '🔴 Closed'; }
        const closedBanner = hdr.querySelector('div[style*="background:#fef2f2"]');
        if (closedBanner) closedBanner.style.display = open ? 'none' : 'flex';
        else if (!open) _renderShopHeader(updated);
      }
    }, () => {});
    // Combine unsub
    const _origUnsub = typeof _shopProductsUnsub === 'function' ? _shopProductsUnsub : null;
    const _statusUnsubRef = _shopStatusUnsub;
    _shopProductsUnsub = function() { if (_origUnsub) _origUnsub(); if (_statusUnsubRef) _statusUnsubRef(); };
  }

  // Real-time listener — seller changes reflect instantly for user
  if (window.db) {
    _shopProductsUnsub = window.db
      .collection('shops').doc(shopId).collection('products')
      .onSnapshot(snap => {
        const prods = snap.docs.map(d => _normalizeShopProduct(d.id, d.data(), shopId));
        window._shopOverrideProducts = prods;
        _renderShopProducts(prods, shop);
      }, () => {
        // Fallback: one-time fetch
        loadShopProducts(shopId).then(raw => {
          const prods = raw.map(p => _normalizeShopProduct(p.id, p, shopId));
          window._shopOverrideProducts = prods;
          _renderShopProducts(prods, shop);
        });
      });
  } else {
    const raw = await loadShopProducts(shopId);
    const prods = raw.map(p => _normalizeShopProduct(p.id, p, shopId));
    window._shopOverrideProducts = prods;
    _renderShopProducts(prods, shop);
  }
}
window.openShopPage = openShopPage;

function _normalizeShopProduct(id, p, shopId) {
  let img = p.image_url || p.img || '';
  // Normalize image path using the getItemImage function (if available)
  if (img && typeof getItemImage === 'function') {
    img = getItemImage({ img: img }).replace(/^images\//, '');  // Store as bare filename
  }
  return {
    id: id || p.id || ('sp_' + Math.random().toString(36).slice(2)),
    name: p.name || '',
    teluguName: p.teluguName || '',
    price: p.price || 0,
    halfPrice: p.halfPrice || 0,
    quarterPrice: p.quarterPrice || 0,
    slashedPrice: p.slashedPrice || 0,
    unit: p.unit || 'Pc',
    category: p.category || 'GENERAL',
    img: img,
    outOfStock: p.outOfStock || p.stock === 0,
    _shopId: shopId,
    _fromShop: true,
  };
}

function _renderShopHeader(shop) {
  const catView = document.getElementById('view-catalog');
  if (!catView) return;
  const existing = document.getElementById('shop-page-header');
  if (existing) existing.remove();
  const open = shop.online !== false;
  const hdr = document.createElement('div');
  hdr.id = 'shop-page-header';
  hdr.style.cssText = 'flex-shrink:0;z-index:50;';
  hdr.innerHTML = `
    <div style="background:var(--card);border-bottom:1.5px solid var(--border);padding:12px 16px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:50">
      <button onclick="closeShopPage()" style="width:36px;height:36px;border-radius:12px;background:#f0fff8;border:1.5px solid var(--border);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;color:#00b96b;font-weight:800">←</button>
      <div style="flex:1;min-width:0">
        <p style="font-weight:800;font-size:15px;color:var(--dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🏪 ${esc2(shop.name || 'Shop')}</p>
        <p style="font-size:11px;color:var(--pale);margin-top:1px">Shop items only · tap ← to go back</p>
      </div>
      <span style="background:${open ? '#d1fae5' : '#fee2e2'};color:${open ? '#065f46' : '#ef4444'};border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;flex-shrink:0">${open ? '🟢 Open' : '🔴 Closed'}</span>
    </div>
    ${!open ? `<div style="background:linear-gradient(135deg,#fef2f2,#fee2e2);border-bottom:1.5px solid #fca5a5;padding:12px 16px;display:flex;align-items:center;gap:10px">
      <span style="font-size:18px;flex-shrink:0">🏪</span>
      <div style="flex:1">
        <p style="font-size:12px;font-weight:800;color:#b91c1c">Shop is currently closed</p>
        <p style="font-size:11px;color:#991b1b;margin-top:2px;font-weight:500">You can browse but orders are paused</p>
      </div>
    </div>` : ''}
  `;
  catView.insertBefore(hdr, catView.firstChild);
}

function _renderShopProducts(prods, shop) {
  const grid = document.getElementById('cgrid');
  if (!grid) return;

  // Hide the category sidebar — not relevant for a single shop
  const sidebar = document.getElementById('cat-sidebar');
  if (sidebar) sidebar.style.display = 'none';

  if (!prods.length) {
    grid.innerHTML = '<div style="text-align:center;padding:48px 20px;color:var(--pale)"><div style="font-size:48px;margin-bottom:12px">🛒</div><p style="font-weight:700">No products yet</p><p style="font-size:12px;margin-top:4px">This shop hasn\'t added products yet</p></div>';
    return;
  }

  // Group by category
  const groups = {};
  prods.forEach(p => {
    const cat = p.category || 'GENERAL';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(p);
  });

  // Temporarily swap window.products so mkFullCard + cart buttons work
  const _origProducts = window.products;
  window.products = prods;

  let html = '';
  Object.entries(groups).forEach(([cat, items]) => {
    html += `<div style="padding:10px 16px 4px;font-size:12px;font-weight:800;color:var(--pale);text-transform:uppercase;letter-spacing:.5px">${cat}</div>`;
    html += '<div class="cgrid">' + items.map(p => window.mkFullCard ? window.mkFullCard(p) : _shopProductCard(p)).join('') + '</div>';
  });
  grid.innerHTML = html;

  // Restore products
  window.products = _origProducts;

  // Lazy-load images
  grid.querySelectorAll('img[data-src]').forEach(img => { if (window.observeImg) window.observeImg(img); });
}

// Minimal card fallback if mkFullCard not available
function _shopProductCard(p) {
  const oos = p.outOfStock;
  return `<div class="pc fu" onclick="_shopOpenPD('${p.id}')">
    <img src="images/nektaIcon.svg" data-src="${window.getItemImage ? window.getItemImage(p) : (p.img || 'images/nektaIcon.svg')}" alt="${esc2(p.name)}" loading="lazy" style="background:#f0fdf4;width:100%;border-radius:12px" onerror="this.src='images/nektaIcon.svg'">
    <div class="pname">${esc2(p.name)}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <span class="pprice">₹${p.price}</span>
      <span style="font-size:10px;color:#94a3b8">${p.unit}</span>
    </div>
    <div onclick="event.stopPropagation()">${oos ? '<div style="text-align:center;font-size:10px;font-weight:700;color:#ef4444;padding:6px 0">Out of Stock</div>' : '<button class="addbtn" onclick="_shopAddItem(\'' + p.id + '\')" aria-label="Add to cart">+ ADD</button>'}</div>
  </div>`;
}

function _shopAddItem(id) {
  const prods = window._shopOverrideProducts || [];
  const p = prods.find(x => x.id === id);
  if (!p || p.outOfStock) { if (window.toast) window.toast('Out of stock', 'warning'); return; }
  
  // Clear any Nekta home items from cart when adding shop items
  const homeItemKeys = Object.keys(cart).filter(k => {
    return !prods.find(x => String(x.id) === String(k));
  });
  if (homeItemKeys.length > 0) {
    homeItemKeys.forEach(k => delete cart[k]);
    saveCart(); updateFCart(); updateBadge();
    if (window.toast) window.toast('⚠️ Cleared Nekta items — shop items only', 'warning');
  }

  // Add item using the shop product string ID directly
  const existing = cart[id];
  if (existing) {
    existing.qty += 1;
    existing.cost = p.price * existing.qty;
  } else {
    cart[id] = { qty: 1, cost: p.price };
  }
  saveCart();
  // Refresh buttons in shop grid
  const hEl = document.getElementById('hbtn-' + id);
  if (hEl) hEl.innerHTML = getBtnHtml(id, 'h');
  const cEl = document.getElementById('cbtn-' + id);
  if (cEl) cEl.innerHTML = getBtnHtml(id, 'c');
  updateFCart();
  updateBadge();
  if (window.toast) window.toast((p.name || 'Item') + ' added 🛒', 'success');
}
window._shopAddItem = _shopAddItem;

function _shopOpenPD(id) {
  const prods = window._shopOverrideProducts || [];
  const p = prods.find(x => x.id === id);
  if (!p) return;
  const _orig = window.products;
  window.products = prods;
  if (window.openPD) window.openPD(id);
  window.products = _orig;
}
window._shopOpenPD = _shopOpenPD;


function _renderShopMap(shop) {
  const catView = document.getElementById('view-catalog');
  if (!catView) return;
  const existing = document.getElementById('shop-map-strip');
  if (existing) existing.remove();

  if (!shop.latitude || !shop.longitude) return;

  const strip = document.createElement('div');
  strip.id = 'shop-map-strip';
  strip.style.cssText = 'height:160px;margin:0 16px 12px;border-radius:14px;overflow:hidden;border:1.5px solid var(--border);flex-shrink:0;position:relative';

  const mapDiv = document.createElement('div');
  mapDiv.id = 'shop-map-el';
  mapDiv.style.cssText = 'width:100%;height:100%';
  strip.appendChild(mapDiv);

  // Insert after shop header
  const hdr = document.getElementById('shop-page-header');
  if (hdr && hdr.nextSibling) catView.insertBefore(strip, hdr.nextSibling);
  else catView.insertBefore(strip, catView.firstChild);

  // Init Leaflet map
  function _initShopMap() {
    if (!window.L) { setTimeout(_initShopMap, 300); return; }
    if (document.getElementById('lf-css') === null) {
      var c = document.createElement('link'); c.id='lf-css'; c.rel='stylesheet';
      c.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(c);
    }
    const smap = window.L.map('shop-map-el', { zoomControl:false, attributionControl:false })
      .setView([shop.latitude, shop.longitude], 15);
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      { maxZoom:19, subdomains:'abcd' }).addTo(smap);

    // Shop marker
    const shopIcon = window.L.divIcon({ html:'<div style="font-size:28px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.4));line-height:1">🏪</div>', className:'', iconAnchor:[14,28] });
    window.L.marker([shop.latitude, shop.longitude], { icon:shopIcon })
      .addTo(smap).bindPopup('<b>' + (shop.name||'Shop') + '</b><br>' + (shop.area||''));

    // User location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function(pos) {
        const uLat = pos.coords.latitude, uLng = pos.coords.longitude;
        const userIcon = window.L.divIcon({ html:'<div style="width:14px;height:14px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 2px 8px rgba(37,99,235,.6)"></div>', className:'', iconAnchor:[7,7] });
        window.L.marker([uLat, uLng], { icon:userIcon }).addTo(smap).bindPopup('📍 You');
        // Draw line from user to shop
        window.L.polyline([[uLat, uLng],[shop.latitude, shop.longitude]], { color:'#00b96b', weight:2.5, opacity:.6, dashArray:'6,4' }).addTo(smap);
        // Fit bounds
        smap.fitBounds([[uLat, uLng],[shop.latitude, shop.longitude]], { padding:[30,30] });
      }, function(){}, { timeout:6000, maximumAge:60000 });
    }

    // Store reference to invalidate size after display
    setTimeout(function(){ smap.invalidateSize(); }, 200);
  }
  _initShopMap();
}

function closeShopPage() {
  // Stop real-time listener
  if (_shopProductsUnsub) { _shopProductsUnsub(); _shopProductsUnsub = null; }

  const shopName = window._activeShopName || 'Shop';
  const cartItemsCount = Object.keys(window.cart || {}).filter(k => (window.cart[k]?.qty||0) > 0).length;

  // If user has items in cart from this shop, keep them — they will be delivered together
  // Only remove items if explicitly closing shop without checkout
  if (window.cart && window._shopOverrideProducts) {
    const shopIds = new Set((window._shopOverrideProducts||[]).map(p => String(p.id)));
    const cartIds = Object.keys(window.cart);
    
    // Count shop items in cart
    let shopItemCount = 0;
    cartIds.forEach(k => {
      if (shopIds.has(String(k)) || shopIds.has(k)) shopItemCount++;
    });
    
    // Don't remove shop items automatically — user chose them!
    // They will be managed per-shop order when checkout happens
  }

  window._activeShopId = null;
  window._activeShopName = null;
  window._shopOverrideProducts = null;
  _currentShopId = null;

  // Remove shop header and map
  const hdr = document.getElementById('shop-page-header');
  if (hdr) hdr.remove();
  const shopMap = document.getElementById('shop-map-strip');
  if (shopMap) shopMap.remove();

  // Restore category sidebar
  const sidebar = document.getElementById('cat-sidebar');
  if (sidebar) sidebar.style.display = '';

  // Clear search input if open
  const srchInp = document.getElementById('srch-inp') || document.getElementById('cat-srch');
  if (srchInp) srchInp.value = '';
  const sr = document.getElementById('cat-search-results');
  if (sr) sr.style.display = 'none';

  // Go back to home and refresh cart display
  if (window.showView) window.showView('home');
  else if (window._navTo) window._navTo('home');

  // Show feedback
  if (window.toast && cartItemsCount > 0) {
    window.toast(`✅ Back to home • ${cartItemsCount} item${cartItemsCount>1?'s':''} from ${shopName} in cart`, 'success');
  } else if (window.toast) {
    window.toast(`👋 Back to home from ${shopName}`, 'info');
  }

  // Re-render catalog with original products after returning
  setTimeout(function() {
    if (window.renderCGrid) window.renderCGrid(window.activecat || 'ALL');
    if (window.updateFCart) window.updateFCart();
    if (window.updateBadge) window.updateBadge();
  }, 100);
}
window.closeShopPage = closeShopPage;

// Patch handleBack so hardware/gesture back closes shop page first
(function() {
  const _origHandleBack = window.handleBack;
  window.handleBack = function() {
    if (window._activeShopId && window.curview === 'catalog') {
      closeShopPage();
      return;
    }
    if (_origHandleBack) _origHandleBack();
  };
})();

// Patch catalog-ui's showView override so it doesn't clobber shop products
(function() {
  const _waitAndPatch = function() {
    if (!window.renderCGrid) { setTimeout(_waitAndPatch, 200); return; }
    const _origRenderCGrid = window.renderCGrid;
    window.renderCGrid = function(cat) {
      // If a shop is open, don't let catalog-ui overwrite the shop products
      if (window._activeShopId) return;
      _origRenderCGrid(cat);
    };
    const _origRenderCatSidebar = window.renderCatSidebar;
    window.renderCatSidebar = function() {
      if (window._activeShopId) return;
      if (_origRenderCatSidebar) _origRenderCatSidebar();
    };
  };
  _waitAndPatch();
})();

// ── RENDER SHOPS HOME SECTION ─────────────────────────────────
let _userLat = null, _userLng = null;
let _shopAreaFilter = '';
let _shopSortBy = 'nearby';
let _shopSearch = '';

function renderShopsSection(shops) {
  const container = document.getElementById('shops-section');
  if (!container) return;

  const filtered = filterAndSortShops(shops, {
    search: _shopSearch,
    area: _shopAreaFilter,
    sortBy: _shopSortBy,
    userLat: _userLat,
    userLng: _userLng
  });

  if (!filtered.length) {
    container.innerHTML = '<p style="text-align:center;color:var(--pale);padding:20px;font-size:13px">No shops found in this area yet.</p>';
    return;
  }

  container.innerHTML = filtered.map(renderShopCard).join('');
}
window.renderShopsSection = renderShopsSection;

// ── INIT SHOPS ON HOME ────────────────────────────────────────
async function initShopsHome() {
  // Get user location for nearby sort
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos) {
      _userLat = pos.coords.latitude;
      _userLng = pos.coords.longitude;
      renderShopsSection(_shopsCache);
    }, function() {}, { timeout: 5000 });
  }

  const shops = await loadShopsForHome();
  renderShopsSection(shops);
}
window.initShopsHome = initShopsHome;

// ── SELLER DASHBOARD AUTH ─────────────────────────────────────
async function loadSellerDashboard() {
  if (!window.db || !window.auth) return;

  // Check Firebase Auth
  const user = window.auth.currentUser;
  if (!user) {
    showSellerLogin();
    return;
  }

  try {
    const userDoc = await window.db.collection('users').doc(user.uid).get();
    if (!userDoc.exists) { showSellerLogin(); return; }

    const userData = userDoc.data();
    _sellerRole   = userData.role || 'seller';
    _sellerShopId = userData.shop_id || null;
    _sellerUid    = user.uid;

    window._sellerRole   = _sellerRole;
    window._sellerShopId = _sellerShopId;

    if (_sellerRole === 'master_admin') {
      // Already handled by existing nekta-dashboard.js
      return;
    }

    if (_sellerRole === 'seller') {
      renderSellerDashboard(userData);
    }

  } catch(e) {
    console.error('loadSellerDashboard:', e.message);
  }
}
window.loadSellerDashboard = loadSellerDashboard;

// ── SELLER: SHOP OPEN/CLOSE TOGGLE ───────────────────────────
async function toggleShopOnline(shopId, currentStatus) {
  if (!window.db) return;
  try {
    await window.db.collection('shops').doc(shopId).update({
      online: !currentStatus,
      updatedAt: new Date().toISOString()
    });
    if (window.toast) window.toast(!currentStatus ? '🟢 Shop is now OPEN' : '🔴 Shop is now CLOSED', 'success');
    return !currentStatus;
  } catch(e) {
    if (window.toast) window.toast('Failed to update shop status', 'error');
    console.error('toggleShopOnline:', e.message);
    return currentStatus;
  }
}
window.toggleShopOnline = toggleShopOnline;

// ── SELLER: ADD PRODUCT ───────────────────────────────────────
async function addProductToShop(shopId, productData) {
  if (!window.db) return null;
  try {
    const ref = await window.db.collection('shops').doc(shopId).collection('products').add({
      ...productData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (window.toast) window.toast('✅ Product added!', 'success');
    return ref.id;
  } catch(e) {
    if (window.toast) window.toast('Failed to add product', 'error');
    console.error('addProductToShop:', e.message);
    return null;
  }
}
window.addProductToShop = addProductToShop;

// ── SELLER: DELETE PRODUCT ────────────────────────────────────
async function deleteProductFromShop(shopId, productId) {
  if (!window.db) return;
  try {
    await window.db.collection('shops').doc(shopId).collection('products').doc(productId).delete();
    if (window.toast) window.toast('🗑️ Product removed', 'success');
  } catch(e) {
    if (window.toast) window.toast('Failed to remove product', 'error');
  }
}
window.deleteProductFromShop = deleteProductFromShop;

// ── SELLER: BULK UPLOAD XLSX ──────────────────────────────────
async function bulkUploadShopProducts(shopId, file) {
  if (typeof XLSX === 'undefined') {
    if (window.toast) window.toast('XLSX library not loaded', 'error');
    return 0;
  }
  try {
    const data = await file.arrayBuffer();
    const wb   = XLSX.read(data);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows  = XLSX.utils.sheet_to_json(sheet);

    if (!rows.length) {
      if (window.toast) window.toast('No products found in file', 'warning');
      return 0;
    }

    const batch = window.db.batch();
    rows.forEach(row => {
      const ref = window.db.collection('shops').doc(shopId).collection('products').doc();
      batch.set(ref, {
        name:      row['Name'] || row['name'] || row['Product'] || '',
        price:     Number(row['Price'] || row['price'] || row['MRP'] || 0),
        stock:     Number(row['Stock'] || row['stock'] || row['Qty'] || 0),
        unit:      row['Unit'] || row['unit'] || 'Pc',
        category:  row['Category'] || row['category'] || 'GENERAL',
        image_url: row['Image'] || row['image_url'] || '',
        outOfStock: Number(row['Stock'] || row['stock'] || 1) === 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
    await batch.commit();
    if (window.toast) window.toast(`✅ ${rows.length} products uploaded!`, 'success');
    return rows.length;
  } catch(e) {
    if (window.toast) window.toast('Upload failed: ' + e.message, 'error');
    console.error('bulkUploadShopProducts:', e.message);
    return 0;
  }
}
window.bulkUploadShopProducts = bulkUploadShopProducts;

// ── MASTER ADMIN: ADD SELLER ──────────────────────────────────
async function masterAdminAddSeller({ name, email, phone, shopName, area, category, lat, lng }) {
  if (!window.db || !window.auth) return false;
  try {
    // 1. Create shop document first
    const shopRef = await window.db.collection('shops').add({
      name:      shopName,
      area:      area || 'Kothagudem Town',
      category:  category || 'grocery',
      latitude:  lat   || null,
      longitude: lng   || null,
      online:    false,
      active:    true,
      rating:    0,
      minOrder:  0,
      createdAt: new Date().toISOString(),
    });

    // 2. Create seller user record (Firebase Auth creates the user separately)
    //    We store a pending_seller doc that becomes a users doc after they log in
    await window.db.collection('pending_sellers').doc(email).set({
      name, email, phone,
      role:      'seller',
      shop_id:   shopRef.id,
      shopName,  area,
      createdAt: new Date().toISOString(),
      activated: false,
    });

    if (window.toast) window.toast(`✅ Seller "${name}" added! Shop ID: ${shopRef.id}`, 'success');
    return { shopId: shopRef.id };
  } catch(e) {
    if (window.toast) window.toast('Failed to add seller: ' + e.message, 'error');
    console.error('masterAdminAddSeller:', e.message);
    return false;
  }
}
window.masterAdminAddSeller = masterAdminAddSeller;

// ── MASTER ADMIN: TOGGLE SHOP ─────────────────────────────────
async function masterAdminToggleShop(shopId, field, value) {
  if (!window.db) return;
  try {
    await window.db.collection('shops').doc(shopId).update({
      [field]: value, updatedAt: new Date().toISOString()
    });
    if (window.toast) window.toast('Shop updated', 'success');
  } catch(e) {
    if (window.toast) window.toast('Failed to update shop', 'error');
  }
}
window.masterAdminToggleShop = masterAdminToggleShop;

// ── MASTER ADMIN: LOAD ALL SHOPS WITH TODAY STATS ────────────
async function masterAdminLoadAllShops() {
  if (!window.db) return [];
  try {
    const snap  = await window.db.collection('shops').get();
    const shops = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Load today's order stats per shop
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const ordSnap = await window.db.collection('orders')
      .where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(today)).get();

    const shopStats = {};
    ordSnap.docs.forEach(d => {
      const o = d.data();
      const sids = o.shopId ? [o.shopId]
        : (Array.isArray(o.shop_orders) ? o.shop_orders.map(s => s.shop_id) : ['__unassigned__']);
      sids.forEach(sid => {
        if (!shopStats[sid]) shopStats[sid] = { orders: 0, revenue: 0 };
        shopStats[sid].orders++;
        // Revenue split: if multi-shop, split equally (simplified)
        const share = sids.length > 1
          ? (o.totalPrice || 0) / sids.length
          : (o.totalPrice || 0);
        shopStats[sid].revenue += share;
      });
    });

    return shops.map(s => ({
      ...s,
      todayOrders:  (shopStats[s.id] || {}).orders  || 0,
      todayRevenue: (shopStats[s.id] || {}).revenue || 0,
    }));
  } catch(e) {
    console.error('masterAdminLoadAllShops:', e.message);
    return [];
  }
}
window.masterAdminLoadAllShops = masterAdminLoadAllShops;

// ── MASTER ADMIN: PLATFORM ANALYTICS ────────────────────────
async function masterAdminLoadPlatformAnalytics() {
  if (!window.db) return {};
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [ordSnap, shopSnap, riderSnap] = await Promise.all([
      window.db.collection('orders').where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(today)).get(),
      window.db.collection('shops').where('active', '==', true).get(),
      window.db.collection('riders').get(),
    ]);

    const orders      = ordSnap.docs.map(d => d.data());
    const totalRev    = orders.reduce((s, o) => s + (o.totalPrice || 0), 0);
    const activeShops = shopSnap.docs.filter(d => d.data().online).length;
    const totalShops  = shopSnap.size;
    const onlineRid   = riderSnap.docs.filter(d => d.data().isActive || d.data().online).length;
    const totalRiders = riderSnap.size;

    // Shop revenue breakdown
    const shopRevMap = {};
    orders.forEach(o => {
      const sids = o.shopId ? [o.shopId]
        : (Array.isArray(o.shop_orders) ? o.shop_orders.map(s => s.shop_id) : []);
      sids.forEach(sid => {
        shopRevMap[sid] = (shopRevMap[sid] || 0) + (o.totalPrice || 0) / sids.length;
      });
    });

    const topShopId  = Object.entries(shopRevMap).sort((a, b) => b[1] - a[1])[0];
    const topShopDoc = topShopId
      ? await window.db.collection('shops').doc(topShopId[0]).get()
      : null;

    return {
      totalRevenue: totalRev,
      totalOrders:  orders.length,
      activeShops, totalShops,
      onlineRiders: onlineRid, totalRiders,
      topShop: topShopDoc ? { name: topShopDoc.data().name, revenue: topShopId[1] } : null,
    };
  } catch(e) {
    console.error('masterAdminLoadPlatformAnalytics:', e.message);
    return {};
  }
}
window.masterAdminLoadPlatformAnalytics = masterAdminLoadPlatformAnalytics;

// ── SELLER LOGIN MODAL ────────────────────────────────────────
function showSellerLogin() {
  // Sellers log in via Firebase email/password auth
  const modal = document.getElementById('seller-login-modal');
  if (modal) { modal.style.display = 'flex'; return; }

  const m = document.createElement('div');
  m.id = 'seller-login-modal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)';
  m.innerHTML = `
    <div style="background:#fff;border-radius:24px;padding:28px;width:calc(100% - 32px);max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <h2 style="font-size:20px;font-weight:900;color:#06131c;margin-bottom:4px">🏪 Seller Login</h2>
      <p style="font-size:13px;color:#8ba5b8;margin-bottom:20px">Sign in to manage your shop on Nekta</p>
      <div style="margin-bottom:12px">
        <input id="sl-email" type="email" placeholder="Email address" autocomplete="off"
          style="width:100%;padding:13px 16px;border:1.5px solid #e2e8f0;border-radius:12px;font-size:14px;outline:none;font-family:inherit">
      </div>
      <div style="margin-bottom:20px">
        <input id="sl-pass" type="password" placeholder="Password"
          style="width:100%;padding:13px 16px;border:1.5px solid #e2e8f0;border-radius:12px;font-size:14px;outline:none;font-family:inherit">
      </div>
      <div id="sl-err" style="color:#ef4444;font-size:12px;margin-bottom:10px;display:none"></div>
      <button id="sl-btn" onclick="doSellerLogin()"
        style="width:100%;padding:14px;background:#00b96b;color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit">
        Sign In
      </button>
    </div>`;
  document.body.appendChild(m);
}
window.showSellerLogin = showSellerLogin;

async function doSellerLogin() {
  const email = (document.getElementById('sl-email') || {}).value || '';
  const pass  = (document.getElementById('sl-pass')  || {}).value || '';
  const err   = document.getElementById('sl-err');
  const btn   = document.getElementById('sl-btn');

  if (!email || !pass) { if (err) { err.textContent = 'Enter email and password'; err.style.display = 'block'; } return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
  try {
    await window.auth.signInWithEmailAndPassword(email, pass);
    const modal = document.getElementById('seller-login-modal');
    if (modal) modal.remove();
    await loadSellerDashboard();
  } catch(e) {
    if (err) { err.textContent = '❌ ' + (e.message || 'Login failed'); err.style.display = 'block'; }
    if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
  }
}
window.doSellerLogin = doSellerLogin;

// ── RENDER SELLER DASHBOARD (inside existing dashboard.html) ──
function renderSellerDashboard(userData) {
  // This function injects seller-specific content into dashboard.html
  // when accessed by a seller (not master admin)
  const container = document.getElementById('main-content') || document.getElementById('page-overview');
  if (!container) return;

  const shopId = userData.shop_id;

  container.innerHTML = `
    <div style="padding:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div>
          <h2 style="font-size:20px;font-weight:900;color:var(--text)">My Shop</h2>
          <p style="font-size:12px;color:var(--text2)">${userData.name || ''}</p>
        </div>
        <button id="shop-toggle-btn" onclick="doShopToggle('${shopId}')"
          style="padding:10px 18px;border-radius:12px;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;background:#d1fae5;color:#065f46">
          🟢 OPEN
        </button>
      </div>

      <!-- KPIs -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px" id="seller-kpis">
        <div style="background:var(--card);border-radius:14px;padding:14px;border:1.5px solid var(--border)">
          <p style="font-size:11px;color:var(--text3)">Today Orders</p>
          <p style="font-size:24px;font-weight:900;color:var(--green)" id="sk-orders">—</p>
        </div>
        <div style="background:var(--card);border-radius:14px;padding:14px;border:1.5px solid var(--border)">
          <p style="font-size:11px;color:var(--text3)">Today Revenue</p>
          <p style="font-size:24px;font-weight:900;color:var(--green)" id="sk-revenue">—</p>
        </div>
      </div>

      <!-- Recent Orders -->
      <div style="background:var(--card);border-radius:14px;padding:14px;margin-bottom:16px;border:1.5px solid var(--border)">
        <p style="font-size:13px;font-weight:800;margin-bottom:10px">📦 Recent Orders</p>
        <div id="seller-orders-list"><p style="color:var(--text3);font-size:12px">Loading…</p></div>
      </div>

      <!-- Products -->
      <div style="background:var(--card);border-radius:14px;padding:14px;border:1.5px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <p style="font-size:13px;font-weight:800">🛒 My Products</p>
          <div style="display:flex;gap:6px">
            <label style="padding:6px 10px;background:var(--green3);color:var(--green);border-radius:8px;font-size:11px;font-weight:700;cursor:pointer">
              📁 XLSX Upload
              <input type="file" accept=".xlsx,.xls" style="display:none" onchange="doXlsxUpload(this,'${shopId}')">
            </label>
            <button onclick="showAddProductModal('${shopId}')"
              style="padding:6px 10px;background:var(--green);color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">
              + Add
            </button>
          </div>
        </div>
        <div id="seller-products-list"><p style="color:var(--text3);font-size:12px">Loading…</p></div>
      </div>
    </div>`;

  // Load data
  loadSellerShopData(shopId);
}
window.renderSellerDashboard = renderSellerDashboard;

// Real-time seller shop data listeners
let _sellerOrdersUnsub = null;
let _sellerProductsUnsub = null;

async function loadSellerShopData(shopId) {
  if (!window.db || !shopId) return;

  // 1. Load shop status
  try {
    const shopDoc = await window.db.collection('shops').doc(shopId).get();
    if (shopDoc.exists) {
      const shop = shopDoc.data();
      const btn  = document.getElementById('shop-toggle-btn');
      if (btn) {
        btn.style.background = shop.online ? '#d1fae5' : '#fee2e2';
        btn.style.color      = shop.online ? '#065f46' : '#ef4444';
        btn.textContent      = shop.online ? '🟢 OPEN' : '🔴 CLOSED';
        btn.dataset.online   = shop.online ? '1' : '0';
      }
    }
  } catch(e) { console.warn('Shop status error:', e.message); }

  // 2. Real-time listener for orders (ONLY this seller's shop)
  if (_sellerOrdersUnsub) _sellerOrdersUnsub();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  
  _sellerOrdersUnsub = window.db.collection('orders')
    .where('shopId', '==', shopId)
    .limit(100)
    .onSnapshot(snap => {
      // Filter today's orders client-side (avoids composite index requirement)
      const todayTs = today.getTime();
      const myOrders = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(o => {
          const ts = o.createdAt && o.createdAt.seconds ? o.createdAt.seconds * 1000
            : o.createdAt ? new Date(o.createdAt).getTime() : 0;
          return ts >= todayTs;
        })
        .sort((a, b) => {
          const ta = a.createdAt && a.createdAt.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt||0).getTime();
          const tb = b.createdAt && b.createdAt.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt||0).getTime();
          return tb - ta;
        });

      const revenue = myOrders.reduce((s, o) => s + (o.totalPrice || 0), 0);

      const koEl = document.getElementById('sk-orders');
      const krEl = document.getElementById('sk-revenue');
      if (koEl) koEl.textContent = myOrders.length;
      if (krEl) krEl.textContent = '₹' + revenue.toLocaleString('en-IN');

      // Render order list — show newest first
      const listEl = document.getElementById('seller-orders-list');
      if (listEl) {
        if (!myOrders.length) {
          listEl.innerHTML = '<p style="color:#64748b;font-size:12px;text-align:center;padding:10px">📭 No orders today yet</p>';
        } else {
          listEl.innerHTML = myOrders.slice(0, 15).map(o => {
            const items = Array.isArray(o.items) ? o.items.length : 0;
            const ts = o.createdAt?.toDate?.() || new Date();
            const timeStr = ts.toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit'});
            return `
            <div style="padding:10px 0;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:flex-start;cursor:pointer;transition:background 0.2s" onclick="alert('Order #${o.id}\\n${items} items • ₹${o.totalPrice}\\nStatus: ${o.status}')">
              <div>
                <p style="font-size:12px;font-weight:700;color:#1a202c">${o.customerName || 'Customer'} <span style="color:#94a3b8;font-weight:500">· #${o.id.slice(-5)}</span></p>
                <p style="font-size:11px;color:#64748b;margin-top:2px">${items} item${items!==1?'s':''} • ₹${o.totalPrice || 0} • ${timeStr}</p>
              </div>
              <span style="background:${o.status==='delivered'?'#dcfce7':o.status==='cancelled'?'#fee2e2':o.status==='pending'?'#fef3c7':'#e0f2fe'};
                color:${o.status==='delivered'?'#166534':o.status==='cancelled'?'#991b1b':o.status==='pending'?'#92400e':'#0c4a6e'};
                border-radius:16px;padding:4px 10px;font-size:10px;font-weight:700;white-space:nowrap;flex-shrink:0">
                ${o.status || 'placed'}
              </span>
            </div>`;
          }).join('');
        }
      }
    }, err => console.warn('Orders listener:', err.message));

  // 3. Real-time listener for products
  if (_sellerProductsUnsub) _sellerProductsUnsub();
  
  _sellerProductsUnsub = window.db.collection('shops').doc(shopId).collection('products')
    .onSnapshot(snap => {
      const prods = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const listEl = document.getElementById('seller-products-list');
      if (listEl) {
        if (!prods.length) {
          listEl.innerHTML = '<p style="color:#64748b;font-size:12px;text-align:center;padding:10px">📦 No products yet</p>';
        } else {
          listEl.innerHTML = prods.slice(0, 30).map(p => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e2e8f0;gap:8px">
              <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
                <img src="${p.image_url || p.img || 'images/nektaIcon.svg'}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;flex-shrink:0" onerror="this.src='images/nektaIcon.svg'">
                <div style="min-width:0">
                  <p style="font-size:12px;font-weight:700;color:#1a202c;word-break:break-word">${esc2(p.name)}</p>
                  <p style="font-size:10px;color:#64748b;margin-top:1px">₹${p.price || 0} · ${p.unit || 'Pc'} · Stock: ${p.stock || 0}</p>
                </div>
              </div>
              <div style="display:flex;gap:4px;align-items:center;flex-shrink:0">
                <span style="font-size:9px;background:${p.outOfStock||p.stock===0?'#fecaca':'#bbf7d0'};color:${p.outOfStock||p.stock===0?'#7f1d1d':'#166534'};border-radius:12px;padding:2px 6px;font-weight:700;white-space:nowrap">
                  ${p.outOfStock || p.stock === 0 ? 'OOS' : 'Active'}
                </span>
                <button onclick="deleteProductFromShop('${shopId}','${p.id}')" title="Delete product" style="width:28px;height:28px;border-radius:6px;background:#fee2e2;color:#dc2626;border:none;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:background 0.2s;flex-shrink:0">🗑</button>
              </div>
            </div>`).join('');
        }
      }
    }, err => console.warn('Products listener:', err.message));
}
window.loadSellerShopData = loadSellerShopData;

async function doShopToggle(shopId) {
  const btn = document.getElementById('shop-toggle-btn');
  const cur = btn ? btn.dataset.online === '1' : false;
  const newStatus = await toggleShopOnline(shopId, cur);
  if (btn) {
    btn.style.background = newStatus ? '#d1fae5' : '#fee2e2';
    btn.style.color      = newStatus ? '#065f46' : '#ef4444';
    btn.textContent      = newStatus ? '🟢 OPEN' : '🔴 CLOSED';
    btn.dataset.online   = newStatus ? '1' : '0';
  }
}
window.doShopToggle = doShopToggle;

async function doXlsxUpload(input, shopId) {
  const file = input.files[0];
  if (!file) return;
  await bulkUploadShopProducts(shopId, file);
  await loadSellerShopData(shopId);
}
window.doXlsxUpload = doXlsxUpload;

function showAddProductModal(shopId) {
  const m = document.createElement('div');
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
  m.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;padding:24px;width:100%;max-width:480px">
      <h3 style="font-size:16px;font-weight:900;margin-bottom:16px">+ Add Product</h3>
      <input id="ap-name"  placeholder="Product name *" style="width:100%;padding:11px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;margin-bottom:10px;outline:none;font-family:inherit">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <input id="ap-price" type="number" placeholder="Price ₹ *" style="padding:11px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;outline:none;font-family:inherit">
        <input id="ap-stock" type="number" placeholder="Stock qty" style="padding:11px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;outline:none;font-family:inherit">
      </div>
      <input id="ap-unit" placeholder="Unit (Kg / Pc / Pack)" style="width:100%;padding:11px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;margin-bottom:10px;outline:none;font-family:inherit">
      <select id="ap-cat" style="width:100%;padding:11px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;margin-bottom:16px;outline:none;font-family:inherit;background:#fff">
        <option value="GENERAL">General</option>
        <option value="VEGETABLES">Vegetables</option>
        <option value="FRUITS">Fruits</option>
        <option value="DAIRY">Dairy</option>
        <option value="GRAINS">Grains</option>
        <option value="SPICES">Spices</option>
        <option value="SNACKS">Snacks</option>
        <option value="BEVERAGES">Beverages</option>
        <option value="PICKLES">Pickles</option>
        <option value="NONVEG">Non-Veg</option>
      </select>
      <div style="display:flex;gap:8px">
        <button onclick="this.closest('div[style]').remove()" style="flex:1;padding:13px;background:#f1f5f9;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;color:#64748b">Cancel</button>
        <button onclick="_doAddProduct('${shopId}',this)" style="flex:2;padding:13px;background:#00b96b;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit">Add Product</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
window.showAddProductModal = showAddProductModal;

async function _doAddProduct(shopId, btn) {
  const name  = (document.getElementById('ap-name')  || {}).value || '';
  const price = Number((document.getElementById('ap-price') || {}).value || 0);
  const stock = Number((document.getElementById('ap-stock') || {}).value || 0);
  const unit  = (document.getElementById('ap-unit')  || {}).value || 'Pc';
  const cat   = (document.getElementById('ap-cat')   || {}).value || 'GENERAL';

  if (!name || !price) { if (window.toast) window.toast('Name and price required', 'warning'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }

  await addProductToShop(shopId, { name, price, stock, unit, category: cat, outOfStock: stock === 0 });
  btn && btn.closest('div[style]').remove();
  await loadSellerShopData(shopId);
}
window._doAddProduct = _doAddProduct;

// ── SELLER: UPDATE PRODUCT STOCK/PRICE ─────────────────────
async function updateSellerProduct(shopId, productId, updates) {
  if (!window.db) return false;
  try {
    await window.db.collection('shops').doc(shopId).collection('products').doc(productId).update({
      ...updates,
      updatedAt: new Date().toISOString()
    });
    if (window.toast) window.toast('✅ Product updated', 'success');
    return true;
  } catch(e) {
    if (window.toast) window.toast('Failed to update: ' + e.message, 'error');
    return false;
  }
}
window.updateSellerProduct = updateSellerProduct;

// ── SELLER: QUICK UPDATE STOCK ───────────────────────────────
async function quickUpdateStock(shopId, productId, newStock) {
  await updateSellerProduct(shopId, productId, {
    stock: newStock,
    outOfStock: newStock === 0
  });
}
window.quickUpdateStock = quickUpdateStock;

// Alias for any legacy callers
window.renderCatalogWithProducts = function(prods) {
  const shop = _shopsCache.find(s => s.id === window._activeShopId) || {};
  _renderShopProducts(prods, shop);
};

// Patch openPD so it works with shop products when a shop is open
(function() {
  const _waitPD = function() {
    if (!window.openPD) { setTimeout(_waitPD, 200); return; }
    const _origOpenPD = window.openPD;
    window.openPD = function(id) {
      if (window._activeShopId && window._shopOverrideProducts) {
        const _orig = window.products;
        window.products = window._shopOverrideProducts;
        _origOpenPD(id);
        window.products = _orig;
      } else {
        _origOpenPD(id);
      }
    };
  };
  _waitPD();
})();

console.log('✅ nekta-shops.js loaded');
