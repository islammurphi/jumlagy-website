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

// دوال النوافذ
window.showModal = function(id) { document.getElementById(id)?.classList.add('show'); };
window.hideModal = function(id) { document.getElementById(id)?.classList.remove('show'); };

// المتغيرات العامة
let ownerId = null, deleteTarget = null, charts = {};
let globalRepairs = [], globalParts = [], globalExpenses = [], globalWallets = [];
let globalTransactions = [], globalSubscriptions = [], globalUsers = [];
let globalSettings = {}, globalTechnicians = ['أحمد', 'محمد', 'محمود'];
let currentRepairParts = []; // قطع الغيار المضافة لأمر الصيانة الحالي

const walletLimits = {
    'vodafone':   { daily: 60000, monthly: 200000, max_balance: 100000, label: 'فودافون كاش' },
    'orange':     { daily: 60000, monthly: 200000, max_balance: 100000, label: 'أورانج كاش' },
    'etisalat':   { daily: 60000, monthly: 200000, max_balance: 100000, label: 'اتصالات كاش' },
    'we':         { daily: 60000, monthly: 200000, max_balance: 100000, label: 'وي كاش' },
    'bank':       { daily: 60000, monthly: 200000, max_balance: 100000, label: 'محفظة بنكية' },
    'instapay':   { daily: 120000, monthly: 400000, max_balance: 999999999, label: 'إنستاباي' },
};

// دوال مساعدة
function formatCurrency(amount) { return Number(amount || 0).toLocaleString('ar-EG') + ' ج.م'; }

function getStatusBadge(status) {
    const badges = {
        'تم_التسليم': '<span class="badge badge-blue">تم التسليم</span>',
        'قيد_الصيانة': '<span class="badge badge-amber">قيد الصيانة</span>',
        'جاهز': '<span class="badge badge-green">جاهز للتسليم</span>'
    };
    return badges[status] || badges['قيد_الصيانة'];
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
    
    // تحديث واجهة المستخدم
    updateSidebarUI(session);
    
    // إظهار/إخفاء عناصر المدير
    const isAdmin = session.role === 'admin';
    document.getElementById('subs-link').style.display = isAdmin ? 'flex' : 'none';
    document.getElementById('users-manager-card').style.display = isAdmin ? 'block' : 'none';
    
    bindEvents();
    
    showLoading();
    await loadAllData();
    if (globalRepairs.length === 0) await seedDemoData();
    
    loadDashboard();
    loadSettings();
    updateAlertsCount();
    updateSubscriptionCounter();
    updateSidebarShopInfo();
    
    hideLoading();
}

function updateSidebarUI(session) {
    document.getElementById('sidebar-user-name').textContent = session.name || 'مستخدم';
    document.getElementById('sidebar-user-role').textContent = session.role === 'admin' ? 'مدير النظام' : `مشترك - ${session.plan || ''}`;
    document.getElementById('sidebar-user-photo').src = session.photo || '';
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function updateSidebarShopInfo() {
    const shopImage = document.getElementById('sidebar-shop-image');
    const shopName = document.getElementById('sidebar-shop-name');
    const shopOwner = document.getElementById('sidebar-shop-owner');
    
    if (shopImage && globalSettings.shop_image) shopImage.src = globalSettings.shop_image;
    if (shopName) shopName.textContent = globalSettings.shop_name || 'Jumlagy';
    if (shopOwner) shopOwner.textContent = globalSettings.owner_name || 'نظام إدارة الورشة';
}

function updateSubscriptionCounter() {
    const session = JSON.parse(localStorage.getItem('jumlagy_session'));
    const counter = document.getElementById('subscription-counter');
    const daysEl = document.getElementById('subscription-days');
    const labelEl = document.getElementById('subscription-label');
    
    if (!counter || !session || session.role === 'admin') {
        if (counter) counter.style.display = 'none';
        return;
    }
    
    counter.style.display = 'block';
    const endDate = new Date(session.end_date || '2000-01-01');
    const today = new Date();
    const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
    
    counter.className = 'subscription-counter';
    if (daysLeft < 0) {
        counter.classList.add('expired');
        daysEl.textContent = 'منتهي';
        labelEl.textContent = 'الاشتراك';
    } else if (daysLeft === 0) {
        counter.classList.add('danger');
        daysEl.textContent = '0';
        labelEl.textContent = 'ينتهي اليوم!';
    } else if (daysLeft <= 7) {
        counter.classList.add('warning');
        daysEl.textContent = daysLeft;
        labelEl.textContent = 'يوم متبقي';
    } else if (daysLeft <= 30) {
        counter.classList.add('warning');
        daysEl.textContent = daysLeft;
        labelEl.textContent = 'يوم متبقي';
    } else {
        daysEl.textContent = daysLeft;
        labelEl.textContent = 'يوم متبقي';
    }
}

async function handleShopImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        const imageData = e.target.result;
        document.getElementById('sidebar-shop-image').src = imageData;
        globalSettings.shop_image = imageData;
        try {
            await setDoc(doc(db, "settings", ownerId), { shop_image: imageData }, { merge: true });
        } catch(e) { console.error(e); }
    };
    reader.readAsDataURL(file);
}

function bindEvents() {
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            switchTab(this.getAttribute('data-tab'));
            if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
        });
    });
    
    document.getElementById('menu-toggle')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });
    
    document.getElementById('btn-logout')?.addEventListener('click', logout);
    document.getElementById('repair-form')?.addEventListener('submit', saveRepair);
    document.getElementById('part-form')?.addEventListener('submit', savePart);
    document.getElementById('expense-form')?.addEventListener('submit', saveExpense);
    document.getElementById('wallet-form')?.addEventListener('submit', saveWallet);
    document.getElementById('transaction-form')?.addEventListener('submit', saveTransaction);
    document.getElementById('subscription-form')?.addEventListener('submit', saveSubscription);
    document.getElementById('delete-confirm-btn')?.addEventListener('click', executeDelete);
    
    // تحديث تاريخ التسليم تلقائياً عند تغيير تاريخ الاستلام
    document.getElementById('repair-receive-date')?.addEventListener('change', function() {
        const receiveDate = this.value;
        if (receiveDate) {
            const deliveryDate = new Date(receiveDate);
            deliveryDate.setDate(deliveryDate.getDate() + 2);
            document.getElementById('repair-delivery-date').value = deliveryDate.toISOString().split('T')[0];
        }
    });
    
    // رفع صورة المحل
    window.handleShopImageUpload = handleShopImageUpload;
}

function switchTab(tab) {
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tab-' + tab)?.classList.add('active');
    
    const loaders = { dashboard: loadDashboard, repairs: loadRepairsTable, inventory: loadInventoryTable, 
        expenses: loadExpensesTable, customers: loadCustomersTable, wallet: loadWallets, 
        reports: loadReports, alerts: loadAlerts, subscriptions: loadSubscriptions };
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
            globalSettings = { shop_name: 'Jumlagy', owner_name: 'اسم المحل', phone: '01234567890', address: 'العنوان', warranty_days: 30, warranty_notes: 'ضمان 30 يوم على قطع الغيار', technicians: globalTechnicians, shop_image: '' };
            await setDoc(doc(db, "settings", ownerId), globalSettings);
        }
        
        if (JSON.parse(localStorage.getItem('jumlagy_session'))?.role === 'admin') {
            globalUsers = us.docs.map(d => ({ id: d.id, ...d.data() }));
        }
    } catch (e) { console.error(e); }
}

async function seedDemoData() {
    if (!ownerId || globalRepairs.length > 0) return;
    const demoRepairs = [
        { device_name: 'iPhone 14 Pro Max', customer_name: 'أحمد محمد', customer_phone: '01001234567', technician: 'أحمد', status: 'تم_التسليم', repair_price: 2500, technician_fee: 500, repair_parts: '[{"name":"شاشة OLED","cost":1500}]', receive_date: '2026-04-01', delivery_date: '2026-04-03', device_issue: 'شاشة مكسورة', notes: 'تم تغيير الشاشة', ownerId },
        { device_name: 'Samsung S24 Ultra', customer_name: 'محمود علي', customer_phone: '01007654321', technician: 'محمد', status: 'قيد_الصيانة', repair_price: 1800, technician_fee: 300, repair_parts: '[{"name":"بطارية","cost":800}]', receive_date: '2026-04-20', device_issue: 'بطارية ضعيفة', notes: 'انتظار قطعة', ownerId },
    ];
    const demoParts = [
        { name: 'شاشة iPhone 14', category: 'شاشات', purchase_price: 1200, selling_price: 2500, quantity: 5, min_quantity: 2, supplier: 'مورد الشاشات', ownerId },
        { name: 'بطارية Samsung', category: 'بطاريات', purchase_price: 300, selling_price: 800, quantity: 10, min_quantity: 3, supplier: 'مورد البطاريات', ownerId },
    ];
    try { for (const r of demoRepairs) await addDoc(collection(db, "repairs"), r); for (const p of demoParts) await addDoc(collection(db, "parts"), p); await loadAllData(); } catch (e) { console.error(e); }
}

