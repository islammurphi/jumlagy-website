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
// دوال النوافذ المنبثقة
// ================================
function showModal(id) { document.getElementById(id)?.classList.add('show'); }
function hideModal(id) { document.getElementById(id)?.classList.remove('show'); }
window.showModal = showModal;
window.hideModal = hideModal;

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
let currentRepairParts = [];
let currentRepairImages = [];

const walletLimits = {
    'vodafone': { daily: 60000, monthly: 200000, max_balance: 100000, label: 'فودافون كاش', icon: 'fa-mobile-alt', color: 'vodafone' },
    'instapay': { daily: 120000, monthly: 400000, max_balance: 999999999, label: 'إنستاباي', icon: 'fa-qrcode', color: 'instapay' },
    'bank': { daily: 100000, monthly: 500000, max_balance: 999999999, label: 'محفظة بنكية', icon: 'fa-university', color: 'bank' },
    'orange': { daily: 60000, monthly: 200000, max_balance: 100000, label: 'أورانج كاش', icon: 'fa-mobile-alt', color: 'vodafone' },
    'etisalat': { daily: 60000, monthly: 200000, max_balance: 100000, label: 'اتصالات كاش', icon: 'fa-mobile-alt', color: 'vodafone' },
    'we': { daily: 60000, monthly: 200000, max_balance: 100000, label: 'وي كاش', icon: 'fa-mobile-alt', color: 'vodafone' },
};

// ================================
// دوال مساعدة
// ================================
function formatCurrency(amount) { return Number(amount || 0).toLocaleString('ar-EG') + ' ج.م'; }
function getStatusBadge(status) {
    const map = { 'تم_التسليم': '<span class="badge badge-info">تم التسليم</span>', 'قيد_الصيانة': '<span class="badge badge-warning">قيد الصيانة</span>', 'جاهز': '<span class="badge badge-success">جاهز للتسليم</span>' };
    return map[status] || map['قيد_الصيانة'];
}
function getDaysLeft(endDate) {
    if (!endDate) return '<span class="badge badge-gray">غير محدد</span>';
    const diff = Math.ceil((new Date(endDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `<span class="badge badge-danger">انتهى منذ ${Math.abs(diff)} يوم</span>`;
    if (diff === 0) return '<span class="badge badge-danger">ينتهي اليوم!</span>';
    if (diff <= 30) return `<span class="badge badge-warning">${diff} يوم</span>`;
    return `<span class="badge badge-success">${diff} يوم</span>`;
}
function showLoading() { document.getElementById('loading-overlay')?.classList.add('show'); }
function hideLoading() { document.getElementById('loading-overlay')?.classList.remove('show'); }

// ================================
// التهيئة الرئيسية
// ================================
async function initApp() {
    const session = JSON.parse(localStorage.getItem('jumlagy_session'));
    if (!session?.uid) { window.location.href = 'login.html'; return; }
    
    ownerId = session.uid;
    updateSidebarUserInfo(session);
    
    const isAdmin = session.role === 'admin';
    document.getElementById('subs-nav-link').style.display = isAdmin ? 'flex' : 'none';
    
    bindEvents();
    showLoading();
    await loadAllData();
    if (globalRepairs.length === 0) await seedDemoData();
    
    loadDashboard();
    loadSettings();
    updateAlertsCount();
    updateSubscriptionWidget();
    updateSidebarShopDisplay();
    
    hideLoading();
}

function updateSidebarUserInfo(session) {
    document.getElementById('sidebar-user-name').textContent = session.name || 'مستخدم';
    document.getElementById('sidebar-user-role').textContent = session.role === 'admin' ? 'مدير النظام' : `مشترك`;
    document.getElementById('sidebar-user-photo').src = session.photo || '';
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function updateSidebarShopDisplay() {
    const logoContainer = document.getElementById('sidebar-shop-logo-container');
    const logoImg = document.getElementById('sidebar-shop-logo-img');
    const nameDisplay = document.getElementById('sidebar-shop-name-display');
    const subtitleDisplay = document.getElementById('sidebar-shop-subtitle-display');
    
    if (globalSettings.shop_image) {
        logoContainer.classList.add('hidden');
        logoImg.classList.remove('hidden');
        logoImg.src = globalSettings.shop_image;
    }
    if (nameDisplay) nameDisplay.textContent = globalSettings.shop_name || 'Jumlagy';
    if (subtitleDisplay) subtitleDisplay.textContent = globalSettings.owner_name || 'نظام إدارة الورشة';
}

function updateSubscriptionWidget() {
    const session = JSON.parse(localStorage.getItem('jumlagy_session'));
    const widget = document.getElementById('subscription-widget');
    if (!widget || !session || session.role === 'admin') { if (widget) widget.classList.add('hidden'); return; }
    
    widget.classList.remove('hidden');
    const endDate = new Date(session.end_date || '2000-01-01');
    const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
    
    widget.className = 'subscription-widget';
    const daysEl = document.getElementById('sub-days-count');
    const labelEl = document.getElementById('sub-days-label');
    const planEl = document.getElementById('sub-plan-name');
    
    if (planEl) planEl.textContent = session.plan || '';
    
    if (daysLeft < 0) {
        widget.classList.add('expired');
        if (daysEl) daysEl.textContent = 'منتهي';
        if (labelEl) labelEl.textContent = 'الاشتراك';
    } else if (daysLeft === 0) {
        widget.classList.add('danger');
        if (daysEl) daysEl.textContent = '0';
        if (labelEl) labelEl.textContent = 'ينتهي اليوم!';
    } else if (daysLeft <= 7) {
        widget.classList.add('danger');
        if (daysEl) daysEl.textContent = daysLeft;
        if (labelEl) labelEl.textContent = 'أيام متبقية';
    } else if (daysLeft <= 30) {
        widget.classList.add('warning');
        if (daysEl) daysEl.textContent = daysLeft;
        if (labelEl) labelEl.textContent = 'يوم متبقي';
    } else {
        if (daysEl) daysEl.textContent = daysLeft;
        if (labelEl) labelEl.textContent = 'يوم متبقي';
    }
}

async function handleShopLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        const dataUrl = e.target.result;
        document.getElementById('sidebar-shop-logo-container').classList.add('hidden');
        const img = document.getElementById('sidebar-shop-logo-img');
        img.classList.remove('hidden');
        img.src = dataUrl;
        globalSettings.shop_image = dataUrl;
        try { await setDoc(doc(db, "settings", ownerId), { shop_image: dataUrl }, { merge: true }); } catch(e) {}
    };
    reader.readAsDataURL(file);
}

function bindEvents() {
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            switchTab(this.getAttribute('data-tab'));
            if (window.innerWidth <= 1024) document.getElementById('sidebar').classList.remove('open');
        });
    });
    
    document.getElementById('menu-toggle')?.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
    document.getElementById('btn-logout')?.addEventListener('click', logout);
    
    document.getElementById('repair-receive-date')?.addEventListener('change', function() {
        if (this.value) {
            const dd = new Date(this.value); dd.setDate(dd.getDate() + 2);
            document.getElementById('repair-delivery-date').value = dd.toISOString().split('T')[0];
        }
    });
    
    document.getElementById('part-form')?.addEventListener('submit', savePart);
    document.getElementById('expense-form')?.addEventListener('submit', saveExpense);
    document.getElementById('wallet-form')?.addEventListener('submit', saveWallet);
    document.getElementById('transaction-form')?.addEventListener('submit', saveTransaction);
    document.getElementById('subscription-form')?.addEventListener('submit', saveSubscription);
    document.getElementById('delete-confirm-btn')?.addEventListener('click', executeDelete);
}

window.handleShopLogoUpload = handleShopLogoUpload;

function switchTab(tab) {
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tab-' + tab)?.classList.add('active');
    
    const loaders = {
        dashboard: loadDashboard, repairs: loadRepairsTable, inventory: loadInventoryTable,
        expenses: loadExpensesTable, customers: loadCustomersTable, wallet: loadWallets,
        reports: loadReports, alerts: loadAlerts, subscriptions: loadSubscriptions
    };
    if (loaders[tab]) loaders[tab]();
}

async function logout() {
    localStorage.removeItem('jumlagy_session');
    try { await signOut(auth); } catch(e) {}
    window.location.href = 'login.html';
}

// ================================
// تحميل البيانات
// ================================
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
        
        globalRepairs = rs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.receive_date || 0) - new Date(a.receive_date || 0));
        globalParts = ps.docs.map(d => ({ id: d.id, ...d.data() }));
        globalExpenses = es.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        globalWallets = ws.docs.map(d => ({ id: d.id, ...d.data() }));
        globalTransactions = ts.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        globalSubscriptions = ss.docs.map(d => ({ id: d.id, ...d.data() }));
        
        if (sd.exists()) {
            globalSettings = sd.data();
            globalTechnicians = globalSettings.technicians || ['أحمد', 'محمد', 'محمود'];
        } else {
            globalSettings = { shop_name: 'Jumlagy', owner_name: 'اسم المحل', phone: '01234567890', address: 'العنوان', warranty_days: 30, warranty_notes: 'ضمان 30 يوم', technicians: globalTechnicians, shop_image: '' };
            await setDoc(doc(db, "settings", ownerId), globalSettings);
        }
        
        if (JSON.parse(localStorage.getItem('jumlagy_session'))?.role === 'admin') {
            globalUsers = us.docs.map(d => ({ id: d.id, ...d.data() }));
        }
    } catch (e) { console.error('Load error:', e); }
}

