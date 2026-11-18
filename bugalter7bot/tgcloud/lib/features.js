import { api, InputFile } from 'sdk';
import * as db from './db.js';
import { generateMonthlyInfographic, generateDailyTrendChart } from './charts.js';
import { generateMonthlyExcelBytes } from './excel.js';
import { getAIFinancialAdvice, calculateForecast } from './ai.js';
import {
  formatCurrency,
  formatYearMonthUz,
  formatDateUz,
  getCurrentMonthString,
  getTodayString,
  makeProgressBar,
  escapeHtml,
} from './formatters.js';
import { getCategoryEmoji } from './categories.js';
import { getMonthReportKeyboard, getBudgetSelectionKeyboard } from './keyboards.js';

async function safeDelete(chatId, messageId) {
  try {
    await api.deleteMessage({ chat_id: chatId, message_id: messageId });
  } catch (e) {}
}

export async function handleMonthlyReport(chatId, userId, targetYearMonth = null, editMessageId = null) {
  const yearMonthStr = targetYearMonth || getCurrentMonthString();
  const monthTitle = formatYearMonthUz(yearMonthStr);

  const [totalAmount, categoryStats, monthExpenses] = await Promise.all([
    db.getMonthTotal(userId, yearMonthStr),
    db.getMonthCategoryBreakdown(userId, yearMonthStr),
    db.getMonthExpenses(userId, yearMonthStr),
  ]);

  let text;
  if (monthExpenses.length === 0) {
    text =
      `📅 <b>${monthTitle} oyi bo'yicha hisobot</b>\n\n` +
      `<i>Ushbu oyda hali hech qanday xarajat kiritilmagan.</i>\n\n` +
      `💡 Xarajat qo'shish uchun ovozli yoki matnli xabar yuboring!`;
  } else {
    text = `📊 <b>${monthTitle.toUpperCase()} OYI HISOBOTI</b>\n\n`;
    text += `💰 <b>Jami xarajat:</b> ${formatCurrency(totalAmount)}\n`;
    text += `📝 <b>Jami yozuvlar:</b> ${monthExpenses.length} ta\n\n`;
    text += `📂 <b>Kategoriyalar bo'yicha taqsimot:</b>\n`;
    categoryStats.forEach((cat, idx) => {
      const emoji = getCategoryEmoji(cat.category);
      text += `${idx + 1}. ${emoji} <b>${escapeHtml(cat.category)}:</b> ${formatCurrency(cat.total_amount)} (<i>${cat.percentage}%</i>)\n`;
    });
  }

  const reply_markup = getMonthReportKeyboard(yearMonthStr);

  if (editMessageId) {
    try {
      return await api.editMessageText({
        chat_id: chatId,
        message_id: editMessageId,
        text,
        parse_mode: 'HTML',
        reply_markup,
      });
    } catch (e) {
      if (e.code === 400 && String(e.description).includes('message is not modified')) return;
    }
  }

  return await api.sendMessage({
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup,
  });
}