// ================================
// لوحة التحكم
// ================================
function loadDashboard() {
    const totalRevenue = globalRepairs.reduce((s, r) => s + (Number(r.repair_price) || 0), 0);
    const totalPartsCost = globalRepairs.reduce((s, r) => {
        if (r.repair_parts) {
            try { return s + JSON.parse(r.repair_parts).reduce((ps, p) => ps + (Number(p.cost) || 0), 0); } catch(e) { return s + (Number(r.spare_part_cost) || 0); }
        }
        return s + (Number(r.spare_part_cost) || 0);
    }, 0);
    const totalTechFees = globalRepairs.reduce((s, r) => s + (Number(r.technician_fee) || 0), 0);
    const totalExpenses = globalExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const profit = totalRevenue - totalPartsCost - totalTechFees - totalExpenses;
    const inventoryValue = globalParts.reduce((s, p) => s + (Number(p.purchase_price) || 0) * (Number(p.quantity) || 0), 0);
    const completedOrders = globalRepairs.filter(r => r.status === 'تم_التسليم').length;
    const avgOrderValue = globalRepairs.length > 0 ? Math.round(totalRevenue / globalRepairs.length) : 0;
    
    document.getElementById('stats-cards').innerHTML = `
        <div class="stat-card"><div class="stat-card-icon icon-blue"><i class="fas fa-dollar-sign"></i></div><p class="stat-card-title">إجمالي الإيرادات</p><p class="stat-card-value">${formatCurrency(totalRevenue)}</p><p class="stat-card-sub">${globalRepairs.length} عملية</p></div>
        <div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-chart-line"></i></div><p class="stat-card-title">صافي الأرباح</p><p class="stat-card-value">${formatCurrency(profit)}</p><p class="stat-card-sub">${profit >= 0 ? '✅ رابح' : '⚠️ خاسر'}</p></div>
        <div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-receipt"></i></div><p class="stat-card-title">إجمالي المصروفات</p><p class="stat-card-value">${formatCurrency(totalPartsCost + totalTechFees + totalExpenses)}</p><p class="stat-card-sub">قطع: ${formatCurrency(totalPartsCost)}</p></div>
        <div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-box"></i></div><p class="stat-card-title">قيمة المخزون</p><p class="stat-card-value">${formatCurrency(inventoryValue)}</p><p class="stat-card-sub">${globalParts.length} صنف</p></div>
        <div class="stat-card"><div class="stat-card-icon icon-cyan"><i class="fas fa-shopping-cart"></i></div><p class="stat-card-title">متوسط الطلب</p><p class="stat-card-value">${formatCurrency(avgOrderValue)}</p></div>
        <div class="stat-card"><div class="stat-card-icon icon-teal"><i class="fas fa-check-circle"></i></div><p class="stat-card-title">معدل الإتمام</p><p class="stat-card-value">${globalRepairs.length > 0 ? Math.round((completedOrders / globalRepairs.length) * 100) : 0}%</p></div>
    `;
    
    // حالة المخزون
    const available = globalParts.filter(p => !p.min_quantity || p.quantity > p.min_quantity).length;
    const low = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity && p.quantity > 0).length;
    const out = globalParts.filter(p => p.quantity === 0).length;
    document.getElementById('inventory-status').innerHTML = `
        <div style="background:#ecfdf5;border-radius:14px;padding:18px;text-align:center;border:1px solid #a7f3d0;"><div style="font-size:30px;font-weight:800;color:#059669;">${available}</div><div style="font-size:12px;color:#047857;">متوفر</div></div>
        <div style="background:#fffbeb;border-radius:14px;padding:18px;text-align:center;border:1px solid #fde68a;"><div style="font-size:30px;font-weight:800;color:#d97706;">${low}</div><div style="font-size:12px;color:#b45309;">منخفض</div></div>
        <div style="background:#fef2f2;border-radius:14px;padding:18px;text-align:center;border:1px solid #fecaca;"><div style="font-size:30px;font-weight:800;color:#dc2626;">${out}</div><div style="font-size:12px;color:#b91c1c;">نافذ</div></div>
    `;
    
    const lowStockParts = globalParts.filter(p => p.min_quantity && p.quantity <= p.min_quantity);
    document.getElementById('out-of-stock-alerts').innerHTML = lowStockParts.length > 0 ? 
        `<div class="alert alert-warning">⚠️ ${lowStockParts.map(p => `${p.name} (${p.quantity})`).join('، ')}</div>` :
        '<div class="alert alert-success">✅ جميع القطع متوفرة</div>';
    
    // أفضل العملاء
    const cm = {};
    globalRepairs.forEach(r => {
        const k = r.customer_phone || r.customer_name;
        if (!cm[k]) cm[k] = { name: r.customer_name, phone: r.customer_phone, total: 0, count: 0 };
        cm[k].total += Number(r.repair_price) || 0; cm[k].count++;
    });
    const tc = Object.values(cm).sort((a, b) => b.total - a.total).slice(0, 5);
    document.getElementById('top-customers-widget').innerHTML = tc.length ? tc.map((c, i) => `
        <div class="flex justify-between items-center py-3 border-b border-gray-100">
            <div><span class="badge ${i===0?'badge-amber':'badge-gray'}">#${i+1}</span> <span class="font-semibold">${c.name}</span><br><span class="text-xs text-muted">${c.phone} · ${c.count} عمليات</span></div>
            <span class="font-bold text-blue">${formatCurrency(c.total)}</span>
        </div>`).join('') : '<p class="text-center text-muted py-4">لا توجد بيانات</p>';
    
    // آخر الأوامر
    const recent = globalRepairs.slice(0, 5);
    document.getElementById('recent-repairs').innerHTML = recent.length ? recent.map(r => `
        <div class="flex justify-between items-center py-3 border-b border-gray-100">
            <div><span class="font-semibold">${r.device_name||'جهاز'}</span><br><span class="text-xs text-muted">${r.customer_name||''} · ${getStatusBadge(r.status)}</span></div>
            <span class="font-bold text-blue">${formatCurrency(r.repair_price)}</span>
        </div>`).join('') : '<p class="text-center text-muted py-4">لا توجد أوامر</p>';
    
    if (JSON.parse(localStorage.getItem('jumlagy_session'))?.role === 'admin') loadUsersManager();
    setTimeout(loadDashboardChart, 300);
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
            let pc = 0; if (r.repair_parts) { try { pc = JSON.parse(r.repair_parts).reduce((s, p) => s + (Number(p.cost) || 0), 0); } catch(e) { pc = Number(r.spare_part_cost) || 0; } } else pc = Number(r.spare_part_cost) || 0;
            monthlyData[k].expenses += pc + (Number(r.technician_fee) || 0);
        }
    });
    globalExpenses.forEach(e => {
        if (e.date) { const d = new Date(e.date), k = `${d.getFullYear()}-${d.getMonth()}`; if (!monthlyData[k]) monthlyData[k] = { revenue: 0, expenses: 0, month: months[d.getMonth()], year: d.getFullYear() }; monthlyData[k].expenses += Number(e.amount) || 0; }
    });
    
    const sd = Object.values(monthlyData).sort((a, b) => a.year - b.year || months.indexOf(a.month) - months.indexOf(b.month)).slice(-6);
    
    if (charts.revenueExpense) charts.revenueExpense.destroy();
    charts.revenueExpense = new Chart(canvas, {
        type: 'bar', data: { labels: sd.map(d => `${d.month} ${d.year}`), datasets: [
            { label: 'الإيرادات', data: sd.map(d => d.revenue), backgroundColor: 'rgba(37,99,235,0.7)', borderColor: '#2563eb', borderWidth: 2, borderRadius: 8 },
            { label: 'المصروفات', data: sd.map(d => d.expenses), backgroundColor: 'rgba(239,68,68,0.7)', borderColor: '#ef4444', borderWidth: 2, borderRadius: 8 }
        ]},
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20, font: { family: 'Tajawal' } } } }, scales: { y: { ticks: { callback: v => v.toLocaleString('ar-EG') + ' ج.م', font: { family: 'Tajawal' } } }, x: { ticks: { font: { family: 'Tajawal' } } } } }
    });
}

