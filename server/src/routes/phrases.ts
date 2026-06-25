import { Hono } from 'hono';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';

const phrases = new Hono();

/**
 * GET /api/phrases — 浏览话术列表（分页+分类筛选+排序）公开接口
 */
phrases.get('/', async (c) => {
  try {
    const page = Number(c.req.query('page') || '1');
    const pageSize = Number(c.req.query('pageSize') || '20');
    const category = c.req.query('category') || '';
    const sort = c.req.query('sort') || 'latest'; // latest | hot
    const offset = (page - 1) * pageSize;

    let query = db
      .select({
        id: schema.phrases.id,
        content: schema.phrases.content,
        category: schema.phrases.category,
        scenario: schema.phrases.scenario,
        likes: schema.phrases.likes,
        createdAt: schema.phrases.createdAt,
        authorNickname: schema.users.nickname,
      })
      .from(schema.phrases)
      .leftJoin(schema.users, eq(schema.phrases.userId, schema.users.id))
      .where(eq(schema.phrases.status, 'published'))
      .$dynamic();

    // 分类筛选
    if (category && ['deflect', 'counter', 'clarify', 'escalate'].includes(category)) {
      query = query.where(and(eq(schema.phrases.status, 'published'), eq(schema.phrases.category, category)));
    }

    // 排序
    if (sort === 'hot') {
      query = query.orderBy(desc(schema.phrases.likes));
    } else {
      query = query.orderBy(desc(schema.phrases.createdAt));
    }

    const records = await query.limit(pageSize).offset(offset);

    // 获取总数
    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(schema.phrases)
      .where(eq(schema.phrases.status, 'published'))
      .get();

    return c.json({
      data: records,
      page,
      pageSize,
      total: countResult?.count || 0,
    });
  } catch (error: any) {
    return c.json({ error: `获取话术列表失败: ${error.message}` }, 500);
  }
});

// 以下路由需要鉴权
phrases.use('/*', authMiddleware);

/**
 * POST /api/phrases — 贡献新话术
 */
phrases.post('/', async (c) => {
  try {
    const user = (c as any).get('user');
    const body = await c.req.json();
    const { content, category, scenario } = body;

    if (!content || content.trim().length < 5) {
      return c.json({ error: '话术内容太短，请至少输入5个字符' }, 400);
    }

    if (!category || !['deflect', 'counter', 'clarify', 'escalate'].includes(category)) {
      return c.json({ error: '请选择有效的分类（deflect/counter/clarify/escalate）' }, 400);
    }

    const phrase = await db.insert(schema.phrases).values({
      userId: user.userId,
      content: content.trim(),
      category,
      scenario: scenario?.trim() || null,
    }).returning().get();

    return c.json(phrase, 201);
  } catch (error: any) {
    return c.json({ error: `贡献话术失败: ${error.message}` }, 500);
  }
});

/**
 * POST /api/phrases/:id/like — 点赞/取消点赞
 */
phrases.post('/:id/like', async (c) => {
  try {
    const user = (c as any).get('user');
    const phraseId = Number(c.req.param('id'));

    // 检查话术是否存在
    const phrase = await db.select()
      .from(schema.phrases)
      .where(eq(schema.phrases.id, phraseId))
      .get();

    if (!phrase) {
      return c.json({ error: '话术不存在' }, 404);
    }

    // 检查是否已点赞
    const existingLike = await db.select()
      .from(schema.phraseLikes)
      .where(and(
        eq(schema.phraseLikes.userId, user.userId),
        eq(schema.phraseLikes.phraseId, phraseId)
      ))
      .get();

    if (existingLike) {
      // 取消点赞
      await db.delete(schema.phraseLikes)
        .where(and(
          eq(schema.phraseLikes.userId, user.userId),
          eq(schema.phraseLikes.phraseId, phraseId)
        ));
      await db.update(schema.phrases)
        .set({ likes: Math.max(0, phrase.likes - 1) })
        .where(eq(schema.phrases.id, phraseId));

      return c.json({ liked: false, likes: Math.max(0, phrase.likes - 1) });
    } else {
      // 点赞
      await db.insert(schema.phraseLikes).values({
        userId: user.userId,
        phraseId,
      });
      await db.update(schema.phrases)
        .set({ likes: phrase.likes + 1 })
        .where(eq(schema.phrases.id, phraseId));

      return c.json({ liked: true, likes: phrase.likes + 1 });
    }
  } catch (error: any) {
    return c.json({ error: `操作失败: ${error.message}` }, 500);
  }
});