export async function handleInfographic(chatId, userId, targetYearMonth = null) {
  const yearMonthStr = targetYearMonth || getCurrentMonthString();
  const monthTitle = formatYearMonthUz(yearMonthStr);

  const [totalAmount, categoryStats] = await Promise.all([
    db.getMonthTotal(userId, yearMonthStr),
    db.getMonthCategoryBreakdown(userId, yearMonthStr),
  ]);

  if (!categoryStats || categoryStats.length === 0) {
    return await api.sendMessage({
      chat_id: chatId,
      text:
        `⚠️ <b>${monthTitle}</b> oyi uchun infografika tuzishga yetarli ma'lumot yo'q.\n` +
        `Avval xarajatlaringizni ovozli yoki matnli xabar orqali yuboring.`,
      parse_mode: 'HTML',
    });
  }

  await api.sendChatAction({ chat_id: chatId, action: 'upload_photo' }).catch(() => {});
  const waitMsg = await api.sendMessage({
    chat_id: chatId,
    text: '🎨 <i>Infografika tayyorlanmoqda, iltimos kuting...</i>',
    parse_mode: 'HTML',
  });

  try {
    const pngBytes = await generateMonthlyInfographic(categoryStats, yearMonthStr, totalAmount);
    await safeDelete(chatId, waitMsg.message_id);

    const topCategory = categoryStats[0];
    const topEmoji = getCategoryEmoji(topCategory.category);
    const caption =
      `📈 <b>${monthTitle.toUpperCase()} XARAJATLAR INFOGRAFIKASI</b>\n\n` +
      `💰 <b>Jami xarajat:</b> ${formatCurrency(totalAmount)}\n` +
      `🏆 <b>Eng ko'p sarflangan:</b> ${topEmoji} ${escapeHtml(topCategory.category)} (${formatCurrency(topCategory.total_amount)} - ${topCategory.percentage}%)\n\n` +
      `✨ <i>Shaxsiy AI Buxgalter</i>`;

    return await api.sendPhoto({
      chat_id: chatId,
      photo: new InputFile(pngBytes, `Infografika_${yearMonthStr}.png`, { type: 'image/png' }),
      caption,
      parse_mode: 'HTML',
    });
  } catch (err) {
    await safeDelete(chatId, waitMsg.message_id);
    return await api.sendMessage({
      chat_id: chatId,
      text: `❌ Infografika yaratishda xatolik: ${escapeHtml(err.message)}`,
    });
  }
}

export async function handleDailyTrend(chatId, userId, targetYearMonth = null) {
  const yearMonthStr = targetYearMonth || getCurrentMonthString();
  const monthTitle = formatYearMonthUz(yearMonthStr);

  const dailyStats = await db.getMonthDailyBreakdown(userId, yearMonthStr);
  if (!dailyStats || dailyStats.length === 0) {
    return await api.sendMessage({
      chat_id: chatId,
      text: `⚠️ <b>${monthTitle}</b> oyi uchun kunlik grafik tuzishga xarajatlar topilmadi.`,
      parse_mode: 'HTML',
    });
  }

  await api.sendChatAction({ chat_id: chatId, action: 'upload_photo' }).catch(() => {});
  const waitMsg = await api.sendMessage({
    chat_id: chatId,
    text: '📊 <i>Kunlik dinamika grafigi tayyorlanmoqda...</i>',
    parse_mode: 'HTML',
  });

  try {
    const pngBytes = await generateDailyTrendChart(dailyStats, yearMonthStr);
    await safeDelete(chatId, waitMsg.message_id);

    return await api.sendPhoto({
      chat_id: chatId,
      photo: new InputFile(pngBytes, `Kunlik_trend_${yearMonthStr}.png`, { type: 'image/png' }),
      caption: `📊 <b>${monthTitle.toUpperCase()} — KUNLIK XARAJATLAR DINAMIKASI</b>`,
      parse_mode: 'HTML',
    });
  } catch (err) {
    await safeDelete(chatId, waitMsg.message_id);
    return await api.sendMessage({
      chat_id: chatId,
      text: `❌ Grafik chizishda xatolik: ${escapeHtml(err.message)}`,
    });
  }
}