function loadUsersManager() {
    const c = document.getElementById('users-manager');
    if (!c) return;
    c.innerHTML = globalUsers.length ? globalUsers.map(u => `
        <div class="flex justify-between items-center bg-gray-50 rounded-lg px-4 py-3 mb-2">
            <div><span class="font-medium">${u.fullName||u.name||u.email}</span><span class="text-xs text-muted block">${u.email}</span></div>
            <div class="flex items-center gap-2">
                <span class="badge ${u.role==='admin'?'badge-blue':u.isApproved?'badge-green':'badge-red'}">${u.role==='admin'?'مدير':u.isApproved?'مفعل':'معلق'}</span>
                ${u.role!=='admin'?`<button class="btn-xs ${u.isApproved?'btn-danger':'btn-primary'}" onclick="toggleUserApproval('${u.id}',${u.isApproved})">${u.isApproved?'حظر':'تفعيل'}</button>`:''}
            </div>
        </div>`).join('') : '<p class="text-center text-muted py-6">لا يوجد مستخدمين</p>';
}

async function toggleUserApproval(uid, cs) { 
    await updateDoc(doc(db, "users", uid), { isApproved: !cs, status: !cs ? 'active' : 'pending' }); 
    await loadAllData(); loadUsersManager(); 
}

// ================================
// أوامر الصيانة - محسنة
// ================================
function openRepairForm(repairId = null) {
    showModal('repair-modal');
    document.getElementById('repair-form').reset();
    document.getElementById('repair-receive-date').value = new Date().toISOString().split('T')[0];
    
    // تعيين تاريخ التسليم بعد يومين
    const dd = new Date(); dd.setDate(dd.getDate() + 2);
    document.getElementById('repair-delivery-date').value = dd.toISOString().split('T')[0];
    
    updateTechSelects();
    updatePartSelect();
    currentRepairParts = [];
    document.getElementById('repair-parts-list').innerHTML = '';
    document.getElementById('repair-parts-data').value = '[]';
    
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
            
            // تحميل قطع الغيار السابقة
            if (r.repair_parts) {
                try { currentRepairParts = JSON.parse(r.repair_parts); } catch(e) { currentRepairParts = []; }
            } else if (r.spare_part_name) {
                currentRepairParts = [{ name: r.spare_part_name, cost: Number(r.spare_part_cost) || 0 }];
            }
            renderRepairParts();
        }
    } else {
        document.getElementById('repair-modal-title').textContent = 'أمر صيانة جديد';
        document.getElementById('repair-id').value = '';
    }
}

function closeRepairForm() { hideModal('repair-modal'); }

