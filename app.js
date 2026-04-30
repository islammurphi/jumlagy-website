// تحديث دوال لوحة التحكم
function loadDashboard() {
    // البيانات المالية
    const totalRevenue = globalRepairs.reduce((s, r) => s + (Number(r.repair_price) || 0), 0);
    const totalPartsCost = globalRepairs.reduce((s, r) => s + (Number(r.spare_part_cost) || 0), 0);
    const totalTechFees = globalRepairs.reduce((s, r) => s + (Number(r.technician_fee) || 0), 0);
    const totalExpenses = globalExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const profit = totalRevenue - totalPartsCost - totalTechFees - totalExpenses;
    const inventoryValue = globalParts.reduce((s, p) => s + (Number(p.purchase_price) || 0) * (Number(p.quantity) || 0), 0);
    
    // إحصائيات متقدمة
    const completedOrders = globalRepairs.filter(r => r.status === 'تم_التسليم').length;
    const completionRate = globalRepairs.length > 0 ? Math.round((completedOrders / globalRepairs.length) * 100) : 0;
    const avgOrderValue = globalRepairs.length > 0 ? Math.round(totalRevenue / globalRepairs.length) : 0;
    
    // مؤشرات الأداء
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();
    const monthlyRevenue = globalRepairs
        .filter(r => new Date(r.receive_date).getMonth() === thisMonth && new Date(r.receive_date).getFullYear() === thisYear)
        .reduce((s, r) => s + (Number(r.repair_price) || 0), 0);
    
    const lastMonthRevenue = globalRepairs
        .filter(r => new Date(r.receive_date).getMonth() === (thisMonth - 1) && new Date(r.receive_date).getFullYear() === thisYear)
        .reduce((s, r) => s + (Number(r.repair_price) || 0), 0);
    
    const revenueTrend = lastMonthRevenue > 0 ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(1) : 0;
    
    // بناء HTML لوحة التحكم
    const statsCards = document.getElementById('stats-cards');
    if (statsCards) {
        statsCards.innerHTML = `
            <div class="dashboard-kpi">
                <div class="kpi-card animate-in">
                    <div class="kpi-icon icon-blue">
                        <i class="fas fa-dollar-sign"></i>
                    </div>
                    <div class="kpi-label">إجمالي الإيرادات</div>
                    <div class="kpi-value">${formatCurrency(totalRevenue)}</div>
                    <span class="kpi-trend ${revenueTrend >= 0 ? 'up' : 'down'}">
                        <i class="fas fa-arrow-${revenueTrend >= 0 ? 'up' : 'down'}"></i>
                        ${Math.abs(revenueTrend)}% الشهر الحالي
                    </span>
                </div>
                
                <div class="kpi-card animate-in">
                    <div class="kpi-icon icon-green">
                        <i class="fas fa-chart-line"></i>
                    </div>
                    <div class="kpi-label">صافي الأرباح</div>
                    <div class="kpi-value">${formatCurrency(profit)}</div>
                    <span class="kpi-trend ${profit >= 0 ? 'up' : 'down'}">
                        <i class="fas fa-${profit >= 0 ? 'check' : 'exclamation'}-circle"></i>
                        ${profit >= 0 ? 'إيجابي' : 'سلبي'}
                    </span>
                </div>
                
                <div class="kpi-card animate-in">
                    <div class="kpi-icon icon-purple">
                        <i class="fas fa-shopping-cart"></i>
                    </div>
                    <div class="kpi-label">متوسط قيمة الطلب</div>
                    <div class="kpi-value">${formatCurrency(avgOrderValue)}</div>
                    <span class="kpi-trend up">
                        <i class="fas fa-chart-bar"></i>
                        ${completedOrders} طلب مكتمل
                    </span>
                </div>
                
                <div class="kpi-card animate-in">
                    <div class="kpi-icon icon-cyan">
                        <i class="fas fa-box"></i>
                    </div>
                    <div class="kpi-label">قيمة المخزون</div>
                    <div class="kpi-value">${formatCurrency(inventoryValue)}</div>
                    <span class="kpi-trend up">
                        <i class="fas fa-cubes"></i>
                        ${globalParts.length} صنف
                    </span>
                </div>
            </div>
            
            <!-- رسوم بيانية -->
            <div class="charts-grid">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-chart-bar text-blue"></i> تحليل الإيرادات والمصروفات</h3>
                    </div>
                    <div class="card-body">
                        <canvas id="revenueExpenseChart" height="300"></canvas>
                    </div>
                </div>
            </div>
            
            <div class="bottom-grid">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-trophy text-amber"></i> أفضل العملاء</h3>
                        <a href="#" class="link" onclick="switchTab('reports')">عرض التقارير <i class="fas fa-chevron-left"></i></a>
                    </div>
                    <div class="card-body" id="top-customers-widget"></div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-clock text-blue"></i> آخر أوامر الصيانة</h3>
                        <a href="#" class="link" onclick="switchTab('repairs')">عرض الكل <i class="fas fa-chevron-left"></i></a>
                    </div>
                    <div class="card-body" id="recent-repairs-widget"></div>
                </div>
            </div>
        `;
        
        // تحميل الرسوم البيانية والمحتوى
        loadDashboardCharts();
        loadTopCustomersWidget();
        loadRecentRepairsWidget();
    }
    
    // تحميل المخزون والتنبيهات
    loadInventoryStatus();
    updateAlertsCount();
}

