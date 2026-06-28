// Products data
// Seed is EMPTY — all products load from Firestore only.
// To add/update products, upload an xlsx from the dashboard.
var _SEED_PRODUCTS = [];

var products = _SEED_PRODUCTS.slice();
window._SEED_PRODUCTS = _SEED_PRODUCTS;
window.PRODUCT_SEED = _SEED_PRODUCTS;

const getProduct = (id) => (window._allProducts || products).find(p => p.id == id);

const formatQtyDisplay = (qty, unit) => {
    const cleanUnit = unit.replace(' (950g-1000g)', '').replace(' (450g-500g)', '');
    const isKgUnit = cleanUnit === 'Kg';
    const isGramUnit = /^\d+g$/.test(cleanUnit);
    const isPcsUnit = cleanUnit === 'Pcs';
    if (isPcsUnit) return `${Math.round(qty * 12)}pc`;
    if (isKgUnit) return `${Math.round(qty * 1000)}g`;
    if (isGramUnit) return `${Math.round(qty * parseInt(cleanUnit))}g`;
    const f = parseFloat(qty).toFixed(1);
    return f.endsWith('.0') ? `${Math.round(qty)} ${cleanUnit}` : `${f} ${cleanUnit}`;
};

const calculateItemCost = (id, qty) => {
    const p = getProduct(id);
    if (!p) return 0;
    if (p.unit.includes('Kg') || p.unit.includes('Pcs')) {
        if (qty === 0.25 && p.quarterPrice) return p.quarterPrice;
        if (qty === 0.5 && p.halfPrice) return p.halfPrice;
        return Math.round(qty * p.price);
    }
    return Math.round(p.price * qty);
};

// ── VARIANT EXPANSION ──────────────────────────────────────────────
// Use the canonical version from app-overrides.js instead.
// Products are expanded when they load from Firestore (see app-overrides.js)
// The seed starts empty anyway; Firestore is the source of truth.

products = [];
window.products = products;
console.log('products.js loaded — Firestore is the source of truth');

function renderProducts() {
    if (typeof renderHomeSections === 'function') renderHomeSections();
    if (typeof renderCatalogProducts === 'function' && typeof activeCategory !== 'undefined')
        renderCatalogProducts(activeCategory);
}