export async function handleExcelExport(chatId, userId, userName = 'Foydalanuvchi', targetYearMonth = null) {
  const yearMonthStr = targetYearMonth || getCurrentMonthString();
  const monthTitle = formatYearMonthUz(yearMonthStr);

  const [monthExpenses, categoryStats, incomeCategoryStats, balanceSummary] = await Promise.all([
    db.getMonthExpenses(userId, yearMonthStr),
    db.getMonthCategoryBreakdown(userId, yearMonthStr),
    db.getMonthIncomeCategoryBreakdown(userId, yearMonthStr),
    db.getMonthBalanceSummary(userId, yearMonthStr),
  ]);

  if (!monthExpenses || monthExpenses.length === 0) {
    return await api.sendMessage({
      chat_id: chatId,
      text: `⚠️ <b>${monthTitle}</b> oyi uchun Excel hisobot tuzishga yozuvlar topilmadi.`,
      parse_mode: 'HTML',
    });
  }

  await api.sendChatAction({ chat_id: chatId, action: 'upload_document' }).catch(() => {});
  const waitMsg = await api.sendMessage({
    chat_id: chatId,
    text: '📑 <i>Excel jadval shakllantirilmoqda...</i>',
    parse_mode: 'HTML',
  });

  try {
    const bytes = generateMonthlyExcelBytes(monthExpenses, categoryStats, yearMonthStr, userName, incomeCategoryStats);
    await safeDelete(chatId, waitMsg.message_id);

    const sign = balanceSummary.balance >= 0 ? '+' : '';
    const caption =
      `📥 <b>${monthTitle.toUpperCase()} OYI EXCEL HISOBOTI</b>\n\n` +
      `📁 <b>Fayl:</b> <code>Hisobot_${yearMonthStr}.xls</code>\n` +
      `💵 <b>Kirim (Daromad):</b> +${formatCurrency(balanceSummary.income)}\n` +
      `💸 <b>Chiqim (Xarajat):</b> -${formatCurrency(balanceSummary.expense)}\n` +
      `🎯 <b>Sof qoldiq (Balans):</b> <b>${sign}${formatCurrency(balanceSummary.balance)}</b>\n` +
      `📝 <b>Jami yozuvlar:</b> ${monthExpenses.length} ta\n\n` +
      `<i>Jadvalda xarajatlar/daromadlar tarixi va kategoriyalar tahlili 2 ta alohida sahifada rangli ko'rinishda jamlangan.</i>`;

    return await api.sendDocument({
      chat_id: chatId,
      document: new InputFile(bytes, `Hisobot_${yearMonthStr}.xls`, { type: 'application/vnd.ms-excel' }),
      caption,
      parse_mode: 'HTML',
    });
  } catch (err) {
    await safeDelete(chatId, waitMsg.message_id);
    return await api.sendMessage({
      chat_id: chatId,
      text: `❌ Excel hisobotini yaratishda xatolik: ${escapeHtml(err.message)}`,
    });
  }
}

export async function handleTodayExpenses(chatId, userId) {
  const todayStr = getTodayString();
  const [todayExpenses, totalAmount] = await Promise.all([
    db.getTodayExpenses(userId, todayStr),
    db.getTodayTotal(userId, todayStr),
  ]);

  if (todayExpenses.length === 0) {
    return await api.sendMessage({
      chat_id: chatId,
      text:
        `📅 <b>Bugungi xarajatlar (${formatDateUz(todayStr)}):</b>\n\n` +
        `<i>Bugun hali hech qanday xarajat kiritmadingiz.</i>\n\n` +
        `Ovozli xabar orqali: <i>"Taksiga 20 ming, kofega 15 ming berdim"</i> deb yuboring!`,
      parse_mode: 'HTML',
    });
  }

  let text = `📅 <b>Bugungi xarajatlar (${formatDateUz(todayStr)}):</b>\n\n`;
  todayExpenses.forEach((item, index) => {
    const emoji = getCategoryEmoji(item.category);
    const sign = item.type === 'income' ? '+' : '-';
    text += `${index + 1}. ${emoji} <b>${escapeHtml(item.description || item.category)}</b>: ${sign}${formatCurrency(item.amount)}\n`;
  });
  text += `\n💵 <b>Bugungi jami chiqim:</b> ${formatCurrency(totalAmount)}`;

  return await api.sendMessage({ chat_id: chatId, text, parse_mode: 'HTML' });
}

