/* ═══════════════════════════════════════════════
   parser.js — 多格式聊天记录解析引擎
   ═══════════════════════════════════════════════ */

/**
 * 解析聊天记录为统一消息格式
 * 支持格式：
 *   [time] speaker: text
 *   time speaker: text
 *   speaker: text
 *   邮件线程序列
 *   会议纪要
 *
 * @param {string} raw - 原始文本
 * @returns {Array<{time: string, speaker: string, text: string}>}
 */
export function parseChatMessages(raw) {
    const lines = raw.split('\n').filter(line => line.trim());
    const messages = [];

    // 检测邮件格式
    const isEmailFormat = raw.includes('发件人：') && raw.includes('主题：');
    if (isEmailFormat) {
        return parseEmailThread(raw);
    }

    // 检测会议纪要格式
    const isMeetingFormat = raw.includes('会议纪要') || raw.includes('参会人');

    // 聊天消息匹配模式
    const patterns = [
        /^\[([^\]]+)\]\s*([^：:]+)[：:]\s*(.+)$/,
        /^(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2})\s+([^：:]+)[：:]\s*(.+)$/,
        /^([^：:]{1,20})[：:]\s*(.+)$/
    ];

    // 会议纪元的元数据行（跳过）
    const meetingMetaPatterns = [
        /^会议纪要/, /^主题[：:]/, /^参会人[：:]/, /^时间[：:]/,
        /^地点[：:]/, /^---/, /^—/
    ];

    for (const line of lines) {
        // 跳过会议元数据
        if (isMeetingFormat && meetingMetaPatterns.some(p => p.test(line.trim()))) {
            continue;
        }

        let matched = false;
        for (const pattern of patterns) {
            const match = line.match(pattern);
            if (match) {
                if (match.length === 4) {
                    messages.push({
                        time: match[1].trim(),
                        speaker: match[2].trim(),
                        text: match[3].trim()
                    });
                } else if (match.length === 3) {
                    messages.push({
                        time: '',
                        speaker: match[1].trim(),
                        text: match[2].trim()
                    });
                }
                matched = true;
                break;
            }
        }
        // 未匹配的行追加到上一条消息
        if (!matched && messages.length > 0) {
            messages[messages.length - 1].text += ' ' + line.trim();
        }
    }
    return messages;
}

/**
 * 解析邮件线程序列
 * @param {string} raw
 * @returns {Array<{time: string, speaker: string, text: string}>}
 */
function parseEmailThread(raw) {
    const messages = [];
    const blocks = raw.split(/\n---\n|\n-{3,}\n/);

    for (const block of blocks) {
        const lines = block.trim().split('\n').filter(l => l.trim());
        if (lines.length === 0) continue;

        let sender = '';
        let time = '';
        const textParts = [];

        for (const line of lines) {
            const senderMatch = line.match(/^发件人[：:]\s*(.+)$/);
            const timeMatch = line.match(/^时间[：:]\s*(.+)$/);
            const skipMatch = line.match(/^(收件人|抄送|主题|回复\d*)[：:]/);

            if (senderMatch) {
                sender = senderMatch[1].trim();
            } else if (timeMatch) {
                time = timeMatch[1].trim();
            } else if (skipMatch) {
                // skip metadata
            } else if (sender) {
                textParts.push(line.trim());
            }
        }

        const fullText = textParts.join(' ').trim();
        if (sender && fullText) {
            messages.push({ time, speaker: sender, text: fullText });
        }
    }
    return messages;
}

/**
 * 识别"我"的身份
 * @param {Array<{speaker: string}>} messages
 * @returns {string}
 */
export function identifySelf(messages) {
    const role = document.getElementById('roleSelect').value;
    const selfKeywords = ['我', '我（', '我('];
    for (const msg of messages) {
        for (const kw of selfKeywords) {
            if (msg.speaker.includes(kw)) return msg.speaker;
        }
    }
    return '我';
}