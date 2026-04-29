// ================================
// Firebase Configuration & Initialization
// ================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
let currentUser = null;
let ownerId = null;
let isReordering = false;
let deleteTarget = null;
let charts = {};
let globalRepairs = [], globalParts = [], globalExpenses = [], globalWallets = [], globalTransactions = [], globalSubscriptions = [], globalUsers = [], globalSettings = {}, globalTechnicians = ['عان', 'تحن', 'قنب'];

// ================================
// حدود المحافظ
// ================================
const walletLimits = {
    'vodafone': { daily: 60000, monthly: 200000, max_balance: 100000, label: 'فودافون كاش' },
    'orange': { daily: 60000, monthly: 200000, max_balance: 100000, label: 'أورانج كاش' },
    'etisalat': { daily: 60000, monthly: 200000, max_balance: 100000, label: 'اتصالات كاش' },
    'we': { daily: 60000, monthly: 200000, max_balance: 100000, label: 'وي كاش' },
    'bank': { daily: 60000, monthly: 200000, max_balance: 100000, label: 'محفظة بنكية' },
    'instapay': { daily: 120000, monthly: 400000, max_balance: 999999999, label: 'إنستاباي' },
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
    const end = new Date(endDate), today = new Date();
    const diff = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `<span class="badge badge-red">منتهي</span>`;
    if (diff === 0) return '<span class="badge badge-red">ينتهي اليوم</span>';
    if (diff <= 30) return `<span class="badge badge-amber">متبقي ${diff} يوم</span>`;
    return `<span class="badge badge-green">متبقي ${diff} يوم</span>`;
}
function showLoading() { document.getElementById('loading-overlay').classList.add('show'); }
function hideLoading() { document.getElementById('loading-overlay').classList.remove('show'); }
function showModal(id) { document.getElementById(id).classList.add('show'); }
function hideModal(id) { document.getElementById(id).classList.remove('show'); }

// ================================
// بدء التطبيق
// ================================
async function initApp() {
    showLoading();
    
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        
        currentUser = user;
        ownerId = user.uid;
        
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            
            if (!userDoc.exists()) {
                const trialEnd = new Date();
                trialEnd.setDate(trialEnd.getDate() + 3);
                
                await setDoc(doc(db, "users", user.uid), {
                    name: user.displayName || 'مستخدم',
                    email: user.email,
                    photo: user.photoURL || '',
                    role: 'user',
                    created_at: serverTimestamp(),
                    subscription: { plan: 'تجريبي', status: 'نشط', start_date: new Date().toISOString().split('T')[0], end_date: trialEnd.toISOString().split('T')[0], price: 0 }
                });
            }
            
            const userData = (await getDoc(doc(db, "users", user.uid))).data();
            if (userData.subscription?.status !== 'نشط' || new Date(userData.subscription?.end_date) < new Date()) {
                window.location.href = 'login.html';
                return;
            }
            
            document.getElementById('sidebar-user-name').textContent = userData.name || user.displayName;
            document.getElementById('sidebar-user-role').textContent = userData.role === 'admin' ? 'مدير النظام' : 'مستخدم';
            document.getElementById('sidebar-user-photo').src = userData.photo || user.photoURL || '';
            
            if (userData.role === 'admin') {
                const usersSnap = await getDocs(collection(db, "users"));
                globalUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            }
            
            await loadAllData();
            initEvents();
            loadDashboard();
            loadSettings();
            updateInvoicePreview();
            updateAlertsCount();
            hideLoading();
            
        } catch (error) {
            console.error("خطأ في initApp:", error);
            hideLoading();
        }
    });
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
            getDoc(doc(db, "settings", ownerId))
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
            globalSettings = { shop_name: 'jumlazy', owner_name: 'اسم حسن', phone: '01207696202', address: 'المقطر', warranty_days: 30, warranty_notes: '', language: 'ar', technicians: globalTechnicians };
            await setDoc(doc(db, "settings", ownerId), globalSettings);
        }
    } catch (error) {
        console.error("خطأ في loadAllData:", error);
        globalRepairs = []; globalParts = []; globalExpenses = []; globalWallets = []; globalTransactions = []; globalSubscriptions = [];
    }
}

// ================================
// أحداث الواجهة
// ================================
function initEvents() {
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
    
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    // ربط النماذج
    document.getElementById('repair-form').addEventListener('submit', saveRepair);
    document.getElementById('part-form').addEventListener('submit', savePart);
    document.getElementById('expense-form').addEventListener('submit', saveExpense);
    document.getElementById('wallet-form').addEventListener('submit', saveWallet);
    document.getElementById('transaction-form').addEventListener('submit', saveTransaction);
    document.getElementById('subscription-form').addEventListener('submit', saveSubscription);
    document.getElementById('set-shop-name').addEventListener('input', updateInvoicePreview);
    document.getElementById('set-owner-name').addEventListener('input', updateInvoicePreview);
    document.getElementById('set-phone').addEventListener('input', updateInvoicePreview);
    document.getElementById('set-address').addEventListener('input', updateInvoicePreview);
}