export async function handleLast7DaysExpenses(chatId, userId) {
  const list = await db.getLastNDaysExpenses(userId, 7);
  if (list.length === 0) {
    return await api.sendMessage({
      chat_id: chatId,
      text: '🗓 <i>Oxirgi 7 kunda hech qanday xarajat kiritilmagan.</i>',
      parse_mode: 'HTML',
    });
  }

  const byDate = {};
  let total7Days = 0;
  list.forEach((e) => {
    if (!byDate[e.expense_date]) byDate[e.expense_date] = [];
    byDate[e.expense_date].push(e);
    if (!e.type || e.type === 'expense') total7Days += Number(e.amount);
  });

  let text = `🗓 <b>OXIRGI 7 KUNLIK XARAJATLAR:</b>\n\n`;
  for (const [dateStr, items] of Object.entries(byDate)) {
    const dayTotal = items.reduce((s, x) => s + Number(x.amount), 0);
    text += `📅 <b>${formatDateUz(dateStr)}</b> (Jami: ${formatCurrency(dayTotal)}):\n`;
    items.forEach((item) => {
      const emoji = getCategoryEmoji(item.category);
      text += `  • ${emoji} ${escapeHtml(item.description || item.category)}: ${formatCurrency(item.amount)}\n`;
    });
    text += '\n';
  }
  text += `💰 <b>7 kunlik jami chiqim:</b> ${formatCurrency(total7Days)}`;

  return await api.sendMessage({ chat_id: chatId, text, parse_mode: 'HTML' });
}

export async function handleRecentExpenses(chatId, userId) {
  const list = await db.getRecentExpenses(userId, 10);
  if (list.length === 0) {
    return await api.sendMessage({
      chat_id: chatId,
      text: "📋 <i>Xarajatlar tarixi bo'sh.</i>",
      parse_mode: 'HTML',
    });
  }

  let text = `📋 <b>SO'NGGI 10 TA YOZUV:</b>\n\n`;
  list.forEach((item, index) => {
    const emoji = getCategoryEmoji(item.category);
    const sign = item.type === 'income' ? '+' : '-';
    const typeLbl = item.input_type === 'voice' ? '🎙 Ovozli' : item.input_type === 'photo' ? '🧾 Chek' : '✍️ Matn';
    text += `${index + 1}. ${emoji} <b>${escapeHtml(item.description || item.category)}</b> — ${sign}${formatCurrency(item.amount)}\n`;
    text += `   📅 ${item.expense_date} | <i>${typeLbl}</i>\n`;
  });

  return await api.sendMessage({ chat_id: chatId, text, parse_mode: 'HTML' });
}

export async function handleIncomeAndBalance(chatId, userId, editMessageId = null) {
  const monthStr = getCurrentMonthString();
  const monthTitle = formatYearMonthUz(monthStr);

  const [balanceSummary, incomeCats] = await Promise.all([
    db.getMonthBalanceSummary(userId, monthStr),
    db.getMonthIncomeCategoryBreakdown(userId, monthStr),
  ]);

  let text = `💰 <b>${monthTitle.toUpperCase()} — DAROMAD VA QOLDIQ</b>\n\n`;
  text += `💵 <b>Jami daromad (Kirim):</b> +${formatCurrency(balanceSummary.income)}\n`;
  text += `💸 <b>Jami xarajat (Chiqim):</b> -${formatCurrency(balanceSummary.expense)}\n`;

  const sign = balanceSummary.balance >= 0 ? '+' : '';
  const balanceEmoji = balanceSummary.balance >= 0 ? '🟢' : '🔴';
  text += `${balanceEmoji} <b>Sof qoldiq (Balans):</b> <b>${sign}${formatCurrency(balanceSummary.balance)}</b>\n`;

  if (balanceSummary.income > 0) {
    text += `📊 <b>Jamg'arma darajasi:</b> ${balanceSummary.savingsRate}%\n\n`;
  } else {
    text += '\n';
  }

  if (incomeCats && incomeCats.length > 0) {
    text += `📂 <b>Daromad manbalari bo'yicha:</b>\n`;
    incomeCats.forEach((c, i) => {
      const emoji = getCategoryEmoji(c.category);
      text += `${i + 1}. ${emoji} <b>${escapeHtml(c.category)}:</b> +${formatCurrency(c.total_amount)} (<i>${c.percentage}%</i>)\n`;
    });
    text += '\n';
  }

  if (balanceSummary.income === 0 && balanceSummary.expense === 0) {
    text += `<i>Ushbu oyda hali hech qanday kirim yoki chiqim kiritilmagan.</i>\n\n`;
  }

  text +=
    `💡 <b>Yoki yozing:</b> <code>/oylik 5000000</code> yoki <code>oylik 5 mln</code>\n\n` +
    `👇 <b>Tezkor daromad qo'shish uchun tanlang:</b>`;

  const reply_markup = {
    inline_keyboard: [
      [
        { text: '➕ 3 000 000', callback_data: 'add_inc_3000000' },
        { text: '➕ 5 000 000', callback_data: 'add_inc_5000000' },
      ],
      [
        { text: '➕ 7 000 000', callback_data: 'add_inc_7000000' },
        { text: '➕ 10 000 000', callback_data: 'add_inc_10000000' },
      ],
      [
        { text: '➕ 15 000 000', callback_data: 'add_inc_15000000' },
        { text: '➕ 20 000 000', callback_data: 'add_inc_20000000' },
      ],
    ],
  };

  if (editMessageId) {
    try {
      return await api.editMessageText({
        chat_id: chatId,
        message_id: editMessageId,
        text,
        parse_mode: 'HTML',
        reply_markup,
      });
    } catch (e) {}
  }

  return await api.sendMessage({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup });
}

