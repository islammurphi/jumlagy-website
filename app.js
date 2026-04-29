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

let ownerId = null, charts = {}, deleteTarget = null;
let globalRepairs = [], globalParts = [], globalExpenses = [], globalWallets = [], globalTransactions = [], globalSubscriptions = [], globalUsers = [], globalSettings = {}, globalTechnicians = ['عان', 'تحن', 'قنب'];

const walletLimits = {
    'vodafone': { daily: 60000, monthly: 200000, max_balance: 100000, label: 'فودافون كاش' },
    'orange': { daily: 60000, monthly: 200000, max_balance: 100000, label: 'أورانج كاش' },
    'etisalat': { daily: 60000, monthly: 200000, max_balance: 100000, label: 'اتصالات كاش' },
    'we': { daily: 60000, monthly: 200000, max_balance: 100000, label: 'وي كاش' },
    'bank': { daily: 60000, monthly: 200000, max_balance: 100000, label: 'محفظة بنكية' },
    'instapay': { daily: 120000, monthly: 400000, max_balance: 999999999, label: 'إنستاباي' },
};

function formatCurrency(a) { return Number(a || 0).toLocaleString('ar-EG') + ' ج.م'; }
function getStatusBadge(s) {
    const b = { 'تم_التسليم': '<span class="badge badge-blue">تم التسليم</span>', 'قيد_الصيانة': '<span class="badge badge-amber">قيد الصيانة</span>', 'جاهز': '<span class="badge badge-green">جاهز للتسليم</span>' };
    return b[s] || '';
}
function getDaysLeft(d) { const e = new Date(d), t = new Date(); const diff = Math.ceil((e - t) / 86400000); if (diff < 0) return '<span class="badge badge-red">منتهي</span>'; if (diff === 0) return '<span class="badge badge-red">ينتهي اليوم</span>'; if (diff <= 30) return `<span class="badge badge-amber">متبقي ${diff} يوم</span>`; return `<span class="badge badge-green">متبقي ${diff} يوم</span>`; }
function showLoading() { document.getElementById('loading-overlay').classList.add('show'); }
function hideLoading() { document.getElementById('loading-overlay').classList.remove('show'); }
function showModal(id) { document.getElementById(id).classList.add('show'); }
function hideModal(id) { document.getElementById(id).classList.remove('show'); }
window.hideModal = hideModal;

async function initApp() {
    showLoading();
    const session = JSON.parse(localStorage.getItem('jumlagy_session'));
    if (!session || !session.uid) { window.location.href = 'login.html'; return; }
    
    ownerId = session.uid;
    document.getElementById('sidebar-user-name').textContent = session.name || 'مستخدم';
    document.getElementById('sidebar-user-role').textContent = session.role === 'admin' ? 'مدير النظام' : 'مستخدم';
    document.getElementById('sidebar-user-photo').src = session.photo || '';
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const tab = this.getAttribute('data-tab');
            document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById('tab-' + tab).classList.add('active');
            if (tab === 'dashboard') loadDashboard();
            if (tab === 'repairs') loadRepairsTable();
            if (tab === 'inventory') loadInventoryTable();
            if (tab === 'expenses') loadExpensesTable();
            if (tab === 'customers') loadCustomersTable();
            if (tab === 'wallet') loadWallets();
            if (tab === 'reports') loadReports();
            if (tab === 'alerts') loadAlerts();
            if (tab === 'subscriptions') loadSubscriptions();
        });
    });
    
    document.getElementById('menu-toggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
    document.getElementById('btn-logout').addEventListener('click', async () => { localStorage.removeItem('jumlagy_session'); await signOut(auth); window.location.href = 'login.html'; });
    
    document.getElementById('repair-form').addEventListener('submit', saveRepair);
    document.getElementById('part-form').addEventListener('submit', savePart);
    document.getElementById('expense-form').addEventListener('submit', saveExpense);
    document.getElementById('wallet-form').addEventListener('submit', saveWallet);
    document.getElementById('transaction-form').addEventListener('submit', saveTransaction);
    document.getElementById('subscription-form').addEventListener('submit', saveSubscription);
    document.getElementById('set-shop-name').addEventListener('input', updateInvoicePreview);
    document.getElementById('set-phone').addEventListener('input', updateInvoicePreview);
    
    await loadAllData();
    loadDashboard();
    loadSettings();
    updateInvoicePreview();
    updateAlertsCount();
    hideLoading();
}

window.switchTab = function(tab) {
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    const link = document.querySelector(`[data-tab="${tab}"]`);
    if (link) link.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
};

