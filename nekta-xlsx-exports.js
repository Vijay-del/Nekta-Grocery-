// ═══════════════════════════════════════════════════════════════════════════
// NEKTA XLSX EXPORT FIXES — All Reports Download Reliably
// - Fixes silent failures
// - Ensures cross-device compatibility
// - Handles large datasets
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

// ── XLSX LOADER WITH FALLBACK ──────────────────────────────────────────────
function ensureXLSXAvailable() {
  return new Promise(function(resolve, reject) {
    if (typeof XLSX !== 'undefined' && XLSX.writeFile) {
      resolve(XLSX);
      return;
    }
    
    // Load from CDN
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = function() {
      setTimeout(function() {
        if (typeof XLSX !== 'undefined') {
          resolve(XLSX);
        } else {
          reject(new Error('XLSX loaded but window.XLSX not found'));
        }
      }, 100);
    };
    script.onerror = function() {
      reject(new Error('Failed to load XLSX library'));
    };
    document.head.appendChild(script);
  });
}

// ── UNIVERSAL XLSX SAVE FUNCTION ──────────────────────────────────────────
async function saveXlsxSafe(data, sheetName, filename) {
  try {
    await ensureXLSXAvailable();
    
    if (typeof XLSX === 'undefined' || !XLSX.utils) {
      throw new Error('XLSX not available');
    }
    
    // Convert data to sheet
    const ws = XLSX.utils.json_to_sheet(data);
    
    // Auto-size columns
    const colWidths = {};
    data.forEach((row, ridx) => {
      Object.keys(row).forEach((key, cidx) => {
        const val = String(row[key] || '').length;
        colWidths[key] = Math.max(colWidths[key] || key.length + 2, val + 2);
      });
    });
    
    ws['!cols'] = Object.keys(colWidths).map(k => ({ wch: Math.min(colWidths[k], 60) }));
    
    // Add borders and formatting
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) continue;
        ws[cellAddress].s = {
          alignment: { wrapText: true, vertical: 'top', horizontal: 'left' },
          font: { name: 'Arial', sz: 11 }
        };
        if (R === 0) {
          ws[cellAddress].s.fill = { fgColor: { rgb: 'FF00B96B' } };
          ws[cellAddress].s.font = { name: 'Arial', sz: 12, bold: true, color: { rgb: 'FFFFFFFF' } };
        }
      }
    }
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
    
    // Write file
    XLSX.writeFile(wb, filename || 'export.xlsx');
    
    return true;
  } catch (e) {
    console.error('❌ XLSX Export Error:', e.message);
    if (typeof toast === 'function') {
      toast('Export failed: ' + e.message, 'error');
    }
    return false;
  }
}

window.saveXlsxSafe = saveXlsxSafe;

// ── REPORT EXPORTS ────────────────────────────────────────────────────────

// Orders Report
async function exportOrdersReport() {
  if (!window._allOrders || !window._allOrders.length) {
    toast('No orders to export', 'info');
    return;
  }
  
  const data = window._allOrders.map(o => ({
    'Order ID': o.id ? o.id.slice(-6).toUpperCase() : '',
    'Date': o.createdAt ? new Date(o.createdAt.seconds ? o.createdAt.seconds * 1000 : o.createdAt).toLocaleDateString('en-IN') : '',
    'Time': o.createdAt ? new Date(o.createdAt.seconds ? o.createdAt.seconds * 1000 : o.createdAt).toLocaleTimeString('en-IN') : '',
    'Customer': o.customerName || '',
    'Phone': o.customerPhone || '',
    'Address': o.address || '',
    'Items': (o.items || []).map(i => i.name + ' x' + (i.qty||1)).join(', '),
    'Items Count': (o.items || []).reduce((s,i) => s + (i.qty||1), 0),
    'Subtotal (Rs)': (o.totalPrice || 0) - (o.deliveryCharge || 0),
    'Delivery (Rs)': o.deliveryCharge != null ? o.deliveryCharge : 20,
    'Total (Rs)': o.totalPrice || 0,
    'Status': o.status || 'placed',
    'Rider': o.riderName || '',
    'Rider Phone': o.riderPhone || '',
    'Delivery Mins': o.deliveryMins || '',
  }));
  
  await saveXlsxSafe(data, 'Orders', 'nekta-orders-' + new Date().toISOString().slice(0, 10) + '.xlsx');
}

