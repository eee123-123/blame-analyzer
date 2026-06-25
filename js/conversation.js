/* ═══════════════════════════════════════════════
   conversation.js — 多轮追问对话模块
   支持基于分析结果的追问对话
   ═══════════════════════════════════════════════ */

const API_BASE = 'http://localhost:3000/api';

function getToken() {
    return localStorage.getItem('blame_token') || '';
}

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`,
    };
}

let currentConversationId = null;

/**
 * 从分析结果发起追问对话
 */
export async function startConversation(analysisId) {
    try {
        const response = await fetch(`${API_BASE}/conversation`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ analysisId, title: '基于分析结果的追问' }),
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || '创建对话失败');
        }

        const conv = await response.json();
        currentConversationId = conv.id;
        renderChatPanel(conv.id);
        return conv;
    } catch (error) {
        alert('创建对话失败：' + error.message);
    }
}

/**
 * 发送追问消息（流式）
 */
export async function sendMessage(conversationId, content) {
    const chatMessages = document.getElementById('chatMessages');
    const input = document.getElementById('chatInput2');

    if (!content || content.trim().length < 2) return;

    // 显示用户消息
    appendMessage('user', content);
    if (input) input.value = '';

    // 显示 AI 正在思考
    const aiMsgEl = appendMessage('assistant', '');
    const thinkingEl = document.createElement('span');
    thinkingEl.className = 'chat-thinking';
    thinkingEl.textContent = '思考中...';
    aiMsgEl.querySelector('.chat-bubble-content').appendChild(thinkingEl);

    try {
        const response = await fetch(`${API_BASE}/conversation/${conversationId}/message`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ content: content.trim() }),
        });

        if (response.status === 429) {
            const data = await response.json();
            thinkingEl.remove();
            aiMsgEl.querySelector('.chat-bubble-content').textContent = `⚠️ ${data.message || '今日次数已用完'}`;
            // 显示升级引导
            const { showUpgradePrompt } = await import('./subscription.js');
            showUpgradePrompt();
            return;
        }

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || '发送失败');
        }

        // 流式读取 AI 回复
        thinkingEl.remove();
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
                        const delta = parsed.choices?.[0]?.delta?.content || '';
                        if (delta) {
                            fullContent += delta;
                            aiMsgEl.querySelector('.chat-bubble-content').textContent = fullContent;
                        }
                    } catch { /* skip */ }
                }
            }
        }

        // 滚动到底部
        if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
        thinkingEl.remove();
        aiMsgEl.querySelector('.chat-bubble-content').textContent = `❌ ${error.message}`;
    }
}

/**
 * 添加消息到聊天面板
 */
function appendMessage(role, content) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return null;

    const msgEl = document.createElement('div');
    msgEl.className = `chat-bubble chat-bubble-${role}`;
    msgEl.innerHTML = `
        <div class="chat-bubble-avatar">${role === 'user' ? '👤' : '🤖'}</div>
        <div class="chat-bubble-content">${escapeHtml(content)}</div>
    `;
    chatMessages.appendChild(msgEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msgEl;
}

/**
 * 渲染聊天追问面板
 */
export function renderChatPanel(conversationId) {
    currentConversationId = conversationId;

    // 创建或显示聊天面板
    let panel = document.getElementById('chatPanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'chatPanel';
        panel.className = 'chat-panel glass-card';
        panel.innerHTML = `
            <div class="chat-panel-header">
                <h4>💬 继续追问</h4>
                <button class="chat-panel-close" onclick="closeChatPanel()">收起 ▼</button>
            </div>
            <div class="chat-messages" id="chatMessages"></div>
            <div class="chat-input-row">
                <input type="text" id="chatInput2" placeholder="输入你的追问..." 
                    onkeydown="if(event.key==='Enter') handleSendChat()" />
                <button class="chat-send-btn" onclick="handleSendChat()">发送</button>
            </div>
        `;
        // 插入到结果区后面
        const resultSection = document.getElementById('resultSection');
        if (resultSection) {
            resultSection.parentNode.insertBefore(panel, resultSection.nextSibling);
        } else {
            document.querySelector('.container').appendChild(panel);
        }
    }

    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * 处理发送聊天
 */
export function handleSendChat() {
    const input = document.getElementById('chatInput2');
    if (!input || !input.value.trim()) return;
    if (!currentConversationId) return;

    sendMessage(currentConversationId, input.value.trim());
}

/**
 * 关闭聊天面板
 */
export function closeChatPanel() {
    const panel = document.getElementById('chatPanel');
    if (panel) panel.style.display = 'none';
}

/**
 * 显示"继续追问"按钮（在分析完成后调用）
 */
export function showFollowUpButton(analysisId) {
    // 移除旧按钮
    const old = document.getElementById('btnFollowUp');
    if (old) old.remove();

    const btn = document.createElement('button');
    btn.id = 'btnFollowUp';
    btn.className = 'btn-follow-up';
    btn.innerHTML = '💬 继续追问 AI';
    btn.onclick = () => startConversation(analysisId);

    // 插入到导出按钮前
    const exportBtns = document.querySelector('.export-buttons');
    if (exportBtns) {
        exportBtns.parentNode.insertBefore(btn, exportBtns);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
