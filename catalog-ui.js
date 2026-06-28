// ================================================================
// NEKTA CATALOG UI v4 — Modern Colorful Icons
// ================================================================
'use strict';

var CATS_V2 = [
  {id:'ALL',         l:'All Items',    e:'\uD83D\uDED2', g:'linear-gradient(135deg,#00b96b,#00d97e)', sh:'rgba(0,185,107,.4)'},
  // ── Fresh Produce ──
  {id:'VEGETABLES',  l:'Vegetables',   e:'\uD83E\uDD66', g:'linear-gradient(135deg,#22c55e,#15803d)', sh:'rgba(34,197,94,.4)'},
  {id:'LEAFY',       l:'Leafy Greens', e:'\uD83C\uDF3F', g:'linear-gradient(135deg,#4ade80,#16a34a)', sh:'rgba(74,222,128,.4)'},
  {id:'FRUITS',      l:'Fruits',       e:'\uD83C\uDF4A', g:'linear-gradient(135deg,#f97316,#ea580c)', sh:'rgba(249,115,22,.4)'},
  // ── Dairy & Breakfast ──
  {id:'DAIRY',       l:'Dairy & Eggs', e:'\uD83E\uDD5B', g:'linear-gradient(135deg,#38bdf8,#0284c7)', sh:'rgba(56,189,248,.4)'},
  // ── Pantry ──
  {id:'GRAINS',      l:'Grains & Atta',e:'\uD83C\uDF3E', g:'linear-gradient(135deg,#fbbf24,#d97706)', sh:'rgba(251,191,36,.4)'},
  {id:'DALS',        l:'Dals & Pulses',e:'\uD83E\uDED8', g:'linear-gradient(135deg,#a3e635,#65a30d)', sh:'rgba(163,230,53,.4)'},
  {id:'OILS',        l:'Oils & Ghee',  e:'\uD83E\uDED9', g:'linear-gradient(135deg,#facc15,#ca8a04)', sh:'rgba(250,204,21,.4)'},
  {id:'SPICES',      l:'Spices',       e:'\uD83C\uDF36', g:'linear-gradient(135deg,#f87171,#dc2626)', sh:'rgba(248,113,113,.4)'},
  {id:'CONDIMENTS',  l:'Condiments',   e:'\uD83E\uDD6B', g:'linear-gradient(135deg,#fb7185,#be123c)', sh:'rgba(251,113,133,.4)'},
  {id:'PICKLES',     l:'Pickles',      e:'\uD83E\uDD52', g:'linear-gradient(135deg,#8b5cf6,#6d28d9)', sh:'rgba(139,92,246,.4)'},
  // ── Snacks & Drinks ──
  {id:'SNACKS',      l:'Snacks',       e:'\uD83C\uDF7F', g:'linear-gradient(135deg,#fb923c,#ea580c)', sh:'rgba(251,146,60,.4)'},
  {id:'CHOCOLATES',  l:'Chocolates',   e:'\uD83C\uDF6B', g:'linear-gradient(135deg,#92400e,#78350f)', sh:'rgba(146,64,14,.4)'},
  {id:'ICECREAMS',   l:'Ice Creams',   e:'\uD83C\uDF66', g:'linear-gradient(135deg,#06b6d4,#0891b2)', sh:'rgba(6,182,212,.4)'},
  {id:'DRINKS',      l:'Drinks',       e:'\uD83E\uDD64', g:'linear-gradient(135deg,#22d3ee,#0891b2)', sh:'rgba(34,211,238,.4)'},
  // ── Non-Veg ──
  {id:'NONVEG',      l:'Non-Veg',      e:'\uD83C\uDF57', g:'linear-gradient(135deg,#f43f5e,#be123c)', sh:'rgba(244,63,94,.4)'},
  // ── Combos & Ready to Cook ──
  {id:'COMBOS',      l:'Combos',       e:'\uD83C\uDF81', g:'linear-gradient(135deg,#f472b6,#db2777)', sh:'rgba(244,114,182,.4)'},
  {id:'EASYCOOK',    l:'Easy Cook',    e:'\uD83C\uDF73', g:'linear-gradient(135deg,#f59e0b,#d97706)', sh:'rgba(245,158,11,.4)'},
  // ── Home & Personal ──
  {id:'PERSONALCARE',l:'Personal Care',e:'\uD83E\uDDF4', g:'linear-gradient(135deg,#a78bfa,#7c3aed)', sh:'rgba(167,139,250,.4)'},
  {id:'CLEANING',    l:'Cleaning',     e:'\uD83E\uDDF9', g:'linear-gradient(135deg,#67e8f9,#0e7490)', sh:'rgba(103,232,249,.4)'},
  // ── Puja & Pan Shop ──
  {id:'PUJA',        l:'Puja',         e:'\uD83E\uDEA9', g:'linear-gradient(135deg,#fde68a,#f59e0b)', sh:'rgba(253,230,138,.4)'},
  {id:'PANSHOP',     l:'Pan Shop',     e:'\uD83D\uDEAC', g:'linear-gradient(135deg,#6b7280,#374151)', sh:'rgba(107,114,128,.4)'},
];

