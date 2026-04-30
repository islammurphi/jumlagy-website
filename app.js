import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
let currentUser = null;
let authCheckInterval = null;

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
    const badges = { 
        'تم_التسليم': '<span class="badge badge-blue">تم التسليم</span>', 
        'قيد_الصيانة': '<span class="badge badge-amber">قيد الصيانة</span>', 
        'جاهز': '<span class="badge badge-green">جاهز للتسليم</span>' 
    };
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

function showLoading() { 
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('show'); 
}

function hideLoading() { 
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('show'); 
}

function showModal(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('show'); 
}

function hideModal(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('show'); 
}

// ================================
// التهيئة الرئيسية
// ================================
async function initApp() {
    showLoading();
    
    // التحقق من الجلسة
    const session = JSON.parse(localStorage.getItem('jumlagy_session'));
    if (!session || !session.uid) {
        window.location.href = 'login.html';
        return;
    }
    
    ownerId = session.uid;
    currentUser = session;
    
    // مراقبة حالة المصادقة
    authCheckInterval = setInterval(checkAuthState, 30000); // كل 30 ثانية
    
    // التحقق من صلاحية الجلسة مع Firebase
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            clearInterval(authCheckInterval);
            localStorage.removeItem('jumlagy_session');
            window.location.href = 'login.html';
            return;
        }
        
        // التحقق من بيانات المستخدم في Firestore
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                
                // التحقق من صلاحية الوصول
                if (!canAccess(userData)) {
                    await signOut(auth);
                    localStorage.removeItem('jumlagy_session');
                    window.location.href = 'login.html';
                    return;
                }
                
                // تحديث الجلسة إذا كانت البيانات مختلفة
                const updatedSession = getSessionData(user, userData);
                localStorage.setItem('jumlagy_session', JSON.stringify(updatedSession));
                currentUser = updatedSession;
            }
        } catch (error) {
            console.error("خطأ في التحقق من المستخدم:", error);
        }
    });
    
    // تحديث واجهة المستخدم
    updateUserInterface();
    
    // تحميل البيانات
    await loadAllData();
    await loadUsersData();
    
    // تهيئة الأحداث
    initEventListeners();
    
    // تحميل الواجهات
    loadDashboard();
    loadSettings();
    updateInvoicePreview();
    updateAlertsCount();
    checkSubscriptionBanner();
    
    hideLoading();
}

function getSessionData(user, userData) {
    return {
        uid: user.uid,
        name: userData.fullName || userData.name || user.displayName || 'مستخدم',
        email: user.email,
        photo: userData.photoURL || userData.avatar || user.photoURL || '',
        role: userData.role || 'user',
        plan: userData.subscriptionType || userData.subscription?.plan || 'مجاني',
        end_date: userData.subscriptionEnd || userData.subscription?.end_date || '2099-12-31',
        lastLogin: new Date().toISOString()
    };
}

function canAccess(userData) {
    // المدير له صلاحية كاملة
    if (userData.role === 'admin' || userData.subscriptionType === 'admin') return true;
    
    // مستخدم نشط
    if (userData.status === 'active' && userData.role === 'user') return true;
    
    // اشتراك نشط
    if (userData.subscription?.status === 'نشط') {
        const endDate = new Date(userData.subscription.end_date);
        if (endDate >= new Date()) return true;
    }
    
    return false;
}

async function checkAuthState() {
    const user = auth.currentUser;
    if (!user) {
        clearInterval(authCheckInterval);
        localStorage.removeItem('jumlagy_session');
        window.location.href = 'login.html';
    }
}

function updateUserInterface() {
    document.getElementById('sidebar-user-name').textContent = currentUser.name || 'مستخدم';
    document.getElementById('sidebar-user-role').textContent = currentUser.role === 'admin' ? 'مدير النظام' : `مشترك - ${currentUser.plan || ''}`;
    document.getElementById('sidebar-user-photo').src = currentUser.photo || '';
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('ar-EG', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
    
    // إظهار/إخفاء أقسام المدير
    const isAdmin = currentUser.role === 'admin';
    const usersManagerCard = document.getElementById('users-manager-card');
    if (usersManagerCard) usersManagerCard.style.display = isAdmin ? 'block' : 'none';
    
    // إخفاء رابط الاشتراكات لغير المدير
    const subsLink = document.querySelector('[data-tab="subscriptions"]');
    if (subsLink) subsLink.style.display = isAdmin ? 'flex' : 'none';
}

function initEventListeners() {
    // أحداث الشريط الجانبي
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const tab = this.getAttribute('data-tab');
            switchTab(tab);
            if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
        });
    });
    
    document.getElementById('menu-toggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });
    
    document.getElementById('btn-logout').addEventListener('click', logout);
    
    // إغلاق الشريط الجانبي عند النقر خارجه
    document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('sidebar');
        const menuBtn = document.getElementById('menu-toggle');
        if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
            if (!sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
                sidebar.classList.remove('open');
            }
        }
    });
    
    // أحداث النماذج
    document.getElementById('repair-form')?.addEventListener('submit', saveRepair);
    document.getElementById('part-form')?.addEventListener('submit', savePart);
    document.getElementById('expense-form')?.addEventListener('submit', saveExpense);
    document.getElementById('wallet-form')?.addEventListener('submit', saveWallet);
    document.getElementById('transaction-form')?.addEventListener('submit', saveTransaction);
    document.getElementById('subscription-form')?.addEventListener('submit', saveSubscription);
    
    // أحداث الإعدادات
    document.getElementById('set-shop-name')?.addEventListener('input', updateInvoicePreview);
    document.getElementById('set-owner-name')?.addEventListener('input', updateInvoicePreview);
    document.getElementById('set-phone')?.addEventListener('input', updateInvoicePreview);
    document.getElementById('set-address')?.addEventListener('input', updateInvoicePreview);
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
    
    // تحميل المحتوى المناسب
    const loaders = {
        'dashboard': loadDashboard,
        'repairs': loadRepairsTable,
        'inventory': loadInventoryTable,
        'expenses': loadExpensesTable,
        'customers': loadCustomersTable,
        'wallet': loadWallets,
        'reports': loadReports,
        'alerts': loadAlerts,
        'subscriptions': loadSubscriptions
    };
    
    if (loaders[tab]) loaders[tab]();
}

async function logout() {
    clearInterval(authCheckInterval);
    localStorage.removeItem('jumlagy_session');
    sessionStorage.clear();
    try {
        await signOut(auth);
    } catch(e) {
        console.error("خطأ في تسجيل الخروج:", e);
    }
    window.location.href = 'login.html';
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
        
        globalRepairs = repairsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => new Date(b.receive_date || 0) - new Date(a.receive_date || 0));
        globalParts = partsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        globalExpenses = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        globalWallets = walletsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        globalTransactions = transactionsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        globalSubscriptions = subscriptionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // تحميل الإعدادات
        if (settingsDoc.exists()) {
            globalSettings = settingsDoc.data();
            globalTechnicians = globalSettings.technicians || ['عان', 'تحن', 'قنب'];
        } else {
            globalSettings = { 
                shop_name: 'Jumlagy', 
                owner_name: currentUser?.name || 'اسم حسن', 
                phone: '01207696202', 
                address: 'المقطم', 
                warranty_days: 30, 
                warranty_notes: 'ضمان 30 يوم على قطع الغيار', 
                language: 'ar', 
                technicians: globalTechnicians 
            };
            await setDoc(doc(db, "settings", ownerId), globalSettings);
        }
        
        // تحديث الاشتراكات المنتهية تلقائياً
        await checkAndUpdateSubscriptions();
        
    } catch (error) {
        console.error("خطأ في تحميل البيانات:", error);
        alert("حدث خطأ في تحميل البيانات. يرجى تحديث الصفحة.");
    }
}

async function loadUsersData() {
    if (currentUser?.role !== 'admin') {
        globalUsers = [];
        return;
    }
    
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        globalUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
        console.error("خطأ في تحميل المستخدمين:", error);
        globalUsers = [];
    }
}

// ================================
// التحقق من الاشتراكات وتحديثها
// ================================
async function checkAndUpdateSubscriptions() {
    const now = new Date();
    let needsUpdate = false;
    
    for (const sub of globalSubscriptions) {
        const endDate = new Date(sub.end_date);
        if (endDate < now && sub.status === 'نشط') {
            sub.status = 'منتهي';
            needsUpdate = true;
            
            // تحديث في قاعدة البيانات
            await updateDoc(doc(db, "subscriptions", sub.id), { status: 'منتهي' }).catch(e => console.error(e));
            
            // تحديث حساب المستخدم المرتبط
            if (sub.linked_user_id) {
                await updateDoc(doc(db, "users", sub.linked_user_id), {
                    'subscription.status': 'منتهي',
                    status: 'expired',
                    subscriptionType: 'منتهي'
                }).catch(e => console.error(e));
            }
        }
    }
    
    return needsUpdate;
}

