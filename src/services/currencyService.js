/**
 * Real-time Currency Service using Central Bank of Uzbekistan (CBU) open API
 */

let cachedRates = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

/**
 * Fetch and cache exchange rates from CBU
 */
async function getExchangeRates() {
  const now = Date.now();
  if (cachedRates && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedRates;
  }

  try {
    const res = await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/', {
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`CBU API status: ${res.status}`);
    const data = await res.json();
    
    const ratesMap = {};
    for (const item of data) {
      ratesMap[item.Ccy] = {
        code: item.Ccy,
        name: item.CcyNm_UZ,
        rate: parseFloat(item.Rate) || 0,
        diff: parseFloat(item.Diff) || 0,
        date: item.Date
      };
    }

    cachedRates = ratesMap;
    lastFetchTime = now;
    return ratesMap;
  } catch (err) {
    console.warn('[Currency Warning] CBU API yuklanmadi, zaxira kurslar ishlatiladi:', err.message);
    if (cachedRates) return cachedRates;

    // Fallback static rates if network is offline
    return {
      USD: { code: 'USD', name: 'AQSH dollari', rate: 12050, diff: 0, date: '' },
      EUR: { code: 'EUR', name: 'Yevro', rate: 13300, diff: 0, date: '' },
      RUB: { code: 'RUB', name: 'Rossiya rubli', rate: 145, diff: 0, date: '' },
      KZT: { code: 'KZT', name: 'Qozog\'iston tengesi', rate: 24, diff: 0, date: '' }
    };
  }
}

/**
 * Convert any amount from a currency to UZS
 */
async function convertToUZS(amount, currencyCode) {
  const rates = await getExchangeRates();
  const c = currencyCode.toUpperCase();
  if (rates[c]) {
    return Math.round(amount * rates[c].rate);
  }
  return amount;
}

/**
 * Format a rich Telegram message showing live exchange rates
 */
async function formatRatesMessage() {
  const rates = await getExchangeRates();
  const usd = rates.USD || { rate: 12050, diff: 0 };
  const eur = rates.EUR || { rate: 13300, diff: 0 };
  const rub = rates.RUB || { rate: 145, diff: 0 };
  const kzt = rates.KZT || { rate: 24, diff: 0 };

  const formatDiff = (diff) => {
    if (diff > 0) return `▲ +${diff}`;
    if (diff < 0) return `▼ ${diff}`;
    return `— 0.00`;
  };

  return (
    `💱 <b>Markaziy Bank Rasmiy Valyuta Kurslari:</b>\n\n` +
    `🇺🇸 <b>1 USD</b> = <code>${usd.rate.toLocaleString('uz-UZ')} so'm</code> (${formatDiff(usd.diff)})\n` +
    `🇪🇺 <b>1 EUR</b> = <code>${eur.rate.toLocaleString('uz-UZ')} so'm</code> (${formatDiff(eur.diff)})\n` +
    `🇷🇺 <b>1 RUB</b> = <code>${rub.rate.toLocaleString('uz-UZ')} so'm</code> (${formatDiff(rub.diff)})\n` +
    `🇰🇿 <b>1 KZT</b> = <code>${kzt.rate.toLocaleString('uz-UZ')} so'm</code> (${formatDiff(kzt.diff)})\n\n` +
    `💡 <b>Avtomatik hisoblash:</b>\n` +
    `Xarajat yoki daromad kiritayotganda valyutani ko'rsatsangiz, bot uni avtomatik so'mga aylantiradi!\n` +
    `<i>Masalan: "Benzinga 20 dollar berdim" yoki "Oyligim 50000 rubl tushdi"</i>`
  );
}

module.exports = {
  getExchangeRates,
  convertToUZS,
  formatRatesMessage
};
