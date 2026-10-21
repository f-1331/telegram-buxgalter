const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const config = require('../config');

// Ensure data directory exists
if (!fs.existsSync(config.DATA_DIR)) {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
}

const dbPath = path.join(config.DATA_DIR, 'expenses.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for high performance
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    monthly_budget REAL DEFAULT 0,
    daily_reminder INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    expense_date TEXT NOT NULL, -- YYYY-MM-DD
    raw_input TEXT,
    input_type TEXT DEFAULT 'voice', -- 'voice' or 'text'
    type TEXT DEFAULT 'expense', -- 'expense' or 'income'
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, expense_date);
  CREATE INDEX IF NOT EXISTS idx_expenses_user_created ON expenses(user_id, created_at);

  CREATE TABLE IF NOT EXISTS debts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    person_name TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL, -- 'lend' (men berdim) or 'borrow' (men oldim)
    status TEXT DEFAULT 'pending', -- 'pending' or 'settled'
    description TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    settled_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_debts_user ON debts(user_id, status);

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    target_amount REAL NOT NULL,
    current_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'active', -- 'active' or 'reached'
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id, status);

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT DEFAULT 'Kommunal va Aloqa',
    day_of_month INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);
`);

// Graceful schema migrations if tables already existed
try {
  db.exec("ALTER TABLE expenses ADD COLUMN type TEXT DEFAULT 'expense';");
} catch (e) {}

try {
  db.exec("ALTER TABLE users ADD COLUMN daily_reminder INTEGER DEFAULT 1;");
} catch (e) {}

try {
  db.exec("CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(user_id, type);");
} catch (e) {}

/**
 * Save or update user info
 */
function saveUser(id, username, firstName) {
  const stmt = db.prepare(`
    INSERT INTO users (id, username, first_name)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name
  `);
  stmt.run(id, username || null, firstName || null);
}

/**
 * Get all users for reminders
 */
function getAllUsers() {
  const stmt = db.prepare('SELECT * FROM users WHERE daily_reminder = 1');
  return stmt.all();
}

/**
 * Add a single expense or income
 */
function addExpense({ userId, amount, category, description, expenseDate, rawInput, inputType, type = 'expense' }) {
  const stmt = db.prepare(`
    INSERT INTO expenses (user_id, amount, category, description, expense_date, raw_input, input_type, type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(userId, amount, category, description, expenseDate, rawInput || '', inputType || 'voice', type || 'expense');
  return {
    id: result.lastInsertRowid,
    userId,
    amount,
    category,
    description,
    expenseDate,
    rawInput,
    inputType,
    type
  };
}

/**
 * Add multiple entries in batch
 */
function addExpensesBatch(userId, expenses, rawInput, inputType) {
  const inserted = [];
  for (const item of expenses) {
    const res = addExpense({
      userId,
      amount: item.amount,
      category: item.category,
      description: item.description,
      expenseDate: item.date,
      rawInput,
      inputType,
      type: item.type || 'expense'
    });
    inserted.push(res);
  }
  return inserted;
}

/**
 * Delete expense by ID
 */
function deleteExpense(id, userId) {
  const stmt = db.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?');
  const res = stmt.run(id, userId);
  return res.changes > 0;
}

/**
 * Delete multiple expenses by IDs
 */
function deleteExpenses(ids, userId) {
  if (!ids || ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const stmt = db.prepare(`DELETE FROM expenses WHERE id IN (${placeholders}) AND user_id = ?`);
  const res = stmt.run(...ids, userId);
  return res.changes;
}

/**
 * Delete the most recent record for a user and return its info
 */
function deleteLastExpense(userId) {
  const findStmt = db.prepare(`
    SELECT * FROM expenses 
    WHERE user_id = ? 
    ORDER BY id DESC LIMIT 1
  `);
  const last = findStmt.get(userId);
  if (!last) return null;

  const delStmt = db.prepare('DELETE FROM expenses WHERE id = ?');
  delStmt.run(last.id);
  return last;
}

/**
 * Get total amount spent on a specific date (YYYY-MM-DD)
 */
function getTodayTotal(userId, dateStr) {
  const stmt = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total 
    FROM expenses 
    WHERE user_id = ? AND expense_date = ? AND (type IS NULL OR type = 'expense')
  `);
  const res = stmt.get(userId, dateStr);
  return res ? Number(res.total) : 0;
}

/**
 * Get total amount spent in a specific month (YYYY-MM)
 */
function getMonthTotal(userId, yearMonthStr) {
  const stmt = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total 
    FROM expenses 
    WHERE user_id = ? AND expense_date LIKE ? AND (type IS NULL OR type = 'expense')
  `);
  const res = stmt.get(userId, `${yearMonthStr}%`);
  return res ? Number(res.total) : 0;
}

