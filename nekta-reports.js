// ═══════════════════════════════════════════════════════════════
// NEKTA REPORTS  —  all downloads are real .xlsx via SheetJS
// ═══════════════════════════════════════════════════════════════

// ─── SHARED XLSX SAVE HELPER ─────────────────────────────────
// rows[0] = header array, rows[1..] = data arrays
function saveXlsx(rows, sheetName, filename) {
  if (typeof XLSX === 'undefined') {
    console.warn('SheetJS not loaded — cannot export .xlsx');
    return;
  }
  var header = rows[0];
  var data   = rows.slice(1).map(function(r) {
    var obj = {};
    header.forEach(function(h, i) { obj[h] = r[i] != null ? r[i] : ''; });
    return obj;
  });
  var ws = XLSX.utils.json_to_sheet(data, { header: header });
  // Auto column widths
  var colWidths = header.map(function(h) { return { wch: Math.max(h.length + 2, 12) }; });
  data.forEach(function(row) {
    header.forEach(function(h, i) {
      var len = String(row[h] || '').length + 2;
      if (len > colWidths[i].wch) colWidths[i].wch = Math.min(len, 60);
    });
  });
  ws['!cols'] = colWidths;
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

// ─── DATE HELPERS ────────────────────────────────────────────
function rptGetRange() {
  var period = (document.getElementById('rpt-period') || {}).value || 'week';
  var fromEl = document.getElementById('rpt-from');
  var toEl   = document.getElementById('rpt-to');
  var now    = new Date();
  var from, to;
  to = new Date(); to.setHours(23,59,59,999);

  if (fromEl && fromEl.value && toEl && toEl.value) {
    from = new Date(fromEl.value);
    to   = new Date(toEl.value); to.setHours(23,59,59,999);
    return { from: from, to: to };
  }
  if (period === 'today') {
    from = new Date(); from.setHours(0,0,0,0);
  } else if (period === 'yesterday') {
    from = new Date(); from.setDate(from.getDate()-1); from.setHours(0,0,0,0);
    to   = new Date(); to.setDate(to.getDate()-1);     to.setHours(23,59,59,999);
  } else if (period === 'week') {
    from = new Date(); from.setDate(from.getDate()-6); from.setHours(0,0,0,0);
  } else if (period === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'last30') {
    from = new Date(); from.setDate(from.getDate()-29); from.setHours(0,0,0,0);
  } else {
    from = new Date(0);
  }
  return { from: from, to: to };
}

function rptTs(o) {
  return o.createdAt && o.createdAt.seconds
    ? new Date(o.createdAt.seconds * 1000)
    : new Date(o.createdAt || 0);
}

function rptGetOrders() {
  var range = rptGetRange();
  return (window._allOrders || []).filter(function(o) {
    var ts = rptTs(o);
    return ts >= range.from && ts <= range.to;
  });
}

function rptLookupCategory(name) {
  var all = window._allProducts || window.allProducts || window.products || [];
  var found = all.find(function(p) {
    return (p.name || '').toLowerCase() === (name || '').toLowerCase();
  });
  return found ? (found.category || '') : '';
}

// ─── MAIN LOAD ───────────────────────────────────────────────
function loadAllReports() {
  // NOTE: Requires Firestore index on orders collection: createdAt DESC
  // If reports show empty, go to Firebase Console → Firestore → Indexes
  // and create: Collection=orders, Field=createdAt, Direction=Descending
  var orders    = rptGetOrders();
  var delivered = orders.filter(function(o) { return o.status === 'delivered'; });
  var rev  = delivered.reduce(function(s,o) { return s + (o.totalPrice||0); }, 0);
  var aov  = delivered.length ? Math.round(rev / delivered.length) : 0;
  var itemSet = {};
  delivered.forEach(function(o) {
    (o.items||[]).forEach(function(i) { itemSet[i.name] = 1; });
  });

  var el;
  el = document.getElementById('rpt-rev');     if (el) el.textContent = '₹' + rev.toLocaleString('en-IN');
  el = document.getElementById('rpt-rev-sub'); if (el) el.textContent = delivered.length + ' delivered';
  el = document.getElementById('rpt-ord');     if (el) el.textContent = orders.length;
  el = document.getElementById('rpt-ord-sub'); if (el) el.textContent = delivered.length + ' delivered';
  el = document.getElementById('rpt-aov');     if (el) el.textContent = '₹' + aov;
  el = document.getElementById('rpt-items');   if (el) el.textContent = Object.keys(itemSet).length;

  rptDailyChart(orders);
  rptTopItems(delivered);
  rptCatChart(delivered);
  rptOrdersTable(orders);
  rptItemsTable(delivered);
}

// ─── DAILY CHART ─────────────────────────────────────────────
function rptDailyChart(orders) {
  var range = rptGetRange();
  var days  = Math.min(Math.round((range.to - range.from) / 86400000) + 1, 60);
  var labels = [], revenue = [], counts = [];

  for (var i = 0; i < days; i++) {
    var d    = new Date(range.from); d.setDate(d.getDate() + i); d.setHours(0,0,0,0);
    var next = new Date(d); next.setDate(next.getDate() + 1);
    var dayO = orders.filter(function(o) { var ts = rptTs(o); return ts >= d && ts < next; });
    labels.push(d.toLocaleDateString('en-IN', { day:'numeric', month:'short' }));
    revenue.push(dayO.filter(function(o){return o.status==='delivered';}).reduce(function(s,o){return s+(o.totalPrice||0);},0));
    counts.push(dayO.length);
  }

  var canvas = document.getElementById('chart-rpt-daily');
  if (!canvas || typeof Chart === 'undefined') return;
  if (window._rptCharts && window._rptCharts.daily) window._rptCharts.daily.destroy();
  if (!window._rptCharts) window._rptCharts = {};
  window._rptCharts.daily = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label:'Revenue (₹)', data:revenue, backgroundColor:'#00e67688', borderColor:'#00e676', borderRadius:4, yAxisID:'y' },
        { label:'Orders', data:counts, type:'line', borderColor:'#2979ff', backgroundColor:'#2979ff22', tension:.4, pointRadius:3, yAxisID:'y1' }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ color:'#90a0b7', font:{ size:11 } } } },
      scales:{
        x:  { ticks:{ color:'#90a0b7', font:{ size:10 } }, grid:{ color:'rgba(255,255,255,.04)' } },
        y:  { ticks:{ color:'#90a0b7', font:{ size:10 } }, grid:{ color:'rgba(255,255,255,.04)' }, position:'left' },
        y1: { ticks:{ color:'#2979ff', font:{ size:10 } }, grid:{ display:false }, position:'right' }
      }
    }
  });
}

