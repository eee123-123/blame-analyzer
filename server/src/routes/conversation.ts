import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rateLimit.js';
import {
  callDashScope,
  callDashScopeStream,
  buildFollowUpPrompt,
} from '../services/dashscope.js';

const conversation = new Hono();

// 所有对话路由需要鉴权
conversation.use('/*', authMiddleware);

/**
 * GET /api/conversation — 获取用户对话列表
 */
conversation.get('/', async (c) => {
  try {
    const user = (c as any).get('user');
    const page = Number(c.req.query('page') || '1');
    const pageSize = Number(c.req.query('pageSize') || '20');
    const offset = (page - 1) * pageSize;

    const records = await db
      .select({
        id: schema.conversations.id,
        analysisId: schema.conversations.analysisId,
        title: schema.conversations.title,
        createdAt: schema.conversations.createdAt,
        updatedAt: schema.conversations.updatedAt,
      })
      .from(schema.conversations)
      .where(eq(schema.conversations.userId, user.userId))
      .orderBy(desc(schema.conversations.updatedAt))
      .limit(pageSize)
      .offset(offset);

    return c.json({ data: records, page, pageSize });
  } catch (error: any) {
    return c.json({ error: `获取对话列表失败: ${error.message}` }, 500);
  }
});

/**
 * POST /api/conversation — 创建对话（从分析结果开始）
 */
conversation.post('/', async (c) => {
  try {
    const user = (c as any).get('user');
    const body = await c.req.json();
    const { analysisId, title } = body;

    // 验证分析记录存在
    if (analysisId) {
      const analysis = await db.select()
        .from(schema.analyses)
        .where(and(eq(schema.analyses.id, analysisId), eq(schema.analyses.userId, user.userId)))
        .get();

      if (!analysis) {
        return c.json({ error: '分析记录不存在' }, 404);
      }
    }

    const conv = await db.insert(schema.conversations).values({
      userId: user.userId,
      analysisId: analysisId || null,
      title: title || '新对话',
    }).returning().get();

    return c.json(conv);
  } catch (error: any) {
    return c.json({ error: `创建对话失败: ${error.message}` }, 500);
  }
});

/**
 * GET /api/conversation/:id — 获取对话历史消息
 */
conversation.get('/:id', async (c) => {
  try {
    const user = (c as any).get('user');
    const id = Number(c.req.param('id'));

    // 验证对话属于当前用户
    const conv = await db.select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, user.userId)))
      .get();

    if (!conv) {
      return c.json({ error: '对话不存在' }, 404);
    }

    // 获取消息列表
    const msgs = await db.select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, id))
      .orderBy(schema.messages.createdAt);

    return c.json({ conversation: conv, messages: msgs });
  } catch (error: any) {
    return c.json({ error: `获取对话失败: ${error.message}` }, 500);
  }
});

/**
 * POST /api/conversation/:id/message — 发送追问消息（触发 AI 回复，流式）
 */
conversation.post('/:id/message', rateLimitMiddleware, async (c) => {
  try {
    const user = (c as any).get('user');
    const id = Number(c.req.param('id'));
    const body = await c.req.json();
    const { content } = body;

    if (!content || content.trim().length < 2) {
      return c.json({ error: '消息内容太短' }, 400);
    }

    // 验证对话属于当前用户
    const conv = await db.select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, user.userId)))
      .get();

    if (!conv) {
      return c.json({ error: '对话不存在' }, 404);
    }

    // 保存用户消息
    await db.insert(schema.messages).values({
      conversationId: id,
      role: 'user',
      content: content.trim(),
    });

    // 获取对话历史
    const history = await db.select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, id))
      .orderBy(schema.messages.createdAt);

    // 获取原始分析上下文（如果有关联分析）
    let analysisContext: string | undefined;
    if (conv.analysisId) {
      const analysis = await db.select()
        .from(schema.analyses)
        .where(eq(schema.analyses.id, conv.analysisId))
        .get();
      if (analysis) {
        analysisContext = analysis.summary || analysis.result.slice(0, 1000);
      }
    }

    // 构建追问 prompt
    const historyMsgs = history.map(m => ({ role: m.role, content: m.content }));
    const messages = buildFollowUpPrompt(historyMsgs, content.trim(), analysisContext);

    // 流式响应
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    const sseStream = callDashScopeStream({
      messages,
      temperature: 0.7,
      maxTokens: 2000,
    });

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

        // 流式结束后保存 AI 回复
        saveAssistantMessage(id, fullContent).catch(console.error);

        // 更新对话的 updatedAt
        await db.update(schema.conversations)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(schema.conversations.id, id));
      } finally {
        reader.releaseLock();
      }
    });
  } catch (error: any) {
    return c.json({ error: `发送消息失败: ${error.message}` }, 500);
  }
});

/**
 * DELETE /api/conversation/:id — 删除对话
 */
conversation.delete('/:id', async (c) => {
  try {
    const user = (c as any).get('user');
    const id = Number(c.req.param('id'));

    // 验证对话属于当前用户
    const conv = await db.select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, user.userId)))
      .get();

    if (!conv) {
      return c.json({ error: '对话不存在' }, 404);
    }

    // 先删除消息
    await db.delete(schema.messages)
      .where(eq(schema.messages.conversationId, id));

    // 再删除对话
    await db.delete(schema.conversations)
      .where(eq(schema.conversations.id, id));

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: `删除对话失败: ${error.message}` }, 500);
  }
});

/**
 * 保存 AI 回复消息
 */
async function saveAssistantMessage(conversationId: number, sseContent: string) {
  try {
    // 从 SSE 流式内容中提取实际文本
    let resultText = sseContent;
    if (sseContent.includes('data: ')) {
      const parts: string[] = [];
      const lines = sseContent.split('\n');
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

    await db.insert(schema.messages).values({
      conversationId,
      role: 'assistant',
      content: resultText,
    });
  } catch (error) {
    console.error('保存 AI 回复失败:', error);
  }
}

export default conversation;
