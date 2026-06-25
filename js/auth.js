/* ═══════════════════════════════════════════════
   auth.js — 前端认证模块
   处理登录、注册、Token 管理
   ═══════════════════════════════════════════════ */

const API_BASE = 'http://localhost:3000/api';
const TOKEN_KEY = 'blame_token';
const USER_KEY = 'blame_user';

/**
 * 获取当前用户信息
 */
export function getCurrentUser() {
    const userStr = localStorage.getItem(USER_KEY);
    if (!userStr) return null;
    try {
        return JSON.parse(userStr);
    } catch {
        return null;
    }
}

/**
 * 是否已登录
 */
export function isLoggedIn() {
    return !!localStorage.getItem(TOKEN_KEY);
}

/**
 * 用户注册
 */
export async function register(email, password, nickname) {
    const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, nickname }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || '注册失败');
    }

    // 保存 token 和用户信息
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));

    updateAuthUI();
    return data.user;
}

/**
 * 用户登录
 */
export async function login(email, password) {
    const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || '登录失败');
    }

    // 保存 token 和用户信息
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));

    updateAuthUI();
    return data.user;
}

/**
 * 退出登录
 */
export function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    updateAuthUI();
}

/**
 * 更新顶部认证状态 UI
 */
export function updateAuthUI() {
    const authArea = document.getElementById('authArea');
    if (!authArea) return;

    const user = getCurrentUser();

    if (user) {
        authArea.innerHTML = `
            <span class="plan-badge" id="planBadge" style="display:none;"></span>
            <span class="user-greeting">👋 ${user.nickname}</span>
            <button class="auth-btn auth-btn-logout" onclick="handleLogout()">退出</button>
        `;
        // 加载套餐徽章
        import('./subscription.js').then(m => m.renderPlanBadge()).catch(() => {});
    } else {
        authArea.innerHTML = `
            <button class="auth-btn auth-btn-login" onclick="showAuthModal('login')">登录</button>
            <button class="auth-btn auth-btn-register" onclick="showAuthModal('register')">注册</button>
        `;
    }
}

/**
 * 显示认证模态框
 */
export function showAuthModal(mode = 'login') {
    const modal = document.getElementById('authModal');
    if (!modal) return;

    const isLogin = mode === 'login';
    modal.querySelector('.auth-modal-title').textContent = isLogin ? '登录' : '注册';
    modal.querySelector('.auth-toggle-text').innerHTML = isLogin
        ? '还没有账号？<a href="#" onclick="showAuthModal(\'register\'); return false;">立即注册</a>'
        : '已有账号？<a href="#" onclick="showAuthModal(\'login\'); return false;">去登录</a>';

    const nicknameGroup = modal.querySelector('.nickname-group');
    if (nicknameGroup) {
        nicknameGroup.style.display = isLogin ? 'none' : 'block';
    }

    const submitBtn = modal.querySelector('.auth-submit-btn');
    submitBtn.textContent = isLogin ? '登录' : '注册';
    submitBtn.dataset.mode = mode;

    // 清除错误提示和输入
    const errorEl = modal.querySelector('.auth-error');
    if (errorEl) errorEl.textContent = '';

    modal.classList.add('visible');
}

/**
 * 关闭认证模态框
 */
export function hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.remove('visible');
}

/**
 * 处理认证表单提交
 */
export async function handleAuthSubmit() {
    const modal = document.getElementById('authModal');
    const submitBtn = modal.querySelector('.auth-submit-btn');
    const errorEl = modal.querySelector('.auth-error');
    const mode = submitBtn.dataset.mode;

    const email = modal.querySelector('#authEmail').value.trim();
    const password = modal.querySelector('#authPassword').value;
    const nickname = modal.querySelector('#authNickname')?.value.trim();

    errorEl.textContent = '';

    if (!email || !password) {
        errorEl.textContent = '邮箱和密码不能为空';
        return;
    }

    if (mode === 'register' && !nickname) {
        errorEl.textContent = '昵称不能为空';
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '处理中...';

    try {
        if (mode === 'login') {
            await login(email, password);
        } else {
            await register(email, password, nickname);
        }
        hideAuthModal();
    } catch (error) {
        errorEl.textContent = error.message;
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'login' ? '登录' : '注册';
    }
}

// 页面加载时初始化 UI + 验证会话
export function initAuth() {
    updateAuthUI();
    verifySession();

    // 页面重新可见时静默验证
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isLoggedIn()) {
            verifySession();
        }
    });
}

/**
 * 静默验证当前 token 是否有效
 * 失败则自动登出，不弹窗打扰
 */
async function verifySession() {
    if (!isLoggedIn()) return;

    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
        });

        if (response.status === 401) {
            // token 无效或过期，静默登出
            logout();
        }
    } catch {
        // 网络错误（后端不在线），静默登出
        logout();
    }
}
