/* ═══════════════════════════════════════════════
   ocr.js — OCR 图片识别输入模块
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
 * 初始化 OCR 功能（拖拽 + 文件选择）
 */
export function initOCR() {
    const uploadBtn = document.getElementById('btnOCR');
    const fileInput = document.getElementById('ocrFileInput');
    const chatInput = document.getElementById('chatInput');

    if (!uploadBtn || !fileInput || !chatInput) return;

    // 点击按钮触发文件选择
    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    // 文件选择后处理
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (file) {
            await processImage(file);
            fileInput.value = ''; // 重置，允许重复选择同一文件
        }
    });

    // 拖拽支持
    chatInput.addEventListener('dragover', (e) => {
        e.preventDefault();
        chatInput.classList.add('drag-over');
    });

    chatInput.addEventListener('dragleave', () => {
        chatInput.classList.remove('drag-over');
    });

    chatInput.addEventListener('drop', async (e) => {
        e.preventDefault();
        chatInput.classList.remove('drag-over');

        const file = e.dataTransfer?.files?.[0];
        if (file && file.type.startsWith('image/')) {
            await processImage(file);
        }
    });

    // 粘贴图片支持
    chatInput.addEventListener('paste', async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    await processImage(file);
                }
                return;
            }
        }
    });
}

/**
 * 处理图片文件 → base64 → 调用 OCR
 */
async function processImage(file) {
    if (!file.type.startsWith('image/')) {
        alert('请选择图片文件（PNG、JPG、WEBP）');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        alert('图片大小超过 10MB 限制');
        return;
    }

    const btn = document.getElementById('btnOCR');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> 识别中...';
    }

    try {
        const base64 = await fileToBase64(file);
        const text = await recognizeImage(base64);

        // 填充到输入框
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            // 如果已有内容，追加换行
            if (chatInput.value.trim()) {
                chatInput.value += '\n\n--- OCR 识别内容 ---\n' + text;
            } else {
                chatInput.value = text;
            }
            // 触发字数统计更新
            chatInput.dispatchEvent(new Event('input'));
        }
    } catch (error) {
        alert('OCR 识别失败：' + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>📷</span> 截图识别';
        }
    }
}

/**
 * 调用后端 OCR 接口
 */
async function recognizeImage(base64Data) {
    const response = await fetch(`${API_BASE}/ocr/recognize`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ image: base64Data }),
    });

    if (response.status === 401) {
        throw new Error('请先登录后再使用 OCR 功能');
    }
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'OCR 识别失败');
    }

    const result = await response.json();
    return result.text;
}

/**
 * 文件转 base64
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
