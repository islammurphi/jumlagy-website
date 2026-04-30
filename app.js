import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAuCRWWLB8X_querXJBIVfhc-yHpi8uSf8",
    authDomain: "jumlagy-erb-45356.firebaseapp.com",
    projectId: "jumlagy-erb-45356",
    storageBucket: "jumlagy-erb-45356.firebasestorage.app",
    messagingSenderId: "105796860104",
    appId: "1:105796860104:web:f1e1f6e167409758e10dfd"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ================================
// المتغيرات العامة
// ================================
let ownerId = null, isReordering = false, deleteTarget = null, charts = {};
let globalRepairs = [], globalParts = [], globalExpenses = [], globalWallets = [], globalTransactions = [], globalSubscriptions = [], globalUsers = [], globalSettings = {}, globalTechnicians = ['عان', 'تحن', 'قنب'];

// ================================
// حدود المحافظ التلقائية
// ================================
const walletLimits = {
    'vodafone':   { daily: 60000, monthly: 200000, max_balance: 100000, label: 'فودافون كاش' },
    'orange':     { daily: 60000, monthly: 200000, max_balance: 100000, label: 'أورانج كاش' },
    'etisalat':   { daily: 60000, monthly: 200000, max_balance: 100000, label: 'اتصالات كاش' },
    'we':         { daily: 60000, monthly: 200000, max_balance: 100000, label: 'وي كاش' },
    'bank':       { daily: 60000, monthly: 200000, max_balance: 100000, label: 'محفظة بنكية' },
    'instapay':   { daily: 120000, monthly: 400000, max_balance: 999999999, label: 'إنستاباي' },
};

// ================================
// دوال مساعدة
// ================================
function formatCurrency(amount) { return Number(amount || 0).toLocaleString('ar-EG') + ' ج.م'; }
function getStatusBadge(status) {
    const badges = { 'تم_التسليم': '<span class="badge badge-blue">تم التسليم</span>', 'قيد_الصيانة': '<span class="badge badge-amber">قيد الصيانة</span>', 'جاهز': '<span class="badge badge-green">جاهز للتسليم</span>' };
    return badges[status] || badges['قيد_الصيانة'];
}
function getDaysLeft(endDate) {
    if (!endDate) return '<span class="badge badge-gray">غير محدد</span>';
    const end = new Date(endDate), today = new Date();
    const diff = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `<span class="badge badge-red">منتهي منذ ${Math.abs(diff)} يوم</span>`;
    if (diff === 0) return '<span class="badge badge-red">ينتهي اليوم!</span>';
    if (diff <= 30) return `<span class="badge badge-amber">متبقي ${diff} يوم</span>`;
    return `<span class="badge badge-green">متبقي ${diff} يوم</span>`;
}
function showLoading() { const el = document.getElementById('loading-overlay'); if (el) el.classList.add('show'); }
function hideLoading() { const el = document.getElementById('loading-overlay'); if (el) el.classList.remove('show'); }
function showModal(id) { const el = document.getElementById(id); if (el) el.classList.add('show'); }
function hideModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('show'); }

// ================================
// التهيئة الرئيسية
// ================================
async function initApp() {
    showLoading();
    
    const session = JSON.parse(localStorage.getItem('jumlagy_session'));
    if (!session || !session.uid) {
        window.location.href = 'login.html';
        return;
    }
    
    ownerId = session.uid;
    
    // تحديث واجهة المستخدم
    const userName = document.getElementById('sidebar-user-name');
    const userRole = document.getElementById('sidebar-user-role');
    const userPhoto = document.getElementById('sidebar-user-photo');
    const currentDate = document.getElementById('current-date');
    
    if (userName) userName.textContent = session.name || 'مستخدم';
    if (userRole) userRole.textContent = session.role === 'admin' ? 'مدير النظام' : `مشترك - ${session.plan || ''}`;
    if (userPhoto) userPhoto.src = session.photo || '';
    if (currentDate) currentDate.textContent = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    // إخفاء أقسام المدير لغير المدير
    const isAdmin = session.role === 'admin';
    const subsLink = document.querySelector('[data-tab="subscriptions"]');
    if (subsLink) subsLink.style.display = isAdmin ? 'flex' : 'none';
    const usersCard = document.getElementById('users-manager-card');
    if (usersCard) usersCard.style.display = isAdmin ? 'block' : 'none';
    
    // ربط الأحداث
    bindEvents();
    
    // تحميل البيانات
    await loadAllData();
    
    // تحميل الواجهات
    loadDashboard();
    loadSettings();
    updateInvoicePreview();
    updateAlertsCount();
    checkSubscriptionBanner();
    
    hideLoading();
}