function checkSubscriptionBanner() {
    if (!currentUser || currentUser.role === 'admin') return;
    
    const banner = document.getElementById('subscription-banner');
    if (!banner) return;
    
    const endDate = new Date(currentUser.end_date);
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
    
    document.getElementById('stats-cards').innerHTML = `
        <div class="stat-card">
            <div class="stat-card-icon icon-blue"><i class="fas fa-dollar-sign"></i></div>
            <p class="stat-card-title">إجمالي الإيرادات</p>
            <p class="stat-card-value">${formatCurrency(totalRevenue)}</p>
            <p class="stat-card-sub">${globalRepairs.length} عملية صيانة</p>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon icon-red"><i class="fas fa-wrench"></i></div>
            <p class="stat-card-title">إجمالي المصروفات</p>
            <p class="stat-card-value">${formatCurrency(totalCosts)}</p>
            <p class="stat-card-sub">قطع: ${formatCurrency(totalPartsCost)} | فنيين: ${formatCurrency(totalTechFees)} | تشغيل: ${formatCurrency(totalExpenses)}</p>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon ${totalProfit >= 0 ? 'icon-green' : 'icon-red'}">
                <i class="fas fa-chart-line"></i>
            </div>
            <p class="stat-card-title">صافي الأرباح</p>
            <p class="stat-card-value">${formatCurrency(totalProfit)}</p>
            <p class="stat-card-sub">${totalProfit >= 0 ? '✅ رابح' : '⚠️ خاسر'} | الهامش: ${totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0}%</p>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon icon-purple"><i class="fas fa-box"></i></div>
            <p class="stat-card-title">قيمة المخزون</p>
            <p class="stat-card-value">${formatCurrency(inventoryValue)}</p>
            <p class="stat-card-sub">${globalParts.length} صنف | ${globalParts.reduce((s, p) => s + (Number(p.quantity) || 0), 0)} قطعة</p>
        </div>
    `;
    
    // حالة المخزون
    const available = globalParts.filter(p => !p.min_quantity || p.quantity > p.min_quantity).length;
    const low = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity && p.quantity > 0).length;
    const out = globalParts.filter(p => p.quantity === 0).length;
    
    document.getElementById('inventory-status').innerHTML = `
        <div class="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-200">
            <p class="text-2xl font-bold text-emerald-700">${available}</p>
            <p class="text-xs text-emerald-600">متوفر</p>
        </div>
        <div class="bg-amber-50 rounded-xl p-3 text-center border border-amber-200">
            <p class="text-2xl font-bold text-amber-700">${low}</p>
            <p class="text-xs text-amber-600">منخفض</p>
        </div>
        <div class="bg-red-50 rounded-xl p-3 text-center border border-red-200">
            <p class="text-2xl font-bold text-red-700">${out}</p>
            <p class="text-xs text-red-600">نافذ</p>
        </div>
    `;
    
    // تنبيهات المخزون
    const lowParts = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity);
    let alertHTML = '';
    if (lowParts.length > 0) {
        alertHTML += '<div class="alert alert-warning text-sm mb-2">⚠️ قطع منخفضة المخزون:</div>';
        lowParts.forEach(p => {
            alertHTML += `
                <div class="flex justify-between items-center bg-amber-50 rounded-lg px-3 py-2 mb-1 text-sm">
                    <span>${p.name}</span>
                    <span class="font-bold">${p.quantity} متبقي (الحد الأدنى: ${p.min_quantity})</span>
                </div>`;
        });
    } else {
        alertHTML = '<div class="alert alert-success text-sm">✅ جميع القطع متوفرة بكميات كافية</div>';
    }
    document.getElementById('out-of-stock-alerts').innerHTML = alertHTML;
    
    // آخر أوامر الصيانة
    const recent = globalRepairs.slice(0, 5);
    document.getElementById('recent-repairs').innerHTML = recent.length > 0 ? 
        recent.map(r => `
            <div class="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-3 mb-2">
                <div>
                    <p class="font-semibold text-sm">${r.device_name || 'غير محدد'}</p>
                    <p class="text-xs text-gray-500">${r.customer_name || 'غير معروف'} • ${r.technician || 'بدون فني'}</p>
                </div>
                <div class="flex items-center gap-3">
                    ${getStatusBadge(r.status)}
                    <span class="font-bold text-blue-600 text-sm">${formatCurrency(r.repair_price)}</span>
                </div>
            </div>
        `).join('') : 
        '<p class="text-center text-gray-400 py-6">لا توجد أوامر صيانة بعد</p>';
    
    // إدارة المستخدمين
    loadUsersManager();
    
    // تحميل الرسوم البيانية
    setTimeout(loadDashboardCharts, 300);
}

function loadDashboardCharts() {
    const ordersCtx = document.getElementById('ordersStatusChart');
    const incomeCtx = document.getElementById('incomeExpenseChart');
    if (!ordersCtx || !incomeCtx) return;
    
    // رسم توزيع الحالات
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
            datasets: [{ 
                data: [statusCounts['تم_التسليم'], statusCounts['قيد_الصيانة'], statusCounts['جاهز']], 
                backgroundColor: ['#3b82f6', '#f59e0b', '#10b981'], 
                borderWidth: 0 
            }]
        },
        options: { 
            responsive: true, 
            plugins: { 
                legend: { 
                    position: 'bottom', 
                    labels: { font: { family: 'Tajawal', size: 12 } } 
                } 
            } 
        }
    });
    
    // رسم الإيرادات والمصاريف الشهرية
    const monthlyData = getMonthlyData();
    
    if (charts.income) charts.income.destroy();
    charts.income = new Chart(incomeCtx, {
        type: 'line',
        data: {
            labels: monthlyData.map(d => d.month),
            datasets: [
                { 
                    label: 'الإيرادات', 
                    data: monthlyData.map(d => d.revenue), 
                    borderColor: '#3b82f6', 
                    backgroundColor: 'rgba(59,130,246,0.08)', 
                    fill: true, 
                    tension: 0.4 
                },
                { 
                    label: 'المصاريف', 
                    data: monthlyData.map(d => d.expenses), 
                    borderColor: '#ef4444', 
                    backgroundColor: 'rgba(239,68,68,0.08)', 
                    fill: true, 
                    tension: 0.4 
                }
            ]
        },
        options: { 
            responsive: true, 
            plugins: { 
                legend: { 
                    position: 'bottom', 
                    labels: { font: { family: 'Tajawal', size: 12 } } 
                } 
            }, 
            scales: { 
                y: { 
                    ticks: { callback: v => v.toLocaleString() + ' ج.م' } 
                } 
            } 
        }
    });
}

function getMonthlyData() {
    const months = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = date.toLocaleDateString('ar-EG', { month: 'short', year: 'numeric' });
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        const revenue = globalRepairs
            .filter(r => {
                const rDate = new Date(r.receive_date);
                return `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}` === yearMonth;
            })
            .reduce((s, r) => s + (Number(r.repair_price) || 0), 0);
            
        const expenses = globalExpenses
            .filter(e => {
                const eDate = new Date(e.date);
                return `${eDate.getFullYear()}-${String(eDate.getMonth() + 1).padStart(2, '0')}` === yearMonth;
            })
            .reduce((s, e) => s + (Number(e.amount) || 0), 0);
            
        const orders = globalRepairs.filter(r => {
            const rDate = new Date(r.receive_date);
            return `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}` === yearMonth;
        }).length;
        
        months.push({ month: monthStr, revenue, expenses, orders });
    }
    
    return months;
}

