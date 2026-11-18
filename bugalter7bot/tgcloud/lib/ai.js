import { fetch } from 'sdk';
import { CATEGORIES, normalizeCategory } from './categories.js';
import { getTodayString, getTashkentNow, normalizeCurrencyAmounts, formatNumber, escapeHtml } from './formatters.js';
import { getSetting, setSetting } from './db.js';
import { getExchangeRates } from './currency.js';

const GEMINI_KEY_SETTING = 'gemini_api_key';
const MODELS_TO_TRY = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

export function bytesToBase64(bytes) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const a = bytes[i];
    const b = i + 1 < len ? bytes[i + 1] : 0;
    const c = i + 2 < len ? bytes[i + 2] : 0;
    const triplet = (a << 16) | (b << 8) | c;
    result += chars[(triplet >> 18) & 63];
    result += chars[(triplet >> 12) & 63];
    result += i + 1 < len ? chars[(triplet >> 6) & 63] : '=';
    result += i + 2 < len ? chars[triplet & 63] : '=';
  }
  return result;
}

export async function getGeminiApiKey() {
  const key = await getSetting(GEMINI_KEY_SETTING, '');
  return (key || '').trim();
}

async function callGemini(apiKey, parts, models = MODELS_TO_TRY) {
  let lastError = null;
  for (const modelName of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json?.error?.message || `HTTP ${res.status}`;
        if (msg.includes('API key not valid') || msg.includes('API_KEY_INVALID')) {
          throw new Error(`API_KEY_INVALID: ${msg}`);
        }
        lastError = new Error(`${modelName}: ${msg}`);
        continue;
      }
      const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      if (text) return text;
      lastError = new Error(`${modelName}: bo'sh javob`);
    } catch (err) {
      if (err.message && err.message.includes('API_KEY_INVALID')) throw err;
      lastError = err;
    }
  }
  throw lastError || new Error("Gemini API bilan bog'lanib bo'lmadi");
}

export async function validateAndSetGeminiKey(newKey) {
  const clean = (newKey || '').trim();
  if (!clean || clean.length < 20) {
    return { ok: false, error: "Kalit formati noto'g'ri (juda qisqa)" };
  }
  try {
    const text = await callGemini(clean, [{ text: '1+1 nechiga teng? Faqat bitta raqam yoz.' }]);
    if (text) {
      await setSetting(GEMINI_KEY_SETTING, clean);
      return { ok: true, message: 'Gemini API kaliti muvaffaqiyatli tekshirildi va bulutda saqlandi!' };
    }
    return { ok: false, error: "Noma'lum javob olindi" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function buildPrompt(todayDate) {
  const categoryNames = Object.keys(CATEGORIES).map((c) => `"${c}"`).join(', ');
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
1. "ming" = 1 000, "mln" / "million" = 1 000 000
2. "dollar" / "$" = 12 850 so'm, "rubl" = 135 so'm
3. Har bir element uchun type: "expense" (chiqim) yoki "income" (kirim).
4. Har bir miqdorni aniq INTEGER raqamda yozing.

Javobni FAQAT quyidagi toza JSON formatida qaytaring, boshqa hech qanday so'z yoki markdown belgisi qo'shmang:
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
}`;
}

function cleanAndParseJSON(rawText) {
  let cleaned = (rawText || '').trim();
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
    const amountMatch = cleaned.match(/"amount":\s*(\d+)/);
    if (amountMatch) {
      parsed = {
        transcription: 'Ovozli xabar',
        has_expenses: true,
        expenses: [
          {
            amount: parseInt(amountMatch[1], 10),
            type: 'expense',
            category: 'Boshqa',
            description: 'Xarajat',
            date: getTodayString(),
          },
        ],
        debts: [],
      };
    } else {
      parsed = { transcription: '', has_expenses: false, expenses: [], debts: [] };
    }
  }

  if (parsed.expenses && Array.isArray(parsed.expenses)) {
    parsed.expenses = parsed.expenses
      .map((item) => ({
        amount: Math.round(Number(item.amount) || 0),
        type: item.type === 'income' ? 'income' : 'expense',
        category: normalizeCategory(item.category, item.type),
        description: item.description || item.category || (item.type === 'income' ? 'Daromad' : 'Xarajat'),
        date: item.date || getTodayString(),
      }))
      .filter((item) => item.amount > 0);
    parsed.has_expenses = parsed.expenses.length > 0;
  } else {
    parsed.expenses = [];
    parsed.has_expenses = false;
  }

  if (parsed.debts && Array.isArray(parsed.debts)) {
    parsed.debts = parsed.debts
      .map((d) => ({
        personName: d.person || d.personName || "Noma'lum",
        amount: Math.round(Number(d.amount) || 0),
        type: d.type === 'borrow' ? 'borrow' : 'lend',
        description: d.description || '',
      }))
      .filter((d) => d.amount > 0);
  } else {
    parsed.debts = [];
  }

  return parsed;
}

export function parseUzbekNumber(str) {
  if (!str) return 0;

  const spacedMatch = str.match(/(\d{1,3}(?:\s+\d{3})+)(?:\s*(?:so['`]?m)?)?/i);
  if (spacedMatch) {
    const val = parseInt(spacedMatch[1].replace(/\s+/g, ''), 10);
    if (!isNaN(val) && val > 0) return val;
  }

  const dottedMatch = str.match(/(\d{1,3}(?:\.\d{3}){1,3})/);
  if (dottedMatch) {
    const val = parseInt(dottedMatch[1].replace(/\./g, ''), 10);
    if (!isNaN(val) && val > 0) return val;
  }

  const currMatch = str.match(/(\d+(?:[.,]\d+)?)\s*(\$|usd|dollar|rubl|rub|yevro|euro|eur|€)/i);
  if (currMatch) {
    const amt = parseFloat(currMatch[1].replace(',', '.'));
    const cur = currMatch[2].toLowerCase();
    if (cur === '$' || cur === 'usd' || cur === 'dollar') return Math.round(amt * 12850);
    if (cur === 'rubl' || cur === 'rub') return Math.round(amt * 135);
    if (cur === 'yevro' || cur === 'euro' || cur === 'eur' || cur === '€') return Math.round(amt * 13900);
  }

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

