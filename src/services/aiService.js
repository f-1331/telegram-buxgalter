const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');
const { getTodayString } = require('../utils/formatters');
const { CATEGORIES, normalizeCategory } = require('../utils/categories');

let genAI = null;
if (config.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
}

/**
 * Builds the AI system prompt for expense extraction in Uzbek
 */
function buildPrompt(todayDate) {
  const categoryNames = Object.keys(CATEGORIES).map(c => `"${c}"`).join(', ');

  return `Siz shaxsiy buxgalter AI assistentisiz.
Foydalanuvchining xabarini (ovozli yoki matnli) tushuning va undagi barcha xarajatlarni aniqlang.
Bugungi sana: ${todayDate}.

Foydalanuvchi o'zbek tilida (yoki ruscha aralash) gapirishi mumkin.
Misollar:
- "Bugun taksiga 25 ming, tushlikka 60 ming ishlatdim" -> 2 ta xarajat: Taksi (25 000, Transport), Tushlik (60 000, Oziq-ovqat va Kafe).
- "Kecha bozorlik qildim 250 ming, dorixonadan 45 minglik dori oldim" -> 2 ta xarajat kechagi sana bilan.
- "1.5 millionga kontrakt to'ladim" -> 1 ta xarajat (1 500 000, Ta'lim va Kitoblar).
- "Mashinaga 120 ming benzin quydim" -> 1 ta xarajat (120 000, Transport).
- "Oyligim 5 million tushdi" -> Bu daromad, xarajat emas! Agar xarajat bo'lmasa, expenses: [].

Ruxsat etilgan kategoriyalar:
[${categoryNames}]

QOIDALAR:
1. "ming" = 1 000 (masalan, "25 ming" = 25000, "150 ming" = 150000)
2. "mln" yoki "million" = 1 000 000 (masalan, "1.5 mln" = 1500000)
3. Sana: Agar "kecha" desa, ${todayDate} sanasidan 1 kun oldingi sana. "Bugun" desa, ${todayDate}. Ko'rsatilmagan bo'lsa ${todayDate}.
4. Har bir xarajat miqdorini aniq INTEGER raqamda yozing.

Javobni FAQAT quyidagi JSON formatida qaytaring, boshqa hech qanday so'z yoki markdown belgisi qo'shmang:
{
  "transcription": "Xabarning to'liq matni",
  "has_expenses": true,
  "expenses": [
    {
      "amount": 25000,
      "category": "Transport",
      "description": "Taksi",
      "date": "${todayDate}"
    }
  ]
}

Agar xabarda umuman xarajat bo'lmasa (masalan: salom, hol-ahvol so'rash, rahmat):
{
  "transcription": "Xabarning matni",
  "has_expenses": false,
  "expenses": []
}`;
}

/**
 * Clean and parse JSON response from Gemini
 */
function cleanAndParseJSON(rawText) {
  let cleaned = rawText.trim();
  // Remove markdown fences ```json ... ```
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');
  cleaned = cleaned.trim();

  // Find first { and last }
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }

  const parsed = JSON.parse(cleaned);

  // Normalize categories and numbers
  if (parsed.expenses && Array.isArray(parsed.expenses)) {
    parsed.expenses = parsed.expenses.map(item => ({
      amount: Math.round(Number(item.amount) || 0),
      category: normalizeCategory(item.category),
      description: item.description || item.category || 'Xarajat',
      date: item.date || getTodayString()
    })).filter(item => item.amount > 0);

    parsed.has_expenses = parsed.expenses.length > 0;
  } else {
    parsed.expenses = [];
    parsed.has_expenses = false;
  }

  return parsed;
}

/**
 * Process voice audio buffer using Gemini AI
 */
async function processVoiceAudio(audioBuffer, mimeType = 'audio/ogg') {
  if (!config.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY sozlanmagan. Iltimos, .env fayliga GEMINI_API_KEY ni kiriting.');
  }

  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  }

  const todayStr = getTodayString();
  const prompt = buildPrompt(todayStr);
  const base64Audio = audioBuffer.toString('base64');

  const modelsToTry = [
    config.GEMINI_MODEL || 'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
  ];

  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Audio
          }
        },
        { text: prompt }
      ]);

      const responseText = result.response.text();
      return cleanAndParseJSON(responseText);
    } catch (err) {
      console.warn(`[AI Warning] Model ${modelName} bilan xatolik:`, err.message);
      lastError = err;
      // Continue to next model fallback
    }
  }

  throw new Error(`AI ovozni tahlil qila olmadi: ${lastError ? lastError.message : 'Noma\'lum xatolik'}`);
}

/**
 * Process text input using Gemini AI (with offline rule-based fallback)
 */