// ================================
// إدارة المستخدمين
// ================================
function loadUsersManager() {
    if (currentUser?.role !== 'admin') return;
    
    const container = document.getElementById('users-manager');
    if (!container) return;
    
    container.innerHTML = `
        <div class="flex gap-2 mb-4">
            <input type="email" class="input-field" id="new-user-email" placeholder="البريد الإلكتروني للمستخدم الجديد...">
            <button class="btn-primary" onclick="addNewUser()"><i class="fas fa-plus"></i> إضافة</button>
        </div>
        <div class="table-responsive">
            <table>
                <thead>
                    <tr>
                        <th>المستخدم</th>
                        <th>البريد الإلكتروني</th>
                        <th>الدور</th>
                        <th>الاشتراك</th>
                        <th>الحالة</th>
                        <th>تاريخ الانتهاء</th>
                        <th>إجراءات</th>
                    </tr>
                </thead>
                <tbody>
                    ${globalUsers.map(u => `
                        <tr>
                            <td>
                                <div class="flex items-center gap-2">
                                    <img src="${u.photoURL || u.avatar || ''}" class="w-8 h-8 rounded-full" onerror="this.style.display='none'">
                                    <span class="font-semibold">${u.fullName || u.name || 'مستخدم'}</span>
                                </div>
                            </td>
                            <td class="text-sm">${u.email}</td>
                            <td><span class="badge ${u.role === 'admin' ? 'badge-purple' : 'badge-gray'}">${u.role === 'admin' ? 'مدير' : 'مستخدم'}</span></td>
                            <td><span class="badge badge-blue">${u.subscriptionType || u.subscription?.plan || 'لا يوجد'}</span></td>
                            <td>${u.status === 'active' || u.subscription?.status === 'نشط' ? '<span class="badge badge-green">نشط</span>' : '<span class="badge badge-red">منتهي</span>'}</td>
                            <td class="text-sm">${u.subscriptionEnd || u.subscription?.end_date || '-'}</td>
                            <td>
                                <div class="flex gap-1">
                                    <button class="btn-icon" onclick="editUserRole('${u.id}')" title="تغيير الدور"><i class="fas fa-user-shield"></i></button>
                                    <button class="btn-icon text-red" onclick="confirmDelete('user','${u.id}')" title="حذف"><i class="fas fa-trash"></i></button>
                                </div>
                            </td>
                        </tr>
                    `).join('') || '<tr><td colspan="7" class="text-center py-4 text-gray-400">لا يوجد مستخدمين مسجلين</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}

async function addNewUser() {
    const email = document.getElementById('new-user-email')?.value?.trim();
    if (!email) {
        alert('الرجاء إدخال البريد الإلكتروني');
        return;
    }
    
    try {
        // إنشاء معرف للمستخدم من الإيميل
        const userId = email.replace(/[.#$\/\[\]]/g, '_');
        
        // التحقق من وجود المستخدم
        const existingUser = globalUsers.find(u => u.email === email);
        if (existingUser) {
            alert('هذا المستخدم مسجل بالفعل');
            return;
        }
        
        // إنشاء مستخدم جديد
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 3);
        
        await setDoc(doc(db, "users", userId), {
            email: email,
            fullName: email.split('@')[0],
            name: email.split('@')[0],
            role: 'user',
            status: 'active',
            subscriptionType: 'تجريبي',
            subscriptionEnd: trialEnd.toISOString().split('T')[0],
            subscription: {
                plan: 'تجريبي',
                status: 'نشط',
                start_date: new Date().toISOString().split('T')[0],
                end_date: trialEnd.toISOString().split('T')[0],
                price: 0
            },
            created_at: serverTimestamp()
        });
        
        await loadUsersData();
        loadUsersManager();
        alert('✅ تم إضافة المستخدم بنجاح');
        document.getElementById('new-user-email').value = '';
    } catch (error) {
        console.error("خطأ في إضافة المستخدم:", error);
        alert('❌ حدث خطأ: ' + error.message);
    }
}

async function editUserRole(userId) {
    const user = globalUsers.find(u => u.id === userId);
    if (!user) return;
    
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    const confirmed = confirm(`هل تريد تغيير دور ${user.fullName || user.email} إلى ${newRole === 'admin' ? 'مدير' : 'مستخدم'}؟`);
    
    if (confirmed) {
        try {
            await updateDoc(doc(db, "users", userId), { role: newRole });
            await loadUsersData();
            loadUsersManager();
            alert('✅ تم تغيير الدور بنجاح');
        } catch (error) {
            console.error("خطأ في تغيير الدور:", error);
            alert('❌ حدث خطأ: ' + error.message);
        }
    }
}

// ================================
// 2. أوامر الصيانة
// ================================
function openRepairForm(repairId = null) {
    showModal('repair-modal');
    document.getElementById('repair-form').reset();
    document.getElementById('repair-receive-date').value = new Date().toISOString().split('T')[0];
    updateTechSelects();
    
    if (repairId) {
        const r = globalRepairs.find(r => r.id === repairId);
        if (r) {
            document.getElementById('repair-modal-title').textContent = 'تعديل أمر صيانة';
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
        document.getElementById('repair-modal-title').textContent = 'أمر صيانة جديد';
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
        if (id) { 
            await updateDoc(doc(db, "repairs", id), data); 
        } else { 
            await addDoc(collection(db, "repairs"), { ...data, created_at: serverTimestamp() }); 
        }
        await loadAllData();
        closeRepairForm();
        loadRepairsTable();
        loadDashboard();
        updateAlertsCount();
        alert('✅ تم حفظ أمر الصيانة بنجاح');
    } catch (error) { 
        console.error("خطأ في حفظ أمر الصيانة:", error); 
        alert('❌ حدث خطأ في الحفظ: ' + error.message);
    }
    hideLoading();
}

function loadRepairsTable() {
    const search = (document.getElementById('repair-search')?.value || '').toLowerCase();
    const filter = document.getElementById('repair-filter')?.value || 'all';
    
    let filtered = globalRepairs.filter(r => {
        const matchSearch = !search || 
            r.device_name?.toLowerCase().includes(search) || 
            r.customer_name?.toLowerCase().includes(search) ||
            r.customer_phone?.includes(search);
        const matchStatus = filter === 'all' || r.status === filter;
        return matchSearch && matchStatus;
    });
    
    document.getElementById('repairs-count').textContent = `${filtered.length} أمر صيانة`;
    
    document.getElementById('repairs-table-container').innerHTML = `
        <div class="table-responsive">
            <table>
                <thead>
                    <tr>
                        <th>الجهاز</th>
                        <th>العميل</th>
                        <th>الفني</th>
                        <th>الحالة</th>
                        <th>السعر</th>
                        <th>تاريخ الاستلام</th>
                        <th>تاريخ التسليم</th>
                        <th>إجراءات</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map(r => `
                        <tr>
                            <td class="font-semibold">${r.device_name || 'غير محدد'}</td>
                            <td>${r.customer_name || 'غير معروف'}<br><span class="text-xs text-gray-400">${r.customer_phone || ''}</span></td>
                            <td>${r.technician || '-'}</td>
                            <td>${getStatusBadge(r.status)}</td>
                            <td class="font-bold text-blue-600">${formatCurrency(r.repair_price)}</td>
                            <td class="text-sm">${r.receive_date || '-'}</td>
                            <td class="text-sm">${r.delivery_date || 'لم يُسلم بعد'}</td>
                            <td>
                                <div class="flex gap-1">
                                    <button class="btn-icon" onclick="openRepairForm('${r.id}')" title="تعديل"><i class="fas fa-pen"></i></button>
                                    <button class="btn-icon text-red" onclick="confirmDelete('repair','${r.id}')" title="حذف"><i class="fas fa-trash"></i></button>
                                </div>
                            </td>
                        </tr>
                    `).join('') || '<tr><td colspan="8" class="text-center py-6 text-gray-400">لا توجد أوامر صيانة</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}

function openBarcodeScanner() { 
    alert('📷 خاصية مسح الباركود قيد التطوير. سيتم إتاحتها قريباً!'); 
}
// ================================
// 3. المخزون
// ================================
function openPartForm(partId = null) {
    showModal('part-modal');
    document.getElementById('part-form').reset();
    
    if (partId) {
        const p = globalParts.find(p => p.id === partId);
        if (p) {
            document.getElementById('part-modal-title').textContent = 'تعديل قطعة غيار';
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
        document.getElementById('part-modal-title').textContent = 'إضافة قطعة غيار';
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
        updated_at: serverTimestamp()
    };
    
    try {
        if (id) { 
            await updateDoc(doc(db, "parts", id), data); 
        } else { 
            await addDoc(collection(db, "parts"), { ...data, created_at: serverTimestamp() }); 
        }
        await loadAllData();
        closePartForm();
        loadInventoryTable();
        loadDashboard();
        updateAlertsCount();
        alert('✅ تم حفظ قطعة الغيار بنجاح');
    } catch (error) { 
        console.error("خطأ في حفظ قطعة الغيار:", error); 
        alert('❌ حدث خطأ في الحفظ: ' + error.message);
    }
    hideLoading();
}

function loadInventoryTable() {
    const search = (document.getElementById('part-search')?.value || '').toLowerCase();
    const filtered = globalParts.filter(p => 
        !search || 
        p.name?.toLowerCase().includes(search) || 
        p.category?.toLowerCase().includes(search) || 
        p.supplier?.toLowerCase().includes(search)
    );
    
    const totalValue = globalParts.reduce((s, p) => s + (Number(p.purchase_price) || 0) * (Number(p.quantity) || 0), 0);
    const totalItems = globalParts.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    
    document.getElementById('inventory-count').textContent = `${filtered.length} صنف - ${totalItems} قطعة`;
    document.getElementById('inventory-summary').innerHTML = `
        <div class="stat-card">
            <div class="stat-card-icon icon-purple"><i class="fas fa-box"></i></div>
            <p class="stat-card-title">قيمة المخزون</p>
            <p class="stat-card-value">${formatCurrency(totalValue)}</p>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon icon-green"><i class="fas fa-cubes"></i></div>
            <p class="stat-card-title">إجمالي القطع</p>
            <p class="stat-card-value">${totalItems}</p>
        </div>
    `;
    
    document.getElementById('inventory-table-container').innerHTML = `
        <div class="table-responsive">
            <table>
                <thead>
                    <tr>
                        <th>القطعة</th>
                        <th>التصنيف</th>
                        <th>سعر الشراء</th>
                        <th>سعر البيع</th>
                        <th>الكمية</th>
                        <th>الحد الأدنى</th>
                        <th>المورد</th>
                        <th>إجراءات</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map(p => `
                        <tr>
                            <td class="font-semibold">${p.name || 'غير محدد'}</td>
                            <td><span class="badge badge-gray">${p.category || 'أخرى'}</span></td>
                            <td>${formatCurrency(p.purchase_price)}</td>
                            <td>${p.selling_price ? formatCurrency(p.selling_price) : '<span class="text-muted">-</span>'}</td>
                            <td class="font-bold ${p.min_quantity && p.quantity <= p.min_quantity ? 'text-amber-600' : ''}">
                                ${p.quantity} ${p.min_quantity && p.quantity <= p.min_quantity ? '⚠️' : ''}
                            </td>
                            <td class="text-sm text-muted">${p.min_quantity || '-'}</td>
                            <td>${p.supplier || '<span class="text-muted">-</span>'}</td>
                            <td>
                                <div class="flex gap-1">
                                    <button class="btn-icon" onclick="openPartForm('${p.id}')" title="تعديل"><i class="fas fa-pen"></i></button>
                                    <button class="btn-icon" onclick="adjustPartQuantity('${p.id}')" title="تعديل الكمية"><i class="fas fa-plus-minus"></i></button>
                                    <button class="btn-icon text-red" onclick="confirmDelete('part','${p.id}')" title="حذف"><i class="fas fa-trash"></i></button>
                                </div>
                            </td>
                        </tr>
                    `).join('') || '<tr><td colspan="8" class="text-center py-6 text-gray-400">لا توجد قطع غيار</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}

async function adjustPartQuantity(partId) {
    const part = globalParts.find(p => p.id === partId);
    if (!part) return;
    
    const newQuantity = prompt(`تعديل كمية "${part.name}"\nالكمية الحالية: ${part.quantity}`, part.quantity);
    if (newQuantity === null) return;
    
    const quantity = parseInt(newQuantity);
    if (isNaN(quantity) || quantity < 0) {
        alert('❌ الرجاء إدخال رقم صحيح');
        return;
    }
    
    try {
        await updateDoc(doc(db, "parts", partId), { quantity: quantity });
        await loadAllData();
        loadInventoryTable();
        loadDashboard();
        updateAlertsCount();
        alert('✅ تم تحديث الكمية بنجاح');
    } catch (error) {
        console.error("خطأ في تحديث الكمية:", error);
        alert('❌ حدث خطأ: ' + error.message);
    }
}

// ================================
// 4. المصاريف
// ================================
function openExpenseForm(expenseId = null) {
    showModal('expense-modal');
    document.getElementById('expense-form').reset();
    document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
    
    if (expenseId) {
        const e = globalExpenses.find(e => e.id === expenseId);
        if (e) {
            document.getElementById('expense-modal-title').textContent = 'تعديل مصروف';
            document.getElementById('expense-id').value = e.id;
            document.getElementById('expense-title').value = e.title || '';
            document.getElementById('expense-category').value = e.category || 'أخرى';
            document.getElementById('expense-amount').value = e.amount || 0;
            document.getElementById('expense-date').value = e.date || '';
            document.getElementById('expense-notes').value = e.notes || '';
        }
    } else {
        document.getElementById('expense-modal-title').textContent = 'إضافة مصروف';
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
        ownerId: ownerId,
        updated_at: serverTimestamp()
    };
    
    try {
        if (id) { 
            await updateDoc(doc(db, "expenses", id), data); 
        } else { 
            await addDoc(collection(db, "expenses"), { ...data, created_at: serverTimestamp() }); 
        }
        await loadAllData();
        closeExpenseForm();
        loadExpensesTable();
        loadDashboard();
        alert('✅ تم حفظ المصروف بنجاح');
    } catch (error) { 
        console.error("خطأ في حفظ المصروف:", error); 
        alert('❌ حدث خطأ في الحفظ: ' + error.message);
    }
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
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();
    const monthlyExpenses = globalExpenses
        .filter(e => {
            const eDate = new Date(e.date);
            return eDate.getMonth() === thisMonth && eDate.getFullYear() === thisYear;
        })
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    
    document.getElementById('expenses-count').textContent = `${filtered.length} مصروف`;
    document.getElementById('expenses-summary').innerHTML = `
        <div class="stat-card">
            <div class="stat-card-icon icon-red"><i class="fas fa-receipt"></i></div>
            <p class="stat-card-title">إجمالي المصاريف</p>
            <p class="stat-card-value">${formatCurrency(total)}</p>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon icon-amber"><i class="fas fa-calendar-alt"></i></div>
            <p class="stat-card-title">مصاريف الشهر الحالي</p>
            <p class="stat-card-value">${formatCurrency(monthlyExpenses)}</p>
        </div>
    `;
    
    document.getElementById('expenses-list').innerHTML = filtered.length > 0 ? 
        filtered.map(e => `
            <div class="card">
                <div class="card-body">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-3">
                            <div class="p-2 rounded-lg bg-gray-100">
                                <i class="fas fa-receipt text-gray-500"></i>
                            </div>
                            <div>
                                <p class="font-semibold">${e.title || 'بدون عنوان'}</p>
                                <p class="text-xs text-gray-500">
                                    ${e.date || ''} · ${e.category || 'أخرى'}
                                    ${e.notes ? ' — ' + e.notes : ''}
                                </p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="font-bold text-red-600">${formatCurrency(e.amount)}</span>
                            <button class="btn-icon" onclick="openExpenseForm('${e.id}')" title="تعديل"><i class="fas fa-pen"></i></button>
                            <button class="btn-icon text-red" onclick="confirmDelete('expense','${e.id}')" title="حذف"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('') : 
        '<p class="text-center text-gray-400 py-10">لا توجد مصاريف مسجلة</p>';
}

// ================================
// 5. العملاء
// ================================
function loadCustomersTable() {
    const search = (document.getElementById('customer-search')?.value || '').toLowerCase();
    
    // تجميع بيانات العملاء من أوامر الصيانة
    const customerMap = {};
    globalRepairs.forEach(r => {
        if (!r.customer_name) return;
        const key = r.customer_phone || r.customer_name;
        if (!customerMap[key]) {
            customerMap[key] = { 
                name: r.customer_name, 
                phone: r.customer_phone || '', 
                repairs: [], 
                totalPaid: 0, 
                lastDate: null 
            };
        }
        customerMap[key].repairs.push(r);
        customerMap[key].totalPaid += (Number(r.repair_price) || 0);
        const d = r.receive_date ? new Date(r.receive_date) : new Date();
        if (!customerMap[key].lastDate || d > customerMap[key].lastDate) {
            customerMap[key].lastDate = d;
        }
    });
    
    let customers = Object.values(customerMap).map((c, idx) => ({
        ...c, 
        id: idx,
        lastVisit: c.lastDate ? c.lastDate.toISOString().split('T')[0] : '-',
    })).sort((a, b) => (b.lastDate || 0) - (a.lastDate || 0));
    
    if (search) {
        customers = customers.filter(c => 
            c.name?.toLowerCase().includes(search) || 
            c.phone?.includes(search)
        );
    }
    
    const totalRevenue = customers.reduce((s, c) => s + c.totalPaid, 0);
    const topCustomer = [...customers].sort((a, b) => b.repairs.length - a.repairs.length)[0];
    
    document.getElementById('customers-count').textContent = `${customers.length} عميل مسجل`;
    document.getElementById('customers-summary').innerHTML = `
        <div class="stat-card">
            <div class="stat-card-icon icon-blue"><i class="fas fa-users"></i></div>
            <p class="stat-card-title">إجمالي العملاء</p>
            <p class="stat-card-value">${customers.length}</p>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon icon-green"><i class="fas fa-dollar-sign"></i></div>
            <p class="stat-card-title">إجمالي الإيرادات</p>
            <p class="stat-card-value">${formatCurrency(totalRevenue)}</p>
        </div>
        ${topCustomer ? `
        <div class="stat-card">
            <div class="stat-card-icon icon-amber"><i class="fas fa-star"></i></div>
            <p class="stat-card-title">الأكثر تعاملاً</p>
            <p class="stat-card-value text-lg">${topCustomer.name}</p>
            <p class="stat-card-sub">${topCustomer.repairs.length} جهاز</p>
        </div>` : ''}
    `;
    
    document.getElementById('customers-list').innerHTML = customers.length > 0 ? 
        customers.map(c => `
            <div class="card customer-card" onclick="toggleCustomerRepairs(${c.id})">
                <div class="card-body">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                <i class="fas fa-user text-blue-600"></i>
                            </div>
                            <div>
                                <p class="font-bold">${c.name || 'غير معروف'}</p>
                                <p class="text-sm text-gray-500">📞 ${c.phone || 'لا يوجد رقم'}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-4">
                            <div class="text-center">
                                <p class="text-xs text-gray-400">عدد الأجهزة</p>
                                <p class="font-bold">${c.repairs.length}</p>
                            </div>
                            <div class="text-center">
                                <p class="text-xs text-gray-400">إجمالي المدفوع</p>
                                <p class="font-bold text-blue-600">${formatCurrency(c.totalPaid)}</p>
                            </div>
                            <div class="text-center">
                                <p class="text-xs text-gray-400">آخر زيارة</p>
                                <p class="text-sm">${c.lastVisit}</p>
                            </div>
                            <i class="fas fa-chevron-down text-gray-400" id="customer-chevron-${c.id}"></i>
                        </div>
                    </div>
                    <div class="customer-repairs mt-3 pt-3 hidden" id="customer-repairs-${c.id}">
                        <p class="text-xs font-bold text-gray-500 mb-2">سجل الصيانة</p>
                        ${c.repairs.map(r => `
                            <div class="customer-repair-item">
                                <div class="flex justify-between items-center">
                                    <div>
                                        <p class="font-semibold text-sm">${r.device_name || 'غير محدد'}</p>
                                        <p class="text-xs text-gray-500">${r.receive_date || ''} · ${r.technician || 'بدون فني'}</p>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        ${getStatusBadge(r.status)}
                                        <span class="font-bold text-blue-600">${formatCurrency(r.repair_price)}</span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `).join('') : 
        '<div class="card"><div class="card-body text-center py-6 text-gray-400">لا يوجد عملاء مسجلين</div></div>';
}

function toggleCustomerRepairs(id) {
    const div = document.getElementById('customer-repairs-' + id);
    const chevron = document.getElementById('customer-chevron-' + id);
    if (div) {
        div.classList.toggle('hidden');
        if (chevron) { 
            chevron.classList.toggle('fa-chevron-down'); 
            chevron.classList.toggle('fa-chevron-up'); 
        }
    }
}

// ================================
// 6. المحافظ الإلكترونية
// ================================
function loadWallets() {
    const totalBalance = globalWallets.reduce((s, w) => s + (Number(w.balance) || 0), 0);
    const dailyTotal = globalWallets.reduce((s, w) => s + (Number(w.daily_used) || 0), 0);
    const monthlyTotal = globalWallets.reduce((s, w) => s + (Number(w.monthly_used) || 0), 0);
    
    document.getElementById('wallet-summary-cards').innerHTML = `
        <div class="stat-card">
            <div class="stat-card-icon icon-green"><i class="fas fa-wallet"></i></div>
            <p class="stat-card-title">إجمالي الأرصدة</p>
            <p class="stat-card-value">${formatCurrency(totalBalance)}</p>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon icon-blue"><i class="fas fa-calendar-day"></i></div>
            <p class="stat-card-title">المستعمل اليوم</p>
            <p class="stat-card-value">${formatCurrency(dailyTotal)}</p>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon icon-amber"><i class="fas fa-calendar-alt"></i></div>
            <p class="stat-card-title">المستعمل الشهر</p>
            <p class="stat-card-value">${formatCurrency(monthlyTotal)}</p>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon icon-purple"><i class="fas fa-university"></i></div>
            <p class="stat-card-title">عدد المحافظ</p>
            <p class="stat-card-value">${globalWallets.length}</p>
        </div>
    `;
    
    document.getElementById('wallets-table-body').innerHTML = globalWallets.length > 0 ? 
        globalWallets.map(w => {
            const pctDaily = w.daily_limit > 0 ? Math.round((w.daily_used / w.daily_limit) * 100) : 0;
            const pctMonthly = w.monthly_limit > 0 ? Math.round((w.monthly_used / w.monthly_limit) * 100) : 0;
            let limitStatus = '';
            if (w.daily_used >= w.daily_limit || w.monthly_used >= w.monthly_limit) {
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
                    <div class="flex gap-1">
                        <button class="btn-primary btn-xs" onclick="openTransactionModal('${w.id}')"><i class="fas fa-exchange-alt"></i></button>
                        <button class="btn-danger btn-xs" onclick="confirmDelete('wallet','${w.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td></tr>`;
        }).join('') : 
        '<tr><td colspan="9" class="text-center py-6 text-gray-400">لا توجد محافظ</td></tr>';
    
    const sorted = [...globalTransactions].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    document.getElementById('wallet-transactions-body').innerHTML = sorted.length > 0 ? 
        sorted.slice(0, 20).map(t => {
            const wallet = globalWallets.find(w => w.id === t.wallet_id);
            return `<tr>
                <td class="text-sm">${t.date || '-'}</td>
                <td class="font-semibold">${wallet ? wallet.name : '—'}</td>
                <td>${t.type === 'deposit' ? '<span class="badge badge-green">إيداع</span>' : '<span class="badge badge-red">سحب</span>'}</td>
                <td class="font-bold">${formatCurrency(t.amount)}</td>
                <td class="text-sm text-gray-500">${t.notes || '—'}</td></tr>`;
        }).join('') : 
        '<tr><td colspan="5" class="text-center py-6 text-gray-400">لا توجد عمليات</td></tr>';
}

function onWalletTypeChange() {
    const type = document.getElementById('wallet-type').value;
    const info = document.getElementById('wallet-limits-info');
    if (type && walletLimits[type]) {
        info.classList.remove('hidden');
        info.innerHTML = `📊 الحد اليومي: <strong>${walletLimits[type].daily.toLocaleString()} ج.م</strong> | الحد الشهري: <strong>${walletLimits[type].monthly.toLocaleString()} ج.م</strong> | أقصى رصيد: <strong>${walletLimits[type].max_balance.toLocaleString()} ج.م</strong>`;
    } else {
        info.classList.add('hidden');
    }
}

function openWalletModal(walletId = null) {
    showModal('wallet-modal');
    document.getElementById('wallet-form').reset();
    document.getElementById('wallet-limits-info').classList.add('hidden');
    
    if (walletId) {
        const w = globalWallets.find(w => w.id === walletId);
        if (w) {
            document.getElementById('wallet-modal-title').textContent = 'تعديل محفظة';
            document.getElementById('wallet-id').value = w.id;
            document.getElementById('wallet-name').value = w.name || '';
            document.getElementById('wallet-phone').value = w.phone || '';
            document.getElementById('wallet-type').value = w.type || '';
            onWalletTypeChange();
        }
    } else {
        document.getElementById('wallet-modal-title').textContent = 'إضافة محفظة جديدة';
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
        type, 
        daily_limit: limits.daily, 
        monthly_limit: limits.monthly,
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
            data.balance = 0;
            data.daily_used = 0;
            data.monthly_used = 0;
            await addDoc(collection(db, "wallets"), { ...data, created_at: serverTimestamp() });
        }
        await loadAllData();
        closeWalletModal();
        loadWallets();
        alert('✅ تم حفظ المحفظة بنجاح');
    } catch (error) { 
        console.error("خطأ في حفظ المحفظة:", error); 
        alert('❌ حدث خطأ: ' + error.message);
    }
}

