/* ═══════════════════════════════════════════════
   subscription.js — 订阅管理模块
   处理套餐查询、订阅、取消、定价弹窗
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
 * 获取当前用户订阅信息
 */
export async function fetchCurrentPlan() {
    const token = getToken();
    if (!token) return { currentPlan: 'free', subscription: null };

    try {
        const response = await fetch(`${API_BASE}/subscription`, {
            headers: authHeaders(),
        });
        if (!response.ok) return { currentPlan: 'free', subscription: null };
        return await response.json();
    } catch {
        return { currentPlan: 'free', subscription: null };
    }
}

/**
 * 获取所有套餐列表
 */
export async function fetchPlans() {
    const response = await fetch(`${API_BASE}/subscription/plans`);
    if (!response.ok) throw new Error('获取套餐信息失败');
    return await response.json();
}

/**
 * 发起订阅（mock 支付直接成功）
 */
export async function subscribe(plan) {
    const response = await fetch(`${API_BASE}/subscription/subscribe`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ plan }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '订阅失败');
    return data;
}

/**
 * 取消订阅
 */
export async function cancelSubscription() {
    const response = await fetch(`${API_BASE}/subscription/cancel`, {
        method: 'POST',
        headers: authHeaders(),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '取消失败');
    return data;
}

/**
 * 渲染套餐徽章（显示在用户信息旁）
 */
export async function renderPlanBadge() {
    const { currentPlan } = await fetchCurrentPlan();
    const badgeEl = document.getElementById('planBadge');
    if (!badgeEl) return;

    const badges = {
        free: { text: '免费版', class: 'plan-badge-free' },
        pro: { text: 'Pro', class: 'plan-badge-pro' },
        team: { text: '团队版', class: 'plan-badge-team' },
    };

    const badge = badges[currentPlan] || badges.free;
    badgeEl.textContent = badge.text;
    badgeEl.className = `plan-badge ${badge.class}`;
    badgeEl.style.display = 'inline-flex';
}

/**
 * 显示定价弹窗
 */
export async function showPricingModal() {
    let modal = document.getElementById('pricingModal');
    if (!modal) {
        modal = createPricingModal();
        document.body.appendChild(modal);
    }

    // 加载套餐数据
    try {
        const { plans } = await fetchPlans();
        const { currentPlan } = await fetchCurrentPlan();
        renderPricingContent(modal, plans, currentPlan);
    } catch (error) {
        console.error('加载套餐失败:', error);
    }

    modal.classList.add('visible');
}

/**
 * 隐藏定价弹窗
 */
export function hidePricingModal() {
    const modal = document.getElementById('pricingModal');
    if (modal) modal.classList.remove('visible');
}

/**
 * 创建定价弹窗 DOM
 */
function createPricingModal() {
    const modal = document.createElement('div');
    modal.id = 'pricingModal';
    modal.className = 'pricing-modal-overlay';
    modal.innerHTML = `
        <div class="pricing-modal glass-card">
            <button class="pricing-modal-close" onclick="hidePricingModal()">&times;</button>
            <h2 class="pricing-modal-title">选择适合你的套餐</h2>
            <div class="pricing-cards" id="pricingCards">
                <p style="text-align:center;color:var(--text-secondary);">加载中...</p>
            </div>
        </div>
    `;
    return modal;
}

/**
 * 渲染定价卡片
 */
function renderPricingContent(modal, plans, currentPlan) {
    const container = modal.querySelector('#pricingCards');
    if (!container) return;

    container.innerHTML = plans.map(plan => {
        const isCurrent = plan.id === currentPlan;
        const isUpgrade = !isCurrent && plan.price > 0;

        return `
            <div class="pricing-card ${isCurrent ? 'pricing-card-current' : ''} ${plan.id === 'pro' ? 'pricing-card-featured' : ''}">
                ${plan.id === 'pro' ? '<div class="pricing-popular">最受欢迎</div>' : ''}
                <h3 class="pricing-plan-name">${plan.name}</h3>
                <div class="pricing-price">${plan.priceDisplay}</div>
                <ul class="pricing-features">
                    ${plan.features.map(f => `<li>✓ ${f}</li>`).join('')}
                </ul>
                <button class="pricing-action-btn ${isCurrent ? 'pricing-btn-current' : ''}"
                    ${isCurrent ? 'disabled' : ''}
                    onclick="${isUpgrade ? `handleSubscribe('${plan.id}')` : ''}">
                    ${isCurrent ? '当前套餐' : (plan.price === 0 ? '免费使用' : '立即订阅')}
                </button>
            </div>
        `;
    }).join('');
}

/**
 * 处理订阅操作
 */
export async function handleSubscribe(plan) {
    try {
        const result = await subscribe(plan);
        alert(result.message || '订阅成功！');
        hidePricingModal();
        await renderPlanBadge();
        // 刷新认证 UI
        const { updateAuthUI } = await import('./auth.js');
        updateAuthUI();
    } catch (error) {
        alert('订阅失败：' + error.message);
    }
}

/**
 * 显示升级引导（在限流被触发时调用）
 */
export function showUpgradePrompt() {
    showPricingModal();
}

/**
 * 初始化订阅模块
 */
export function initSubscription() {
    const token = getToken();
    if (token) {
        renderPlanBadge();
    }
}
