const { Bot } = require('grammy');
const config = require('./config');
const { handleVoiceMessage } = require('./handlers/voiceHandler');
const { handleTextMessage } = require('./handlers/textHandler');
const { handleCallbackQuery } = require('./handlers/actionHandler');
const { handlePhotoMessage } = require('./handlers/photoHandler');

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

// Register Voice, Audio, and Video Note handlers
bot.on('message:voice', handleVoiceMessage);
bot.on('message:audio', handleVoiceMessage);
bot.on('message:video_note', handleVoiceMessage);

// Register Photo / Receipt scanner handler
bot.on('message:photo', handlePhotoMessage);

// Register Inline button callback queries
bot.on('callback_query:data', handleCallbackQuery);

// Register Text handler
bot.on('message:text', handleTextMessage);

// Daily 21:00 Tashkent reminder check
const db = require('./database/db');
const { getTodayString } = require('./utils/formatters');
let lastReminderDate = '';

setInterval(async () => {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: config.TIMEZONE || 'Asia/Tashkent',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    const todayStr = getTodayString();

    if (hour === 21 && minute < 10 && lastReminderDate !== todayStr) {
      lastReminderDate = todayStr;
      const users = db.getAllUsers();
      for (const u of users) {
        const todayTotal = db.getTodayTotal(u.id, todayStr);
        if (todayTotal === 0) {
          const name = u.first_name || 'Hurmatli foydalanuvchi';
          await bot.api.sendMessage(
            u.id,
            `🌙 <b>Xayrli kech, ${name}!</b>\n\n` +
            `Bugungi kuningiz qanday o'tdi? Kun davomida qilingan xarajat yoki daromadlaringizni kiritishni unutmadingizmi?\n\n` +
            `🎙 <i>Hoziroq qisqa ovozli xabar yuborishingiz mumkin:</i>\n` +
            `<i>"Bugun tushlikka 45 ming, yo'lkiraga 15 ming ishlatdim"</i>`,
            { parse_mode: 'HTML' }
          ).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.warn('[Reminder Warning]:', err.message);
  }
}, 60 * 1000);

// Cloud & Webhook configuration
const { webhookCallback } = require('grammy');
const http = require('node:http');

const PORT = process.env.PORT || 3000;
const isCloud = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
const webhookHandler = webhookCallback(bot, 'http');

const server = http.createServer(async (req, res) => {
  // Telegram Webhook endpoint
  if (req.method === 'POST' && req.url === '/webhook') {
    try {
      return await webhookHandler(req, res);
    } catch (err) {
      console.error('[Webhook Error]:', err);
      res.writeHead(500);
      return res.end('Internal Server Error');
    }
  }

  // Health check endpoint for UptimeRobot, cron-job, and browsers
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    service: 'Shaxsiy AI Buxgalter Bot',
    mode: isCloud ? 'webhook' : 'polling',
    hasGeminiKey: Boolean(config.GEMINI_API_KEY && config.GEMINI_API_KEY !== 'none' && !config.GEMINI_API_KEY.includes('GEMINI_API_KALITI')),
    model: config.GEMINI_MODEL,
    version: '3.5-flash-voice-ready',
    uptime: Math.round(process.uptime()) + 's'
  }));
});

server.listen(PORT, async () => {
  console.log(`🌐 Server listening on port ${PORT} (Mode: ${isCloud ? 'CLOUD WEBHOOK' : 'LOCAL POLLING'})`);

  if (isCloud) {
    try {
      const baseUrl = (process.env.RENDER_EXTERNAL_URL || 'https://telegram-buxgalter.onrender.com').replace(/\/$/, '');
      const webhookUrl = `${baseUrl}/webhook`;
      console.log(`📡 Setting Telegram Webhook to: ${webhookUrl}`);
      
      await bot.api.setWebhook(webhookUrl, {
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false
      });
      console.log(`✅ Webhook muvaffaqiyatli ulandi! Telegram xabarlari to'g'ridan-to'g'ri qabul qilinadi.`);
    } catch (err) {
      console.error('❌ Webhook o\'rnatishda xatolik:', err.message);
      startPollingLoop();
    }
  } else {
    startPollingLoop();
  }
});

// Robust polling loop with auto-reconnect for local mode
async function startPollingLoop() {
  while (true) {
    try {
      await bot.api.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
      console.log('🔄 Telegram polling boshlanmoqda...');
      await bot.start({
        onStart: (botInfo) => {
          console.log(`\n✅ Bot muvaffaqiyatli ishga tushdi!`);
          console.log(`👤 Bot nomi: @${botInfo.username} (${botInfo.first_name})`);
          console.log(`⚡️ Ovozli xabarlar va matnlarni qabul qilishga tayyor.\n`);
        }
      });
      break;
    } catch (err) {
      console.warn(`[Polling ogohlantirish] ${err.message}. 5 soniyadan keyin qayta ulanadi...`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// Handle graceful shutdown
process.once('SIGINT', () => {
  console.log('\n🛑 Bot to\'xtatilmoqda (SIGINT)...');
  server.close();
  bot.stop();
});
process.once('SIGTERM', () => {
  console.log('\n🛑 Bot to\'xtatilmoqda (SIGTERM)...');
  server.close();
  bot.stop();
});