function openTransactionModal(walletId) {
    showModal('transaction-modal');
    document.getElementById('transaction-form').reset();
    document.getElementById('transaction-wallet-id').value = walletId;
    document.getElementById('transaction-limit-warning').classList.add('hidden');
}

function closeTransactionModal() { hideModal('transaction-modal'); }

async function saveTransaction(e) {
    e.preventDefault();
    const walletId = document.getElementById('transaction-wallet-id').value;
    const type = document.getElementById('transaction-type').value;
    const amount = parseFloat(document.getElementById('transaction-amount').value);
    const notes = document.getElementById('transaction-notes').value;
    const wallet = globalWallets.find(w => w.id === walletId);
    
    if (!wallet) {
        alert('❌ المحفظة غير موجودة');
        return;
    }
    
    const warningDiv = document.getElementById('transaction-limit-warning');
    
    if (type === 'withdraw') {
        if (amount > (Number(wallet.balance) || 0)) {
            warningDiv.textContent = '❌ الرصيد غير كافي.';
            warningDiv.classList.remove('hidden');
            return;
        }
        if ((Number(wallet.daily_used) + amount) > wallet.daily_limit) {
            warningDiv.textContent = `❌ هذه العملية تتجاوز الحد اليومي (${formatCurrency(wallet.daily_limit)}).`;
            warningDiv.classList.remove('hidden');
            return;
        }
        if ((Number(wallet.monthly_used) + amount) > wallet.monthly_limit) {
            warningDiv.textContent = `❌ هذه العملية تتجاوز الحد الشهري (${formatCurrency(wallet.monthly_limit)}).`;
            warningDiv.classList.remove('hidden');
            return;
        }
    }
    
    try {
        const newBalance = type === 'withdraw' ? 
            Number(wallet.balance) - amount : 
            Number(wallet.balance) + amount;
        const newDailyUsed = type === 'withdraw' ? 
            Number(wallet.daily_used) + amount : 
            Number(wallet.daily_used);
        const newMonthlyUsed = type === 'withdraw' ? 
            Number(wallet.monthly_used) + amount : 
            Number(wallet.monthly_used);
        
        await updateDoc(doc(db, "wallets", walletId), {
            balance: newBalance,
            daily_used: newDailyUsed,
            monthly_used: newMonthlyUsed,
        });
        
        await addDoc(collection(db, "transactions"), {
            wallet_id: walletId, 
            type, 
            amount,
            date: new Date().toISOString().split('T')[0],
            notes, 
            ownerId,
            created_at: serverTimestamp()
        });
        
        await loadAllData();
        closeTransactionModal();
        loadWallets();
        alert('✅ تمت العملية بنجاح');
    } catch (error) { 
        console.error("خطأ في العملية:", error); 
        alert('❌ حدث خطأ: ' + error.message);
    }
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
    const maintenanceProfit = totalRevenue - totalPartsCost - totalTechFees;
    const maintenanceMargin = totalRevenue > 0 ? Math.round((maintenanceProfit / totalRevenue) * 100) : 0;
    
    // مؤشرات الأداء الرئيسية
    document.getElementById('reports-kpi').innerHTML = `
        <div class="stat-card">
            <p class="stat-card-title">إجمالي الإيرادات</p>
            <p class="stat-card-value">${formatCurrency(totalRevenue)}</p>
            <p class="stat-card-sub">${globalRepairs.length} عملية</p>
        </div>
        <div class="stat-card">
            <p class="stat-card-title">ربح الصيانة</p>
            <p class="stat-card-value">${formatCurrency(maintenanceProfit)}</p>
            <p class="stat-card-sub">هامش: ${maintenanceMargin}%</p>
        </div>
        <div class="stat-card">
            <p class="stat-card-title">المصاريف التشغيلية</p>
            <p class="stat-card-value">${formatCurrency(totalExpensesVal)}</p>
            <p class="stat-card-sub">${globalExpenses.length} مصروف</p>
        </div>
        <div class="stat-card">
            <p class="stat-card-title">صافي الربح الحقيقي</p>
            <p class="stat-card-value">${formatCurrency(profit)}</p>
            <p class="stat-card-sub">هامش صافي: ${margin}%</p>
        </div>
    `;
    
    // تفصيل الأرباح
    document.getElementById('profit-breakdown').innerHTML = `
        <p class="font-bold text-teal-800 mb-3">📊 تفصيل صافي الربح الحقيقي</p>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
            <div class="bg-white rounded-lg p-3">
                <span class="text-xs text-gray-500">إيرادات الصيانة</span>
                <p class="font-bold text-blue-600">${formatCurrency(totalRevenue)}</p>
            </div>
            <div class="bg-white rounded-lg p-3">
                <span class="text-xs text-gray-500">تكاليف قطع الغيار</span>
                <p class="font-bold text-purple-600">- ${formatCurrency(totalPartsCost)}</p>
            </div>
            <div class="bg-white rounded-lg p-3">
                <span class="text-xs text-gray-500">أجور الفنيين</span>
                <p class="font-bold text-amber-600">- ${formatCurrency(totalTechFees)}</p>
            </div>
            <div class="bg-white rounded-lg p-3">
                <span class="text-xs text-gray-500">المصاريف التشغيلية</span>
                <p class="font-bold text-red-600">- ${formatCurrency(totalExpensesVal)}</p>
            </div>
            <div class="bg-teal-50 rounded-lg p-3 border-2 border-teal-300">
                <span class="text-xs text-gray-500">= صافي الربح</span>
                <p class="font-bold text-teal-700">${formatCurrency(profit)}</p>
            </div>
        </div>
    `;
    
    // تحليل شهري حقيقي
    const monthlyData = getMonthlyData();
    
    // تحديث الرسوم البيانية
    setTimeout(() => {
        loadReportsCharts(monthlyData);
    }, 300);
    
    // أداء الفنيين
    const techMap = {};
    globalRepairs.forEach(r => {
        if (!r.technician) return;
        if (!techMap[r.technician]) techMap[r.technician] = { name: r.technician, orders: 0, revenue: 0, completed: 0 };
        techMap[r.technician].orders++;
        techMap[r.technician].revenue += (Number(r.repair_price) || 0);
        if (r.status === 'تم_التسليم') techMap[r.technician].completed++;
    });
    
    document.getElementById('technician-performance').innerHTML = Object.values(techMap).length > 0 ?
        Object.values(techMap).map((t, i) => `
            <div class="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 mb-2">
                <span class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs font-bold text-blue-600">${i + 1}</span>
                <div class="flex-1">
                    <p class="font-semibold">${t.name}</p>
                    <p class="text-xs text-gray-500">${t.completed} مكتمل من ${t.orders}</p>
                </div>
                <div class="text-sm text-gray-500">${t.orders} عمليات</div>
                <div class="font-bold text-blue-600">${formatCurrency(t.revenue)}</div>
            </div>
        `).join('') : 
        '<p class="text-gray-400 text-center py-4">لا توجد بيانات فنيين</p>';
    
    // أفضل العملاء
    const custMap = {};
    globalRepairs.forEach(r => {
        if (!r.customer_name) return;
        if (!custMap[r.customer_name]) custMap[r.customer_name] = { name: r.customer_name, total: 0, orders: 0 };
        custMap[r.customer_name].total += (Number(r.repair_price) || 0);
        custMap[r.customer_name].orders++;
    });
    
    document.getElementById('top-customers').innerHTML = Object.values(custMap).length > 0 ?
        Object.values(custMap)
            .sort((a, b) => b.total - a.total)
            .slice(0, 8)
            .map((c, i) => `
                <div class="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 mb-2">
                    <span class="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center text-xs font-bold text-amber-600">${i + 1}</span>
                    <div class="flex-1"><p class="font-semibold text-sm">${c.name}</p></div>
                    <div class="font-bold text-blue-600 text-sm">${formatCurrency(c.total)}</div>
                    <div class="text-xs text-gray-500">${c.orders} طلب</div>
                </div>
            `).join('') : 
        '<p class="text-gray-400 text-center py-4">لا توجد بيانات عملاء</p>';
        
    // أكثر الأجهزة صيانةً
    const deviceMap = {};
    globalRepairs.forEach(r => {
        if (!r.device_name) return;
        if (!deviceMap[r.device_name]) deviceMap[r.device_name] = { name: r.device_name, count: 0 };
        deviceMap[r.device_name].count++;
    });
    
    document.getElementById('top-devices').innerHTML = Object.values(deviceMap).length > 0 ?
        Object.values(deviceMap)
            .sort((a, b) => b.count - a.count)
            .slice(0, 8)
            .map((d, i) => `
                <div class="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 mb-2">
                    <span class="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-xs font-bold text-purple-600">${i + 1}</span>
                    <div class="flex-1"><p class="font-semibold text-sm">${d.name}</p></div>
                    <div class="text-sm font-bold">${d.count} جهاز</div>
                </div>
            `).join('') : 
        '<p class="text-gray-400 text-center py-4">لا توجد بيانات أجهزة</p>';
}

