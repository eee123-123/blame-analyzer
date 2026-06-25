import { db, schema } from '../db/index.js';
import { eq, and, desc } from 'drizzle-orm';
import { config } from '../config.js';

export type PlanType = 'free' | 'pro' | 'team';

/**
 * 获取用户当前有效订阅计划
 */
export async function getUserPlan(userId: number): Promise<PlanType> {
  const sub = await db
    .select()
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.userId, userId),
        eq(schema.subscriptions.status, 'active')
      )
    )
    .orderBy(desc(schema.subscriptions.createdAt))
    .get();

  if (!sub) return 'free';

  // 检查是否过期
  if (sub.endDate) {
    const now = new Date();
    const end = new Date(sub.endDate);
    if (now > end) {
      // 标记过期
      await db.update(schema.subscriptions)
        .set({ status: 'expired' })
        .where(eq(schema.subscriptions.id, sub.id));
      return 'free';
    }
  }

  return sub.plan as PlanType;
}

/**
 * 获取用户订阅详情
 */
export async function getUserSubscription(userId: number) {
  const sub = await db
    .select()
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.userId, userId),
        eq(schema.subscriptions.status, 'active')
      )
    )
    .orderBy(desc(schema.subscriptions.createdAt))
    .get();

  if (!sub) {
    return { plan: 'free', status: 'active', startDate: null, endDate: null };
  }

  // 检查过期
  if (sub.endDate && new Date() > new Date(sub.endDate)) {
    await db.update(schema.subscriptions)
      .set({ status: 'expired' })
      .where(eq(schema.subscriptions.id, sub.id));
    return { plan: 'free', status: 'active', startDate: null, endDate: null };
  }

  return sub;
}

/**
 * 创建/升级订阅（mock 支付 — 直接成功）
 */
export async function createSubscription(userId: number, plan: PlanType) {
  if (plan === 'free') {
    throw new Error('免费版无需订阅');
  }

  const planConfig = config.plans[plan];
  if (!planConfig) {
    throw new Error('无效的套餐类型');
  }

  // 取消当前活跃订阅
  await db.update(schema.subscriptions)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(schema.subscriptions.userId, userId),
        eq(schema.subscriptions.status, 'active')
      )
    );

  // 计算到期时间（30天后）
  const startDate = new Date().toISOString();
  const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // 创建订单（mock 直接成功）
  const order = await db.insert(schema.orders).values({
    userId,
    plan,
    amount: planConfig.price,
    status: 'paid',
    payMethod: 'mock',
    paidAt: new Date().toISOString(),
  }).returning().get();

  // 创建订阅
  const subscription = await db.insert(schema.subscriptions).values({
    userId,
    plan,
    status: 'active',
    startDate,
    endDate,
  }).returning().get();

  return { subscription, order };
}

/**
 * 取消订阅（到期后失效，不立即终止）
 */
export async function cancelSubscription(userId: number) {
  const sub = await db
    .select()
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.userId, userId),
        eq(schema.subscriptions.status, 'active')
      )
    )
    .get();

  if (!sub || sub.plan === 'free') {
    throw new Error('当前没有可取消的订阅');
  }

  await db.update(schema.subscriptions)
    .set({ status: 'cancelled' })
    .where(eq(schema.subscriptions.id, sub.id));

  return { message: '订阅已取消，当前套餐将在到期后失效' };
}

/**
 * 获取用户每日 AI 调用限额
 */
export async function getDailyAiLimit(userId: number): Promise<number> {
  const plan = await getUserPlan(userId);
  switch (plan) {
    case 'pro': return config.rateLimit.proDailyAiLimit;
    case 'team': return config.rateLimit.teamDailyAiLimit;
    default: return config.rateLimit.freeDailyAiLimit;
  }
}
