import { db } from 'sdk';
import { eq, and, desc, asc, inArray, sql } from 'sdk/db';
import { users, expenses, debts, goals, subscriptions, appSettings } from '../schema.js';
import { getTashkentTimestamp, getDateDaysAgoString } from './formatters.js';

// --- SETTINGS ---

export async function getSetting(key, fallback = null) {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  const now = getTashkentTimestamp();
  await db
    .insert(appSettings)
    .values({ key, value: String(value), updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: String(value), updatedAt: now },
    });
}

// --- USERS ---

export async function saveUser(id, username, firstName) {
  const now = getTashkentTimestamp();
  await db
    .insert(users)
    .values({
      id,
      username: username || null,
      firstName: firstName || null,
      monthlyBudget: 0,
      dailyReminder: 1,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        username: username || null,
        firstName: firstName || null,
      },
    });
}

export async function getUser(userId) {
  return await db.select().from(users).where(eq(users.id, userId)).get();
}

export async function setUserBudget(userId, amount) {
  await db.update(users).set({ monthlyBudget: amount }).where(eq(users.id, userId));
}

export async function getUserBudget(userId) {
  const row = await db.select({ monthlyBudget: users.monthlyBudget }).from(users).where(eq(users.id, userId)).get();
  return row ? Number(row.monthlyBudget || 0) : 0;
}

export async function toggleReminder(userId, enable = true) {
  await db.update(users).set({ dailyReminder: enable ? 1 : 0 }).where(eq(users.id, userId));
}

// --- EXPENSES & INCOME ---

export async function addExpense({
  userId,
  amount,
  category,
  description,
  expenseDate,
  rawInput = '',
  inputType = 'text',
  type = 'expense',
}) {
  const now = getTashkentTimestamp();
  const res = await db.insert(expenses).values({
    userId,
    amount,
    category,
    description: description || category,
    expenseDate,
    rawInput: rawInput || '',
    inputType: inputType || 'text',
    type: type || 'expense',
    createdAt: now,
  });
  return {
    id: res.lastInsertRowid,
    userId,
    amount,
    category,
    description: description || category,
    expenseDate,
    rawInput,
    inputType,
    type: type || 'expense',
  };
}

export async function addExpensesBatch(userId, items, rawInput, inputType) {
  const inserted = [];
  for (const item of items) {
    const rec = await addExpense({
      userId,
      amount: item.amount,
      category: item.category,
      description: item.description,
      expenseDate: item.date,
      rawInput,
      inputType,
      type: item.type || 'expense',
    });
    inserted.push(rec);
  }
  return inserted;
}

export async function deleteExpenses(ids, userId) {
  if (!ids || ids.length === 0) return 0;
  const res = await db
    .delete(expenses)
    .where(and(inArray(expenses.id, ids), eq(expenses.userId, userId)));
  return res.rowsAffected || 0;
}

export async function deleteLastExpense(userId) {
  const last = await db
    .select()
    .from(expenses)
    .where(eq(expenses.userId, userId))
    .orderBy(desc(expenses.id))
    .limit(1)
    .get();
  if (!last) return null;
  await db.delete(expenses).where(eq(expenses.id, last.id));
  return last;
}

export async function getTodayTotal(userId, dateStr) {
  const row = await db.get(sql`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM expenses
    WHERE user_id = ${userId}
      AND expense_date = ${dateStr}
      AND (type IS NULL OR type = 'expense')
  `);
  return row ? Number(row.total) : 0;
}

export async function getMonthTotal(userId, yearMonthStr) {
  const pattern = `${yearMonthStr}%`;
  const row = await db.get(sql`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM expenses
    WHERE user_id = ${userId}
      AND expense_date LIKE ${pattern}
      AND (type IS NULL OR type = 'expense')
  `);
  return row ? Number(row.total) : 0;
}

export async function getMonthIncomeTotal(userId, yearMonthStr) {
  const pattern = `${yearMonthStr}%`;
  const row = await db.get(sql`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM expenses
    WHERE user_id = ${userId}
      AND expense_date LIKE ${pattern}
      AND type = 'income'
  `);
  return row ? Number(row.total) : 0;
}

export async function getMonthBalanceSummary(userId, yearMonthStr) {
  const income = await getMonthIncomeTotal(userId, yearMonthStr);
  const expense = await getMonthTotal(userId, yearMonthStr);
  const balance = income - expense;
  const savingsRate = income > 0 ? ((balance / income) * 100).toFixed(1) : '0';
  return { income, expense, balance, savingsRate };
}

