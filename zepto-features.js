// ═══════════════════════════════════════════════════════════════
// ZEPTO-LEVEL HOME SCREEN FEATURES
// Personalization, AI recommendations, flash sales, loyalty, social proof
// ═══════════════════════════════════════════════════════════════
'use strict';

// ─── STATE ───────────────────────────────────────────────────
window._zeptoFeatures = window._zeptoFeatures || {
  recommendations: [],
  flashSales: [],
  trendingProducts: [],
  viewedProducts: [],
  personalizationData: {},
};

// ─── 1. LOYALTY POINTS SYSTEM ───────────────────────────────
function initLoyaltyPoints() {
  const stored = localStorage.getItem('nk_points');
  if (!stored) {
    window._zeptoFeatures.userPoints = 0;
    saveLoyaltyPoints();
  } else {
    window._zeptoFeatures.userPoints = parseInt(stored) || 0;
  }
  return window._zeptoFeatures.userPoints;
}

function addLoyaltyPoints(amount) {
  window._zeptoFeatures.userPoints += amount;
  saveLoyaltyPoints();
  toast(`🎁 +${amount} points earned!`, 'success');
  return window._zeptoFeatures.userPoints;
}

function saveLoyaltyPoints() {
  localStorage.setItem('nk_points', window._zeptoFeatures.userPoints);
}

window.initLoyaltyPoints = initLoyaltyPoints;
window.addLoyaltyPoints = addLoyaltyPoints;

// ─── 2. VIEWED PRODUCTS TRACKING ───────────────────────────
function trackViewedProduct(product) {
  if (!product || !product.id) return;
  
  const viewed = localStorage.getItem('nk_viewed') 
    ? JSON.parse(localStorage.getItem('nk_viewed')) 
    : [];
  
  // Remove if already exists, then add to front
  const idx = viewed.findIndex(v => String(v.id) === String(product.id));
  if (idx > -1) viewed.splice(idx, 1);
  
  viewed.unshift({
    id: product.id,
    name: product.name,
    price: product.price,
    img: product.img,
    viewedAt: Date.now()
  });
  
  // Keep last 50
  localStorage.setItem('nk_viewed', JSON.stringify(viewed.slice(0, 50)));
  window._zeptoFeatures.viewedProducts = viewed;
}

function getRecentlyViewed() {
  return localStorage.getItem('nk_viewed') 
    ? JSON.parse(localStorage.getItem('nk_viewed')) 
    : [];
}

window.trackViewedProduct = trackViewedProduct;
window.getRecentlyViewed = getRecentlyViewed;

// ─── 3. RECOMMENDATION ENGINE ───────────────────────────────
function generateRecommendations() {
  const orderHistory = JSON.parse(localStorage.getItem('nk_hist') || '[]');
  const products = _getProds();
  const recommendations = [];
  
  if (!orderHistory.length) {
    // Fallback: suggest most popular items
    return products.filter(p => !p.outOfStock && !p.hidden)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 12);
  }
  
  // Analyze purchase patterns
  const categoryFreq = {};
  const boughtIds = new Set();
  
  orderHistory.forEach(order => {
    (order.itemIds || []).forEach(id => {
      const prod = products.find(p => String(p.id) === String(id));
      if (prod) {
        categoryFreq[prod.category] = (categoryFreq[prod.category] || 0) + 1;
        boughtIds.add(String(id));
      }
    });
  });
  
  // Phase 1: Products from same categories user buys frequently
  const frequentCats = Object.entries(categoryFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);
  
  const phase1 = products.filter(p => 
    frequentCats.includes(p.category) && 
    !boughtIds.has(String(p.id)) && 
    !p.outOfStock && 
    !p.hidden
  ).slice(0, 6);
  
  // Phase 2: Complementary products (e.g., milk → butter, bread → jam)
  const complements = {
    'DAIRY': ['BREAD', 'SNACKS'],
    'BREAD': ['DAIRY', 'SNACKS', 'SPREADS'],
    'VEGETABLES': ['SPICES', 'OILS', 'DALS'],
    'DALS': ['RICE', 'SPICES', 'OILS'],
    'DRINKS': ['SNACKS', 'DAIRY'],
  };
  
  const phase2 = [];
  frequentCats.forEach(cat => {
    const compCats = complements[cat] || [];
    compCats.forEach(compCat => {
      if (phase2.length >= 6) return;
      const item = products.find(p => 
        p.category === compCat && 
        !boughtIds.has(String(p.id)) && 
        !phase1.find(ph => String(ph.id) === String(p.id)) &&
        !p.outOfStock && 
        !p.hidden
      );
      if (item) phase2.push(item);
    });
  });
  
  // Phase 3: Popular items user hasn't bought
  const phase3 = products.filter(p =>
    !boughtIds.has(String(p.id)) &&
    !phase1.find(ph => String(ph.id) === String(p.id)) &&
    !phase2.find(ph => String(ph.id) === String(p.id)) &&
    !p.outOfStock &&
    !p.hidden
  ).sort((a, b) => (b.rating || 0) - (a.rating || 0))
   .slice(0, 6);
  
  return [...phase1, ...phase2, ...phase3].slice(0, 12);
}

