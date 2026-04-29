/**
 * المصادقة عبر Firebase Auth (Google فقط)
 * @module Auth
 */
'use strict';

const Auth = (() => {
    let firebaseApp = null;
    let auth = null;
    let provider = null;
    let readyPromise = null;
    let readyResolve = null;
    let readyReject = null;
    let initialAuthResolved = false;

    function ensureReadyPromise() {
        if (readyPromise) return readyPromise;
        readyPromise = new Promise((resolve, reject) => {
            readyResolve = resolve;
            readyReject = reject;
        });
        return readyPromise;
    }

    function isFirebaseAvailable() {
        return typeof window.firebase !== 'undefined';
    }

    function assertFirebaseConfig() {
        const cfg = CONFIG?.FIREBASE;
        if (!cfg || !cfg.apiKey || !cfg.authDomain || !cfg.projectId) {
            throw new Error(
                'Firebase غير مُعد. افتح `config.js` وضع بيانات مشروع Firebase داخل `CONFIG.FIREBASE`.'
            );
        }
        return cfg;
    }

    function mapFirebaseUser(user) {
        if (!user) return null;
        const email = user.email || '';
        const adminEmails = (CONFIG?.AUTH?.adminEmails || []).map((e) => String(e).toLowerCase());
        const isAdmin = email && adminEmails.includes(email.toLowerCase());

        return {
            id: user.uid,
            username: email ? email.split('@')[0] : (user.displayName || 'user'),
            fullName: user.displayName || (email ? email.split('@')[0] : 'مستخدم'),
            email,
            phone: user.phoneNumber || '',
            role: isAdmin ? 'admin' : 'user',
            status: 'active',
            avatar: user.photoURL || '',
            crmAccess: true
        };
    }

    async function init() {
        ensureReadyPromise();
        try {
            if (!isFirebaseAvailable()) {
                throw new Error('Firebase SDK لم يتم تحميله. تأكد من وجود سكريبت Firebase في `index.html`.');
            }

            const firebaseConfig = assertFirebaseConfig();

            // منع تكرار التهيئة
            firebaseApp = firebase.apps?.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
            auth = firebase.auth();
            provider = new firebase.auth.GoogleAuthProvider();

            auth.onAuthStateChanged(async (user) => {
                try {
                    const mapped = mapFirebaseUser(user);
                    StateManager.set('currentUser', mapped);

                    if (mapped) {
                        DataManager.loadAllUserData(mapped.id);
                    }

                    if (!initialAuthResolved) {
                        initialAuthResolved = true;
                        readyResolve(mapped);
                    }
                } catch (e) {
                    if (!initialAuthResolved) {
                        initialAuthResolved = true;
                        readyReject(e);
                    }
                }
            });
        } catch (e) {
            if (!initialAuthResolved) {
                initialAuthResolved = true;
                readyReject(e);
            }
        }

        return readyPromise;
    }

    async function signInWithGoogle() {
        await init().catch(() => null);
        if (!auth || !provider) {
            // init failed – show the stored error message via caller
            throw new Error('تعذر تهيئة Firebase Auth. راجع إعدادات Firebase في `config.js`.');
        }

        try {
            await auth.signInWithPopup(provider);
            return StateManager.get('currentUser');
        } catch (e) {
            console.error('Google sign-in failed', e);
            throw new Error('فشل تسجيل الدخول عبر Google. حاول مرة أخرى.');
        }
    }

    async function logout() {
        if (auth) {
            try {
                await auth.signOut();
            } catch (e) {
                // ignore
            }
        }
        StateManager.set('currentUser', null);
    }

    function hasPermission(permission) {
        const user = StateManager.get('currentUser');
        if (!user) return false;
        if (permission === 'admin') return user.role === 'admin';
        return true;
    }

    return {
        init,
        signInWithGoogle,
        logout,
        hasPermission
    };
})();

