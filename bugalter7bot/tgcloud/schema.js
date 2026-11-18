import { table, integer, text, real, index } from 'sdk/db';

export const users = table('users', {
  id: integer('id').primaryKey(),
  username: text('username'),
  firstName: text('first_name'),
  monthlyBudget: real('monthly_budget').default(0),
  dailyReminder: integer('daily_reminder').default(1),
  createdAt: text('created_at'),
});

export const expenses = table('expenses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  amount: real('amount').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  expenseDate: text('expense_date').notNull(), // YYYY-MM-DD (Tashkent)
  rawInput: text('raw_input'),
  inputType: text('input_type').default('text'), // 'voice' | 'video' | 'photo' | 'text' | 'button'
  type: text('type').default('expense'), // 'expense' | 'income'
  createdAt: text('created_at'),
}, (t) => ({
  userDateIdx: index('idx_expenses_user_date').on(t.userId, t.expenseDate),
  userTypeIdx: index('idx_expenses_user_type').on(t.userId, t.type),
}));

export const debts = table('debts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  personName: text('person_name').notNull(),
  amount: real('amount').notNull(),
  type: text('type').notNull(), // 'lend' | 'borrow'
  status: text('status').default('pending'), // 'pending' | 'settled'
  description: text('description'),
  createdAt: text('created_at'),
  settledAt: text('settled_at'),
}, (t) => ({
  userStatusIdx: index('idx_debts_user_status').on(t.userId, t.status),
}));

export const goals = table('goals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  title: text('title').notNull(),
  targetAmount: real('target_amount').notNull(),
  currentAmount: real('current_amount').default(0),
  status: text('status').default('active'), // 'active' | 'reached'
  createdAt: text('created_at'),
}, (t) => ({
  userGoalIdx: index('idx_goals_user_status').on(t.userId, t.status),
}));

export const subscriptions = table('subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  title: text('title').notNull(),
  amount: real('amount').notNull(),
  category: text('category').default('Kommunal va Aloqa'),
  dayOfMonth: integer('day_of_month').default(1),
  createdAt: text('created_at'),
}, (t) => ({
  userSubIdx: index('idx_subs_user').on(t.userId),
}));

export const appSettings = table('app_settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: text('updated_at'),
});