async function logout() {
    await signOut(auth);
    localStorage.removeItem('jumlagy_session');
    window.location.href = 'login.html';
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

function toggleReorder() {
    isReordering = !isReordering;
    document.getElementById('btn-reorder').innerHTML = isReordering ? '<i class="fas fa-check"></i> حفظ الترتيب' : '<i class="fas fa-grip-vertical"></i> تعديل الأقسام';
    document.getElementById('btn-reorder').className = isReordering ? 'btn-primary btn-sm' : 'btn-outline btn-sm';
}

// ================================
// 1. لوحة التحكم
// ================================
function loadDashboard() {
    const rev = globalRepairs.reduce((s, r) => s + (r.repair_price || 0), 0);
    const partsCost = globalRepairs.reduce((s, r) => s + (r.spare_part_cost || 0), 0);
    const techFees = globalRepairs.reduce((s, r) => s + (r.technician_fee || 0), 0);
    const expTotal = globalExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const costs = partsCost + techFees + expTotal;
    const profit = rev - costs;
    const inventoryVal = globalParts.reduce((s, p) => s + (p.purchase_price || 0) * (p.quantity || 0), 0);
    
    document.getElementById('stats-cards').innerHTML = `
        <div class="stat-card"><div class="stat-card-icon icon-blue"><i class="fas fa-dollar-sign"></i></div><p class="stat-card-title">إجمالي الإيرادات</p><p class="stat-card-value">${formatCurrency(rev)}</p></div>
        <div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-wrench"></i></div><p class="stat-card-title">إجمالي المصروفات</p><p class="stat-card-value">${formatCurrency(costs)}</p><p class="stat-card-sub">قطع: ${formatCurrency(partsCost)} | أخرى: ${formatCurrency(techFees + expTotal)}</p></div>
        <div class="stat-card"><div class="stat-card-icon ${profit >= 0 ? 'icon-green' : 'icon-red'}"><i class="fas fa-chart-line"></i></div><p class="stat-card-title">صافي الأرباح</p><p class="stat-card-value">${formatCurrency(profit)}</p><p class="stat-card-sub">${profit >= 0 ? '✅ رابح' : '⚠️ خاسر'}</p></div>
        <div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-box"></i></div><p class="stat-card-title">قيمة المخزون</p><p class="stat-card-value">${formatCurrency(inventoryVal)}</p><p class="stat-card-sub">${globalParts.length} صنف</p></div>
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
    let alertHTML = lowParts.length > 0 ? '<div class="alert alert-warning text-sm mb-2">⚠️ قطع منخفضة المخزون:</div>' + lowParts.map(p => `<div class="flex justify-between bg-amber-50 rounded-lg px-3 py-2 mb-1 text-sm"><span>${p.name}</span><span class="font-bold">${p.quantity} متبقي</span></div>`).join('') : '<div class="alert alert-success text-sm">✅ جميع القطع متوفرة</div>';
    document.getElementById('out-of-stock-alerts').innerHTML = alertHTML;
    
    document.getElementById('recent-repairs').innerHTML = globalRepairs.slice(0, 5).map(r => `
        <div class="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-3">
            <div><p class="font-semibold text-sm">${r.device_name}</p><p class="text-xs text-gray-500">${r.customer_name}</p></div>
            <div class="flex items-center gap-3">${getStatusBadge(r.status)}<span class="font-bold text-blue-600 text-sm">${formatCurrency(r.repair_price)}</span></div>
        </div>`).join('') || '<p class="text-center text-gray-400 py-6">لا توجد أوامر صيانة بعد</p>';
    
    if (globalUsers.length) document.getElementById('users-manager').innerHTML = globalUsers.map(u => `<div class="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2"><span class="font-medium text-sm">${u.name || u.email}</span><span class="text-xs text-gray-500">${u.subscription?.plan || '-'}</span></div>`).join('');
    
    setTimeout(loadDashboardCharts, 200);
}

function loadDashboardCharts() {
    const ctx1 = document.getElementById('ordersStatusChart'), ctx2 = document.getElementById('incomeExpenseChart');
    if (!ctx1 || !ctx2) return;
    if (charts.orders) charts.orders.destroy();
    if (charts.income) charts.income.destroy();
    
    charts.orders = new Chart(ctx1, {
        type: 'doughnut',
        data: { labels: ['تم التسليم', 'قيد الصيانة', 'جاهز'], datasets: [{ data: [globalRepairs.filter(r => r.status === 'تم_التسليم').length, globalRepairs.filter(r => r.status === 'قيد_الصيانة').length, globalRepairs.filter(r => r.status === 'جاهز').length], backgroundColor: ['#3b82f6', '#f59e0b', '#10b981'] }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Tajawal', size: 12 } } } } }
    });
    
    charts.income = new Chart(ctx2, {
        type: 'line',
        data: { labels: ['يناير', 'فبراير', 'مارس', 'أبريل'], datasets: [{ label: 'الإيرادات', data: [5000, 6000, 7000, 9130], borderColor: '#3b82f6', fill: true, tension: 0.4 }, { label: 'المصاريف', data: [1000, 800, 500, 55], borderColor: '#ef4444', fill: true, tension: 0.4 }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Tajawal', size: 12 } } } }, scales: { y: { ticks: { callback: v => v.toLocaleString() } } } }
    });
}

// ================================
// 2. أوامر الصيانة
// ================================
function openRepairForm(id = null) {
    showModal('repair-modal');
    document.getElementById('repair-form').reset();
    document.getElementById('repair-receive-date').value = new Date().toISOString().split('T')[0];
    updateTechSelects();
    if (id) {
        const r = globalRepairs.find(r => r.id === id);
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
        if (id) { await updateDoc(doc(db, "repairs", id), data); }
        else { await addDoc(collection(db, "repairs"), data); }
        await loadAllData(); closeRepairForm(); loadRepairsTable(); loadDashboard(); updateAlertsCount(); hideLoading();
    } catch (e) { console.error(e); hideLoading(); }
}

function loadRepairsTable() {
    const search = (document.getElementById('repair-search')?.value || '').toLowerCase();
    const filter = document.getElementById('repair-filter')?.value || 'all';
    const filtered = globalRepairs.filter(r => (!search || r.device_name?.toLowerCase().includes(search) || r.customer_name?.toLowerCase().includes(search)) && (filter === 'all' || r.status === filter));
    document.getElementById('repairs-count').textContent = `${globalRepairs.length} أمر صيانة`;
    document.getElementById('repairs-table-container').innerHTML = `<div class="table-responsive"><table><thead><tr><th>الجهاز</th><th>العميل</th><th>الفني</th><th>الحالة</th><th>السعر</th><th>تاريخ الاستلام</th><th>إجراءات</th></tr></thead><tbody>${filtered.map(r => `<tr><td class="font-semibold">${r.device_name}</td><td>${r.customer_name}<br><span class="text-xs text-gray-400">${r.customer_phone||''}</span></td><td>${r.technician}</td><td>${getStatusBadge(r.status)}</td><td class="font-bold text-blue-600">${formatCurrency(r.repair_price)}</td><td class="text-sm">${r.receive_date}</td><td><button class="btn-icon" onclick="openRepairForm('${r.id}')"><i class="fas fa-pen"></i></button><button class="btn-icon text-red" onclick="confirmDelete('repair','${r.id}')"><i class="fas fa-trash"></i></button></td></tr>`).join('')}</tbody></table></div>`;
}

function openBarcodeScanner() { alert('خاصية مسح الباركود ستُفعل قريباً.'); }

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
    };
    try {
        if (id) { await updateDoc(doc(db, "parts", id), data); }
        else { await addDoc(collection(db, "parts"), data); }
        await loadAllData(); closePartForm(); loadInventoryTable(); loadDashboard(); updateAlertsCount(); hideLoading();
    } catch (e) { console.error(e); hideLoading(); }
}

function loadInventoryTable() {
    const search = (document.getElementById('part-search')?.value || '').toLowerCase();
    const filtered = globalParts.filter(p => !search || p.name?.toLowerCase().includes(search) || p.category?.toLowerCase().includes(search) || p.supplier?.toLowerCase().includes(search));
    const totalVal = globalParts.reduce((s, p) => s + (p.purchase_price || 0) * (p.quantity || 0), 0);
    const totalItems = globalParts.reduce((s, p) => s + (p.quantity || 0), 0);
    
    document.getElementById('inventory-count').textContent = `${globalParts.length} صنف - ${totalItems} قطعة`;
    document.getElementById('inventory-summary').innerHTML = `
        <div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-box"></i></div><p class="stat-card-title">قيمة المخزون</p><p class="stat-card-value">${formatCurrency(totalVal)}</p></div>
        <div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-cubes"></i></div><p class="stat-card-title">إجمالي القطع</p><p class="stat-card-value">${totalItems}</p></div>
    `;
    document.getElementById('inventory-table-container').innerHTML = `
        <div class="table-responsive"><table><thead><tr><th>القطعة</th><th>التصنيف</th><th>سعر الشراء</th><th>سعر البيع</th><th>الكمية</th><th>المورد</th><th>إجراءات</th></tr></thead>
        <tbody>${filtered.map(p => `<tr>
            <td class="font-semibold">${p.name}</td><td><span class="badge badge-gray">${p.category}</span></td>
            <td>${formatCurrency(p.purchase_price)}</td><td>${p.selling_price ? formatCurrency(p.selling_price) : '-'}</td>
            <td class="font-bold ${p.min_quantity && p.quantity <= p.min_quantity ? 'text-amber-600' : ''}">${p.quantity} ${p.min_quantity && p.quantity <= p.min_quantity ? '⚠️' : ''}</td>
            <td>${p.supplier || '-'}</td>
            <td><button class="btn-icon" onclick="openPartForm('${p.id}')"><i class="fas fa-pen"></i></button><button class="btn-icon text-red" onclick="confirmDelete('part','${p.id}')"><i class="fas fa-trash"></i></button></td>
        </tr>`).join('')}</tbody></table></div>
    `;
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
    } else { document.getElementById('expense-modal-title').textContent = 'إضافة مصروف'; document.getElementById('expense-id').value = ''; }
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
        await loadAllData(); closeExpenseForm(); loadExpensesTable(); loadDashboard(); hideLoading();
    } catch (e) { console.error(e); hideLoading(); }
}

function loadExpensesTable() {
    const search = (document.getElementById('expense-search')?.value || '').toLowerCase();
    const cat = document.getElementById('expense-cat-filter')?.value || 'الكل';
    const filtered = globalExpenses.filter(e => (!search || e.title?.toLowerCase().includes(search)) && (cat === 'الكل' || e.category === cat));
    const total = globalExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    
    document.getElementById('expenses-count').textContent = `${globalExpenses.length} مصروف — إجمالي: ${formatCurrency(total)}`;
    document.getElementById('expenses-summary').innerHTML = `
        <div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-receipt"></i></div><p class="stat-card-title">إجمالي المصاريف</p><p class="stat-card-value">${formatCurrency(total)}</p></div>
        <div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-sync-alt"></i></div><p class="stat-card-title">مصاريف متكررة</p><p class="stat-card-value">${formatCurrency(globalExpenses.filter(e => e.is_recurring).reduce((s, e) => s + (e.amount || 0), 0))}</p></div>
    `;
    document.getElementById('expenses-list').innerHTML = filtered.map(e => `
        <div class="card"><div class="card-body"><div class="flex justify-between items-center">
            <div class="flex items-center gap-3"><div class="p-2 rounded-lg bg-gray-100"><i class="fas fa-receipt text-gray-500"></i></div><div><p class="font-semibold">${e.title}</p><p class="text-xs text-gray-500">${e.date} · ${e.category}</p></div></div>
            <div class="flex items-center gap-3"><span class="font-bold text-red-600">${formatCurrency(e.amount)}</span><button class="btn-icon" onclick="openExpenseForm('${e.id}')"><i class="fas fa-pen"></i></button><button class="btn-icon text-red" onclick="confirmDelete('expense','${e.id}')"><i class="fas fa-trash"></i></button></div>
        </div></div></div>
    `).join('') || '<p class="text-center text-gray-400 py-10">لا توجد مصاريف</p>';
}

// ================================
// 5. العملاء
// ================================
function loadCustomersTable() {
    const search = (document.getElementById('customer-search')?.value || '').toLowerCase();
    const map = {};
    globalRepairs.forEach(r => {
        const key = r.customer_phone || r.customer_name;
        if (!map[key]) map[key] = { name: r.customer_name, phone: r.customer_phone, repairs: [], totalPaid: 0 };
        map[key].repairs.push(r);
        map[key].totalPaid += (r.repair_price || 0);
    });
    let customers = Object.values(map).map((c, i) => ({ ...c, id: i, lastVisit: c.repairs[0]?.receive_date || '-' }));
    if (search) customers = customers.filter(c => c.name?.toLowerCase().includes(search) || c.phone?.includes(search));
    
    document.getElementById('customers-count').textContent = `${customers.length} عميل`;
    document.getElementById('customers-summary').innerHTML = `
        <div class="stat-card"><div class="stat-card-icon icon-blue"><i class="fas fa-users"></i></div><p class="stat-card-title">العملاء</p><p class="stat-card-value">${customers.length}</p></div>
        <div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-dollar-sign"></i></div><p class="stat-card-title">الإيرادات</p><p class="stat-card-value">${formatCurrency(customers.reduce((s, c) => s + c.totalPaid, 0))}</p></div>
    `;
    document.getElementById('customers-list').innerHTML = customers.map(c => `
        <div class="card customer-card" onclick="toggleCustomerRepairs(${c.id})">
            <div class="card-body"><div class="flex justify-between items-center">
                <div class="flex items-center gap-3"><div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><i class="fas fa-user text-blue-600"></i></div><div><p class="font-bold">${c.name}</p><p class="text-sm text-gray-500">📞 ${c.phone || '-'}</p></div></div>
                <div class="flex items-center gap-4"><div class="text-center"><p class="text-xs text-gray-400">أجهزة</p><p class="font-bold">${c.repairs.length}</p></div><div class="text-center"><p class="text-xs text-gray-400">مدفوع</p><p class="font-bold text-blue-600">${formatCurrency(c.totalPaid)}</p></div><i class="fas fa-chevron-down text-gray-400" id="customer-chevron-${c.id}"></i></div>
            </div>
            <div class="customer-repairs mt-3 pt-3 hidden" id="customer-repairs-${c.id}">
                ${c.repairs.map(r => `<div class="customer-repair-item"><div class="flex justify-between items-center"><div><p class="font-semibold text-sm">${r.device_name}</p><p class="text-xs text-gray-500">${r.receive_date} · ${r.technician}</p></div><div class="flex items-center gap-2">${getStatusBadge(r.status)}<span class="font-bold text-blue-600">${formatCurrency(r.repair_price)}</span></div></div></div>`).join('')}
            </div></div>
        </div>
    `).join('') || '<p class="text-center text-gray-400 py-10">لا يوجد عملاء</p>';
}
function toggleCustomerRepairs(id) {
    const div = document.getElementById('customer-repairs-' + id);
    const chevron = document.getElementById('customer-chevron-' + id);
    if (div) { div.classList.toggle('hidden'); if (chevron) { chevron.classList.toggle('fa-chevron-down'); chevron.classList.toggle('fa-chevron-up'); } }
}

// ================================
// 6. المحافظ الإلكترونية
// ================================
function loadWallets() {
    const totalBal = globalWallets.reduce((s, w) => s + (w.balance || 0), 0);
    document.getElementById('wallet-summary-cards').innerHTML = `
        <div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-wallet"></i></div><p class="stat-card-title">إجمالي الأرصدة</p><p class="stat-card-value">${formatCurrency(totalBal)}</p></div>
        <div class="stat-card"><div class="stat-card-icon icon-blue"><i class="fas fa-calendar-day"></i></div><p class="stat-card-title">المستعمل اليوم</p><p class="stat-card-value">${formatCurrency(globalWallets.reduce((s, w) => s + (w.daily_used || 0), 0))}</p></div>
        <div class="stat-card"><div class="stat-card-icon icon-amber"><i class="fas fa-calendar-alt"></i></div><p class="stat-card-title">المستعمل الشهر</p><p class="stat-card-value">${formatCurrency(globalWallets.reduce((s, w) => s + (w.monthly_used || 0), 0))}</p></div>
        <div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-university"></i></div><p class="stat-card-title">عدد المحافظ</p><p class="stat-card-value">${globalWallets.length}</p></div>
    `;
    document.getElementById('wallets-table-body').innerHTML = globalWallets.map(w => {
        const pctD = w.daily_limit > 0 ? Math.round((w.daily_used / w.daily_limit) * 100) : 0;
        const status = (w.daily_used >= w.daily_limit) ? '<span class="badge badge-red">⚠️ تعدى</span>' : (pctD >= 80 ? '<span class="badge badge-amber">قرب</span>' : '<span class="badge badge-green">آمن</span>');
        return `<tr><td class="font-semibold">${w.name}</td><td><span class="badge badge-blue">${walletLimits[w.type]?.label||w.type}</span></td><td class="font-bold">${formatCurrency(w.balance)}</td><td>${formatCurrency(w.daily_limit)}</td><td>${formatCurrency(w.daily_used)}</td><td>${formatCurrency(w.monthly_limit)}</td><td>${formatCurrency(w.monthly_used)}</td><td>${status}</td><td><button class="btn-primary btn-xs" onclick="openTransactionModal('${w.id}')"><i class="fas fa-exchange-alt"></i></button><button class="btn-danger btn-xs" onclick="confirmDelete('wallet','${w.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
    }).join('') || '<tr><td colspan="9" class="text-center py-6 text-gray-400">لا توجد محافظ</td></tr>';
    
    document.getElementById('wallet-transactions-body').innerHTML = globalTransactions.slice(0, 15).map(t => {
        const w = globalWallets.find(w => w.id === t.wallet_id);
        return `<tr><td class="text-sm">${t.date}</td><td class="font-semibold">${w?.name||'—'}</td><td>${t.type==='deposit'?'<span class="badge badge-green">إيداع</span>':'<span class="badge badge-red">سحب</span>'}</td><td class="font-bold">${formatCurrency(t.amount)}</td><td class="text-sm text-gray-500">${t.notes||'—'}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="text-center py-6 text-gray-400">لا توجد عمليات</td></tr>';
}
function onWalletTypeChange() {
    const type = document.getElementById('wallet-type').value;
    const info = document.getElementById('wallet-limits-info');
    if (type && walletLimits[type]) { info.classList.remove('hidden'); info.innerHTML = `الحد اليومي: <strong>${walletLimits[type].daily.toLocaleString()} ج.م</strong> | الشهري: <strong>${walletLimits[type].monthly.toLocaleString()} ج.م</strong>`; }
    else { info.classList.add('hidden'); }
}
function openWalletModal(id = null) {
    showModal('wallet-modal'); document.getElementById('wallet-form').reset(); document.getElementById('wallet-limits-info').classList.add('hidden');
    if (id) { const w = globalWallets.find(w => w.id === id); if (w) { document.getElementById('wallet-modal-title').textContent='تعديل محفظة'; document.getElementById('wallet-id').value=w.id; document.getElementById('wallet-name').value=w.name; document.getElementById('wallet-phone').value=w.phone||''; document.getElementById('wallet-type').value=w.type; onWalletTypeChange(); } }
    else { document.getElementById('wallet-modal-title').textContent='إضافة محفظة جديدة'; document.getElementById('wallet-id').value=''; }
}
function closeWalletModal() { hideModal('wallet-modal'); }
async function saveWallet(e) {
    e.preventDefault();
    const id = document.getElementById('wallet-id').value;
    const type = document.getElementById('wallet-type').value;
    const limits = walletLimits[type] || walletLimits['vodafone'];
    const data = { name: document.getElementById('wallet-name').value, phone: document.getElementById('wallet-phone').value, type, balance: 0, daily_used: 0, monthly_used: 0, daily_limit: limits.daily, monthly_limit: limits.monthly, max_balance: limits.max_balance, ownerId };
    try {
        if (id) { const w = globalWallets.find(w => w.id === id); data.balance = w?.balance||0; data.daily_used = w?.daily_used||0; data.monthly_used = w?.monthly_used||0; await updateDoc(doc(db, "wallets", id), data); }
        else { await addDoc(collection(db, "wallets"), data); }
        await loadAllData(); closeWalletModal(); loadWallets();
    } catch (e) { console.error(e); }
}
function openTransactionModal(id) { showModal('transaction-modal'); document.getElementById('transaction-form').reset(); document.getElementById('transaction-wallet-id').value=id; document.getElementById('transaction-limit-warning').classList.add('hidden'); }
function closeTransactionModal() { hideModal('transaction-modal'); }
async function saveTransaction(e) {
    e.preventDefault();
    const walletId = document.getElementById('transaction-wallet-id').value;
    const type = document.getElementById('transaction-type').value;
    const amount = parseFloat(document.getElementById('transaction-amount').value);
    const notes = document.getElementById('transaction-notes').value;
    const wallet = globalWallets.find(w => w.id === walletId);
    if (!wallet) return;
    const warn = document.getElementById('transaction-limit-warning');
    if (type === 'withdraw') {
        if (amount > (wallet.balance||0)) { warn.textContent='❌ رصيد غير كافي.'; warn.classList.remove('hidden'); return; }
        if ((wallet.daily_used+amount) > wallet.daily_limit) { warn.textContent='❌ تتجاوز الحد اليومي.'; warn.classList.remove('hidden'); return; }
        await updateDoc(doc(db, "wallets", walletId), { balance: wallet.balance - amount, daily_used: wallet.daily_used + amount, monthly_used: wallet.monthly_used + amount });
    } else {
        await updateDoc(doc(db, "wallets", walletId), { balance: wallet.balance + amount });
    }
    await addDoc(collection(db, "transactions"), { wallet_id: walletId, type, amount, date: new Date().toISOString().split('T')[0], notes, ownerId });
    await loadAllData(); closeTransactionModal(); loadWallets();
}

// ================================
// 7. التقارير
// ================================
function loadReports() {
    const rev = globalRepairs.reduce((s, r) => s + (r.repair_price || 0), 0);
    const pc = globalRepairs.reduce((s, r) => s + (r.spare_part_cost || 0), 0);
    const tf = globalRepairs.reduce((s, r) => s + (r.technician_fee || 0), 0);
    const ex = globalExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const profit = rev - pc - tf - ex;
    document.getElementById('reports-kpi').innerHTML = `
        <div class="stat-card"><p class="stat-card-title">الإيرادات</p><p class="stat-card-value">${formatCurrency(rev)}</p></div>
        <div class="stat-card"><p class="stat-card-title">ربح الصيانة</p><p class="stat-card-value">${formatCurrency(rev-pc-tf)}</p></div>
        <div class="stat-card"><p class="stat-card-title">المصاريف</p><p class="stat-card-value">${formatCurrency(ex)}</p></div>
        <div class="stat-card"><p class="stat-card-title">صافي الربح</p><p class="stat-card-value">${formatCurrency(profit)}</p></div>
    `;
    document.getElementById('profit-breakdown').innerHTML = `<p class="font-bold text-teal-800 mb-3">تفصيل صافي الربح</p><div class="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm"><div class="bg-white rounded p-2">إيرادات: <strong>${formatCurrency(rev)}</strong></div><div class="bg-white rounded p-2">قطع: <strong>-${formatCurrency(pc)}</strong></div><div class="bg-white rounded p-2">فنيين: <strong>-${formatCurrency(tf)}</strong></div><div class="bg-white rounded p-2">مصاريف: <strong>-${formatCurrency(ex)}</strong></div><div class="bg-teal-100 rounded p-2">= <strong>${formatCurrency(profit)}</strong></div></div>`;
}

// ================================
// 8. التنبيهات
// ================================
function updateAlertsCount() {
    const low = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity).length;
    const overdue = globalRepairs.filter(r => r.status !== 'تم_التسليم' && r.delivery_date && new Date(r.delivery_date) < new Date()).length;
    const total = low + overdue;
    const badge = document.getElementById('alerts-count');
    if (badge) { badge.textContent = total; badge.style.display = total > 0 ? 'inline-block' : 'none'; }
}
function loadAlerts() {
    const now = new Date();
    const lowAlerts = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity).map(p => ({ title: `مخزون منخفض: ${p.name}`, desc: `الكمية: ${p.quantity}`, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-r-amber-400', icon: 'fa-box' }));
    const overdueAlerts = globalRepairs.filter(r => r.delivery_date && r.status !== 'تم_التسليم' && new Date(r.delivery_date) < now).map(r => ({ title: `تأخر تسليم: ${r.device_name}`, desc: `العميل: ${r.customer_name}`, color: 'text-red-600', bg: 'bg-red-50', border: 'border-r-red-500', icon: 'fa-clock' }));
    const all = [...overdueAlerts, ...lowAlerts];
    document.getElementById('alerts-summary-text').textContent = all.length > 0 ? `${all.length} تنبيه` : 'لا توجد تنبيهات';
    document.getElementById('alerts-summary').innerHTML = `<div class="stat-card bg-red-50"><p class="text-xs">تأخر تسليم</p><p class="text-3xl font-bold text-red-600">${overdueAlerts.length}</p></div><div class="stat-card bg-amber-50"><p class="text-xs">مخزون منخفض</p><p class="text-3xl font-bold text-amber-600">${lowAlerts.length}</p></div>`;
    document.getElementById('alerts-list').innerHTML = all.length > 0 ? all.map(a => `<div class="card ${a.bg} border-r-4 ${a.border}"><div class="card-body"><div class="flex gap-3"><i class="fas ${a.icon} ${a.color} text-lg"></i><div><p class="font-bold">${a.title}</p><p class="text-sm">${a.desc}</p></div></div></div></div>`).join('') : '<div class="card"><div class="card-body text-center py-10">✅ لا توجد تنبيهات</div></div>';
}

// ================================
// 9. الاشتراكات
// ================================
function loadSubscriptions() {
    globalSubscriptions.forEach(s => { if (s.status === 'نشط' && new Date(s.end_date) < new Date()) s.status = 'منتهي'; });
    const search = (document.getElementById('sub-search')?.value || '').toLowerCase();
    const filter = document.getElementById('sub-filter')?.value || 'all';
    const filtered = globalSubscriptions.filter(s => (!search || s.customer_name?.toLowerCase().includes(search) || s.customer_email?.toLowerCase().includes(search)) && (filter === 'all' || s.status === filter));
    document.getElementById('subs-count-text').textContent = `${globalSubscriptions.length} عميل`;
    document.getElementById('subscription-summary-cards').innerHTML = `
        <div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-check-circle"></i></div><p class="stat-card-title">نشطة</p><p class="stat-card-value">${globalSubscriptions.filter(s => s.status==='نشط').length}</p></div>
        <div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-times-circle"></i></div><p class="stat-card-title">منتهية</p><p class="stat-card-value">${globalSubscriptions.filter(s => s.status==='منتهي').length}</p></div>
    `;
    document.getElementById('subscriptions-table-body').innerHTML = filtered.map((s, i) => {
        const devices = globalRepairs.filter(r => r.customer_name === s.customer_name).length;
        return `<tr><td>${i+1}</td><td class="font-semibold">${s.customer_name}</td><td class="text-sm">${s.customer_email}</td><td>${s.plan}</td><td class="font-bold">${formatCurrency(s.price)}</td><td class="text-sm">${s.start_date}</td><td class="text-sm">${s.end_date}</td><td>${getDaysLeft(s.end_date)}</td><td>${s.status==='نشط'?'<span class="badge badge-green">نشط</span>':'<span class="badge badge-red">منتهي</span>'}</td><td>${devices} جهاز</td><td>${(s.status==='منتهي'||s.status==='نشط')?`<button class="btn-primary btn-xs" onclick="renewSubscription('${s.id}')"><i class="fas fa-sync-alt"></i></button>`:''}<button class="btn-danger btn-xs" onclick="confirmDelete('subscription','${s.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
    }).join('') || '<tr><td colspan="11" class="text-center py-6 text-gray-400">لا توجد اشتراكات</td></tr>';
}

