import { getCategoryEmoji } from './categories.js';
import { formatYearMonthUz, formatCurrency } from './formatters.js';

function xmlEscape(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates a professionally styled multi-sheet Excel file (SpreadsheetML .xls)
 * with zero external dependencies, returning Uint8Array ready for Telegram InputFile.
 */
export function generateMonthlyExcelBytes(
  expenses,
  categoryStats,
  yearMonthStr,
  userName = 'Foydalanuvchi',
  incomeCategoryStats = []
) {
  const monthTitle = formatYearMonthUz(yearMonthStr);
  const totalIncome = expenses
    .filter((e) => e.type === 'income')
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const totalExpense = expenses
    .filter((e) => !e.type || e.type === 'expense')
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const netBalance = totalIncome - totalExpense;
  const balSign = netBalance >= 0 ? '+' : '';

  // Sheet 1 rows
  let sheet1Rows = '';
  sheet1Rows += `
    <Row ss:Height="32">
      <Cell ss:MergeAcross="6" ss:StyleID="Title"><Data ss:Type="String">SHAXSIY AI BUXGALTER - ${xmlEscape(monthTitle.toUpperCase())} MOLIYAVIY HISOBOTI</Data></Cell>
    </Row>
    <Row ss:Height="22">
      <Cell ss:MergeAcross="6" ss:StyleID="SubTitle"><Data ss:Type="String">Foydalanuvchi: ${xmlEscape(userName)} | Kirim: +${xmlEscape(formatCurrency(totalIncome))} | Chiqim: -${xmlEscape(formatCurrency(totalExpense))} | Balans: ${balSign}${xmlEscape(formatCurrency(netBalance))}</Data></Cell>
    </Row>
    <Row ss:Height="24">
      <Cell ss:StyleID="Header"><Data ss:Type="String">№</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Sana</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Turi</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Kategoriya</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Xarajat / Daromad nomi</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Miqdor (so'm)</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Kiritish turi</Data></Cell>
    </Row>`;

  expenses.forEach((item, index) => {
    const isIncome = item.type === 'income';
    const typeLabel = isIncome ? 'Kirim' : 'Chiqim';
    const emoji = getCategoryEmoji(item.category);
    const inputLabel =
      item.input_type === 'voice'
        ? 'Ovozli'
        : item.input_type === 'video'
        ? 'Video'
        : item.input_type === 'photo'
        ? 'Chek/Rasm'
        : 'Matn';
    const rowStyle = isIncome ? 'IncomeRow' : 'NormalRow';
    const numStyle = isIncome ? 'IncomeNum' : 'NormalNum';

    sheet1Rows += `
    <Row ss:Height="20">
      <Cell ss:StyleID="${rowStyle}"><Data ss:Type="Number">${index + 1}</Data></Cell>
      <Cell ss:StyleID="${rowStyle}"><Data ss:Type="String">${xmlEscape(item.expense_date)}</Data></Cell>
      <Cell ss:StyleID="${rowStyle}"><Data ss:Type="String">${typeLabel}</Data></Cell>
      <Cell ss:StyleID="${rowStyle}"><Data ss:Type="String">${xmlEscape(`${emoji} ${item.category}`)}</Data></Cell>
      <Cell ss:StyleID="${rowStyle}"><Data ss:Type="String">${xmlEscape(item.description || item.category)}</Data></Cell>
      <Cell ss:StyleID="${numStyle}"><Data ss:Type="Number">${Number(item.amount)}</Data></Cell>
      <Cell ss:StyleID="${rowStyle}"><Data ss:Type="String">${inputLabel}</Data></Cell>
    </Row>`;
  });

  sheet1Rows += `
    <Row ss:Height="24">
      <Cell ss:MergeAcross="4" ss:StyleID="TotalIncLabel"><Data ss:Type="String">JAMI DAROMAD (KIRIM):</Data></Cell>
      <Cell ss:StyleID="TotalIncNum"><Data ss:Type="Number">${totalIncome}</Data></Cell>
      <Cell ss:StyleID="TotalIncLabel"><Data ss:Type="String"></Data></Cell>
    </Row>
    <Row ss:Height="24">
      <Cell ss:MergeAcross="4" ss:StyleID="TotalExpLabel"><Data ss:Type="String">JAMI XARAJAT (CHIQIM):</Data></Cell>
      <Cell ss:StyleID="TotalExpNum"><Data ss:Type="Number">${totalExpense}</Data></Cell>
      <Cell ss:StyleID="TotalExpLabel"><Data ss:Type="String"></Data></Cell>
    </Row>
    <Row ss:Height="26">
      <Cell ss:MergeAcross="4" ss:StyleID="TotalBalLabel"><Data ss:Type="String">SOF QOLDIQ (BALANS):</Data></Cell>
      <Cell ss:StyleID="TotalBalNum"><Data ss:Type="Number">${netBalance}</Data></Cell>
      <Cell ss:StyleID="TotalBalLabel"><Data ss:Type="String"></Data></Cell>
    </Row>`;

  // Sheet 2 rows (Category Summary)
  let sheet2Rows = `
    <Row ss:Height="30">
      <Cell ss:MergeAcross="4" ss:StyleID="TitleGreen"><Data ss:Type="String">KATEGORIYALAR BO'YICHA TAHLIL - ${xmlEscape(monthTitle.toUpperCase())}</Data></Cell>
    </Row>
    <Row ss:Height="24">
      <Cell ss:StyleID="HeaderGreen"><Data ss:Type="String">Kategoriya (Chiqim)</Data></Cell>
      <Cell ss:StyleID="HeaderGreen"><Data ss:Type="String">Jami summa (so'm)</Data></Cell>
      <Cell ss:StyleID="HeaderGreen"><Data ss:Type="String">Ulushi (%)</Data></Cell>
      <Cell ss:StyleID="HeaderGreen"><Data ss:Type="String">Soni</Data></Cell>
      <Cell ss:StyleID="HeaderGreen"><Data ss:Type="String">O'rtacha (so'm)</Data></Cell>
    </Row>`;

  for (const cat of categoryStats) {
    const emoji = getCategoryEmoji(cat.category);
    sheet2Rows += `
    <Row ss:Height="20">
      <Cell ss:StyleID="NormalRow"><Data ss:Type="String">${xmlEscape(`${emoji} ${cat.category}`)}</Data></Cell>
      <Cell ss:StyleID="NormalNum"><Data ss:Type="Number">${Number(cat.total_amount)}</Data></Cell>
      <Cell ss:StyleID="NormalRow"><Data ss:Type="String">${xmlEscape(cat.percentage)}%</Data></Cell>
      <Cell ss:StyleID="NormalRow"><Data ss:Type="Number">${Number(cat.count)}</Data></Cell>
      <Cell ss:StyleID="NormalNum"><Data ss:Type="Number">${Number(cat.avg_amount)}</Data></Cell>
    </Row>`;
  }

  if (incomeCategoryStats && incomeCategoryStats.length > 0) {
    sheet2Rows += `
    <Row ss:Height="16"></Row>
    <Row ss:Height="24">
      <Cell ss:StyleID="Header"><Data ss:Type="String">Kategoriya (Kirim / Daromad)</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Jami summa (so'm)</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Ulushi (%)</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">Soni</Data></Cell>
      <Cell ss:StyleID="Header"><Data ss:Type="String">O'rtacha (so'm)</Data></Cell>
    </Row>`;
    for (const cat of incomeCategoryStats) {
      const emoji = getCategoryEmoji(cat.category);
      sheet2Rows += `
    <Row ss:Height="20">
      <Cell ss:StyleID="IncomeRow"><Data ss:Type="String">${xmlEscape(`${emoji} ${cat.category}`)}</Data></Cell>
      <Cell ss:StyleID="IncomeNum"><Data ss:Type="Number">${Number(cat.total_amount)}</Data></Cell>
      <Cell ss:StyleID="IncomeRow"><Data ss:Type="String">${xmlEscape(cat.percentage)}%</Data></Cell>
      <Cell ss:StyleID="IncomeRow"><Data ss:Type="Number">${Number(cat.count)}</Data></Cell>
      <Cell ss:StyleID="IncomeNum"><Data ss:Type="Number">${Number(cat.avg_amount)}</Data></Cell>
    </Row>`;
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Title">
      <Font ss:FontName="Segoe UI" ss:Size="13" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1E3A8A" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="TitleGreen">
      <Font ss:FontName="Segoe UI" ss:Size="13" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#065F46" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="SubTitle">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Italic="1" ss:Color="#334155"/>
      <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="Header">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#2563EB" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="HeaderGreen">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#059669" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="NormalRow">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#1E293B"/>
      <Alignment ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="NormalNum">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#1E293B"/>
      <NumberFormat ss:Format="#,##0"/>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="IncomeRow">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#166534"/>
      <Interior ss:Color="#F0FDF4" ss:Pattern="Solid"/>
      <Alignment ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="IncomeNum">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#166534"/>
      <Interior ss:Color="#F0FDF4" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="#,##0"/>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="TotalIncLabel">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#15803D"/>
      <Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="TotalIncNum">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#15803D"/>
      <Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="#,##0"/>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="TotalExpLabel">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#B91C1C"/>
      <Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="TotalExpNum">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#B91C1C"/>
      <Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="#,##0"/>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="TotalBalLabel">
      <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#1E3A8A"/>
      <Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="TotalBalNum">
      <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#1E3A8A"/>
      <Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="#,##0"/>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Amallar tarixi">
    <Table>
      <Column ss:Width="35"/>
      <Column ss:Width="85"/>
      <Column ss:Width="65"/>
      <Column ss:Width="150"/>
      <Column ss:Width="200"/>
      <Column ss:Width="110"/>
      <Column ss:Width="80"/>
      ${sheet1Rows}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="Kategoriyalar tahlili">
    <Table>
      <Column ss:Width="180"/>
      <Column ss:Width="120"/>
      <Column ss:Width="75"/>
      <Column ss:Width="65"/>
      <Column ss:Width="115"/>
      ${sheet2Rows}
    </Table>
  </Worksheet>
</Workbook>`;

  return new TextEncoder().encode(xml);
}
