// ═══════════════════════════════════════════════════════════════
// NEKTA OPTIMIZATION — Image lazy loading + performance
// ROOT FIX: images not showing after deploy
// ═══════════════════════════════════════════════════════════════
'use strict';

var _imgRetries = {};
var _FALLBACK   = 'images/nektaIcon.svg';

function resolveImgSrc(src) {
  if (!src) return _FALLBACK;
  if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('blob:')) return src;
  return src.replace(/^\.\//, '');
}

function _loadImg(imgEl, src) {
  var resolved = resolveImgSrc(src);
  imgEl.src = resolved;
  delete imgEl.dataset.src; // prevent re-render from resetting it
  imgEl.onerror = function() {
    imgEl.onerror = null;
    imgEl.src = _FALLBACK;
  };
}

var _imgObserver = new IntersectionObserver(function(entries) {
  entries.forEach(function(e) {
    if (!e.isIntersecting) return;
    var img = e.target;
    if (!img.dataset.src) return;
    _imgObserver.unobserve(img);
    delete img.dataset.obs;
    _loadImg(img, img.dataset.src);
  });
}, { rootMargin: '300px', threshold: 0.01 });

function observeImg(img) {
  if (!img || !img.dataset.src) return;
  // If already visible in viewport, load immediately
  var rect = img.getBoundingClientRect();
  if (rect.top < window.innerHeight + 300) {
    _loadImg(img, img.dataset.src);
  } else {
    _imgObserver.observe(img);
  }
}
window.observeImg = observeImg;

function observeAllLazyImages() {
  document.querySelectorAll('img[data-src]').forEach(function(img) {
    observeImg(img);
  });
}
window.observeAllLazyImages = observeAllLazyImages;

// Watch DOM for new images added dynamically
new MutationObserver(observeAllLazyImages)
  .observe(document.documentElement, { childList:true, subtree:true });

// Initial scan
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeAllLazyImages);
} else {
  observeAllLazyImages();
}

// Prewarm — now correctly handles local paths too
function prewarmImageCache(products) {
  if (!Array.isArray(products)) return;
  products.slice(0, 40).forEach(function(p) {
    if (!p.img) return;
    var i = new Image();
    i.src = resolveImgSrc(p.img);
  });
}
window.prewarmImageCache = prewarmImageCache;

// Network listeners
window.addEventListener('online', function() {
  observeAllLazyImages();
  if (window.toast) window.toast('Back online ✅', 'success');
});
window.addEventListener('offline', function() {
  if (window.toast) window.toast('You are offline', 'warning');
});

// Stock listener
function setupStockListener() {
  if (!window.db) return;
  window.db.collection('products').onSnapshot(function(snap) {
    snap.docChanges().forEach(function(ch) {
      var d = ch.doc.data();
      if (!Array.isArray(window.products)) return;
      var idx = window.products.findIndex(function(p){ return String(p.id)===ch.doc.id||p.name===d.name; });
      if (idx < 0) return;
      window.products[idx].outOfStock = d.outOfStock;
    });
  }, function(){
    setTimeout(setupStockListener, 5000);
  });
}
window.addEventListener('firebaseReady', setupStockListener, { once:true });
