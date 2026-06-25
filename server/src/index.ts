import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import aiRoutes from './routes/ai.js';
import historyRoutes from './routes/history.js';
import ocrRoutes from './routes/ocr.js';
import subscriptionRoutes from './routes/subscription.js';
import conversationRoutes from './routes/conversation.js';
import phrasesRoutes from './routes/phrases.js';
import dashboardRoutes from './routes/dashboard.js';

const app = new Hono();

// 全局中间件
app.use('*', logger());
app.use('*', cors({
  origin: ['http://localhost:5500', 'http://localhost:3001', 'http://127.0.0.1:5500', 'http://localhost:8080'],
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['X-RateLimit-Remaining', 'X-RateLimit-Limit', 'X-User-Plan'],
  credentials: true,
}));

// 健康检查
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    service: '甩锅分析器 API',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
  });
});

// 路由挂载
app.route('/api/auth', authRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api/history', historyRoutes);
app.route('/api/ocr', ocrRoutes);
// Phase 3 新增路由
app.route('/api/subscription', subscriptionRoutes);
app.route('/api/conversation', conversationRoutes);
app.route('/api/phrases', phrasesRoutes);
app.route('/api/dashboard', dashboardRoutes);

// 404 处理
app.notFound((c) => {
  return c.json({ error: '接口不存在' }, 404);
});

// 全局错误处理
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: '服务器内部错误' }, 500);
});

// 启动服务
console.log(`
╔═══════════════════════════════════════════╗
║  🎯 甩锅分析器 API Server                ║
║  Port: ${config.port}                              ║
║  Mode: ${process.env.NODE_ENV || 'development'}                      ║
╚═══════════════════════════════════════════╝
`);

serve({
  fetch: app.fetch,
  port: config.port,
});
