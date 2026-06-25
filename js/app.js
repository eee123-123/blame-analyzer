/* ═══════════════════════════════════════════════
   app.js — 主入口 & 交互逻辑
   ═══════════════════════════════════════════════ */

import { SAMPLES } from './samples.js';
import { parseChatMessages } from './parser.js';
import { analyzeBlame, generateCounterattacks, generateAdvice } from './analyzer.js';
import { renderResults } from './renderer.js';
import { updateCharCount, clearInput, scrollToTop, copyText, switchTab } from './utils.js';
import { analyzeWithAI, generateAICounterattacks } from './ai.js';
import { initAuth, showAuthModal, hideAuthModal, handleAuthSubmit, logout, isLoggedIn } from './auth.js';
import { toggleHistoryPanel, viewHistory, confirmDeleteHistory } from './history.js';
import { exportAsImage, exportAsPDF } from './export.js';
import { initOCR } from './ocr.js';
// Phase 3 新增
import { initSubscription, showPricingModal, hidePricingModal, handleSubscribe, showUpgradePrompt } from './subscription.js';
import { startConversation, handleSendChat, closeChatPanel, showFollowUpButton } from './conversation.js';
import { showPhrasesPanel, hidePhrasesPanel, filterPhrases, sortPhrases, handleLike, handleCollect, copyPhrase, showContributeModal, hideContributeModal, handleContribute } from './phrases.js';
import { showDashboard, hideDashboard } from './dashboard.js';

// ── 暴露到全局作用域（供 HTML 内联 onclick 调用）──
window.loadSample = loadSample;
window.analyze = analyze;
window.analyzeAI = analyzeAI;
window.regenerateWithAI = regenerateWithAI;
window.updateCharCount = updateCharCount;
window.clearInput = clearInput;
window.switchTab = switchTab;
window.copyText = copyText;
window.showAuthModal = showAuthModal;
window.hideAuthModal = hideAuthModal;
window.handleAuthSubmit = handleAuthSubmit;
window.handleLogout = logout;
// Phase 2 新增
window.toggleHistoryPanel = toggleHistoryPanel;
window.viewHistory = viewHistory;
window.confirmDeleteHistory = confirmDeleteHistory;
window.exportAsImage = exportAsImage;
window.exportAsPDF = exportAsPDF;
// Phase 3 新增
window.showPricingModal = showPricingModal;
window.hidePricingModal = hidePricingModal;
window.handleSubscribe = handleSubscribe;
window.showUpgradePrompt = showUpgradePrompt;
window.startConversation = startConversation;
window.handleSendChat = handleSendChat;
window.closeChatPanel = closeChatPanel;
window.showPhrasesPanel = showPhrasesPanel;
window.hidePhrasesPanel = hidePhrasesPanel;
window.filterPhrases = filterPhrases;
window.sortPhrases = sortPhrases;
window.handleLike = handleLike;
window.handleCollect = handleCollect;
window.copyPhrase = copyPhrase;
window.showContributeModal = showContributeModal;
window.hideContributeModal = hideContributeModal;
window.handleContribute = handleContribute;
window.showDashboard = showDashboard;
window.hideDashboard = hideDashboard;

/**
 * 加载示例聊天记录
 */
function loadSample(category) {
    const samples = SAMPLES[category];
    if (!samples) return;
    // 随机选取一条
    const sample = samples[Math.floor(Math.random() * samples.length)];
    document.getElementById('chatInput').value = sample;
    updateCharCount();
}

/**
 * 本地分析流程（关键词匹配）
 */
function analyze() {
    const input = document.getElementById('chatInput').value.trim();
    if (!input) {
        shakeInput();
        return;
    }

    const btn = document.getElementById('btnAnalyze');
    const loading = document.getElementById('loading');
    const resultSection = document.getElementById('resultSection');

    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> 分析中...';
    loading.style.display = 'block';
    resultSection.classList.remove('visible');

    startLoadingAnimation();

    setTimeout(() => {
        finishLoadingAnimation();
        loading.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '<span>🔍</span> 本地快速分析';

        const messages = parseChatMessages(input);
        if (messages.length < 2) {
            alert('解析到的对话消息太少，请检查格式后重试。');
            return;
        }

        const analysis = analyzeBlame(messages);
        const counterattacks = generateCounterattacks(analysis);
        const advice = generateAdvice();
        renderResults(analysis, counterattacks, advice);
    }, 3500);
}

/**
 * AI 大模型分析流程
 */