window.generateRecommendations = generateRecommendations;

// ─── 4. TRENDING / BESTSELLER DETECTION ───────────────────
function calculateTrendingProducts() {
  const orderHistory = JSON.parse(localStorage.getItem('nk_hist') || '[]');
  const products = _getProds();
  const freq = {};
  const recency = {};
  
  // Weight recent orders more heavily
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  
  orderHistory.forEach((order, idx) => {
    const ageWeight = Math.max(0.5, 1 - ((now - order.placedAt) / (30 * oneDayMs)));
    (order.itemIds || []).forEach(id => {
      freq[String(id)] = (freq[String(id)] || 0) + ageWeight;
      recency[String(id)] = Math.max(recency[String(id)] || 0, order.placedAt);
    });
  });
  
  // Get top products by frequency & recency
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => products.find(p => String(p.id) === id))
    .filter(p => p && !p.outOfStock && !p.hidden)
    .slice(0, 10);
}

window.calculateTrendingProducts = calculateTrendingProducts;

// ─── 5. SMART SUBSTITUTION (Out of Stock) ───────────────────
function findSubstitutes(outOfStockProduct) {
  const products = _getProds();
  
  if (!outOfStockProduct || !outOfStockProduct.category) return [];
  
  // Find similar products in same category
  const sameCategory = products.filter(p =>
    p.category === outOfStockProduct.category &&
    !p.outOfStock &&
    String(p.id) !== String(outOfStockProduct.id)
  );
  
  // Sort by similarity: price range first, then rating
  return sameCategory
    .sort((a, b) => {
      const priceA = Math.abs(a.price - outOfStockProduct.price);
      const priceB = Math.abs(b.price - outOfStockProduct.price);
      if (priceA !== priceB) return priceA - priceB;
      return (b.rating || 0) - (a.rating || 0);
    })
    .slice(0, 3);
}

window.findSubstitutes = findSubstitutes;

// ─── 6. LOCATION-BASED PROMOTIONS ───────────────────────────
function getLocationPromos() {
  // Can be loaded from admin config
  const promos = {
    'Kothagudem': [
      { title: '🚚 Express Delivery', desc: 'Get it in 10 mins!', discount: 0, promo: 'EXPRESS10' },
      { title: '🌿 Local Fresh', desc: 'From local farms', discount: 5, promo: 'LOCAL5' },
    ],
  };
  
  // In real app, load from Firestore based on user location
  return promos['Kothagudem'] || [];
}

window.getLocationPromos = getLocationPromos;

// ─── 7. FLASH SALES WITH COUNTDOWN ───────────────────────
function getFlashSales() {
  // Can be managed from admin dashboard
  const now = Date.now();
  const flashSales = [];
  
  // Example flash sale structure
  const saleConfig = [
    {
      name: 'Morning Flash Deal 🌅',
      startHour: 7,
      endHour: 10,
      discount: 25,
      categories: ['DAIRY', 'BREAD', 'DRINKS'],
      stock: 100,
      badgeColor: '#FFA500',
    },
    {
      name: 'Evening Deals 🌇',
      startHour: 17,
      endHour: 20,
      discount: 20,
      categories: ['SNACKS', 'DRINKS', 'CHOCOLATES'],
      stock: 150,
      badgeColor: '#FF6B35',
    },
  ];
  
  const currentHour = new Date().getHours();
  
  saleConfig.forEach(sale => {
    if (currentHour >= sale.startHour && currentHour < sale.endHour) {
      flashSales.push({
        ...sale,
        isActive: true,
        timeLeft: ((sale.endHour - currentHour) * 60) - new Date().getMinutes(),
      });
    }
  });
  
  return flashSales;
}

