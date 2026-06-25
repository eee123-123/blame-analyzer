import { Context, Next } from 'hono';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { config } from '../config.js';
import { getDailyAiLimit, getUserPlan } from '../services/subscription.js';
import type { AuthPayload } from './auth.js';

/**
 * AI 请求限流中间件
 * 根据用户套餐差异化限流：免费 3次/天，Pro/Team 无限
 */
export async function rateLimitMiddleware(c: Context, next: Next) {
  const user = (c as any).get('user') as AuthPayload;
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // 获取用户套餐对应的每日限额
  const dailyLimit = await getDailyAiLimit(user.userId);
  const plan = await getUserPlan(user.userId);

  // Pro/Team 用户跳过限流 (-1 表示无限)
  if (dailyLimit === -1) {
    c.header('X-RateLimit-Remaining', 'unlimited');
    c.header('X-RateLimit-Limit', 'unlimited');
    c.header('X-User-Plan', plan);
    await next();
    return;
  }

  // 查询今日使用量
  let usageRecord = await db.select()
    .from(schema.usage)
    .where(and(
      eq(schema.usage.userId, user.userId),
      eq(schema.usage.date, today)
    ))
    .get();

  if (!usageRecord) {
    // 首次使用，创建记录
    usageRecord = await db.insert(schema.usage).values({
      userId: user.userId,
      date: today,
      aiCallCount: 0,
    }).returning().get();
  }

  // 检查是否超限
  if (usageRecord.aiCallCount >= dailyLimit) {
    return c.json({
      error: '今日 AI 分析次数已用完',
      message: `免费用户每天可使用 ${dailyLimit} 次 AI 分析，升级 Pro 版可解锁无限次数！`,
      remaining: 0,
      limit: dailyLimit,
      upgradable: true,
    }, 429);
  }

  // 递增计数
  await db.update(schema.usage)
    .set({ aiCallCount: usageRecord.aiCallCount + 1 })
    .where(and(
      eq(schema.usage.userId, user.userId),
      eq(schema.usage.date, today)
    ));

  // 在响应头中返回剩余次数
  c.header('X-RateLimit-Remaining', String(dailyLimit - usageRecord.aiCallCount - 1));
  c.header('X-RateLimit-Limit', String(dailyLimit));
  c.header('X-User-Plan', plan);

  await next();
}
