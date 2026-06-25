import { Hono } from 'hono';
import { createUser, verifyUser, getUserById } from '../services/user.js';
import { generateToken, authMiddleware } from '../middleware/auth.js';
import type { AuthPayload } from '../middleware/auth.js';

const auth = new Hono();

/**
 * POST /api/auth/register — 用户注册
 */
auth.post('/register', async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, nickname } = body;

    // 参数验证
    if (!email || !password || !nickname) {
      return c.json({ error: '邮箱、密码和昵称不能为空' }, 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: '邮箱格式不正确' }, 400);
    }

    if (password.length < 6) {
      return c.json({ error: '密码长度不能少于6位' }, 400);
    }

    if (nickname.length < 1 || nickname.length > 20) {
      return c.json({ error: '昵称长度需在1-20字之间' }, 400);
    }

    const user = await createUser({ email, password, nickname });
    const token = await generateToken({ userId: user.id, email: user.email });

    return c.json({
      message: '注册成功',
      token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
      },
    });
  } catch (error: any) {
    if (error.message === '该邮箱已注册') {
      return c.json({ error: error.message }, 409);
    }
    return c.json({ error: '注册失败，请稍后重试' }, 500);
  }
});

/**
 * POST /api/auth/login — 用户登录
 */
auth.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const { email, password } = body;

    if (!email || !password) {
      return c.json({ error: '邮箱和密码不能为空' }, 400);
    }

    const user = await verifyUser(email, password);
    if (!user) {
      return c.json({ error: '邮箱或密码错误' }, 401);
    }

    const token = await generateToken({ userId: user.id, email: user.email });

    return c.json({
      message: '登录成功',
      token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
      },
    });
  } catch (error) {
    return c.json({ error: '登录失败，请稍后重试' }, 500);
  }
});

/**
 * GET /api/auth/me — 获取当前用户信息
 */
auth.get('/me', authMiddleware, async (c) => {
  const user_payload = (c as any).get('user') as AuthPayload;
  const user = await getUserById(user_payload.userId);

  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }

  return c.json({ user });
});

export default auth;