// رسم بياني متقدم للإيرادات
function loadDashboardCharts() {
    const canvas = document.getElementById('revenueExpenseChart');
    if (!canvas || typeof Chart === 'undefined') return;
    
    // تجميع البيانات الشهرية
    const monthlyData = {};
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    
    globalRepairs.forEach(r => {
        if (r.receive_date) {
            const date = new Date(r.receive_date);
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            if (!monthlyData[key]) monthlyData[key] = { revenue: 0, expenses: 0, month: months[date.getMonth()], year: date.getFullYear() };
            monthlyData[key].revenue += Number(r.repair_price) || 0;
            monthlyData[key].expenses += (Number(r.spare_part_cost) || 0) + (Number(r.technician_fee) || 0);
        }
    });
    
    globalExpenses.forEach(e => {
        if (e.date) {
            const date = new Date(e.date);
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            if (!monthlyData[key]) monthlyData[key] = { revenue: 0, expenses: 0, month: months[date.getMonth()], year: date.getFullYear() };
            monthlyData[key].expenses += Number(e.amount) || 0;
        }
    });
    
    const sortedData = Object.values(monthlyData).sort((a, b) => a.year - b.year || months.indexOf(a.month) - months.indexOf(b.month));
    
    if (charts.revenueExpense) charts.revenueExpense.destroy();
    
    charts.revenueExpense = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: sortedData.map(d => `${d.month} ${d.year}`),
            datasets: [
                {
                    label: 'الإيرادات',
                    data: sortedData.map(d => d.revenue),
                    backgroundColor: 'rgba(37, 99, 235, 0.8)',
                    borderColor: '#2563eb',
                    borderWidth: 1,
                    borderRadius: 6
                },
                {
                    label: 'المصروفات',
                    data: sortedData.map(d => d.expenses),
                    backgroundColor: 'rgba(239, 68, 68, 0.8)',
                    borderColor: '#ef4444',
                    borderWidth: 1,
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: { family: 'Tajawal', size: 12 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + context.parsed.y.toLocaleString('ar-EG') + ' ج.م';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => value.toLocaleString('ar-EG') + ' ج.م',
                        font: { family: 'Tajawal' }
                    }
                },
                x: {
                    ticks: {
                        font: { family: 'Tajawal', size: 11 }
                    }
                }
            }
        }
    });
}

// ويدجت أفضل العملاء
function loadTopCustomersWidget() {
    const container = document.getElementById('top-customers-widget');
    if (!container) return;
    
    const customerMap = {};
    globalRepairs.forEach(r => {
        const key = r.customer_phone || r.customer_name;
        if (!customerMap[key]) {
            customerMap[key] = {
                name: r.customer_name || 'غير معروف',
                phone: r.customer_phone || '',
                totalSpent: 0,
                ordersCount: 0
            };
        }
        customerMap[key].totalSpent += Number(r.repair_price) || 0;
        customerMap[key].ordersCount++;
    });
    
    const topCustomers = Object.values(customerMap)
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 5);
    
    container.innerHTML = topCustomers.length > 0 ? topCustomers.map((c, i) => `
        <div class="quick-item">
            <div>
                <div class="quick-item-name">
                    <span class="badge ${i === 0 ? 'badge-amber' : 'badge-gray'}">#${i + 1}</span>
                    ${c.name}
                </div>
                <div class="quick-item-sub">${c.phone} · ${c.ordersCount} عمليات</div>
            </div>
            <div class="quick-item-amount">${formatCurrency(c.totalSpent)}</div>
        </div>
    `).join('') : '<p class="text-center text-gray-400 py-4">لا توجد بيانات كافية</p>';
}

// ويدجت آخر الأوامر
function loadRecentRepairsWidget() {
    const container = document.getElementById('recent-repairs-widget');
    if (!container) return;
    
    const recentRepairs = globalRepairs.slice(0, 5);
    
    container.innerHTML = recentRepairs.length > 0 ? recentRepairs.map(r => `
        <div class="quick-item">
            <div>
                <div class="quick-item-name">${r.device_name || 'جهاز غير محدد'}</div>
                <div class="quick-item-sub">
                    ${r.customer_name || 'غير معروف'} · 
                    <span class="badge badge-${r.status === 'تم_التسليم' ? 'green' : r.status === 'جاهز' ? 'blue' : 'amber'}">${r.status === 'تم_التسليم' ? 'تم التسليم' : r.status === 'جاهز' ? 'جاهز' : 'قيد الصيانة'}</span>
                </div>
            </div>
            <div class="quick-item-amount">${formatCurrency(r.repair_price)}</div>
        </div>
    `).join('') : '<p class="text-center text-gray-400 py-4">لا توجد أوامر صيانة</p>';
}