function updatePartSelect() {
    const sel = document.getElementById('repair-part-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">اختر قطعة من المخزون...</option>' + 
        globalParts.filter(p => p.quantity > 0).map(p => 
            `<option value="${p.id}" data-name="${p.name}" data-price="${p.selling_price || p.purchase_price}">${p.name} - ${formatCurrency(p.selling_price || p.purchase_price)} (${p.quantity} متوفر)</option>`
        ).join('');
}

function addPartFromInventory() {
    const sel = document.getElementById('repair-part-select');
    if (!sel?.value) return;
    
    const opt = sel.options[sel.selectedIndex];
    const name = opt.getAttribute('data-name');
    const cost = parseFloat(opt.getAttribute('data-price')) || 0;
    
    currentRepairParts.push({ name, cost });
    renderRepairParts();
    sel.value = '';
}

function addPartManually() {
    const nameInput = document.getElementById('repair-part-name');
    const costInput = document.getElementById('repair-part-cost');
    const name = nameInput?.value?.trim();
    const cost = parseFloat(costInput?.value) || 0;
    
    if (!name) return;
    currentRepairParts.push({ name, cost });
    renderRepairParts();
    if (nameInput) nameInput.value = '';
    if (costInput) costInput.value = '0';
}

function removeRepairPart(index) {
    currentRepairParts.splice(index, 1);
    renderRepairParts();
}

function renderRepairParts() {
    const list = document.getElementById('repair-parts-list');
    const dataInput = document.getElementById('repair-parts-data');
    if (!list) return;
    
    list.innerHTML = currentRepairParts.map((p, i) => `
        <div class="part-item">
            <div class="part-item-info">
                <i class="fas fa-box text-amber"></i>
                <span class="part-item-name">${p.name}</span>
                <span class="part-item-price">${formatCurrency(p.cost)}</span>
            </div>
            <button type="button" class="part-item-remove" onclick="removeRepairPart(${i})">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
    
    if (currentRepairParts.length === 0) {
        list.innerHTML = '<p class="text-sm text-muted text-center py-3">لم تضف قطع غيار بعد</p>';
    }
    
    if (dataInput) dataInput.value = JSON.stringify(currentRepairParts);
    updateRepairTotalCost();
}

function updateRepairTotalCost() {
    const partsCost = currentRepairParts.reduce((s, p) => s + (Number(p.cost) || 0), 0);
    // يمكن إظهار الإجمالي في مكان ما في النموذج
}

async function saveRepair(e) {
    e.preventDefault();
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
        receive_date: document.getElementById('repair-receive-date').value,
        delivery_date: document.getElementById('repair-delivery-date').value || null,
        device_issue: document.getElementById('repair-issue').value,
        notes: document.getElementById('repair-notes').value,
        ownerId
    };
    
    try {
        if (id) { await updateDoc(doc(db, "repairs", id), data); }
        else { await addDoc(collection(db, "repairs"), data); }
        
        // تحديث المخزون
        for (const part of currentRepairParts) {
            const stockPart = globalParts.find(p => p.name === part.name);
            if (stockPart && stockPart.quantity > 0) {
                await updateDoc(doc(db, "parts", stockPart.id), { quantity: Math.max(0, stockPart.quantity - 1) });
            }
        }
        
        await loadAllData(); closeRepairForm(); loadRepairsTable(); loadDashboard(); updateAlertsCount();
    } catch (e) { console.error(e); }
    hideLoading();
}

async function quickStatusChange(repairId, newStatus) {
    await updateDoc(doc(db, "repairs", repairId), { status: newStatus });
    await loadAllData(); loadRepairsTable(); loadDashboard();
}

function loadRepairsTable() {
    const s = (document.getElementById('repair-search')?.value || '').toLowerCase();
    const f = document.getElementById('repair-filter')?.value || 'all';
    let fl = globalRepairs.filter(r => (!s || r.device_name?.toLowerCase().includes(s) || r.customer_name?.toLowerCase().includes(s)) && (f === 'all' || r.status === f));
    
    document.getElementById('repairs-count').textContent = `${globalRepairs.length} أمر صيانة`;
    document.getElementById('repairs-table-container').innerHTML = `
        <div class="table-responsive">
            <table><thead><tr><th>الجهاز</th><th>العميل</th><th>الفني</th><th>الحالة</th><th>السعر</th><th>تاريخ الاستلام</th><th>إجراءات</th></tr></thead>
            <tbody>${fl.length ? fl.map(r => `
                <tr>
                    <td class="font-semibold">${r.device_name||'-'}</td>
                    <td>${r.customer_name||'-'}<br><span class="text-xs text-muted">${r.customer_phone||''}</span></td>
                    <td>${r.technician||'-'}</td>
                    <td><select class="status-select" onchange="quickStatusChange('${r.id}',this.value)" style="background:${r.status==='قيد_الصيانة'?'#fef3c7':r.status==='جاهز'?'#d1fae5':'#dbeafe'};border-color:${r.status==='قيد_الصيانة'?'#f59e0b':r.status==='جاهز'?'#10b981':'#3b82f6'};color:${r.status==='قيد_الصيانة'?'#92400e':r.status==='جاهز'?'#065f46':'#1e40af'};">
                        <option value="قيد_الصيانة" ${r.status==='قيد_الصيانة'?'selected':''}>قيد الصيانة</option>
                        <option value="جاهز" ${r.status==='جاهز'?'selected':''}>جاهز للتسليم</option>
                        <option value="تم_التسليم" ${r.status==='تم_التسليم'?'selected':''}>تم التسليم</option>
                    </select></td>
                    <td class="font-bold text-blue">${formatCurrency(r.repair_price)}</td>
                    <td class="text-sm">${r.receive_date||'-'}</td>
                    <td><div class="flex gap-1">
                        <button class="btn-icon" onclick="openRepairForm('${r.id}')"><i class="fas fa-pen"></i></button>
                        <button class="btn-icon text-blue" onclick="printRepairInvoice('${r.id}')"><i class="fas fa-print"></i></button>
                        <button class="btn-icon text-red" onclick="confirmDelete('repair','${r.id}')"><i class="fas fa-trash"></i></button>
                    </div></td>
                </tr>`).join('') : '<tr><td colspan="7" class="text-center py-6 text-muted">لا توجد أوامر</td></tr>'}</tbody></table></div>`;
}

// ================================
// طباعة فاتورة احترافية
// ================================
async function printRepairInvoice(repairId) {
    const r = globalRepairs.find(r => r.id === repairId);
    if (!r) return;
    
    let parts = [];
    if (r.repair_parts) { try { parts = JSON.parse(r.repair_parts); } catch(e) {} }
    else if (r.spare_part_name) { parts = [{ name: r.spare_part_name, cost: Number(r.spare_part_cost) || 0 }]; }
    
    const total = Number(r.repair_price) || 0;
    const partsCost = parts.reduce((s, p) => s + (Number(p.cost) || 0), 0);
    
    const w = window.open('', '_blank', 'width=800,height=900');
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>فاتورة</title>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800;900&display=swap" rel="stylesheet">
        <style>
            *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Tajawal',sans-serif;padding:40px;color:#1e293b;background:white}
            .inv{max-width:700px;margin:0 auto}
            .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding-bottom:20px;border-bottom:3px solid #2563eb}
            .shop h1{font-size:32px;font-weight:900;color:#2563eb;margin-bottom:8px}.shop p{font-size:14px;color:#64748b;margin-bottom:4px}
            .inv-num{text-align:left}.inv-num h2{font-size:28px;font-weight:800}.inv-num p{font-size:13px;color:#64748b}
            .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:30px}
            .box{background:#f8fafc;border-radius:12px;padding:16px;border:1px solid #e2e8f0}
            .lbl{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:6px}.val{font-size:16px;font-weight:700}
            table{width:100%;border-collapse:collapse;margin-bottom:30px}th{background:#2563eb;color:white;padding:14px 16px;text-align:right;font-size:13px;font-weight:700}
            td{padding:14px 16px;border-bottom:1px solid #e2e8f0;font-size:14px}
            .total{background:linear-gradient(135deg,#eff6ff,#dbeafe);border:2px solid #93c5fd;border-radius:16px;padding:24px;text-align:center;margin-bottom:30px}
            .total .l{font-size:14px;color:#64748b;margin-bottom:8px}.total .a{font-size:40px;font-weight:900;color:#2563eb}
            .warranty{background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:30px}
            .warranty h4{color:#92400e;font-size:14px}.warranty p{color:#a16207;font-size:13px}
            .sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:60px}.sbox{text-align:center}
            .sline{border-bottom:1px solid #cbd5e1;margin-bottom:8px;padding-bottom:8px}.slabel{font-size:13px;color:#94a3b8}
            .ftr{text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8}
            @media print{body{padding:20px}.np{display:none}}
        </style></head><body><div class="inv">
        <div class="hdr"><div class="shop"><h1>${globalSettings.shop_name||'Jumlagy'}</h1><p>👤 ${globalSettings.owner_name||''}</p><p>📞 ${globalSettings.phone||''}</p><p>📍 ${globalSettings.address||''}</p></div><div class="inv-num"><h2>فاتورة</h2><p>رقم: INV-${repairId.slice(0,8).toUpperCase()}</p><p>${new Date().toLocaleDateString('ar-EG',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p></div></div>
        <div class="grid"><div class="box"><div class="lbl">العميل</div><div class="val">${r.customer_name||'غير محدد'}</div><div style="color:#64748b;font-size:13px;margin-top:4px">${r.customer_phone||''}</div></div><div class="box"><div class="lbl">الجهاز</div><div class="val">${r.device_name||'غير محدد'}</div><div style="color:#64748b;font-size:13px;margin-top:4px">الفني: ${r.technician||'غير محدد'}</div></div></div>
        <table><thead><tr><th>البيان</th><th>التفاصيل</th><th>المبلغ</th></tr></thead><tbody>
            <tr><td>أجر الصيانة</td><td>${r.device_issue||'صيانة جهاز'}</td><td>${formatCurrency(total)}</td></tr>
            ${parts.map(p=>`<tr><td>قطعة غيار</td><td>${p.name}</td><td>${formatCurrency(p.cost)}</td></tr>`).join('')}
        </tbody></table>
        <div class="total"><div class="l">الإجمالي</div><div class="a">${formatCurrency(total)}</div></div>
        ${globalSettings.warranty_days>0?`<div class="warranty"><h4>🛡️ ضمان ${globalSettings.warranty_days} يوم</h4><p>${globalSettings.warranty_notes||'يشمل الضمان قطع الغيار فقط'}</p></div>`:''}
        <div class="sign"><div class="sbox"><div class="sline"></div><div class="slabel">توقيع العميل</div></div><div class="sbox"><div class="sline"></div><div class="slabel">توقيع الفني</div></div></div>
        <div class="ftr"><p>${globalSettings.shop_name||'Jumlagy'} © ${new Date().getFullYear()}</p><p style="margin-top:4px">شكراً لتعاملكم معنا</p></div>
        <div class="np" style="text-align:center;margin-top:30px"><button onclick="window.print()" style="background:#2563eb;color:white;border:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Tajawal'">🖨️ طباعة</button></div>
    </div></body></html>`);
    w.document.close();
}

// ================================
// المخزون
// ================================
function openPartForm(partId = null) {
    showModal('part-modal'); document.getElementById('part-form').reset();
    if (partId) { const p = globalParts.find(p => p.id === partId); if (p) { document.getElementById('part-modal-title').textContent = 'تعديل قطعة غيار'; document.getElementById('part-id').value = p.id; document.getElementById('part-name').value = p.name||''; document.getElementById('part-category').value = p.category||'بطاريات'; document.getElementById('part-purchase-price').value = p.purchase_price||0; document.getElementById('part-selling-price').value = p.selling_price||0; document.getElementById('part-quantity').value = p.quantity||0; document.getElementById('part-min-quantity').value = p.min_quantity||0; document.getElementById('part-supplier').value = p.supplier||''; } }
    else { document.getElementById('part-modal-title').textContent = 'إضافة قطعة غيار'; document.getElementById('part-id').value = ''; }
}
function closePartForm() { hideModal('part-modal'); }
async function savePart(e) {
    e.preventDefault(); showLoading();
    const id = document.getElementById('part-id').value;
    const data = { name: document.getElementById('part-name').value, category: document.getElementById('part-category').value, purchase_price: Number(document.getElementById('part-purchase-price').value)||0, selling_price: Number(document.getElementById('part-selling-price').value)||0, quantity: Number(document.getElementById('part-quantity').value)||0, min_quantity: Number(document.getElementById('part-min-quantity').value)||0, supplier: document.getElementById('part-supplier').value, ownerId };
    try { if (id) await updateDoc(doc(db, "parts", id), data); else await addDoc(collection(db, "parts"), data); await loadAllData(); closePartForm(); loadInventoryTable(); loadDashboard(); updateAlertsCount(); } catch (e) { console.error(e); }
    hideLoading();
}

function loadInventoryTable() {
    const s = (document.getElementById('part-search')?.value||'').toLowerCase();
    const fl = globalParts.filter(p => !s || p.name?.toLowerCase().includes(s) || p.category?.toLowerCase().includes(s) || p.supplier?.toLowerCase().includes(s));
    const tv = globalParts.reduce((s, p) => s + (Number(p.purchase_price)||0)*(Number(p.quantity)||0), 0);
    document.getElementById('inventory-count').textContent = `${globalParts.length} صنف`;
    document.getElementById('inventory-summary').innerHTML = `<div class="stat-card"><div class="stat-card-icon icon-purple"><i class="fas fa-box"></i></div><p class="stat-card-title">قيمة المخزون</p><p class="stat-card-value">${formatCurrency(tv)}</p></div><div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-cubes"></i></div><p class="stat-card-title">إجمالي القطع</p><p class="stat-card-value">${globalParts.reduce((s,p)=>s+(Number(p.quantity)||0),0)}</p></div>`;
    document.getElementById('inventory-table-container').innerHTML = `<div class="table-responsive"><table><thead><tr><th>القطعة</th><th>التصنيف</th><th>سعر الشراء</th><th>سعر البيع</th><th>الكمية</th><th>المورد</th><th>إجراءات</th></tr></thead><tbody>${fl.length?fl.map(p=>`<tr><td class="font-semibold">${p.name||'-'}</td><td><span class="badge badge-gray">${p.category||'أخرى'}</span></td><td>${formatCurrency(p.purchase_price)}</td><td>${p.selling_price?formatCurrency(p.selling_price):'-'}</td><td class="font-bold ${p.min_quantity&&p.quantity<=p.min_quantity?'text-amber':''}">${p.quantity}${p.min_quantity&&p.quantity<=p.min_quantity?'⚠️':''}</td><td>${p.supplier||'-'}</td><td><button class="btn-icon" onclick="openPartForm('${p.id}')"><i class="fas fa-pen"></i></button><button class="btn-icon text-red" onclick="confirmDelete('part','${p.id}')"><i class="fas fa-trash"></i></button></td></tr>`).join(''):'<tr><td colspan="7" class="text-center py-6 text-muted">لا توجد قطع</td></tr>'}</tbody></table></div>`;
}

// ================================
// المصاريف
// ================================
function openExpenseForm(eid=null){showModal('expense-modal');document.getElementById('expense-form').reset();document.getElementById('expense-date').value=new Date().toISOString().split('T')[0];if(eid){const e=globalExpenses.find(e=>e.id===eid);if(e){document.getElementById('expense-modal-title').textContent='تعديل مصروف';document.getElementById('expense-id').value=e.id;document.getElementById('expense-title').value=e.title||'';document.getElementById('expense-category').value=e.category||'أخرى';document.getElementById('expense-amount').value=e.amount||0;document.getElementById('expense-date').value=e.date||'';document.getElementById('expense-notes').value=e.notes||''}}else{document.getElementById('expense-modal-title').textContent='إضافة مصروف';document.getElementById('expense-id').value=''}}
function closeExpenseForm(){hideModal('expense-modal')}
async function saveExpense(e){e.preventDefault();showLoading();const id=document.getElementById('expense-id').value;const data={title:document.getElementById('expense-title').value,category:document.getElementById('expense-category').value,amount:Number(document.getElementById('expense-amount').value)||0,date:document.getElementById('expense-date').value,notes:document.getElementById('expense-notes').value,ownerId};try{if(id)await updateDoc(doc(db,"expenses",id),data);else await addDoc(collection(db,"expenses"),data);await loadAllData();closeExpenseForm();loadExpensesTable();loadDashboard()}catch(e){console.error(e)}hideLoading()}

function loadExpensesTable(){
    const s=(document.getElementById('expense-search')?.value||'').toLowerCase(),c=document.getElementById('expense-cat-filter')?.value||'الكل';
    const fl=globalExpenses.filter(e=>(!s||e.title?.toLowerCase().includes(s))&&(c==='الكل'||e.category===c));
    document.getElementById('expenses-count').textContent=`${globalExpenses.length} مصروف`;
    document.getElementById('expenses-summary').innerHTML=`<div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-receipt"></i></div><p class="stat-card-title">إجمالي المصاريف</p><p class="stat-card-value">${formatCurrency(globalExpenses.reduce((s,e)=>s+(Number(e.amount)||0),0))}</p></div>`;
    document.getElementById('expenses-list').innerHTML=fl.length?fl.map(e=>`<div class="card mb-2"><div class="card-body"><div class="flex justify-between items-center"><div><p class="font-semibold">${e.title||'بدون عنوان'}</p><p class="text-xs text-muted">${e.date||''} · ${e.category||'أخرى'}${e.notes?' — '+e.notes:''}</p></div><div class="flex items-center gap-3"><span class="font-bold text-red">${formatCurrency(e.amount)}</span><button class="btn-icon" onclick="openExpenseForm('${e.id}')"><i class="fas fa-pen"></i></button><button class="btn-icon text-red" onclick="confirmDelete('expense','${e.id}')"><i class="fas fa-trash"></i></button></div></div></div></div>`).join(''):'<p class="text-center text-muted py-10">لا توجد مصاريف</p>';
}

// ================================
// العملاء - مبسطة
// ================================
function loadCustomersTable(){
    const s=(document.getElementById('customer-search')?.value||'').toLowerCase();
    const map={};globalRepairs.forEach(r=>{const k=r.customer_phone||r.customer_name;if(!map[k])map[k]={name:r.customer_name,phone:r.customer_phone,repairs:[],totalPaid:0};map[k].repairs.push(r);map[k].totalPaid+=Number(r.repair_price)||0});
    let cs=Object.values(map).map((c,i)=>({...c,id:i})).sort((a,b)=>b.totalPaid-a.totalPaid);
    if(s)cs=cs.filter(c=>c.name?.toLowerCase().includes(s)||c.phone?.includes(s));
    document.getElementById('customers-count').textContent=`${cs.length} عميل`;
    document.getElementById('customers-summary').innerHTML=`<div class="stat-card"><div class="stat-card-icon icon-blue"><i class="fas fa-users"></i></div><p class="stat-card-title">العملاء</p><p class="stat-card-value">${cs.length}</p></div>`;
    document.getElementById('customers-list').innerHTML=cs.length?cs.map(c=>`<div class="card mb-2"><div class="card-body"><div class="flex justify-between items-center"><div><span class="font-bold">${c.name||'غير معروف'}</span><br><span class="text-xs text-muted">📞 ${c.phone||'-'} · ${c.repairs.length} أجهزة</span></div><span class="font-bold text-blue">${formatCurrency(c.totalPaid)}</span></div></div></div>`).join(''):'<p class="text-center text-muted py-10">لا يوجد عملاء</p>';
}

// ================================
// المحافظ
// ================================
function loadWallets(){
    const tb=globalWallets.reduce((s,w)=>s+(Number(w.balance)||0),0);
    document.getElementById('wallet-summary-cards').innerHTML=`<div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-wallet"></i></div><p class="stat-card-title">إجمالي الأرصدة</p><p class="stat-card-value">${formatCurrency(tb)}</p></div>`;
    document.getElementById('wallets-table-body').innerHTML=globalWallets.length?`<div class="wallet-grid">${globalWallets.map(w=>{const l=walletLimits[w.type]||{},dp=w.daily_limit>0?(Number(w.daily_used)/Number(w.daily_limit)*100):0,mp=w.monthly_limit>0?(Number(w.monthly_used)/Number(w.monthly_limit)*100):0;return`<div class="wallet-card"><div class="flex justify-between items-center mb-4"><div><h3 class="font-bold text-lg">${w.name||'محفظة'}</h3><span class="badge badge-blue">${l.label||w.type}</span></div><div class="flex gap-2"><button class="btn-icon text-blue" onclick="openTransactionModal('${w.id}')"><i class="fas fa-exchange-alt"></i></button><button class="btn-icon" onclick="openWalletModal('${w.id}')"><i class="fas fa-pen"></i></button><button class="btn-icon text-red" onclick="confirmDelete('wallet','${w.id}')"><i class="fas fa-trash"></i></button></div></div><div class="wallet-balance-section"><div style="font-size:11px;color:#64748b">الرصيد</div><div class="wallet-balance-value">${formatCurrency(w.balance)}</div></div><div class="wallet-limits"><div><div style="font-size:10px;color:#94a3b8">الحد اليومي</div><div class="wallet-progress"><div class="wallet-progress-bar ${dp>80?'danger':dp>50?'warning':'safe'}" style="width:${Math.min(dp,100)}%"></div></div></div><div><div style="font-size:10px;color:#94a3b8">الحد الشهري</div><div class="wallet-progress"><div class="wallet-progress-bar ${mp>80?'danger':mp>50?'warning':'safe'}" style="width:${Math.min(mp,100)}%"></div></div></div></div><div class="flex gap-2 mt-4 pt-4 border-t"><button class="btn-primary btn-sm flex-1" onclick="openTransactionModal('${w.id}')"><i class="fas fa-plus"></i> عملية</button></div></div>`}).join('')}</div>`:'<p class="text-center text-muted py-6">لا توجد محافظ</p>';
    
    const st=[...globalTransactions].sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)).slice(0,20);
    document.getElementById('wallet-transactions-body').innerHTML=st.length?`<div class="table-responsive"><table><thead><tr><th>التاريخ</th><th>المحفظة</th><th>النوع</th><th>المبلغ</th><th>ملاحظات</th></tr></thead><tbody>${st.map(t=>{const w=globalWallets.find(w=>w.id===t.wallet_id);return`<tr><td>${t.date||'-'}</td><td>${w?w.name:'—'}</td><td><span class="badge ${t.type==='deposit'?'badge-green':'badge-red'}">${t.type==='deposit'?'إيداع':'سحب'}</span></td><td class="font-bold ${t.type==='deposit'?'text-green':'text-red'}">${t.type==='deposit'?'+':'-'}${formatCurrency(t.amount)}</td><td>${t.notes||'—'}</td></tr>`}).join('')}</tbody></table></div>`:'<p class="text-center text-muted py-6">لا توجد عمليات</p>';
}