async function loadAllData() {
    try {
        const [r, p, e, w, t, s, set] = await Promise.all([
            getDocs(query(collection(db, "repairs"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "parts"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "expenses"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "wallets"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "transactions"), where("ownerId", "==", ownerId))),
            getDocs(query(collection(db, "subscriptions"), where("ownerId", "==", ownerId))),
            getDoc(doc(db, "settings", ownerId)),
        ]);
        globalRepairs = r.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.receive_date || 0) - new Date(a.receive_date || 0));
        globalParts = p.docs.map(d => ({ id: d.id, ...d.data() }));
        globalExpenses = e.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        globalWallets = w.docs.map(d => ({ id: d.id, ...d.data() }));
        globalTransactions = t.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        globalSubscriptions = s.docs.map(d => ({ id: d.id, ...d.data() }));
        if (set.exists()) { globalSettings = set.data(); globalTechnicians = globalSettings.technicians || ['عان', 'تحن', 'قنب']; }
        else { globalSettings = { shop_name: 'jumlazy', owner_name: 'اسم حسن', phone: '01207696202', address: 'المقطر', warranty_days: 30, warranty_notes: '', language: 'ar', technicians: globalTechnicians }; await setDoc(doc(db, "settings", ownerId), globalSettings); }
        if (JSON.parse(localStorage.getItem('jumlagy_session'))?.role === 'admin') { const us = await getDocs(collection(db, "users")); globalUsers = us.docs.map(d => ({ id: d.id, ...d.data() })); }
    } catch(e) { console.error(e); }
}

function loadDashboard() {
    const rev = globalRepairs.reduce((s, r) => s + (r.repair_price || 0), 0);
    const pc = globalRepairs.reduce((s, r) => s + (r.spare_part_cost || 0), 0);
    const tf = globalRepairs.reduce((s, r) => s + (r.technician_fee || 0), 0);
    const ex = globalExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const costs = pc + tf + ex, profit = rev - costs;
    const invVal = globalParts.reduce((s, p) => s + (p.purchase_price || 0) * (p.quantity || 0), 0);
    
    document.getElementById('stats-cards').innerHTML = `
        <div class="stat-card"><div class="stat-card-icon icon-blue"><i class="fas fa-dollar-sign"></i></div><p class="stat-card-title">إجمالي الإيرادات</p><p class="stat-card-value">${formatCurrency(rev)}</p></div>
        <div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-wrench"></i></div><p class="stat-card-title">إجمالي المصروفات</p><p class="stat-card-value">${formatCurrency(costs)}</p><p class="stat-card-sub">قطع: ${formatCurrency(pc)} | أخرى: ${formatCurrency(tf + ex)}</p></div>
        <div class="stat-card"><div class="stat-card-icon ${profit >= 0 ? 'icon-green' : 'icon-red'}"><i class="fas fa-chart-line"></i></div><p class="stat-card-title">صافي الأرباح</p><p class="stat-card-value">${formatCurrency(profit)}</p><p class="stat-card-sub">${profit >= 0 ? '✅ رابح' : '⚠️ خاسر'}</p></div>
        <div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-box"></i></div><p class="stat-card-title">قيمة المخزون</p><p class="stat-card-value">${formatCurrency(invVal)}</p><p class="stat-card-sub">${globalParts.length} صنف</p></div>
    `;
    
    const avail = globalParts.filter(p => !p.min_quantity || p.quantity > p.min_quantity).length;
    const low = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity && p.quantity > 0).length;
    const out = globalParts.filter(p => p.quantity === 0).length;
    document.getElementById('inventory-status').innerHTML = `
        <div class="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-200"><p class="text-2xl font-bold text-emerald-700">${avail}</p><p class="text-xs text-emerald-600">متوفر</p></div>
        <div class="bg-amber-50 rounded-xl p-3 text-center border border-amber-200"><p class="text-2xl font-bold text-amber-700">${low}</p><p class="text-xs text-amber-600">منخفض</p></div>
        <div class="bg-red-50 rounded-xl p-3 text-center border border-red-200"><p class="text-2xl font-bold text-red-700">${out}</p><p class="text-xs text-red-600">نافذ</p></div>
    `;
    
    const lowParts = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity);
    document.getElementById('out-of-stock-alerts').innerHTML = lowParts.length > 0 ? '<div class="alert alert-warning text-sm mb-2">⚠️ قطع منخفضة المخزون:</div>' + lowParts.map(p => `<div class="flex justify-between bg-amber-50 rounded-lg px-3 py-2 mb-1 text-sm"><span>${p.name}</span><span class="font-bold">${p.quantity} متبقي</span></div>`).join('') : '<div class="alert alert-success text-sm">✅ جميع القطع متوفرة</div>';
    
    document.getElementById('recent-repairs').innerHTML = globalRepairs.slice(0, 5).map(r => `<div class="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-3"><div><p class="font-semibold text-sm">${r.device_name}</p><p class="text-xs text-gray-500">${r.customer_name}</p></div><div class="flex items-center gap-3">${getStatusBadge(r.status)}<span class="font-bold text-blue-600 text-sm">${formatCurrency(r.repair_price)}</span></div></div>`).join('') || '<p class="text-center text-gray-400 py-6">لا توجد أوامر</p>';
    
    if (globalUsers.length) document.getElementById('users-manager').innerHTML = globalUsers.map(u => `<div class="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2"><span class="font-medium text-sm">${u.fullName || u.name || u.email}</span><span class="text-xs text-gray-500">${u.subscriptionType || u.subscription?.plan || '-'}</span></div>`).join('');
    
    setTimeout(() => {
        const ctx1 = document.getElementById('ordersStatusChart'), ctx2 = document.getElementById('incomeExpenseChart');
        if (!ctx1 || !ctx2) return;
        if (charts.o) charts.o.destroy();
        if (charts.i) charts.i.destroy();
        charts.o = new Chart(ctx1, { type: 'doughnut', data: { labels: ['تم التسليم', 'قيد الصيانة', 'جاهز'], datasets: [{ data: [globalRepairs.filter(r => r.status === 'تم_التسليم').length, globalRepairs.filter(r => r.status === 'قيد_الصيانة').length, globalRepairs.filter(r => r.status === 'جاهز').length], backgroundColor: ['#3b82f6', '#f59e0b', '#10b981'] }] }, options: { plugins: { legend: { position: 'bottom', labels: { font: { family: 'Tajawal', size: 12 } } } } } });
        charts.i = new Chart(ctx2, { type: 'line', data: { labels: ['نوفمبر', 'ديسمبر', 'يناير', 'فبراير', 'مارس', 'أبريل'], datasets: [{ label: 'الإيرادات', data: [3000, 4500, 6000, 7000, 8000, 9130], borderColor: '#3b82f6', fill: true, tension: 0.4 }] }, options: { plugins: { legend: { position: 'bottom' } } } });
    }, 300);
}