// تحسين عرض المحافظ
function loadWallets() {
    const totalBalance = globalWallets.reduce((s, w) => s + (Number(w.balance) || 0), 0);
    const totalDailyUsed = globalWallets.reduce((s, w) => s + (Number(w.daily_used) || 0), 0);
    const totalMonthlyUsed = globalWallets.reduce((s, w) => s + (Number(w.monthly_used) || 0), 0);
    
    // بناء كروت المحافظ
    const walletsContainer = document.getElementById('wallets-table-body');
    if (walletsContainer) {
        walletsContainer.innerHTML = `
            <div class="wallet-grid">
                ${globalWallets.map(w => {
                    const limit = walletLimits[w.type] || {};
                    const dailyUsagePercent = w.daily_limit > 0 ? (Number(w.daily_used) / Number(w.daily_limit) * 100) : 0;
                    const monthlyUsagePercent = w.monthly_limit > 0 ? (Number(w.monthly_used) / Number(w.monthly_limit) * 100) : 0;
                    
                    return `
                        <div class="wallet-card">
                            <div class="wallet-card-header">
                                <div>
                                    <h3 class="font-bold text-lg">${w.name || 'محفظة'}</h3>
                                    <span class="wallet-type-badge badge-blue">${limit.label || w.type}</span>
                                </div>
                                <div class="flex gap-2">
                                    <button class="btn-icon text-blue" onclick="openTransactionModal('${w.id}')" title="عملية جديدة">
                                        <i class="fas fa-exchange-alt"></i>
                                    </button>
                                    <button class="btn-icon" onclick="openWalletModal('${w.id}')" title="تعديل">
                                        <i class="fas fa-pen"></i>
                                    </button>
                                </div>
                            </div>
                            
                            <div class="wallet-balance-section">
                                <div class="wallet-balance-label">الرصيد الحالي</div>
                                <div class="wallet-balance-value">${formatCurrency(w.balance)}</div>
                                <div class="text-xs text-gray-500 mt-2">${w.phone || ''}</div>
                            </div>
                            
                            <div class="wallet-limits">
                                <div class="wallet-limit-item">
                                    <div class="wallet-limit-label">الحد اليومي</div>
                                    <div class="wallet-limit-value">${formatCurrency(w.daily_limit)}</div>
                                    <div class="wallet-progress">
                                        <div class="wallet-progress-bar ${dailyUsagePercent > 80 ? 'danger' : dailyUsagePercent > 50 ? 'warning' : 'safe'}" 
                                             style="width: ${Math.min(dailyUsagePercent, 100)}%"></div>
                                    </div>
                                    <div class="text-xs text-gray-500 mt-1">مستعمل: ${formatCurrency(w.daily_used)}</div>
                                </div>
                                
                                <div class="wallet-limit-item">
                                    <div class="wallet-limit-label">الحد الشهري</div>
                                    <div class="wallet-limit-value">${formatCurrency(w.monthly_limit)}</div>
                                    <div class="wallet-progress">
                                        <div class="wallet-progress-bar ${monthlyUsagePercent > 80 ? 'danger' : monthlyUsagePercent > 50 ? 'warning' : 'safe'}" 
                                             style="width: ${Math.min(monthlyUsagePercent, 100)}%"></div>
                                    </div>
                                    <div class="text-xs text-gray-500 mt-1">مستعمل: ${formatCurrency(w.monthly_used)}</div>
                                </div>
                            </div>
                            
                            <div class="wallet-actions">
                                <button class="btn-primary btn-sm flex-1" onclick="openTransactionModal('${w.id}')">
                                    <i class="fas fa-plus"></i> إضافة عملية
                                </button>
                                <button class="btn-outline btn-sm flex-1" onclick="viewWalletTransactions('${w.id}')">
                                    <i class="fas fa-history"></i> السجل
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }
    
    // تحديث ملخص المحافظ
    const summaryContainer = document.getElementById('wallet-summary-cards');
    if (summaryContainer) {
        summaryContainer.innerHTML = `
            <div class="stats-grid">
                <div class="dash-stat">
                    <div class="dash-stat-icon icon-green"><i class="fas fa-wallet"></i></div>
                    <div class="dash-stat-title">إجمالي الأرصدة</div>
                    <div class="dash-stat-value">${formatCurrency(totalBalance)}</div>
                    <div class="dash-stat-sub">${globalWallets.length} محفظة</div>
                </div>
                <div class="dash-stat">
                    <div class="dash-stat-icon icon-blue"><i class="fas fa-calendar-day"></i></div>
                    <div class="dash-stat-title">المستعمل اليوم</div>
                    <div class="dash-stat-value">${formatCurrency(totalDailyUsed)}</div>
                </div>
                <div class="dash-stat">
                    <div class="dash-stat-icon icon-amber"><i class="fas fa-calendar-alt"></i></div>
                    <div class="dash-stat-title">المستعمل الشهر</div>
                    <div class="dash-stat-value">${formatCurrency(totalMonthlyUsed)}</div>
                </div>
            </div>
        `;
    }
    
    // تحميل سجل العمليات
    loadWalletTransactions();
}

