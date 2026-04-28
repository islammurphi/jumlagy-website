/**
 * إدارة الرسوم البيانية باستخدام Chart.js
 * @module Charts
 * @requires StateManager, Utils, CONFIG
 */
'use strict';

const Charts = (() => {
    // تخزين مراجع المخططات
    const chartInstances = {
        revenue: null,
        status: null,
        expenses: null
    };

    /**
     * تهيئة جميع المخططات
     */
    function initAllCharts() {
        renderRevenueChart();
        renderStatusChart();
        renderExpensesChart();
    }

    /**
     * تدمير جميع المخططات
     */
    function destroyAllCharts() {
        Object.values(chartInstances).forEach(chart => {
            if (chart) {
                chart.destroy();
            }
        });
        
        chartInstances.revenue = null;
        chartInstances.status = null;
        chartInstances.expenses = null;
    }

    /**
     * عرض مخطط الإيرادات (آخر 7 أيام)
     */
    function renderRevenueChart() {
        const canvas = document.getElementById('revenueChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        
        // تجهيز البيانات
        const { labels, values } = getLast7DaysRevenue();
        
        // تدمير المخطط القديم
        if (chartInstances.revenue) {
            chartInstances.revenue.destroy();
        }

        // إنشاء المخطط الجديد
        chartInstances.revenue = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'الإيرادات (ج.م)',
                    data: values,
                    borderColor: CONFIG.UI_COLORS.primary,
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: CONFIG.UI_COLORS.primary,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return ` ${context.parsed.y.toLocaleString('ar-EG')} ج.م`;
                            }
                        },
                        rtl: true,
                        titleFont: {
                            family: CONFIG.APP.font || 'Cairo'
                        },
                        bodyFont: {
                            family: CONFIG.APP.font || 'Cairo'
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => `${value.toLocaleString('ar-EG')}`
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    }

    /**
     * الحصول على إيرادات آخر 7 أيام
     * @returns {Object} البيانات
     */
    function getLast7DaysRevenue() {
        const repairs = StateManager.get('repairs');
        const today = new Date();
        const labels = [];
        const values = [];
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().slice(0, 10);
            const displayDate = date.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric' });
            
            // حساب إيرادات هذا اليوم
            const dayRevenue = repairs
                .filter(r => {
                    const repairDate = r.receiveDate?.slice(0, 10) || r.createdAt?.slice(0, 10);
                    return repairDate === dateStr && 
                           r.userId === StateManager.get('currentUser')?.id;
                })
                .reduce((sum, r) => sum + (r.price || 0), 0);
            
            labels.push(displayDate);
            values.push(dayRevenue);
        }
        
        return { labels, values };
    }

    /**
     * عرض مخطط حالة الصيانة (دائري)
     */
    function renderStatusChart() {
        const canvas = document.getElementById('statusPieChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        
        // تجهيز البيانات
        const statusCounts = getRepairStatusCounts();
        
        // تدمير المخطط القديم
        if (chartInstances.status) {
            chartInstances.status.destroy();
        }

        // ألوان الحالات
        const statusColors = {
            'قيد الصيانة': CONFIG.UI_COLORS.warning,
            'تم الإصلاح': CONFIG.UI_COLORS.success,
            'تم التسليم': CONFIG.UI_COLORS.primary
        };
        
        const labels = Object.keys(statusCounts);
        const values = Object.values(statusCounts);
        const colors = labels.map(label => statusColors[label] || '#94a3b8');

        // إنشاء المخطط الجديد
        chartInstances.status = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderColor: '#fff',
                    borderWidth: 2,
                    hoverBorderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        rtl: true,
                        labels: {
                            font: {
                                family: CONFIG.APP.font || 'Cairo',
                                size: 12
                            },
                            padding: 15,
                            usePointStyle: true,
                            pointStyleWidth: 10
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? 
                                    Math.round((context.parsed / total) * 100) : 0;
                                return ` ${context.label}: ${context.parsed} (${percentage}%)`;
                            }
                        },
                        rtl: true,
                        titleFont: {
                            family: CONFIG.APP.font || 'Cairo'
                        },
                        bodyFont: {
                            family: CONFIG.APP.font || 'Cairo'
                        }
                    }
                }
            }
        });
    }

    /**
     * حساب عدد الأجهزة في كل حالة
     * @returns {Object} عدد الأجهزة حسب الحالة
     */
    function getRepairStatusCounts() {
        const repairs = StateManager.get('repairs');
        const userRepairs = repairs.filter(
            r => r.userId === StateManager.get('currentUser')?.id
        );
        
        const counts = {};
        CONFIG.REPAIR_STATUSES.forEach(status => {
            counts[status] = userRepairs.filter(r => r.status === status).length;
        });
        
        return counts;
    }

    /**
     * عرض مخطط المصروفات (أعمدة)
     */
    function renderExpensesChart() {
        const canvas = document.getElementById('expensesBarChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        
        // تجهيز البيانات
        const expenseData = getTopExpenses();
        
        // تدمير المخطط القديم
        if (chartInstances.expenses) {
            chartInstances.expenses.destroy();
        }

        // إنشاء المخطط الجديد
        chartInstances.expenses = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: expenseData.labels,
                datasets: [{
                    label: 'المبلغ (ج.م)',
                    data: expenseData.values,
                    backgroundColor: [
                        'rgba(139, 92, 246, 0.8)',
                        'rgba(99, 102, 241, 0.8)',
                        'rgba(6, 182, 212, 0.8)',
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(239, 68, 68, 0.8)'
                    ],
                    borderColor: [
                        CONFIG.UI_COLORS.purple,
                        CONFIG.UI_COLORS.primary,
                        CONFIG.UI_COLORS.info,
                        CONFIG.UI_COLORS.warning,
                        CONFIG.UI_COLORS.danger
                    ],
                    borderWidth: 1,
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                indexAxis: 'x',
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return ` ${context.parsed.y.toLocaleString('ar-EG')} ج.م`;
                            }
                        },
                        rtl: true,
                        titleFont: {
                            family: CONFIG.APP.font || 'Cairo'
                        },
                        bodyFont: {
                            family: CONFIG.APP.font || 'Cairo'
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => `${value.toLocaleString('ar-EG')}`
                        }
                    },
                    x: {
                        ticks: {
                            font: {
                                size: 11
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * الحصول على أعلى 5 مصروفات
     * @returns {Object} البيانات
     */
    function getTopExpenses() {
        const expenses = StateManager.get('expenses');
        const userExpenses = expenses.filter(
            e => e.userId === StateManager.get('currentUser')?.id
        );
        
        // تجميع المصروفات حسب النوع
        const expenseMap = new Map();
        userExpenses.forEach(expense => {
            const key = expense.title || expense.category || 'أخرى';
            expenseMap.set(key, (expenseMap.get(key) || 0) + (expense.amount || 0));
        });
        
        // ترتيب تنازلي وأخذ أعلى 5
        const sorted = Array.from(expenseMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        return {
            labels: sorted.map(item => item[0]),
            values: sorted.map(item => item[1])
        };
    }

    /**
     * تحديث مخطط محدد
     * @param {string} chartType - نوع المخطط
     */
    function updateChart(chartType) {
        switch (chartType) {
            case 'revenue':
                renderRevenueChart();
                break;
            case 'status':
                renderStatusChart();
                break;
            case 'expenses':
                renderExpensesChart();
                break;
            default:
                initAllCharts();
        }
    }

    /**
     * تصدير المخطط كصورة
     * @param {string} chartType - نوع المخطط
     * @returns {string} رابط الصورة
     */
    function exportChartAsImage(chartType) {
        const chart = chartInstances[chartType];
        if (!chart) return null;
        
        return chart.toBase64Image('image/png', 1);
    }

    /**
     * تحديث حجم المخططات (عند تغيير حجم النافذة)
     */
    function resizeAllCharts() {
        Object.values(chartInstances).forEach(chart => {
            if (chart) {
                chart.resize();
            }
        });
    }

    // مراقبة تغيير حجم النافذة
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(resizeAllCharts, 250);
    });

    // الواجهة العامة
    return {
        initAllCharts,
        destroyAllCharts,
        updateChart,
        exportChartAsImage,
        resizeAllCharts,
        renderRevenueChart,
        renderStatusChart,
        renderExpensesChart
    };
})();