// Products Sales Report
async function exportProductsSalesReport() {
  if (!window._allOrders || !window._allOrders.length) {
    toast('No orders to export', 'info');
    return;
  }
  
  const productSales = {};
  window._allOrders.forEach(order => {
    (order.items || []).forEach(item => {
      if (!productSales[item.name]) {
        productSales[item.name] = {
          name: item.name,
          qty: 0,
          revenue: 0,
          category: item.category || 'Unknown'
        };
      }
      productSales[item.name].qty += item.qty || 1;
      productSales[item.name].revenue += (item.cost || item.price || 0);
    });
  });
  
  const data = Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .map(p => ({
      'Product': p.name,
      'Category': p.category,
      'Qty Sold': p.qty,
      'Revenue': p.revenue,
      'Avg Price': Math.round(p.revenue / p.qty)
    }));
  
  await saveXlsxSafe(data, 'Product Sales', 'nekta-product-sales-' + new Date().toISOString().slice(0, 10) + '.xlsx');
}

// Customer Report
async function exportCustomersReport() {
  if (!window._allOrders || !window._allOrders.length) {
    toast('No data to export', 'info');
    return;
  }
  
  const customers = {};
  window._allOrders.forEach(order => {
    const phone = order.customerPhone;
    if (!customers[phone]) {
      customers[phone] = {
        phone: phone,
        name: order.customerName || 'N/A',
        orders: 0,
        spent: 0,
        lastOrder: null
      };
    }
    customers[phone].orders += 1;
    customers[phone].spent += order.totalPrice || 0;
    
    const orderDate = order.createdAt ? new Date(order.createdAt.seconds ? order.createdAt.seconds * 1000 : order.createdAt) : new Date();
    if (!customers[phone].lastOrder || orderDate > new Date(customers[phone].lastOrder)) {
      customers[phone].lastOrder = orderDate.toISOString().slice(0, 10);
    }
  });
  
  const data = Object.values(customers)
    .sort((a, b) => b.spent - a.spent)
    .map(c => ({
      'Phone': c.phone,
      'Name': c.name,
      'Orders': c.orders,
      'Total Spent': c.spent,
      'Avg Order': Math.round(c.spent / c.orders),
      'Last Order': c.lastOrder || 'N/A'
    }));
  
  await saveXlsxSafe(data, 'Customers', 'nekta-customers-' + new Date().toISOString().slice(0, 10) + '.xlsx');
}

// Riders Report
async function exportRidersReport() {
  if (!window._allOrders || !window._allOrders.length) {
    toast('No data to export', 'info');
    return;
  }
  
  const riders = {};
  window._allOrders.forEach(order => {
    if (!order.riderPhone) return;
    
    if (!riders[order.riderPhone]) {
      riders[order.riderPhone] = {
        phone: order.riderPhone,
        name: order.riderName || 'N/A',
        deliveries: 0,
        revenue: 0,
        rating: 0
      };
    }
    
    if (order.status === 'delivered') {
      riders[order.riderPhone].deliveries += 1;
      riders[order.riderPhone].revenue += (order.deliveryCharge || 20);
    }
  });
  
  const data = Object.values(riders)
    .sort((a, b) => b.deliveries - a.deliveries)
    .map(r => ({
      'Phone': r.phone,
      'Name': r.name,
      'Deliveries': r.deliveries,
      'Commission Earned': r.revenue,
      'Avg per Delivery': r.deliveries ? Math.round(r.revenue / r.deliveries) : 0,
      'Rating': r.rating || '-'
    }));
  
  await saveXlsxSafe(data, 'Riders', 'nekta-riders-' + new Date().toISOString().slice(0, 10) + '.xlsx');
}