export async function handleDebtBook(chatId, userId) {
  const debts = await db.getPendingDebts(userId);
  let text = `🤝 <b>QARZ DAFTARI (Ochiq qarzlar)</b>\n\n`;

  text += `🔴 <b>Menga berilishi kerak (Qarz berganman):</b>\n`;
  if (debts.lend.length === 0) {
    text += `<i>Hozircha hech kimdan qarz kutilmayapti.</i>\n\n`;
  } else {
    debts.lend.forEach((d, idx) => {
      text += `${idx + 1}. 👤 <b>${escapeHtml(d.personName)}</b>: ${formatCurrency(d.amount)}\n`;
      if (d.description) text += `   📝 <i>${escapeHtml(d.description)}</i>\n`;
      if (d.createdAt) text += `   📅 ${d.createdAt.substring(0, 10)}\n`;
    });
    text += `👉 <b>Jami kutilayotgan:</b> ${formatCurrency(debts.totalLend)}\n\n`;
  }

  text += `🟢 <b>Men berishim kerak (Qarz olganman):</b>\n`;
  if (debts.borrow.length === 0) {
    text += `<i>Sizda to'lanishi kerak bo'lgan qarzlar yo'q.</i>\n\n`;
  } else {
    debts.borrow.forEach((d, idx) => {
      text += `${idx + 1}. 👤 <b>${escapeHtml(d.personName)}</b>: ${formatCurrency(d.amount)}\n`;
      if (d.description) text += `   📝 <i>${escapeHtml(d.description)}</i>\n`;
      if (d.createdAt) text += `   📅 ${d.createdAt.substring(0, 10)}\n`;
    });
    text += `👉 <b>Jami to'lanishi kerak:</b> ${formatCurrency(debts.totalBorrow)}\n\n`;
  }

  const netDebt = debts.totalLend - debts.totalBorrow;
  const netSign = netDebt >= 0 ? '+' : '';
  text += `⚖️ <b>Sof qarz balansi:</b> <b>${netSign}${formatCurrency(netDebt)}</b>\n\n`;
  text += `💡 <i>Yangi qarz qo'shish uchun shunchaki ayting yoki yozing:</i>\n`;
  text += `• <i>"Akromga 200 ming qarz berdim"</i>\n`;
  text += `• <i>"Sobirdan 150 ming qarz oldim"</i>`;

  const allPending = [...debts.lend, ...debts.borrow];
  if (allPending.length > 0) {
    const inline_keyboard = allPending.slice(0, 6).map((d) => [
      { text: `✅ ${d.personName} (${formatCurrency(d.amount)}) uzildi`, callback_data: `settle_debt_${d.id}` },
    ]);
    return await api.sendMessage({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard },
    });
  }

  return await api.sendMessage({ chat_id: chatId, text, parse_mode: 'HTML' });
}

