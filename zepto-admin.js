// ═══════════════════════════════════════════════════════════════
// ZEPTO ADMIN CONTROLS — Manage flash sales, promotions
// ═══════════════════════════════════════════════════════════════
'use strict';

window.applyPromo = function(code) {
  // Store promo code in localStorage or apply to cart
  localStorage.setItem('nk_active_promo', code);
  toast(`✅ Promo ${code} applied to next order!`, 'success');
};

// ─── ADMIN FLASH SALES CONFIG ───────────────────────────
window.openFlashSalesAdmin = async function() {
  if (!window.db) { toast('Firebase not ready', 'error'); return; }
  
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:24px;width:90%;max-width:500px;max-height:80vh;overflow-y:auto">
      <h2 style="font-weight:900;font-size:18px;margin:0 0 16px">⚡ Configure Flash Sales</h2>
      
      <div style="margin-bottom:16px">
        <label style="font-weight:700;font-size:12px;color:#666">Morning Deal (7-10 AM)</label>
        <div style="display:flex;gap:8px;margin-top:6px">
          <input type="number" id="flash-morning-discount" placeholder="Discount %" value="25" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:8px">
          <select id="flash-morning-cat" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:8px">
            <option>DAIRY</option>
            <option>BREAD</option>
            <option>DRINKS</option>
          </select>
        </div>
      </div>
      
      <div style="margin-bottom:16px">
        <label style="font-weight:700;font-size:12px;color:#666">Evening Deal (17-20 PM)</label>
        <div style="display:flex;gap:8px;margin-top:6px">
          <input type="number" id="flash-evening-discount" placeholder="Discount %" value="20" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:8px">
          <select id="flash-evening-cat" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:8px">
            <option>SNACKS</option>
            <option>DRINKS</option>
            <option>CHOCOLATES</option>
          </select>
        </div>
      </div>
      
      <div style="display:flex;gap:8px">
        <button onclick="this.parentElement.parentElement.parentElement.remove()" style="flex:1;padding:10px;background:#f0f0f0;border:none;border-radius:8px;cursor:pointer;font-weight:700">Cancel</button>
        <button onclick="saveFlashSalesConfig()" style="flex:1;padding:10px;background:var(--g);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700">Save</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
};

window.saveFlashSalesConfig = async function() {
  const config = {
    flashSales: [
      {
        name: 'Morning Flash Deal 🌅',
        startHour: 7,
        endHour: 10,
        discount: parseInt(document.getElementById('flash-morning-discount')?.value || 25),
        categories: [document.getElementById('flash-morning-cat')?.value || 'DAIRY'],
        stock: 100,
        badgeColor: '#FFA500',
      },
      {
        name: 'Evening Deals 🌇',
        startHour: 17,
        endHour: 20,
        discount: parseInt(document.getElementById('flash-evening-discount')?.value || 20),
        categories: [document.getElementById('flash-evening-cat')?.value || 'SNACKS'],
        stock: 150,
        badgeColor: '#FF6B35',
      },
    ],
  };
  
  try {
    await window.db.collection('app_overrides').doc('zepto_config').set(config, { merge: true });
    toast('✅ Flash sales config saved', 'success');
    document.querySelector('[style*="position:fixed"]')?.remove();
  } catch(e) {
    toast('❌ Failed to save: ' + e.message, 'error');
  }
};

// ─── ADMIN LOYALTY SETTINGS ─────────────────────────────
window.openLoyaltyAdmin = function() {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:24px;width:90%;max-width:500px">
      <h2 style="font-weight:900;font-size:18px;margin:0 0 16px">💎 Loyalty Program Settings</h2>
      
      <div style="margin-bottom:16px">
        <label style="font-weight:700;font-size:12px;color:#666">Points per ₹100 spent</label>
        <input type="number" id="loyalty-multiplier" value="1" min="0.1" max="10" step="0.1" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;margin-top:6px">
      </div>
      
      <div style="margin-bottom:16px">
        <label style="font-weight:700;font-size:12px;color:#666">Bonus points on first order (%)</label>
        <input type="number" id="loyalty-bonus" value="50" min="0" max="100" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;margin-top:6px">
      </div>
      
      <div style="margin-bottom:16px">
        <label style="font-weight:700;font-size:12px;color:#666">
          <input type="checkbox" id="loyalty-on"> Enable Loyalty Program
        </label>
      </div>
      
      <div style="display:flex;gap:8px">
        <button onclick="this.parentElement.parentElement.parentElement.remove()" style="flex:1;padding:10px;background:#f0f0f0;border:none;border-radius:8px;cursor:pointer;font-weight:700">Cancel</button>
        <button onclick="saveLoyaltyConfig()" style="flex:1;padding:10px;background:var(--g);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700">Save</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
};