window.getFlashSales = getFlashSales;

// ─── 8. PERSONALIZED DEAL OF DAY ───────────────────────────
function getPersonalizedDealOfDay() {
  const products = _getProds();
  const orderHistory = JSON.parse(localStorage.getItem('nk_hist') || '[]');
  
  // Pick from user's favorite categories
  const categoryFreq = {};
  orderHistory.forEach(order => {
    (order.itemIds || []).forEach(id => {
      const prod = products.find(p => String(p.id) === String(id));
      if (prod) {
        categoryFreq[prod.category] = (categoryFreq[prod.category] || 0) + 1;
      }
    });
  });
  
  const topCategories = Object.entries(categoryFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);
  
  // Pick a discounted item from top category
  const candidates = products.filter(p =>
    (topCategories.includes(p.category) || !topCategories.length) &&
    (p.slashedPrice || p.discount) &&
    !p.outOfStock &&
    !p.hidden
  );
  
  if (!candidates.length) {
    // Fallback to any discounted item
    return products.find(p => (p.slashedPrice || p.discount) && !p.outOfStock);
  }
  
  return candidates[Math.floor(Math.random() * candidates.length)];
}

window.getPersonalizedDealOfDay = getPersonalizedDealOfDay;

// ─── 9. SKELETON LOADERS ───────────────────────────────────
function showSkeletons(containerId, count = 6) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const skeletons = Array(count).fill(0).map((_, i) => `
    <div class="skeleton-card" style="
      border-radius:14px;
      background:linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size:200% 100%;
      animation:loading 1.5s infinite;
      height:180px;
      margin:6px;
      flex:0 0 120px;
    "></div>
  `).join('');
  
  container.innerHTML = `<div style="display:flex;overflow-x:auto;gap:2px;padding:8px">${skeletons}</div>`;
}

function hideSkeletons(containerId) {
  const container = document.getElementById(containerId);
  if (container) container.innerHTML = '';
}

window.showSkeletons = showSkeletons;
window.hideSkeletons = hideSkeletons;

// Add animation to global CSS
if (!document.getElementById('zepto-anim')) {
  const style = document.createElement('style');
  style.id = 'zepto-anim';
  style.textContent = `
    @keyframes loading {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    @keyframes slideDown {
      from { transform: translateY(-20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes countdown {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    .zepto-animate {
      animation: slideDown 0.4s ease;
    }
  `;
  document.head.appendChild(style);
}

// ─── 10. SOCIAL PROOF BADGES ────────────────────────────────
function addSocialProofBadge(product) {
  if (!product) return '';
  
  const orderHistory = JSON.parse(localStorage.getItem('nk_hist') || '[]');
  let totalBuys = 0;
  
  orderHistory.forEach(order => {
    (order.itemIds || []).forEach(id => {
      if (String(id) === String(product.id)) totalBuys++;
    });
  });
  
  if (totalBuys >= 5) {
    return `<div style="
      position:absolute;top:6px;left:6px;z-index:3;
      background:#10b981;color:#fff;font-size:9px;font-weight:800;
      padding:3px 7px;border-radius:6px;
      display:flex;align-items:center;gap:3px
    ">
      ⭐ Popular
    </div>`;
  }
  
  if (totalBuys >= 2) {
    return `<div style="
      position:absolute;top:6px;left:6px;z-index:3;
      background:#3b82f6;color:#fff;font-size:9px;font-weight:800;
      padding:3px 7px;border-radius:6px;
      display:flex;align-items:center;gap:3px
    ">
      ✓ Tried & Liked
    </div>`;
  }
  
  return '';
}

window.addSocialProofBadge = addSocialProofBadge;

// ─── 11. QUICK REORDER BUTTON ───────────────────────────────
function quickAddToCart(productId, qty = 1) {
  const product = _getProds().find(p => String(p.id) === String(productId));
  if (!product) { toast('Product not found', 'error'); return; }
  
  if (!cart[productId]) cart[productId] = 0;
  cart[productId] += qty;
  
  toast(`✓ Added ${qty}x ${product.name}`, 'success');
  
  if (window.renderCart) renderCart();
  if (window.updateCartBadge) updateCartBadge();
}

window.quickAddToCart = quickAddToCart;

