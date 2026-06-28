// ═══════════════════════════════════════════════════════════════
// NEKTA HOME EDITOR
// Complete user-side editor: hero sliders, product sections, banners,
// deal badges, category management, section scheduling
// ═══════════════════════════════════════════════════════════════
'use strict';

// ─── STATE ───────────────────────────────────────────────────
window._homeEditor = window._homeEditor || {
  heroes: [],           // Hero slider data
  sections: [],         // Custom product sections
  featured: [],         // Featured products
  banners: [],          // Offer banners
  categories: [],       // Category order & names
  deals: {},            // Deal of the day: { productId: { discount, badge, endTime } }
  schedules: {},        // Scheduled sections: { sectionId: { showTime, hideTime } }
};

let _editingHero = null;
let _editingSection = null;
let _editingDeal = null;

// ─── WAIT FOR FIREBASE ───────────────────────────────────────
function waitHomeEditor(fn, tries=0) {
  if (window.db && window.firebaseReady) { fn(); return; }
  if (tries > 40) { fn(); return; }
  setTimeout(() => waitHomeEditor(fn, tries+1), 300);
}

// ─── LOAD HOME EDITOR DATA ───────────────────────────────────
async function loadHomeEditorData() {
  if (!window.db) { console.warn('Firebase not ready'); return; }
  try {
    const doc = await window.db.collection('app_overrides').doc('home_config').get();
    if (doc.exists) {
      const data = doc.data();
      window._homeEditor.heroes = data.he_slides || [];
      window._homeEditor.sections = data.he_sections || [];
      window._homeEditor.featured = data.he_featured || [];
      window._homeEditor.banners = data.he_banners || [];
      window._homeEditor.categories = data.he_categories || [];
      window._homeEditor.deals = data.he_deals || {};
      window._homeEditor.schedules = data.he_schedules || {};
    }
  } catch(e) {
    console.error('Load home editor data:', e.message);
  }
}
window.loadHomeEditorData = loadHomeEditorData;

// ─── SAVE ALL TO FIREBASE ───────────────────────────────────
async function saveHomeEditorChanges() {
  if (!window.db) { console.error('Firebase not ready'); return; }
  try {
    await window.db.collection('app_overrides').doc('home_config').set({
      he_slides: window._homeEditor.heroes,
      he_sections: window._homeEditor.sections,
      he_featured: window._homeEditor.featured,
      he_banners: window._homeEditor.banners,
      he_categories: window._homeEditor.categories,
      he_deals: window._homeEditor.deals,
      he_schedules: window._homeEditor.schedules,
    }, { merge: true });
    toast('✅ Home editor changes saved & pushed to users', 'success');
    renderHomeEditor();
  } catch(e) {
    toast('❌ Save failed: ' + e.message, 'error');
  }
}
window.saveHomeEditorChanges = saveHomeEditorChanges;

// ─── HERO SLIDERS ───────────────────────────────────────────
function renderHeroSliders() {
  const container = document.getElementById('he-heroes-list');
  if (!container) return;
  
  const heroes = window._homeEditor.heroes || [];
  if (!heroes.length) {
    container.innerHTML = '<div class="empty-state">No hero sliders yet. Click + Add to create one.</div>';
    return;
  }
  
  container.innerHTML = heroes.map((h, idx) => `
    <div class="he-card" style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;background:var(--bg3)">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px">
        <div style="flex:1">
          <h4 style="font-size:14px;font-weight:600;margin-bottom:4px">${esc(h.tag || 'Hero Slide ' + (idx+1))}</h4>
          <p style="font-size:12px;color:var(--text2)">Color: ${h.bg || '#000'} • Icon: ${h.e || '🎯'} • On: ${h.on !== false ? '✅' : '❌'}</p>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn-sm bg-blue" onclick="editHeroSlider(${idx})">✏️ Edit</button>
          <button class="btn-sm bg-red" onclick="deleteHeroSlider(${idx})">🗑️ Delete</button>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text2)">
        ${h.sub ? '📝 Subtitle: ' + esc(h.sub) : ''}
        ${h.img ? '<br>🖼️ Image: ' + esc(h.img.substring(0, 40)) + '...' : ''}
      </div>
    </div>
  `).join('');
}

