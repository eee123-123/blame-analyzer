import { Context, Next } from 'hono';
import * as jose from 'jose';
import { config } from '../config.js';

export interface AuthPayload {
  userId: number;
  email: string;
}

/**
 * JWT 鉴权中间件
 * 从 Authorization header 中解析 Bearer token
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: '未登录，请先登录' }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const secret = new TextEncoder().encode(config.jwt.secret);
    const { payload } = await jose.jwtVerify(token, secret);

    // 将用户信息注入 context
    (c as any).set('user', {
      userId: payload.userId as number,
      email: payload.email as string,
    });

    await next();
  } catch (error) {
    return c.json({ error: '登录已过期，请重新登录' }, 401);
  }
}

/**
 * 生成 JWT Token
 */
export async function generateToken(payload: AuthPayload): Promise<string> {
  const secret = new TextEncoder().encode(config.jwt.secret);

  const token = await new jose.SignJWT({ userId: payload.userId, email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.jwt.expiresIn)
    .sign(secret);

  return token;
}
