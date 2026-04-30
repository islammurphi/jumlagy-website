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
// عرض دوال مساعدة
// ================================
window.showModal = function(id) { const el = document.getElementById(id); if (el) el.classList.add('show'); };
window.hideModal = function(id) { const el = document.getElementById(id); if (el) el.classList.remove('show'); };

// ================================
// المتغيرات العامة
// ================================
let ownerId = null, deleteTarget = null, charts = {};
let globalRepairs = [], globalParts = [], globalExpenses = [], globalWallets = [], globalTransactions = [], globalSubscriptions = [], globalUsers = [], globalSettings = {}, globalTechnicians = ['عان', 'تحن', 'قنب'];

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
    const overlay = document.getElementById('loading-overlay');
    
    const session = JSON.parse(localStorage.getItem('jumlagy_session'));
    if (!session || !session.uid) { window.location.href = 'login.html'; return; }
    
    ownerId = session.uid;
    
    // تحديث UI
    const userName = document.getElementById('sidebar-user-name');
    const userRole = document.getElementById('sidebar-user-role');
    const userPhoto = document.getElementById('sidebar-user-photo');
    const currentDate = document.getElementById('current-date');
    if (userName) userName.textContent = session.name || 'مستخدم';
    if (userRole) userRole.textContent = session.role === 'admin' ? 'مدير النظام' : `مشترك - ${session.plan || ''}`;
    if (userPhoto) userPhoto.src = session.photo || '';
    if (currentDate) currentDate.textContent = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    const isAdmin = session.role === 'admin';
    const subsLink = document.querySelector('[data-tab="subscriptions"]');
    if (subsLink) subsLink.style.display = isAdmin ? 'flex' : 'none';
    const usersCard = document.getElementById('users-manager-card');
    if (usersCard) usersCard.style.display = isAdmin ? 'block' : 'none';
    
    // ربط الأحداث
    bindEvents();
    
    // تحميل البيانات
    await loadAllData();
    await seedDemoData();
    
    // تحميل الواجهات
    loadDashboard();
    loadSettings();
    updateInvoicePreview();
    updateAlertsCount();
    checkSubscriptionBanner();
    
    if (overlay) overlay.classList.remove('show');
}

function bindEvents() {
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            switchTab(this.getAttribute('data-tab'));
            if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
        });
    });
    
    const mt = document.getElementById('menu-toggle'); if (mt) mt.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
    const bl = document.getElementById('btn-logout'); if (bl) bl.addEventListener('click', logout);
    
    const rf = document.getElementById('repair-form'); if (rf) rf.addEventListener('submit', saveRepair);
    const pf = document.getElementById('part-form'); if (pf) pf.addEventListener('submit', savePart);
    const ef = document.getElementById('expense-form'); if (ef) ef.addEventListener('submit', saveExpense);
    const wf = document.getElementById('wallet-form'); if (wf) wf.addEventListener('submit', saveWallet);
    const tf = document.getElementById('transaction-form'); if (tf) tf.addEventListener('submit', saveTransaction);
    const sf = document.getElementById('subscription-form'); if (sf) sf.addEventListener('submit', saveSubscription);
    const db = document.getElementById('delete-confirm-btn'); if (db) db.addEventListener('click', executeDelete);
    
    ['set-shop-name','set-owner-name','set-phone','set-address'].forEach(id => {
        const el = document.getElementById(id); if (el) el.addEventListener('input', updateInvoicePreview);
    });
}

function switchTab(tab) {
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    const al = document.querySelector(`[data-tab="${tab}"]`); if (al) al.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const ct = document.getElementById('tab-' + tab); if (ct) ct.classList.add('active');
    
    const loaders = { dashboard: loadDashboard, repairs: loadRepairsTable, inventory: loadInventoryTable, expenses: loadExpensesTable, customers: loadCustomersTable, wallet: loadWallets, reports: loadReports, alerts: loadAlerts, subscriptions: loadSubscriptions };
    if (loaders[tab]) loaders[tab]();
}

async function logout() { localStorage.removeItem('jumlagy_session'); try { await signOut(auth); } catch(e) {} window.location.href = 'login.html'; }

function checkSubscriptionBanner() {
    const session = JSON.parse(localStorage.getItem('jumlagy_session'));
    if (!session || !session.end_date || session.role === 'admin') return;
    const banner = document.getElementById('subscription-banner'); if (!banner) return;
    const endDate = new Date(session.end_date), today = new Date();
    const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) { banner.className = 'subscription-banner danger'; banner.innerHTML = `⛔ انتهت صلاحية اشتراكك.`; banner.classList.remove('hidden'); }
    else if (daysLeft <= 7) { banner.className = 'subscription-banner warning'; banner.innerHTML = `⚠️ متبقي ${daysLeft} أيام على انتهاء اشتراكك.`; banner.classList.remove('hidden'); }
    else { banner.classList.add('hidden'); }
}

// ================================
// تحميل البيانات
// ================================
async function loadAllData() {
    if (!ownerId) return;
    try {
        const [rs, ps, es, ws, ts, ss, sd] = await Promise.all([
            getDocs(query(collection(db, "repairs"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "parts"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "expenses"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "wallets"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "transactions"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "subscriptions"), where("ownerId", "==", ownerId))),
            getDoc(doc(db, "settings", ownerId)),
        ]);
        globalRepairs = rs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.receive_date || 0) - new Date(a.receive_date || 0));
        globalParts = ps.docs.map(d => ({ id: d.id, ...d.data() }));
        globalExpenses = es.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        globalWallets = ws.docs.map(d => ({ id: d.id, ...d.data() }));
        globalTransactions = ts.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        globalSubscriptions = ss.docs.map(d => ({ id: d.id, ...d.data() }));
        if (sd.exists()) { globalSettings = sd.data(); globalTechnicians = globalSettings.technicians || ['عان', 'تحن', 'قنب']; }
        else { globalSettings = { shop_name: 'Jumlagy', owner_name: 'اسم حسن', phone: '01207696202', address: 'المقطم', warranty_days: 30, warranty_notes: 'ضمان 30 يوم', language: 'ar', technicians: globalTechnicians }; await setDoc(doc(db, "settings", ownerId), globalSettings); }
        const session = JSON.parse(localStorage.getItem('jumlagy_session'));
        if (session?.role === 'admin') { const us = await getDocs(collection(db, "users")); globalUsers = us.docs.map(d => ({ id: d.id, ...d.data() })); }
    } catch (e) { console.error(e); }
}

async function seedDemoData() {
    if (!ownerId || globalRepairs.length > 0) return;
    const dr = [
        { device_name: 'iPhone 14 Pro Max', customer_name: 'أحمد محمد', customer_phone: '01001234567', technician: 'عان', status: 'تم_التسليم', repair_price: 2500, technician_fee: 500, spare_part_name: 'شاشة OLED', spare_part_cost: 1500, receive_date: '2026-04-01', delivery_date: '2026-04-03', device_issue: 'شاشة مكسورة', notes: 'تم تغيير الشاشة', ownerId },
        { device_name: 'Samsung S24 Ultra', customer_name: 'محمود علي', customer_phone: '01007654321', technician: 'تحن', status: 'قيد_الصيانة', repair_price: 1800, technician_fee: 300, spare_part_name: 'بطارية', spare_part_cost: 800, receive_date: '2026-04-20', device_issue: 'بطارية ضعيفة', notes: 'انتظار قطعة', ownerId },
        { device_name: 'iPad Air 5', customer_name: 'سارة حسن', customer_phone: '01001112233', technician: 'قنب', status: 'جاهز', repair_price: 1200, technician_fee: 250, spare_part_name: 'شاحن', spare_part_cost: 300, receive_date: '2026-04-18', delivery_date: '2026-04-22', device_issue: 'لا يشحن', notes: 'تم الإصلاح', ownerId },
    ];
    const dp = [
        { name: 'شاشة iPhone 14', category: 'شاشات', purchase_price: 1200, selling_price: 2500, quantity: 5, min_quantity: 2, supplier: 'مورد الشاشات', ownerId },
        { name: 'بطارية Samsung', category: 'بطاريات', purchase_price: 300, selling_price: 800, quantity: 10, min_quantity: 3, supplier: 'مورد البطاريات', ownerId },
    ];
    const de = [
        { title: 'إيجار المحل', category: 'إيجار', amount: 3000, date: '2026-04-01', notes: 'إيجار أبريل', ownerId },
        { title: 'فاتورة الكهرباء', category: 'كهرباء', amount: 450, date: '2026-04-05', notes: '', ownerId },
    ];
    try { for (const r of dr) await addDoc(collection(db, "repairs"), r); for (const p of dp) await addDoc(collection(db, "parts"), p); for (const e of de) await addDoc(collection(db, "expenses"), e); await loadAllData(); loadDashboard(); } catch (e) { console.error(e); }
}