// عرض سجل العمليات لمحفظة محددة
function viewWalletTransactions(walletId) {
    const wallet = globalWallets.find(w => w.id === walletId);
    if (!wallet) return;
    
    const transactions = globalTransactions
        .filter(t => t.wallet_id === walletId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.innerHTML = `
        <div class="modal-box modal-lg">
            <div class="modal-header">
                <h3><i class="fas fa-history"></i> سجل عمليات ${wallet.name}</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>التاريخ</th>
                            <th>النوع</th>
                            <th>المبلغ</th>
                            <th>ملاحظات</th>
                            <th>إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${transactions.map(t => `
                            <tr>
                                <td>${t.date || '-'}</td>
                                <td>
                                    <span class="badge ${t.type === 'deposit' ? 'badge-green' : 'badge-red'}">
                                        ${t.type === 'deposit' ? 'إيداع' : 'سحب'}
                                    </span>
                                </td>
                                <td class="font-bold ${t.type === 'deposit' ? 'text-green' : 'text-red'}">
                                    ${t.type === 'deposit' ? '+' : '-'} ${formatCurrency(t.amount)}
                                </td>
                                <td class="text-sm">${t.notes || '-'}</td>
                                <td>
                                    <div class="flex gap-1">
                                        <button class="btn-icon" onclick="editTransaction('${t.id}')">
                                            <i class="fas fa-pen"></i>
                                        </button>
                                        <button class="btn-icon text-red" onclick="deleteTransaction('${t.id}')">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                        ${transactions.length === 0 ? '<tr><td colspan="5" class="text-center py-6 text-gray-400">لا توجد عمليات</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// فاتورة احترافية
async function printRepairInvoice(repairId) {
    const repair = globalRepairs.find(r => r.id === repairId);
    if (!repair) return;
    
    const invoiceNumber = `INV-${repairId.slice(0, 8).toUpperCase()}`;
    const date = new Date().toLocaleDateString('ar-EG', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    const w = window.open('', '_blank', 'width=800,height=900');
    w.document.write(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>فاتورة ${invoiceNumber}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');
                
                * { margin: 0; padding: 0; box-sizing: border-box; }
                
                body {
                    font-family: 'Tajawal', sans-serif;
                    padding: 40px;
                    color: #1e293b;
                    background: white;
                }
                
                .invoice-container {
                    max-width: 700px;
                    margin: 0 auto;
                }
                
                .invoice-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 40px;
                    padding-bottom: 20px;
                    border-bottom: 3px solid #2563eb;
                }
                
                .shop-info h1 {
                    font-size: 32px;
                    font-weight: 900;
                    color: #2563eb;
                    margin-bottom: 8px;
                }
                
                .shop-info p {
                    font-size: 14px;
                    color: #64748b;
                    margin-bottom: 4px;
                }
                
                .invoice-info {
                    text-align: left;
                }
                
                .invoice-info h2 {
                    font-size: 28px;
                    font-weight: 800;
                    color: #0f172a;
                    margin-bottom: 4px;
                }
                
                .invoice-info p {
                    font-size: 13px;
                    color: #64748b;
                }
                
                .details-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    margin-bottom: 30px;
                }
                
                .detail-box {
                    background: #f8fafc;
                    border-radius: 12px;
                    padding: 16px;
                    border: 1px solid #e2e8f0;
                }
                
                .detail-label {
                    font-size: 11px;
                    font-weight: 700;
                    color: #94a3b8;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 6px;
                }
                
                .detail-value {
                    font-size: 16px;
                    font-weight: 700;
                    color: #0f172a;
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 30px;
                }
                
                th {
                    background: #2563eb;
                    color: white;
                    padding: 14px 16px;
                    text-align: right;
                    font-size: 13px;
                    font-weight: 700;
                }
                
                td {
                    padding: 14px 16px;
                    border-bottom: 1px solid #e2e8f0;
                    font-size: 14px;
                }
                
                .total-section {
                    background: linear-gradient(135deg, #eff6ff, #dbeafe);
                    border: 2px solid #93c5fd;
                    border-radius: 16px;
                    padding: 24px;
                    text-align: center;
                    margin-bottom: 30px;
                }
                
                .total-label {
                    font-size: 14px;
                    color: #64748b;
                    margin-bottom: 8px;
                }
                
                .total-amount {
                    font-size: 40px;
                    font-weight: 900;
                    color: #2563eb;
                }
                
                .warranty-box {
                    background: #fef3c7;
                    border: 1px solid #fde68a;
                    border-radius: 8px;
                    padding: 12px 16px;
                    margin-bottom: 30px;
                }
                
                .warranty-box h4 {
                    color: #92400e;
                    font-size: 14px;
                    margin-bottom: 4px;
                }
                
                .warranty-box p {
                    color: #a16207;
                    font-size: 13px;
                }
                
                .signatures {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 40px;
                    margin-top: 60px;
                }
                
                .signature-box {
                    text-align: center;
                }
                
                .signature-line {
                    border-bottom: 1px solid #cbd5e1;
                    margin-bottom: 8px;
                    padding-bottom: 8px;
                }
                
                .signature-label {
                    font-size: 13px;
                    color: #94a3b8;
                }
                
                .footer {
                    text-align: center;
                    margin-top: 40px;
                    padding-top: 20px;
                    border-top: 1px solid #e2e8f0;
                    font-size: 12px;
                    color: #94a3b8;
                }
                
                @media print {
                    body { padding: 20px; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="invoice-container">
                <div class="invoice-header">
                    <div class="shop-info">
                        <h1>${globalSettings.shop_name || 'Jumlagy'}</h1>
                        <p><i class="fas fa-user"></i> ${globalSettings.owner_name || ''}</p>
                        <p><i class="fas fa-phone"></i> ${globalSettings.phone || ''}</p>
                        <p><i class="fas fa-map-marker-alt"></i> ${globalSettings.address || ''}</p>
                    </div>
                    <div class="invoice-info">
                        <h2>فاتورة</h2>
                        <p>رقم: ${invoiceNumber}</p>
                        <p>التاريخ: ${date}</p>
                    </div>
                </div>
                
                <div class="details-grid">
                    <div class="detail-box">
                        <div class="detail-label">العميل</div>
                        <div class="detail-value">${repair.customer_name || 'غير محدد'}</div>
                        <div style="color: #64748b; font-size: 13px; margin-top: 4px;">${repair.customer_phone || ''}</div>
                    </div>
                    <div class="detail-box">
                        <div class="detail-label">الجهاز</div>
                        <div class="detail-value">${repair.device_name || 'غير محدد'}</div>
                        <div style="color: #64748b; font-size: 13px; margin-top: 4px;">
                            الفني: ${repair.technician || 'غير محدد'}
                        </div>
                    </div>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th>البيان</th>
                            <th>التفاصيل</th>
                            <th>المبلغ</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>أجر الصيانة</td>
                            <td>${repair.device_issue || 'صيانة جهاز'}</td>
                            <td>${formatCurrency(repair.repair_price)}</td>
                        </tr>
                        ${repair.spare_part_name ? `
                        <tr>
                            <td>قطع الغيار</td>
                            <td>${repair.spare_part_name}</td>
                            <td>${formatCurrency(repair.spare_part_cost)}</td>
                        </tr>
                        ` : ''}
                        <tr>
                            <td>تاريخ الاستلام</td>
                            <td>${repair.receive_date || '-'}</td>
                            <td></td>
                        </tr>
                        ${repair.delivery_date ? `
                        <tr>
                            <td>تاريخ التسليم</td>
                            <td>${repair.delivery_date}</td>
                            <td></td>
                        </tr>
                        ` : ''}
                    </tbody>
                </table>
                
                <div class="total-section">
                    <div class="total-label">الإجمالي</div>
                    <div class="total-amount">${formatCurrency(repair.repair_price)}</div>
                    <div style="color: #64748b; font-size: 13px; margin-top: 8px;">
                        ${repair.spare_part_name ? `تشمل قطع الغيار: ${formatCurrency(repair.spare_part_cost)}` : ''}
                    </div>
                </div>
                
                ${globalSettings.warranty_days > 0 ? `
                <div class="warranty-box">
                    <h4>🛡️ ضمان ${globalSettings.warranty_days} يوم</h4>
                    <p>${globalSettings.warranty_notes || 'يشمل الضمان قطع الغيار فقط'}</p>
                </div>
                ` : ''}
                
                <div class="signatures">
                    <div class="signature-box">
                        <div class="signature-line"></div>
                        <div class="signature-label">توقيع العميل</div>
                    </div>
                    <div class="signature-box">
                        <div class="signature-line"></div>
                        <div class="signature-label">توقيع الفني</div>
                    </div>
                </div>
                
                <div class="footer">
                    <p>${globalSettings.shop_name || 'Jumlagy'} © ${new Date().getFullYear()}</p>
                    <p style="margin-top: 4px;">شكراً لتعاملكم معنا</p>
                </div>
                
                <div class="no-print" style="text-align: center; margin-top: 30px;">
                    <button onclick="window.print()" style="
                        background: #2563eb;
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        font-size: 14px;
                        font-weight: 700;
                        cursor: pointer;
                        font-family: 'Tajawal', sans-serif;
                    ">
                        <i class="fas fa-print"></i> طباعة الفاتورة
                    </button>
                </div>
            </div>
        </body>
        </html>
    `);
    w.document.close();
}

// تحسين التقارير
function loadReports() {
    // تجميع البيانات المالية
    const totalRevenue = globalRepairs.reduce((s, r) => s + (Number(r.repair_price) || 0), 0);
    const totalPartsCost = globalRepairs.reduce((s, r) => s + (Number(r.spare_part_cost) || 0), 0);
    const totalTechFees = globalRepairs.reduce((s, r) => s + (Number(r.technician_fee) || 0), 0);
    const totalExpenses = globalExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const profit = totalRevenue - totalPartsCost - totalTechFees - totalExpenses;
    const profitMargin = totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(1) : 0;
    
    // إحصائيات إضافية
    const completedOrders = globalRepairs.filter(r => r.status === 'تم_التسليم').length;
    const completionRate = globalRepairs.length > 0 ? ((completedOrders / globalRepairs.length) * 100).toFixed(1) : 0;
    const avgOrderValue = globalRepairs.length > 0 ? Math.round(totalRevenue / globalRepairs.length) : 0;
    
    const reportsKPI = document.getElementById('reports-kpi');
    if (reportsKPI) {
        reportsKPI.innerHTML = `
            <div class="reports-kpi-grid">
                <div class="report-card">
                    <div class="report-card-icon icon-blue">
                        <i class="fas fa-dollar-sign"></i>
                    </div>
                    <div class="report-card-info">
                        <div class="report-card-title">إجمالي الإيرادات</div>
                        <div class="report-card-value">${formatCurrency(totalRevenue)}</div>
                        <div class="report-card-sub">${globalRepairs.length} عملية</div>
                    </div>
                </div>
                
                <div class="report-card">
                    <div class="report-card-icon icon-green">
                        <i class="fas fa-chart-pie"></i>
                    </div>
                    <div class="report-card-info">
                        <div class="report-card-title">صافي الأرباح</div>
                        <div class="report-card-value">${formatCurrency(profit)}</div>
                        <div class="report-card-sub">هامش ربح ${profitMargin}%</div>
                    </div>
                </div>
                
                <div class="report-card">
                    <div class="report-card-icon icon-purple">
                        <i class="fas fa-shopping-cart"></i>
                    </div>
                    <div class="report-card-info">
                        <div class="report-card-title">متوسط الطلب</div>
                        <div class="report-card-value">${formatCurrency(avgOrderValue)}</div>
                        <div class="report-card-sub">${completedOrders} طلب مكتمل</div>
                    </div>
                </div>
                
                <div class="report-card">
                    <div class="report-card-icon icon-amber">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="report-card-info">
                        <div class="report-card-title">معدل الإتمام</div>
                        <div class="report-card-value">${completionRate}%</div>
                        <div class="report-card-sub">${completedOrders} من ${globalRepairs.length}</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // تفصيل الأرباح
    const profitBreakdown = document.getElementById('profit-breakdown');
    if (profitBreakdown) {
        profitBreakdown.innerHTML = `
            <div class="report-section">
                <div class="report-section-header">
                    <i class="fas fa-chart-line"></i>
                    <h3>تفصيل صافي الأرباح</h3>
                </div>
                <div class="report-section-body">
                    <div class="breakdown-grid">
                        <div class="breakdown-item">
                            <div class="breakdown-label">الإيرادات</div>
                            <div class="breakdown-value" style="color: #2563eb;">${formatCurrency(totalRevenue)}</div>
                        </div>
                        <div class="breakdown-item">
                            <div class="breakdown-label">تكلفة القطع</div>
                            <div class="breakdown-value" style="color: #7c3aed;">-${formatCurrency(totalPartsCost)}</div>
                        </div>
                        <div class="breakdown-item">
                            <div class="breakdown-label">أجور الفنيين</div>
                            <div class="breakdown-value" style="color: #f59e0b;">-${formatCurrency(totalTechFees)}</div>
                        </div>
                        <div class="breakdown-item">
                            <div class="breakdown-label">مصاريف تشغيلية</div>
                            <div class="breakdown-value" style="color: #ef4444;">-${formatCurrency(totalExpenses)}</div>
                        </div>
                        <div class="breakdown-item breakdown-profit">
                            <div class="breakdown-label">صافي الأرباح</div>
                            <div class="breakdown-value">${formatCurrency(profit)}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // أداء الفنيين
    const techMap = {};
    globalRepairs.forEach(r => {
        if (!r.technician) return;
        if (!techMap[r.technician]) {
            techMap[r.technician] = {
                name: r.technician,
                totalOrders: 0,
                completedOrders: 0,
                totalRevenue: 0,
                totalPartsCost: 0
            };
        }
        techMap[r.technician].totalOrders++;
        techMap[r.technician].totalRevenue += Number(r.repair_price) || 0;
        techMap[r.technician].totalPartsCost += Number(r.spare_part_cost) || 0;
        if (r.status === 'تم_التسليم') {
            techMap[r.technician].completedOrders++;
        }
    });
    
    const technicianPerformance = document.getElementById('technician-performance');
    if (technicianPerformance) {
        technicianPerformance.innerHTML = `
            <div class="report-section">
                <div class="report-section-header">
                    <i class="fas fa-user-cog"></i>
                    <h3>أداء الفنيين</h3>
                </div>
                <div class="report-section-body">
                    ${Object.values(techMap).map((t, i) => `
                        <div class="tech-row">
                            <div class="tech-rank">${i + 1}</div>
                            <div class="tech-info">
                                <div class="tech-name">${t.name}</div>
                                <div class="tech-stats">
                                    ${t.completedOrders}/${t.totalOrders} مكتمل · 
                                    ${t.totalOrders > 0 ? Math.round((t.completedOrders / t.totalOrders) * 100) : 0}%
                                </div>
                            </div>
                            <div class="tech-orders">${t.totalOrders} عمليات</div>
                            <div class="tech-revenue">${formatCurrency(t.totalRevenue)}</div>
                        </div>
                    `).join('')}
                    ${Object.keys(techMap).length === 0 ? '<p class="text-center text-gray-400 py-4">لا توجد بيانات كافية</p>' : ''}
                </div>
            </div>
        `;
    }
    
    // أفضل العملاء والأجهزة
    loadTopCustomersReport();
    loadTopDevicesReport();
}

// تحسين صفحة الإعدادات
function loadSettings() {
    const settingsContainer = document.createElement('div');
    settingsContainer.className = 'settings-container';
    
    const settingsTab = document.getElementById('tab-settings');
    if (!settingsTab) return;
    
    // تحديث HTML الإعدادات
    settingsTab.innerHTML = `
        <div class="page-header">
            <div>
                <h1>الإعدادات</h1>
                <p class="text-muted">تخصيص النظام حسب احتياجاتك</p>
            </div>
        </div>
        
        <div class="settings-container">
            <!-- إعدادات المحل -->
            <div class="settings-section">
                <div class="settings-section-header">
                    <div class="settings-section-icon icon-blue" style="background: #dbeafe;">
                        <i class="fas fa-store text-blue"></i>
                    </div>
                    <div>
                        <div class="settings-section-title">بيانات المحل</div>
                        <div class="settings-section-subtitle">معلومات تظهر في الفواتير والتقارير</div>
                    </div>
                </div>
                <div class="settings-section-body">
                    <div class="settings-grid">
                        <div class="settings-field">
                            <label class="settings-field-label">اسم المحل *</label>
                            <input type="text" class="input-field" id="set-shop-name" 
                                   value="${globalSettings.shop_name || ''}" 
                                   placeholder="أدخل اسم المحل">
                        </div>
                        <div class="settings-field">
                            <label class="settings-field-label">اسم المالك</label>
                            <input type="text" class="input-field" id="set-owner-name" 
                                   value="${globalSettings.owner_name || ''}" 
                                   placeholder="أدخل اسم صاحب المحل">
                        </div>
                        <div class="settings-field">
                            <label class="settings-field-label">رقم الهاتف</label>
                            <input type="tel" class="input-field" id="set-phone" 
                                   value="${globalSettings.phone || ''}" 
                                   placeholder="01xxxxxxxxx">
                        </div>
                        <div class="settings-field">
                            <label class="settings-field-label">العنوان</label>
                            <input type="text" class="input-field" id="set-address" 
                                   value="${globalSettings.address || ''}" 
                                   placeholder="أدخل العنوان">
                        </div>
                    </div>
                    
                    <div class="settings-preview-box">
                        <div class="preview-shop-name">${globalSettings.shop_name || 'اسم المحل'}</div>
                        <div class="preview-shop-info">${globalSettings.owner_name || 'اسم المالك'}</div>
                        <div class="preview-shop-info">📞 ${globalSettings.phone || 'رقم الهاتف'}</div>
                        <div class="preview-shop-info">📍 ${globalSettings.address || 'العنوان'}</div>
                    </div>
                </div>
            </div>
            
            <!-- إعدادات الضمان -->
            <div class="settings-section">
                <div class="settings-section-header">
                    <div class="settings-section-icon icon-green" style="background: #d1fae5;">
                        <i class="fas fa-shield-alt text-green"></i>
                    </div>
                    <div>
                        <div class="settings-section-title">إعدادات الضمان</div>
                        <div class="settings-section-subtitle">سياسة الضمان المطبقة على قطع الغيار</div>
                    </div>
                </div>
                <div class="settings-section-body">
                    <div class="settings-grid">
                        <div class="settings-field">
                            <label class="settings-field-label">مدة الضمان (أيام)</label>
                            <input type="number" class="input-field" id="set-warranty-days" 
                                   value="${globalSettings.warranty_days || 30}" 
                                   min="0" max="365">
                        </div>
                    </div>
                    <div class="settings-field">
                        <label class="settings-field-label">نص الضمان في الفاتورة</label>
                        <textarea class="input-field" id="set-warranty-notes" rows="3" 
                                  placeholder="مثال: ضمان 30 يوم على قطع الغيار، لا يشمل سوء الاستخدام">${globalSettings.warranty_notes || ''}</textarea>
                    </div>
                </div>
            </div>
            
            <!-- إدارة الفنيين -->
            <div class="settings-section">
                <div class="settings-section-header">
                    <div class="settings-section-icon icon-purple" style="background: #ede9fe;">
                        <i class="fas fa-users-cog text-purple"></i>
                    </div>
                    <div>
                        <div class="settings-section-title">الفنيين</div>
                        <div class="settings-section-subtitle">إدارة فريق العمل الفني</div>
                    </div>
                </div>
                <div class="settings-section-body">
                    <div class="flex gap-2 mb-4">
                        <input type="text" class="input-field flex-1" id="new-technician" 
                               placeholder="أدخل اسم الفني الجديد...">
                        <button class="btn-primary" onclick="addTechnician()">
                            <i class="fas fa-plus"></i> إضافة فني
                        </button>
                    </div>
                    <div id="technicians-list">
                        ${globalTechnicians.map((t, i) => `
                            <div class="flex justify-between items-center bg-gray-50 rounded-lg p-3 mb-2">
                                <div class="flex items-center gap-3">
                                    <div class="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                                        <i class="fas fa-user-cog text-purple text-sm"></i>
                                    </div>
                                    <span class="font-medium">${t}</span>
                                </div>
                                <button class="btn-icon text-red" onclick="removeTechnician(${i})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        `).join('')}
                        ${globalTechnicians.length === 0 ? '<p class="text-center text-gray-400 py-4">لم تضف فنيين بعد</p>' : ''}
                    </div>
                </div>
            </div>
            
            <button class="btn-primary mt-4" onclick="saveSettings()" style="width: 100%;">
                <i class="fas fa-save"></i> حفظ جميع الإعدادات
            </button>
        </div>
    `;
    
    // ربط أحداث المعاينة
    ['set-shop-name', 'set-owner-name', 'set-phone', 'set-address'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateSettingsPreview);
    });
}

function updateSettingsPreview() {
    const previewName = document.querySelector('.preview-shop-name');
    const previewInfo = document.querySelectorAll('.preview-shop-info');
    
    if (previewName) {
        previewName.textContent = document.getElementById('set-shop-name')?.value || 'اسم المحل';
    }
    if (previewInfo[0]) {
        previewInfo[0].textContent = document.getElementById('set-owner-name')?.value || 'اسم المالك';
    }
    if (previewInfo[1]) {
        previewInfo[1].textContent = '📞 ' + (document.getElementById('set-phone')?.value || 'رقم الهاتف');
    }
    if (previewInfo[2]) {
        previewInfo[2].textContent = '📍 ' + (document.getElementById('set-address')?.value || 'العنوان');
    }
}

// تحديث دالة loadAllData
async function loadAllData() {
    if (!ownerId) return;
    try {
        const [rs, ps, es, ws, ts, ss, sd, us] = await Promise.all([
            getDocs(query(collection(db, "repairs"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "parts"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "expenses"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "wallets"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "transactions"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "subscriptions"), where("ownerId", "==", ownerId))),
            getDoc(doc(db, "settings", ownerId)),
            getDocs(collection(db, "users"))
        ]);
        
        globalRepairs = rs.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => new Date(b.receive_date || 0) - new Date(a.receive_date || 0));
        globalParts = ps.docs.map(d => ({ id: d.id, ...d.data() }));
        globalExpenses = es.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        globalWallets = ws.docs.map(d => ({ id: d.id, ...d.data() }));
        globalTransactions = ts.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        globalSubscriptions = ss.docs.map(d => ({ id: d.id, ...d.data() }));
        
        if (sd.exists()) {
            globalSettings = sd.data();
            globalTechnicians = globalSettings.technicians || ['عان', 'تحن', 'قنب'];
        } else {
            globalSettings = {
                shop_name: 'Jumlagy',
                owner_name: 'اسم حسن',
                phone: '01207696202',
                address: 'المقطم',
                warranty_days: 30,
                warranty_notes: 'ضمان 30 يوم على قطع الغيار',
                language: 'ar',
                technicians: globalTechnicians
            };
            await setDoc(doc(db, "settings", ownerId), globalSettings);
        }
        
        const session = JSON.parse(localStorage.getItem('jumlagy_session'));
        if (session?.role === 'admin') {
            globalUsers = us.docs.map(d => ({ id: d.id, ...d.data() }));
        }
    } catch (e) {
        console.error('Error loading data:', e);
    }
}

// إضافة دوال جديدة للتقارير
function loadTopCustomersReport() {
    const container = document.getElementById('top-customers');
    if (!container) return;
    
    const customerMap = {};
    globalRepairs.forEach(r => {
        const key = r.customer_phone || r.customer_name;
        if (!customerMap[key]) {
            customerMap[key] = {
                name: r.customer_name || 'غير معروف',
                phone: r.customer_phone || '',
                totalSpent: 0,
                ordersCount: 0
            };
        }
        customerMap[key].totalSpent += Number(r.repair_price) || 0;
        customerMap[key].ordersCount++;
    });
    
    const topCustomers = Object.values(customerMap)
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 10);
    
    container.innerHTML = topCustomers.length > 0 ? topCustomers.map((c, i) => `
        <div class="customer-row">
            <div class="customer-rank rank-${i < 3 ? 'gold' : i < 5 ? 'silver' : 'bronze'}">${i + 1}</div>
            <div class="flex-1">
                <div class="font-semibold text-sm">${c.name}</div>
                <div class="text-xs text-gray-500">${c.phone} · ${c.ordersCount} عمليات</div>
            </div>
            <div class="font-bold text-blue-600">${formatCurrency(c.totalSpent)}</div>
        </div>
    `).join('') : '<p class="text-center text-gray-400 py-4">لا توجد بيانات كافية</p>';
}

function loadTopDevicesReport() {
    const container = document.getElementById('top-devices');
    if (!container) return;
    
    const deviceMap = {};
    globalRepairs.forEach(r => {
        if (!r.device_name) return;
        if (!deviceMap[r.device_name]) {
            deviceMap[r.device_name] = {
                name: r.device_name,
                count: 0,
                totalRevenue: 0
            };
        }
        deviceMap[r.device_name].count++;
        deviceMap[r.device_name].totalRevenue += Number(r.repair_price) || 0;
    });
    
    const topDevices = Object.values(deviceMap)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    
    container.innerHTML = topDevices.length > 0 ? topDevices.map((d, i) => `
        <div class="device-row">
            <div class="device-rank rank-${i < 3 ? 'gold' : i < 5 ? 'silver' : 'bronze'}">${i + 1}</div>
            <div class="flex-1">
                <div class="font-semibold text-sm">${d.name}</div>
                <div class="text-xs text-gray-500">${d.count} عمليات · ${formatCurrency(d.totalRevenue)}</div>
            </div>
        </div>
    `).join('') : '<p class="text-center text-gray-400 py-4">لا توجد بيانات كافية</p>';
}

function loadInventoryStatus() {
    const available = globalParts.filter(p => !p.min_quantity || p.quantity > p.min_quantity).length;
    const low = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity && p.quantity > 0).length;
    const out = globalParts.filter(p => p.quantity === 0).length;
    
    const container = document.getElementById('inventory-status');
    if (container) {
        container.innerHTML = `
            <div class="bg-emerald-50 rounded-xl p-4 text-center border border-emerald-200">
                <div class="text-2xl font-bold text-emerald-700">${available}</div>
                <div class="text-xs text-emerald-600">متوفر</div>
            </div>
            <div class="bg-amber-50 rounded-xl p-4 text-center border border-amber-200">
                <div class="text-2xl font-bold text-amber-700">${low}</div>
                <div class="text-xs text-amber-600">منخفض</div>
            </div>
            <div class="bg-red-50 rounded-xl p-4 text-center border border-red-200">
                <div class="text-2xl font-bold text-red-700">${out}</div>
                <div class="text-xs text-red-600">نافذ</div>
            </div>
        `;
    }
}

// تعريض الدوال الجديدة للنطاق العام
window.viewWalletTransactions = viewWalletTransactions;