/**
 * POST /api/phrases/:id/collect — 收藏/取消收藏
 */
phrases.post('/:id/collect', async (c) => {
  try {
    const user = (c as any).get('user');
    const phraseId = Number(c.req.param('id'));

    // 检查话术是否存在
    const phrase = await db.select()
      .from(schema.phrases)
      .where(eq(schema.phrases.id, phraseId))
      .get();

    if (!phrase) {
      return c.json({ error: '话术不存在' }, 404);
    }

    // 检查是否已收藏
    const existing = await db.select()
      .from(schema.phraseCollections)
      .where(and(
        eq(schema.phraseCollections.userId, user.userId),
        eq(schema.phraseCollections.phraseId, phraseId)
      ))
      .get();

    if (existing) {
      // 取消收藏
      await db.delete(schema.phraseCollections)
        .where(and(
          eq(schema.phraseCollections.userId, user.userId),
          eq(schema.phraseCollections.phraseId, phraseId)
        ));
      return c.json({ collected: false });
    } else {
      // 收藏
      await db.insert(schema.phraseCollections).values({
        userId: user.userId,
        phraseId,
      });
      return c.json({ collected: true });
    }
  } catch (error: any) {
    return c.json({ error: `操作失败: ${error.message}` }, 500);
  }
});

/**
 * GET /api/phrases/my — 我贡献的话术
 */
phrases.get('/my', async (c) => {
  try {
    const user = (c as any).get('user');
    const records = await db.select()
      .from(schema.phrases)
      .where(eq(schema.phrases.userId, user.userId))
      .orderBy(desc(schema.phrases.createdAt));

    return c.json({ data: records });
  } catch (error: any) {
    return c.json({ error: `获取失败: ${error.message}` }, 500);
  }
});

/**
 * GET /api/phrases/collected — 我收藏的话术
 */
phrases.get('/collected', async (c) => {
  try {
    const user = (c as any).get('user');
    const records = await db.select({
      id: schema.phrases.id,
      content: schema.phrases.content,
      category: schema.phrases.category,
      scenario: schema.phrases.scenario,
      likes: schema.phrases.likes,
      createdAt: schema.phrases.createdAt,
      authorNickname: schema.users.nickname,
    })
      .from(schema.phraseCollections)
      .innerJoin(schema.phrases, eq(schema.phraseCollections.phraseId, schema.phrases.id))
      .leftJoin(schema.users, eq(schema.phrases.userId, schema.users.id))
      .where(eq(schema.phraseCollections.userId, user.userId))
      .orderBy(desc(schema.phraseCollections.createdAt));

    return c.json({ data: records });
  } catch (error: any) {
    return c.json({ error: `获取失败: ${error.message}` }, 500);
  }
});

/**
 * DELETE /api/phrases/:id — 删除自己的话术
 */
phrases.delete('/:id', async (c) => {
  try {
    const user = (c as any).get('user');
    const id = Number(c.req.param('id'));

    const phrase = await db.select()
      .from(schema.phrases)
      .where(and(eq(schema.phrases.id, id), eq(schema.phrases.userId, user.userId)))
      .get();

    if (!phrase) {
      return c.json({ error: '话术不存在或无权删除' }, 404);
    }

    // 删除关联的点赞和收藏
    await db.delete(schema.phraseLikes).where(eq(schema.phraseLikes.phraseId, id));
    await db.delete(schema.phraseCollections).where(eq(schema.phraseCollections.phraseId, id));
    await db.delete(schema.phrases).where(eq(schema.phrases.id, id));

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: `删除失败: ${error.message}` }, 500);
  }
});

export default phrases;
