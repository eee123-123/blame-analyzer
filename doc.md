## 甩锅分析器 — 技术方案文档

### 一、当前状态

| 维度 | 状态 | 说明 |
|------|------|------|
| 架构 | 前后端分离 | 前端原生 JS SPA + TypeScript 后端 API |
| 安全 | API Key 已后移 | 密钥存储在后端 .env，前端零暴露 |
| 认证 | 邮箱+密码 + JWT | 支持注册/登录/鉴权 |
| 限流 | 免费 3 次/天 | 基于用户维度的每日 AI 调用计数 |
| 数据 | SQLite 持久化 | 用户表 + 使用量表 + 分析历史表 + 订阅/订单表 + 对话/消息表 + 话术表 |
| 历史 | 自动保存 | AI 分析结果自动持久化，支持回顾/删除 |
| 导出 | PDF/图片 | 分析报告一键导出 |
| OCR | 图片识别 | 截图/拍照自动提取文字填入输入框 |
| 订阅 | 免费/Pro/团队 | 套餐体系 + 权限差异化 + mock 支付流程 |
| 对话 | 多轮追问 | 基于分析结果的上下文连贯追问 |
| 话术库 | 社区贡献 | 浏览/贡献/点赞/收藏经典话术 |
| 看板 | 数据统计 | 个人统计 + 使用趋势 + 分类分布 |
| 分发 | 本地开发就绪 | 代码结构兼容 Vercel + 云服务部署 |

---

### 二、技术架构

```
blame-analyzer-V3/
├── server/                        # TypeScript 后端 (Hono)
│   ├── src/
│   │   ├── index.ts               # 入口，Hono app + CORS + Logger
│   │   ├── config.ts              # 环境变量配置（含套餐定义）
│   │   ├── routes/
│   │   │   ├── ai.ts              # AI 代理路由 (分析+自动保存历史)
│   │   │   ├── auth.ts            # 认证路由
│   │   │   ├── history.ts         # 分析历史 CRUD 路由
│   │   │   ├── ocr.ts             # OCR 图片识别路由
│   │   │   ├── subscription.ts    # 订阅套餐路由 (Phase 3)
│   │   │   ├── conversation.ts    # 多轮对话路由 (Phase 3)
│   │   │   ├── phrases.ts         # 社区话术库路由 (Phase 3)
│   │   │   └── dashboard.ts       # 数据看板路由 (Phase 3)
│   │   ├── middleware/
│   │   │   ├── auth.ts            # JWT 鉴权中间件
│   │   │   └── rateLimit.ts       # 按套餐差异化限流中间件
│   │   ├── services/
│   │   │   ├── dashscope.ts       # DashScope API 封装 (流式+非流式+多模态+追问)
│   │   │   ├── user.ts            # 用户 CRUD 服务
│   │   │   └── subscription.ts    # 订阅服务 (Phase 3)
│   │   └── db/
│   │       ├── schema.ts          # Drizzle ORM schema (全部表)
│   │       └── index.ts           # DB 初始化 (libsql + 自动建表)
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── drizzle.config.ts
├── js/                            # 前端 ES Module
│   ├── app.js                     # 主入口 (集成所有模块)
│   ├── ai.js                      # AI 调用 (通过后端代理)
│   ├── auth.js                    # 前端认证模块
│   ├── history.js                 # 分析历史记录管理
│   ├── export.js                  # 报告导出 (PDF/图片)
│   ├── ocr.js                     # OCR 图片识别输入
│   ├── subscription.js            # 订阅管理 + 定价 UI (Phase 3)
│   ├── conversation.js            # 多轮追问对话 (Phase 3)
│   ├── phrases.js                 # 社区话术库 (Phase 3)
│   ├── dashboard.js               # 数据看板 (Phase 3)
│   ├── parser.js                  # 多格式聊天解析引擎
│   ├── analyzer.js                # 本地关键词分析引擎
│   ├── renderer.js                # UI 渲染器
│   ├── samples.js                 # 示例数据
│   └── utils.js                   # 工具函数
├── css/style.css                  # 全局样式 (含所有组件 + 移动端适配)
└── index.html                     # 入口页面
```

### 三、后端技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 语言 | TypeScript | 类型安全、前后端统一、开发效率高 |
| 框架 | Hono | 轻量(14KB)、TS 原生、兼容 Node/Vercel/Cloudflare |
| 数据库 | SQLite (@libsql/client) | 零运维、纯 JS、无需原生编译 |
| ORM | Drizzle | 类型安全、轻量、SQL-like 语法 |
| 认证 | JWT (jose) | 无状态、轻量、标准化 |
| 密码 | bcryptjs | 纯 JS 实现、无原生依赖 |
| 运行时 | Node.js + tsx | 开发热重载 |