function loadReportsCharts(monthlyData) {
    const revenueCtx = document.getElementById('reports-revenue-chart');
    const ordersCtx = document.getElementById('reports-orders-chart');
    const expensesCtx = document.getElementById('reports-expenses-pie');
    
    if (!revenueCtx || !ordersCtx || !expensesCtx) return;
    
    // رسم الإيرادات والمصاريف
    if (charts.revenue) charts.revenue.destroy();
    charts.revenue = new Chart(revenueCtx, {
        type: 'bar',
        data: {
            labels: monthlyData.map(d => d.month),
            datasets: [
                {
                    label: 'الإيرادات',
                    data: monthlyData.map(d => d.revenue),
                    backgroundColor: '#3b82f6',
                    borderRadius: 8
                },
                {
                    label: 'المصاريف',
                    data: monthlyData.map(d => d.expenses),
                    backgroundColor: '#ef4444',
                    borderRadius: 8
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'Tajawal', size: 12 } } }
            },
            scales: {
                y: {
                    ticks: { callback: v => v.toLocaleString() + ' ج.م' }
                }
            }
        }
    });
    
    // رسم عدد الأوامر
    if (charts.ordersReport) charts.ordersReport.destroy();
    charts.ordersReport = new Chart(ordersCtx, {
        type: 'line',
        data: {
            labels: monthlyData.map(d => d.month),
            datasets: [{
                label: 'عدد أوامر الصيانة',
                data: monthlyData.map(d => d.orders),
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'Tajawal', size: 12 } } }
            }
        }
    });
    
    // رسم توزيع المصاريف
    const expenseCategories = {};
    globalExpenses.forEach(e => {
        const cat = e.category || 'أخرى';
        if (!expenseCategories[cat]) expenseCategories[cat] = 0;
        expenseCategories[cat] += (Number(e.amount) || 0);
    });
    
    if (charts.expensesPie) charts.expensesPie.destroy();
    charts.expensesPie = new Chart(expensesCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(expenseCategories),
            datasets: [{
                data: Object.values(expenseCategories),
                backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899']
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'Tajawal', size: 12 } } }
            }
        }
    });
}

