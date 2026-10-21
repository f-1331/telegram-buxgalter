const { processReceiptImage } = require('../services/aiService');
const db = require('../database/db');
const { getTodayString, getCurrentMonthString, formatCurrency, formatDateUz } = require('../utils/formatters');
const { getCategoryEmoji } = require('../utils/categories');
const { getExpenseActionKeyboard } = require('../utils/keyboards');
const config = require('../config');

/**
 * Handle incoming receipt and payment screenshot photos from Telegram
 */
async function handlePhotoMessage(ctx) {
  const userId = ctx.from.id;
  const username = ctx.from.username;
  const firstName = ctx.from.first_name;

  // Save/update user
  db.saveUser(userId, username, firstName);

  // Send status
  await ctx.replyWithChatAction('upload_photo');

  try {
    const photos = ctx.message.photo;
    if (!photos || photos.length === 0) {
      return ctx.reply('⚠️ Rasm topilmadi.');
    }

    const waitMsg = await ctx.reply('🧾 <i>Chek yoki to\'lov skrinshoti o\'qilmoqda va tahlil qilinmoqda...</i>', {
      parse_mode: 'HTML'
    });

    // Download highest resolution photo
    const file = await ctx.getFile();
    const downloadUrl = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${file.file_path}`;

    const res = await fetch(downloadUrl);
    if (!res.ok) {
      throw new Error(`Telegram rasmni yuklab olib bo'lmadi (Status: ${res.status})`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Process with Gemini AI Vision
    const parsed = await processReceiptImage(imageBuffer, 'image/jpeg');

    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

    if (!parsed.is_financial_receipt || !parsed.amount || parsed.amount <= 0) {
      return ctx.reply(
        '🤔 <b>Ushbu rasmda chek yoki to\'lov ma\'lumoti aniqlanmadi.</b>\n\n' +
        '💡 <b>Maslahat:</b> Do\'kon cheki (Korzinka, Makro, Havas, dorixona) yoki bank to\'lovi skrinshotini (Click, Payme, Uzum) aniqroq qilib yuboring.',
        { parse_mode: 'HTML' }
      );
    }

    // Save to database
    const todayStr = getTodayString();
    const monthStr = getCurrentMonthString();
    const inserted = db.addExpense({
      userId,
      amount: parsed.amount,
      category: parsed.category,
      description: parsed.description || parsed.shop_or_service || 'Chek xaridi',
      expenseDate: parsed.date || todayStr,
      rawInput: parsed.shop_or_service || 'Chek fotosi',
      inputType: 'photo',
      type: parsed.type || 'expense'
    });

    const balanceSummary = db.getMonthBalanceSummary(userId, monthStr);
    const budget = db.getUserBudget(userId);

    let warning = '';
    if (budget > 0 && balanceSummary.expense >= budget) {
      warning = `\n\n🚨 <b>OGOHLANTIRISH:</b> Belgilangan oylik byudjetdan (${formatCurrency(balanceSummary.expense - budget)}) ga oshib ketdingiz!`;
    } else if (budget > 0 && balanceSummary.expense >= budget * 0.8) {
      warning = `\n\n⚠️ <b>DIQQAT:</b> Oylik byudjetingizning ${Math.round((balanceSummary.expense / budget) * 100)}% qismi ishlatildi!`;
    }

    const emoji = getCategoryEmoji(parsed.category);
    const isIncome = parsed.type === 'income';
    const typeLabel = isIncome ? '🟢 KIRIM (TUSHUM)' : '🔴 CHIQIM (XARAJAT)';

    const responseMsg =
      `🧾 <b>CHEK / TO'LOV MUVAFFAQIYATLI SAQLANDI!</b>\n\n` +
      `🏬 <b>Joy / Do'kon:</b> ${parsed.shop_or_service || 'Do\'kon'}\n` +
      `📝 <b>Xarid:</b> ${parsed.description || parsed.category}\n` +
      `📂 <b>Kategoriya:</b> ${emoji} ${parsed.category} (<i>${typeLabel}</i>)\n` +
      `💰 <b>Summa:</b> <b>${isIncome ? '+' : '-'}${formatCurrency(parsed.amount)}</b>\n` +
      `📅 <b>Sana:</b> ${formatDateUz(parsed.date || todayStr)}` +
      warning + `\n\n` +
      `📊 <b>Oylik jami xarajat:</b> ${formatCurrency(balanceSummary.expense)}\n` +
      `🎯 <b>Oylik sof qoldiq:</b> ${balanceSummary.balance >= 0 ? '+' : ''}${formatCurrency(balanceSummary.balance)}`;

    return ctx.reply(responseMsg, {
      parse_mode: 'HTML',
      reply_markup: getExpenseActionKeyboard([inserted.id])
    });
  } catch (error) {
    console.error('[PhotoHandler Error]:', error);
    return ctx.reply(
      `❌ <b>Chekni tahlil qilishda xatolik yuz berdi:</b>\n<code>${error.message}</code>\n\n` +
      `Iltimos, qaytadan urinib ko'ring yoki xarajatni ovozli / matnli xabar orqali yuboring.`,
      { parse_mode: 'HTML' }
    );
  }
}

module.exports = {
  handlePhotoMessage
};
