# Phase 1：后端 API 代理 + 安全 + 基础用户体系

> 状态：已完成  
> 工期：约 2 周  
> 目标：解决 API Key 暴露的致命安全问题，添加基础用户认证和使用次数限制

---

## 架构设计

```
blame-analyzer-V3/
├── server/                        # 新增：TypeScript 后端
│   ├── src/
│   │   ├── index.ts               # 入口，Hono app + CORS + Logger
│   │   ├── config.ts              # 环境变量配置
│   │   ├── routes/
│   │   │   ├── ai.ts              # AI 代理路由 (POST /api/ai/analyze, /counterattacks)
│   │   │   └── auth.ts            # 认证路由 (POST /api/auth/login, /register, GET /me)
│   │   ├── middleware/
│   │   │   ├── auth.ts            # JWT 鉴权中间件
│   │   │   └── rateLimit.ts       # 请求限流中间件
│   │   ├── services/
│   │   │   ├── dashscope.ts       # DashScope API 封装（API Key 在此）
│   │   │   └── user.ts            # 用户服务
│   │   └── db/
│   │       ├── schema.ts          # Drizzle ORM schema（users + usage）
│   │       └── index.ts           # DB 初始化（libsql + 自动建表）
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example               # 环境变量模板
│   └── drizzle.config.ts
├── js/                            # 现有前端（改造 ai.js + 新增 auth.js）
├── css/
└── index.html
```

---

## 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 语言 | TypeScript | 类型安全、前后端统一、开发效率高 |
| 框架 | Hono | 轻量(14KB)、TypeScript 原生、兼容 Node/Vercel/Cloudflare |
| 数据库 | SQLite (@libsql/client) | 零运维、纯 JS 实现、无需原生编译、兼容 Node v26 |
| ORM | Drizzle | 类型安全、轻量、SQL-like 语法 |
| 认证 | JWT (jose) | 无状态、轻量、标准化 |
| 密码 | bcryptjs | 纯 JS 实现、无原生依赖 |
| 限流 | 用户维度 + SQLite 计数 | Phase 1 单实例足够 |
| 运行时 | Node.js + tsx | 开发热重载，生产用 tsup 打包 |

**为什么不用微服务？**
- 单人开发，微服务协作优势体现不出来
- 当前业务量级（API 代理 + 简单用户体系），单体完全够用
- 按模块划分代码（routes/services/middleware），后续可无痛拆分

---

## Task 1：初始化后端项目

在 `server/` 目录下初始化 TypeScript + Hono 项目：
- package.json（依赖：hono, @hono/node-server, drizzle-orm, @libsql/client, jose, bcryptjs）
- tsconfig.json（strict 模式，ESNext module）
- .env.example（DASHSCOPE_API_KEY, JWT_SECRET, PORT）
- 开发脚本：`dev`(tsx watch), `build`(tsup), `start`

---

## Task 2：实现 AI 代理路由

核心目标：API Key 从前端移到后端，前端不再直接调用 DashScope。

**`server/src/services/dashscope.ts`**：
- 封装 DashScope API 调用（流式 + 非流式）
- API Key 从环境变量读取
- 支持 SSE 流式转发给前端
- 包含完整的 Prompt 工程（分析 prompt + 话术 prompt）

**`server/src/routes/ai.ts`**：
- `POST /api/ai/analyze` — 接收 rawText/role/tone，流式返回 SSE
- `POST /api/ai/analyze-sync` — 非流式备用接口
- `POST /api/ai/counterattacks` — 单独生成反击话术
- 所有接口需要鉴权（JWT）+ 限流

---

## Task 3：实现用户认证

**`server/src/routes/auth.ts`**：
- `POST /api/auth/register` — 邮箱+密码注册（含参数验证）
- `POST /api/auth/login` — 登录返回 JWT
- `GET /api/auth/me` — 获取当前用户信息（需鉴权）

**`server/src/db/schema.ts`** (SQLite + Drizzle)：
```typescript
users: { id, email, passwordHash, nickname, createdAt }
usage: { id, userId, date, aiCallCount }  // UNIQUE(userId, date)
```

**`server/src/middleware/auth.ts`**：
- 从 Authorization header 解析 Bearer token
- 使用 jose 库验证 JWT 签名和过期时间
- 将 userId/email 注入请求上下文

---

## Task 4：实现请求限流

**`server/src/middleware/rateLimit.ts`**：
- 免费用户：AI 分析 3 次/天（可通过环境变量配置）
- 基于 userId + 日期维度计数（存 SQLite，UNIQUE 约束）
- 超限返回 429 + 友好中文提示
- 响应头返回 X-RateLimit-Remaining / X-RateLimit-Limit

---

## Task 5：改造前端 ai.js

将 `js/ai.js` 中直接调用 DashScope 的逻辑改为调用后端代理：
- **移除硬编码的 API_KEY**（安全问题的根本解决）
- `analyzeWithAI()` → `POST /api/ai/analyze`（保持 SSE 流式体验）
- `generateAICounterattacks()` → `POST /api/ai/counterattacks`
- 请求头带上 JWT token（从 localStorage 读取）
- 增加 401/429 状态码的友好错误处理

---

## Task 6：前端添加登录/注册 UI

- 顶部右上角 `#authArea`：未登录显示登录/注册按钮，已登录显示昵称+退出
- 模态框 `#authModal`：邮箱+密码+昵称表单，支持登录/注册切换
- Token 存 localStorage，页面加载时自动恢复登录态
- 未登录时本地分析可用，点击 AI 分析自动弹出登录框
- 新增 `js/auth.js` 处理所有认证逻辑

---

## Task 7：开发环境联调

- 后端启动在 localhost:3000（`npm run dev`）
- 前端通过 Live Server 在 localhost:5500 打开
- CORS 配置允许 localhost:5500 / 127.0.0.1:5500
- 验证完整流程：注册 → 登录 → AI 分析 → 限流生效 → 退出

---

## Task 8：同步更新 doc.md

将 `doc.md` 更新为实际的技术方案文档：
- 更新「当前状态」表格（架构已有后端、安全问题已解决）
- 记录实际技术选型（TypeScript + Hono + SQLite）
- 列出 API 接口清单和本地开发命令
- 保留 Phase 2-4 的规划内容

---

## 不做的事（留给后续 Phase）

- 不做微信/钉钉 OAuth（需要企业资质和备案域名）
- 不做前端框架迁移（Phase 2）
- 不做正式部署（但代码结构兼容 Vercel 部署）
- 不做分析历史保存（Phase 2）
- 不做付费系统（Phase 3）

---

## 实施记录

| 任务 | 状态 | 备注 |
|------|------|------|
| Task 1：初始化后端项目 | 已完成 | 解决了 Node v26 下 better-sqlite3 编译失败，改用 @libsql/client |
| Task 2：AI 代理路由 | 已完成 | 流式+非流式双模式 |
| Task 3：用户认证 | 已完成 | 注册/登录/JWT 全流程 |
| Task 4：请求限流 | 已完成 | 每日 3 次，SQLite 计数 |
| Task 5：前端 ai.js 改造 | 已完成 | API Key 已从前端完全移除 |
| Task 6：登录/注册 UI | 已完成 | 模态框 + 顶部状态栏 |
| Task 7：联调验证 | 已完成 | curl 测试全链路通过 |
| Task 8：更新 doc.md | 已完成 | — |
