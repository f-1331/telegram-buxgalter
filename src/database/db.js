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
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, expense_date);
  CREATE INDEX IF NOT EXISTS idx_expenses_user_created ON expenses(user_id, created_at);
`);

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
 * Add a single expense
 */
function addExpense({ userId, amount, category, description, expenseDate, rawInput, inputType }) {
  const stmt = db.prepare(`
    INSERT INTO expenses (user_id, amount, category, description, expense_date, raw_input, input_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(userId, amount, category, description, expenseDate, rawInput || '', inputType || 'voice');
  return {
    id: result.lastInsertRowid,
    userId,
    amount,
    category,
    description,
    expenseDate,
    rawInput,
    inputType
  };
}

/**
 * Add multiple expenses in batch
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
      inputType
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
 * Delete the most recent expense for a user and return its info
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
    WHERE user_id = ? AND expense_date = ?
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
    WHERE user_id = ? AND expense_date LIKE ?
  `);
  const res = stmt.get(userId, `${yearMonthStr}%`);
  return res ? Number(res.total) : 0;
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
 * Get all expenses for a given month
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
 * Get category breakdown for a month
 */
function getMonthCategoryBreakdown(userId, yearMonthStr) {
  const stmt = db.prepare(`
    SELECT 
      category, 
      SUM(amount) AS total_amount, 
      COUNT(id) AS count,
      ROUND(AVG(amount)) AS avg_amount
    FROM expenses 
    WHERE user_id = ? AND expense_date LIKE ? 
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
    WHERE user_id = ? AND expense_date LIKE ? 
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
 * Get detailed user spending summary for AI analysis
 */
function getUserFinancialSummary(userId, yearMonthStr) {
  const budget = getUserBudget(userId);
  const totalMonth = getMonthTotal(userId, yearMonthStr);
  const categories = getMonthCategoryBreakdown(userId, yearMonthStr);
  const recentExpenses = getRecentExpenses(userId, 15);
  const dailyTrend = getMonthDailyBreakdown(userId, yearMonthStr);

  return {
    userId,
    yearMonthStr,
    budget,
    totalMonth,
    categories,
    recentExpenses,
    dailyTrend
  };
}

module.exports = {
  db,
  saveUser,
  addExpense,
  addExpensesBatch,
  deleteExpense,
  deleteExpenses,
  deleteLastExpense,
  getTodayTotal,
  getMonthTotal,
  getTodayExpenses,
  getMonthExpenses,
  getMonthCategoryBreakdown,
  getMonthDailyBreakdown,
  getLastNDaysExpenses,
  getRecentExpenses,
  setUserBudget,
  getUserBudget,
  getUserFinancialSummary
};
