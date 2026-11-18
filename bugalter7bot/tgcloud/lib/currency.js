import { fetch } from 'sdk';
import { getSetting, setSetting } from './db.js';
import { formatNumber } from './formatters.js';

const CACHE_KEY = 'cbu_rates_cache';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const FALLBACK_RATES = {
  USD: { code: 'USD', name: 'AQSH dollari', rate: 12850, diff: 0, date: '' },
  EUR: { code: 'EUR', name: 'Yevro', rate: 13900, diff: 0, date: '' },
  RUB: { code: 'RUB', name: 'Rossiya rubli', rate: 135, diff: 0, date: '' },
  KZT: { code: 'KZT', name: "Qozog'iston tengesi", rate: 25, diff: 0, date: '' },
};

export async function getExchangeRates() {
  try {
    const cachedRaw = await getSetting(CACHE_KEY);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw);
      if (parsed && parsed.ts && Date.now() - parsed.ts < CACHE_TTL_MS && parsed.rates) {
        return parsed.rates;
      }
    }
  } catch (e) {}

  try {
    const res = await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/');
    if (!res.ok) throw new Error(`CBU API status: ${res.status}`);
    const data = await res.json();

    const ratesMap = {};
    for (const item of data) {
      ratesMap[item.Ccy] = {
        code: item.Ccy,
        name: item.CcyNm_UZ,
        rate: parseFloat(item.Rate) || 0,
        diff: parseFloat(item.Diff) || 0,
        date: item.Date || '',
      };
    }

    await setSetting(CACHE_KEY, JSON.stringify({ ts: Date.now(), rates: ratesMap })).catch(() => {});
    return ratesMap;
  } catch (err) {
    console.warn('[Currency Warning] CBU API yuklanmadi:', err.message);
    return FALLBACK_RATES;
  }
}

export async function formatRatesMessage() {
  const rates = await getExchangeRates();
  const usd = rates.USD || FALLBACK_RATES.USD;
  const eur = rates.EUR || FALLBACK_RATES.EUR;
  const rub = rates.RUB || FALLBACK_RATES.RUB;
  const kzt = rates.KZT || FALLBACK_RATES.KZT;

  const formatDiff = (diff) => {
    if (diff > 0) return `▲ +${diff}`;
    if (diff < 0) return `▼ ${diff}`;
    return '— 0.00';
  };

  return (
    `💱 <b>Markaziy Bank Rasmiy Valyuta Kurslari:</b>\n\n` +
    `🇺🇸 <b>1 USD</b> = <code>${formatNumber(usd.rate)} so'm</code> (${formatDiff(usd.diff)})\n` +
    `🇪🇺 <b>1 EUR</b> = <code>${formatNumber(eur.rate)} so'm</code> (${formatDiff(eur.diff)})\n` +
    `🇷🇺 <b>1 RUB</b> = <code>${formatNumber(rub.rate)} so'm</code> (${formatDiff(rub.diff)})\n` +
    `🇰🇿 <b>1 KZT</b> = <code>${formatNumber(kzt.rate)} so'm</code> (${formatDiff(kzt.diff)})\n\n` +
    `💡 <b>Avtomatik hisoblash:</b>\n` +
    `Xarajat yoki daromad kiritayotganda valyutani ko'rsatsangiz, bot uni avtomatik so'mga aylantiradi!\n` +
    `<i>Masalan: "Benzinga 20 dollar berdim" yoki "Oyligim 50000 rubl tushdi"</i>`
  );
}