### 四、API 接口

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | /api/health | 健康检查 | 无 |
| POST | /api/auth/register | 用户注册 | 无 |
| POST | /api/auth/login | 用户登录 | 无 |
| GET | /api/auth/me | 获取当前用户 | JWT |
| POST | /api/ai/analyze | AI 深度分析 (SSE流式+自动保存) | JWT + 限流 |
| POST | /api/ai/analyze-sync | AI 分析 (非流式+自动保存) | JWT + 限流 |
| POST | /api/ai/counterattacks | 生成反击话术 | JWT + 限流 |
| GET | /api/history | 分析历史列表（分页） | JWT |
| GET | /api/history/:id | 单条历史详情 | JWT |
| DELETE | /api/history/:id | 删除历史记录 | JWT |
| POST | /api/ocr/recognize | OCR 图片文字识别 | JWT |
| GET | /api/subscription | 当前用户订阅信息 | JWT |
| POST | /api/subscription/subscribe | 创建订阅 (mock 支付) | JWT |
| POST | /api/subscription/cancel | 取消订阅 | JWT |
| GET | /api/subscription/plans | 套餐列表 | 无 |
| POST | /api/conversation | 创建对话 | JWT |
| GET | /api/conversation | 对话列表 | JWT |
| GET | /api/conversation/:id | 对话详情 | JWT |
| POST | /api/conversation/:id/message | 发送追问 (流式) | JWT + 限流 |
| DELETE | /api/conversation/:id | 删除对话 | JWT |
| GET | /api/phrases | 话术列表 (分页+筛选) | 无 |
| POST | /api/phrases | 贡献话术 | JWT |
| POST | /api/phrases/:id/like | 点赞/取消 | JWT |
| POST | /api/phrases/:id/collect | 收藏/取消 | JWT |
| GET | /api/phrases/my | 我的话术 | JWT |
| GET | /api/phrases/collected | 我的收藏 | JWT |
| DELETE | /api/phrases/:id | 删除话术 | JWT |
| GET | /api/dashboard/stats | 个人统计 | JWT |
| GET | /api/dashboard/trends | 使用趋势 | JWT |
| GET | /api/dashboard/categories | 分类统计 | JWT |
| GET | /api/dashboard/public-stats | 公开统计 | 无 |

### 五、本地开发

#### 首次启动

```bash
# 1. 安装后端依赖
cd server
npm install
cp .env.example .env   # 编辑 .env，填入你的 DASHSCOPE_API_KEY 和 JWT_SECRET

# 2. 启动后端（端口 3000）
node --import tsx/esm src/index.ts

# 3. 新开一个终端，启动前端（端口 5500）
cd /Users/wangjun/MyProject/blame-analyzer-V3
npx serve . -p 5500
```

启动后访问：http://localhost:5500

#### 日常启动（已安装过依赖）

```bash
# 终端 1：启动后端
cd server && node --import tsx/esm src/index.ts

# 终端 2：启动前端
cd /Users/wangjun/MyProject/blame-analyzer-V3 && npx serve . -p 5500
```

#### 关闭服务

```bash
# 方式一：在对应终端按 Ctrl + C

# 方式二：一键关闭全部
lsof -ti :3000 | xargs kill -9; lsof -ti :5500 | xargs kill -9
```

#### 端口说明

| 服务 | 端口 | 说明 |
|------|------|------|
| 后端 API | 3000 | Hono + TypeScript，提供所有 API 接口 |
| 前端页面 | 5500 | 静态文件服务，访问 index.html |

---

### 六、Phase 1 已完成项

- [x] 搭建后端 API 代理（API Key 不再暴露在前端）
- [x] 添加基础用户体系（邮箱+密码注册/登录）
- [x] JWT 鉴权 + 限流（免费 3 次/天）
- [x] 前端改造（调用后端代理、登录/注册 UI）
- [x] 开发环境联调验证通过

### 七、Phase 2 已完成项

- [x] 分析历史保存 & 回顾（后端 CRUD + 前端抽屉面板）
- [x] 报告导出（PDF/PNG 一键下载）
- [x] OCR 图片识别输入（DashScope qwen-vl 多模态）
- [x] 移动端响应式优化（768px/480px 断点）
- [x] 推翻 React 迁移计划，保留 vanilla JS 架构

### 八、Phase 3 已完成项

- [x] 付费订阅系统（免费/Pro/团队版套餐 + mock 支付流程）
- [x] 按套餐差异化限流（Pro/Team 无限，免费 3次/天）
- [x] 多轮追问对话（基于分析结果的上下文连贯追问）
- [x] 社区话术库（浏览/贡献/点赞/收藏）
- [x] 数据看板（个人统计 + 30天趋势 + 分类分布）
- [x] 升级引导（限流时弹出定价弹窗）

### 九、后续规划

```
Phase 4（持续）— 生态
├── 浏览器插件（钉钉/飞书选中即分析）
├── 企业 Bot 集成（钉钉/飞书/企微）
├── 团队协作空间
├── 开放 API
├── 真实支付接入（Stripe/支付宝）
└── 垂直行业定制（法务、采购、外包）
```

### 十、商业化设计

| 版本 | 定价 | 能力 |
|------|------|------|
| 免费版 | 0 | 本地分析不限次 + AI 分析 3次/天 |
| Pro 版 | 19.9/月 | AI 无限次 + 历史记录 + 导出 + 自定义词库 |
| 团队版 | 99/月 | 多人协作 + 团队统计 + API 接口 + Bot 集成 |
