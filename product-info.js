// ═══════════════════════════════════════════════════════
// NEKTA PRODUCT INFO DATABASE
// Health benefits, recipes, cutting options, nutrition
// ═══════════════════════════════════════════════════════

const PRODUCT_INFO = {
  // VEGETABLES
  1: { // Tomato
    emoji: '🍅',
    tagline: 'Farm-fresh, sun-ripened daily',
    origin: 'Local farms, Kothagudem region',
    freshness: '2–3 days at room temp, 5–7 days refrigerated',
    benefits: ['Rich in Vitamin C & lycopene', 'Boosts heart health', 'Great for skin glow', 'Antioxidant powerhouse', 'Lowers bad cholesterol'],
    nutrition: { cal: 18, protein: '0.9g', carbs: '3.9g', fiber: '1.2g', vitamins: 'C, K, B9' },
    recipes: ['Tomato Rasam', 'Tomato Rice', 'Tomato Curry', 'Tomato Chutney', 'Tomato Soup'],
    tips: 'Buy firm tomatoes. Ripen at room temperature, never refrigerate unripe ones.',
    inStock: true
  },
  4: { // Green Chilli
    emoji: '🌶️',
    tagline: 'Spicy & fresh, adds fire to every dish',
    origin: 'Local farms, Telangana',
    freshness: '5–7 days refrigerated',
    benefits: ['High in Vitamin C', 'Boosts metabolism', 'Natural pain reliever', 'Antimicrobial properties', 'Rich in antioxidants'],
    nutrition: { cal: 40, protein: '2g', carbs: '9g', fiber: '1.5g', vitamins: 'C, B6, A' },
    recipes: ['Green Chilli Pickle', 'Mirchi Bajji', 'Green Chilli Chutney', 'Stuffed Chilli'],
    tips: 'Store in a paper bag in the fridge. Cut stems off before storing.',
    inStock: true
  },
  5: { // Ladies Finger
    emoji: '🥒',
    tagline: 'Tender & fresh, perfect for curries',
    origin: 'Local farms, Kothagudem',
    freshness: '3–4 days refrigerated',
    benefits: ['High fiber content', 'Controls blood sugar', 'Rich in Vitamin K', 'Good for digestion', 'Low calorie vegetable'],
    nutrition: { cal: 33, protein: '1.9g', carbs: '7g', fiber: '3.2g', vitamins: 'C, K, B6' },
    recipes: ['Bendakaya Fry', 'Stuffed Bhindi', 'Bhindi Masala', 'Bhindi Raita'],
    tips: 'Pick small, firm okra. Avoid slimy ones.',
    inStock: true
  },
  21: { // Banana
    emoji: '🍌',
    tagline: 'Sweet Yelakki variety — loved by all',
    origin: 'Imported from Karnataka',
    freshness: '3–5 days at room temperature',
    benefits: ['Instant energy boost', 'Rich in potassium', 'Good for heart health', 'Aids digestion', 'Natural mood enhancer'],
    nutrition: { cal: 89, protein: '1.1g', carbs: '23g', fiber: '2.6g', vitamins: 'B6, C, B12' },
    recipes: ['Banana Milkshake', 'Banana Halwa', 'Banana Chips', 'Banana Smoothie'],
    tips: 'Store at room temperature. Do not refrigerate — skin turns black.',
    inStock: true
  },
  22: { // Apple
    emoji: '🍎',
    tagline: 'Crispy, fresh & sweet — daily essential',
    origin: 'Himachal Pradesh, India',
    freshness: '2–3 weeks refrigerated',
    benefits: ['Boosts immunity', 'Good for teeth', 'Reduces cholesterol', 'Antioxidant rich', 'Good for gut health'],
    nutrition: { cal: 52, protein: '0.3g', carbs: '14g', fiber: '2.4g', vitamins: 'C, K, B6' },
    recipes: ['Apple Juice', 'Apple Halwa', 'Apple Raita', 'Apple Salad'],
    tips: 'Keep refrigerated for longer freshness. Wash before eating.',
    inStock: true
  },
  // DAIRY
  400: { // Milk
    emoji: '🥛',
    tagline: 'Fresh full cream milk — delivered daily',
    origin: 'Local dairy farms, Kothagudem',
    freshness: 'Consume within 24 hours of opening',
    benefits: ['Complete protein source', 'Strong bones & teeth', 'Rich in calcium', 'Vitamin D source', 'Good for muscle recovery'],
    nutrition: { cal: 61, protein: '3.2g', carbs: '4.8g', fiber: '0g', vitamins: 'D, B12, A, B2' },
    recipes: ['Chai', 'Kheer', 'Milkshake', 'Paneer at home', 'Curd at home'],
    tips: 'Boil before drinking. Store in fridge after opening.',
    inStock: true
  },
  // NON-VEG
  1000: { // Chicken
    emoji: '🍗',
    tagline: 'Fresh cleaned chicken — ready to cook',
    origin: 'Local poultry, same day fresh',
    freshness: 'Cook within 24 hours. Do not refrigerate more than 2 days.',
    benefits: ['High protein', 'Low fat (skinless)', 'Rich in B vitamins', 'Good for muscle building', 'Easy to digest'],
    nutrition: { cal: 165, protein: '31g', carbs: '0g', fiber: '0g', vitamins: 'B3, B6, B12' },
    recipes: ['Chicken Biryani', 'Chicken Curry', 'Chicken Fry', 'Chicken 65', 'Butter Chicken'],
    cuttingOptions: ['Full Bird', 'Curry Cut (12 pcs)', 'Curry Cut (8 pcs)', 'Boneless', 'Boneless Strips', 'Keema (minced)', 'Leg Pieces Only', 'Breast Pieces Only'],
    tips: 'Always cook chicken to 75°C internal temperature. Marinate for best taste.',
    inStock: true
  },
  1001: { // Mutton
    emoji: '🐑',
    tagline: 'Fresh goat mutton — traditional cut',
    origin: 'Local goat farms, Kothagudem',
    freshness: 'Cook within 24 hours.',
    benefits: ['High protein content', 'Rich in iron', 'Zinc & selenium rich', 'Vitamin B12 source', 'Good for blood health'],
    nutrition: { cal: 294, protein: '25g', carbs: '0g', fiber: '0g', vitamins: 'B12, B3, B6' },
    recipes: ['Mutton Biryani', 'Mutton Curry', 'Mutton Fry', 'Mutton Keema', 'Mutton Soup'],
    cuttingOptions: ['Curry Cut (small)', 'Curry Cut (medium)', 'Curry Cut (large)', 'Boneless', 'Keema', 'Chops', 'Leg Piece', 'Brain & Liver'],
    tips: 'Pressure cook for tender meat. Marinate overnight for best biryani.',
    inStock: true
  },
  1003: { // Fish
    emoji: '🐟',
    tagline: 'Fresh river fish — cleaned & ready',
    origin: 'River Godavari, local catch',
    freshness: 'Cook within 4–6 hours of purchase.',
    benefits: ['Omega-3 fatty acids', 'Heart health booster', 'Brain development', 'Low in saturated fat', 'Rich in iodine'],
    nutrition: { cal: 128, protein: '26g', carbs: '0g', fiber: '0g', vitamins: 'D, B12, B3' },
    recipes: ['Fish Curry', 'Fish Fry', 'Fish Pulusu', 'Fish Biryani', 'Grilled Fish'],
    cuttingOptions: ['Full Fish (cleaned)', 'Curry Cut (with scales)', 'Curry Cut (descaled)', 'Fillet (boneless)', 'Steaks'],
    tips: 'Buy fish that smells fresh, not overly fishy. Cook immediately.',
    inStock: true
  },
};

