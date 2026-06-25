/* ═══════════════════════════════════════════════
   analyzer.js — 甩锅分析引擎
   ═══════════════════════════════════════════════ */

import { calcTimeSpan } from './utils.js';

/**
 * 甩锅信号关键词词典
 */
const BLAME_SIGNALS = {
    delay: [
        '出不了', '还没', '来不及', '明天', '明天改', '赶不上', '等一下',
        '延后', '搞不定', '排不上', '下周才能', '还没回复', '修复中',
        '抱歉刚看到', '没来得及', '晚了', '延迟', '延期', '超时'
    ],
    promise: [
        '今天出', '尽快', '马上', '这两天', '先用着', '基本OK', '一定给',
        '今天内给', '全力配合', '没问题'
    ],
    deflect: [
        '你先', '别block', '你们自己', '前端慢', '设计慢', '技术慢',
        '进度慢了', '你加加班', '你配合', '你们没看', '又不是我', '你应该',
        '不能全怪', '不是我们的问题', '就看贵方', '你们想办法', '技术应该',
        '不在合同范围', '你们自己评估', '版本差异'
    ],
    blame: [
        '为什么没', '谁来说一下', '上不了线', '我周三就给了', '给了你了',
        '我已经', '又不是我', '按流程', '发过通知', '公告了', '确认过的',
        '验收通过', '我们这边OK', '测试为什么没测出', '不影响上线',
        '评估不准确', '差点意思', '谁负责', '谁验收的', '你们答应',
        '不能全怪到我'
    ],
    frustration: [
        '？？？', '...', '等于重做', '我进度慢了？', '说过', '当时就说',
        '白做', '凌晨2点', '聊天记录都在', '邮件记录都在', '又是升级', '浪费了'
    ]
};

/**
 * 分析聊天记录，返回责任归属
 * @param {Array<{time: string, speaker: string, text: string}>} messages
 * @returns {Object}
 */
export function analyzeBlame(messages) {
    const selfName = identifySelf(messages);
    const speakers = [...new Set(messages.map(m => m.speaker))];
    const speakerScores = {};
    const evidences = [];

    // 初始化每个说话人的分数
    for (const speaker of speakers) {
        speakerScores[speaker] = { delay: 0, deflect: 0, blame: 0, total: 0 };
    }

    // 遍历每条消息，检测甩锅信号
    messages.forEach((msg) => {
        const { speaker, text, time } = msg;
        let isEvidence = false;
        let evidenceType = '';
        let analysisText = '';
        let severityScore = 0;
        const matchedKeywords = [];

        // 检测延误信号
        for (const keyword of BLAME_SIGNALS.delay) {
            if (text.includes(keyword)) {
                if (!speaker.includes('我')) {
                    speakerScores[speaker].delay += 15;
                    speakerScores[speaker].total += 15;
                }
                isEvidence = true;
                evidenceType = '延误';
                analysisText = `→ 出现延误信号"${keyword}"，导致下游 block`;
                severityScore += 15;
                matchedKeywords.push(keyword);
            }
        }

        // 检测推诿信号
        for (const keyword of BLAME_SIGNALS.deflect) {
            if (text.includes(keyword)) {
                if (!speaker.includes('我')) {
                    speakerScores[speaker].deflect += 20;
                    speakerScores[speaker].total += 20;
                }
                isEvidence = true;
                evidenceType = '推诿';
                analysisText = `→ 转移责任信号"${keyword}"，将压力推给他人`;
                severityScore += 20;
                matchedKeywords.push(keyword);
            }
        }

        // 检测甩锅信号
        for (const keyword of BLAME_SIGNALS.blame) {
            if (text.includes(keyword)) {
                if (!speaker.includes('我')) {
                    speakerScores[speaker].blame += 25;
                    speakerScores[speaker].total += 25;
                }
                isEvidence = true;
                evidenceType = '⚠️ 甩锅';
                analysisText = `→ 甩锅行为！使用"${keyword}"企图转嫁责任`;
                severityScore += 25;
                matchedKeywords.push(keyword);
            }
        }

        // 检测不满信号（来自"我"的消息）
        for (const keyword of BLAME_SIGNALS.frustration) {
            if (text.includes(keyword) && speaker.includes('我')) {
                isEvidence = true;
                evidenceType = '反驳';
                analysisText = `→ 你对此表达了明确的不认同`;
                severityScore += 10;
                matchedKeywords.push(keyword);
            }
        }

        // 确定严重程度
        let severity = 'normal';
        if (severityScore >= 25) severity = 'critical';
        else if (severityScore >= 15) severity = 'high';

        if (isEvidence) {
            evidences.push({
                index: evidences.length + 1,
                time,
                speaker,
                quote: text,
                type: evidenceType,
                analysis: analysisText,
                severity,
                severityScore,
                matchedKeywords
            });
        }
    });

    // 计算百分比
    const totalScore = Object.values(speakerScores).reduce((sum, s) => sum + s.total, 0) || 1;
    const blameResult = [];
    for (const [speaker, scores] of Object.entries(speakerScores)) {
        const pct = Math.round((scores.total / totalScore) * 100);
        if (pct > 0) {
            blameResult.push({ speaker, percentage: pct, scores });
        }
    }
    blameResult.sort((a, b) => b.percentage - a.percentage);

    // 确保"我"有最小占比
    const selfInResult = blameResult.find(r => r.speaker.includes('我'));
    if (!selfInResult && blameResult.length > 0) {
        const selfPct = Math.min(10, Math.max(5, 100 - blameResult.reduce((s, r) => s + r.percentage, 0)));
        blameResult.push({
            speaker: selfName,
            percentage: selfPct,
            scores: { delay: 0, deflect: 0, blame: 0, total: 0 }
        });
        const sum = blameResult.reduce((s, r) => s + r.percentage, 0);
        blameResult.forEach(r => r.percentage = Math.round((r.percentage / sum) * 100));
    }

    return {
        blameResult,
        evidences: evidences.slice(0, 8),
        keyMessages: evidences
            .filter(e => e.severity === 'critical' || e.type.includes('甩锅'))
            .sort((a, b) => b.severityScore - a.severityScore)
            .slice(0, 3),
        messageCount: messages.length,
        speakerCount: speakers.length,
        timeSpan: calcTimeSpan(messages),
        selfName
    };
}

