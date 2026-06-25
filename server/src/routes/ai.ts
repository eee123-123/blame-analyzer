import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rateLimit.js';
import {
  callDashScope,
  callDashScopeStream,
  buildAnalysisPrompt,
  buildCounterattackPrompt,
} from '../services/dashscope.js';
import { db, schema } from '../db/index.js';

const ai = new Hono();

// 所有 AI 路由都需要鉴权 + 限流
ai.use('/*', authMiddleware, rateLimitMiddleware);

/**
 * POST /api/ai/analyze — AI 深度分析（流式）
 */
ai.post('/analyze', async (c) => {
  try {
    const body = await c.req.json();
    const { rawText, role, tone } = body;
    const user = (c as any).get('user');

    if (!rawText || rawText.trim().length < 10) {
      return c.json({ error: '聊天记录内容太短，请输入至少10个字符' }, 400);
    }

    const messages = buildAnalysisPrompt(rawText, role || 'auto', tone || 'all');

    // 流式响应
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    const sseStream = callDashScopeStream({
      messages,
      temperature: 0.7,
      maxTokens: 4000,
    });

    // 收集完整内容用于保存历史
    let fullContent = '';

    return stream(c, async (s) => {
      const reader = sseStream.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = typeof value === 'string' ? value : decoder.decode(value as Uint8Array, { stream: true });
          fullContent += chunk;
          await s.write(chunk);
        }

        // 流式结束后异步保存历史记录
        saveAnalysisHistory(user.userId, rawText, fullContent).catch(console.error);
      } finally {
        reader.releaseLock();
      }
    });
  } catch (error: any) {
    return c.json({ error: `AI 分析失败: ${error.message}` }, 500);
  }
});

/**
 * POST /api/ai/analyze-sync — AI 深度分析（非流式，备用）
 */
ai.post('/analyze-sync', async (c) => {
  try {
    const body = await c.req.json();
    const { rawText, role, tone } = body;
    const user = (c as any).get('user');

    if (!rawText || rawText.trim().length < 10) {
      return c.json({ error: '聊天记录内容太短，请输入至少10个字符' }, 400);
    }

    const messages = buildAnalysisPrompt(rawText, role || 'auto', tone || 'all');
    const content = await callDashScope({ messages, temperature: 0.7, maxTokens: 4000 });

    // 保存到历史记录
    const historyId = await saveAnalysisHistory(user.userId, rawText, content);

    return c.json({ content, historyId });
  } catch (error: any) {
    return c.json({ error: `AI 分析失败: ${error.message}` }, 500);
  }
});

/**
 * POST /api/ai/counterattacks — 生成反击话术
 */
ai.post('/counterattacks', async (c) => {
  try {
    const body = await c.req.json();
    const { rawText, role, tone } = body;

    if (!rawText || rawText.trim().length < 10) {
      return c.json({ error: '聊天记录内容太短' }, 400);
    }

    const messages = buildCounterattackPrompt(rawText, role || 'auto', tone || 'all');
    const content = await callDashScope({ messages, temperature: 0.85, maxTokens: 2000 });

    return c.json({ content });
  } catch (error: any) {
    return c.json({ error: `生成话术失败: ${error.message}` }, 500);
  }
});

/**
 * 保存分析结果到历史记录
 */
async function saveAnalysisHistory(userId: number, rawText: string, content: string): Promise<number | null> {
  try {
    // 从 SSE 流式内容中提取实际 JSON 内容
    let resultText = content;
    // 如果是 SSE 格式，提取 data 字段中的 content
    if (content.includes('data: ')) {
      const parts: string[] = [];
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) parts.push(delta);
          } catch { /* skip */ }
        }
      }
      if (parts.length > 0) resultText = parts.join('');
    }

    // 提取摘要（取 summary 字段或截取前 100 字）
    let summary = '';
    try {
      let jsonStr = resultText.trim();
      const braceStart = jsonStr.indexOf('{');
      const braceEnd = jsonStr.lastIndexOf('}');
      if (braceStart !== -1 && braceEnd !== -1) {
        jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
      }
      const parsed = JSON.parse(jsonStr);
      summary = parsed.summary || rawText.slice(0, 100);
    } catch {
      summary = rawText.slice(0, 100);
    }

    const result = await db.insert(schema.analyses).values({
      userId,
      rawText,
      result: resultText,
      summary,
    }).returning({ id: schema.analyses.id });

    return result[0]?.id ?? null;
  } catch (error) {
    console.error('保存分析历史失败:', error);
    return null;
  }
}

export default ai;
