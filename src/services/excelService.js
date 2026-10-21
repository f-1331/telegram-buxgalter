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
 * Generates an executive, professionally styled Excel workbook
 * @param {Array} expenses - List of expense & income records
 * @param {Array} categoryStats - Breakdown by expense categories
 * @param {string} yearMonthStr - 'YYYY-MM'
 * @param {string} userName - Telegram user name
 * @param {Array} incomeCategoryStats - Breakdown by income categories
 * @returns {Promise<string>} - Absolute path to the generated .xlsx file
 */
async function generateMonthlyExcel(expenses, categoryStats, yearMonthStr, userName = 'Foydalanuvchi', incomeCategoryStats = []) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Shaxsiy AI Buxgalter';
  workbook.lastModifiedBy = 'Shaxsiy AI Buxgalter';
  workbook.created = new Date();
  workbook.modified = new Date();

  const monthTitle = formatYearMonthUz(yearMonthStr);
  const totalIncome = expenses.filter(e => e.type === 'income').reduce((sum, e) => sum + Number(e.amount), 0);
  const totalExpense = expenses.filter(e => !e.type || e.type === 'expense').reduce((sum, e) => sum + Number(e.amount), 0);
  const netBalance = totalIncome - totalExpense;

  // --------------------------------------------------------------------------
  // SHEET 1: Xarajatlar va Kirimlar tarixi (Detailed Records)
  // --------------------------------------------------------------------------
  const sheet1 = workbook.addWorksheet('Amallar tarixi', {
    views: [{ showGridLines: true }]
  });

  // Title Banner
  sheet1.mergeCells('A1:G1');
  const titleCell = sheet1.getCell('A1');
  titleCell.value = `📊 SHAXSIY AI BUXGALTER - ${monthTitle.toUpperCase()} MOLIYAVIY HISOBOTI`;
  titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; // Dark Navy
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet1.getRow(1).height = 36;

  // Subtitle Banner
  sheet1.mergeCells('A2:G2');
  const subtitleCell = sheet1.getCell('A2');
  const balanceSign = netBalance >= 0 ? '+' : '';
  subtitleCell.value = `Foydalanuvchi: ${userName} | Kirim: +${formatCurrency(totalIncome)} | Chiqim: -${formatCurrency(totalExpense)} | Balans: ${balanceSign}${formatCurrency(netBalance)}`;
  subtitleCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF334155' } };
  subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet1.getRow(2).height = 24;

  // Header Row
  sheet1.getRow(3).values = ['№', 'Sana', 'Turi', 'Kategoriya', 'Xarajat / Daromad nomi', 'Miqdor (so\'m)', 'Kiritish turi'];
  const headerRow = sheet1.getRow(3);
  headerRow.height = 26;
  headerRow.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  for (let col = 1; col <= 7; col++) {
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
    const isIncome = item.type === 'income';
    const typeLabel = isIncome ? '🟢 Kirim' : '🔴 Chiqim';
    const emoji = getCategoryEmoji(item.category);
    const inputTypeLabel = item.input_type === 'voice' 
      ? '🎙 Ovozli' 
      : (item.input_type === 'video' ? '📹 Video' : '✍️ Matn');

    row.values = [
      index + 1,
      item.expense_date,
      typeLabel,
      `${emoji} ${item.category}`,
      item.description || item.category,
      Number(item.amount),
      inputTypeLabel
    ];
    row.height = 22;

    const rowBg = isIncome 
      ? 'FFF0FDF4' // Light soft green
      : (index % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC');

    for (let col = 1; col <= 7; col++) {
      const cell = row.getCell(col);
      cell.font = {
        name: 'Segoe UI',
        size: 10,
        color: { argb: isIncome ? 'FF166534' : 'FF1E293B' },
        bold: isIncome && col === 6
      };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      if (col === 1 || col === 2 || col === 3 || col === 7) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (col === 6) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0 "so\'m"';
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    }
    currentRow++;
  });

  // Summary Rows
  if (expenses.length > 0) {
    // 1. Total Income Row
    sheet1.mergeCells(`A${currentRow}:E${currentRow}`);
    const incLabel = sheet1.getCell(`A${currentRow}`);
    incLabel.value = 'JAMI DAROMAD (KIRIM):';
    incLabel.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF15803D' } };
    incLabel.alignment = { vertical: 'middle', horizontal: 'right' };
    incLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };

    const incVal = sheet1.getCell(`F${currentRow}`);
    incVal.value = totalIncome;
    incVal.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF15803D' } };
    incVal.numFmt = '#,##0 "so\'m"';
    incVal.alignment = { vertical: 'middle', horizontal: 'right' };
    incVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };

    sheet1.getCell(`G${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    sheet1.getRow(currentRow).height = 24;
    currentRow++;

    // 2. Total Expense Row
    sheet1.mergeCells(`A${currentRow}:E${currentRow}`);
    const expLabel = sheet1.getCell(`A${currentRow}`);
    expLabel.value = 'JAMI XARAJAT (CHIQIM):';
    expLabel.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
    expLabel.alignment = { vertical: 'middle', horizontal: 'right' };
    expLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };

    const expVal = sheet1.getCell(`F${currentRow}`);
    expVal.value = totalExpense;
    expVal.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
    expVal.numFmt = '#,##0 "so\'m"';
    expVal.alignment = { vertical: 'middle', horizontal: 'right' };
    expVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };

    sheet1.getCell(`G${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    sheet1.getRow(currentRow).height = 24;
    currentRow++;

    // 3. Net Balance Row
    sheet1.mergeCells(`A${currentRow}:E${currentRow}`);
    const balLabel = sheet1.getCell(`A${currentRow}`);
    balLabel.value = 'SOF QOLDIQ (BALANS):';
    balLabel.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1E3A8A' } };
    balLabel.alignment = { vertical: 'middle', horizontal: 'right' };
    balLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };

    const balVal = sheet1.getCell(`F${currentRow}`);
    balVal.value = netBalance;
    balVal.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: netBalance >= 0 ? 'FF15803D' : 'FFB91C1C' } };
    balVal.numFmt = '#,##0 "so\'m"';
    balVal.alignment = { vertical: 'middle', horizontal: 'right' };
    balVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };

    sheet1.getCell(`G${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    sheet1.getRow(currentRow).height = 26;
  }

  // Set explicit column widths
  sheet1.columns = [
    { width: 6 },  // №
    { width: 14 }, // Sana
    { width: 13 }, // Turi
    { width: 26 }, // Kategoriya
    { width: 34 }, // Tavsif
    { width: 22 }, // Miqdor
    { width: 15 }  // Kiritish turi
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

  // Subheader: Xarajatlar tahlili
  sheet2.mergeCells('A2:E2');
  const expSub = sheet2.getCell('A2');
  expSub.value = '🔴 CHIQIMLAR (XARAJATLAR) BO\'YICHA TAHLIL';
  expSub.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF991B1B' } };
  expSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
  expSub.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet2.getRow(2).height = 24;

  // Sheet 2 Headers
  sheet2.getRow(3).values = ['Kategoriya', 'Jami summa (so\'m)', 'Ulushi (%)', 'Xarajatlar soni', 'O\'rtacha (so\'m)'];
  const catHeaderRow = sheet2.getRow(3);
  catHeaderRow.height = 26;
  catHeaderRow.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };

  for (let col = 1; col <= 5; col++) {
    const cell = catHeaderRow.getCell(col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF047857' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } }
    };
  }

  // Populate Expense Category Data
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

  // Expense Category Total Row
  if (categoryStats.length > 0) {
    const totalRow = sheet2.getRow(catRowIdx);
    totalRow.values = [
      'JAMI CHIQIM:',
      totalExpense,
      1.0,
      expenses.filter(e => !e.type || e.type === 'expense').length,
      Math.round(totalExpense / (expenses.filter(e => !e.type || e.type === 'expense').length || 1))
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
    catRowIdx += 2;
  }

  // Populate Income Category Section if exists
  if (incomeCategoryStats && incomeCategoryStats.length > 0) {
    sheet2.mergeCells(`A${catRowIdx}:E${catRowIdx}`);
    const incSub = sheet2.getCell(`A${catRowIdx}`);
    incSub.value = '🟢 DAROMADLAR (KIRIMLAR) MANBALARI';
    incSub.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF15803D' } };
    incSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    incSub.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet2.getRow(catRowIdx).height = 24;
    catRowIdx++;

    incomeCategoryStats.forEach((cat, index) => {
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

      for (let col = 1; col <= 5; col++) {
        const cell = row.getCell(col);
        cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF166534' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
        if (col === 1) cell.alignment = { vertical: 'middle', horizontal: 'left' };
        if (col === 2 || col === 5) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '#,##0 "so\'m"';
        }
        if (col === 3) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.numFmt = '0.0%';
        }
        if (col === 4) cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      catRowIdx++;
    });
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
