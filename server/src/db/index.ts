import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import * as schema from './schema.js';

// 使用绝对路径，确保无论从哪个目录启动，数据库文件始终在同一位置
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../data');
const DB_PATH = resolve(DATA_DIR, 'blame-analyzer.db');

// 确保数据目录存在
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const client = createClient({
  url: `file:${DB_PATH}`,
});

// 创建表（如果不存在）
await client.executeMultiple(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    date TEXT NOT NULL,
    ai_call_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, date)
  );

  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    raw_text TEXT NOT NULL,
    result TEXT NOT NULL,
    summary TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    plan TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    start_date TEXT NOT NULL DEFAULT (datetime('now')),
    end_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    plan TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    pay_method TEXT DEFAULT 'mock',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at TEXT
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    analysis_id INTEGER REFERENCES analyses(id),
    title TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS phrases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    category TEXT NOT NULL,
    scenario TEXT,
    likes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS phrase_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    phrase_id INTEGER NOT NULL REFERENCES phrases(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, phrase_id)
  );

  CREATE TABLE IF NOT EXISTS phrase_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    phrase_id INTEGER NOT NULL REFERENCES phrases(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, phrase_id)
  );
`);

export const db = drizzle(client, { schema });
export { schema };

// ── 种子数据：预置社区话术库 ──
await seedPhrases();

async function seedPhrases() {
  // 检查是否已有话术数据
  const existing = await client.execute('SELECT COUNT(*) as count FROM phrases');
  if ((existing.rows[0] as any).count > 0) return;

  // 确保有一个系统用户用于关联种子话术
  let systemUser = await client.execute("SELECT id FROM users WHERE email = 'system@blame-analyzer.local'");
  let systemUserId: number;

  if (systemUser.rows.length === 0) {
    await client.execute({
      sql: "INSERT INTO users (email, password_hash, nickname, created_at) VALUES (?, ?, ?, datetime('now'))",
      args: ['system@blame-analyzer.local', 'SYSTEM_NO_LOGIN', '话术库官方'],
    });
    const result = await client.execute("SELECT id FROM users WHERE email = 'system@blame-analyzer.local'");
    systemUserId = (result.rows[0] as any).id;
  } else {
    systemUserId = (systemUser.rows[0] as any).id;
  }

  // 预置话术数据
  const seedData = [
    // ── 转移话题 (deflect) ──
    { content: '这个问题我们可以会后单独对齐，现在先聚焦主线进度，大家时间都很宝贵。', category: 'deflect', scenario: '会议中被突然追问非你负责的问题', likes: 12 },
    { content: '这块我理解需要跟XX团队确认，我先记下来，会后拉个对齐会议怎么样？', category: 'deflect', scenario: '被问到跨团队边界模糊的问题', likes: 8 },
    { content: '关于这个点，我建议我们看一下当时的邮件记录，用事实说话比较好。', category: 'deflect', scenario: '对方在会议上试图口头定锅', likes: 15 },
    { content: '这个话题展开比较大，要不我们先完成今天的议程，这个我拉个专项讨论？', category: 'deflect', scenario: '复盘会上被带节奏偏离主题', likes: 6 },
    { content: '我觉得与其讨论是谁的问题，不如我们先对齐一下接下来怎么补救，时间不等人。', category: 'deflect', scenario: '甩锅大战即将爆发时的破局', likes: 20 },

    // ── 反击回怼 (counter) ──
    { content: '你说「接口周三就给了」，但我翻了一下记录，周三给的是文档，实际可调用的接口是周五下午才部署的，中间两天我们在等什么呢？', category: 'counter', scenario: '后端声称早就给了接口但实际延迟', likes: 25 },
    { content: '你提到「需求很清楚」，但从聊天记录看，6月3日你还在问「这个交互是要弹窗还是toast？」——如果需求很清楚，为什么还需要确认呢？', category: 'counter', scenario: '产品经理说需求文档很清楚', likes: 18 },
    { content: '我注意到你说「我一直在推进」，但从6月1日到6月8日的消息记录里，这7天你没有一条进度更新，「一直在推进」具体是指哪些动作呢？', category: 'counter', scenario: '对方声称一直在努力但无产出', likes: 22 },
    { content: '你说「上周就跟你说过了」，不过我翻了所有的聊天群和私聊，没找到相关消息，方便截图给大家看一下是在哪里说的吗？', category: 'counter', scenario: '对方声称通知过你但查无此事', likes: 30 },
    { content: '「来不及」是结果，不是原因。我想了解的是：排期是什么时候确认的，中间有没有风险预警，为什么到截止日才说来不及？', category: 'counter', scenario: '对方只说来不及但不解释原因', likes: 16 },

    // ── 澄清甩锅 (clarify) ──
    { content: '我梳理一下时间线：6月1日我提交了设计稿，6月3日你确认了，6月5日提了新需求变更，6月8日又说原来的方案有问题——所以延期的根因是变更，不是设计稿晚了。', category: 'clarify', scenario: '被指设计稿交付晚导致项目延期', likes: 28 },
    { content: '这个bug的根因我已经定位了，是上游数据接口返回格式变了，我们没有收到变更通知。附上接口对比截图，麻烦确认一下是不是没有走变更流程。', category: 'clarify', scenario: '线上bug被归咎于你的代码', likes: 14 },
    { content: '我整理了一下完整的沟通记录：我在6月2日、4日、6日分别@了你三次确认排期，前两次没有回复，第三次回复「下周看看」。所以不存在「我没有提前沟通」的情况。', category: 'clarify', scenario: '被指沟通不到位导致信息差', likes: 19 },
    { content: '关于「测试不充分」这个点：我们的测试用例覆盖了PRD里的全部场景（附用例清单），这个线上问题是PRD没有覆盖的边界情况，严格来说是需求遗漏，不是测试遗漏。', category: 'clarify', scenario: 'QA被指测试不充分', likes: 11 },
    { content: '让我还原一下决策过程：当时的方案是大家一起评审通过的（附会议纪要截图），不是我单方面决定的。如果方案有问题，是不是评审环节就应该提出来？', category: 'clarify', scenario: '方案出问题后被说成是你一个人的决策', likes: 24 },

    // ── 升级处理 (escalate) ──
    { content: '这个问题我和XX同学已经讨论了三轮但没有达成共识，为了不影响项目进度，建议升级到leader层面决策，大家看怎么安排？', category: 'escalate', scenario: '两个平级同事互相推诿无法解决', likes: 9 },
    { content: '我建议这个争议我们不要在群里继续讨论了，各方把自己的时间线和证据整理成文档，约一个正式的复盘会议，让相关领导也参与进来，这样更公正。', category: 'escalate', scenario: '群里互怼已经失控', likes: 13 },
    { content: '这已经是第二次出现同样的问题了，上次的改进措施似乎没有落地。我建议我们把这个问题升级为流程问题，推动建立SOP，避免后续再扯皮。', category: 'escalate', scenario: '同样的甩锅问题反复出现', likes: 17 },
    { content: '目前这个方案分歧比较大，我的建议是：各自用数据和事实写一页纸的对比分析，下周一评审会上让技术委员会来拍板，怎么样？', category: 'escalate', scenario: '技术方案僵持不下', likes: 7 },
    { content: '既然双方对责任认定有分歧，我建议请项目PMO介入做一次客观复盘，用项目管理工具的实际数据来定位问题，这样对双方都公平。', category: 'escalate', scenario: '责任界定有争议需要第三方介入', likes: 10 },
  ];

  // 批量插入
  for (const phrase of seedData) {
    await client.execute({
      sql: "INSERT INTO phrases (user_id, content, category, scenario, likes, status, created_at) VALUES (?, ?, ?, ?, ?, 'published', datetime('now'))",
      args: [systemUserId, phrase.content, phrase.category, phrase.scenario, phrase.likes],
    });
  }

  console.log(`✅ 已预置 ${seedData.length} 条社区话术`);
}
