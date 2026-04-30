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
// عرض دوال مساعدة في window فوراً
// ================================
window.showModal = function(id) { const el = document.getElementById(id); if (el) el.classList.add('show'); };
window.hideModal = function(id) { const el = document.getElementById(id); if (el) el.classList.remove('show'); };

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

// ================================
// التهيئة الرئيسية
// ================================
async function initApp() {
    showLoading();
    
    // ثقة في الجلسة من login.html
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
    
    // إخفاء صفحة الاشتراكات لغير الأدمن
    const isAdmin = session.role === 'admin';
    const subsLink = document.querySelector('[data-tab="subscriptions"]');
    if (subsLink) subsLink.style.display = isAdmin ? 'flex' : 'none';
    
    // إظهار/إخفاء كارت إدارة المستخدمين
    const usersCard = document.getElementById('users-manager-card');
    if (usersCard) usersCard.style.display = isAdmin ? 'block' : 'none';
    
    // ربط أحداث الشريط الجانبي
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
    
    // ربط النماذج
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
    if (deleteConfirmBtn) {
        deleteConfirmBtn.addEventListener('click', executeDelete);
    }
    
    // أحداث الإعدادات
    const setShopName = document.getElementById('set-shop-name');
    if (setShopName) setShopName.addEventListener('input', updateInvoicePreview);
    const setOwnerName = document.getElementById('set-owner-name');
    if (setOwnerName) setOwnerName.addEventListener('input', updateInvoicePreview);
    const setPhone = document.getElementById('set-phone');
    if (setPhone) setPhone.addEventListener('input', updateInvoicePreview);
    const setAddress = document.getElementById('set-address');
    if (setAddress) setAddress.addEventListener('input', updateInvoicePreview);
    
    // تحميل البيانات
    await loadAllData();
    
    // إضافة بيانات تجريبية لأول مرة
    await seedDemoData();
    
    // تحميل الواجهات
    loadDashboard();
    loadSettings();
    updateInvoicePreview();
    updateAlertsCount();
    checkSubscriptionBanner();
    
    hideLoading();
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

function toggleReorder() {
    isReordering = !isReordering;
    const btnReorder = document.getElementById('btn-reorder');
    if (btnReorder) {
        btnReorder.innerHTML = isReordering ? '<i class="fas fa-check"></i> حفظ الترتيب' : '<i class="fas fa-grip-vertical"></i> تعديل الأقسام';
        btnReorder.className = isReordering ? 'btn-primary btn-sm' : 'btn-outline btn-sm';
    }
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
        
        // تحميل المستخدمين (للأدمن فقط)
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
// بيانات تجريبية (لأول مرة فقط)
// ================================
async function seedDemoData() {
    if (!ownerId) return;
    
    // التحقق من وجود بيانات سابقة
    if (globalRepairs.length > 0) return;
    
    const demoRepairs = [
        { device_name: 'iPhone 14 Pro Max', customer_name: 'أحمد محمد', customer_phone: '01001234567', technician: 'علي', status: 'تم_التسليم', repair_price: 2500, technician_fee: 500, spare_part_name: 'شاشة OLED', spare_part_cost: 1500, receive_date: '2026-04-01', delivery_date: '2026-04-03', device_issue: 'شاشة مكسورة', notes: 'تم تغيير الشاشة بنجاح', ownerId },
        { device_name: 'Samsung S24 Ultra', customer_name: 'محمود علي', customer_phone: '01007654321', technician: 'محمد', status: 'قيد_الصيانة', repair_price: 1800, technician_fee: 300, spare_part_name: 'بطارية', spare_part_cost: 800, receive_date: '2026-04-20', delivery_date: null, device_issue: 'بطارية ضعيفة', notes: 'انتظار قطعة الغيار', ownerId },
        { device_name: 'iPad Air 5', customer_name: 'سارة حسن', customer_phone: '01001112233', technician: 'أحمد', status: 'جاهز', repair_price: 1200, technician_fee: 250, spare_part_name: 'شاحن تايب سي', spare_part_cost: 300, receive_date: '2026-04-18', delivery_date: '2026-04-22', device_issue: 'لا يشحن', notes: 'تم إصلاح منفذ الشحن', ownerId },
        { device_name: 'MacBook Pro 2023', customer_name: 'خالد عبدالله', customer_phone: '01009998877', technician: 'علي', status: 'تم_التسليم', repair_price: 3500, technician_fee: 800, spare_part_name: 'لوحة مفاتيح', spare_part_cost: 2000, receive_date: '2026-03-15', delivery_date: '2026-03-18', device_issue: 'أزرار لوحة المفاتيح لا تعمل', notes: 'تم تغيير اللوحة بالكامل', ownerId },
    ];
    
    const demoParts = [
        { name: 'شاشة iPhone 14', category: 'شاشات', purchase_price: 1200, selling_price: 2500, quantity: 5, min_quantity: 2, supplier: 'مورد الشاشات', ownerId },
        { name: 'بطارية Samsung', category: 'بطاريات', purchase_price: 300, selling_price: 800, quantity: 10, min_quantity: 3, supplier: 'مورد البطاريات', ownerId },
        { name: 'شاحن USB-C', category: 'شواحن', purchase_price: 100, selling_price: 300, quantity: 20, min_quantity: 5, supplier: 'مورد الشواحن', ownerId },
    ];
    
    const demoExpenses = [
        { title: 'إيجار المحل', category: 'إيجار', amount: 3000, date: '2026-04-01', notes: 'إيجار شهر أبريل', ownerId },
        { title: 'فاتورة الكهرباء', category: 'كهرباء', amount: 450, date: '2026-04-05', notes: '', ownerId },
    ];
    
    try {
        for (const repair of demoRepairs) { await addDoc(collection(db, "repairs"), repair); }
        for (const part of demoParts) { await addDoc(collection(db, "parts"), part); }
        for (const expense of demoExpenses) { await addDoc(collection(db, "expenses"), expense); }
        console.log('✅ تمت إضافة البيانات التجريبية بنجاح');
        await loadAllData();
        loadDashboard();
    } catch (e) {
        console.error('خطأ في إضافة البيانات التجريبية:', e);
    }
}

// ================================
// إدارة صلاحيات المستخدمين (للأدمن فقط)
// ================================
function loadUsersManager() {
    const session = JSON.parse(localStorage.getItem('jumlagy_session'));
    if (session?.role !== 'admin') {
        const usersCard = document.getElementById('users-manager-card');
        if (usersCard) usersCard.style.display = 'none';
        return;
    }
    
    const container = document.getElementById('users-manager');
    if (!container) return;
    
    container.innerHTML = `
        <p class="text-sm font-bold text-gray-500 mb-3">إدارة صلاحيات المستخدمين</p>
        <div class="space-y-2">
            ${globalUsers.length > 0 ? globalUsers.map(u => `
                <div class="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2">
                    <div>
                        <span class="font-medium text-sm">${u.fullName || u.name || u.email}</span>
                        <span class="text-xs text-gray-500 block">${u.email}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="badge ${u.isApproved ? 'badge-green' : 'badge-red'} text-xs">
                            ${u.isApproved ? 'مفعل' : 'غير مفعل'}
                        </span>
                        ${u.role !== 'admin' ? `
                            <button class="btn-xs ${u.isApproved ? 'btn-danger' : 'btn-primary'}" 
                                onclick="toggleUserApproval('${u.id}', ${u.isApproved})">
                                ${u.isApproved ? 'حظر' : 'تفعيل'}
                            </button>
                        ` : '<span class="badge badge-blue text-xs">مدير</span>'}
                    </div>
                </div>
            `).join('') : '<p class="text-center text-gray-400 py-6">لا يوجد مستخدمين مسجلين</p>'}
        </div>
    `;
}

async function toggleUserApproval(userId, currentStatus) {
    try {
        const newStatus = !currentStatus;
        await updateDoc(doc(db, "users", userId), { 
            isApproved: newStatus,
            status: newStatus ? 'active' : 'pending'
        });
        await loadAllData();
        loadUsersManager();
        alert(newStatus ? '✅ تم تفعيل المستخدم بنجاح' : '🚫 تم حظر المستخدم');
    } catch (error) {
        console.error("خطأ في تغيير صلاحية المستخدم:", error);
        alert('❌ حدث خطأ في تغيير الصلاحية');
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
    
    // إدارة المستخدمين (للأدمن فقط)
    loadUsersManager();
    
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
            document.getElementById('repair-id').value = r.id;
            document.getElementById('repair-customer-name').value = r.customer_name || '';
            document.getElementById('repair-customer-phone').value = r.customer_phone || '';
            document.getElementById('repair-device-name').value = r.device_name || '';
            document.getElementById('repair-technician').value = r.technician || '';
            document.getElementById('repair-status').value = r.status || 'قيد_الصيانة';
            document.getElementById('repair-price').value = r.repair_price || 0;
            document.getElementById('repair-tech-fee').value = r.technician_fee || 0;
            document.getElementById('repair-part-name').value = r.spare_part_name || '';
            document.getElementById('repair-part-cost').value = r.spare_part_cost || 0;
            document.getElementById('repair-receive-date').value = r.receive_date || '';
            document.getElementById('repair-delivery-date').value = r.delivery_date || '';
            document.getElementById('repair-issue').value = r.device_issue || '';
            document.getElementById('repair-notes').value = r.notes || '';
        }
    } else {
        const title = document.getElementById('repair-modal-title');
        if (title) title.textContent = 'أمر صيانة جديد';
        document.getElementById('repair-id').value = '';
    }
}

function closeRepairForm() { hideModal('repair-modal'); }

async function saveRepair(e) {
    e.preventDefault();
    showLoading();
    const id = document.getElementById('repair-id').value;
    const data = {
        device_name: document.getElementById('repair-device-name').value,
        customer_name: document.getElementById('repair-customer-name').value,
        customer_phone: document.getElementById('repair-customer-phone').value,
        technician: document.getElementById('repair-technician').value,
        status: document.getElementById('repair-status').value,
        repair_price: Number(document.getElementById('repair-price').value) || 0,
        technician_fee: Number(document.getElementById('repair-tech-fee').value) || 0,
        spare_part_name: document.getElementById('repair-part-name').value,
        spare_part_cost: Number(document.getElementById('repair-part-cost').value) || 0,
        receive_date: document.getElementById('repair-receive-date').value,
        delivery_date: document.getElementById('repair-delivery-date').value || null,
        device_issue: document.getElementById('repair-issue').value,
        notes: document.getElementById('repair-notes').value,
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
        hideLoading();
    } catch (error) { console.error("خطأ في حفظ أمر الصيانة:", error); hideLoading(); }
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
    
    const container = document.getElementById('repairs-table-container');
    if (container) {
        container.innerHTML = `
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
            document.getElementById('part-id').value = p.id;
            document.getElementById('part-name').value = p.name || '';
            document.getElementById('part-category').value = p.category || 'بطاريات';
            document.getElementById('part-purchase-price').value = p.purchase_price || 0;
            document.getElementById('part-selling-price').value = p.selling_price || 0;
            document.getElementById('part-quantity').value = p.quantity || 0;
            document.getElementById('part-min-quantity').value = p.min_quantity || 0;
            document.getElementById('part-supplier').value = p.supplier || '';
        }
    } else {
        const title = document.getElementById('part-modal-title');
        if (title) title.textContent = 'إضافة قطعة غيار';
        document.getElementById('part-id').value = '';
    }
}

function closePartForm() { hideModal('part-modal'); }

async function savePart(e) {
    e.preventDefault();
    showLoading();
    const id = document.getElementById('part-id').value;
    const data = {
        name: document.getElementById('part-name').value,
        category: document.getElementById('part-category').value,
        purchase_price: Number(document.getElementById('part-purchase-price').value) || 0,
        selling_price: Number(document.getElementById('part-selling-price').value) || 0,
        quantity: Number(document.getElementById('part-quantity').value) || 0,
        min_quantity: Number(document.getElementById('part-min-quantity').value) || 0,
        supplier: document.getElementById('part-supplier').value,
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
        hideLoading();
    } catch (error) { console.error("خطأ في حفظ قطعة الغيار:", error); hideLoading(); }
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
    
    const container = document.getElementById('inventory-table-container');
    if (container) {
        container.innerHTML = `
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
    document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
    if (expenseId) {
        const e = globalExpenses.find(e => e.id === expenseId);
        if (e) {
            const title = document.getElementById('expense-modal-title');
            if (title) title.textContent = 'تعديل مصروف';
            document.getElementById('expense-id').value = e.id;
            document.getElementById('expense-title').value = e.title || '';
            document.getElementById('expense-category').value = e.category || 'أخرى';
            document.getElementById('expense-amount').value = e.amount || 0;
            document.getElementById('expense-date').value = e.date || '';
            document.getElementById('expense-notes').value = e.notes || '';
        }
    } else {
        const title = document.getElementById('expense-modal-title');
        if (title) title.textContent = 'إضافة مصروف';
        document.getElementById('expense-id').value = '';
    }
}

function closeExpenseForm() { hideModal('expense-modal'); }

async function saveExpense(e) {
    e.preventDefault();
    showLoading();
    const id = document.getElementById('expense-id').value;
    const data = {
        title: document.getElementById('expense-title').value,
        category: document.getElementById('expense-category').value,
        amount: Number(document.getElementById('expense-amount').value) || 0,
        date: document.getElementById('expense-date').value,
        notes: document.getElementById('expense-notes').value,
        is_recurring: false,
        ownerId: ownerId,
    };
    try {
        if (id) { await updateDoc(doc(db, "expenses", id), data); }
        else { await addDoc(collection(db, "expenses"), data); }
        await loadAllData();
        closeExpenseForm();
        loadExpensesTable();
        loadDashboard();
        hideLoading();
    } catch (error) { console.error("خطأ في حفظ المصروف:", error); hideLoading(); }
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
    const recurring = globalExpenses.filter(e => e.is_recurring).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    
    const countEl = document.getElementById('expenses-count');
    if (countEl) countEl.textContent = `${globalExpenses.length} مصروف — إجمالي: ${formatCurrency(total)}`;
    
    const summaryEl = document.getElementById('expenses-summary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-receipt"></i></div><p class="stat-card-title">إجمالي المصاريف</p><p class="stat-card-value">${formatCurrency(total)}</p></div>
            <div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-sync-alt"></i></div><p class="stat-card-title">مصاريف متكررة</p><p class="stat-card-value">${formatCurrency(recurring)}</p></div>
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
// 6. المحافظ الإلكترونية
// ================================
function loadWallets() {
    const totalBalance = globalWallets.reduce((s, w) => s + (Number(w.balance) || 0), 0);
    const dailyTotal = globalWallets.reduce((s, w) => s + (Number(w.daily_used) || 0), 0);
    const monthlyTotal = globalWallets.reduce((s, w) => s + (Number(w.monthly_used) || 0), 0);
    
    const summaryEl = document.getElementById('wallet-summary-cards');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-wallet"></i></div><p class="stat-card-title">إجمالي الأرصدة</p><p class="stat-card-value">${formatCurrency(totalBalance)}</p></div>
            <div class="stat-card"><div class="stat-card-icon icon-blue"><i class="fas fa-calendar-day"></i></div><p class="stat-card-title">المستعمل اليوم</p><p class="stat-card-value">${formatCurrency(dailyTotal)}</p></div>
            <div class="stat-card"><div class="stat-card-icon icon-amber"><i class="fas fa-calendar-alt"></i></div><p class="stat-card-title">المستعمل الشهر</p><p class="stat-card-value">${formatCurrency(monthlyTotal)}</p></div>
            <div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-university"></i></div><p class="stat-card-title">عدد المحافظ</p><p class="stat-card-value">${globalWallets.length}</p></div>
        `;
    }
    
    const tableBody = document.getElementById('wallets-table-body');
    if (tableBody) {
        tableBody.innerHTML = globalWallets.length ? globalWallets.map(w => {
            const pctDaily = w.daily_limit > 0 ? Math.round((Number(w.daily_used) / w.daily_limit) * 100) : 0;
            const pctMonthly = w.monthly_limit > 0 ? Math.round((Number(w.monthly_used) / w.monthly_limit) * 100) : 0;
            let limitStatus = '';
            if (Number(w.daily_used) >= w.daily_limit || Number(w.monthly_used) >= w.monthly_limit) {
                limitStatus = '<span class="badge badge-red">⚠️ تعدى الحد</span>';
            } else if (pctDaily >= 80 || pctMonthly >= 80) {
                limitStatus = '<span class="badge badge-amber">قرب من الحد</span>';
            } else {
                limitStatus = '<span class="badge badge-green">آمن</span>';
            }
            return `<tr>
                <td class="font-semibold">${w.name || 'غير محدد'}</td>
                <td><span class="badge badge-blue">${walletLimits[w.type]?.label || w.type || 'غير محدد'}</span></td>
                <td class="font-bold">${formatCurrency(w.balance)}</td>
                <td>${formatCurrency(w.daily_limit)}</td>
                <td>${formatCurrency(w.daily_used)}</td>
                <td>${formatCurrency(w.monthly_limit)}</td>
                <td>${formatCurrency(w.monthly_used)}</td>
                <td>${limitStatus}</td>
                <td>
                    <button class="btn-primary btn-xs" onclick="openTransactionModal('${w.id}')"><i class="fas fa-exchange-alt"></i></button>
                    <button class="btn-danger btn-xs" onclick="confirmDelete('wallet','${w.id}')"><i class="fas fa-trash"></i></button>
                </td></tr>`;
        }).join('') : '<tr><td colspan="9" class="text-center py-6 text-gray-400">لا توجد محافظ</td></tr>';
    }
    
    const sorted = [...globalTransactions].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const transactionsBody = document.getElementById('wallet-transactions-body');
    if (transactionsBody) {
        transactionsBody.innerHTML = sorted.length ? sorted.slice(0, 20).map(t => {
            const wallet = globalWallets.find(w => w.id === t.wallet_id);
            return `<tr>
                <td class="text-sm">${t.date || '-'}</td>
                <td class="font-semibold">${wallet ? wallet.name : '—'}</td>
                <td>${t.type === 'deposit' ? '<span class="badge badge-green">إيداع</span>' : '<span class="badge badge-red">سحب</span>'}</td>
                <td class="font-bold">${formatCurrency(t.amount)}</td>
                <td class="text-sm text-gray-500">${t.notes || '—'}</td></tr>`;
        }).join('') : '<tr><td colspan="5" class="text-center py-6 text-gray-400">لا توجد عمليات</td></tr>';
    }
}

function onWalletTypeChange() {
    const type = document.getElementById('wallet-type')?.value;
    const info = document.getElementById('wallet-limits-info');
    if (type && walletLimits[type] && info) {
        info.classList.remove('hidden');
        info.innerHTML = `الحد اليومي: <strong>${walletLimits[type].daily.toLocaleString()} ج.م</strong> | الحد الشهري: <strong>${walletLimits[type].monthly.toLocaleString()} ج.م</strong> | أقصى رصيد: <strong>${walletLimits[type].max_balance.toLocaleString()} ج.م</strong>`;
    } else if (info) {
        info.classList.add('hidden');
    }
}

function openWalletModal(walletId = null) {
    showModal('wallet-modal');
    const form = document.getElementById('wallet-form');
    if (form) form.reset();
    const limitsInfo = document.getElementById('wallet-limits-info');
    if (limitsInfo) limitsInfo.classList.add('hidden');
    if (walletId) {
        const w = globalWallets.find(w => w.id === walletId);
        if (w) {
            const title = document.getElementById('wallet-modal-title');
            if (title) title.textContent = 'تعديل محفظة';
            document.getElementById('wallet-id').value = w.id;
            document.getElementById('wallet-name').value = w.name || '';
            document.getElementById('wallet-phone').value = w.phone || '';
            document.getElementById('wallet-type').value = w.type || '';
            onWalletTypeChange();
        }
    } else {
        const title = document.getElementById('wallet-modal-title');
        if (title) title.textContent = 'إضافة محفظة جديدة';
        document.getElementById('wallet-id').value = '';
    }
}

function closeWalletModal() { hideModal('wallet-modal'); }

async function saveWallet(e) {
    e.preventDefault();
    const id = document.getElementById('wallet-id').value;
    const type = document.getElementById('wallet-type').value;
    const limits = walletLimits[type] || walletLimits['vodafone'];
    const data = {
        name: document.getElementById('wallet-name').value,
        phone: document.getElementById('wallet-phone').value,
        type, balance: 0, daily_used: 0, monthly_used: 0,
        daily_limit: limits.daily, monthly_limit: limits.monthly,
        max_balance: limits.max_balance,
        alert_threshold: Math.round(limits.monthly * 0.8),
        ownerId: ownerId,
    };
    try {
        if (id) {
            const existing = globalWallets.find(w => w.id === id);
            data.balance = existing?.balance || 0;
            data.daily_used = existing?.daily_used || 0;
            data.monthly_used = existing?.monthly_used || 0;
            await updateDoc(doc(db, "wallets", id), data);
        } else {
            await addDoc(collection(db, "wallets"), data);
        }
        await loadAllData();
        closeWalletModal();
        loadWallets();
    } catch (error) { console.error("خطأ في حفظ المحفظة:", error); }
}

function openTransactionModal(walletId) {
    showModal('transaction-modal');
    const form = document.getElementById('transaction-form');
    if (form) form.reset();
    document.getElementById('transaction-wallet-id').value = walletId;
    const warning = document.getElementById('transaction-limit-warning');
    if (warning) warning.classList.add('hidden');
}

function closeTransactionModal() { hideModal('transaction-modal'); }

async function saveTransaction(e) {
    e.preventDefault();
    const walletId = document.getElementById('transaction-wallet-id').value;
    const type = document.getElementById('transaction-type').value;
    const amount = parseFloat(document.getElementById('transaction-amount').value);
    const notes = document.getElementById('transaction-notes').value;
    const wallet = globalWallets.find(w => w.id === walletId);
    if (!wallet) return;
    
    const warningDiv = document.getElementById('transaction-limit-warning');
    if (type === 'withdraw') {
        if (amount > (Number(wallet.balance) || 0)) {
            if (warningDiv) { warningDiv.textContent = '❌ الرصيد غير كافي.'; warningDiv.classList.remove('hidden'); }
            return;
        }
        if ((Number(wallet.daily_used) + amount) > wallet.daily_limit) {
            if (warningDiv) { warningDiv.textContent = `❌ هذه العملية تتجاوز الحد اليومي (${formatCurrency(wallet.daily_limit)}).`; warningDiv.classList.remove('hidden'); }
            return;
        }
        if ((Number(wallet.monthly_used) + amount) > wallet.monthly_limit) {
            if (warningDiv) { warningDiv.textContent = `❌ هذه العملية تتجاوز الحد الشهري (${formatCurrency(wallet.monthly_limit)}).`; warningDiv.classList.remove('hidden'); }
            return;
        }
    }
    
    try {
        if (type === 'withdraw') {
            await updateDoc(doc(db, "wallets", walletId), {
                balance: Number(wallet.balance) - amount,
                daily_used: Number(wallet.daily_used) + amount,
                monthly_used: Number(wallet.monthly_used) + amount,
            });
        } else {
            await updateDoc(doc(db, "wallets", walletId), { balance: Number(wallet.balance) + amount });
        }
        await addDoc(collection(db, "transactions"), {
            wallet_id: walletId, type, amount,
            date: new Date().toISOString().split('T')[0],
            notes, ownerId,
        });
        await loadAllData();
        closeTransactionModal();
        loadWallets();
    } catch (error) { console.error("خطأ في العملية:", error); }
}

// ================================
// 7. التقارير والتحليلات
// ================================
function loadReports() {
    const totalRevenue = globalRepairs.reduce((s, r) => s + (Number(r.repair_price) || 0), 0);
    const totalPartsCost = globalRepairs.reduce((s, r) => s + (Number(r.spare_part_cost) || 0), 0);
    const totalTechFees = globalRepairs.reduce((s, r) => s + (Number(r.technician_fee) || 0), 0);
    const totalExpensesVal = globalExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const profit = totalRevenue - totalPartsCost - totalTechFees - totalExpensesVal;
    const margin = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 100) : 0;
    
    const kpiEl = document.getElementById('reports-kpi');
    if (kpiEl) {
        kpiEl.innerHTML = `
            <div class="stat-card"><p class="stat-card-title">إجمالي الإيرادات</p><p class="stat-card-value">${formatCurrency(totalRevenue)}</p></div>
            <div class="stat-card"><p class="stat-card-title">ربح الصيانة</p><p class="stat-card-value">${formatCurrency(totalRevenue - totalPartsCost - totalTechFees)}</p><p class="stat-card-sub">هامش: ${totalRevenue > 0 ? Math.round(((totalRevenue - totalPartsCost - totalTechFees) / totalRevenue) * 100) : 0}%</p></div>
            <div class="stat-card"><p class="stat-card-title">المصاريف التشغيلية</p><p class="stat-card-value">${formatCurrency(totalExpensesVal)}</p></div>
            <div class="stat-card"><p class="stat-card-title">صافي الربح الحقيقي</p><p class="stat-card-value">${formatCurrency(profit)}</p><p class="stat-card-sub">هامش صافي: ${margin}%</p></div>
        `;
    }
    
    const breakdownEl = document.getElementById('profit-breakdown');
    if (breakdownEl) {
        breakdownEl.innerHTML = `
            <p class="font-bold text-teal-800 mb-3">تفصيل صافي الربح الحقيقي</p>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                <div class="bg-white rounded-lg p-3"><span class="text-xs text-gray-500">إيرادات الصيانة</span><p class="font-bold text-blue-600">${formatCurrency(totalRevenue)}</p></div>
                <div class="bg-white rounded-lg p-3"><span class="text-xs text-gray-500">تكاليف قطع الغيار</span><p class="font-bold text-purple-600">- ${formatCurrency(totalPartsCost)}</p></div>
                <div class="bg-white rounded-lg p-3"><span class="text-xs text-gray-500">أجور الفنيين</span><p class="font-bold text-amber-600">- ${formatCurrency(totalTechFees)}</p></div>
                <div class="bg-white rounded-lg p-3"><span class="text-xs text-gray-500">المصاريف التشغيلية</span><p class="font-bold text-red-600">- ${formatCurrency(totalExpensesVal)}</p></div>
                <div class="bg-teal-50 rounded-lg p-3 border-2 border-teal-300"><span class="text-xs text-gray-500">= صافي الربح</span><p class="font-bold text-teal-700">${formatCurrency(profit)}</p></div>
            </div>
        `;
    }
    
    // أداء الفنيين
    const techMap = {};
    globalRepairs.forEach(r => {
        if (!r.technician) return;
        if (!techMap[r.technician]) techMap[r.technician] = { name: r.technician, orders: 0, revenue: 0 };
        techMap[r.technician].orders++;
        techMap[r.technician].revenue += (Number(r.repair_price) || 0);
    });
    const techPerfEl = document.getElementById('technician-performance');
    if (techPerfEl) {
        techPerfEl.innerHTML = Object.values(techMap).length ? Object.values(techMap).map((t, i) => `
            <div class="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 mb-2">
                <span class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs font-bold text-blue-600">${i + 1}</span>
                <div class="flex-1"><p class="font-semibold">${t.name}</p></div>
                <div class="text-sm text-gray-500">${t.orders} عمليات</div>
                <div class="font-bold text-blue-600">${formatCurrency(t.revenue)}</div>
            </div>
        `).join('') : '<p class="text-gray-400 text-center py-4">لا توجد بيانات</p>';
    }
    
    // أفضل العملاء
    const custMap = {};
    globalRepairs.forEach(r => {
        if (!r.customer_name) return;
        if (!custMap[r.customer_name]) custMap[r.customer_name] = { name: r.customer_name, total: 0, orders: 0 };
        custMap[r.customer_name].total += (Number(r.repair_price) || 0);
        custMap[r.customer_name].orders++;
    });
    const topCustEl = document.getElementById('top-customers');
    if (topCustEl) {
        topCustEl.innerHTML = Object.values(custMap).length ? Object.values(custMap).sort((a, b) => b.total - a.total).slice(0, 8).map((c, i) => `
            <div class="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 mb-2">
                <span class="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center text-xs font-bold text-amber-600">${i + 1}</span>
                <div class="flex-1"><p class="font-semibold text-sm">${c.name}</p></div>
                <div class="font-bold text-blue-600 text-sm">${formatCurrency(c.total)}</div>
                <div class="text-xs text-gray-500">${c.orders} طلب</div>
            </div>
        `).join('') : '<p class="text-gray-400 text-center py-4">لا توجد بيانات</p>';
    }
    
    // أكثر الأجهزة صيانةً
    const deviceMap = {};
    globalRepairs.forEach(r => {
        if (!r.device_name) return;
        if (!deviceMap[r.device_name]) deviceMap[r.device_name] = { name: r.device_name, count: 0 };
        deviceMap[r.device_name].count++;
    });
    const topDevicesEl = document.getElementById('top-devices');
    if (topDevicesEl) {
        topDevicesEl.innerHTML = Object.values(deviceMap).length ? Object.values(deviceMap).sort((a, b) => b.count - a.count).slice(0, 8).map((d, i) => `
            <div class="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 mb-2">
                <span class="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-xs font-bold text-purple-600">${i + 1}</span>
                <div class="flex-1"><p class="font-semibold text-sm">${d.name}</p></div>
                <div class="text-sm font-bold">${d.count} جهاز</div>
            </div>
        `).join('') : '<p class="text-gray-400 text-center py-4">لا توجد بيانات</p>';
    }
}

// ================================
// 8. التنبيهات
// ================================
function updateAlertsCount() {
    const lowStock = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity).length;
    const overdue = globalRepairs.filter(r => r.status !== 'تم_التسليم' && r.delivery_date && new Date(r.delivery_date) < new Date()).length;
    const total = lowStock + overdue;
    const badge = document.getElementById('alerts-count');
    if (badge) {
        badge.textContent = total;
        badge.classList.toggle('hidden', total === 0);
    }
}

function loadAlerts() {
    const now = new Date();
    const lowStockAlerts = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity).map(p => ({
        type: 'stock', title: `مخزون منخفض: ${p.name}`, desc: `الكمية المتبقية ${p.quantity} (الحد الأدنى: ${p.min_quantity})`,
        severity: p.quantity === 0 ? 'critical' : 'warning', icon: 'fa-box', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-r-amber-400',
    }));
    const overdueAlerts = globalRepairs.filter(r => r.delivery_date && r.status !== 'تم_التسليم' && new Date(r.delivery_date) < now).map(r => ({
        type: 'overdue', title: `تأخر تسليم: ${r.device_name}`, desc: `العميل: ${r.customer_name} — موعد التسليم: ${r.delivery_date}`,
        severity: 'critical', icon: 'fa-clock', color: 'text-red-600', bg: 'bg-red-50', border: 'border-r-red-500',
    }));
    const allAlerts = [...overdueAlerts, ...lowStockAlerts];
    
    const summaryText = document.getElementById('alerts-summary-text');
    if (summaryText) summaryText.textContent = allAlerts.length > 0 ? `${allAlerts.length} تنبيه نشط` : 'لا توجد تنبيهات';
    
    const summaryEl = document.getElementById('alerts-summary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="stat-card bg-red-50"><p class="text-xs text-gray-500">تأخر تسليم</p><p class="text-3xl font-bold text-red-600">${overdueAlerts.length}</p></div>
            <div class="stat-card bg-amber-50"><p class="text-xs text-gray-500">مواعيد قريبة</p><p class="text-3xl font-bold text-amber-600">0</p></div>
            <div class="stat-card bg-orange-50"><p class="text-xs text-gray-500">مخزون منخفض</p><p class="text-3xl font-bold text-orange-600">${lowStockAlerts.length}</p></div>
        `;
    }
    
    const listEl = document.getElementById('alerts-list');
    if (listEl) {
        listEl.innerHTML = allAlerts.length > 0 ? allAlerts.map(a => `
            <div class="card ${a.bg} border-r-4 ${a.border}"><div class="card-body">
                <div class="flex items-start gap-3">
                    <div class="p-2 rounded-lg"><i class="fas ${a.icon} ${a.color} text-lg"></i></div>
                    <div><p class="font-bold">${a.title}</p><p class="text-sm text-gray-600">${a.desc}</p></div>
                </div>
            </div></div>
        `).join('') : '<div class="card"><div class="card-body text-center py-10"><i class="fas fa-check-circle text-emerald-500 text-4xl mb-3"></i><p class="text-lg font-bold text-emerald-700">كل شيء على ما يرام!</p><p class="text-gray-500">لا توجد تنبيهات حالياً</p></div></div>';
    }
}

// ================================
// 9. الاشتراكات
// ================================
function loadSubscriptions() {
    globalSubscriptions.forEach(s => { if (s.status === 'نشط' && new Date(s.end_date) < new Date()) s.status = 'منتهي'; });
    const search = (document.getElementById('sub-search')?.value || '').toLowerCase();
    const filter = document.getElementById('sub-filter')?.value || 'all';
    const active = globalSubscriptions.filter(s => s.status === 'نشط').length;
    const expired = globalSubscriptions.filter(s => s.status === 'منتهي').length;
    const totalRevenue = globalSubscriptions.reduce((s, sub) => s + (Number(sub.price) || 0), 0);
    const expiringSoon = globalSubscriptions.filter(s => {
        if (s.status !== 'نشط') return false;
        const days = Math.ceil((new Date(s.end_date) - new Date()) / (1000 * 60 * 60 * 24));
        return days <= 30 && days > 0;
    }).length;
    
    const subsCount = document.getElementById('subs-count-text');
    if (subsCount) subsCount.textContent = `${globalSubscriptions.length} عميل مشترك`;
    
    const summaryEl = document.getElementById('subscription-summary-cards');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-check-circle"></i></div><p class="stat-card-title">نشطة</p><p class="stat-card-value">${active}</p></div>
            <div class="stat-card"><div class="stat-card-icon icon-blue"><i class="fas fa-dollar-sign"></i></div><p class="stat-card-title">الإيرادات</p><p class="stat-card-value">${formatCurrency(totalRevenue)}</p></div>
            <div class="stat-card"><div class="stat-card-icon icon-amber"><i class="fas fa-exclamation-triangle"></i></div><p class="stat-card-title">تنتهي قريباً</p><p class="stat-card-value">${expiringSoon}</p></div>
            <div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-times-circle"></i></div><p class="stat-card-title">منتهية</p><p class="stat-card-value">${expired}</p></div>
        `;
    }
    
    let filtered = globalSubscriptions.filter(s => {
        const matchSearch = !search || s.customer_name?.toLowerCase().includes(search) || s.customer_email?.toLowerCase().includes(search);
        const matchStatus = filter === 'all' || s.status === filter;
        return matchSearch && matchStatus;
    });
    
    const tableBody = document.getElementById('subscriptions-table-body');
    if (tableBody) {
        tableBody.innerHTML = filtered.length ? filtered.map((s, i) => {
            const devices = globalRepairs.filter(r => r.customer_name === s.customer_name).length;
            return `<tr>
                <td class="text-xs text-gray-400">${i + 1}</td>
                <td class="font-semibold">${s.customer_name || 'غير محدد'}</td><td class="text-sm">${s.customer_email || '-'}</td>
                <td>${s.plan || '-'}</td><td class="font-bold text-blue-600">${formatCurrency(s.price)}</td>
                <td class="text-sm">${s.start_date || '-'}</td><td class="text-sm">${s.end_date || '-'}</td>
                <td>${getDaysLeft(s.end_date)}</td>
                <td>${s.status === 'نشط' ? '<span class="badge badge-green">نشط</span>' : '<span class="badge badge-red">منتهي</span>'}</td>
                <td class="font-bold">${devices} جهاز</td>
                <td>
                    ${(s.status === 'منتهي' || s.status === 'نشط') ? `<button class="btn-primary btn-xs" onclick="renewSubscription('${s.id}')"><i class="fas fa-sync-alt"></i></button>` : ''}
                    <button class="btn-danger btn-xs" onclick="confirmDelete('subscription','${s.id}')"><i class="fas fa-trash"></i></button>
                </td></tr>`;
        }).join('') : '<tr><td colspan="11" class="text-center py-6 text-gray-400">لا توجد اشتراكات</td></tr>';
    }
}

function openSubscriptionModal(subId = null) {
    showModal('subscription-modal');
    const form = document.getElementById('subscription-form');
    if (form) form.reset();
    document.getElementById('subscription-start-date').value = new Date().toISOString().split('T')[0];
    
    const select = document.getElementById('subscription-linked-user');
    if (select) {
        select.innerHTML = '<option value="">اختر مستخدم</option>' + globalUsers.map(u => `<option value="${u.id}">${u.fullName || u.name || u.email} (${u.email})</option>`).join('');
    }
    
    if (subId) {
        const s = globalSubscriptions.find(s => s.id === subId);
        if (s) {
            const title = document.getElementById('subscription-modal-title');
            if (title) title.textContent = 'تعديل اشتراك';
            document.getElementById('subscription-id').value = s.id;
            document.getElementById('subscription-customer-name').value = s.customer_name || '';
            document.getElementById('subscription-customer-email').value = s.customer_email || '';
            document.getElementById('subscription-plan').value = s.plan || 'تجريبي';
            document.getElementById('subscription-price').value = s.price || 0;
            document.getElementById('subscription-start-date').value = s.start_date || '';
            document.getElementById('subscription-end-date').value = s.end_date || '';
            if (s.linked_user_id && select) select.value = s.linked_user_id;
        }
    } else {
        const title = document.getElementById('subscription-modal-title');
        if (title) title.textContent = 'اشتراك جديد';
        document.getElementById('subscription-id').value = '';
        onSubscriptionPlanChange();
    }
}

function closeSubscriptionModal() { hideModal('subscription-modal'); }

function onLinkedUserChange() {
    const userId = document.getElementById('subscription-linked-user')?.value;
    if (userId) {
        const user = globalUsers.find(u => u.id === userId);
        if (user) {
            document.getElementById('subscription-customer-name').value = user.fullName || user.name || '';
            document.getElementById('subscription-customer-email').value = user.email || '';
        }
    }
}

function onSubscriptionPlanChange() {
    const plan = document.getElementById('subscription-plan')?.value;
    const startDate = document.getElementById('subscription-start-date')?.value || new Date().toISOString().split('T')[0];
    const endDate = new Date(startDate);
    if (plan === 'تجريبي') endDate.setDate(endDate.getDate() + 3);
    else if (plan === 'شهري') endDate.setMonth(endDate.getMonth() + 1);
    else if (plan === 'سنوي') endDate.setFullYear(endDate.getFullYear() + 1);
    const endDateField = document.getElementById('subscription-end-date');
    if (endDateField) endDateField.value = endDate.toISOString().split('T')[0];
}

async function saveSubscription(e) {
    e.preventDefault();
    const id = document.getElementById('subscription-id').value;
    const data = {
        customer_name: document.getElementById('subscription-customer-name').value,
        customer_email: document.getElementById('subscription-customer-email').value,
        plan: document.getElementById('subscription-plan').value,
        price: Number(document.getElementById('subscription-price').value) || 0,
        start_date: document.getElementById('subscription-start-date').value,
        end_date: document.getElementById('subscription-end-date').value,
        status: 'نشط',
        linked_user_id: document.getElementById('subscription-linked-user').value || null,
        ownerId: ownerId,
    };
    try {
        if (id) { await updateDoc(doc(db, "subscriptions", id), data); }
        else { await addDoc(collection(db, "subscriptions"), data); }
        
        if (data.linked_user_id) {
            await updateDoc(doc(db, "users", data.linked_user_id), {
                subscription: { plan: data.plan, status: 'نشط', start_date: data.start_date, end_date: data.end_date, price: data.price }
            });
        }
        
        await loadAllData();
        closeSubscriptionModal();
        loadSubscriptions();
    } catch (error) { console.error("خطأ في حفظ الاشتراك:", error); }
}

async function renewSubscription(id) {
    const s = globalSubscriptions.find(s => s.id === id);
    if (!s) return;
    const newEnd = new Date(s.end_date);
    if (s.plan === 'شهري') newEnd.setMonth(newEnd.getMonth() + 1);
    else if (s.plan === 'سنوي') newEnd.setFullYear(newEnd.getFullYear() + 1);
    else newEnd.setDate(newEnd.getDate() + 3);
    try {
        await updateDoc(doc(db, "subscriptions", id), { end_date: newEnd.toISOString().split('T')[0], status: 'نشط' });
        await loadAllData();
        loadSubscriptions();
        alert('✅ تم تجديد الاشتراك بنجاح');
    } catch (error) { console.error("خطأ في التجديد:", error); }
}

// ================================
// 10. الإعدادات
// ================================
function loadSettings() {
    document.getElementById('set-shop-name').value = globalSettings.shop_name || '';
    document.getElementById('set-owner-name').value = globalSettings.owner_name || '';
    document.getElementById('set-phone').value = globalSettings.phone || '';
    document.getElementById('set-address').value = globalSettings.address || '';
    document.getElementById('set-warranty-days').value = globalSettings.warranty_days || 30;
    document.getElementById('set-warranty-notes').value = globalSettings.warranty_notes || '';
    document.getElementById('set-language').value = globalSettings.language || 'ar';
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
    globalSettings.shop_name = document.getElementById('set-shop-name').value;
    globalSettings.owner_name = document.getElementById('set-owner-name').value;
    globalSettings.phone = document.getElementById('set-phone').value;
    globalSettings.address = document.getElementById('set-address').value;
    globalSettings.warranty_days = parseInt(document.getElementById('set-warranty-days').value) || 30;
    globalSettings.warranty_notes = document.getElementById('set-warranty-notes').value;
    globalSettings.language = document.getElementById('set-language').value;
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
window.switchTab = switchTab;
window.logout = logout;
window.toggleReorder = toggleReorder;
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
window.loadRepairsTable = loadRepairsTable;
window.loadInventoryTable = loadInventoryTable;
window.loadExpensesTable = loadExpensesTable;
window.loadCustomersTable = loadCustomersTable;
window.loadWallets = loadWallets;
window.loadSubscriptions = loadSubscriptions;
window.loadUsersManager = loadUsersManager;
window.toggleUserApproval = toggleUserApproval;

// ================================
// دوال إضافية للـ HTML onclick
window.printRepairInvoice = function(repairId) {
    const r = globalRepairs.find(r => r.id === repairId);
    if (!r) return alert('غير موجود');
    const w = window.open('', '_blank', 'width=700,height=800');
    w.document.write(`<html dir=rtl><head><title>فاتورة صيانة</title><style>@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap');body{font-family:Tajawal;padding:30px}h1{color:#2563eb}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #eee}.total{font-size:20px;color:#2563eb;font-weight:800}@media print{body{padding:10px}}</style></head><body><h1>${globalSettings.shop_name||'Jumlagy'}</h1><p>📞 ${globalSettings.phone||''}</p><hr><p><b>العميل:</b> ${r.customer_name}</p><p><b>الجهاز:</b> ${r.device_name}</p><p><b>الفني:</b> ${r.technician}</p><p><b>التاريخ:</b> ${r.receive_date}</p><p class=total>💰 ${formatCurrency(r.repair_price)}</p><script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
};

window.quickStatusChange = async function(repairId, newStatus) {
    await updateDoc(doc(db, "repairs", repairId), { status: newStatus });
    await loadAllData();
    loadRepairsTable();
    loadDashboard();
};

window.toggleCustomerRepairs = function(id) {
    const d = document.getElementById('customer-repairs-' + id);
    const c = document.getElementById('customer-chevron-' + id);
    if (d) { d.classList.toggle('hidden'); if (c) { c.classList.toggle('fa-chevron-down'); c.classList.toggle('fa-chevron-up'); } }
};

// بدء التطبيق
// ================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