// ================================
// 8. التنبيهات
// ================================
function updateAlertsCount() {
    const lowStock = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity).length;
    const overdue = globalRepairs.filter(r => {
        if (!r.delivery_date || r.status === 'تم_التسليم') return false;
        return new Date(r.delivery_date) < new Date();
    }).length;
    const total = lowStock + overdue;
    
    const badge = document.getElementById('alerts-count');
    if (badge) {
        badge.textContent = total;
        badge.classList.toggle('hidden', total === 0);
    }
}

function loadAlerts() {
    const now = new Date();
    
    const lowStockAlerts = globalParts
        .filter(p => p.min_quantity && p.quantity <= p.min_quantity)
        .map(p => ({
            type: 'stock',
            title: `مخزون منخفض: ${p.name}`,
            desc: `الكمية المتبقية ${p.quantity} (الحد الأدنى: ${p.min_quantity})`,
            severity: p.quantity === 0 ? 'critical' : 'warning',
            icon: 'fa-box',
            color: 'text-amber-600',
            bg: 'bg-amber-50',
            border: 'border-r-amber-400'
        }));
    
    const overdueAlerts = globalRepairs
        .filter(r => r.delivery_date && r.status !== 'تم_التسليم' && new Date(r.delivery_date) < now)
        .map(r => ({
            type: 'overdue',
            title: `تأخر تسليم: ${r.device_name}`,
            desc: `العميل: ${r.customer_name} — موعد التسليم: ${r.delivery_date}`,
            severity: 'critical',
            icon: 'fa-clock',
            color: 'text-red-600',
            bg: 'bg-red-50',
            border: 'border-r-red-500'
        }));
    
    const allAlerts = [...overdueAlerts, ...lowStockAlerts];
    
    document.getElementById('alerts-summary-text').textContent = 
        allAlerts.length > 0 ? `${allAlerts.length} تنبيه نشط` : 'لا توجد تنبيهات';
    
    document.getElementById('alerts-summary').innerHTML = `
        <div class="stat-card bg-red-50">
            <p class="text-xs text-gray-500">تأخر تسليم</p>
            <p class="text-3xl font-bold text-red-600">${overdueAlerts.length}</p>
        </div>
        <div class="stat-card bg-amber-50">
            <p class="text-xs text-gray-500">مخزون منخفض</p>
            <p class="text-3xl font-bold text-amber-600">${lowStockAlerts.length}</p>
        </div>
    `;
    
    document.getElementById('alerts-list').innerHTML = allAlerts.length > 0 ? 
        allAlerts.map(a => `
            <div class="card ${a.bg} border-r-4 ${a.border}">
                <div class="card-body">
                    <div class="flex items-start gap-3">
                        <div class="p-2 rounded-lg"><i class="fas ${a.icon} ${a.color} text-lg"></i></div>
                        <div>
                            <p class="font-bold">${a.title}</p>
                            <p class="text-sm text-gray-600">${a.desc}</p>
                        </div>
                    </div>
                </div>
            </div>
        `).join('') : 
        `<div class="card">
            <div class="card-body text-center py-10">
                <i class="fas fa-check-circle text-emerald-500 text-4xl mb-3"></i>
                <p class="text-lg font-bold text-emerald-700">كل شيء على ما يرام!</p>
                <p class="text-gray-500">لا توجد تنبيهات حالياً</p>
            </div>
        </div>`;
}

