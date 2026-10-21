const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');
const { getTodayString, normalizeCurrencyAmounts } = require('../utils/formatters');
const { CATEGORIES, normalizeCategory } = require('../utils/categories');

let genAI = null;
if (config.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
}

/**
 * Executes a promise with a timeout limit (prevents hangs during API spikes)
 */
function withTimeout(promise, ms = 12000, errorMsg = 'Gemini so\'rovi vaqti tugadi') {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

/**
 * Builds the AI system prompt for expense, income and debt extraction in Uzbek
 */
function buildPrompt(todayDate) {
  const categoryNames = Object.keys(CATEGORIES).map(c => `"${c}"`).join(', ');

  return `Siz shaxsiy buxgalter AI assistentisiz.
Foydalanuvchining xabarini (ovozli yoki matnli) tushuning va undagi barcha xarajatlar, daromadlar va qarzlarni aniqlang.
Bugungi sana: ${todayDate}.

Foydalanuvchi o'zbek tilida (yoki ruscha aralash) gapirishi mumkin.
Misollar:
- "Bugun taksiga 25 ming, tushlikka 60 ming ishlatdim" -> 2 ta xarajat (type: "expense"): Taksi (25000, Transport), Tushlik (60000, Oziq-ovqat va Kafe).
- "Oyligim 5 million tushdi, keshbekdan 50 ming oldim" -> 2 ta daromad (type: "income"): Oylik (5000000, Oylik va Ish haqi), Keshbek (50000, Keshbek va Mukofot).
- "Akromga 150 ming qarz berdim" -> Qarz (debts): person: "Akrom", amount: 150000, type: "lend".
- "Sobirdan 200 ming qarz oldim" -> Qarz (debts): person: "Sobir", amount: 200000, type: "borrow".
- "15 dollar benzinga berdim" -> 1 USD ≈ 12850 so'm, amount: 192750 so'm (Transport, expense).

Ruxsat etilgan kategoriyalar:
[${categoryNames}]

QOIDALAR:
1. "ming" = 1 000 (masalan, "25 ming" = 25000, "150 ming" = 150000)
2. "mln" yoki "million" = 1 000 000 (masalan, "1.5 mln" = 1500000)
3. "dollar" / "$" = 12 850 so'm, "rubl" = 135 so'm
4. Har bir element uchun type: "expense" (chiqim) yoki "income" (kirim).
5. Har bir miqdorni aniq INTEGER raqamda yozing.

Javobni FAQAT quyidagi toza JSON formatida qaytaring, boshqa hech qanday so'z yoki markdown belgisi (\`\`\`json) qo'shmang:
{
  "transcription": "Xabarning to'liq matni",
  "has_expenses": true,
  "expenses": [
    {
      "amount": 25000,
      "type": "expense",
      "category": "Transport",
      "description": "Taksi",
      "date": "${todayDate}"
    }
  ],
  "debts": []
}

Agar xabarda umuman xarajat yoki daromad bo'lmasa (masalan: salom, hol-ahvol so'rash):
{
  "transcription": "Xabarning matni",
  "has_expenses": false,
  "expenses": [],
  "debts": []
}`;
}

/**
 * Clean and robustly parse JSON response from Gemini
 */
function cleanAndParseJSON(rawText) {
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }

  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    // Fallback: try relaxed parsing or regex extraction
    console.warn('[JSON Parse Warning]:', err.message);
    const amountMatch = cleaned.match(/"amount":\s*(\d+)/);
    if (amountMatch) {
      parsed = {
        transcription: 'Ovozli xabar',
        has_expenses: true,
        expenses: [{
          amount: parseInt(amountMatch[1], 10),
          type: 'expense',
          category: 'Boshqa',
          description: 'Xarajat',
          date: getTodayString()
        }],
        debts: []
      };
    } else {
      parsed = { transcription: '', has_expenses: false, expenses: [], debts: [] };
    }
  }

  // Normalize entries
  if (parsed.expenses && Array.isArray(parsed.expenses)) {
    parsed.expenses = parsed.expenses.map(item => ({
      amount: Math.round(Number(item.amount) || 0),
      type: item.type === 'income' ? 'income' : 'expense',
      category: normalizeCategory(item.category, item.type),
      description: item.description || item.category || (item.type === 'income' ? 'Daromad' : 'Xarajat'),
      date: item.date || getTodayString()
    })).filter(item => item.amount > 0);

    parsed.has_expenses = parsed.expenses.length > 0;
  } else {
    parsed.expenses = [];
    parsed.has_expenses = false;
  }

  // Normalize debts
  if (parsed.debts && Array.isArray(parsed.debts)) {
    parsed.debts = parsed.debts.map(d => ({
      personName: d.person || d.personName || 'Noma\'lum',
      amount: Math.round(Number(d.amount) || 0),
      type: d.type === 'borrow' ? 'borrow' : 'lend',
      description: d.description || ''
    })).filter(d => d.amount > 0);
  } else {
    parsed.debts = [];
  }

  return parsed;
}

