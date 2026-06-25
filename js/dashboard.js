/* ═══════════════════════════════════════════════
   dashboard.js — 数据看板模块
   个人统计、使用趋势、分类分布可视化
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
 * 获取个人统计
 */
export async function fetchStats() {
    const response = await fetch(`${API_BASE}/dashboard/stats`, { headers: authHeaders() });
    if (!response.ok) throw new Error('获取统计失败');
    return await response.json();
}

/**
 * 获取使用趋势
 */
export async function fetchTrends(days = 30) {
    const response = await fetch(`${API_BASE}/dashboard/trends?days=${days}`, { headers: authHeaders() });
    if (!response.ok) throw new Error('获取趋势失败');
    return await response.json();
}

/**
 * 获取分类统计
 */
export async function fetchCategories() {
    const response = await fetch(`${API_BASE}/dashboard/categories`, { headers: authHeaders() });
    if (!response.ok) throw new Error('获取分类统计失败');
    return await response.json();
}

/**
 * 显示数据看板面板
 */
export async function showDashboard() {
    if (!getToken()) {
        const { showAuthModal } = await import('./auth.js');
        showAuthModal('login');
        return;
    }

    let panel = document.getElementById('dashboardPanel');
    if (!panel) {
        panel = createDashboardPanel();
        document.body.appendChild(panel);
    }

    document.getElementById('dashboardOverlay').classList.add('visible');
    panel.classList.add('visible');
    await loadDashboardData();
}

/**
 * 隐藏数据看板
 */
export function hideDashboard() {
    const panel = document.getElementById('dashboardPanel');
    const overlay = document.getElementById('dashboardOverlay');
    if (panel) panel.classList.remove('visible');
    if (overlay) overlay.classList.remove('visible');
}

/**
 * 创建看板面板 DOM
 */
function createDashboardPanel() {
    const overlay = document.createElement('div');
    overlay.id = 'dashboardOverlay';
    overlay.className = 'dashboard-overlay';
    overlay.onclick = hideDashboard;
    document.body.appendChild(overlay);

    const panel = document.createElement('div');
    panel.id = 'dashboardPanel';
    panel.className = 'dashboard-panel';
    panel.innerHTML = `
        <div class="dashboard-header">
            <h3>📊 数据看板</h3>
            <button class="dashboard-close-btn" onclick="hideDashboard()">&times;</button>
        </div>
        <div class="dashboard-content" id="dashboardContent">
            <p style="text-align:center;color:var(--text-secondary);padding:60px;">加载中...</p>
        </div>
    `;
    return panel;
}

/**
 * 加载看板数据并渲染
 */
async function loadDashboardData() {
    const content = document.getElementById('dashboardContent');
    if (!content) return;

    try {
        const [stats, trendsData, categoriesData] = await Promise.all([
            fetchStats(),
            fetchTrends(30),
            fetchCategories(),
        ]);

        content.innerHTML = `
            <div class="dashboard-stats-row">
                <div class="dashboard-stat-card">
                    <div class="dashboard-stat-num">${stats.totalAnalyses}</div>
                    <div class="dashboard-stat-label">总分析次数</div>
                </div>
                <div class="dashboard-stat-card">
                    <div class="dashboard-stat-num">${stats.monthAnalyses}</div>
                    <div class="dashboard-stat-label">本月分析</div>
                </div>
                <div class="dashboard-stat-card">
                    <div class="dashboard-stat-num">${stats.streak}</div>
                    <div class="dashboard-stat-label">连续使用天数</div>
                </div>
                <div class="dashboard-stat-card">
                    <div class="dashboard-stat-num">${stats.totalConversations}</div>
                    <div class="dashboard-stat-label">追问对话数</div>
                </div>
            </div>
            
            <div class="dashboard-chart-section">
                <h4>📈 近 30 天使用趋势</h4>
                <canvas id="trendChart" width="600" height="200"></canvas>
            </div>
            
            <div class="dashboard-chart-section">
                <h4>📊 问题分类分布</h4>
                <div id="categoriesChart"></div>
            </div>
        `;

        // 渲染趋势图（使用 Chart.js 如果可用，否则用简易 canvas）
        renderTrendChart(trendsData.trends);
        renderCategoriesChart(categoriesData.categories);
    } catch (error) {
        content.innerHTML = `<p style="text-align:center;color:var(--accent-red);padding:60px;">${error.message}</p>`;
    }
}

/**
 * 渲染趋势折线图
 */
function renderTrendChart(trends) {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;

    // 尝试使用 Chart.js
    if (window.Chart) {
        const ctx = canvas.getContext('2d');
        new window.Chart(ctx, {
            type: 'line',
            data: {
                labels: trends.map(t => t.date.slice(5)), // MM-DD
                datasets: [{
                    label: '分析次数',
                    data: trends.map(t => t.count),
                    borderColor: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.1)',
                    fill: true,
                    tension: 0.4,
                }],
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#9ca3af', maxTicksLimit: 7 }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { ticks: { color: '#9ca3af', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
                },
            },
        });
    } else {
        // 简易柱状图 fallback
        renderSimpleBarChart(canvas, trends);
    }
}

/**
 * 简易柱状图（无 Chart.js 时的 fallback）
 */
function renderSimpleBarChart(canvas, trends) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const maxVal = Math.max(...trends.map(t => t.count), 1);
    const barWidth = width / trends.length * 0.7;
    const gap = width / trends.length * 0.3;

    ctx.clearRect(0, 0, width, height);

    trends.forEach((t, i) => {
        const barHeight = (t.count / maxVal) * (height - 40);
        const x = i * (barWidth + gap) + gap / 2;
        const y = height - 30 - barHeight;

        // Bar
        ctx.fillStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.fillRect(x, y, barWidth, barHeight);

        // Label (only show some)
        if (i % 5 === 0) {
            ctx.fillStyle = '#9ca3af';
            ctx.font = '10px sans-serif';
            ctx.fillText(t.date.slice(5), x, height - 10);
        }
    });
}

/**
 * 渲染分类统计（简单横向条形图）
 */
function renderCategoriesChart(categories) {
    const container = document.getElementById('categoriesChart');
    if (!container || !categories || categories.length === 0) {
        if (container) container.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:20px;">暂无分类数据</p>';
        return;
    }

    const maxCount = Math.max(...categories.map(c => c.count));
    const colors = ['#ff6b6b', '#fbbf24', '#38bdf8', '#a78bfa', '#34d399', '#f43f5e'];

    container.innerHTML = categories.slice(0, 6).map((cat, i) => {
        const pct = Math.round((cat.count / maxCount) * 100);
        return `
            <div class="category-bar-row">
                <span class="category-bar-label">${cat.name}</span>
                <div class="category-bar-track">
                    <div class="category-bar-fill" style="width:${pct}%;background:${colors[i % colors.length]}"></div>
                </div>
                <span class="category-bar-count">${cat.count}</span>
            </div>
        `;
    }).join('');
}
