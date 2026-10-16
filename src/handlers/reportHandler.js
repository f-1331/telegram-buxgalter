const { InputFile } = require('grammy');
const fs = require('node:fs');
const db = require('../database/db');
const { generateMonthlyInfographic, generateDailyTrendChart } = require('../services/chartService');
const { generateMonthlyExcel } = require('../services/excelService');
const {
  formatCurrency,
  formatYearMonthUz,
  formatDateUz,
  getCurrentMonthString,
  getTodayString
} = require('../utils/formatters');
const { getCategoryEmoji } = require('../utils/categories');
const { getMonthReportKeyboard } = require('../utils/keyboards');

/**
 * Handle monthly report display
 */
async function handleMonthlyReport(ctx, targetYearMonth = null) {
  const userId = ctx.from.id;
  const yearMonthStr = targetYearMonth || getCurrentMonthString();
  const monthTitle = formatYearMonthUz(yearMonthStr);

  const totalAmount = db.getMonthTotal(userId, yearMonthStr);
  const categoryStats = db.getMonthCategoryBreakdown(userId, yearMonthStr);
  const expenses = db.getMonthExpenses(userId, yearMonthStr);

  if (expenses.length === 0) {
    const text =
      `📅 <b>${monthTitle} oyi bo'yicha hisobot</b>\n\n` +
      `<i>Ushbu oyda hali hech qanday xarajat kiritilmagan.</i>\n\n` +
      `💡 Xarajat qo'shish uchun ovozli yoki matnli xabar yuboring!`;

    if (ctx.callbackQuery) {
      return ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: getMonthReportKeyboard(yearMonthStr)
      });
    }
    return ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: getMonthReportKeyboard(yearMonthStr)
    });
  }

  let reportText = `📊 <b>${monthTitle.toUpperCase()} OYI HISOBOTI</b>\n\n`;
  reportText += `💰 <b>Jami xarajat:</b> ${formatCurrency(totalAmount)}\n`;
  reportText += `📝 <b>Jami yozuvlar:</b> ${expenses.length} ta\n\n`;
  reportText += `📂 <b>Kategoriyalar bo'yicha taqsimot:</b>\n`;

  categoryStats.forEach((cat, idx) => {
    const emoji = getCategoryEmoji(cat.category);
    reportText += `${idx + 1}. ${emoji} <b>${cat.category}:</b> ${formatCurrency(cat.total_amount)} (<i>${cat.percentage}%</i>)\n`;
  });

  const keyboard = getMonthReportKeyboard(yearMonthStr);

  if (ctx.callbackQuery) {
    return ctx.editMessageText(reportText, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  }

  return ctx.reply(reportText, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
}

/**
 * Handle Infographic chart generation and sending
 */
async function handleInfographic(ctx, targetYearMonth = null) {
  const userId = ctx.from.id;
  const yearMonthStr = targetYearMonth || getCurrentMonthString();
  const monthTitle = formatYearMonthUz(yearMonthStr);

  const totalAmount = db.getMonthTotal(userId, yearMonthStr);
  const categoryStats = db.getMonthCategoryBreakdown(userId, yearMonthStr);

  if (!categoryStats || categoryStats.length === 0) {
    return ctx.reply(
      `⚠️ <b>${monthTitle}</b> oyi uchun infografika tuzishga yetarli ma'lumot yo'q.\n` +
      `Avval xarajatlaringizni ovozli yoki matnli xabar orqali yuboring.`,
      { parse_mode: 'HTML' }
    );
  }

  await ctx.replyWithChatAction('upload_photo');
  const waitMsg = await ctx.reply('🎨 <i>Infografika tayyorlanmoqda, iltimos kuting...</i>', { parse_mode: 'HTML' });

  try {
    const imageBuffer = await generateMonthlyInfographic(categoryStats, yearMonthStr, totalAmount);

    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

    const topCategory = categoryStats[0];
    const topEmoji = getCategoryEmoji(topCategory.category);

    const caption =
      `📈 <b>${monthTitle.toUpperCase()} XARAJATLAR INFOGRAFIKASI</b>\n\n` +
      `💰 <b>Jami xarajat:</b> ${formatCurrency(totalAmount)}\n` +
      `🏆 <b>Eng ko'p sarflangan:</b> ${topEmoji} ${topCategory.category} (${formatCurrency(topCategory.total_amount)} - ${topCategory.percentage}%)\n\n` +
      `✨ <i>Shaxsiy AI Buxgalter</i>`;

    return ctx.replyWithPhoto(new InputFile(imageBuffer, `Infografika_${yearMonthStr}.png`), {
      caption: caption,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('[Infographic Error]:', error);
    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    return ctx.reply(`❌ Infografika yaratishda xatolik yuz berdi: ${error.message}`);
  }
}

/**
 * Handle Excel export generation and sending
 */
async function handleExcelExport(ctx, targetYearMonth = null) {
  const userId = ctx.from.id;
  const userName = ctx.from.first_name || 'Foydalanuvchi';
  const yearMonthStr = targetYearMonth || getCurrentMonthString();
  const monthTitle = formatYearMonthUz(yearMonthStr);

  const expenses = db.getMonthExpenses(userId, yearMonthStr);
  const categoryStats = db.getMonthCategoryBreakdown(userId, yearMonthStr);

  if (!expenses || expenses.length === 0) {
    return ctx.reply(
      `⚠️ <b>${monthTitle}</b> oyi uchun Excel hisobot tuzishga xarajatlar topilmadi.`,
      { parse_mode: 'HTML' }
    );
  }

  await ctx.replyWithChatAction('upload_document');
  const waitMsg = await ctx.reply('📑 <i>Excel jadval shakllantirilmoqda...</i>', { parse_mode: 'HTML' });

  try {
    const filePath = await generateMonthlyExcel(expenses, categoryStats, yearMonthStr, userName);
    const totalAmount = db.getMonthTotal(userId, yearMonthStr);

    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

    const caption =
      `📥 <b>${monthTitle.toUpperCase()} OYI EXCEL HISOBOTI</b>\n\n` +
      `📁 <b>Fayl:</b> <code>Hisobot_${yearMonthStr}.xlsx</code>\n` +
      `💰 <b>Jami:</b> ${formatCurrency(totalAmount)}\n` +
      `📝 <b>Jami qatorlar:</b> ${expenses.length} ta\n\n` +
      `<i>Jadvalda xarajatlar tarixi va kategoriyalar tahlili alohida sahifalarda jamlangan.</i>`;

    await ctx.replyWithDocument(new InputFile(filePath, `Hisobot_${yearMonthStr}.xlsx`), {
      caption: caption,
      parse_mode: 'HTML'
    });

    // Clean up exported file after short delay
    setTimeout(() => {
      fs.unlink(filePath, () => {});
    }, 15000);
  } catch (error) {
    console.error('[Excel Export Error]:', error);
    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    return ctx.reply(`❌ Excel hisobotini yaratishda xatolik: ${error.message}`);
  }
}

/**
 * Handle today's expenses list
 */
async function handleTodayExpenses(ctx) {
  const userId = ctx.from.id;
  const todayStr = getTodayString();
  const expenses = db.getTodayExpenses(userId, todayStr);
  const totalAmount = db.getTodayTotal(userId, todayStr);

  if (expenses.length === 0) {
    return ctx.reply(
      `📅 <b>Bugungi xarajatlar (${formatDateUz(todayStr)}):</b>\n\n` +
      `<i>Bugun hali hech qanday xarajat kiritmadingiz.</i>\n\n` +
      `Ovozli xabar orqali: <i>"Taksiga 20 ming, kofega 15 ming berdim"</i> deb yuboring!`,
      { parse_mode: 'HTML' }
    );
  }

  let text = `📅 <b>Bugungi xarajatlar (${formatDateUz(todayStr)}):</b>\n\n`;
  expenses.forEach((item, index) => {
    const emoji = getCategoryEmoji(item.category);
    text += `${index + 1}. ${emoji} <b>${item.description || item.category}</b>: ${formatCurrency(item.amount)}\n`;
  });

  text += `\n💵 <b>Bugungi jami:</b> ${formatCurrency(totalAmount)}`;
  return ctx.reply(text, { parse_mode: 'HTML' });
}

/**
 * Handle last 7 days expenses summary
 */
async function handleLast7DaysExpenses(ctx) {
  const userId = ctx.from.id;
  const expenses = db.getLastNDaysExpenses(userId, 7);

  if (expenses.length === 0) {
    return ctx.reply('🗓 <i>Oxirgi 7 kunda hech qanday xarajat kiritilmagan.</i>', { parse_mode: 'HTML' });
  }

  // Group by date
  const byDate = {};
  let total7Days = 0;

  expenses.forEach(e => {
    if (!byDate[e.expense_date]) {
      byDate[e.expense_date] = [];
    }
    byDate[e.expense_date].push(e);
    total7Days += Number(e.amount);
  });

  let text = `🗓 <b>OXIRGI 7 KUNLIK XARAJATLAR:</b>\n\n`;

  for (const [dateStr, list] of Object.entries(byDate)) {
    const dayTotal = list.reduce((s, x) => s + Number(x.amount), 0);
    text += `📅 <b>${formatDateUz(dateStr)}</b> (Jami: ${formatCurrency(dayTotal)}):\n`;
    list.forEach(item => {
      const emoji = getCategoryEmoji(item.category);
      text += `  • ${emoji} ${item.description || item.category}: ${formatCurrency(item.amount)}\n`;
    });
    text += `\n`;
  }

  text += `💰 <b>7 kunlik jami:</b> ${formatCurrency(total7Days)}`;
  return ctx.reply(text, { parse_mode: 'HTML' });
}

/**
 * Handle recent expenses list
 */
async function handleRecentExpenses(ctx) {
  const userId = ctx.from.id;
  const expenses = db.getRecentExpenses(userId, 10);

  if (expenses.length === 0) {
    return ctx.reply('📋 <i>Xarajatlar tarixi bo\'sh.</i>', { parse_mode: 'HTML' });
  }

  let text = `📋 <b>SO'NGGI 10 TA XARAJAT:</b>\n\n`;
  expenses.forEach((item, index) => {
    const emoji = getCategoryEmoji(item.category);
    text += `${index + 1}. ${emoji} <b>${item.description || item.category}</b> — ${formatCurrency(item.amount)}\n`;
    text += `   📅 ${item.expense_date} | <i>${item.input_type === 'voice' ? '🎙 Ovozli' : '✍️ Matn'}</i>\n`;
  });

  return ctx.reply(text, { parse_mode: 'HTML' });
}

module.exports = {
  handleMonthlyReport,
  handleInfographic,
  handleExcelExport,
  handleTodayExpenses,
  handleLast7DaysExpenses,
  handleRecentExpenses
};
