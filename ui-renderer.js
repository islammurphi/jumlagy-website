/**
 * عارض الواجهة: رسم القوائم/الأقسام الأساسية + Toast
 * @module UIRenderer
 */
'use strict';

const UIRenderer = (() => {
    const dom = {
        sidebarNav: null,
        sidebarFooter: null,
        toast: null
    };

    function initDOMElements() {
        dom.sidebarNav = document.getElementById('sidebarNav');
        dom.sidebarFooter = document.getElementById('sidebarFooter');
        dom.toast = document.getElementById('toastNotification');

        renderSidebarNav();
    }

    function showToast(message, type = 'success') {
        const el = dom.toast || document.getElementById('toastNotification');
        if (!el) return;

        el.textContent = message;
        el.classList.remove('error', 'success', 'warning');
        el.classList.add(type);
        el.classList.add('show');

        setTimeout(() => {
            el.classList.remove('show');
        }, CONFIG.SYSTEM.toastDuration || 3000);
    }

    function renderSidebarNav() {
        const container = dom.sidebarNav || document.getElementById('sidebarNav');
        if (!container) return;

        const user = StateManager.get('currentUser');
        const isAdmin = user?.role === 'admin';

        const items = [
            { page: 'dashboard', icon: 'fa-chart-pie', label: 'لوحة التحكم' },
            { page: 'repair', icon: 'fa-tools', label: 'الصيانة' },
            { page: 'inventory', icon: 'fa-boxes', label: 'المخزون' },
            { page: 'customers', icon: 'fa-users', label: 'العملاء' },
            { page: 'expenses', icon: 'fa-receipt', label: 'المصروفات' },
            { page: 'reports', icon: 'fa-chart-line', label: 'التقارير' },
            { page: 'crm', icon: 'fa-address-book', label: 'CRM' },
            { page: 'profile', icon: 'fa-user', label: 'الملف الشخصي' },
            { page: 'settings', icon: 'fa-cog', label: 'الإعدادات' }
        ];

        if (isAdmin) {
            items.push({ page: 'auditLog', icon: 'fa-clipboard-list', label: 'سجل العمليات' });
            items.push({ page: 'admin', icon: 'fa-user-shield', label: 'الإدارة' });
        }

        container.innerHTML = items
            .map(
                (i) => `
                <button class="nav-item" type="button" data-page="${i.page}">
                    <i class="fas ${i.icon}"></i>
                    <span>${Utils.sanitizeHTML(i.label)}</span>
                </button>
            `
            )
            .join('');
    }

    function updateHeaderInfo() {
        const user = StateManager.get('currentUser');
        const shop = StateManager.get('shopSettings') || {};

        const shopName = document.getElementById('shopNameHeader');
        const shopPhone = document.getElementById('shopPhoneHeader');
        const userName = document.getElementById('userNameHeader');
        const userRole = document.getElementById('userRoleHeader');

        if (shopName) shopName.textContent = shop.shopName || CONFIG.APP.name;
        if (shopPhone) shopPhone.textContent = shop.shopPhone || '';
        if (userName) userName.textContent = user?.fullName || 'مستخدم';
        if (userRole) userRole.textContent = user?.role === 'admin' ? 'أدمن' : 'مستخدم';
    }

    function renderDashboardStats() {
        const container = document.getElementById('statsGrid');
        if (!container) return;

        const stats = DataManager.getRepairStats?.() || {
            totalRevenue: 0,
            netProfit: 0,
            overdueCount: 0
        };

        const expenses = StateManager.get('expenses') || [];
        const userId = StateManager.get('currentUser')?.id;
        const totalExpenses = expenses
            .filter((e) => e.userId === userId)
            .reduce((s, e) => s + (e.amount || 0), 0);

        const cards = [
            { icon: 'fa-money-bill-wave', label: 'إجمالي الإيرادات', value: Utils.formatCurrency(stats.totalRevenue || 0), color: CONFIG.UI_COLORS.primary },
            { icon: 'fa-receipt', label: 'إجمالي المصروفات', value: Utils.formatCurrency(totalExpenses), color: CONFIG.UI_COLORS.danger },
            { icon: 'fa-chart-line', label: 'صافي الربح', value: Utils.formatCurrency(stats.netProfit || 0), color: CONFIG.UI_COLORS.success },
            { icon: 'fa-clock', label: 'متأخرات', value: String(stats.overdueCount || 0), color: CONFIG.UI_COLORS.warning }
        ];

        container.innerHTML = '';
        cards.forEach((c) => {
            container.appendChild(
                UIComponents.createStatCard({
                    icon: c.icon,
                    label: c.label,
                    value: c.value,
                    color: c.color
                })
            );
        });
    }

    function renderRecentOrders() {
        const tbody = document.getElementById('recentOrdersBody');
        if (!tbody) return;

        const repairs = (StateManager.get('repairs') || [])
            .filter((r) => r.userId === StateManager.get('currentUser')?.id)
            .slice(-5)
            .reverse();

        if (repairs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="color: var(--sub); padding: 1rem;">لا توجد عمليات صيانة بعد</td></tr>`;
            return;
        }

        tbody.innerHTML = repairs
            .map(
                (r) => `
                <tr>
                    <td>${Utils.sanitizeHTML(r.device || r.deviceType || '-')}</td>
                    <td>${Utils.sanitizeHTML(r.customerName || '-')}</td>
                    <td>${Utils.sanitizeHTML(r.receiveDate || '-')}</td>
                    <td>${Utils.sanitizeHTML(r.status || '-')}</td>
                </tr>
            `
            )
            .join('');
    }

    function renderAuditLog() {
        const container = document.getElementById('auditLogSection');
        if (!container) return;

        const logs = StateManager.get('activityLog') || [];
        if (logs.length === 0) {
            container.innerHTML = `<div class="section-card"><p style="color: var(--sub);">لا يوجد سجل عمليات بعد.</p></div>`;
            return;
        }

        const rows = logs
            .slice(0, 100)
            .map(
                (l) => `
                <tr>
                    <td>${Utils.sanitizeHTML(new Date(l.at).toLocaleString('ar-EG'))}</td>
                    <td>${Utils.sanitizeHTML(l.action)}</td>
                    <td>${Utils.sanitizeHTML(l.details)}</td>
                </tr>
            `
            )
            .join('');

        container.innerHTML = `
            <div class="section-card">
                <div class="section-header"><h3><i class="fas fa-clipboard-list"></i> سجل العمليات</h3></div>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr><th>الوقت</th><th>العملية</th><th>التفاصيل</th></tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function renderAll() {
        renderSidebarNav();
        updateHeaderInfo();
        renderDashboardStats();
        renderRecentOrders();
    }

    return {
        initDOMElements,
        showToast,
        renderAll,
        updateHeaderInfo,
        renderAuditLog,
        renderSidebarNav,
        renderDashboardStats,
        renderRecentOrders
    };
})();