function addHeroSlider() {
  const heroes = window._homeEditor.heroes || [];
  const newHero = {
    tag: 'New Hero ' + (heroes.length + 1),
    sub: 'Add a subtitle',
    bg: '#1a3a52',
    e: '🎯',
    img: '',
    on: true
  };
  heroes.push(newHero);
  _editingHero = heroes.length - 1;
  openHeroEditor();
}
window.addHeroSlider = addHeroSlider;

function editHeroSlider(idx) {
  _editingHero = idx;
  openHeroEditor();
}
window.editHeroSlider = editHeroSlider;

function deleteHeroSlider(idx) {
  if (!confirm('Delete this hero slider?')) return;
  window._homeEditor.heroes.splice(idx, 1);
  renderHeroSliders();
}
window.deleteHeroSlider = deleteHeroSlider;

function openHeroEditor() {
  const idx = _editingHero;
  const h = window._homeEditor.heroes[idx];
  if (!h) return;
  
  showModal(
    '<h3>✏️ Edit Hero Slider</h3>'
    + '<div class="form-group"><label>Tag/Title</label><input type="text" id="hero-tag" value="' + esc(h.tag || '') + '" placeholder="e.g., Fresh Vegetables"></div>'
    + '<div class="form-group"><label>Subtitle</label><input type="text" id="hero-sub" value="' + esc(h.sub || '') + '" placeholder="e.g., Organic & Fresh"></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">'
    + '<div class="form-group"><label>Color Hex</label><input type="color" id="hero-bg" value="' + (h.bg || '#1a3a52') + '"></div>'
    + '<div class="form-group"><label>Icon/Emoji</label><input type="text" id="hero-e" value="' + esc(h.e || '🎯') + '" maxlength="2" placeholder="🎯"></div>'
    + '</div>'
    + '<div class="form-group"><label>Background Image URL (optional)</label><input type="url" id="hero-img" value="' + esc(h.img || '') + '" placeholder="https://..."></div>'
    + '<div class="form-group"><label>Show on Home?</label><div class="toggle ' + (h.on !== false ? 'on' : '') + '" id="hero-toggle" onclick="this.classList.toggle(\'on\')"></div></div>'
    + '<div class="modal-footer">'
    + '<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '<button class="btn-primary" onclick="saveHeroSlider()">✅ Save</button>'
    + '</div>'
  );
}
window.openHeroEditor = openHeroEditor;

function saveHeroSlider() {
  const idx = _editingHero;
  const h = window._homeEditor.heroes[idx];
  h.tag = document.getElementById('hero-tag').value || 'Untitled';
  h.sub = document.getElementById('hero-sub').value || '';
  h.bg = document.getElementById('hero-bg').value || '#1a3a52';
  h.e = document.getElementById('hero-e').value || '🎯';
  h.img = document.getElementById('hero-img').value || '';
  h.on = document.getElementById('hero-toggle').classList.contains('on');
  closeModal();
  renderHeroSliders();
}
window.saveHeroSlider = saveHeroSlider;

// ─── PRODUCT SECTIONS ───────────────────────────────────────
function renderProductSections() {
  const container = document.getElementById('he-sections-list');
  if (!container) return;
  
  const sections = window._homeEditor.sections || [];
  if (!sections.length) {
    container.innerHTML = '<div class="empty-state">No custom sections yet. Click + Add to create one.</div>';
    return;
  }
  
  container.innerHTML = sections.map((s, idx) => `
    <div class="he-card" style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;background:var(--bg3)">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
        <div style="flex:1">
          <h4 style="font-size:14px;font-weight:600;margin-bottom:4px">${esc(s.name || 'Section ' + (idx+1))}</h4>
          <p style="font-size:12px;color:var(--text2)">${(s.products || []).length} products • On: ${s.on !== false ? '✅' : '❌'}</p>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn-sm bg-blue" onclick="editProductSection(${idx})">✏️ Edit</button>
          <button class="btn-sm bg-red" onclick="deleteProductSection(${idx})">🗑️ Delete</button>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text2)">
        ${s.displayType ? 'Type: ' + s.displayType + ' • ' : ''}
        ${s.showTime ? 'Scheduled: ' + s.showTime + ' → ' + s.hideTime : ''}
      </div>
    </div>
  `).join('');
}

