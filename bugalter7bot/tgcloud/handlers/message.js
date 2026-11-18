import { api } from 'sdk';
import * as db from '../lib/db.js';
import {
  processTextMessage,
  processVoiceAudio,
  processReceiptImage,
  chatWithFinancialAI,
  parseUzbekNumber,
  validateAndSetGeminiKey,
  getGeminiApiKey,
} from '../lib/ai.js';
import { formatRatesMessage } from '../lib/currency.js';
import { calculateFinancialHealth } from '../lib/health.js';
import {
  getTodayString,
  getCurrentMonthString,
  formatAddedExpensesMessage,
  formatCurrency,
  formatDateUz,
  escapeHtml,
} from '../lib/formatters.js';
import { getCategoryEmoji } from '../lib/categories.js';
import {
  getMainKeyboard,
  getQuickExpenseKeyboard,
  getExpenseActionKeyboard,
  getDebtActionKeyboard,
} from '../lib/keyboards.js';
import {
  handleMonthlyReport,
  handleInfographic,
  handleExcelExport,
  handleTodayExpenses,
  handleLast7DaysExpenses,
  handleRecentExpenses,
  handleIncomeAndBalance,
  handleDebtBook,
  handleSearchExpenses,
  handleAIAdvisor,
  handleForecast,
  handleBudgetMenu,
  handleSetBudget,
  handleGoalsMenu,
  handleSubscriptionsMenu,
  handleSettingsMenu,
} from '../lib/features.js';

async function safeDelete(chatId, messageId) {
  try {
    await api.deleteMessage({ chat_id: chatId, message_id: messageId });
  } catch (e) {}
}

async function handleVoiceOrVideo(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const media = message.voice || message.audio || message.video_note;
  if (!media) return;

  await api.sendChatAction({ chat_id: chatId, action: 'record_voice' }).catch(() => {});

  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    return await api.sendMessage({
      chat_id: chatId,
      text:
        '⚠️ <b>Gemini API kaliti ulanmagan!</b>\n\n' +
        'Ovozli xabarlarni tushunish uchun <code>/setkey KALITINGIZ</code> buyrug\'i orqali bepul kalitni kiriting.\n' +
        '👉 https://aistudio.google.com/app/apikey',
      parse_mode: 'HTML',
    });
  }

  const isVideoNote = Boolean(message.video_note);
  const statusMsg = await api.sendMessage({
    chat_id: chatId,
    text: isVideoNote
      ? '📹 <i>Dumaloq video xabaringiz eshitilmoqda va tahlil qilinmoqda...</i>'
      : '🎧 <i>Ovozingiz eshitilmoqda va tahlil qilinmoqda...</i>',
    parse_mode: 'HTML',
  });

  try {
    const audioBytes = await api.getFileContent(media.file_id);
    const mimeType = isVideoNote ? 'video/mp4' : (media.mime_type || 'audio/ogg');
    const result = await processVoiceAudio(audioBytes, mimeType);
    await safeDelete(chatId, statusMsg.message_id);

    if (result.debts && result.debts.length > 0) {
      for (const d of result.debts) {
        const debt = await db.addDebt({
          userId,
          personName: d.personName,
          amount: d.amount,
          type: d.type,
          description: d.description,
        });
        const actionText =
          d.type === 'lend'
            ? `🔴 <b>${escapeHtml(d.personName)}</b>ga ${formatCurrency(d.amount)} qarz berildi!`
            : `🟢 <b>${escapeHtml(d.personName)}</b>dan ${formatCurrency(d.amount)} qarz olindi!`;
        await api.sendMessage({
          chat_id: chatId,
          text: `🤝 <b>Qarz daftari yangilandi:</b>\n\n${actionText}\n\nQarz uzilganda pastdagi tugma orqali yopishingiz mumkin.`,
          parse_mode: 'HTML',
          reply_markup: getDebtActionKeyboard(debt.id),
        });
      }
    }

    if (!result.has_expenses || !result.expenses || result.expenses.length === 0) {
      if (result.debts && result.debts.length > 0) return;
      let replyText = '🤔 <b>Ovozli xabarda xarajat yoki daromad aniqlanmadi.</b>\n\n';
      if (result.transcription) {
        replyText += `🎙 <i>Eshitildi: "${escapeHtml(result.transcription)}"</i>\n\n`;
      }
      replyText +=
        '💡 <b>Maslahat:</b> Masalan:\n• <i>"Bugun taksiga 25 ming, tushlikka 60 ming ishlatdim"</i>\n• <i>"Oyligim 5 million tushdi"</i>';
      return await api.sendMessage({ chat_id: chatId, text: replyText, parse_mode: 'HTML' });
    }

    const rawText = result.transcription || (isVideoNote ? 'Video xabar' : 'Ovozli xabar');
    const inserted = await db.addExpensesBatch(userId, result.expenses, rawText, isVideoNote ? 'video' : 'voice');
    const insertedIds = inserted.map((i) => i.id);

    const todayStr = getTodayString();
    const monthStr = getCurrentMonthString();
    const [todayTotal, balanceSummary, budget] = await Promise.all([
      db.getTodayTotal(userId, todayStr),
      db.getMonthBalanceSummary(userId, monthStr),
      db.getUserBudget(userId),
    ]);

    const responseMsg = formatAddedExpensesMessage(
      result.transcription,
      result.expenses,
      todayTotal,
      balanceSummary.expense,
      balanceSummary.income,
      balanceSummary.balance,
      budget
    );

    return await api.sendMessage({
      chat_id: chatId,
      text: responseMsg,
      parse_mode: 'HTML',
      reply_markup: getExpenseActionKeyboard(insertedIds),
    });
  } catch (err) {
    await safeDelete(chatId, statusMsg.message_id);
    if (String(err.message).includes('API_KEY_INVALID') || String(err.message).includes('GEMINI_API_KEY')) {
      return await api.sendMessage({
        chat_id: chatId,
        text:
          `⚠️ <b>Gemini API kaliti kiritilmagan yoki eskirgan.</b>\n\n` +
          `1. <a href="https://aistudio.google.com/app/apikey">Google AI Studio</a> dan bepul kalit oling.\n` +
          `2. Botga <code>/setkey KALITINGIZ</code> ko'rinishida yuboring!`,
        parse_mode: 'HTML',
      });
    }
    return await api.sendMessage({
      chat_id: chatId,
      text: `❌ <b>Ovozni qayta ishlashda xatolik:</b>\n<code>${escapeHtml(err.message)}</code>`,
      parse_mode: 'HTML',
    });
  }
}

