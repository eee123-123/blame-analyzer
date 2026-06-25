import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  nickname: text('nickname').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const usage = sqliteTable('usage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  date: text('date').notNull(), // YYYY-MM-DD
  aiCallCount: integer('ai_call_count').notNull().default(0),
});

export const analyses = sqliteTable('analyses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  rawText: text('raw_text').notNull(),
  result: text('result').notNull(),       // JSON 序列化的完整分析结果
  summary: text('summary'),               // 摘要（列表展示用）
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Phase 3: 订阅系统 ──

export const subscriptions = sqliteTable('subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  plan: text('plan').notNull().default('free'), // free | pro | team
  status: text('status').notNull().default('active'), // active | cancelled | expired
  startDate: text('start_date').notNull().$defaultFn(() => new Date().toISOString()),
  endDate: text('end_date'), // null = 永久(免费); 有值 = 到期时间
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  plan: text('plan').notNull(),
  amount: integer('amount').notNull(), // 单位：分
  status: text('status').notNull().default('pending'), // pending | paid | failed | refunded
  payMethod: text('pay_method').default('mock'), // mock | stripe | alipay
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  paidAt: text('paid_at'),
});

// ── Phase 3: 多轮对话 ──

export const conversations = sqliteTable('conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  analysisId: integer('analysis_id').references(() => analyses.id),
  title: text('title'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: integer('conversation_id').notNull().references(() => conversations.id),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Phase 3: 社区话术库 ──

export const phrases = sqliteTable('phrases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  category: text('category').notNull(), // deflect | counter | clarify | escalate
  scenario: text('scenario'),
  likes: integer('likes').notNull().default(0),
  status: text('status').notNull().default('published'), // published | hidden | reported
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const phraseLikes = sqliteTable('phrase_likes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  phraseId: integer('phrase_id').notNull().references(() => phrases.id),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const phraseCollections = sqliteTable('phrase_collections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  phraseId: integer('phrase_id').notNull().references(() => phrases.id),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