var CAT_SUBS = {
  // ── VEGETABLES: only vegetables here ──────────────────────────
  VEGETABLES:[
    {label:'\uD83E\uDD54 Root & Bulb Veg',   kw:['Potato','Onion','Carrot','Beetroot','Radish','Sweet Potato','Arvi','Yam','Turnip','Garlic','Ginger']},
    {label:'\uD83E\uDD52 Gourds & Beans',    kw:['Gourd','Beans','Peas','Corn','Tindli','Cluster','Drumstick','Mushroom','Cucumber','Brinjal','Pumpkin']},
    {label:'\uD83C\uDF36 Capsicum & Tomato', kw:['Capsicum','Bell Pepper','Chilli','Tomato','Cherry']},
    {label:'\uD83E\uDD66 Brassica & Others', kw:['Cauliflower','Cabbage','Broccoli','Zucchini','Lemon','Spring Onion','Banana (Raw)','Raw Papaya']},
  ],

  // ── LEAFY: only leafy greens ───────────────────────────────────
  LEAFY:[
    {label:'\uD83C\uDF3F Fresh Leafy Greens', kw:['Coriander','Spinach','Curry Leaves','Mint','Fenugreek','Methi','Amaranth','Thotakura','Gongoora','Mustard Leaves','Spring Onion','Pudina']},
  ],

  // ── FRUITS: only fruits ────────────────────────────────────────
  FRUITS:[
    {label:'\uD83C\uDF4A Citrus & Tropical',  kw:['Orange','Mosambi','Pineapple','Mango','Papaya','Guava','Dragon','Kiwi','Coconut','Watermelon']},
    {label:'\uD83C\uDF47 Berries & Stone',    kw:['Grape','Berry','Strawberry','Pomegranate','Blackberry']},
    {label:'\uD83C\uDF4E Daily Fruits',       kw:['Apple','Banana']},
  ],

  // ── DAIRY: milk, curd, paneer, butter, eggs, bread ─────────────
  DAIRY:[
    {label:'\uD83E\uDD5B Milk & Curd',      kw:['Milk','Curd','Lassi']},
    {label:'\uD83E\uDDC8 Paneer & Cheese',  kw:['Paneer','Butter','Ghee','Cheese']},
    {label:'\uD83E\uDD5A Eggs',             kw:['Egg','Eggs','White Eggs']},
    {label:'\uD83C\uDF5E Breads',           kw:['Bread','White Bread','Brown Bread']},
  ],

  // ── GRAINS: rice, atta, rava, millets only ────────────────────
  GRAINS:[
    {label:'\uD83C\uDF3E Rice',           kw:['Rice','Basmati','Sona','Idli Rice','Dosa Rice','Raw Rice','Poha','Atukulu','Sabudana','Sago','Vermicelli']},
    {label:'\uD83E\uDED3 Flour & Rava',   kw:['Atta','Maida','Besan','Rava','Ravva','Flour','Ragi','Jowar','Bajra','Sajjalu','Jonnalu','Ragulu','Oats','Corn Flour']},
  ],

  // ── CONDIMENTS: pickles, jams, sugar, honey, jaggery, tamarind ─
  CONDIMENTS:[
    {label:'\uD83E\uDD6B Pickles',         kw:['Pickle','Avakaya']},
    {label:'\uD83C\uDF6F Sweeteners',      kw:['Jaggery','Honey','Sugar','Jam']},
    {label:'\uD83E\uDDC2 Pastes & More',   kw:['Tamarind','Pulihora','Ginger Garlic','Paste']},
  ],

  // ── PICKLES: only pickles and achars ─────────────────────────
  PICKLES:[
    {label:'\uD83E\uDD52 All Pickles', kw:['Pickle','Achar','Avakaya','Mango Pickle']},
  ],

  // ── DALS: only dals & pulses ───────────────────────────────────
  DALS:[
    {label:'\uD83E\uDED8 Dals',           kw:['Toor','Moong','Urad','Chana','Masoor','Horse Gram','Ulava']},
    {label:'\uD83C\uDF31 Whole Pulses',   kw:['Chickpeas','Rajma','Green Gram','Black Gram','Soya','Pappulu','Fried Gram','Kabuli']},
  ],

  // ── OILS: only cooking oils and ghee ──────────────────────────
  OILS:[
    {label:'\uD83E\uDED9 Cooking Oils',   kw:['Sunflower','Groundnut','Rice Bran','Sesame','Coconut Oil','Olive','Oil']},
    {label:'\uD83C\uDF6F Pure Ghee',      kw:['Ghee','Butter']},
  ],

  // ── SPICES: only masalas, powders, pastes, condiments ─────────
  // NOTE: Papad, Pulihora, Sandwich Cream moved here from SNACKS
  SPICES:[
    {label:'\uD83C\uDF36 Whole Spices',   kw:['Mustard','Cumin','Black Pepper','Cloves','Cardamom','Cinnamon','Star Anise','Bay Leaves','Poppy','Asafoetida','Inguva','Jeelakarra','Aavalu']},
    {label:'\uD83C\uDF75 Spice Powders',  kw:['Turmeric','Chilli Powder','Coriander Powder','Garam Masala','Salt','Pepper','Dhaniya','Menthu','Kasuri','Sambar Powder','Rasam Powder','Karam Podi']},
    {label:'\uD83C\uDF72 Masala Packs',   kw:['Chicken Masala','Mutton Masala','Fish Curry','Biryani Masala','Everest','MTR','Aachi']},
    {label:'\uD83E\uDD6B Pastes & Condiments', kw:['Ginger Garlic Paste','Ginger-Garlic','Papad','Sambar','Rasam','Pulihora','Sandwich Cream']},
  ],

  // ── SNACKS: only chips, biscuits, noodles, namkeen ────────────
  SNACKS:[
    {label:'\uD83C\uDF5F Chips & Namkeen',     kw:['Bingo','Lays','Kurkure','Namkeen','Bhujiya','Soya Sticks','Murmura','Testys','Nuts','Aloo','Lay\'s','Banana Chips','Chivda','Mixture','Trail Mix']},
    {label:'\uD83C\uDF6A Biscuits & Cookies',  kw:['Bourbon','Marigold','50-50','Oreo','Moms Magic','Coconut Cookies','Dark Fantasy','Good Day','Parle','Marie','Britannia']},
    {label:'\uD83C\uDF5C Noodles & Instant',   kw:['Noodles','Maggi','Yippee']},
  ],

  // ── CHOCOLATES: only chocolates ───────────────────────────────
  CHOCOLATES:[
    {label:'\uD83C\uDF6B Chocolates & Bars',   kw:['Cadbury','5 Star','KitKat','Dairy Milk','Munch','Fuse','Fruit & Nut','Dessert','Dairy Milk (25g)']},
  ],

  // ── ICECREAMS: only ice creams ────────────────────────────────
  ICECREAMS:[
    {label:'\uD83C\uDF66 Ice Cream Bars',      kw:['Chocobar','Yummy Bear','Cone','iBar','iCone','Double Chocolate','Vanilla Cone']},
    {label:'\uD83C\uDF68 Ice Cream Tubs',      kw:['Arun']},
  ],

  // ── DRINKS: cold drinks, juices, tea, coffee, water ───────────
  DRINKS:[
    {label:'\uD83E\uDD64 Cold Drinks',         kw:['Sprite','Thums Up','Maaza','Water Bottle','Juice','Squash','Cordial']},
    {label:'\u2615 Tea & Coffee',              kw:['Tea','Coffee','Horlicks','Bournvita']},
    {label:'\uD83C\uDF45 Coconut & Others',    kw:['Coconut Water']},
  ],

  // ── NONVEG: only meat and fish ────────────────────────────────
  NONVEG:[
    {label:'\uD83D\uDC14 Chicken', kw:['Chicken']},
    {label:'\uD83D\uDC10 Mutton',  kw:['Mutton']},
    {label:'\uD83D\uDC1F Fish',    kw:['Fish','Prawn','Pomfret','Rohu']},
  ],

  // ── PERSONAL CARE: soaps, diapers, feminine, intimate, grooming ──
  // NOTE: Detergents (Surf Excel, Ariel) moved to CLEANING.
  PERSONALCARE:[
    {label:'\uD83E\uDDF4 Bath & Body',     kw:['Soap','Body Wash','Shampoo','Hair Oil','Deodorant','Face Wash','Hand Wash','Santoor']},
    {label:'\uD83E\uDEB7 Dental & Shave',  kw:['Toothpaste','Colgate','Shaving','Razor','Aftershave']},
    {label:'\uD83D\uDC76 Baby Care',       kw:['Pampers','Huggies','MamyPoko','Diaper']},
    {label:'\uD83E\uDE78 Feminine Care',   kw:['Stayfree','Whisper','Pad']},
    {label:'\uD83D\uDD12 Intimate Care',   kw:['Condom','Durex','Manforce','Skore','Pregnancy','Prega','i-can']},
  ],

  // ── CLEANING: detergents, floor cleaners, disinfectants ───────
  // NOTE: Surf Excel, Ariel, Harpic moved here from PERSONALCARE.
  CLEANING:[
    {label:'\uD83E\uDDF9 Laundry',         kw:['Surf','Ariel','Detergent','Laundry','Fabric Conditioner','Starch','Bleach']},
    {label:'\uD83E\uDDFC Dish & Floor',    kw:['Dishwash','Floor Cleaner','Toilet','Harpic']},
    {label:'\uD83E\uDDF9 Home Care',       kw:['Garbage','Mosquito','Insecticide','Air Freshener','Room Spray']},
  ],

  // ── PUJA, COMBOS, EASYCOOK, PANSHOP ───────────────────────────
  PUJA:[
    {label:'\uD83E\uDEA9 Puja Essentials', kw:['Agarbatti','Camphor','Karpuram','Kumkum','Cotton Wicks','Dhoop','Matchbox','Sandalwood','Vibhuti','Vermillion','Turmeric (Puja','Flower','Garland','Rose Petals','Jasmine','Puja Oil']},
  ],
  COMBOS:[{label:'\uD83C\uDF81 Combo Kits', kw:[]}],
  EASYCOOK:[
    {label:'\uD83C\uDF73 Ready to Cook', kw:['Batter','Frozen Chapathi','Parota','Idly','Dosa']},
  ],
  PANSHOP:[
    {label:'\uD83D\uDEAC Tobacco & Lighter', kw:['Gold Flake','Marlboro','American Club','Editions','Lighter']},
  ],
};