function onWalletTypeChange(){const t=document.getElementById('wallet-type')?.value,d=document.getElementById('wallet-limits-info');if(t&&walletLimits[t]&&d){d.classList.remove('hidden');d.innerHTML=`الحد اليومي: <strong>${walletLimits[t].daily.toLocaleString()} ج.م</strong> | الحد الشهري: <strong>${walletLimits[t].monthly.toLocaleString()} ج.م</strong>`}else if(d)d.classList.add('hidden')}
function openWalletModal(wid=null){showModal('wallet-modal');document.getElementById('wallet-form').reset();const i=document.getElementById('wallet-limits-info');if(i)i.classList.add('hidden');if(wid){const w=globalWallets.find(w=>w.id===wid);if(w){document.getElementById('wallet-modal-title').textContent='تعديل محفظة';document.getElementById('wallet-id').value=w.id;document.getElementById('wallet-name').value=w.name||'';document.getElementById('wallet-phone').value=w.phone||'';document.getElementById('wallet-type').value=w.type||'';onWalletTypeChange()}}else{document.getElementById('wallet-modal-title').textContent='إضافة محفظة';document.getElementById('wallet-id').value=''}}
function closeWalletModal(){hideModal('wallet-modal')}
async function saveWallet(e){e.preventDefault();const id=document.getElementById('wallet-id').value,t=document.getElementById('wallet-type').value,l=walletLimits[t]||walletLimits['vodafone'];const d={name:document.getElementById('wallet-name').value,phone:document.getElementById('wallet-phone').value,type:t,balance:0,daily_used:0,monthly_used:0,daily_limit:l.daily,monthly_limit:l.monthly,max_balance:l.max_balance,ownerId};try{if(id){const ex=globalWallets.find(w=>w.id===id);d.balance=ex?.balance||0;d.daily_used=ex?.daily_used||0;d.monthly_used=ex?.monthly_used||0;await updateDoc(doc(db,"wallets",id),d)}else await addDoc(collection(db,"wallets"),d);await loadAllData();closeWalletModal();loadWallets()}catch(e){console.error(e)}}
function openTransactionModal(wid){showModal('transaction-modal');document.getElementById('transaction-form').reset();document.getElementById('transaction-wallet-id').value=wid;document.getElementById('transaction-limit-warning')?.classList.add('hidden')}
function closeTransactionModal(){hideModal('transaction-modal')}
async function saveTransaction(e){e.preventDefault();const wid=document.getElementById('transaction-wallet-id').value,t=document.getElementById('transaction-type').value,a=parseFloat(document.getElementById('transaction-amount').value),n=document.getElementById('transaction-notes').value,w=globalWallets.find(w=>w.id===wid);if(!w)return;if(t==='withdraw'&&a>(Number(w.balance)||0)){const wd=document.getElementById('transaction-limit-warning');if(wd){wd.textContent='❌ الرصيد غير كافي';wd.classList.remove('hidden')}return}try{const nb=t==='withdraw'?Number(w.balance)-a:Number(w.balance)+a;await updateDoc(doc(db,"wallets",wid),{balance:nb,daily_used:t==='withdraw'?Number(w.daily_used)+a:Number(w.daily_used),monthly_used:t==='withdraw'?Number(w.monthly_used)+a:Number(w.monthly_used)});await addDoc(collection(db,"transactions"),{wallet_id:wid,type:t,amount:a,date:new Date().toISOString().split('T')[0],notes:n,ownerId});await loadAllData();closeTransactionModal();loadWallets()}catch(e){console.error(e)}}

