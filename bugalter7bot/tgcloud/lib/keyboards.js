export function getMainKeyboard() {
  return {
    keyboard: [
      [{ text: '📊 Oylik hisobot' }, { text: '📈 Infografika' }],
      [{ text: '💰 Daromad & Qoldiq' }, { text: '📥 Excel hisobot' }],
      [{ text: '🤝 Qarz daftari' }, { text: '📅 Bugungi hisob' }],
      [{ text: '⚡️ Tezkor xarajat' }, { text: '💱 Valyuta kursi' }],
      [{ text: "🎯 Jamg'arma maqsadlari" }, { text: "🔄 Doimiy to'lovlar" }],
      [{ text: '💡 AI Maslahatchi' }, { text: '🏆 Moliyaviy baho' }],
      [{ text: '🎯 Oylik byudjet' }, { text: '🔍 Qidiruv' }],
      [{ text: '⚙️ Sozlamalar' }, { text: "ℹ️ Qo'llanma" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function getQuickExpenseKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '☕️ Kofe (15 000)', callback_data: 'quick_exp_15000_Kofe' },
        { text: '🚕 Taksi (20 000)', callback_data: 'quick_exp_20000_Taksi' },
      ],
      [
        { text: '🍱 Tushlik (40 000)', callback_data: 'quick_exp_40000_Tushlik' },
        { text: '🛒 Bozorlik (100 000)', callback_data: 'quick_exp_100000_Bozorlik' },
      ],
      [
        { text: '⛽️ Benzin (150 000)', callback_data: 'quick_exp_150000_Benzin' },
        { text: '📱 Aloqa (50 000)', callback_data: 'quick_exp_50000_Mobil aloqa' },
      ],
    ],
  };
}

export function getBudgetSelectionKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '2 000 000', callback_data: 'set_budget_2000000' },
        { text: '3 000 000', callback_data: 'set_budget_3000000' },
      ],
      [
        { text: '5 000 000', callback_data: 'set_budget_5000000' },
        { text: '8 000 000', callback_data: 'set_budget_8000000' },
      ],
      [
        { text: '10 000 000', callback_data: 'set_budget_10000000' },
        { text: '15 000 000', callback_data: 'set_budget_15000000' },
      ],
    ],
  };
}

export function getExpenseActionKeyboard(expenseIds) {
  const idsStr = Array.isArray(expenseIds) ? expenseIds.join(',') : String(expenseIds);
  return {
    inline_keyboard: [
      [{ text: "🗑 Bekor qilish (O'chirish)", callback_data: `undo_${idsStr}` }],
    ],
  };
}

export function getDebtActionKeyboard(debtId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Qarz uzildi (Yopish)', callback_data: `settle_debt_${debtId}` },
        { text: "🗑 O'chirish", callback_data: `del_debt_${debtId}` },
      ],
    ],
  };
}

export function getMonthReportKeyboard(currentYearMonth) {
  const [year, month] = currentYearMonth.split('-').map(Number);

  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear--;
  }
  const prevStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear++;
  }
  const nextStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;

  return {
    inline_keyboard: [
      [
        { text: '◀️ Oldingi oy', callback_data: `rep_month_${prevStr}` },
        { text: 'Keyingi oy ▶️', callback_data: `rep_month_${nextStr}` },
      ],
      [
        { text: '📈 Doiraviy diagramma', callback_data: `chart_${currentYearMonth}` },
        { text: '📊 Kunlik ustunli grafik', callback_data: `trend_${currentYearMonth}` },
      ],
      [
        { text: '📥 Excel yuklab olish', callback_data: `excel_${currentYearMonth}` },
      ],
    ],
  };
}