// ─── TOP ITEMS ───────────────────────────────────────────────
function rptTopItems(delivered) {
  var el = document.getElementById('rpt-top-items');
  if (!el) return;
  var map = {};
  delivered.forEach(function(o) {
    (o.items||[]).forEach(function(i) {
      if (!map[i.name]) map[i.name] = { qty:0, rev:0 };
      map[i.name].qty += (i.qty||1);
      map[i.name].rev += (i.cost||0);
    });
  });
  var top = Object.entries(map).sort(function(a,b){return b[1].qty-a[1].qty;}).slice(0,10);
  if (!top.length) { el.innerHTML = '<p style="color:var(--text2);padding:16px;font-size:13px">No data</p>'; return; }
  var max = top[0][1].qty;
  el.innerHTML = top.map(function(entry, idx) {
    var name = entry[0], d = entry[1];
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">'
      + '<div style="font-size:12px;font-weight:700;color:var(--text3);width:18px">' + (idx+1) + '</div>'
      + '<div style="flex:1;font-size:13px">' + name + '</div>'
      + '<div style="width:80px;background:var(--bg3);border-radius:4px;height:6px;overflow:hidden">'
      +   '<div style="height:100%;background:var(--green);width:' + Math.round(d.qty/max*100) + '%"></div>'
      + '</div>'
      + '<div style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--green);width:32px;text-align:right">' + d.qty + '</div>'
      + '<div style="font-family:var(--mono);font-size:12px;color:var(--text2);width:60px;text-align:right">₹' + d.rev.toLocaleString('en-IN') + '</div>'
      + '</div>';
  }).join('');
}

// ─── CATEGORY CHART ──────────────────────────────────────────
function rptCatChart(delivered) {
  var cats = {};
  delivered.forEach(function(o) {
    (o.items||[]).forEach(function(i) {
      var c = i.category || rptLookupCategory(i.name) || 'Other';
      cats[c] = (cats[c]||0) + (i.cost||0);
    });
  });
  var sorted = Object.entries(cats).sort(function(a,b){return b[1]-a[1];}).slice(0,8);
  var canvas = document.getElementById('chart-rpt-cats');
  if (!canvas || typeof Chart === 'undefined') return;
  if (window._rptCharts && window._rptCharts.cats) window._rptCharts.cats.destroy();
  if (!window._rptCharts) window._rptCharts = {};
  window._rptCharts.cats = new Chart(canvas, {
    type:'doughnut',
    data:{
      labels: sorted.map(function(x){return x[0];}),
      datasets:[{ data:sorted.map(function(x){return x[1];}), backgroundColor:['#00e676','#2979ff','#ff6d00','#d500f9','#ffd600','#ff1744','#00bcd4','#8bc34a'], borderWidth:0 }]
    },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right', labels:{ color:'#90a0b7', font:{ size:11 }, boxWidth:12 } } } }
  });
}