// ================================
// إدارة المستخدمين
// ================================
function loadUsersManager() {
    const session = JSON.parse(localStorage.getItem('jumlagy_session'));
    if (session?.role !== 'admin') { const uc = document.getElementById('users-manager-card'); if (uc) uc.style.display = 'none'; return; }
    const c = document.getElementById('users-manager'); if (!c) return;
    c.innerHTML = `
        <div class="search-box mb-3"><i class="fas fa-search"></i><input type="text" class="input-field" placeholder="إيميل المستخدم الجديد..."></div>
        <div class="space-y-2">
            ${globalUsers.length > 0 ? globalUsers.map(u => `
                <div class="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2">
                    <div><span class="font-medium text-sm">${u.fullName || u.name || u.email}</span><span class="text-xs text-gray-500 block">${u.email}</span></div>
                    <div class="flex items-center gap-2">
                        <span class="badge ${u.role === 'admin' ? 'badge-blue' : u.isApproved ? 'badge-green' : 'badge-red'} text-xs">${u.role === 'admin' ? 'مدير' : u.isApproved ? 'مفعل' : 'معلق'}</span>
                        ${u.role !== 'admin' ? `<button class="btn-xs ${u.isApproved ? 'btn-danger' : 'btn-primary'}" onclick="toggleUserApproval('${u.id}', ${u.isApproved})">${u.isApproved ? 'حظر' : 'تفعيل'}</button>` : ''}
                    </div>
                </div>`).join('') : '<p class="text-center text-gray-400 py-6">لا يوجد مستخدمين</p>'}
        </div>`;
}
async function toggleUserApproval(userId, currentStatus) { await updateDoc(doc(db, "users", userId), { isApproved: !currentStatus, status: !currentStatus ? 'active' : 'pending' }); await loadAllData(); loadUsersManager(); alert(!currentStatus ? '✅ تم التفعيل' : '🚫 تم الحظر'); }

// ================================
// 1. لوحة التحكم - تصميم جديد
// ================================
function loadDashboard() {
    const tr = globalRepairs.reduce((s, r) => s + (Number(r.repair_price) || 0), 0);
    const tpc = globalRepairs.reduce((s, r) => s + (Number(r.spare_part_cost) || 0), 0);
    const ttf = globalRepairs.reduce((s, r) => s + (Number(r.technician_fee) || 0), 0);
    const te = globalExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const profit = tr - tpc - ttf - te;
    const iv = globalParts.reduce((s, p) => s + (Number(p.purchase_price) || 0) * (Number(p.quantity) || 0), 0);
    const co = globalRepairs.filter(r => r.status === 'تم_التسليم').length;
    const cr = globalRepairs.length > 0 ? Math.round((co / globalRepairs.length) * 100) : 0;
    const av = globalRepairs.length > 0 ? Math.round(tr / globalRepairs.length) : 0;
    
    // عداد الاشتراك
    const session = JSON.parse(localStorage.getItem('jumlagy_session'));
    let subBadge = '';
    if (session && session.role !== 'admin' && session.end_date) {
        const dl = Math.ceil((new Date(session.end_date) - new Date()) / (1000 * 60 * 60 * 24));
        if (dl <= 30) {
            subBadge = `<div class="subscription-banner ${dl <= 0 ? 'danger' : 'warning'}" style="display:block;margin-bottom:16px;">
                ⏳ ${dl > 0 ? `متبقي ${dl} يوم على انتهاء الاشتراك` : 'انتهى الاشتراك - برجاء التجديد'}
            </div>`;
        }
    }
    
    const sc = document.getElementById('stats-cards');
    if (sc) sc.innerHTML = subBadge + `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-card-icon icon-blue"><i class="fas fa-dollar-sign"></i></div><p class="stat-card-title">إجمالي الإيرادات</p><p class="stat-card-value">${formatCurrency(tr)}</p></div>
            <div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-wrench"></i></div><p class="stat-card-title">إجمالي المصروفات</p><p class="stat-card-value">${formatCurrency(tpc + ttf + te)}</p><p class="stat-card-sub">قطع: ${formatCurrency(tpc)} | فنيين: ${formatCurrency(ttf)} | تشغيل: ${formatCurrency(te)}</p></div>
            <div class="stat-card"><div class="stat-card-icon ${profit >= 0 ? 'icon-green' : 'icon-red'}"><i class="fas fa-chart-line"></i></div><p class="stat-card-title">صافي الأرباح</p><p class="stat-card-value">${formatCurrency(profit)}</p><p class="stat-card-sub">${profit >= 0 ? '✅ رابح' : '⚠️ خاسر'}</p></div>
            <div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-box"></i></div><p class="stat-card-title">قيمة المخزون</p><p class="stat-card-value">${formatCurrency(iv)}</p><p class="stat-card-sub">${globalParts.length} صنف</p></div>
            <div class="stat-card"><div class="stat-card-icon icon-cyan"><i class="fas fa-shopping-cart"></i></div><p class="stat-card-title">متوسط قيمة الطلب</p><p class="stat-card-value">${formatCurrency(av)}</p></div>
            <div class="stat-card"><div class="stat-card-icon icon-teal"><i class="fas fa-check-double"></i></div><p class="stat-card-title">معدل الإتمام</p><p class="stat-card-value">${cr}%</p><p class="stat-card-sub">${co} من ${globalRepairs.length}</p></div>
        </div>`;
    
    // المخزون
    const avl = globalParts.filter(p => !p.min_quantity || p.quantity > p.min_quantity).length;
    const low = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity && p.quantity > 0).length;
    const out = globalParts.filter(p => p.quantity === 0).length;
    
    const ist = document.getElementById('inventory-status');
    if (ist) ist.innerHTML = `
        <div class="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-200"><p class="text-2xl font-bold text-emerald-700">${avl}</p><p class="text-xs text-emerald-600">متوفر</p></div>
        <div class="bg-amber-50 rounded-xl p-3 text-center border border-amber-200"><p class="text-2xl font-bold text-amber-700">${low}</p><p class="text-xs text-amber-600">منخفض</p></div>
        <div class="bg-red-50 rounded-xl p-3 text-center border border-red-200"><p class="text-2xl font-bold text-red-700">${out}</p><p class="text-xs text-red-600">نافذ</p></div>`;
    
    const lp = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity);
    const osa = document.getElementById('out-of-stock-alerts');
    if (osa) osa.innerHTML = lp.length > 0 ? '<div class="alert alert-warning text-sm mb-2">⚠️ ' + lp.map(p => `${p.name} (${p.quantity})`).join('، ') + '</div>' : '<div class="alert alert-success text-sm">✅ جميع القطع متوفرة بكميات كافية</div>';
    
    // آخر الأوامر
    const recent = globalRepairs.slice(0, 5);
    const rr = document.getElementById('recent-repairs');
    if (rr) rr.innerHTML = recent.length ? recent.map(r => `
        <div class="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-3">
            <div><p class="font-semibold text-sm">${r.device_name || 'غير محدد'}</p><p class="text-xs text-gray-500">${r.customer_name || 'غير معروف'}</p></div>
            <div class="flex items-center gap-3">${getStatusBadge(r.status)}<span class="font-bold text-blue-600 text-sm">${formatCurrency(r.repair_price)}</span></div>
        </div>`).join('') : '<p class="text-center text-gray-400 py-6">لا توجد أوامر</p>';
    
    loadUsersManager();
    setTimeout(loadDashboardCharts, 300);
}

