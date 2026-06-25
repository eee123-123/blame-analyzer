import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 3000,
  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY || '',
    baseUrl: process.env.AI_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: process.env.AI_MODEL || 'qwen-plus',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: '7d',
  },
  rateLimit: {
    freeDailyAiLimit: Number(process.env.FREE_DAILY_AI_LIMIT) || 3,
    proDailyAiLimit: -1,  // -1 表示无限
    teamDailyAiLimit: -1,
  },
  plans: {
    free: { price: 0, name: '免费版', aiLimit: Number(process.env.FREE_DAILY_AI_LIMIT) || 3 },
    pro:  { price: 1990, name: 'Pro 版', aiLimit: -1 },
    team: { price: 9900, name: '团队版', aiLimit: -1 },
  },
};