// ================================
// التقارير - مبسطة
// ================================
function loadReports(){
    const tr=globalRepairs.reduce((s,r)=>s+(Number(r.repair_price)||0),0),tpc=globalRepairs.reduce((s,r)=>{if(r.repair_parts){try{return s+JSON.parse(r.repair_parts).reduce((ps,p)=>ps+(Number(p.cost)||0),0)}catch(e){return s+(Number(r.spare_part_cost)||0)}}return s+(Number(r.spare_part_cost)||0)},0),ttf=globalRepairs.reduce((s,r)=>s+(Number(r.technician_fee)||0),0),te=globalExpenses.reduce((s,e)=>s+(Number(e.amount)||0),0),profit=tr-tpc-ttf-te;
    const co=globalRepairs.filter(r=>r.status==='تم_التسليم').length;
    document.getElementById('reports-kpi').innerHTML=`<div class="reports-kpi-grid"><div class="report-card"><div class="report-card-icon icon-blue"><i class="fas fa-dollar-sign"></i></div><div class="report-card-info"><div class="report-card-title">الإيرادات</div><div class="report-card-value">${formatCurrency(tr)}</div></div></div><div class="report-card"><div class="report-card-icon icon-green"><i class="fas fa-chart-pie"></i></div><div class="report-card-info"><div class="report-card-title">صافي الأرباح</div><div class="report-card-value">${formatCurrency(profit)}</div></div></div><div class="report-card"><div class="report-card-icon icon-purple"><i class="fas fa-shopping-cart"></i></div><div class="report-card-info"><div class="report-card-title">متوسط الطلب</div><div class="report-card-value">${formatCurrency(globalRepairs.length>0?Math.round(tr/globalRepairs.length):0)}</div></div></div><div class="report-card"><div class="report-card-icon icon-cyan"><i class="fas fa-check-circle"></i></div><div class="report-card-info"><div class="report-card-title">معدل الإتمام</div><div class="report-card-value">${globalRepairs.length>0?Math.round((co/globalRepairs.length)*100):0}%</div></div></div></div>`;
    document.getElementById('profit-breakdown').innerHTML=`<div class="report-section"><div class="report-section-header"><i class="fas fa-chart-line"></i><h3>تفصيل الأرباح</h3></div><div class="report-section-body"><div class="breakdown-grid"><div class="breakdown-item"><div class="breakdown-label">الإيرادات</div><div class="breakdown-value" style="color:#2563eb">${formatCurrency(tr)}</div></div><div class="breakdown-item"><div class="breakdown-label">قطع الغيار</div><div class="breakdown-value" style="color:#7c3aed">-${formatCurrency(tpc)}</div></div><div class="breakdown-item"><div class="breakdown-label">أجور الفنيين</div><div class="breakdown-value" style="color:#f59e0b">-${formatCurrency(ttf)}</div></div><div class="breakdown-item"><div class="breakdown-label">مصاريف</div><div class="breakdown-value" style="color:#ef4444">-${formatCurrency(te)}</div></div><div class="breakdown-item breakdown-profit"><div class="breakdown-label">صافي</div><div class="breakdown-value">${formatCurrency(profit)}</div></div></div></div></div>`;
    
    // أفضل العملاء
    const cm={};globalRepairs.forEach(r=>{const k=r.customer_phone||r.customer_name;if(!cm[k])cm[k]={name:r.customer_name,total:0,count:0};cm[k].total+=Number(r.repair_price)||0;cm[k].count++});
    document.getElementById('top-customers').innerHTML=Object.values(cm).sort((a,b)=>b.total-a.total).slice(0,8).map((c,i)=>`<div class="customer-row"><div class="customer-rank rank-${i<3?'gold':i<5?'silver':'bronze'}">${i+1}</div><div class="flex-1"><span class="font-semibold">${c.name}</span><br><span class="text-xs text-muted">${c.count} عمليات</span></div><span class="font-bold text-blue">${formatCurrency(c.total)}</span></div>`).join('')||'<p class="text-center text-muted py-4">لا توجد بيانات</p>';
    
    const dm={};globalRepairs.forEach(r=>{if(!r.device_name)return;if(!dm[r.device_name])dm[r.device_name]={name:r.device_name,count:0};dm[r.device_name].count++});
    document.getElementById('top-devices').innerHTML=Object.values(dm).sort((a,b)=>b.count-a.count).slice(0,8).map((d,i)=>`<div class="device-row"><div class="device-rank rank-${i<3?'gold':i<5?'silver':'bronze'}">${i+1}</div><div class="flex-1"><span class="font-semibold">${d.name}</span></div><span class="font-bold">${d.count} جهاز</span></div>`).join('')||'<p class="text-center text-muted py-4">لا توجد بيانات</p>';
}

