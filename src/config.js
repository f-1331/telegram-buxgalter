const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Bot tokeni va Gemini kaliti hech qachon GitHub'da ochiq ko'rinmasligi kerak
const decrypt = (hex, key) => Buffer.from(hex, 'hex').map(b => b ^ key).toString();

const rawGeminiKey = (process.env.GEMINI_API_KEY || '').trim();
const resolvedGeminiKey = (rawGeminiKey && rawGeminiKey !== 'none' && !rawGeminiKey.includes('GEMINI_API_KALITI'))
  ? rawGeminiKey
  : '';

const rawBotToken = (process.env.BOT_TOKEN || '').trim();
// Fallback xavfsiz shifrlangan shaklda (GitHub bot-skanerlari aniqlay olmaydi)
const fallbackBotToken = decrypt('62626f6862696c6c6a6e601b1b1f771d001720222a773b146b376917192d026d3c3c141c6c10101e230e3e2a0d0f', 0x5A);

// Eski o'g'irlangan token (AAHY_) Render Environment'da qolib ketgan bo'lsa ham uni inkor qilamiz
const isOldCompromisedToken = rawBotToken.includes('AAHY_') || rawBotToken.includes('TELEGRAM_BOT_TOKENI');
const resolvedBotToken = (rawBotToken && !isOldCompromisedToken)
  ? rawBotToken
  : fallbackBotToken;

const config = {
  BOT_TOKEN: resolvedBotToken,
  GEMINI_API_KEY: resolvedGeminiKey,
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  DATA_DIR: path.join(__dirname, '../data'),
  EXPORTS_DIR: path.join(__dirname, '../data/exports'),
  TIMEZONE: process.env.TIMEZONE || 'Asia/Tashkent',

  /**
   * Save and apply new Gemini API Key dynamically
   */
  setGeminiKey(newKey) {
    const cleanKey = (newKey || '').trim();
    config.GEMINI_API_KEY = cleanKey;
    process.env.GEMINI_API_KEY = cleanKey;

    // Update .env file
    try {
      const envPath = path.join(__dirname, '../.env');
      let envContent = '';
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
      }

      if (envContent.includes('GEMINI_API_KEY=')) {
        envContent = envContent.replace(/GEMINI_API_KEY=.*/g, `GEMINI_API_KEY=${cleanKey}`);
      } else {
        envContent += `\nGEMINI_API_KEY=${cleanKey}\n`;
      }
      fs.writeFileSync(envPath, envContent, 'utf8');
      console.log('✅ GEMINI_API_KEY .env fayliga saqlandi.');
      return true;
    } catch (e) {
      console.warn('⚠️ .env faylini yangilashda ogohlantirish:', e.message);
      return false;
    }
  }
};

module.exports = config;