/**
 * Process voice / video audio buffer using Gemini AI
 */
async function processVoiceAudio(audioBuffer, mimeType = 'audio/ogg') {
  const apiKey = config.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'none' || apiKey.includes('GEMINI_API_KALITI')) {
    throw new Error('GEMINI_API_KEY sozlanmagan. Iltimos, API kalitni kiriting.');
  }

  if (!genAI) {
    genAI = new GoogleGenerativeAI(apiKey);
  }

  // Clean MIME type (Telegram may send 'audio/ogg; codecs=opus')
  let cleanMimeType = 'audio/ogg';
  if (mimeType) {
    if (mimeType.includes('ogg') || mimeType.includes('oga') || mimeType.includes('opus')) {
      cleanMimeType = 'audio/ogg';
    } else if (mimeType.includes('mp3')) {
      cleanMimeType = 'audio/mp3';
    } else if (mimeType.includes('wav')) {
      cleanMimeType = 'audio/wav';
    } else if (mimeType.includes('mp4') || mimeType.includes('video')) {
      cleanMimeType = 'video/mp4';
    } else {
      cleanMimeType = mimeType.split(';')[0].trim();
    }
  }

  const todayStr = getTodayString();
  const prompt = buildPrompt(todayStr);
  const base64Audio = audioBuffer.toString('base64');

  const modelsToTry = [
    config.GEMINI_MODEL || 'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash',
    'gemini-flash-latest'
  ];

  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await withTimeout(
        model.generateContent([
          {
            inlineData: {
              mimeType: cleanMimeType,
              data: base64Audio
            }
          },
          { text: prompt }
        ]),
        14000,
        `Model ${modelName} ovozni tahlil qilishda javob bermadi (14s timeout)`
      );

      const responseText = result.response.text();
      return cleanAndParseJSON(responseText);
    } catch (err) {
      console.warn(`[AI Audio Warning] Model ${modelName} bilan xatolik:`, err.message);
      lastError = err;
      await new Promise(r => setTimeout(r, 600));
    }
  }

  throw new Error(`AI ovozni tahlil qila olmadi: ${lastError ? lastError.message : 'Noma\'lum xatolik'}`);
}

/**
 * Process text input using Fast Local Engine first, and Gemini AI for complex questions
 */
async function processTextMessage(text) {
  const todayStr = getTodayString();
  const preprocessedText = normalizeCurrencyAmounts(text);

  // 1. FAST LOCAL ENGINE FIRST (runs in 0.0005 seconds!)
  // If it finds clear expenses/income/debts, return instantly without ANY network lag!
  const localResult = ruleBasedUzbekParser(preprocessedText, todayStr);
  if (localResult.has_expenses && (localResult.expenses.length > 0 || localResult.debts.length > 0)) {
    return localResult;
  }

  // 2. Only if local parser didn't find clear expenses/debts, try Gemini with 3.5s timeout:
  const apiKey = config.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'none' && !apiKey.includes('GEMINI_API_KALITI')) {
    if (!genAI) {
      genAI = new GoogleGenerativeAI(apiKey);
    }

    const prompt = `${buildPrompt(todayStr)}\n\nFoydalanuvchi matni: "${preprocessedText}"`;
    const modelsToTry = [
      'gemini-3.5-flash-lite',
      config.GEMINI_MODEL || 'gemini-3.5-flash',
      'gemini-flash-lite-latest'
    ];

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await withTimeout(
          model.generateContent(prompt),
          3500,
          `Model ${modelName} timeout`
        );
        const responseText = result.response.text();
        return cleanAndParseJSON(responseText);
      } catch (err) {
        // Continue to fallback
      }
    }
  }

  // Fallback: Return local result
  return localResult;
}

/**
 * Rule-based ultra-fast parser for Uzbek text
 */