async function handlePhoto(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const photos = message.photo;
  if (!photos || photos.length === 0) return;

  await api.sendChatAction({ chat_id: chatId, action: 'upload_photo' }).catch(() => {});
  const waitMsg = await api.sendMessage({
    chat_id: chatId,
    text: "🧾 <i>Chek yoki to'lov skrinshoti o'qilmoqda va tahlil qilinmoqda...</i>",
    parse_mode: 'HTML',
  });

  try {
    const largestPhoto = photos[photos.length - 1];
    const imageBytes = await api.getFileContent(largestPhoto.file_id);
    const parsed = await processReceiptImage(imageBytes, 'image/jpeg');
    await safeDelete(chatId, waitMsg.message_id);

    if (!parsed.is_financial_receipt || !parsed.amount || parsed.amount <= 0) {
      return await api.sendMessage({
        chat_id: chatId,
        text:
          "🤔 <b>Ushbu rasmda chek yoki to'lov ma'lumoti aniqlanmadi.</b>\n\n" +
          "💡 Do'kon cheki (Korzinka, Makro, Havas) yoki Click/Payme/Uzum skrinshotini aniqroq yuboring.",
        parse_mode: 'HTML',
      });
    }

    const todayStr = getTodayString();
    const monthStr = getCurrentMonthString();
    const inserted = await db.addExpense({
      userId,
      amount: parsed.amount,
      category: parsed.category,
      description: parsed.description || parsed.shop_or_service || 'Chek xaridi',
      expenseDate: parsed.date || todayStr,
      rawInput: parsed.shop_or_service || 'Chek fotosi',
      inputType: 'photo',
      type: parsed.type || 'expense',
    });

    const [balanceSummary, budget] = await Promise.all([
      db.getMonthBalanceSummary(userId, monthStr),
      db.getUserBudget(userId),
    ]);

    let warning = '';
    if (budget > 0 && balanceSummary.expense >= budget) {
      warning = `\n\n🚨 <b>OGOHLANTIRISH:</b> Belgilangan oylik byudjetdan ${formatCurrency(balanceSummary.expense - budget)} ga oshib ketdingiz!`;
    } else if (budget > 0 && balanceSummary.expense >= budget * 0.8) {
      warning = `\n\n⚠️ <b>DIQQAT:</b> Oylik byudjetingizning ${Math.round((balanceSummary.expense / budget) * 100)}% qismi ishlatildi!`;
    }

    const emoji = getCategoryEmoji(parsed.category);
    const isIncome = parsed.type === 'income';
    const typeLabel = isIncome ? '🟢 KIRIM (TUSHUM)' : '🔴 CHIQIM (XARAJAT)';

    const responseMsg =
      `🧾 <b>CHEK / TO'LOV MUVAFFAQIYATLI SAQLANDI!</b>\n\n` +
      `🏬 <b>Joy / Do'kon:</b> ${escapeHtml(parsed.shop_or_service || "Do'kon")}\n` +
      `📝 <b>Xarid:</b> ${escapeHtml(parsed.description || parsed.category)}\n` +
      `📂 <b>Kategoriya:</b> ${emoji} ${escapeHtml(parsed.category)} (<i>${typeLabel}</i>)\n` +
      `💰 <b>Summa:</b> <b>${isIncome ? '+' : '-'}${formatCurrency(parsed.amount)}</b>\n` +
      `📅 <b>Sana:</b> ${formatDateUz(parsed.date || todayStr)}` +
      warning +
      `\n\n📊 <b>Oylik jami xarajat:</b> ${formatCurrency(balanceSummary.expense)}\n` +
      `🎯 <b>Oylik sof qoldiq:</b> ${balanceSummary.balance >= 0 ? '+' : ''}${formatCurrency(balanceSummary.balance)}`;

    return await api.sendMessage({
      chat_id: chatId,
      text: responseMsg,
      parse_mode: 'HTML',
      reply_markup: getExpenseActionKeyboard([inserted.id]),
    });
  } catch (err) {
    await safeDelete(chatId, waitMsg.message_id);
    if (String(err.message).includes('API_KEY_INVALID') || String(err.message).includes('GEMINI_API_KEY')) {
      return await api.sendMessage({
        chat_id: chatId,
        text:
          `⚠️ <b>Gemini API kaliti kiritilmagan yoki eskirgan.</b>\n\n` +
          `Botga <code>/setkey KALITINGIZ</code> yuboring: https://aistudio.google.com/app/apikey`,
        parse_mode: 'HTML',
      });
    }
    return await api.sendMessage({
      chat_id: chatId,
      text: `❌ <b>Chekni tahlil qilishda xatolik:</b>\n<code>${escapeHtml(err.message)}</code>`,
      parse_mode: 'HTML',
    });
  }
}