// ── CSS injected once ──────────────────────────────────────────
(function injectStyles(){
  if(document.getElementById('cat-ui-styles')) return;
  var s = document.createElement('style');
  s.id = 'cat-ui-styles';
  s.textContent = `
/* ── HOME CATEGORY CARDS ── */
#hcats { display:flex; gap:10px; overflow-x:auto; padding:14px 14px 10px; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
#hcats::-webkit-scrollbar { display:none; }
.hcat-card {
  flex-shrink:0; display:flex; flex-direction:column; align-items:center;
  gap:7px; border:none; background:none; cursor:pointer; min-width:72px;
  -webkit-tap-highlight-color:transparent;
  transition:transform .18s cubic-bezier(.34,1.56,.64,1);
}
.hcat-card:active { transform:scale(.88); }
.hcat-icon-wrap {
  width:62px; height:62px; border-radius:20px;
  display:flex; align-items:center; justify-content:center;
  position:relative; overflow:hidden;
  box-shadow:0 6px 18px var(--sh,rgba(0,0,0,.18));
  transition:transform .2s, box-shadow .2s;
}
.hcat-card:active .hcat-icon-wrap { transform:scale(.92); }
.hcat-icon-wrap::after {
  content:''; position:absolute; inset:0;
  background:linear-gradient(180deg,rgba(255,255,255,.22) 0%,rgba(255,255,255,0) 60%);
  border-radius:inherit; pointer-events:none;
}
.hcat-emoji { font-size:30px; line-height:1; position:relative; z-index:1; filter:drop-shadow(0 2px 4px rgba(0,0,0,.25)); }
.hcat-lbl {
  font-size:10px; font-weight:700; color:var(--dark);
  text-align:center; line-height:1.3; width:72px;
  overflow:hidden; text-overflow:ellipsis;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
}

/* ── SIDEBAR CATEGORY ITEMS ── */
.csi-item {
  display:flex; flex-direction:column; align-items:center;
  gap:5px; padding:10px 4px 9px; cursor:pointer;
  border-bottom:1px solid rgba(0,0,0,.05);
  transition:background .18s; position:relative;
  -webkit-tap-highlight-color:transparent;
}
.csi-item::before {
  content:''; position:absolute; left:0; top:8px; bottom:8px;
  width:3px; border-radius:0 3px 3px 0;
  background:var(--g); transform:scaleY(0);
  transition:transform .22s cubic-bezier(.34,1.56,.64,1);
}
.csi-item.active::before { transform:scaleY(1); }
.csi-item.active { background:rgba(0,185,107,.07); }
.csi-icon-wrap {
  width:50px; height:50px; border-radius:16px;
  display:flex; align-items:center; justify-content:center;
  transition:all .22s cubic-bezier(.34,1.56,.64,1);
  position:relative; overflow:hidden;
}
.csi-icon-wrap::after {
  content:''; position:absolute; inset:0;
  background:linear-gradient(180deg,rgba(255,255,255,.2) 0%,rgba(255,255,255,0) 60%);
  border-radius:inherit; pointer-events:none;
}
.csi-item.active .csi-icon-wrap {
  transform:scale(1.08);
  box-shadow:0 4px 14px rgba(0,0,0,.2);
}
.csi-emoji { font-size:24px; line-height:1; position:relative; z-index:1; filter:drop-shadow(0 1px 3px rgba(0,0,0,.2)); }
.csi-lbl {
  font-size:9px; font-weight:700; color:#94a3b8;
  text-align:center; line-height:1.2; width:70px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  transition:color .18s;
}
.csi-item.active .csi-lbl { color:var(--g); font-weight:800; }

/* dark mode sidebar */
@media(prefers-color-scheme:dark){
  .csi-item { border-bottom-color:rgba(255,255,255,.05); }
  .csi-item.active { background:rgba(0,185,107,.12); }
  .hcat-lbl { color:var(--mid); }
}
  `;
  document.head.appendChild(s);
})();

