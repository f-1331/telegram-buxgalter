const { InlineKeyboard, InputFile } = require('grammy');
const db = require('../database/db');
const { handleMonthlyReport, handleInfographic, handleExcelExport } = require('./reportHandler');
const { generateDailyTrendChart } = require('../services/chartService');
const { handleSendDailyTrend, handleSettingsMenu } = require('./settingsHandler');
const { handleGoalsMenu, handleSubscriptionsMenu } = require('./goalHandler');
const { formatCurrency, formatYearMonthUz } = require('../utils/formatters');

/**
 * Handle all inline keyboard callback queries
 */
async function handleCallbackQuery(ctx) {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;

  try {
    // 1. Undo expenses: 'undo_12,13'
    if (data.startsWith('undo_')) {
      const idsStr = data.replace('undo_', '');
      const ids = idsStr.split(',').map(Number).filter(n => !isNaN(n));

      if (ids.length > 0) {
        db.deleteExpenses(ids, userId);
        await ctx.answerCallbackQuery({ text: '✅ Xarajat bekor qilindi va o\'chirildi!' });
        return ctx.editMessageText('❌ <i>Ushbu yozuv bekor qilindi va bazadan o\'chirildi.</i>', {
          parse_mode: 'HTML'
        });
      } else {
        return ctx.answerCallbackQuery({ text: 'O\'chirish uchun yozuv topilmadi.' });
      }
    }

    // 2. Switch month report: 'rep_month_2026-09'
    if (data.startsWith('rep_month_')) {
      const targetMonth = data.replace('rep_month_', '');
      await ctx.answerCallbackQuery();
      return handleMonthlyReport(ctx, targetMonth);
    }

    // 3. Infographic doughnut chart button: 'chart_2026-10'
    if (data.startsWith('chart_')) {
      const targetMonth = data.replace('chart_', '');
      await ctx.answerCallbackQuery({ text: 'Infografika tayyorlanmoqda...' });
      return handleInfographic(ctx, targetMonth);
    }

    // 4. Daily trend bar chart button: 'trend_2026-10'
    if (data.startsWith('trend_')) {
      const targetMonth = data.replace('trend_', '');
      await ctx.answerCallbackQuery({ text: 'Kunlik grafik chizilmoqda...' });
      
      const dailyStats = db.getMonthDailyBreakdown(userId, targetMonth);
      if (!dailyStats || dailyStats.length === 0) {
        return ctx.reply('⚠️ Ushbu oy uchun grafik chizishga xarajatlar topilmadi.');
      }
      const chartBuffer = await generateDailyTrendChart(dailyStats, targetMonth);
      const monthTitle = formatYearMonthUz(targetMonth);
      return ctx.replyWithPhoto(new InputFile(chartBuffer, `Trend_${targetMonth}.png`), {
        caption: `📊 <b>${monthTitle.toUpperCase()} — KUNLIK XARAJATLAR DINAMIKASI</b>`,
        parse_mode: 'HTML'
      });
    }

    // 5. Excel export button: 'excel_2026-10'
    if (data.startsWith('excel_')) {
      const targetMonth = data.replace('excel_', '');
      await ctx.answerCallbackQuery({ text: 'Excel fayl yaratilmoqda...' });
      return handleExcelExport(ctx, targetMonth);
    }

    // 6. Set budget button: 'set_budget_5000000'
    if (data.startsWith('set_budget_')) {
      const amount = data.replace('set_budget_', '');
      const { handleSetBudget } = require('./aiHandler');
      await ctx.answerCallbackQuery({ text: 'Byudjet saqlandi!' });
      return handleSetBudget(ctx, amount);
    }

    // 7. Settle debt button: 'settle_debt_12'
    if (data.startsWith('settle_debt_')) {
      const debtId = Number(data.replace('settle_debt_', ''));
      const success = db.settleDebt(debtId, userId);
      if (success) {
        await ctx.answerCallbackQuery({ text: '✅ Qarz yopildi!' });
        return ctx.editMessageText('✅ <b>Ushbu qarz to\'liq uzildi va qarz daftarida yopildi!</b>', {
          parse_mode: 'HTML'
        });
      } else {
        return ctx.answerCallbackQuery({ text: 'Qarz yozuvi topilmadi.' });
      }
    }

    // 8. Delete debt button: 'del_debt_12'
    if (data.startsWith('del_debt_')) {
      const debtId = Number(data.replace('del_debt_', ''));
      const success = db.deleteDebt(debtId, userId);
      if (success) {
        await ctx.answerCallbackQuery({ text: '🗑 Qarz o\'chirildi!' });
        return ctx.editMessageText('🗑 <i>Ushbu qarz yozuvi bazadan o\'chirildi.</i>', {
          parse_mode: 'HTML'
        });
      } else {
        return ctx.answerCallbackQuery({ text: 'Qarz yozuvi topilmadi.' });
      }
    }

    // 9. Add money to goal button: 'goal_add_<id>_<amount>'
    if (data.startsWith('goal_add_')) {
      const parts = data.replace('goal_add_', '').split('_');
      const goalId = Number(parts[0]);
      const addAmount = Number(parts[1]);

      const res = db.addMoneyToGoal(goalId, userId, addAmount);
      if (res) {
        const text = res.isReached 
          ? `🎉 TABRIKLAYMIZ! "${res.title}" maqsadiga to'liq erishildi!` 
          : `✅ "${res.title}" maqsadiga ${formatCurrency(addAmount)} qo'shildi!`;
        await ctx.answerCallbackQuery({ text });
        return handleGoalsMenu(ctx);
      } else {
        return ctx.answerCallbackQuery({ text: 'Maqsad topilmadi.' });
      }
    }

    // 10. Delete goal button: 'goal_del_<id>'
    if (data.startsWith('goal_del_')) {
      const goalId = Number(data.replace('goal_del_', ''));
      db.deleteGoal(goalId, userId);
      await ctx.answerCallbackQuery({ text: '🗑 Maqsad o\'chirildi!' });
      return handleGoalsMenu(ctx);
    }

    // 11. Delete subscription button: 'sub_del_<id>'
    if (data.startsWith('sub_del_')) {
      const subId = Number(data.replace('sub_del_', ''));
      db.deleteSubscription(subId, userId);
      await ctx.answerCallbackQuery({ text: '🗑 Doimiy to\'lov o\'chirildi!' });
      return handleSubscriptionsMenu(ctx);
    }

    // 12. Toggle daily reminder
    if (data === 'toggle_reminder') {
      const user = db.db.prepare('SELECT daily_reminder FROM users WHERE id = ?').get(userId);
      const newState = user && user.daily_reminder === 1 ? 0 : 1;
      db.toggleReminder(userId, newState === 1);
      await ctx.answerCallbackQuery({ text: newState === 1 ? '🔔 Eslatma yoqildi!' : '🔕 Eslatma o\'chirildi!' });
      return handleSettingsMenu(ctx);
    }

    // 13. Open budget menu from settings
    if (data === 'open_budget_menu') {
      await ctx.answerCallbackQuery();
      const { handleBudgetMenu } = require('./aiHandler');
      return handleBudgetMenu(ctx);
    }

    // 14. Show daily trend from settings
    if (data === 'show_daily_trend') {
      await ctx.answerCallbackQuery();
      return handleSendDailyTrend(ctx);
    }

    // 15. Ask reset confirmation
    if (data === 'ask_reset_data') {
      await ctx.answerCallbackQuery();
      const confirmKb = new InlineKeyboard()
        .text('🔴 Ha, butunlay o\'chirish', 'confirm_reset_now')
        .row()
        .text('❌ Bekor qilish', 'cancel_reset');

      return ctx.editMessageText(
        '⚠️ <b>DIQQAT! BARCHA MA\'LUMOTLARNI TOZALASH</b>\n\n' +
        'Ushbu amal sizning barcha xarajatlaringiz, daromadlaringiz, qarzlaringiz va maqsadlaringizni butunlay o\'chirib tashlaydi.\n\n' +
        'Rostdan ham barcha ma\'lumotlaringizni o\'chirmoqchimisiz?',
        {
          parse_mode: 'HTML',
          reply_markup: confirmKb
        }
      );
    }

    // 16. Confirm reset now
    if (data === 'confirm_reset_now') {
      db.resetUserData(userId);
      await ctx.answerCallbackQuery({ text: '✅ Barcha ma\'lumotlaringiz tozalandi!' });
      return ctx.editMessageText(
        '✅ <b>Barcha moliyaviy ma\'lumotlaringiz tozalandi!</b>\n\n' +
        'Bot toza holatda yangidan ishga tushirildi. Ovozli yoki matnli xabarlar yuborib yangi hisob yuritishni boshlashingiz mumkin!',
        { parse_mode: 'HTML' }
      );
    }

    // 17. Cancel reset
    if (data === 'cancel_reset') {
      await ctx.answerCallbackQuery({ text: 'Bekor qilindi' });
      return handleSettingsMenu(ctx);
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
