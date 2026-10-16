const db = require('../database/db');
const { handleMonthlyReport, handleInfographic, handleExcelExport } = require('./reportHandler');

/**
 * Handle all inline keyboard callback queries
 */
async function handleCallbackQuery(ctx) {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;

  try {
    // Undo expenses: 'undo_12,13'
    if (data.startsWith('undo_')) {
      const idsStr = data.replace('undo_', '');
      const ids = idsStr.split(',').map(Number).filter(n => !isNaN(n));

      if (ids.length > 0) {
        db.deleteExpenses(ids, userId);
        await ctx.answerCallbackQuery({ text: '✅ Xarajat bekor qilindi va o\'chirildi!' });
        return ctx.editMessageText('❌ <i>Ushbu xarajatlar bekor qilindi va bazadan o\'chirildi.</i>', {
          parse_mode: 'HTML'
        });
      } else {
        await ctx.answerCallbackQuery({ text: 'O\'chirish uchun yozuv topilmadi.' });
      }
    }

    // Switch month report: 'rep_month_2026-09'
    if (data.startsWith('rep_month_')) {
      const targetMonth = data.replace('rep_month_', '');
      await ctx.answerCallbackQuery();
      return handleMonthlyReport(ctx, targetMonth);
    }

    // Infographic button: 'chart_2026-10'
    if (data.startsWith('chart_')) {
      const targetMonth = data.replace('chart_', '');
      await ctx.answerCallbackQuery({ text: 'Infografika tayyorlanmoqda...' });
      return handleInfographic(ctx, targetMonth);
    }

    // Excel button: 'excel_2026-10'
    if (data.startsWith('excel_')) {
      const targetMonth = data.replace('excel_', '');
      await ctx.answerCallbackQuery({ text: 'Excel fayl yaratilmoqda...' });
      return handleExcelExport(ctx, targetMonth);
    }

    // Set budget button: 'set_budget_5000000'
    if (data.startsWith('set_budget_')) {
      const amount = data.replace('set_budget_', '');
      const { handleSetBudget } = require('./aiHandler');
      await ctx.answerCallbackQuery({ text: 'Byudjet saqlandi!' });
      return handleSetBudget(ctx, amount);
    }

    await ctx.answerCallbackQuery();
  } catch (error) {
    console.error('[ActionHandler Error]:', error);
    await ctx.answerCallbackQuery({ text: 'Xatolik yuz berdi.' }).catch(() => {});
  }
}

module.exports = {
  handleCallbackQuery
};
