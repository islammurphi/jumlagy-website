/**
 * الإعدادات والثوابت الأساسية
 * @module Config
 * @version 3.0.0
 */
'use strict';

const CONFIG = Object.freeze({
    // ==================== Firebase ====================
    // ضع بيانات Firebase Web App من Firebase Console:
    // Project settings → Your apps → SDK setup and configuration
    FIREBASE: {
        apiKey: 'AIzaSyAuCRWWLB8X_querXJBIVfhc-yHpi8uSf8',
        authDomain: 'jumlagy-erb-45356.firebaseapp.com',
        projectId: 'jumlagy-erb-45356',
        storageBucket: 'jumlagy-erb-45356.firebasestorage.app',
        messagingSenderId: '105796860104',
        appId: '1:105796860104:web:f1e1f6e167409758e10dfd'
    },

    // إعدادات صلاحيات بسيطة (بريد الأدمن فقط)
    AUTH: {
        adminEmails: ['islammurphi@gmail.com']
    },

    // ==================== معلومات التطبيق ====================
    APP: {
        name: 'جملجي ERB',
        version: '3.0.0',
        developer: 'م/إسلام',
        whatsapp: '201207696202',
        description: 'نظام متكامل لإدارة محلات الصيانة والعملاء'
    },

    // ==================== المستخدم الأساسي ====================
    ADMIN: {
        id: 'admin-001',
        username: 'Islam',
        password: '3164', // سيتم تشفيرها
        fullName: 'مدير النظام',
        phone: '01000000000',
        role: 'admin',
        status: 'active',
        avatar: '',
        email: '',
        address: '',
        notes: '',
        crmAccess: true,
        subscriptionEnd: null
    },

    // ==================== أنواع البيانات ====================
    EXPENSE_TYPES: [
        'إيجار المحل',
        'كهرباء+مياه',
        'موبايل+إنترنت',
        'مرتبات',
        'أدوات',
        'مواصلات+وجبات',
        'أخرى'
    ],

    DEVICE_TYPES: [
        'كمبيوتر',
        'موبايل',
        'شاشة',
        'لاب توب',
        'آيربود',
        'سماعة',
        'أخرى'
    ],

    REPAIR_STATUSES: [
        'قيد الصيانة',
        'تم الإصلاح',
        'تم التسليم'
    ],

    PAYMENT_METHODS: [
        'كاش',
        'تحويل',
        'محفظة'
    ],

    // ==================== إعدادات CRM ====================
    CRM: {
        defaultStores: ['محسن الختامي', 'مخزن القاهرة', 'مخزن الإسكندرية'],
        defaultRatings: ['جيد جداً', 'جيد', 'متوسط', 'في انتظار الرد'],
        defaultFollowStatuses: ['جديد', 'قيد المتابعة', 'تم التواصل', 'مغلق'],
        
        followColors: {
            'جديد': '#6366f1',
            'قيد المتابعة': '#f59e0b',
            'تم التواصل': '#10b981',
            'مغلق': '#ef4444'
        },
        
        ratingColors: {
            'جيد جداً': '#10b981',
            'جيد': '#6366f1',
            'متوسط': '#f59e0b',
            'في انتظار الرد': '#ef4444'
        },
        
        storeColors: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444']
    },

    // ==================== إعدادات النظام ====================
    SYSTEM: {
        autoSaveInterval: 30000, // 30 ثانية
        maxAuditLogs: 500,
        sessionTimeout: 3600000, // ساعة
        toastDuration: 3000, // 3 ثواني
        maxBackupSize: 5 * 1024 * 1024, // 5 ميجابايت
        defaultWarrantyDays: 30,
        defaultMinStock: 5,
        lowStockThreshold: 5
    },

    // ==================== ألوان الواجهة ====================
    UI_COLORS: {
        primary: '#6366f1',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#06b6d4',
        purple: '#8b5cf6',
        pink: '#ec4899'
    },

    // ==================== مسارات التخزين ====================
    STORAGE_KEYS: {
        users: 'users',
        repairs: 'repairs',
        parts: 'parts',
        customers: 'customers',
        expenses: 'expenses',
        technicians: 'technicians',
        shopSettings: 'shopSettings',
        expenseTypes: 'expenseTypes',
        activityLog: 'activityLog',
        crmSettings: 'crmSettings',
        crmCustomers: 'crmCustomers',
        dashboardConfig: 'dashboardConfig',
        darkMode: 'darkMode',
        currentUser: 'currentUser',
        currentUserId: 'currentUserId'
    },

    // ==================== رسائل الخطأ ====================
    MESSAGES: {
        loginFailed: 'بيانات الدخول غير صحيحة',
        accountInactive: 'حسابك معطل، تواصل مع المطور',
        accountPending: 'حسابك قيد المراجعة',
        subscriptionExpired: 'انتهت صلاحية الاشتراك',
        invalidPhone: 'رقم هاتف غير صالح',
        requiredFields: 'املأ جميع الحقول المطلوبة',
        phoneExists: 'رقم الهاتف مسجل بالفعل',
        saveSuccess: 'تم الحفظ بنجاح',
        deleteConfirm: 'هل أنت متأكد من الحذف؟',
        noData: 'لا توجد بيانات',
        storageFull: 'نفذت مساحة التخزين! الرجاء تصدير البيانات',
        importSuccess: 'تم استيراد البيانات بنجاح',
        importError: 'خطأ في استيراد البيانات',
        backupSuccess: 'تم تصدير النسخة الاحتياطية',
        backupError: 'خطأ في تصدير النسخة الاحتياطية'
    }
});