function loadDashboardCharts() {
    const ic = document.getElementById('incomeExpenseChart');
    if (!ic || typeof Chart === 'undefined') return;
    if (charts.income) charts.income.destroy();
    charts.income = new Chart(ic, {
        type: 'line',
        data: {
            labels: ['نوفمبر', 'ديسمبر', 'يناير', 'فبراير', 'مارس', 'أبريل'],
            datasets: [
                { label: 'الإيرادات', data: [3000, 4500, 6000, 7000, 8000, 9130], borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.06)', fill: true, tension: 0.4, borderWidth: 2 },
                { label: 'المصاريف', data: [400, 300, 500, 200, 300, 55], borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.06)', fill: true, tension: 0.4, borderWidth: 2 }
            ]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } } }, scales: { y: { ticks: { callback: v => v.toLocaleString() + ' ج.م' } } } }
    });
    
    // إخفاء رسم الحالات
    const oc = document.getElementById('ordersStatusChart');
    if (oc && oc.parentElement && oc.parentElement.parentElement) oc.parentElement.parentElement.style.display = 'none';
}

// ================================
// 2. أوامر الصيانة
// ================================
function openRepairForm(repairId = null) {
    showModal('repair-modal'); const f = document.getElementById('repair-form'); if (f) f.reset();
    const rd = document.getElementById('repair-receive-date'); if (rd) rd.value = new Date().toISOString().split('T')[0];
    updateTechSelects();
    if (repairId) {
        const r = globalRepairs.find(r => r.id === repairId);
        if (r) { document.getElementById('repair-modal-title').textContent = 'تعديل أمر صيانة'; document.getElementById('repair-id').value = r.id; document.getElementById('repair-customer-name').value = r.customer_name || ''; document.getElementById('repair-customer-phone').value = r.customer_phone || ''; document.getElementById('repair-device-name').value = r.device_name || ''; document.getElementById('repair-technician').value = r.technician || ''; document.getElementById('repair-status').value = r.status || 'قيد_الصيانة'; document.getElementById('repair-price').value = r.repair_price || 0; document.getElementById('repair-tech-fee').value = r.technician_fee || 0; document.getElementById('repair-part-name').value = r.spare_part_name || ''; document.getElementById('repair-part-cost').value = r.spare_part_cost || 0; document.getElementById('repair-receive-date').value = r.receive_date || ''; document.getElementById('repair-delivery-date').value = r.delivery_date || ''; document.getElementById('repair-issue').value = r.device_issue || ''; document.getElementById('repair-notes').value = r.notes || ''; }
    } else { document.getElementById('repair-modal-title').textContent = 'أمر صيانة جديد'; document.getElementById('repair-id').value = ''; }
}
function closeRepairForm() { hideModal('repair-modal'); }

async function saveRepair(e) {
    e.preventDefault(); showLoading();
    const id = document.getElementById('repair-id').value;
    const data = { device_name: document.getElementById('repair-device-name').value, customer_name: document.getElementById('repair-customer-name').value, customer_phone: document.getElementById('repair-customer-phone').value, technician: document.getElementById('repair-technician').value, status: document.getElementById('repair-status').value, repair_price: Number(document.getElementById('repair-price').value) || 0, technician_fee: Number(document.getElementById('repair-tech-fee').value) || 0, spare_part_name: document.getElementById('repair-part-name').value, spare_part_cost: Number(document.getElementById('repair-part-cost').value) || 0, receive_date: document.getElementById('repair-receive-date').value, delivery_date: document.getElementById('repair-delivery-date').value || null, device_issue: document.getElementById('repair-issue').value, notes: document.getElementById('repair-notes').value, ownerId };
    try { if (id) await updateDoc(doc(db, "repairs", id), data); else await addDoc(collection(db, "repairs"), data); await loadAllData(); closeRepairForm(); loadRepairsTable(); loadDashboard(); updateAlertsCount(); } catch (e) { console.error(e); } hideLoading();
}

async function quickStatusChange(repairId, newStatus) { await updateDoc(doc(db, "repairs", repairId), { status: newStatus }); await loadAllData(); loadRepairsTable(); loadDashboard(); }

