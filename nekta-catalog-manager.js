// ═══════════════════════════════════════════════════════════════
// NEKTA CATALOG MANAGER
// Bulk CSV upload, product CRUD, image management, category control
// Loaded by dashboard.html — extends nekta-dashboard.js
// ═══════════════════════════════════════════════════════════════
'use strict';

// ─── SMART IMAGE RESOLVER ───────────────────────────────────
// Handles: local filenames, ./images/ paths, full https:// URLs
// If local image fails, falls back to imgLOGO.png automatically
// FIXED: Prevents double "images/images/" paths
function resolveImgSrc(img) {
  if (!img || img.trim() === '') return 'images/nektaIcon.svg';
  const v = img.trim();
  // Already a full URL
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  
  // Remove leading ./ and normalize
  let path = v.replace(/^\.\//, '');
  
  // Remove any leading "images/" to prevent duplication
  path = path.replace(/^images\//, '');
  
  // Return normalized path (already correct: images/filename.jpg)
  if (path.startsWith('images/')) {
    return path;
  }
  
  // Just a filename — prepend images/
  return 'images/' + path;
}
window.resolveImgSrc = resolveImgSrc;


// All columns — matches export and upload
const XLSX_HEADERS = [
  'name','teluguName','price','halfPrice','quarterPrice','slashedPrice',
  'unit','category','img','description','stock','outOfStock'
];
const XLSX_HEADER_LABELS = [
  'Name','Telugu Name','Price (₹)','Half Price (₹)','Quarter Price (₹)','Slashed Price (₹)',
  'Unit','Category','Image Filename','Description','Stock','Out of Stock (true/false)'
];
// Keep old name for any external references
const CSV_HEADERS = XLSX_HEADERS;
const VALID_CATS  = ['VEGETABLES','LEAFY','FRUITS','DAIRY','GRAINS','DALS','OILS','SPICES','CONDIMENTS','PICKLES','SNACKS','CHOCOLATES','ICECREAMS','DRINKS','NONVEG','PERSONALCARE','CLEANING','PUJA','COMBOS','EASYCOOK','PANSHOP','BAKERY','FROZEN','FLOURS','PULSES','BEVERAGES','DRY FRUITS','SUGAR'];

// ─── STATE ───────────────────────────────────────────────────
let _csvParsed = [];

// ─── SHARED XLSX SAVE (mirrors nekta-reports.js saveXlsx) ────
function _catSaveXlsx(labelRow, dataRows, sheetName, filename) {
  if (typeof XLSX === 'undefined') { alert('SheetJS not loaded — cannot save .xlsx'); return; }
  const data = dataRows.map(r => {
    const obj = {};
    labelRow.forEach((h, i) => { obj[h] = r[i] != null ? r[i] : ''; });
    return obj;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: labelRow });
  const colWidths = labelRow.map(h => ({ wch: Math.max(h.length + 2, 14) }));
  data.forEach(row => labelRow.forEach((h, i) => {
    const len = String(row[h] || '').length + 2;
    if (len > colWidths[i].wch) colWidths[i].wch = Math.min(len, 60);
  }));
  ws['!cols'] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

function downloadCSVTemplate() {
  if (typeof XLSX === 'undefined') {
    toast('❌ SheetJS not loaded — cannot create .xlsx template', 'error');
    return;
  }
  const sampleRows = [
    ['Tomato (Local)','టమాటా','65','35','','75','Kg','VEGETABLES','Tomato.jpg','Fresh local tomatoes','100','false'],
    ['Banana','అరటిపండు','40','','','','Doz','FRUITS','Banana.png','Fresh bananas - dozen','80','false'],
    ['Amul Butter','అమూల్ వెన్న','55','','','','100g','DAIRY','Butter (Amul).png','Amul salted butter','50','false'],
  ];
  _catSaveXlsx(XLSX_HEADER_LABELS, sampleRows, 'Products', 'nekta-products-template.xlsx');
  toast('✅ Template downloaded as .xlsx — fill in Excel and upload back', 'info');
}
window.downloadCSVTemplate = downloadCSVTemplate;

// ─── CSV PARSER ───────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
  if (!lines.length) return {rows:[], errors:['Empty file']};
  const headers = lines[0].split(',').map(h=>h.trim().toLowerCase().replace(/[^a-z]/g,''));
  const rows = [];
  const errors = [];
  for (let i=1; i<lines.length; i++) {
    const rawLine = lines[i];
    // Skip completely empty lines silently
    if (!rawLine.trim()) continue;
    const cols = parseCSVLine(rawLine);
    // Skip lines that are all empty cells
    if (cols.every(c=>!c.trim())) continue;
    if (cols.length < 2) continue;
    const row = {};
    headers.forEach((h,j) => { row[h] = (cols[j]||'').trim(); });
    // Skip rows with no name silently (empty rows in middle of file)
    if (!row.name || !row.name.trim()) continue;
    const price = parseFloat(row.price);
    if (!price || price <= 0) { errors.push('Row '+(i+1)+' ('+row.name+'): invalid price'); continue; }
    if (row.category && !VALID_CATS.includes(row.category.toUpperCase())) {
      errors.push('Row '+(i+1)+' ('+row.name+'): unknown category "'+row.category+'"');
    }
    rows.push({
      name:         row.name,
      teluguName:   row.teluguname || row.telugu || '',
      price:        price,
      halfPrice:    parseFloat(row.halfprice)||undefined,
      quarterPrice: parseFloat(row.quarterprice)||undefined,
      slashedPrice: parseFloat(row.slashedprice)||undefined,
      unit:         row.unit || 'Pc',
      category:     (row.category||'VEGETABLES').toUpperCase(),
      img:          row.img ? (row.img.startsWith('http') ? row.img : './images/'+row.img.replace(/^(\.?\/?)?(images\/)?/,'')) : './images/nektaIcon.svg',
      description:  row.description || '',
      stock:        parseInt(row.stock)||100,
      outOfStock:   row.outofstock==='true'||row.outofstock==='1',
    });
  }
  return {rows, errors};
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i=0; i<line.length; i++) {
    if (line[i]==='"') { inQuotes=!inQuotes; }
    else if (line[i]===',' && !inQuotes) { result.push(current); current=''; }
    else { current+=line[i]; }
  }
  result.push(current);
  return result;
}

// Parse Excel JSON from SheetJS (real XLSX files)
// Accepts both label headers ("Telugu Name") and key headers ("teluguName")
function parseExcelJSON(jsonData) {
  const rows = [];
  const errors = [];
  if (!Array.isArray(jsonData) || !jsonData.length) return {rows:[], errors:['Empty Excel file']};

  // Map friendly label → internal key
  const LABEL_MAP = {
    'id': 'id',
    'name': 'name',
    'telugu name': 'teluguname',
    'teluguname': 'teluguname',
    'telugu': 'teluguname',
    'price': 'price',
    'price (\u20b9)': 'price',
    'price (rs)': 'price',
    'price(rs)': 'price',
    'price (inr)': 'price',
    'half price': 'halfprice',
    'half price (\u20b9)': 'halfprice',
    'halfprice': 'halfprice',
    'quarter price': 'quarterprice',
    'quarter price (\u20b9)': 'quarterprice',
    'quarterprice': 'quarterprice',
    'slashed price': 'slashedprice',
    'slashed price (\u20b9)': 'slashedprice',
    'slashedprice': 'slashedprice',
    'unit': 'unit',
    'category': 'category',
    'img': 'img',
    'image filename': 'img',
    'image': 'img',
    'imageurl': 'img',
    'image url': 'img',
    'imagelink': 'img',
    'description': 'description',
    'stock': 'stock',
    'out of stock': 'outofstock',
    'out of stock (true/false)': 'outofstock',
    'outofstock': 'outofstock',
  };

  jsonData.forEach((row, idx) => {
    const r = {};
    Object.entries(row).forEach(([k, v]) => {
      const mapped = LABEL_MAP[k.trim().toLowerCase()] || k.trim().toLowerCase().replace(/[^a-z]/g, '');
      r[mapped] = String(v != null ? v : '').trim();
    });
    if (idx === 0) console.log('First row keys from Excel:', Object.keys(row), '→ mapped:', r);
    if (!r.name) return;
    const rawPrice = String(r.price || '').replace(/,/g, '').replace(/[^0-9.]/g, '').trim();
    if (!rawPrice) return; // silently skip rows with no price
    const price = parseFloat(rawPrice);
    if (isNaN(price) || price < 0) { errors.push('Row '+(idx+2)+' ('+r.name+'): invalid price'); return; }
    if (r.category && !VALID_CATS.includes(r.category.toUpperCase()))
      errors.push('Row '+(idx+2)+' ('+r.name+'): unknown category "'+r.category+'"');
    rows.push({
      id:           parseInt(r.id) || undefined,
      name:         r.name,
      teluguName:   r.teluguname || '',
      price,
      halfPrice:    parseFloat(r.halfprice)    || undefined,
      quarterPrice: parseFloat(r.quarterprice) || undefined,
      slashedPrice: parseFloat(r.slashedprice) || undefined,
      unit:         r.unit || 'Pc',
      category:     (r.category || 'VEGETABLES').toUpperCase(),
      img:          r.img ? resolveImgSrc(r.img) : '',
      description:  r.description || '',
      stock:        parseInt(r.stock) >= 0 ? parseInt(r.stock) : 100,
      outOfStock:   r.outofstock === 'true' || r.outofstock === '1' || r.outofstock === 'yes'
                    || r.outofstock === true || r.outofstock === 'TRUE' || r.outofstock === 'Yes',
    });
  });
  return {rows, errors};
}

// Parse tab-separated XLS (Excel saved as .xls or template download)
function parseXLS(text) {
  const lines = text.replace(/\uFEFF/g,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
  if (!lines.length) return {rows:[], errors:['Empty file']};
  const headers = lines[0].split('\t').map(h=>h.trim().toLowerCase().replace(/[^a-z]/g,''));
  const rows = [];
  const errors = [];
  for (let i=1; i<lines.length; i++) {
    const rawLine = lines[i];
    // Skip completely empty lines silently
    if (!rawLine.trim()) continue;
    const cols = rawLine.split('\t');
    // Skip lines that are all empty cells
    if (cols.every(c=>!c.trim())) continue;
    if (cols.length < 2) continue;
    const row = {};
    headers.forEach((h,j) => { row[h] = (cols[j]||'').trim(); });
    // Skip rows with no name silently
    if (!row.name || !row.name.trim()) continue;
    const price = parseFloat(row.price);
    if (!price || price <= 0) { errors.push('Row '+(i+1)+' ('+row.name+'): invalid price'); continue; }
    if (row.category && !VALID_CATS.includes(row.category.toUpperCase())) {
      errors.push('Row '+(i+1)+' ('+row.name+'): unknown category "'+row.category+'"');
    }
    rows.push({
      name:         row.name,
      teluguName:   row.teluguname || row.telugu || '',
      price:        price,
      halfPrice:    parseFloat(row.halfprice)||undefined,
      quarterPrice: parseFloat(row.quarterprice)||undefined,
      slashedPrice: parseFloat(row.slashedprice)||undefined,
      unit:         row.unit || 'Pc',
      category:     (row.category||'VEGETABLES').toUpperCase(),
      img:          row.img ? (row.img.startsWith('http') ? row.img : './images/'+row.img.replace(/^(\.?\/?)?(images\/)?/,'')) : './images/nektaIcon.svg',
      description:  row.description || '',
      stock:        parseInt(row.stock)||100,
      outOfStock:   row.outofstock==='true'||row.outofstock==='1'||row.outofstock==='yes',
    });
  }
  return {rows, errors};
}

// ─── BULK UPLOAD PAGE ─────────────────────────────────────────
function openBulkUpload() {
  showModal(
    '<h3 style="margin-bottom:4px">📦 Bulk Product Upload</h3>'
    +'<p style="font-size:12px;color:var(--text2);margin-bottom:12px">Add new products or update existing ones in bulk</p>'

    // Mode toggle
    +'<div style="display:flex;gap:8px;margin-bottom:14px;background:var(--bg3);border-radius:10px;padding:4px">'
    +'<button id="mode-add-btn" onclick="setBulkMode(\'add\')" style="flex:1;padding:9px;border-radius:8px;border:none;background:var(--green);color:#000;font-family:var(--font);font-size:13px;font-weight:700;cursor:pointer">➕ Add New Products</button>'
    +'<button id="mode-upd-btn" onclick="setBulkMode(\'update\')" style="flex:1;padding:9px;border-radius:8px;border:none;background:transparent;color:var(--text2);font-family:var(--font);font-size:13px;font-weight:600;cursor:pointer">✏️ Update Existing</button>'
    +'<button id="mode-sync-btn" onclick="setBulkMode(\'sync\')" style="flex:1;padding:9px;border-radius:8px;border:none;background:transparent;color:var(--text2);font-family:var(--font);font-size:13px;font-weight:600;cursor:pointer">🔄 Sync (Excel = Truth)</button>'
    +'</div>'

    // Mode hint
    +'<div id="mode-hint" style="background:rgba(0,230,118,.07);border:1px solid rgba(0,230,118,.2);border-radius:10px;padding:12px;margin-bottom:14px;font-size:12px">'
    +'<div id="mode-hint-text"></div>'
    +'</div>'

    +'<div style="display:flex;gap:8px;margin-bottom:16px">'
    +'<button class="btn-sm bg-green" onclick="downloadCSVTemplate()">⬇ Download Template .xlsx</button>'
    +'<button class="btn-sm bg-ghost" onclick="showCSVFormat()">📋 Column Guide</button>'
    +'</div>'

    +'<div id="csv-drop-zone" style="border:2px dashed var(--border);border-radius:12px;padding:32px;text-align:center;cursor:pointer;transition:.2s;margin-bottom:12px" '
    +'onclick="document.getElementById(\'csv-file-inp\').click()" '
    +'ondragover="event.preventDefault();this.style.borderColor=\'var(--green)\'" '
    +'ondragleave="this.style.borderColor=\'var(--border)\'" '
    +'ondrop="handleCSVDrop(event)">'
    +'<div style="font-size:32px;margin-bottom:8px">📄</div>'
    +'<div style="font-weight:600;font-size:14px">Drop .xlsx file here or click to browse</div>'
    +'<div style="font-size:12px;color:var(--text2);margin-top:4px">Supports .xlsx files from Excel</div>'
    +'</div>'
    +'<input type="file" id="csv-file-inp" accept=".xlsx" style="display:none" onchange="handleCSVFile(this)">'

    +'<div id="csv-preview" style="display:none">'
    +'<div id="csv-preview-stats" style="background:var(--bg3);border-radius:10px;padding:12px;margin-bottom:10px;font-size:13px"></div>'
    +'<div id="csv-preview-errors" style="display:none;background:rgba(255,23,68,.08);border:1px solid rgba(255,23,68,.3);border-radius:10px;padding:12px;margin-bottom:10px;font-size:12px;color:var(--red)"></div>'
    +'<div id="csv-preview-table" style="max-height:220px;overflow-y:auto;margin-bottom:12px"></div>'
    +'</div>'

    +'<div id="csv-upload-actions" style="display:none" class="modal-footer">'
    +'<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    +'<button class="btn-sm bg-ghost" onclick="clearCSVPreview()">Clear</button>'
    +'<button class="btn-primary" id="csv-confirm-btn" onclick="confirmBulkUpload()">✅ Upload</button>'
    +'</div>'
    +'<div class="modal-footer" id="csv-cancel-footer">'
    +'<button class="btn-ghost" onclick="closeModal()">Close</button>'
    +'</div>'
  );
  // Set default mode
  setBulkMode('add');
}
window.openBulkUpload = openBulkUpload;

let _bulkMode = 'add'; // 'add', 'update', or 'sync'

function setBulkMode(mode) {
  _bulkMode = mode;
  const addBtn  = document.getElementById('mode-add-btn');
  const updBtn  = document.getElementById('mode-upd-btn');
  const syncBtn = document.getElementById('mode-sync-btn');
  const hint    = document.getElementById('mode-hint-text');
  if (!addBtn) return;
  // Reset all
  [addBtn, updBtn, syncBtn].forEach(b => { if(b){ b.style.background='transparent'; b.style.color='var(--text2)'; } });
  if (mode === 'add') {
    addBtn.style.background = 'var(--green)'; addBtn.style.color = '#000';
    hint.innerHTML = '<b style="color:var(--green)">➕ Add Mode:</b> <span style="color:var(--text2)">Each row creates a NEW product. Use this for adding products that don\'t exist yet.</span>';
  } else if (mode === 'update') {
    updBtn.style.background = 'var(--blue)'; updBtn.style.color = '#fff';
    hint.innerHTML = '<b style="color:#64b5f6">✏️ Update Mode:</b> <span style="color:var(--text2)">Matches each row by product name and updates price, stock etc. Products NOT in Excel are left unchanged.</span>'
      +'<br><span style="color:var(--text2);font-size:11px;margin-top:4px;display:block">💡 Tip: Export all products first, edit in Excel, then upload here.</span>';
  } else {
    syncBtn.style.background = '#f59e0b'; syncBtn.style.color = '#000';
    hint.innerHTML = '<b style="color:#f59e0b">🔄 Sync Mode (Excel = Truth):</b> <span style="color:var(--text2)">Your Excel becomes the single source of truth.</span>'
      +'<br><span style="color:var(--text2);font-size:11px;margin-top:6px;display:block">✅ Products IN your Excel → updated and visible to users</span>'
      +'<span style="color:var(--red);font-size:11px;display:block;margin-top:3px">🔴 Products NOT in your Excel → automatically hidden (outOfStock=true)</span>'
      +'<span style="color:var(--text2);font-size:11px;display:block;margin-top:3px">💡 Safe: nothing is permanently deleted, just hidden. You can restore anytime.</span>';
  }
  if (_csvParsed && _csvParsed.length) showCSVPreview(_csvParsed, []);
}
window.setBulkMode = setBulkMode;

function handleCSVFile(input) {
  const file = input.files[0];
  if (!file) return;
  readCSVFile(file);
}
window.handleCSVFile = handleCSVFile;

function handleCSVDrop(e) {
  e.preventDefault();
  document.getElementById('csv-drop-zone').style.borderColor = 'var(--border)';
  const file = e.dataTransfer.files[0];
  if (!file) return;
  readCSVFile(file);
}
window.handleCSVDrop = handleCSVDrop;

function readCSVFile(file) {
  if (typeof XLSX === 'undefined') {
    toast('❌ SheetJS not loaded — cannot read .xlsx files', 'error');
    return;
  }
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    toast('❌ Please upload a .xlsx file only', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(firstSheet);
      const { rows, errors } = parseExcelJSON(json);
      _csvParsed = rows;
      showCSVPreview(rows, errors);
    } catch(err) {
      console.error('Excel parse error:', err);
      toast('❌ Error reading .xlsx file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function showCSVPreview(rows, errors) {
  const preview = document.getElementById('csv-preview');
  const stats   = document.getElementById('csv-preview-stats');
  const errBox  = document.getElementById('csv-preview-errors');
  const table   = document.getElementById('csv-preview-table');
  const actions = document.getElementById('csv-upload-actions');
  const cancel  = document.getElementById('csv-cancel-footer');

  if (!preview) return;
  preview.style.display = 'block';
  cancel.style.display  = 'none';

  const catCounts = {};
  rows.forEach(r => { catCounts[r.category] = (catCounts[r.category]||0)+1; });

  stats.innerHTML = '<div style="display:flex;gap:16px;flex-wrap:wrap">'
    +'<div><span style="color:var(--green);font-weight:700;font-size:18px">'+rows.length+'</span> <span style="color:var(--text2)">valid products</span></div>'
    +(errors.length ? '<div><span style="color:var(--red);font-weight:700;font-size:18px">'+errors.length+'</span> <span style="color:var(--text2)">errors skipped</span></div>' : '')
    +'</div>'
    +'<div style="margin-top:8px;font-size:11px;color:var(--text2)">'+Object.entries(catCounts).map(([c,n])=>'<span style="background:var(--bg4);border-radius:4px;padding:2px 6px;margin-right:4px">'+c+' ('+n+')</span>').join('')+'</div>';

  if (errors.length) {
    errBox.style.display = 'block';
    const shown = errors.slice(0, 8);
    const extra = errors.length - shown.length;
    errBox.innerHTML = '<div style="font-weight:700;margin-bottom:4px">⚠ Skipped rows:</div>'
      + shown.map(e => '• ' + e).join('<br>')
      + (extra > 0 ? '<br>… and ' + extra + ' more' : '');
  } else {
    errBox.style.display = 'none';
  }

  if (rows.length) {
    table.innerHTML = '<table style="width:100%;font-size:11px;border-collapse:collapse">'
      +'<thead><tr style="border-bottom:1px solid var(--border)">'
      +'<th style="text-align:left;padding:5px;color:var(--text2)">Name</th>'
      +'<th style="text-align:left;padding:5px;color:var(--text2)">Category</th>'
      +'<th style="text-align:right;padding:5px;color:var(--text2)">Price</th>'
      +'<th style="text-align:right;padding:5px;color:var(--text2)">Half</th>'
      +'<th style="text-align:left;padding:5px;color:var(--text2)">Unit</th>'
      +'</tr></thead><tbody>'
      +rows.slice(0,50).map(r=>'<tr style="border-bottom:1px solid rgba(255,255,255,.03)">'
        +'<td style="padding:5px">'+r.name+(r.teluguName?'<span style="color:var(--text2)"> / '+r.teluguName+'</span>':'')+'</td>'
        +'<td style="padding:5px;font-size:10px">'+r.category+'</td>'
        +'<td style="padding:5px;text-align:right;color:var(--green);font-family:var(--mono)">₹'+r.price+'</td>'
        +'<td style="padding:5px;text-align:right;color:var(--text2);font-family:var(--mono)">'+(r.halfPrice?'₹'+r.halfPrice:'—')+'</td>'
        +'<td style="padding:5px;color:var(--text2)">'+r.unit+'</td>'
        +'</tr>').join('')
      +(rows.length>50?'<tr><td colspan="5" style="padding:8px;text-align:center;color:var(--text2)">…and '+(rows.length-50)+' more</td></tr>':'')
      +'</tbody></table>';

    actions.style.display = 'flex';
    const btn = document.getElementById('csv-confirm-btn');
    if (btn) btn.textContent = '✅ Upload '+rows.length+' Products';
  } else {
    table.innerHTML = '<p style="color:var(--text2);text-align:center;padding:16px">No valid rows found</p>';
    actions.style.display = 'none';
    cancel.style.display  = 'flex';
  }
}

function clearCSVPreview() {
  _csvParsed = [];
  const p=document.getElementById('csv-preview');
  const a=document.getElementById('csv-upload-actions');
  const c=document.getElementById('csv-cancel-footer');
  if(p) p.style.display='none';
  if(a) a.style.display='none';
  if(c) c.style.display='flex';
}
window.clearCSVPreview = clearCSVPreview;

async function confirmBulkUpload() {
  
  if (!_csvParsed.length) { toast('No products to upload','error'); return; }
  
  // Check Firebase is ready
  if (!window.db || !window.firebaseReady) {
    toast('❌ Firebase not ready yet, please wait and try again','error');
    return;
  }
  
  const btn = document.getElementById('csv-confirm-btn');
  if (btn) { btn.disabled=true; btn.textContent='Processing…'; }

  try {
    if (_bulkMode === 'update') {
      // ─── UPDATE MODE: match by name, update fields ───
      const all = window.allProducts || window._allProducts || window.products || [];
      if (!all.length) {
        console.error('❌ Products not loaded');
        toast('Products not loaded yet — please wait and try again', 'error');
        if (btn) { btn.disabled=false; btn.textContent='✅ Upload '+_csvParsed.length+' Products'; }
        return;
      }
      
      let updated=0, notFound=[];
      const BATCH = 400;

      // Build name->product AND id->product maps (case-insensitive)
      const nameMap = {};
      const idMap   = {};
      all.forEach(p => {
        nameMap[(p.name||'').toLowerCase().trim()] = p;
        if (p.id) idMap[String(p.id)] = p;
      });

      // Separate seed products (no _docId) from Firestore products
      const toUpdateFirestore = [];
      const toUpdateSeed = [];
      _csvParsed.forEach(row => {
        // Match by ID first (most reliable), fall back to name
        const existing = (row.id && idMap[String(row.id)]) || nameMap[(row.name||'').toLowerCase().trim()];
        if (!existing) { notFound.push(row.name); return; }

        // Build a complete update object — every field from the row
        const update = {};

        // teluguName — always write (empty string clears it)
        update.teluguName = row.teluguName || '';

        // price — only if valid number
        const pr = parseFloat(row.price);
        if (!isNaN(pr) && pr > 0) update.price = pr;

        // optional prices — write value if valid, NULL if blank (removes from Firestore)
        const hp = parseFloat(row.halfPrice);
        update.halfPrice    = (!isNaN(hp) && hp > 0) ? hp : firebase.firestore.FieldValue.delete();
        const qp = parseFloat(row.quarterPrice);
        update.quarterPrice = (!isNaN(qp) && qp > 0) ? qp : firebase.firestore.FieldValue.delete();
        const sp = parseFloat(row.slashedPrice);
        update.slashedPrice = (!isNaN(sp) && sp > 0) ? sp : firebase.firestore.FieldValue.delete();

        // unit, category, description — only if non-empty
        if (row.unit)        update.unit        = row.unit;
        if (row.category)    update.category    = row.category;
        if (row.description != null) update.description = row.description;

        // img — support both URL and local filename
        if (row.img) {
          const imgVal = row.img.trim();
          if (imgVal) {
            // Normalize: remove leading ./ and duplicated images/ paths
            let normalized = imgVal.replace(/^\.\//, '');
            normalized = normalized.replace(/^images\//, '');
            update.img = normalized.startsWith('http') ? normalized : 'images/' + normalized;
          }
        }

        // stock — valid integer >= 0
        const st = parseInt(row.stock);
        if (!isNaN(st) && st >= 0) update.stock = st;

        // outOfStock — boolean, always write
        const oos = row.outOfStock;
        update.outOfStock = oos === true || oos === 'true' || oos === '1'
                         || oos === 'yes' || oos === 'TRUE' || oos === 'Yes';

        if (existing._docId) {
          toUpdateFirestore.push({ docId: existing._docId, prodId: String(existing.id), update });
        } else {
          toUpdateSeed.push({ id: existing.id, update });
        }
        updated++;
      });

      // Helper: strip FieldValue.delete() so app_overrides .set() doesn't crash
      function _cleanForOverrides(update) {
        const clean = {};
        Object.keys(update).forEach(k => {
          if (update[k] && typeof update[k] === 'object' && update[k]._methodName === 'FieldValue.delete') return;
          clean[k] = update[k];
        });
        return clean;
      }

      // Batch update Firestore products + collect for app_overrides
      const firestoreOverrides = {};
      for (let i = 0; i < toUpdateFirestore.length; i += BATCH) {
        const batch = window.db.batch();
        toUpdateFirestore.slice(i, i + BATCH).forEach(({ docId, prodId, update }) => {
          batch.update(window.db.collection('products').doc(docId), update);
          firestoreOverrides[prodId] = _cleanForOverrides(update);
        });
        await batch.commit().catch(e => {
          console.error('Batch error:', e.message);
          toast('Batch error: ' + e.message, 'error');
          updated -= BATCH;
        });
      }
      // Push ALL updates to app_overrides — full replace so stale OOS flags are cleared
      const allOverrides = { ...firestoreOverrides };
      toUpdateSeed.forEach(({ id, update }) => { allOverrides[String(id)] = _cleanForOverrides(update); });
      if (Object.keys(allOverrides).length) {
        // First read existing overrides, merge in our updates, then write back fully
        const existingOv = await window.db.collection('app_overrides').doc('products').get().catch(()=>null);
        const merged = existingOv && existingOv.exists ? { ...existingOv.data() } : {};
        Object.assign(merged, allOverrides);
        await window.db.collection('app_overrides').doc('products')
          .set(merged)
          .catch(e => console.warn('Override sync error:', e.message));
      }

      closeModal();
      let msg = '✅ Updated ' + updated + ' products';
      if (notFound.length) msg += ' | ⚠ ' + notFound.length + ' not found: ' + notFound.slice(0,3).join(', ') + (notFound.length>3?'…':'');
      toast(msg, updated>0?'success':'warning');

    } else if (_bulkMode === 'sync') {
      // ─── SYNC MODE: Excel = Truth. Products not in Excel get hidden ───
      const all = window.allProducts || window._allProducts || window.products || [];
      if (!all.length) {
        toast('Products not loaded yet — please wait and try again', 'error');
        if (btn) { btn.disabled=false; btn.textContent='✅ Upload '+_csvParsed.length+' Products'; }
        return;
      }
      const excelNames = new Set(_csvParsed.map(r => (r.name||'').toLowerCase().trim()));
      const excelIds   = new Set(_csvParsed.filter(r=>r.id).map(r => String(r.id)));
      const nameMap = {}, idMap = {};
      all.forEach(p => {
        nameMap[(p.name||'').toLowerCase().trim()] = p;
        if (p.id) idMap[String(p.id)] = p;
      });
      const toUpdate = [], toHide = [];
      _csvParsed.forEach(row => {
        const existing = (row.id && idMap[String(row.id)]) || nameMap[(row.name||'').toLowerCase().trim()];
        if (!existing) return;
        const update = { teluguName: row.teluguName || '' };
        const pr = parseFloat(row.price); if (!isNaN(pr) && pr > 0) update.price = pr;
        const hp = parseFloat(row.halfPrice); if (!isNaN(hp) && hp > 0) update.halfPrice = hp;
        const qp = parseFloat(row.quarterPrice); if (!isNaN(qp) && qp > 0) update.quarterPrice = qp;
        if (row.img) {
          const imgVal = row.img.trim();
          if (imgVal) {
            let normalized = imgVal.replace(/^\.\//, '');
            normalized = normalized.replace(/^images\//, '');
            update.img = normalized.startsWith('http') ? normalized : 'images/' + normalized;
          }
        }
        const sp = parseFloat(row.slashedPrice); if (!isNaN(sp) && sp > 0) update.slashedPrice = sp;
        if (row.unit) update.unit = row.unit;
        if (row.category) update.category = row.category;
        if (row.description != null) update.description = row.description;
        if (row.img) update.img = row.img.startsWith('http') ? row.img : './images/' + row.img.replace(/^\.\/?images\//, '');
        const st = parseInt(row.stock); if (!isNaN(st) && st >= 0) update.stock = st;
        const oos = row.outOfStock;
        update.outOfStock = oos === true || oos === 'true' || oos === '1' || oos === 'yes' || oos === 'TRUE';
        toUpdate.push({ existing, update });
      });
      all.forEach(p => {
        const inExcel = excelNames.has((p.name||'').toLowerCase().trim()) || (p.id && excelIds.has(String(p.id)));
        if (!inExcel) toHide.push(p);
      });
      if (toHide.length > 0) {
        const confirmed = confirm(
          'SYNC MODE WARNING:\n\n'
          + '✅ ' + toUpdate.length + ' products in Excel will be updated\n'
          + '🔴 ' + toHide.length + ' products NOT in Excel will be HIDDEN from users\n\n'
          + 'Nothing is permanently deleted — you can restore anytime.\n\nContinue?'
        );
        if (!confirmed) {
          if (btn) { btn.disabled=false; btn.textContent='✅ Upload '+_csvParsed.length+' Products'; }
          return;
        }
      }
      const BATCH = 400;
      const allOverrides = {};
      const toUpdateFS = toUpdate.filter(x => x.existing._docId);
      const toUpdateSd = toUpdate.filter(x => !x.existing._docId);
      for (let i = 0; i < toUpdateFS.length; i += BATCH) {
        const batch = window.db.batch();
        toUpdateFS.slice(i, i+BATCH).forEach(({ existing, update }) => {
          batch.update(window.db.collection('products').doc(existing._docId), update);
          allOverrides[String(existing.id)] = update;
        });
        await batch.commit().catch(e => console.error('Sync update batch:', e.message));
      }
      toUpdateSd.forEach(({ existing, update }) => { allOverrides[String(existing.id)] = update; });
      const toHideFS = toHide.filter(p => p._docId);
      const toHideSd = toHide.filter(p => !p._docId);
      for (let i = 0; i < toHideFS.length; i += BATCH) {
        const batch = window.db.batch();
        toHideFS.slice(i, i+BATCH).forEach(p => {
          batch.update(window.db.collection('products').doc(p._docId), { outOfStock: true, hidden: true });
          allOverrides[String(p.id)] = { outOfStock: true, hidden: true };
        });
        await batch.commit().catch(e => console.error('Sync hide batch:', e.message));
      }
      toHideSd.forEach(p => { allOverrides[String(p.id)] = { outOfStock: true, hidden: true }; });
      // Full replace — wipes all stale hidden/OOS flags from previous syncs
      await window.db.collection('app_overrides').doc('products')
        .set(allOverrides)
        .catch(e => console.warn('Override sync:', e.message));
      closeModal();
      toast('✅ Sync done! ' + toUpdate.length + ' updated, ' + toHide.length + ' hidden from users', 'success');

    } else {
      // ─── ADD MODE: create new products + instant sync to user app ───
      let nextId = 5000; try { const snap = await window.db.collection('products').orderBy('id','desc').limit(1).get(); if (!snap.empty) nextId = (snap.docs[0].data().id || 4999) + 1; } catch(e) { console.warn('ID fetch:', e.message); }

      let done=0, failed=0, skipped=0;
      const BATCH = 400;
      const overrides = {}; // for instant user-side sync

      // ─── DUPLICATE GUARD: build a set of existing product names (case-insensitive) ───
      const existingAll = window.allProducts || window._allProducts || window.products || [];
      const existingNames = new Set(existingAll.map(p => (p.name||'').toLowerCase().trim()));
      const skippedNames = [];

      // Filter out duplicates before uploading
      const toAdd = _csvParsed.filter(p => {
        const key = (p.name||'').toLowerCase().trim();
        if (existingNames.has(key)) {
          skippedNames.push(p.name);
          skipped++;
          return false;
        }
        return true;
      });

      if (!toAdd.length) {
        closeModal();
        toast('⚠ All ' + skipped + ' products already exist — nothing added. Use Update Mode to change prices/stock.', 'warning');
        _csvParsed = [];
        return;
      }

      // Generate next barcode: use a separate counter starting from 1000
      let nextBarcode = 1000;
      try {
        const lastProd = await window.db.collection('products')
          .where('barcode', '!=', '')
          .orderBy('barcode', 'desc')
          .limit(1)
          .get();
        if (!lastProd.empty && lastProd.docs[0].data().barcode) {
          const lastBarcode = parseInt(lastProd.docs[0].data().barcode);
          if (!isNaN(lastBarcode)) nextBarcode = lastBarcode + 1;
        }
      } catch(e) {
        console.warn('Barcode fetch:', e.message);
      }

      for (let i=0; i<toAdd.length; i+=BATCH) {
        const fb = window.db.batch();
        toAdd.slice(i, i+BATCH).forEach(p => {
          const id = nextId++;
          const barcode = String(nextBarcode++);
          const clean = { 
            id, 
            barcode, // Auto-generated barcode
            ...p 
          };
          // Normalize image path
          if (clean.img) {
            clean.img = clean.img.trim().replace(/^\.\//, '').replace(/^images\//, '');
            clean.img = clean.img.startsWith('http') ? clean.img : 'images/' + clean.img;
          }
          Object.keys(clean).forEach(k => { if (clean[k] === undefined) delete clean[k]; });
          clean.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          fb.set(window.db.collection('products').doc(), clean);
          const ov = { ...clean };
          delete ov.createdAt;
          overrides[String(id)] = ov;
          done++;
        });
        if (btn) btn.textContent = 'Uploading… ' + Math.min(done, toAdd.length) + '/' + toAdd.length;
        await fb.commit().catch(e => {
          toast('Batch error: '+e.message,'error');
          failed += BATCH; done -= BATCH;
        });
      }

      // Push to app_overrides so user app sees new products instantly
      if (Object.keys(overrides).length) {
        await window.db.collection('app_overrides').doc('products')
          .set(overrides, { merge: true })
          .catch(e => console.warn('Override sync:', e.message));
      }

      closeModal();
      let msg = '✅ ' + done + ' products added!';
      if (skipped) msg += ' | ⚠ ' + skipped + ' skipped (already exist): ' + skippedNames.slice(0,3).join(', ') + (skippedNames.length>3?'…':'');
      if (failed) msg += ' | ❌ ' + failed + ' failed';
      toast(msg, done>0?'success':'warning');
    }

    _csvParsed = [];
    if (typeof _invSelected !== 'undefined') _invSelected.clear();
    if (typeof loadAllProducts==='function') {
      loadAllProducts().then(() => { renderInventory(); loadInventoryStats(); });
    }
  } catch(e) {
    console.error('❌ Upload error:', e);
    toast('❌ Upload error: ' + e.message, 'error');
    if (btn) { btn.disabled=false; btn.textContent='✅ Upload '+_csvParsed.length+' Products'; }
  }
}
window.confirmBulkUpload = confirmBulkUpload;

function showCSVFormat() {
  showModal('<h3>📋 Excel Column Guide</h3>'
    +'<div style="overflow-x:auto"><table style="width:100%;font-size:12px;border-collapse:collapse">'
    +'<thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);color:var(--text2)">Column</th>'
    +'<th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);color:var(--text2)">Required</th>'
    +'<th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);color:var(--text2)">Example</th></tr></thead><tbody>'
    +[
      ['name','✅ Yes','Tomato (Local)'],
      ['teluguName','No','టమాటా'],
      ['price','✅ Yes','65'],
      ['halfPrice','No','35'],
      ['quarterPrice','No','20'],
      ['slashedPrice','No (MRP/strikethrough)','80'],
      ['unit','✅ Yes','Kg / Pc / Pack / 500g / Bunch'],
      ['category','✅ Yes','VEGETABLES (see list below)'],
      ['img','No (just filename)','Tomato.jpg ← filename only'],
      ['description','No','Fresh red tomatoes'],
      ['stock','No (default 100)','150'],
      ['outOfStock','No (default false)','false'],
      ['id','❌ DO NOT ADD','Auto-generated'],
      ['barcode','❌ DO NOT ADD','Auto-generated (1000+)'],
    ].map(([col,req,ex])=>'<tr style="border-bottom:1px solid rgba(255,255,255,.03)">'
      +'<td style="padding:7px;font-family:var(--mono);color:'+(col==='id'||col==='barcode'?'var(--red)':'var(--green)')+'">'+col+'</td>'
      +'<td style="padding:7px;color:'+(col==='id'||col==='barcode'?'var(--red)':'inherit')+'">'+req+'</td>'
      +'<td style="padding:7px;color:var(--text2)">'+ex+'</td>'
      +'</tr>').join('')
    +'</tbody></table></div>'
    +'<div style="margin-top:14px;padding:10px;background:var(--bg3);border-radius:4px;border-left:3px solid var(--green)">'
    +'<strong style="color:var(--green)">✅ Auto-Generated Fields (ADD MODE)</strong><br>'
    +'<span style="color:var(--text2);font-size:11px">Each new product automatically gets a unique:</span><br>'
    +'• <code style="background:var(--bg4);padding:2px 4px;border-radius:2px">id</code> (5000+, increments per product)<br>'
    +'• <code style="background:var(--bg4);padding:2px 4px;border-radius:2px">barcode</code> (1000+, increments per product)<br>'
    +'<span style="color:var(--text2);font-size:11px">👉 DO NOT include id or barcode columns in your Excel file!</span>'
    +'</div>'
    +'<div style="margin-top:14px;padding:10px;background:var(--bg3);border-radius:4px;border-left:3px solid var(--blue)">'
    +'<strong style="color:var(--blue)">🖼️ Image Files</strong><br>'
    +'<span style="color:var(--text2);font-size:11px">'
    +'In the <code style="background:var(--bg4);padding:2px 4px">img</code> column, enter JUST the filename:<br>'
    +'✅ <code style="background:var(--bg4);padding:2px 4px">Tomato.jpg</code><br>'
    +'❌ <code style="background:var(--bg4);padding:2px 4px">./images/Tomato.jpg</code><br>'
    +'❌ <code style="background:var(--bg4);padding:2px 4px">images/Tomato.jpg</code><br>'
    +'System automatically adds "images/" prefix. Place actual files in the <code style="background:var(--bg4);padding:2px 4px">images/</code> folder.'
    +'</span>'
    +'</div>'
    +'<div style="margin-top:14px;font-size:12px;color:var(--text2)">'
    +'<strong style="color:var(--text)">Valid categories:</strong><br>'
    +VALID_CATS.map(c=>'<code style="background:var(--bg3);padding:2px 6px;border-radius:4px;margin:2px;display:inline-block;font-size:11px">'+c+'</code>').join(' ')
    +'</div>'
    +'<div class="modal-footer"><button class="btn-primary" onclick="closeModal()">Got it</button></div>'
  );
}
window.showCSVFormat = showCSVFormat;

// NOTE: deleteProduct is defined in nekta-dashboard.js (handles both seed + Firestore products)
// Do NOT redefine here — catalog-manager.js uses the dashboard version.

// ─── EXPORT ALL PRODUCTS AS REAL XLSX ──────────────────────────
async function exportAllProducts() {
  if (typeof XLSX === 'undefined') { toast('SheetJS not loaded', 'error'); return; }
  toast('Fetching all products...', 'info');
  let all = [];
  try {
    if (window.db) {
      const snap = await window.db.collection('products').get();
      all = snap.docs.map(d => ({ ...d.data(), _docId: d.id })).filter(p => !p.hidden);
    }
  } catch(e) {
    console.warn('exportAllProducts fallback:', e.message);
    all = window.allProducts || window._allProducts || window.products || [];
  }
  if (!all.length) { toast('No products to export', 'warning'); return; }
  const BASE = 'https://nektagrocery.netlify.app/';
  const labels = ['ID','Name','Telugu Name','Price','Half Price','Quarter Price','Slashed Price','Unit','Category','Image Filename','Image Full URL','Description','Stock','Out of Stock'];
  const dataRows = all.map(p => {
    const raw = (p.img||'').replace(/^\.\//,'');
    const fname = raw.replace(/^images\//,'');
    const furl = raw.startsWith('http') ? raw : (raw ? BASE+raw : '');
    return [p.id||'',p.name||'',p.teluguName||'',p.price||0,
      p.halfPrice!=null&&p.halfPrice!==''?p.halfPrice:'',
      p.quarterPrice!=null&&p.quarterPrice!==''?p.quarterPrice:'',
      p.slashedPrice!=null&&p.slashedPrice!==''?p.slashedPrice:'',
      p.unit||'',p.category||'',fname,furl,
      p.description||'',p.stock!=null?p.stock:0,p.outOfStock?'true':'false'];
  });
  _catSaveXlsx(labels, dataRows, 'Products', 'nekta-products-' + new Date().toISOString().slice(0,10) + '.xlsx');
  toast('Exported ' + all.length + ' products - edit and re-upload in Update mode', 'success');
}
window.exportAllProducts = exportAllProducts;

// ─── CATEGORY BULK ACTIONS ────────────────────────────────────
function openCategoryManager() {
  // Ensure products are loaded
  const all = window.allProducts || _allProducts || [];
  
  if (!all || all.length === 0) {
    toast('Loading products... Please try again in a moment', 'info');
    if (typeof loadAllProducts === 'function') {
      loadAllProducts().then(() => openCategoryManager());
    }
    return;
  }
  
  const cats = {};
  // Initialize all valid categories with 0
  VALID_CATS.forEach(c => { cats[c] = 0; });
  
  // Count products in each category
  all.forEach(p => {
    const pCat = p.category || 'UNCATEGORIZED';
    if (cats.hasOwnProperty(pCat)) {
      cats[pCat]++;
    } else {
      // Track uncategorized products
      if (!cats['UNCATEGORIZED']) cats['UNCATEGORIZED'] = 0;
      cats['UNCATEGORIZED']++;
    }
  });

  showModal('<h3>📂 Category Overview</h3>'
    +'<div style="margin-bottom:14px;font-size:12px;color:var(--text2)">'+all.length+' total products across '+Object.values(cats).filter(n=>n>0).length+' categories</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">'
    +VALID_CATS.map(c=>{
      const count = cats[c] || 0;
      return '<div style="background:var(--bg3);border-radius:10px;padding:12px;display:flex;justify-content:space-between;align-items:center">'
      +'<div><div style="font-size:12px;font-weight:600">'+c+'</div>'
      +'<div style="font-size:10px;color:var(--text2)">'+count+' product'+(count!==1?'s':'')+' </div></div>'
      +'<div style="font-family:var(--mono);font-size:18px;font-weight:700;color:'+(count>0?'var(--green)':'var(--text3)')+'">'+count+'</div>'
      +'</div>';
    }).join('')
    +(cats['UNCATEGORIZED'] ? '<div style="background:rgba(255,214,0,.1);border:1px solid rgba(255,214,0,.3);border-radius:10px;padding:12px;display:flex;justify-content:space-between;align-items:center;grid-column:1/-1">'
      +'<div><div style="font-size:12px;font-weight:600;color:var(--yellow)">UNCATEGORIZED</div>'
      +'<div style="font-size:10px;color:var(--text2)">'+cats['UNCATEGORIZED']+' product'+(cats['UNCATEGORIZED']!==1?'s':'')+' (needs fixing)</div></div>'
      +'<div style="font-family:var(--mono);font-size:18px;font-weight:700;color:var(--yellow)">'+cats['UNCATEGORIZED']+'</div>'
      +'</div>' : '')
    +'</div>'
    +'<div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Close</button>'
    +'<button class="btn-primary" onclick="closeModal();openBulkUpload()">+ Bulk Add Products</button></div>'
  );
}
window.openCategoryManager = openCategoryManager;

// ─── DUPLICATE MANAGER ───────────────────────────────────────
function findDuplicates() {
  const all = window.allProducts || [];
  const seen = {};
  const dupes = [];
  all.forEach(p => {
    const key = (p.name||'').toLowerCase().trim();
    if (seen[key]) dupes.push(p.name);
    else seen[key] = true;
  });
  return dupes;
}

async function openDuplicateManager() {
  const all = window._allProducts || window.allProducts || [];
  if (!all.length) { toast('Products not loaded yet — please wait', 'warning'); return; }

  // Group by name (case-insensitive)
  const nameMap = {};
  all.forEach(p => {
    const key = (p.name||'').toLowerCase().trim();
    if (!nameMap[key]) nameMap[key] = [];
    nameMap[key].push(p);
  });

  const dupeGroups = Object.values(nameMap).filter(g => g.length > 1);

  if (!dupeGroups.length) {
    toast('✅ No duplicate products found!', 'success');
    return;
  }

  const totalDupes = dupeGroups.reduce((s, g) => s + g.length - 1, 0);

  let html = '<h3>🔍 Duplicate Products</h3>'
    + '<p style="font-size:12px;color:var(--text2);margin-bottom:14px">'
    + dupeGroups.length + ' names duplicated · <b style="color:var(--red)">' + totalDupes + ' extra copies</b> will be deleted (1 kept per name).</p>'
    + '<div style="max-height:340px;overflow-y:auto;margin-bottom:14px">';

  dupeGroups.forEach(group => {
    const sorted = group.slice().sort((a, b) => (a.id||0) - (b.id||0));
    const keep = sorted[0];
    const toDelete = sorted.slice(1);
    html += '<div style="background:var(--bg3);border-radius:10px;padding:12px;margin-bottom:8px">'
      + '<div style="font-size:13px;font-weight:700;margin-bottom:6px">' + (keep.name||'') + ' <span style="font-size:11px;color:var(--green)">(' + group.length + ' copies)</span></div>'
      + '<div style="font-size:11px;color:var(--green);margin-bottom:4px">✅ Keep: ID ' + (keep.id||'?') + ' · ' + (keep.category||'') + ' · ₹' + (keep.price||0) + '</div>'
      + toDelete.map(p => '<div style="font-size:11px;color:var(--red)">🗑 Delete: ID ' + (p.id||'?') + ' · ' + (p.category||'') + ' · ₹' + (p.price||0) + (p._docId ? '' : ' (seed)') + '</div>').join('')
      + '</div>';
  });

  html += '</div>'
    + '<div class="modal-footer">'
    + '<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '<button class="btn-primary" style="background:var(--red)" onclick="confirmDeleteDuplicates()">🗑 Delete ' + totalDupes + ' Duplicates</button>'
    + '</div>';

  showModal(html);
  window._dupeGroups = dupeGroups;
}
window.openDuplicateManager = openDuplicateManager;

async function confirmDeleteDuplicates() {
  const dupeGroups = window._dupeGroups || [];
  if (!dupeGroups.length) { closeModal(); return; }
  closeModal();
  toast('🗑 Deleting duplicates...', 'info');

  let deleted = 0, failed = 0;
  const BATCH = 400;
  let batch = window.db.batch();
  let batchCount = 0;

  for (const group of dupeGroups) {
    const sorted = group.slice().sort((a, b) => (a.id||0) - (b.id||0));
    const toDelete = sorted.slice(1);
    for (const p of toDelete) {
      if (p._docId) {
        batch.delete(window.db.collection('products').doc(p._docId));
        batchCount++;
        deleted++;
        if (batchCount >= BATCH) {
          await batch.commit().catch(e => { console.error('Batch:', e.message); failed += batchCount; deleted -= batchCount; });
          batch = window.db.batch();
          batchCount = 0;
        }
      } else {
        await window.db.collection('app_overrides').doc('products')
          .set({ [String(p.id)]: { hidden: true } }, { merge: true })
          .then(() => deleted++).catch(() => failed++);
      }
    }
  }

  if (batchCount > 0) {
    await batch.commit().catch(e => { console.error('Final batch:', e.message); failed += batchCount; deleted -= batchCount; });
  }

  window._dupeGroups = [];
  toast('✅ Deleted ' + deleted + ' duplicates!' + (failed ? ' (' + failed + ' failed)' : ''), deleted > 0 ? 'success' : 'error');
  if (typeof loadAllProducts === 'function') loadAllProducts().then(() => { renderInventory(); loadInventoryStats(); });
}
window.confirmDeleteDuplicates = confirmDeleteDuplicates;

// ─── PATCH EXISTING PRODUCT (quick price/stock edit from table) ─
async function quickEditField(productId, field, currentVal) {
  const newVal = prompt('New '+field+' for product (current: '+currentVal+')', currentVal);
  if (newVal === null || newVal === currentVal+'') return;
  const parsed = field==='outOfStock' ? newVal==='true' : (isNaN(newVal) ? newVal : Number(newVal));
  // Write to app_overrides for instant sync
  try {
    await window.db.collection('app_overrides').doc('products').set(
      { [String(productId)]: { [field]: parsed } }, { merge:true }
    );
    // Also update products collection if doc exists
    const p = (window.allProducts||[]).find(x=>x.id==productId);
    if (p && p._docId) {
      await window.db.collection('products').doc(p._docId).update({ [field]: parsed }).catch(()=>{});
    }
    toast(field+' updated to '+newVal,'success');
    if (typeof loadAllProducts==='function') loadAllProducts();
  } catch(e) { toast(e.message,'error'); }
}
window.quickEditField = quickEditField;

// ─── BULK SELECT / DELETE / ARCHIVE ─────────────────────────
// NOTE: toggleSelectAllProducts, updateBulkButtons, doBulkDelete, doBulkArchive
// are defined in nekta-dashboard.js — do not redefine here to avoid conflicts.
// bulkDeleteSelected and bulkArchiveSelected are aliases for the dashboard versions.
window.bulkDeleteSelected = function() { if (typeof doBulkDelete === 'function') doBulkDelete(); };
window.bulkArchiveSelected = function() { if (typeof doBulkArchive === 'function') doBulkArchive(); };