// ====== أوامر الصيانة ======
window.openRepairForm = function(id = null) {
    showModal('repair-modal');
    document.getElementById('repair-form').reset();
    document.getElementById('repair-receive-date').value = new Date().toISOString().split('T')[0];
    updateTechSelects();
    if (id) { const r = globalRepairs.find(r => r.id === id); if (r) { document.getElementById('repair-modal-title').textContent = 'تعديل أمر صيانة'; document.getElementById('repair-id').value = r.id; document.getElementById('repair-customer-name').value = r.customer_name || ''; document.getElementById('repair-customer-phone').value = r.customer_phone || ''; document.getElementById('repair-device-name').value = r.device_name || ''; document.getElementById('repair-technician').value = r.technician || ''; document.getElementById('repair-status').value = r.status || ''; document.getElementById('repair-price').value = r.repair_price || 0; document.getElementById('repair-part-name').value = r.spare_part_name || ''; document.getElementById('repair-part-cost').value = r.spare_part_cost || 0; document.getElementById('repair-receive-date').value = r.receive_date || ''; document.getElementById('repair-issue').value = r.device_issue || ''; } }
    else { document.getElementById('repair-modal-title').textContent = 'أمر صيانة جديد'; document.getElementById('repair-id').value = ''; }
};

async function saveRepair(e) {
    e.preventDefault();
    const id = document.getElementById('repair-id').value;
    const data = { device_name: document.getElementById('repair-device-name').value, customer_name: document.getElementById('repair-customer-name').value, customer_phone: document.getElementById('repair-customer-phone').value, technician: document.getElementById('repair-technician').value, status: document.getElementById('repair-status').value, repair_price: Number(document.getElementById('repair-price').value) || 0, spare_part_name: document.getElementById('repair-part-name').value, spare_part_cost: Number(document.getElementById('repair-part-cost').value) || 0, receive_date: document.getElementById('repair-receive-date').value, device_issue: document.getElementById('repair-issue').value, ownerId };
    try { if (id) await updateDoc(doc(db, "repairs", id), data); else await addDoc(collection(db, "repairs"), data); await loadAllData(); hideModal('repair-modal'); loadRepairsTable(); loadDashboard(); updateAlertsCount(); } catch(e) { console.error(e); }
}

function loadRepairsTable() {
    const s = (document.getElementById('repair-search')?.value || '').toLowerCase(), f = document.getElementById('repair-filter')?.value || 'all';
    const filtered = globalRepairs.filter(r => (!s || r.device_name?.toLowerCase().includes(s) || r.customer_name?.toLowerCase().includes(s)) && (f === 'all' || r.status === f));
    document.getElementById('repairs-count').textContent = `${globalRepairs.length} أمر صيانة`;
    document.getElementById('repairs-table-container').innerHTML = `<div class="table-responsive"><table><thead><tr><th>الجهاز</th><th>العميل</th><th>الفني</th><th>الحالة</th><th>السعر</th><th>تاريخ</th><th>إجراءات</th></tr></thead><tbody>${filtered.map(r => `<tr><td class="font-semibold">${r.device_name}</td><td>${r.customer_name}</td><td>${r.technician}</td><td>${getStatusBadge(r.status)}</td><td class="font-bold text-blue-600">${formatCurrency(r.repair_price)}</td><td class="text-sm">${r.receive_date}</td><td><button class="btn-icon" onclick="openRepairForm('${r.id}')"><i class="fas fa-pen"></i></button><button class="btn-icon text-red" onclick="confirmDelete('repair','${r.id}')"><i class="fas fa-trash"></i></button></td></tr>`).join('')}</tbody></table></div>`;
}

