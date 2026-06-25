/* ═══════════════════════════════════════════════
   utils.js — 通用工具函数
   ═══════════════════════════════════════════════ */

/**
 * 高亮文本中的关键词
 * @param {string} text - 原始文本
 * @param {string[]} keywords - 需要高亮的关键词列表
 * @returns {string} 带有 highlight-keyword span 的 HTML 字符串
 */
export function highlightKeywords(text, keywords) {
    if (!keywords || keywords.length === 0) return text;
    const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escaped.join('|')})`, 'g');
    return text.replace(regex, '<span class="highlight-keyword">$1</span>');
}

/**
 * 复制文本到剪贴板
 * @param {string} elementId - 源文本元素的 DOM ID
 * @param {HTMLElement} btnEl - 触发按钮元素
 */
export function copyText(elementId, btnEl) {
    const el = document.getElementById(elementId);
    if (!el) return;
    navigator.clipboard.writeText(el.innerText).then(() => {
        btnEl.textContent = '✅ 已复制';
        btnEl.classList.add('copied');
        setTimeout(() => {
            btnEl.textContent = '📋 复制';
            btnEl.classList.remove('copied');
        }, 2000);
    });
}

/**
 * Canvas 绘制责任饼图
 * @param {string} canvasId - Canvas 元素 ID
 * @param {Array<{speaker: string, percentage: number}>} data - 责任数据
 */
export function drawPieChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = 160;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const colors = ['#ff6b6b', '#fbbf24', '#38bdf8', '#a78bfa', '#34d399', '#f472b6'];
    const cx = size / 2, cy = size / 2;
    const outerR = 65, innerR = 38;
    let startAngle = -Math.PI / 2;

    data.forEach((item, i) => {
        const sliceAngle = (item.percentage / 100) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
        ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
        startAngle += sliceAngle;
    });

    // Center text
    ctx.fillStyle = '#f0f0f0';
    ctx.font = 'bold 18px -apple-system,BlinkMacSystemFont,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(data.length + '方', cx, cy);
}

/**
 * 计算消息的时间跨度
 * @param {Array<{time: string}>} messages
 * @returns {string}
 */
export function calcTimeSpan(messages) {
    const times = messages.map(m => m.time).filter(Boolean);
    if (times.length < 2) return '—';
    return `${times[0]} ~ ${times[times.length - 1]}`;
}

/**
 * 滚动到页面顶部
 */
export function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * 更新字符计数
 */
export function updateCharCount() {
    const input = document.getElementById('chatInput');
    const counter = document.getElementById('charCount');
    if (input && counter) {
        counter.textContent = input.value.length;
    }
}

/**
 * 清空输入框
 */
export function clearInput() {
    const input = document.getElementById('chatInput');
    if (input) {
        input.value = '';
        updateCharCount();
    }
}

/**
 * 切换反击话术 Tab
 * @param {string} tabName
 */
export function switchTab(tabName) {
    document.querySelectorAll('.counter-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.counter-content').forEach(c => c.classList.remove('active'));
    const tabBtn = document.querySelector(`[data-tab="${tabName}"]`);
    const tabContent = document.getElementById(`counter-${tabName}`);
    if (tabBtn) tabBtn.classList.add('active');
    if (tabContent) tabContent.classList.add('active');
}