async function seedDemoData() {
    if (!ownerId || globalRepairs.length > 0) return;
    const demoR = [
        { device_name: 'iPhone 14 Pro Max', customer_name: 'أحمد محمد', customer_phone: '01001234567', technician: 'أحمد', status: 'تم_التسليم', repair_price: 2500, technician_fee: 500, repair_parts: '[{"name":"شاشة OLED","cost":1500}]', receive_date: '2026-04-01', delivery_date: '2026-04-03', device_issue: 'شاشة مكسورة', notes: 'تم تغيير الشاشة', repair_images: '[]', ownerId },
        { device_name: 'Samsung S24 Ultra', customer_name: 'محمود علي', customer_phone: '01007654321', technician: 'محمد', status: 'قيد_الصيانة', repair_price: 1800, technician_fee: 300, repair_parts: '[{"name":"بطارية","cost":800}]', receive_date: '2026-04-20', device_issue: 'بطارية ضعيفة', notes: 'انتظار قطعة', repair_images: '[]', ownerId },
    ];
    const demoP = [
        { name: 'شاشة iPhone 14', category: 'شاشات', purchase_price: 1200, selling_price: 2500, quantity: 5, min_quantity: 2, supplier: 'مورد الشاشات', ownerId },
        { name: 'بطارية Samsung', category: 'بطاريات', purchase_price: 300, selling_price: 800, quantity: 10, min_quantity: 3, supplier: 'مورد البطاريات', ownerId },
    ];
    try { for (const r of demoR) await addDoc(collection(db, "repairs"), r); for (const p of demoP) await addDoc(collection(db, "parts"), p); await loadAllData(); } catch (e) {}
}

// ================================
// لوحة التحكم
// ================================
function loadDashboard() {
    const totalRevenue = globalRepairs.reduce((s, r) => s + (Number(r.repair_price) || 0), 0);
    const totalPartsCost = globalRepairs.reduce((s, r) => {
        try { return s + (JSON.parse(r.repair_parts || '[]')).reduce((ps, p) => ps + (Number(p.cost) || 0), 0); } catch(e) { return s + (Number(r.spare_part_cost) || 0); }
    }, 0);
    const totalTechFees = globalRepairs.reduce((s, r) => s + (Number(r.technician_fee) || 0), 0);
    const totalExpenses = globalExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const profit = totalRevenue - totalPartsCost - totalTechFees - totalExpenses;
    const inventoryValue = globalParts.reduce((s, p) => s + (Number(p.purchase_price) || 0) * (Number(p.quantity) || 0), 0);
    const completedOrders = globalRepairs.filter(r => r.status === 'تم_التسليم').length;
    const avgOrderValue = globalRepairs.length > 0 ? Math.round(totalRevenue / globalRepairs.length) : 0;
    
    document.getElementById('stats-cards').innerHTML = `
        <div class="stat-card"><div class="stat-card-icon icon-blue"><i class="fas fa-dollar-sign"></i></div><div class="stat-card-value">${formatCurrency(totalRevenue)}</div><div class="stat-card-label">إجمالي الإيرادات</div><div class="stat-card-sub">${globalRepairs.length} عملية</div></div>
        <div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-chart-line"></i></div><div class="stat-card-value">${formatCurrency(profit)}</div><div class="stat-card-label">صافي الأرباح</div><div class="stat-card-sub">${profit >= 0 ? '✅ رابح' : '⚠️ خاسر'}</div></div>
        <div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-receipt"></i></div><div class="stat-card-value">${formatCurrency(totalPartsCost + totalTechFees + totalExpenses)}</div><div class="stat-card-label">المصروفات</div><div class="stat-card-sub">تشغيلية وقطع وأجور</div></div>
        <div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-boxes"></i></div><div class="stat-card-value">${formatCurrency(inventoryValue)}</div><div class="stat-card-label">قيمة المخزون</div></div>
        <div class="stat-card"><div class="stat-card-icon icon-cyan"><i class="fas fa-shopping-cart"></i></div><div class="stat-card-value">${formatCurrency(avgOrderValue)}</div><div class="stat-card-label">متوسط الطلب</div></div>
        <div class="stat-card"><div class="stat-card-icon icon-teal"><i class="fas fa-check-circle"></i></div><div class="stat-card-value">${globalRepairs.length > 0 ? Math.round((completedOrders / globalRepairs.length) * 100) : 0}%</div><div class="stat-card-label">معدل الإتمام</div></div>
    `;
    
    // حالة المخزون
    const av = globalParts.filter(p => !p.min_quantity || p.quantity > p.min_quantity).length;
    const lo = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity && p.quantity > 0).length;
    const ou = globalParts.filter(p => p.quantity === 0).length;
    
    document.getElementById('inventory-status').innerHTML = `
        <div style="background:#ecfdf5;border-radius:16px;padding:20px;text-align:center;border:1px solid #a7f3d0"><div style="font-size:32px;font-weight:900;color:#059669">${av}</div><div style="font-size:12px;color:#047857;font-weight:600">متوفر</div></div>
        <div style="background:#fffbeb;border-radius:16px;padding:20px;text-align:center;border:1px solid #fde68a"><div style="font-size:32px;font-weight:900;color:#d97706">${lo}</div><div style="font-size:12px;color:#b45309;font-weight:600">منخفض</div></div>
        <div style="background:#fef2f2;border-radius:16px;padding:20px;text-align:center;border:1px solid #fecaca"><div style="font-size:32px;font-weight:900;color:#dc2626">${ou}</div><div style="font-size:12px;color:#b91c1c;font-weight:600">نافذ</div></div>
    `;
    
    const lp = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity);
    document.getElementById('out-of-stock-alerts').innerHTML = lp.length ? 
        `<div class="alert alert-warning"><i class="fas fa-exclamation-triangle"></i> ${lp.map(p => `${p.name} (${p.quantity})`).join('، ')}</div>` :
        '<div class="alert alert-success"><i class="fas fa-check-circle"></i> جميع القطع متوفرة</div>';
    
    // أفضل العملاء
    const cm = {};
    globalRepairs.forEach(r => { const k = r.customer_phone || r.customer_name; if (!cm[k]) cm[k] = { n: r.customer_name, p: r.customer_phone, t: 0, c: 0 }; cm[k].t += Number(r.repair_price) || 0; cm[k].c++; });
    const tc = Object.values(cm).sort((a, b) => b.t - a.t).slice(0, 5);
    document.getElementById('top-customers-widget').innerHTML = tc.length ? tc.map((c, i) => `
        <div class="flex justify-between items-center py-3 border-b border-gray-100">
            <div><span class="badge ${i===0?'badge-warning':'badge-gray'}">#${i+1}</span> <span class="font-semibold">${c.n||'غير معروف'}</span><br><span class="text-xs text-muted">${c.p||''} · ${c.c} عمليات</span></div>
            <span class="font-bold text-primary">${formatCurrency(c.t)}</span>
        </div>`).join('') : '<p class="text-center text-muted py-4">لا توجد بيانات</p>';
    
    // آخر الأوامر
    const recent = globalRepairs.slice(0, 5);
    document.getElementById('recent-repairs').innerHTML = recent.length ? recent.map(r => `
        <div class="flex justify-between items-center py-3 border-b border-gray-100">
            <div><span class="font-semibold">${r.device_name||'جهاز'}</span><br><span class="text-xs text-muted">${r.customer_name||''} · ${getStatusBadge(r.status)}</span></div>
            <span class="font-bold text-primary">${formatCurrency(r.repair_price)}</span>
        </div>`).join('') : '<p class="text-center text-muted py-4">لا توجد أوامر</p>';
    
    const session = JSON.parse(localStorage.getItem('jumlagy_session'));
    if (session?.role === 'admin') { document.getElementById('users-manager-card').classList.remove('hidden'); loadUsersManager(); }
    else { document.getElementById('users-manager-card').classList.add('hidden'); }
    
    setTimeout(loadDashboardChart, 200);
}

function loadDashboardChart() {
    const canvas = document.getElementById('revenueExpenseChart');
    if (!canvas || typeof Chart === 'undefined') return;
    
    const monthlyData = {};
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    
    globalRepairs.forEach(r => {
        if (r.receive_date) {
            const d = new Date(r.receive_date), k = `${d.getFullYear()}-${d.getMonth()}`;
            if (!monthlyData[k]) monthlyData[k] = { revenue: 0, expenses: 0, month: months[d.getMonth()], year: d.getFullYear() };
            monthlyData[k].revenue += Number(r.repair_price) || 0;
            let pc = 0; try { pc = JSON.parse(r.repair_parts || '[]').reduce((s, p) => s + (Number(p.cost) || 0), 0); } catch(e) { pc = Number(r.spare_part_cost) || 0; }
            monthlyData[k].expenses += pc + (Number(r.technician_fee) || 0);
        }
    });
    globalExpenses.forEach(e => {
        if (e.date) { const d = new Date(e.date), k = `${d.getFullYear()}-${d.getMonth()}`; if (!monthlyData[k]) monthlyData[k] = { revenue: 0, expenses: 0, month: months[d.getMonth()], year: d.getFullYear() }; monthlyData[k].expenses += Number(e.amount) || 0; }
    });
    
    const sd = Object.values(monthlyData).sort((a, b) => a.year - b.year || months.indexOf(a.month) - months.indexOf(b.month)).slice(-6);
    
    if (charts.revenueExpense) charts.revenueExpense.destroy();
    charts.revenueExpense = new Chart(canvas, {
        type: 'bar', data: { labels: sd.map(d => `${d.month}`), datasets: [
            { label: 'الإيرادات', data: sd.map(d => d.revenue), backgroundColor: 'rgba(37,99,235,0.7)', borderColor: '#2563eb', borderWidth: 2, borderRadius: 6 },
            { label: 'المصروفات', data: sd.map(d => d.expenses), backgroundColor: 'rgba(239,68,68,0.6)', borderColor: '#ef4444', borderWidth: 2, borderRadius: 6 }
        ]},
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20, font: { family: 'Tajawal' } } } }, scales: { y: { ticks: { callback: v => v.toLocaleString('ar-EG') + ' ج.م', font: { family: 'Tajawal' } } }, x: { ticks: { font: { family: 'Tajawal' } } } } }
    });
}

