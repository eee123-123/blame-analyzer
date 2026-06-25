# 甩锅分析器 (Blame Analyzer)

一款智能聊天记录分析工具，通过 AI 解析对话内容，识别其中的甩锅行为、责任推诿模式，帮助你看清沟通中的真实动态。

## 技术栈

- **前端**：原生 HTML / CSS / JavaScript
- **后端**：Node.js + TypeScript + Hono 框架
- **数据库**：SQLite (libsql)
- **AI**：通义千问 (DashScope API)

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/eee123-123/blame-analyzer.git
cd blame-analyzer
```

### 2. 安装后端依赖

```bash
cd server
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，根据 `.env.example` 中的说明填入必要的配置项（如 DashScope API Key 等）。

### 4. 启动后端服务

```bash
node --import tsx/esm src/index.ts
```

后端服务运行在 http://localhost:3000

### 5. 启动前端服务

在项目根目录下执行：

```bash
cd ..
npx serve . -p 5500
```

前端访问地址：http://localhost:5500

## 项目结构

```
/                    - 前端文件（index.html, css/, js/）
/server              - 后端服务
/server/src          - 后端源码
/server/src/routes   - API 路由
/server/src/services - 业务逻辑
/server/src/db       - 数据库配置
```
