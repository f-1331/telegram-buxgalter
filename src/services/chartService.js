const QuickChart = require('quickchart-js');
const { getCategoryColor, getCategoryEmoji } = require('../utils/categories');
const { formatCurrency, formatYearMonthUz } = require('../utils/formatters');

/**
 * Generates a modern infographic doughnut chart for category breakdown
 * @param {Array} categoryStats - [{ category, total_amount, percentage, count }]
 * @param {string} yearMonthStr - 'YYYY-MM'
 * @param {number} totalAmount - Total sum for the month
 * @returns {Promise<Buffer>} - Image buffer
 */
async function generateMonthlyInfographic(categoryStats, yearMonthStr, totalAmount) {
  if (!categoryStats || categoryStats.length === 0) {
    throw new Error('Infografika yaratish uchun xarajatlar mavjud emas.');
  }

  const chart = new QuickChart();
  chart.setWidth(900);
  chart.setHeight(650);
  chart.setDevicePixelRatio(2.0);
  chart.setBackgroundColor('#ffffff');

  const monthTitle = formatYearMonthUz(yearMonthStr);
  const labels = categoryStats.map(c => `${getCategoryEmoji(c.category)} ${c.category} (${c.percentage}%)`);
  const data = categoryStats.map(c => c.total_amount);
  const backgroundColors = categoryStats.map(c => getCategoryColor(c.category));

  const chartConfig = {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [
        {
          data: data,
          backgroundColor: backgroundColors,
          borderColor: '#ffffff',
          borderWidth: 3,
          hoverOffset: 12
        }
      ]
    },
    options: {
      responsive: true,
      layout: {
        padding: {
          top: 25,
          bottom: 25,
          left: 20,
          right: 20
        }
      },
      plugins: {
        title: {
          display: true,
          text: `📊 ${monthTitle.toUpperCase()} XARAJATLAR TAHLILI`,
          font: {
            size: 24,
            weight: 'bold',
            family: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
          },
          padding: {
            top: 10,
            bottom: 6
          },
          color: '#1e293b'
        },
        subtitle: {
          display: true,
          text: `Jami xarajat: ${formatCurrency(totalAmount)} | Shaxsiy AI Buxgalter`,
          font: {
            size: 16,
            weight: '500'
          },
          padding: {
            bottom: 20
          },
          color: '#64748b'
        },
        legend: {
          position: 'right',
          labels: {
            font: {
              size: 14,
              weight: '600'
            },
            boxWidth: 18,
            boxHeight: 18,
            padding: 16,
            color: '#334155'
          }
        },
        datalabels: {
          display: true,
          color: '#ffffff',
          font: {
            weight: 'bold',
            size: 13
          },
          formatter: (value, ctx) => {
            const sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
            const percentage = ((value * 100) / sum).toFixed(0);
            return percentage >= 5 ? `${percentage}%` : '';
          }
        }
      },
      cutout: '58%'
    }
  };

  chart.setConfig(chartConfig);
  return await chart.toBinary();
}

/**
 * Generates a bar chart showing day-by-day spending trend
 * @param {Array} dailyStats - [{ expense_date, total_amount, count }]
 * @param {string} yearMonthStr - 'YYYY-MM'
 * @returns {Promise<Buffer>} - Image buffer
 */
async function generateDailyTrendChart(dailyStats, yearMonthStr) {
  if (!dailyStats || dailyStats.length === 0) {
    throw new Error('Kunlik diagramma uchun ma\'lumot yetarli emas.');
  }

  const chart = new QuickChart();
  chart.setWidth(900);
  chart.setHeight(480);
  chart.setDevicePixelRatio(2.0);
  chart.setBackgroundColor('#ffffff');

  const monthTitle = formatYearMonthUz(yearMonthStr);
  const labels = dailyStats.map(d => {
    const parts = d.expense_date.split('-');
    return `${parseInt(parts[2], 10)}-kun`;
  });
  const data = dailyStats.map(d => d.total_amount);

  const chartConfig = {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Kunlik xarajat (so\'m)',
          data: data,
          backgroundColor: '#3B82F6',
          borderRadius: 6,
          borderSkipped: false
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `📅 ${monthTitle.toUpperCase()} - KUNLIK DINAMIKA`,
          font: {
            size: 20,
            weight: 'bold'
          },
          color: '#1e293b'
        },
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (val) => {
              if (val >= 1000000) return (val / 1000000).toFixed(1) + ' mln';
              if (val >= 1000) return (val / 1000).toFixed(0) + ' ming';
              return val;
            }
          }
        }
      }
    }
  };

  chart.setConfig(chartConfig);
  return await chart.toBinary();
}

module.exports = {
  generateMonthlyInfographic,
  generateDailyTrendChart
};