// ====== المخزون ======
window.openPartForm = function(id = null) {
    showModal('part-modal'); document.getElementById('part-form').reset();
    if (id) { const p = globalParts.find(p => p.id === id); if (p) { document.getElementById('part-modal-title').textContent = 'تعديل قطعة'; document.getElementById('part-id').value = p.id; document.getElementById('part-name').value = p.name; document.getElementById('part-category').value = p.category; document.getElementById('part-purchase-price').value = p.purchase_price; document.getElementById('part-selling-price').value = p.selling_price; document.getElementById('part-quantity').value = p.quantity; document.getElementById('part-min-quantity').value = p.min_quantity; document.getElementById('part-supplier').value = p.supplier; } }
    else { document.getElementById('part-modal-title').textContent = 'إضافة قطعة'; document.getElementById('part-id').value = ''; }
};
async function savePart(e) {
    e.preventDefault();
    const id = document.getElementById('part-id').value;
    const data = { name: document.getElementById('part-name').value, category: document.getElementById('part-category').value, purchase_price: Number(document.getElementById('part-purchase-price').value) || 0, selling_price: Number(document.getElementById('part-selling-price').value) || 0, quantity: Number(document.getElementById('part-quantity').value) || 0, min_quantity: Number(document.getElementById('part-min-quantity').value) || 0, supplier: document.getElementById('part-supplier').value, ownerId };
    try { if (id) await updateDoc(doc(db, "parts", id), data); else await addDoc(collection(db, "parts"), data); await loadAllData(); hideModal('part-modal'); loadInventoryTable(); loadDashboard(); updateAlertsCount(); } catch(e) { console.error(e); }
}
function loadInventoryTable() {
    const s = (document.getElementById('part-search')?.value || '').toLowerCase();
    const filtered = globalParts.filter(p => !s || p.name?.toLowerCase().includes(s) || p.category?.toLowerCase().includes(s) || p.supplier?.toLowerCase().includes(s));
    const tv = globalParts.reduce((sum, p) => sum + (p.purchase_price || 0) * (p.quantity || 0), 0);
    document.getElementById('inventory-count').textContent = `${globalParts.length} صنف - ${globalParts.reduce((sum, p) => sum + (p.quantity || 0), 0)} قطعة`;
    document.getElementById('inventory-summary').innerHTML = `<div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-box"></i></div><p class="stat-card-title">قيمة المخزون</p><p class="stat-card-value">${formatCurrency(tv)}</p></div>`;
    document.getElementById('inventory-table-container').innerHTML = `<div class="table-responsive"><table><thead><tr><th>القطعة</th><th>التصنيف</th><th>سعر الشراء</th><th>سعر البيع</th><th>الكمية</th><th>المورد</th><th>إجراءات</th></tr></thead><tbody>${filtered.map(p => `<tr><td class="font-semibold">${p.name}</td><td><span class="badge badge-gray">${p.category}</span></td><td>${formatCurrency(p.purchase_price)}</td><td>${p.selling_price ? formatCurrency(p.selling_price) : '-'}</td><td class="font-bold ${p.min_quantity && p.quantity <= p.min_quantity ? 'text-amber-600' : ''}">${p.quantity}</td><td>${p.supplier || '-'}</td><td><button class="btn-icon" onclick="openPartForm('${p.id}')"><i class="fas fa-pen"></i></button><button class="btn-icon text-red" onclick="confirmDelete('part','${p.id}')"><i class="fas fa-trash"></i></button></td></tr>`).join('')}</tbody></table></div>`;
}