async function handleStart(chatId, firstName) {
  const welcomeText =
    `👋 <b>Assalomu alaykum, ${escapeHtml(firstName || 'foydalanuvchi')}!</b>\n\n` +
    `🤖 Men sizning intellektual <b>Shaxsiy AI Buxgalteringizman</b> (☁️ <i>Telegram Serverless 24/7</i>).\n\n` +
    `Menga moliyangizni boshqarish juda oson:\n\n` +
    `🎙 <b>Ovozli yoki 📹 Video xabar yuboring:</b>\n` +
    `<i>"Bugun taksiga 25 ming, tushlikka 60 ming ishlatdim"</i>\n` +
    `<i>"Oyligim 6 million tushdi"</i>\n\n` +
    `🧾 <b>Yoki chek / to'lov skrinshotini rasm qilib tashlang:</b>\n` +
    `Korzinka, Makro cheklari yoki Click/Payme skrinshotlarini AI o'zi o'qib oladi!\n\n` +
    `✍️ <b>Yoki oddiy matn ko'rinishida yozing:</b>\n` +
    `<i>"Bozorlik 250 ming, dorixona 45 ming"</i>\n` +
    `<i>"Akromga 150 ming qarz berdim"</i>\n\n` +
    `✨ <b>Asosiy imkoniyatlar:</b>\n` +
    `• 💰 <b>Kirim & Qoldiq:</b> Oylik daromad va sof jamg'arma nazorati\n` +
    `• 🤝 <b>Qarz daftari:</b> Berilgan va olingan qarzlar hisobi\n` +
    `• 🎯 <b>Jamg'arma maqsadlari:</b> Katta orzularga maqsadli pul yig'ish\n` +
    `• 🔄 <b>Doimiy to'lovlar:</b> Majburiy oylik obuna va xarajatlar\n` +
    `• 📈 <b>Infografika & Grafiklar:</b> Rang-barang vizual tahlillar\n` +
    `• 📥 <b>Professional Excel hisobot:</b> Bir klikda tayyor jadval\n\n` +
    `Sinab ko'rish uchun hoziroq ovozli xabar yoki xarajat yuboring! 👇`;

  return await api.sendMessage({
    chat_id: chatId,
    text: welcomeText,
    parse_mode: 'HTML',
    reply_markup: getMainKeyboard(),
  });
}

