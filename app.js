/**
 * التطبيق الرئيسي - نقطة البداية والتحكم
 * @module App
 * @requires جميع الوحدات
 */
'use strict';

const App = (() => {
    // ==================== متغيرات التطبيق ====================
    
    let autoSaveInterval = null;
    let currentPage = 'dashboard';
    
    // ==================== التهيئة ====================
    
    /**
     * تهيئة التطبيق
     */
    async function init() {
        console.log(`🚀 بدء تشغيل ${CONFIG.APP.name} v${CONFIG.APP.version}`);
        
        try {
            // تهيئة مراجع DOM
            UIRenderer.initDOMElements();
            
            // تحميل المستخدمين من localStorage
            loadUsers();
            
            // محاولة استعادة الجلسة
            const sessionRestored = Auth.restoreSession();
            
            if (sessionRestored) {
                await showDashboard();
            } else {
                showLoginScreen();
            }
            
            // إعداد مستمعات الأحداث العامة
            setupGlobalEventListeners();
            
            // إعداد PWA
            setupPWA();
            
            // مراقبة حالة الاتصال
            setupConnectivityMonitoring();
            
            console.log('✅ التهيئة اكتملت بنجاح');
            
        } catch (error) {
            console.error('❌ خطأ في التهيئة:', error);
            UIRenderer.showToast('حدث خطأ في تشغيل التطبيق', 'error');
        }
    }

    /**
     * تحميل المستخدمين
     */
    function loadUsers() {
        const savedUsers = localStorage.getItem('users');
        if (savedUsers) {
            try {
                const users = JSON.parse(savedUsers);
                StateManager.set('users', users);
            } catch (error) {
                console.error('خطأ في تحميل المستخدمين:', error);
            }
        }
        
        // التأكد من وجود المستخدم الأساسي
        const users = StateManager.get('users');
        if (!users.find(u => u.id === CONFIG.ADMIN.id)) {
            users.unshift(CONFIG.ADMIN);
            StateManager.set('users', users);
            localStorage.setItem('users', JSON.stringify(users));
        }
    }

    // ==================== إدارة الشاشات ====================
    
    /**
     * إظهار شاشة تسجيل الدخول
     */
    function showLoginScreen() {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('dashboardScreen').style.display = 'none';
        
        // تطبيق الوضع الليلي
        const darkMode = localStorage.getItem('darkMode') === 'true' || 
                        window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (darkMode) {
            document.body.classList.add('dark-mode');
        }
        
        // تركيز حقل اسم المستخدم
        setTimeout(() => {
            document.getElementById('loginIdentity')?.focus();
        }, 500);
    }

    /**
     * إظهار لوحة التحكم
     */
    async function showDashboard() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboardScreen').style.display = 'block';
        
        // تطبيق الوضع الليلي
        const darkMode = localStorage.getItem('darkMode') === 'true';
        if (darkMode) {
            document.body.classList.add('dark-mode');
        }
        
        // عرض البيانات
        UIRenderer.renderAll();
        
        // عرض المخططات
        Charts.initAllCharts();
        
        // عرض CRM إذا كان مفعلاً
        const user = StateManager.get('currentUser');
        if (user?.crmAccess !== false) {
            CRM.init();
        }
        
        // تحديث واجهة المستخدم
        UIRenderer.updateHeaderInfo();
        updateCurrentDate();
        
        // إظهار/إخفاء عناصر الأدمن
        toggleAdminElements();
        
        // عرض صفحة لوحة التحكم افتراضياً
        navigateToPage('dashboard');
        
        // بدء الحفظ التلقائي
        startAutoSave();
        
        // التحقق من التنبيهات
        checkAlerts();
        
        // إغلاق القائمة الجانبية على الجوال
        closeSidebar();
    }

    /**
     * التنقل إلى صفحة
     * @param {string} pageName - اسم الصفحة
     */
    function navigateToPage(pageName) {
        currentPage = pageName;
        
        // إخفاء جميع الصفحات
        document.querySelectorAll('.page-section').forEach(section => {
            section.style.display = 'none';
        });
        
        // عرض الصفحة المطلوبة
        const sectionId = getSectionId(pageName);
        const section = document.getElementById(sectionId);
        
        if (section) {
            section.style.display = 'block';
            section.style.animation = 'pageIn 0.3s ease';
        }
        
        // تحديث القائمة النشطة
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeItem = document.querySelector(`.nav-item[data-page="${pageName}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }
        
        // تنفيذ إجراءات خاصة بالصفحة
        handlePageSpecificActions(pageName);
        
        // التمرير للأعلى
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // إغلاق القائمة الجانبية على الجوال
        if (window.innerWidth <= 768) {
            closeSidebar();
        }
    }

    /**
     * الحصول على معرف القسم للصفحة
     */
    function getSectionId(pageName) {
        const pageMap = {
            'dashboard': 'dashboardSection',
            'quickSale': 'quickSaleSection',
            'crm': 'crmSection',
            'repair': 'repairSection',
            'inventory': 'inventorySection',
            'customers': 'customersSection',
            'expenses': 'expensesSection',
            'reports': 'reportsSection',
            'alertsPage': 'alertsPageSection',
            'auditLog': 'auditLogSection',
            'profile': 'profileSection',
            'settings': 'settingsSection',
            'admin': 'adminSection'
        };
        
        return pageMap[pageName] || `${pageName}Section`;
    }

    /**
     * إجراءات خاصة بكل صفحة
     */
    function handlePageSpecificActions(pageName) {
        switch (pageName) {
            case 'dashboard':
                Charts.initAllCharts();
                UIRenderer.renderAll();
                break;
                
            case 'crm':
                CRM.renderAllCRM();
                break;
                
            case 'quickSale':
                renderQuickSalePage();
                break;
                
            case 'settings':
                renderSettingsPage();
                break;
                
            case 'reports':
                renderReportsPage();
                break;
                
            case 'admin':
                renderAdminPage();
                break;
                
            case 'profile':
                renderProfilePage();
                break;
                
            case 'auditLog':
                UIRenderer.renderAuditLog();
                break;
        }
    }

    // ==================== إعداد المستمعات ====================
    
    /**
     * إعداد مستمعات الأحداث العامة
     */
    function setupGlobalEventListeners() {
        // نموذج تسجيل الدخول
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                handleLogin();
            });
        }
        
        // زر تسجيل الدخول
        document.getElementById('loginButton')?.addEventListener('click', handleLogin);
        
        // زر التسجيل
        document.getElementById('registerLinkBtn')?.addEventListener('click', () => {
            UIComponents.openModal('registerModal');
        });
        
        // زر تسجيل الخروج
        document.getElementById('logoutButton')?.addEventListener('click', handleLogout);
        
        // تبديل الوضع الليلي
        document.getElementById('darkModeToggle')?.addEventListener('click', toggleDarkMode);
        
        // القائمة الجانبية
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', function() {
                const page = this.getAttribute('data-page');
                navigateToPage(page);
            });
        });
        
        // زر القائمة للجوال
        document.getElementById('menuToggle')?.addEventListener('click', toggleSidebar);
        
        // Overlay القائمة الجانبية
        document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);
        
        // إغلاق النوافذ المنبثقة
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });
        
        // مفتاح Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                UIComponents.closeAllModals();
                closeSidebar();
            }
        });
        
        // اختصار Ctrl+S للحفظ
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveAllData();
                UIRenderer.showToast('تم حفظ جميع البيانات', 'success');
            }
        });
    }

    /**
     * معالجة تسجيل الدخول
     */
    async function handleLogin() {
        const identity = document.getElementById('loginIdentity').value.trim();
        const password = document.getElementById('loginPassword').value;
        
        if (!identity || !password) {
            UIRenderer.showToast('أدخل اسم المستخدم وكلمة المرور', 'error');
            return;
        }
        
        // تعطيل زر الدخول مؤقتاً
        const loginBtn = document.getElementById('loginButton');
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الدخول...';
        }
        
        try {
            const user = await Auth.login(identity, password);
            UIRenderer.showToast(`مرحباً ${user.fullName || user.username}! 👋`, 'success');
            await showDashboard();
        } catch (error) {
            UIRenderer.showToast(error.message, 'error');
        } finally {
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> دخول';
            }
        }
    }

    /**
     * معالجة تسجيل الخروج
     */
    function handleLogout() {
        stopAutoSave();
        Auth.logout();
        showLoginScreen();
        UIRenderer.showToast('تم تسجيل الخروج بنجاح', 'success');
    }

    // ==================== إدارة الوضع الليلي ====================
    
    /**
     * تبديل الوضع الليلي
     */
    function toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('darkMode', isDark.toString());
        
        // تحديث أيقونة الزر
        const icon = document.getElementById('darkModeIcon');
        const label = document.getElementById('darkModeLabel');
        
        if (icon) {
            icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
        }
        if (label) {
            label.textContent = isDark ? 'نهاري' : 'ليلي';
        }
        
        // تحديث المخططات
        setTimeout(() => {
            Charts.initAllCharts();
        }, 300);
        
        UIRenderer.showToast(
            isDark ? 'الوضع الليلي مفعل 🌙' : 'الوضع النهاري مفعل ☀️', 
            'success'
        );
    }

    // ==================== القائمة الجانبية ====================
    
    function toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        
        if (sidebar) {
            sidebar.classList.toggle('open');
        }
        if (overlay) {
            overlay.classList.toggle('show');
        }
    }

    function closeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        
        if (sidebar) {
            sidebar.classList.remove('open');
        }
        if (overlay) {
            overlay.classList.remove('show');
        }
    }

    // ==================== الحفظ التلقائي ====================
    
    function startAutoSave() {
        stopAutoSave();
        autoSaveInterval = setInterval(() => {
            if (StateManager.get('currentUser')) {
                DataManager.saveAllUserData();
                updateAutoSaveIndicator();
            }
        }, CONFIG.SYSTEM.autoSaveInterval);
    }

    function stopAutoSave() {
        if (autoSaveInterval) {
            clearInterval(autoSaveInterval);
            autoSaveInterval = null;
        }
    }

    function saveAllData() {
        DataManager.saveAllUserData();
        updateAutoSaveIndicator();
    }

    function updateAutoSaveIndicator() {
        const indicator = document.getElementById('autoSaveIndicator');
        if (indicator) {
            const time = new Date().toLocaleTimeString('ar-EG', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            indicator.innerHTML = `<i class="fas fa-check-circle" style="color: var(--success);"></i> تم الحفظ ${time}`;
            
            setTimeout(() => {
                if (indicator) {
                    indicator.innerHTML = '<i class="fas fa-circle"></i> حفظ تلقائي';
                }
            }, 2000);
        }
    }

    // ==================== وظائف مساعدة ====================
    
    function updateCurrentDate() {
        const element = document.getElementById('currentDateDisplay');
        if (element) {
            const date = Utils.formatDate(new Date());
            element.innerHTML = `<i class="far fa-calendar-alt"></i> ${date}`;
        }
    }

    function toggleAdminElements() {
        const isAdmin = Auth.hasPermission('admin');
        
        const adminNav = document.getElementById('adminNav');
        const auditLogNav = document.getElementById('auditLogNav');
        const crmNav = document.querySelector('.nav-item[data-page="crm"]');
        
        if (adminNav) adminNav.style.display = isAdmin ? 'flex' : 'none';
        if (auditLogNav) auditLogNav.style.display = isAdmin ? 'flex' : 'none';
        
        if (crmNav) {
            const user = StateManager.get('currentUser');
            crmNav.style.display = user?.crmAccess !== false ? 'flex' : 'none';
        }
    }

    function checkAlerts() {
        const repairs = StateManager.get('repairs');
        const today = new Date().toISOString().slice(0, 10);
        
        const overdue = repairs.filter(r => 
            r.userId === StateManager.get('currentUser')?.id &&
            r.deliveryDate && 
            r.deliveryDate < today && 
            r.status !== 'تم التسليم'
        );
        
        if (overdue.length > 0) {
            setTimeout(() => {
                UIRenderer.showToast(
                    `⚠️ تنبيه: ${overdue.length} جهاز متأخر عن موعد التسليم!`, 
                    'warning'
                );
            }, 1000);
        }
    }

    // ==================== PWA ====================
    
    function setupPWA() {
        // تسجيل Service Worker
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(registration => {
                        console.log('✅ Service Worker مسجل:', registration.scope);
                    })
                    .catch(error => {
                        console.error('❌ فشل تسجيل Service Worker:', error);
                    });
            });
        }
        
        // تثبيت التطبيق
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            
            const installBtn = document.getElementById('installPrompt');
            if (installBtn) {
                installBtn.style.display = 'block';
                installBtn.addEventListener('click', async () => {
                    if (deferredPrompt) {
                        deferredPrompt.prompt();
                        const result = await deferredPrompt.userChoice;
                        console.log('نتيجة التثبيت:', result.outcome);
                        deferredPrompt = null;
                        installBtn.style.display = 'none';
                    }
                });
            }
        });
        
        window.addEventListener('appinstalled', () => {
            const installBtn = document.getElementById('installPrompt');
            if (installBtn) installBtn.style.display = 'none';
            console.log('✅ تم تثبيت التطبيق');
        });
    }

    // ==================== مراقبة الاتصال ====================
    
    function setupConnectivityMonitoring() {
        const offlineBanner = document.getElementById('offlineBanner');
        
        function updateOnlineStatus() {
            if (navigator.onLine) {
                if (offlineBanner) offlineBanner.classList.remove('show');
                console.log('🌐 متصل بالإنترنت');
            } else {
                if (offlineBanner) offlineBanner.classList.add('show');
                console.log('📡 غير متصل - البيانات محفوظة محلياً');
            }
        }
        
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        
        // التحقق الأولي
        updateOnlineStatus();
    }

    // ==================== دوال الصفحات ====================
    
    function renderQuickSalePage() {
        // سيتم تنفيذها في ملف quick-sale.js
        console.log('عرض صفحة البيع السريع');
    }

    function renderSettingsPage() {
        // تحديث حقول الإعدادات
        const shopSettings = StateManager.get('shopSettings');
        if (shopSettings) {
            document.getElementById('shopName').value = shopSettings.shopName || '';
            document.getElementById('shopOwner').value = shopSettings.shopOwner || '';
            document.getElementById('shopPhone').value = shopSettings.shopPhone || '';
            document.getElementById('shopAddress').value = shopSettings.shopAddress || '';
        }
    }

    function renderReportsPage() {
        console.log('عرض صفحة التقارير');
    }

    function renderAdminPage() {
        console.log('عرض صفحة الإدارة');
    }

    function renderProfilePage() {
        const user = StateManager.get('currentUser');
        if (user) {
            document.getElementById('profileFullNameValue').textContent = user.fullName || '-';
            document.getElementById('profileUsernameValue').textContent = user.username || '-';
            document.getElementById('profilePhoneValue').textContent = user.phone || '-';
        }
    }

    // ==================== دوال السلة السريعة ====================
    
    function onProductClick(productId) {
        console.log('نقر على المنتج:', productId);
        // سيتم تنفيذها
    }

    function onChangeQuantity(index, delta) {
        console.log('تغيير الكمية:', index, delta);
        // سيتم تنفيذها
    }

    // ==================== بدء التطبيق ====================
    
    document.addEventListener('DOMContentLoaded', () => {
        init();
        
        // تحديث التاريخ كل دقيقة
        setInterval(updateCurrentDate, 60000);
    });

    // التعامل مع إغلاق التطبيق
    window.addEventListener('beforeunload', () => {
        stopAutoSave();
        if (StateManager.get('currentUser')) {
            DataManager.saveAllUserData();
        }
    });

    // ==================== الواجهة العامة ====================
    return {
        init,
        navigateToPage,
        toggleDarkMode,
        saveAllData,
        onProductClick,
        onChangeQuantity,
        showToast: UIRenderer.showToast
    };
})();