async function processTextMessage(text) {
  const todayStr = getTodayString();

  // If Gemini API is available, use it for best contextual parsing
  if (config.GEMINI_API_KEY) {
    if (!genAI) {
      genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
    }

    const prompt = `${buildPrompt(todayStr)}\n\nFoydalanuvchi matni: "${text}"`;
    const modelsToTry = [
      config.GEMINI_MODEL || 'gemini-2.0-flash',
      'gemini-1.5-flash'
    ];

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        return cleanAndParseJSON(responseText);
      } catch (err) {
        console.warn(`[AI Warning] Matn tahlilida ${modelName} xatolik:`, err.message);
      }
    }
  }

  // Fallback: Rule-based regex parser for Uzbek expenses
  return ruleBasedUzbekParser(text, todayStr);
}

/**
 * Rule-based fallback parser for Uzbek text
 * Handles patterns like "taksi 25 ming, tushlik 60000"
 */
function ruleBasedUzbekParser(text, todayStr) {
  const expenses = [];
  const lower = text.toLowerCase();

  // Split text by commas, newlines, "va", "keyin", "hamda"
  const segments = lower.split(/[,;\n+]|\s+va\s+|\s+keyin\s+|\s+hamda\s+/);

  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;

    // Match numbers like "25 ming", "25ming", "1.5 mln", "60000", "50 000"
    const numberMatch = trimmed.match(/(\d+(?:[.,]\d+)?)\s*(ming|mln|million|k|so['`]?m)?/i);
    if (!numberMatch) continue;

    let baseNum = parseFloat(numberMatch[1].replace(',', '.'));
    const unit = (numberMatch[2] || '').toLowerCase();

    if (unit.startsWith('ming') || unit === 'k') {
      baseNum *= 1000;
    } else if (unit.startsWith('mln') || unit.startsWith('million')) {
      baseNum *= 1000000;
    } else if (baseNum < 1000 && !unit.includes('so')) {
      // Often people say "taksiga 25 berdim" meaning 25 thousand
      baseNum *= 1000;
    }

    const amount = Math.round(baseNum);
    if (amount <= 0) continue;

    // Detect category by keywords
    let detectedCategory = 'Boshqa';
    let description = trimmed
      .replace(numberMatch[0], '')
      .replace(/ga\b|dan\b|da\b|uchun\b|ishlatdim\b|ketdi\b|to'ladim\b|berdim\b|qildim\b|oldim\b/gi, '')
      .trim();

    // Capitalize description
    if (description) {
      description = description.charAt(0).toUpperCase() + description.slice(1);
    } else {
      description = 'Xarajat';
    }

    for (const [catName, catData] of Object.entries(CATEGORIES)) {
      if (catData.keywords.some(kw => trimmed.includes(kw))) {
        detectedCategory = catName;
        if (description === 'Xarajat') {
          description = catName;
        }
        break;
      }
    }

    expenses.push({
      amount,
      category: detectedCategory,
      description: description || detectedCategory,
      date: todayStr
    });
  }

  return {
    transcription: text,
    has_expenses: expenses.length > 0,
    expenses
  };
}

/**
 * Generate personal AI Financial Advice based on user's spending data
 */
async function getAIFinancialAdvice(userSummary, userName = 'Foydalanuvchi') {
  const { totalMonth, categories, budget, recentExpenses } = userSummary;

  if (totalMonth === 0) {
    return `👋 <b>Assalomu alaykum, ${userName}!</b>\n\n` +
      `Sizda ushbu oy uchun hali xarajatlar mavjud emas. Ovozli yoki matnli xabarlar orqali bir nechta xarajatlaringizni yuboring, shunda men xarajatlaringizni chuqur tahlil qilib, shaxsiy moliyaviy maslahat va tejash sirlarini taqdim etaman! 💡`;
  }

  // Format category text for prompt
  const catText = categories.map(c => `- ${c.category}: ${c.total_amount.toLocaleString('uz-UZ')} so'm (${c.percentage}%)`).join('\n');
  const budgetText = budget > 0 ? `Belgilangan oylik byudjet: ${budget.toLocaleString('uz-UZ')} so'm` : 'Oylik byudjet hali belgilanmagan.';

  // If Gemini API is configured, use Gemini for deep human-like financial analysis
  if (config.GEMINI_API_KEY) {
    if (!genAI) {
      genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
    }

    const prompt = `
Siz o'zbek tilida so'zlashuvchi eng kuchli, muloyim va professional Shaxsiy AI Moliyaviy Maslahatchisiz (CFO).
Foydalanuvchi: ${userName}.

Ushbu oydagi uning moliyaviy holati:
- Jami sarflangan summa: ${totalMonth.toLocaleString('uz-UZ')} so'm
- ${budgetText}
- Kategoriyalar bo'yicha xarajatlar:
${catText}

Vazifangiz:
Foydalanuvchiga Telegram xabari formatida (HTML teglari: <b>, <i>, <code> bilan) qisqa, tushunarli va juda foydali shaxsiy maslahat bering:
1. Eng ko'p pul qayerga ketayotganini ko'rsating.
2. Aniq 2-3 ta amaliy tejash maslahati bering (aynan uning xarajatlariga moslab).
3. Moliyaviy intizom bo'yicha motivatsiya va qisqa xulosa qiling.

Javobingiz rasmiyatchilikdan yiroq, do'stona, samimiy va o'zbekona tilda bo'lsin.
`;

    const modelsToTry = [config.GEMINI_MODEL || 'gemini-2.0-flash', 'gemini-1.5-flash'];
    for (const m of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: m });
        const res = await model.generateContent(prompt);
        return res.response.text();
      } catch (err) {
        console.warn(`[AI Advisor Error] ${m}:`, err.message);
      }
    }
  }

  // Smart fallback financial advisor
  const topCat = categories[0];
  let advice = `💡 <b>AI MOLIYAVIY MASLAHATCHI TAHLILI:</b>\n\n`;
  advice += `Hurmatli <b>${userName}</b>, sizning ushbu oydagi xarajatlaringiz tahlili:\n\n`;
  advice += `📊 <b>Jami xarajat:</b> ${totalMonth.toLocaleString('uz-UZ')} so'm\n`;
  if (topCat) {
    advice += `⚠️ <b>Eng katta sarf sohasi:</b> ${topCat.category} (${topCat.total_amount.toLocaleString('uz-UZ')} so'm — <i>${topCat.percentage}%</i>)\n\n`;
  }

  advice += `🎯 <b>Amaliy tavsiyalar:</b>\n`;
  if (topCat && topCat.category.includes('Transport')) {
    advice += `• Taksi xarajatlarini rejalashtirish yoki qisqa masofalarda piyoda yurish orqali oyiga 15-20% gacha tejash mumkin.\n`;
  } else if (topCat && topCat.category.includes('Kafe')) {
    advice += `• Tashqarida ovqatlanish byudjetning katta qismini olmoqda. Tushliklarni oldindan rejalashtirish tejamkorlik beradi.\n`;
  } else {
    advice += `• Eng katta xarajatlaringizni haftalik limitlarga ajratib oling.\n`;
  }
  advice += `• <b>50/30/20 qoidasini</b> qo'llang: 50% zaruriy ehtiyojlar, 30% hordiq/istaklar, 20% jamg'arma.\n\n`;
  advice += `✨ <i>Kichik tejamkorliklar katta boylikning poydevoridir!</i>`;

  return advice;
}

