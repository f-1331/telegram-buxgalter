const { Keyboard, InlineKeyboard } = require('grammy');

/**
 * Main bottom reply keyboard for everyday quick access
 */
function getMainKeyboard() {
  return new Keyboard()
    .text('📊 Oylik hisobot').text('📈 Infografika')
    .row()
    .text('📥 Excel yuklab olish').text('📅 Bugungi xarajatlar')
    .row()
    .text('💡 AI Maslahatchi').text('🔮 Kelajak prognozi')
    .row()
    .text('🎯 Oylik byudjet').text('🗓 Oxirgi 7 kun')
    .row()
    .text('🗑 Oxirgisini o\'chirish').text('ℹ️ Qo\'llanma')
    .resized()
    .persistent();
}

/**
 * Inline keyboard for quick budget setting
 */
function getBudgetSelectionKeyboard() {
  return new InlineKeyboard()
    .text('2 000 000', 'set_budget_2000000')
    .text('3 000 000', 'set_budget_3000000')
    .row()
    .text('5 000 000', 'set_budget_5000000')
    .text('8 000 000', 'set_budget_8000000')
    .row()
    .text('10 000 000', 'set_budget_10000000')
    .text('15 000 000', 'set_budget_15000000');
}

/**
 * Inline keyboard shown after saving an expense (with Undo button)
 */
function getExpenseActionKeyboard(expenseIds) {
  const idsStr = Array.isArray(expenseIds) ? expenseIds.join(',') : expenseIds;
  return new InlineKeyboard()
    .text('🗑 Bekor qilish (O\'chirish)', `undo_${idsStr}`);
}

/**
 * Inline keyboard for monthly report (switch months, download excel, view infographic)
 */
function getMonthReportKeyboard(currentYearMonth) {
  const [year, month] = currentYearMonth.split('-').map(Number);
  
  // Previous month
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear--;
  }
  const prevStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

  // Next month
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear++;
  }
  const nextStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;

  return new InlineKeyboard()
    .text('◀️ Oldingi oy', `rep_month_${prevStr}`)
    .text('Keyingi oy ▶️', `rep_month_${nextStr}`)
    .row()
    .text('📈 Infografika ko\'rish', `chart_${currentYearMonth}`)
    .text('📥 Excel yuklab olish', `excel_${currentYearMonth}`);
}

module.exports = {
  getMainKeyboard,
  getBudgetSelectionKeyboard,
  getExpenseActionKeyboard,
  getMonthReportKeyboard
};
