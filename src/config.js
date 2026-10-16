const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const config = {
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  DATA_DIR: path.join(__dirname, '../data'),
  EXPORTS_DIR: path.join(__dirname, '../data/exports'),
};

module.exports = config;