// ====== المصاريف ======
window.openExpenseForm = function(id = null) {
    showModal('expense-modal'); document.getElementById('expense-form').reset(); document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
    if (id) { const e = globalExpenses.find(e => e.id === id); if (e) { document.getElementById('expense-modal-title').textContent = 'تعديل مصروف'; document.getElementById('expense-id').value = e.id; document.getElementById('expense-title').value = e.title; document.getElementById('expense-category').value = e.category; document.getElementById('expense-amount').value = e.amount; document.getElementById('expense-date').value = e.date; } }
    else { document.getElementById('expense-modal-title').textContent = 'إضافة مصروف'; document.getElementById('expense-id').value = ''; }
};
async function saveExpense(e) {
    e.preventDefault();
    const id = document.getElementById('expense-id').value;
    const data = { title: document.getElementById('expense-title').value, category: document.getElementById('expense-category').value, amount: Number(document.getElementById('expense-amount').value) || 0, date: document.getElementById('expense-date').value, ownerId };
    try { if (id) await updateDoc(doc(db, "expenses", id), data); else await addDoc(collection(db, "expenses"), data); await loadAllData(); hideModal('expense-modal'); loadExpensesTable(); loadDashboard(); } catch(e) { console.error(e); }
}
function loadExpensesTable() {
    const s = (document.getElementById('expense-search')?.value || '').toLowerCase(), c = document.getElementById('expense-cat-filter')?.value || 'الكل';
    const filtered = globalExpenses.filter(e => (!s || e.title?.toLowerCase().includes(s)) && (c === 'الكل' || e.category === c));
    document.getElementById('expenses-count').textContent = `${globalExpenses.length} مصروف - إجمالي: ${formatCurrency(globalExpenses.reduce((sum, e) => sum + (e.amount || 0), 0))}`;
    document.getElementById('expenses-summary').innerHTML = `<div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-receipt"></i></div><p class="stat-card-title">إجمالي المصاريف</p><p class="stat-card-value">${formatCurrency(globalExpenses.reduce((sum, e) => sum + (e.amount || 0), 0))}</p></div>`;
    document.getElementById('expenses-list').innerHTML = filtered.map(e => `<div class="card"><div class="card-body"><div class="flex justify-between items-center"><div><p class="font-semibold">${e.title}</p><p class="text-xs text-gray-500">${e.date} · ${e.category}</p></div><div class="flex items-center gap-3"><span class="font-bold text-red-600">${formatCurrency(e.amount)}</span><button class="btn-icon" onclick="openExpenseForm('${e.id}')"><i class="fas fa-pen"></i></button><button class="btn-icon text-red" onclick="confirmDelete('expense','${e.id}')"><i class="fas fa-trash"></i></button></div></div></div></div>`).join('') || '<p class="text-center text-gray-400 py-10">لا توجد مصاريف</p>';
}

// ====== العملاء ======
function loadCustomersTable() {
    const s = (document.getElementById('customer-search')?.value || '').toLowerCase();
    const map = {}; globalRepairs.forEach(r => { const k = r.customer_phone || r.customer_name; if (!map[k]) map[k] = { name: r.customer_name, phone: r.customer_phone, repairs: [], totalPaid: 0 }; map[k].repairs.push(r); map[k].totalPaid += (r.repair_price || 0); });
    let customers = Object.values(map).map((c, i) => ({ ...c, id: i }));
    if (s) customers = customers.filter(c => c.name?.toLowerCase().includes(s) || c.phone?.includes(s));
    document.getElementById('customers-count').textContent = `${customers.length} عميل`;
    document.getElementById('customers-list').innerHTML = customers.map(c => `<div class="card customer-card" onclick="toggleCustomer(${c.id})"><div class="card-body"><div class="flex justify-between items-center"><div><p class="font-bold">${c.name}</p><p class="text-sm text-gray-500">📞 ${c.phone || '-'}</p></div><div class="flex items-center gap-3"><span class="font-bold text-blue-600">${formatCurrency(c.totalPaid)}</span><i class="fas fa-chevron-down text-gray-400" id="cc-${c.id}"></i></div></div><div class="customer-repairs mt-3 pt-3 hidden" id="cr-${c.id}">${c.repairs.map(r => `<div class="customer-repair-item"><div class="flex justify-between"><div><p class="font-semibold text-sm">${r.device_name}</p></div><span class="font-bold text-blue-600">${formatCurrency(r.repair_price)}</span></div></div>`).join('')}</div></div></div>`).join('') || '<p class="text-center text-gray-400 py-10">لا يوجد عملاء</p>';
}
window.toggleCustomer = function(id) { const d = document.getElementById('cr-' + id), c = document.getElementById('cc-' + id); if (d) { d.classList.toggle('hidden'); if (c) { c.classList.toggle('fa-chevron-down'); c.classList.toggle('fa-chevron-up'); } } };

