const CATEGORIES = {
  'Transport': {
    name: 'Transport',
    emoji: '🚕',
    color: '#3B82F6', // Blue
    keywords: ['taksi', 'taxi', 'metro', 'benzin', 'metan', 'propan', 'avtobus', 'yolkira', "yo'lkira", 'moy', 'moyka', 'zapchast', 'parkovka', 'yandex', 'indrive', 'mashina']
  },
  'Oziq-ovqat va Kafe': {
    name: 'Oziq-ovqat va Kafe',
    emoji: '🍔',
    color: '#EF4444', // Red
    keywords: ['tushlik', 'obed', 'ovqat', 'kafe', 'restoran', 'choyxona', 'kofe', 'nonushta', 'shashlik', 'lavash', 'pizza', 'burger', 'fastfud', 'fastfood', 'osh', 'somsa', 'lagmon', "lag'mon"]
  },
  'Bozor va Supermarket': {
    name: 'Bozor va Supermarket',
    emoji: '🛒',
    color: '#10B981', // Emerald green
    keywords: ['bozor', 'bozorlik', 'supermarket', 'korzinka', 'makro', 'havas', 'gosht', "go'sht", 'kartoshka', 'sabzi', 'meva', 'sabzavot', 'non', 'un', 'yog', "yog'", 'sut', 'tuxum', 'shirinlik', 'oziq-ovqat']
  },
  'Kommunal va Aloqa': {
    name: 'Kommunal va Aloqa',
    emoji: '💡',
    color: '#F59E0B', // Amber
    keywords: ['svet', 'elektr', 'gaz', 'suv', 'otopleniye', 'chiqindi', 'internet', 'wifi', 'ucell', 'beeline', 'mobiuz', 'uztelecom', 'paynet', 'telefon', 'balans']
  },
  'Salomatlik va Dorixona': {
    name: 'Salomatlik va Dorixona',
    emoji: '💊',
    color: '#EC4899', // Pink
    keywords: ['dori', 'apteka', 'dorixona', 'shifokor', 'vrach', 'doktor', 'stomatolog', 'klinika', 'tish', 'ukol', 'analiz', 'kasalxona', 'rentgen']
  },
  'Kiyim va Xaridlar': {
    name: 'Kiyim va Xaridlar',
    emoji: '🛍',
    color: '#8B5CF6', // Purple
    keywords: ['kiyim', 'shim', 'koylak', "ko'ylak", 'poyabzal', 'tufli', 'krossovka', 'kurtka', 'sumka', 'soat', 'texnika', 'telefon', 'gadjet', 'xarid', 'xaridlar']
  },
  'Ta\'lim va Kitoblar': {
    name: 'Ta\'lim va Kitoblar',
    emoji: '🎓',
    color: '#06B6D4', // Cyan
    keywords: ['kurs', 'uqish', "o'qish", 'kontrakt', 'dars', 'repetitor', 'kitob', 'daftar', 'maktab', 'universitet', 'institut', 'kurslar']
  },
  'Hordiq va O\'yin-kulgi': {
    name: 'Hordiq va O\'yin-kulgi',
    emoji: '🎮',
    color: '#F97316', // Orange
    keywords: ['kino', 'teatr', 'konsert', 'istirohat', 'sayohat', 'dam', 'basseyn', 'bowling', 'oyin', "o'yin", 'ps', 'playstation', 'klub']
  },
  'Ehson va Sovg\'alar': {
    name: 'Ehson va Sovg\'alar',
    emoji: '🎁',
    color: '#84CC16', // Lime
    keywords: ['ehson', 'sadaqa', 'xayriya', 'toyona', "to'yona", 'sovga', "sovg'a", 'hadya', 'qarindosh']
  },
  'Uy va Ro\'zg\'or': {
    name: 'Uy va Ro\'zg\'or',
    emoji: '🏠',
    color: '#14B8A6', // Teal
    keywords: ['mebel', 'gilam', 'idish', 'tamir', "ta'mir", 'remont', 'tozalash', 'usta', 'chiroq', 'roboruk', 'rozgor', "ro'zg'or"]
  },
  'Boshqa': {
    name: 'Boshqa',
    emoji: '📦',
    color: '#6B7280', // Gray
    keywords: []
  }
};

function getCategoryEmoji(catName) {
  if (!catName) return '📦';
  for (const [key, val] of Object.entries(CATEGORIES)) {
    if (key.toLowerCase() === catName.toLowerCase() || catName.toLowerCase().includes(key.toLowerCase())) {
      return val.emoji;
    }
  }
  return '📦';
}

function getCategoryColor(catName) {
  if (!catName) return '#6B7280';
  for (const [key, val] of Object.entries(CATEGORIES)) {
    if (key.toLowerCase() === catName.toLowerCase() || catName.toLowerCase().includes(key.toLowerCase())) {
      return val.color;
    }
  }
  return '#6B7280';
}

function normalizeCategory(catName) {
  if (!catName) return 'Boshqa';
  const clean = catName.trim();
  for (const key of Object.keys(CATEGORIES)) {
    if (clean.toLowerCase() === key.toLowerCase() || clean.toLowerCase().includes(key.toLowerCase())) {
      return key;
    }
  }
  return 'Boshqa';
}

module.exports = {
  CATEGORIES,
  getCategoryEmoji,
  getCategoryColor,
  normalizeCategory
};