export function ruleBasedUzbekParser(text, todayStr) {
  const expensesList = [];
  const debtsList = [];

  const cleanSpaced = text.replace(/(\d{1,3})\s+(\d{3})(?:\s+(\d{3}))?/g, (m, g1, g2, g3) =>
    g3 ? `${g1}${g2}${g3}` : `${g1}${g2}`
  );
  const lower = cleanSpaced.toLowerCase();

  const debtLendMatch = lower.match(
    /(.+?)(?:ga|dan)?\s+(\d+(?:[.,]\d+)?\s*(?:ming|mln|million|k|m)?)\s+(?:so['`]?m\s+)?qarz\s+(berdim|berildi)/i
  );
  if (debtLendMatch) {
    const person = debtLendMatch[1].replace(/bugun|kecha/gi, '').trim();
    const amt = parseUzbekNumber(debtLendMatch[2]);
    if (amt > 0) {
      debtsList.push({
        personName: person ? person.charAt(0).toUpperCase() + person.slice(1) : 'Tanish',
        amount: amt,
        type: 'lend',
        description: 'Qarz berildi',
      });
    }
  }

  const debtBorrowMatch = lower.match(
    /(.+?)(?:dan)?\s+(\d+(?:[.,]\d+)?\s*(?:ming|mln|million|k|m)?)\s+(?:so['`]?m\s+)?qarz\s+(oldim|olindi)/i
  );
  if (debtBorrowMatch) {
    const person = debtBorrowMatch[1].replace(/bugun|kecha/gi, '').trim();
    const amt = parseUzbekNumber(debtBorrowMatch[2]);
    if (amt > 0) {
      debtsList.push({
        personName: person ? person.charAt(0).toUpperCase() + person.slice(1) : 'Tanish',
        amount: amt,
        type: 'borrow',
        description: 'Qarz olindi',
      });
    }
  }

  const segments = lower.split(/[,;\n+]|\s+va\s+|\s+keyin\s+|\s+hamda\s+/);
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    if (trimmed.includes('qarz berdim') || trimmed.includes('qarz oldim')) continue;

    const numberMatch = trimmed.match(/(\d+(?:[.,]\d+)?)\s*(ming|mln|million|k|m|so['`]?m)?/i);
    if (!numberMatch) continue;

    const amount = parseUzbekNumber(numberMatch[0]);
    if (amount <= 0) continue;

    const isIncome =
      /oylik|maosh|zarplata|avans|ish haqi|tushdi|tushum|daromad|foyda|ishladim|keshbek|mukofot|frilans|savdo|kirim/i.test(
        trimmed
      );
    const entryType = isIncome ? 'income' : 'expense';

    let detectedCategory = isIncome ? 'Boshqa daromad' : 'Boshqa';
    if (isIncome) {
      if (/oylik|maosh|zarplata|avans|ish haqi|premiya/i.test(trimmed)) detectedCategory = 'Oylik va Ish haqi';
      else if (/savdo|biznes|dokon|do'kon/i.test(trimmed)) detectedCategory = 'Biznes va Savdo';
      else if (/frilans|mijoz|zakaz|xizmat/i.test(trimmed)) detectedCategory = 'Frilans va Xizmatlar';
      else if (/keshbek|mukofot|bonus/i.test(trimmed)) detectedCategory = 'Keshbek va Mukofot';
      else if (/qarz qaytdi|qarzimni qaytardi/i.test(trimmed)) detectedCategory = 'Qarz qaytishi';
    } else {
      for (const [catName, catData] of Object.entries(CATEGORIES)) {
        if (catData.type === 'expense' && catData.keywords.some((kw) => trimmed.includes(kw))) {
          detectedCategory = catName;
          break;
        }
      }
    }

    let description = trimmed
      .replace(numberMatch[0], '')
      .replace(
        /ga\b|dan\b|da\b|uchun\b|ishlatdim\b|ketdi\b|to'ladim\b|berdim\b|qildim\b|oldim\b|tushdi\b|kiritish\b|kiritdim\b|yoz\b/gi,
        ''
      )
      .trim();

    if (description) {
      description = description.charAt(0).toUpperCase() + description.slice(1);
    } else {
      description = isIncome ? 'Oylik daromad' : 'Xarajat';
    }

    expensesList.push({
      amount,
      type: entryType,
      category: detectedCategory,
      description: description || detectedCategory,
      date: todayStr,
    });
  }

  return {
    transcription: text,
    has_expenses: expensesList.length > 0 || debtsList.length > 0,
    expenses: expensesList,
    debts: debtsList,
  };
}

export async function processTextMessage(text) {
  const todayStr = getTodayString();
  let rates = null;
  if (/\$|usd|dollar|rubl|rub|yevro|euro|eur|€/i.test(text)) {
    rates = await getExchangeRates().catch(() => null);
  }
  const preprocessedText = normalizeCurrencyAmounts(text, rates);

  // 1. Fast local engine first (0.5ms!)
  const localResult = ruleBasedUzbekParser(preprocessedText, todayStr);
  if (localResult.has_expenses && (localResult.expenses.length > 0 || localResult.debts.length > 0)) {
    return localResult;
  }

  // 2. Fallback to Gemini AI
  const apiKey = await getGeminiApiKey();
  if (apiKey) {
    try {
      const prompt = `${buildPrompt(todayStr)}\n\nFoydalanuvchi matni: "${preprocessedText}"`;
      const responseText = await callGemini(apiKey, [{ text: prompt }]);
      return cleanAndParseJSON(responseText);
    } catch (err) {
      console.warn('[AI Text Warning]:', err.message);
    }
  }

  return localResult;
}

export async function processVoiceAudio(audioBytes, mimeType = 'audio/ogg') {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY sozlanmagan. /setkey KALIT orqali kiriting.');
  }

  let cleanMime = 'audio/ogg';
  if (mimeType) {
    if (mimeType.includes('ogg') || mimeType.includes('oga') || mimeType.includes('opus')) cleanMime = 'audio/ogg';
    else if (mimeType.includes('mp3')) cleanMime = 'audio/mp3';
    else if (mimeType.includes('wav')) cleanMime = 'audio/wav';
    else if (mimeType.includes('mp4') || mimeType.includes('video')) cleanMime = 'video/mp4';
    else cleanMime = mimeType.split(';')[0].trim();
  }

  const todayStr = getTodayString();
  const prompt = buildPrompt(todayStr);
  const base64Audio = bytesToBase64(audioBytes);

  const responseText = await callGemini(apiKey, [
    { inlineData: { mimeType: cleanMime, data: base64Audio } },
    { text: prompt },
  ]);

  return cleanAndParseJSON(responseText);
}

export async function processReceiptImage(imageBytes, mimeType = 'image/jpeg') {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY sozlanmagan. /setkey KALIT orqali kiriting.');
  }

  const todayStr = getTodayString();
  const categoryNames = Object.keys(CATEGORIES).map((c) => `"${c}"`).join(', ');
  const prompt = `Siz shaxsiy buxgalter AI assistentisiz.
Ushbu rasmda xarid cheki (kvitansiya), to'lov skrinshoti (Click, Payme, Uzum Bank, Anorbank, Paynet, terminal cheki) yoki moliyaviy ma'lumot aks etgan.
Bugungi sana: ${todayStr}.

Rasmdagi ma'lumotlarni aniqlang:
1. Qaysi do'kon, xizmat yoki tashkilot
2. To'langan yakuniy jami summa (so'mda, INTEGER raqamda).
3. Sana (YYYY-MM-DD, topilmasa ${todayStr}).
4. Kategoriya: [${categoryNames}]
5. Turi: "expense" yoki "income".
6. Qisqa tavsif (description).

Javobni FAQAT toza JSON formatida bering:
{
  "is_financial_receipt": true,
  "shop_or_service": "Korzinka",
  "amount": 145000,
  "type": "expense",
  "category": "Bozor va Supermarket",
  "description": "Bozorlik",
  "date": "${todayStr}"
}
Agar rasmda chek yoki to'lov bo'lmasa:
{ "is_financial_receipt": false }`;

  const base64Image = bytesToBase64(imageBytes);
  const responseText = await callGemini(apiKey, [
    { inlineData: { mimeType: mimeType || 'image/jpeg', data: base64Image } },
    { text: prompt },
  ]);

  let cleaned = responseText.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1) cleaned = cleaned.substring(startIdx, endIdx + 1);
  const parsed = JSON.parse(cleaned);

  if (parsed.is_financial_receipt && parsed.amount > 0) {
    parsed.amount = Math.round(Number(parsed.amount));
    parsed.category = normalizeCategory(parsed.category, parsed.type);
    parsed.date = parsed.date || todayStr;
    parsed.description = parsed.description || parsed.shop_or_service || parsed.category;
  }
  return parsed;
}

export async function getAIFinancialAdvice(userSummary, userName = 'Foydalanuvchi') {
  const { totalMonth, incomeTotal, balance, categories, budget, debts } = userSummary;

  if (totalMonth === 0 && incomeTotal === 0) {
    return (
      `👋 <b>Assalomu alaykum, ${escapeHtml(userName)}!</b>\n\n` +
      `Sizda ushbu oy uchun hali xarajat yoki daromadlar kiritilmagan.\n` +
      `Ovozli yoki matnli xabarlar orqali xarajatlaringizni yuboring (masalan: <i>"Bugun taksiga 25 ming, tushlikka 60 ming ketdi"</i>), shunda men moliyangizni tahlil qilib, shaxsiy tejash strategiyasini tuzib beraman! 💡`
    );
  }

  const catText = categories.map((c) => `- ${c.category}: ${formatNumber(c.total_amount)} so'm (${c.percentage}%)`).join('\n');
  const budgetText = budget > 0 ? `Belgilangan oylik byudjet: ${formatNumber(budget)} so'm` : 'Oylik byudjet hali belgilanmagan.';
  const debtText =
    debts && debts.count > 0
      ? `Qarzlar: Menga berilishi kerak: ${formatNumber(debts.totalLend)} so'm, Men berishim kerak: ${formatNumber(debts.totalBorrow)} so'm`
      : "Hozircha qarzlar yo'q.";

  const apiKey = await getGeminiApiKey();
  if (apiKey) {
    const prompt = `Siz o'zbek tilida so'zlashuvchi professional va samimiy Shaxsiy AI Moliyaviy Maslahatchisiz (CFO).
Foydalanuvchi: ${userName}.

Ushbu oydagi moliyaviy holati:
- Jami daromad (Kirim): ${formatNumber(incomeTotal)} so'm
- Jami xarajat (Chiqim): ${formatNumber(totalMonth)} so'm
- Sof qoldiq (Balans): ${formatNumber(balance)} so'm
- ${budgetText}
- ${debtText}
- Kategoriyalar bo'yicha xarajatlar:
${catText || 'Xarajatlar mavjud emas'}

Vazifangiz:
Telegram HTML formatida (faqat <b>, <i>, <code> teglari) qisqa, tushunarli va foydali shaxsiy maslahat bering:
1. Qayerga eng ko'p pul ketayotganini tahlil qiling.
2. Daromad va xarajat mutanosibligini baholang (jamg'arma foizi).
3. 2-3 ta amaliy tejash maslahati bering.
4. Qisqa samimiy motivatsiya bering.`;
    try {
      return await callGemini(apiKey, [{ text: prompt }]);
    } catch (err) {
      console.warn('[AI Advisor Fallback]:', err.message);
    }
  }

  const topCat = categories[0];
  let advice = `💡 <b>AI MOLIYAVIY MASLAHATCHI TAHLILI:</b>\n\n`;
  advice += `Hurmatli <b>${escapeHtml(userName)}</b>, sizning ushbu oydagi hisob-kitobingiz:\n\n`;
  advice += `💰 <b>Jami daromad:</b> ${formatNumber(incomeTotal)} so'm\n`;
  advice += `💸 <b>Jami xarajat:</b> ${formatNumber(totalMonth)} so'm\n`;
  advice += `🎯 <b>Sof qoldiq:</b> ${balance >= 0 ? '+' : ''}${formatNumber(balance)} so'm\n\n`;

  if (topCat) {
    advice += `⚠️ <b>Eng katta chiqim:</b> ${escapeHtml(topCat.category)} (${formatNumber(topCat.total_amount)} so'm — <i>${topCat.percentage}%</i>)\n\n`;
  }

  advice += `🎯 <b>Amaliy tavsiyalar:</b>\n`;
  if (topCat && topCat.category.includes('Transport')) {
    advice += `• Taksi xarajatlarini rejalashtirish orqali oyiga 15-20% gacha tejash mumkin.\n`;
  } else if (topCat && topCat.category.includes('Kafe')) {
    advice += `• Tashqarida ovqatlanish byudjetning katta qismini olmoqda. Rejalashtirilgan tushliklar pulni tejaydi.\n`;
  } else {
    advice += `• Xarajatlaringizni haftalik aniq chegaralarga ajratib oling.\n`;
  }
  advice += `• <b>50/30/20 qoidasini</b> qo'llang: 50% asosiy ehtiyojlar, 30% istaklar, 20% daxlsiz jamg'arma.\n\n`;
  advice += `✨ <i>Kichik tejamkorliklar katta boylikning poydevoridir!</i>`;
  return advice;
}

export function calculateForecast(userSummary) {
  const { totalMonth, budget, incomeTotal } = userSummary;
  const now = getTashkentNow();
  const currentDay = now.getUTCDate();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const totalDaysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
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
    isClose,
  };
}

export async function chatWithFinancialAI(userMessage, userSummary, userName = 'Foydalanuvchi') {
  const apiKey = await getGeminiApiKey();
  if (apiKey) {
    const { totalMonth, incomeTotal, balance, categories } = userSummary;
    const catText = categories.map((c) => `${c.category}: ${formatNumber(c.total_amount)} so'm`).join(', ');
    const prompt = `Siz o'zbek tilida so'zlashuvchi aqlli va samimiy Shaxsiy Moliyaviy Buxgalter va Maslahatchisiz.
Foydalanuvchi: ${userName}.
Bu oydagi holat: Xarajat ${formatNumber(totalMonth)} so'm, Daromad ${formatNumber(incomeTotal)} so'm, Qoldiq ${formatNumber(balance)} so'm.
Kategoriyalar: ${catText || "Hali yo'q"}.

Foydalanuvchi savoli: "${userMessage}"

Qisqa, do'stona, tushunarli va maslahatga boy qilib o'zbek tilida javob bering (faqat oddiy HTML teglari: <b>, <i>, <code>).`;
    try {
      return await callGemini(apiKey, [{ text: prompt }]);
    } catch (err) {
      console.warn('[AI Chat Error]:', err.message);
    }
  }

  return `🤖 <b>Shaxsiy AI Maslahatchi:</b>\n\nMoliyaviy erkinlikka erishish uchun daromadlaringizning kamida 10-20% qismini har oy boshida zaxira jamg'armasiga ajratib qo'yishni odat qiling! 💰`;
}