export async function handleSearchExpenses(chatId, userId, query = '') {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) {
    return await api.sendMessage({
      chat_id: chatId,
      text:
        `🔍 <b>Xarajat yoki daromadlarni qidirish:</b>\n\n` +
        `Qidirish uchun quyidagicha xabar yuboring:\n` +
        `• <code>/search taksi</code>\n` +
        `• <code>/search bozorlik</code>\n` +
        `• <code>/search oylik</code>\n` +
        `• <code>/search korzinka</code>`,
      parse_mode: 'HTML',
    });
  }

  const results = await db.searchExpenses(userId, cleanQuery, 20);
  if (results.length === 0) {
    return await api.sendMessage({
      chat_id: chatId,
      text: `🔍 "<b>${escapeHtml(cleanQuery)}</b>" so'zi bo'yicha hech qanday yozuv topilmadi.`,
      parse_mode: 'HTML',
    });
  }

  let text = `🔍 "<b>${escapeHtml(cleanQuery)}</b>" bo'yicha topilgan yozuvlar (${results.length} ta):\n\n`;
  let totalFound = 0;
  results.forEach((item, idx) => {
    const isIncome = item.type === 'income';
    const emoji = getCategoryEmoji(item.category);
    const sign = isIncome ? '+' : '-';
    totalFound += Number(item.amount);
    text += `${idx + 1}. ${emoji} <b>${escapeHtml(item.description || item.category)}</b>: ${sign}${formatCurrency(item.amount)}\n`;
    text += `   📅 ${formatDateUz(item.expense_date)} | <i>${escapeHtml(item.category)}</i>\n`;
  });
  text += `\n💰 <b>Topilganlar umumiy summasi:</b> ${formatCurrency(totalFound)}`;

  return await api.sendMessage({ chat_id: chatId, text, parse_mode: 'HTML' });
}

export async function handleAIAdvisor(chatId, userId, firstName = 'Foydalanuvchi') {
  const monthStr = getCurrentMonthString();
  await api.sendChatAction({ chat_id: chatId, action: 'typing' }).catch(() => {});
  const waitMsg = await api.sendMessage({
    chat_id: chatId,
    text: '🧠 <i>Xarajatlaringiz AI orqali tahlil qilinmoqda...</i>',
    parse_mode: 'HTML',
  });

  try {
    const summary = await db.getUserFinancialSummary(userId, monthStr);
    const advice = await getAIFinancialAdvice(summary, firstName);
    await safeDelete(chatId, waitMsg.message_id);
    return await api.sendMessage({ chat_id: chatId, text: advice, parse_mode: 'HTML' });
  } catch (err) {
    await safeDelete(chatId, waitMsg.message_id);
    return await api.sendMessage({
      chat_id: chatId,
      text: `❌ Maslahat tayyorlashda xatolik: ${escapeHtml(err.message)}`,
    });
  }
}

export async function handleForecast(chatId, userId) {
  const monthStr = getCurrentMonthString();
  const monthTitle = formatYearMonthUz(monthStr);
  const summary = await db.getUserFinancialSummary(userId, monthStr);
  const forecast = calculateForecast(summary);

  let msg = `🔮 <b>${monthTitle.toUpperCase()} OYI UCHUN KELAJAK PROGNOZI</b>\n\n`;
  msg += `📅 <b>Oy davomiyligi:</b> ${forecast.currentDay} / ${forecast.totalDaysInMonth}-kun (qolgan: ${forecast.remainingDays} kun)\n`;
  msg += `💸 <b>Hozirgacha sarflandi:</b> ${formatCurrency(forecast.totalMonth)}\n`;
  msg += `⚡️ <b>O'rtacha kunlik xarajat:</b> ${formatCurrency(forecast.avgDaily)} / kun\n\n`;
  msg += `🎯 <b>Kutilayotgan oy oxiri jami:</b> ~<b>${formatCurrency(forecast.projectedTotal)}</b>\n\n`;

  if (forecast.budget > 0) {
    msg += `──────────────\n`;
    msg += `🎯 <b>Oylik belgilangan limit:</b> ${formatCurrency(forecast.budget)}\n`;
    msg += `📊 <b>Limitning ishlatilishi:</b> ${forecast.budgetPct}%\n\n`;
    if (forecast.isExceeded) {
      msg += `🚨 <b>OGOHLANTIRISH:</b> Belgilangan byudjetdan ${formatCurrency(forecast.totalMonth - forecast.budget)} ga oshib ketdingiz!`;
    } else if (forecast.isClose) {
      msg += `⚠️ <b>DIQQAT:</b> Byudjetingizning ${forecast.budgetPct}% qismi tugadi! Qolgan: <b>${formatCurrency(forecast.budget - forecast.totalMonth)}</b>.`;
    } else {
      msg += `✅ <b>Ajoyib!</b> Xarajatlaringiz limit doirasida xavfsiz nazorat qilinmoqda.`;
    }
  } else {
    msg += `💡 <i>Oylik byudjet belgilash uchun "🎯 Oylik byudjet" tugmasini bosing.</i>`;
  }

  return await api.sendMessage({ chat_id: chatId, text: msg, parse_mode: 'HTML' });
}