async function printRepairInvoice(repairId) {
    const r = globalRepairs.find(r => r.id === repairId); if (!r) return;
    const w = window.open('', '_blank', 'width=700,height=800');
    w.document.write(`<html dir=rtl><head><title>فاتورة</title><style>@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap');body{font-family:Tajawal;padding:30px}h1{color:#2563eb}hr{border:1px solid #e2e8f0;margin:16px 0}.total{font-size:20px;color:#2563eb;font-weight:800;text-align:center;margin:20px 0}@media print{body{padding:10px}}</style></head><body><h1>${globalSettings.shop_name||'Jumlagy'}</h1><p>📞 ${globalSettings.phone||''}</p><hr><p><b>العميل:</b> ${r.customer_name} | <b>الجهاز:</b> ${r.device_name}</p><p><b>الفني:</b> ${r.technician||'—'} | <b>التاريخ:</b> ${r.receive_date||'—'}</p><p><b>المشكلة:</b> ${r.device_issue||'—'}</p>${r.spare_part_name?`<p><b>قطع الغيار:</b> ${r.spare_part_name}</p>`:''}<div class=total>💰 ${formatCurrency(r.repair_price)}</div><p style=margin-top:40px>توقيع العميل: _______________</p><script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
}

function loadRepairsTable() {
    const s = (document.getElementById('repair-search')?.value || '').toLowerCase(), f = document.getElementById('repair-filter')?.value || 'all';
    let fl = globalRepairs.filter(r => (!s || r.device_name?.toLowerCase().includes(s) || r.customer_name?.toLowerCase().includes(s)) && (f === 'all' || r.status === f));
    const ce = document.getElementById('repairs-count'); if (ce) ce.textContent = `${globalRepairs.length} أمر صيانة`;
    const ct = document.getElementById('repairs-table-container');
    if (ct) ct.innerHTML = `<div class="table-responsive"><table><thead><tr><th>الجهاز</th><th>العميل</th><th>الفني</th><th>الحالة</th><th>السعر</th><th>تاريخ الاستلام</th><th>إجراءات</th></tr></thead><tbody>${fl.length ? fl.map(r => `<tr>
        <td class="font-semibold">${r.device_name || '-'}</td><td>${r.customer_name || '-'}<br><span class="text-xs text-gray-400">${r.customer_phone || ''}</span></td><td>${r.technician || '-'}</td>
        <td><select class="status-select" onchange="quickStatusChange('${r.id}', this.value)"><option value="قيد_الصيانة" ${r.status === 'قيد_الصيانة' ? 'selected' : ''}>قيد الصيانة</option><option value="جاهز" ${r.status === 'جاهز' ? 'selected' : ''}>جاهز للتسليم</option><option value="تم_التسليم" ${r.status === 'تم_التسليم' ? 'selected' : ''}>تم التسليم</option></select></td>
        <td class="font-bold text-blue-600">${formatCurrency(r.repair_price)}</td><td class="text-sm">${r.receive_date || '-'}</td>
        <td><div class="flex gap-1"><button class="btn-icon" onclick="openRepairForm('${r.id}')"><i class="fas fa-pen"></i></button><button class="btn-icon" onclick="printRepairInvoice('${r.id}')" ${r.status === 'قيد_الصيانة' ? 'style="display:none"' : ''}><i class="fas fa-print"></i></button><button class="btn-icon text-red" onclick="confirmDelete('repair','${r.id}')"><i class="fas fa-trash"></i></button></div></td></tr>`).join('') : '<tr><td colspan="7" class="text-center py-6 text-gray-400">لا توجد أوامر</td></tr>'}</tbody></table></div>`;
}

function openBarcodeScanner() { alert('خاصية مسح الباركود قيد التطوير.'); }

// ================================
// 3. المخزون
// ================================
function openPartForm(partId = null) { showModal('part-modal'); document.getElementById('part-form').reset(); if (partId) { const p = globalParts.find(p => p.id === partId); if (p) { document.getElementById('part-modal-title').textContent = 'تعديل قطعة غيار'; document.getElementById('part-id').value = p.id; document.getElementById('part-name').value = p.name || ''; document.getElementById('part-category').value = p.category || 'بطاريات'; document.getElementById('part-purchase-price').value = p.purchase_price || 0; document.getElementById('part-selling-price').value = p.selling_price || 0; document.getElementById('part-quantity').value = p.quantity || 0; document.getElementById('part-min-quantity').value = p.min_quantity || 0; document.getElementById('part-supplier').value = p.supplier || ''; } } else { document.getElementById('part-modal-title').textContent = 'إضافة قطعة غيار'; document.getElementById('part-id').value = ''; } }
function closePartForm() { hideModal('part-modal'); }
async function savePart(e) { e.preventDefault(); showLoading(); const id = document.getElementById('part-id').value; const data = { name: document.getElementById('part-name').value, category: document.getElementById('part-category').value, purchase_price: Number(document.getElementById('part-purchase-price').value) || 0, selling_price: Number(document.getElementById('part-selling-price').value) || 0, quantity: Number(document.getElementById('part-quantity').value) || 0, min_quantity: Number(document.getElementById('part-min-quantity').value) || 0, supplier: document.getElementById('part-supplier').value, ownerId }; try { if (id) await updateDoc(doc(db, "parts", id), data); else await addDoc(collection(db, "parts"), data); await loadAllData(); closePartForm(); loadInventoryTable(); loadDashboard(); updateAlertsCount(); } catch (e) { console.error(e); } hideLoading(); }

function loadInventoryTable() {
    const s = (document.getElementById('part-search')?.value || '').toLowerCase(), fl = globalParts.filter(p => !s || p.name?.toLowerCase().includes(s) || p.category?.toLowerCase().includes(s) || p.supplier?.toLowerCase().includes(s));
    const tv = globalParts.reduce((s, p) => s + (Number(p.purchase_price) || 0) * (Number(p.quantity) || 0), 0), ti = globalParts.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    const ce = document.getElementById('inventory-count'); if (ce) ce.textContent = `${globalParts.length} صنف - ${ti} قطعة`;
    const se = document.getElementById('inventory-summary'); if (se) se.innerHTML = `<div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-box"></i></div><p class="stat-card-title">قيمة المخزون</p><p class="stat-card-value">${formatCurrency(tv)}</p></div><div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-cubes"></i></div><p class="stat-card-title">إجمالي القطع</p><p class="stat-card-value">${ti}</p></div>`;
    const ct = document.getElementById('inventory-table-container'); if (ct) ct.innerHTML = `<div class="table-responsive"><table><thead><tr><th>القطعة</th><th>التصنيف</th><th>سعر الشراء</th><th>سعر البيع</th><th>الكمية</th><th>المورد</th><th>إجراءات</th></tr></thead><tbody>${fl.length ? fl.map(p => `<tr><td class="font-semibold">${p.name || '-'}</td><td><span class="badge badge-gray">${p.category || 'أخرى'}</span></td><td>${formatCurrency(p.purchase_price)}</td><td>${p.selling_price ? formatCurrency(p.selling_price) : '-'}</td><td class="font-bold ${p.min_quantity && p.quantity <= p.min_quantity ? 'text-amber-600' : ''}">${p.quantity} ${p.min_quantity && p.quantity <= p.min_quantity ? '⚠️' : ''}</td><td>${p.supplier || '-'}</td><td><button class="btn-icon" onclick="openPartForm('${p.id}')"><i class="fas fa-pen"></i></button><button class="btn-icon text-red" onclick="confirmDelete('part','${p.id}')"><i class="fas fa-trash"></i></button></td></tr>`).join('') : '<tr><td colspan="7" class="text-center py-6 text-gray-400">لا توجد قطع</td></tr>'}</tbody></table></div>`;
}

// ================================
// 4. المصاريف
// ================================
function openExpenseForm(expenseId = null) { showModal('expense-modal'); document.getElementById('expense-form').reset(); document.getElementById('expense-date').value = new Date().toISOString().split('T')[0]; if (expenseId) { const e = globalExpenses.find(e => e.id === expenseId); if (e) { document.getElementById('expense-modal-title').textContent = 'تعديل مصروف'; document.getElementById('expense-id').value = e.id; document.getElementById('expense-title').value = e.title || ''; document.getElementById('expense-category').value = e.category || 'أخرى'; document.getElementById('expense-amount').value = e.amount || 0; document.getElementById('expense-date').value = e.date || ''; document.getElementById('expense-notes').value = e.notes || ''; } } else { document.getElementById('expense-modal-title').textContent = 'إضافة مصروف'; document.getElementById('expense-id').value = ''; } }
function closeExpenseForm() { hideModal('expense-modal'); }
async function saveExpense(e) { e.preventDefault(); showLoading(); const id = document.getElementById('expense-id').value; const data = { title: document.getElementById('expense-title').value, category: document.getElementById('expense-category').value, amount: Number(document.getElementById('expense-amount').value) || 0, date: document.getElementById('expense-date').value, notes: document.getElementById('expense-notes').value, is_recurring: false, ownerId }; try { if (id) await updateDoc(doc(db, "expenses", id), data); else await addDoc(collection(db, "expenses"), data); await loadAllData(); closeExpenseForm(); loadExpensesTable(); loadDashboard(); } catch (e) { console.error(e); } hideLoading(); }

function loadExpensesTable() {
    const s = (document.getElementById('expense-search')?.value || '').toLowerCase(), c = document.getElementById('expense-cat-filter')?.value || 'الكل';
    const fl = globalExpenses.filter(e => (!s || e.title?.toLowerCase().includes(s)) && (c === 'الكل' || e.category === c));
    const total = globalExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0), rec = globalExpenses.filter(e => e.is_recurring).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const ce = document.getElementById('expenses-count'); if (ce) ce.textContent = `${globalExpenses.length} مصروف — إجمالي: ${formatCurrency(total)}`;
    const se = document.getElementById('expenses-summary'); if (se) se.innerHTML = `<div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-receipt"></i></div><p class="stat-card-title">إجمالي المصاريف</p><p class="stat-card-value">${formatCurrency(total)}</p></div><div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-sync-alt"></i></div><p class="stat-card-title">مصاريف متكررة</p><p class="stat-card-value">${formatCurrency(rec)}</p></div>`;
    const le = document.getElementById('expenses-list'); if (le) le.innerHTML = fl.length ? fl.map(e => `<div class="card"><div class="card-body"><div class="flex justify-between items-center"><div class="flex items-center gap-3"><div class="p-2 rounded-lg bg-gray-100"><i class="fas fa-receipt text-gray-500"></i></div><div><p class="font-semibold">${e.title || 'بدون عنوان'}</p><p class="text-xs text-gray-500">${e.date || ''} · ${e.category || 'أخرى'}${e.notes ? ' — ' + e.notes : ''}</p></div></div><div class="flex items-center gap-3"><span class="font-bold text-red-600">${formatCurrency(e.amount)}</span><button class="btn-icon" onclick="openExpenseForm('${e.id}')"><i class="fas fa-pen"></i></button><button class="btn-icon text-red" onclick="confirmDelete('expense','${e.id}')"><i class="fas fa-trash"></i></button></div></div></div></div>`).join('') : '<p class="text-center text-gray-400 py-10">لا توجد مصاريف</p>';
}

// ================================
// 5. العملاء
// ================================
function loadCustomersTable() {
    const s = (document.getElementById('customer-search')?.value || '').toLowerCase();
    const map = {}; globalRepairs.forEach(r => { const k = r.customer_phone || r.customer_name; if (!map[k]) map[k] = { name: r.customer_name, phone: r.customer_phone, repairs: [], totalPaid: 0, lastDate: null }; map[k].repairs.push(r); map[k].totalPaid += (Number(r.repair_price) || 0); const d = r.receive_date ? new Date(r.receive_date) : new Date(); if (!map[k].lastDate || d > map[k].lastDate) map[k].lastDate = d; });
    let cs = Object.values(map).map((c, i) => ({ ...c, id: i, lastVisit: c.lastDate ? c.lastDate.toISOString().split('T')[0] : '-' })).sort((a, b) => (b.lastDate || 0) - (a.lastDate || 0));
    if (s) cs = cs.filter(c => c.name?.toLowerCase().includes(s) || c.phone?.includes(s));
    const tr = cs.reduce((s, c) => s + c.totalPaid, 0), tc = [...cs].sort((a, b) => b.repairs.length - a.repairs.length)[0];
    const ce = document.getElementById('customers-count'); if (ce) ce.textContent = `${cs.length} عميل مسجل`;
    const se = document.getElementById('customers-summary'); if (se) se.innerHTML = `<div class="stat-card"><div class="stat-card-icon icon-blue"><i class="fas fa-users"></i></div><p class="stat-card-title">إجمالي العملاء</p><p class="stat-card-value">${cs.length}</p></div><div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-dollar-sign"></i></div><p class="stat-card-title">إجمالي الإيرادات</p><p class="stat-card-value">${formatCurrency(tr)}</p></div>${tc ? `<div class="stat-card"><div class="stat-card-icon icon-amber"><i class="fas fa-star"></i></div><p class="stat-card-title">الأكثر تعاملاً</p><p class="stat-card-value text-lg">${tc.name}</p><p class="stat-card-sub">${tc.repairs.length} جهاز</p></div>` : ''}`;
    const le = document.getElementById('customers-list'); if (le) le.innerHTML = cs.length ? cs.map(c => `<div class="card customer-card" onclick="toggleCustomerRepairs(${c.id})"><div class="card-body"><div class="flex justify-between items-center"><div class="flex items-center gap-3"><div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><i class="fas fa-user text-blue-600"></i></div><div><p class="font-bold">${c.name || 'غير معروف'}</p><p class="text-sm text-gray-500">📞 ${c.phone || '-'}</p></div></div><div class="flex items-center gap-4"><div class="text-center"><p class="text-xs text-gray-400">عدد الأجهزة</p><p class="font-bold">${c.repairs.length}</p></div><div class="text-center"><p class="text-xs text-gray-400">إجمالي المدفوع</p><p class="font-bold text-blue-600">${formatCurrency(c.totalPaid)}</p></div><div class="text-center"><p class="text-xs text-gray-400">آخر زيارة</p><p class="text-sm">${c.lastVisit}</p></div><i class="fas fa-chevron-down text-gray-400" id="customer-chevron-${c.id}"></i></div></div><div class="customer-repairs mt-3 pt-3 hidden" id="customer-repairs-${c.id}"><p class="text-xs font-bold text-gray-500 mb-2">سجل الصيانة</p>${c.repairs.map(r => `<div class="customer-repair-item"><div class="flex justify-between items-center"><div><p class="font-semibold text-sm">${r.device_name || 'جهاز'}</p><p class="text-xs text-gray-500">${r.receive_date || ''} · ${r.technician || ''}</p></div><div class="flex items-center gap-2">${getStatusBadge(r.status)}<span class="font-bold text-blue-600">${formatCurrency(r.repair_price)}</span></div></div></div>`).join('')}</div></div></div>`).join('') : '<p class="text-center text-gray-400 py-10">لا يوجد عملاء</p>';
}
function toggleCustomerRepairs(id) { const d = document.getElementById('customer-repairs-' + id), c = document.getElementById('customer-chevron-' + id); if (d) { d.classList.toggle('hidden'); if (c) { c.classList.toggle('fa-chevron-down'); c.classList.toggle('fa-chevron-up'); } } }

// ================================
// 6. المحافظ
// ================================
function loadWallets() {
    const tb = globalWallets.reduce((s, w) => s + (Number(w.balance) || 0), 0), dt = globalWallets.reduce((s, w) => s + (Number(w.daily_used) || 0), 0), mt = globalWallets.reduce((s, w) => s + (Number(w.monthly_used) || 0), 0);
    const se = document.getElementById('wallet-summary-cards'); if (se) se.innerHTML = `<div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-wallet"></i></div><p class="stat-card-title">إجمالي الأرصدة</p><p class="stat-card-value">${formatCurrency(tb)}</p></div><div class="stat-card"><div class="stat-card-icon icon-blue"><i class="fas fa-calendar-day"></i></div><p class="stat-card-title">المستعمل اليوم</p><p class="stat-card-value">${formatCurrency(dt)}</p></div><div class="stat-card"><div class="stat-card-icon icon-amber"><i class="fas fa-calendar-alt"></i></div><p class="stat-card-title">المستعمل الشهر</p><p class="stat-card-value">${formatCurrency(mt)}</p></div><div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-university"></i></div><p class="stat-card-title">عدد المحافظ</p><p class="stat-card-value">${globalWallets.length}</p></div>`;
    const wr = document.getElementById('wallets-table-body'); if (wr) wr.innerHTML = globalWallets.length ? globalWallets.map(w => { let ls = '<span class="badge badge-green">آمن</span>'; return `<tr><td class="font-semibold">${w.name || 'غير محدد'}</td><td><span class="badge badge-blue">${walletLimits[w.type]?.label || w.type || 'غير محدد'}</span></td><td class="font-bold">${formatCurrency(w.balance)}</td><td>${formatCurrency(w.daily_limit)}</td><td>${formatCurrency(w.daily_used)}</td><td>${formatCurrency(w.monthly_limit)}</td><td>${formatCurrency(w.monthly_used)}</td><td>${ls}</td><td><button class="btn-primary btn-xs" onclick="openTransactionModal('${w.id}')"><i class="fas fa-exchange-alt"></i></button><button class="btn-icon" onclick="openWalletModal('${w.id}')"><i class="fas fa-pen"></i></button><button class="btn-danger btn-xs" onclick="confirmDelete('wallet','${w.id}')"><i class="fas fa-trash"></i></button></td></tr>`; }).join('') : '<tr><td colspan="9" class="text-center py-6 text-gray-400">لا توجد محافظ</td></tr>';
    const sorted = [...globalTransactions].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const trb = document.getElementById('wallet-transactions-body'); if (trb) trb.innerHTML = sorted.length ? sorted.slice(0, 20).map(t => { const w = globalWallets.find(w => w.id === t.wallet_id); return `<tr><td class="text-sm">${t.date || '-'}</td><td class="font-semibold">${w ? w.name : '—'}</td><td>${t.type === 'deposit' ? '<span class="badge badge-green">إيداع</span>' : '<span class="badge badge-red">سحب</span>'}</td><td class="font-bold">${t.type === 'deposit' ? '+' : '-'} ${formatCurrency(t.amount)}</td><td class="text-sm text-gray-500">${t.notes || '—'}</td><td><button class="btn-icon" onclick="editTransaction('${t.id}')"><i class="fas fa-pen"></i></button><button class="btn-icon text-red" onclick="deleteTransaction('${t.id}')"><i class="fas fa-trash"></i></button></td></tr>`; }).join('') : '<tr><td colspan="6" class="text-center py-6 text-gray-400">لا توجد عمليات</td></tr>';
}
function onWalletTypeChange() { const t = document.getElementById('wallet-type')?.value, i = document.getElementById('wallet-limits-info'); if (t && walletLimits[t] && i) { i.classList.remove('hidden'); i.innerHTML = `الحد اليومي: <strong>${walletLimits[t].daily.toLocaleString()} ج.م</strong> | الحد الشهري: <strong>${walletLimits[t].monthly.toLocaleString()} ج.م</strong> | أقصى رصيد: <strong>${walletLimits[t].max_balance.toLocaleString()} ج.م</strong>`; } else if (i) i.classList.add('hidden'); }
function openWalletModal(walletId = null) { showModal('wallet-modal'); document.getElementById('wallet-form').reset(); const li = document.getElementById('wallet-limits-info'); if (li) li.classList.add('hidden'); if (walletId) { const w = globalWallets.find(w => w.id === walletId); if (w) { document.getElementById('wallet-modal-title').textContent = 'تعديل محفظة'; document.getElementById('wallet-id').value = w.id; document.getElementById('wallet-name').value = w.name || ''; document.getElementById('wallet-phone').value = w.phone || ''; document.getElementById('wallet-type').value = w.type || ''; onWalletTypeChange(); } } else { document.getElementById('wallet-modal-title').textContent = 'إضافة محفظة'; document.getElementById('wallet-id').value = ''; } }
function closeWalletModal() { hideModal('wallet-modal'); }
async function saveWallet(e) { e.preventDefault(); const id = document.getElementById('wallet-id').value, t = document.getElementById('wallet-type').value, l = walletLimits[t] || walletLimits['vodafone']; const d = { name: document.getElementById('wallet-name').value, phone: document.getElementById('wallet-phone').value, type: t, balance: 0, daily_used: 0, monthly_used: 0, daily_limit: l.daily, monthly_limit: l.monthly, max_balance: l.max_balance, alert_threshold: Math.round(l.monthly * 0.8), ownerId }; try { if (id) { const ex = globalWallets.find(w => w.id === id); d.balance = ex?.balance || 0; d.daily_used = ex?.daily_used || 0; d.monthly_used = ex?.monthly_used || 0; await updateDoc(doc(db, "wallets", id), d); } else await addDoc(collection(db, "wallets"), d); await loadAllData(); closeWalletModal(); loadWallets(); } catch (e) { console.error(e); } }
function openTransactionModal(walletId) { showModal('transaction-modal'); document.getElementById('transaction-form').reset(); document.getElementById('transaction-wallet-id').value = walletId; const w = document.getElementById('transaction-limit-warning'); if (w) w.classList.add('hidden'); }
function closeTransactionModal() { hideModal('transaction-modal'); }
async function saveTransaction(e) { e.preventDefault(); const wid = document.getElementById('transaction-wallet-id').value, t = document.getElementById('transaction-type').value, a = parseFloat(document.getElementById('transaction-amount').value), n = document.getElementById('transaction-notes').value, w = globalWallets.find(w => w.id === wid); if (!w) return; const wd = document.getElementById('transaction-limit-warning'); if (t === 'withdraw') { if (a > (Number(w.balance) || 0)) { if (wd) { wd.textContent = '❌ الرصيد غير كافي.'; wd.classList.remove('hidden'); } return; } } try { if (t === 'withdraw') await updateDoc(doc(db, "wallets", wid), { balance: Number(w.balance) - a, daily_used: Number(w.daily_used) + a, monthly_used: Number(w.monthly_used) + a }); else await updateDoc(doc(db, "wallets", wid), { balance: Number(w.balance) + a }); await addDoc(collection(db, "transactions"), { wallet_id: wid, type: t, amount: a, date: new Date().toISOString().split('T')[0], notes: n, ownerId }); await loadAllData(); closeTransactionModal(); loadWallets(); } catch (e) { console.error(e); } }
async function editTransaction(tid) { const t = globalTransactions.find(t => t.id === tid); if (!t) return; const na = prompt('المبلغ الجديد:', t.amount); if (na === null) return; const nn = prompt('ملاحظات:', t.notes || ''); if (nn === null) return; const w = globalWallets.find(w => w.id === t.wallet_id); if (w) { const oa = Number(t.amount), nan = Number(na); if (t.type === 'withdraw') await updateDoc(doc(db, "wallets", t.wallet_id), { balance: Number(w.balance) + oa - nan }); else await updateDoc(doc(db, "wallets", t.wallet_id), { balance: Number(w.balance) - oa + nan }); } await updateDoc(doc(db, "transactions", tid), { amount: Number(na), notes: nn }); await loadAllData(); loadWallets(); alert('✅ تم التعديل'); }
async function deleteTransaction(tid) { if (!confirm('حذف العملية؟')) return; const t = globalTransactions.find(t => t.id === tid); if (t) { const w = globalWallets.find(w => w.id === t.wallet_id); if (w) { if (t.type === 'withdraw') await updateDoc(doc(db, "wallets", t.wallet_id), { balance: Number(w.balance) + Number(t.amount) }); else await updateDoc(doc(db, "wallets", t.wallet_id), { balance: Number(w.balance) - Number(t.amount) }); } } await deleteDoc(doc(db, "transactions", tid)); await loadAllData(); loadWallets(); alert('✅ تم الحذف'); }

// ================================
// 7. التقارير
// ================================
function loadReports() {
    const tr = globalRepairs.reduce((s, r) => s + (Number(r.repair_price) || 0), 0), tpc = globalRepairs.reduce((s, r) => s + (Number(r.spare_part_cost) || 0), 0), ttf = globalRepairs.reduce((s, r) => s + (Number(r.technician_fee) || 0), 0), te = globalExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0), profit = tr - tpc - ttf - te;
    const co = globalRepairs.filter(r => r.status === 'تم_التسليم').length, cr = globalRepairs.length > 0 ? Math.round((co / globalRepairs.length) * 100) : 0, av = globalRepairs.length > 0 ? Math.round(tr / globalRepairs.length) : 0;
    const ke = document.getElementById('reports-kpi'); if (ke) ke.innerHTML = `<div class="stats-grid"><div class="stat-card"><p class="stat-card-title">إجمالي الإيرادات</p><p class="stat-card-value">${formatCurrency(tr)}</p><p class="stat-card-sub">${globalRepairs.length} عملية</p></div><div class="stat-card"><p class="stat-card-title">ربح الصيانة</p><p class="stat-card-value">${formatCurrency(tr - tpc - ttf)}</p></div><div class="stat-card"><p class="stat-card-title">المصاريف التشغيلية</p><p class="stat-card-value">${formatCurrency(te)}</p></div><div class="stat-card"><p class="stat-card-title">صافي الربح</p><p class="stat-card-value">${formatCurrency(profit)}</p></div><div class="stat-card"><p class="stat-card-title">متوسط قيمة الطلب</p><p class="stat-card-value">${formatCurrency(av)}</p></div><div class="stat-card"><p class="stat-card-title">معدل الإتمام</p><p class="stat-card-value">${cr}%</p></div></div>`;
    const be = document.getElementById('profit-breakdown'); if (be) be.innerHTML = `<p class="font-bold text-teal-800 mb-3">تفصيل صافي الربح</p><div class="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm"><div class="bg-white rounded-lg p-3"><span class="text-xs text-gray-500">الإيرادات</span><p class="font-bold text-blue-600">${formatCurrency(tr)}</p></div><div class="bg-white rounded-lg p-3"><span class="text-xs text-gray-500">قطع الغيار</span><p class="font-bold text-purple-600">- ${formatCurrency(tpc)}</p></div><div class="bg-white rounded-lg p-3"><span class="text-xs text-gray-500">أجور الفنيين</span><p class="font-bold text-amber-600">- ${formatCurrency(ttf)}</p></div><div class="bg-white rounded-lg p-3"><span class="text-xs text-gray-500">مصاريف تشغيلية</span><p class="font-bold text-red-600">- ${formatCurrency(te)}</p></div><div class="bg-teal-50 rounded-lg p-3 border-2 border-teal-300"><span class="text-xs text-gray-500">= صافي الربح</span><p class="font-bold text-teal-700">${formatCurrency(profit)}</p></div></div>`;
    const tm = {}; globalRepairs.forEach(r => { if (!r.technician) return; if (!tm[r.technician]) tm[r.technician] = { name: r.technician, orders: 0, revenue: 0, completed: 0 }; tm[r.technician].orders++; tm[r.technician].revenue += (Number(r.repair_price) || 0); if (r.status === 'تم_التسليم') tm[r.technician].completed++; });
    const tp = document.getElementById('technician-performance'); if (tp) tp.innerHTML = Object.values(tm).length ? Object.values(tm).map((t, i) => `<div class="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 mb-2"><span class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs font-bold text-blue-600">${i + 1}</span><div class="flex-1"><p class="font-semibold">${t.name}</p><p class="text-xs text-gray-500">${t.completed} مكتمل من ${t.orders}</p></div><div class="text-sm text-gray-500">${t.orders} عمليات</div><div class="font-bold text-blue-600">${formatCurrency(t.revenue)}</div></div>`).join('') : '<p class="text-gray-400 text-center py-4">لا توجد بيانات</p>';
    const cm = {}; globalRepairs.forEach(r => { if (!r.customer_name) return; if (!cm[r.customer_name]) cm[r.customer_name] = { name: r.customer_name, total: 0, orders: 0 }; cm[r.customer_name].total += (Number(r.repair_price) || 0); cm[r.customer_name].orders++; });
    const tc = document.getElementById('top-customers'); if (tc) tc.innerHTML = Object.values(cm).length ? Object.values(cm).sort((a, b) => b.total - a.total).slice(0, 8).map((c, i) => `<div class="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 mb-2"><span class="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center text-xs font-bold text-amber-600">${i + 1}</span><div class="flex-1"><p class="font-semibold text-sm">${c.name}</p></div><div class="font-bold text-blue-600 text-sm">${formatCurrency(c.total)}</div><div class="text-xs text-gray-500">${c.orders} طلب</div></div>`).join('') : '<p class="text-gray-400 text-center py-4">لا توجد بيانات</p>';
    const dm = {}; globalRepairs.forEach(r => { if (!r.device_name) return; if (!dm[r.device_name]) dm[r.device_name] = { name: r.device_name, count: 0 }; dm[r.device_name].count++; });
    const td = document.getElementById('top-devices'); if (td) td.innerHTML = Object.values(dm).length ? Object.values(dm).sort((a, b) => b.count - a.count).slice(0, 8).map((d, i) => `<div class="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 mb-2"><span class="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-xs font-bold text-purple-600">${i + 1}</span><div class="flex-1"><p class="font-semibold text-sm">${d.name}</p></div><div class="text-sm font-bold">${d.count} جهاز</div></div>`).join('') : '<p class="text-gray-400 text-center py-4">لا توجد بيانات</p>';
}