async function analyzeAI() {
    const input = document.getElementById('chatInput').value.trim();
    if (!input) {
        shakeInput();
        return;
    }

    // 检查登录状态
    if (!isLoggedIn()) {
        showAuthModal('login');
        return;
    }

    const btn = document.getElementById('btnAnalyzeAI');
    const loading = document.getElementById('loading');
    const resultSection = document.getElementById('resultSection');
    const role = document.getElementById('roleSelect').value;
    const tone = document.getElementById('toneSelect').value;

    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> AI 深度分析中...';
    loading.style.display = 'block';
    resultSection.classList.remove('visible');

    startAILoadingAnimation();

    try {
        const result = await analyzeWithAI(input, role, tone, (partial) => {
            // 流式进度更新
            const len = partial.length;
            const progress = Math.min(90, Math.floor(len / 40));
            document.getElementById('progressFill').style.width = progress + '%';
        });

        finishLoadingAnimation();
        loading.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '<span>🤖</span> AI 深度分析';

        // 渲染 AI 分析结果
        const { analysis, counterattacks, advice } = result;

        // 补充统计信息
        const messages = parseChatMessages(input);
        analysis.messageCount = messages.length || analysis.messageCount;
        analysis.speakerCount = new Set(messages.map(m => m.speaker)).size || analysis.speakerCount;

        renderResults(analysis, counterattacks, advice, true);
    } catch (error) {
        finishLoadingAnimation();
        loading.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '<span>🤖</span> AI 深度分析';

        // 显示错误提示
        showError(error.message);
    }
}

/**
 * 输入框抖动提示
 */
function shakeInput() {
    const textarea = document.getElementById('chatInput');
    textarea.focus();
    textarea.style.borderColor = 'var(--accent-red)';
    setTimeout(() => { textarea.style.borderColor = ''; }, 1500);
}

/**
 * 显示错误提示
 */
function showError(message) {
    const resultSection = document.getElementById('resultSection');
    resultSection.innerHTML = `
        <div class="glass-card" style="text-align:center;padding:40px 24px;">
            <div style="font-size:2.5rem;margin-bottom:16px;">😵</div>
            <h3 style="color:var(--accent-red);margin-bottom:12px;">分析失败</h3>
            <p style="color:var(--text-secondary);line-height:1.8;font-size:0.92rem;">${message}</p>
            <p style="color:var(--text-secondary);margin-top:12px;font-size:0.85rem;">你可以尝试重新分析，或使用本地快速分析模式</p>
        </div>
    `;
    resultSection.classList.add('visible');
}

/**
 * AI 重新生成反击话术
 */
async function regenerateWithAI() {
    const input = document.getElementById('chatInput').value.trim();
    if (!input) {
        alert('请先粘贴聊天记录');
        return;
    }

    const btn = document.getElementById('btnRegenAI');
    if (!btn) return;

    const role = document.getElementById('roleSelect').value;
    const tone = document.getElementById('toneSelect').value;

    btn.disabled = true;
    btn.innerHTML = '✨ AI 生成中...';

    try {
        const counterattacks = await generateAICounterattacks(input, role, tone);

        // 重新渲染话术区域
        const { renderCounterattacksWithAI } = await import('./renderer.js');
        renderCounterattacksWithAI(counterattacks);

        btn.disabled = false;
        btn.innerHTML = '✨ AI 重新生成话术';
    } catch (error) {
        btn.disabled = false;
        btn.innerHTML = '✨ AI 重新生成话术';
        alert('AI 生成失败：' + error.message);
    }
}

/**
 * 本地分析加载动画
 */
function startLoadingAnimation() {
    const loadingTexts = [
        '正在解析对话时间线...',
        '正在识别参与者角色...',
        '正在提取承诺与延误...',
        '正在构建责任因果链...',
        '正在量化各方责任占比...',
        '正在生成证据链...',
        '正在打磨反击话术...'
    ];

    let textIndex = 0;
    let progress = 0;
    const progressFill = document.getElementById('progressFill');
    progressFill.style.width = '0%';

    window._loadingInterval = setInterval(() => {
        textIndex = (textIndex + 1) % loadingTexts.length;
        document.getElementById('loadingText').textContent = loadingTexts[textIndex];
        progress = Math.min(progress + 14, 90);
        progressFill.style.width = progress + '%';
    }, 600);
}

/**
 * AI 分析加载动画
 */
function startAILoadingAnimation() {
    const loadingTexts = [
        '🤖 AI 正在阅读聊天记录...',
        '🧠 正在理解对话语境与潜台词...',
        '🔍 正在分析因果关系链...',
        '⚖️ 正在推理责任归属...',
        '📋 正在整理证据材料...',
        '🗡️ 正在生成反击话术...',
        '✨ 正在优化输出结果...'
    ];

    let textIndex = 0;
    const progressFill = document.getElementById('progressFill');
    progressFill.style.width = '0%';

    window._loadingInterval = setInterval(() => {
        textIndex = (textIndex + 1) % loadingTexts.length;
        document.getElementById('loadingText').textContent = loadingTexts[textIndex];
    }, 1200);
}

function finishLoadingAnimation() {
    clearInterval(window._loadingInterval);
    document.getElementById('progressFill').style.width = '100%';
}

// ── 初始化 ──
initAuth();
initOCR();
initSubscription();