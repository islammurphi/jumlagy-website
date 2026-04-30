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
// دوال مساعدة للواجهة
// ================================
window.showModal = function(id) { 
    const el = document.getElementById(id); 
    if (el) el.classList.add('show'); 
};

window.hideModal = function(id) { 
    const el = document.getElementById(id); 
    if (el) el.classList.remove('show'); 
};

// ================================
// المتغيرات العامة
// ================================
let ownerId = null;
let deleteTarget = null;
let charts = {};
let globalRepairs = [];
let globalParts = [];
let globalExpenses = [];
let globalWallets = [];
let globalTransactions = [];
let globalSubscriptions = [];
let globalUsers = [];
let globalSettings = {};
let globalTechnicians = ['أحمد', 'محمد', 'محمود'];

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
function formatCurrency(amount) { 
    return Number(amount || 0).toLocaleString('ar-EG') + ' ج.م'; 
}

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
    const end = new Date(endDate);
    const today = new Date();
    const diff = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `<span class="badge badge-red">انتهي منذ ${Math.abs(diff)} يوم</span>`;
    if (diff === 0) return '<span class="badge badge-red">ينتهي اليوم!</span>';
    if (diff <= 30) return `<span class="badge badge-amber">متبقي ${diff} يوم</span>`;
    return `<span class="badge badge-green">متبقي ${diff} يوم</span>`;
}

function showLoading() { 
    const el = document.getElementById('loading-overlay'); 
    if (el) el.classList.add('show'); 
}

function hideLoading() { 
    const el = document.getElementById('loading-overlay'); 
    if (el) el.classList.remove('show'); 
}

// ================================
// التهيئة الرئيسية
// ================================
async function initApp() {
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
    if (currentDate) {
        currentDate.textContent = new Date().toLocaleDateString('ar-EG', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    }
    
    // إظهار/إخفاء عناصر المدير
    const isAdmin = session.role === 'admin';
    const subsLink = document.querySelector('[data-tab="subscriptions"]');
    if (subsLink) subsLink.style.display = isAdmin ? 'flex' : 'none';
    
    const usersCard = document.getElementById('users-manager-card');
    if (usersCard) usersCard.style.display = isAdmin ? 'block' : 'none';
    
    // ربط الأحداث
    bindEvents();
    
    // تحميل البيانات
    showLoading();
    await loadAllData();
    await seedDemoData();
    
    // تحميل الواجهات
    loadDashboard();
    loadSettings();
    updateAlertsCount();
    checkSubscriptionBanner();
    
    hideLoading();
}

function bindEvents() {
    // التنقل بين التبويبات
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const tab = this.getAttribute('data-tab');
            switchTab(tab);
            if (window.innerWidth <= 768) {
                document.getElementById('sidebar').classList.remove('open');
            }
        });
    });
    
    // زر القائمة للجوال
    const menuToggle = document.getElementById('menu-toggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });
    }
    
    // زر تسجيل الخروج
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) btnLogout.addEventListener('click', logout);
    
    // النماذج
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
    
    const deleteConfirmBtn = document.getElementById('delete-confirm-btn');
    if (deleteConfirmBtn) deleteConfirmBtn.addEventListener('click', executeDelete);
}

function switchTab(tab) {
    // تحديث الروابط النشطة
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    const activeLink = document.querySelector(`[data-tab="${tab}"]`);
    if (activeLink) activeLink.classList.add('active');
    
    // تحديث المحتوى
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const contentTab = document.getElementById('tab-' + tab);
    if (contentTab) contentTab.classList.add('active');
    
    // تحميل البيانات حسب التبويب
    const loaders = { 
        dashboard: loadDashboard, 
        repairs: loadRepairsTable, 
        inventory: loadInventoryTable, 
        expenses: loadExpensesTable, 
        customers: loadCustomersTable, 
        wallet: loadWallets, 
        reports: loadReports, 
        alerts: loadAlerts, 
        subscriptions: loadSubscriptions 
    };
    
    if (loaders[tab]) {
        loaders[tab]();
    }
}

async function logout() {
    localStorage.removeItem('jumlagy_session');
    try {
        await signOut(auth);
    } catch(e) {
        console.error('Logout error:', e);
    }
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
        banner.innerHTML = '⛔ انتهت صلاحية اشتراكك. برجاء التجديد للمتابعة.';
        banner.classList.remove('hidden');
    } else if (daysLeft <= 7) {
        banner.className = 'subscription-banner warning';
        banner.innerHTML = `⚠️ متبقي ${daysLeft} أيام على انتهاء اشتراكك. قم بالتجديد قريباً.`;
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}