// ================================
// ربط الأحداث
// ================================
function bindEvents() {
    // أزرار القائمة الجانبية
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const tab = this.getAttribute('data-tab');
            switchTab(tab);
            if (window.innerWidth <= 768) {
                const sidebar = document.getElementById('sidebar');
                if (sidebar) sidebar.classList.remove('open');
            }
        });
    });
    
    // زر القائمة للجوال
    const menuToggle = document.getElementById('menu-toggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', function() {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.toggle('open');
        });
    }
    
    // زر تسجيل الخروج
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', logout);
    }
    
    // نماذج الحفظ
    const repairForm = document.getElementById('repair-form');
    if (repairForm) repairForm.addEventListener('submit', saveRepair);
    
    const partForm = document.getElementById('part-form');
    if (partForm) partForm.addEventListener('submit', savePart);
    
    const expenseForm = document.getElementById('expense-form');
    if (expenseForm) expenseForm.addEventListener('submit', saveExpense);
    
    const walletForm = document.getElementById('wallet-form');
    if (walletForm) walletForm.addEventListener('submit', saveWallet);
    
    const transactionForm = document.getElementById('transaction-form');
    if (transactionForm) transactionForm.addEventListener('submit', saveTransaction);
    
    const subscriptionForm = document.getElementById('subscription-form');
    if (subscriptionForm) subscriptionForm.addEventListener('submit', saveSubscription);
    
    // زر تأكيد الحذف
    const deleteConfirmBtn = document.getElementById('delete-confirm-btn');
    if (deleteConfirmBtn) deleteConfirmBtn.addEventListener('click', executeDelete);
    
    // أحداث الإعدادات
    const setShopName = document.getElementById('set-shop-name');
    if (setShopName) setShopName.addEventListener('input', updateInvoicePreview);
    
    const setOwnerName = document.getElementById('set-owner-name');
    if (setOwnerName) setOwnerName.addEventListener('input', updateInvoicePreview);
    
    const setPhone = document.getElementById('set-phone');
    if (setPhone) setPhone.addEventListener('input', updateInvoicePreview);
    
    const setAddress = document.getElementById('set-address');
    if (setAddress) setAddress.addEventListener('input', updateInvoicePreview);
}

// ================================
// دوال التنقل والخروج
// ================================
function switchTab(tab) {
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    const activeLink = document.querySelector(`[data-tab="${tab}"]`);
    if (activeLink) activeLink.classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const content = document.getElementById('tab-' + tab);
    if (content) content.classList.add('active');
    
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'repairs') loadRepairsTable();
    if (tab === 'inventory') loadInventoryTable();
    if (tab === 'expenses') loadExpensesTable();
    if (tab === 'customers') loadCustomersTable();
    if (tab === 'wallet') loadWallets();
    if (tab === 'reports') loadReports();
    if (tab === 'alerts') loadAlerts();
    if (tab === 'subscriptions') loadSubscriptions();
}

async function logout() {
    localStorage.removeItem('jumlagy_session');
    try { await signOut(auth); } catch(e) {}
    window.location.href = 'login.html';
}

