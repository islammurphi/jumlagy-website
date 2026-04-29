/**
 * إدارة البيانات - القراءة والكتابة والحذف
 * @module DataManager
 * @requires StateManager, Utils, CONFIG
 */
'use strict';

const DataManager = (() => {
    // ==================== الدوال المساعدة للتخزين ====================
    
    /**
     * حفظ بيانات محددة للمستخدم الحالي
     * @param {string} key - مفتاح البيانات
     * @param {*} data - البيانات للحفظ
     * @returns {boolean} نجاح العملية
     */
    function saveToStorage(key, data) {
        const user = StateManager.get('currentUser');
        if (!user) return false;
        
        try {
            const storageKey = `${key}_${user.id}`;
            const jsonData = JSON.stringify(data);
            
            // التحقق من حجم البيانات
            if (jsonData.length > CONFIG.SYSTEM.maxBackupSize) {
                console.warn(`بيانات ${key} كبيرة جداً: ${(jsonData.length / 1024 / 1024).toFixed(2)}MB`);
            }
            
            localStorage.setItem(storageKey, jsonData);
            return true;
        } catch (error) {
            console.error(`خطأ في حفظ ${key}:`, error);
            
            if (error.name === 'QuotaExceededError') {
                UIRenderer.showToast(CONFIG.MESSAGES.storageFull, 'error');
            }
            return false;
        }
    }

    /**
     * تحميل بيانات محددة للمستخدم الحالي
     * @param {string} key - مفتاح البيانات
     * @param {*} defaultValue - القيمة الافتراضية
     * @returns {*} البيانات المحملة
     */
    function loadFromStorage(key, defaultValue = null) {
        const user = StateManager.get('currentUser');
        if (!user) return defaultValue;
        
        try {
            const storageKey = `${key}_${user.id}`;
            const data = localStorage.getItem(storageKey);
            return data ? JSON.parse(data) : defaultValue;
        } catch (error) {
            console.error(`خطأ في تحميل ${key}:`, error);
            return defaultValue;
        }
    }

    /**
     * حذف بيانات محددة للمستخدم الحالي
     * @param {string} key - مفتاح البيانات
     */
    function removeFromStorage(key) {
        const user = StateManager.get('currentUser');
        if (!user) return;
        
        localStorage.removeItem(`${key}_${user.id}`);
    }

    /**
     * تحميل جميع بيانات المستخدم
     * @param {string} userId - معرف المستخدم
     */
    function loadAllUserData(userId) {
        const dataMap = {
            repairs: [],
            parts: [],
            customers: [],
            expenses: [],
            technicians: [
                { id: 1, name: 'أحمد' },
                { id: 2, name: 'محمد' },
                { id: 3, name: 'سعيد' }
            ],
            shopSettings: {
                shopName: CONFIG.APP.name,
                shopOwner: '',
                shopPhone: '',
                shopAddress: '',
                shopLogo: '',
                warrantyDays: CONFIG.SYSTEM.defaultWarrantyDays,
                warrantyNotes: 'الضمان يشمل عيوب الصناعة فقط'
            },
            expenseTypes: [...CONFIG.EXPENSE_TYPES],
            activityLog: [],
            crmSettings: {
                stores: [...CONFIG.CRM.defaultStores],
                ratings: [...CONFIG.CRM.defaultRatings],
                followStatuses: [...CONFIG.CRM.defaultFollowStatuses]
            },
            crmCustomers: [],
            dashboardConfig: {
                stats: true,
                statusCards: true,
                recentOrders: true,
                charts: true
            }
        };

        // تحميل كل نوع من البيانات
        Object.entries(dataMap).forEach(([key, defaultValue]) => {
            const loaded = loadFromStorage(key, defaultValue);
            StateManager.set(key, loaded);
        });
    }

    /**
     * حفظ جميع بيانات المستخدم دفعة واحدة
     */
    function saveAllUserData() {
        const state = StateManager.get();
        if (!state.currentUser) return;

        const keysToSave = [
            'repairs', 'parts', 'customers', 'expenses',
            'technicians', 'shopSettings', 'expenseTypes',
            'activityLog', 'crmSettings', 'crmCustomers',
            'dashboardConfig'
        ];

        let savedCount = 0;
        keysToSave.forEach(key => {
            if (saveToStorage(key, state[key])) {
                savedCount++;
            }
        });

        return savedCount === keysToSave.length;
    }

    // ==================== عمليات الصيانة ====================

    /**
     * إضافة أمر صيانة جديد
     * @param {Object} repairData - بيانات الأمر
     * @returns {Object} الأمر المضاف
     */
    function addRepair(repairData) {
        const repairs = StateManager.get('repairs');
        const newRepair = {
            id: Date.now(),
            userId: StateManager.get('currentUser').id,
            deviceType: repairData.deviceType || '',
            device: repairData.device || '',
            customerId: repairData.customerId || null,
            customerName: repairData.customerName || 'عميل',
            customerPhone: repairData.customerPhone || '',
            price: parseFloat(repairData.price) || 0,
            technicianFee: parseFloat(repairData.technicianFee) || 0,
            technician: repairData.technician || '',
            status: CONFIG.REPAIR_STATUSES[0],
            receiveDate: repairData.receiveDate || new Date().toISOString().slice(0, 10),
            deliveryDate: repairData.deliveryDate || '',
            issue: repairData.issue || '',
            receiver: repairData.receiver || '',
            images: repairData.images || [],
            spareParts: repairData.spareParts || [],
            notes: repairData.notes || '',
            createdAt: new Date().toISOString()
        };

        repairs.push(newRepair);
        StateManager.set('repairs', repairs);
        StateManager.addLog('إضافة صيانة', `${newRepair.device} - ${newRepair.customerName}`);
        
        // إضافة العميل تلقائياً إذا لم يكن موجوداً
        if (!repairData.customerId && repairData.customerPhone) {
            addCustomerIfNotExists(repairData.customerName, repairData.customerPhone);
        }
        
        // تحديث المخزون
        if (newRepair.spareParts.length > 0) {
            updateStockAfterRepair(newRepair.spareParts);
        }

        return newRepair;
    }

    /**
     * تحديث أمر صيانة
     * @param {number} repairId - معرف الأمر
     * @param {Object} updates - التحديثات
     * @returns {Object|null} الأمر المحدث
     */
    function updateRepair(repairId, updates) {
        const repairs = StateManager.get('repairs');
        const index = repairs.findIndex(r => r.id === repairId);
        
        if (index === -1) return null;

        const oldRepair = { ...repairs[index] };
        
        // دمج التحديثات
        repairs[index] = {
            ...repairs[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        StateManager.set('repairs', repairs);
        
        // تسجيل التغيير
        const changes = [];
        if (updates.status && updates.status !== oldRepair.status) {
            changes.push(`الحالة: ${oldRepair.status} → ${updates.status}`);
        }
        if (updates.price !== undefined && updates.price !== oldRepair.price) {
            changes.push(`السعر: ${oldRepair.price} → ${updates.price}`);
        }
        
        if (changes.length > 0) {
            StateManager.addLog('تعديل صيانة', `${repairs[index].device}: ${changes.join('، ')}`);
        }

        return repairs[index];
    }

    /**
     * حذف أمر صيانة
     * @param {number} repairId - معرف الأمر
     * @returns {boolean} نجاح العملية
     */
    function deleteRepair(repairId) {
        const repairs = StateManager.get('repairs');
        const repair = repairs.find(r => r.id === repairId);
        
        if (!repair) return false;

        const filteredRepairs = repairs.filter(r => r.id !== repairId);
        StateManager.set('repairs', filteredRepairs);
        StateManager.addLog('حذف صيانة', `${repair.device} - ${repair.customerName}`);

        return true;
    }

    /**
     * الحصول على إحصائيات الصيانة
     * @returns {Object} الإحصائيات
     */
    function getRepairStats() {
        const repairs = StateManager.get('repairs');
        const userRepairs = repairs.filter(r => r.userId === StateManager.get('currentUser')?.id);
        
        const stats = {
            total: userRepairs.length,
            byStatus: {},
            totalRevenue: 0,
            totalFees: 0,
            totalPartsCost: 0,
            overdueCount: 0
        };

        const today = new Date().toISOString().slice(0, 10);

        userRepairs.forEach(repair => {
            // إحصائيات الحالة
            stats.byStatus[repair.status] = (stats.byStatus[repair.status] || 0) + 1;
            
            // الإيرادات
            stats.totalRevenue += repair.price || 0;
            stats.totalFees += repair.technicianFee || 0;
            
            // تكلفة القطع
            if (repair.spareParts) {
                repair.spareParts.forEach(part => {
                    stats.totalPartsCost += (part.price * part.qty);
                });
            }
            
            // المتأخرات
            if (repair.deliveryDate && repair.deliveryDate < today && repair.status !== 'تم التسليم') {
                stats.overdueCount++;
            }
        });

        stats.netProfit = stats.totalRevenue - stats.totalFees - stats.totalPartsCost;

        return stats;
    }

    // ==================== عمليات المخزون ====================

    /**
     * إضافة قطعة جديدة للمخزون
     * @param {Object} partData - بيانات القطعة
     * @returns {Object} القطعة المضافة
     */
    function addPart(partData) {
        const parts = StateManager.get('parts');
        const newPart = {
            id: Date.now(),
            userId: StateManager.get('currentUser').id,
            name: partData.name || '',
            price: parseFloat(partData.price) || 0,
            qty: parseInt(partData.qty) || 0,
            minStock: parseInt(partData.minStock) || CONFIG.SYSTEM.defaultMinStock,
            category: partData.category || '',
            supplier: partData.supplier || '',
            lastUpdated: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };

        parts.push(newPart);
        StateManager.set('parts', parts);
        StateManager.addLog('إضافة قطعة', `${newPart.name} - الكمية: ${newPart.qty}`);

        return newPart;
    }

    /**
     * تحديث كمية قطعة
     * @param {number} partId - معرف القطعة
     * @param {number} quantityChange - التغيير في الكمية
     */
    function updatePartQuantity(partId, quantityChange) {
        const parts = StateManager.get('parts');
        const part = parts.find(p => p.id === partId);
        
        if (!part) return null;

        part.qty = Math.max(0, (part.qty || 0) + quantityChange);
        part.lastUpdated = new Date().toISOString();
        
        StateManager.set('parts', parts);
        
        // التحقق من الحد الأدنى
        if (part.qty <= part.minStock && part.qty > 0) {
            return { warning: true, part };
        }
        
        return { warning: false, part };
    }

    /**
     * تحديث المخزون بعد إضافة قطع في أمر صيانة
     * @param {Array} spareParts - القطع المستخدمة
     */
    function updateStockAfterRepair(spareParts) {
        spareParts.forEach(part => {
            updatePartQuantity(part.id, -part.qty);
        });
    }

    /**
     * الحصول على القطع المنخفضة
     * @returns {Array} القطع تحت الحد الأدنى
     */
    function getLowStockParts() {
        const parts = StateManager.get('parts');
        return parts.filter(p => 
            p.userId === StateManager.get('currentUser')?.id && 
            p.qty <= p.minStock
        );
    }

    // ==================== عمليات العملاء ====================

    /**
     * إضافة عميل جديد
     * @param {Object} customerData - بيانات العميل
     * @returns {Object} العميل المضاف
     */
    function addCustomer(customerData) {
        const customers = StateManager.get('customers');
        
        // التحقق من عدم وجود العميل
        const existingCustomer = customers.find(c => 
            c.phone === customerData.phone && 
            c.userId === StateManager.get('currentUser').id
        );
        
        if (existingCustomer) {
            return existingCustomer;
        }

        const newCustomer = {
            id: Date.now(),
            userId: StateManager.get('currentUser').id,
            name: customerData.name || '',
            phone: customerData.phone || '',
            email: customerData.email || '',
            address: customerData.address || '',
            notes: customerData.notes || '',
            totalRepairs: 0,
            createdAt: new Date().toISOString()
        };

        customers.push(newCustomer);
        StateManager.set('customers', customers);
        StateManager.addLog('إضافة عميل', `${newCustomer.name} - ${newCustomer.phone}`);

        return newCustomer;
    }

    /**
     * إضافة عميل إذا لم يكن موجوداً
     * @param {string} name - اسم العميل
     * @param {string} phone - رقم الهاتف
     */
    function addCustomerIfNotExists(name, phone) {
        const customers = StateManager.get('customers');
        const exists = customers.find(c => 
            c.phone === phone && 
            c.userId === StateManager.get('currentUser').id
        );
        
        if (!exists && phone) {
            addCustomer({ name, phone });
        }
    }

    /**
     * الحصول على إحصائيات العميل
     * @param {number} customerId - معرف العميل
     * @returns {Object} إحصائيات العميل
     */
    function getCustomerStats(customerId) {
        const repairs = StateManager.get('repairs');
        const customerRepairs = repairs.filter(r => 
            r.customerId === customerId && 
            r.userId === StateManager.get('currentUser')?.id
        );

        return {
            total: customerRepairs.length,
            active: customerRepairs.filter(r => r.status === 'قيد الصيانة').length,
            repaired: customerRepairs.filter(r => r.status === 'تم الإصلاح').length,
            delivered: customerRepairs.filter(r => r.status === 'تم التسليم').length,
            totalSpent: customerRepairs.reduce((sum, r) => sum + (r.price || 0), 0),
            lastVisit: customerRepairs.length > 0 ? 
                customerRepairs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].createdAt : null
        };
    }

    // ==================== عمليات المصروفات ====================

    /**
     * إضافة مصروف جديد
     * @param {Object} expenseData - بيانات المصروف
     * @returns {Object} المصروف المضاف
     */
    function addExpense(expenseData) {
        const expenses = StateManager.get('expenses');
        const newExpense = {
            id: Date.now(),
            userId: StateManager.get('currentUser').id,
            title: expenseData.title || '',
            amount: parseFloat(expenseData.amount) || 0,
            date: expenseData.date || new Date().toISOString().slice(0, 10),
            description: expenseData.description || '',
            category: expenseData.category || 'أخرى',
            createdAt: new Date().toISOString()
        };

        expenses.push(newExpense);
        StateManager.set('expenses', expenses);
        StateManager.addLog('إضافة مصروف', `${newExpense.title} - ${Utils.formatCurrency(newExpense.amount)}`);

        return newExpense;
    }

    /**
     * الحصول على ملخص المصروفات
     * @param {string} startDate - تاريخ البداية
     * @param {string} endDate - تاريخ النهاية
     * @returns {Object} ملخص المصروفات
     */
    function getExpenseSummary(startDate, endDate) {
        const expenses = StateManager.get('expenses');
        const filteredExpenses = expenses.filter(e => {
            if (e.userId !== StateManager.get('currentUser')?.id) return false;
            if (startDate && e.date < startDate) return false;
            if (endDate && e.date > endDate) return false;
            return true;
        });

        const summary = {
            total: filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
            count: filteredExpenses.length,
            byCategory: {}
        };

        filteredExpenses.forEach(expense => {
            summary.byCategory[expense.title] = 
                (summary.byCategory[expense.title] || 0) + expense.amount;
        });

        return summary;
    }

    // ==================== النسخ الاحتياطي ====================

    /**
     * تصدير نسخة احتياطية كاملة
     * @returns {Object} بيانات النسخ الاحتياطي
     */
    function exportBackup() {
        const state = StateManager.get();
        const user = state.currentUser;
        
        if (!user) return null;

        return {
            version: CONFIG.APP.version,
            exportDate: new Date().toISOString(),
            user: {
                id: user.id,
                username: user.username,
                fullName: user.fullName
            },
            data: {
                repairs: state.repairs,
                parts: state.parts,
                customers: state.customers,
                expenses: state.expenses,
                technicians: state.technicians,
                shopSettings: state.shopSettings,
                expenseTypes: state.expenseTypes,
                crmSettings: state.crmSettings,
                crmCustomers: state.crmCustomers
            }
        };
    }

    /**
     * استيراد نسخة احتياطية
     * @param {Object} backupData - بيانات النسخة الاحتياطية
     * @returns {boolean} نجاح العملية
     */
    function importBackup(backupData) {
        try {
            if (!backupData.data) {
                throw new Error('بيانات النسخة الاحتياطية غير صالحة');
            }

            const dataMap = {
                repairs: backupData.data.repairs,
                parts: backupData.data.parts,
                customers: backupData.data.customers,
                expenses: backupData.data.expenses,
                technicians: backupData.data.technicians,
                shopSettings: backupData.data.shopSettings,
                expenseTypes: backupData.data.expenseTypes,
                crmSettings: backupData.data.crmSettings,
                crmCustomers: backupData.data.crmCustomers
            };

            // تحديث الحالة
            Object.entries(dataMap).forEach(([key, value]) => {
                if (value) {
                    StateManager.set(key, value);
                }
            });

            // حفظ جميع البيانات
            saveAllUserData();
            
            StateManager.addLog('استيراد نسخة احتياطية', `تاريخ النسخة: ${backupData.exportDate}`);
            return true;

        } catch (error) {
            console.error('خطأ في استيراد النسخة الاحتياطية:', error);
            return false;
        }
    }

    /**
     * مسح جميع بيانات المستخدم
     */
    function clearAllUserData() {
        const keys = [
            'repairs', 'parts', 'customers', 'expenses',
            'technicians', 'shopSettings', 'expenseTypes',
            'activityLog', 'crmSettings', 'crmCustomers'
        ];

        keys.forEach(key => removeFromStorage(key));
        StateManager.addLog('مسح البيانات', 'تم مسح جميع البيانات');
    }

    // ==================== الواجهة العامة ====================
    return {
        // التخزين
        saveToStorage,
        loadFromStorage,
        loadAllUserData,
        saveAllUserData,
        
        // الصيانة
        addRepair,
        updateRepair,
        deleteRepair,
        getRepairStats,
        
        // المخزون
        addPart,
        updatePartQuantity,
        updateStockAfterRepair,
        getLowStockParts,
        
        // العملاء
        addCustomer,
        getCustomerStats,
        
        // المصروفات
        addExpense,
        getExpenseSummary,
        
        // النسخ الاحتياطي
        exportBackup,
        importBackup,
        clearAllUserData
    };
})();