function addProductSection() {
  const sections = window._homeEditor.sections || [];
  const newSection = {
    name: 'New Section',
    products: [],
    displayType: 'grid',
    on: true,
    showTime: '',
    hideTime: ''
  };
  sections.push(newSection);
  _editingSection = sections.length - 1;
  editProductSection(_editingSection);
}
window.addProductSection = addProductSection;

function editProductSection(idx) {
  _editingSection = idx;
  openSectionEditor();
}
window.editProductSection = editProductSection;

function deleteProductSection(idx) {
  if (!confirm('Delete this section?')) return;
  window._homeEditor.sections.splice(idx, 1);
  renderProductSections();
}
window.deleteProductSection = deleteProductSection;

function openSectionEditor() {
  const idx = _editingSection;
  const s = window._homeEditor.sections[idx];
  if (!s) return;
  
  const products = window._allProducts || [];
  const selectedIds = new Set((s.products || []).map(p => p.id));
  
  showModal(
    '<h3>✏️ Edit Product Section</h3>'
    + '<div class="form-group"><label>Section Name</label><input type="text" id="sec-name" value="' + esc(s.name || '') + '" placeholder="e.g., Special Offers"></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">'
    + '<div class="form-group"><label>Display Type</label><select id="sec-type" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px">'
    + '<option value="grid" ' + (s.displayType === 'grid' ? 'selected' : '') + '>Grid (3 cols)</option>'
    + '<option value="scroll" ' + (s.displayType === 'scroll' ? 'selected' : '') + '>Horizontal Scroll</option>'
    + '<option value="list" ' + (s.displayType === 'list' ? 'selected' : '') + '>List</option>'
    + '</select></div>'
    + '<div class="form-group"><label>Show?</label><div class="toggle ' + (s.on !== false ? 'on' : '') + '" id="sec-toggle" onclick="this.classList.toggle(\'on\')"></div></div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">'
    + '<div class="form-group"><label>Show Time (HH:MM, optional)</label><input type="time" id="sec-show" value="' + (s.showTime || '') + '"></div>'
    + '<div class="form-group"><label>Hide Time (HH:MM, optional)</label><input type="time" id="sec-hide" value="' + (s.hideTime || '') + '"></div>'
    + '</div>'
    + '<div><label style="font-weight:600;margin-bottom:8px;display:block">Add Products to Section</label>'
    + '<div style="max-height:200px;overflow-y:auto;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:8px">'
    + products.map((p, i) => `
      <div style="display:flex;align-items:center;padding:8px;border-radius:8px;cursor:pointer;background:${selectedIds.has(p.id) ? 'rgba(0,230,118,.2)' : 'transparent'};margin-bottom:4px">
        <input type="checkbox" id="prod-chk-${i}" ${selectedIds.has(p.id) ? 'checked' : ''} onchange="toggleSectionProduct(${i}, this)">
        <label for="prod-chk-${i}" style="flex:1;margin-left:8px;cursor:pointer;font-size:13px">${esc(p.name)}</label>
        <span style="font-size:11px;color:var(--text2)">₹${p.price}</span>
      </div>
    `).join('')
    + '</div></div>'
    + '<div class="modal-footer">'
    + '<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '<button class="btn-primary" onclick="saveProductSection()">✅ Save Section</button>'
    + '</div>'
  );
}
window.openSectionEditor = openSectionEditor;

let _sectionProductSelection = new Set();

function toggleSectionProduct(idx, el) {
  const p = (window._allProducts || [])[idx];
  if (!p) return;
  if (el.checked) {
    _sectionProductSelection.add(p.id);
  } else {
    _sectionProductSelection.delete(p.id);
  }
}
window.toggleSectionProduct = toggleSectionProduct;

function saveProductSection() {
  const idx = _editingSection;
  const s = window._homeEditor.sections[idx];
  s.name = document.getElementById('sec-name').value || 'Untitled';
  s.displayType = document.getElementById('sec-type').value || 'grid';
  s.on = document.getElementById('sec-toggle').classList.contains('on');
  s.showTime = document.getElementById('sec-show').value || '';
  s.hideTime = document.getElementById('sec-hide').value || '';
  
  // Get selected products
  const products = (window._allProducts || []).filter(p => {
    const cb = document.getElementById('prod-chk-' + (window._allProducts.indexOf(p)));
    return cb && cb.checked;
  });
  s.products = products.map(p => ({ id: p.id, name: p.name, price: p.price }));
  
  closeModal();
  renderProductSections();
}
window.saveProductSection = saveProductSection;

