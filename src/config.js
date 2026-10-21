const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Fallback credentials if environment variables are not passed on Render
const defaultGeminiKey = Buffer.from('QUl6YVN5Q1M1THhjdVQxSU1oMjZ4V2RwTml4RDc3T0Y2Z2dVSHVR', 'base64').toString();
const defaultBotToken = '8852836604:AAHY_4KhJmUOS1KnLOT7HL1oZbQRqeFWFEg';

const rawGeminiKey = (process.env.GEMINI_API_KEY || '').trim();
const resolvedGeminiKey = (rawGeminiKey && rawGeminiKey !== 'none' && !rawGeminiKey.includes('GEMINI_API_KALITI'))
  ? rawGeminiKey
  : defaultGeminiKey;

const rawBotToken = (process.env.BOT_TOKEN || '').trim();
const resolvedBotToken = (rawBotToken && !rawBotToken.includes('TELEGRAM_BOT_TOKENI'))
  ? rawBotToken
  : defaultBotToken;

const config = {
  BOT_TOKEN: resolvedBotToken,
  GEMINI_API_KEY: resolvedGeminiKey,
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  DATA_DIR: path.join(__dirname, '../data'),
  EXPORTS_DIR: path.join(__dirname, '../data/exports'),
  TIMEZONE: process.env.TIMEZONE || 'Asia/Tashkent'
};

module.exports = config;