export async function getTodayExpenses(userId, dateStr) {
  return await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.userId, userId), eq(expenses.expenseDate, dateStr)))
    .orderBy(desc(expenses.id))
    .all();
}

export async function getMonthExpenses(userId, yearMonthStr) {
  const pattern = `${yearMonthStr}%`;
  return await db.all(sql`
    SELECT * FROM expenses
    WHERE user_id = ${userId} AND expense_date LIKE ${pattern}
    ORDER BY expense_date DESC, id DESC
  `);
}

export async function getMonthCategoryBreakdown(userId, yearMonthStr) {
  const pattern = `${yearMonthStr}%`;
  const rows = await db.all(sql`
    SELECT
      category,
      SUM(amount) AS total_amount,
      COUNT(id) AS count,
      ROUND(AVG(amount)) AS avg_amount
    FROM expenses
    WHERE user_id = ${userId}
      AND expense_date LIKE ${pattern}
      AND (type IS NULL OR type = 'expense')
    GROUP BY category
    ORDER BY total_amount DESC
  `);
  const monthTotal = rows.reduce((s, r) => s + Number(r.total_amount), 0);
  return rows.map((r) => ({
    category: r.category,
    total_amount: Number(r.total_amount),
    count: Number(r.count),
    avg_amount: Number(r.avg_amount),
    percentage: monthTotal > 0 ? ((Number(r.total_amount) / monthTotal) * 100).toFixed(1) : '0.0',
  }));
}

export async function getMonthIncomeCategoryBreakdown(userId, yearMonthStr) {
  const pattern = `${yearMonthStr}%`;
  const rows = await db.all(sql`
    SELECT
      category,
      SUM(amount) AS total_amount,
      COUNT(id) AS count,
      ROUND(AVG(amount)) AS avg_amount
    FROM expenses
    WHERE user_id = ${userId}
      AND expense_date LIKE ${pattern}
      AND type = 'income'
    GROUP BY category
    ORDER BY total_amount DESC
  `);
  const monthTotal = rows.reduce((s, r) => s + Number(r.total_amount), 0);
  return rows.map((r) => ({
    category: r.category,
    total_amount: Number(r.total_amount),
    count: Number(r.count),
    avg_amount: Number(r.avg_amount),
    percentage: monthTotal > 0 ? ((Number(r.total_amount) / monthTotal) * 100).toFixed(1) : '0.0',
  }));
}

export async function getMonthDailyBreakdown(userId, yearMonthStr) {
  const pattern = `${yearMonthStr}%`;
  return await db.all(sql`
    SELECT
      expense_date,
      SUM(amount) AS total_amount,
      COUNT(id) AS count
    FROM expenses
    WHERE user_id = ${userId}
      AND expense_date LIKE ${pattern}
      AND (type IS NULL OR type = 'expense')
    GROUP BY expense_date
    ORDER BY expense_date ASC
  `);
}

export async function getLastNDaysExpenses(userId, days = 7) {
  const sinceStr = getDateDaysAgoString(days);
  return await db.all(sql`
    SELECT * FROM expenses
    WHERE user_id = ${userId} AND expense_date >= ${sinceStr}
    ORDER BY expense_date DESC, id DESC
  `);
}

export async function getRecentExpenses(userId, limit = 10) {
  return await db.all(sql`
    SELECT * FROM expenses
    WHERE user_id = ${userId}
    ORDER BY id DESC
    LIMIT ${limit}
  `);
}

export async function searchExpenses(userId, query, limit = 20) {
  const pattern = `%${query}%`;
  return await db.all(sql`
    SELECT * FROM expenses
    WHERE user_id = ${userId}
      AND (description LIKE ${pattern} OR category LIKE ${pattern} OR raw_input LIKE ${pattern})
    ORDER BY expense_date DESC, id DESC
    LIMIT ${limit}
  `);
}

// --- DEBTS (QARZ DAFTARI) ---

export async function addDebt({ userId, personName, amount, type, description = '' }) {
  const now = getTashkentTimestamp();
  const res = await db.insert(debts).values({
    userId,
    personName,
    amount,
    type,
    status: 'pending',
    description: description || '',
    createdAt: now,
  });
  return {
    id: res.lastInsertRowid,
    userId,
    personName,
    amount,
    type,
    description,
  };
}