// ─── 12. A/B TESTING FRAMEWORK ───────────────────────────
function getABTestVariant() {
  let variant = localStorage.getItem('nk_ab_variant');
  if (!variant) {
    variant = Math.random() < 0.5 ? 'A' : 'B';
    localStorage.setItem('nk_ab_variant', variant);
  }
  return variant;
}

function logABTestEvent(event, metadata = {}) {
  const variant = getABTestVariant();
  const data = {
    event,
    variant,
    timestamp: Date.now(),
    ...metadata,
  };
  
  // In production, send to analytics
  console.log('📊 AB Test Event:', data);
}

window.getABTestVariant = getABTestVariant;
window.logABTestEvent = logABTestEvent;

// ─── 13. PULL-TO-REFRESH ───────────────────────────────────
let ptrStartY = 0;
let ptrOffsetY = 0;

function initPullToRefresh() {
  const view = document.getElementById('view-home');
  if (!view) return;
  
  view.addEventListener('touchstart', e => {
    if (view.scrollTop === 0) {
      ptrStartY = e.touches[0].clientY;
    }
  }, { passive: true });
  
  view.addEventListener('touchmove', e => {
    if (view.scrollTop === 0 && ptrStartY) {
      ptrOffsetY = e.touches[0].clientY - ptrStartY;
      const ptr = document.getElementById('ptr-indicator');
      if (ptr && ptrOffsetY > 0) {
        ptr.style.transform = `translateY(${Math.min(ptrOffsetY - 56, 0)}px)`;
        const icon = document.getElementById('ptr-icon');
        if (icon) {
          icon.style.transform = `rotate(${Math.min(ptrOffsetY, 180)}deg)`;
        }
        if (ptrOffsetY > 80) {
          ptr.style.opacity = '0.8';
        }
      }
    }
  }, { passive: true });
  
  view.addEventListener('touchend', e => {
    if (ptrOffsetY > 80) {
      refreshHomeData();
    }
    ptrStartY = 0;
    ptrOffsetY = 0;
    const ptr = document.getElementById('ptr-indicator');
    if (ptr) {
      ptr.style.transform = 'translateY(-56px)';
      ptr.style.opacity = '1';
    }
  });
}

async function refreshHomeData() {
  const ptr = document.getElementById('ptr-indicator');
  const icon = document.getElementById('ptr-icon');
  if (ptr) ptr.style.opacity = '0.5';
  if (icon) icon.style.animation = 'spin 1s linear infinite';
  
  // Reload product data, recommendations, etc.
  if (window.loadHomeEditorData) await window.loadHomeEditorData();
  if (window.renderHSecs) renderHSecs();
  
  toast('✓ Home updated', 'success');
  
  setTimeout(() => {
    if (ptr) ptr.style.opacity = '1';
    if (icon) icon.style.animation = 'none';
  }, 1200);
}

window.initPullToRefresh = initPullToRefresh;
window.refreshHomeData = refreshHomeData;

// ─── 14. STICKY HEADER BEHAVIOR ───────────────────────────
function initStickyHeader() {
  const header = document.querySelector('.hdr');
  const view = document.getElementById('view-home');
  
  if (!header || !view) return;
  
  let lastScrollTop = 0;
  
  view.addEventListener('scroll', () => {
    const currentScroll = view.scrollTop;
    
    if (currentScroll > lastScrollTop && currentScroll > 100) {
      // Scrolling down
      header.classList.add('hide-hdr');
    } else {
      // Scrolling up
      header.classList.remove('hide-hdr');
    }
    
    lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
  }, { passive: true });
}

window.initStickyHeader = initStickyHeader;

// ─── 15. POINTS BADGE IN HEADER ───────────────────────────
function updatePointsBadge() {
  const points = initLoyaltyPoints();
  const badge = document.querySelector('.cpill-coins');
  
  if (badge) {
    badge.textContent = `💎 ${points} pts`;
    badge.style.animation = 'none';
    setTimeout(() => badge.style.animation = 'pulse 0.4s ease', 10);
  }
}

window.updatePointsBadge = updatePointsBadge;

// ─── INIT ON LOAD ───────────────────────────────────────────
function initZeptoFeatures() {
  initLoyaltyPoints();
  initPullToRefresh();
  initStickyHeader();
  updatePointsBadge();
  
  console.log('✅ Zepto Features Initialized');
}

window.initZeptoFeatures = initZeptoFeatures;

// Auto-init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initZeptoFeatures);
} else {
  initZeptoFeatures();
}