// ─── ORDERS TABLE ────────────────────────────────────────────
var _rptOrdersData = [];

function rptOrdersTable(orders) {
  _rptOrdersData = orders;
  rptFilterOrders();
}

function rptFilterOrders() {
  var tbody = document.getElementById('rpt-orders-tbody');
  if (!tbody) return;
  var q = ((document.getElementById('rpt-ord-search')||{}).value||'').toLowerCase();
  var list = _rptOrdersData.filter(function(o) {
    if (!q) return true;
    return (o.customerName||'').toLowerCase().indexOf(q) > -1
      || (o.customerPhone||'').indexOf(q) > -1
      || o.id.slice(-6).toUpperCase().indexOf(q.toUpperCase()) > -1;
  });
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text2)">No orders found</td></tr>'; return; }
  tbody.innerHTML = list.map(function(o) {
    var ts    = rptTs(o);
    var items = (o.items||[]).map(function(x){return x.name+' x'+x.qty;}).join(', ');
    var sc    = 'sp-' + (o.status||'placed');
    var dateStr = isNaN(ts) ? '—' : ts.toLocaleDateString('en-IN',{day:'numeric',month:'short'}) + ' ' + ts.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    return '<tr>'
      + '<td style="font-family:var(--mono);font-size:11px">' + o.id.slice(-6).toUpperCase() + '</td>'
      + '<td style="font-size:12px">' + dateStr + '</td>'
      + '<td style="font-size:13px;font-weight:600">' + (o.customerName||'—') + '</td>'
      + '<td style="font-family:var(--mono);font-size:12px">' + (o.customerPhone||'—') + '</td>'
      + '<td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + items + '</td>'
      + '<td style="font-family:var(--mono);font-weight:700;color:var(--green)">₹' + (o.totalPrice||0).toLocaleString('en-IN') + '</td>'
      + '<td style="font-family:var(--mono);font-size:12px">' + (o.deliveryCharge===0?'FREE':'₹'+(o.deliveryCharge||20)) + '</td>'
      + '<td><span class="status-pill ' + sc + '">' + (o.status||'—') + '</span></td>'
      + '</tr>';
  }).join('');
}