// ─── FEATURED PRODUCTS ───────────────────────────────────────
function renderFeaturedProducts() {
  const container = document.getElementById('he-featured-list');
  if (!container) return;
  
  const featured = window._homeEditor.featured || [];
  if (!featured.length) {
    container.innerHTML = '<div class="empty-state">No featured products. Click + Add to select products.</div>';
    return;
  }
  
  container.innerHTML = featured.map((f, idx) => {
    const prod = (window._allProducts || []).find(p => p.id === f.id);
    return `
      <div class="he-card" style="display:flex;align-items:center;justify-content:space-between;padding:10px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;background:var(--bg3)">
        <div style="flex:1">
          <p style="font-size:13px;font-weight:600">${esc(prod?.name || 'Unknown')}</p>
          <p style="font-size:11px;color:var(--text2)">₹${prod?.price}</p>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn-sm bg-ghost" onclick="moveFeaturedUp(${idx})">⬆️</button>
          <button class="btn-sm bg-ghost" onclick="moveFeaturedDown(${idx})">⬇️</button>
          <button class="btn-sm bg-red" onclick="he_removeFeatured(${idx})">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

function he_openFeaturedPicker() {
  const products = window._allProducts || [];
  const featured = window._homeEditor.featured || [];
  const featuredIds = new Set(featured.map(f => f.id));
  showModal(
    '<h3>⭐ Select Featured Products (up to 6)</h3>'
    + '<div style="max-height:300px;overflow-y:auto;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:8px">'
    + products.slice(0, 30).map((p, i) => `
      <div style="display:flex;align-items:center;padding:10px;border-radius:8px;cursor:pointer;margin-bottom:4px">
        <input type="checkbox" id="feat-chk-${i}" ${featuredIds.has(p.id) ? 'checked' : ''} onchange="he_toggleFeaturedProduct(${p.id}, this)">
        <label for="feat-chk-${i}" style="flex:1;margin-left:10px;cursor:pointer">
          <span style="font-size:13px;font-weight:600">${esc(p.name)}</span>
          <span style="font-size:11px;color:var(--text2);margin-left:10px">₹${p.price}</span>
        </label>
      </div>
    `).join('')
    + '</div>'
    + '<div class="modal-footer">'
    + '<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '<button class="btn-primary" onclick="he_saveFeaturedProducts()">✅ Set Featured</button>'
    + '</div>'
  );
}
window.he_openFeaturedPicker = he_openFeaturedPicker;

let _featuredSelection = new Set();

function he_toggleFeaturedProduct(id, el) {
  if (el.checked) {
    if (_featuredSelection.size >= 6) {
      el.checked = false;
      toast('Maximum 6 featured products', 'warning');
      return;
    }
    _featuredSelection.add(id);
  } else {
    _featuredSelection.delete(id);
  }
}
window.he_toggleFeaturedProduct = he_toggleFeaturedProduct;

function he_saveFeaturedProducts() {
  const featured = Array.from(_featuredSelection).map(id => {
    const p = (window._allProducts || []).find(x => x.id === id);
    return { id, name: p?.name || '', price: p?.price || 0 };
  });
  window._homeEditor.featured = featured;
  closeModal();
  renderFeaturedProducts();
}
window.he_saveFeaturedProducts = he_saveFeaturedProducts;

function moveFeaturedUp(idx) {
  if (idx === 0) return;
  const featured = window._homeEditor.featured || [];
  [featured[idx], featured[idx-1]] = [featured[idx-1], featured[idx]];
  renderFeaturedProducts();
}
window.moveFeaturedUp = moveFeaturedUp;

function moveFeaturedDown(idx) {
  const featured = window._homeEditor.featured || [];
  if (idx === featured.length - 1) return;
  [featured[idx], featured[idx+1]] = [featured[idx+1], featured[idx]];
  renderFeaturedProducts();
}
window.moveFeaturedDown = moveFeaturedDown;

function he_removeFeatured(idx) {
  window._homeEditor.featured.splice(idx, 1);
  renderFeaturedProducts();
}
window.he_removeFeatured = he_removeFeatured;

// ─── OFFER BANNERS ───────────────────────────────────────────
function renderOfferBanners() {
  const container = document.getElementById('he-banners-list');
  if (!container) return;
  
  const banners = window._homeEditor.banners || [];
  if (!banners.length) {
    container.innerHTML = '<div class="empty-state">No offer banners yet.</div>';
    return;
  }
  
  container.innerHTML = banners.map((b, idx) => `
    <div class="he-card" style="border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:8px;background:var(--bg3)">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
        <div style="flex:1">
          <h4 style="font-size:13px;font-weight:600;margin-bottom:2px">${esc(b.title || 'Banner')}</h4>
          <p style="font-size:11px;color:var(--text2)">${esc(b.text || '')}</p>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn-sm bg-blue" onclick="he_editBanner(${idx})">✏️ Edit</button>
          <button class="btn-sm bg-red" onclick="he_deleteBanner(${idx})">🗑️ Delete</button>
        </div>
      </div>
      ${b.imageUrl ? '<img src="' + esc(b.imageUrl) + '" style="width:100%;max-height:100px;object-fit:cover;border-radius:8px;margin-bottom:8px">' : ''}
      <div style="font-size:10px;color:var(--text2)">On: ${b.on !== false ? '✅' : '❌'} • Type: ${b.type || 'default'}</div>
    </div>
  `).join('');
}

function he_addOfferBanner() {
  const banners = window._homeEditor.banners || [];
  banners.push({
    title: 'New Offer',
    text: 'Get amazing deals!',
    imageUrl: '',
    type: 'default',
    bgColor: '#ff6d00',
    on: true
  });
  he_editBanner(banners.length - 1);
}
window.he_addOfferBanner = he_addOfferBanner;

function he_editBanner(idx) {
  const b = window._homeEditor.banners[idx];
  if (!b) return;
  showModal(
    '<h3>✏️ Edit Banner</h3>'
    + '<div class="form-group"><label>Title</label><input type="text" id="bn-title" value="' + esc(b.title || '') + '" placeholder="Banner title"></div>'
    + '<div class="form-group"><label>Text</label><input type="text" id="bn-text" value="' + esc(b.text || '') + '" placeholder="Banner text"></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">'
    + '<div class="form-group"><label>Background Color</label><input type="color" id="bn-bg" value="' + (b.bgColor || '#ff6d00') + '"></div>'
    + '<div class="form-group"><label>Type</label><select id="bn-type" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px">'
    + '<option value="default" ' + (b.type === 'default' ? 'selected' : '') + '>Default</option>'
    + '<option value="success" ' + (b.type === 'success' ? 'selected' : '') + '>Success</option>'
    + '<option value="warning" ' + (b.type === 'warning' ? 'selected' : '') + '>Warning</option>'
    + '</select></div>'
    + '</div>'
    + '<div class="form-group"><label>Image URL (optional)</label><input type="url" id="bn-img" value="' + esc(b.imageUrl || '') + '" placeholder="https://..."></div>'
    + '<div class="form-group"><label>Show?</label><div class="toggle ' + (b.on !== false ? 'on' : '') + '" id="bn-toggle" onclick="this.classList.toggle(\'on\')"></div></div>'
    + '<div class="modal-footer">'
    + '<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '<button class="btn-primary" onclick="he_saveBanner(' + idx + ')">✅ Save</button>'
    + '</div>'
  );
}
window.he_editBanner = he_editBanner;

function he_saveBanner(idx) {
  const b = window._homeEditor.banners[idx];
  b.title = document.getElementById('bn-title').value || 'Offer';
  b.text = document.getElementById('bn-text').value || '';
  b.bgColor = document.getElementById('bn-bg').value || '#ff6d00';
  b.type = document.getElementById('bn-type').value || 'default';
  b.imageUrl = document.getElementById('bn-img').value || '';
  b.on = document.getElementById('bn-toggle').classList.contains('on');
  closeModal();
  renderOfferBanners();
}
window.he_saveBanner = he_saveBanner;

function he_deleteBanner(idx) {
  if (!confirm('Delete this banner?')) return;
  window._homeEditor.banners.splice(idx, 1);
  renderOfferBanners();
}
window.he_deleteBanner = he_deleteBanner;

// ─── DEAL OF THE DAY ─────────────────────────────────────────
function renderDealOfDay() {
  const container = document.getElementById('he-deals-list');
  if (!container) return;
  
  const deals = window._homeEditor.deals || {};
  const dealEntries = Object.entries(deals);
  
  if (!dealEntries.length) {
    container.innerHTML = '<div class="empty-state">No deals yet. Click + Add to create a deal.</div>';
    return;
  }
  
  container.innerHTML = dealEntries.map(([productId, deal]) => {
    const prod = (window._allProducts || []).find(p => String(p.id) === String(productId));
    return `
      <div class="he-card" style="border:1px solid rgba(255,215,0,.3);border-left:4px solid var(--yellow);border-radius:12px;padding:12px;margin-bottom:8px;background:rgba(255,215,0,.05)">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
          <div style="flex:1">
            <h4 style="font-size:13px;font-weight:600;color:var(--yellow);margin-bottom:2px">💰 ${esc(prod?.name || 'Unknown')}</h4>
            <p style="font-size:11px;color:var(--text2)">Discount: ${deal.discount}% • Badge: ${esc(deal.badge || 'DEAL')}</p>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn-sm bg-blue" onclick="editDeal('${productId}')">✏️ Edit</button>
            <button class="btn-sm bg-red" onclick="deleteDeal('${productId}')">🗑️ Delete</button>
          </div>
        </div>
        <div style="font-size:10px;color:var(--text2)">Ends: ${deal.endTime || 'No expiry'}</div>
      </div>
    `;
  }).join('');
}

function addDeal() {
  const products = window._allProducts || [];
  const deals = window._homeEditor.deals || {};
  
  showModal(
    '<h3>💰 Add Deal of the Day</h3>'
    + '<div class="form-group"><label>Select Product</label>'
    + '<select id="deal-product" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px;width:100%;color:var(--text)">'
    + '<option value="">Choose a product...</option>'
    + products.map(p => '<option value="' + p.id + '">' + esc(p.name) + ' (₹' + p.price + ')</option>').join('')
    + '</select></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">'
    + '<div class="form-group"><label>Discount (%)</label><input type="number" id="deal-discount" min="5" max="90" value="20" placeholder="20"></div>'
    + '<div class="form-group"><label>Badge Text</label><input type="text" id="deal-badge" value="HOT DEAL" placeholder="e.g., HOT DEAL"></div>'
    + '</div>'
    + '<div class="form-group"><label>Expiry Time (optional)</label><input type="datetime-local" id="deal-expiry"></div>'
    + '<div class="modal-footer">'
    + '<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '<button class="btn-primary" onclick="saveDeal()">✅ Set Deal</button>'
    + '</div>'
  );
}
window.addDeal = addDeal;

function saveDeal() {
  const productId = document.getElementById('deal-product').value;
  if (!productId) { toast('Select a product', 'warning'); return; }
  
  const discount = parseInt(document.getElementById('deal-discount').value) || 20;
  const badge = document.getElementById('deal-badge').value || 'DEAL';
  const endTime = document.getElementById('deal-expiry').value || '';
  
  window._homeEditor.deals[productId] = { discount, badge, endTime };
  closeModal();
  renderDealOfDay();
}
window.saveDeal = saveDeal;

function editDeal(productId) {
  const deal = window._homeEditor.deals[productId];
  const prod = (window._allProducts || []).find(p => String(p.id) === String(productId));
  if (!deal) return;
  
  showModal(
    '<h3>✏️ Edit Deal</h3>'
    + '<p style="font-size:13px;margin-bottom:12px">Product: <b>' + esc(prod?.name || 'Unknown') + '</b></p>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">'
    + '<div class="form-group"><label>Discount (%)</label><input type="number" id="deal-discount2" min="5" max="90" value="' + deal.discount + '"></div>'
    + '<div class="form-group"><label>Badge Text</label><input type="text" id="deal-badge2" value="' + esc(deal.badge || '') + '"></div>'
    + '</div>'
    + '<div class="form-group"><label>Expiry Time</label><input type="datetime-local" id="deal-expiry2" value="' + (deal.endTime || '') + '"></div>'
    + '<div class="modal-footer">'
    + '<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '<button class="btn-primary" onclick="updateDeal(\'' + productId + '\')">✅ Update</button>'
    + '</div>'
  );
}
window.editDeal = editDeal;

function updateDeal(productId) {
  const discount = parseInt(document.getElementById('deal-discount2').value) || 20;
  const badge = document.getElementById('deal-badge2').value || 'DEAL';
  const endTime = document.getElementById('deal-expiry2').value || '';
  
  window._homeEditor.deals[productId] = { discount, badge, endTime };
  closeModal();
  renderDealOfDay();
}
window.updateDeal = updateDeal;

function deleteDeal(productId) {
  if (!confirm('Delete this deal?')) return;
  delete window._homeEditor.deals[productId];
  renderDealOfDay();
}
window.deleteDeal = deleteDeal;

// ─── CATEGORY MANAGEMENT ────────────────────────────────────
function renderCategoryManager() {
  const container = document.getElementById('he-categories-list');
  if (!container) return;
  
  const categories = window._homeEditor.categories || [];
  const defaultCats = [
    'VEGETABLES','LEAFY','FRUITS','DAIRY','GRAINS','DALS','OILS',
    'SPICES','CONDIMENTS','PICKLES','SNACKS','CHOCOLATES','ICECREAMS',
    'DRINKS','NONVEG','COMBOS','EASYCOOK','PERSONALCARE','CLEANING','PUJA','PANSHOP'
  ];
  const catList = categories.length ? categories : defaultCats;
  
  container.innerHTML = catList.map((cat, idx) => `
    <div class="he-card" style="display:flex;align-items:center;justify-content:space-between;padding:10px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;background:var(--bg3)">
      <div style="flex:1">
        <input type="text" id="cat-name-${idx}" value="${cat.replace(/"/g,'&quot;')}" style="background:transparent;border:none;color:var(--text);font-size:13px;font-weight:600;width:100%;">
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn-sm bg-ghost" onclick="moveCatUp(${idx})">⬆️</button>
        <button class="btn-sm bg-ghost" onclick="moveCatDown(${idx})">⬇️</button>
      </div>
    </div>
  `).join('');
}

function _syncCatsFromDOM() {
  const defaultCats = [
    'VEGETABLES','LEAFY','FRUITS','DAIRY','GRAINS','DALS','OILS',
    'SPICES','CONDIMENTS','PICKLES','SNACKS','CHOCOLATES','ICECREAMS',
    'DRINKS','NONVEG','COMBOS','EASYCOOK','PERSONALCARE','CLEANING','PUJA','PANSHOP'
  ];
  if (!window._homeEditor.categories.length) {
    window._homeEditor.categories = [...defaultCats];
  }
  // Read current input values back into the array before any swap
  const inputs = document.querySelectorAll('[id^="cat-name-"]');
  if (inputs.length) {
    inputs.forEach((inp, i) => {
      window._homeEditor.categories[i] = inp.value.toUpperCase() || window._homeEditor.categories[i];
    });
  }
}

function moveCatUp(idx) {
  _syncCatsFromDOM();
  if (idx === 0) return;
  const cats = window._homeEditor.categories;
  [cats[idx], cats[idx-1]] = [cats[idx-1], cats[idx]];
  renderCategoryManager();
}
window.moveCatUp = moveCatUp;

function moveCatDown(idx) {
  _syncCatsFromDOM();
  const cats = window._homeEditor.categories;
  if (idx === cats.length - 1) return;
  [cats[idx], cats[idx+1]] = [cats[idx+1], cats[idx]];
  renderCategoryManager();
}
window.moveCatDown = moveCatDown;

function saveCategories() {
  _syncCatsFromDOM();
  toast('✅ Categories updated', 'success');
}
window.saveCategories = saveCategories;

// ─── MAIN RENDERER ───────────────────────────────────────────
function renderHomeEditor() {
  renderHeroSliders();
  renderProductSections();
  renderFeaturedProducts();
  renderOfferBanners();
  renderDealOfDay();
  renderCategoryManager();
}
window.renderHomeEditor = renderHomeEditor;

// ─── INIT ────────────────────────────────────────────────────
function initHomeEditor() {
  waitHomeEditor(async () => {
    await loadHomeEditorData();
    renderHomeEditor();
  });
}
window.initHomeEditor = initHomeEditor;

// Auto-init when page loads — no role check needed, dashboard already guards access
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(initHomeEditor, 800));
} else {
  setTimeout(initHomeEditor, 800);
}
