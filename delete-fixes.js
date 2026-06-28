// DELETE FIXES — overrides the broken delete functions in nekta-dashboard.js
// Load this AFTER nekta-dashboard.js in dashboard.html

window.deleteProduct = async function(docId, productName) {
  if (!docId || docId === '' || docId === 'null') {
    toast('Cannot delete: no Firestore ID', 'error');
    return;
  }
  if (!confirm('Delete "' + productName + '"? This cannot be undone.')) return;
  try {
    var allProds = window._allProducts || [];
    var p = null;
    for (var i = 0; i < allProds.length; i++) {
      if (allProds[i]._docId === docId) { p = allProds[i]; break; }
    }
    var numId = p ? String(p.id) : null;

    // 1. Delete from Firestore products collection
    await window.db.collection('products').doc(docId).delete();

    // 2. Remove from app_overrides so user app stops showing it
    if (numId) {
      var ovRef = window.db.collection('app_overrides').doc('products');
      var ovSnap = await ovRef.get().catch(function() { return null; });
      if (ovSnap && ovSnap.exists) {
        var data = ovSnap.data() || {};
        delete data[numId];
        await ovRef.set(data).catch(function() {});
      }
    }

    // 3. Remove from local array and re-render immediately (no loadAllProducts race)
    window._allProducts = (window._allProducts || []).filter(function(x) { return x._docId !== docId; });
    window.allProducts = window._allProducts;
    if (typeof renderInventory === 'function') renderInventory();
    if (typeof loadInventoryStats === 'function') loadInventoryStats();
    toast('Deleted: ' + productName, 'success');
  } catch(e) {
    toast('Delete failed: ' + e.message, 'error');
  }
};

window.removeRider = async function(id) {
  if (!confirm('Remove this rider? This cannot be undone.')) return;
  toast('Removing rider...', 'info');
  try {
    // Read rider data FIRST before deleting
    var rSnap = await window.db.collection('riders').doc(id).get();
    var riderPhone = rSnap.exists ? rSnap.data().phone : null;

    var batch = window.db.batch();

    // Delete rider doc
    batch.delete(window.db.collection('riders').doc(id));

    // Delete orders by rider ID
    var byId = await window.db.collection('orders').where('assignedRider', '==', id).get();
    byId.docs.forEach(function(d) { batch.delete(d.ref); });

    // Delete orders by riderPhone
    if (riderPhone) {
      var byPhone = await window.db.collection('orders').where('riderPhone', '==', riderPhone).get();
      byPhone.docs.forEach(function(d) { batch.delete(d.ref); });
    }

    await batch.commit();

    // Clean up RTDB
    if (window.rtdb) {
      window.rtdb.ref('riderLocations/' + id).remove().catch(function() {});
      if (riderPhone) window.rtdb.ref('riderOnlineTime/' + riderPhone).remove().catch(function() {});
    }

    toast('Rider removed', 'success');
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
};

window.doBulkDelete = async function() {
  var checked = Array.from(document.querySelectorAll('.prod-chk:checked'));
  var selected = checked.map(function(c) {
    return { docId: c.dataset.docid, name: c.dataset.name };
  }).filter(function(x) { return x.docId && x.docId !== ''; });

  if (!selected.length) { toast('No products selected', 'warning'); return; }

  var msg = selected.length === 1
    ? 'Delete "' + selected[0].name + '"?'
    : 'Delete ' + selected.length + ' products?';
  if (!confirm(msg + ' This cannot be undone.')) return;

  var delBtn = document.getElementById('bulk-delete-btn');
  if (delBtn) { delBtn.disabled = true; delBtn.textContent = 'Deleting...'; }

  var deleted = 0, failed = 0;
  var deletedDocIds = [];
  var deletedNumIds = [];

  for (var i = 0; i < selected.length; i++) {
    var item = selected[i];
    var allProds = window._allProducts || [];
    var p = null;
    for (var j = 0; j < allProds.length; j++) {
      if (allProds[j]._docId === item.docId) { p = allProds[j]; break; }
    }
    try {
      await window.db.collection('products').doc(item.docId).delete();
      deletedDocIds.push(item.docId);
      if (p) deletedNumIds.push(String(p.id));
      deleted++;
    } catch(e) {
      failed++;
    }
  }

  // Clean up app_overrides
  if (deletedNumIds.length) {
    var ovRef = window.db.collection('app_overrides').doc('products');
    var ovSnap = await ovRef.get().catch(function() { return null; });
    if (ovSnap && ovSnap.exists) {
      var data = ovSnap.data() || {};
      for (var k = 0; k < deletedNumIds.length; k++) { delete data[deletedNumIds[k]]; }
      await ovRef.set(data).catch(function() {});
    }
  }

  // Update local array
  window._allProducts = (window._allProducts || []).filter(function(x) {
    return deletedDocIds.indexOf(x._docId) === -1;
  });
  window.allProducts = window._allProducts;

  document.querySelectorAll('.prod-chk').forEach(function(c) { c.checked = false; });
  if (typeof updateBulkButtons === 'function') updateBulkButtons();
  if (typeof renderInventory === 'function') renderInventory();
  if (typeof loadInventoryStats === 'function') loadInventoryStats();
  if (delBtn) { delBtn.disabled = false; delBtn.textContent = 'Delete'; }
  toast('Deleted ' + deleted + (failed > 0 ? ' (' + failed + ' failed)' : '') + ' products', deleted > 0 ? 'success' : 'error');
};

window.bulkDeleteSelected = async function() {
  var _invSel = window._invSelected;
  if (!_invSel || _invSel.size === 0) return;
  if (!confirm('Delete ' + _invSel.size + ' selected products? This cannot be undone!')) return;

  var allProds = window._allProducts || [];
  var toDelete = [];
  _invSel.forEach(function(selId) {
    for (var i = 0; i < allProds.length; i++) {
      var p = allProds[i];
      if ((String(p.id) === String(selId) || p._docId === selId) && p._docId) {
        toDelete.push(p);
        break;
      }
    }
  });

  if (!toDelete.length) { toast('No valid products to delete', 'warning'); return; }

  var ok = 0;
  var deletedDocIds = [];
  var deletedNumIds = [];

  for (var i = 0; i < toDelete.length; i++) {
    try {
      await window.db.collection('products').doc(toDelete[i]._docId).delete();
      deletedDocIds.push(toDelete[i]._docId);
      deletedNumIds.push(String(toDelete[i].id));
      ok++;
    } catch(e) {}
  }

  // Clean up app_overrides
  if (deletedNumIds.length) {
    var ovRef = window.db.collection('app_overrides').doc('products');
    var ovSnap = await ovRef.get().catch(function() { return null; });
    if (ovSnap && ovSnap.exists) {
      var data = ovSnap.data() || {};
      for (var k = 0; k < deletedNumIds.length; k++) { delete data[deletedNumIds[k]]; }
      await ovRef.set(data).catch(function() {});
    }
  }

  window._allProducts = (window._allProducts || []).filter(function(x) {
    return deletedDocIds.indexOf(x._docId) === -1;
  });
  window.allProducts = window._allProducts;

  if (_invSel) _invSel.clear();
  if (typeof renderInventory === 'function') renderInventory();
  if (typeof loadInventoryStats === 'function') loadInventoryStats();
  toast('Deleted ' + ok + ' products', 'success');
};
