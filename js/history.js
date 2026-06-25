/* ═══════════════════════════════════════════════
   history.js — 分析历史记录模块
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

/**
 * 获取分析历史列表
 */
export async function fetchHistoryList(page = 1, pageSize = 20) {
    const response = await fetch(`${API_BASE}/history?page=${page}&pageSize=${pageSize}`, {
        headers: authHeaders(),
    });

    if (response.status === 401) {
        throw new Error('请先登录');
    }
    if (!response.ok) {
        throw new Error('获取历史记录失败');
    }

    return await response.json();
}

/**
 * 获取单条历史详情
 */
export async function fetchHistoryDetail(id) {
    const response = await fetch(`${API_BASE}/history/${id}`, {
        headers: authHeaders(),
    });

    if (!response.ok) {
        throw new Error('获取记录详情失败');
    }

    return await response.json();
}

/**
 * 删除一条历史记录
 */
export async function deleteHistory(id) {
    const response = await fetch(`${API_BASE}/history/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });

    if (!response.ok) {
        throw new Error('删除失败');
    }

    return await response.json();
}

/**
 * 渲染历史面板
 */
export async function renderHistoryPanel() {
    const panel = document.getElementById('historyPanel');
    const list = document.getElementById('historyList');

    if (!panel || !list) return;

    list.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:40px 0;">加载中...</p>';

    try {
        const { data } = await fetchHistoryList();

        if (!data || data.length === 0) {
            list.innerHTML = `
                <div style="text-align:center;padding:60px 20px;color:var(--text-secondary);">
                    <div style="font-size:3rem;margin-bottom:16px;">📭</div>
                    <p>暂无分析历史</p>
                    <p style="font-size:0.85rem;margin-top:8px;">使用 AI 深度分析后，结果会自动保存在这里</p>
                </div>
            `;
            return;
        }

        list.innerHTML = data.map(item => `
            <div class="history-item" data-id="${item.id}">
                <div class="history-item-content" onclick="viewHistory(${item.id})">
                    <p class="history-summary">${escapeHtml(item.summary || '未命名分析')}</p>
                    <span class="history-time">${formatTime(item.createdAt)}</span>
                </div>
                <button class="history-delete-btn" onclick="confirmDeleteHistory(event, ${item.id})" title="删除">
                    🗑️
                </button>
            </div>
        `).join('');
    } catch (error) {
        list.innerHTML = `<p style="text-align:center;color:var(--accent-red);padding:40px 0;">${error.message}</p>`;
    }
}

/**
 * 查看历史记录详情
 */
export async function viewHistory(id) {
    try {
        const detail = await fetchHistoryDetail(id);
        // 关闭历史面板
        toggleHistoryPanel(false);

        // 填充原始文本
        const input = document.getElementById('chatInput');
        if (input && detail.rawText) {
            input.value = detail.rawText;
        }

        // 渲染历史分析结果
        const { renderResults } = await import('./renderer.js');
        const result = typeof detail.result === 'string' ? JSON.parse(detail.result) : detail.result;

        // 尝试解析为标准结构
        let analysis, counterattacks, advice;
        if (result.analysis) {
            analysis = result.analysis;
            counterattacks = result.counterattacks;
            advice = result.advice;
        } else {
            // 兼容直接存储的 AI 原始结果
            const { normalizeHistoryResult } = await import('./ai.js');
            const normalized = normalizeHistoryResult(result);
            analysis = normalized.analysis;
            counterattacks = normalized.counterattacks;
            advice = normalized.advice;
        }

        renderResults(analysis, counterattacks, advice, true);
    } catch (error) {
        alert('加载历史记录失败：' + error.message);
    }
}

/**
 * 确认删除历史记录
 */
export async function confirmDeleteHistory(event, id) {
    event.stopPropagation();
    if (!confirm('确定要删除这条分析记录吗？')) return;

    try {
        await deleteHistory(id);
        // 重新渲染列表
        await renderHistoryPanel();
    } catch (error) {
        alert('删除失败：' + error.message);
    }
}

/**
 * 切换历史面板显示/隐藏
 */
export function toggleHistoryPanel(show) {
    const panel = document.getElementById('historyPanel');
    const overlay = document.getElementById('historyOverlay');
    if (!panel) return;

    if (show === undefined) {
        show = !panel.classList.contains('visible');
    }

    if (show) {
        panel.classList.add('visible');
        if (overlay) overlay.classList.add('visible');
        renderHistoryPanel();
    } else {
        panel.classList.remove('visible');
        if (overlay) overlay.classList.remove('visible');
    }
}

// ── 工具函数 ──

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin} 分钟前`;
    if (diffHour < 24) return `${diffHour} 小时前`;
    if (diffDay < 7) return `${diffDay} 天前`;

    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