// ─── ITEMS TABLE ─────────────────────────────────────────────
function rptItemsTable(delivered) {
  var tbody = document.getElementById('rpt-items-tbody');
  if (!tbody) return;
  var map = {};
  delivered.forEach(function(o) {
    (o.items||[]).forEach(function(i) {
      var cat = i.category || rptLookupCategory(i.name);
      if (!map[i.name]) map[i.name] = { name:i.name, category:cat, qty:0, orders:{}, rev:0 };
      map[i.name].qty += (i.qty||1);
      map[i.name].rev += (i.cost||0);
      map[i.name].orders[o.id] = 1;
    });
  });
  var list = Object.values(map).sort(function(a,b){return b.qty-a.qty;});
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text2)">No items data</td></tr>'; return; }
  tbody.innerHTML = list.map(function(p) {
    var avg = p.qty ? Math.round(p.rev/p.qty) : 0;
    return '<tr>'
      + '<td style="font-size:13px;font-weight:600">' + p.name + '</td>'
      + '<td style="font-size:12px">' + p.category + '</td>'
      + '<td style="font-family:var(--mono);font-weight:700;color:var(--green)">' + p.qty + '</td>'
      + '<td style="font-family:var(--mono)">' + Object.keys(p.orders).length + '</td>'
      + '<td style="font-family:var(--mono);color:var(--green)">₹' + p.rev.toLocaleString('en-IN') + '</td>'
      + '<td style="font-family:var(--mono)">₹' + avg + '</td>'
      + '</tr>';
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// DOWNLOADS  —  every button saves a real .xlsx
// ═══════════════════════════════════════════════════════════════
function rptDownload(type) {
  var orders    = rptGetOrders();
  var delivered = orders.filter(function(o){return o.status==='delivered';});
  var range     = rptGetRange();
  var dateTag   = range.from.toLocaleDateString('en-IN').replace(/\//g,'-')
                + '_to_'
                + range.to.toLocaleDateString('en-IN').replace(/\//g,'-');
  var rows, map, i;

  // ── Sales Summary ──────────────────────────────────────────
  if (type === 'sales-summary') {
    var rev = delivered.reduce(function(s,o){return s+(o.totalPrice||0);},0);
    var aov = delivered.length ? Math.round(rev/delivered.length) : 0;
    var phones = {};
    orders.forEach(function(o){if(o.customerPhone)phones[o.customerPhone]=1;});
    rows = [
      ['Metric','Value'],
      ['Period From',       range.from.toLocaleDateString('en-IN')],
      ['Period To',         range.to.toLocaleDateString('en-IN')],
      ['Total Orders',      orders.length],
      ['Delivered Orders',  delivered.length],
      ['Cancelled Orders',  orders.filter(function(o){return o.status==='cancelled';}).length],
      ['Total Revenue (₹)', rev],
      ['Avg Order Value (₹)', aov],
      ['Unique Customers',  Object.keys(phones).length]
    ];
    saveXlsx(rows, 'Summary', 'nekta-sales-summary-' + dateTag + '.xlsx');

  // ── All Orders ─────────────────────────────────────────────
  } else if (type === 'all-orders') {
    rows = [['Order ID','Date','Time','Customer','Phone','Address','Items','Subtotal (₹)','Delivery (₹)','Total (₹)','Status','Rider']];
    orders.forEach(function(o) {
      var ts    = rptTs(o);
      var items = (o.items||[]).map(function(i){return i.name+' x'+i.qty+' @₹'+(i.cost||0);}).join(' | ');
      rows.push([
        o.id.slice(-6).toUpperCase(),
        isNaN(ts)?'':ts.toLocaleDateString('en-IN'),
        isNaN(ts)?'':ts.toLocaleTimeString('en-IN'),
        o.customerName||'', o.customerPhone||'', o.address||'',
        items,
        (o.totalPrice||0)-(o.deliveryCharge||0),
        o.deliveryCharge!=null ? o.deliveryCharge : 20,
        o.totalPrice||0,
        o.status||'', o.riderName||''
      ]);
    });
    saveXlsx(rows, 'All Orders', 'nekta-all-orders-' + dateTag + '.xlsx');

  // ── Top Items ──────────────────────────────────────────────
  } else if (type === 'top-items') {
    map = {};
    delivered.forEach(function(o){
      (o.items||[]).forEach(function(i){
        var cat = i.category || rptLookupCategory(i.name);
        if (!map[i.name]) map[i.name] = {name:i.name,category:cat,qty:0,rev:0,orders:0};
        map[i.name].qty += (i.qty||1);
        map[i.name].rev += (i.cost||0);
        map[i.name].orders++;
      });
    });
    rows = [['Rank','Product','Category','Qty Sold','Orders','Revenue (₹)','Avg Price (₹)']];
    Object.values(map).sort(function(a,b){return b.qty-a.qty;}).forEach(function(p,idx){
      rows.push([idx+1, p.name, p.category, p.qty, p.orders, p.rev, p.qty?Math.round(p.rev/p.qty):0]);
    });
    saveXlsx(rows, 'Top Items', 'nekta-top-items-' + dateTag + '.xlsx');

  // ── All Items Sold ─────────────────────────────────────────
  } else if (type === 'all-items') {
    map = {};
    orders.forEach(function(o){
      (o.items||[]).forEach(function(i){
        var cat = i.category || rptLookupCategory(i.name);
        if (!map[i.name]) map[i.name] = {name:i.name,category:cat,qty:0,rev:0,orders:{}};
        map[i.name].qty += (i.qty||1);
        map[i.name].rev += (i.cost||0);
        map[i.name].orders[o.id] = 1;
      });
    });
    rows = [['Product','Category','Total Qty Sold','Total Orders','Total Revenue (₹)','Avg Price (₹)']];
    Object.values(map).sort(function(a,b){return b.qty-a.qty;}).forEach(function(p){
      rows.push([p.name, p.category, p.qty, Object.keys(p.orders).length, p.rev, p.qty?Math.round(p.rev/p.qty):0]);
    });
    saveXlsx(rows, 'Items Sold', 'nekta-all-items-' + dateTag + '.xlsx');

  // ── Daily Breakdown ────────────────────────────────────────
  } else if (type === 'daily-breakdown') {
    var days = Math.min(Math.round((range.to - range.from) / 86400000) + 1, 365);
    rows = [['Date','Total Orders','Delivered','Cancelled','Revenue (₹)','Avg Order (₹)','Items Sold']];
    for (i = 0; i < days; i++) {
      var d    = new Date(range.from); d.setDate(d.getDate()+i); d.setHours(0,0,0,0);
      var next = new Date(d); next.setDate(next.getDate()+1);
      var dayO = orders.filter(function(o){var ts=rptTs(o);return ts>=d&&ts<next;});
      var dayD = dayO.filter(function(o){return o.status==='delivered';});
      var rev2 = dayD.reduce(function(s,o){return s+(o.totalPrice||0);},0);
      var itms = dayD.reduce(function(s,o){return s+(o.items||[]).reduce(function(ss,it){return ss+(it.qty||1);},0);},0);
      rows.push([
        d.toLocaleDateString('en-IN'),
        dayO.length, dayD.length,
        dayO.filter(function(o){return o.status==='cancelled';}).length,
        rev2,
        dayD.length ? Math.round(rev2/dayD.length) : 0,
        itms
      ]);
    }
    saveXlsx(rows, 'Daily Breakdown', 'nekta-daily-breakdown-' + dateTag + '.xlsx');

  // ── Customers Report ───────────────────────────────────────
  } else if (type === 'customers-report') {
    map = {};
    orders.forEach(function(o){
      var ph = o.customerPhone||''; if (!ph) return;
      if (!map[ph]) map[ph] = {name:o.customerName||'',phone:ph,orders:0,spent:0,last:null};
      map[ph].orders++;
      map[ph].spent += (o.totalPrice||0);
      var ts = rptTs(o);
      if (!map[ph].last || ts > map[ph].last) map[ph].last = ts;
    });
    rows = [['Customer Name','Phone','Total Orders','Total Spent (₹)','Last Order Date']];
    Object.values(map).sort(function(a,b){return b.spent-a.spent;}).forEach(function(c){
      rows.push([c.name, c.phone, c.orders, c.spent, c.last?c.last.toLocaleDateString('en-IN'):'']);
    });
    saveXlsx(rows, 'Customers', 'nekta-customers-' + dateTag + '.xlsx');

  // ── Rider Performance ──────────────────────────────────────
  } else if (type === 'rider-report') {
    map = {};
    orders.filter(function(o){return o.status==='delivered'&&o.riderName;}).forEach(function(o){
      var k = o.riderPhone||o.riderName;
      if (!map[k]) map[k] = {name:o.riderName||'',phone:o.riderPhone||'',deliveries:0,earnings:0,mins:[]};
      map[k].deliveries++;
      map[k].earnings += (o.riderEarnings||o.deliveryCharge||20);
      if (o.deliveryMins) map[k].mins.push(o.deliveryMins);
    });
    rows = [['Rider Name','Phone','Total Deliveries','Total Earnings (₹)','Avg Delivery Time (min)']];
    Object.values(map).sort(function(a,b){return b.deliveries-a.deliveries;}).forEach(function(r){
      var avg = r.mins.length
        ? Math.round(r.mins.reduce(function(s,v){return s+v;},0)/r.mins.length)
        : '';
      rows.push([r.name, r.phone, r.deliveries, r.earnings, avg]);
    });
    saveXlsx(rows, 'Rider Performance', 'nekta-rider-report-' + dateTag + '.xlsx');

  // ── Full Product Catalog ───────────────────────────────────
  } else if (type === 'full-catalog') {
    var all = window._allProducts || window.allProducts || window.products || [];
    if (!all.length) { toast('Products not loaded yet — please wait and try again','warning'); return; }
    rows = [[
      'ID','Name','Telugu Name','Category',
      'Price (₹)','Half Price (₹)','Quarter Price (₹)','Slashed Price (₹)',
      'Unit','Brand','Stock','Out of Stock (Yes/No)',
      'Image Filename','Description'
    ]];
    all.forEach(function(p){
      rows.push([
        p.id||'',
        p.name||'',
        p.teluguName||'',
        p.category||'',
        p.price||0,
        p.halfPrice||'',
        p.quarterPrice||'',
        p.slashedPrice||'',
        p.unit||'',
        p.brand||'',
        p.stock!=null ? p.stock : '',
        p.outOfStock ? 'Yes' : 'No',
        (p.img||'').replace('./images/','').replace('images/',''),
        p.description||''
      ]);
    });
    saveXlsx(rows, 'Products', 'nekta-full-catalog-' + new Date().toISOString().slice(0,10) + '.xlsx');
  }
}

function rptPrint() { window.print(); }

// ─── EXPOSE ──────────────────────────────────────────────────
window.rptDownload     = rptDownload;
window.rptPrint        = rptPrint;
window.loadAllReports  = loadAllReports;
window.rptFilterOrders = rptFilterOrders;
window.saveXlsx        = saveXlsx;