export async function handleBudgetMenu(chatId, userId) {
  const currentBudget = await db.getUserBudget(userId);
  let text = `🎯 <b>OYLIK BYUDJET VA XARAJATLAR LIMITI</b>\n\n`;
  if (currentBudget > 0) {
    text += `Hozirgi oylik limit: <b>${formatCurrency(currentBudget)}</b>\n\n`;
    text += `Limitni o'zgartirish uchun tugmani tanlang yoki <code>/limit 7000000</code> deb yozing:`;
  } else {
    text += `Sizda hali oylik xarajatlar limiti belgilanmagan.\n\nOylik rejangizni tanlang yoki <code>/limit 5000000</code> deb yozing:`;
  }

  return await api.sendMessage({
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: getBudgetSelectionKeyboard(),
  });
}

export async function handleSetBudget(chatId, userId, amount) {
  const num = Math.round(Number(amount));
  if (isNaN(num) || num <= 0) {
    return await api.sendMessage({
      chat_id: chatId,
      text: "⚠️ Iltimos, limit miqdorini to'g'ri raqamda kiriting. Masalan: <code>/limit 5000000</code>",
      parse_mode: 'HTML',
    });
  }

  await db.setUserBudget(userId, num);
  return await api.sendMessage({
    chat_id: chatId,
    text:
      `✅ <b>Oylik xarajat limiti saqlandi!</b>\n\n` +
      `Yangi oylik byudjet: <b>${formatCurrency(num)}</b>\n\n` +
      `Endi AI buxgalter sizning har bir xarajatingizni ushbu limitga nisbatan kuzatib boradi.`,
    parse_mode: 'HTML',
  });
}

export async function handleGoalsMenu(chatId, userId) {
  const userGoals = await db.getUserGoals(userId);
  let text = `🎯 <b>MOLIYAVIY JAMG'ARMA MAQSADLARI</b>\n\n`;

  if (userGoals.length === 0) {
    text +=
      `<i>Sizda hali hech qanday jamg'arma maqsadi yo'q.</i>\n\n` +
      `➕ <b>Yangi maqsad yaratish:</b>\n` +
      `<code>/yangi_maqsad iPhone 15000000</code>\n` +
      `<code>/yangi_maqsad Sayohat 10000000</code>`;
    return await api.sendMessage({ chat_id: chatId, text, parse_mode: 'HTML' });
  }

  const inline_keyboard = [];
  userGoals.forEach((g, idx) => {
    const target = Number(g.targetAmount);
    const current = Number(g.currentAmount || 0);
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    const isReached = g.status === 'reached' || current >= target;

    text += `${idx + 1}. ${isReached ? '🎉' : '🎯'} <b>${escapeHtml(g.title)}</b> ${isReached ? '<b>(ERISHILDI!)</b>' : ''}\n`;
    text += `   💰 <b>Yig'ildi:</b> ${formatCurrency(current)} / ${formatCurrency(target)} (<i>${pct}%</i>)\n`;
    text += `   [${makeProgressBar(pct)}]\n\n`;

    if (!isReached) {
      inline_keyboard.push([
        { text: `➕ ${g.title} (+100k)`, callback_data: `goal_add_${g.id}_100000` },
        { text: `➕ (+500k)`, callback_data: `goal_add_${g.id}_500000` },
      ]);
    }
    inline_keyboard.push([{ text: `🗑 O'chirish (${g.title})`, callback_data: `goal_del_${g.id}` }]);
  });

  text +=
    `💡 <b>Ko'proq qo'shish uchun:</b>\n` +
    `<code>/maqsad_plus [№] [summa]</code> — masalan: <code>/maqsad_plus 1 1000000</code>`;

  return await api.sendMessage({
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard },
  });
}