function loadUsersManager() {
    const c = document.getElementById('users-manager');
    if (!c) return;
    c.innerHTML = globalUsers.length ? globalUsers.map(u => `
        <div class="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-3 mb-2">
            <div><span class="font-semibold text-sm">${u.fullName||u.name||u.email}</span><span class="text-xs text-muted block">${u.email}</span></div>
            <div class="flex items-center gap-2">
                <span class="badge ${u.role==='admin'?'badge-info':u.isApproved?'badge-success':'badge-danger'}">${u.role==='admin'?'مدير':u.isApproved?'مفعل':'معلق'}</span>
                ${u.role!=='admin'?`<button class="btn btn-xs ${u.isApproved?'btn-danger':'btn-primary'}" onclick="window.toggleUserApproval('${u.id}',${u.isApproved})">${u.isApproved?'حظر':'تفعيل'}</button>`:''}
            </div>
        </div>`).join('') : '<p class="text-center text-muted py-6">لا يوجد مستخدمين</p>';
}

async function toggleUserApproval(uid, cs) {
    await updateDoc(doc(db, "users", uid), { isApproved: !cs, status: !cs ? 'active' : 'pending' });
    await loadAllData(); loadUsersManager();
}

// ================================
// أوامر الصيانة
// ================================
function openRepairForm(repairId = null) {
    showModal('repair-modal');
    document.getElementById('repair-form').reset();
    document.getElementById('repair-receive-date').value = new Date().toISOString().split('T')[0];
    const dd = new Date(); dd.setDate(dd.getDate() + 2);
    document.getElementById('repair-delivery-date').value = dd.toISOString().split('T')[0];
    
    updateTechSelects();
    updatePartSelectForRepair();
    currentRepairParts = [];
    currentRepairImages = [];
    document.getElementById('repair-parts-list').innerHTML = '<p class="text-sm text-muted text-center py-3">لم تضف قطع غيار بعد</p>';
    document.getElementById('repair-parts-data').value = '[]';
    document.getElementById('repair-images-preview').innerHTML = '';
    document.getElementById('repair-images-data').value = '[]';
    
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
            document.getElementById('repair-receive-date').value = r.receive_date || '';
            document.getElementById('repair-delivery-date').value = r.delivery_date || '';
            document.getElementById('repair-issue').value = r.device_issue || '';
            document.getElementById('repair-notes').value = r.notes || '';
            
            try { currentRepairParts = JSON.parse(r.repair_parts || '[]'); } catch(e) { currentRepairParts = []; }
            renderRepairPartsList();
            
            try { currentRepairImages = JSON.parse(r.repair_images || '[]'); } catch(e) { currentRepairImages = []; }
            renderRepairImagesPreview();
        }
    } else {
        document.getElementById('repair-modal-title').textContent = 'أمر صيانة جديد';
        document.getElementById('repair-id').value = '';
    }
}

function closeRepairForm() { hideModal('repair-modal'); }

function updatePartSelectForRepair() {
    const sel = document.getElementById('repair-part-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">اختر قطعة من المخزون...</option>' + 
        globalParts.filter(p => p.quantity > 0).map(p => 
            `<option value="${p.id}" data-name="${p.name}" data-price="${p.selling_price || p.purchase_price}">${p.name} - ${formatCurrency(p.selling_price || p.purchase_price)} (${p.quantity})</option>`
        ).join('');
}

function addPartFromInventory() {
    const sel = document.getElementById('repair-part-select');
    if (!sel?.value) return;
    const opt = sel.options[sel.selectedIndex];
    currentRepairParts.push({ name: opt.getAttribute('data-name'), cost: parseFloat(opt.getAttribute('data-price')) || 0 });
    renderRepairPartsList();
    sel.value = '';
}

function removeRepairPart(index) {
    currentRepairParts.splice(index, 1);
    renderRepairPartsList();
}

function renderRepairPartsList() {
    const list = document.getElementById('repair-parts-list');
    const dataInput = document.getElementById('repair-parts-data');
    if (!list) return;
    
    list.innerHTML = currentRepairParts.length ? currentRepairParts.map((p, i) => `
        <div class="part-item">
            <div class="part-item-icon"><i class="fas fa-box"></i></div>
            <div class="part-item-info">
                <div class="part-item-name">${p.name}</div>
                <div class="part-item-cost">قطعة غيار</div>
            </div>
            <div class="part-item-actions">
                <span class="part-item-price">${formatCurrency(p.cost)}</span>
                <button type="button" class="part-item-remove" onclick="window.removeRepairPart(${i})"><i class="fas fa-times"></i></button>
            </div>
        </div>`).join('') : '<p class="text-sm text-muted text-center py-3">لم تضف قطع غيار بعد</p>';
    
    if (dataInput) dataInput.value = JSON.stringify(currentRepairParts);
}

async function handleRepairImages(event) {
    const files = event.target.files;
    if (!files.length) return;
    
    for (const file of files) {
        const reader = new FileReader();
        reader.onload = function(e) {
            currentRepairImages.push(e.target.result);
            renderRepairImagesPreview();
        };
        reader.readAsDataURL(file);
    }
}

function removeRepairImage(index) {
    currentRepairImages.splice(index, 1);
    renderRepairImagesPreview();
}

function renderRepairImagesPreview() {
    const preview = document.getElementById('repair-images-preview');
    const dataInput = document.getElementById('repair-images-data');
    if (!preview) return;
    
    preview.innerHTML = currentRepairImages.map((img, i) => `
        <div class="image-preview-item">
            <img src="${img}" alt="صورة الجهاز">
            <button type="button" class="remove-image" onclick="window.removeRepairImage(${i})"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
    
    if (dataInput) dataInput.value = JSON.stringify(currentRepairImages);
}

async function saveRepairForm() {
    const form = document.getElementById('repair-form');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    
    showLoading();
    const id = document.getElementById('repair-id').value;
    const partsCost = currentRepairParts.reduce((s, p) => s + (Number(p.cost) || 0), 0);
    
    const data = {
        device_name: document.getElementById('repair-device-name').value,
        customer_name: document.getElementById('repair-customer-name').value,
        customer_phone: document.getElementById('repair-customer-phone').value,
        technician: document.getElementById('repair-technician').value,
        status: document.getElementById('repair-status').value,
        repair_price: Number(document.getElementById('repair-price').value) || 0,
        technician_fee: Number(document.getElementById('repair-tech-fee').value) || 0,
        repair_parts: JSON.stringify(currentRepairParts),
        spare_part_name: currentRepairParts.map(p => p.name).join(' + ') || '',
        spare_part_cost: partsCost,
        repair_images: JSON.stringify(currentRepairImages),
        receive_date: document.getElementById('repair-receive-date').value,
        delivery_date: document.getElementById('repair-delivery-date').value || null,
        device_issue: document.getElementById('repair-issue').value,
        notes: document.getElementById('repair-notes').value,
        ownerId
    };
    
    try {
        if (id) { await updateDoc(doc(db, "repairs", id), data); }
        else { await addDoc(collection(db, "repairs"), data); }
        await loadAllData();
        closeRepairForm();
        loadRepairsTable();
        loadDashboard();
        updateAlertsCount();
    } catch (e) { console.error('Save repair error:', e); }
    hideLoading();
}

async function quickStatusChange(repairId, newStatus) {
    await updateDoc(doc(db, "repairs", repairId), { status: newStatus });
    await loadAllData();
    const activeTab = document.querySelector('.tab-content.active')?.id;
    if (activeTab === 'tab-repairs') loadRepairsTable();
    if (activeTab === 'tab-dashboard') loadDashboard();
}

function loadRepairsTable() {
    const s = (document.getElementById('repair-search')?.value || '').toLowerCase();
    const f = document.getElementById('repair-filter')?.value || 'all';
    let fl = globalRepairs.filter(r => (!s || r.device_name?.toLowerCase().includes(s) || r.customer_name?.toLowerCase().includes(s)) && (f === 'all' || r.status === f));
    
    document.getElementById('repairs-count').textContent = `${globalRepairs.length} أمر صيانة`;
    document.getElementById('repairs-table-container').innerHTML = `
        <div class="table-responsive">
            <table class="table">
                <thead><tr><th>الجهاز</th><th>العميل</th><th>الفني</th><th>الحالة</th><th>السعر</th><th>تاريخ الاستلام</th><th>إجراءات</th></tr></thead>
                <tbody>${fl.length ? fl.map(r => {
                    const statusClass = r.status === 'قيد_الصيانة' ? 'status-pending' : r.status === 'جاهز' ? 'status-ready' : 'status-done';
                    return `<tr>
                        <td class="font-semibold">${r.device_name||'-'}</td>
                        <td>${r.customer_name||'-'}<br><span class="text-xs text-muted">${r.customer_phone||''}</span></td>
                        <td>${r.technician||'-'}</td>
                        <td><select class="status-select ${statusClass}" onchange="window.quickStatusChange('${r.id}',this.value)">
                            <option value="قيد_الصيانة" ${r.status==='قيد_الصيانة'?'selected':''}>قيد الصيانة</option>
                            <option value="جاهز" ${r.status==='جاهز'?'selected':''}>جاهز للتسليم</option>
                            <option value="تم_التسليم" ${r.status==='تم_التسليم'?'selected':''}>تم التسليم</option>
                        </select></td>
                        <td class="font-bold text-primary">${formatCurrency(r.repair_price)}</td>
                        <td class="text-sm">${r.receive_date||'-'}</td>
                        <td><div class="flex gap-1">
                            <button class="btn-icon text-primary" onclick="window.openRepairForm('${r.id}')"><i class="fas fa-pen"></i></button>
                            <button class="btn-icon text-success" onclick="window.printRepairInvoice('${r.id}')"><i class="fas fa-print"></i></button>
                            <button class="btn-icon text-danger" onclick="window.confirmDelete('repair','${r.id}')"><i class="fas fa-trash"></i></button>
                        </div></td>
                    </tr>`;
                }).join('') : '<tr><td colspan="7" class="text-center py-6 text-muted">لا توجد أوامر</td></tr>'}</tbody>
            </table>
        </div>`;
}

// ================================
// طباعة فاتورة
// ================================
async function printRepairInvoice(repairId) {
    const r = globalRepairs.find(r => r.id === repairId);
    if (!r) return;
    let parts = [];
    try { parts = JSON.parse(r.repair_parts || '[]'); } catch(e) {}
    const total = Number(r.repair_price) || 0;
    
    const w = window.open('', '_blank', 'width=800,height=900');
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>فاتورة</title>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800;900&display=swap" rel="stylesheet">
        <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Tajawal',sans-serif;padding:40px;color:#1e293b}
        .inv{max-width:700px;margin:0 auto}.hdr{display:flex;justify-content:space-between;margin-bottom:30px;padding-bottom:20px;border-bottom:3px solid #2563eb}
        .shop h1{font-size:28px;font-weight:900;color:#2563eb}.shop p{font-size:13px;color:#64748b}
        .inv-num h2{font-size:24px;font-weight:800}.inv-num p{font-size:12px;color:#64748b}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
        .box{background:#f8fafc;border-radius:10px;padding:14px}.box .l{font-size:10px;font-weight:700;color:#94a3b8;margin-bottom:4px}.box .v{font-size:15px;font-weight:700}
        table{width:100%;border-collapse:collapse;margin-bottom:24px}th{background:#2563eb;color:white;padding:12px;text-align:right;font-size:12px}
        td{padding:12px;border-bottom:1px solid #e2e8f0;font-size:13px}
        .total{background:#eff6ff;border:2px solid #93c5fd;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px}
        .total .l{font-size:13px;color:#64748b}.total .a{font-size:36px;font-weight:900;color:#2563eb}
        .warranty{background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:20px;font-size:12px;color:#92400e}
        .sign{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:40px}.sbox{text-align:center}.sline{border-bottom:1px solid #cbd5e1;padding-bottom:8px;margin-bottom:6px}.slabel{font-size:12px;color:#94a3b8}
        .ftr{text-align:center;margin-top:30px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8}
        @media print{body{padding:20px}.np{display:none}}</style></head><body><div class="inv">
        <div class="hdr"><div class="shop"><h1>${globalSettings.shop_name||'Jumlagy'}</h1><p>👤 ${globalSettings.owner_name||''}</p><p>📞 ${globalSettings.phone||''}</p><p>📍 ${globalSettings.address||''}</p></div><div class="inv-num"><h2>فاتورة</h2><p>رقم: INV-${repairId.slice(0,8)}</p><p>${new Date().toLocaleDateString('ar-EG')}</p></div></div>
        <div class="grid"><div class="box"><div class="l">العميل</div><div class="v">${r.customer_name||'-'}</div><div style="font-size:12px;color:#64748b">${r.customer_phone||''}</div></div><div class="box"><div class="l">الجهاز</div><div class="v">${r.device_name||'-'}</div><div style="font-size:12px;color:#64748b">الفني: ${r.technician||'-'}</div></div></div>
        <table><thead><tr><th>البيان</th><th>التفاصيل</th><th>المبلغ</th></tr></thead><tbody>
            <tr><td>أجر الصيانة</td><td>${r.device_issue||'صيانة'}</td><td>${formatCurrency(total)}</td></tr>
            ${parts.map(p=>`<tr><td>قطعة غيار</td><td>${p.name}</td><td>${formatCurrency(p.cost)}</td></tr>`).join('')}
        </tbody></table>
        <div class="total"><div class="l">الإجمالي</div><div class="a">${formatCurrency(total)}</div></div>
        ${globalSettings.warranty_days>0?`<div class="warranty">🛡️ ضمان ${globalSettings.warranty_days} يوم - ${globalSettings.warranty_notes||''}</div>`:''}
        <div class="sign"><div class="sbox"><div class="sline"></div><div class="slabel">توقيع العميل</div></div><div class="sbox"><div class="sline"></div><div class="slabel">توقيع الفني</div></div></div>
        <div class="ftr"><p>${globalSettings.shop_name||'Jumlagy'} © ${new Date().getFullYear()}</p></div>
        <div class="np" style="text-align:center;margin-top:20px"><button onclick="window.print()" style="background:#2563eb;color:white;border:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Tajawal'">🖨️ طباعة</button></div>
    </div></body></html>`);
    w.document.close();
}
// ================================
// المخزون
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
        ownerId
    };
    try {
        if (id) await updateDoc(doc(db, "parts", id), data);
        else await addDoc(collection(db, "parts"), data);
        await loadAllData();
        closePartForm();
        loadInventoryTable();
        loadDashboard();
        updateAlertsCount();
    } catch (e) { console.error(e); }
    hideLoading();
}

