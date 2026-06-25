# Phase 3 — 增长 & 商业化

> 状态：实施中
> 工期：约 4 周
> 目标：增长引擎与商业化闭环 — 订阅体系、多轮对话、社区话术库、数据看板

---

## 概览

在 Phase 1（安全+用户体系）和 Phase 2（核心体验）基础上，Phase 3 聚焦增长引擎与商业化闭环：

| 功能 | 说明 | 实现层 |
|------|------|--------|
| 付费订阅系统 | Pro/团队版套餐 + 权限控制 + 用量差异化 + mock 支付流程 | 后端 + 前端 |
| 多轮追问对话 | AI 分析后可继续追问，保持上下文连贯 | 后端 + 前端 |
| 社区话术库 | 用户贡献/浏览/点赞/收藏经典甩锅话术 | 后端 + 前端 |
| 数据看板 | 分析热力图、使用趋势、分类统计可视化 | 后端 + 前端 |

**架构决策**：
- 支付使用 mock 实现（完整订阅流程，可后续无缝对接 Stripe/支付宝）
- 浏览器插件延迟到 Phase 4
- 继续保持 vanilla JS 前端 + Hono 后端架构

---

## 一、付费订阅系统

### 1.1 后端

**新增 DB Schema** — `server/src/db/schema.ts`

```ts
export const subscriptions = sqliteTable('subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  plan: text('plan').notNull().default('free'), // free | pro | team
  status: text('status').notNull().default('active'), // active | cancelled | expired
  startDate: text('start_date').notNull().$defaultFn(() => new Date().toISOString()),
  endDate: text('end_date'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  plan: text('plan').notNull(),
  amount: integer('amount').notNull(), // 单位：分
  status: text('status').notNull().default('pending'),
  payMethod: text('pay_method').default('mock'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  paidAt: text('paid_at'),
});
```

**新增订阅路由** — `server/src/routes/subscription.ts`

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | /api/subscription | 获取当前用户订阅信息 | JWT |
| POST | /api/subscription/subscribe | 创建订阅订单（mock 直接成功） | JWT |
| POST | /api/subscription/cancel | 取消订阅 | JWT |
| GET | /api/subscription/plans | 获取所有套餐详情 | 无 |

**新增订阅服务** — `server/src/services/subscription.ts`

- `getUserPlan(userId)` — 查询当前有效订阅
- `createSubscription(userId, plan)` — 创建/升级订阅
- `cancelSubscription(userId)` — 取消订阅
- `isSubscriptionActive(userId)` — 检查是否有效

**改造限流中间件** — `server/src/middleware/rateLimit.ts`

- 查询用户当前套餐（free/pro/team）
- 不同套餐不同限额：free=3次/天，pro/team=无限
- Pro/Team 用户跳过限流，响应头返回套餐标识

### 1.2 前端

**新增模块** — `js/subscription.js`

- `fetchCurrentPlan()` — 获取当前套餐
- `fetchPlans()` — 获取套餐列表
- `subscribe(plan)` — 发起订阅（mock 支付流程）
- `cancelSubscription()` — 取消订阅
- `renderPricingModal()` — 定价弹窗 UI
- `renderPlanBadge()` — 顶部显示当前套餐标识

**UI 变更**：
- Header 用户区显示套餐徽章（免费/Pro/团队）
- 触达限流时弹出升级引导
- 新增"定价"页面/弹窗

---

## 二、多轮追问对话

### 2.1 后端

**新增 DB Schema** — `server/src/db/schema.ts`

```ts
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
  role: text('role').notNull(), // user | assistant
  content: text('content').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
```

**新增对话路由** — `server/src/routes/conversation.ts`

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| POST | /api/conversation | 创建对话（从分析结果开始） | JWT |
| GET | /api/conversation/:id | 获取对话历史消息 | JWT |
| POST | /api/conversation/:id/message | 追加消息（触发 AI 回复，流式） | JWT + 限流 |
| GET | /api/conversation | 获取用户对话列表 | JWT |
| DELETE | /api/conversation/:id | 删除对话 | JWT |

**DashScope 服务扩展**：新增 `buildFollowUpPrompt(history, question, analysisContext)` 构建带上下文的追问 prompt。

### 2.2 前端

**新增模块** — `js/conversation.js`

- `startConversation(analysisId)` — 从分析结果发起追问
- `sendMessage(conversationId, message)` — 发送追问消息
- `renderChatPanel()` — 类聊天式追问 UI

**UI**：
- 分析结果区增加"继续追问"按钮
- 展开后显示聊天气泡式界面
- 支持流式输出 AI 回答

---

## 三、社区话术库

### 3.1 后端

**新增 DB Schema** — `server/src/db/schema.ts`

