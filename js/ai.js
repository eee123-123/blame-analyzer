/* ═══════════════════════════════════════════════
   ai.js — AI 大模型分析引擎
   通过后端 API 代理调用阿里云百炼 DashScope
   ═══════════════════════════════════════════════ */

const API_BASE = 'http://localhost:3000/api';

/**
 * 获取存储的 JWT token
 */
function getToken() {
    return localStorage.getItem('blame_token') || '';
}

/**
 * 构建带鉴权的请求头
 */
function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`,
    };
}

/**
 * 调用 AI 单独生成反击话术
 * @param {string} rawText - 原始聊天记录
 * @param {string} role - 用户角色
 * @param {string} tone - 反击风格
 * @returns {Promise<Object>} 三种风格的反击话术
 */
export async function generateAICounterattacks(rawText, role, tone) {
    const token = getToken();
    if (!token) {
        throw new Error('请先登录后再使用 AI 分析功能');
    }

    const response = await fetch(`${API_BASE}/ai/counterattacks`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ rawText, role, tone }),
    });

    if (response.status === 401) {
        throw new Error('登录已过期，请重新登录');
    }
    if (response.status === 429) {
        const data = await response.json();
        throw new Error(data.message || '今日 AI 分析次数已用完，明天再来吧！');
    }
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `API 调用失败: ${response.status}`);
    }

    const result = await response.json();
    const content = result.content;

    // 解析 JSON
    let jsonStr = content.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();
    const braceStart = jsonStr.indexOf('{');
    const braceEnd = jsonStr.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd !== -1) {
        jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
    }

    try {
        const parsed = JSON.parse(jsonStr);
        return {
            professional: parsed.professional || '暂无高情商版话术',
            savage: parsed.savage || '暂无阴阳怪气版话术',
            diplomatic: parsed.diplomatic || '暂无对事不对人版话术'
        };
    } catch (e) {
        console.error('AI 话术解析失败:', e, '\n原始内容:', content);
        throw new Error('AI 返回内容解析失败，请重试');
    }
}

/**
 * 调用 AI 大模型进行分析（流式）
 * @param {string} rawText - 原始聊天记录
 * @param {string} role - 用户角色
 * @param {string} tone - 反击风格
 * @param {function} onProgress - 流式进度回调
 * @returns {Promise<Object>} 分析结果
 */
export async function analyzeWithAI(rawText, role, tone, onProgress) {
    const token = getToken();
    if (!token) {
        throw new Error('请先登录后再使用 AI 分析功能');
    }

    const response = await fetch(`${API_BASE}/ai/analyze`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ rawText, role, tone }),
    });

    if (response.status === 401) {
        throw new Error('登录已过期，请重新登录');
    }
    if (response.status === 429) {
        const data = await response.json();
        if (data.upgradable) {
            import('./subscription.js').then(m => m.showUpgradePrompt());
        }
        throw new Error(data.message || '今日 AI 分析次数已用完，升级 Pro 版可解锁无限次数！');
    }
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `API 调用失败: ${response.status}`);
    }

    // 处理 SSE 流式响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        throw new Error(parsed.message || 'AI 分析出错');
                    }
                    const content = parsed.choices?.[0]?.delta?.content || '';
                    if (content) {
                        fullContent += content;
                        if (onProgress) {
                            onProgress(fullContent);
                        }
                    }
                } catch (e) {
                    if (e.message && e.message.includes('AI')) throw e;
                    // 忽略其他解析错误
                }
            }
        }
    }

    // 解析 JSON 结果
    return parseAIResponse(fullContent);
}

/**
 * 调用 AI 大模型进行分析（非流式，备用）
 * @param {string} rawText - 原始聊天记录
 * @param {string} role - 用户角色
 * @param {string} tone - 反击风格
 * @returns {Promise<Object>} 分析结果
 */
export async function analyzeWithAINonStream(rawText, role, tone) {
    const token = getToken();
    if (!token) {
        throw new Error('请先登录后再使用 AI 分析功能');
    }

    const response = await fetch(`${API_BASE}/ai/analyze-sync`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ rawText, role, tone }),
    });

    if (response.status === 401) {
        throw new Error('登录已过期，请重新登录');
    }
    if (response.status === 429) {
        const data = await response.json();
        throw new Error(data.message || '今日 AI 分析次数已用完');
    }
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `API 调用失败: ${response.status}`);
    }

    const result = await response.json();
    return parseAIResponse(result.content);
}

/**
 * 解析 AI 返回的内容为结构化对象
 * @param {string} content - AI 返回的文本
 * @returns {Object}
 */
function parseAIResponse(content) {
    // 尝试提取 JSON（可能被 markdown 代码块包裹）
    let jsonStr = content.trim();

    // 移除可能的 markdown 代码块标记
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
    }

    // 尝试直接寻找 JSON 对象
    const braceStart = jsonStr.indexOf('{');
    const braceEnd = jsonStr.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd !== -1) {
        jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
    }

    try {
        const parsed = JSON.parse(jsonStr);
        return normalizeAIResult(parsed);
    } catch (e) {
        console.error('AI 响应解析失败:', e, '\n原始内容:', content);
        throw new Error('AI 返回内容解析失败，请重试');
    }
}

/**
 * 标准化 AI 分析结果，确保字段兼容渲染器
 * @param {Object} raw - 原始 AI 返回的 JSON
 * @returns {Object}
 */
function normalizeAIResult(raw) {

    // 标准化 blameResult
    const blameResult = (raw.blameResult || []).map(item => ({
        speaker: item.speaker || '未知',
        percentage: item.percentage || 0,
        reason: item.reason || '',
        scores: { delay: 0, deflect: 0, blame: 0, total: item.percentage || 0 }
    }));

    // 标准化 keyMessages
    const keyMessages = (raw.keyMessages || []).map(item => ({
        speaker: item.speaker || '',
        time: item.time || '',
        quote: item.quote || '',
        type: item.type || '',
        analysis: item.analysis || '',
        severity: item.severity || 'normal',
        matchedKeywords: []
    }));

    // 标准化 evidences
    const evidences = (raw.evidences || []).map((item, i) => ({
        index: item.index || i + 1,
        time: item.time || '',
        speaker: item.speaker || '',
        quote: item.quote || '',
        type: item.type || '',
        analysis: item.analysis || '',
        severity: item.severity || 'normal',
        severityScore: item.severity === 'critical' ? 30 : item.severity === 'high' ? 20 : 10,
        matchedKeywords: []
    }));

    // 标准化 counterattacks
    const counterattacks = {
        professional: raw.counterattacks?.professional || '暂无高情商版话术',
        savage: raw.counterattacks?.savage || '暂无阴阳怪气版话术',
        diplomatic: raw.counterattacks?.diplomatic || '暂无对事不对人版话术'
    };

    // 标准化 advice
    const advice = (raw.advice || []).map(item => ({
        icon: item.icon || '💡',
        text: item.text || ''
    }));

    return {
        analysis: {
            blameResult,
            evidences,
            keyMessages,
            messageCount: evidences.length + keyMessages.length,
            speakerCount: new Set(blameResult.map(b => b.speaker)).size,
            timeSpan: '',
            selfName: '我',
            summary: raw.summary || ''
        },
        counterattacks,
        advice
    };
}

/**
 * 从历史记录中标准化 AI 结果（导出给 history.js 使用）
 * @param {Object} raw - 原始存储的 JSON
 * @returns {Object}
 */
export function normalizeHistoryResult(raw) {
    return normalizeAIResult(raw);
}