function loadInventoryTable() {
    const s = (document.getElementById('part-search')?.value || '').toLowerCase();
    const fl = globalParts.filter(p => !s || p.name?.toLowerCase().includes(s) || p.category?.toLowerCase().includes(s) || p.supplier?.toLowerCase().includes(s));
    const tv = globalParts.reduce((s, p) => s + (Number(p.purchase_price) || 0) * (Number(p.quantity) || 0), 0);
    const ti = globalParts.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    
    document.getElementById('inventory-count').textContent = `${globalParts.length} صنف · ${ti} قطعة`;
    document.getElementById('inventory-summary').innerHTML = `
        <div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-boxes"></i></div><div class="stat-card-value">${formatCurrency(tv)}</div><div class="stat-card-label">قيمة المخزون</div></div>
        <div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-cubes"></i></div><div class="stat-card-value">${ti}</div><div class="stat-card-label">إجمالي القطع</div></div>
        <div class="stat-card"><div class="stat-card-icon icon-amber"><i class="fas fa-exclamation-triangle"></i></div><div class="stat-card-value">${globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity).length}</div><div class="stat-card-label">منخفضة المخزون</div></div>
    `;
    
    document.getElementById('inventory-table-container').innerHTML = `
        <div class="table-responsive">
            <table class="table">
                <thead><tr><th>القطعة</th><th>التصنيف</th><th>سعر الشراء</th><th>سعر البيع</th><th>الكمية</th><th>المورد</th><th>إجراءات</th></tr></thead>
                <tbody>${fl.length ? fl.map(p => {
                    const isLow = p.min_quantity && p.quantity <= p.min_quantity;
                    return `<tr>
                        <td class="font-semibold">${p.name||'-'}</td>
                        <td><span class="badge badge-gray">${p.category||'أخرى'}</span></td>
                        <td>${formatCurrency(p.purchase_price)}</td>
                        <td>${p.selling_price ? formatCurrency(p.selling_price) : '-'}</td>
                        <td class="font-bold ${isLow ? 'text-warning' : ''}">${p.quantity} ${isLow ? '⚠️' : ''}</td>
                        <td>${p.supplier||'-'}</td>
                        <td><div class="flex gap-1">
                            <button class="btn-icon text-primary" onclick="window.openPartForm('${p.id}')"><i class="fas fa-pen"></i></button>
                            <button class="btn-icon text-danger" onclick="window.confirmDelete('part','${p.id}')"><i class="fas fa-trash"></i></button>
                        </div></td>
                    </tr>`;
                }).join('') : '<tr><td colspan="7" class="text-center py-6 text-muted">لا توجد قطع</td></tr>'}</tbody>
            </table>
        </div>`;
}

// ================================
// المصاريف
// ================================
function openExpenseForm(eid = null) {
    showModal('expense-modal');
    document.getElementById('expense-form').reset();
    document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
    if (eid) {
        const e = globalExpenses.find(e => e.id === eid);
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
        ownerId
    };
    try {
        if (id) await updateDoc(doc(db, "expenses", id), data);
        else await addDoc(collection(db, "expenses"), data);
        await loadAllData();
        closeExpenseForm();
        loadExpensesTable();
        loadDashboard();
    } catch (e) { console.error(e); }
    hideLoading();
}

function loadExpensesTable() {
    const s = (document.getElementById('expense-search')?.value || '').toLowerCase();
    const c = document.getElementById('expense-cat-filter')?.value || 'الكل';
    const fl = globalExpenses.filter(e => (!s || e.title?.toLowerCase().includes(s)) && (c === 'الكل' || e.category === c));
    const total = globalExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    
    document.getElementById('expenses-count').textContent = `${globalExpenses.length} مصروف · ${formatCurrency(total)}`;
    document.getElementById('expenses-summary').innerHTML = `
        <div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-receipt"></i></div><div class="stat-card-value">${formatCurrency(total)}</div><div class="stat-card-label">إجمالي المصاريف</div></div>
        <div class="stat-card"><div class="stat-card-icon icon-amber"><i class="fas fa-calendar"></i></div><div class="stat-card-value">${globalExpenses.length}</div><div class="stat-card-label">عدد المصاريف</div></div>
    `;
    
    document.getElementById('expenses-list').innerHTML = fl.length ? fl.map(e => `
        <div class="card mb-2">
            <div class="card-body">
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center"><i class="fas fa-receipt text-danger"></i></div>
                        <div>
                            <p class="font-semibold">${e.title||'بدون عنوان'}</p>
                            <p class="text-xs text-muted">${e.date||''} · ${e.category||'أخرى'}${e.notes ? ' · ' + e.notes : ''}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="font-bold text-danger">${formatCurrency(e.amount)}</span>
                        <button class="btn-icon" onclick="window.openExpenseForm('${e.id}')"><i class="fas fa-pen"></i></button>
                        <button class="btn-icon text-danger" onclick="window.confirmDelete('expense','${e.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>
        </div>
    `).join('') : '<p class="text-center text-muted py-10">لا توجد مصاريف</p>';
}

