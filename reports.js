/**
 * التقارير (نسخة خفيفة)
 * @module Reports
 */
'use strict';

const Reports = (() => {
    function render() {
        const container = document.getElementById('reportsSection');
        if (!container) return;

        const stats = DataManager.getRepairStats?.() || {};
        const userId = StateManager.get('currentUser')?.id;

        const expenses = (StateManager.get('expenses') || []).filter((e) => e.userId === userId);
        const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);

        container.innerHTML = `
            <div class="section-card">
                <div class="section-header">
                    <h3><i class="fas fa-chart-line"></i> التقارير</h3>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.75rem;">
                    <div class="stat-card" style="border-top:3px solid ${CONFIG.UI_COLORS.primary}">
                        <i class="fas fa-money-bill-wave" style="color:${CONFIG.UI_COLORS.primary}"></i>
                        <h3>إيرادات</h3>
                        <div class="value">${Utils.formatCurrency(stats.totalRevenue || 0)}</div>
                    </div>
                    <div class="stat-card" style="border-top:3px solid ${CONFIG.UI_COLORS.danger}">
                        <i class="fas fa-receipt" style="color:${CONFIG.UI_COLORS.danger}"></i>
                        <h3>مصروفات</h3>
                        <div class="value">${Utils.formatCurrency(totalExpenses)}</div>
                    </div>
                    <div class="stat-card" style="border-top:3px solid ${CONFIG.UI_COLORS.success}">
                        <i class="fas fa-chart-pie" style="color:${CONFIG.UI_COLORS.success}"></i>
                        <h3>صافي الربح</h3>
                        <div class="value">${Utils.formatCurrency(stats.netProfit || 0)}</div>
                    </div>
                </div>
                <p style="color:var(--sub);margin-top:0.75rem;">
                    ملاحظة: هذه صفحة تقارير مبسطة. يمكن توسيعها لاحقاً بإحصاءات مفصلة وفلاتر.
                </p>
            </div>
        `;
    }

    return { render };
})();