// ====== المحافظ ======
function loadWallets() {
    document.getElementById('wallet-summary-cards').innerHTML = `<div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-wallet"></i></div><p class="stat-card-title">إجمالي الأرصدة</p><p class="stat-card-value">${formatCurrency(globalWallets.reduce((s, w) => s + (w.balance || 0), 0))}</p></div><div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-university"></i></div><p class="stat-card-title">عدد المحافظ</p><p class="stat-card-value">${globalWallets.length}</p></div>`;
    document.getElementById('wallets-table-body').innerHTML = globalWallets.map(w => `<tr><td class="font-semibold">${w.name}</td><td><span class="badge badge-blue">${walletLimits[w.type]?.label || w.type}</span></td><td class="font-bold">${formatCurrency(w.balance)}</td><td>${formatCurrency(w.daily_limit)}</td><td>${formatCurrency(w.daily_used)}</td><td>${(w.daily_used >= w.daily_limit) ? '<span class="badge badge-red">⚠️</span>' : '<span class="badge badge-green">آمن</span>'}</td><td><button class="btn-primary btn-xs" onclick="openTransactionModal('${w.id}')"><i class="fas fa-exchange-alt"></i></button><button class="btn-danger btn-xs" onclick="confirmDelete('wallet','${w.id}')"><i class="fas fa-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="7" class="text-center py-6">لا توجد محافظ</td></tr>';
    document.getElementById('wallet-transactions-body').innerHTML = globalTransactions.slice(0, 15).map(t => { const w = globalWallets.find(w => w.id === t.wallet_id); return `<tr><td class="text-sm">${t.date}</td><td>${w?.name || '—'}</td><td>${t.type === 'deposit' ? '<span class="badge badge-green">إيداع</span>' : '<span class="badge badge-red">سحب</span>'}</td><td class="font-bold">${formatCurrency(t.amount)}</td><td>${t.notes || ''}</td></tr>`; }).join('') || '<tr><td colspan="5" class="text-center py-6">لا توجد عمليات</td></tr>';
}
window.openWalletModal = function(id = null) { showModal('wallet-modal'); document.getElementById('wallet-form').reset(); document.getElementById('wallet-limits-info').classList.add('hidden'); if (id) { const w = globalWallets.find(w => w.id === id); if (w) { document.getElementById('wallet-id').value = w.id; document.getElementById('wallet-name').value = w.name; document.getElementById('wallet-type').value = w.type; } } };
async function saveWallet(e) {
    e.preventDefault();
    const id = document.getElementById('wallet-id').value, type = document.getElementById('wallet-type').value, limits = walletLimits[type] || walletLimits['vodafone'];
    const data = { name: document.getElementById('wallet-name').value, type, balance: 0, daily_used: 0, monthly_used: 0, daily_limit: limits.daily, monthly_limit: limits.monthly, max_balance: limits.max_balance, ownerId };
    try { if (id) { const w = globalWallets.find(w => w.id === id); data.balance = w?.balance || 0; data.daily_used = w?.daily_used || 0; data.monthly_used = w?.monthly_used || 0; await updateDoc(doc(db, "wallets", id), data); } else await addDoc(collection(db, "wallets"), data); await loadAllData(); hideModal('wallet-modal'); loadWallets(); } catch(e) { console.error(e); }
}
window.onWalletTypeChange = function() { const t = document.getElementById('wallet-type').value; if (t && walletLimits[t]) { document.getElementById('wallet-limits-info').classList.remove('hidden'); document.getElementById('wallet-limits-info').innerHTML = `الحد اليومي: <strong>${walletLimits[t].daily.toLocaleString()} ج.م</strong>`; } };
window.openTransactionModal = function(id) { showModal('transaction-modal'); document.getElementById('transaction-form').reset(); document.getElementById('transaction-wallet-id').value = id; };
async function saveTransaction(e) {
    e.preventDefault();
    const wid = document.getElementById('transaction-wallet-id').value, type = document.getElementById('transaction-type').value, amount = parseFloat(document.getElementById('transaction-amount').value);
    const w = globalWallets.find(w => w.id === wid); if (!w) return;
    if (type === 'withdraw' && amount > (w.balance || 0)) { document.getElementById('transaction-limit-warning').textContent = '❌ رصيد غير كافي'; document.getElementById('transaction-limit-warning').classList.remove('hidden'); return; }
    try { await updateDoc(doc(db, "wallets", wid), { balance: type === 'deposit' ? w.balance + amount : w.balance - amount, daily_used: type === 'withdraw' ? w.daily_used + amount : w.daily_used, monthly_used: type === 'withdraw' ? w.monthly_used + amount : w.monthly_used }); await addDoc(collection(db, "transactions"), { wallet_id: wid, type, amount, date: new Date().toISOString().split('T')[0], ownerId }); await loadAllData(); hideModal('transaction-modal'); loadWallets(); } catch(e) { console.error(e); }
}

// ====== التقارير ======
function loadReports() {
    const rev = globalRepairs.reduce((s, r) => s + (r.repair_price || 0), 0), pc = globalRepairs.reduce((s, r) => s + (r.spare_part_cost || 0), 0), ex = globalExpenses.reduce((s, e) => s + (e.amount || 0), 0), profit = rev - pc - ex;
    document.getElementById('reports-kpi').innerHTML = `<div class="stat-card"><p class="stat-card-title">الإيرادات</p><p class="stat-card-value">${formatCurrency(rev)}</p></div><div class="stat-card"><p class="stat-card-title">المصاريف</p><p class="stat-card-value">${formatCurrency(pc + ex)}</p></div><div class="stat-card"><p class="stat-card-title">صافي الربح</p><p class="stat-card-value">${formatCurrency(profit)}</p></div>`;
    document.getElementById('profit-breakdown').innerHTML = `<p class="font-bold text-teal-800 mb-3">تفصيل صافي الربح</p><div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm"><div class="bg-white rounded p-2">إيرادات: <strong>${formatCurrency(rev)}</strong></div><div class="bg-white rounded p-2">قطع: <strong>-${formatCurrency(pc)}</strong></div><div class="bg-white rounded p-2">مصاريف: <strong>-${formatCurrency(ex)}</strong></div><div class="bg-teal-100 rounded p-2">= <strong>${formatCurrency(profit)}</strong></div></div>`;
}

// ====== التنبيهات ======
function updateAlertsCount() { const low = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity).length; const badge = document.getElementById('alerts-count'); if (badge) { badge.textContent = low; badge.classList.toggle('hidden', low === 0); } }
function loadAlerts() {
    const lowAlerts = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity).map(p => ({ title: `مخزون منخفض: ${p.name}`, desc: `الكمية: ${p.quantity}` }));
    document.getElementById('alerts-summary-text').textContent = lowAlerts.length > 0 ? `${lowAlerts.length} تنبيه` : 'لا توجد تنبيهات';
    document.getElementById('alerts-summary').innerHTML = `<div class="stat-card bg-amber-50"><p class="text-xs">مخزون منخفض</p><p class="text-3xl font-bold text-amber-600">${lowAlerts.length}</p></div>`;
    document.getElementById('alerts-list').innerHTML = lowAlerts.length > 0 ? lowAlerts.map(a => `<div class="card bg-amber-50 border-r-4 border-amber-400"><div class="card-body"><p class="font-bold">${a.title}</p><p class="text-sm">${a.desc}</p></div></div>`).join('') : '<div class="card"><div class="card-body text-center py-10">✅ لا توجد تنبيهات</div></div>';
}

