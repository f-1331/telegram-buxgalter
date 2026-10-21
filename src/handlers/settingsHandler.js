const { InlineKeyboard, InputFile } = require('grammy');
const db = require('../database/db');
const { formatCurrency, getCurrentMonthString, formatYearMonthUz } = require('../utils/formatters');
const { generateDailyTrendChart } = require('../services/chartService');

/**
 * Handle Settings Menu display
 */
async function handleSettingsMenu(ctx) {
  const userId = ctx.from.id;
  const user = db.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) || {};
  const reminderStatus = user.daily_reminder === 1 ? '✅ Yoqilgan' : '❌ O\'chirilgan';
  const currentBudget = user.monthly_budget > 0 ? formatCurrency(user.monthly_budget) : 'Belgilanmagan';

  const text =
    `⚙️ <b>SHAXSIY SOZLAMALAR VA BOSHQARUV</b>\n\n` +
    `👤 <b>Foydalanuvchi:</b> ${user.first_name || 'Foydalanuvchi'}\n` +
    `🔔 <b>Kechki 21:00 eslatma:</b> ${reminderStatus}\n` +
    `🎯 <b>Oylik xarajat limiti:</b> ${currentBudget}\n\n` +
    `Quyidagi tugmalar orqali sozlamalarni o'zgartirishingiz mumkin:`;

  const keyboard = new InlineKeyboard()
    .text(user.daily_reminder === 1 ? '🔕 Eslatmani o\'chirish' : '🔔 Eslatmani yoqish', 'toggle_reminder')
    .row()
    .text('🎯 Byudjetni o\'zgartirish', 'open_budget_menu')
    .row()
    .text('📊 Kunlik dinamika grafigi', 'show_daily_trend')
    .row()
    .text('⚠️ Barcha tariximni tozalash', 'ask_reset_data');

  return ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
}

/**
 * Send day-by-day trend bar chart
 */
async function handleSendDailyTrend(ctx) {
  const userId = ctx.from.id;
  const monthStr = getCurrentMonthString();
  const monthTitle = formatYearMonthUz(monthStr);

  const dailyStats = db.getMonthDailyBreakdown(userId, monthStr);
  if (!dailyStats || dailyStats.length === 0) {
    return ctx.reply(
      `⚠️ <b>${monthTitle}</b> oyi uchun kunlik xarajatlar grafigini tuzishga xarajatlar topilmadi.`,
      { parse_mode: 'HTML' }
    );
  }

  await ctx.replyWithChatAction('upload_photo');
  const waitMsg = await ctx.reply('📊 <i>Kunlik dinamika grafigi tayyorlanmoqda...</i>', { parse_mode: 'HTML' });

  try {
    const chartBuffer = await generateDailyTrendChart(dailyStats, monthStr);
    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

    return ctx.replyWithPhoto(new InputFile(chartBuffer, `Kunlik_trend_${monthStr}.png`), {
      caption: `📊 <b>${monthTitle.toUpperCase()} — KUNLIK XARAJATLAR DINAMIKASI</b>\n\nQaysi kunlarda eng ko'p xarajat qilinganini ustunlar orqali ko'rishingiz mumkin.`,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('[Daily Trend Error]:', error);
    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    return ctx.reply(`❌ Grafik chizishda xatolik: ${error.message}`);
  }
}

module.exports = {
  handleSettingsMenu,
  handleSendDailyTrend
};
