/* ═══════════════════════════════════════════════
   export.js — 报告导出模块（PDF/图片）
   使用 html2canvas + jsPDF（CDN 引入）
   ═══════════════════════════════════════════════ */

/**
 * 将分析结果导出为 PNG 图片
 */
export async function exportAsImage() {
    const resultSection = document.getElementById('resultSection');
    if (!resultSection || !resultSection.classList.contains('visible')) {
        alert('请先完成分析后再导出');
        return;
    }

    const btn = document.getElementById('btnExportImage');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '📸 截图中...';
    }

    try {
        const html2canvas = window.html2canvas;
        if (!html2canvas) {
            throw new Error('导出组件加载失败，请刷新页面重试');
        }

        const canvas = await html2canvas(resultSection, {
            backgroundColor: '#0f0f23',
            scale: 2,
            useCORS: true,
            logging: false,
            // 忽略导出按钮本身
            ignoreElements: (el) => el.classList?.contains('export-buttons'),
        });

        // 下载
        const link = document.createElement('a');
        link.download = `甩锅分析报告_${formatDate()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (error) {
        alert('导出图片失败：' + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '📸 导出图片';
        }
    }
}

/**
 * 将分析结果导出为 PDF
 */
export async function exportAsPDF() {
    const resultSection = document.getElementById('resultSection');
    if (!resultSection || !resultSection.classList.contains('visible')) {
        alert('请先完成分析后再导出');
        return;
    }

    const btn = document.getElementById('btnExportPDF');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '📄 生成中...';
    }

    try {
        const html2canvas = window.html2canvas;
        const { jsPDF } = window.jspdf || {};
        if (!html2canvas || !jsPDF) {
            throw new Error('导出组件加载失败，请刷新页面重试');
        }

        const canvas = await html2canvas(resultSection, {
            backgroundColor: '#0f0f23',
            scale: 2,
            useCORS: true,
            logging: false,
            ignoreElements: (el) => el.classList?.contains('export-buttons'),
        });

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;

        // A4 尺寸 (mm)
        const pdfWidth = 210;
        const pdfHeight = (imgHeight * pdfWidth) / imgWidth;

        const pdf = new jsPDF({
            orientation: pdfHeight > 297 ? 'portrait' : 'portrait',
            unit: 'mm',
            format: [pdfWidth, Math.max(pdfHeight, 297)],
        });

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`甩锅分析报告_${formatDate()}.pdf`);
    } catch (error) {
        alert('导出 PDF 失败：' + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '📄 导出 PDF';
        }
    }
}

function formatDate() {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
}
