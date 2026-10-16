const { processTextMessage } = require('../services/aiService');
const db = require('../database/db');
const { getTodayString, getCurrentMonthString, formatAddedExpensesMessage } = require('../utils/formatters');
const { getMainKeyboard, getExpenseActionKeyboard } = require('../utils/keyboards');
const { handleMonthlyReport, handleInfographic, handleExcelExport, handleTodayExpenses, handleLast7DaysExpenses, handleRecentExpenses } = require('./reportHandler');
const { handleAIAdvisor, handleForecast, handleBudgetMenu, handleSetBudget } = require('./aiHandler');
const { chatWithFinancialAI } = require('../services/aiService');

/**
 * Handle incoming text messages
 */
async function handleTextMessage(ctx) {
  const text = (ctx.message.text || '').trim();
  const userId = ctx.from.id;
  const username = ctx.from.username;
  const firstName = ctx.from.first_name;

  // Save/update user
  db.saveUser(userId, username, firstName);

  // Check for start command
  if (text === '/start') {
    return handleStartCommand(ctx);
  }

  // Check for help command or menu
  if (text === '/help' || text === 'ℹ️ Qo\'llanma') {
    return handleHelpCommand(ctx);
  }

  // Check limit command: e.g. "/limit 5000000"
  if (text.startsWith('/limit')) {
    const parts = text.split(' ');
    if (parts.length > 1) {
      const amtStr = parts[1].replace(/[^\d]/g, '');
      return handleSetBudget(ctx, amtStr);
    }
    return handleBudgetMenu(ctx);
  }

  // Check menu buttons
  if (text === '📊 Oylik hisobot') {
    return handleMonthlyReport(ctx);
  }
  if (text === '📈 Infografika') {
    return handleInfographic(ctx);
  }
  if (text === '📥 Excel yuklab olish') {
    return handleExcelExport(ctx);
  }
  if (text === '📅 Bugungi xarajatlar') {
    return handleTodayExpenses(ctx);
  }
  if (text === '🗓 Oxirgi 7 kun') {
    return handleLast7DaysExpenses(ctx);
  }
  if (text === '📋 So\'nggi xarajatlar') {
    return handleRecentExpenses(ctx);
  }
  if (text === '🗑 Oxirgisini o\'chirish') {
    return handleUndoLastExpense(ctx);
  }

  // AI Super-features
  if (text === '💡 AI Maslahatchi' || text === '/advisor') {
    return handleAIAdvisor(ctx);
  }
  if (text === '🔮 Kelajak prognozi' || text === '/forecast') {
    return handleForecast(ctx);
  }
  if (text === '🎯 Oylik byudjet' || text === '/budget') {
    return handleBudgetMenu(ctx);
  }

  // Otherwise, user is writing an expense or asking AI a question!
  await ctx.replyWithChatAction('typing');

  try {
    const result = await processTextMessage(text);

    if (!result.has_expenses || !result.expenses || result.expenses.length === 0) {
      // If user is asking a question or talking, let AI answer!
      const monthStr = getCurrentMonthString();
      const userSummary = db.getUserFinancialSummary(userId, monthStr);
      const aiResponse = await chatWithFinancialAI(text, userSummary, firstName);
      return ctx.reply(aiResponse, {
        parse_mode: 'HTML',
        reply_markup: getMainKeyboard()
      });
    }

    // Save batch expenses to database
    const inserted = db.addExpensesBatch(userId, result.expenses, text, 'text');
    const insertedIds = inserted.map(i => i.id);

    // Get today and month totals
    const todayStr = getTodayString();
    const monthStr = getCurrentMonthString();
    const todayTotal = db.getTodayTotal(userId, todayStr);
    const monthTotal = db.getMonthTotal(userId, monthStr);

    const responseMsg = formatAddedExpensesMessage(
      null, // No voice transcription needed for text
      result.expenses,
      todayTotal,
      monthTotal
    );

    return ctx.reply(responseMsg, {
      parse_mode: 'HTML',
      reply_markup: getExpenseActionKeyboard(insertedIds)
    });
  } catch (error) {
    console.error('[TextHandler Error]:', error);
    return ctx.reply(
      `❌ <b>Xatolik yuz berdi:</b>\n<code>${error.message}</code>`,
      { parse_mode: 'HTML' }
    );
  }
}

/**
 * Handle /start command
 */
