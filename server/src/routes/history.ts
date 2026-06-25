import { Hono } from 'hono';
import { eq, desc, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';

const history = new Hono();

// 所有历史记录路由都需要鉴权
history.use('/*', authMiddleware);

/**
 * GET /api/history — 获取当前用户的分析历史列表（分页）
 */
history.get('/', async (c) => {
  try {
    const user = (c as any).get('user');
    const page = Number(c.req.query('page') || '1');
    const pageSize = Number(c.req.query('pageSize') || '20');
    const offset = (page - 1) * pageSize;

    const records = await db
      .select({
        id: schema.analyses.id,
        summary: schema.analyses.summary,
        createdAt: schema.analyses.createdAt,
      })
      .from(schema.analyses)
      .where(eq(schema.analyses.userId, user.userId))
      .orderBy(desc(schema.analyses.createdAt))
      .limit(pageSize)
      .offset(offset);

    return c.json({ data: records, page, pageSize });
  } catch (error: any) {
    return c.json({ error: `获取历史记录失败: ${error.message}` }, 500);
  }
});

/**
 * GET /api/history/:id — 获取单条历史详情
 */
history.get('/:id', async (c) => {
  try {
    const user = (c as any).get('user');
    const id = Number(c.req.param('id'));

    const records = await db
      .select()
      .from(schema.analyses)
      .where(and(eq(schema.analyses.id, id), eq(schema.analyses.userId, user.userId)))
      .limit(1);

    if (records.length === 0) {
      return c.json({ error: '记录不存在' }, 404);
    }

    const record = records[0];
    return c.json({
      ...record,
      result: JSON.parse(record.result),
    });
  } catch (error: any) {
    return c.json({ error: `获取记录详情失败: ${error.message}` }, 500);
  }
});

/**
 * DELETE /api/history/:id — 删除一条历史记录
 */
history.delete('/:id', async (c) => {
  try {
    const user = (c as any).get('user');
    const id = Number(c.req.param('id'));

    const deleted = await db
      .delete(schema.analyses)
      .where(and(eq(schema.analyses.id, id), eq(schema.analyses.userId, user.userId)));

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: `删除失败: ${error.message}` }, 500);
  }
});

export default history;