/**
 * Get total income received in a specific month (YYYY-MM)
 */
function getMonthIncomeTotal(userId, yearMonthStr) {
  const stmt = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total 
    FROM expenses 
    WHERE user_id = ? AND expense_date LIKE ? AND type = 'income'
  `);
  const res = stmt.get(userId, `${yearMonthStr}%`);
  return res ? Number(res.total) : 0;
}

/**
 * Get complete balance summary for a month
 */
function getMonthBalanceSummary(userId, yearMonthStr) {
  const income = getMonthIncomeTotal(userId, yearMonthStr);
  const expense = getMonthTotal(userId, yearMonthStr);
  const balance = income - expense;
  const savingsRate = income > 0 ? ((balance / income) * 100).toFixed(1) : 0;

  return {
    income,
    expense,
    balance,
    savingsRate
  };
}

/**
 * Get all expenses for today
 */
function getTodayExpenses(userId, dateStr) {
  const stmt = db.prepare(`
    SELECT * FROM expenses 
    WHERE user_id = ? AND expense_date = ? 
    ORDER BY id DESC
  `);
  return stmt.all(userId, dateStr);
}

/**
 * Get all records for a given month
 */
function getMonthExpenses(userId, yearMonthStr) {
  const stmt = db.prepare(`
    SELECT * FROM expenses 
    WHERE user_id = ? AND expense_date LIKE ? 
    ORDER BY expense_date DESC, id DESC
  `);
  return stmt.all(userId, `${yearMonthStr}%`);
}

/**
 * Get category breakdown for a month (expenses only)
 */
function getMonthCategoryBreakdown(userId, yearMonthStr) {
  const stmt = db.prepare(`
    SELECT 
      category, 
      SUM(amount) AS total_amount, 
      COUNT(id) AS count,
      ROUND(AVG(amount)) AS avg_amount
    FROM expenses 
    WHERE user_id = ? AND expense_date LIKE ? AND (type IS NULL OR type = 'expense')
    GROUP BY category 
    ORDER BY total_amount DESC
  `);
  const rows = stmt.all(userId, `${yearMonthStr}%`);
  const monthTotal = rows.reduce((sum, r) => sum + Number(r.total_amount), 0);

  return rows.map(r => ({
    category: r.category,
    total_amount: Number(r.total_amount),
    count: Number(r.count),
    avg_amount: Number(r.avg_amount),
    percentage: monthTotal > 0 ? ((Number(r.total_amount) / monthTotal) * 100).toFixed(1) : '0.0'
  }));
}

/**
 * Get daily spending trend for a month
 */
function getMonthDailyBreakdown(userId, yearMonthStr) {
  const stmt = db.prepare(`
    SELECT 
      expense_date, 
      SUM(amount) AS total_amount,
      COUNT(id) AS count
    FROM expenses 
    WHERE user_id = ? AND expense_date LIKE ? AND (type IS NULL OR type = 'expense')
    GROUP BY expense_date 
    ORDER BY expense_date ASC
  `);
  return stmt.all(userId, `${yearMonthStr}%`);
}

/**
 * Get expenses for the last N days
 */
function getLastNDaysExpenses(userId, days = 7) {
  const stmt = db.prepare(`
    SELECT * FROM expenses 
    WHERE user_id = ? AND expense_date >= date('now', '-' || ? || ' days', 'localtime')
    ORDER BY expense_date DESC, id DESC
  `);
  return stmt.all(userId, days);
}

/**
 * Get recent expenses (limit)
 */
function getRecentExpenses(userId, limit = 10) {
  const stmt = db.prepare(`
    SELECT * FROM expenses 
    WHERE user_id = ? 
    ORDER BY id DESC 
    LIMIT ?
  `);
  return stmt.all(userId, limit);
}

/**
 * Search expenses by keyword in description or category
 */
function searchExpenses(userId, query, limit = 20) {
  const stmt = db.prepare(`
    SELECT * FROM expenses 
    WHERE user_id = ? AND (description LIKE ? OR category LIKE ? OR raw_input LIKE ?)
    ORDER BY expense_date DESC, id DESC
    LIMIT ?
  `);
  const pattern = `%${query}%`;
  return stmt.all(userId, pattern, pattern, pattern, limit);
}

/**
 * Set user's monthly budget
 */
function setUserBudget(userId, amount) {
  const stmt = db.prepare('UPDATE users SET monthly_budget = ? WHERE id = ?');
  return stmt.run(amount, userId);
}

/**
 * Get user's monthly budget
 */
function getUserBudget(userId) {
  const stmt = db.prepare('SELECT monthly_budget FROM users WHERE id = ?');
  const res = stmt.get(userId);
  return res ? Number(res.monthly_budget) : 0;
}

/**
 * Toggle user daily reminder
 */
function toggleReminder(userId, enable = true) {
  const stmt = db.prepare('UPDATE users SET daily_reminder = ? WHERE id = ?');
  return stmt.run(enable ? 1 : 0, userId);
}

/**
 * -------------------------------------------------------------
 * QARZ DAFTARI (Debts & Loans Management)
 * -------------------------------------------------------------
 */

/**
 * Add a debt record (lend: berdim, borrow: oldim)
 */
function addDebt({ userId, personName, amount, type, description }) {
  const stmt = db.prepare(`
    INSERT INTO debts (user_id, person_name, amount, type, description, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `);
  const res = stmt.run(userId, personName, amount, type, description || '');
  return {
    id: res.lastInsertRowid,
    userId,
    personName,
    amount,
    type,
    description
  };
}

/**
 * Get all pending debts for user
 */
function getPendingDebts(userId) {
  const stmt = db.prepare(`
    SELECT * FROM debts 
    WHERE user_id = ? AND status = 'pending' 
    ORDER BY id DESC
  `);
  const all = stmt.all(userId);
  const lend = all.filter(d => d.type === 'lend');
  const borrow = all.filter(d => d.type === 'borrow');
  const totalLend = lend.reduce((s, d) => s + Number(d.amount), 0);
  const totalBorrow = borrow.reduce((s, d) => s + Number(d.amount), 0);

  return {
    lend,
    borrow,
    totalLend,
    totalBorrow,
    count: all.length
  };
}

/**
 * Settle (close) a debt
 */
function settleDebt(debtId, userId) {
  const stmt = db.prepare(`
    UPDATE debts 
    SET status = 'settled', settled_at = datetime('now', 'localtime') 
    WHERE id = ? AND user_id = ?
  `);
  const res = stmt.run(debtId, userId);
  return res.changes > 0;
}

/**
 * Delete a debt record
 */
function deleteDebt(debtId, userId) {
  const stmt = db.prepare(`
    DELETE FROM debts 
    WHERE id = ? AND user_id = ?
  `);
  const res = stmt.run(debtId, userId);
  return res.changes > 0;
}

/**
 * Get category breakdown for incomes in a month
 */
function getMonthIncomeCategoryBreakdown(userId, yearMonthStr) {
  const stmt = db.prepare(`
    SELECT 
      category, 
      SUM(amount) AS total_amount, 
      COUNT(id) AS count,
      ROUND(AVG(amount)) AS avg_amount
    FROM expenses 
    WHERE user_id = ? AND expense_date LIKE ? AND type = 'income'
    GROUP BY category 
    ORDER BY total_amount DESC
  `);
  const rows = stmt.all(userId, `${yearMonthStr}%`);
  const monthTotal = rows.reduce((sum, r) => sum + Number(r.total_amount), 0);

  return rows.map(r => ({
    category: r.category,
    total_amount: Number(r.total_amount),
    count: Number(r.count),
    avg_amount: Number(r.avg_amount),
    percentage: monthTotal > 0 ? ((Number(r.total_amount) / monthTotal) * 100).toFixed(1) : '0.0'
  }));
}

/**
 * Get detailed user spending summary for AI analysis
 */
function getUserFinancialSummary(userId, yearMonthStr) {
  const budget = getUserBudget(userId);
  const totalMonth = getMonthTotal(userId, yearMonthStr);
  const incomeTotal = getMonthIncomeTotal(userId, yearMonthStr);
  const categories = getMonthCategoryBreakdown(userId, yearMonthStr);
  const recentExpenses = getRecentExpenses(userId, 15);
  const dailyTrend = getMonthDailyBreakdown(userId, yearMonthStr);
  const debts = getPendingDebts(userId);

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
    debts
  };
}

/**
 * -------------------------------------------------------------
 * JAMG'ARMA MAQSADLARI (Financial Goals)
 * -------------------------------------------------------------
 */
function addGoal({ userId, title, targetAmount, currentAmount = 0 }) {
  const stmt = db.prepare(`
    INSERT INTO goals (user_id, title, target_amount, current_amount, status)
    VALUES (?, ?, ?, ?, 'active')
  `);
  const res = stmt.run(userId, title, targetAmount, currentAmount);
  return {
    id: res.lastInsertRowid,
    userId,
    title,
    targetAmount,
    currentAmount,
    status: 'active'
  };
}

function getUserGoals(userId) {
  const stmt = db.prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY id DESC');
  return stmt.all(userId);
}

function addMoneyToGoal(goalId, userId, amount) {
  const findStmt = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?');
  const goal = findStmt.get(goalId, userId);
  if (!goal) return null;

  const newAmount = Number(goal.current_amount) + Number(amount);
  const isReached = newAmount >= Number(goal.target_amount);
  const newStatus = isReached ? 'reached' : 'active';

  const updateStmt = db.prepare('UPDATE goals SET current_amount = ?, status = ? WHERE id = ? AND user_id = ?');
  updateStmt.run(newAmount, newStatus, goalId, userId);

  return {
    ...goal,
    current_amount: newAmount,
    status: newStatus,
    isReached
  };
}

function completeGoal(goalId, userId) {
  const stmt = db.prepare("UPDATE goals SET status = 'reached' WHERE id = ? AND user_id = ?");
  const res = stmt.run(goalId, userId);
  return res.changes > 0;
}

function deleteGoal(goalId, userId) {
  const stmt = db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?');
  const res = stmt.run(goalId, userId);
  return res.changes > 0;
}

/**
 * -------------------------------------------------------------
 * DOIMIY TO'LOVLAR VA OBUNALAR (Recurring Subscriptions)
 * -------------------------------------------------------------
 */
function addSubscription({ userId, title, amount, category = 'Kommunal va Aloqa', dayOfMonth = 1 }) {
  const stmt = db.prepare(`
    INSERT INTO subscriptions (user_id, title, amount, category, day_of_month)
    VALUES (?, ?, ?, ?, ?)
  `);
  const res = stmt.run(userId, title, amount, category, dayOfMonth);
  return {
    id: res.lastInsertRowid,
    userId,
    title,
    amount,
    category,
    dayOfMonth
  };
}

function getUserSubscriptions(userId) {
  const stmt = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY day_of_month ASC, id DESC');
  return stmt.all(userId);
}

function deleteSubscription(subId, userId) {
  const stmt = db.prepare('DELETE FROM subscriptions WHERE id = ? AND user_id = ?');
  const res = stmt.run(subId, userId);
  return res.changes > 0;
}

/**
 * Reset all financial data for a user
 */
function resetUserData(userId) {
  db.prepare('DELETE FROM expenses WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM debts WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM goals WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(userId);
  db.prepare('UPDATE users SET monthly_budget = 0 WHERE id = ?').run(userId);
  return true;
}

module.exports = {
  db,
  saveUser,
  getAllUsers,
  toggleReminder,
  addExpense,
  addExpensesBatch,
  deleteExpense,
  deleteExpenses,
  deleteLastExpense,
  getTodayTotal,
  getMonthTotal,
  getMonthIncomeTotal,
  getMonthBalanceSummary,
  getTodayExpenses,
  getMonthExpenses,
  getMonthCategoryBreakdown,
  getMonthDailyBreakdown,
  getLastNDaysExpenses,
  getRecentExpenses,
  searchExpenses,
  setUserBudget,
  getUserBudget,
  getUserFinancialSummary,
  addDebt,
  getPendingDebts,
  settleDebt,
  deleteDebt,
  getMonthIncomeCategoryBreakdown,
  addGoal,
  getUserGoals,
  addMoneyToGoal,
  completeGoal,
  deleteGoal,
  addSubscription,
  getUserSubscriptions,
  deleteSubscription,
  resetUserData
};