// ================================
// العملاء
// ================================
function loadCustomersTable() {
    const s = (document.getElementById('customer-search')?.value || '').toLowerCase();
    const map = {};
    globalRepairs.forEach(r => {
        const k = r.customer_phone || r.customer_name;
        if (!map[k]) map[k] = { name: r.customer_name, phone: r.customer_phone, repairs: [], totalPaid: 0, lastDate: null };
        map[k].repairs.push(r);
        map[k].totalPaid += Number(r.repair_price) || 0;
        if (r.receive_date) { const d = new Date(r.receive_date); if (!map[k].lastDate || d > map[k].lastDate) map[k].lastDate = d; }
    });
    
    let cs = Object.values(map).map((c, i) => ({ ...c, id: i })).sort((a, b) => (b.lastDate || 0) - (a.lastDate || 0));
    if (s) cs = cs.filter(c => c.name?.toLowerCase().includes(s) || c.phone?.includes(s));
    
    document.getElementById('customers-count').textContent = `${cs.length} عميل`;
    document.getElementById('customers-summary').innerHTML = `
        <div class="stat-card"><div class="stat-card-icon icon-blue"><i class="fas fa-users"></i></div><div class="stat-card-value">${cs.length}</div><div class="stat-card-label">عدد العملاء</div></div>
        <div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-dollar-sign"></i></div><div class="stat-card-value">${formatCurrency(cs.reduce((s,c) => s + c.totalPaid, 0))}</div><div class="stat-card-label">إجمالي الإيرادات</div></div>
    `;
    
    document.getElementById('customers-list').innerHTML = cs.length ? cs.map(c => `
        <div class="card mb-2">
            <div class="card-body">
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center"><i class="fas fa-user text-primary"></i></div>
                        <div>
                            <p class="font-bold">${c.name||'غير معروف'}</p>
                            <p class="text-xs text-muted">📞 ${c.phone||'-'} · ${c.repairs.length} أجهزة</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-4">
                        <div class="text-center"><p class="text-xs text-muted">آخر زيارة</p><p class="text-sm font-semibold">${c.lastDate ? c.lastDate.toISOString().split('T')[0] : '-'}</p></div>
                        <span class="font-bold text-primary">${formatCurrency(c.totalPaid)}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('') : '<p class="text-center text-muted py-10">لا يوجد عملاء</p>';
}

// ================================
// المحافظ - تصميم متطور
// ================================
function loadWallets() {
    const totalBalance = globalWallets.reduce((s, w) => s + (Number(w.balance) || 0), 0);
    const totalDaily = globalWallets.reduce((s, w) => s + (Number(w.daily_used) || 0), 0);
    const totalMonthly = globalWallets.reduce((s, w) => s + (Number(w.monthly_used) || 0), 0);
    const count = globalWallets.length;
    
    // ملخص المحافظ
    document.getElementById('wallet-summary-area').innerHTML = `
        <div class="wallet-summary-card">
            <div class="ws-icon icon-green"><i class="fas fa-wallet"></i></div>
            <div class="ws-value">${formatCurrency(totalBalance)}</div>
            <div class="ws-label">إجمالي الأرصدة</div>
        </div>
        <div class="wallet-summary-card">
            <div class="ws-icon icon-blue"><i class="fas fa-calendar-day"></i></div>
            <div class="ws-value">${formatCurrency(totalDaily)}</div>
            <div class="ws-label">المستعمل اليوم</div>
        </div>
        <div class="wallet-summary-card">
            <div class="ws-icon icon-amber"><i class="fas fa-calendar-alt"></i></div>
            <div class="ws-value">${formatCurrency(totalMonthly)}</div>
            <div class="ws-label">المستعمل الشهر</div>
        </div>
        <div class="wallet-summary-card">
            <div class="ws-icon icon-purple"><i class="fas fa-university"></i></div>
            <div class="ws-value">${count}</div>
            <div class="ws-label">عدد المحافظ</div>
        </div>
    `;
    
    // كروت المحافظ
    document.getElementById('wallet-cards-container').innerHTML = globalWallets.length ? `
        <div class="wallet-cards-grid">
            ${globalWallets.map(w => {
                const limit = walletLimits[w.type] || walletLimits['vodafone'];
                const dp = w.daily_limit > 0 ? Math.min((Number(w.daily_used) / Number(w.daily_limit)) * 100, 100) : 0;
                const mp = w.monthly_limit > 0 ? Math.min((Number(w.monthly_used) / Number(w.monthly_limit)) * 100, 100) : 0;
                
                return `
                <div class="wallet-card-detailed wallet-${limit.color || 'vodafone'}">
                    <div class="wallet-card-header">
                        <div class="wallet-card-type">
                            <div class="wallet-card-type-icon ${limit.color || 'vodafone'}">
                                <i class="fas ${limit.icon || 'fa-mobile-alt'}"></i>
                            </div>
                            <div>
                                <div class="wallet-card-type-name">${w.name || 'محفظة'}</div>
                                <div class="wallet-card-phone">${w.phone || limit.label}</div>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button class="btn-icon text-primary" onclick="window.openTransactionModal('${w.id}')" title="عملية جديدة"><i class="fas fa-exchange-alt"></i></button>
                            <button class="btn-icon" onclick="window.openWalletModal('${w.id}')" title="تعديل"><i class="fas fa-pen"></i></button>
                            <button class="btn-icon text-danger" onclick="window.confirmDelete('wallet','${w.id}')" title="حذف"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                    
                    <div class="wallet-balance-display">
                        <div class="wallet-balance-amount">${formatCurrency(w.balance)}</div>
                        <div class="wallet-balance-currency">جنيه مصري</div>
                    </div>
                    
                    <div class="wallet-limits-grid">
                        <div class="wallet-limit-box">
                            <div class="wallet-limit-label">الحد اليومي</div>
                            <div class="wallet-limit-value">${formatCurrency(w.daily_limit)}</div>
                            <div class="wallet-progress-container">
                                <div class="wallet-progress-bar-wrapper">
                                    <div class="wallet-progress-fill ${dp > 80 ? 'danger' : dp > 50 ? 'warning' : 'safe'}" style="width:${dp}%"></div>
                                </div>
                                <div class="wallet-progress-text">مستعمل: ${formatCurrency(w.daily_used)}</div>
                            </div>
                        </div>
                        <div class="wallet-limit-box">
                            <div class="wallet-limit-label">الحد الشهري</div>
                            <div class="wallet-limit-value">${formatCurrency(w.monthly_limit)}</div>
                            <div class="wallet-progress-container">
                                <div class="wallet-progress-bar-wrapper">
                                    <div class="wallet-progress-fill ${mp > 80 ? 'danger' : mp > 50 ? 'warning' : 'safe'}" style="width:${mp}%"></div>
                                </div>
                                <div class="wallet-progress-text">مستعمل: ${formatCurrency(w.monthly_used)}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="wallet-actions-row">
                        <button class="btn btn-primary btn-sm flex-1" onclick="window.openTransactionModal('${w.id}')">
                            <i class="fas fa-plus"></i> عملية جديدة
                        </button>
                        <button class="btn btn-outline btn-sm flex-1" onclick="window.viewWalletTransactions('${w.id}')">
                            <i class="fas fa-history"></i> سجل العمليات
                        </button>
                    </div>
                </div>`;
            }).join('')}
        </div>
    ` : '<div class="card"><div class="card-body text-center py-10"><i class="fas fa-wallet text-muted" style="font-size:48px;margin-bottom:12px"></i><p class="text-lg font-bold">لا توجد محافظ</p><p class="text-muted">أضف محفظتك الأولى للبدء</p></div></div>';
    
    // آخر العمليات
    const sorted = [...globalTransactions].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 15);
    document.getElementById('wallet-transactions-body').innerHTML = sorted.length ? `
        <div class="table-responsive">
            <table class="table">
                <thead><tr><th>التاريخ</th><th>المحفظة</th><th>النوع</th><th>المبلغ</th><th>ملاحظات</th></tr></thead>
                <tbody>${sorted.map(t => {
                    const w = globalWallets.find(w => w.id === t.wallet_id);
                    return `<tr>
                        <td class="text-sm">${t.date||'-'}</td>
                        <td class="font-semibold">${w ? w.name : '—'}</td>
                        <td><span class="badge ${t.type==='deposit'?'badge-success':'badge-danger'}">${t.type==='deposit'?'إيداع':'سحب'}</span></td>
                        <td class="font-bold ${t.type==='deposit'?'text-success':'text-danger'}">${t.type==='deposit'?'+':'-'} ${formatCurrency(t.amount)}</td>
                        <td class="text-sm text-muted">${t.notes||'—'}</td>
                    </tr>`;
                }).join('')}</tbody>
            </table>
        </div>
    ` : '<p class="text-center text-muted py-6">لا توجد عمليات</p>';
}

function viewWalletTransactions(walletId) {
    const wallet = globalWallets.find(w => w.id === walletId);
    if (!wallet) return;
    const transactions = globalTransactions.filter(t => t.wallet_id === walletId).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.innerHTML = `
        <div class="modal-box modal-lg">
            <div class="modal-header">
                <h3><i class="fas fa-history"></i> سجل ${wallet.name}</h3>
                <button class="modal-close-btn" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button>
            </div>
            <div class="table-responsive">
                <table class="table">
                    <thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>ملاحظات</th></tr></thead>
                    <tbody>${transactions.map(t => `
                        <tr>
                            <td>${t.date||'-'}</td>
                            <td><span class="badge ${t.type==='deposit'?'badge-success':'badge-danger'}">${t.type==='deposit'?'إيداع':'سحب'}</span></td>
                            <td class="font-bold ${t.type==='deposit'?'text-success':'text-danger'}">${t.type==='deposit'?'+':'-'} ${formatCurrency(t.amount)}</td>
                            <td>${t.notes||'—'}</td>
                        </tr>
                    `).join('') || '<tr><td colspan="4" class="text-center py-4 text-muted">لا توجد عمليات</td></tr>'}</tbody>
                </table>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function onWalletTypeChange() {
    const t = document.getElementById('wallet-type')?.value;
    const d = document.getElementById('wallet-limits-info');
    if (t && walletLimits[t] && d) {
        d.classList.remove('hidden');
        d.innerHTML = `<i class="fas fa-info-circle"></i> الحد اليومي: <strong>${walletLimits[t].daily.toLocaleString()} ج.م</strong> | الحد الشهري: <strong>${walletLimits[t].monthly.toLocaleString()} ج.م</strong>`;
    } else if (d) d.classList.add('hidden');
}

function openWalletModal(wid = null) {
    showModal('wallet-modal');
    document.getElementById('wallet-form').reset();
    const info = document.getElementById('wallet-limits-info');
    if (info) info.classList.add('hidden');
    if (wid) {
        const w = globalWallets.find(w => w.id === wid);
        if (w) {
            document.getElementById('wallet-modal-title').textContent = 'تعديل محفظة';
            document.getElementById('wallet-id').value = w.id;
            document.getElementById('wallet-name').value = w.name || '';
            document.getElementById('wallet-phone').value = w.phone || '';
            document.getElementById('wallet-type').value = w.type || '';
            onWalletTypeChange();
        }
    } else {
        document.getElementById('wallet-modal-title').textContent = 'محفظة جديدة';
        document.getElementById('wallet-id').value = '';
    }
}

function closeWalletModal() { hideModal('wallet-modal'); }

async function saveWallet(e) {
    e.preventDefault();
    const id = document.getElementById('wallet-id').value;
    const t = document.getElementById('wallet-type').value;
    const l = walletLimits[t] || walletLimits['vodafone'];
    const d = {
        name: document.getElementById('wallet-name').value,
        phone: document.getElementById('wallet-phone').value,
        type: t,
        balance: 0, daily_used: 0, monthly_used: 0,
        daily_limit: l.daily, monthly_limit: l.monthly, max_balance: l.max_balance,
        ownerId
    };
    try {
        if (id) {
            const ex = globalWallets.find(w => w.id === id);
            d.balance = ex?.balance || 0;
            d.daily_used = ex?.daily_used || 0;
            d.monthly_used = ex?.monthly_used || 0;
            await updateDoc(doc(db, "wallets", id), d);
        } else await addDoc(collection(db, "wallets"), d);
        await loadAllData();
        closeWalletModal();
        loadWallets();
    } catch (e) { console.error(e); }
}

function openTransactionModal(wid) {
    showModal('transaction-modal');
    document.getElementById('transaction-form').reset();
    document.getElementById('transaction-wallet-id').value = wid;
    document.getElementById('transaction-limit-warning')?.classList.add('hidden');
}

function closeTransactionModal() { hideModal('transaction-modal'); }

async function saveTransaction(e) {
    e.preventDefault();
    const wid = document.getElementById('transaction-wallet-id').value;
    const type = document.getElementById('transaction-type').value;
    const amount = parseFloat(document.getElementById('transaction-amount').value);
    const notes = document.getElementById('transaction-notes').value;
    const wallet = globalWallets.find(w => w.id === wid);
    if (!wallet) return;
    
    if (type === 'withdraw' && amount > (Number(wallet.balance) || 0)) {
        const wd = document.getElementById('transaction-limit-warning');
        if (wd) { wd.textContent = '❌ الرصيد غير كافي'; wd.classList.remove('hidden'); }
        return;
    }
    
    try {
        const newBalance = type === 'withdraw' ? Number(wallet.balance) - amount : Number(wallet.balance) + amount;
        await updateDoc(doc(db, "wallets", wid), {
            balance: newBalance,
            daily_used: type === 'withdraw' ? Number(wallet.daily_used) + amount : Number(wallet.daily_used),
            monthly_used: type === 'withdraw' ? Number(wallet.monthly_used) + amount : Number(wallet.monthly_used)
        });
        await addDoc(collection(db, "transactions"), {
            wallet_id: wid, type, amount,
            date: new Date().toISOString().split('T')[0], notes, ownerId
        });
        await loadAllData();
        closeTransactionModal();
        loadWallets();
    } catch (e) { console.error(e); }
}

// ================================
// التقارير - تصميم جديد
// ================================
function loadReports() {
    const tr = globalRepairs.reduce((s, r) => s + (Number(r.repair_price) || 0), 0);
    const tpc = globalRepairs.reduce((s, r) => {
        try { return s + JSON.parse(r.repair_parts || '[]').reduce((ps, p) => ps + (Number(p.cost) || 0), 0); }
        catch(e) { return s + (Number(r.spare_part_cost) || 0); }
    }, 0);
    const ttf = globalRepairs.reduce((s, r) => s + (Number(r.technician_fee) || 0), 0);
    const te = globalExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const profit = tr - tpc - ttf - te;
    const margin = tr > 0 ? ((profit / tr) * 100).toFixed(1) : 0;
    const completed = globalRepairs.filter(r => r.status === 'تم_التسليم').length;
    const avgOrder = globalRepairs.length > 0 ? Math.round(tr / globalRepairs.length) : 0;
    
    document.getElementById('reports-content').innerHTML = `
        <!-- بطاقات المؤشرات -->
        <div class="report-highlight-cards">
            <div class="report-highlight-card">
                <div class="report-highlight-icon icon-blue"><i class="fas fa-dollar-sign"></i></div>
                <div class="report-highlight-info">
                    <div class="report-highlight-value">${formatCurrency(tr)}</div>
                    <div class="report-highlight-label">إجمالي الإيرادات</div>
                    <div class="report-highlight-trend up">${globalRepairs.length} عملية</div>
                </div>
            </div>
            <div class="report-highlight-card">
                <div class="report-highlight-icon ${profit >= 0 ? 'icon-green' : 'icon-red'}"><i class="fas fa-chart-line"></i></div>
                <div class="report-highlight-info">
                    <div class="report-highlight-value">${formatCurrency(profit)}</div>
                    <div class="report-highlight-label">صافي الأرباح</div>
                    <div class="report-highlight-trend ${profit >= 0 ? 'up' : 'down'}">هامش ${margin}%</div>
                </div>
            </div>
            <div class="report-highlight-card">
                <div class="report-highlight-icon icon-cyan"><i class="fas fa-shopping-cart"></i></div>
                <div class="report-highlight-info">
                    <div class="report-highlight-value">${formatCurrency(avgOrder)}</div>
                    <div class="report-highlight-label">متوسط الطلب</div>
                    <div class="report-highlight-trend up">${completed} مكتمل</div>
                </div>
            </div>
            <div class="report-highlight-card">
                <div class="report-highlight-icon icon-teal"><i class="fas fa-check-circle"></i></div>
                <div class="report-highlight-info">
                    <div class="report-highlight-value">${globalRepairs.length > 0 ? Math.round((completed / globalRepairs.length) * 100) : 0}%</div>
                    <div class="report-highlight-label">معدل الإتمام</div>
                    <div class="report-highlight-trend up">${completed}/${globalRepairs.length}</div>
                </div>
            </div>
        </div>
        
        <!-- تفصيل الأرباح -->
        <div class="report-section">
            <div class="report-section-header"><i class="fas fa-chart-pie"></i><h3>تفصيل صافي الأرباح</h3></div>
            <div class="report-section-body">
                <div class="profit-breakdown-grid">
                    <div class="profit-item profit-revenue"><div class="profit-label">الإيرادات</div><div class="profit-value">${formatCurrency(tr)}</div></div>
                    <div class="profit-item profit-parts"><div class="profit-label">تكلفة القطع</div><div class="profit-value">-${formatCurrency(tpc)}</div></div>
                    <div class="profit-item profit-labor"><div class="profit-label">أجور الفنيين</div><div class="profit-value">-${formatCurrency(ttf)}</div></div>
                    <div class="profit-item profit-operational"><div class="profit-label">مصاريف تشغيلية</div><div class="profit-value">-${formatCurrency(te)}</div></div>
                    <div class="profit-item profit-net"><div class="profit-label">صافي الأرباح</div><div class="profit-value">${formatCurrency(profit)}</div></div>
                </div>
            </div>
        </div>
        
        <!-- أداء الفنيين -->
        <div class="report-section">
            <div class="report-section-header"><i class="fas fa-user-cog"></i><h3>أداء الفنيين</h3></div>
            <div class="report-section-body" id="tech-performance-content">
                ${(() => {
                    const tm = {};
                    globalRepairs.forEach(r => {
                        if (!r.technician) return;
                        if (!tm[r.technician]) tm[r.technician] = { n: r.technician, t: 0, c: 0, r: 0 };
                        tm[r.technician].t++;
                        tm[r.technician].r += Number(r.repair_price) || 0;
                        if (r.status === 'تم_التسليم') tm[r.technician].c++;
                    });
                    return Object.values(tm).length ? Object.values(tm).sort((a,b) => b.r - a.r).map((t, i) => `
                        <div class="flex items-center gap-4 bg-gray-50 rounded-xl p-4 mb-2">
                            <div class="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center font-bold text-primary">${i+1}</div>
                            <div class="flex-1"><div class="font-bold">${t.n}</div><div class="text-xs text-muted">${t.c}/${t.t} مكتمل (${t.t>0?Math.round((t.c/t.t)*100):0}%)</div></div>
                            <div class="text-sm text-muted">${t.t} عمليات</div>
                            <div class="font-bold text-primary">${formatCurrency(t.r)}</div>
                        </div>
                    `).join('') : '<p class="text-center text-muted py-4">لا توجد بيانات</p>';
                })()}
            </div>
        </div>
        
        <!-- أفضل العملاء والأجهزة -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
            <div class="report-section">
                <div class="report-section-header"><i class="fas fa-star text-warning"></i><h3>أفضل العملاء</h3></div>
                <div class="report-section-body" id="report-top-customers">
                    ${(() => {
                        const cm = {};
                        globalRepairs.forEach(r => {
                            const k = r.customer_phone || r.customer_name;
                            if (!cm[k]) cm[k] = { n: r.customer_name, t: 0, c: 0 };
                            cm[k].t += Number(r.repair_price) || 0; cm[k].c++;
                        });
                        return Object.values(cm).sort((a,b) => b.t - a.t).slice(0, 8).map((c, i) => `
                            <div class="flex items-center gap-3 bg-gray-50 rounded-lg p-3 mb-2">
                                <span class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${i<3?'bg-amber-100 text-amber-700':'bg-gray-200 text-gray-600'}">${i+1}</span>
                                <div class="flex-1"><span class="font-semibold text-sm">${c.n||'غير معروف'}</span><br><span class="text-xs text-muted">${c.c} عمليات</span></div>
                                <span class="font-bold text-primary text-sm">${formatCurrency(c.t)}</span>
                            </div>
                        `).join('') || '<p class="text-center text-muted py-4">لا توجد بيانات</p>';
                    })()}
                </div>
            </div>
            <div class="report-section">
                <div class="report-section-header"><i class="fas fa-mobile-alt text-purple"></i><h3>الأجهزة الأكثر صيانة</h3></div>
                <div class="report-section-body" id="report-top-devices">
                    ${(() => {
                        const dm = {};
                        globalRepairs.forEach(r => {
                            if (!r.device_name) return;
                            if (!dm[r.device_name]) dm[r.device_name] = { n: r.device_name, c: 0 };
                            dm[r.device_name].c++;
                        });
                        return Object.values(dm).sort((a,b) => b.c - a.c).slice(0, 8).map((d, i) => `
                            <div class="flex items-center gap-3 bg-gray-50 rounded-lg p-3 mb-2">
                                <span class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${i<3?'bg-purple-100 text-purple-700':'bg-gray-200 text-gray-600'}">${i+1}</span>
                                <div class="flex-1"><span class="font-semibold text-sm">${d.n}</span></div>
                                <span class="font-bold text-sm">${d.c} جهاز</span>
                            </div>
                        `).join('') || '<p class="text-center text-muted py-4">لا توجد بيانات</p>';
                    })()}
                </div>
            </div>
        </div>
    `;
}

// ================================
// التنبيهات
// ================================
function updateAlertsCount() {
    const total = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity).length +
        globalRepairs.filter(r => r.status !== 'تم_التسليم' && r.delivery_date && new Date(r.delivery_date) < new Date()).length;
    const badge = document.getElementById('alerts-count');
    if (badge) { badge.textContent = total; badge.classList.toggle('hidden', total === 0); }
}

function loadAlerts() {
    const now = new Date();
    const all = [
        ...globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity).map(p => ({
            title: `مخزون منخفض: ${p.name}`,
            desc: `الكمية المتبقية: ${p.quantity} (الحد: ${p.min_quantity})`,
            icon: 'fa-box', color: 'text-warning', bg: '#fffbeb', border: '#f59e0b'
        })),
        ...globalRepairs.filter(r => r.delivery_date && r.status !== 'تم_التسليم' && new Date(r.delivery_date) < now).map(r => ({
            title: `تأخر تسليم: ${r.device_name}`,
            desc: `العميل: ${r.customer_name} | كان مقرر: ${r.delivery_date}`,
            icon: 'fa-clock', color: 'text-danger', bg: '#fef2f2', border: '#ef4444'
        }))
    ];
    
    document.getElementById('alerts-summary-text').textContent = all.length ? `${all.length} تنبيه` : 'لا توجد تنبيهات';
    document.getElementById('alerts-list').innerHTML = all.length ? all.map(a => `
        <div class="card mb-2" style="background:${a.bg};border-right:4px solid ${a.border}">
            <div class="card-body"><div class="flex items-start gap-3">
                <i class="fas ${a.icon} ${a.color} text-xl mt-1"></i>
                <div><p class="font-bold">${a.title}</p><p class="text-sm text-muted">${a.desc}</p></div>
            </div></div>
        </div>
    `).join('') : `
        <div class="card"><div class="card-body text-center py-10">
            <i class="fas fa-check-circle text-success" style="font-size:48px;margin-bottom:12px"></i>
            <p class="text-lg font-bold text-success">كل شيء على ما يرام!</p>
        </div></div>`;
}

