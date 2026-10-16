const { processVoiceAudio } = require('../services/aiService');
const db = require('../database/db');
const { getTodayString, getCurrentMonthString, formatAddedExpensesMessage } = require('../utils/formatters');
const { getExpenseActionKeyboard } = require('../utils/keyboards');
const config = require('../config');

/**
 * Handle incoming voice messages from Telegram
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
    const voice = ctx.message.voice || ctx.message.audio;
    if (!voice) {
      return ctx.reply('⚠️ Ovozli xabar topilmadi.');
    }

    // Check GEMINI_API_KEY
    if (!config.GEMINI_API_KEY) {
      return ctx.reply(
        '⚠️ <b>Gemini API kaliti ulanmagan!</b>\n\n' +
        'Ovozli xabarlarni tushunish uchun <code>GEMINI_API_KEY</code> kerak.\n' +
        'Iltimos, bot o\'rnatilgan papkadagi <code>.env</code> fayliga kalitingizni kiriting.\n\n' +
        '👉 Kalitni mutlaqo bepul olish: https://aistudio.google.com/app/apikey',
        { parse_mode: 'HTML' }
      );
    }

    // Show initial processing message
    const statusMsg = await ctx.reply('🎧 <i>Ovozingiz eshitilmoqda va tahlil qilinmoqda...</i>', { parse_mode: 'HTML' });

    // Download file from Telegram
    const file = await ctx.getFile();
    const downloadUrl = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${file.file_path}`;

    const res = await fetch(downloadUrl);
    if (!res.ok) {
      throw new Error(`Telegram faylini yuklab olib bo'lmadi (Status: ${res.status})`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // Process with Gemini AI
    const result = await processVoiceAudio(audioBuffer, voice.mime_type || 'audio/ogg');

    // Delete or edit processing status message
    await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});

    if (!result.has_expenses || !result.expenses || result.expenses.length === 0) {
      let replyText = '🤔 <b>Ovozli xabarda xarajat ma\'lumotlari aniqlanmadi.</b>\n\n';
      if (result.transcription) {
        replyText += `🎙 <i>Eshitildi: "${result.transcription}"</i>\n\n`;
      }
      replyText += '💡 <b>Maslahat:</b> Xarajat kiritish uchun masalan:\n<i>"Bugun taksiga 25 ming, tushlikka 60 ming ishlatdim"</i> deb ayting.';
      return ctx.reply(replyText, { parse_mode: 'HTML' });
    }

    // Save expenses to database
    const rawText = result.transcription || 'Ovozli xabar';
    const inserted = db.addExpensesBatch(userId, result.expenses, rawText, 'voice');
    const insertedIds = inserted.map(i => i.id);

    // Get today's total and month total
    const todayStr = getTodayString();
    const monthStr = getCurrentMonthString();
    const todayTotal = db.getTodayTotal(userId, todayStr);
    const monthTotal = db.getMonthTotal(userId, monthStr);

    // Format response message
    const responseMsg = formatAddedExpensesMessage(
      result.transcription,
      result.expenses,
      todayTotal,
      monthTotal
    );

    // Send confirmation with Undo button
    return ctx.reply(responseMsg, {
      parse_mode: 'HTML',
      reply_markup: getExpenseActionKeyboard(insertedIds)
    });
  } catch (error) {
    console.error('[VoiceHandler Error]:', error);
    return ctx.reply(
      `❌ <b>Ovozni qayta ishlashda xatolik yuz berdi:</b>\n<code>${error.message}</code>\n\n` +
      `Iltimos, qaytadan urinib ko'ring yoki xarajatni matn ko'rinishida yozing.`,
      { parse_mode: 'HTML' }
    );
  }
}

module.exports = {
  handleVoiceMessage
};