async function handleHelp(chatId) {
  const helpText =
    `ℹ️ <b>Shaxsiy AI Buxgalter - To'liq qo'llanma</b>\n\n` +
    `<b>1. Xarajat va Daromad kiritish:</b>\n` +
    `• 🎙 <b>Ovozli xabar:</b> <i>"Bozorga 180 ming, dorixonaga 35 ming ketdi"</i>.\n` +
    `• 📹 <b>Dumaloq video:</b> Video orqali ham tushunadi.\n` +
    `• 🧾 <b>Chek fotosi:</b> Do'kon cheki yoki to'lov skrinshotini yuboring.\n` +
    `• ✍️ <b>Matn:</b> <i>"Tushlik 45000"</i>, <i>"Oylik 6 mln"</i>, <i>"50 dollar benzinga"</i>.\n` +
    `• ⚡️ <b>Tezkor xarajat:</b> 1 ta tugma bilan tezkor yozish.\n\n` +
    `<b>2. Qarzlar va Jamg'armalar:</b>\n` +
    `• 🤝 Qarz: <i>"Aliga 100 ming qarz berdim"</i> / <i>"Sobirdan 50 ming qarz oldim"</i>.\n` +
    `• 🎯 Maqsad: <code>/yangi_maqsad iPhone 15000000</code>.\n` +
    `• 🔄 Doimiy to'lov: <code>/doimiy Internet 150000 5</code>.\n\n` +
    `<b>3. Qo'shimcha buyruqlar:</b>\n` +
    `• <code>/undo</code> — oxirgi yozuvni o'chirish\n` +
    `• <code>/limit 5000000</code> — oylik byudjet belgilash\n` +
    `• <code>/oylik 6000000</code> — oylik daromad kiritish\n` +
    `• <code>/search taksi</code> — yozuvlarni qidirish\n` +
    `• <code>/setkey KALIT</code> — Gemini AI kalitini yangilash`;

  return await api.sendMessage({
    chat_id: chatId,
    text: helpText,
    parse_mode: 'HTML',
    reply_markup: getMainKeyboard(),
  });
}