function openSubscriptionModal(id = null) {
    showModal('subscription-modal');
    document.getElementById('subscription-form').reset();
    document.getElementById('subscription-start-date').value = new Date().toISOString().split('T')[0];
    const select = document.getElementById('subscription-linked-user');
    select.innerHTML = '<option value="">اختر مستخدم</option>' + globalUsers.map(u => `<option value="${u.id}">${u.name||u.email}</option>`).join('');
    if (id) {
        const s = globalSubscriptions.find(s => s.id === id);
        if (s) {
            document.getElementById('subscription-modal-title').textContent = 'تعديل اشتراك';
            document.getElementById('subscription-id').value = s.id;
            document.getElementById('subscription-customer-name').value = s.customer_name;
            document.getElementById('subscription-customer-email').value = s.customer_email;
            document.getElementById('subscription-plan').value = s.plan;
            document.getElementById('subscription-price').value = s.price;
            document.getElementById('subscription-start-date').value = s.start_date;
            document.getElementById('subscription-end-date').value = s.end_date;
            if (s.linked_user_id) select.value = s.linked_user_id;
        }
    } else { document.getElementById('subscription-modal-title').textContent = 'اشتراك جديد'; onSubscriptionPlanChange(); }
}
function closeSubscriptionModal() { hideModal('subscription-modal'); }
function onLinkedUserChange() {
    const uid = document.getElementById('subscription-linked-user').value;
    if (uid) { const u = globalUsers.find(u => u.id === uid); if (u) { document.getElementById('subscription-customer-name').value = u.name||''; document.getElementById('subscription-customer-email').value = u.email||''; } }
}
function onSubscriptionPlanChange() {
    const plan = document.getElementById('subscription-plan').value;
    const start = document.getElementById('subscription-start-date').value || new Date().toISOString().split('T')[0];
    const end = new Date(start);
    if (plan === 'تجريبي') end.setDate(end.getDate() + 3);
    else if (plan === 'شهري') end.setMonth(end.getMonth() + 1);
    else if (plan === 'سنوي') end.setFullYear(end.getFullYear() + 1);
    document.getElementById('subscription-end-date').value = end.toISOString().split('T')[0];
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
        ownerId,
    };
    try {
        if (id) { await updateDoc(doc(db, "subscriptions", id), data); }
        else { await addDoc(collection(db, "subscriptions"), data); }
        if (data.linked_user_id) await updateDoc(doc(db, "users", data.linked_user_id), { subscription: { plan: data.plan, status: 'نشط', start_date: data.start_date, end_date: data.end_date, price: data.price } });
        await loadAllData(); closeSubscriptionModal(); loadSubscriptions();
    } catch (e) { console.error(e); }
}
async function renewSubscription(id) {
    const s = globalSubscriptions.find(s => s.id === id);
    if (!s) return;
    const end = new Date(s.end_date);
    if (s.plan === 'شهري') end.setMonth(end.getMonth() + 1);
    else if (s.plan === 'سنوي') end.setFullYear(end.getFullYear() + 1);
    else end.setDate(end.getDate() + 3);
    await updateDoc(doc(db, "subscriptions", id), { end_date: end.toISOString().split('T')[0], status: 'نشط' });
    await loadAllData(); loadSubscriptions(); alert('✅ تم التجديد');
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
    document.getElementById('technicians-list').innerHTML = globalTechnicians.map((t, i) => `<div class="flex justify-between items-center bg-gray-50 rounded-lg p-3 mb-2"><span>${t}</span><button class="btn-icon text-red" onclick="removeTechnician(${i})"><i class="fas fa-trash"></i></button></div>`).join('') || '<p class="text-sm text-gray-500">لا يوجد فنيين</p>';
}
function addTechnician() {
    const input = document.getElementById('new-technician');
    if (input.value.trim()) { globalTechnicians.push(input.value.trim()); input.value = ''; renderTechnicians(); updateTechSelects(); }
}
function removeTechnician(i) { globalTechnicians.splice(i, 1); renderTechnicians(); updateTechSelects(); }
function updateTechSelects() {
    const sel = document.getElementById('repair-technician');
    if (sel) sel.innerHTML = globalTechnicians.map(t => `<option value="${t}">${t}</option>`).join('');
}
function updateInvoicePreview() {
    document.getElementById('preview-shop-name').textContent = document.getElementById('set-shop-name').value || 'اسم المحل';
    document.getElementById('preview-owner').textContent = document.getElementById('set-owner-name').value || '';
    document.getElementById('preview-phone').textContent = document.getElementById('set-phone').value ? '📞 ' + document.getElementById('set-phone').value : '';
    document.getElementById('preview-address').textContent = document.getElementById('set-address').value ? '📍 ' + document.getElementById('set-address').value : '';
}
async function saveSettings() {
    globalSettings = {
        shop_name: document.getElementById('set-shop-name').value,
        owner_name: document.getElementById('set-owner-name').value,
        phone: document.getElementById('set-phone').value,
        address: document.getElementById('set-address').value,
        warranty_days: parseInt(document.getElementById('set-warranty-days').value) || 30,
        warranty_notes: document.getElementById('set-warranty-notes').value,
        language: document.getElementById('set-language').value,
        technicians: globalTechnicians,
    };
    await setDoc(doc(db, "settings", ownerId), globalSettings, { merge: true });
    alert('✅ تم حفظ الإعدادات');
}

// ================================
// تأكيد الحذف
// ================================
function confirmDelete(type, id) {
    deleteTarget = { type, id };
    const labels = { repair: 'أمر الصيانة', part: 'القطعة', expense: 'المصروف', wallet: 'المحفظة', subscription: 'الاشتراك' };
    let name = '';
    if (type === 'repair') name = globalRepairs.find(i => i.id === id)?.device_name;
    if (type === 'part') name = globalParts.find(i => i.id === id)?.name;
    if (type === 'expense') name = globalExpenses.find(i => i.id === id)?.title;
    if (type === 'wallet') name = globalWallets.find(i => i.id === id)?.name;
    if (type === 'subscription') name = globalSubscriptions.find(i => i.id === id)?.customer_name;
    document.getElementById('delete-message').textContent = `هل أنت متأكد من حذف ${labels[type]||''} "${name||''}"؟`;
    showModal('delete-modal');
    document.getElementById('delete-confirm-btn').onclick = executeDelete;
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

// بدء التطبيق
document.addEventListener('DOMContentLoaded', initApp);
