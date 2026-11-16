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
const http = require('node:http');

const PORT = process.env.PORT || 3001;
const isCloud = Boolean(
  process.env.RENDER ||
  process.env.RENDER_EXTERNAL_URL ||
  process.env.TUNNEL_URL ||
  process.env.USE_WEBHOOK === 'true'
);

const server = http.createServer((req, res) => {
  // Telegram Webhook endpoint (Acknowledge immediately in <2ms, process update asynchronously)
  if (req.method === 'POST' && req.url === '/webhook') {
    let rawBody = '';
    req.on('data', chunk => { rawBody += chunk; });
    req.on('end', async () => {
      // 1. Acknowledge Telegram immediately to eliminate any webhook timeout
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));

      // 2. Process update asynchronously without blocking Telegram
      try {
        if (rawBody) {
          if (!bot.isInited()) {
            await bot.init();
          }
          const update = JSON.parse(rawBody);
          await bot.handleUpdate(update);
        }
      } catch (err) {
        console.error('[Update Processing Error]:', err.message);
      }
    });
    return;
  }

  // Diagnostic endpoint for bot initialization check
  if (req.method === 'GET' && req.url === '/bot-status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'ok',
      initialized: bot.isInited(),
      botUsername: bot.botInfo?.username || null,
      mode: isCloud ? 'webhook' : 'polling',
      uptime: Math.round(process.uptime()) + 's'
    }));
  }

  // Health check endpoint for UptimeRobot, cron-job, and browsers
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    service: 'Shaxsiy AI Buxgalter Bot',
    mode: isCloud ? 'webhook' : 'polling',
    hasGeminiKey: Boolean(config.GEMINI_API_KEY && config.GEMINI_API_KEY !== 'none' && !config.GEMINI_API_KEY.includes('GEMINI_API_KALITI')),
    model: config.GEMINI_MODEL,
    version: '2.5-flash-pro-features',
    uptime: Math.round(process.uptime()) + 's'
  }));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[Port Warning] Port ${PORT} band bo'lgani sababli, HTTP serversiz to'g'ridan-to'g'ri Telegram polling boshlanmoqda...`);
    if (!isCloud) {
      startPollingLoop();
    }
  } else {
    console.error('[Server Error]:', err.message);
  }
});

server.listen(PORT, async () => {
  console.log(`🌐 Server listening on port ${PORT} (Mode: ${isCloud ? 'CLOUD WEBHOOK' : 'LOCAL POLLING'})`);

  try {
    if (!bot.isInited()) {
      await bot.init();
      console.log(`🤖 Bot muvaffaqiyatli ishga tushirildi: @${bot.botInfo.username}`);
    }
  } catch (initErr) {
    console.error('❌ Bot init xatoligi:', initErr.message);
  }

  if (isCloud) {
    try {
      const baseUrl = (process.env.TUNNEL_URL || process.env.RENDER_EXTERNAL_URL || 'https://telegram-buxgalter.onrender.com').replace(/\/$/, '');
      const webhookUrl = `${baseUrl}/webhook`;
      console.log(`📡 Setting Telegram Webhook to: ${webhookUrl}`);
      
      await bot.api.setWebhook(webhookUrl, {
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false
      });
      console.log(`✅ Webhook muvaffaqiyatli ulandi! Telegram xabarlari to'g'ridan-to'g'ri qabul qilinadi.`);

      // Self Keep-Alive Ping & Self-Healing Webhook Loop (Runs every 4 minutes)
      setInterval(async () => {
        try {
          const pingRes = await fetch(`${baseUrl}/`);
          console.log(`[Keep-Alive Ping] Status: ${pingRes.status} (Render uptime preserved)`);
          
          // Self-Healing Webhook: Agar webhook o'chib qolgan bo'lsa, avtomatik qayta ulaydi
          const info = await bot.api.getWebhookInfo().catch(() => null);
          if (info && info.url !== webhookUrl) {
            console.log(`⚠️ Webhook uzilgan yoki noto'g'ri (Joriy: '${info.url}'). Qayta tiklanmoqda...`);
            await bot.api.setWebhook(webhookUrl, {
              allowed_updates: ['message', 'callback_query'],
              drop_pending_updates: false
            });
            console.log(`✅ Webhook avtomatik tiklandi: ${webhookUrl}`);
          }
        } catch (pingErr) {
          console.warn('[Keep-Alive Warning]:', pingErr.message);
        }
      }, 4 * 60 * 1000);
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

// Bulutli serverga webhookni qaytarish (agar server haqiqatan ishlab turgan bo'lsa)
async function restoreWebhookToCloud() {
  if (!isCloud) {
    try {
      const cloudUrl = 'https://telegram-buxgalter.onrender.com';
      console.log(`\n🔍 Bulutli server holati tekshirilmoqda (${cloudUrl})...`);
      
      const checkRes = await fetch(`${cloudUrl}/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
      if (checkRes && checkRes.ok) {
        console.log(`📡 Bulutli server faol (200 OK). Webhook Render bulutiga topshirilmoqda...`);
        await bot.api.setWebhook(`${cloudUrl}/webhook`, {
          allowed_updates: ['message', 'callback_query'],
          drop_pending_updates: false
        });
        console.log(`✅ Webhook Render'ga topshirildi.`);
      } else {
        console.log(`ℹ️ Bulutli server to'xtatilgan yoki javob bermadi (${checkRes ? checkRes.status : 'offline'}). Webhook o'rnatilmadi.`);
      }
    } catch (e) {
      console.warn('[Restore Webhook Error]:', e.message);
    }
  }
}

// Handle graceful shutdown
process.once('SIGINT', async () => {
  console.log('\n🛑 Bot to\'xtatilmoqda (SIGINT)...');
  await restoreWebhookToCloud();
  server.close();
  bot.stop();
  process.exit(0);
});
process.once('SIGTERM', async () => {
  console.log('\n🛑 Bot to\'xtatilmoqda (SIGTERM)...');
  await restoreWebhookToCloud();
  server.close();
  bot.stop();
  process.exit(0);
});