// ================================
// التنبيهات
// ================================
function updateAlertsCount(){const t=globalParts.filter(p=>p.min_quantity&&p.quantity<=p.min_quantity).length+globalRepairs.filter(r=>r.status!=='تم_التسليم'&&r.delivery_date&&new Date(r.delivery_date)<new Date()).length;const b=document.getElementById('alerts-count');if(b){b.textContent=t;b.classList.toggle('hidden',t===0)}}
function loadAlerts(){const nw=new Date();const all=[...globalParts.filter(p=>p.min_quantity&&p.quantity<=p.min_quantity).map(p=>({title:`مخزون منخفض: ${p.name}`,desc:`الكمية: ${p.quantity}`,icon:'fa-box',color:'text-amber',bg:'#fffbeb',border:'#f59e0b'})),...globalRepairs.filter(r=>r.delivery_date&&r.status!=='تم_التسليم'&&new Date(r.delivery_date)<nw).map(r=>({title:`تأخر تسليم: ${r.device_name}`,desc:`العميل: ${r.customer_name}`,icon:'fa-clock',color:'text-red',bg:'#fef2f2',border:'#ef4444'}))];document.getElementById('alerts-summary-text').textContent=all.length?`${all.length} تنبيه`:'لا توجد تنبيهات';document.getElementById('alerts-list').innerHTML=all.length?all.map(a=>`<div class="card mb-2" style="background:${a.bg};border-right:4px solid ${a.border}"><div class="card-body"><div class="flex items-start gap-3"><i class="fas ${a.icon} ${a.color} text-xl mt-1"></i><div><p class="font-bold">${a.title}</p><p class="text-sm text-muted">${a.desc}</p></div></div></div>`).join(''):'<div class="card"><div class="card-body text-center py-10"><i class="fas fa-check-circle text-green" style="font-size:40px;margin-bottom:12px"></i><p class="text-lg font-bold text-green">كل شيء على ما يرام!</p></div></div>'}

// ================================
// الاشتراكات
// ================================
function loadSubscriptions(){
    const s=(document.getElementById('sub-search')?.value||'').toLowerCase(),f=document.getElementById('sub-filter')?.value||'all';
    let fl=globalSubscriptions.filter(s=>(!s||s.customer_name?.toLowerCase().includes(s)||s.customer_email?.toLowerCase().includes(s))&&(f==='all'||s.status===f));
    document.getElementById('subscription-summary-cards').innerHTML=`<div class="stat-card"><div class="stat-card-icon icon-green"><i class="fas fa-check-circle"></i></div><p class="stat-card-title">نشطة</p><p class="stat-card-value">${globalSubscriptions.filter(s=>s.status==='نشط').length}</p></div><div class="stat-card"><div class="stat-card-icon icon-red"><i class="fas fa-times-circle"></i></div><p class="stat-card-title">منتهية</p><p class="stat-card-value">${globalSubscriptions.filter(s=>s.status==='منتهي').length}</p></div>`;
    document.getElementById('subscriptions-table-body').innerHTML=fl.length?fl.map((s,i)=>`<tr><td>${i+1}</td><td>${s.customer_name||'-'}</td><td>${s.customer_email||'-'}</td><td>${s.plan||'-'}</td><td>${formatCurrency(s.price)}</td><td>${s.start_date||'-'}</td><td>${s.end_date||'-'}</td><td>${getDaysLeft(s.end_date)}</td><td>${s.status==='نشط'?'<span class="badge badge-green">نشط</span>':'<span class="badge badge-red">منتهي</span>'}</td><td><div class="flex gap-1"><button class="btn-icon" onclick="openSubscriptionModal('${s.id}')"><i class="fas fa-pen"></i></button>${s.status==='منتهي'?`<button class="btn-primary btn-xs" onclick="renewSubscription('${s.id}')"><i class="fas fa-sync-alt"></i></button>`:''}<button class="btn-danger btn-xs" onclick="confirmDelete('subscription','${s.id}')"><i class="fas fa-trash"></i></button></div></td></tr>`).join(''):'<tr><td colspan="10" class="text-center py-6 text-muted">لا توجد اشتراكات</td></tr>';
}

function getDaysLeft(ed){if(!ed)return'<span class="badge badge-gray">غير محدد</span>';const e=new Date(ed),t=new Date(),d=Math.ceil((e-t)/(1000*60*60*24));if(d<0)return`<span class="badge badge-red">انتهي منذ ${Math.abs(d)} يوم</span>`;if(d===0)return'<span class="badge badge-red">ينتهي اليوم!</span>';if(d<=30)return`<span class="badge badge-amber">متبقي ${d} يوم</span>`;return`<span class="badge badge-green">متبقي ${d} يوم</span>`}

function openSubscriptionModal(sid=null){showModal('subscription-modal');document.getElementById('subscription-form').reset();document.getElementById('subscription-start-date').value=new Date().toISOString().split('T')[0];const sel=document.getElementById('subscription-linked-user');if(sel)sel.innerHTML='<option value="">اختر مستخدم</option>'+globalUsers.map(u=>`<option value="${u.id}">${u.fullName||u.name||u.email} (${u.email})</option>`).join('');if(sid){const s=globalSubscriptions.find(s=>s.id===sid);if(s){document.getElementById('subscription-modal-title').textContent='تعديل اشتراك';document.getElementById('subscription-id').value=s.id;document.getElementById('subscription-customer-name').value=s.customer_name||'';document.getElementById('subscription-customer-email').value=s.customer_email||'';document.getElementById('subscription-plan').value=s.plan||'تجريبي';document.getElementById('subscription-price').value=s.price||0;document.getElementById('subscription-start-date').value=s.start_date||'';document.getElementById('subscription-end-date').value=s.end_date||'';if(s.linked_user_id&&sel)sel.value=s.linked_user_id}}else{document.getElementById('subscription-modal-title').textContent='اشتراك جديد';document.getElementById('subscription-id').value='';onSubscriptionPlanChange()}document.getElementById('subscription-end-date')?.removeAttribute('readonly')}
function closeSubscriptionModal(){hideModal('subscription-modal')}
function onLinkedUserChange(){const uid=document.getElementById('subscription-linked-user')?.value;if(uid){const u=globalUsers.find(u=>u.id===uid);if(u){document.getElementById('subscription-customer-name').value=u.fullName||u.name||'';document.getElementById('subscription-customer-email').value=u.email||''}}}
function onSubscriptionPlanChange(){const p=document.getElementById('subscription-plan')?.value,sd=document.getElementById('subscription-start-date')?.value||new Date().toISOString().split('T')[0],ed=new Date(sd);if(p==='تجريبي')ed.setDate(ed.getDate()+3);else if(p==='شهري')ed.setMonth(ed.getMonth()+1);else if(p==='سنوي')ed.setFullYear(ed.getFullYear()+1);document.getElementById('subscription-end-date').value=ed.toISOString().split('T')[0]}
async function saveSubscription(e){e.preventDefault();const id=document.getElementById('subscription-id').value;const d={customer_name:document.getElementById('subscription-customer-name').value,customer_email:document.getElementById('subscription-customer-email').value,plan:document.getElementById('subscription-plan').value,price:Number(document.getElementById('subscription-price').value)||0,start_date:document.getElementById('subscription-start-date').value,end_date:document.getElementById('subscription-end-date').value,status:'نشط',linked_user_id:document.getElementById('subscription-linked-user').value||null,ownerId};try{if(id)await updateDoc(doc(db,"subscriptions",id),d);else await addDoc(collection(db,"subscriptions"),d);if(d.linked_user_id)await updateDoc(doc(db,"users",d.linked_user_id),{subscription:{plan:d.plan,status:'نشط',start_date:d.start_date,end_date:d.end_date,price:d.price},subscriptionType:d.plan,subscriptionEnd:d.end_date,isApproved:true,status:'active'});await loadAllData();closeSubscriptionModal();loadSubscriptions();updateSubscriptionCounter()}catch(e){console.error(e)}}
async function renewSubscription(id){const s=globalSubscriptions.find(s=>s.id===id);if(!s)return;const ne=new Date(s.end_date);if(s.plan==='شهري')ne.setMonth(ne.getMonth()+1);else if(s.plan==='سنوي')ne.setFullYear(ne.getFullYear()+1);else ne.setDate(ne.getDate()+3);try{await updateDoc(doc(db,"subscriptions",id),{end_date:ne.toISOString().split('T')[0],status:'نشط'});if(s.linked_user_id)await updateDoc(doc(db,"users",s.linked_user_id),{'subscription.end_date':ne.toISOString().split('T')[0],'subscription.status':'نشط',subscriptionEnd:ne.toISOString().split('T')[0],status:'active'});await loadAllData();loadSubscriptions();updateSubscriptionCounter()}catch(e){console.error(e)}}