// Get product info, return defaults if not found
function getProductInfo(id) {
  const base = PRODUCT_INFO[id];
  if (base) return base;
  // Generate smart defaults based on product category
  const p = products?.find(x => x.id === id);
  if (!p) return null;
  const catDefaults = {
    VEGETABLES: { emoji: '🥬', benefits: ['Rich in vitamins & minerals', 'High fiber content', 'Low calorie', 'Good for digestion', 'Antioxidant rich'], tips: 'Store in refrigerator for freshness.' },
    FRUITS: { emoji: '🍓', benefits: ['Natural sugars for energy', 'Rich in Vitamin C', 'Antioxidant properties', 'Good for immunity', 'High fiber'], tips: 'Best consumed fresh.' },
    DAIRY: { emoji: '🥛', benefits: ['Complete nutrition', 'Calcium rich', 'Protein source', 'Vitamin D', 'Good for bones'], tips: 'Refrigerate and consume before expiry.' },
    NONVEG: { emoji: '🍗', benefits: ['High protein', 'Essential amino acids', 'Iron rich', 'Vitamin B12', 'Zinc source'], tips: 'Cook thoroughly before consuming.', cuttingOptions: ['Normal Cut', 'Small Pieces', 'Large Pieces', 'Boneless'] },
    SNACKS: { emoji: '🍿', benefits: ['Quick energy', 'Great taste', 'Mood booster'], tips: 'Consume in moderation.' },
    GRAINS: { emoji: '🌾', benefits: ['Complex carbohydrates', 'Long lasting energy', 'High fiber', 'B vitamins', 'Mineral rich'], tips: 'Store in airtight container.' },
    SPICES: { emoji: '🌶️', benefits: ['Antimicrobial properties', 'Antioxidant rich', 'Aids digestion', 'Anti-inflammatory', 'Boosts metabolism'], tips: 'Store in cool, dry place away from sunlight.' },
    LEAFY: { emoji: '🥬', benefits: ['Iron rich', 'Folate source', 'Vitamin K', 'Low calorie', 'Detoxifying'], tips: 'Use within 2–3 days. Wash thoroughly.' },
    CHOCOLATES: { emoji: '🍫', benefits: ['Mood booster', 'Quick energy', 'Magnesium source', 'Antioxidants (dark)', 'Brain stimulant'], tips: 'Store in cool place.' },
    DRINKS: { emoji: '🥤', benefits: ['Hydration', 'Quick refresh', 'Energy boost'], tips: 'Best served chilled.' },
    COMBOS: { emoji: '🎁', benefits: ['Complete meal kit', 'Pre-measured portions', 'Time saving', 'Cost effective', 'Chef curated'], tips: 'Use fresh ingredients within 24–48 hours.' },
    EASYCOOK: { emoji: '🍳', benefits: ['Ready in minutes', 'Consistent taste', 'No prep needed', 'Convenient', 'Fresh ingredients'], tips: 'Follow package instructions.' },
    PERSONALCARE: { emoji: '💊', benefits: ['Personal hygiene', 'Health protection', 'Peace of mind', 'Quality assured', 'Dermatologist tested'], tips: 'Store as directed on package.' },
    PANSHOP: { emoji: '🏪', benefits: ['Convenience', 'Quality products'], tips: 'For adult use only.' },
  };
  const def = catDefaults[p.category] || { emoji: '📦', benefits: ['Quality assured', 'Fresh delivery'], tips: 'Store as recommended.' };
  return {
    emoji: def.emoji,
    tagline: `Fresh ${p.name} delivered to your door`,
    origin: 'Sourced locally in Kothagudem',
    freshness: 'As per product label',
    benefits: def.benefits,
    nutrition: null,
    recipes: [],
    cuttingOptions: def.cuttingOptions || null,
    tips: def.tips,
    inStock: !p.outOfStock,
  };
}

// Product reviews (stored in localStorage + Firebase)
function getProductReviews(id) {
  try { return JSON.parse(localStorage.getItem(`nk_rev_${id}`) || '[]'); } catch { return []; }
}
function saveProductReview(id, review) {
  const reviews = getProductReviews(id);
  reviews.unshift({ ...review, ts: new Date().toISOString(), id: Date.now() });
  localStorage.setItem(`nk_rev_${id}`, JSON.stringify(reviews.slice(0, 20)));
  // Also save to Firebase
  if (window.db) {
    window.db.collection('reviews').add({ productId: id, ...review, createdAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});
  }
}

