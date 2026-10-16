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
 * Format a list of newly added expenses into a clean Telegram message
 */
function formatAddedExpensesMessage(transcription, expenses, todayTotal, monthTotal) {
  let message = `✅ <b>Xarajatlar muvaffaqiyatli saqlandi!</b>\n\n`;

  if (transcription) {
    message += `🎙 <i>"${transcription}"</i>\n\n`;
  }

  let batchTotal = 0;
  expenses.forEach((item, index) => {
    const emoji = getCategoryEmoji(item.category);
    const amount = Number(item.amount);
    batchTotal += amount;
    message += `${index + 1}. ${emoji} <b>${item.description || item.category}</b>: ${formatCurrency(amount)}\n`;
    message += `   📂 <i>Kategoriya: ${item.category}</i>\n`;
  });

  message += `\n💵 <b>Ushbu yozuv:</b> ${formatCurrency(batchTotal)}\n`;
  message += `📅 <b>Bugungi jami:</b> ${formatCurrency(todayTotal)}\n`;
  message += `📊 <b>Ushbu oy jami:</b> ${formatCurrency(monthTotal)}`;

  return message;
}

module.exports = {
  formatCurrency,
  getMonthNameUz,
  formatDateUz,
  formatYearMonthUz,
  getTodayString,
  getCurrentMonthString,
  formatAddedExpensesMessage
};