// ================================
// 9. الاشتراكات
// ================================
function loadSubscriptions() {
    // تحديث الاشتراكات المنتهية
    globalSubscriptions.forEach(s => {
        if (s.status === 'نشط' && new Date(s.end_date) < new Date()) {
            s.status = 'منتهي';
        }
    });
    
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
    
    document.getElementById('subs-count-text').textContent = `${globalSubscriptions.length} عميل مشترك`;
    document.getElementById('subscription-summary-cards').innerHTML = `
        <div class="stat-card">
            <div class="stat-card-icon icon-green"><i class="fas fa-check-circle"></i></div>
            <p class="stat-card-title">نشطة</p>
            <p class="stat-card-value">${active}</p>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon icon-blue"><i class="fas fa-dollar-sign"></i></div>
            <p class="stat-card-title">الإيرادات</p>
            <p class="stat-card-value">${formatCurrency(totalRevenue)}</p>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon icon-amber"><i class="fas fa-exclamation-triangle"></i></div>
            <p class="stat-card-title">تنتهي قريباً</p>
            <p class="stat-card-value">${expiringSoon}</p>
        </div>
        <div class="stat-card">
            <div class="stat-card-icon icon-red"><i class="fas fa-times-circle"></i></div>
            <p class="stat-card-title">منتهية</p>
            <p class="stat-card-value">${expired}</p>
        </div>
    `;
    
    let filtered = globalSubscriptions.filter(s => {
        const matchSearch = !search || 
            s.customer_name?.toLowerCase().includes(search) || 
            s.customer_email?.toLowerCase().includes(search);
        const matchStatus = filter === 'all' || s.status === filter;
        return matchSearch && matchStatus;
    });
    
    document.getElementById('subscriptions-table-body').innerHTML = filtered.length > 0 ?
        filtered.map((s, i) => {
            const devices = globalRepairs.filter(r => r.customer_name === s.customer_name).length;
            return `<tr>
                <td class="text-xs text-gray-400">${i + 1}</td>
                <td class="font-semibold">${s.customer_name || 'غير محدد'}</td>
                <td class="text-sm">${s.customer_email || '-'}</td>
                <td><span class="badge badge-blue">${s.plan || 'غير محدد'}</span></td>
                <td class="font-bold text-blue-600">${formatCurrency(s.price)}</td>
                <td class="text-sm">${s.start_date || '-'}</td>
                <td class="text-sm">${s.end_date || '-'}</td>
                <td>${getDaysLeft(s.end_date)}</td>
                <td>${s.status === 'نشط' ? '<span class="badge badge-green">نشط</span>' : '<span class="badge badge-red">منتهي</span>'}</td>
                <td class="font-bold">${devices} جهاز</td>
                <td>
                    <div class="flex gap-1">
                        ${(s.status === 'منتهي' || s.status === 'نشط') ? `<button class="btn-primary btn-xs" onclick="renewSubscription('${s.id}')" title="تجديد"><i class="fas fa-sync-alt"></i></button>` : ''}
                        <button class="btn-danger btn-xs" onclick="confirmDelete('subscription','${s.id}')" title="حذف"><i class="fas fa-trash"></i></button>
                    </div>
                </td></tr>`;
        }).join('') : 
        '<tr><td colspan="11" class="text-center py-6 text-gray-400">لا توجد اشتراكات</td></tr>';
}