// ── Home category cards ────────────────────────────────────────
function renderHCats() {
  var el = document.getElementById('hcats');
  if (!el) return;
  el.innerHTML = CATS_V2.map(function(c) {
    return '<button class="hcat-card" onclick="toCat(\'' + c.id + '\')" style="--sh:' + c.sh + '">'
      + '<div class="hcat-icon-wrap" style="background:' + c.g + ';box-shadow:0 6px 18px ' + c.sh + '">'
      + '<span class="hcat-emoji">' + c.e + '</span>'
      + '</div>'
      + '<span class="hcat-lbl">' + c.l + '</span>'
      + '</button>';
  }).join('');
}

// ── Sidebar renderer ───────────────────────────────────────────
function renderCatSidebar() {
  var sb = document.getElementById('cat-sidebar');
  if (!sb) return;
  var active = window.activecat || 'ALL';
  sb.innerHTML = CATS_V2.map(function(c) {
    var isActive = c.id === active;
    var bg = isActive ? c.g : 'rgba(0,0,0,.06)';
    return '<div class="csi-item' + (isActive ? ' active' : '') + '" onclick="setCat(\'' + c.id + '\')" id="csi-' + c.id + '">'
      + '<div class="csi-icon-wrap" style="background:' + bg + '">'
      + '<span class="csi-emoji">' + c.e + '</span>'
      + '</div>'
      + '<span class="csi-lbl">' + c.l + '</span>'
      + '</div>';
  }).join('');
  setTimeout(function() {
    var el = document.getElementById('csi-' + active);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, 80);
}

function renderCCats() {}

// ── Grid renderer ──────────────────────────────────────────────
function renderCGrid(cat) {
  var g = document.getElementById('cgrid');
  if (!g) return;
  var allVisible = window.getVisibleProducts && window.getVisibleProducts().length ? window.getVisibleProducts() : products;
  // Merge uncommon categories into the nearest visible tab
  var _catAlias = {
    EGGS: 'DAIRY', BAKERY: 'DAIRY',
    FLOURS: 'GRAINS',
    BEVERAGES: 'DRINKS',
    'DRY FRUITS': 'SNACKS',
    SUGAR: 'CONDIMENTS',
    PULSES: 'DALS',
    FROZEN: 'EASYCOOK',
    MILLETS: 'GRAINS',
    MASALAS: 'SPICES',
    MASALA: 'SPICES',
    PICKLE: 'PICKLES',
    CHOCOLATE: 'CHOCOLATES',
    ICECREAM: 'ICECREAMS',
    'ICE CREAM': 'ICECREAMS',
    BISCUITS: 'SNACKS',
    NOODLES: 'SNACKS',
    CHIPS: 'SNACKS',
    PAN: 'PANSHOP',
    SMOKE: 'PANSHOP',
    TOBACCO: 'PANSHOP',
  };

  // Sort: in-stock first, out-of-stock last
  function sortInStockFirst(arr) {
    return arr.slice().sort(function(a, b) {
      var aOos = a.outOfStock ? 1 : 0;
      var bOos = b.outOfStock ? 1 : 0;
      if (aOos !== bOos) return aOos - bOos;
      return (a.halfPrice || a.price || 0) - (b.halfPrice || b.price || 0);
    });
  }

  var list = cat === 'ALL'
    ? sortInStockFirst(allVisible)
    : sortInStockFirst(allVisible.filter(function(p){ return (_catAlias[p.category] || p.category) === cat; }));

  if (!list.length) {
    g.innerHTML = '<div class="empty"><div class="emj">\uD83D\uDD0D</div><h3>No products</h3><p>Try a different category</p></div>';
    return;
  }

  // ALL tab — group by category
  if (cat === 'ALL') {
    var html = '';
    CATS_V2.forEach(function(catInfo) {
      if (catInfo.id === 'ALL') return;
      var items = list.filter(function(p){ return (_catAlias[p.category] || p.category) === catInfo.id; });
      if (!items.length) return;
      var inStockCount = items.filter(function(p){ return !p.outOfStock; }).length;
      html += '<div class="cat-sec-hdr">'
            + '<span class="cat-sec-title">' + catInfo.e + ' ' + catInfo.l + '</span>'
            + '<span class="cat-sec-count">' + inStockCount + (inStockCount !== items.length ? ' / ' + items.length : '') + '</span></div>';
      html += '<div class="cgrid">' + items.map(function(p){ return mkFullCard(p); }).join('') + '</div>';
    });
    g.innerHTML = html;
    g.querySelectorAll('img[data-src]').forEach(function(img){ if(window.observeImg) window.observeImg(img); });
    return;
  }

  var catInfo = CATS_V2.find(function(c){ return c.id === cat; }) || CATS_V2[0];
  var subs = CAT_SUBS[cat];

  var inStockCount = list.filter(function(p){ return !p.outOfStock; }).length;
  var bannerCount = inStockCount === list.length
    ? list.length + ' items'
    : inStockCount + ' available · ' + (list.length - inStockCount) + ' out of stock';

  // Category banner
  var banner = '<div class="cat-banner" style="background:' + catInfo.g + '">'
    + '<span class="cat-banner-emoji">' + catInfo.e + '</span>'
    + '<div><div class="cat-banner-title">' + catInfo.l + '</div>'
    + '<div class="cat-banner-count">' + bannerCount + '</div></div>'
    + '</div>';

  if (!subs) {
    g.innerHTML = banner + '<div class="cgrid">' + list.map(function(p){ return mkFullCard(p); }).join('') + '</div>';
    g.querySelectorAll('img[data-src]').forEach(function(img){ if(window.observeImg) window.observeImg(img); });
    return;
  }

  var html = banner;
  var rendered = {};
  subs.forEach(function(sub) {
    var items = sub.kw.length
      ? list.filter(function(p){ return !rendered[p.id] && sub.kw.some(function(k){ return p.name.toLowerCase().includes(k.toLowerCase()); }); })
      : list.filter(function(p){ return !rendered[p.id]; });
    if (!items.length) return;
    items.forEach(function(p){ rendered[p.id] = true; });
    html += '<div class="cat-sec-hdr"><span class="cat-sec-title">' + sub.label + '</span>'
          + '<span class="cat-sec-count">' + items.length + '</span></div>';
    html += '<div class="cgrid">' + items.map(function(p){ return mkFullCard(p); }).join('') + '</div>';
  });
  var rest = list.filter(function(p){ return !rendered[p.id]; });
  if (rest.length) {
    html += '<div class="cat-sec-hdr"><span class="cat-sec-title">\u2728 More</span>'
          + '<span class="cat-sec-count">' + rest.length + '</span></div>';
    html += '<div class="cgrid">' + rest.map(function(p){ return mkFullCard(p); }).join('') + '</div>';
  }
  g.innerHTML = html;
  g.querySelectorAll('img[data-src]').forEach(function(img){ if(window.observeImg) window.observeImg(img); });
}

// ── Search ─────────────────────────────────────────────────────
function filterCat(q) {
  var sr = document.getElementById('cat-search-results');
  if (!q.trim()) {
    if (sr) sr.style.display = 'none';
    // If inside a shop, re-render shop products; else render normal catalog
    if (window._activeShopId && window._shopOverrideProducts) {
      var shop = (window._shopsCache || []).find(function(s){ return s.id === window._activeShopId; }) || {};
      if (window._renderShopProducts) window._renderShopProducts(window._shopOverrideProducts, shop);
    } else {
      renderCGrid(window.activecat || 'ALL');
    }
    return;
  }
  if (sr) sr.style.display = 'block';
  // Search ONLY shop products when inside a shop
  var searchPool = (window._activeShopId && window._shopOverrideProducts)
    ? window._shopOverrideProducts
    : (window._getProds ? window._getProds() : (window.getVisibleProducts && window.getVisibleProducts().length ? window.getVisibleProducts() : products));
  var res = searchPool.filter(function(p) {
    return (p.name||'').toLowerCase().includes(q.toLowerCase()) || ((p.teluguName||'').includes(q));
  });
  var sg = document.getElementById('cgrid-search');
  if (sg) sg.innerHTML = res.length
    ? res.map(function(p){ return mkFullCard(p); }).join('')
    : '<div class="empty"><div class="emj">\uD83D\uDE14</div><h3>No results for "' + q + '"</h3></div>';
}

function toCat(cat) {
  window.activecat = cat;
  showView('catalog');
  renderCatSidebar();
  renderCGrid(cat);
}
function setCat(cat) {
  window.activecat = cat;
  renderCatSidebar();
  renderCGrid(cat);
  var cc = document.getElementById('cat-content');
  if (cc) cc.scrollTop = 0;
}

// FIX #9: The old pattern captured window.showView at parse time (var _origShowView = window.showView)
// which created a fragile call chain — any future re-wrap or load-order change could break or loop it.
// Instead, we hook in via a flag so this extension runs exactly once per showView call, safely.
(function() {
  var _catalogHooked = false;
  function _hookCatalogOntoShowView() {
    if (_catalogHooked) return;
    var _orig = window.showView;
    if (typeof _orig !== 'function') { setTimeout(_hookCatalogOntoShowView, 50); return; }
    _catalogHooked = true;
    window.showView = function(v) {
      _orig(v);
      if (v === 'catalog') {
        renderCatSidebar();
        renderCGrid(window.activecat || 'ALL');
      }
    };
  }
  // Run after DOM is ready so window.showView from app-core is already defined
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _hookCatalogOntoShowView);
  } else {
    _hookCatalogOntoShowView();
  }
})();

Object.assign(window, { renderCatSidebar, renderHCats, renderCCats, renderCGrid, filterCat, toCat, setCat });
