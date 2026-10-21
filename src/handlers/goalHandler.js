const { InlineKeyboard } = require('grammy');
const db = require('../database/db');
const { formatCurrency } = require('../utils/formatters');

function makeProgressBar(percent) {
  const total = 10;
  const filled = Math.min(10, Math.max(0, Math.round((percent / 100) * total)));
  const empty = total - filled;
  return '🟩'.repeat(filled) + '⬜️'.repeat(empty);
}

/**
 * Display User Financial Goals Menu
 */
async function handleGoalsMenu(ctx) {
  const userId = ctx.from.id;
  const goals = db.getUserGoals(userId);

  let text = `🎯 <b>MOLIYAVIY JAMG'ARMA MAQSADLARI</b>\n\n`;

  if (goals.length === 0) {
    text += `<i>Sizda hali hech qanday jamg'arma maqsadi yo'q.</i>\n\n` +
      `💡 <b>Nima uchun kerak?</b>\n` +
      `Katta orzu va maqsadlaringizga (masalan: Yangi telefon, sayohat, mashina yoki to'y uchun) rejali pul yig'ib borishingiz mumkin!\n\n` +
      `➕ <b>Yangi maqsad yaratish:</b>\n` +
      `<code>/yangi_maqsad iPhone 15000000</code>\n` +
      `<code>/yangi_maqsad Sayohat 10000000</code>`;

    return ctx.reply(text, { parse_mode: 'HTML' });
  }

  const keyboard = new InlineKeyboard();

  goals.forEach((g, idx) => {
    const target = Number(g.target_amount);
    const current = Number(g.current_amount);
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    const isReached = g.status === 'reached' || current >= target;

    text += `${idx + 1}. ${isReached ? '🎉' : '🎯'} <b>${g.title}</b> ${isReached ? '<b>(ERISHILDI!)</b>' : ''}\n`;
    text += `   💰 <b>Yig'ildi:</b> ${formatCurrency(current)} / ${formatCurrency(target)} (<i>${pct}%</i>)\n`;
    text += `   [${makeProgressBar(pct)}]\n\n`;

    if (!isReached) {
      keyboard.text(`➕ ${g.title} (+100k)`, `goal_add_${g.id}_100000`)
              .text(`➕ (+500k)`, `goal_add_${g.id}_500000`)
              .row();
    }
    keyboard.text(`🗑 O'chirish (${g.title})`, `goal_del_${g.id}`).row();
  });

  text += `💡 <b>Ko'proq qo'shish uchun:</b>\n` +
    `<code>/maqsad_plus [№] [summa]</code> — masalan: <code>/maqsad_plus 1 1000000</code>\n` +
    `Yoki yangi maqsad: <code>/yangi_maqsad Mashina 50000000</code>`;

  return ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
}

/**
 * Handle recurring subscriptions menu
 */
async function handleSubscriptionsMenu(ctx) {
  const userId = ctx.from.id;
  const subs = db.getUserSubscriptions(userId);

  let text = `🔄 <b>DOIMIY TO'LOVLAR VA OBUNALAR</b>\n\n`;

  if (subs.length === 0) {
    text += `<i>Sizda doimiy to'lovlar kiritilmagan.</i>\n\n` +
      `Har oy majburiy to'lanadigan to'lovlarni (Ijara, internet, sport zal, kurslar...) kiritsangiz, bot sizga har oy qancha majburiy xarajatingiz borligini eslatib turadi!\n\n` +
      `➕ <b>Yangi doimiy to'lov qo'shish:</b>\n` +
      `<code>/doimiy Internet 150000 5</code>\n` +
      `<code>/doimiy Ijara 3000000 1</code>`;

    return ctx.reply(text, { parse_mode: 'HTML' });
  }

  let totalMonthly = 0;
  const keyboard = new InlineKeyboard();

  subs.forEach((s, idx) => {
    const amt = Number(s.amount);
    totalMonthly += amt;
    text += `${idx + 1}. 📌 <b>${s.title}</b>: ${formatCurrency(amt)}\n`;
    text += `   📅 Har oyning <b>${s.day_of_month}-kunida</b> | <i>${s.category}</i>\n\n`;

    keyboard.text(`🗑 O'chirish (${s.title})`, `sub_del_${s.id}`).row();
  });

  text += `──────────────\n` +
    `💵 <b>Jami oylik majburiy xarajat:</b> <b>${formatCurrency(totalMonthly)}</b>\n\n` +
    `➕ <b>Yana qo'shish uchun:</b>\n` +
    `<code>/doimiy Kurs 500000 10</code>`;

  return ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
}

module.exports = {
  handleGoalsMenu,
  handleSubscriptionsMenu,
  makeProgressBar
};