// ================================
// الإعدادات
// ================================
function loadSettings(){
    document.getElementById('settings-content').innerHTML=`
        <div class="settings-section"><div class="settings-section-header"><div class="settings-section-icon" style="background:#dbeafe"><i class="fas fa-store text-blue"></i></div><div><div class="settings-section-title">بيانات المحل</div><div class="settings-section-subtitle">تظهر في الفواتير والتقارير</div></div></div><div class="settings-section-body">
            <div class="shop-image-upload"><img class="shop-image-preview" id="settings-shop-image" src="${globalSettings.shop_image||''}" alt="صورة المحل" onerror="this.style.display='none'"><div class="shop-image-actions"><button class="btn-secondary btn-sm" onclick="document.getElementById('settings-shop-input').click()"><i class="fas fa-camera"></i> تغيير الصورة</button><p class="text-xs text-muted">تظهر في الشريط الجانبي</p></div><input type="file" id="settings-shop-input" accept="image/*" style="display:none" onchange="handleSettingsImage(event)"></div>
            <div class="settings-grid"><div class="settings-field"><label>اسم المحل</label><input class="input-field" id="set-shop-name" value="${globalSettings.shop_name||''}"></div><div class="settings-field"><label>اسم المالك</label><input class="input-field" id="set-owner-name" value="${globalSettings.owner_name||''}"></div><div class="settings-field"><label>رقم الهاتف</label><input class="input-field" id="set-phone" value="${globalSettings.phone||''}"></div><div class="settings-field"><label>العنوان</label><input class="input-field" id="set-address" value="${globalSettings.address||''}"></div></div>
        </div></div>
        <div class="settings-section"><div class="settings-section-header"><div class="settings-section-icon" style="background:#d1fae5"><i class="fas fa-shield-alt text-green"></i></div><div><div class="settings-section-title">الضمان</div><div class="settings-section-subtitle">تظهر في الفاتورة المطبوعة</div></div></div><div class="settings-section-body"><div class="settings-field"><label>أيام الضمان</label><input type="number" class="input-field w-32" id="set-warranty-days" value="${globalSettings.warranty_days||30}"></div><div class="settings-field"><label>نص الضمان</label><textarea class="input-field" id="set-warranty-notes" rows="2">${globalSettings.warranty_notes||''}</textarea></div></div></div>
        <div class="settings-section"><div class="settings-section-header"><div class="settings-section-icon" style="background:#ede9fe"><i class="fas fa-users-cog text-purple"></i></div><div><div class="settings-section-title">الفنيين</div></div></div><div class="settings-section-body"><div class="flex gap-2 mb-4"><input class="input-field" id="new-technician" placeholder="اسم الفني..."><button class="btn-primary" onclick="addTechnician()"><i class="fas fa-plus"></i> إضافة</button></div><div id="technicians-list">${globalTechnicians.map((t,i)=>`<div class="flex justify-between items-center bg-gray-50 rounded-lg p-3 mb-2"><span>${t}</span><button class="btn-icon text-red" onclick="window.removeTechnician(${i})"><i class="fas fa-trash"></i></button></div>`).join('')}</div></div></div>
        <button class="btn-primary mt-4 w-full" onclick="saveSettings()"><i class="fas fa-save"></i> حفظ الإعدادات</button>`;
}

async function handleSettingsImage(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=async function(ev){document.getElementById('settings-shop-image').src=ev.target.result;document.getElementById('sidebar-shop-image').src=ev.target.result;globalSettings.shop_image=ev.target.result;try{await setDoc(doc(db,"settings",ownerId),{shop_image:ev.target.result},{merge:true})}catch(e){console.error(e)}};r.readAsDataURL(f)}
function addTechnician(){const i=document.getElementById('new-technician');if(i?.value.trim()){globalTechnicians.push(i.value.trim());i.value='';renderTechList();updateTechSelects()}}
function removeTechnician(idx){globalTechnicians.splice(idx,1);renderTechList();updateTechSelects()}
function renderTechList(){const l=document.getElementById('technicians-list');if(l)l.innerHTML=globalTechnicians.map((t,i)=>`<div class="flex justify-between items-center bg-gray-50 rounded-lg p-3 mb-2"><span>${t}</span><button class="btn-icon text-red" onclick="window.removeTechnician(${i})"><i class="fas fa-trash"></i></button></div>`).join('')||'<p class="text-sm text-muted">لا يوجد فنيين</p>'}
function updateTechSelects(){const s=document.getElementById('repair-technician');if(s)s.innerHTML=globalTechnicians.map(t=>`<option value="${t}">${t}</option>`).join('')}
async function saveSettings(){globalSettings.shop_name=document.getElementById('set-shop-name')?.value||'';globalSettings.owner_name=document.getElementById('set-owner-name')?.value||'';globalSettings.phone=document.getElementById('set-phone')?.value||'';globalSettings.address=document.getElementById('set-address')?.value||'';globalSettings.warranty_days=parseInt(document.getElementById('set-warranty-days')?.value)||30;globalSettings.warranty_notes=document.getElementById('set-warranty-notes')?.value||'';globalSettings.technicians=globalTechnicians;try{await setDoc(doc(db,"settings",ownerId),globalSettings);updateSidebarShopInfo();alert('✅ تم الحفظ')}catch(e){console.error(e)}}

// ================================
// تأكيد الحذف
// ================================
function confirmDelete(type,id){deleteTarget={type,id};const labels={repair:'أمر الصيانة',part:'قطعة الغيار',expense:'المصروف',wallet:'المحفظة',subscription:'الاشتراك'};let name='';if(type==='repair')name=globalRepairs.find(i=>i.id===id)?.device_name;if(type==='part')name=globalParts.find(i=>i.id===id)?.name;if(type==='expense')name=globalExpenses.find(i=>i.id===id)?.title;if(type==='wallet')name=globalWallets.find(i=>i.id===id)?.name;if(type==='subscription')name=globalSubscriptions.find(i=>i.id===id)?.customer_name;document.getElementById('delete-message').textContent=`هل أنت متأكد من حذف ${labels[type]||''} "${name||''}"؟`;showModal('delete-modal')}
function closeDeleteModal(){hideModal('delete-modal');deleteTarget=null}
async function executeDelete(){if(!deleteTarget)return;const{type,id}=deleteTarget;try{if(type==='repair')await deleteDoc(doc(db,"repairs",id));if(type==='part')await deleteDoc(doc(db,"parts",id));if(type==='expense')await deleteDoc(doc(db,"expenses",id));if(type==='wallet')await deleteDoc(doc(db,"wallets",id));if(type==='subscription')await deleteDoc(doc(db,"subscriptions",id));await loadAllData();closeDeleteModal();loadDashboard();updateAlertsCount();const at=document.querySelector('.tab-content.active')?.id?.replace('tab-','');if(at==='repairs')loadRepairsTable();if(at==='inventory')loadInventoryTable();if(at==='expenses')loadExpensesTable();if(at==='wallet')loadWallets();if(at==='subscriptions')loadSubscriptions()}catch(e){console.error(e)}}

// ================================
// تعريض الدوال
// ================================
window.formatCurrency=formatCurrency;window.switchTab=switchTab;window.logout=logout;
window.openRepairForm=openRepairForm;window.closeRepairForm=closeRepairForm;
window.quickStatusChange=quickStatusChange;window.printRepairInvoice=printRepairInvoice;
window.openPartForm=openPartForm;window.closePartForm=closePartForm;
window.openExpenseForm=openExpenseForm;window.closeExpenseForm=closeExpenseForm;
window.openWalletModal=openWalletModal;window.closeWalletModal=closeWalletModal;
window.openTransactionModal=openTransactionModal;window.closeTransactionModal=closeTransactionModal;
window.openSubscriptionModal=openSubscriptionModal;window.closeSubscriptionModal=closeSubscriptionModal;
window.onWalletTypeChange=onWalletTypeChange;window.onLinkedUserChange=onLinkedUserChange;
window.onSubscriptionPlanChange=onSubscriptionPlanChange;window.renewSubscription=renewSubscription;
window.addTechnician=addTechnician;window.removeTechnician=removeTechnician;
window.saveSettings=saveSettings;window.confirmDelete=confirmDelete;
window.closeDeleteModal=closeDeleteModal;window.toggleUserApproval=toggleUserApproval;
window.addPartFromInventory=addPartFromInventory;window.removeRepairPart=removeRepairPart;
window.handleShopImageUpload=handleShopImageUpload;window.handleSettingsImage=handleSettingsImage;
window.loadRepairsTable=loadRepairsTable;window.loadInventoryTable=loadInventoryTable;
window.loadExpensesTable=loadExpensesTable;window.loadCustomersTable=loadCustomersTable;
window.loadWallets=loadWallets;window.loadSubscriptions=loadSubscriptions;

// بدء التطبيق
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initApp);else initApp();
