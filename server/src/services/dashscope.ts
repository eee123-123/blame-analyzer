import { config } from '../config.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | VLContent[];
}

interface VLContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

interface DashScopeOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

/**
 * 调用 DashScope API（非流式）
 */
export async function callDashScope(options: DashScopeOptions): Promise<string> {
  const { messages, temperature = 0.7, maxTokens = 4000 } = options;

  const response = await fetch(`${config.dashscope.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.dashscope.apiKey}`,
    },
    body: JSON.stringify({
      model: config.dashscope.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as Record<string, any>;
    throw new Error(`DashScope API error: ${response.status} ${errorData.error?.message || response.statusText}`);
  }

  const result = await response.json() as any;
  return result.choices?.[0]?.message?.content || '';
}

/**
 * 调用 DashScope API（流式），返回 ReadableStream
 */
export function callDashScopeStream(options: DashScopeOptions): ReadableStream {
  const { messages, temperature = 0.7, maxTokens = 4000 } = options;

  return new ReadableStream({
    async start(controller) {
      try {
        const response = await fetch(`${config.dashscope.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.dashscope.apiKey}`,
          },
          body: JSON.stringify({
            model: config.dashscope.model,
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: true,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as Record<string, any>;
          controller.enqueue(`data: ${JSON.stringify({ error: true, message: `API error: ${response.status} ${errorData.error?.message || response.statusText}` })}\n\n`);
          controller.close();
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          // 直接转发 SSE 数据
          controller.enqueue(chunk);
        }

        controller.close();
      } catch (error: any) {
        controller.enqueue(`data: ${JSON.stringify({ error: true, message: error.message })}\n\n`);
        controller.close();
      }
    },
  });
}

/**
 * 构建分析 Prompt
 */
export function buildAnalysisPrompt(rawText: string, role: string, tone: string): ChatMessage[] {
  const toneMap: Record<string, string> = {
    all: '高情商版、阴阳怪气版、对事不对人版（三种都要）',
    professional: '高情商版（职场高情商，以事实和改进建议为核心）',
    savage: '阴阳怪气版（直接引用对方原话，讽刺语气，但不失体面）',
    diplomatic: '对事不对人版（聚焦流程改进，不针对个人）',
  };

  const roleDesc = role === 'auto' ? '根据聊天记录中"我"的身份自动识别' : role;
  const toneDesc = toneMap[tone] || toneMap.all;

  const userPrompt = `你是一位职场沟通分析专家，擅长从聊天记录中分析责任归属、甩锅行为，并帮助用户生成有理有据的反击话术。

## 任务
请分析以下聊天记录/邮件/会议纪要，完成以下分析：

## 分析要求
1. **责任归属判定**：量化分析各方的责任占比（百分比），识别主要责任方
2. **关键甩锅消息**：找出最致命的2-3条消息，说明为何它们构成甩锅/推诿/延误证据
3. **证据链构建**：按时间线整理关键证据，标注每条证据的类型（延误/推诿/甩锅/承诺未兑现）和严重程度
4. **反击话术生成**：生成${toneDesc}的反击话术，要求引用对方原话，有理有据
5. **改进建议**：给出3-5条针对性的改进建议

## 我的角色
${roleDesc}

## 聊天记录
${rawText}

## 输出格式（严格按照以下 JSON 格式返回）
请返回一个 JSON 对象，格式如下：
\`\`\`json
{
  "blameResult": [
    {"speaker": "姓名", "percentage": 数字, "reason": "原因简述"}
  ],
  "keyMessages": [
    {
      "speaker": "发言人",
      "time": "时间（如有）",
      "quote": "原文引用",
      "type": "延误/推诿/甩锅/承诺未兑现",
      "analysis": "为什么这条消息是关键证据",
      "severity": "critical/high/normal"
    }
  ],
  "evidences": [
    {
      "index": 序号,
      "time": "时间",
      "speaker": "发言人",
      "quote": "原文",
      "type": "类型",
      "analysis": "分析说明",
      "severity": "critical/high/normal"
    }
  ],
  "counterattacks": {
    "professional": "高情商版反击话术（完整段落）",
    "savage": "阴阳怪气版反击话术（完整段落）",
    "diplomatic": "对事不对人版反击话术（完整段落）"
  },
  "advice": [
    {"icon": "emoji", "text": "建议内容"}
  ],
  "summary": "一句话总结：谁该为这次问题负主要责任，以及核心原因"
}
\`\`\`

注意：
- 责任百分比之和应为100%
- 引用原话时使用中文引号「」
- 反击话术要自然流畅、可以直接复制使用
- 证据按严重程度排序
- 只返回 JSON，不要返回其他内容`;

  return [
    {
      role: 'system',
      content: '你是一位职场沟通分析专家。请严格按照用户要求的 JSON 格式返回结果，不要包含 markdown 代码块标记，直接返回 JSON。',
    },
    {
      role: 'user',
      content: userPrompt,
    },
  ];
}

/**
 * 调用 DashScope 多模态模型（qwen-vl）进行图片 OCR 识别
 */
export async function callDashScopeVL(imageBase64: string, prompt: string = '请将这张图片中的所有文字内容提取出来，保持原始格式和换行。只输出文字内容，不要额外解释。'): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${imageBase64}` },
        },
        {
          type: 'text',
          text: prompt,
        },
      ],
    },
  ];

  const vlModel = process.env.VL_MODEL || 'qwen-vl-plus';

  const response = await fetch(`${config.dashscope.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.dashscope.apiKey}`,
    },
    body: JSON.stringify({
      model: vlModel,
      messages,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as Record<string, any>;
    throw new Error(`DashScope VL API error: ${response.status} ${errorData.error?.message || response.statusText}`);
  }

  const result = await response.json() as any;
  return result.choices?.[0]?.message?.content || '';
}

/**
 * 构建反击话术生成 Prompt
 */
export function buildCounterattackPrompt(rawText: string, role: string, tone: string): ChatMessage[] {
  const toneMap: Record<string, string> = {
    all: '高情商版、阴阳怪气版、对事不对人版（三种都要）',
    professional: '高情商版（职场高情商，以事实和改进建议为核心）',
    savage: '阴阳怪气版（直接引用对方原话，讽刺语气，但不失体面）',
    diplomatic: '对事不对人版（聚焦流程改进，不针对个人）',
  };

  const roleDesc = role === 'auto' ? '根据聊天记录中"我"的身份自动识别' : role;
  const toneDesc = toneMap[tone] || toneMap.all;

  const prompt = `你是一位职场沟通专家，擅长帮助职场人生成有理有据的反击话术。

## 任务
根据以下聊天记录，帮我生成${toneDesc}的反击话术。

## 我的角色
${roleDesc}

## 聊天记录
${rawText}

## 要求
1. 必须引用对方的原话（用「」包裹），让反击有理有据
2. 整理清楚时间线，用时间节点证明问题不在"我"
3. 语气自然流畅，可以直接复制粘贴到群里使用
4. 每种风格 150-300 字，不要太短也不要太长
5. 结尾可以带一句建设性建议，体现专业度

## 输出格式（严格 JSON）
\`\`\`json
{
  "professional": "高情商版反击话术（完整段落，可直接复制使用）",
  "savage": "阴阳怪气版反击话术（完整段落）",
  "diplomatic": "对事不对人版反击话术（完整段落）"
}
\`\`\`
只返回 JSON，不要返回其他内容。`;

  return [
    {
      role: 'system',
      content: '你是一位职场沟通专家，擅长生成有理有据的反击话术。请严格按照用户要求的 JSON 格式返回结果，不要包含 markdown 代码块标记，直接返回 JSON。',
    },
    {
      role: 'user',
      content: prompt,
    },
  ];
}

/**
 * 构建多轮追问 Prompt
 * 将对话历史 + 原始分析上下文拼接为多轮消息
 */
export function buildFollowUpPrompt(
  conversationHistory: { role: string; content: string }[],
  userQuestion: string,
  analysisContext?: string
): ChatMessage[] {
  const systemPrompt = `你是一位职场沟通分析专家。用户之前让你分析了一段职场沟通记录，现在在基于分析结果进行追问。
请基于之前的分析上下文和对话历史来回答用户的问题。
回答要求：
1. 回答应该专业、有建设性
2. 如果用户要求生成话术，给出可直接复制使用的版本
3. 保持上下文连贯，引用之前的分析结果
4. 语言自然、口语化，避免太生硬
5. 每次回答控制在 500 字以内`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // 添加原始分析上下文（如果有）
  if (analysisContext) {
    messages.push({
      role: 'user',
      content: `以下是之前的分析结果摘要：\n${analysisContext}`,
    });
    messages.push({
      role: 'assistant',
      content: '好的，我已经了解了之前的分析情况。请问你还有什么想了解的？',
    });
  }

  // 添加对话历史（最近 10 轮）
  const recentHistory = conversationHistory.slice(-20);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  // 添加当前追问
  messages.push({
    role: 'user',
    content: userQuestion,
  });

  return messages;
}
