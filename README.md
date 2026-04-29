# 🛠️ جملجي ERB v3.0 - نظام إدارة محلات الصيانة

نظام متكامل لإدارة محلات الصيانة ومتابعة العملاء مع دعم العمل بدون إنترنت.

## ✨ المميزات

- 📊 **لوحة تحكم تفاعلية** مع رسوم بيانية
- 🔧 **إدارة أوامر الصيانة** كاملة
- 👥 **نظام CRM** لمتابعة العملاء
- 📦 **إدارة المخزون** مع تنبيهات النفاد
- 💰 **تتبع المصروفات والإيرادات**
- 📱 **فاتورة إلكترونية** مع QR Code
- 🌙 **الوضع الليلي**
- 📲 **تطبيق PWA** يعمل بدون إنترنت
- 📥 **استيراد/تصدير Excel**
- 💾 **نسخ احتياطي تلقائي**

## 🔐 تسجيل الدخول (Google فقط) + Firebase

هذا الإصدار يستخدم **Firebase Auth (Google Sign-In فقط)**.

1) من Firebase Console:
- أنشئ مشروع Firebase
- Authentication → Sign-in method → فعّل **Google**
- أضف Web App (Project settings → Your apps)

2) افتح ملف `config.js` واملأ القيم داخل `CONFIG.FIREBASE`:
- `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`

3) (اختياري) لتحديد الأدمن:
- في `config.js` ضع البريد داخل `CONFIG.AUTH.adminEmails`

## 🧪 تشغيل محلياً

افتح `index.html` عبر سيرفر محلي (مفضل) وليس File مباشرة، مثال:

```bash
python3 -m http.server 5173
```

ثم افتح `http://localhost:5173` واختر فولدر المشروع.

## 🚀 النشر على GitHub Pages

1. انسخ المستودع:
```bash
git clone https://github.com/username/jamlaji-erp.git
cd jamlaji-erp