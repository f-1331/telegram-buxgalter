const ExcelJS = require('exceljs');
const path = require('node:path');
const fs = require('node:fs');
const config = require('../config');
const { getCategoryEmoji } = require('../utils/categories');
const { formatYearMonthUz, formatCurrency } = require('../utils/formatters');

// Ensure exports directory exists
if (!fs.existsSync(config.EXPORTS_DIR)) {
  fs.mkdirSync(config.EXPORTS_DIR, { recursive: true });
}

/**
 * Generates a professionally styled Excel workbook
 * @param {Array} expenses - List of expense records
 * @param {Array} categoryStats - Breakdown by categories
 * @param {string} yearMonthStr - 'YYYY-MM'
 * @param {string} userName - Telegram user name
 * @returns {Promise<string>} - Absolute path to the generated .xlsx file
 */
async function generateMonthlyExcel(expenses, categoryStats, yearMonthStr, userName = 'Foydalanuvchi') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Shaxsiy AI Buxgalter';
  workbook.lastModifiedBy = 'Shaxsiy AI Buxgalter';
  workbook.created = new Date();
  workbook.modified = new Date();

  const monthTitle = formatYearMonthUz(yearMonthStr);
  const totalMonthAmount = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  // --------------------------------------------------------------------------
  // SHEET 1: Xarajatlar ro'yxati (Detailed Records)
  // --------------------------------------------------------------------------
  const sheet1 = workbook.addWorksheet('Xarajatlar tarixi', {
    views: [{ showGridLines: true }]
  });

  // Title Banner
  sheet1.mergeCells('A1:F1');
  const titleCell = sheet1.getCell('A1');
  titleCell.value = `📊 SHAXSIY AI BUXGALTER - ${monthTitle.toUpperCase()} HISOBOTI`;
  titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; // Dark Navy
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet1.getRow(1).height = 36;

  // Subtitle Banner
  sheet1.mergeCells('A2:F2');
  const subtitleCell = sheet1.getCell('A2');
  subtitleCell.value = `Foydalanuvchi: ${userName} | Jami xarajat: ${formatCurrency(totalMonthAmount)} | Yozuvlar soni: ${expenses.length} ta`;
  subtitleCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF334155' } };
  subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet1.getRow(2).height = 24;

  // Header Row
  sheet1.getRow(3).values = ['№', 'Sana', 'Kategoriya', 'Xarajat nomi / Tavsif', 'Miqdor (so\'m)', 'Kiritish turi'];
  const headerRow = sheet1.getRow(3);
  headerRow.height = 26;
  headerRow.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  for (let col = 1; col <= 6; col++) {
    const cell = headerRow.getCell(col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; // Royal Blue
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF1E40AF' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } }
    };
  }

  // Populate Data Rows
  let currentRow = 4;
  expenses.forEach((item, index) => {
    const row = sheet1.getRow(currentRow);
    const emoji = getCategoryEmoji(item.category);
    const inputTypeLabel = item.input_type === 'voice' ? '🎙 Ovozli' : '✍️ Matn';

    row.values = [
      index + 1,
      item.expense_date,
      `${emoji} ${item.category}`,
      item.description || item.category,
      Number(item.amount),
      inputTypeLabel
    ];
    row.height = 22;

    const isEven = index % 2 === 0;
    const rowBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

    for (let col = 1; col <= 6; col++) {
      const cell = row.getCell(col);
      cell.font = { name: 'Segoe UI', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      if (col === 1 || col === 2 || col === 6) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (col === 5) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0 "so\'m"';
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    }
    currentRow++;
  });

  // Summary Row
  if (expenses.length > 0) {
    sheet1.mergeCells(`A${currentRow}:D${currentRow}`);
    const sumLabel = sheet1.getCell(`A${currentRow}`);
    sumLabel.value = 'JAMI XARAJAT:';
    sumLabel.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1E293B' } };
    sumLabel.alignment = { vertical: 'middle', horizontal: 'right' };
    sumLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }; // Light Green

    const sumVal = sheet1.getCell(`E${currentRow}`);
    sumVal.value = { formula: `SUM(E4:E${currentRow - 1})`, result: totalMonthAmount };
    sumVal.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF166534' } };
    sumVal.numFmt = '#,##0 "so\'m"';
    sumVal.alignment = { vertical: 'middle', horizontal: 'right' };
    sumVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };

    const endCell = sheet1.getCell(`F${currentRow}`);
    endCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };

    for (let c = 1; c <= 6; c++) {
      const cell = sheet1.getRow(currentRow).getCell(c);
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF16A34A' } },
        bottom: { style: 'medium', color: { argb: 'FF16A34A' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    }
    sheet1.getRow(currentRow).height = 26;
  }

  // Set explicit column widths
  sheet1.columns = [
    { width: 8 },  // №
    { width: 15 }, // Sana
    { width: 28 }, // Kategoriya
    { width: 35 }, // Tavsif
    { width: 22 }, // Miqdor
    { width: 16 }  // Kiritish turi
  ];

  // --------------------------------------------------------------------------
  // SHEET 2: Kategoriyalar tahlili (Category Summary)
  // --------------------------------------------------------------------------
  const sheet2 = workbook.addWorksheet('Kategoriyalar tahlili', {
    views: [{ showGridLines: true }]
  });

  // Sheet 2 Title
  sheet2.mergeCells('A1:E1');
  const catTitle = sheet2.getCell('A1');
  catTitle.value = `📊 KATEGORIYALAR BO'YICHA TAHLIL - ${monthTitle.toUpperCase()}`;
  catTitle.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  catTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } }; // Dark Emerald
  catTitle.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet2.getRow(1).height = 36;

  // Sheet 2 Headers
  sheet2.getRow(3).values = ['Kategoriya', 'Jami summa (so\'m)', 'Ulushi (%)', 'Xarajatlar soni', 'O\'rtacha (so\'m)'];
  const catHeaderRow = sheet2.getRow(3);
  catHeaderRow.height = 26;
  catHeaderRow.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };

  for (let col = 1; col <= 5; col++) {
    const cell = catHeaderRow.getCell(col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } }; // Emerald
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF047857' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } }
    };
  }

  // Populate Category Data
  let catRowIdx = 4;
  categoryStats.forEach((cat, index) => {
    const row = sheet2.getRow(catRowIdx);
    const emoji = getCategoryEmoji(cat.category);
    const pct = Number(cat.percentage) / 100;

    row.values = [
      `${emoji} ${cat.category}`,
      cat.total_amount,
      pct,
      cat.count,
      cat.avg_amount
    ];
    row.height = 22;

    const rowBg = index % 2 === 0 ? 'FFFFFFFF' : 'FFF0FDF4';

    for (let col = 1; col <= 5; col++) {
      const cell = row.getCell(col);
      cell.font = { name: 'Segoe UI', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      if (col === 1) {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else if (col === 2 || col === 5) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0 "so\'m"';
      } else if (col === 3) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.numFmt = '0.0%';
      } else if (col === 4) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    }
    catRowIdx++;
  });

  // Category Total Row
  if (categoryStats.length > 0) {
    const totalRow = sheet2.getRow(catRowIdx);
    totalRow.values = [
      'JAMI:',
      { formula: `SUM(B4:B${catRowIdx - 1})`, result: totalMonthAmount },
      1.0,
      { formula: `SUM(D4:D${catRowIdx - 1})`, result: expenses.length },
      Math.round(totalMonthAmount / (expenses.length || 1))
    ];
    totalRow.height = 26;
    totalRow.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF065F46' } };

    for (let c = 1; c <= 5; c++) {
      const cell = totalRow.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF059669' } },
        bottom: { style: 'medium', color: { argb: 'FF059669' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
      if (c === 1) cell.alignment = { vertical: 'middle', horizontal: 'left' };
      if (c === 2 || c === 5) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0 "so\'m"';
      }
      if (c === 3) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.numFmt = '0.0%';
      }
      if (c === 4) cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
  }

  sheet2.columns = [
    { width: 30 }, // Kategoriya
    { width: 24 }, // Jami summa
    { width: 16 }, // Ulushi %
    { width: 18 }, // Soni
    { width: 22 }  // O'rtacha
  ];

  // Write file to disk
  const filename = `Hisobot_${yearMonthStr.replace('-', '_')}_${Date.now()}.xlsx`;
  const filePath = path.join(config.EXPORTS_DIR, filename);
  await workbook.xlsx.writeFile(filePath);

  return filePath;
}

module.exports = {
  generateMonthlyExcel
};
