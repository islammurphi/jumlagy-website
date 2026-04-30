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

window.showModal = function(id) { const el = document.getElementById(id); if (el) el.classList.add('show'); };
window.hideModal = function(id) { const el = document.getElementById(id); if (el) el.classList.remove('show'); };

let ownerId = null, isReordering = false, deleteTarget = null, charts = {};
let globalRepairs = [], globalParts = [], globalExpenses = [], globalWallets = [], globalTransactions = [], globalSubscriptions = [], globalUsers = [], globalSettings = {}, globalTechnicians = ['علي', 'محمد', 'أحمد'];

const walletLimits = {
    'vodafone':   { daily: 60000, monthly: 200000, max_balance: 100000, label: 'فودافون كاش' },
    'orange':     { daily: 60000, monthly: 200000, max_balance: 100000, label: 'أورانج كاش' },
    'etisalat':   { daily: 60000, monthly: 200000, max_balance: 100000, label: 'اتصالات كاش' },
    'we':         { daily: 60000, monthly: 200000, max_balance: 100000, label: 'وي كاش' },
    'bank':       { daily: 60000, monthly: 200000, max_balance: 100000, label: 'محفظة بنكية' },
    'instapay':   { daily: 120000, monthly: 400000, max_balance: 999999999, label: 'إنستاباي' },
};

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

async function initApp() {
    showLoading();
    
    const session = JSON.parse(localStorage.getItem('jumlagy_session'));
    if (!session || !session.uid) { window.location.href = 'login.html'; return; }
    
    ownerId = session.uid;
    
    document.getElementById('sidebar-user-name').textContent = session.name || 'مستخدم';
    document.getElementById('sidebar-user-role').textContent = session.role === 'admin' ? 'مدير النظام' : `مشترك - ${session.plan || ''}`;
    document.getElementById('sidebar-user-photo').src = session.photo || '';
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    const isAdmin = session.role === 'admin';
    const subsLink = document.querySelector('[data-tab="subscriptions"]');
    if (subsLink) subsLink.style.display = isAdmin ? 'flex' : 'none';
    const usersCard = document.getElementById('users-manager-card');
    if (usersCard) usersCard.style.display = isAdmin ? 'block' : 'none';
    
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const tab = this.getAttribute('data-tab');
            switchTab(tab);
            if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
        });
    });
    
    document.getElementById('menu-toggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
    document.getElementById('btn-logout').addEventListener('click', logout);
    
    document.getElementById('repair-form').addEventListener('submit', saveRepair);
    document.getElementById('part-form').addEventListener('submit', savePart);
    document.getElementById('expense-form').addEventListener('submit', saveExpense);
    document.getElementById('wallet-form').addEventListener('submit', saveWallet);
    document.getElementById('transaction-form').addEventListener('submit', saveTransaction);
    document.getElementById('subscription-form').addEventListener('submit', saveSubscription);
    document.getElementById('delete-confirm-btn').addEventListener('click', executeDelete);
    
    document.getElementById('set-shop-name').addEventListener('input', updateInvoicePreview);
    document.getElementById('set-owner-name').addEventListener('input', updateInvoicePreview);
    document.getElementById('set-phone').addEventListener('input', updateInvoicePreview);
    document.getElementById('set-address').addEventListener('input', updateInvoicePreview);
    
    await loadAllData();
    await seedDemoData();
    
    loadDashboard();
    loadSettings();
    updateInvoicePreview();
    updateAlertsCount();
    checkSubscriptionBanner();
    
    hideLoading();
}

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
    await signOut(auth);
    window.location.href = 'login.html';
}

function checkSubscriptionBanner() {
    const session = JSON.parse(localStorage.getItem('jumlagy_session'));
    if (!session || !session.end_date || session.role === 'admin') return;
    const banner = document.getElementById('subscription-banner');
    if (!banner) return;
    const endDate = new Date(session.end_date), today = new Date();
    const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) {
        banner.className = 'subscription-banner danger';
        banner.innerHTML = `⛔ انتهت صلاحية اشتراكك. <button class="btn-renew" onclick="window.location.href='login.html'">تجديد الاشتراك</button>`;
        banner.classList.remove('hidden');
    } else if (daysLeft <= 7) {
        banner.className = 'subscription-banner warning';
        banner.innerHTML = `⚠️ متبقي ${daysLeft} أيام على انتهاء اشتراكك. <button class="btn-renew" onclick="window.location.href='login.html'">تجديد الآن</button>`;
        banner.classList.remove('hidden');
    } else { banner.classList.add('hidden'); }
}

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
        if (settingsDoc.exists()) { globalSettings = settingsDoc.data(); globalTechnicians = globalSettings.technicians || ['علي', 'محمد', 'أحمد']; }
        else { globalSettings = { shop_name: 'Jumlagy', owner_name: 'اسم حسن', phone: '01207696202', address: 'المقطم', warranty_days: 30, warranty_notes: 'ضمان 30 يوم', language: 'ar', technicians: globalTechnicians }; await setDoc(doc(db, "settings", ownerId), globalSettings); }
        const session = JSON.parse(localStorage.getItem('jumlagy_session'));
        if (session?.role === 'admin') { const usersSnap = await getDocs(collection(db, "users")); globalUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() })); }
    } catch (error) { console.error("خطأ:", error); }
}

async function seedDemoData() {
    if (!ownerId || globalRepairs.length > 0) return;
    const demoRepairs = [
        { device_name: 'iPhone 14 Pro Max', customer_name: 'أحمد محمد', customer_phone: '01001234567', technician: 'علي', status: 'تم_التسليم', repair_price: 2500, technician_fee: 500, spare_part_name: 'شاشة OLED', spare_part_cost: 1500, receive_date: '2026-04-01', delivery_date: '2026-04-03', device_issue: 'شاشة مكسورة', notes: 'تم تغيير الشاشة بنجاح', ownerId },
        { device_name: 'Samsung S24 Ultra', customer_name: 'محمود علي', customer_phone: '01007654321', technician: 'محمد', status: 'قيد_الصيانة', repair_price: 1800, technician_fee: 300, spare_part_name: 'بطارية', spare_part_cost: 800, receive_date: '2026-04-20', device_issue: 'بطارية ضعيفة', notes: 'انتظار قطعة الغيار', ownerId },
        { device_name: 'iPad Air 5', customer_name: 'سارة حسن', customer_phone: '01001112233', technician: 'أحمد', status: 'جاهز', repair_price: 1200, technician_fee: 250, spare_part_name: 'شاحن تايب سي', spare_part_cost: 300, receive_date: '2026-04-18', delivery_date: '2026-04-22', device_issue: 'لا يشحن', notes: 'تم إصلاح منفذ الشحن', ownerId },
    ];
    const demoParts = [
        { name: 'شاشة iPhone 14', category: 'شاشات', purchase_price: 1200, selling_price: 2500, quantity: 5, min_quantity: 2, supplier: 'مورد الشاشات', ownerId },
        { name: 'بطارية Samsung', category: 'بطاريات', purchase_price: 300, selling_price: 800, quantity: 10, min_quantity: 3, supplier: 'مورد البطاريات', ownerId },
    ];
    const demoExpenses = [
        { title: 'إيجار المحل', category: 'إيجار', amount: 3000, date: '2026-04-01', notes: 'إيجار شهر أبريل', ownerId },
        { title: 'فاتورة الكهرباء', category: 'كهرباء', amount: 450, date: '2026-04-05', notes: '', ownerId },
    ];
    try {
        for (const r of demoRepairs) await addDoc(collection(db, "repairs"), r);
        for (const p of demoParts) await addDoc(collection(db, "parts"), p);
        for (const e of demoExpenses) await addDoc(collection(db, "expenses"), e);
        await loadAllData(); loadDashboard();
    } catch (e) { console.error(e); }
}