export default async function (message, ctx) {
  if (!message || !message.from || !message.chat) return;

  const chatId = message.chat.id;
  const userId = message.from.id;
  const username = message.from.username;
  const firstName = message.from.first_name || 'Foydalanuvchi';

  await db.saveUser(userId, username, firstName);

  // Media updates
  if (message.voice || message.audio || message.video_note) {
    return await handleVoiceOrVideo(message);
  }
  if (message.photo && message.photo.length > 0) {
    return await handlePhoto(message);
  }

  const text = (message.text || '').trim();
  if (!text) return;

  // Commands
  if (text === '/start' || text.startsWith('/start ')) {
    return await handleStart(chatId, firstName);
  }
  if (text === '/help' || text === "ℹ️ Qo'llanma") {
    return await handleHelp(chatId);
  }

  if (text.startsWith('/setkey') || text.startsWith('/key')) {
    const parts = text.split(/\s+/);
    if (parts.length > 1) {
      const waitMsg = await api.sendMessage({
        chat_id: chatId,
        text: '🔍 <i>Gemini API kaliti tekshirilmoqda...</i>',
        parse_mode: 'HTML',
      });
      const res = await validateAndSetGeminiKey(parts[1]);
      await safeDelete(chatId, waitMsg.message_id);
      if (res.ok) {
        return await api.sendMessage({
          chat_id: chatId,
          text: `✅ <b>${escapeHtml(res.message)}</b>\n\nEndi ovozli xabarlar, cheklar va AI maslahatchi 100% faol!`,
          parse_mode: 'HTML',
        });
      }
      return await api.sendMessage({
        chat_id: chatId,
        text: `❌ <b>Kalit ishlamadi:</b> <code>${escapeHtml(res.error)}</code>`,
        parse_mode: 'HTML',
      });
    }
    return await api.sendMessage({
      chat_id: chatId,
      text: '🔑 Format: <code>/setkey AIzaSy...</code>\n👉 https://aistudio.google.com/app/apikey',
      parse_mode: 'HTML',
    });
  }

  if (text === '💱 Valyuta kursi' || text === '/valyuta' || text === '/kurs') {
    const msg = await formatRatesMessage();
    return await api.sendMessage({ chat_id: chatId, text: msg, parse_mode: 'HTML' });
  }

  if (text === '⚡️ Tezkor xarajat' || text === '/tezkor' || text === '/quick') {
    return await api.sendMessage({
      chat_id: chatId,
      text: "⚡️ <b>Tezkor xarajat kiritish:</b>\n\nEng ko'p ishlatiladigan xarajatni 1 ta tugma bilan saqlang:",
      parse_mode: 'HTML',
      reply_markup: getQuickExpenseKeyboard(),
    });
  }

  if (text === '🏆 Moliyaviy baho' || text === '/baho' || text === '/health') {
    const monthStr = getCurrentMonthString();
    const summary = await db.getUserFinancialSummary(userId, monthStr);
    const msg = calculateFinancialHealth(summary, firstName);
    return await api.sendMessage({ chat_id: chatId, text: msg, parse_mode: 'HTML' });
  }

  if (text === '/undo' || text === "🗑 Oxirgisini o'chirish") {
    const last = await db.deleteLastExpense(userId);
    if (!last) {
      return await api.sendMessage({ chat_id: chatId, text: "⚠️ O'chirish uchun hech qanday xarajat topilmadi." });
    }
    return await api.sendMessage({
      chat_id: chatId,
      text:
        `🗑 <b>Oxirgi yozuv o'chirildi:</b>\n` +
        `• <b>${escapeHtml(last.description || last.category)}</b>: ${formatCurrency(last.amount)}\n` +
        `📅 Sana: ${last.expenseDate}`,
      parse_mode: 'HTML',
    });
  }

  if (text.startsWith('/limit')) {
    const parts = text.split(/\s+/);
    if (parts.length > 1) {
      const amtStr = parts[1].replace(/[^\d]/g, '');
      return await handleSetBudget(chatId, userId, amtStr);
    }
    return await handleBudgetMenu(chatId, userId);
  }

  if (text.startsWith('/oylik') || text.startsWith('/daromad') || text.startsWith('/kirim')) {
    const parts = text.split(/\s+/);
    if (parts.length > 1) {
      const amount = parseUzbekNumber(parts.slice(1).join(' '));
      if (amount > 0) {
        const todayStr = getTodayString();
        const monthStr = getCurrentMonthString();
        const inserted = await db.addExpense({
          userId,
          amount,
          category: 'Oylik va Ish haqi',
          description: 'Oylik daromad',
          expenseDate: todayStr,
          rawInput: text,
          inputType: 'text',
          type: 'income',
        });
        const [todayTotal, balanceSummary, userBudget] = await Promise.all([
          db.getTodayTotal(userId, todayStr),
          db.getMonthBalanceSummary(userId, monthStr),
          db.getUserBudget(userId),
        ]);
        const responseMsg = formatAddedExpensesMessage(
          null,
          [{ amount, type: 'income', category: 'Oylik va Ish haqi', description: 'Oylik daromad', date: todayStr }],
          todayTotal,
          balanceSummary.expense,
          balanceSummary.income,
          balanceSummary.balance,
          userBudget
        );
        return await api.sendMessage({
          chat_id: chatId,
          text: responseMsg,
          parse_mode: 'HTML',
          reply_markup: getExpenseActionKeyboard([inserted.id]),
        });
      }
    }
    return await api.sendMessage({
      chat_id: chatId,
      text: '⚠️ Format: <code>/oylik [summa]</code>\nMasalan: <code>/oylik 5000000</code> yoki <code>/daromad 6 mln</code>',
      parse_mode: 'HTML',
    });
  }

  if (text.startsWith('/search') || text.startsWith('/qidiruv')) {
    const query = text.replace(/^\/(search|qidiruv)/i, '').trim();
    return await handleSearchExpenses(chatId, userId, query);
  }

  if (text.startsWith('/yangi_maqsad')) {
    const parts = text.split(/\s+/);
    if (parts.length >= 3) {
      const title = parts.slice(1, -1).join(' ');
      const targetAmount = Number(parts[parts.length - 1].replace(/[^\d]/g, ''));
      if (title && targetAmount > 0) {
        await db.addGoal({ userId, title, targetAmount });
        return await api.sendMessage({
          chat_id: chatId,
          text:
            `🎉 <b>Yangi maqsad yaratildi!</b>\n\n` +
            `🎯 <b>Maqsad:</b> ${escapeHtml(title)}\n` +
            `💰 <b>Kutilayotgan summa:</b> ${formatCurrency(targetAmount)}`,
          parse_mode: 'HTML',
          reply_markup: getMainKeyboard(),
        });
      }
    }
    return await api.sendMessage({
      chat_id: chatId,
      text: '⚠️ Format: <code>/yangi_maqsad [nomi] [summa]</code>\nMasalan: <code>/yangi_maqsad iPhone 15000000</code>',
      parse_mode: 'HTML',
    });
  }

  if (text.startsWith('/maqsad_plus')) {
    const parts = text.split(/\s+/);
    if (parts.length >= 3) {
      const goalIndex = parseInt(parts[1], 10);
      const amount = Number(parts[2].replace(/[^\d]/g, ''));
      const userGoals = await db.getUserGoals(userId);
      const goal = userGoals[goalIndex - 1] || userGoals.find((g) => g.id === goalIndex);
      if (goal && amount > 0) {
        const res = await db.addMoneyToGoal(goal.id, userId, amount);
        const congrats = res.isReached ? "\n\n🎉 <b>TABRIKLAYMIZ! Ushbu maqsadga to'liq erishildi!</b>" : '';
        return await api.sendMessage({
          chat_id: chatId,
          text:
            `✅ <b>"${escapeHtml(goal.title)}"</b> maqsadiga ${formatCurrency(amount)} qo'shildi!${congrats}\n\n` +
            `💰 Jami yig'ildi: ${formatCurrency(res.currentAmount)} / ${formatCurrency(res.targetAmount)}`,
          parse_mode: 'HTML',
        });
      }
    }
    return await api.sendMessage({
      chat_id: chatId,
      text: '⚠️ Format: <code>/maqsad_plus [№] [summa]</code>\nMasalan: <code>/maqsad_plus 1 500000</code>',
      parse_mode: 'HTML',
    });
  }

  if (text.startsWith('/doimiy')) {
    const parts = text.split(/\s+/);
    if (parts.length >= 3) {
      const title = parts[1];
      const amount = Number(parts[2].replace(/[^\d]/g, ''));
      const day = parts.length >= 4 ? parseInt(parts[3], 10) : 1;
      if (title && amount > 0) {
        await db.addSubscription({ userId, title, amount, dayOfMonth: day });
        return await api.sendMessage({
          chat_id: chatId,
          text:
            `✅ <b>Yangi doimiy to'lov saqlandi!</b>\n\n` +
            `📌 <b>Nomi:</b> ${escapeHtml(title)}\n` +
            `💰 <b>Summa:</b> ${formatCurrency(amount)}\n` +
            `📅 <b>To'lov kuni:</b> Har oyning ${day}-kunida`,
          parse_mode: 'HTML',
        });
      }
    }
    return await api.sendMessage({
      chat_id: chatId,
      text: '⚠️ Format: <code>/doimiy [nomi] [summa] [oy kuni]</code>\nMasalan: <code>/doimiy Internet 150000 5</code>',
      parse_mode: 'HTML',
    });
  }

  // Menu buttons
  if (text === '📊 Oylik hisobot') return await handleMonthlyReport(chatId, userId);
  if (text === '📈 Infografika') return await handleInfographic(chatId, userId);
  if (text === '📥 Excel hisobot' || text === '📥 Excel yuklab olish') return await handleExcelExport(chatId, userId, firstName);
  if (text === '💰 Daromad & Qoldiq' || text === '/balance') return await handleIncomeAndBalance(chatId, userId);
  if (text === '🤝 Qarz daftari' || text === '/debts') return await handleDebtBook(chatId, userId);
  if (text === '📅 Bugungi hisob' || text === '📅 Bugungi xarajatlar') return await handleTodayExpenses(chatId, userId);
  if (text === '🗓 Oxirgi 7 kun') return await handleLast7DaysExpenses(chatId, userId);
  if (text === "📋 So'nggi xarajatlar") return await handleRecentExpenses(chatId, userId);
  if (text === '🔍 Qidiruv') return await handleSearchExpenses(chatId, userId, '');
  if (text === "🎯 Jamg'arma maqsadlari" || text === '/goals') return await handleGoalsMenu(chatId, userId);
  if (text === "🔄 Doimiy to'lovlar" || text === '/subscriptions') return await handleSubscriptionsMenu(chatId, userId);
  if (text === '⚙️ Sozlamalar' || text === '/settings') return await handleSettingsMenu(chatId, userId);
  if (text === '💡 AI Maslahatchi' || text === '/advisor') return await handleAIAdvisor(chatId, userId, firstName);
  if (text === '🔮 Kelajak prognozi' || text === '/forecast') return await handleForecast(chatId, userId);
  if (text === '🎯 Oylik byudjet' || text === '/budget') return await handleBudgetMenu(chatId, userId);

  // Free-form expense / income / debt / AI financial question
  await api.sendChatAction({ chat_id: chatId, action: 'typing' }).catch(() => {});

  try {
    const result = await processTextMessage(text);

    if (result.debts && result.debts.length > 0) {
      for (const d of result.debts) {
        const debt = await db.addDebt({
          userId,
          personName: d.personName,
          amount: d.amount,
          type: d.type,
          description: d.description,
        });
        const actionText =
          d.type === 'lend'
            ? `🔴 <b>${escapeHtml(d.personName)}</b>ga ${formatCurrency(d.amount)} qarz berildi!`
            : `🟢 <b>${escapeHtml(d.personName)}</b>dan ${formatCurrency(d.amount)} qarz olindi!`;
        await api.sendMessage({
          chat_id: chatId,
          text: `🤝 <b>Qarz daftari yangilandi:</b>\n\n${actionText}\n\nQarz uzilganda pastdagi tugma orqali yopishingiz mumkin.`,
          parse_mode: 'HTML',
          reply_markup: getDebtActionKeyboard(debt.id),
        });
      }
    }

    if (result.has_expenses && result.expenses && result.expenses.length > 0) {
      const inserted = await db.addExpensesBatch(userId, result.expenses, text, 'text');
      const insertedIds = inserted.map((i) => i.id);

      const todayStr = getTodayString();
      const monthStr = getCurrentMonthString();
      const [todayTotal, balanceSummary, budget] = await Promise.all([
        db.getTodayTotal(userId, todayStr),
        db.getMonthBalanceSummary(userId, monthStr),
        db.getUserBudget(userId),
      ]);

      const responseMsg = formatAddedExpensesMessage(
        null,
        result.expenses,
        todayTotal,
        balanceSummary.expense,
        balanceSummary.income,
        balanceSummary.balance,
        budget
      );

      return await api.sendMessage({
        chat_id: chatId,
        text: responseMsg,
        parse_mode: 'HTML',
        reply_markup: getExpenseActionKeyboard(insertedIds),
      });
    }

    if (result.debts && result.debts.length > 0) return;

    // Otherwise answer with Financial AI chat
    const monthStr = getCurrentMonthString();
    const summary = await db.getUserFinancialSummary(userId, monthStr);
    const aiReply = await chatWithFinancialAI(text, summary, firstName);
    return await api.sendMessage({ chat_id: chatId, text: aiReply, parse_mode: 'HTML' });
  } catch (err) {
    console.error('[MessageHandler Error]:', err);
    return await api.sendMessage({
      chat_id: chatId,
      text: `❌ <b>Xatolik yuz berdi:</b> <code>${escapeHtml(err.message)}</code>`,
      parse_mode: 'HTML',
    });
  }
}
