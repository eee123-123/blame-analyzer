# Phase 2 — 核心体验升级

## 概览

在 Phase 1（安全架构 + 基础用户体系）基础上，Phase 2 聚焦核心使用体验提升：

| 功能 | 说明 | 实现层 |
|------|------|--------|
| 分析历史保存 & 回顾 | AI 分析结果自动持久化，支持列表浏览/详情查看/删除 | 后端 + 前端 |
| 报告导出（PDF/图片） | 将分析结果一键导出为 PNG 或 PDF 文件 | 纯前端 |
| OCR 图片识别输入 | 上传聊天截图，自动提取文字填入输入框 | 后端 + 前端 |
| 移动端体验优化 | 响应式布局增强，触屏友好 | 前端 CSS |

**架构决策**：推翻原计划中的 React + Next.js 迁移，保留 vanilla JS 前端架构（轻量高效，无需重构）。

---

## 一、分析历史保存 & 回顾

### 1.1 后端

**新增 DB Schema** — `server/src/db/schema.ts`

```ts
export const analyses = sqliteTable('analyses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  rawText: text('raw_text').notNull(),
  result: text('result').notNull(),       // JSON 序列化的分析结果
  summary: text('summary'),               // 摘要（列表展示用）
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
```

**新增 History 路由** — `server/src/routes/history.ts`

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | /api/history | 获取当前用户分析历史（分页） | JWT |
| GET | /api/history/:id | 获取单条历史详情 | JWT |
| DELETE | /api/history/:id | 删除一条历史记录 | JWT |

**AI 路由改造** — `server/src/routes/ai.ts`

- `analyze-sync` 成功后自动存入 `analyses` 表
- 流式分析完成后返回 `historyId`

### 1.2 前端

**新增模块** — `js/history.js`

- `fetchHistoryList(page)` — 分页获取
- `fetchHistoryDetail(id)` — 详情 + 渲染
- `deleteHistory(id)` — 删除
- `renderHistoryPanel()` — 历史面板 UI

**UI**：Header 增加"历史记录"按钮，点击打开抽屉式侧边栏

---

## 二、报告导出（PDF/图片）

**纯前端实现**，CDN 引入：

- `html2canvas` — DOM 截图
- `jsPDF` — PDF 生成

**新增模块** — `js/export.js`

- `exportAsImage()` — 截图 #resultSection → PNG 下载
- `exportAsPDF()` — 截图嵌入 PDF → 下载

**UI**：结果区尾部增加"导出 PDF / 导出图片"按钮

---

## 三、OCR 图片识别输入

**后端**：利用 DashScope qwen-vl-plus 多模态模型

**新增 OCR 路由** — `server/src/routes/ocr.ts`

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| POST | /api/ocr/recognize | 接收 base64 图片，返回识别文字 | JWT |

**DashScope 服务扩展** — `server/src/services/dashscope.ts`

- 新增 `callDashScopeVL(imageBase64, prompt)` 方法

**前端** — `js/ocr.js`

- 输入区增加"上传截图"按钮（支持拖拽 + 点击选择）
- 图片压缩为 base64 → 调后端 → 识别文字填充输入框

---

## 四、移动端体验优化

**文件**：`css/style.css`

- 响应式断点：768px / 480px
- 卡片/按钮自适应
- 按钮增大触控区域（min 44px）
- 历史面板移动端全屏抽屉
- 字体/间距适配小屏

---

## 五、新增 API 总览

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | /api/history | 分析历史列表（分页） | JWT |
| GET | /api/history/:id | 单条历史详情 | JWT |
| DELETE | /api/history/:id | 删除历史 | JWT |
| POST | /api/ocr/recognize | OCR 图片识别 | JWT |

---

## 六、实施顺序

1. 后端：schema 扩展 → history 路由 → AI 路由改造 → OCR 服务/路由 → 注册路由
2. 前端：history.js → export.js → ocr.js → 移动端 CSS → HTML 更新
3. 文档：更新 doc.md（当前状态、架构、API、完成项）

---

## 七、Phase 2 完成标志

- [ ] 分析结果自动保存到 SQLite，用户可浏览/查看/删除历史
- [ ] 一键导出分析报告为 PNG 或 PDF
- [ ] 上传截图自动 OCR 识别填充输入
- [ ] 移动端浏览体验流畅
- [ ] doc.md 同步更新