async function handleStartCommand(ctx) {
  const firstName = ctx.from.first_name || 'foydalanuvchi';
  const welcomeText =
    `👋 <b>Assalomu alaykum, ${firstName}!</b>\n\n` +
    `🤖 Men sizning <b>Shaxsiy AI Buxgalteringizman</b>.\n\n` +
    `Men orqali xarajatlaringizni osongina nazorat qilib borishingiz mumkin:\n\n` +
    `🎙 <b>Ovozli xabar yuboring:</b>\n` +
    `<i>"Bugun taksiga 25 ming, tushlikka 60 ming ishlatdim"</i>\n\n` +
    `✍️ <b>Yoki matn ko'rinishida yozing:</b>\n` +
    `<i>"Bozorlik 250 ming, dorixona 45 ming"</i>\n\n` +
    `✨ <b>Men nimalar qila olaman?</b>\n` +
    `• Ovozli xabarni avtomatik tushunish va matnga aylantirish\n` +
    `• Xarajatlarni intellektual kategoriyalarga ajratish\n` +
    `• Kunlik, haftalik va oylik hisobotlar yuritish\n` +
    `• 📈 Oy oxirida chiroyli <b>infografika va rang-barang diagrammalar</b> tuzish\n` +
    `• 📥 Barcha ma'lumotlarni tartiblangan <b>Excel (.xlsx) jadval</b> qilib yuklab berish\n\n` +
    `Sinab ko'rish uchun hoziroq ovozli yoki matnli xabar yuboring! 👇`;

  return ctx.reply(welcomeText, {
    parse_mode: 'HTML',
    reply_markup: getMainKeyboard()
  });
}

/**
 * Handle /help and FAQ
 */
async function handleHelpCommand(ctx) {
  const helpText =
    `ℹ️ <b>Shaxsiy AI Buxgalter - Qo'llanma</b>\n\n` +
    `<b>1. Xarajat kiritish:</b>\n` +
    `• Ovozli xabar tugmasini bosib ushlab turing va xarajatlaringizni tabiiy tilda ayting (masalan: <i>"Bugun taksiga 25 ming, tushlikka 60 ming ketdi"</i>).\n` +
    `• Yoki oddiy matn sifatida xabar yuboring.\n\n` +
    `<b>2. Kategoriyalar:</b>\n` +
    `AI sizning so'zlaringizdan xarajat turini avtomatik aniqlaydi:\n` +
    `🚕 Transport | 🍔 Oziq-ovqat va Kafe | 🛒 Bozor va Supermarket\n` +
    `💡 Kommunal va Aloqa | 💊 Salomatlik | 🛍 Kiyim | 🎓 Ta'lim\n` +
    `🎮 O'yin-kulgi | 🎁 Ehson va Sovg'a | 🏠 Uy va Ro'zg'or\n\n` +
    `<b>3. Hisobotlar:</b>\n` +
    `• <b>📊 Oylik hisobot</b> - Kategoriyalar bo'yicha jami xarajatlar va foizlar\n` +
    `• <b>📈 Infografika</b> - Chiroyli rang-barang doiraviy diagramma (rasm ko'rinishida)\n` +
    `• <b>📥 Excel hisobot</b> - Barcha tafsilotlar, jadvallar va hisob-kitoblar bilan tayyor .xlsx fayl\n` +
    `• <b>🗑 Oxirgisini o'chirish</b> - Adashib kiritilgan oxirgi xarajatni bekor qilish\n\n` +
    `Savollaringiz bo'lsa, xarajatlaringizni xabar orqali yuborishni boshlang!`;

  return ctx.reply(helpText, {
    parse_mode: 'HTML',
    reply_markup: getMainKeyboard()
  });
}

/**
 * Quick undo of the latest expense
 */
async function handleUndoLastExpense(ctx) {
  const userId = ctx.from.id;
  const lastExpense = db.deleteLastExpense(userId);

  if (!lastExpense) {
    return ctx.reply('⚠️ O\'chirish uchun hech qanday xarajat topilmadi.');
  }

  return ctx.reply(
    `🗑 <b>Oxirgi xarajat o'chirildi:</b>\n` +
    `• <b>${lastExpense.description || lastExpense.category}</b>: ${lastExpense.amount.toLocaleString('uz-UZ')} so'm\n` +
    `📅 Sana: ${lastExpense.expense_date}`,
    { parse_mode: 'HTML' }
  );
}

module.exports = {
  handleTextMessage,
  handleStartCommand,
  handleHelpCommand,
  handleUndoLastExpense
};