export async function getPendingDebts(userId) {
  const all = await db
    .select()
    .from(debts)
    .where(and(eq(debts.userId, userId), eq(debts.status, 'pending')))
    .orderBy(desc(debts.id))
    .all();

  const lend = all.filter((d) => d.type === 'lend');
  const borrow = all.filter((d) => d.type === 'borrow');
  const totalLend = lend.reduce((s, d) => s + Number(d.amount), 0);
  const totalBorrow = borrow.reduce((s, d) => s + Number(d.amount), 0);

  return { lend, borrow, totalLend, totalBorrow, count: all.length };
}

export async function settleDebt(debtId, userId) {
  const now = getTashkentTimestamp();
  const res = await db
    .update(debts)
    .set({ status: 'settled', settledAt: now })
    .where(and(eq(debts.id, debtId), eq(debts.userId, userId)));
  return (res.rowsAffected || 0) > 0;
}

export async function deleteDebt(debtId, userId) {
  const res = await db
    .delete(debts)
    .where(and(eq(debts.id, debtId), eq(debts.userId, userId)));
  return (res.rowsAffected || 0) > 0;
}

// --- GOALS (JAMG'ARMA MAQSADLARI) ---

export async function addGoal({ userId, title, targetAmount, currentAmount = 0 }) {
  const now = getTashkentTimestamp();
  const res = await db.insert(goals).values({
    userId,
    title,
    targetAmount,
    currentAmount,
    status: 'active',
    createdAt: now,
  });
  return { id: res.lastInsertRowid, userId, title, targetAmount, currentAmount, status: 'active' };
}

export async function getUserGoals(userId) {
  return await db.select().from(goals).where(eq(goals.userId, userId)).orderBy(desc(goals.id)).all();
}

export async function addMoneyToGoal(goalId, userId, amount) {
  const goal = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .get();
  if (!goal) return null;

  const newAmount = Number(goal.currentAmount || 0) + Number(amount);
  const isReached = newAmount >= Number(goal.targetAmount);
  const newStatus = isReached ? 'reached' : 'active';

  await db
    .update(goals)
    .set({ currentAmount: newAmount, status: newStatus })
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)));

  return { ...goal, currentAmount: newAmount, status: newStatus, isReached };
}

export async function deleteGoal(goalId, userId) {
  const res = await db
    .delete(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)));
  return (res.rowsAffected || 0) > 0;
}

// --- SUBSCRIPTIONS (DOIMIY TO'LOVLAR) ---

export async function addSubscription({ userId, title, amount, category = 'Kommunal va Aloqa', dayOfMonth = 1 }) {
  const now = getTashkentTimestamp();
  const res = await db.insert(subscriptions).values({
    userId,
    title,
    amount,
    category,
    dayOfMonth,
    createdAt: now,
  });
  return { id: res.lastInsertRowid, userId, title, amount, category, dayOfMonth };
}

export async function getUserSubscriptions(userId) {
  return await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(asc(subscriptions.dayOfMonth), desc(subscriptions.id))
    .all();
}

export async function deleteSubscription(subId, userId) {
  const res = await db
    .delete(subscriptions)
    .where(and(eq(subscriptions.id, subId), eq(subscriptions.userId, userId)));
  return (res.rowsAffected || 0) > 0;
}

// --- FINANCIAL SUMMARY & RESET ---

export async function getUserFinancialSummary(userId, yearMonthStr) {
  const [budget, totalMonth, incomeTotal, categories, recentExpenses, dailyTrend, pendingDebts] =
    await Promise.all([
      getUserBudget(userId),
      getMonthTotal(userId, yearMonthStr),
      getMonthIncomeTotal(userId, yearMonthStr),
      getMonthCategoryBreakdown(userId, yearMonthStr),
      getRecentExpenses(userId, 15),
      getMonthDailyBreakdown(userId, yearMonthStr),
      getPendingDebts(userId),
    ]);

  return {
    userId,
    yearMonthStr,
    budget,
    totalMonth,
    incomeTotal,
    balance: incomeTotal - totalMonth,
    categories,
    recentExpenses,
    dailyTrend,
    debts: pendingDebts,
  };
}

export async function resetUserData(userId) {
  await db.delete(expenses).where(eq(expenses.userId, userId));
  await db.delete(debts).where(eq(debts.userId, userId));
  await db.delete(goals).where(eq(goals.userId, userId));
  await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
  await db.update(users).set({ monthlyBudget: 0 }).where(eq(users.id, userId));
  return true;
}
