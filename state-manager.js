/**
 * إدارة حالة التطبيق في الذاكرة (مع تخزين بعض القيم في LocalStorage عند الحاجة)
 * @module StateManager
 */
'use strict';

const StateManager = (() => {
    const listeners = new Set();

    const state = {
        users: [],
        currentUser: null,
        repairs: [],
        parts: [],
        customers: [],
        expenses: [],
        technicians: [],
        shopSettings: null,
        expenseTypes: [],
        activityLog: [],
        crmSettings: null,
        crmCustomers: [],
        dashboardConfig: null
    };

    function notify(key, value) {
        listeners.forEach((fn) => {
            try {
                fn(key, value, { ...state });
            } catch (e) {
                // ignore
            }
        });
    }

    function get(key) {
        if (!key) return state;
        return state[key];
    }

    function set(key, value) {
        state[key] = value;
        notify(key, value);
        return value;
    }

    function patch(partial) {
        Object.entries(partial || {}).forEach(([k, v]) => set(k, v));
        return get();
    }

    function addLog(action, details = '') {
        const logs = state.activityLog || [];
        const entry = {
            id: Utils.generateId('log'),
            userId: state.currentUser?.id || null,
            action: String(action || ''),
            details: String(details || ''),
            at: new Date().toISOString()
        };
        logs.unshift(entry);
        // حد أقصى لتفادي تضخم التخزين
        if (logs.length > (CONFIG?.SYSTEM?.maxAuditLogs || 500)) {
            logs.length = CONFIG.SYSTEM.maxAuditLogs;
        }
        set('activityLog', logs);
        return entry;
    }

    function subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
    }

    return {
        get,
        set,
        patch,
        addLog,
        subscribe
    };
})();

