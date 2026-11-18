import { getCategoryEmoji } from './categories.js';

const MONTH_NAMES_UZ = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'
];

// Asia/Tashkent = UTC+5
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

export function getTashkentNow() {
  return new Date(Date.now() + TASHKENT_OFFSET_MS);
}

export function getTashkentTimestamp() {
  const d = getTashkentNow();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

export function getTodayString() {
  const d = getTashkentNow();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getDateDaysAgoString(days) {
  const d = new Date(Date.now() + TASHKENT_OFFSET_MS - days * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getCurrentMonthString() {
  const d = getTashkentNow();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatNumber(amount) {
  const num = Math.round(Number(amount) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatCurrency(amount) {
  return `${formatNumber(amount)} so'm`;
}

export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatDateUz(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const month = MONTH_NAMES_UZ[parseInt(parts[1], 10) - 1] || parts[1];
  const day = parseInt(parts[2], 10);
  return `${day}-${month.toLowerCase()}, ${year}`;
}

export function formatYearMonthUz(yearMonthStr) {
  if (!yearMonthStr) return '';
  const [year, month] = yearMonthStr.split('-');
  const monthName = MONTH_NAMES_UZ[parseInt(month, 10) - 1] || month;
  return `${monthName} ${year}`;
}

export function makeProgressBar(percent) {
  const total = 10;
  const filled = Math.min(10, Math.max(0, Math.round((percent / 100) * total)));
  return '🟩'.repeat(filled) + '⬜️'.repeat(total - filled);
}

export function normalizeCurrencyAmounts(text, rates = null) {
  if (!text) return text;
  const usdRate = rates?.USD?.rate || 12850;
  const eurRate = rates?.EUR?.rate || 13900;
  const rubRate = rates?.RUB?.rate || 135;

  let normalized = text;
  normalized = normalized.replace(/(\$|usd|dollar)?\s*(\d+(?:[.,]\d+)?)\s*(\$|usd|dollar)/gi, (m, p1, num) => {
    const val = parseFloat(num.replace(',', '.'));
    return `${Math.round(val * usdRate)} so'm (${val} USD)`;
  });
  normalized = normalized.replace(/(\d+(?:[.,]\d+)?)\s*(yevro|euro|eur|€)/gi, (m, num) => {
    const val = parseFloat(num.replace(',', '.'));
    return `${Math.round(val * eurRate)} so'm (${val} EUR)`;
  });
  normalized = normalized.replace(/(\d+(?:[.,]\d+)?)\s*(rubl|rub)/gi, (m, num) => {
    const val = parseFloat(num.replace(',', '.'));
    return `${Math.round(val * rubRate)} so'm (${val} RUB)`;
  });
  return normalized;
}

export function formatAddedExpensesMessage(
  transcription,
  items,
  todayTotal,
  monthExpense,
  monthIncome = 0,
  balance = null,
  userBudget = 0
) {
  const hasIncome = items.some((i) => i.type === 'income');
  const hasExpense = items.some((i) => !i.type || i.type === 'expense');

  let title = '✅ <b>Yozuv muvaffaqiyatli saqlandi!</b>\n\n';
  if (hasIncome && !hasExpense) {
    title = '🎉 <b>Yangi daromad kiritildi!</b>\n\n';
  } else if (hasExpense && !hasIncome) {
    title = '✅ <b>Xarajatlar muvaffaqiyatli saqlandi!</b>\n\n';
  }

  let message = title;
  if (transcription) {
    message += `🎙 <i>"${escapeHtml(transcription)}"</i>\n\n`;
  }

  let batchTotalExpense = 0;
  let batchTotalIncome = 0;

  items.forEach((item, index) => {
    const isIncome = item.type === 'income';
    const emoji = getCategoryEmoji(item.category);
    const amount = Number(item.amount);
    const desc = escapeHtml(item.description || item.category);

    if (isIncome) {
      batchTotalIncome += amount;
      message += `${index + 1}. 🟢 <b>${desc}</b>: +${formatCurrency(amount)}\n`;
      message += `   📥 <i>Kategoriya: ${escapeHtml(item.category)} (Kirim)</i>\n`;
    } else {
      batchTotalExpense += amount;
      message += `${index + 1}. 🔴 ${emoji} <b>${desc}</b>: -${formatCurrency(amount)}\n`;
      message += `   📂 <i>Kategoriya: ${escapeHtml(item.category)} (Chiqim)</i>\n`;
    }
  });

  message += '\n';
  if (batchTotalExpense > 0) {
    message += `💸 <b>Joriy xarajat:</b> ${formatCurrency(batchTotalExpense)}\n`;
  }
  if (batchTotalIncome > 0) {
    message += `💰 <b>Joriy daromad:</b> +${formatCurrency(batchTotalIncome)}\n`;
  }

  message += `📅 <b>Bugungi chiqim:</b> ${formatCurrency(todayTotal)}\n`;
  message += `📊 <b>Oylik jami xarajat:</b> ${formatCurrency(monthExpense)}\n`;

  if (monthIncome > 0 || balance !== null) {
    const net = balance !== null ? balance : (monthIncome - monthExpense);
    const sign = net >= 0 ? '+' : '';
    message += `💵 <b>Oylik daromad:</b> ${formatCurrency(monthIncome)}\n`;
    message += `🎯 <b>Oylik sof qoldiq:</b> <b>${sign}${formatCurrency(net)}</b>\n`;
  }

  if (userBudget > 0) {
    if (monthExpense >= userBudget) {
      message += `\n🚨 <b>OGOHLANTIRISH:</b> Oylik byudjetingiz (${formatCurrency(userBudget)}) dan oshib ketdingiz!`;
    } else if (monthExpense >= userBudget * 0.8) {
      const pct = Math.round((monthExpense / userBudget) * 100);
      message += `\n⚠️ <b>DIQQAT:</b> Oylik byudjetingizning ${pct}% qismi ishlatildi!`;
    }
  }

  return message.trim();
}