function loadUsersManager() {
    const session = JSON.parse(localStorage.getItem('jumlagy_session'));
    if (session?.role !== 'admin') { document.getElementById('users-manager-card').style.display = 'none'; return; }
    document.getElementById('users-manager').innerHTML = `
        <div class="search-box mb-3"><i class="fas fa-search"></i><input type="text" class="input-field" placeholder="إيميل المستخدم الجديد..."></div>
        <div class="space-y-2">${globalUsers.map(u => `
            <div class="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2">
                <span class="font-medium text-sm">${u.fullName || u.name || u.email}</span>
                <span class="text-xs text-gray-500">${u.email}</span>
                <span class="badge ${u.role === 'admin' ? 'badge-blue' : u.isApproved ? 'badge-green' : 'badge-red'}">${u.role === 'admin' ? 'مدير' : u.isApproved ? 'مفعل' : 'معلق'}</span>
                ${u.role !== 'admin' ? `<button class="btn-xs ${u.isApproved ? 'btn-danger' : 'btn-primary'}" onclick="toggleUserApproval('${u.id}', ${u.isApproved})">${u.isApproved ? 'حظر' : 'تفعيل'}</button>` : ''}
            </div>`).join('') || '<p class="text-center text-gray-400 py-6">لا يوجد مستخدمين</p>'}</div>`;
}

async function toggleUserApproval(userId, currentStatus) {
    await updateDoc(doc(db, "users", userId), { isApproved: !currentStatus, status: !currentStatus ? 'active' : 'pending' });
    await loadAllData(); loadUsersManager();
    alert(!currentStatus ? '✅ تم تفعيل المستخدم' : '🚫 تم حظر المستخدم');
}

function loadDashboard() {
    const totalRevenue = globalRepairs.reduce((s, r) => s + (Number(r.repair_price) || 0), 0);
    const totalCosts = globalRepairs.reduce((s, r) => s + (Number(r.spare_part_cost) || 0) + (Number(r.technician_fee) || 0), 0) + globalExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalProfit = totalRevenue - totalCosts;
    const inventoryValue = globalParts.reduce((s, p) => s + (Number(p.purchase_price) || 0) * (Number(p.quantity) || 0), 0);
    
    document.getElementById('stats-cards').innerHTML = `
        <div class="stat-card"><div class="stat-card-icon icon-blue"><i class="fas fa-dollar-sign"></i></div><p class="stat-card-title">إجمالي الإيرادات</p><p class="stat-card-value">${formatCurrency(totalRevenue)}</p></div>
        <div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-wrench"></i></div><p class="stat-card-title">إجمالي المصروفات</p><p class="stat-card-value">${formatCurrency(totalCosts)}</p><p class="stat-card-sub">قطع: ${formatCurrency(globalRepairs.reduce((s,r)=>s+(Number(r.spare_part_cost)||0),0))} | أخرى: ${formatCurrency(globalRepairs.reduce((s,r)=>s+(Number(r.technician_fee)||0),0) + globalExpenses.reduce((s,e)=>s+(Number(e.amount)||0),0))}</p></div>
        <div class="stat-card"><div class="stat-card-icon ${totalProfit >= 0 ? 'icon-green' : 'icon-red'}"><i class="fas fa-chart-line"></i></div><p class="stat-card-title">صافي الأرباح</p><p class="stat-card-value">${formatCurrency(totalProfit)}</p><p class="stat-card-sub">${totalProfit >= 0 ? '✅ رابح' : '⚠️ خاسر'}</p></div>
        <div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-box"></i></div><p class="stat-card-title">قيمة المخزون</p><p class="stat-card-value">${formatCurrency(inventoryValue)}</p><p class="stat-card-sub">${globalParts.length} صنف</p></div>`;
    
    document.getElementById('inventory-status').innerHTML = `
        <div class="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-200"><p class="text-2xl font-bold text-emerald-700">${globalParts.filter(p=>!p.min_quantity||p.quantity>p.min_quantity).length}</p><p class="text-xs text-emerald-600">متوفر</p></div>
        <div class="bg-amber-50 rounded-xl p-3 text-center border border-amber-200"><p class="text-2xl font-bold text-amber-700">${globalParts.filter(p=>p.min_quantity&&p.quantity<=p.min_quantity&&p.quantity>0).length}</p><p class="text-xs text-amber-600">منخفض</p></div>
        <div class="bg-red-50 rounded-xl p-3 text-center border border-red-200"><p class="text-2xl font-bold text-red-700">${globalParts.filter(p=>p.quantity===0).length}</p><p class="text-xs text-red-600">نافذ</p></div>`;
    
    const lowParts = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity);
    let alertHTML = lowParts.length > 0 ? '<div class="alert alert-warning text-sm mb-2">⚠️ قطع منخفضة المخزون:</div>' + lowParts.map(p => `<div class="flex justify-between bg-amber-50 rounded-lg px-3 py-2 mb-1 text-sm"><span>${p.name}</span><span class="font-bold">${p.quantity} متبقي</span></div>`).join('') : '<div class="alert alert-success text-sm">✅ جميع القطع متوفرة بكميات كافية</div>';
    document.getElementById('out-of-stock-alerts').innerHTML = alertHTML;
    
    document.getElementById('recent-repairs').innerHTML = globalRepairs.slice(0, 5).map(r => `
        <div class="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-3">
            <div><p class="font-semibold text-sm">${r.device_name}</p><p class="text-xs text-gray-500">${r.customer_name}</p></div>
            <div class="flex items-center gap-3">${getStatusBadge(r.status)}<span class="font-bold text-blue-600 text-sm">${formatCurrency(r.repair_price)}</span></div>
        </div>`).join('') || '<p class="text-center text-gray-400 py-6">لا توجد أوامر صيانة بعد</p>';
    
    loadUsersManager();
    setTimeout(loadDashboardCharts, 300);
}

