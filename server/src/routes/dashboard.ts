import { Hono } from 'hono';
import { eq, sql, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';

const dashboard = new Hono();

/**
 * GET /api/dashboard/public-stats — 公开统计（无需鉴权）
 */
dashboard.get('/public-stats', async (c) => {
  try {
    const totalUsers = await db.select({ count: sql<number>`count(*)` })
      .from(schema.users).get();

    const totalAnalyses = await db.select({ count: sql<number>`count(*)` })
      .from(schema.analyses).get();

    const totalPhrases = await db.select({ count: sql<number>`count(*)` })
      .from(schema.phrases)
      .where(eq(schema.phrases.status, 'published'))
      .get();

    return c.json({
      totalUsers: totalUsers?.count || 0,
      totalAnalyses: totalAnalyses?.count || 0,
      totalPhrases: totalPhrases?.count || 0,
    });
  } catch (error: any) {
    return c.json({ error: `获取统计失败: ${error.message}` }, 500);
  }
});

// 以下路由需要鉴权
dashboard.use('/*', authMiddleware);

/**
 * GET /api/dashboard/stats — 个人统计
 */
dashboard.get('/stats', async (c) => {
  try {
    const user = (c as any).get('user');

    // 总分析次数
    const totalAnalyses = await db.select({ count: sql<number>`count(*)` })
      .from(schema.analyses)
      .where(eq(schema.analyses.userId, user.userId))
      .get();

    // 本月分析次数
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthAnalyses = await db.select({ count: sql<number>`count(*)` })
      .from(schema.analyses)
      .where(sql`${schema.analyses.userId} = ${user.userId} AND ${schema.analyses.createdAt} >= ${monthStart.toISOString()}`)
      .get();

    // 连续使用天数
    const usageDays = await db.select({ date: schema.usage.date })
      .from(schema.usage)
      .where(eq(schema.usage.userId, user.userId))
      .orderBy(desc(schema.usage.date));

    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    let checkDate = new Date();

    for (const row of usageDays) {
      const expected = checkDate.toISOString().split('T')[0];
      if (row.date === expected) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (row.date < expected) {
        // 如果第一天不是今天，也尝试从昨天开始算
        if (streak === 0) {
          checkDate.setDate(checkDate.getDate() - 1);
          const yesterday = checkDate.toISOString().split('T')[0];
          if (row.date === yesterday) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        } else {
          break;
        }
      }
    }

    // 对话总数
    const totalConversations = await db.select({ count: sql<number>`count(*)` })
      .from(schema.conversations)
      .where(eq(schema.conversations.userId, user.userId))
      .get();

    return c.json({
      totalAnalyses: totalAnalyses?.count || 0,
      monthAnalyses: monthAnalyses?.count || 0,
      streak,
      totalConversations: totalConversations?.count || 0,
    });
  } catch (error: any) {
    return c.json({ error: `获取统计失败: ${error.message}` }, 500);
  }
});

/**
 * GET /api/dashboard/trends — 使用趋势（近 30 天每日分析量）
 */
dashboard.get('/trends', async (c) => {
  try {
    const user = (c as any).get('user');
    const days = Number(c.req.query('days') || '30');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const records = await db.select({
      date: sql<string>`date(${schema.analyses.createdAt})`,
      count: sql<number>`count(*)`,
    })
      .from(schema.analyses)
      .where(sql`${schema.analyses.userId} = ${user.userId} AND ${schema.analyses.createdAt} >= ${startDate.toISOString()}`)
      .groupBy(sql`date(${schema.analyses.createdAt})`)
      .orderBy(sql`date(${schema.analyses.createdAt})`);

    // 填充空日期
    const trendMap = new Map(records.map(r => [r.date, r.count]));
    const trends: { date: string; count: number }[] = [];
    const current = new Date(startDate);
    const now = new Date();

    while (current <= now) {
      const dateStr = current.toISOString().split('T')[0];
      trends.push({ date: dateStr, count: trendMap.get(dateStr) || 0 });
      current.setDate(current.getDate() + 1);
    }

    return c.json({ trends });
  } catch (error: any) {
    return c.json({ error: `获取趋势失败: ${error.message}` }, 500);
  }
});

/**
 * GET /api/dashboard/categories — 分类统计
 * 从分析结果 JSON 中提取分类信息
 */
dashboard.get('/categories', async (c) => {
  try {
    const user = (c as any).get('user');

    const records = await db.select({ result: schema.analyses.result })
      .from(schema.analyses)
      .where(eq(schema.analyses.userId, user.userId));

    // 统计关键证据类型分布
    const categoryCount: Record<string, number> = {};

    for (const row of records) {
      try {
        const parsed = JSON.parse(row.result);
        const evidences = parsed.evidences || parsed.keyMessages || [];
        for (const ev of evidences) {
          const type = ev.type || '未分类';
          categoryCount[type] = (categoryCount[type] || 0) + 1;
        }
      } catch {
        // 忽略解析失败的记录
      }
    }

    const categories = Object.entries(categoryCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return c.json({ categories });
  } catch (error: any) {
    return c.json({ error: `获取分类统计失败: ${error.message}` }, 500);
  }
});

export default dashboard;