export async function handleSubscriptionsMenu(chatId, userId) {
  const subs = await db.getUserSubscriptions(userId);
  let text = `🔄 <b>DOIMIY TO'LOVLAR VA OBUNALAR</b>\n\n`;

  if (subs.length === 0) {
    text +=
      `<i>Sizda doimiy to'lovlar kiritilmagan.</i>\n\n` +
      `➕ <b>Yangi doimiy to'lov qo'shish:</b>\n` +
      `<code>/doimiy Internet 150000 5</code>\n` +
      `<code>/doimiy Ijara 3000000 1</code>`;
    return await api.sendMessage({ chat_id: chatId, text, parse_mode: 'HTML' });
  }

  let totalMonthly = 0;
  const inline_keyboard = [];
  subs.forEach((s, idx) => {
    const amt = Number(s.amount);
    totalMonthly += amt;
    text += `${idx + 1}. 📌 <b>${escapeHtml(s.title)}</b>: ${formatCurrency(amt)}\n`;
    text += `   📅 Har oyning <b>${s.dayOfMonth}-kunida</b> | <i>${escapeHtml(s.category)}</i>\n\n`;
    inline_keyboard.push([{ text: `🗑 O'chirish (${s.title})`, callback_data: `sub_del_${s.id}` }]);
  });

  text +=
    `──────────────\n` +
    `💵 <b>Jami oylik majburiy xarajat:</b> <b>${formatCurrency(totalMonthly)}</b>\n\n` +
    `➕ <b>Yana qo'shish:</b> <code>/doimiy Kurs 500000 10</code>`;

  return await api.sendMessage({
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard },
  });
}

export async function handleSettingsMenu(chatId, userId) {
  const user = (await db.getUser(userId)) || {};
  const reminderStatus = user.dailyReminder === 1 ? '✅ Yoqilgan' : "❌ O'chirilgan";
  const currentBudget = user.monthlyBudget > 0 ? formatCurrency(user.monthlyBudget) : 'Belgilanmagan';

  const text =
    `⚙️ <b>SHAXSIY SOZLAMALAR VA BOSHQARUV</b>\n\n` +
    `👤 <b>Foydalanuvchi:</b> ${escapeHtml(user.firstName || 'Foydalanuvchi')}\n` +
    `🔔 <b>Kechki eslatma:</b> ${reminderStatus}\n` +
    `🎯 <b>Oylik xarajat limiti:</b> ${currentBudget}\n` +
    `☁️ <b>Platforma:</b> Telegram Serverless (24/7 Bulut)\n\n` +
    `Quyidagi tugmalar orqali sozlamalarni o'zgartirishingiz mumkin:`;

  const reply_markup = {
    inline_keyboard: [
      [{ text: user.dailyReminder === 1 ? "🔕 Eslatmani o'chirish" : '🔔 Eslatmani yoqish', callback_data: 'toggle_reminder' }],
      [{ text: "🎯 Byudjetni o'zgartirish", callback_data: 'open_budget_menu' }],
      [{ text: '📊 Kunlik dinamika grafigi', callback_data: 'show_daily_trend' }],
      [{ text: '⚠️ Barcha tariximni tozalash', callback_data: 'ask_reset_data' }],
    ],
  };

  return await api.sendMessage({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup });
}
