import { fetch } from 'sdk';
import { getCategoryColor, getCategoryEmoji } from './categories.js';
import { formatCurrency, formatYearMonthUz } from './formatters.js';

async function readResponseBytes(res) {
  const chunks = [];
  let totalLen = 0;
  for await (const chunk of res.body) {
    const arr = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    chunks.push(arr);
    totalLen += arr.length;
  }
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return merged;
}

async function fetchQuickChartPng(chartConfig, width = 900, height = 650) {
  const res = await fetch('https://quickchart.io/chart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: '4',
      width,
      height,
      devicePixelRatio: 2,
      backgroundColor: '#ffffff',
      format: 'png',
      chart: chartConfig,
    }),
  });
  if (!res.ok) {
    throw new Error(`QuickChart HTTP ${res.status}`);
  }
  return await readResponseBytes(res);
}

export async function generateMonthlyInfographic(categoryStats, yearMonthStr, totalAmount) {
  if (!categoryStats || categoryStats.length === 0) {
    throw new Error('Infografika yaratish uchun xarajatlar mavjud emas.');
  }

  const monthTitle = formatYearMonthUz(yearMonthStr);
  const labels = categoryStats.map((c) => `${getCategoryEmoji(c.category)} ${c.category} (${c.percentage}%)`);
  const data = categoryStats.map((c) => c.total_amount);
  const backgroundColors = categoryStats.map((c) => getCategoryColor(c.category));

  const chartConfig = {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: backgroundColors,
          borderColor: '#ffffff',
          borderWidth: 3,
        },
      ],
    },
    options: {
      layout: { padding: { top: 25, bottom: 25, left: 20, right: 20 } },
      plugins: {
        title: {
          display: true,
          text: `${monthTitle.toUpperCase()} XARAJATLAR TAHLILI`,
          font: { size: 22, weight: 'bold' },
          color: '#1e293b',
        },
        subtitle: {
          display: true,
          text: `Jami xarajat: ${formatCurrency(totalAmount)} | Shaxsiy AI Buxgalter`,
          font: { size: 15 },
          color: '#64748b',
        },
        legend: {
          position: 'right',
          labels: { font: { size: 13 }, boxWidth: 16, padding: 14, color: '#334155' },
        },
      },
      cutout: '56%',
    },
  };

  return await fetchQuickChartPng(chartConfig, 900, 620);
}

export async function generateDailyTrendChart(dailyStats, yearMonthStr) {
  if (!dailyStats || dailyStats.length === 0) {
    throw new Error("Kunlik diagramma uchun ma'lumot yetarli emas.");
  }

  const monthTitle = formatYearMonthUz(yearMonthStr);
  const labels = dailyStats.map((d) => {
    const parts = d.expense_date.split('-');
    return `${parseInt(parts[2], 10)}-kun`;
  });
  const data = dailyStats.map((d) => Number(d.total_amount));

  const chartConfig = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: "Kunlik xarajat (so'm)",
          data,
          backgroundColor: '#3B82F6',
          borderRadius: 6,
        },
      ],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: `${monthTitle.toUpperCase()} - KUNLIK DINAMIKA`,
          font: { size: 20, weight: 'bold' },
          color: '#1e293b',
        },
        legend: { display: false },
      },
      scales: {
        y: { beginAtZero: true },
      },
    },
  };

  return await fetchQuickChartPng(chartConfig, 900, 480);
}