// ================================
// الاشتراكات
// ================================
function loadSubscriptions() {
    const s = (document.getElementById('sub-search')?.value || '').toLowerCase();
    const f = document.getElementById('sub-filter')?.value || 'all';
    let fl = globalSubscriptions.filter(sub => {
        const ms = !s || sub.customer_name?.toLowerCase().includes(s) || sub.customer_email?.toLowerCase().includes(s);
        const mf = f === 'all' || sub.status === f;
        return ms && mf;
    });
    
    const active = globalSubscriptions.filter(s => s.status === 'نشط').length;
    const expired = globalSubscriptions.filter(s => s.status === 'منتهي').length;
    const expiring = globalSubscriptions.filter(s => {
        if (s.status !== 'نشط') return false;
        return Math.ceil((new Date(s.end_date) - new Date()) / (1000*60*60*24)) <= 30;
    }).length;
    
    document.getElementById('subs-count-text').textContent = `${globalSubscriptions.length} مشترك`;
    document.getElementById('subscription-summary-cards').innerHTML = `
        <div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-check-circle"></i></div><div class="stat-card-value">${active}</div><div class="stat-card-label">نشطة</div></div>
        <div class="stat-card"><div class="stat-card-icon icon-amber"><i class="fas fa-clock"></i></div><div class="stat-card-value">${expiring}</div><div class="stat-card-label">تنتهي قريباً</div></div>
        <div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-times-circle"></i></div><div class="stat-card-value">${expired}</div><div class="stat-card-label">منتهية</div></div>
        <div class="stat-card"><div class="stat-card-icon icon-blue"><i class="fas fa-dollar-sign"></i></div><div class="stat-card-value">${formatCurrency(globalSubscriptions.reduce((s,sub) => s + (Number(sub.price)||0), 0))}</div><div class="stat-card-label">الإيرادات</div></div>
    `;
    
    document.getElementById('subscriptions-table-body').innerHTML = fl.length ? fl.map((sub, i) => `
        <tr>
            <td class="text-xs text-muted">${i+1}</td>
            <td class="font-semibold">${sub.customer_name||'-'}</td>
            <td class="text-sm">${sub.customer_email||'-'}</td>
            <td><span class="badge ${sub.plan==='سنوي'?'badge-info':sub.plan==='شهري'?'badge-success':'badge-gray'}">${sub.plan||'-'}</span></td>
            <td class="font-bold text-primary">${formatCurrency(sub.price)}</td>
            <td class="text-sm">${sub.start_date||'-'}</td>
            <td class="text-sm">${sub.end_date||'-'}</td>
            <td>${getDaysLeft(sub.end_date)}</td>
            <td>${sub.status==='نشط'?'<span class="badge badge-success">نشط</span>':'<span class="badge badge-danger">منتهي</span>'}</td>
            <td><div class="flex gap-1">
                <button class="btn-icon" onclick="window.openSubscriptionModal('${sub.id}')"><i class="fas fa-pen"></i></button>
                ${sub.status==='منتهي'?`<button class="btn btn-xs btn-primary" onclick="window.renewSubscription('${sub.id}')"><i class="fas fa-sync-alt"></i> تجديد</button>`:''}
                <button class="btn-icon text-danger" onclick="window.confirmDelete('subscription','${sub.id}')"><i class="fas fa-trash"></i></button>
            </div></td>
        </tr>
    `).join('') : '<tr><td colspan="10" class="text-center py-6 text-muted">لا توجد اشتراكات</td></tr>';
}