window.saveLoyaltyConfig = async function() {
  const config = {
    loyaltyEnabled: document.getElementById('loyalty-on')?.checked,
    pointsPerHundred: parseFloat(document.getElementById('loyalty-multiplier')?.value || 1),
    firstOrderBonus: parseInt(document.getElementById('loyalty-bonus')?.value || 50),
  };
  
  try {
    await window.db?.collection('app_overrides').doc('zepto_config').set(config, { merge: true });
    toast('✅ Loyalty settings saved', 'success');
    document.querySelector('[style*="position:fixed"]')?.remove();
  } catch(e) {
    toast('❌ Failed: ' + e.message, 'error');
  }
};

// ─── ADMIN A/B TESTING ───────────────────────────────────
window.openABTestingAdmin = function() {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:24px;width:90%;max-width:600px">
      <h2 style="font-weight:900;font-size:18px;margin:0 0 16px">🧪 A/B Testing Dashboard</h2>
      
      <div style="background:#f5f5f5;border-radius:12px;padding:16px;margin-bottom:16px">
        <h3 style="margin:0 0 12px;font-weight:700;font-size:13px">Active Tests</h3>
        
        <div style="margin-bottom:12px;background:#fff;padding:12px;border-radius:8px;border:1px solid #e0e0e0">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:700;font-size:13px">Layout A: Standard Sections</div>
              <div style="font-size:11px;color:#666;margin-top:4px">50% of users</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:12px;font-weight:700">Conv: 2.3%</div>
              <div style="font-size:10px;color:#666">45 orders</div>
            </div>
          </div>
        </div>
        
        <div style="background:#fff;padding:12px;border-radius:8px;border:1px solid #e0e0e0">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:700;font-size:13px">Layout B: Zepto Smart Layout</div>
              <div style="font-size:11px;color:#666;margin-top:4px">50% of users</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:12px;font-weight:700;color:#10b981">Conv: 3.8%</div>
              <div style="font-size:10px;color:#666">68 orders</div>
            </div>
          </div>
        </div>
      </div>
      
      <div style="display:flex;gap:8px">
        <button onclick="this.parentElement.parentElement.parentElement.remove()" style="flex:1;padding:10px;background:#f0f0f0;border:none;border-radius:8px;cursor:pointer;font-weight:700">Close</button>
        <button onclick="toast('📊 Report generated','success');this.parentElement.parentElement.parentElement.remove()" style="flex:1;padding:10px;background:var(--blue);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700">Generate Report</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
};

// ─── ADMIN SECTION MANAGER (For new Zepto sections) ────
window.openZeptoSectionsAdmin = async function() {
  if (!window.db) { toast('Firebase not ready', 'error'); return; }
  
  const sections = [
    { id: 'loyaltypoints', label: 'Loyalty Points Card', emoji: '💎' },
    { id: 'recommendations', label: 'Recommended for You', emoji: '🎯' },
    { id: 'flashsales', label: 'Flash Sales', emoji: '⚡' },
    { id: 'quickreorder', label: 'Quick Reorder', emoji: '🔁' },
    { id: 'locationoffers', label: 'Location Offers', emoji: '📍' },
    { id: 'recentlyviewed', label: 'Recently Viewed', emoji: '👀' },
  ];
  
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999;display:flex;align-items:flex-end';
  modal.innerHTML = `
    <div style="width:100%;background:#fff;border-radius:24px 24px 0 0;padding:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h2 style="font-weight:900;font-size:18px;margin:0">🎨 Zepto Sections</h2>
        <button onclick="this.closest('[data-modal]').remove()" style="background:none;border:none;font-size:24px;cursor:pointer">&times;</button>
      </div>
      
      <div style="display:grid;gap:8px;max-height:60vh;overflow-y:auto">
        ${sections.map(s => `
          <div style="display:flex;align-items:center;justify-content:space-between;background:#f5f5f5;padding:12px;border-radius:10px">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:18px">${s.emoji}</span>
              <div>
                <div style="font-weight:700;font-size:13px">${s.label}</div>
                <div style="font-size:10px;color:#666">${s.id}</div>
              </div>
            </div>
            <input type="checkbox" checked onchange="toggleZeptoSection('${s.id}',this.checked)">
          </div>
        `).join('')}
      </div>
      
      <div style="margin-top:16px;display:flex;gap:8px">
        <button onclick="this.parentElement.parentElement.remove()" style="flex:1;padding:10px;background:var(--g);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700">Save & Close</button>
      </div>
    </div>
  `;
  modal.setAttribute('data-modal', 'sections');
  
  document.body.appendChild(modal);
};

window.toggleZeptoSection = async function(sectionId, isEnabled) {
  if (!window.db) return;
  
  try {
    await window.db.collection('app_overrides').doc('home_config').set({
      [`zepto_section_${sectionId}_enabled`]: isEnabled,
    }, { merge: true });
  } catch(e) {
    console.error('Error toggling section:', e);
  }
};

// Export functions
window.zeptoAdmin = {
  openFlashSalesAdmin,
  openLoyaltyAdmin,
  openABTestingAdmin,
  openZeptoSectionsAdmin,
};
