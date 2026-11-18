import { api } from 'sdk';
import * as db from '../lib/db.js';
import { formatCurrency, getTodayString, escapeHtml } from '../lib/formatters.js';
import { getExpenseActionKeyboard } from '../lib/keyboards.js';
import {
  handleMonthlyReport,
  handleInfographic,
  handleDailyTrend,
  handleExcelExport,
  handleIncomeAndBalance,
  handleBudgetMenu,
  handleSetBudget,
  handleGoalsMenu,
  handleSubscriptionsMenu,
  handleSettingsMenu,
} from '../lib/features.js';

export default async function (callbackQuery, ctx) {
  if (!callbackQuery || !callbackQuery.from) return;

  const data = callbackQuery.data || '';
  const userId = callbackQuery.from.id;
  const firstName = callbackQuery.from.first_name || 'Foydalanuvchi';
  const chatId = callbackQuery.message?.chat?.id || userId;
  const messageId = callbackQuery.message?.message_id;
  const cbId = callbackQuery.id;

  const answer = (text) =>
    api.answerCallbackQuery({ callback_query_id: cbId, ...(text ? { text } : {}) }).catch(() => {});

  try {
    // 1. Undo expenses
    if (data.startsWith('undo_')) {
      const ids = data
        .replace('undo_', '')
        .split(',')
        .map(Number)
        .filter((n) => !isNaN(n));
      if (ids.length > 0) {
        await db.deleteExpenses(ids, userId);
        await answer("✅ Xarajat bekor qilindi va o'chirildi!");
        if (messageId) {
          await api
            .editMessageText({
              chat_id: chatId,
              message_id: messageId,
              text: "❌ <i>Ushbu yozuv bekor qilindi va bazadan o'chirildi.</i>",
              parse_mode: 'HTML',
            })
            .catch(() => {});
        }
        return;
      }
      return await answer("O'chirish uchun yozuv topilmadi.");
    }

    // 2. Switch month report
    if (data.startsWith('rep_month_')) {
      const targetMonth = data.replace('rep_month_', '');
      await answer();
      return await handleMonthlyReport(chatId, userId, targetMonth, messageId);
    }

    // 3. Infographic doughnut chart
    if (data.startsWith('chart_')) {
      const targetMonth = data.replace('chart_', '');
      await answer('Infografika tayyorlanmoqda...');
      return await handleInfographic(chatId, userId, targetMonth);
    }

    // 4. Daily trend bar chart
    if (data.startsWith('trend_')) {
      const targetMonth = data.replace('trend_', '');
      await answer('Kunlik grafik chizilmoqda...');
      return await handleDailyTrend(chatId, userId, targetMonth);
    }

    // 5. Excel export
    if (data.startsWith('excel_')) {
      const targetMonth = data.replace('excel_', '');
      await answer('Excel fayl yaratilmoqda...');
      return await handleExcelExport(chatId, userId, firstName, targetMonth);
    }

    // 6. Set budget
    if (data.startsWith('set_budget_')) {
      const amount = data.replace('set_budget_', '');
      await answer('Byudjet saqlandi!');
      return await handleSetBudget(chatId, userId, amount);
    }

    // 6b. Quick add income
    if (data.startsWith('add_inc_')) {
      const amount = Number(data.replace('add_inc_', ''));
      const todayStr = getTodayString();
      await db.addExpense({
        userId,
        amount,
        category: 'Oylik va Ish haqi',
        description: 'Oylik maosh',
        expenseDate: todayStr,
        rawInput: 'Tugma orqali daromad',
        inputType: 'button',
        type: 'income',
      });
      await answer(`✅ +${formatCurrency(amount)} daromad saqlandi!`);
      return await handleIncomeAndBalance(chatId, userId, messageId);
    }

    // 6c. Quick add expense
    if (data.startsWith('quick_exp_')) {
      const parts = data.replace('quick_exp_', '').split('_');
      const amount = Number(parts[0]);
      const desc = parts.slice(1).join(' ') || 'Xarajat';
      const todayStr = getTodayString();

      let cat = 'Boshqa';
      if (desc === 'Kofe' || desc === 'Tushlik') cat = 'Oziq-ovqat va Kafe';
      else if (desc === 'Taksi' || desc === 'Benzin') cat = 'Transport';
      else if (desc === 'Bozorlik') cat = 'Bozor va Supermarket';
      else if (desc.toLowerCase().includes('aloqa')) cat = 'Kommunal va Aloqa';

      const exp = await db.addExpense({
        userId,
        amount,
        category: cat,
        description: desc,
        expenseDate: todayStr,
        rawInput: `Tezkor: ${desc} ${amount}`,
        inputType: 'button',
        type: 'expense',
      });

      await answer(`✅ ${desc} (${formatCurrency(amount)}) qo'shildi!`);
      return await api.sendMessage({
        chat_id: chatId,
        text:
          `⚡️ <b>Tezkor xarajat yozildi:</b>\n` +
          `• <b>${escapeHtml(desc)}:</b> ${formatCurrency(amount)} (${escapeHtml(cat)})\n` +
          `📅 Sana: ${todayStr}`,
        parse_mode: 'HTML',
        reply_markup: getExpenseActionKeyboard([exp.id]),
      });
    }

    // 7. Settle debt
    if (data.startsWith('settle_debt_')) {
      const debtId = Number(data.replace('settle_debt_', ''));
      const ok = await db.settleDebt(debtId, userId);
      if (ok) {
        await answer('✅ Qarz yopildi!');
        if (messageId) {
          await api
            .editMessageText({
              chat_id: chatId,
              message_id: messageId,
              text: "✅ <b>Ushbu qarz to'liq uzildi va qarz daftarida yopildi!</b>",
              parse_mode: 'HTML',
            })
            .catch(() => {});
        }
        return;
      }
      return await answer('Qarz yozuvi topilmadi.');
    }

    // 8. Delete debt
    if (data.startsWith('del_debt_')) {
      const debtId = Number(data.replace('del_debt_', ''));
      const ok = await db.deleteDebt(debtId, userId);
      if (ok) {
        await answer("🗑 Qarz o'chirildi!");
        if (messageId) {
          await api
            .editMessageText({
              chat_id: chatId,
              message_id: messageId,
              text: "🗑 <i>Ushbu qarz yozuvi bazadan o'chirildi.</i>",
              parse_mode: 'HTML',
            })
            .catch(() => {});
        }
        return;
      }
      return await answer('Qarz yozuvi topilmadi.');
    }

    // 9. Add money to goal
    if (data.startsWith('goal_add_')) {
      const parts = data.replace('goal_add_', '').split('_');
      const goalId = Number(parts[0]);
      const addAmount = Number(parts[1]);
      const res = await db.addMoneyToGoal(goalId, userId, addAmount);
      if (res) {
        const msg = res.isReached
          ? `🎉 TABRIKLAYMIZ! "${res.title}" maqsadiga erishildi!`
          : `✅ "${res.title}" maqsadiga ${formatCurrency(addAmount)} qo'shildi!`;
        await answer(msg);
        return await handleGoalsMenu(chatId, userId);
      }
      return await answer('Maqsad topilmadi.');
    }

    // 10. Delete goal
    if (data.startsWith('goal_del_')) {
      const goalId = Number(data.replace('goal_del_', ''));
      await db.deleteGoal(goalId, userId);
      await answer("🗑 Maqsad o'chirildi!");
      return await handleGoalsMenu(chatId, userId);
    }

    // 11. Delete subscription
    if (data.startsWith('sub_del_')) {
      const subId = Number(data.replace('sub_del_', ''));
      await db.deleteSubscription(subId, userId);
      await answer("🗑 Doimiy to'lov o'chirildi!");
      return await handleSubscriptionsMenu(chatId, userId);
    }

    // 12. Toggle reminder
    if (data === 'toggle_reminder') {
      const user = await db.getUser(userId);
      const newState = user && user.dailyReminder === 1 ? false : true;
      await db.toggleReminder(userId, newState);
      await answer(newState ? '🔔 Eslatma yoqildi!' : "🔕 Eslatma o'chirildi!");
      return await handleSettingsMenu(chatId, userId);
    }

    // 13. Open budget menu
    if (data === 'open_budget_menu') {
      await answer();
      return await handleBudgetMenu(chatId, userId);
    }

    // 14. Show daily trend
    if (data === 'show_daily_trend') {
      await answer();
      return await handleDailyTrend(chatId, userId);
    }

    // 15. Ask reset confirmation
    if (data === 'ask_reset_data') {
      await answer();
      if (messageId) {
        return await api.editMessageText({
          chat_id: chatId,
          message_id: messageId,
          text:
            "⚠️ <b>DIQQAT! BARCHA MA'LUMOTLARNI TOZALASH</b>\n\n" +
            "Ushbu amal sizning barcha xarajatlaringiz, daromadlaringiz, qarzlaringiz va maqsadlaringizni butunlay o'chirib tashlaydi.\n\n" +
            "Rostdan ham barcha ma'lumotlaringizni o'chirmoqchimisiz?",
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔴 Ha, butunlay o'chirish", callback_data: 'confirm_reset_now' }],
              [{ text: '❌ Bekor qilish', callback_data: 'cancel_reset' }],
            ],
          },
        });
      }
      return;
    }

    // 16. Confirm reset
    if (data === 'confirm_reset_now') {
      await db.resetUserData(userId);
      await answer("✅ Barcha ma'lumotlaringiz tozalandi!");
      if (messageId) {
        return await api.editMessageText({
          chat_id: chatId,
          message_id: messageId,
          text:
            "✅ <b>Barcha moliyaviy ma'lumotlaringiz tozalandi!</b>\n\n" +
            "Bot toza holatda yangidan ishga tushirildi. Ovozli yoki matnli xabarlar yuborib hisob yuritishni boshlashingiz mumkin!",
          parse_mode: 'HTML',
        });
      }
      return;
    }

    // 17. Cancel reset
    if (data === 'cancel_reset') {
      await answer('Bekor qilindi');
      return await handleSettingsMenu(chatId, userId);
    }

    await answer();
  } catch (err) {
    console.error('[CallbackQuery Error]:', err);
    await answer('Xatolik yuz berdi.');
  }
}
