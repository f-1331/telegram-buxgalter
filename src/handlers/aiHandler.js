const db = require('../database/db');
const { getAIFinancialAdvice, calculateForecast, chatWithFinancialAI } = require('../services/aiService');
const { getCurrentMonthString, formatCurrency, formatYearMonthUz } = require('../utils/formatters');
const { getBudgetSelectionKeyboard } = require('../utils/keyboards');

/**
 * Handle AI Financial Advisor button
 */
async function handleAIAdvisor(ctx) {
  const userId = ctx.from.id;
  const firstName = ctx.from.first_name || 'Foydalanuvchi';
  const monthStr = getCurrentMonthString();

  await ctx.replyWithChatAction('typing');
  const waitMsg = await ctx.reply('🧠 <i>Xarajatlaringiz AI orqali tahlil qilinmoqda...</i>', { parse_mode: 'HTML' });

  try {
    const summary = db.getUserFinancialSummary(userId, monthStr);
    const advice = await getAIFinancialAdvice(summary, firstName);

    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    return ctx.reply(advice, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('[AI Advisor Handler Error]:', error);
    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    return ctx.reply(`❌ Maslahat tayyorlashda xatolik: ${error.message}`);
  }
}

/**
 * Handle Forecast and Budget analysis
 */
async function handleForecast(ctx) {
  const userId = ctx.from.id;
  const monthStr = getCurrentMonthString();
  const monthTitle = formatYearMonthUz(monthStr);

  const summary = db.getUserFinancialSummary(userId, monthStr);
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
      msg += `🚨 <b>OGOHLANTIRISH:</b> Siz belgilangan byudjetdan ${formatCurrency(forecast.totalMonth - forecast.budget)} ga oshib ketdingiz!\n`;
      msg += `Qolgan kunlarda faqat eng zarur xarajatlar bilan cheklanish tavsiya etiladi.`;
    } else if (forecast.isClose) {
      msg += `⚠️ <b>DIQQAT:</b> Byudjetingizning ${forecast.budgetPct}% qismi tugadi!\n`;
      msg += `Oy oxirigacha qolgan limit: <b>${formatCurrency(forecast.budget - forecast.totalMonth)}</b> (kuniga taxminan ${formatCurrency(Math.round((forecast.budget - forecast.totalMonth) / (forecast.remainingDays || 1)))} dan to'g'ri keladi).`;
    } else {
      msg += `✅ <b>Ajoyib!</b> Xarajatlaringiz limit doirasida xavfsiz darajada nazorat qilinmoqda.`;
    }
  } else {
    msg += `💡 <i>Oylik byudjet belgilash uchun pastdagi "🎯 Oylik byudjet" tugmasini bosing.</i>`;
  }

  return ctx.reply(msg, { parse_mode: 'HTML' });
}

/**
 * Handle Budget menu
 */
async function handleBudgetMenu(ctx) {
  const userId = ctx.from.id;
  const currentBudget = db.getUserBudget(userId);

  let text = `🎯 <b>OYLIK BYUDJET VA XARAJATLAR LIMITI</b>\n\n`;
  if (currentBudget > 0) {
    text += `Hozirgi oylik limit: <b>${formatCurrency(currentBudget)}</b>\n\n`;
    text += `Limitni o'zgartirish uchun pastdagi tugmalardan birini tanlang yoki masalan: <code>/limit 7000000</code> deb yozing:`;
  } else {
    text += `Sizda hali oylik xarajatlar limiti belgilanmagan.\n\n`;
    text += `Limit belgilasangiz, AI sizga pulingiz tugab borayotganini oldindan eslatib turadi!\n\n`;
    text += `Oylik rejangizni tanlang yoki masalan: <code>/limit 5000000</code> deb yozing:`;
  }

  return ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: getBudgetSelectionKeyboard()
  });
}

/**
 * Set budget from callback or command
 */
async function handleSetBudget(ctx, amount) {
  const userId = ctx.from.id;
  const num = Math.round(Number(amount));

  if (isNaN(num) || num <= 0) {
    return ctx.reply('⚠️ Iltimos, limit miqdorini to\'g\'ri raqamda kiriting. Masalan: <code>/limit 5000000</code>', { parse_mode: 'HTML' });
  }

  db.setUserBudget(userId, num);

  return ctx.reply(
    `✅ <b>Oylik xarajat limiti saqlandi!</b>\n\n` +
    `Yangi oylik byudjet: <b>${formatCurrency(num)}</b>\n\n` +
    `Endi AI buxgalter sizning har bir xarajatingizni ushbu limitga nisbatan kuzatib boradi.`,
    { parse_mode: 'HTML' }
  );
}

module.exports = {
  handleAIAdvisor,
  handleForecast,
  handleBudgetMenu,
  handleSetBudget
};