function openSubscriptionModal(sid = null) {
    showModal('subscription-modal');
    document.getElementById('subscription-form').reset();
    document.getElementById('subscription-start-date').value = new Date().toISOString().split('T')[0];
    
    const sel = document.getElementById('subscription-linked-user');
    if (sel) sel.innerHTML = '<option value="">اختر مستخدم...</option>' + 
        globalUsers.map(u => `<option value="${u.id}">${u.fullName||u.name||u.email} (${u.email})</option>`).join('');
    
    if (sid) {
        const sub = globalSubscriptions.find(s => s.id === sid);
        if (sub) {
            document.getElementById('subscription-modal-title').textContent = 'تعديل اشتراك';
            document.getElementById('subscription-id').value = sub.id;
            document.getElementById('subscription-customer-name').value = sub.customer_name || '';
            document.getElementById('subscription-customer-email').value = sub.customer_email || '';
            document.getElementById('subscription-plan').value = sub.plan || 'تجريبي';
            document.getElementById('subscription-price').value = sub.price || 0;
            document.getElementById('subscription-start-date').value = sub.start_date || '';
            document.getElementById('subscription-end-date').value = sub.end_date || '';
            if (sub.linked_user_id && sel) sel.value = sub.linked_user_id;
        }
    } else {
        document.getElementById('subscription-modal-title').textContent = 'اشتراك جديد';
        document.getElementById('subscription-id').value = '';
        onSubscriptionPlanChange();
    }
    document.getElementById('subscription-end-date')?.removeAttribute('readonly');
}

function closeSubscriptionModal() { hideModal('subscription-modal'); }

function onLinkedUserChange() {
    const uid = document.getElementById('subscription-linked-user')?.value;
    if (uid) {
        const u = globalUsers.find(u => u.id === uid);
        if (u) {
            document.getElementById('subscription-customer-name').value = u.fullName || u.name || '';
            document.getElementById('subscription-customer-email').value = u.email || '';
        }
    }
}