/**
 * Calculate month-end spending forecast and budget warning
 */
function calculateForecast(userSummary) {
  const { totalMonth, budget } = userSummary;
  const now = new Date();
  const currentDay = now.getDate();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const totalDaysInMonth = new Date(year, month, 0).getDate();
  const remainingDays = totalDaysInMonth - currentDay;

  const avgDaily = currentDay > 0 ? Math.round(totalMonth / currentDay) : totalMonth;
  const projectedTotal = Math.round(avgDaily * totalDaysInMonth);

  let budgetPct = 0;
  let isExceeded = false;
  let isClose = false;

  if (budget > 0) {
    budgetPct = Math.round((totalMonth / budget) * 100);
    isExceeded = totalMonth >= budget;
    isClose = budgetPct >= 80 && !isExceeded;
  }

  return {
    currentDay,
    totalDaysInMonth,
    remainingDays,
    avgDaily,
    totalMonth,
    projectedTotal,
    budget,
    budgetPct,
    isExceeded,
    isClose
  };
}

/**
 * Handle conversational financial queries with AI
 */
async function chatWithFinancialAI(userMessage, userSummary, userName = 'Foydalanuvchi') {
  if (config.GEMINI_API_KEY) {
    if (!genAI) {
      genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
    }

    const { totalMonth, budget, categories } = userSummary;
    const catText = categories.map(c => `${c.category}: ${c.total_amount.toLocaleString('uz-UZ')} so'm`).join(', ');

    const prompt = `
Siz o'zbek tilida so'zlashuvchi samimiy, aqlli Shaxsiy Moliyaviy Buxgalter va Maslahatchisiz.
Foydalanuvchi: ${userName}.
Foydalanuvchining bu oydagi xarajatlari: Jami ${totalMonth.toLocaleString('uz-UZ')} so'm. Kategoriyalar: ${catText || 'Hali yo\'q'}.

Foydalanuvchi savoli: "${userMessage}"

Qisqa, do'stona, tushunarli va maslahatga boy qilib o'zbek tilida javob bering (HTML teglari bilan).
`;

    try {
      const model = genAI.getGenerativeModel({ model: config.GEMINI_MODEL || 'gemini-2.0-flash' });
      const res = await model.generateContent(prompt);
      return res.response.text();
    } catch (err) {
      console.warn('[AI Chat Error]:', err.message);
    }
  }

  return `🤖 <b>Shaxsiy AI Maslahatchi:</b>\n\nMoliyaviy intizomni saqlash uchun har kuni xarajatlaringizni yozib boring va oylik byudjetingizning kamida 10-20% qismini zaxira jamg'armasiga ajrating! 💰`;
}

module.exports = {
  processVoiceAudio,
  processTextMessage,
  getAIFinancialAdvice,
  calculateForecast,
  chatWithFinancialAI
};