/**
 * 生成三种风格的反击话术
 * @param {Object} analysis
 * @returns {Object}
 */
export function generateCounterattacks(analysis) {
    const { evidences, keyMessages } = analysis;
    const criticalQuotes = (keyMessages.length > 0 ? keyMessages : evidences)
        .filter(e => e.type.includes('甩锅') || e.type === '延误')
        .slice(0, 3);

    const timeRefs = criticalQuotes.map(e => e.time ? `（${e.time}）` : '').filter(Boolean).join('、');
    const directQuotes = criticalQuotes.map(e => `"${e.speaker}：${e.quote}"`).join('；');

    return {
        professional: `梳理一下时间线：${timeRefs ? '从记录来看' + timeRefs + '，' : ''}存在多处交付延误和变更，导致下游工作受阻。具体来说：${criticalQuotes.map((e, i) => `${i + 1}) ${e.analysis.replace('→ ', '')}`).join('；')}。原话记录如下：${directQuotes}。建议我们复盘一下协作流程，明确各环节交付标准和响应时效，下次可以更顺畅 🙏`,
        savage: `来来来，帮大家回忆一下原话～ ${criticalQuotes.map(e => `${e.time ? e.time + ' ' : ''}${e.speaker}的原话是 "${e.quote}"${e.type.includes('甩锅') ? '——这就是所谓的"没问题"？😊' : ''}`).join('。')} 记录都在群里，白纸黑字，欢迎逐条对照～ 与其讨论"谁慢了"，不如看看"谁的承诺兑现了"，以及"谁在最后时刻改口" 🫡`,
        diplomatic: `这次的核心问题不在于某个人慢了，而是协作链路中存在几个结构性问题：${criticalQuotes.map((e, i) => `${i + 1}) ${e.analysis.replace('→ ', '')}`).join('；')}。关键记录摘要：${directQuotes}。建议我们建立几个改进机制：① 依赖交付需明确 freeze 节点 ② 阻塞问题需在4小时内响应 ③ 增加每日站会同步风险点。这样对大家都好。`
    };
}

/**
 * 生成改进建议
 * @returns {Array<{icon: string, text: string}>}
 */
export function generateAdvice() {
    return [
        { icon: '📌', text: '关键对话后，在群里用文字确认结论（如："确认一下，接口周三 freeze，对吧？"），形成可追溯的书面记录' },
        { icon: '⏰', text: '对方承诺交付但未兑现时，及时在群里 @提醒并抄送上级，避免口头催促无记录' },
        { icon: '🚩', text: '发现风险第一时间 escalate，不要默默等待——沉默 = 默认没问题' },
        { icon: '📊', text: '复杂项目建议使用甘特图或看板同步进度，让所有人的状态透明可见' },
        { icon: '🤝', text: '遇到甩锅时保持冷静，先摆事实（时间+原文引用），再讲逻辑，最后提改进建议' }
    ];
}

/**
 * 从消息中识别"我"（从 DOM 读取角色配置）
 */
function identifySelf(messages) {
    const selfKeywords = ['我', '我（', '我('];
    for (const msg of messages) {
        for (const kw of selfKeywords) {
            if (msg.speaker.includes(kw)) return msg.speaker;
        }
    }
    return '我';
}