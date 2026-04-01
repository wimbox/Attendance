/**
 * Firebase Config - Attendance System (مشروع مستقل تماماً)
 * ⚠️ هذا الملف خاص بمشروع Attendance فقط
 * ⚠️ لا علاقة له بمشروع Edu-Master - بيانات منفصلة 100%
 * projectId: attendance-f6fdc
 */

    /** ⚡ Safe Initialization System (v12.1 - Hyper-Safe & Honest) */
    (function initCloud() {
        const start = Date.now();
        function attempt() {
            if (typeof firebase === 'undefined') {
                if (Date.now() - start > 4000) {
                    console.error("🚷 Connection blocked? Please check Brave Shields / Ad-blockers.");
                    if (window.Portal) window.Portal.showMsg("عفواً، الموقع محظور! يرجى إغلاق حماية المتصفح (Brave Shield) للربط بالسحاب.", "#f43f5e");
                }
                setTimeout(attempt, 300);
                return;
            }

            if (!firebase.apps || !firebase.apps.length) {
                if (!window.firebaseConfig) {
                    window.firebaseConfig = {
                        apiKey: "AIzaSyBXc-L71Dqz-UwOXADcboJHAoXvshntHVg",
                        authDomain: "attendance-f6fdc.firebaseapp.com",
                        projectId: "attendance-f6fdc",
                        storageBucket: "attendance-f6fdc.firebasestorage.app",
                        messagingSenderId: "809905569514",
                        appId: "1:809905569514:web:a2eaebfbc4cab15962a193",
                        measurementId: "G-EWDTJR6B22"
                    };
                }
                
                try {
                    firebase.initializeApp(window.firebaseConfig);
                    console.log("🚀 Attendance Cloud Sync Activated (v12.1)");
                } catch (e) {
                    console.error("Firebase init failed:", e);
                }
            }
        }
        attempt();
    })();

// 🛡️ Auto-Load Firestore SDK if missing (Silent & Robust)
if (typeof firebase !== 'undefined' && typeof firebase.firestore !== 'function' && !window._loadingFirestore) {
    window._loadingFirestore = true;
    const script = document.createElement('script');
    script.src = "https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js";
    document.head.appendChild(script);
    script.onload = () => { 
        console.log("🔥 Firestore SDK Loaded (Async)");
        if (!sessionStorage.getItem('_cloud_activated')) {
            sessionStorage.setItem('_cloud_activated', 'true');
            setTimeout(() => window.location.reload(), 500);
        }
    };
}

// ✅ Getters for late-loading SDKs (Robust v11.3)
Object.defineProperty(window, '_db', {
    get: function() { 
        if (typeof firebase !== 'undefined' && typeof firebase.firestore === 'function') {
            try { return firebase.firestore(); } catch(e) { return null; }
        }
        return null;
    }
});

Object.defineProperty(window, '_rtdb', {
    get: function() { 
        if (typeof firebase !== 'undefined' && typeof firebase.database === 'function') {
            try { return firebase.database(); } catch(e) { return null; }
        }
        return null;
    }
});

// 🏎️ Enable Offline Persistence (Safe Mode)
setTimeout(() => {
    if (window._db) {
        window._db.enablePersistence({ synchronizeTabs: true })
            .catch(err => {
                if (err.code === 'failed-precondition') console.warn('Persistence failed');
            });
    }
}, 2000);

// 🔗 Cloud Bridge Functions (v11.9 Stable)
window.Cloud = {

    /** ⏳ Ensure Firestore is ready before any call */
    async waitForDB(timeout = 5000) {
        const start = Date.now();
        while (!window._db) {
            if (Date.now() - start > timeout) throw new Error("CLOUD_SDK_TIMEOUT");
            await new Promise(r => setTimeout(r, 200));
        }
        return window._db;
    },

    /** ⏱️ Helper to prevent hanging operations */
    runWithTimeout(promise, ms = 4000) {
        let timeoutId;
        const timeout = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("CLOUD_TIMER_EXPIRED")), ms);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
    },

    /** 📤 Push real-time scan */
    pushScan: async (branchId, scanData) => {
        try {
            const db = await window.Cloud.waitForDB();
            const payload = { 
                ...scanData, 
                timestamp: Date.now(), 
                branchId, 
                fingerprint: `${scanData.id}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
            };

            return window.Cloud.runWithTimeout(
                db.collection('scans').add({
                    ...payload,
                    serverTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                }),
                5000 
            );
        } catch (err) {
            console.error("Cloud pushScan failure:", err);
            throw err;
        }
    },

    // Fragmented Sync Engine for large data (v4.5 Robust)
    pushAllRecords: async (data) => {
        try {
            const db = await window.Cloud.waitForDB();
            // Check payload size roughly (JSON string length)
            const size = JSON.stringify(data).length;
            if (size > 1000000) {
                console.warn("⚠️ Payload too large for single Firestore doc (1MB limit). Use GitHub Sync for bulk data.");
                Toast.show("⚠️ حجم البيانات كبير جداً على السحاب السريع! سيتم الرفع ولكن يرجى استخدام سحاب GitHub للتأمين الشامل.", "warning");
            }

            return window.Cloud.runWithTimeout(
                db.collection('database').doc('main').set({
                    ...data,
                    lastSync: Date.now(),
                    syncDevice: navigator.userAgent
                }),
                8000
            );
        } catch (err) {
            console.error("Cloud pushAllRecords failure:", err);
            throw err;
        }
    },

    pullAllRecords: async () => {
        try {
            const db = await window.Cloud.waitForDB();
            const snap = await window.Cloud.runWithTimeout(
                db.collection('database').doc('main').get(),
                8000
            );
            return snap.exists ? snap.data() : null;
        } catch (e) { 
            console.error("Cloud pullAllRecords failure:", e); 
            if (e.message === "CLOUD_TIMER_EXPIRED") {
                Toast.show("⚠️ اتصال السحاب ضعيف حالياً، يرجى المحاولة مرة أخرى.", "warning");
            }
            return null; 
        }
    }
};
