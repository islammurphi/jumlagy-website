/**
 * أدوات مساعدة عامة
 * @module Utils
 */
'use strict';

const Utils = (() => {
    function debounce(fn, wait = 250) {
        let t = null;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), wait);
        };
    }

    function sanitizeHTML(value) {
        const str = String(value ?? '');
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatCurrency(amount) {
        const n = Number(amount || 0);
        return `${n.toLocaleString('ar-EG')} ج.م`;
    }

    function formatDate(date) {
        const d = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString('ar-EG', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    function validatePhone(phone) {
        const p = String(phone || '').replace(/[^0-9]/g, '');
        // مصري غالباً: 11 رقم ويبدأ بـ 01
        return /^01[0-9]{9}$/.test(p);
    }

    function generateId(prefix = 'id') {
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function exportToCSV(rows, filename = 'export') {
        try {
            const csv = rows
                .map((row) =>
                    row
                        .map((cell) => {
                            const v = String(cell ?? '');
                            const escaped = v.replace(/"/g, '""');
                            return `"${escaped}"`;
                        })
                        .join(',')
                )
                .join('\n');

            const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${filename}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('exportToCSV failed', err);
        }
    }

    return {
        debounce,
        sanitizeHTML,
        formatCurrency,
        formatDate,
        validatePhone,
        generateId,
        exportToCSV
    };
})();

