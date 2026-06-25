/* ═══════════════════════════════════════════════
   phrases.js — 社区话术库模块
   浏览/贡献/点赞/收藏经典甩锅话术
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

const CATEGORIES = {
    deflect: { label: '转移话题', emoji: '🔄' },
    counter: { label: '反击回怼', emoji: '⚔️' },
    clarify: { label: '澄清甩锅', emoji: '💡' },
    escalate: { label: '升级处理', emoji: '📢' },
};

let currentCategory = '';
let currentSort = 'latest';
let currentPage = 1;

/**
 * 获取话术列表
 */
export async function fetchPhrases(page = 1, category = '', sort = 'latest') {
    const params = new URLSearchParams({ page: String(page), pageSize: '20', sort });
    if (category) params.set('category', category);

    const response = await fetch(`${API_BASE}/phrases?${params}`);
    if (!response.ok) throw new Error('获取话术失败');
    return await response.json();
}

/**
 * 贡献新话术
 */
export async function submitPhrase(content, category, scenario) {
    const response = await fetch(`${API_BASE}/phrases`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ content, category, scenario }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '贡献失败');
    return data;
}

/**
 * 点赞/取消点赞
 */
export async function toggleLike(phraseId) {
    const response = await fetch(`${API_BASE}/phrases/${phraseId}/like`, {
        method: 'POST',
        headers: authHeaders(),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '操作失败');
    return data;
}

/**
 * 收藏/取消收藏
 */
export async function toggleCollect(phraseId) {
    const response = await fetch(`${API_BASE}/phrases/${phraseId}/collect`, {
        method: 'POST',
        headers: authHeaders(),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '操作失败');
    return data;
}

/**
 * 显示话术库面板
 */
export async function showPhrasesPanel() {
    let panel = document.getElementById('phrasesPanel');
    if (!panel) {
        panel = createPhrasesPanel();
        document.body.appendChild(panel);
    }

    document.getElementById('phrasesOverlay').classList.add('visible');
    panel.classList.add('visible');
    await loadPhrases();
}

/**
 * 隐藏话术库面板
 */
export function hidePhrasesPanel() {
    const panel = document.getElementById('phrasesPanel');
    const overlay = document.getElementById('phrasesOverlay');
    if (panel) panel.classList.remove('visible');
    if (overlay) overlay.classList.remove('visible');
}

/**
 * 创建话术库面板 DOM
 */
function createPhrasesPanel() {
    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'phrasesOverlay';
    overlay.className = 'phrases-overlay';
    overlay.onclick = hidePhrasesPanel;
    document.body.appendChild(overlay);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'phrasesPanel';
    panel.className = 'phrases-panel';
    panel.innerHTML = `
        <div class="phrases-panel-header">
            <h3>📝 社区话术库</h3>
            <div class="phrases-header-actions">
                <button class="phrases-contribute-btn" onclick="showContributeModal()">✍️ 贡献话术</button>
                <button class="phrases-close-btn" onclick="hidePhrasesPanel()">&times;</button>
            </div>
        </div>
        <div class="phrases-tabs">
            <button class="phrases-tab active" data-category="" onclick="filterPhrases('')">全部</button>
            ${Object.entries(CATEGORIES).map(([key, val]) =>
                `<button class="phrases-tab" data-category="${key}" onclick="filterPhrases('${key}')">${val.emoji} ${val.label}</button>`
            ).join('')}
        </div>
        <div class="phrases-sort">
            <button class="phrases-sort-btn active" data-sort="latest" onclick="sortPhrases('latest')">最新</button>
            <button class="phrases-sort-btn" data-sort="hot" onclick="sortPhrases('hot')">🔥 最热</button>
        </div>
        <div class="phrases-list" id="phrasesList">
            <p style="text-align:center;color:var(--text-secondary);padding:40px;">加载中...</p>
        </div>
    `;
    return panel;
}

/**
 * 加载话术列表
 */
async function loadPhrases() {
    const list = document.getElementById('phrasesList');
    if (!list) return;

    list.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:40px;">加载中...</p>';

    try {
        const { data, total } = await fetchPhrases(currentPage, currentCategory, currentSort);

        if (!data || data.length === 0) {
            list.innerHTML = `
                <div style="text-align:center;padding:60px 20px;color:var(--text-secondary);">
                    <div style="font-size:3rem;margin-bottom:16px;">📭</div>
                    <p>暂无话术</p>
                    <p style="font-size:0.85rem;margin-top:8px;">成为第一个贡献者吧！</p>
                </div>
            `;
            return;
        }

        list.innerHTML = data.map(phrase => `
            <div class="phrase-card" data-id="${phrase.id}">
                <div class="phrase-category-tag">${CATEGORIES[phrase.category]?.emoji || '📌'} ${CATEGORIES[phrase.category]?.label || phrase.category}</div>
                <p class="phrase-content">${escapeHtml(phrase.content)}</p>
                ${phrase.scenario ? `<p class="phrase-scenario">💼 适用场景：${escapeHtml(phrase.scenario)}</p>` : ''}
                <div class="phrase-footer">
                    <span class="phrase-author">by ${escapeHtml(phrase.authorNickname || '匿名')}</span>
                    <div class="phrase-actions">
                        <button class="phrase-like-btn" onclick="handleLike(${phrase.id})">👍 ${phrase.likes}</button>
                        <button class="phrase-collect-btn" onclick="handleCollect(${phrase.id})">⭐ 收藏</button>
                        <button class="phrase-copy-btn" onclick="copyPhrase('${escapeAttr(phrase.content)}')">📋 复制</button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        list.innerHTML = `<p style="text-align:center;color:var(--accent-red);padding:40px;">${error.message}</p>`;
    }
}

/**
 * 按分类筛选
 */
export function filterPhrases(category) {
    currentCategory = category;
    currentPage = 1;

    // 更新 Tab 状态
    document.querySelectorAll('.phrases-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.category === category);
    });

    loadPhrases();
}

/**
 * 切换排序
 */
export function sortPhrases(sort) {
    currentSort = sort;
    currentPage = 1;

    document.querySelectorAll('.phrases-sort-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sort === sort);
    });

    loadPhrases();
}

/**
 * 处理点赞
 */
export async function handleLike(phraseId) {
    if (!getToken()) {
        const { showAuthModal } = await import('./auth.js');
        showAuthModal('login');
        return;
    }

    try {
        const result = await toggleLike(phraseId);
        // 更新按钮状态
        const card = document.querySelector(`.phrase-card[data-id="${phraseId}"]`);
        if (card) {
            const likeBtn = card.querySelector('.phrase-like-btn');
            likeBtn.textContent = `👍 ${result.likes}`;
            likeBtn.classList.toggle('liked', result.liked);
        }
    } catch (error) {
        console.error('点赞失败:', error);
    }
}

/**
 * 处理收藏
 */
export async function handleCollect(phraseId) {
    if (!getToken()) {
        const { showAuthModal } = await import('./auth.js');
        showAuthModal('login');
        return;
    }

    try {
        const result = await toggleCollect(phraseId);
        const card = document.querySelector(`.phrase-card[data-id="${phraseId}"]`);
        if (card) {
            const collectBtn = card.querySelector('.phrase-collect-btn');
            collectBtn.textContent = result.collected ? '⭐ 已收藏' : '⭐ 收藏';
            collectBtn.classList.toggle('collected', result.collected);
        }
    } catch (error) {
        console.error('收藏失败:', error);
    }
}

/**
 * 复制话术
 */
export function copyPhrase(content) {
    navigator.clipboard.writeText(content).then(() => {
        // 简短提示
        const toast = document.createElement('div');
        toast.className = 'copy-toast';
        toast.textContent = '✓ 已复制到剪贴板';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    });
}

/**
 * 显示贡献话术弹窗
 */
export function showContributeModal() {
    if (!getToken()) {
        import('./auth.js').then(m => m.showAuthModal('login'));
        return;
    }

    let modal = document.getElementById('contributeModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'contributeModal';
        modal.className = 'auth-modal-overlay visible';
        modal.innerHTML = `
            <div class="auth-modal glass-card" style="width:440px;">
                <button class="auth-modal-close" onclick="hideContributeModal()">&times;</button>
                <h2 class="auth-modal-title">✍️ 贡献话术</h2>
                <div class="auth-form">
                    <div class="auth-field">
                        <label>话术内容</label>
                        <textarea id="contributeContent" rows="4" style="width:100%;padding:10px 14px;border-radius:10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);color:var(--text-primary);font-size:0.9rem;resize:vertical;" placeholder="输入你的经典话术..."></textarea>
                    </div>
                    <div class="auth-field">
                        <label>分类</label>
                        <select id="contributeCategory" style="width:100%;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.1);color:var(--text-primary);font-size:0.88rem;">
                            <option value="deflect">🔄 转移话题</option>
                            <option value="counter">⚔️ 反击回怼</option>
                            <option value="clarify">💡 澄清甩锅</option>
                            <option value="escalate">📢 升级处理</option>
                        </select>
                    </div>
                    <div class="auth-field">
                        <label>适用场景（可选）</label>
                        <input type="text" id="contributeScenario" placeholder="例如：被领导在群里@你质问进度时" />
                    </div>
                    <p class="auth-error" id="contributeError"></p>
                    <button class="auth-submit-btn" onclick="handleContribute()">提交话术</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        modal.classList.add('visible');
    }
}

/**
 * 隐藏贡献弹窗
 */
export function hideContributeModal() {
    const modal = document.getElementById('contributeModal');
    if (modal) modal.classList.remove('visible');
}

/**
 * 处理贡献提交
 */
export async function handleContribute() {
    const content = document.getElementById('contributeContent').value.trim();
    const category = document.getElementById('contributeCategory').value;
    const scenario = document.getElementById('contributeScenario').value.trim();
    const errorEl = document.getElementById('contributeError');

    if (!content || content.length < 5) {
        errorEl.textContent = '话术内容至少5个字符';
        return;
    }

    try {
        await submitPhrase(content, category, scenario);
        hideContributeModal();
        await loadPhrases();
        alert('话术贡献成功！');
    } catch (error) {
        errorEl.textContent = error.message;
    }
}

// 工具函数
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return (str || '').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}