// ================================
// 8. التنبيهات
// ================================
function updateAlertsCount() { const t = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity).length + globalRepairs.filter(r => r.status !== 'تم_التسليم' && r.delivery_date && new Date(r.delivery_date) < new Date()).length; const b = document.getElementById('alerts-count'); if (b) { b.textContent = t; b.classList.toggle('hidden', t === 0); } }
function loadAlerts() { const nw = new Date(); const all = [...globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity).map(p => ({ title: `مخزون منخفض: ${p.name}`, desc: `الكمية: ${p.quantity}`, icon: 'fa-box', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-r-amber-400' })), ...globalRepairs.filter(r => r.delivery_date && r.status !== 'تم_التسليم' && new Date(r.delivery_date) < nw).map(r => ({ title: `تأخر تسليم: ${r.device_name}`, desc: `العميل: ${r.customer_name}`, icon: 'fa-clock', color: 'text-red-600', bg: 'bg-red-50', border: 'border-r-red-500' }))]; document.getElementById('alerts-summary-text').textContent = all.length > 0 ? `${all.length} تنبيه` : 'لا توجد تنبيهات'; document.getElementById('alerts-summary').innerHTML = `<div class="stat-card bg-red-50"><p class="text-xs text-gray-500">تأخر تسليم</p><p class="text-3xl font-bold text-red-600">${all.filter(a => a.bg === 'bg-red-50').length}</p></div><div class="stat-card bg-amber-50"><p class="text-xs text-gray-500">مخزون منخفض</p><p class="text-3xl font-bold text-amber-600">${all.filter(a => a.bg === 'bg-amber-50').length}</p></div>`; document.getElementById('alerts-list').innerHTML = all.length > 0 ? all.map(a => `<div class="card ${a.bg} border-r-4 ${a.border}"><div class="card-body"><div class="flex items-start gap-3"><div class="p-2 rounded-lg"><i class="fas ${a.icon} ${a.color} text-lg"></i></div><div><p class="font-bold">${a.title}</p><p class="text-sm text-gray-600">${a.desc}</p></div></div></div></div>`).join('') : '<div class="card"><div class="card-body text-center py-10"><i class="fas fa-check-circle text-emerald-500 text-4xl mb-3"></i><p class="text-lg font-bold text-emerald-700">كل شيء على ما يرام!</p></div></div>'; }

// ================================
// 9. الاشتراكات
// ================================
function loadSubscriptions() {
    globalSubscriptions.forEach(s => { if (s.status === 'نشط' && new Date(s.end_date) < new Date()) s.status = 'منتهي'; });
    const s = (document.getElementById('sub-search')?.value || '').toLowerCase(), f = document.getElementById('sub-filter')?.value || 'all';
    const active = globalSubscriptions.filter(s => s.status === 'نشط').length, expired = globalSubscriptions.filter(s => s.status === 'منتهي').length, tr = globalSubscriptions.reduce((s, sub) => s + (Number(sub.price) || 0), 0);
    const es = globalSubscriptions.filter(s => { if (s.status !== 'نشط') return false; const d = Math.ceil((new Date(s.end_date) - new Date()) / (1000 * 60 * 60 * 24)); return d <= 30 && d > 0; }).length;
    const sc = document.getElementById('subs-count-text'); if (sc) sc.textContent = `${globalSubscriptions.length} عميل مشترك`;
    const sm = document.getElementById('subscription-summary-cards'); if (sm) sm.innerHTML = `<div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-check-circle"></i></div><p class="stat-card-title">نشطة</p><p class="stat-card-value">${active}</p></div><div class="stat-card"><div class="stat-card-icon icon-blue"><i class="fas fa-dollar-sign"></i></div><p class="stat-card-title">الإيرادات</p><p class="stat-card-value">${formatCurrency(tr)}</p></div><div class="stat-card"><div class="stat-card-icon icon-amber"><i class="fas fa-exclamation-triangle"></i></div><p class="stat-card-title">تنتهي قريباً</p><p class="stat-card-value">${es}</p></div><div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-times-circle"></i></div><p class="stat-card-title">منتهية</p><p class="stat-card-value">${expired}</p></div>`;
    let fl = globalSubscriptions.filter(s => (!s || s.customer_name?.toLowerCase().includes(s) || s.customer_email?.toLowerCase().includes(s)) && (f === 'all' || s.status === f));
    const tb = document.getElementById('subscriptions-table-body'); if (tb) tb.innerHTML = fl.length ? fl.map((s, i) => { const dv = globalRepairs.filter(r => r.customer_name === s.customer_name).length; return `<tr><td class="text-xs text-gray-400">${i + 1}</td><td class="font-semibold">${s.customer_name || 'غير محدد'}</td><td class="text-sm">${s.customer_email || '-'}</td><td>${s.plan || '-'}</td><td class="font-bold text-blue-600">${formatCurrency(s.price)}</td><td class="text-sm">${s.start_date || '-'}</td><td class="text-sm">${s.end_date || '-'}</td><td>${getDaysLeft(s.end_date)}</td><td>${s.status === 'نشط' ? '<span class="badge badge-green">نشط</span>' : '<span class="badge badge-red">منتهي</span>'}</td><td class="font-bold">${dv} جهاز</td><td><div class="flex gap-1"><button class="btn-icon" onclick="openSubscriptionModal('${s.id}')" title="تعديل"><i class="fas fa-pen"></i></button>${(s.status === 'منتهي' || s.status === 'نشط') ? `<button class="btn-primary btn-xs" onclick="renewSubscription('${s.id}')"><i class="fas fa-sync-alt"></i></button>` : ''}<button class="btn-danger btn-xs" onclick="confirmDelete('subscription','${s.id}')"><i class="fas fa-trash"></i></button></div></td></tr>`; }).join('') : '<tr><td colspan="11" class="text-center py-6 text-gray-400">لا توجد اشتراكات</td></tr>';
}
function openSubscriptionModal(subId = null) {
    showModal('subscription-modal'); document.getElementById('subscription-form').reset(); document.getElementById('subscription-start-date').value = new Date().toISOString().split('T')[0];
    const sel = document.getElementById('subscription-linked-user'); if (sel) sel.innerHTML = '<option value="">اختر مستخدم</option>' + globalUsers.map(u => `<option value="${u.id}">${u.fullName || u.name || u.email} (${u.email})</option>`).join('');
    if (subId) { const s = globalSubscriptions.find(s => s.id === subId); if (s) { document.getElementById('subscription-modal-title').textContent = 'تعديل اشتراك'; document.getElementById('subscription-id').value = s.id; document.getElementById('subscription-customer-name').value = s.customer_name || ''; document.getElementById('subscription-customer-email').value = s.customer_email || ''; document.getElementById('subscription-plan').value = s.plan || 'تجريبي'; document.getElementById('subscription-price').value = s.price || 0; document.getElementById('subscription-start-date').value = s.start_date || ''; document.getElementById('subscription-end-date').value = s.end_date || ''; if (s.linked_user_id && sel) sel.value = s.linked_user_id; } }
    else { document.getElementById('subscription-modal-title').textContent = 'اشتراك جديد'; document.getElementById('subscription-id').value = ''; onSubscriptionPlanChange(); }
    // جعل تاريخ الانتهاء مفتوح للتعديل
    const edf = document.getElementById('subscription-end-date'); if (edf) edf.removeAttribute('readonly');
}
function closeSubscriptionModal() { hideModal('subscription-modal'); }
function onLinkedUserChange() { const uid = document.getElementById('subscription-linked-user')?.value; if (uid) { const u = globalUsers.find(u => u.id === uid); if (u) { document.getElementById('subscription-customer-name').value = u.fullName || u.name || ''; document.getElementById('subscription-customer-email').value = u.email || ''; } } }
function onSubscriptionPlanChange() { const p = document.getElementById('subscription-plan')?.value, sd = document.getElementById('subscription-start-date')?.value || new Date().toISOString().split('T')[0], ed = new Date(sd); if (p === 'تجريبي') ed.setDate(ed.getDate() + 3); else if (p === 'شهري') ed.setMonth(ed.getMonth() + 1); else if (p === 'سنوي') ed.setFullYear(ed.getFullYear() + 1); document.getElementById('subscription-end-date').value = ed.toISOString().split('T')[0]; }
async function saveSubscription(e) { e.preventDefault(); const id = document.getElementById('subscription-id').value; const d = { customer_name: document.getElementById('subscription-customer-name').value, customer_email: document.getElementById('subscription-customer-email').value, plan: document.getElementById('subscription-plan').value, price: Number(document.getElementById('subscription-price').value) || 0, start_date: document.getElementById('subscription-start-date').value, end_date: document.getElementById('subscription-end-date').value, status: 'نشط', linked_user_id: document.getElementById('subscription-linked-user').value || null, ownerId }; try { if (id) await updateDoc(doc(db, "subscriptions", id), d); else await addDoc(collection(db, "subscriptions"), d); if (d.linked_user_id) { await updateDoc(doc(db, "users", d.linked_user_id), { subscription: { plan: d.plan, status: 'نشط', start_date: d.start_date, end_date: d.end_date, price: d.price }, subscriptionType: d.plan, subscriptionEnd: d.end_date, isApproved: true, status: 'active' }); } await loadAllData(); closeSubscriptionModal(); loadSubscriptions(); alert('✅ تم الحفظ'); } catch (e) { console.error(e); } }
async function renewSubscription(id) { const s = globalSubscriptions.find(s => s.id === id); if (!s) return; const ne = new Date(s.end_date); if (s.plan === 'شهري') ne.setMonth(ne.getMonth() + 1); else if (s.plan === 'سنوي') ne.setFullYear(ne.getFullYear() + 1); else ne.setDate(ne.getDate() + 3); try { await updateDoc(doc(db, "subscriptions", id), { end_date: ne.toISOString().split('T')[0], status: 'نشط' }); if (s.linked_user_id) { await updateDoc(doc(db, "users", s.linked_user_id), { 'subscription.end_date': ne.toISOString().split('T')[0], 'subscription.status': 'نشط', subscriptionEnd: ne.toISOString().split('T')[0], status: 'active' }); } await loadAllData(); loadSubscriptions(); alert('✅ تم التجديد'); } catch (e) { console.error(e); } }

// ================================
// 10. الإعدادات
// ================================
function loadSettings() { document.getElementById('set-shop-name').value = globalSettings.shop_name || ''; document.getElementById('set-owner-name').value = globalSettings.owner_name || ''; document.getElementById('set-phone').value = globalSettings.phone || ''; document.getElementById('set-address').value = globalSettings.address || ''; document.getElementById('set-warranty-days').value = globalSettings.warranty_days || 30; document.getElementById('set-warranty-notes').value = globalSettings.warranty_notes || ''; renderTechnicians(); updateInvoicePreview(); }
function renderTechnicians() { const l = document.getElementById('technicians-list'); if (!l) return; l.innerHTML = globalTechnicians.length ? globalTechnicians.map((t, i) => `<div class="flex justify-between items-center bg-gray-50 rounded-lg p-3 mb-2"><span class="font-medium">${t}</span><button class="btn-icon text-red" onclick="removeTechnician(${i})"><i class="fas fa-trash"></i></button></div>`).join('') : '<p class="text-sm text-gray-500">لم تضف فنيين بعد</p>'; }
function addTechnician() { const i = document.getElementById('new-technician'); if (i && i.value.trim()) { globalTechnicians.push(i.value.trim()); i.value = ''; renderTechnicians(); updateTechSelects(); } }
function removeTechnician(idx) { globalTechnicians.splice(idx, 1); renderTechnicians(); updateTechSelects(); }
function updateTechSelects() { const s = document.getElementById('repair-technician'); if (s) s.innerHTML = globalTechnicians.map(t => `<option value="${t}">${t}</option>`).join(''); }
function updateInvoicePreview() { document.getElementById('preview-shop-name').textContent = document.getElementById('set-shop-name')?.value || 'اسم المحل'; document.getElementById('preview-owner').textContent = document.getElementById('set-owner-name')?.value || ''; document.getElementById('preview-phone').textContent = document.getElementById('set-phone')?.value ? '📞 ' + document.getElementById('set-phone').value : ''; document.getElementById('preview-address').textContent = document.getElementById('set-address')?.value ? '📍 ' + document.getElementById('set-address').value : ''; }
async function saveSettings() { globalSettings.shop_name = document.getElementById('set-shop-name').value; globalSettings.owner_name = document.getElementById('set-owner-name').value; globalSettings.phone = document.getElementById('set-phone').value; globalSettings.address = document.getElementById('set-address').value; globalSettings.warranty_days = parseInt(document.getElementById('set-warranty-days').value) || 30; globalSettings.warranty_notes = document.getElementById('set-warranty-notes').value; globalSettings.technicians = globalTechnicians; await setDoc(doc(db, "settings", ownerId), globalSettings); alert('✅ تم الحفظ'); }

// ================================
// تأكيد الحذف
// ================================
function confirmDelete(type, id) { deleteTarget = { type, id }; const labels = { repair: 'أمر الصيانة', part: 'قطعة الغيار', expense: 'المصروف', wallet: 'المحفظة', subscription: 'الاشتراك', user: 'المستخدم' }; let name = ''; if (type === 'repair') name = globalRepairs.find(i => i.id === id)?.device_name; if (type === 'part') name = globalParts.find(i => i.id === id)?.name; if (type === 'expense') name = globalExpenses.find(i => i.id === id)?.title; if (type === 'wallet') name = globalWallets.find(i => i.id === id)?.name; if (type === 'subscription') name = globalSubscriptions.find(i => i.id === id)?.customer_name; if (type === 'user') name = globalUsers.find(i => i.id === id)?.email; document.getElementById('delete-message').textContent = `هل أنت متأكد من حذف ${labels[type] || ''} "${name || ''}"؟`; showModal('delete-modal'); }
function closeDeleteModal() { hideModal('delete-modal'); deleteTarget = null; }
async function executeDelete() { if (!deleteTarget) return; const { type, id } = deleteTarget; try { if (type === 'repair') await deleteDoc(doc(db, "repairs", id)); if (type === 'part') await deleteDoc(doc(db, "parts", id)); if (type === 'expense') await deleteDoc(doc(db, "expenses", id)); if (type === 'wallet') { await deleteDoc(doc(db, "wallets", id)); } if (type === 'subscription') await deleteDoc(doc(db, "subscriptions", id)); if (type === 'user') await deleteDoc(doc(db, "users", id)); await loadAllData(); closeDeleteModal(); loadDashboard(); updateAlertsCount(); const at = document.querySelector('.tab-content.active')?.id?.replace('tab-', ''); if (at === 'repairs') loadRepairsTable(); if (at === 'inventory') loadInventoryTable(); if (at === 'expenses') loadExpensesTable(); if (at === 'wallet') loadWallets(); if (at === 'subscriptions') loadSubscriptions(); } catch (e) { console.error(e); } }

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
window.editTransaction = editTransaction;
window.deleteTransaction = deleteTransaction;

// ================================
// بدء التطبيق
// ================================
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initApp); } else { initApp(); }
