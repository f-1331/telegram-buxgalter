const { getCategoryEmoji } = require('./categories');

const MONTH_NAMES_UZ = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'
];

/**
 * Formats a numeric amount into Uzbek currency string: e.g. 25000 -> "25 000 so'm"
 */
function formatCurrency(amount) {
  const num = Math.round(Number(amount) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";
}

/**
 * Returns month name in Uzbek by month index (1-12)
 */
function getMonthNameUz(monthIndex) {
  const idx = Number(monthIndex) - 1;
  return MONTH_NAMES_UZ[idx] || '';
}

/**
 * Formats YYYY-MM-DD to "16-oktyabr, 2026"
 */
function formatDateUz(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const month = MONTH_NAMES_UZ[parseInt(parts[1], 10) - 1] || parts[1];
  const day = parseInt(parts[2], 10);
  return `${day}-${month.toLowerCase()}, ${year}`;
}

/**
 * Formats YYYY-MM to "Oktyabr 2026"
 */
function formatYearMonthUz(yearMonthStr) {
  if (!yearMonthStr) return '';
  const [year, month] = yearMonthStr.split('-');
  const monthName = MONTH_NAMES_UZ[parseInt(month, 10) - 1] || month;
  return `${monthName} ${year}`;
}

/**
 * Get today's date formatted as YYYY-MM-DD in local time
 */
function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get current year-month formatted as YYYY-MM
 */
function getCurrentMonthString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Convert foreign currency expressions into UZS (approximate exchange rates)
 */
function normalizeCurrencyAmounts(text) {
  if (!text) return text;
  let normalized = text;

  const USD_RATE = 12850;
  const EUR_RATE = 13900;
  const RUB_RATE = 135;

  // Match: 15 dollar, $15, 15$, 15 usd
  normalized = normalized.replace(/(\$|usd|dollar)?\s*(\d+(?:[.,]\d+)?)\s*(\$|usd|dollar)/gi, (match, p1, num, p3) => {
    const val = parseFloat(num.replace(',', '.'));
    const uzs = Math.round(val * USD_RATE);
    return `${uzs} so'm (${val} USD)`;
  });

  // Match: 50 rubl, 50 rub
  normalized = normalized.replace(/(\d+(?:[.,]\d+)?)\s*(rubl|rub)/gi, (match, num) => {
    const val = parseFloat(num.replace(',', '.'));
    const uzs = Math.round(val * RUB_RATE);
    return `${uzs} so'm (${val} RUB)`;
  });

  return normalized;
}

/**
 * Format a list of newly added records (expenses / income) into a clean Telegram message
 */
function formatAddedExpensesMessage(transcription, items, todayTotal, monthExpense, monthIncome = 0, balance = null) {
  const hasIncome = items.some(i => i.type === 'income');
  const hasExpense = items.some(i => !i.type || i.type === 'expense');

  let title = '✅ <b>Yozuv muvaffaqiyatli saqlandi!</b>\n\n';
  if (hasIncome && !hasExpense) {
    title = '🎉 <b>Yangi daromad kiritildi!</b>\n\n';
  } else if (hasExpense && !hasIncome) {
    title = '✅ <b>Xarajatlar muvaffaqiyatli saqlandi!</b>\n\n';
  }

  let message = title;

  if (transcription) {
    message += `🎙 <i>"${transcription}"</i>\n\n`;
  }

  let batchTotalExpense = 0;
  let batchTotalIncome = 0;

  items.forEach((item, index) => {
    const isIncome = item.type === 'income';
    const emoji = getCategoryEmoji(item.category);
    const amount = Number(item.amount);

    if (isIncome) {
      batchTotalIncome += amount;
      message += `${index + 1}. 🟢 <b>${item.description || item.category}</b>: +${formatCurrency(amount)}\n`;
      message += `   📥 <i>Kategoriya: ${item.category} (Kirim)</i>\n`;
    } else {
      batchTotalExpense += amount;
      message += `${index + 1}. 🔴 ${emoji} <b>${item.description || item.category}</b>: -${formatCurrency(amount)}\n`;
      message += `   📂 <i>Kategoriya: ${item.category} (Chiqim)</i>\n`;
    }
  });

  message += `\n`;
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
    message += `🎯 <b>Oylik sof qoldiq:</b> <b>${sign}${formatCurrency(net)}</b>`;
  }

  return message;
}

module.exports = {
  formatCurrency,
  getMonthNameUz,
  formatDateUz,
  formatYearMonthUz,
  getTodayString,
  getCurrentMonthString,
  normalizeCurrencyAmounts,
  formatAddedExpensesMessage
};
