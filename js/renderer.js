/* ═══════════════════════════════════════════════
   renderer.js — UI 渲染器
   负责将分析结果渲染为 DOM 元素
   ═══════════════════════════════════════════════ */

import { highlightKeywords, drawPieChart, switchTab, copyText } from './utils.js';

const COLORS = ['#ff6b6b', '#fbbf24', '#38bdf8', '#a78bfa', '#34d399', '#f472b6'];

/**
 * 渲染全部分析结果
 * @param {Object} analysis - 分析结果
 * @param {Object} counterattacks - 反击话术
 * @param {Array} advice - 改进建议
 * @param {boolean} isAI - 是否为 AI 分析结果
 */
export function renderResults(analysis, counterattacks, advice, isAI = false) {
    const { blameResult, evidences, keyMessages, messageCount, speakerCount, timeSpan, summary } = analysis;
    const resultSection = document.getElementById('resultSection');

    // 清除可能的错误提示（从 showError 来的）
    if (!resultSection.querySelector('.stats-bar')) {
        resultSection.innerHTML = `
            <div class="stats-bar glass-card" id="statsBar"></div>
            <div class="glass-card result-card verdict-card">
                <div class="card-accent"></div>
                <div class="card-header"><h3>🎯 锅归属判定</h3></div>
                <div id="verdictContent"></div>
            </div>
            <div class="glass-card result-card key-messages-card">
                <div class="card-accent"></div>
                <div class="card-header"><h3>🔑 关键甩锅消息</h3><span class="badge" style="color:#f43f5e;border-color:rgba(244,63,94,0.3);">最致命证据</span></div>
                <div id="keyMessagesContent"></div>
            </div>
            <div class="glass-card result-card evidence-card">
                <div class="card-accent"></div>
                <div class="card-header"><h3>📋 证据链时间线</h3></div>
                <div id="evidenceContent"></div>
            </div>
            <div class="glass-card result-card counterattack-card">
                <div class="card-accent"></div>
                <div class="card-header"><h3>🗡️ 优雅反击话术</h3></div>
                <div id="counterattackContent"></div>
            </div>
            <div class="glass-card result-card advice-card">
                <div class="card-accent"></div>
                <div class="card-header"><h3>💡 改进建议</h3></div>
                <div id="adviceContent"></div>
            </div>
            <button class="btn-analyze" onclick="window.scrollTo({top:0,behavior:'smooth'})" style="margin-top:8px;"><span>🔄</span> 重新分析</button>
        `;
    }

    renderStatsBar(messageCount, speakerCount, evidences.length, blameResult, isAI);
    renderVerdict(blameResult, evidences.length, summary, isAI);
    renderKeyMessages(keyMessages);
    renderEvidence(evidences);
    renderCounterattacks(counterattacks);
    renderAdvice(advice);

    // 显示结果
    resultSection.classList.add('visible');
    setTimeout(() => {
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

function renderStatsBar(messageCount, speakerCount, evidenceCount, blameResult, isAI = false) {
    const topPct = blameResult.length > 0 ? blameResult[0].percentage + '%' : '—';
    const aiTag = isAI ? '<span class="ai-badge">🤖 AI</span>' : '';
    document.getElementById('statsBar').innerHTML = `
        <div class="stat-item">
            <div class="stat-num">${messageCount}</div>
            <div class="stat-label">消息总数</div>
        </div>
        <div class="stat-item">
            <div class="stat-num">${speakerCount}</div>
            <div class="stat-label">参与人数</div>
        </div>
        <div class="stat-item">
            <div class="stat-num">${evidenceCount}</div>
            <div class="stat-label">关键证据</div>
        </div>
        <div class="stat-item">
            <div class="stat-num">${topPct}</div>
            <div class="stat-label">最高责任占比 ${aiTag}</div>
        </div>
    `;
}

function renderVerdict(blameResult, evidenceCount, summary, isAI = false) {
    const mainBlamer = blameResult[0] || { speaker: '未知', percentage: 0 };
    const confidence = isAI ? Math.min(98, 85 + evidenceCount * 2) : Math.min(95, 70 + evidenceCount * 3);
    const selfResult = blameResult.find(r => r.speaker.includes('我'));

    let html = `
        <div class="verdict-main">
            <div class="verdict-chart">
                <canvas id="blameChart" width="160" height="160"></canvas>
                <div class="chart-label">责任分布</div>
            </div>
            <div class="verdict-detail">
                <div class="verdict-title">🫵 主要责任方：${mainBlamer.speaker}（${mainBlamer.percentage}%）</div>
                <div class="confidence-badge">🎯 置信度：${confidence}%（基于 ${evidenceCount} 条证据）</div>
                <div class="responsibility-bars">`;

    blameResult.forEach((item, i) => {
        html += `
                    <div class="resp-bar-row">
                        <span class="name">${truncate(item.speaker, 8)}</span>
                        <div class="bar-track">
                            <div class="bar-fill" style="width:0;background:${COLORS[i % 6]}" data-width="${item.percentage}%"></div>
                        </div>
                        <span class="pct" style="color:${COLORS[i % 6]}">${item.percentage}%</span>
                    </div>`;
    });

    html += `</div>`;

    // AI 分析的 reason 展示
    if (isAI && mainBlamer.reason) {
        html += `<p class="reason-text" style="margin-top:14px;color:var(--accent-yellow);"><strong>🤖 AI 分析：</strong>${mainBlamer.reason}</p>`;
    }

    // AI 总结
    if (isAI && summary) {
        html += `<p class="reason-text" style="margin-top:10px;"><strong>📝 一句话总结：</strong>${summary}</p>`;
    }

    if (selfResult) {
        const advice = selfResult.percentage <= 15
            ? '你整体处于被动等待方，不应成为主要背锅对象。'
            : '建议反思自身是否有可以更主动推进的空间。';
        html += `<p class="reason-text" style="margin-top:14px"><strong>你的责任：${selfResult.percentage}%</strong> — ${advice}</p>`;
    }

    html += `</div></div>`;
    document.getElementById('verdictContent').innerHTML = html;

    // 绘制饼图 + 动画条形图
    requestAnimationFrame(() => {
        drawPieChart('blameChart', blameResult);
        document.querySelectorAll('.bar-fill[data-width]').forEach(bar => {
            setTimeout(() => { bar.style.width = bar.dataset.width; }, 100);
        });
    });
}

function renderKeyMessages(keyMessages) {
    let html = '';

    if (keyMessages.length > 0) {
        keyMessages.forEach((km, i) => {
            html += `
            <div class="key-msg-item">
                <div class="key-msg-rank">${i + 1}</div>
                <div class="key-msg-meta">
                    <span class="key-msg-speaker">${km.speaker}</span>
                    ${km.time ? `<span class="key-msg-time">${km.time}</span>` : ''}
                    <span class="key-msg-tag">${km.type}</span>
                </div>
                <div class="key-msg-quote">${highlightKeywords(km.quote, km.matchedKeywords)}</div>
                <div class="key-msg-why">${km.analysis}</div>
            </div>`;
        });
    } else {
        html = '<p style="color:var(--text-secondary);font-size:0.92rem">未检测到高危甩锅消息，可能只是普通协作摩擦。</p>';
    }

    document.getElementById('keyMessagesContent').innerHTML = html;
}

function renderEvidence(evidences) {
    let html = '';

    evidences.forEach(ev => {
        html += `
            <div class="evidence-item severity-${ev.severity}">
                <div class="ev-header">
                    <span class="ev-time">📌 证据 #${ev.index}${ev.time ? ' — ' + ev.time : ''}</span>
                    <span class="ev-tag">${ev.type}</span>
                </div>
                <div class="ev-quote">${highlightKeywords(ev.quote, ev.matchedKeywords)}</div>
                <div class="ev-analysis">${ev.analysis}</div>
            </div>`;
    });

    document.getElementById('evidenceContent').innerHTML = html || '<p style="color:var(--text-secondary)">未检测到明显的甩锅证据链。</p>';
}

function renderCounterattacks(counterattacks) {
    const tonePreference = document.getElementById('toneSelect').value;
    const allTones = [
        { key: 'professional', label: '🤝 高情商', tabLabel: '高情商版' },
        { key: 'savage', label: '🔥 阴阳怪气', tabLabel: '阴阳怪气版' },
        { key: 'diplomatic', label: '🕊️ 对事不对人', tabLabel: '对事不对人版' }
    ];

    const displayTones = tonePreference === 'all' ? allTones : allTones.filter(t => t.key === tonePreference);

    let html = '<div class="counter-header-row"><div class="counter-tabs">';
    displayTones.forEach((tone, i) => {
        html += `<span class="counter-tab ${i === 0 ? 'active' : ''}" data-tab="${tone.key}" onclick="switchTab('${tone.key}')">${tone.label}</span>`;
    });
    html += '</div><button class="btn-regen-ai" id="btnRegenAI" onclick="regenerateWithAI()">✨ AI 重新生成话术</button></div>';

    displayTones.forEach((tone, i) => {
        html += `
            <div class="counter-content ${i === 0 ? 'active' : ''}" id="counter-${tone.key}">
                <div class="counter-text-box">
                    <span class="copy-btn" onclick="copyText('counter-text-${tone.key}', this)">📋 复制</span>
                    <div id="counter-text-${tone.key}">${counterattacks[tone.key]}</div>
                </div>
            </div>`;
    });

    document.getElementById('counterattackContent').innerHTML = html;
}

/**
 * AI 重新生成话术后的渲染
 * @param {Object} counterattacks - AI 生成的反击话术
 */
export function renderCounterattacksWithAI(counterattacks) {
    const tonePreference = document.getElementById('toneSelect').value;
    const allTones = [
        { key: 'professional', label: '🤝 高情商', tabLabel: '高情商版' },
        { key: 'savage', label: '🔥 阴阳怪气', tabLabel: '阴阳怪气版' },
        { key: 'diplomatic', label: '🕊️ 对事不对人', tabLabel: '对事不对人版' }
    ];

    const displayTones = tonePreference === 'all' ? allTones : allTones.filter(t => t.key === tonePreference);

    let html = '<div class="counter-header-row"><div class="counter-tabs">';
    displayTones.forEach((tone, i) => {
        html += `<span class="counter-tab ${i === 0 ? 'active' : ''}" data-tab="${tone.key}" onclick="switchTab('${tone.key}')">${tone.label}</span>`;
    });
    html += '</div><button class="btn-regen-ai" id="btnRegenAI" onclick="regenerateWithAI()">✨ AI 重新生成话术</button></div>';

    html += '<div class="ai-generated-tag">🤖 以下话术由 AI 大模型生成</div>';

    displayTones.forEach((tone, i) => {
        html += `
            <div class="counter-content ${i === 0 ? 'active' : ''}" id="counter-${tone.key}">
                <div class="counter-text-box ai-generated">
                    <span class="copy-btn" onclick="copyText('counter-text-${tone.key}', this)">📋 复制</span>
                    <div id="counter-text-${tone.key}">${counterattacks[tone.key]}</div>
                </div>
            </div>`;
    });

    document.getElementById('counterattackContent').innerHTML = html;
}

function renderAdvice(advice) {
    let html = '<ul class="advice-list">';
    advice.forEach(item => {
        html += `<li><span class="adv-icon">${item.icon}</span><span>${item.text}</span></li>`;
    });
    html += '</ul>';
    document.getElementById('adviceContent').innerHTML = html;
}

function truncate(str, maxLen) {
    return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}