// Category Analysis Report
async function exportCategoryAnalysis() {
  if (!window._allOrders || !window._allOrders.length) {
    toast('No data to export', 'info');
    return;
  }
  
  const categories = {};
  window._allOrders.forEach(order => {
    (order.items || []).forEach(item => {
      const cat = item.category || 'Unknown';
      if (!categories[cat]) {
        categories[cat] = {
          name: cat,
          qty: 0,
          revenue: 0,
          count: 0
        };
      }
      categories[cat].qty += item.qty || 1;
      categories[cat].revenue += item.price * (item.qty || 1);
      categories[cat].count += 1;
    });
  });
  
  const data = Object.values(categories)
    .sort((a, b) => b.revenue - a.revenue)
    .map(c => ({
      'Category': c.name,
      'Items Sold': c.qty,
      'Times Ordered': c.count,
      'Revenue': c.revenue,
      'Avg Item Price': Math.round(c.revenue / c.qty)
    }));
  
  await saveXlsxSafe(data, 'Categories', 'nekta-category-analysis-' + new Date().toISOString().slice(0, 10) + '.xlsx');
}

// Inventory Stock Report — loads ALL products from Firestore (supports 1500+)
// Each price variant is its own separate row (no half/quarter columns needed).
async function exportInventoryReport() {
  if (window.toast) window.toast('Fetching all products...', 'info');
  let raw = [];
  try {
    if (window.db) {
      const snap = await window.db.collection('products').get();
      raw = snap.docs.map(d => ({ ...d.data(), _docId: d.id })).filter(p => !p.hidden);
    }
  } catch(e) {
    console.warn('exportInventoryReport: Firestore fetch failed, using local:', e.message);
    raw = window._allProducts || window.allProducts || window.products || [];
  }
  if (!raw.length) { if (window.toast) window.toast('No products found', 'info'); return; }

      // Expand variants so each quantity has its own row
      const all = typeof expandProductVariants === 'function' ? expandProductVariants(raw) : raw;

  const data = all.map(p => ({
    'ID': p.id || '',
    'Parent ID': p._parentId || p.id || '',
    'Name': p.name || '',
    'Telugu Name': p.teluguName || '',
    'Category': p.category || '',
    'Price (Rs)': p.price || 0,
    'Slashed Price (Rs)': p.slashedPrice || '',
    'Unit': p.unit || '',
    'Stock': p.stock != null ? p.stock : 0,
    'Out of Stock': p.outOfStock ? 'true' : 'false',
    'Image Filename': (p.img || '').replace('./images/', '').replace('images/', ''),
    'Description': p.description || '',
    'Barcode': p.barcode || ''
  }));
  await saveXlsxSafe(data, 'Inventory', 'nekta-inventory-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  if (window.toast) window.toast('Exported ' + all.length + ' product variants', 'success');
}

// ── BULK EXPORT ALL REPORTS ───────────────────────────────────────────────
async function exportAllReports() {
  try {
    const timestamp = new Date().toISOString().slice(0, 10);
    
    // Export each report type
    await exportOrdersReport();
    setTimeout(() => exportProductsSalesReport(), 1000);
    setTimeout(() => exportCustomersReport(), 2000);
    setTimeout(() => exportRidersReport(), 3000);
    setTimeout(() => exportCategoryAnalysis(), 4000);
    setTimeout(() => exportInventoryReport(), 5000);
    
    toast('✅ All reports exported!', 'success');
  } catch (e) {
    toast('Export failed: ' + e.message, 'error');
    console.error('Export error:', e);
  }
}

// Export all functions globally
window.exportOrdersReport = exportOrdersReport;
window.exportProductsSalesReport = exportProductsSalesReport;
window.exportCustomersReport = exportCustomersReport;
window.exportRidersReport = exportRidersReport;
window.exportCategoryAnalysis = exportCategoryAnalysis;
window.exportInventoryReport = exportInventoryReport;
window.exportAllReports = exportAllReports;

console.log('✅ XLSX Export module loaded');