function checkSubscriptionBanner() {
    const session = JSON.parse(localStorage.getItem('jumlagy_session'));
    if (!session || !session.end_date || session.role === 'admin') return;
    
    const banner = document.getElementById('subscription-banner');
    if (!banner) return;
    
    const endDate = new Date(session.end_date);
    const today = new Date();
    const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
    
    if (daysLeft <= 0) {
        banner.className = 'subscription-banner danger';
        banner.innerHTML = `⛔ انتهت صلاحية اشتراكك. <button class="btn-renew" onclick="window.location.href='login.html'">تجديد الاشتراك</button>`;
        banner.classList.remove('hidden');
    } else if (daysLeft <= 7) {
        banner.className = 'subscription-banner warning';
        banner.innerHTML = `⚠️ متبقي ${daysLeft} أيام على انتهاء اشتراكك. <button class="btn-renew" onclick="window.location.href='login.html'">تجديد الآن</button>`;
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}

// ================================
// تحميل البيانات من Firestore
// ================================
async function loadAllData() {
    if (!ownerId) return;
    
    try {
        const [repairsSnap, partsSnap, expensesSnap, walletsSnap, transactionsSnap, subscriptionsSnap, settingsDoc] = await Promise.all([
            getDocs(query(collection(db, "repairs"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "parts"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "expenses"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "wallets"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "transactions"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "subscriptions"), where("ownerId", "==", ownerId))),
            getDoc(doc(db, "settings", ownerId)),
        ]);
        
        globalRepairs = repairsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.receive_date || 0) - new Date(a.receive_date || 0));
        globalParts = partsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        globalExpenses = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        globalWallets = walletsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        globalTransactions = transactionsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        globalSubscriptions = subscriptionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        if (settingsDoc.exists()) {
            globalSettings = settingsDoc.data();
            globalTechnicians = globalSettings.technicians || ['عان', 'تحن', 'قنب'];
        } else {
            globalSettings = { shop_name: 'Jumlagy', owner_name: 'اسم حسن', phone: '01207696202', address: 'المقطم', warranty_days: 30, warranty_notes: 'ضمان 30 يوم', language: 'ar', technicians: globalTechnicians };
            await setDoc(doc(db, "settings", ownerId), globalSettings);
        }
        
        const session = JSON.parse(localStorage.getItem('jumlagy_session'));
        if (session?.role === 'admin') {
            const usersSnap = await getDocs(collection(db, "users"));
            globalUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
    } catch (error) {
        console.error("خطأ في تحميل البيانات:", error);
    }
}
// ================================
// 1. لوحة التحكم
// ================================
function loadDashboard() {
    const totalRevenue = globalRepairs.reduce((s, r) => s + (Number(r.repair_price) || 0), 0);
    const totalPartsCost = globalRepairs.reduce((s, r) => s + (Number(r.spare_part_cost) || 0), 0);
    const totalTechFees = globalRepairs.reduce((s, r) => s + (Number(r.technician_fee) || 0), 0);
    const totalExpenses = globalExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalCosts = totalPartsCost + totalTechFees + totalExpenses;
    const totalProfit = totalRevenue - totalCosts;
    const inventoryValue = globalParts.reduce((s, p) => s + (Number(p.purchase_price) || 0) * (Number(p.quantity) || 0), 0);
    
    const statsCards = document.getElementById('stats-cards');
    if (statsCards) {
        statsCards.innerHTML = `
            <div class="stat-card"><div class="stat-card-icon icon-blue"><i class="fas fa-dollar-sign"></i></div><p class="stat-card-title">إجمالي الإيرادات</p><p class="stat-card-value">${formatCurrency(totalRevenue)}</p></div>
            <div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-wrench"></i></div><p class="stat-card-title">إجمالي المصروفات</p><p class="stat-card-value">${formatCurrency(totalCosts)}</p><p class="stat-card-sub">قطع: ${formatCurrency(totalPartsCost)} | أخرى: ${formatCurrency(totalTechFees + totalExpenses)}</p></div>
            <div class="stat-card"><div class="stat-card-icon ${totalProfit >= 0 ? 'icon-green' : 'icon-red'}"><i class="fas fa-chart-line"></i></div><p class="stat-card-title">صافي الأرباح</p><p class="stat-card-value">${formatCurrency(totalProfit)}</p><p class="stat-card-sub">${totalProfit >= 0 ? '✅ رابح' : '⚠️ خاسر'}</p></div>
            <div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-box"></i></div><p class="stat-card-title">قيمة المخزون</p><p class="stat-card-value">${formatCurrency(inventoryValue)}</p><p class="stat-card-sub">${globalParts.length} صنف</p></div>
        `;
    }
    
    // حالة المخزون
    const available = globalParts.filter(p => !p.min_quantity || p.quantity > p.min_quantity).length;
    const low = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity && p.quantity > 0).length;
    const out = globalParts.filter(p => p.quantity === 0).length;
    
    const inventoryStatus = document.getElementById('inventory-status');
    if (inventoryStatus) {
        inventoryStatus.innerHTML = `
            <div class="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-200"><p class="text-2xl font-bold text-emerald-700">${available}</p><p class="text-xs text-emerald-600">متوفر</p></div>
            <div class="bg-amber-50 rounded-xl p-3 text-center border border-amber-200"><p class="text-2xl font-bold text-amber-700">${low}</p><p class="text-xs text-amber-600">منخفض</p></div>
            <div class="bg-red-50 rounded-xl p-3 text-center border border-red-200"><p class="text-2xl font-bold text-red-700">${out}</p><p class="text-xs text-red-600">نافذ</p></div>
        `;
    }
    
    // تنبيهات المخزون
    const lowParts = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity);
    let alertHTML = '';
    if (lowParts.length > 0) {
        alertHTML += '<div class="alert alert-warning text-sm mb-2">⚠️ قطع منخفضة المخزون:</div>';
        lowParts.forEach(p => alertHTML += `<div class="flex justify-between bg-amber-50 rounded-lg px-3 py-2 mb-1 text-sm"><span>${p.name}</span><span class="font-bold">${p.quantity} متبقي</span></div>`);
    } else {
        alertHTML = '<div class="alert alert-success text-sm">✅ جميع القطع متوفرة بكميات كافية</div>';
    }
    const outOfStockAlerts = document.getElementById('out-of-stock-alerts');
    if (outOfStockAlerts) outOfStockAlerts.innerHTML = alertHTML;
    
    // آخر أوامر الصيانة
    const recent = globalRepairs.slice(0, 5);
    const recentRepairs = document.getElementById('recent-repairs');
    if (recentRepairs) {
        recentRepairs.innerHTML = recent.length ? recent.map(r => `
            <div class="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-3">
                <div><p class="font-semibold text-sm">${r.device_name || 'غير محدد'}</p><p class="text-xs text-gray-500">${r.customer_name || 'غير معروف'}</p></div>
                <div class="flex items-center gap-3">${getStatusBadge(r.status)}<span class="font-bold text-blue-600 text-sm">${formatCurrency(r.repair_price)}</span></div>
            </div>
        `).join('') : '<p class="text-center text-gray-400 py-6">لا توجد أوامر صيانة بعد</p>';
    }
    
    // إدارة المستخدمين
    const usersManager = document.getElementById('users-manager');
    if (usersManager && globalUsers.length > 0) {
        usersManager.innerHTML = globalUsers.map(u => `
            <div class="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2 mb-2">
                <span class="font-medium text-sm">${u.fullName || u.name || u.email}</span>
                <span class="text-xs text-gray-500">${u.email}</span>
                <span class="badge ${u.role === 'admin' ? 'badge-blue' : 'badge-gray'}">${u.role === 'admin' ? 'مدير' : 'مستخدم'}</span>
                <span class="text-xs text-gray-500">${u.subscriptionType || u.subscription?.plan || '-'} - ${u.subscriptionEnd || u.subscription?.end_date || ''}</span>
            </div>
        `).join('');
    }
    
    setTimeout(loadDashboardCharts, 300);
}