function onSubscriptionPlanChange() {
    const plan = document.getElementById('subscription-plan')?.value;
    const sd = document.getElementById('subscription-start-date')?.value || new Date().toISOString().split('T')[0];
    const ed = new Date(sd);
    if (plan === 'تجريبي') ed.setDate(ed.getDate() + 3);
    else if (plan === 'شهري') ed.setMonth(ed.getMonth() + 1);
    else if (plan === 'سنوي') ed.setFullYear(ed.getFullYear() + 1);
    document.getElementById('subscription-end-date').value = ed.toISOString().split('T')[0];
}

async function saveSubscription(e) {
    e.preventDefault();
    const id = document.getElementById('subscription-id').value;
    const linkedUserId = document.getElementById('subscription-linked-user').value || null;
    const d = {
        customer_name: document.getElementById('subscription-customer-name').value,
        customer_email: document.getElementById('subscription-customer-email').value,
        plan: document.getElementById('subscription-plan').value,
        price: Number(document.getElementById('subscription-price').value) || 0,
        start_date: document.getElementById('subscription-start-date').value,
        end_date: document.getElementById('subscription-end-date').value,
        status: 'نشط',
        linked_user_id: linkedUserId,
        ownerId
    };
    
    try {
        if (id) await updateDoc(doc(db, "subscriptions", id), d);
        else await addDoc(collection(db, "subscriptions"), d);
        
        // ربط الاشتراك بحساب المستخدم
        if (linkedUserId) {
            await updateDoc(doc(db, "users", linkedUserId), {
                subscription: { plan: d.plan, status: 'نشط', start_date: d.start_date, end_date: d.end_date, price: d.price },
                subscriptionType: d.plan,
                subscriptionEnd: d.end_date,
                isApproved: true,
                status: 'active'
            });
        }
        
        await loadAllData();
        closeSubscriptionModal();
        loadSubscriptions();
        updateSubscriptionWidget();
    } catch (e) { console.error(e); }
}

async function renewSubscription(id) {
    const sub = globalSubscriptions.find(s => s.id === id);
    if (!sub) return;
    const ne = new Date(sub.end_date);
    if (sub.plan === 'شهري') ne.setMonth(ne.getMonth() + 1);
    else if (sub.plan === 'سنوي') ne.setFullYear(ne.getFullYear() + 1);
    else ne.setDate(ne.getDate() + 3);
    
    try {
        await updateDoc(doc(db, "subscriptions", id), { end_date: ne.toISOString().split('T')[0], status: 'نشط' });
        if (sub.linked_user_id) {
            await updateDoc(doc(db, "users", sub.linked_user_id), {
                'subscription.end_date': ne.toISOString().split('T')[0],
                'subscription.status': 'نشط',
                subscriptionEnd: ne.toISOString().split('T')[0],
                status: 'active'
            });
        }
        await loadAllData();
        loadSubscriptions();
        updateSubscriptionWidget();
    } catch (e) { console.error(e); }
}

// ================================
// الإعدادات
// ================================
function loadSettings() {
    document.getElementById('settings-content').innerHTML = `
        <div class="settings-section-card">
            <div class="settings-section-header">
                <div class="settings-section-icon" style="background:#dbeafe"><i class="fas fa-store text-primary"></i></div>
                <div><div class="settings-section-title">بيانات المحل</div><div class="settings-section-subtitle">تظهر في الفواتير والتقارير</div></div>
            </div>
            <div class="settings-section-body">
                <div class="settings-grid">
                    <div class="settings-field"><label>اسم المحل</label><input class="input-field" id="set-shop-name" value="${globalSettings.shop_name||''}"></div>
                    <div class="settings-field"><label>اسم المالك</label><input class="input-field" id="set-owner-name" value="${globalSettings.owner_name||''}"></div>
                    <div class="settings-field"><label>رقم الهاتف</label><input class="input-field" id="set-phone" value="${globalSettings.phone||''}"></div>
                    <div class="settings-field"><label>العنوان</label><input class="input-field" id="set-address" value="${globalSettings.address||''}"></div>
                </div>
                <div class="settings-field"><label>صورة المحل</label>
                    <div class="flex items-center gap-3">
                        <img id="settings-shop-preview" src="${globalSettings.shop_image||''}" style="width:60px;height:60px;border-radius:12px;object-fit:cover;background:#f1f5f9;border:2px solid #e2e8f0" onerror="this.style.display='none'">
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('settings-image-input').click()"><i class="fas fa-camera"></i> تغيير</button>
                        <input type="file" id="settings-image-input" accept="image/*" style="display:none" onchange="window.handleSettingsImageChange(event)">
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section-card">
            <div class="settings-section-header">
                <div class="settings-section-icon" style="background:#d1fae5"><i class="fas fa-shield-alt text-success"></i></div>
                <div><div class="settings-section-title">الضمان</div><div class="settings-section-subtitle">تظهر في الفاتورة المطبوعة</div></div>
            </div>
            <div class="settings-section-body">
                <div class="settings-field"><label>مدة الضمان (أيام)</label><input type="number" class="input-field w-auto" style="width:120px" id="set-warranty-days" value="${globalSettings.warranty_days||30}"></div>
                <div class="settings-field"><label>نص الضمان</label><textarea class="input-field" id="set-warranty-notes" rows="2">${globalSettings.warranty_notes||''}</textarea></div>
            </div>
        </div>
        
        <div class="settings-section-card">
            <div class="settings-section-header">
                <div class="settings-section-icon" style="background:#ede9fe"><i class="fas fa-users-cog text-purple"></i></div>
                <div><div class="settings-section-title">الفنيين</div></div>
            </div>
            <div class="settings-section-body">
                <div class="flex gap-2 mb-4"><input class="input-field" id="new-technician" placeholder="اسم الفني الجديد..."><button class="btn btn-primary" onclick="window.addTechnician()"><i class="fas fa-plus"></i> إضافة</button></div>
                <div id="technicians-list">${globalTechnicians.map((t,i)=>`<div class="flex justify-between items-center bg-gray-50 rounded-xl p-3 mb-2"><span class="font-medium">${t}</span><button class="btn-icon text-danger" onclick="window.removeTechnician(${i})"><i class="fas fa-trash"></i></button></div>`).join('')||'<p class="text-sm text-muted">لا يوجد فنيين</p>'}</div>
            </div>
        </div>
        
        <button class="btn btn-primary w-full mt-4" onclick="window.saveSettings()"><i class="fas fa-save"></i> حفظ جميع الإعدادات</button>
    `;
}

async function handleSettingsImageChange(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        const dataUrl = e.target.result;
        document.getElementById('settings-shop-preview').src = dataUrl;
        document.getElementById('settings-shop-preview').style.display = 'block';
        document.getElementById('sidebar-shop-logo-container').classList.add('hidden');
        const img = document.getElementById('sidebar-shop-logo-img');
        img.classList.remove('hidden');
        img.src = dataUrl;
        globalSettings.shop_image = dataUrl;
        try { await setDoc(doc(db, "settings", ownerId), { shop_image: dataUrl }, { merge: true }); } catch(e) {}
    };
    reader.readAsDataURL(file);
}

function addTechnician() {
    const input = document.getElementById('new-technician');
    if (input?.value.trim()) {
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
    if (list) list.innerHTML = globalTechnicians.map((t, i) => 
        `<div class="flex justify-between items-center bg-gray-50 rounded-xl p-3 mb-2"><span class="font-medium">${t}</span><button class="btn-icon text-danger" onclick="window.removeTechnician(${i})"><i class="fas fa-trash"></i></button></div>`
    ).join('') || '<p class="text-sm text-muted">لا يوجد فنيين</p>';
}

function updateTechSelects() {
    const sel = document.getElementById('repair-technician');
    if (sel) sel.innerHTML = globalTechnicians.map(t => `<option value="${t}">${t}</option>`).join('');
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
        updateSidebarShopDisplay();
        alert('✅ تم حفظ الإعدادات بنجاح');
    } catch (e) { console.error(e); }
}

// ================================
// تأكيد الحذف
// ================================
function confirmDelete(type, id) {
    deleteTarget = { type, id };
    const labels = { repair: 'أمر الصيانة', part: 'قطعة الغيار', expense: 'المصروف', wallet: 'المحفظة', subscription: 'الاشتراك' };
    let name = '';
    if (type === 'repair') name = globalRepairs.find(i => i.id === id)?.device_name || '';
    if (type === 'part') name = globalParts.find(i => i.id === id)?.name || '';
    if (type === 'expense') name = globalExpenses.find(i => i.id === id)?.title || '';
    if (type === 'wallet') name = globalWallets.find(i => i.id === id)?.name || '';
    if (type === 'subscription') name = globalSubscriptions.find(i => i.id === id)?.customer_name || '';
    document.getElementById('delete-message').textContent = `هل أنت متأكد من حذف "${name}"؟ لا يمكن التراجع عن هذا الإجراء.`;
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
        if (type === 'wallet') await deleteDoc(doc(db, "wallets", id));
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
    } catch (e) { console.error(e); }
}

// ================================
// تعريض جميع الدوال للنطاق العام
// ================================
window.formatCurrency = formatCurrency;
window.switchTab = switchTab;
window.logout = logout;
window.openRepairForm = openRepairForm;
window.closeRepairForm = closeRepairForm;
window.saveRepairForm = saveRepairForm;
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
window.addPartFromInventory = addPartFromInventory;
window.removeRepairPart = removeRepairPart;
window.handleRepairImages = handleRepairImages;
window.removeRepairImage = removeRepairImage;
window.handleShopLogoUpload = handleShopLogoUpload;
window.handleSettingsImageChange = handleSettingsImageChange;
window.viewWalletTransactions = viewWalletTransactions;
window.toggleUserApproval = toggleUserApproval;
window.loadRepairsTable = loadRepairsTable;
window.loadInventoryTable = loadInventoryTable;
window.loadExpensesTable = loadExpensesTable;
window.loadCustomersTable = loadCustomersTable;
window.loadWallets = loadWallets;
window.loadSubscriptions = loadSubscriptions;

// ================================
// بدء التطبيق
// ================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
