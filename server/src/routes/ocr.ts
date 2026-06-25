import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { callDashScopeVL } from '../services/dashscope.js';

const ocr = new Hono();

// OCR 路由需要鉴权
ocr.use('/*', authMiddleware);

/**
 * POST /api/ocr/recognize — 图片 OCR 文字识别
 * Body: { image: string (base64) }
 */
ocr.post('/recognize', async (c) => {
  try {
    const body = await c.req.json();
    const { image } = body;

    if (!image) {
      return c.json({ error: '请上传图片' }, 400);
    }

    // 移除可能的 data URL 前缀
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    if (base64Data.length > 10 * 1024 * 1024) {
      return c.json({ error: '图片大小超过限制（最大 10MB）' }, 400);
    }

    const text = await callDashScopeVL(base64Data);

    if (!text || text.trim().length === 0) {
      return c.json({ error: '未能识别出文字内容，请确保图片清晰可读' }, 422);
    }

    return c.json({ text: text.trim() });
  } catch (error: any) {
    return c.json({ error: `OCR 识别失败: ${error.message}` }, 500);
  }
});

export default ocr;