function loadDashboardCharts() {
    const ordersCtx = document.getElementById('ordersStatusChart');
    const incomeCtx = document.getElementById('incomeExpenseChart');
    if (!ordersCtx || !incomeCtx) return;
    if (typeof Chart === 'undefined') return;
    
    const statusCounts = {
        'تم_التسليم': globalRepairs.filter(r => r.status === 'تم_التسليم').length,
        'قيد_الصيانة': globalRepairs.filter(r => r.status === 'قيد_الصيانة').length,
        'جاهز': globalRepairs.filter(r => r.status === 'جاهز').length
    };
    
    if (charts.orders) charts.orders.destroy();
    charts.orders = new Chart(ordersCtx, {
        type: 'doughnut',
        data: {
            labels: ['تم التسليم', 'قيد الصيانة', 'جاهز للتسليم'],
            datasets: [{ data: [statusCounts['تم_التسليم'], statusCounts['قيد_الصيانة'], statusCounts['جاهز']], backgroundColor: ['#3b82f6', '#f59e0b', '#10b981'], borderWidth: 0 }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Tajawal', size: 12 } } } } }
    });
    
    if (charts.income) charts.income.destroy();
    charts.income = new Chart(incomeCtx, {
        type: 'line',
        data: {
            labels: ['نوفمبر', 'ديسمبر', 'يناير', 'فبراير', 'مارس', 'أبريل'],
            datasets: [
                { label: 'الإيرادات', data: [3000, 4500, 6000, 7000, 8000, 9130], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', fill: true, tension: 0.4 },
                { label: 'المصاريف', data: [400, 300, 500, 200, 300, 55], borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)', fill: true, tension: 0.4 }
            ]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Tajawal', size: 12 } } } }, scales: { y: { ticks: { callback: v => v.toLocaleString() } } } }
    });
}

// ================================
// 2. أوامر الصيانة
// ================================
function openRepairForm(repairId = null) {
    showModal('repair-modal');
    const form = document.getElementById('repair-form');
    if (form) form.reset();
    
    const receiveDate = document.getElementById('repair-receive-date');
    if (receiveDate) receiveDate.value = new Date().toISOString().split('T')[0];
    
    updateTechSelects();
    
    if (repairId) {
        const r = globalRepairs.find(r => r.id === repairId);
        if (r) {
            const title = document.getElementById('repair-modal-title');
            if (title) title.textContent = 'تعديل أمر صيانة';
            
            setField('repair-id', r.id);
            setField('repair-customer-name', r.customer_name);
            setField('repair-customer-phone', r.customer_phone);
            setField('repair-device-name', r.device_name);
            setField('repair-technician', r.technician);
            setField('repair-status', r.status);
            setField('repair-price', r.repair_price);
            setField('repair-tech-fee', r.technician_fee);
            setField('repair-part-name', r.spare_part_name);
            setField('repair-part-cost', r.spare_part_cost);
            setField('repair-receive-date', r.receive_date);
            setField('repair-delivery-date', r.delivery_date);
            setField('repair-issue', r.device_issue);
            setField('repair-notes', r.notes);
        }
    } else {
        const title = document.getElementById('repair-modal-title');
        if (title) title.textContent = 'أمر صيانة جديد';
        const idField = document.getElementById('repair-id');
        if (idField) idField.value = '';
    }
}

function setField(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
}

function closeRepairForm() { hideModal('repair-modal'); }

async function saveRepair(e) {
    e.preventDefault();
    showLoading();
    const id = document.getElementById('repair-id')?.value;
    const data = {
        device_name: document.getElementById('repair-device-name')?.value,
        customer_name: document.getElementById('repair-customer-name')?.value,
        customer_phone: document.getElementById('repair-customer-phone')?.value,
        technician: document.getElementById('repair-technician')?.value,
        status: document.getElementById('repair-status')?.value || 'قيد_الصيانة',
        repair_price: Number(document.getElementById('repair-price')?.value) || 0,
        technician_fee: Number(document.getElementById('repair-tech-fee')?.value) || 0,
        spare_part_name: document.getElementById('repair-part-name')?.value,
        spare_part_cost: Number(document.getElementById('repair-part-cost')?.value) || 0,
        receive_date: document.getElementById('repair-receive-date')?.value,
        delivery_date: document.getElementById('repair-delivery-date')?.value || null,
        device_issue: document.getElementById('repair-issue')?.value,
        notes: document.getElementById('repair-notes')?.value,
        ownerId: ownerId,
    };
    try {
        if (id) { await updateDoc(doc(db, "repairs", id), data); }
        else { await addDoc(collection(db, "repairs"), data); }
        await loadAllData();
        closeRepairForm();
        loadRepairsTable();
        loadDashboard();
        updateAlertsCount();
    } catch (error) { console.error("خطأ في حفظ أمر الصيانة:", error); }
    hideLoading();
}

function loadRepairsTable() {
    const search = (document.getElementById('repair-search')?.value || '').toLowerCase();
    const filter = document.getElementById('repair-filter')?.value || 'all';
    let filtered = globalRepairs.filter(r => {
        const matchSearch = !search || r.device_name?.toLowerCase().includes(search) || r.customer_name?.toLowerCase().includes(search);
        const matchStatus = filter === 'all' || r.status === filter;
        return matchSearch && matchStatus;
    });
    
    const countEl = document.getElementById('repairs-count');
    if (countEl) countEl.textContent = `${globalRepairs.length} أمر صيانة`;
    
    const tableContainer = document.getElementById('repairs-table-container');
    if (tableContainer) {
        tableContainer.innerHTML = `
            <div class="table-responsive"><table><thead><tr>
                <th>الجهاز</th><th>العميل</th><th>الفني</th><th>الحالة</th><th>السعر</th><th>تاريخ الاستلام</th><th>إجراءات</th>
            </tr></thead><tbody>${filtered.length ? filtered.map(r => `
                <tr>
                    <td class="font-semibold">${r.device_name || '-'}</td>
                    <td>${r.customer_name || '-'}<br><span class="text-xs text-gray-400">${r.customer_phone || ''}</span></td>
                    <td>${r.technician || '-'}</td><td>${getStatusBadge(r.status)}</td>
                    <td class="font-bold text-blue-600">${formatCurrency(r.repair_price)}</td>
                    <td class="text-sm">${r.receive_date || '-'}</td>
                    <td>
                        <button class="btn-icon" onclick="openRepairForm('${r.id}')" title="تعديل"><i class="fas fa-pen"></i></button>
                        <button class="btn-icon text-red" onclick="confirmDelete('repair','${r.id}')" title="حذف"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`).join('') : '<tr><td colspan="7" class="text-center py-6 text-gray-400">لا توجد أوامر صيانة</td></tr>'}</tbody></table></div>
        `;
    }
}

function openBarcodeScanner() { alert('خاصية مسح الباركود تتطلب كاميرا. سيتم تفعيلها في النسخة النهائية.'); }

// ================================
// 3. المخزون
// ================================
function openPartForm(partId = null) {
    showModal('part-modal');
    const form = document.getElementById('part-form');
    if (form) form.reset();
    
    if (partId) {
        const p = globalParts.find(p => p.id === partId);
        if (p) {
            const title = document.getElementById('part-modal-title');
            if (title) title.textContent = 'تعديل قطعة غيار';
            setField('part-id', p.id);
            setField('part-name', p.name);
            setField('part-category', p.category);
            setField('part-purchase-price', p.purchase_price);
            setField('part-selling-price', p.selling_price);
            setField('part-quantity', p.quantity);
            setField('part-min-quantity', p.min_quantity);
            setField('part-supplier', p.supplier);
        }
    } else {
        const title = document.getElementById('part-modal-title');
        if (title) title.textContent = 'إضافة قطعة غيار';
        const idField = document.getElementById('part-id');
        if (idField) idField.value = '';
    }
}

function closePartForm() { hideModal('part-modal'); }

async function savePart(e) {
    e.preventDefault();
    showLoading();
    const id = document.getElementById('part-id')?.value;
    const data = {
        name: document.getElementById('part-name')?.value,
        category: document.getElementById('part-category')?.value,
        purchase_price: Number(document.getElementById('part-purchase-price')?.value) || 0,
        selling_price: Number(document.getElementById('part-selling-price')?.value) || 0,
        quantity: Number(document.getElementById('part-quantity')?.value) || 0,
        min_quantity: Number(document.getElementById('part-min-quantity')?.value) || 0,
        supplier: document.getElementById('part-supplier')?.value,
        ownerId: ownerId,
    };
    try {
        if (id) { await updateDoc(doc(db, "parts", id), data); }
        else { await addDoc(collection(db, "parts"), data); }
        await loadAllData();
        closePartForm();
        loadInventoryTable();
        loadDashboard();
        updateAlertsCount();
    } catch (error) { console.error("خطأ في حفظ قطعة الغيار:", error); }
    hideLoading();
}

function loadInventoryTable() {
    const search = (document.getElementById('part-search')?.value || '').toLowerCase();
    const filtered = globalParts.filter(p => !search || p.name?.toLowerCase().includes(search) || p.category?.toLowerCase().includes(search) || p.supplier?.toLowerCase().includes(search));
    const totalValue = globalParts.reduce((s, p) => s + (Number(p.purchase_price) || 0) * (Number(p.quantity) || 0), 0);
    const totalItems = globalParts.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    
    const countEl = document.getElementById('inventory-count');
    if (countEl) countEl.textContent = `${globalParts.length} صنف - ${totalItems} قطعة`;
    
    const summaryEl = document.getElementById('inventory-summary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-box"></i></div><p class="stat-card-title">قيمة المخزون</p><p class="stat-card-value">${formatCurrency(totalValue)}</p></div>
            <div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-cubes"></i></div><p class="stat-card-title">إجمالي القطع</p><p class="stat-card-value">${totalItems}</p></div>
        `;
    }
    
    const tableContainer = document.getElementById('inventory-table-container');
    if (tableContainer) {
        tableContainer.innerHTML = `
            <div class="table-responsive"><table><thead><tr>
                <th>القطعة</th><th>التصنيف</th><th>سعر الشراء</th><th>سعر البيع</th><th>الكمية</th><th>المورد</th><th>إجراءات</th>
            </tr></thead><tbody>${filtered.length ? filtered.map(p => `
                <tr>
                    <td class="font-semibold">${p.name || '-'}</td><td><span class="badge badge-gray">${p.category || 'أخرى'}</span></td>
                    <td>${formatCurrency(p.purchase_price)}</td><td>${p.selling_price ? formatCurrency(p.selling_price) : '-'}</td>
                    <td class="font-bold ${p.min_quantity && p.quantity <= p.min_quantity ? 'text-amber-600' : ''}">${p.quantity} ${p.min_quantity && p.quantity <= p.min_quantity ? '⚠️' : ''}</td>
                    <td>${p.supplier || '-'}</td>
                    <td>
                        <button class="btn-icon" onclick="openPartForm('${p.id}')"><i class="fas fa-pen"></i></button>
                        <button class="btn-icon text-red" onclick="confirmDelete('part','${p.id}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`).join('') : '<tr><td colspan="7" class="text-center py-6 text-gray-400">لا توجد قطع غيار</td></tr>'}</tbody></table></div>
        `;
    }
}

// ================================
// 4. المصاريف
// ================================
function openExpenseForm(expenseId = null) {
    showModal('expense-modal');
    const form = document.getElementById('expense-form');
    if (form) form.reset();
    
    const dateField = document.getElementById('expense-date');
    if (dateField) dateField.value = new Date().toISOString().split('T')[0];
    
    if (expenseId) {
        const e = globalExpenses.find(e => e.id === expenseId);
        if (e) {
            const title = document.getElementById('expense-modal-title');
            if (title) title.textContent = 'تعديل مصروف';
            setField('expense-id', e.id);
            setField('expense-title', e.title);
            setField('expense-category', e.category);
            setField('expense-amount', e.amount);
            setField('expense-date', e.date);
            setField('expense-notes', e.notes);
        }
    } else {
        const title = document.getElementById('expense-modal-title');
        if (title) title.textContent = 'إضافة مصروف';
        const idField = document.getElementById('expense-id');
        if (idField) idField.value = '';
    }
}

function closeExpenseForm() { hideModal('expense-modal'); }

async function saveExpense(e) {
    e.preventDefault();
    showLoading();
    const id = document.getElementById('expense-id')?.value;
    const data = {
        title: document.getElementById('expense-title')?.value,
        category: document.getElementById('expense-category')?.value,
        amount: Number(document.getElementById('expense-amount')?.value) || 0,
        date: document.getElementById('expense-date')?.value,
        notes: document.getElementById('expense-notes')?.value,
        ownerId: ownerId,
    };
    try {
        if (id) { await updateDoc(doc(db, "expenses", id), data); }
        else { await addDoc(collection(db, "expenses"), data); }
        await loadAllData();
        closeExpenseForm();
        loadExpensesTable();
        loadDashboard();
    } catch (error) { console.error("خطأ في حفظ المصروف:", error); }
    hideLoading();
}

function loadExpensesTable() {
    const search = (document.getElementById('expense-search')?.value || '').toLowerCase();
    const cat = document.getElementById('expense-cat-filter')?.value || 'الكل';
    const filtered = globalExpenses.filter(e => {
        const matchSearch = !search || e.title?.toLowerCase().includes(search);
        const matchCat = cat === 'الكل' || e.category === cat;
        return matchSearch && matchCat;
    });
    const total = globalExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    
    const countEl = document.getElementById('expenses-count');
    if (countEl) countEl.textContent = `${globalExpenses.length} مصروف — إجمالي: ${formatCurrency(total)}`;
    
    const summaryEl = document.getElementById('expenses-summary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-receipt"></i></div><p class="stat-card-title">إجمالي المصاريف</p><p class="stat-card-value">${formatCurrency(total)}</p></div>
        `;
    }
    
    const listEl = document.getElementById('expenses-list');
    if (listEl) {
        listEl.innerHTML = filtered.length ? filtered.map(e => `
            <div class="card"><div class="card-body"><div class="flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <div class="p-2 rounded-lg bg-gray-100"><i class="fas fa-receipt text-gray-500"></i></div>
                    <div><p class="font-semibold">${e.title || 'بدون عنوان'}</p><p class="text-xs text-gray-500">${e.date || ''} · ${e.category || 'أخرى'}${e.notes ? ' — ' + e.notes : ''}</p></div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="font-bold text-red-600">${formatCurrency(e.amount)}</span>
                    <button class="btn-icon" onclick="openExpenseForm('${e.id}')"><i class="fas fa-pen"></i></button>
                    <button class="btn-icon text-red" onclick="confirmDelete('expense','${e.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div></div></div>
        `).join('') : '<p class="text-center text-gray-400 py-10">لا توجد مصاريف</p>';
    }
}

// ================================
// 5. العملاء
// ================================
function loadCustomersTable() {
    const search = (document.getElementById('customer-search')?.value || '').toLowerCase();
    const customerMap = {};
    globalRepairs.forEach(r => {
        const key = r.customer_phone || r.customer_name;
        if (!customerMap[key]) customerMap[key] = { name: r.customer_name, phone: r.customer_phone, repairs: [], totalPaid: 0, lastDate: null };
        customerMap[key].repairs.push(r);
        customerMap[key].totalPaid += (Number(r.repair_price) || 0);
        const d = r.receive_date ? new Date(r.receive_date) : new Date();
        if (!customerMap[key].lastDate || d > customerMap[key].lastDate) customerMap[key].lastDate = d;
    });
    
    let customers = Object.values(customerMap).map((c, idx) => ({
        ...c, id: idx,
        lastVisit: c.lastDate ? c.lastDate.toISOString().split('T')[0] : '-',
    })).sort((a, b) => (b.lastDate || 0) - (a.lastDate || 0));
    
    if (search) customers = customers.filter(c => c.name?.toLowerCase().includes(search) || c.phone?.includes(search));
    
    const totalRevenue = customers.reduce((s, c) => s + c.totalPaid, 0);
    const topCustomer = [...customers].sort((a, b) => b.repairs.length - a.repairs.length)[0];
    
    const countEl = document.getElementById('customers-count');
    if (countEl) countEl.textContent = `${customers.length} عميل مسجل`;
    
    const summaryEl = document.getElementById('customers-summary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="stat-card"><div class="stat-card-icon icon-blue"><i class="fas fa-users"></i></div><p class="stat-card-title">إجمالي العملاء</p><p class="stat-card-value">${customers.length}</p></div>
            <div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-dollar-sign"></i></div><p class="stat-card-title">إجمالي الإيرادات</p><p class="stat-card-value">${formatCurrency(totalRevenue)}</p></div>
            ${topCustomer ? `<div class="stat-card"><div class="stat-card-icon icon-amber"><i class="fas fa-star"></i></div><p class="stat-card-title">الأكثر تعاملاً</p><p class="stat-card-value text-lg">${topCustomer.name}</p><p class="stat-card-sub">${topCustomer.repairs.length} جهاز</p></div>` : ''}
        `;
    }
    
    const listEl = document.getElementById('customers-list');
    if (listEl) {
        listEl.innerHTML = customers.length ? customers.map(c => `
            <div class="card customer-card" onclick="toggleCustomerRepairs(${c.id})">
                <div class="card-body">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><i class="fas fa-user text-blue-600"></i></div>
                            <div><p class="font-bold">${c.name || 'غير معروف'}</p><p class="text-sm text-gray-500">📞 ${c.phone || '-'}</p></div>
                        </div>
                        <div class="flex items-center gap-4">
                            <div class="text-center"><p class="text-xs text-gray-400">عدد الأجهزة</p><p class="font-bold">${c.repairs.length}</p></div>
                            <div class="text-center"><p class="text-xs text-gray-400">إجمالي المدفوع</p><p class="font-bold text-blue-600">${formatCurrency(c.totalPaid)}</p></div>
                            <div class="text-center"><p class="text-xs text-gray-400">آخر زيارة</p><p class="text-sm">${c.lastVisit}</p></div>
                            <i class="fas fa-chevron-down text-gray-400" id="customer-chevron-${c.id}"></i>
                        </div>
                    </div>
                    <div class="customer-repairs mt-3 pt-3 hidden" id="customer-repairs-${c.id}">
                        <p class="text-xs font-bold text-gray-500 mb-2">سجل الصيانة</p>
                        ${c.repairs.map(r => `
                            <div class="customer-repair-item">
                                <div class="flex justify-between items-center">
                                    <div><p class="font-semibold text-sm">${r.device_name || 'جهاز'}</p><p class="text-xs text-gray-500">${r.receive_date || ''} · ${r.technician || ''}</p></div>
                                    <div class="flex items-center gap-2">${getStatusBadge(r.status)}<span class="font-bold text-blue-600">${formatCurrency(r.repair_price)}</span></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `).join('') : '<p class="text-center text-gray-400 py-10">لا يوجد عملاء</p>';
    }
}

function toggleCustomerRepairs(id) {
    const div = document.getElementById('customer-repairs-' + id);
    const chevron = document.getElementById('customer-chevron-' + id);
    if (div) {
        div.classList.toggle('hidden');
        if (chevron) { chevron.classList.toggle('fa-chevron-down'); chevron.classList.toggle('fa-chevron-up'); }
    }
}
// ================================
// 10. الإعدادات
// ================================
function loadSettings() {
    setField('set-shop-name', globalSettings.shop_name || '');
    setField('set-owner-name', globalSettings.owner_name || '');
    setField('set-phone', globalSettings.phone || '');
    setField('set-address', globalSettings.address || '');
    setField('set-warranty-days', globalSettings.warranty_days || 30);
    setField('set-warranty-notes', globalSettings.warranty_notes || '');
    setField('set-language', globalSettings.language || 'ar');
    renderTechnicians();
    updateInvoicePreview();
}

function renderTechnicians() {
    const list = document.getElementById('technicians-list');
    if (!list) return;
    list.innerHTML = globalTechnicians.length ? globalTechnicians.map((t, i) => `
        <div class="flex justify-between items-center bg-gray-50 rounded-lg p-3 mb-2">
            <span class="font-medium">${t}</span>
            <button class="btn-icon text-red" onclick="removeTechnician(${i})"><i class="fas fa-trash"></i></button>
        </div>
    `).join('') : '<p class="text-sm text-gray-500">لم تضف فنيين بعد</p>';
}

function addTechnician() {
    const input = document.getElementById('new-technician');
    if (input && input.value.trim()) { 
        globalTechnicians.push(input.value.trim()); 
        input.value = ''; 
        renderTechnicians(); 
        updateTechSelects(); 
    }
}

function removeTechnician(index) { 
    globalTechnicians.splice(index, 1); 
    renderTechnicians(); 
    updateTechSelects(); 
}

function updateTechSelects() {
    const select = document.getElementById('repair-technician');
    if (select) select.innerHTML = globalTechnicians.map(t => `<option value="${t}">${t}</option>`).join('');
}

function updateInvoicePreview() {
    const setShopName = document.getElementById('set-shop-name');
    const setOwnerName = document.getElementById('set-owner-name');
    const setPhone = document.getElementById('set-phone');
    const setAddress = document.getElementById('set-address');
    
    const previewShopName = document.getElementById('preview-shop-name');
    const previewOwner = document.getElementById('preview-owner');
    const previewPhone = document.getElementById('preview-phone');
    const previewAddress = document.getElementById('preview-address');
    
    if (previewShopName) previewShopName.textContent = (setShopName?.value) || 'اسم المحل';
    if (previewOwner) previewOwner.textContent = (setOwnerName?.value) || '';
    if (previewPhone) previewPhone.textContent = (setPhone?.value) ? '📞 ' + setPhone.value : '';
    if (previewAddress) previewAddress.textContent = (setAddress?.value) ? '📍 ' + setAddress.value : '';
}

async function saveSettings() {
    globalSettings.shop_name = document.getElementById('set-shop-name')?.value || '';
    globalSettings.owner_name = document.getElementById('set-owner-name')?.value || '';
    globalSettings.phone = document.getElementById('set-phone')?.value || '';
    globalSettings.address = document.getElementById('set-address')?.value || '';
    globalSettings.warranty_days = parseInt(document.getElementById('set-warranty-days')?.value) || 30;
    globalSettings.warranty_notes = document.getElementById('set-warranty-notes')?.value || '';
    globalSettings.language = document.getElementById('set-language')?.value || 'ar';
    globalSettings.technicians = globalTechnicians;
    try {
        await setDoc(doc(db, "settings", ownerId), globalSettings);
        alert('✅ تم حفظ الإعدادات بنجاح');
    } catch (error) {
        console.error("خطأ في حفظ الإعدادات:", error);
    }
}

// ================================
// تأكيد الحذف
// ================================
function confirmDelete(type, id) {
    deleteTarget = { type, id };
    const labels = { repair: 'أمر الصيانة', part: 'قطعة الغيار', expense: 'المصروف', wallet: 'المحفظة', subscription: 'الاشتراك' };
    let name = '';
    if (type === 'repair') name = globalRepairs.find(i => i.id === id)?.device_name;
    if (type === 'part') name = globalParts.find(i => i.id === id)?.name;
    if (type === 'expense') name = globalExpenses.find(i => i.id === id)?.title;
    if (type === 'wallet') name = globalWallets.find(i => i.id === id)?.name;
    if (type === 'subscription') name = globalSubscriptions.find(i => i.id === id)?.customer_name;
    
    const deleteMsg = document.getElementById('delete-message');
    if (deleteMsg) deleteMsg.textContent = `هل أنت متأكد من حذف ${labels[type] || ''} "${name || ''}"؟ لا يمكن التراجع عن هذا.`;
    showModal('delete-modal');
}

function closeDeleteModal() { hideModal('delete-modal'); deleteTarget = null; }

async function executeDelete() {
    if (!deleteTarget) return;
    const { type, id } = deleteTarget;
    try {
        if (type === 'repair') await deleteDoc(doc(db, "repairs", id));
        if (type === 'part') await deleteDoc(doc(db, "parts", id));
        if (type === 'expense') await deleteDoc(doc(db, "expenses", id));
        if (type === 'wallet') { await deleteDoc(doc(db, "wallets", id)); }
        if (type === 'subscription') await deleteDoc(doc(db, "subscriptions", id));
        
        await loadAllData();
        closeDeleteModal();
        loadDashboard();
        updateAlertsCount();
        
        const activeTab = document.querySelector('.tab-content.active')?.id?.replace('tab-', '');
        if (activeTab === 'repairs') loadRepairsTable();
        if (activeTab === 'inventory') loadInventoryTable();
        if (activeTab === 'expenses') loadExpensesTable();
        if (activeTab === 'wallet') loadWallets();
        if (activeTab === 'subscriptions') loadSubscriptions();
    } catch (error) { console.error("خطأ في الحذف:", error); }
}

// ================================
// تعريض الدوال للنطاق العام
// ================================
window.formatCurrency = formatCurrency;
window.getStatusBadge = getStatusBadge;
window.getDaysLeft = getDaysLeft;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showModal = showModal;
window.hideModal = hideModal;
window.switchTab = switchTab;
window.logout = logout;
window.openRepairForm = openRepairForm;
window.closeRepairForm = closeRepairForm;
window.openPartForm = openPartForm;
window.closePartForm = closePartForm;
window.openExpenseForm = openExpenseForm;
window.closeExpenseForm = closeExpenseForm;
window.openWalletModal = openWalletModal;
window.closeWalletModal = closeWalletModal;
window.openTransactionModal = openTransactionModal;
window.closeTransactionModal = closeTransactionModal;
window.openSubscriptionModal = openSubscriptionModal;
window.closeSubscriptionModal = closeSubscriptionModal;
window.onWalletTypeChange = onWalletTypeChange;
window.onLinkedUserChange = onLinkedUserChange;
window.onSubscriptionPlanChange = onSubscriptionPlanChange;
window.renewSubscription = renewSubscription;
window.addTechnician = addTechnician;
window.removeTechnician = removeTechnician;
window.saveSettings = saveSettings;
window.confirmDelete = confirmDelete;
window.closeDeleteModal = closeDeleteModal;
window.openBarcodeScanner = openBarcodeScanner;
window.toggleCustomerRepairs = toggleCustomerRepairs;
window.toggleReorder = toggleReorder;

// ================================
// بدء التطبيق
// ================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