function loadDashboardCharts() {
    const ordersCtx = document.getElementById('ordersStatusChart'), incomeCtx = document.getElementById('incomeExpenseChart');
    if (!ordersCtx || !incomeCtx || typeof Chart === 'undefined') return;
    const statusCounts = { 'تم_التسليم': globalRepairs.filter(r=>r.status==='تم_التسليم').length, 'قيد_الصيانة': globalRepairs.filter(r=>r.status==='قيد_الصيانة').length, 'جاهز': globalRepairs.filter(r=>r.status==='جاهز').length };
    if (charts.orders) charts.orders.destroy();
    charts.orders = new Chart(ordersCtx, { type: 'doughnut', data: { labels: ['تم التسليم','قيد الصيانة','جاهز للتسليم'], datasets: [{ data: [statusCounts['تم_التسليم'],statusCounts['قيد_الصيانة'],statusCounts['جاهز']], backgroundColor: ['#3b82f6','#f59e0b','#10b981'], borderWidth: 0 }] }, options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Tajawal', size: 12 } } } } } });
    if (charts.income) charts.income.destroy();
    charts.income = new Chart(incomeCtx, { type: 'line', data: { labels: ['نوفمبر','ديسمبر','يناير','فبراير','مارس','أبريل'], datasets: [{ label: 'الإيرادات', data: [3000,4500,6000,7000,8000,9130], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', fill: true, tension: 0.4 }, { label: 'المصاريف', data: [400,300,500,200,300,55], borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)', fill: true, tension: 0.4 }] }, options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Tajawal', size: 12 } } } }, scales: { y: { ticks: { callback: v => v.toLocaleString() } } } } });
}

function openRepairForm(repairId = null) {
    showModal('repair-modal'); document.getElementById('repair-form').reset();
    document.getElementById('repair-receive-date').value = new Date().toISOString().split('T')[0]; updateTechSelects();
    if (repairId) {
        const r = globalRepairs.find(r => r.id === repairId);
        if (r) { document.getElementById('repair-modal-title').textContent = 'تعديل أمر صيانة'; document.getElementById('repair-id').value = r.id; document.getElementById('repair-customer-name').value = r.customer_name||''; document.getElementById('repair-device-name').value = r.device_name||''; document.getElementById('repair-technician').value = r.technician||''; document.getElementById('repair-status').value = r.status||'قيد_الصيانة'; document.getElementById('repair-price').value = r.repair_price||0; }
    } else { document.getElementById('repair-modal-title').textContent = 'أمر صيانة جديد'; document.getElementById('repair-id').value = ''; }
}
function closeRepairForm() { hideModal('repair-modal'); }

async function saveRepair(e) {
    e.preventDefault(); showLoading();
    const id = document.getElementById('repair-id').value;
    const data = { device_name: document.getElementById('repair-device-name').value, customer_name: document.getElementById('repair-customer-name').value, customer_phone: document.getElementById('repair-customer-phone').value, technician: document.getElementById('repair-technician').value, status: document.getElementById('repair-status').value, repair_price: Number(document.getElementById('repair-price').value)||0, technician_fee: Number(document.getElementById('repair-tech-fee').value)||0, spare_part_name: document.getElementById('repair-part-name').value, spare_part_cost: Number(document.getElementById('repair-part-cost').value)||0, receive_date: document.getElementById('repair-receive-date').value, delivery_date: document.getElementById('repair-delivery-date').value||null, device_issue: document.getElementById('repair-issue').value, notes: document.getElementById('repair-notes').value, ownerId };
    try { if (id) await updateDoc(doc(db,"repairs",id), data); else await addDoc(collection(db,"repairs"), data); await loadAllData(); closeRepairForm(); loadRepairsTable(); loadDashboard(); updateAlertsCount(); } catch(e){ console.error(e); } hideLoading();
}

async function quickStatusChange(repairId, newStatus) {
    await updateDoc(doc(db, "repairs", repairId), { status: newStatus });
    await loadAllData(); loadRepairsTable(); loadDashboard();
}

async function printRepairInvoice(repairId) {
    const r = globalRepairs.find(r => r.id === repairId);
    if (!r) return alert('❌ غير موجود');
    const w = window.open('','_blank','width=700,height=800');
    w.document.write(`<html dir=rtl><head><title>فاتورة</title><style>@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap');body{font-family:Tajawal;padding:30px}h1{color:#2563eb}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #eee}.total{font-size:20px;color:#2563eb;font-weight:800}@media print{body{padding:10px}}</style></head><body><h1>${globalSettings.shop_name||'Jumlagy'}</h1><p>📞 ${globalSettings.phone||''}</p><hr><table><tr><td>العميل</td><td>${r.customer_name}</td></tr><tr><td>الجهاز</td><td>${r.device_name}</td></tr><tr><td>الفني</td><td>${r.technician}</td></tr><tr><td>التاريخ</td><td>${r.receive_date}</td></tr></table><p class=total>💰 ${formatCurrency(r.repair_price)}</p><p style=font-size:12px>🛡️ ضمان: ${globalSettings.warranty_days||30} يوم</p><p style=margin-top:40px>توقيع العميل: _______________</p><script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
}

function loadRepairsTable() {
    const search = (document.getElementById('repair-search')?.value||'').toLowerCase(), filter = document.getElementById('repair-filter')?.value||'all';
    let filtered = globalRepairs.filter(r => { const m = !search||r.device_name?.toLowerCase().includes(search)||r.customer_name?.toLowerCase().includes(search); return m && (filter==='all'||r.status===filter); });
    document.getElementById('repairs-count').textContent = `${globalRepairs.length} أمر صيانة`;
    document.getElementById('repairs-table-container').innerHTML = `<div class=table-responsive><table><thead><tr><th>الجهاز</th><th>العميل</th><th>الفني</th><th>الحالة</th><th>السعر</th><th>تاريخ الاستلام</th><th>إجراءات</th></tr></thead><tbody>${filtered.map(r=>`<tr><td class=font-semibold>${r.device_name||'-'}</td><td>${r.customer_name||'-'}<br><span class="text-xs text-gray-400">${r.customer_phone||''}</span></td><td>${r.technician||'-'}</td><td><select class=input-field style=width:auto;padding:4px 8px;font-size:12px onchange="quickStatusChange('${r.id}',this.value)"><option value=قيد_الصيانة ${r.status==='قيد_الصيانة'?'selected':''}>قيد الصيانة</option><option value=جاهز ${r.status==='جاهز'?'selected':''}>جاهز للتسليم</option><option value=تم_التسليم ${r.status==='تم_التسليم'?'selected':''}>تم التسليم</option></select></td><td class="font-bold text-blue-600">${formatCurrency(r.repair_price)}</td><td class=text-sm>${r.receive_date||'-'}</td><td><button class=btn-icon onclick="openRepairForm('${r.id}')"><i class="fas fa-pen"></i></button><button class=btn-icon onclick="printRepairInvoice('${r.id}')"><i class="fas fa-print"></i></button><button class="btn-icon text-red" onclick="confirmDelete('repair','${r.id}')"><i class="fas fa-trash"></i></button></td></tr>`).join('')||'<tr><td colspan=7 class="text-center py-6 text-gray-400">لا توجد أوامر صيانة</td></tr>'}</tbody></table></div>`;
}

function openBarcodeScanner() { alert('خاصية مسح الباركود قيد التطوير.'); }

function openPartForm(partId = null) {
    showModal('part-modal'); document.getElementById('part-form').reset();
    if (partId) { const p = globalParts.find(p => p.id === partId); if (p) { document.getElementById('part-modal-title').textContent = 'تعديل قطعة غيار'; document.getElementById('part-id').value = p.id; document.getElementById('part-name').value = p.name||''; document.getElementById('part-category').value = p.category||'بطاريات'; document.getElementById('part-purchase-price').value = p.purchase_price||0; document.getElementById('part-quantity').value = p.quantity||0; } }
    else { document.getElementById('part-modal-title').textContent = 'إضافة قطعة غيار'; document.getElementById('part-id').value = ''; }
}
function closePartForm() { hideModal('part-modal'); }

async function savePart(e) {
    e.preventDefault(); showLoading();
    const id = document.getElementById('part-id').value;
    const data = { name: document.getElementById('part-name').value, category: document.getElementById('part-category').value, purchase_price: Number(document.getElementById('part-purchase-price').value)||0, selling_price: Number(document.getElementById('part-selling-price').value)||0, quantity: Number(document.getElementById('part-quantity').value)||0, min_quantity: Number(document.getElementById('part-min-quantity').value)||0, supplier: document.getElementById('part-supplier').value, ownerId };
    try { if (id) await updateDoc(doc(db,"parts",id), data); else await addDoc(collection(db,"parts"), data); await loadAllData(); closePartForm(); loadInventoryTable(); loadDashboard(); } catch(e){ console.error(e); } hideLoading();
}

function loadInventoryTable() {
    const search = (document.getElementById('part-search')?.value||'').toLowerCase();
    const filtered = globalParts.filter(p => !search||p.name?.toLowerCase().includes(search)||p.category?.toLowerCase().includes(search)||p.supplier?.toLowerCase().includes(search));
    document.getElementById('inventory-count').textContent = `${globalParts.length} صنف - ${globalParts.reduce((s,p)=>s+(Number(p.quantity)||0),0)} قطعة`;
    document.getElementById('inventory-summary').innerHTML = `<div class=stat-card><div class="stat-card-icon icon-purple"><i class="fas fa-box"></i></div><p class=stat-card-title>قيمة المخزون</p><p class=stat-card-value>${formatCurrency(globalParts.reduce((s,p)=>s+(Number(p.purchase_price)||0)*(Number(p.quantity)||0),0))}</p></div><div class=stat-card><div class="stat-card-icon icon-green"><i class="fas fa-cubes"></i></div><p class=stat-card-title>إجمالي القطع</p><p class=stat-card-value>${globalParts.reduce((s,p)=>s+(Number(p.quantity)||0),0)}</p></div>`;
    document.getElementById('inventory-table-container').innerHTML = `<div class=table-responsive><table><thead><tr><th>القطعة</th><th>التصنيف</th><th>سعر الشراء</th><th>سعر البيع</th><th>الكمية</th><th>المورد</th><th>إجراءات</th></tr></thead><tbody>${filtered.map(p=>`<tr><td class=font-semibold>${p.name||'-'}</td><td><span class="badge badge-gray">${p.category||'أخرى'}</span></td><td>${formatCurrency(p.purchase_price)}</td><td>${p.selling_price?formatCurrency(p.selling_price):'-'}</td><td class=font-bold>${p.quantity}</td><td>${p.supplier||'-'}</td><td><button class=btn-icon onclick="openPartForm('${p.id}')"><i class="fas fa-pen"></i></button><button class="btn-icon text-red" onclick="confirmDelete('part','${p.id}')"><i class="fas fa-trash"></i></button></td></tr>`).join('')||'<tr><td colspan=7 class="text-center py-6 text-gray-400">لا توجد قطع غيار</td></tr>'}</tbody></table></div>`;
}

function openExpenseForm(expenseId = null) {
    showModal('expense-modal'); document.getElementById('expense-form').reset(); document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
    if (expenseId) { const e = globalExpenses.find(e => e.id === expenseId); if (e) { document.getElementById('expense-modal-title').textContent = 'تعديل مصروف'; document.getElementById('expense-id').value = e.id; document.getElementById('expense-title').value = e.title||''; document.getElementById('expense-amount').value = e.amount||0; } }
    else { document.getElementById('expense-modal-title').textContent = 'إضافة مصروف'; document.getElementById('expense-id').value = ''; }
}
function closeExpenseForm() { hideModal('expense-modal'); }

async function saveExpense(e) {
    e.preventDefault(); showLoading();
    const id = document.getElementById('expense-id').value;
    const data = { title: document.getElementById('expense-title').value, category: document.getElementById('expense-category').value, amount: Number(document.getElementById('expense-amount').value)||0, date: document.getElementById('expense-date').value, notes: document.getElementById('expense-notes').value, ownerId };
    try { if (id) await updateDoc(doc(db,"expenses",id), data); else await addDoc(collection(db,"expenses"), data); await loadAllData(); closeExpenseForm(); loadExpensesTable(); loadDashboard(); } catch(e){ console.error(e); } hideLoading();
}

function loadExpensesTable() {
    const search = (document.getElementById('expense-search')?.value||'').toLowerCase(), cat = document.getElementById('expense-cat-filter')?.value||'الكل';
    const filtered = globalExpenses.filter(e => (!search||e.title?.toLowerCase().includes(search)) && (cat==='الكل'||e.category===cat));
    document.getElementById('expenses-count').textContent = `${globalExpenses.length} مصروف — إجمالي: ${formatCurrency(globalExpenses.reduce((s,e)=>s+(Number(e.amount)||0),0))}`;
    document.getElementById('expenses-list').innerHTML = filtered.map(e => `<div class=card><div class=card-body><div class="flex justify-between items-center"><div class="flex items-center gap-3"><div class="p-2 rounded-lg bg-gray-100"><i class="fas fa-receipt text-gray-500"></i></div><div><p class=font-semibold>${e.title}</p><p class="text-xs text-gray-500">${e.date} · ${e.category}${e.notes?' — '+e.notes:''}</p></div></div><div class="flex items-center gap-3"><span class="font-bold text-red-600">${formatCurrency(e.amount)}</span><button class=btn-icon onclick="openExpenseForm('${e.id}')"><i class="fas fa-pen"></i></button><button class="btn-icon text-red" onclick="confirmDelete('expense','${e.id}')"><i class="fas fa-trash"></i></button></div></div></div></div>`).join('') || '<p class="text-center text-gray-400 py-10">لا توجد مصاريف</p>';
}

function loadCustomersTable() {
    const search = (document.getElementById('customer-search')?.value||'').toLowerCase();
    const map = {}; globalRepairs.forEach(r => { const k = r.customer_phone||r.customer_name; if (!map[k]) map[k] = { name: r.customer_name, phone: r.customer_phone, repairs: [], totalPaid: 0, lastDate: null }; map[k].repairs.push(r); map[k].totalPaid += (Number(r.repair_price)||0); const d = r.receive_date?new Date(r.receive_date):new Date(); if (!map[k].lastDate||d>map[k].lastDate) map[k].lastDate = d; });
    let customers = Object.values(map).map((c,i)=>({...c,id:i,lastVisit:c.lastDate?.toISOString().split('T')[0]||'-'})).sort((a,b)=>(b.lastDate||0)-(a.lastDate||0));
    if (search) customers = customers.filter(c => c.name?.toLowerCase().includes(search)||c.phone?.includes(search));
    document.getElementById('customers-count').textContent = `${customers.length} عميل مسجل`;
    document.getElementById('customers-summary').innerHTML = `<div class=stat-card><div class="stat-card-icon icon-blue"><i class="fas fa-users"></i></div><p class=stat-card-title>إجمالي العملاء</p><p class=stat-card-value>${customers.length}</p></div><div class=stat-card><div class="stat-card-icon icon-green"><i class="fas fa-dollar-sign"></i></div><p class=stat-card-title>إجمالي الإيرادات</p><p class=stat-card-value>${formatCurrency(customers.reduce((s,c)=>s+c.totalPaid,0))}</p></div>`;
    document.getElementById('customers-list').innerHTML = customers.map(c => `<div class="card customer-card" onclick="toggleCustomerRepairs(${c.id})"><div class=card-body><div class="flex justify-between items-center"><div class="flex items-center gap-3"><div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><i class="fas fa-user text-blue-600"></i></div><div><p class=font-bold>${c.name}</p><p class="text-sm text-gray-500">📞 ${c.phone||'-'}</p></div></div><div class="flex items-center gap-4"><div class=text-center><p class="text-xs text-gray-400">عدد الأجهزة</p><p class=font-bold>${c.repairs.length}</p></div><div class=text-center><p class="text-xs text-gray-400">إجمالي المدفوع</p><p class="font-bold text-blue-600">${formatCurrency(c.totalPaid)}</p></div><i class="fas fa-chevron-down text-gray-400" id="customer-chevron-${c.id}"></i></div></div><div class="customer-repairs mt-3 pt-3 hidden" id="customer-repairs-${c.id}"><p class="text-xs font-bold text-gray-500 mb-2">سجل الصيانة</p>${c.repairs.map(r=>`<div class=customer-repair-item><div class="flex justify-between items-center"><div><p class="font-semibold text-sm">${r.device_name}</p><p class="text-xs text-gray-500">${r.receive_date} · ${r.technician}</p></div><div class="flex items-center gap-2">${getStatusBadge(r.status)}<span class="font-bold text-blue-600">${formatCurrency(r.repair_price)}</span></div></div></div>`).join('')}</div></div></div>`).join('') || '<p class="text-center text-gray-400 py-10">لا يوجد عملاء</p>';
}

function toggleCustomerRepairs(id) { const d = document.getElementById('customer-repairs-'+id), c = document.getElementById('customer-chevron-'+id); if (d) { d.classList.toggle('hidden'); if (c) { c.classList.toggle('fa-chevron-down'); c.classList.toggle('fa-chevron-up'); } } }

function loadWallets() {
    document.getElementById('wallet-summary-cards').innerHTML = `<div class=stat-card><div class="stat-card-icon icon-green"><i class="fas fa-wallet"></i></div><p class=stat-card-title>إجمالي الأرصدة</p><p class=stat-card-value>${formatCurrency(globalWallets.reduce((s,w)=>s+(Number(w.balance)||0),0))}</p></div><div class=stat-card><div class="stat-card-icon icon-blue"><i class="fas fa-calendar-day"></i></div><p class=stat-card-title>المستعمل اليوم</p><p class=stat-card-value>${formatCurrency(globalWallets.reduce((s,w)=>s+(Number(w.daily_used)||0),0))}</p></div><div class=stat-card><div class="stat-card-icon icon-amber"><i class="fas fa-calendar-alt"></i></div><p class=stat-card-title>المستعمل الشهر</p><p class=stat-card-value>${formatCurrency(globalWallets.reduce((s,w)=>s+(Number(w.monthly_used)||0),0))}</p></div>`;
    document.getElementById('wallets-table-body').innerHTML = globalWallets.map(w => `<tr><td class=font-semibold>${w.name}</td><td><span class="badge badge-blue">${walletLimits[w.type]?.label||w.type}</span></td><td class=font-bold>${formatCurrency(w.balance)}</td><td>${formatCurrency(w.daily_limit)}</td><td>${formatCurrency(w.daily_used)}</td><td>${formatCurrency(w.monthly_limit)}</td><td>${formatCurrency(w.monthly_used)}</td><td><span class="badge badge-green">آمن</span></td><td><button class="btn-primary btn-xs" onclick="openTransactionModal('${w.id}')"><i class="fas fa-exchange-alt"></i></button><button class=btn-icon onclick="openWalletModal('${w.id}')"><i class="fas fa-pen"></i></button><button class="btn-danger btn-xs" onclick="confirmDelete('wallet','${w.id}')"><i class="fas fa-trash"></i></button></td></tr>`).join('') || '<tr><td colspan=9 class="text-center py-6 text-gray-400">لا توجد محافظ</td></tr>';
    document.getElementById('wallet-transactions-body').innerHTML = [...globalTransactions].sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)).slice(0,20).map(t => `<tr><td class=text-sm>${t.date}</td><td class=font-semibold>${globalWallets.find(w=>w.id===t.wallet_id)?.name||'—'}</td><td>${t.type==='deposit'?'<span class="badge badge-green">إيداع</span>':'<span class="badge badge-red">سحب</span>'}</td><td class=font-bold>${t.type==='deposit'?'+':'-'} ${formatCurrency(t.amount)}</td><td class="text-sm text-gray-500">${t.notes||'—'}</td></tr>`).join('') || '<tr><td colspan=5 class="text-center py-6 text-gray-400">لا توجد عمليات</td></tr>';
}

function onWalletTypeChange() { const t = document.getElementById('wallet-type')?.value, i = document.getElementById('wallet-limits-info'); if (t && walletLimits[t] && i) { i.classList.remove('hidden'); i.innerHTML = `الحد اليومي: <strong>${walletLimits[t].daily.toLocaleString()} ج.م</strong> | الحد الشهري: <strong>${walletLimits[t].monthly.toLocaleString()} ج.م</strong>`; } else if (i) i.classList.add('hidden'); }
function openWalletModal(walletId = null) { showModal('wallet-modal'); document.getElementById('wallet-form').reset(); if (walletId) { const w = globalWallets.find(w=>w.id===walletId); if (w) { document.getElementById('wallet-modal-title').textContent='تعديل محفظة'; document.getElementById('wallet-id').value=w.id; document.getElementById('wallet-name').value=w.name; document.getElementById('wallet-type').value=w.type; onWalletTypeChange(); } } else { document.getElementById('wallet-modal-title').textContent='إضافة محفظة'; document.getElementById('wallet-id').value=''; } }
function closeWalletModal() { hideModal('wallet-modal'); }

async function saveWallet(e) {
    e.preventDefault(); const id = document.getElementById('wallet-id').value, type = document.getElementById('wallet-type').value, limits = walletLimits[type] || walletLimits['vodafone'];
    const data = { name: document.getElementById('wallet-name').value, phone: document.getElementById('wallet-phone').value, type, balance: 0, daily_used: 0, monthly_used: 0, daily_limit: limits.daily, monthly_limit: limits.monthly, ownerId };
    try { if (id) { const ex = globalWallets.find(w=>w.id===id); data.balance = ex?.balance||0; data.daily_used = ex?.daily_used||0; data.monthly_used = ex?.monthly_used||0; await updateDoc(doc(db,"wallets",id), data); } else await addDoc(collection(db,"wallets"), data); await loadAllData(); closeWalletModal(); loadWallets(); } catch(e){ console.error(e); }
}

function openTransactionModal(walletId) { showModal('transaction-modal'); document.getElementById('transaction-form').reset(); document.getElementById('transaction-wallet-id').value = walletId; }
function closeTransactionModal() { hideModal('transaction-modal'); }

async function saveTransaction(e) {
    e.preventDefault(); const walletId = document.getElementById('transaction-wallet-id').value, type = document.getElementById('transaction-type').value, amount = parseFloat(document.getElementById('transaction-amount').value), notes = document.getElementById('transaction-notes').value, wallet = globalWallets.find(w=>w.id===walletId);
    if (!wallet) return;
    if (type==='withdraw' && amount > (Number(wallet.balance)||0)) { alert('❌ الرصيد غير كافي.'); return; }
    try {
        if (type==='withdraw') await updateDoc(doc(db,"wallets",walletId), { balance: Number(wallet.balance)-amount, daily_used: Number(wallet.daily_used)+amount, monthly_used: Number(wallet.monthly_used)+amount });
        else await updateDoc(doc(db,"wallets",walletId), { balance: Number(wallet.balance)+amount });
        await addDoc(collection(db,"transactions"), { wallet_id: walletId, type, amount, date: new Date().toISOString().split('T')[0], notes, ownerId });
        await loadAllData(); closeTransactionModal(); loadWallets();
    } catch(e){ console.error(e); }
}

function loadReports() {
    const tr = globalRepairs.reduce((s,r)=>s+(Number(r.repair_price)||0),0), tpc = globalRepairs.reduce((s,r)=>s+(Number(r.spare_part_cost)||0),0), ttf = globalRepairs.reduce((s,r)=>s+(Number(r.technician_fee)||0),0), te = globalExpenses.reduce((s,e)=>s+(Number(e.amount)||0),0), profit = tr-tpc-ttf-te;
    document.getElementById('reports-kpi').innerHTML = `<div class=stat-card><p class=stat-card-title>إجمالي الإيرادات</p><p class=stat-card-value>${formatCurrency(tr)}</p></div><div class=stat-card><p class=stat-card-title>ربح الصيانة</p><p class=stat-card-value>${formatCurrency(tr-tpc-ttf)}</p></div><div class=stat-card><p class=stat-card-title>المصاريف التشغيلية</p><p class=stat-card-value>${formatCurrency(te)}</p></div><div class=stat-card><p class=stat-card-title>صافي الربح</p><p class=stat-card-value>${formatCurrency(profit)}</p></div>`;
    document.getElementById('profit-breakdown').innerHTML = `<p class="font-bold text-teal-800 mb-3">تفصيل صافي الربح</p><div class="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm"><div class="bg-white rounded-lg p-3"><span class="text-xs text-gray-500">إيرادات</span><p class="font-bold text-blue-600">${formatCurrency(tr)}</p></div><div class="bg-white rounded-lg p-3"><span class="text-xs text-gray-500">قطع الغيار</span><p class="font-bold text-purple-600">- ${formatCurrency(tpc)}</p></div><div class="bg-white rounded-lg p-3"><span class="text-xs text-gray-500">أجور الفنيين</span><p class="font-bold text-amber-600">- ${formatCurrency(ttf)}</p></div><div class="bg-white rounded-lg p-3"><span class="text-xs text-gray-500">مصاريف</span><p class="font-bold text-red-600">- ${formatCurrency(te)}</p></div><div class="bg-teal-50 rounded-lg p-3 border-2 border-teal-300"><span class="text-xs text-gray-500">= صافي الربح</span><p class="font-bold text-teal-700">${formatCurrency(profit)}</p></div></div>`;
    const tm = {}; globalRepairs.forEach(r=>{ if(!r.technician) return; if(!tm[r.technician]) tm[r.technician]={name:r.technician,orders:0,revenue:0}; tm[r.technician].orders++; tm[r.technician].revenue+=(Number(r.repair_price)||0); });
    document.getElementById('technician-performance').innerHTML = Object.values(tm).map((t,i)=>`<div class="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 mb-2"><span class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs font-bold text-blue-600">${i+1}</span><div class=flex-1><p class=font-semibold>${t.name}</p></div><div class="text-sm text-gray-500">${t.orders} عمليات</div><div class="font-bold text-blue-600">${formatCurrency(t.revenue)}</div></div>`).join('')||'<p class="text-gray-400 text-center py-4">لا توجد بيانات</p>';
    const cm = {}; globalRepairs.forEach(r=>{ if(!r.customer_name) return; if(!cm[r.customer_name]) cm[r.customer_name]={name:r.customer_name,total:0,orders:0}; cm[r.customer_name].total+=(Number(r.repair_price)||0); cm[r.customer_name].orders++; });
    document.getElementById('top-customers').innerHTML = Object.values(cm).sort((a,b)=>b.total-a.total).slice(0,8).map((c,i)=>`<div class="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 mb-2"><span class="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center text-xs font-bold text-amber-600">${i+1}</span><div class=flex-1><p class="font-semibold text-sm">${c.name}</p></div><div class="font-bold text-blue-600 text-sm">${formatCurrency(c.total)}</div><div class="text-xs text-gray-500">${c.orders} طلب</div></div>`).join('')||'<p class="text-gray-400 text-center py-4">لا توجد بيانات</p>';
}

function updateAlertsCount() { const t = globalParts.filter(p=>p.min_quantity&&p.quantity<=p.min_quantity).length + globalRepairs.filter(r=>r.status!=='تم_التسليم'&&r.delivery_date&&new Date(r.delivery_date)<new Date()).length; const b = document.getElementById('alerts-count'); if (b) { b.textContent = t; b.classList.toggle('hidden', t===0); } }

function loadAlerts() {
    const now = new Date();
    const all = [...globalParts.filter(p=>p.min_quantity&&p.quantity<=p.min_quantity).map(p=>({title:`مخزون منخفض: ${p.name}`,desc:`الكمية: ${p.quantity}`,icon:'fa-box',color:'text-amber-600',bg:'bg-amber-50',border:'border-r-amber-400'})),...globalRepairs.filter(r=>r.delivery_date&&r.status!=='تم_التسليم'&&new Date(r.delivery_date)<now).map(r=>({title:`تأخر تسليم: ${r.device_name}`,desc:`العميل: ${r.customer_name}`,icon:'fa-clock',color:'text-red-600',bg:'bg-red-50',border:'border-r-red-500'}))];
    document.getElementById('alerts-summary-text').textContent = all.length>0?`${all.length} تنبيه نشط`:'لا توجد تنبيهات';
    document.getElementById('alerts-list').innerHTML = all.length>0?all.map(a=>`<div class="card ${a.bg} border-r-4 ${a.border}"><div class=card-body><div class="flex items-start gap-3"><div class="p-2 rounded-lg"><i class="fas ${a.icon} ${a.color} text-lg"></i></div><div><p class=font-bold>${a.title}</p><p class="text-sm text-gray-600">${a.desc}</p></div></div></div></div>`).join(''):'<div class=card><div class="card-body text-center py-10"><i class="fas fa-check-circle text-emerald-500 text-4xl mb-3"></i><p class="text-lg font-bold text-emerald-700">كل شيء على ما يرام!</p></div></div>';
}

function loadSubscriptions() {
    globalSubscriptions.forEach(s=>{ if(s.status==='نشط'&&new Date(s.end_date)<new Date()) s.status='منتهي'; });
    const search = (document.getElementById('sub-search')?.value||'').toLowerCase(), filter = document.getElementById('sub-filter')?.value||'all';
    document.getElementById('subs-count-text').textContent = `${globalSubscriptions.length} عميل مشترك`;
    document.getElementById('subscription-summary-cards').innerHTML = `<div class=stat-card><div class="stat-card-icon icon-green"><i class="fas fa-check-circle"></i></div><p class=stat-card-title>نشطة</p><p class=stat-card-value>${globalSubscriptions.filter(s=>s.status==='نشط').length}</p></div><div class=stat-card><div class="stat-card-icon icon-blue"><i class="fas fa-dollar-sign"></i></div><p class=stat-card-title>الإيرادات</p><p class=stat-card-value>${formatCurrency(globalSubscriptions.reduce((s,sub)=>s+(Number(sub.price)||0),0))}</p></div>`;
    let filtered = globalSubscriptions.filter(s => (!search||s.customer_name?.toLowerCase().includes(search)||s.customer_email?.toLowerCase().includes(search)) && (filter==='all'||s.status===filter));
    document.getElementById('subscriptions-table-body').innerHTML = filtered.map((s,i)=>`<tr><td class="text-xs text-gray-400">${i+1}</td><td class=font-semibold>${s.customer_name}</td><td class=text-sm>${s.customer_email}</td><td>${s.plan}</td><td class="font-bold text-blue-600">${formatCurrency(s.price)}</td><td class=text-sm>${s.start_date}</td><td class=text-sm>${s.end_date}</td><td>${getDaysLeft(s.end_date)}</td><td>${s.status==='نشط'?'<span class="badge badge-green">نشط</span>':'<span class="badge badge-red">منتهي</span>'}</td><td>${(s.status==='منتهي'||s.status==='نشط')?`<button class="btn-primary btn-xs" onclick="renewSubscription('${s.id}')"><i class="fas fa-sync-alt"></i></button>`:''}<button class="btn-danger btn-xs" onclick="confirmDelete('subscription','${s.id}')"><i class="fas fa-trash"></i></button></td></tr>`).join('')||'<tr><td colspan=10 class="text-center py-6 text-gray-400">لا توجد اشتراكات</td></tr>';
}

function openSubscriptionModal(subId = null) {
    showModal('subscription-modal'); document.getElementById('subscription-form').reset(); document.getElementById('subscription-start-date').value = new Date().toISOString().split('T')[0];
    const select = document.getElementById('subscription-linked-user'); if (select) select.innerHTML = '<option value="">اختر مستخدم</option>' + globalUsers.map(u => `<option value="${u.id}">${u.fullName||u.name||u.email} (${u.email})</option>`).join('');
    if (subId) { const s = globalSubscriptions.find(s=>s.id===subId); if (s) { document.getElementById('subscription-modal-title').textContent='تعديل اشتراك'; document.getElementById('subscription-id').value=s.id; document.getElementById('subscription-customer-name').value=s.customer_name; document.getElementById('subscription-customer-email').value=s.customer_email; document.getElementById('subscription-plan').value=s.plan; document.getElementById('subscription-price').value=s.price; document.getElementById('subscription-start-date').value=s.start_date; document.getElementById('subscription-end-date').value=s.end_date; } }
    else { document.getElementById('subscription-modal-title').textContent='اشتراك جديد'; document.getElementById('subscription-id').value=''; onSubscriptionPlanChange(); }
}
function closeSubscriptionModal() { hideModal('subscription-modal'); }
function onLinkedUserChange() { const userId = document.getElementById('subscription-linked-user')?.value; if (userId) { const user = globalUsers.find(u=>u.id===userId); if (user) { document.getElementById('subscription-customer-name').value = user.fullName||user.name||''; document.getElementById('subscription-customer-email').value = user.email||''; } } }
function onSubscriptionPlanChange() { const plan = document.getElementById('subscription-plan')?.value, startDate = document.getElementById('subscription-start-date')?.value||new Date().toISOString().split('T')[0], endDate = new Date(startDate); if (plan==='تجريبي') endDate.setDate(endDate.getDate()+3); else if (plan==='شهري') endDate.setMonth(endDate.getMonth()+1); else if (plan==='سنوي') endDate.setFullYear(endDate.getFullYear()+1); document.getElementById('subscription-end-date').value = endDate.toISOString().split('T')[0]; }

async function saveSubscription(e) {
    e.preventDefault(); const id = document.getElementById('subscription-id').value;
    const data = { customer_name: document.getElementById('subscription-customer-name').value, customer_email: document.getElementById('subscription-customer-email').value, plan: document.getElementById('subscription-plan').value, price: Number(document.getElementById('subscription-price').value)||0, start_date: document.getElementById('subscription-start-date').value, end_date: document.getElementById('subscription-end-date').value, status: 'نشط', linked_user_id: document.getElementById('subscription-linked-user').value||null, ownerId };
    try {
        if (id) await updateDoc(doc(db,"subscriptions",id), data); else await addDoc(collection(db,"subscriptions"), data);
        if (data.linked_user_id) await updateDoc(doc(db,"users",data.linked_user_id), { subscription: { plan: data.plan, status: 'نشط', start_date: data.start_date, end_date: data.end_date, price: data.price }, subscriptionType: data.plan, subscriptionEnd: data.end_date, isApproved: true, status: 'active' });
        await loadAllData(); closeSubscriptionModal(); loadSubscriptions(); alert('✅ تم حفظ الاشتراك وتفعيل المستخدم');
    } catch(e){ console.error(e); }
}

async function renewSubscription(id) {
    const s = globalSubscriptions.find(s=>s.id===id); if (!s) return;
    const newEnd = new Date(s.end_date); if (s.plan==='شهري') newEnd.setMonth(newEnd.getMonth()+1); else if (s.plan==='سنوي') newEnd.setFullYear(newEnd.getFullYear()+1); else newEnd.setDate(newEnd.getDate()+3);
    await updateDoc(doc(db,"subscriptions",id), { end_date: newEnd.toISOString().split('T')[0], status: 'نشط' });
    if (s.linked_user_id) await updateDoc(doc(db,"users",s.linked_user_id), { 'subscription.end_date': newEnd.toISOString().split('T')[0], 'subscription.status': 'نشط', subscriptionEnd: newEnd.toISOString().split('T')[0], status: 'active' });
    await loadAllData(); loadSubscriptions(); alert('✅ تم التجديد');
}

function loadSettings() {
    document.getElementById('set-shop-name').value = globalSettings.shop_name || '';
    document.getElementById('set-owner-name').value = globalSettings.owner_name || '';
    document.getElementById('set-phone').value = globalSettings.phone || '';
    document.getElementById('set-address').value = globalSettings.address || '';
    document.getElementById('set-warranty-days').value = globalSettings.warranty_days || 30;
    document.getElementById('set-warranty-notes').value = globalSettings.warranty_notes || '';
    document.getElementById('set-language').value = globalSettings.language || 'ar';
    renderTechnicians(); updateInvoicePreview();
}

function renderTechnicians() { document.getElementById('technicians-list').innerHTML = globalTechnicians.map((t,i)=>`<div class="flex justify-between items-center bg-gray-50 rounded-lg p-3 mb-2"><span class=font-medium>${t}</span><button class="btn-icon text-red" onclick="removeTechnician(${i})"><i class="fas fa-trash"></i></button></div>`).join('')||'<p class="text-sm text-gray-500">لم تضف فنيين بعد</p>'; }
function addTechnician() { const i = document.getElementById('new-technician'); if (i&&i.value.trim()) { globalTechnicians.push(i.value.trim()); i.value=''; renderTechnicians(); updateTechSelects(); } }
function removeTechnician(index) { globalTechnicians.splice(index,1); renderTechnicians(); updateTechSelects(); }
function updateTechSelects() { const s = document.getElementById('repair-technician'); if (s) s.innerHTML = globalTechnicians.map(t=>`<option value="${t}">${t}</option>`).join(''); }

function updateInvoicePreview() {
    document.getElementById('preview-shop-name').textContent = document.getElementById('set-shop-name')?.value || 'اسم المحل';
    document.getElementById('preview-owner').textContent = document.getElementById('set-owner-name')?.value || '';
    document.getElementById('preview-phone').textContent = document.getElementById('set-phone')?.value ? '📞 '+document.getElementById('set-phone').value : '';
    document.getElementById('preview-address').textContent = document.getElementById('set-address')?.value ? '📍 '+document.getElementById('set-address').value : '';
}

async function saveSettings() {
    globalSettings.shop_name = document.getElementById('set-shop-name').value;
    globalSettings.owner_name = document.getElementById('set-owner-name').value;
    globalSettings.phone = document.getElementById('set-phone').value;
    globalSettings.address = document.getElementById('set-address').value;
    globalSettings.warranty_days = parseInt(document.getElementById('set-warranty-days').value)||30;
    globalSettings.warranty_notes = document.getElementById('set-warranty-notes').value;
    globalSettings.language = document.getElementById('set-language').value;
    globalSettings.technicians = globalTechnicians;
    await setDoc(doc(db,"settings",ownerId), globalSettings);
    alert('✅ تم حفظ الإعدادات');
}

function confirmDelete(type, id) { deleteTarget = { type, id }; document.getElementById('delete-message').textContent = 'هل أنت متأكد من الحذف؟'; showModal('delete-modal'); }
function closeDeleteModal() { hideModal('delete-modal'); deleteTarget = null; }
async function executeDelete() {
    if (!deleteTarget) return; const { type, id } = deleteTarget;
    try { if (type==='repair') await deleteDoc(doc(db,"repairs",id)); if (type==='part') await deleteDoc(doc(db,"parts",id)); if (type==='expense') await deleteDoc(doc(db,"expenses",id)); if (type==='wallet') await deleteDoc(doc(db,"wallets",id)); if (type==='subscription') await deleteDoc(doc(db,"subscriptions",id)); if (type==='user') await deleteDoc(doc(db,"users",id)); await loadAllData(); closeDeleteModal(); loadDashboard(); } catch(e){ console.error(e); }
}

window.formatCurrency = formatCurrency;
window.getStatusBadge = getStatusBadge;
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
window.toggleUserApproval = toggleUserApproval;

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initApp); } else { initApp(); }
