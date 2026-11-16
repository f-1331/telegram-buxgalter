/**
 * Financial Health Score & Analysis Service
 */

const { formatCurrency } = require('../utils/formatters');

function calculateFinancialHealth(userSummary, userName = 'Foydalanuvchi') {
  const { totalMonth, incomeTotal, balance, budget, debts } = userSummary;

  let score = 50; // Base score
  let savingsRate = 0;
  let statusBadge = '🟢 Barqaror';
  let statusEmoji = '🟢';
  const tips = [];

  // 1. Savings Rate Analysis (Daromad va jamg'arma nisbati)
  if (incomeTotal > 0) {
    savingsRate = Math.round((balance / incomeTotal) * 100);

    if (savingsRate >= 30) {
      score += 30;
      tips.push('💎 Ajoyib! Daromadingizning 30%+ qismini jamg\'armoqdasiz.');
    } else if (savingsRate >= 15) {
      score += 20;
      tips.push('✅ Yaxshi! 15-30% jamg\'arma daromad barqarorligini ta\'minlaydi.');
    } else if (savingsRate > 0) {
      score += 10;
      tips.push('⚠️ Jamg\'arma foizi 15% dan kam. Ehtiyotsiz xarajatlarni qisqartirish tavsiya etiladi.');
    } else {
      score -= 20;
      tips.push('🚨 Xarajat daromaddan oshib ketdi! Zudlik bilan tejamkorlik rejimiga o\'ting.');
    }
  } else {
    tips.push('💡 Oylik daromadingizni kiriting: <code>/oylik [summa]</code> — aniq baho hisoblanadi.');
  }

  // 2. Budget Discipline (Byudjet intizomi)
  if (budget > 0) {
    const budgetPct = Math.round((totalMonth / budget) * 100);
    if (budgetPct <= 75) {
      score += 20;
      tips.push(`🎯 Byudjet intizomi a'lo: limitning faqat ${budgetPct}% qismi sarflandi.`);
    } else if (budgetPct <= 100) {
      score += 10;
      tips.push(`⚠️ Byudjet limitiga yaqinlashdingiz (${budgetPct}%).`);
    } else {
      score -= 25;
      tips.push(`🚨 Byudjet ${budgetPct - 100}% ga oshib ketdi!`);
    }
  } else {
    tips.push('🎯 Oylik byudjet belgilasangiz, moliyaviy ballingiz yanada oshadi.');
  }

  // 3. Debt Burden (Qarz yuki)
  if (debts && debts.totalBorrow > 0) {
    if (incomeTotal > 0 && debts.totalBorrow > incomeTotal * 0.5) {
      score -= 15;
      tips.push('⚠️ Qarz yuki oylik daromadning 50% dan yuqori. Qarzni tezroq yopishga urg\'u bering.');
    } else {
      score -= 5;
    }
  }

  // Clamp score between 10 and 100
  score = Math.max(10, Math.min(100, score));

  // Determine Tier and Badge
  if (score >= 85) {
    statusBadge = '💎 Oltin Jamg\'aruvchi';
    statusEmoji = '💎';
  } else if (score >= 70) {
    statusBadge = '🌟 Kuchli Moliyachi';
    statusEmoji = '🌟';
  } else if (score >= 50) {
    statusBadge = '🟢 Barqaror Moliyachi';
    statusEmoji = '🟢';
  } else if (score >= 35) {
    statusBadge = '🟡 O\'rtacha (Xavfga yaqin)';
    statusEmoji = '🟡';
  } else {
    statusBadge = '🔴 Xavfli Hudud';
    statusEmoji = '🔴';
  }

  // Generate progress bar
  const filledBars = Math.round(score / 10);
  const emptyBars = 10 - filledBars;
  const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);

  let message = `🏆 <b>MOLIYAVIY SALOMATLIK BAHOSI (FINANCIAL HEALTH)</b>\n\n`;
  message += `👤 <b>${userName}</b>\n`;
  message += `Holat: ${statusEmoji} <b>${statusBadge}</b>\n`;
  message += `Baho: <b>${score} / 100 ball</b>\n`;
  message += `[<code>${progressBar}</code>]\n\n`;

  message += `📊 <b>Asosiy ko'rsatkichlar:</b>\n`;
  message += `• Daromad: ${formatCurrency(incomeTotal)}\n`;
  message += `• Chiqim: ${formatCurrency(totalMonth)}\n`;
  message += `• Sof jamg'arma: ${balance >= 0 ? '+' : ''}${formatCurrency(balance)}`;
  if (incomeTotal > 0) {
    message += ` (<i>${savingsRate}%</i>)`;
  }
  message += `\n\n`;

  message += `💡 <b>Ekspert xulosasi va tavsiyalar:</b>\n`;
  for (const t of tips) {
    message += `• ${t}\n`;
  }

  return message;
}

module.exports = {
  calculateFinancialHealth
};