function ruleBasedUzbekParser(text, todayStr) {
  const expenses = [];
  const debts = [];
  
  // Normalize spaced numbers like "5 000 000" into "5000000" for seamless regex parsing
  const cleanSpaced = text.replace(/(\d{1,3})\s+(\d{3})(?:\s+(\d{3}))?/g, (m, g1, g2, g3) => {
    return g3 ? `${g1}${g2}${g3}` : `${g1}${g2}`;
  });
  const lower = cleanSpaced.toLowerCase();

  // Debt detection: "Aliga 100 ming qarz berdim" or "Sobirdan 50 ming qarz oldim"
  const debtLendMatch = lower.match(/(.+?)(?:ga|dan)?\s+(\d+(?:[.,]\d+)?\s*(?:ming|mln|million|k|m)?)\s+(?:so['`]?m\s+)?qarz\s+(berdim|berildi)/i);
  if (debtLendMatch) {
    const person = debtLendMatch[1].replace(/bugun|kecha/gi, '').trim();
    const amt = parseUzbekNumber(debtLendMatch[2]);
    if (amt > 0) {
      debts.push({
        personName: person.charAt(0).toUpperCase() + person.slice(1) || 'Tanish',
        amount: amt,
        type: 'lend',
        description: 'Qarz berildi'
      });
    }
  }

  const debtBorrowMatch = lower.match(/(.+?)(?:dan)?\s+(\d+(?:[.,]\d+)?\s*(?:ming|mln|million|k|m)?)\s+(?:so['`]?m\s+)?qarz\s+(oldim|olindi)/i);
  if (debtBorrowMatch) {
    const person = debtBorrowMatch[1].replace(/bugun|kecha/gi, '').trim();
    const amt = parseUzbekNumber(debtBorrowMatch[2]);
    if (amt > 0) {
      debts.push({
        personName: person.charAt(0).toUpperCase() + person.slice(1) || 'Tanish',
        amount: amt,
        type: 'borrow',
        description: 'Qarz olindi'
      });
    }
  }

  // Split text by commas, newlines, "va", "keyin", "hamda"
  const segments = lower.split(/[,;\n+]|\s+va\s+|\s+keyin\s+|\s+hamda\s+/);

  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    if (trimmed.includes('qarz berdim') || trimmed.includes('qarz oldim')) continue;

    const numberMatch = trimmed.match(/(\d+(?:[.,]\d+)?)\s*(ming|mln|million|k|m|so['`]?m)?/i);
    if (!numberMatch) continue;

    const amount = parseUzbekNumber(numberMatch[0]);
    if (amount <= 0) continue;

    // Detect if this is income (Kirim)
    const isIncome = /oylik|maosh|zarplata|avans|ish haqi|tushdi|tushum|daromad|foyda|ishladim|keshbek|mukofot|frilans|savdo|kirim/i.test(trimmed);
    const entryType = isIncome ? 'income' : 'expense';

    let detectedCategory = isIncome ? 'Boshqa daromad' : 'Boshqa';
    if (isIncome) {
      if (/oylik|maosh|zarplata|avans|ish haqi|premiya/i.test(trimmed)) {
        detectedCategory = 'Oylik va Ish haqi';
      } else if (/savdo|biznes|dokon|do'kon/i.test(trimmed)) {
        detectedCategory = 'Biznes va Savdo';
      } else if (/frilans|mijoz|zakaz|xizmat/i.test(trimmed)) {
        detectedCategory = 'Frilans va Xizmatlar';
      } else if (/keshbek|mukofot|bonus/i.test(trimmed)) {
        detectedCategory = 'Keshbek va Mukofot';
      } else if (/qarz qaytdi|qarzimni qaytardi/i.test(trimmed)) {
        detectedCategory = 'Qarz qaytishi';
      } else {
        detectedCategory = 'Boshqa daromad';
      }
    } else {
      for (const [catName, catData] of Object.entries(CATEGORIES)) {
        if (catData.keywords.some(kw => trimmed.includes(kw))) {
          detectedCategory = catName;
          break;
        }
      }
    }

    let description = trimmed
      .replace(numberMatch[0], '')
      .replace(/ga\b|dan\b|da\b|uchun\b|ishlatdim\b|ketdi\b|to'ladim\b|berdim\b|qildim\b|oldim\b|tushdi\b|kiritish\b|kiritdim\b|yoz\b/gi, '')
      .trim();

    if (description) {
      description = description.charAt(0).toUpperCase() + description.slice(1);
    } else {
      description = isIncome ? 'Oylik daromad' : 'Xarajat';
    }

    expenses.push({
      amount,
      type: entryType,
      category: detectedCategory,
      description: description || detectedCategory,
      date: todayStr
    });
  }

  return {
    transcription: text,
    has_expenses: expenses.length > 0 || debts.length > 0,
    expenses,
    debts
  };
}

/**
 * Helper to parse Uzbek numerical slang into integer
 */
function parseUzbekNumber(str) {
  if (!str) return 0;

  // 1. Spaced thousands: e.g. "5 000 000" or "150 000"
  const spacedMatch = str.match(/(\d{1,3}(?:\s+\d{3})+)(?:\s*(?:so['`]?m)?)?/i);
  if (spacedMatch) {
    const rawDigits = spacedMatch[1].replace(/\s+/g, '');
    const val = parseInt(rawDigits, 10);
    if (!isNaN(val) && val > 0) return val;
  }

  // 2. Dotted thousands: e.g. "5.000.000"
  const dottedMatch = str.match(/(\d{1,3}(?:\.\d{3}){1,3})/);
  if (dottedMatch) {
    const rawDigits = dottedMatch[1].replace(/\./g, '');
    const val = parseInt(rawDigits, 10);
    if (!isNaN(val) && val > 0) return val;
  }

  // 3. Number with unit: e.g. "5 mln", "1.5 million", "25 ming", "500k", "5000000"
  const match = str.match(/(\d+(?:[.,]\d+)?)\s*(ming|mln|million|k|m|so['`]?m)?/i);
  if (!match) return 0;

  let baseNum = parseFloat(match[1].replace(',', '.'));
  const unit = (match[2] || '').toLowerCase();

  if (unit.startsWith('ming') || unit === 'k') {
    baseNum *= 1000;
  } else if (unit.startsWith('mln') || unit.startsWith('million') || unit === 'm') {
    baseNum *= 1000000;
  } else if (baseNum < 1000 && !unit.includes('so')) {
    baseNum *= 1000;
  }

  return Math.round(baseNum);
}

/**
 * Generate personal AI Financial Advice based on user's spending data
 */
async function getAIFinancialAdvice(userSummary, userName = 'Foydalanuvchi') {
  const { totalMonth, incomeTotal, balance, categories, budget, debts } = userSummary;

  if (totalMonth === 0 && incomeTotal === 0) {
    return `👋 <b>Assalomu alaykum, ${userName}!</b>\n\n` +
      `Sizda ushbu oy uchun hali xarajat yoki daromadlar kiritilmagan.\n` +
      `Ovozli yoki matnli xabarlar orqali xarajatlaringizni yuboring (masalan: <i>"Bugun taksiga 25 ming, tushlikka 60 ming ketdi"</i>), shunda men moliyangizni tahlil qilib, shaxsiy tejash strategiyasini tuzib beraman! 💡`;
  }

  const catText = categories.map(c => `- ${c.category}: ${c.total_amount.toLocaleString('uz-UZ')} so'm (${c.percentage}%)`).join('\n');
  const budgetText = budget > 0 ? `Belgilangan oylik byudjet: ${budget.toLocaleString('uz-UZ')} so'm` : 'Oylik byudjet hali belgilanmagan.';
  const debtText = debts && debts.count > 0 ? `Qarzlar: Menga berilishi kerak: ${debts.totalLend.toLocaleString('uz-UZ')} so'm, Men berishim kerak: ${debts.totalBorrow.toLocaleString('uz-UZ')} so'm` : 'Hozircha qarzlar yo\'q.';

  const apiKey = config.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'none' && !apiKey.includes('GEMINI_API_KALITI')) {
    if (!genAI) {
      genAI = new GoogleGenerativeAI(apiKey);
    }

    const prompt = `
Siz o'zbek tilida so'zlashuvchi professional va samimiy Shaxsiy AI Moliyaviy Maslahatchisiz (CFO).
Foydalanuvchi: ${userName}.

Ushbu oydagi moliyaviy holati:
- Jami daromad (Kirim): ${incomeTotal.toLocaleString('uz-UZ')} so'm
- Jami xarajat (Chiqim): ${totalMonth.toLocaleString('uz-UZ')} so'm
- Sof qoldiq (Balans): ${balance.toLocaleString('uz-UZ')} so'm
- ${budgetText}
- ${debtText}
- Kategoriyalar bo'yicha xarajatlar:
${catText || 'Xarajatlar mavjud emas'}

Vazifangiz:
Foydalanuvchiga Telegram xabari formatida (HTML teglari: <b>, <i>, <code> bilan) qisqa, tushunarli va juda foydali shaxsiy maslahat bering:
1. Qayerga eng ko'p pul ketayotganini tahlil qiling.
2. Daromad va xarajat mutanosibligini baholang (jamg'arma foizi).
3. 2-3 ta amaliy tejash maslahati bering (aynan uning holatiga moslab).
4. O'zbekona mehmondorchilik va hayot tarziga mos, muloyim motivatsiya bering.
`;

    const modelsToTry = [config.GEMINI_MODEL || 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];
    for (const m of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: m });
        const res = await withTimeout(
          model.generateContent(prompt),
          9000,
          `Model ${m} maslahatda timeout bo'ldi`
        );
        return res.response.text();
      } catch (err) {
        console.warn(`[AI Advisor Error] ${m}:`, err.message);
      }
    }
  }

  // Smart rule-based advisor fallback
  const topCat = categories[0];
  let advice = `💡 <b>AI MOLIYAVIY MASLAHATCHI TAHLILI:</b>\n\n`;
  advice += `Hurmatli <b>${userName}</b>, sizning ushbu oydagi hisob-kitobingiz:\n\n`;
  advice += `💰 <b>Jami daromad:</b> ${incomeTotal.toLocaleString('uz-UZ')} so'm\n`;
  advice += `💸 <b>Jami xarajat:</b> ${totalMonth.toLocaleString('uz-UZ')} so'm\n`;
  advice += `🎯 <b>Sof qoldiq:</b> ${balance >= 0 ? '+' : ''}${balance.toLocaleString('uz-UZ')} so'm\n\n`;

  if (topCat) {
    advice += `⚠️ <b>Eng katta chiqim:</b> ${topCat.category} (${topCat.total_amount.toLocaleString('uz-UZ')} so'm — <i>${topCat.percentage}%</i>)\n\n`;
  }

  advice += `🎯 <b>Amaliy tavsiyalar:</b>\n`;
  if (topCat && topCat.category.includes('Transport')) {
    advice += `• Taksi xarajatlarini rejalashtirish yoki qisqa masofalarda piyoda yurish orqali oyiga 15-20% gacha tejash mumkin.\n`;
  } else if (topCat && topCat.category.includes('Kafe')) {
    advice += `• Tashqarida ovqatlanish byudjetning katta qismini olmoqda. Rejalashtirilgan tushliklar pulni tejaydi.\n`;
  } else {
    advice += `• Xarajatlaringizni haftalik aniq chegaralarga ajratib oling.\n`;
  }
  advice += `• <b>50/30/20 qoidasini</b> qo'llang: 50% asosiy ehtiyojlar, 30% orzu/istaklar, 20% daxlsiz jamg'arma.\n\n`;
  advice += `✨ <i>Kichik tejamkorliklar katta boylikning poydevoridir!</i>`;

  return advice;
}

/**
 * Calculate month-end spending forecast and budget warning
 */
function calculateForecast(userSummary) {
  const { totalMonth, budget, incomeTotal } = userSummary;
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
    incomeTotal,
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
  const apiKey = config.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'none' && !apiKey.includes('GEMINI_API_KALITI')) {
    if (!genAI) {
      genAI = new GoogleGenerativeAI(apiKey);
    }

    const { totalMonth, incomeTotal, balance, categories } = userSummary;
    const catText = categories.map(c => `${c.category}: ${c.total_amount.toLocaleString('uz-UZ')} so'm`).join(', ');

    const prompt = `
Siz o'zbek tilida so'zlashuvchi aqlli va samimiy Shaxsiy Moliyaviy Buxgalter va Maslahatchisiz.
Foydalanuvchi: ${userName}.
Foydalanuvchining bu oydagi xarajatlari: Jami ${totalMonth.toLocaleString('uz-UZ')} so'm, Daromad: ${incomeTotal.toLocaleString('uz-UZ')} so'm, Qoldiq: ${balance.toLocaleString('uz-UZ')} so'm.
Kategoriyalar: ${catText || 'Hali yo\'q'}.

Foydalanuvchi savoli: "${userMessage}"

Qisqa, do'stona, tushunarli va maslahatga boy qilib o'zbek tilida javob bering (HTML teglari bilan).
`;

    try {
      const model = genAI.getGenerativeModel({ model: config.GEMINI_MODEL || 'gemini-3.5-flash' });
      const res = await withTimeout(
        model.generateContent(prompt),
        9000,
        'AI chat so\'rovi timeout bo\'ldi'
      );
      return res.response.text();
    } catch (err) {
      console.warn('[AI Chat Error]:', err.message);
    }
  }

  return `🤖 <b>Shaxsiy AI Maslahatchi:</b>\n\nMoliyaviy erkinlikka erishish uchun daromadlaringizning kamida 10-20% qismini har oy boshida zaxira jamg'armasiga (depozitga) ajratib qo'yishni odat qiling! 💰`;
}

/**
 * Analyze receipt, invoice or payment screenshot (Click, Payme, Uzum, etc.) with Gemini Vision
 */
async function processReceiptImage(imageBuffer, mimeType = 'image/jpeg') {
  const apiKey = config.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'none' || apiKey.includes('GEMINI_API_KALITI')) {
    throw new Error('GEMINI_API_KEY sozlanmagan.');
  }

  if (!genAI) {
    genAI = new GoogleGenerativeAI(apiKey);
  }

  const todayStr = getTodayString();
  const categoryNames = Object.keys(CATEGORIES).map(c => `"${c}"`).join(', ');

  const prompt = `Siz shaxsiy buxgalter AI assistentisiz.
Ushbu rasmda xarid cheki (kvitansiya), to'lov skrinshoti (Click, Payme, Uzum Bank, Anorbank, Paynet, terminal cheki) yoki moliyaviy ma'lumot aks etgan.
Bugungi sana: ${todayStr}.

Rasmdagi ma'lumotlarni aniqlang:
1. Qaysi do'kon, xizmat yoki tashkilot (masalan: Korzinka, Makro, dorixona, Yandex Go, Click to'lov, kafe, zapravka va h.k.)
2. To'langan yakuniy jami summa (so'mda, INTEGER raqamda).
3. Sana (agar chekda yozilgan bo'lsa YYYY-MM-DD, aks holda ${todayStr}).
4. Kategoriya quyidagilardan biri bo'lsin: [${categoryNames}]
5. Turi: "expense" (chiqim/to'lov) yoki "income" (kirim/o'tkazma).
6. Qisqa tavsif (description): nima sotib olingani yoki to'lov maqsadi.

Javobni FAQAT quyidagi toza JSON formatida bering:
{
  "is_financial_receipt": true,
  "shop_or_service": "Korzinka",
  "amount": 145000,
  "type": "expense",
  "category": "Bozor va Supermarket",
  "description": "Bozorlik",
  "date": "${todayStr}"
}

Agar rasmda umuman chek, to'lov yoki pulga oid ma'lumot bo'lmasa (masalan tabiat, oddiy surat):
{
  "is_financial_receipt": false,
  "message": "Ushbu rasmda chek yoki to'lov ma'lumoti aniqlanmadi."
}`;

  const base64Image = imageBuffer.toString('base64');
  const modelsToTry = [
    config.GEMINI_MODEL || 'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite'
  ];

  let lastError = null;
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await withTimeout(
        model.generateContent([
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: base64Image
            }
          },
          { text: prompt }
        ]),
        16000,
        `Model ${modelName} chek tahlilida timeout bo'ldi`
      );

      const responseText = result.response.text();
      let cleaned = responseText.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      const startIdx = cleaned.indexOf('{');
      const endIdx = cleaned.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        cleaned = cleaned.substring(startIdx, endIdx + 1);
      }
      const parsed = JSON.parse(cleaned);

      if (parsed.is_financial_receipt && parsed.amount > 0) {
        parsed.amount = Math.round(Number(parsed.amount));
        parsed.category = normalizeCategory(parsed.category, parsed.type);
        parsed.date = parsed.date || todayStr;
        parsed.description = parsed.description || parsed.shop_or_service || parsed.category;
      }
      return parsed;
    } catch (err) {
      console.warn(`[AI Vision Warning] ${modelName} xatolik:`, err.message);
      lastError = err;
    }
  }

  throw new Error(`Chekni tahlil qilib bo'lmadi: ${lastError ? lastError.message : 'Noma\'lum xatolik'}`);
}

module.exports = {
  processVoiceAudio,
  processTextMessage,
  processReceiptImage,
  getAIFinancialAdvice,
  calculateForecast,
  chatWithFinancialAI,
  parseUzbekNumber,
  ruleBasedUzbekParser
};