function openSubscriptionModal(subId = null) {
    showModal('subscription-modal');
    document.getElementById('subscription-form').reset();
    document.getElementById('subscription-start-date').value = new Date().toISOString().split('T')[0];
    
    // تحميل قائمة المستخدمين
    const select = document.getElementById('subscription-linked-user');
    if (select) {
        select.innerHTML = '<option value="">اختر مستخدم</option>' + 
            globalUsers.map(u => `<option value="${u.id}">${u.fullName || u.name || u.email} (${u.email})</option>`).join('');
    }
    
    if (subId) {
        const s = globalSubscriptions.find(s => s.id === subId);
        if (s) {
            document.getElementById('subscription-modal-title').textContent = 'تعديل اشتراك';
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
        document.getElementById('subscription-modal-title').textContent = 'اشتراك جديد';
        document.getElementById('subscription-id').value = '';
        onSubscriptionPlanChange();
    }
}

function closeSubscriptionModal() { hideModal('subscription-modal'); }

function onLinkedUserChange() {
    const userId = document.getElementById('subscription-linked-user').value;
    if (userId) {
        const user = globalUsers.find(u => u.id === userId);
        if (user) {
            document.getElementById('subscription-customer-name').value = user.fullName || user.name || '';
            document.getElementById('subscription-customer-email').value = user.email || '';
        }
    }
}

function onSubscriptionPlanChange() {
    const plan = document.getElementById('subscription-plan').value;
    const startDate = document.getElementById('subscription-start-date').value || new Date().toISOString().split('T')[0];
    const endDate = new Date(startDate);
    
    if (plan === 'تجريبي') endDate.setDate(endDate.getDate() + 3);
    else if (plan === 'شهري') endDate.setMonth(endDate.getMonth() + 1);
    else if (plan === 'سنوي') endDate.setFullYear(endDate.getFullYear() + 1);
    
    document.getElementById('subscription-end-date').value = endDate.toISOString().split('T')[0];
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
        if (id) { 
            await updateDoc(doc(db, "subscriptions", id), data); 
        } else { 
            await addDoc(collection(db, "subscriptions"), { ...data, created_at: serverTimestamp() }); 
        }
        
        // تحديث حساب المستخدم المرتبط
        if (data.linked_user_id) {
            await updateDoc(doc(db, "users", data.linked_user_id), {
                subscription: { 
                    plan: data.plan, 
                    status: 'نشط', 
                    start_date: data.start_date, 
                    end_date: data.end_date, 
                    price: data.price 
                },
                subscriptionType: data.plan,
                subscriptionEnd: data.end_date,
                status: 'active'
            });
        }
        
        await loadAllData();
        await loadUsersData();
        closeSubscriptionModal();
        loadSubscriptions();
        alert('✅ تم حفظ الاشتراك بنجاح');
    } catch (error) { 
        console.error("خطأ في حفظ الاشتراك:", error); 
        alert('❌ حدث خطأ: ' + error.message);
    }
}

async function renewSubscription(id) {
    const s = globalSubscriptions.find(s => s.id === id);
    if (!s) return;
    
    const newEnd = new Date(s.end_date);
    if (s.plan === 'شهري') newEnd.setMonth(newEnd.getMonth() + 1);
    else if (s.plan === 'سنوي') newEnd.setFullYear(newEnd.getFullYear() + 1);
    else newEnd.setDate(newEnd.getDate() + 3);
    
    try {
        await updateDoc(doc(db, "subscriptions", id), { 
            end_date: newEnd.toISOString().split('T')[0], 
            status: 'نشط' 
        });
        
        // تحديث حساب المستخدم
        if (s.linked_user_id) {
            await updateDoc(doc(db, "users", s.linked_user_id), {
                'subscription.status': 'نشط',
                'subscription.end_date': newEnd.toISOString().split('T')[0],
                subscriptionEnd: newEnd.toISOString().split('T')[0],
                status: 'active',
                subscriptionType: s.plan
            });
        }
        
        await loadAllData();
        loadSubscriptions();
        alert('✅ تم تجديد الاشتراك بنجاح');
    } catch (error) { 
        console.error("خطأ في التجديد:", error); 
        alert('❌ حدث خطأ: ' + error.message);
    }
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
    document.getElementById('technicians-list').innerHTML = globalTechnicians.length > 0 ?
        globalTechnicians.map((t, i) => `
            <div class="flex justify-between items-center bg-gray-50 rounded-lg p-3 mb-2">
                <span class="font-medium">${t}</span>
                <button class="btn-icon text-red" onclick="removeTechnician(${i})" title="حذف"><i class="fas fa-trash"></i></button>
            </div>
        `).join('') : 
        '<p class="text-sm text-gray-500">لم تضف فنيين بعد</p>';
}

function addTechnician() {
    const input = document.getElementById('new-technician');
    const name = input.value.trim();
    if (name) { 
        if (!globalTechnicians.includes(name)) {
            globalTechnicians.push(name); 
            input.value = ''; 
            renderTechnicians(); 
            updateTechSelects(); 
        } else {
            alert('⚠️ هذا الفني موجود بالفعل');
        }
    }
}

function removeTechnician(index) { 
    if (confirm('هل تريد حذف هذا الفني؟')) {
        globalTechnicians.splice(index, 1); 
        renderTechnicians(); 
        updateTechSelects(); 
    }
}

function updateTechSelects() {
    const select = document.getElementById('repair-technician');
    if (select) {
        select.innerHTML = '<option value="">اختر فني</option>' + 
            globalTechnicians.map(t => `<option value="${t}">${t}</option>`).join('');
    }
}

function updateInvoicePreview() {
    document.getElementById('preview-shop-name').textContent = document.getElementById('set-shop-name').value || 'اسم المحل';
    document.getElementById('preview-owner').textContent = document.getElementById('set-owner-name').value || '';
    document.getElementById('preview-phone').textContent = document.getElementById('set-phone').value ? '📞 ' + document.getElementById('set-phone').value : '';
    document.getElementById('preview-address').textContent = document.getElementById('set-address').value ? '📍 ' + document.getElementById('set-address').value : '';
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
        alert('❌ حدث خطأ في الحفظ: ' + error.message);
    }
}

// ================================
// تأكيد الحذف
// ================================
function confirmDelete(type, id) {
    deleteTarget = { type, id };
    const labels = { 
        repair: 'أمر الصيانة', 
        part: 'قطعة الغيار', 
        expense: 'المصروف', 
        wallet: 'المحفظة', 
        subscription: 'الاشتراك',
        user: 'المستخدم'
    };
    
    let name = '';
    if (type === 'repair') name = globalRepairs.find(i => i.id === id)?.device_name;
    else if (type === 'part') name = globalParts.find(i => i.id === id)?.name;
    else if (type === 'expense') name = globalExpenses.find(i => i.id === id)?.title;
    else if (type === 'wallet') name = globalWallets.find(i => i.id === id)?.name;
    else if (type === 'subscription') name = globalSubscriptions.find(i => i.id === id)?.customer_name;
    else if (type === 'user') name = globalUsers.find(i => i.id === id)?.email;
    
    document.getElementById('delete-message').textContent = 
        `هل أنت متأكد من حذف ${labels[type] || ''} "${name || 'غير محدد'}"؟ لا يمكن التراجع عن هذا الإجراء.`;
    showModal('delete-modal');
    document.getElementById('delete-confirm-btn').onclick = executeDelete;
}

function closeDeleteModal() { 
    hideModal('delete-modal'); 
    deleteTarget = null; 
}

async function executeDelete() {
    if (!deleteTarget) return;
    const { type, id } = deleteTarget;
    
    try {
        switch(type) {
            case 'repair': await deleteDoc(doc(db, "repairs", id)); break;
            case 'part': await deleteDoc(doc(db, "parts", id)); break;
            case 'expense': await deleteDoc(doc(db, "expenses", id)); break;
            case 'wallet': 
                await deleteDoc(doc(db, "wallets", id)); 
                // حذف المعاملات المرتبطة
                const relatedTransactions = globalTransactions.filter(t => t.wallet_id === id);
                for (const t of relatedTransactions) {
                    await deleteDoc(doc(db, "transactions", t.id)).catch(() => {});
                }
                break;
            case 'subscription': await deleteDoc(doc(db, "subscriptions", id)); break;
            case 'user': await deleteDoc(doc(db, "users", id)); break;
        }
        
        await loadAllData();
        if (type === 'user') await loadUsersData();
        closeDeleteModal();
        
        // تحديث الواجهات
        loadDashboard();
        updateAlertsCount();
        
        const activeTab = document.querySelector('.tab-content.active')?.id?.replace('tab-', '');
        const refreshMap = {
            'repairs': loadRepairsTable,
            'inventory': loadInventoryTable,
            'expenses': loadExpensesTable,
            'customers': loadCustomersTable,
            'wallet': loadWallets,
            'subscriptions': loadSubscriptions
        };
        if (refreshMap[activeTab]) refreshMap[activeTab]();
        
        alert('✅ تم الحذف بنجاح');
    } catch (error) { 
        console.error("خطأ في الحذف:", error); 
        alert('❌ حدث خطأ في الحذف: ' + error.message);
    }
}

// ================================
// تعريض الدوال للنطاق العام
// ================================
window.openRepairForm = openRepairForm;
window.closeRepairForm = closeRepairForm;
window.openPartForm = openPartForm;
window.closePartForm = closePartForm;
window.adjustPartQuantity = adjustPartQuantity;
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
window.switchTab = switchTab;
window.toggleReorder = toggleReorder;
window.openBarcodeScanner = openBarcodeScanner;
window.toggleCustomerRepairs = toggleCustomerRepairs;
window.addNewUser = addNewUser;
window.editUserRole = editUserRole;
window.logout = logout;

// بدء التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', initApp);
