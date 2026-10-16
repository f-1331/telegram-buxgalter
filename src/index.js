const { Bot } = require('grammy');
const config = require('./config');
const { handleVoiceMessage } = require('./handlers/voiceHandler');
const { handleTextMessage } = require('./handlers/textHandler');
const { handleCallbackQuery } = require('./handlers/actionHandler');

console.log('====================================================');
console.log('🤖 SHAXSIY AI BUXGALTER - TELEGRAM BOT ISHGA TUSHMOQDA');
console.log('====================================================');

// Verify BOT_TOKEN
if (!config.BOT_TOKEN || config.BOT_TOKEN.includes('TELEGRAM_BOT_TOKENI')) {
  console.error('\n❌ XATOLIK: BOT_TOKEN topilmadi yoki kiritilmagan!');
  console.error('Iltimos, loyiha papkasidagi .env faylini oching va:');
  console.error('BOT_TOKEN=telegram_bot_tokeningizni_yozing\n');
  console.error('1. @BotFather ga o\'ting (/newbot qilib token oling)');
  console.error('2. .env faylga BOT_TOKEN ni joylashtiring\n');
  process.exit(1);
}

// Check GEMINI_API_KEY warning
if (!config.GEMINI_API_KEY || config.GEMINI_API_KEY.includes('GEMINI_API_KALITI')) {
  console.warn('\n⚠️ DIQQAT: GEMINI_API_KEY hali sozlanmagan!');
  console.warn('Ovozli xabarlarni to\'liq tushunish uchun bepul API kalit oling:');
  console.warn('👉 https://aistudio.google.com/app/apikey');
  console.warn('Kalitni .env fayliga GEMINI_API_KEY=... ko\'rinishida kiriting.\n');
}

// Initialize Grammy bot
const bot = new Bot(config.BOT_TOKEN);

// Global error handler so the bot never crashes unexpectedly
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`[Bot Error] Update ${ctx.update.update_id} qayta ishlashda xatolik:`);
  const e = err.error;
  console.error(e.message || e);
});

// Register Voice and Audio handlers
bot.on('message:voice', handleVoiceMessage);
bot.on('message:audio', handleVoiceMessage);

// Register Inline button callback queries
bot.on('callback_query:data', handleCallbackQuery);

// Register Text handler
bot.on('message:text', handleTextMessage);

// Lightweight HTTP server for cloud platforms (Render, Railway, Koyeb, etc.)
const http = require('node:http');
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', message: 'Shaxsiy AI Buxgalter bot is running 24/7!' }));
});
server.listen(PORT, () => {
  console.log(`🌐 Bulutli serverlar uchun Web-port: ${PORT}`);
});

// Start bot
bot.start({
  onStart: (botInfo) => {
    console.log(`\n✅ Bot muvaffaqiyatli ishga tushdi!`);
    console.log(`👤 Bot nomi: @${botInfo.username} (${botInfo.first_name})`);
    console.log(`📅 Vaqt: ${new Date().toLocaleString()}`);
    console.log(`⚡️ Ovozli xabarlar va matnlarni qabul qilishga tayyor.\n`);
    console.log('Tugatish uchun klaviaturada Ctrl + C tugmalarini bosing.\n');
  }
});

// Handle graceful shutdown
process.once('SIGINT', () => {
  console.log('\n🛑 Bot to\'xtatilmoqda (SIGINT)...');
  bot.stop();
});
process.once('SIGTERM', () => {
  console.log('\n🛑 Bot to\'xtatilmoqda (SIGTERM)...');
  bot.stop();
});
