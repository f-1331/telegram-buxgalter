const { processVoiceAudio } = require('../services/aiService');
const db = require('../database/db');
const { getTodayString, getCurrentMonthString, formatAddedExpensesMessage, formatCurrency } = require('../utils/formatters');
const { getExpenseActionKeyboard, getDebtActionKeyboard } = require('../utils/keyboards');
const config = require('../config');

/**
 * Handle incoming voice, audio, and round video messages from Telegram
 */
async function handleVoiceMessage(ctx) {
  const userId = ctx.from.id;
  const username = ctx.from.username;
  const firstName = ctx.from.first_name;

  // Save/update user in database
  db.saveUser(userId, username, firstName);

  // Send status indicator
  await ctx.replyWithChatAction('record_voice');

  try {
    const media = ctx.message.voice || ctx.message.audio || ctx.message.video_note;
    if (!media) {
      return ctx.reply('⚠️ Ovozli yoki video xabar topilmadi.');
    }

    // Check GEMINI_API_KEY
    if (!config.GEMINI_API_KEY || config.GEMINI_API_KEY === 'none') {
      return ctx.reply(
        '⚠️ <b>Gemini API kaliti ulanmagan!</b>\n\n' +
        'Ovozli xabarlarni tushunish uchun <code>GEMINI_API_KEY</code> kerak.\n' +
        'Iltimos, kalitni kiriting.\n\n' +
        '👉 Bepul olish: https://aistudio.google.com/app/apikey',
        { parse_mode: 'HTML' }
      );
    }

    const isVideoNote = Boolean(ctx.message.video_note);
    const initialText = isVideoNote 
      ? '📹 <i>Dumaloq video xabaringiz eshitilmoqda va tahlil qilinmoqda...</i>'
      : '🎧 <i>Ovozingiz eshitilmoqda va tahlil qilinmoqda...</i>';

    const statusMsg = await ctx.reply(initialText, { parse_mode: 'HTML' });

    // Download file from Telegram
    const file = await ctx.getFile();
    const downloadUrl = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${file.file_path}`;

    const res = await fetch(downloadUrl);
    if (!res.ok) {
      throw new Error(`Telegram faylini yuklab olib bo'lmadi (Status: ${res.status})`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    const mimeType = isVideoNote ? 'video/mp4' : (media.mime_type || 'audio/ogg');

    // Process with Gemini AI
    const result = await processVoiceAudio(audioBuffer, mimeType);

    // Delete processing status message
    await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});

    // Check if debt was detected
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

    if (!result.has_expenses || !result.expenses || result.expenses.length === 0) {
      if (result.debts && result.debts.length > 0) {
        return; // Already replied about debt
      }

      let replyText = '🤔 <b>Ovozli xabarda xarajat yoki daromad aniqlanmadi.</b>\n\n';
      if (result.transcription) {
        replyText += `🎙 <i>Eshitildi: "${result.transcription}"</i>\n\n`;
      }
      replyText += '💡 <b>Maslahat:</b> Masalan:\n• <i>"Bugun taksiga 25 ming, tushlikka 60 ming ishlatdim"</i>\n• <i>"Oyligim 5 million tushdi"</i>';
      return ctx.reply(replyText, { parse_mode: 'HTML' });
    }

    // Save batch expenses to database
    const rawText = result.transcription || (isVideoNote ? 'Video xabar' : 'Ovozli xabar');
    const inserted = db.addExpensesBatch(userId, result.expenses, rawText, isVideoNote ? 'video' : 'voice');
    const insertedIds = inserted.map(i => i.id);

    // Get updated monthly balance
    const todayStr = getTodayString();
    const monthStr = getCurrentMonthString();
    const todayTotal = db.getTodayTotal(userId, todayStr);
    const balanceSummary = db.getMonthBalanceSummary(userId, monthStr);

    const responseMsg = formatAddedExpensesMessage(
      result.transcription,
      result.expenses,
      todayTotal,
      balanceSummary.expense,
      balanceSummary.income,
      balanceSummary.balance
    );

    return ctx.reply(responseMsg, {
      parse_mode: 'HTML',
      reply_markup: getExpenseActionKeyboard(insertedIds)
    });
  } catch (error) {
    console.error('[VoiceHandler Error]:', error);
    return ctx.reply(
      `❌ <b>Ovozni qayta ishlashda xatolik:</b>\n<code>${error.message}</code>\n\n` +
      `Iltimos, qaytadan urinib ko'ring yoki xarajatni matn ko'rinishida yozing.`,
      { parse_mode: 'HTML' }
    );
  }
}

module.exports = {
  handleVoiceMessage
};