// ====== الاشتراكات ======
function loadSubscriptions() {
    globalSubscriptions.forEach(s => { if (s.status === 'نشط' && new Date(s.end_date) < new Date()) s.status = 'منتهي'; });
    document.getElementById('subs-count-text').textContent = `${globalSubscriptions.length} اشتراك`;
    document.getElementById('subscription-summary-cards').innerHTML = `<div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-check-circle"></i></div><p class="stat-card-title">نشطة</p><p class="stat-card-value">${globalSubscriptions.filter(s => s.status === 'نشط').length}</p></div><div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-times-circle"></i></div><p class="stat-card-title">منتهية</p><p class="stat-card-value">${globalSubscriptions.filter(s => s.status === 'منتهي').length}</p></div>`;
    document.getElementById('subscriptions-table-body').innerHTML = globalSubscriptions.map(s => `<tr><td class="font-semibold">${s.customer_name}</td><td class="text-sm">${s.customer_email}</td><td>${s.plan}</td><td class="text-sm">${s.end_date}</td><td>${getDaysLeft(s.end_date)}</td><td>${s.status === 'نشط' ? '<span class="badge badge-green">نشط</span>' : '<span class="badge badge-red">منتهي</span>'}</td><td><button class="btn-primary btn-xs" onclick="renewSubscription('${s.id}')"><i class="fas fa-sync-alt"></i></button><button class="btn-danger btn-xs" onclick="confirmDelete('subscription','${s.id}')"><i class="fas fa-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="7" class="text-center py-6">لا توجد اشتراكات</td></tr>';
}
window.openSubscriptionModal = function(id = null) {
    showModal('subscription-modal'); document.getElementById('subscription-form').reset(); document.getElementById('subscription-start-date').value = new Date().toISOString().split('T')[0];
    if (id) { const s = globalSubscriptions.find(s => s.id === id); if (s) { document.getElementById('subscription-id').value = s.id; document.getElementById('subscription-customer-name').value = s.customer_name; document.getElementById('subscription-customer-email').value = s.customer_email; document.getElementById('subscription-plan').value = s.plan; document.getElementById('subscription-price').value = s.price; document.getElementById('subscription-start-date').value = s.start_date; document.getElementById('subscription-end-date').value = s.end_date; } }
    else { document.getElementById('subscription-id').value = ''; onSubscriptionPlanChange(); }
};
window.onSubscriptionPlanChange = function() {
    const p = document.getElementById('subscription-plan').value, s = new Date(document.getElementById('subscription-start-date').value || new Date()), e = new Date(s);
    if (p === 'تجريبي') e.setDate(e.getDate() + 3); else if (p === 'شهري') e.setMonth(e.getMonth() + 1); else e.setFullYear(e.getFullYear() + 1);
    document.getElementById('subscription-end-date').value = e.toISOString().split('T')[0];
};
async function saveSubscription(e) {
    e.preventDefault();
    const id = document.getElementById('subscription-id').value;
    const data = { customer_name: document.getElementById('subscription-customer-name').value, customer_email: document.getElementById('subscription-customer-email').value, plan: document.getElementById('subscription-plan').value, price: Number(document.getElementById('subscription-price').value) || 0, start_date: document.getElementById('subscription-start-date').value, end_date: document.getElementById('subscription-end-date').value, status: 'نشط', ownerId };
    try { if (id) await updateDoc(doc(db, "subscriptions", id), data); else await addDoc(collection(db, "subscriptions"), data); await loadAllData(); hideModal('subscription-modal'); loadSubscriptions(); } catch(e) { console.error(e); }
}
window.renewSubscription = async function(id) { const s = globalSubscriptions.find(s => s.id === id); if (!s) return; const e = new Date(s.end_date); if (s.plan === 'شهري') e.setMonth(e.getMonth() + 1); else if (s.plan === 'سنوي') e.setFullYear(e.getFullYear() + 1); else e.setDate(e.getDate() + 3); await updateDoc(doc(db, "subscriptions", id), { end_date: e.toISOString().split('T')[0], status: 'نشط' }); await loadAllData(); loadSubscriptions(); };

// ====== الإعدادات ======
function loadSettings() {
    document.getElementById('set-shop-name').value = globalSettings.shop_name || '';
    document.getElementById('set-owner-name').value = globalSettings.owner_name || '';
    document.getElementById('set-phone').value = globalSettings.phone || '';
    renderTechnicians();
    updateInvoicePreview();
}
function renderTechnicians() { document.getElementById('technicians-list').innerHTML = globalTechnicians.map((t, i) => `<div class="flex justify-between items-center bg-gray-50 rounded-lg p-3 mb-2"><span>${t}</span><button class="btn-icon text-red" onclick="removeTechnician(${i})"><i class="fas fa-trash"></i></button></div>`).join('') || '<p class="text-sm text-gray-500">لا يوجد فنيين</p>'; }
window.addTechnician = function() { const input = document.getElementById('new-technician'); if (input.value.trim()) { globalTechnicians.push(input.value.trim()); input.value = ''; renderTechnicians(); updateTechSelects(); } };
function removeTechnician(i) { globalTechnicians.splice(i, 1); renderTechnicians(); updateTechSelects(); }
function updateTechSelects() { const sel = document.getElementById('repair-technician'); if (sel) sel.innerHTML = globalTechnicians.map(t => `<option value="${t}">${t}</option>`).join(''); }
function updateInvoicePreview() { document.getElementById('preview-shop-name').textContent = document.getElementById('set-shop-name').value || 'اسم المحل'; document.getElementById('preview-phone').textContent = document.getElementById('set-phone').value ? '📞 ' + document.getElementById('set-phone').value : ''; }
window.saveSettings = async function() {
    globalSettings.shop_name = document.getElementById('set-shop-name').value;
    globalSettings.owner_name = document.getElementById('set-owner-name').value;
    globalSettings.phone = document.getElementById('set-phone').value;
    globalSettings.technicians = globalTechnicians;
    await setDoc(doc(db, "settings", ownerId), globalSettings, { merge: true });
    alert('✅ تم الحفظ');
};

// ====== الحذف ======
window.confirmDelete = function(type, id) {
    deleteTarget = { type, id };
    const labels = { repair: 'أمر الصيانة', part: 'القطعة', expense: 'المصروف', wallet: 'المحفظة', subscription: 'الاشتراك' };
    let name = '';
    if (type === 'repair') name = globalRepairs.find(i => i.id === id)?.device_name;
    if (type === 'part') name = globalParts.find(i => i.id === id)?.name;
    if (type === 'expense') name = globalExpenses.find(i => i.id === id)?.title;
    if (type === 'wallet') name = globalWallets.find(i => i.id === id)?.name;
    if (type === 'subscription') name = globalSubscriptions.find(i => i.id === id)?.customer_name;
    document.getElementById('delete-message').textContent = `حذف ${labels[type] || ''} "${name || ''}"؟`;
    showModal('delete-modal');
    document.getElementById('delete-confirm-btn').onclick = async function() {
        try { if (type === 'repair') await deleteDoc(doc(db, "repairs", id)); if (type === 'part') await deleteDoc(doc(db, "parts", id)); if (type === 'expense') await deleteDoc(doc(db, "expenses", id)); if (type === 'wallet') await deleteDoc(doc(db, "wallets", id)); if (type === 'subscription') await deleteDoc(doc(db, "subscriptions", id)); await loadAllData(); hideModal('delete-modal'); loadDashboard(); updateAlertsCount(); } catch(e) { console.error(e); }
    };
};

document.addEventListener('DOMContentLoaded', initApp);