// ================================
// تحميل البيانات
// ================================
async function loadAllData() {
    if (!ownerId) return;
    
    try {
        const [repairsSnap, partsSnap, expensesSnap, walletsSnap, transactionsSnap, subscriptionsSnap, settingsDoc, usersSnap] = await Promise.all([
            getDocs(query(collection(db, "repairs"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "parts"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "expenses"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "wallets"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "transactions"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "subscriptions"), where("ownerId", "==", ownerId))),
            getDoc(doc(db, "settings", ownerId)),
            getDocs(collection(db, "users"))
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
        
        if (settingsDoc.exists()) {
            globalSettings = settingsDoc.data();
            globalTechnicians = globalSettings.technicians || ['أحمد', 'محمد', 'محمود'];
        } else {
            globalSettings = {
                shop_name: 'Jumlagy',
                owner_name: 'اسم المحل',
                phone: '01234567890',
                address: 'العنوان',
                warranty_days: 30,
                warranty_notes: 'ضمان 30 يوم على قطع الغيار',
                language: 'ar',
                technicians: globalTechnicians
            };
            await setDoc(doc(db, "settings", ownerId), globalSettings);
        }
        
        const session = JSON.parse(localStorage.getItem('jumlagy_session'));
        if (session?.role === 'admin') {
            globalUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
    } catch (e) {
        console.error('Error loading data:', e);
    }
}

async function seedDemoData() {
    if (!ownerId || globalRepairs.length > 0) return;
    
    const demoRepairs = [
        {
            device_name: 'iPhone 14 Pro Max',
            customer_name: 'أحمد محمد',
            customer_phone: '01001234567',
            technician: 'أحمد',
            status: 'تم_التسليم',
            repair_price: 2500,
            technician_fee: 500,
            spare_part_name: 'شاشة OLED',
            spare_part_cost: 1500,
            receive_date: '2026-04-01',
            delivery_date: '2026-04-03',
            device_issue: 'شاشة مكسورة بالكامل',
            notes: 'تم تغيير الشاشة بنجاح',
            ownerId
        },
        {
            device_name: 'Samsung S24 Ultra',
            customer_name: 'محمود علي',
            customer_phone: '01007654321',
            technician: 'محمد',
            status: 'قيد_الصيانة',
            repair_price: 1800,
            technician_fee: 300,
            spare_part_name: 'بطارية',
            spare_part_cost: 800,
            receive_date: '2026-04-20',
            device_issue: 'بطارية ضعيفة وتفريغ سريع',
            notes: 'بانتظار قطعة الغيار',
            ownerId
        },
        {
            device_name: 'iPad Air 5',
            customer_name: 'سارة حسن',
            customer_phone: '01001112233',
            technician: 'محمود',
            status: 'جاهز',
            repair_price: 1200,
            technician_fee: 250,
            spare_part_name: 'منفذ شحن',
            spare_part_cost: 300,
            receive_date: '2026-04-18',
            delivery_date: '2026-04-22',
            device_issue: 'لا يشحن نهائياً',
            notes: 'تم تغيير منفذ الشحن',
            ownerId
        }
    ];
    
    const demoParts = [
        {
            name: 'شاشة iPhone 14 Pro Max',
            category: 'شاشات',
            purchase_price: 1200,
            selling_price: 2500,
            quantity: 5,
            min_quantity: 2,
            supplier: 'مورد الشاشات',
            ownerId
        },
        {
            name: 'بطارية Samsung S24',
            category: 'بطاريات',
            purchase_price: 300,
            selling_price: 800,
            quantity: 10,
            min_quantity: 3,
            supplier: 'مورد البطاريات',
            ownerId
        },
        {
            name: 'منفذ شحن iPad',
            category: 'شواحن',
            purchase_price: 150,
            selling_price: 300,
            quantity: 8,
            min_quantity: 2,
            supplier: 'مورد القطع',
            ownerId
        }
    ];
    
    const demoExpenses = [
        {
            title: 'إيجار المحل',
            category: 'إيجار',
            amount: 3000,
            date: '2026-04-01',
            notes: 'إيجار شهر أبريل',
            ownerId
        },
        {
            title: 'فاتورة الكهرباء',
            category: 'كهرباء',
            amount: 450,
            date: '2026-04-05',
            notes: 'استهلاك شهر مارس',
            ownerId
        }
    ];
    
    try {
        for (const r of demoRepairs) await addDoc(collection(db, "repairs"), r);
        for (const p of demoParts) await addDoc(collection(db, "parts"), p);
        for (const e of demoExpenses) await addDoc(collection(db, "expenses"), e);
        await loadAllData();
    } catch (e) {
        console.error('Error seeding demo data:', e);
    }
}

// ================================
// لوحة التحكم
// ================================
function loadDashboard() {
    // البيانات المالية
    const totalRevenue = globalRepairs.reduce((s, r) => s + (Number(r.repair_price) || 0), 0);
    const totalPartsCost = globalRepairs.reduce((s, r) => s + (Number(r.spare_part_cost) || 0), 0);
    const totalTechFees = globalRepairs.reduce((s, r) => s + (Number(r.technician_fee) || 0), 0);
    const totalExpenses = globalExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const profit = totalRevenue - totalPartsCost - totalTechFees - totalExpenses;
    const inventoryValue = globalParts.reduce((s, p) => s + (Number(p.purchase_price) || 0) * (Number(p.quantity) || 0), 0);
    const completedOrders = globalRepairs.filter(r => r.status === 'تم_التسليم').length;
    const avgOrderValue = globalRepairs.length > 0 ? Math.round(totalRevenue / globalRepairs.length) : 0;
    
    // KPI Cards
    const statsCards = document.getElementById('stats-cards');
    if (statsCards) {
        statsCards.innerHTML = `
            <div class="stat-card">
                <div class="stat-card-icon icon-blue"><i class="fas fa-dollar-sign"></i></div>
                <p class="stat-card-title">إجمالي الإيرادات</p>
                <p class="stat-card-value">${formatCurrency(totalRevenue)}</p>
                <p class="stat-card-sub">${globalRepairs.length} عملية</p>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon icon-green"><i class="fas fa-chart-line"></i></div>
                <p class="stat-card-title">صافي الأرباح</p>
                <p class="stat-card-value">${formatCurrency(profit)}</p>
                <p class="stat-card-sub">${profit >= 0 ? '✅ رابح' : '⚠️ خاسر'}</p>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon icon-red"><i class="fas fa-receipt"></i></div>
                <p class="stat-card-title">إجمالي المصروفات</p>
                <p class="stat-card-value">${formatCurrency(totalPartsCost + totalTechFees + totalExpenses)}</p>
                <p class="stat-card-sub">قطع: ${formatCurrency(totalPartsCost)} | أجور: ${formatCurrency(totalTechFees)}</p>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon icon-purple"><i class="fas fa-box"></i></div>
                <p class="stat-card-title">قيمة المخزون</p>
                <p class="stat-card-value">${formatCurrency(inventoryValue)}</p>
                <p class="stat-card-sub">${globalParts.length} صنف</p>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon icon-cyan"><i class="fas fa-shopping-cart"></i></div>
                <p class="stat-card-title">متوسط قيمة الطلب</p>
                <p class="stat-card-value">${formatCurrency(avgOrderValue)}</p>
                <p class="stat-card-sub">${completedOrders} طلب مكتمل</p>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon icon-teal"><i class="fas fa-check-circle"></i></div>
                <p class="stat-card-title">معدل الإتمام</p>
                <p class="stat-card-value">${globalRepairs.length > 0 ? Math.round((completedOrders / globalRepairs.length) * 100) : 0}%</p>
                <p class="stat-card-sub">${completedOrders} من ${globalRepairs.length}</p>
            </div>
        `;
    }
    
    // حالة المخزون
    const inventoryStatus = document.getElementById('inventory-status');
    if (inventoryStatus) {
        const available = globalParts.filter(p => !p.min_quantity || p.quantity > p.min_quantity).length;
        const low = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity && p.quantity > 0).length;
        const out = globalParts.filter(p => p.quantity === 0).length;
        
        inventoryStatus.innerHTML = `
            <div style="background: #ecfdf5; border-radius: 12px; padding: 16px; text-align: center; border: 1px solid #a7f3d0;">
                <div style="font-size: 28px; font-weight: 800; color: #059669;">${available}</div>
                <div style="font-size: 12px; color: #047857;">متوفر</div>
            </div>
            <div style="background: #fffbeb; border-radius: 12px; padding: 16px; text-align: center; border: 1px solid #fde68a;">
                <div style="font-size: 28px; font-weight: 800; color: #d97706;">${low}</div>
                <div style="font-size: 12px; color: #b45309;">منخفض</div>
            </div>
            <div style="background: #fef2f2; border-radius: 12px; padding: 16px; text-align: center; border: 1px solid #fecaca;">
                <div style="font-size: 28px; font-weight: 800; color: #dc2626;">${out}</div>
                <div style="font-size: 12px; color: #b91c1c;">نافذ</div>
            </div>
        `;
    }
    
    // تنبيهات المخزون المنخفض
    const outOfStockAlerts = document.getElementById('out-of-stock-alerts');
    if (outOfStockAlerts) {
        const lowStockParts = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity);
        if (lowStockParts.length > 0) {
            outOfStockAlerts.innerHTML = `<div class="alert alert-warning">⚠️ مخزون منخفض: ${lowStockParts.map(p => `${p.name} (${p.quantity})`).join('، ')}</div>`;
        } else {
            outOfStockAlerts.innerHTML = '<div class="alert alert-success">✅ جميع القطع متوفرة بكميات كافية</div>';
        }
    }
    
    // أفضل العملاء
    const topCustomersWidget = document.getElementById('top-customers-widget');
    if (topCustomersWidget) {
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
        
        topCustomersWidget.innerHTML = topCustomers.length > 0 ? 
            topCustomers.map((c, i) => `
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
            `).join('') : 
            '<p class="text-center text-muted py-4">لا توجد بيانات كافية</p>';
    }
    
    // آخر الأوامر
    const recentRepairs = document.getElementById('recent-repairs');
    if (recentRepairs) {
        const recent = globalRepairs.slice(0, 5);
        recentRepairs.innerHTML = recent.length > 0 ? 
            recent.map(r => `
                <div class="quick-item">
                    <div>
                        <div class="quick-item-name">${r.device_name || 'جهاز غير محدد'}</div>
                        <div class="quick-item-sub">
                            ${r.customer_name || 'غير معروف'} · ${getStatusBadge(r.status)}
                        </div>
                    </div>
                    <div class="quick-item-amount">${formatCurrency(r.repair_price)}</div>
                </div>
            `).join('') : 
            '<p class="text-center text-muted py-4">لا توجد أوامر صيانة</p>';
    }
    
    // تحميل الرسم البياني
    setTimeout(loadDashboardChart, 300);
    
    // إدارة المستخدمين (للمدير)
    const session = JSON.parse(localStorage.getItem('jumlagy_session'));
    if (session?.role === 'admin') {
        loadUsersManager();
    }
}

function loadDashboardChart() {
    const canvas = document.getElementById('revenueExpenseChart');
    if (!canvas || typeof Chart === 'undefined') return;
    
    // تجميع البيانات الشهرية
    const monthlyData = {};
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    
    globalRepairs.forEach(r => {
        if (r.receive_date) {
            const date = new Date(r.receive_date);
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            if (!monthlyData[key]) {
                monthlyData[key] = {
                    revenue: 0, 
                    expenses: 0, 
                    month: months[date.getMonth()], 
                    year: date.getFullYear()
                };
            }
            monthlyData[key].revenue += Number(r.repair_price) || 0;
            monthlyData[key].expenses += (Number(r.spare_part_cost) || 0) + (Number(r.technician_fee) || 0);
        }
    });
    
    globalExpenses.forEach(e => {
        if (e.date) {
            const date = new Date(e.date);
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            if (!monthlyData[key]) {
                monthlyData[key] = {
                    revenue: 0, 
                    expenses: 0, 
                    month: months[date.getMonth()], 
                    year: date.getFullYear()
                };
            }
            monthlyData[key].expenses += Number(e.amount) || 0;
        }
    });
    
    const sortedData = Object.values(monthlyData)
        .sort((a, b) => a.year - b.year || months.indexOf(a.month) - months.indexOf(b.month))
        .slice(-6); // آخر 6 أشهر
    
    if (charts.revenueExpense) {
        charts.revenueExpense.destroy();
    }
    
    charts.revenueExpense = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: sortedData.map(d => `${d.month} ${d.year}`),
            datasets: [
                {
                    label: 'الإيرادات',
                    data: sortedData.map(d => d.revenue),
                    backgroundColor: 'rgba(37, 99, 235, 0.7)',
                    borderColor: '#2563eb',
                    borderWidth: 2,
                    borderRadius: 8
                },
                {
                    label: 'المصروفات',
                    data: sortedData.map(d => d.expenses),
                    backgroundColor: 'rgba(239, 68, 68, 0.7)',
                    borderColor: '#ef4444',
                    borderWidth: 2,
                    borderRadius: 8
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

// ================================
// إدارة المستخدمين
// ================================
function loadUsersManager() {
    const container = document.getElementById('users-manager');
    if (!container) return;
    
    container.innerHTML = globalUsers.length > 0 ? 
        globalUsers.map(u => `
            <div class="flex justify-between items-center bg-gray-50 rounded-lg px-4 py-3 mb-2">
                <div>
                    <span class="font-medium text-sm">${u.fullName || u.name || u.email}</span>
                    <span class="text-xs text-gray-500 block">${u.email}</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="badge ${u.role === 'admin' ? 'badge-blue' : u.isApproved ? 'badge-green' : 'badge-red'}">
                        ${u.role === 'admin' ? 'مدير' : u.isApproved ? 'مفعل' : 'معلق'}
                    </span>
                    ${u.role !== 'admin' ? 
                        `<button class="btn-xs ${u.isApproved ? 'btn-danger' : 'btn-primary'}" onclick="toggleUserApproval('${u.id}', ${u.isApproved})">
                            ${u.isApproved ? 'حظر' : 'تفعيل'}
                        </button>` : ''
                    }
                </div>
            </div>
        `).join('') : 
        '<p class="text-center text-gray-400 py-6">لا يوجد مستخدمين</p>';
}

async function toggleUserApproval(userId, currentStatus) {
    try {
        await updateDoc(doc(db, "users", userId), {
            isApproved: !currentStatus,
            status: !currentStatus ? 'active' : 'pending'
        });
        await loadAllData();
        loadUsersManager();
        alert(!currentStatus ? '✅ تم تفعيل المستخدم بنجاح' : '🚫 تم حظر المستخدم');
    } catch (e) {
        console.error('Error toggling user approval:', e);
        alert('❌ حدث خطأ أثناء تحديث حالة المستخدم');
    }
}

// ================================
// أوامر الصيانة
// ================================
function openRepairForm(repairId = null) {
    showModal('repair-modal');
    const form = document.getElementById('repair-form');
    if (form) form.reset();
    
    const receiveDate = document.getElementById('repair-receive-date');
    if (receiveDate) receiveDate.value = new Date().toISOString().split('T')[0];
    
    updateTechSelects();
    
    if (repairId) {
        const repair = globalRepairs.find(r => r.id === repairId);
        if (repair) {
            document.getElementById('repair-modal-title').textContent = 'تعديل أمر صيانة';
            document.getElementById('repair-id').value = repair.id;
            document.getElementById('repair-customer-name').value = repair.customer_name || '';
            document.getElementById('repair-customer-phone').value = repair.customer_phone || '';
            document.getElementById('repair-device-name').value = repair.device_name || '';
            document.getElementById('repair-technician').value = repair.technician || '';
            document.getElementById('repair-status').value = repair.status || 'قيد_الصيانة';
            document.getElementById('repair-price').value = repair.repair_price || 0;
            document.getElementById('repair-tech-fee').value = repair.technician_fee || 0;
            document.getElementById('repair-part-name').value = repair.spare_part_name || '';
            document.getElementById('repair-part-cost').value = repair.spare_part_cost || 0;
            document.getElementById('repair-receive-date').value = repair.receive_date || '';
            document.getElementById('repair-delivery-date').value = repair.delivery_date || '';
            document.getElementById('repair-issue').value = repair.device_issue || '';
            document.getElementById('repair-notes').value = repair.notes || '';
        }
    } else {
        document.getElementById('repair-modal-title').textContent = 'أمر صيانة جديد';
        document.getElementById('repair-id').value = '';
    }
}

function closeRepairForm() {
    hideModal('repair-modal');
}

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
        ownerId
    };
    
    try {
        if (id) {
            await updateDoc(doc(db, "repairs", id), data);
        } else {
            await addDoc(collection(db, "repairs"), data);
        }
        await loadAllData();
        closeRepairForm();
        loadRepairsTable();
        loadDashboard();
        updateAlertsCount();
    } catch (e) {
        console.error('Error saving repair:', e);
        alert('❌ حدث خطأ أثناء حفظ أمر الصيانة');
    }
    hideLoading();
}

async function quickStatusChange(repairId, newStatus) {
    try {
        await updateDoc(doc(db, "repairs", repairId), { status: newStatus });
        await loadAllData();
        loadRepairsTable();
        loadDashboard();
    } catch (e) {
        console.error('Error changing status:', e);
    }
}

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
            <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800;900&display=swap" rel="stylesheet">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Tajawal', sans-serif; padding: 40px; color: #1e293b; background: white; }
                .invoice-container { max-width: 700px; margin: 0 auto; }
                .invoice-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid #2563eb; }
                .shop-info h1 { font-size: 32px; font-weight: 900; color: #2563eb; margin-bottom: 8px; }
                .shop-info p { font-size: 14px; color: #64748b; margin-bottom: 4px; }
                .invoice-info { text-align: left; }
                .invoice-info h2 { font-size: 28px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
                .invoice-info p { font-size: 13px; color: #64748b; }
                .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
                .detail-box { background: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; }
                .detail-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
                .detail-value { font-size: 16px; font-weight: 700; color: #0f172a; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                th { background: #2563eb; color: white; padding: 14px 16px; text-align: right; font-size: 13px; font-weight: 700; }
                td { padding: 14px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
                .total-section { background: linear-gradient(135deg, #eff6ff, #dbeafe); border: 2px solid #93c5fd; border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 30px; }
                .total-label { font-size: 14px; color: #64748b; margin-bottom: 8px; }
                .total-amount { font-size: 40px; font-weight: 900; color: #2563eb; }
                .warranty-box { background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-bottom: 30px; }
                .warranty-box h4 { color: #92400e; font-size: 14px; margin-bottom: 4px; }
                .warranty-box p { color: #a16207; font-size: 13px; }
                .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; }
                .signature-box { text-align: center; }
                .signature-line { border-bottom: 1px solid #cbd5e1; margin-bottom: 8px; padding-bottom: 8px; }
                .signature-label { font-size: 13px; color: #94a3b8; }
                .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
                @media print { body { padding: 20px; } .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="invoice-container">
                <div class="invoice-header">
                    <div class="shop-info">
                        <h1>${globalSettings.shop_name || 'Jumlagy'}</h1>
                        <p>👤 ${globalSettings.owner_name || ''}</p>
                        <p>📞 ${globalSettings.phone || ''}</p>
                        <p>📍 ${globalSettings.address || ''}</p>
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
                        <div style="color: #64748b; font-size: 13px; margin-top: 4px;">الفني: ${repair.technician || 'غير محدد'}</div>
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
                    </tbody>
                </table>
                
                <div class="total-section">
                    <div class="total-label">الإجمالي</div>
                    <div class="total-amount">${formatCurrency(repair.repair_price)}</div>
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
                        background: #2563eb; color: white; border: none;
                        padding: 12px 24px; border-radius: 8px; font-size: 14px;
                        font-weight: 700; cursor: pointer; font-family: 'Tajawal', sans-serif;
                    ">🖨️ طباعة الفاتورة</button>
                </div>
            </div>
        </body>
        </html>
    `);
    w.document.close();
}

function loadRepairsTable() {
    const searchTerm = (document.getElementById('repair-search')?.value || '').toLowerCase();
    const filterStatus = document.getElementById('repair-filter')?.value || 'all';
    
    let filteredRepairs = globalRepairs.filter(r => {
        const matchesSearch = !searchTerm || 
            r.device_name?.toLowerCase().includes(searchTerm) || 
            r.customer_name?.toLowerCase().includes(searchTerm);
        const matchesStatus = filterStatus === 'all' || r.status === filterStatus;
        return matchesSearch && matchesStatus;
    });
    
    const countElement = document.getElementById('repairs-count');
    if (countElement) countElement.textContent = `${globalRepairs.length} أمر صيانة`;
    
    const container = document.getElementById('repairs-table-container');
    if (container) {
        container.innerHTML = `
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
                            <th>إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredRepairs.length ? filteredRepairs.map(r => `
                            <tr>
                                <td class="font-semibold">${r.device_name || '-'}</td>
                                <td>${r.customer_name || '-'}<br><span class="text-xs text-muted">${r.customer_phone || ''}</span></td>
                                <td>${r.technician || '-'}</td>
                                <td>
                                    <select class="status-select" onchange="quickStatusChange('${r.id}', this.value)">
                                        <option value="قيد_الصيانة" ${r.status === 'قيد_الصيانة' ? 'selected' : ''}>قيد الصيانة</option>
                                        <option value="جاهز" ${r.status === 'جاهز' ? 'selected' : ''}>جاهز للتسليم</option>
                                        <option value="تم_التسليم" ${r.status === 'تم_التسليم' ? 'selected' : ''}>تم التسليم</option>
                                    </select>
                                </td>
                                <td class="font-bold text-blue">${formatCurrency(r.repair_price)}</td>
                                <td class="text-sm">${r.receive_date || '-'}</td>
                                <td>
                                    <div class="flex gap-1">
                                        <button class="btn-icon" onclick="openRepairForm('${r.id}')" title="تعديل">
                                            <i class="fas fa-pen"></i>
                                        </button>
                                        <button class="btn-icon text-blue" onclick="printRepairInvoice('${r.id}')" title="طباعة الفاتورة">
                                            <i class="fas fa-print"></i>
                                        </button>
                                        <button class="btn-icon text-red" onclick="confirmDelete('repair','${r.id}')" title="حذف">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('') : 
                        '<tr><td colspan="7" class="text-center py-6 text-muted">لا توجد أوامر صيانة</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
    }
}

// ================================
// المخزون
// ================================
function openPartForm(partId = null) {
    showModal('part-modal');
    const form = document.getElementById('part-form');
    if (form) form.reset();
    
    if (partId) {
        const part = globalParts.find(p => p.id === partId);
        if (part) {
            document.getElementById('part-modal-title').textContent = 'تعديل قطعة غيار';
            document.getElementById('part-id').value = part.id;
            document.getElementById('part-name').value = part.name || '';
            document.getElementById('part-category').value = part.category || 'بطاريات';
            document.getElementById('part-purchase-price').value = part.purchase_price || 0;
            document.getElementById('part-selling-price').value = part.selling_price || 0;
            document.getElementById('part-quantity').value = part.quantity || 0;
            document.getElementById('part-min-quantity').value = part.min_quantity || 0;
            document.getElementById('part-supplier').value = part.supplier || '';
        }
    } else {
        document.getElementById('part-modal-title').textContent = 'إضافة قطعة غيار';
        document.getElementById('part-id').value = '';
    }
}

function closePartForm() {
    hideModal('part-modal');
}

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
        ownerId
    };
    
    try {
        if (id) {
            await updateDoc(doc(db, "parts", id), data);
        } else {
            await addDoc(collection(db, "parts"), data);
        }
        await loadAllData();
        closePartForm();
        loadInventoryTable();
        loadDashboard();
        updateAlertsCount();
    } catch (e) {
        console.error('Error saving part:', e);
        alert('❌ حدث خطأ أثناء حفظ القطعة');
    }
    hideLoading();
}

function loadInventoryTable() {
    const searchTerm = (document.getElementById('part-search')?.value || '').toLowerCase();
    
    let filteredParts = globalParts.filter(p => 
        !searchTerm || 
        p.name?.toLowerCase().includes(searchTerm) || 
        p.category?.toLowerCase().includes(searchTerm) || 
        p.supplier?.toLowerCase().includes(searchTerm)
    );
    
    const totalValue = globalParts.reduce((s, p) => s + (Number(p.purchase_price) || 0) * (Number(p.quantity) || 0), 0);
    const totalItems = globalParts.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    
    const countElement = document.getElementById('inventory-count');
    if (countElement) countElement.textContent = `${globalParts.length} صنف - ${totalItems} قطعة`;
    
    const summaryElement = document.getElementById('inventory-summary');
    if (summaryElement) {
        summaryElement.innerHTML = `
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
    }
    
    const container = document.getElementById('inventory-table-container');
    if (container) {
        container.innerHTML = `
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>القطعة</th>
                            <th>التصنيف</th>
                            <th>سعر الشراء</th>
                            <th>سعر البيع</th>
                            <th>الكمية</th>
                            <th>المورد</th>
                            <th>إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredParts.length ? filteredParts.map(p => {
                            const isLowStock = p.min_quantity && p.quantity <= p.min_quantity;
                            return `
                                <tr>
                                    <td class="font-semibold">${p.name || '-'}</td>
                                    <td><span class="badge badge-gray">${p.category || 'أخرى'}</span></td>
                                    <td>${formatCurrency(p.purchase_price)}</td>
                                    <td>${p.selling_price ? formatCurrency(p.selling_price) : '-'}</td>
                                    <td class="font-bold ${isLowStock ? 'text-amber' : ''}">
                                        ${p.quantity} ${isLowStock ? '⚠️' : ''}
                                    </td>
                                    <td>${p.supplier || '-'}</td>
                                    <td>
                                        <button class="btn-icon" onclick="openPartForm('${p.id}')">
                                            <i class="fas fa-pen"></i>
                                        </button>
                                        <button class="btn-icon text-red" onclick="confirmDelete('part','${p.id}')">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('') : 
                        '<tr><td colspan="7" class="text-center py-6 text-muted">لا توجد قطع غيار</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
    }
}

// ================================
// المصاريف
// ================================
function openExpenseForm(expenseId = null) {
    showModal('expense-modal');
    const form = document.getElementById('expense-form');
    if (form) form.reset();
    
    const dateInput = document.getElementById('expense-date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    
    if (expenseId) {
        const expense = globalExpenses.find(e => e.id === expenseId);
        if (expense) {
            document.getElementById('expense-modal-title').textContent = 'تعديل مصروف';
            document.getElementById('expense-id').value = expense.id;
            document.getElementById('expense-title').value = expense.title || '';
            document.getElementById('expense-category').value = expense.category || 'أخرى';
            document.getElementById('expense-amount').value = expense.amount || 0;
            document.getElementById('expense-date').value = expense.date || '';
            document.getElementById('expense-notes').value = expense.notes || '';
        }
    } else {
        document.getElementById('expense-modal-title').textContent = 'إضافة مصروف';
        document.getElementById('expense-id').value = '';
    }
}

function closeExpenseForm() {
    hideModal('expense-modal');
}

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
        ownerId
    };
    
    try {
        if (id) {
            await updateDoc(doc(db, "expenses", id), data);
        } else {
            await addDoc(collection(db, "expenses"), data);
        }
        await loadAllData();
        closeExpenseForm();
        loadExpensesTable();
        loadDashboard();
    } catch (e) {
        console.error('Error saving expense:', e);
        alert('❌ حدث خطأ أثناء حفظ المصروف');
    }
    hideLoading();
}

function loadExpensesTable() {
    const searchTerm = (document.getElementById('expense-search')?.value || '').toLowerCase();
    const categoryFilter = document.getElementById('expense-cat-filter')?.value || 'الكل';
    
    let filteredExpenses = globalExpenses.filter(e => {
        const matchesSearch = !searchTerm || e.title?.toLowerCase().includes(searchTerm);
        const matchesCategory = categoryFilter === 'الكل' || e.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });
    
    const totalAmount = globalExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    
    const countElement = document.getElementById('expenses-count');
    if (countElement) countElement.textContent = `${globalExpenses.length} مصروف — إجمالي: ${formatCurrency(totalAmount)}`;
    
    const summaryElement = document.getElementById('expenses-summary');
    if (summaryElement) {
        summaryElement.innerHTML = `
            <div class="stat-card">
                <div class="stat-card-icon icon-red"><i class="fas fa-receipt"></i></div>
                <p class="stat-card-title">إجمالي المصاريف</p>
                <p class="stat-card-value">${formatCurrency(totalAmount)}</p>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon icon-amber"><i class="fas fa-calendar"></i></div>
                <p class="stat-card-title">عدد المصاريف</p>
                <p class="stat-card-value">${globalExpenses.length}</p>
            </div>
        `;
    }
    
    const listElement = document.getElementById('expenses-list');
    if (listElement) {
        listElement.innerHTML = filteredExpenses.length ? 
            filteredExpenses.map(e => `
                <div class="card mb-2">
                    <div class="card-body">
                        <div class="flex justify-between items-center">
                            <div>
                                <p class="font-semibold">${e.title || 'بدون عنوان'}</p>
                                <p class="text-xs text-muted">${e.date || ''} · ${e.category || 'أخرى'}${e.notes ? ' — ' + e.notes : ''}</p>
                            </div>
                            <div class="flex items-center gap-3">
                                <span class="font-bold text-red">${formatCurrency(e.amount)}</span>
                                <button class="btn-icon" onclick="openExpenseForm('${e.id}')">
                                    <i class="fas fa-pen"></i>
                                </button>
                                <button class="btn-icon text-red" onclick="confirmDelete('expense','${e.id}')">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('') : 
            '<p class="text-center text-muted py-10">لا توجد مصاريف</p>';
    }
}

// ================================
// العملاء
// ================================
function loadCustomersTable() {
    const searchTerm = (document.getElementById('customer-search')?.value || '').toLowerCase();
    
    const customerMap = {};
    globalRepairs.forEach(r => {
        const key = r.customer_phone || r.customer_name;
        if (!customerMap[key]) {
            customerMap[key] = {
                name: r.customer_name,
                phone: r.customer_phone,
                repairs: [],
                totalPaid: 0,
                lastDate: null
            };
        }
        customerMap[key].repairs.push(r);
        customerMap[key].totalPaid += Number(r.repair_price) || 0;
        const d = r.receive_date ? new Date(r.receive_date) : new Date();
        if (!customerMap[key].lastDate || d > customerMap[key].lastDate) {
            customerMap[key].lastDate = d;
        }
    });
    
    let customers = Object.values(customerMap)
        .map((c, i) => ({ 
            ...c, 
            id: i, 
            lastVisit: c.lastDate ? c.lastDate.toISOString().split('T')[0] : '-' 
        }))
        .sort((a, b) => (b.lastDate || 0) - (a.lastDate || 0));
    
    if (searchTerm) {
        customers = customers.filter(c => 
            c.name?.toLowerCase().includes(searchTerm) || 
            c.phone?.includes(searchTerm)
        );
    }
    
    const totalRevenue = customers.reduce((s, c) => s + c.totalPaid, 0);
    
    const countElement = document.getElementById('customers-count');
    if (countElement) countElement.textContent = `${customers.length} عميل مسجل`;
    
    const summaryElement = document.getElementById('customers-summary');
    if (summaryElement) {
        summaryElement.innerHTML = `
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
        `;
    }
    
    const listElement = document.getElementById('customers-list');
    if (listElement) {
        listElement.innerHTML = customers.length ? 
            customers.map(c => `
                <div class="card customer-card" onclick="toggleCustomerRepairs(${c.id})">
                    <div class="card-body">
                        <div class="flex justify-between items-center">
                            <div class="flex items-center gap-3">
                                <div style="width: 40px; height: 40px; background: #dbeafe; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                    <i class="fas fa-user text-blue"></i>
                                </div>
                                <div>
                                    <p class="font-bold">${c.name || 'غير معروف'}</p>
                                    <p class="text-sm text-muted">📞 ${c.phone || '-'}</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-4">
                                <div class="text-center">
                                    <p class="text-xs text-muted">عدد الأجهزة</p>
                                    <p class="font-bold">${c.repairs.length}</p>
                                </div>
                                <div class="text-center">
                                    <p class="text-xs text-muted">إجمالي المدفوع</p>
                                    <p class="font-bold text-blue">${formatCurrency(c.totalPaid)}</p>
                                </div>
                                <i class="fas fa-chevron-down text-muted" id="customer-chevron-${c.id}"></i>
                            </div>
                        </div>
                        <div class="mt-3 pt-3 hidden" id="customer-repairs-${c.id}" style="border-top: 1px solid #f1f5f9;">
                            <p class="text-xs font-bold text-muted mb-2">سجل الصيانة</p>
                            ${c.repairs.map(r => `
                                <div class="bg-gray-50 rounded-lg p-3 mb-2">
                                    <div class="flex justify-between items-center">
                                        <div>
                                            <p class="font-semibold text-sm">${r.device_name || 'جهاز'}</p>
                                            <p class="text-xs text-muted">${r.receive_date || ''} · ${r.technician || ''}</p>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            ${getStatusBadge(r.status)}
                                            <span class="font-bold text-blue">${formatCurrency(r.repair_price)}</span>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `).join('') : 
            '<p class="text-center text-muted py-10">لا يوجد عملاء</p>';
    }
}

function toggleCustomerRepairs(id) {
    const details = document.getElementById('customer-repairs-' + id);
    const chevron = document.getElementById('customer-chevron-' + id);
    
    if (details) {
        details.classList.toggle('hidden');
        if (chevron) {
            chevron.classList.toggle('fa-chevron-down');
            chevron.classList.toggle('fa-chevron-up');
        }
    }
}

// ================================
// المحافظ
// ================================
function loadWallets() {
    const totalBalance = globalWallets.reduce((s, w) => s + (Number(w.balance) || 0), 0);
    const totalDailyUsed = globalWallets.reduce((s, w) => s + (Number(w.daily_used) || 0), 0);
    const totalMonthlyUsed = globalWallets.reduce((s, w) => s + (Number(w.monthly_used) || 0), 0);
    
    // ملخص المحافظ
    const summaryElement = document.getElementById('wallet-summary-cards');
    if (summaryElement) {
        summaryElement.innerHTML = `
            <div class="stat-card">
                <div class="stat-card-icon icon-green"><i class="fas fa-wallet"></i></div>
                <p class="stat-card-title">إجمالي الأرصدة</p>
                <p class="stat-card-value">${formatCurrency(totalBalance)}</p>
                <p class="stat-card-sub">${globalWallets.length} محفظة</p>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon icon-blue"><i class="fas fa-calendar-day"></i></div>
                <p class="stat-card-title">المستعمل اليوم</p>
                <p class="stat-card-value">${formatCurrency(totalDailyUsed)}</p>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon icon-amber"><i class="fas fa-calendar-alt"></i></div>
                <p class="stat-card-title">المستعمل الشهر</p>
                <p class="stat-card-value">${formatCurrency(totalMonthlyUsed)}</p>
            </div>
        `;
    }
    
    // كروت المحافظ
    const walletsContainer = document.getElementById('wallets-table-body');
    if (walletsContainer) {
        walletsContainer.innerHTML = globalWallets.length ? `
            <div class="wallet-grid">
                ${globalWallets.map(w => {
                    const limit = walletLimits[w.type] || {};
                    const dailyUsagePercent = w.daily_limit > 0 ? (Number(w.daily_used) / Number(w.daily_limit) * 100) : 0;
                    const monthlyUsagePercent = w.monthly_limit > 0 ? (Number(w.monthly_used) / Number(w.monthly_limit) * 100) : 0;
                    
                    return `
                        <div class="wallet-card">
                            <div class="wallet-card-header">
                                <div>
                                    <h3 style="font-size: 16px; font-weight: 800;">${w.name || 'محفظة'}</h3>
                                    <span class="wallet-type-badge badge-blue">${limit.label || w.type}</span>
                                </div>
                                <div class="flex gap-2">
                                    <button class="btn-icon text-blue" onclick="openTransactionModal('${w.id}')" title="عملية جديدة">
                                        <i class="fas fa-exchange-alt"></i>
                                    </button>
                                    <button class="btn-icon" onclick="openWalletModal('${w.id}')" title="تعديل">
                                        <i class="fas fa-pen"></i>
                                    </button>
                                    <button class="btn-icon text-red" onclick="confirmDelete('wallet','${w.id}')" title="حذف">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                            
                            <div class="wallet-balance-section">
                                <div class="wallet-balance-label">الرصيد الحالي</div>
                                <div class="wallet-balance-value">${formatCurrency(w.balance)}</div>
                                ${w.phone ? `<div style="font-size: 12px; color: #64748b; margin-top: 8px;">📱 ${w.phone}</div>` : ''}
                            </div>
                            
                            <div class="wallet-limits">
                                <div class="wallet-limit-item">
                                    <div class="wallet-limit-label">الحد اليومي</div>
                                    <div class="wallet-limit-value">${formatCurrency(w.daily_limit)}</div>
                                    <div class="wallet-progress">
                                        <div class="wallet-progress-bar ${dailyUsagePercent > 80 ? 'danger' : dailyUsagePercent > 50 ? 'warning' : 'safe'}" 
                                             style="width: ${Math.min(dailyUsagePercent, 100)}%"></div>
                                    </div>
                                    <div style="font-size: 10px; color: #94a3b8; margin-top: 4px;">مستعمل: ${formatCurrency(w.daily_used)}</div>
                                </div>
                                
                                <div class="wallet-limit-item">
                                    <div class="wallet-limit-label">الحد الشهري</div>
                                    <div class="wallet-limit-value">${formatCurrency(w.monthly_limit)}</div>
                                    <div class="wallet-progress">
                                        <div class="wallet-progress-bar ${monthlyUsagePercent > 80 ? 'danger' : monthlyUsagePercent > 50 ? 'warning' : 'safe'}" 
                                             style="width: ${Math.min(monthlyUsagePercent, 100)}%"></div>
                                    </div>
                                    <div style="font-size: 10px; color: #94a3b8; margin-top: 4px;">مستعمل: ${formatCurrency(w.monthly_used)}</div>
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
        ` : '<p class="text-center text-muted py-6">لا توجد محافظ مضافة</p>';
    }
    
    // سجل العمليات
    const transactionsBody = document.getElementById('wallet-transactions-body');
    if (transactionsBody) {
        const sortedTransactions = [...globalTransactions].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        const recentTransactions = sortedTransactions.slice(0, 20);
        
        transactionsBody.innerHTML = recentTransactions.length ? `
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>التاريخ</th>
                            <th>المحفظة</th>
                            <th>النوع</th>
                            <th>المبلغ</th>
                            <th>ملاحظات</th>
                            <th>إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recentTransactions.map(t => {
                            const wallet = globalWallets.find(w => w.id === t.wallet_id);
                            return `
                                <tr>
                                    <td class="text-sm">${t.date || '-'}</td>
                                    <td class="font-semibold">${wallet ? wallet.name : '—'}</td>
                                    <td>
                                        <span class="badge ${t.type === 'deposit' ? 'badge-green' : 'badge-red'}">
                                            ${t.type === 'deposit' ? 'إيداع' : 'سحب'}
                                        </span>
                                    </td>
                                    <td class="font-bold ${t.type === 'deposit' ? 'text-green' : 'text-red'}">
                                        ${t.type === 'deposit' ? '+' : '-'} ${formatCurrency(t.amount)}
                                    </td>
                                    <td class="text-sm text-muted">${t.notes || '—'}</td>
                                    <td>
                                        <div class="flex gap-1">
                                            <button class="btn-icon" onclick="editTransaction('${t.id}')" title="تعديل">
                                                <i class="fas fa-pen"></i>
                                            </button>
                                            <button class="btn-icon text-red" onclick="deleteTransaction('${t.id}')" title="حذف">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        ` : '<p class="text-center text-muted py-6">لا توجد عمليات</p>';
    }
}

function viewWalletTransactions(walletId) {
    const wallet = globalWallets.find(w => w.id === walletId);
    if (!wallet) return;
    
    const transactions = globalTransactions
        .filter(t => t.wallet_id === walletId)
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    
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
                            </tr>
                        `).join('')}
                        ${transactions.length === 0 ? '<tr><td colspan="4" class="text-center py-6 text-muted">لا توجد عمليات</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function onWalletTypeChange() {
    const type = document.getElementById('wallet-type')?.value;
    const infoDiv = document.getElementById('wallet-limits-info');
    
    if (type && walletLimits[type] && infoDiv) {
        infoDiv.classList.remove('hidden');
        infoDiv.innerHTML = `
            <i class="fas fa-info-circle"></i>
            الحد اليومي: <strong>${walletLimits[type].daily.toLocaleString()} ج.م</strong> | 
            الحد الشهري: <strong>${walletLimits[type].monthly.toLocaleString()} ج.م</strong> | 
            أقصى رصيد: <strong>${walletLimits[type].max_balance.toLocaleString()} ج.م</strong>
        `;
    } else if (infoDiv) {
        infoDiv.classList.add('hidden');
    }
}

function openWalletModal(walletId = null) {
    showModal('wallet-modal');
    const form = document.getElementById('wallet-form');
    if (form) form.reset();
    
    const infoDiv = document.getElementById('wallet-limits-info');
    if (infoDiv) infoDiv.classList.add('hidden');
    
    if (walletId) {
        const wallet = globalWallets.find(w => w.id === walletId);
        if (wallet) {
            document.getElementById('wallet-modal-title').textContent = 'تعديل محفظة';
            document.getElementById('wallet-id').value = wallet.id;
            document.getElementById('wallet-name').value = wallet.name || '';
            document.getElementById('wallet-phone').value = wallet.phone || '';
            document.getElementById('wallet-type').value = wallet.type || '';
            onWalletTypeChange();
        }
    } else {
        document.getElementById('wallet-modal-title').textContent = 'إضافة محفظة جديدة';
        document.getElementById('wallet-id').value = '';
    }
}

function closeWalletModal() {
    hideModal('wallet-modal');
}

async function saveWallet(e) {
    e.preventDefault();
    
    const id = document.getElementById('wallet-id').value;
    const type = document.getElementById('wallet-type').value;
    const limits = walletLimits[type] || walletLimits['vodafone'];
    
    const data = {
        name: document.getElementById('wallet-name').value,
        phone: document.getElementById('wallet-phone').value,
        type: type,
        balance: 0,
        daily_used: 0,
        monthly_used: 0,
        daily_limit: limits.daily,
        monthly_limit: limits.monthly,
        max_balance: limits.max_balance,
        alert_threshold: Math.round(limits.monthly * 0.8),
        ownerId
    };
    
    try {
        if (id) {
            const existingWallet = globalWallets.find(w => w.id === id);
            data.balance = existingWallet?.balance || 0;
            data.daily_used = existingWallet?.daily_used || 0;
            data.monthly_used = existingWallet?.monthly_used || 0;
            await updateDoc(doc(db, "wallets", id), data);
        } else {
            await addDoc(collection(db, "wallets"), data);
        }
        await loadAllData();
        closeWalletModal();
        loadWallets();
    } catch (e) {
        console.error('Error saving wallet:', e);
        alert('❌ حدث خطأ أثناء حفظ المحفظة');
    }
}

function openTransactionModal(walletId) {
    showModal('transaction-modal');
    const form = document.getElementById('transaction-form');
    if (form) form.reset();
    
    document.getElementById('transaction-wallet-id').value = walletId;
    const warningDiv = document.getElementById('transaction-limit-warning');
    if (warningDiv) warningDiv.classList.add('hidden');
}

function closeTransactionModal() {
    hideModal('transaction-modal');
}

async function saveTransaction(e) {
    e.preventDefault();
    
    const walletId = document.getElementById('transaction-wallet-id').value;
    const type = document.getElementById('transaction-type').value;
    const amount = parseFloat(document.getElementById('transaction-amount').value);
    const notes = document.getElementById('transaction-notes').value;
    
    const wallet = globalWallets.find(w => w.id === walletId);
    if (!wallet) return;
    
    const warningDiv = document.getElementById('transaction-limit-warning');
    
    // التحقق من السحب
    if (type === 'withdraw') {
        if (amount > (Number(wallet.balance) || 0)) {
            if (warningDiv) {
                warningDiv.textContent = '❌ الرصيد غير كافي لإتمام عملية السحب.';
                warningDiv.classList.remove('hidden');
            }
            return;
        }
    }
    
    try {
        // تحديث رصيد المحفظة
        const newBalance = type === 'withdraw' 
            ? Number(wallet.balance) - amount 
            : Number(wallet.balance) + amount;
        
        const newDailyUsed = type === 'withdraw' 
            ? Number(wallet.daily_used) + amount 
            : Number(wallet.daily_used);
        
        const newMonthlyUsed = type === 'withdraw' 
            ? Number(wallet.monthly_used) + amount 
            : Number(wallet.monthly_used);
        
        await updateDoc(doc(db, "wallets", walletId), {
            balance: newBalance,
            daily_used: newDailyUsed,
            monthly_used: newMonthlyUsed
        });
        
        // إضافة العملية للسجل
        await addDoc(collection(db, "transactions"), {
            wallet_id: walletId,
            type: type,
            amount: amount,
            date: new Date().toISOString().split('T')[0],
            notes: notes,
            ownerId
        });
        
        await loadAllData();
        closeTransactionModal();
        loadWallets();
    } catch (e) {
        console.error('Error saving transaction:', e);
        alert('❌ حدث خطأ أثناء تنفيذ العملية');
    }
}

async function editTransaction(transactionId) {
    const transaction = globalTransactions.find(t => t.id === transactionId);
    if (!transaction) return;
    
    const newAmount = prompt('المبلغ الجديد:', transaction.amount);
    if (newAmount === null) return;
    
    const newNotes = prompt('ملاحظات:', transaction.notes || '');
    if (newNotes === null) return;
    
    const wallet = globalWallets.find(w => w.id === transaction.wallet_id);
    if (wallet) {
        const oldAmount = Number(transaction.amount);
        const newAmountNum = Number(newAmount);
        
        if (transaction.type === 'withdraw') {
            await updateDoc(doc(db, "wallets", transaction.wallet_id), {
                balance: Number(wallet.balance) + oldAmount - newAmountNum
            });
        } else {
            await updateDoc(doc(db, "wallets", transaction.wallet_id), {
                balance: Number(wallet.balance) - oldAmount + newAmountNum
            });
        }
    }
    
    await updateDoc(doc(db, "transactions", transactionId), {
        amount: Number(newAmount),
        notes: newNotes
    });
    
    await loadAllData();
    loadWallets();
    alert('✅ تم تعديل العملية بنجاح');
}

async function deleteTransaction(transactionId) {
    if (!confirm('هل أنت متأكد من حذف هذه العملية؟')) return;
    
    const transaction = globalTransactions.find(t => t.id === transactionId);
    if (transaction) {
        const wallet = globalWallets.find(w => w.id === transaction.wallet_id);
        if (wallet) {
            if (transaction.type === 'withdraw') {
                await updateDoc(doc(db, "wallets", transaction.wallet_id), {
                    balance: Number(wallet.balance) + Number(transaction.amount)
                });
            } else {
                await updateDoc(doc(db, "wallets", transaction.wallet_id), {
                    balance: Number(wallet.balance) - Number(transaction.amount)
                });
            }
        }
    }
    
    await deleteDoc(doc(db, "transactions", transactionId));
    await loadAllData();
    loadWallets();
    alert('✅ تم حذف العملية بنجاح');
}

// ================================
// التقارير
// ================================
function loadReports() {
    const totalRevenue = globalRepairs.reduce((s, r) => s + (Number(r.repair_price) || 0), 0);
    const totalPartsCost = globalRepairs.reduce((s, r) => s + (Number(r.spare_part_cost) || 0), 0);
    const totalTechFees = globalRepairs.reduce((s, r) => s + (Number(r.technician_fee) || 0), 0);
    const totalExpenses = globalExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const profit = totalRevenue - totalPartsCost - totalTechFees - totalExpenses;
    const profitMargin = totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(1) : 0;
    const completedOrders = globalRepairs.filter(r => r.status === 'تم_التسليم').length;
    const avgOrderValue = globalRepairs.length > 0 ? Math.round(totalRevenue / globalRepairs.length) : 0;
    
    // KPI
    const reportsKPI = document.getElementById('reports-kpi');
    if (reportsKPI) {
        reportsKPI.innerHTML = `
            <div class="reports-kpi-grid">
                <div class="report-card">
                    <div class="report-card-icon icon-blue"><i class="fas fa-dollar-sign"></i></div>
                    <div class="report-card-info">
                        <div class="report-card-title">إجمالي الإيرادات</div>
                        <div class="report-card-value">${formatCurrency(totalRevenue)}</div>
                        <div class="report-card-sub">${globalRepairs.length} عملية</div>
                    </div>
                </div>
                <div class="report-card">
                    <div class="report-card-icon icon-green"><i class="fas fa-chart-pie"></i></div>
                    <div class="report-card-info">
                        <div class="report-card-title">صافي الأرباح</div>
                        <div class="report-card-value">${formatCurrency(profit)}</div>
                        <div class="report-card-sub">هامش ربح ${profitMargin}%</div>
                    </div>
                </div>
                <div class="report-card">
                    <div class="report-card-icon icon-purple"><i class="fas fa-shopping-cart"></i></div>
                    <div class="report-card-info">
                        <div class="report-card-title">متوسط الطلب</div>
                        <div class="report-card-value">${formatCurrency(avgOrderValue)}</div>
                        <div class="report-card-sub">${completedOrders} طلب مكتمل</div>
                    </div>
                </div>
                <div class="report-card">
                    <div class="report-card-icon icon-cyan"><i class="fas fa-check-circle"></i></div>
                    <div class="report-card-info">
                        <div class="report-card-title">معدل الإتمام</div>
                        <div class="report-card-value">${globalRepairs.length > 0 ? Math.round((completedOrders / globalRepairs.length) * 100) : 0}%</div>
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
                totalRevenue: 0
            };
        }
        techMap[r.technician].totalOrders++;
        techMap[r.technician].totalRevenue += Number(r.repair_price) || 0;
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
                    ${Object.values(techMap).length ? Object.values(techMap).map((t, i) => `
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
                    `).join('') : '<p class="text-center text-muted py-4">لا توجد بيانات كافية</p>'}
                </div>
            </div>
        `;
    }
    
    // أفضل العملاء
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
    
    const topCustomersContainer = document.getElementById('top-customers');
    if (topCustomersContainer) {
        topCustomersContainer.innerHTML = topCustomers.length > 0 ? 
            topCustomers.map((c, i) => `
                <div class="customer-row">
                    <div class="customer-rank rank-${i < 3 ? 'gold' : i < 5 ? 'silver' : 'bronze'}">${i + 1}</div>
                    <div class="flex-1">
                        <div class="font-semibold text-sm">${c.name}</div>
                        <div class="text-xs text-muted">${c.phone} · ${c.ordersCount} عمليات</div>
                    </div>
                    <div class="font-bold text-blue">${formatCurrency(c.totalSpent)}</div>
                </div>
            `).join('') : 
            '<p class="text-center text-muted py-4">لا توجد بيانات كافية</p>';
    }
    
    // أكثر الأجهزة صيانة
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
    
    const topDevicesContainer = document.getElementById('top-devices');
    if (topDevicesContainer) {
        topDevicesContainer.innerHTML = topDevices.length > 0 ? 
            topDevices.map((d, i) => `
                <div class="device-row">
                    <div class="device-rank rank-${i < 3 ? 'gold' : i < 5 ? 'silver' : 'bronze'}">${i + 1}</div>
                    <div class="flex-1">
                        <div class="font-semibold text-sm">${d.name}</div>
                        <div class="text-xs text-muted">${d.count} عمليات · ${formatCurrency(d.totalRevenue)}</div>
                    </div>
                </div>
            `).join('') : 
            '<p class="text-center text-muted py-4">لا توجد بيانات كافية</p>';
    }
}

// ================================
// التنبيهات
// ================================
function updateAlertsCount() {
    const lowStockCount = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity).length;
    const delayedRepairs = globalRepairs.filter(r => {
        return r.status !== 'تم_التسليم' && r.delivery_date && new Date(r.delivery_date) < new Date();
    }).length;
    
    const totalAlerts = lowStockCount + delayedRepairs;
    const badge = document.getElementById('alerts-count');
    if (badge) {
        badge.textContent = totalAlerts;
        badge.classList.toggle('hidden', totalAlerts === 0);
    }
}

function loadAlerts() {
    const now = new Date();
    
    const alerts = [
        ...globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity)
            .map(p => ({
                title: `مخزون منخفض: ${p.name}`,
                desc: `الكمية المتبقية: ${p.quantity} (الحد الأدنى: ${p.min_quantity})`,
                icon: 'fa-box',
                color: 'text-amber',
                bg: 'bg-amber-50',
                border: 'border-amber-400'
            })),
        ...globalRepairs.filter(r => {
            return r.delivery_date && r.status !== 'تم_التسليم' && new Date(r.delivery_date) < now;
        }).map(r => ({
            title: `تأخر تسليم: ${r.device_name}`,
            desc: `العميل: ${r.customer_name} | كان مقرر: ${r.delivery_date}`,
            icon: 'fa-clock',
            color: 'text-red',
            bg: 'bg-red-50',
            border: 'border-red-500'
        }))
    ];
    
    const summaryText = document.getElementById('alerts-summary-text');
    if (summaryText) {
        summaryText.textContent = alerts.length > 0 ? `${alerts.length} تنبيه` : 'لا توجد تنبيهات';
    }
    
    const summaryCards = document.getElementById('alerts-summary');
    if (summaryCards) {
        summaryCards.innerHTML = `
            <div class="stat-card">
                <div class="stat-card-icon icon-red"><i class="fas fa-clock"></i></div>
                <p class="stat-card-title">تأخر تسليم</p>
                <p class="stat-card-value">${alerts.filter(a => a.bg === 'bg-red-50').length}</p>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon icon-amber"><i class="fas fa-box"></i></div>
                <p class="stat-card-title">مخزون منخفض</p>
                <p class="stat-card-value">${alerts.filter(a => a.bg === 'bg-amber-50').length}</p>
            </div>
        `;
    }
    
    const alertsList = document.getElementById('alerts-list');
    if (alertsList) {
        alertsList.innerHTML = alerts.length > 0 ? 
            alerts.map(a => `
                <div class="card mb-2" style="background: ${a.bg}; border-right: 4px solid ${a.border};">
                    <div class="card-body">
                        <div class="flex items-start gap-3">
                            <div style="padding: 8px;">
                                <i class="fas ${a.icon} ${a.color}" style="font-size: 20px;"></i>
                            </div>
                            <div>
                                <p class="font-bold">${a.title}</p>
                                <p class="text-sm" style="color: #64748b;">${a.desc}</p>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('') : 
            `
                <div class="card">
                    <div class="card-body text-center py-10">
                        <i class="fas fa-check-circle" style="color: #10b981; font-size: 40px; margin-bottom: 12px;"></i>
                        <p style="font-size: 18px; font-weight: 700; color: #059669;">كل شيء على ما يرام!</p>
                        <p class="text-muted">لا توجد تنبيهات حالياً</p>
                    </div>
                </div>
            `;
    }
}

// ================================
// الاشتراكات
// ================================
function loadSubscriptions() {
    // تحديث حالة الاشتراكات المنتهية
    globalSubscriptions.forEach(s => {
        if (s.status === 'نشط' && new Date(s.end_date) < new Date()) {
            s.status = 'منتهي';
        }
    });
    
    const searchTerm = (document.getElementById('sub-search')?.value || '').toLowerCase();
    const filterStatus = document.getElementById('sub-filter')?.value || 'all';
    
    const active = globalSubscriptions.filter(s => s.status === 'نشط').length;
    const expired = globalSubscriptions.filter(s => s.status === 'منتهي').length;
    const totalRevenue = globalSubscriptions.reduce((s, sub) => s + (Number(sub.price) || 0), 0);
    const expiringSoon = globalSubscriptions.filter(s => {
        if (s.status !== 'نشط') return false;
        const daysLeft = Math.ceil((new Date(s.end_date) - new Date()) / (1000 * 60 * 60 * 24));
        return daysLeft <= 30 && daysLeft > 0;
    }).length;
    
    const countText = document.getElementById('subs-count-text');
    if (countText) countText.textContent = `${globalSubscriptions.length} عميل مشترك`;
    
    const summaryCards = document.getElementById('subscription-summary-cards');
    if (summaryCards) {
        summaryCards.innerHTML = `
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
    }
    
    let filteredSubscriptions = globalSubscriptions.filter(s => {
        const matchesSearch = !searchTerm || 
            s.customer_name?.toLowerCase().includes(searchTerm) || 
            s.customer_email?.toLowerCase().includes(searchTerm);
        const matchesStatus = filterStatus === 'all' || s.status === filterStatus;
        return matchesSearch && matchesStatus;
    });
    
    const tableBody = document.getElementById('subscriptions-table-body');
    if (tableBody) {
        tableBody.innerHTML = filteredSubscriptions.length ? 
            filteredSubscriptions.map((s, i) => {
                const deviceCount = globalRepairs.filter(r => r.customer_name === s.customer_name).length;
                return `
                    <tr>
                        <td class="text-xs text-muted">${i + 1}</td>
                        <td class="font-semibold">${s.customer_name || 'غير محدد'}</td>
                        <td class="text-sm">${s.customer_email || '-'}</td>
                        <td>${s.plan || '-'}</td>
                        <td class="font-bold text-blue">${formatCurrency(s.price)}</td>
                        <td class="text-sm">${s.start_date || '-'}</td>
                        <td class="text-sm">${s.end_date || '-'}</td>
                        <td>${getDaysLeft(s.end_date)}</td>
                        <td>${s.status === 'نشط' ? '<span class="badge badge-green">نشط</span>' : '<span class="badge badge-red">منتهي</span>'}</td>
                        <td>
                            <div class="flex gap-1">
                                <button class="btn-icon" onclick="openSubscriptionModal('${s.id}')" title="تعديل">
                                    <i class="fas fa-pen"></i>
                                </button>
                                ${s.status === 'منتهي' ? `
                                    <button class="btn-primary btn-xs" onclick="renewSubscription('${s.id}')" title="تجديد">
                                        <i class="fas fa-sync-alt"></i>
                                    </button>
                                ` : ''}
                                <button class="btn-danger btn-xs" onclick="confirmDelete('subscription','${s.id}')" title="حذف">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('') : 
            '<tr><td colspan="10" class="text-center py-6 text-muted">لا توجد اشتراكات</td></tr>';
    }
}

function openSubscriptionModal(subId = null) {
    showModal('subscription-modal');
    const form = document.getElementById('subscription-form');
    if (form) form.reset();
    
    const startDateInput = document.getElementById('subscription-start-date');
    if (startDateInput) startDateInput.value = new Date().toISOString().split('T')[0];
    
    // تحميل قائمة المستخدمين
    const linkedUserSelect = document.getElementById('subscription-linked-user');
    if (linkedUserSelect) {
        linkedUserSelect.innerHTML = '<option value="">اختر مستخدم</option>' + 
            globalUsers.map(u => `<option value="${u.id}">${u.fullName || u.name || u.email} (${u.email})</option>`).join('');
    }
    
    if (subId) {
        const subscription = globalSubscriptions.find(s => s.id === subId);
        if (subscription) {
            document.getElementById('subscription-modal-title').textContent = 'تعديل اشتراك';
            document.getElementById('subscription-id').value = subscription.id;
            document.getElementById('subscription-customer-name').value = subscription.customer_name || '';
            document.getElementById('subscription-customer-email').value = subscription.customer_email || '';
            document.getElementById('subscription-plan').value = subscription.plan || 'تجريبي';
            document.getElementById('subscription-price').value = subscription.price || 0;
            document.getElementById('subscription-start-date').value = subscription.start_date || '';
            document.getElementById('subscription-end-date').value = subscription.end_date || '';
            if (subscription.linked_user_id && linkedUserSelect) {
                linkedUserSelect.value = subscription.linked_user_id;
            }
        }
    } else {
        document.getElementById('subscription-modal-title').textContent = 'اشتراك جديد';
        document.getElementById('subscription-id').value = '';
        onSubscriptionPlanChange();
    }
    
    // السماح بتعديل تاريخ الانتهاء
    const endDateInput = document.getElementById('subscription-end-date');
    if (endDateInput) endDateInput.removeAttribute('readonly');
}

function closeSubscriptionModal() {
    hideModal('subscription-modal');
}

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
    
    if (plan === 'تجريبي') {
        endDate.setDate(endDate.getDate() + 3);
    } else if (plan === 'شهري') {
        endDate.setMonth(endDate.getMonth() + 1);
    } else if (plan === 'سنوي') {
        endDate.setFullYear(endDate.getFullYear() + 1);
    }
    
    const endDateInput = document.getElementById('subscription-end-date');
    if (endDateInput) {
        endDateInput.value = endDate.toISOString().split('T')[0];
    }
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
        ownerId
    };
    
    try {
        if (id) {
            await updateDoc(doc(db, "subscriptions", id), data);
        } else {
            await addDoc(collection(db, "subscriptions"), data);
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
                isApproved: true,
                status: 'active'
            });
        }
        
        await loadAllData();
        closeSubscriptionModal();
        loadSubscriptions();
        alert('✅ تم حفظ الاشتراك بنجاح');
    } catch (e) {
        console.error('Error saving subscription:', e);
        alert('❌ حدث خطأ أثناء حفظ الاشتراك');
    }
}

async function renewSubscription(id) {
    const subscription = globalSubscriptions.find(s => s.id === id);
    if (!subscription) return;
    
    const newEndDate = new Date(subscription.end_date);
    if (subscription.plan === 'شهري') {
        newEndDate.setMonth(newEndDate.getMonth() + 1);
    } else if (subscription.plan === 'سنوي') {
        newEndDate.setFullYear(newEndDate.getFullYear() + 1);
    } else {
        newEndDate.setDate(newEndDate.getDate() + 3);
    }
    
    try {
        await updateDoc(doc(db, "subscriptions", id), {
            end_date: newEndDate.toISOString().split('T')[0],
            status: 'نشط'
        });
        
        if (subscription.linked_user_id) {
            await updateDoc(doc(db, "users", subscription.linked_user_id), {
                'subscription.end_date': newEndDate.toISOString().split('T')[0],
                'subscription.status': 'نشط',
                subscriptionEnd: newEndDate.toISOString().split('T')[0],
                status: 'active'
            });
        }
        
        await loadAllData();
        loadSubscriptions();
        alert('✅ تم تجديد الاشتراك بنجاح');
    } catch (e) {
        console.error('Error renewing subscription:', e);
        alert('❌ حدث خطأ أثناء تجديد الاشتراك');
    }
}

// ================================
// الإعدادات
// ================================
function loadSettings() {
    const settingsContent = document.getElementById('settings-content');
    if (!settingsContent) return;
    
    settingsContent.innerHTML = `
        <div class="settings-card">
            <div class="settings-card-header">
                <i class="fas fa-store"></i>
                <h3>بيانات المحل</h3>
            </div>
            <div class="settings-card-body">
                <div class="settings-row">
                    <div class="form-group">
                        <label class="settings-label">اسم المحل</label>
                        <input type="text" class="input-field" id="set-shop-name" value="${globalSettings.shop_name || ''}" placeholder="أدخل اسم المحل">
                    </div>
                    <div class="form-group">
                        <label class="settings-label">اسم المالك</label>
                        <input type="text" class="input-field" id="set-owner-name" value="${globalSettings.owner_name || ''}" placeholder="أدخل اسم صاحب المحل">
                    </div>
                </div>
                <div class="settings-row">
                    <div class="form-group">
                        <label class="settings-label">رقم الهاتف</label>
                        <input type="text" class="input-field" id="set-phone" value="${globalSettings.phone || ''}" placeholder="01xxxxxxxxx">
                    </div>
                    <div class="form-group">
                        <label class="settings-label">العنوان</label>
                        <input type="text" class="input-field" id="set-address" value="${globalSettings.address || ''}" placeholder="أدخل العنوان">
                    </div>
                </div>
                <div class="settings-preview">
                    <p class="shop-name">${globalSettings.shop_name || 'اسم المحل'}</p>
                    <p class="shop-owner">${globalSettings.owner_name || ''}</p>
                    <p class="shop-phone">📞 ${globalSettings.phone || ''}</p>
                    <p class="shop-address">📍 ${globalSettings.address || ''}</p>
                </div>
            </div>
        </div>
        
        <div class="settings-card">
            <div class="settings-card-header">
                <i class="fas fa-shield-alt"></i>
                <h3>الضمان</h3>
            </div>
            <div class="settings-card-body">
                <div class="form-group">
                    <label class="settings-label">أيام الضمان على قطع الغيار</label>
                    <input type="number" class="input-field w-32" id="set-warranty-days" value="${globalSettings.warranty_days || 30}" min="0">
                </div>
                <div class="form-group">
                    <label class="settings-label">ملاحظات الضمان (تظهر في الفاتورة)</label>
                    <textarea class="input-field" id="set-warranty-notes" rows="3" placeholder="مثال: ضمان 30 يوم على قطع الغيار...">${globalSettings.warranty_notes || ''}</textarea>
                </div>
            </div>
        </div>
        
        <div class="settings-card">
            <div class="settings-card-header">
                <i class="fas fa-hard-hat"></i>
                <h3>الفنيين</h3>
            </div>
            <div class="settings-card-body">
                <div class="flex gap-2 mb-3">
                    <input type="text" class="input-field" id="new-technician" placeholder="اسم الفني...">
                    <button class="btn-primary" onclick="addTechnician()"><i class="fas fa-plus"></i> إضافة</button>
                </div>
                <div id="technicians-list">
                    ${globalTechnicians.map((t, i) => `
                        <div class="flex justify-between items-center bg-gray-50 rounded-lg p-3 mb-2">
                            <span class="font-medium">${t}</span>
                            <button class="btn-icon text-red" onclick="window.removeTechnician(${i})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        
        <button class="btn-primary mt-4" onclick="saveSettings()">
            <i class="fas fa-save"></i> حفظ الإعدادات
        </button>
    `;
    
    // ربط أحداث المعاينة
    ['set-shop-name', 'set-owner-name', 'set-phone', 'set-address'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateInvoicePreview);
    });
}

function updateInvoicePreview() {
    const shopName = document.querySelector('.settings-preview .shop-name');
    const owner = document.querySelector('.settings-preview .shop-owner');
    const phone = document.querySelector('.settings-preview .shop-phone');
    const address = document.querySelector('.settings-preview .shop-address');
    
    if (shopName) shopName.textContent = document.getElementById('set-shop-name')?.value || 'اسم المحل';
    if (owner) owner.textContent = document.getElementById('set-owner-name')?.value || '';
    if (phone) phone.textContent = '📞 ' + (document.getElementById('set-phone')?.value || '');
    if (address) address.textContent = '📍 ' + (document.getElementById('set-address')?.value || '');
}

function addTechnician() {
    const input = document.getElementById('new-technician');
    if (input && input.value.trim()) {
        globalTechnicians.push(input.value.trim());
        input.value = '';
        renderTechniciansList();
        updateTechSelects();
    }
}

function removeTechnician(index) {
    globalTechnicians.splice(index, 1);
    renderTechniciansList();
    updateTechSelects();
}

function renderTechniciansList() {
    const list = document.getElementById('technicians-list');
    if (!list) return;
    
    list.innerHTML = globalTechnicians.length ? 
        globalTechnicians.map((t, i) => `
            <div class="flex justify-between items-center bg-gray-50 rounded-lg p-3 mb-2">
                <span class="font-medium">${t}</span>
                <button class="btn-icon text-red" onclick="window.removeTechnician(${i})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('') : 
        '<p class="text-sm text-muted">لم تضف فنيين بعد</p>';
}

function updateTechSelects() {
    const select = document.getElementById('repair-technician');
    if (select) {
        select.innerHTML = globalTechnicians.map(t => `<option value="${t}">${t}</option>`).join('');
    }
}

async function saveSettings() {
    globalSettings.shop_name = document.getElementById('set-shop-name')?.value || '';
    globalSettings.owner_name = document.getElementById('set-owner-name')?.value || '';
    globalSettings.phone = document.getElementById('set-phone')?.value || '';
    globalSettings.address = document.getElementById('set-address')?.value || '';
    globalSettings.warranty_days = parseInt(document.getElementById('set-warranty-days')?.value) || 30;
    globalSettings.warranty_notes = document.getElementById('set-warranty-notes')?.value || '';
    globalSettings.technicians = globalTechnicians;
    
    try {
        await setDoc(doc(db, "settings", ownerId), globalSettings);
        alert('✅ تم حفظ الإعدادات بنجاح');
    } catch (e) {
        console.error('Error saving settings:', e);
        alert('❌ حدث خطأ أثناء حفظ الإعدادات');
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
    if (type === 'part') name = globalParts.find(i => i.id === id)?.name;
    if (type === 'expense') name = globalExpenses.find(i => i.id === id)?.title;
    if (type === 'wallet') name = globalWallets.find(i => i.id === id)?.name;
    if (type === 'subscription') name = globalSubscriptions.find(i => i.id === id)?.customer_name;
    if (type === 'user') name = globalUsers.find(i => i.id === id)?.email;
    
    const messageElement = document.getElementById('delete-message');
    if (messageElement) {
        messageElement.textContent = `هل أنت متأكد من حذف ${labels[type] || ''} "${name || ''}"؟`;
    }
    
    showModal('delete-modal');
}

function closeDeleteModal() {
    hideModal('delete-modal');
    deleteTarget = null;
}

async function executeDelete() {
    if (!deleteTarget) return;
    
    const { type, id } = deleteTarget;
    
    try {
        if (type === 'repair') await deleteDoc(doc(db, "repairs", id));
        if (type === 'part') await deleteDoc(doc(db, "parts", id));
        if (type === 'expense') await deleteDoc(doc(db, "expenses", id));
        if (type === 'wallet') await deleteDoc(doc(db, "wallets", id));
        if (type === 'subscription') await deleteDoc(doc(db, "subscriptions", id));
        if (type === 'user') await deleteDoc(doc(db, "users", id));
        
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
        
        alert('✅ تم الحذف بنجاح');
    } catch (e) {
        console.error('Error deleting:', e);
        alert('❌ حدث خطأ أثناء الحذف');
    }
}

// ================================
// تعريض الدوال للنطاق العام
// ================================
window.formatCurrency = formatCurrency;
window.getStatusBadge = getStatusBadge;
window.getDaysLeft = getDaysLeft;
window.switchTab = switchTab;
window.logout = logout;
window.openRepairForm = openRepairForm;
window.closeRepairForm = closeRepairForm;
window.quickStatusChange = quickStatusChange;
window.printRepairInvoice = printRepairInvoice;
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
window.toggleCustomerRepairs = toggleCustomerRepairs;
window.loadRepairsTable = loadRepairsTable;
window.loadInventoryTable = loadInventoryTable;
window.loadExpensesTable = loadExpensesTable;
window.loadCustomersTable = loadCustomersTable;
window.loadWallets = loadWallets;
window.loadSubscriptions = loadSubscriptions;
window.loadUsersManager = loadUsersManager;
window.toggleUserApproval = toggleUserApproval;
window.editTransaction = editTransaction;
window.deleteTransaction = deleteTransaction;
window.viewWalletTransactions = viewWalletTransactions;

// ================================
// بدء التطبيق
// ================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
