const { processTextMessage, chatWithFinancialAI } = require('../services/aiService');
const db = require('../database/db');
const { getTodayString, getCurrentMonthString, formatAddedExpensesMessage, formatCurrency } = require('../utils/formatters');
const { getMainKeyboard, getExpenseActionKeyboard, getDebtActionKeyboard } = require('../utils/keyboards');
const {
  handleMonthlyReport,
  handleInfographic,
  handleExcelExport,
  handleTodayExpenses,
  handleLast7DaysExpenses,
  handleRecentExpenses,
  handleIncomeAndBalance,
  handleDebtBook,
  handleSearchExpenses
} = require('./reportHandler');
const { handleAIAdvisor, handleForecast, handleBudgetMenu, handleSetBudget } = require('./aiHandler');
const { handleGoalsMenu, handleSubscriptionsMenu } = require('./goalHandler');
const { handleSettingsMenu } = require('./settingsHandler');

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

  // Direct salary/income commands: e.g. "/oylik 5000000", "/daromad 6 mln", "/kirim 4.5 mln"
  if (text.startsWith('/oylik') || text.startsWith('/daromad') || text.startsWith('/kirim')) {
    const parts = text.split(/\s+/);
    if (parts.length > 1) {
      const amtStr = parts.slice(1).join(' ');
      const { parseUzbekNumber } = require('../services/aiService');
      const amount = parseUzbekNumber(amtStr);
      if (amount > 0) {
        const todayStr = getTodayString();
        const monthStr = getCurrentMonthString();
        const inserted = db.addExpense({
          userId,
          amount,
          category: 'Oylik va Ish haqi',
          description: 'Oylik daromad',
          expenseDate: todayStr,
          rawInput: text,
          inputType: 'text',
          type: 'income'
        });
        const todayTotal = db.getTodayTotal(userId, todayStr);
        const balanceSummary = db.getMonthBalanceSummary(userId, monthStr);
        const userBudget = db.getUserBudget(userId);

        const responseMsg = formatAddedExpensesMessage(
          null,
          [{ amount, type: 'income', category: 'Oylik va Ish haqi', description: 'Oylik daromad', date: todayStr }],
          todayTotal,
          balanceSummary.expense,
          balanceSummary.income,
          balanceSummary.balance,
          userBudget
        );

        return ctx.reply(responseMsg, {
          parse_mode: 'HTML',
          reply_markup: getExpenseActionKeyboard([inserted.id])
        });
      }
    }
    return ctx.reply('⚠️ Format: <code>/oylik [summa]</code>\nMasalan: <code>/oylik 5000000</code> yoki <code>/daromad 6 mln</code>', { parse_mode: 'HTML' });
  }

  // Search commands: e.g. "/search taksi" or "/qidiruv bozorlik"
  if (text.startsWith('/search') || text.startsWith('/qidiruv')) {
    const query = text.replace(/^\/(search|qidiruv)/i, '').trim();
    return handleSearchExpenses(ctx, query);
  }

  // Financial Goals commands
  if (text.startsWith('/yangi_maqsad')) {
    const parts = text.split(/\s+/);
    if (parts.length >= 3) {
      const title = parts.slice(1, -1).join(' ');
      const amountStr = parts[parts.length - 1].replace(/[^\d]/g, '');
      const targetAmount = Number(amountStr);
      if (title && targetAmount > 0) {
        db.addGoal({ userId, title, targetAmount });
        return ctx.reply(
          `🎉 <b>Yangi maqsad yaratildi!</b>\n\n` +
          `🎯 <b>Maqsad:</b> ${title}\n` +
          `💰 <b>Kutilayotgan summa:</b> ${formatCurrency(targetAmount)}\n\n` +
          `Jamg'arma to'planganda, unga pul qo'shib borishingiz mumkin!`,
          { parse_mode: 'HTML', reply_markup: getMainKeyboard() }
        );
      }
    }
    return ctx.reply('⚠️ Format: <code>/yangi_maqsad [nomi] [summa]</code>\nMasalan: <code>/yangi_maqsad iPhone 15000000</code>', { parse_mode: 'HTML' });
  }

  if (text.startsWith('/maqsad_plus')) {
    const parts = text.split(/\s+/);
    if (parts.length >= 3) {
      const goalIndex = parseInt(parts[1], 10);
      const amount = Number(parts[2].replace(/[^\d]/g, ''));
      const goals = db.getUserGoals(userId);
      const goal = goals[goalIndex - 1] || goals.find(g => g.id === goalIndex);
      if (goal && amount > 0) {
        const res = db.addMoneyToGoal(goal.id, userId, amount);
        const congrats = res.isReached ? '\n\n🎉 <b>TABRIKLAYMIZ! Ushbu maqsadga to\'liq erishildi!</b>' : '';
        return ctx.reply(
          `✅ <b>"${goal.title}"</b> maqsadiga ${formatCurrency(amount)} qo'shildi!${congrats}\n\n` +
          `💰 Jami yig'ildi: ${formatCurrency(res.current_amount)} / ${formatCurrency(res.target_amount)}`,
          { parse_mode: 'HTML' }
        );
      }
    }
    return ctx.reply('⚠️ Format: <code>/maqsad_plus [№] [summa]</code>\nMasalan: <code>/maqsad_plus 1 500000</code>', { parse_mode: 'HTML' });
  }

  // Recurring Subscriptions commands
  if (text.startsWith('/doimiy')) {
    const parts = text.split(/\s+/);
    if (parts.length >= 3) {
      const title = parts[1];
      const amount = Number(parts[2].replace(/[^\d]/g, ''));
      const day = parts.length >= 4 ? parseInt(parts[3], 10) : 1;
      if (title && amount > 0) {
        db.addSubscription({ userId, title, amount, dayOfMonth: day });
        return ctx.reply(
          `✅ <b>Yangi doimiy to'lov saqlandi!</b>\n\n` +
          `📌 <b>Nomi:</b> ${title}\n` +
          `💰 <b>Summa:</b> ${formatCurrency(amount)}\n` +
          `📅 <b>To'lov kuni:</b> Har oyning ${day}-kunida`,
          { parse_mode: 'HTML' }
        );
      }
    }
    return ctx.reply('⚠️ Format: <code>/doimiy [nomi] [summa] [oy kuni]</code>\nMasalan: <code>/doimiy Internet 150000 5</code>', { parse_mode: 'HTML' });
  }

  // Check menu buttons
  if (text === '📊 Oylik hisobot') {
    return handleMonthlyReport(ctx);
  }
  if (text === '📈 Infografika') {
    return handleInfographic(ctx);
  }
  if (text === '📥 Excel hisobot' || text === '📥 Excel yuklab olish') {
    return handleExcelExport(ctx);
  }
  if (text === '💰 Daromad & Qoldiq' || text === '/balance') {
    return handleIncomeAndBalance(ctx);
  }
  if (text === '🤝 Qarz daftari' || text === '/debts') {
    return handleDebtBook(ctx);
  }
  if (text === '📅 Bugungi hisob' || text === '📅 Bugungi xarajatlar') {
    return handleTodayExpenses(ctx);
  }
  if (text === '🗓 Oxirgi 7 kun') {
    return handleLast7DaysExpenses(ctx);
  }
  if (text === '📋 So\'nggi xarajatlar') {
    return handleRecentExpenses(ctx);
  }
  if (text === '🔍 Qidiruv') {
    return handleSearchExpenses(ctx, '');
  }
  if (text === '🎯 Jamg\'arma maqsadlari' || text === '/goals') {
    return handleGoalsMenu(ctx);
  }
  if (text === '🔄 Doimiy to\'lovlar' || text === '/subscriptions') {
    return handleSubscriptionsMenu(ctx);
  }
  if (text === '⚙️ Sozlamalar' || text === '/settings') {
    return handleSettingsMenu(ctx);
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

  // Otherwise, user is writing an expense/income/debt or asking AI a question!
  await ctx.replyWithChatAction('typing');

  try {
    const result = await processTextMessage(text);

    // 1. Check if debts were detected
    if (result.debts && result.debts.length > 0) {
      for (const d of result.debts) {
        const debt = db.addDebt({
          userId,
          personName: d.personName,
          amount: d.amount,
          type: d.type,
          description: d.description
        });

        const actionText = d.type === 'lend'
          ? `🔴 <b>${d.personName}</b>ga ${formatCurrency(d.amount)} qarz berildi!`
          : `🟢 <b>${d.personName}</b>dan ${formatCurrency(d.amount)} qarz olindi!`;

        await ctx.reply(
          `🤝 <b>Qarz daftari yangilandi:</b>\n\n${actionText}\n\n` +
          `Qarz uzilganda, pastdagi tugma orqali yopishingiz mumkin.`,
          {
            parse_mode: 'HTML',
            reply_markup: getDebtActionKeyboard(debt.id)
          }
        );
      }
    }

    // 2. Check if expenses or incomes were detected
    if (result.expenses && result.expenses.length > 0) {
      const inserted = db.addExpensesBatch(userId, result.expenses, text, 'text');
      const insertedIds = inserted.map(i => i.id);

      const todayStr = getTodayString();
      const monthStr = getCurrentMonthString();
      const todayTotal = db.getTodayTotal(userId, todayStr);
      const balanceSummary = db.getMonthBalanceSummary(userId, monthStr);
      const userBudget = db.getUserBudget(userId);

      const responseMsg = formatAddedExpensesMessage(
        null, // No transcription needed for text
        result.expenses,
        todayTotal,
        balanceSummary.expense,
        balanceSummary.income,
        balanceSummary.balance,
        userBudget
      );

      return ctx.reply(responseMsg, {
        parse_mode: 'HTML',
        reply_markup: getExpenseActionKeyboard(insertedIds)
      });
    }

    // 3. If neither debts nor expenses found
    if (!result.debts || result.debts.length === 0) {
      const monthStr = getCurrentMonthString();
      const userSummary = db.getUserFinancialSummary(userId, monthStr);
      const aiResponse = await chatWithFinancialAI(text, userSummary, firstName);
      return ctx.reply(aiResponse, {
        parse_mode: 'HTML',
        reply_markup: getMainKeyboard()
      });
    }
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
    `🤖 Men sizning intellektual <b>Shaxsiy AI Buxgalteringizman</b>.\n\n` +
    `Menga moliyangizni boshqarish juda oson:\n\n` +
    `🎙 <b>Ovozli yoki 📹 Video xabar yuboring:</b>\n` +
    `<i>"Bugun taksiga 25 ming, tushlikka 60 ming ishlatdim"</i>\n` +
    `<i>"Oyligim 6 million tushdi"</i>\n\n` +
    `🧾 <b>Yoki chek / to'lov skrinshotini rasm qilib tashlang:</b>\n` +
    `Korzinka, Makro cheklari yoki Click/Payme to'lov skrinshotlarini AI o'zi o'qib oladi!\n\n` +
    `✍️ <b>Yoki oddiy matn ko'rinishida yozing:</b>\n` +
    `<i>"Bozorlik 250 ming, dorixona 45 ming"</i>\n` +
    `<i>"Akromga 150 ming qarz berdim"</i>\n\n` +
    `✨ <b>Asosiy imkoniyatlar:</b>\n` +
    `• 💰 <b>Kirim & Qoldiq:</b> Oylik daromad va sof jamg'arma nazorati\n` +
    `• 🤝 <b>Qarz daftari:</b> Berilgan va olingan qarzlar hisobi\n` +
    `• 🎯 <b>Jamg'arma maqsadlari:</b> Katta orzularga maqsadli pul yig'ish\n` +
    `• 🔄 <b>Doimiy to'lovlar:</b> Majburiy oylik obuna va xarajatlar ro'yxati\n` +
    `• 📈 <b>Infografika & Ustunli grafiklar:</b> Rang-barang vizual tahlillar\n` +
    `• 📥 <b>Professional Excel hisobot:</b> Bir klikda tayyor .xlsx jadval\n\n` +
    `Sinab ko'rish uchun hoziroq ovozli xabar yoki xarajat yuboring! 👇`;

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
    `ℹ️ <b>Shaxsiy AI Buxgalter - To'liq qo'llanma</b>\n\n` +
    `<b>1. Xarajat va Daromad kiritish:</b>\n` +
    `• 🎙 <b>Ovozli xabar:</b> Gapiring (masalan: <i>"Bozorga 180 ming, dorixonaga 35 ming ketdi"</i>).\n` +
    `• 📹 <b>Dumaloq video:</b> Video orqali ham tushunadi.\n` +
    `• 🧾 <b>Chek fotosi:</b> Do'kon cheki yoki Click/Payme skrinshotini rasm qilib yuboring.\n` +
    `• ✍️ <b>Matn:</b> Istalgan shaklda yozing.\n\n` +
    `<b>2. Qarzlar va Jamg'armalar:</b>\n` +
    `• Qarz: <i>"Aliga 100 ming qarz berdim"</i> yoki <i>"Sobirdan 50 ming qarz oldim"</i>.\n` +
    `• Maqsad: <code>/yangi_maqsad iPhone 15000000</code>.\n` +
    `• Doimiy to'lov: <code>/doimiy Internet 150000 5</code>.\n\n` +
    `<b>3. Hisobotlar va Tahlil:</b>\n` +
    `• <b>📊 Oylik hisobot</b> — barcha kategoriyalar foizlari bilan\n` +
    `• <b>📈 Infografika</b> — chiroyli doiraviy va ustunli diagrammalar\n` +
    `• <b>📥 Excel hisobot</b> — to'liq filtrlanadigan .xlsx fayl\n` +
    `• <b>💡 AI Maslahatchi</b> — xarajatlaringiz asosida tejash strategiyasi\n` +
    `• <b>⚙️ Sozlamalar</b> — eslatmalar va ma'lumotlarni boshqarish`;

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
    `🗑 <b>Oxirgi yozuv o'chirildi:</b>\n` +
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
