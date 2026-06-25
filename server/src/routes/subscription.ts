import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { config } from '../config.js';
import {
  getUserSubscription,
  getUserPlan,
  createSubscription,
  cancelSubscription,
  type PlanType,
} from '../services/subscription.js';

const subscription = new Hono();

/**
 * GET /api/subscription/plans — 获取所有套餐详情（无需鉴权）
 */
subscription.get('/plans', (c) => {
  const plans = Object.entries(config.plans).map(([key, value]) => ({
    id: key,
    name: value.name,
    price: value.price,
    priceDisplay: value.price === 0 ? '免费' : `¥${(value.price / 100).toFixed(1)}/月`,
    aiLimit: value.aiLimit,
    features: getPlanFeatures(key as PlanType),
  }));

  return c.json({ plans });
});

// 以下路由需要鉴权
subscription.use('/*', authMiddleware);

/**
 * GET /api/subscription — 获取当前用户订阅信息
 */
subscription.get('/', async (c) => {
  try {
    const user = (c as any).get('user');
    const sub = await getUserSubscription(user.userId);
    const plan = await getUserPlan(user.userId);

    return c.json({
      currentPlan: plan,
      subscription: sub,
      planConfig: config.plans[plan],
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /api/subscription/subscribe — 创建订阅（mock 支付直接成功）
 */
subscription.post('/subscribe', async (c) => {
  try {
    const user = (c as any).get('user');
    const body = await c.req.json();
    const { plan } = body;

    if (!plan || !['pro', 'team'].includes(plan)) {
      return c.json({ error: '请选择有效的套餐（pro 或 team）' }, 400);
    }

    const result = await createSubscription(user.userId, plan as PlanType);

    return c.json({
      message: `已成功订阅${config.plans[plan as PlanType].name}！`,
      ...result,
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * POST /api/subscription/cancel — 取消订阅
 */
subscription.post('/cancel', async (c) => {
  try {
    const user = (c as any).get('user');
    const result = await cancelSubscription(user.userId);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * 获取套餐特性列表
 */
function getPlanFeatures(plan: PlanType): string[] {
  switch (plan) {
    case 'free':
      return ['本地分析不限次', 'AI 分析 3 次/天', '基础导出'];
    case 'pro':
      return ['AI 分析无限次', '历史记录永久保存', '导出 PDF/图片', '多轮追问对话', '自定义词库', '数据看板'];
    case 'team':
      return ['Pro 版全部功能', '多人协作', '团队统计', 'API 接口', 'Bot 集成', '优先客服'];
    default:
      return [];
  }
}

export default subscription;
