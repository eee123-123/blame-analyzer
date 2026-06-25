import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export interface CreateUserInput {
  email: string;
  password: string;
  nickname: string;
}

export interface UserInfo {
  id: number;
  email: string;
  nickname: string;
  createdAt: string;
}

/**
 * 创建新用户
 */
export async function createUser(input: CreateUserInput): Promise<UserInfo> {
  const { email, password, nickname } = input;

  // 检查邮箱是否已存在
  const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (existing) {
    throw new Error('该邮箱已注册');
  }

  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);

  const result = await db.insert(schema.users).values({
    email,
    passwordHash,
    nickname,
    createdAt: new Date().toISOString(),
  }).returning().get();

  return {
    id: result.id,
    email: result.email,
    nickname: result.nickname,
    createdAt: result.createdAt,
  };
}

/**
 * 验证用户登录
 */
export async function verifyUser(email: string, password: string): Promise<UserInfo | null> {
  const user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (!user) return null;

  const valid = bcrypt.compareSync(password, user.passwordHash);
  if (!valid) return null;

  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    createdAt: user.createdAt,
  };
}

/**
 * 根据 ID 获取用户信息
 */
export async function getUserById(id: number): Promise<UserInfo | null> {
  const user = await db.select().from(schema.users).where(eq(schema.users.id, id)).get();
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    createdAt: user.createdAt,
  };
}