```ts
export const phrases = sqliteTable('phrases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  category: text('category').notNull(), // deflect | counter | clarify | escalate
  scenario: text('scenario'),
  likes: integer('likes').notNull().default(0),
  status: text('status').notNull().default('published'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const phraseLikes = sqliteTable('phrase_likes', { ... });
export const phraseCollections = sqliteTable('phrase_collections', { ... });
```

**新增话术路由** — `server/src/routes/phrases.ts`

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | /api/phrases | 浏览话术列表（分页+分类筛选+排序） | 无 |
| POST | /api/phrases | 贡献新话术 | JWT |
| POST | /api/phrases/:id/like | 点赞/取消点赞 | JWT |
| POST | /api/phrases/:id/collect | 收藏/取消收藏 | JWT |
| GET | /api/phrases/my | 我贡献的话术 | JWT |
| GET | /api/phrases/collected | 我收藏的话术 | JWT |
| DELETE | /api/phrases/:id | 删除自己的话术 | JWT |

### 3.2 前端

**新增模块** — `js/phrases.js`

- `fetchPhrases(page, category, sort)` — 分页获取话术
- `submitPhrase(content, category, scenario)` — 贡献话术
- `toggleLike(phraseId)` / `toggleCollect(phraseId)` — 互动
- `renderPhrasesPanel()` — 话术库面板 UI

---

## 四、数据看板

### 4.1 后端

**新增看板路由** — `server/src/routes/dashboard.ts`

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | /api/dashboard/stats | 个人统计（总分析次数/本月/连续天数） | JWT |
| GET | /api/dashboard/trends | 使用趋势（近 30 天每日分析量） | JWT |
| GET | /api/dashboard/categories | 分类统计（按分析类型分布） | JWT |
| GET | /api/dashboard/public-stats | 公开统计 | 无 |

### 4.2 前端

**新增模块** — `js/dashboard.js`

- `fetchStats()` / `fetchTrends()` — 拉数据
- `renderDashboard()` — 渲染看板界面
- 使用 Chart.js (CDN) 绘制图表

---

## 五、新增 API 总览

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | /api/subscription | 当前用户订阅 | JWT |
| POST | /api/subscription/subscribe | 创建订阅 | JWT |
| POST | /api/subscription/cancel | 取消订阅 | JWT |
| GET | /api/subscription/plans | 套餐列表 | 无 |
| POST | /api/conversation | 创建对话 | JWT |
| GET | /api/conversation | 对话列表 | JWT |
| GET | /api/conversation/:id | 对话详情 | JWT |
| POST | /api/conversation/:id/message | 发送追问 | JWT + 限流 |
| DELETE | /api/conversation/:id | 删除对话 | JWT |
| GET | /api/phrases | 话术列表 | 无 |
| POST | /api/phrases | 贡献话术 | JWT |
| POST | /api/phrases/:id/like | 点赞 | JWT |
| POST | /api/phrases/:id/collect | 收藏 | JWT |
| GET | /api/phrases/my | 我的话术 | JWT |
| GET | /api/phrases/collected | 我的收藏 | JWT |
| DELETE | /api/phrases/:id | 删除话术 | JWT |
| GET | /api/dashboard/stats | 个人统计 | JWT |
| GET | /api/dashboard/trends | 使用趋势 | JWT |
| GET | /api/dashboard/categories | 分类统计 | JWT |
| GET | /api/dashboard/public-stats | 公开统计 | 无 |

---

## 六、实施顺序

1. Task 1：Schema 扩展（subscriptions/orders/conversations/messages/phrases/phraseLikes/phraseCollections）
2. Task 2：订阅服务 + 路由（mock 支付）
3. Task 3：限流中间件按套餐差异化
4. Task 4：多轮对话后端（conversation 路由 + AI 上下文）
5. Task 5：社区话术库后端
6. Task 6：数据看板后端（聚合统计）
7. Task 7：注册路由 + 联调
8. Task 8：前端 subscription.js
9. Task 9：前端 conversation.js
10. Task 10：前端 phrases.js
11. Task 11：前端 dashboard.js（Chart.js）
12. Task 12：HTML + CSS 更新
13. Task 13：更新 doc.md

---

## 七、Phase 3 完成标志

- [ ] 免费/Pro/团队版套餐体系完整，权限差异化生效
- [ ] Mock 支付流程可走通（订阅/取消/到期）
- [ ] AI 分析后可多轮追问，上下文连贯
- [ ] 社区话术库可浏览/贡献/点赞/收藏
- [ ] 数据看板展示个人统计和使用趋势
- [ ] doc.md 同步更新

---

## 不做的事（留给 Phase 4）

- 浏览器插件（独立子项目，开发量大）
- 真实支付接入（Stripe/支付宝/微信）
- 企业 Bot 集成（钉钉/飞书/企微）
- 团队协作空间（多人协作）
- 开放 API
