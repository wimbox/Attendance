/**
 * Firebase Config - Attendance System (مشروع مستقل تماماً)
 * ⚠️ هذا الملف خاص بمشروع Attendance فقط
 * ⚠️ لا علاقة له بمشروع Edu-Master - بيانات منفصلة 100%
 * projectId: attendance-f6fdc
 */

// ⚡ Safe Initialization System (v11.8 Hyper-Safe)
(function initCloud() {
    if (typeof firebase === 'undefined') {
        setTimeout(initCloud, 250);
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
            console.log("🚀 Attendance Cloud Sync Engine Activated (v11.8)");
        } catch (e) {
            console.error("Firebase init failed:", e);
        }
    }
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

// ✅ Enable Offline Persistence (Safe Mode)
setTimeout(() => {
    if (window._db) {
        window._db.enablePersistence({ synchronizeTabs: true })
           .catch(err => {
               if (err.code === 'failed-precondition') console.warn("Persistence blocked: multi-tab");
           });
    }
}, 2000);

// 🛡️ Fragmented Sync Engine (تجاوز حد الـ 1MB)
window.FirestoreEngine = {
    db: _db,
    CHUNK_SIZE: 500,

    /** 📤 حفظ مجزأ للمصفوفات الكبيرة */
    async saveFragmented(path, data) {
        if (!this.db || !Array.isArray(data)) return;
        const colRef = this.db.collection('fragments').doc(path).collection('chunks');

        // حذف القطع القديمة
        const oldChunks = await colRef.get();
        const deleteBatch = this.db.batch();
        oldChunks.forEach(doc => deleteBatch.delete(doc.ref));
        await deleteBatch.commit();

        // تقسيم البيانات وحفظها
        const saveBatch = this.db.batch();
        const manifestRef = this.db.collection('fragments').doc(path);
        let chunkIndex = 0;

        for (let i = 0; i < data.length; i += this.CHUNK_SIZE) {
            const chunk = data.slice(i, i + this.CHUNK_SIZE);
            const docRef = colRef.doc(`part_${String(chunkIndex).padStart(3, '0')}`);
            saveBatch.set(docRef, {
                data: chunk,
                index: chunkIndex,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            chunkIndex++;
        }

        saveBatch.set(manifestRef, {
            count: chunkIndex,
            totalItems: data.length,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await saveBatch.commit();
        console.log(`✅ [Fragmented] Saved ${data.length} items in ${chunkIndex} chunks for: ${path}`);
    },

    /** 📥 تحميل وإعادة تجميع البيانات المجزأة */
    async loadFragmented(path) {
        if (!this.db) return null;
        const colRef = this.db.collection('fragments').doc(path).collection('chunks');
        const snapshot = await colRef.orderBy('index').get();
        const allItems = [];
        snapshot.forEach(doc => allItems.push(...doc.data().data));
        return allItems.length > 0 ? allItems : null;
    }
};

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

    /** 📤 Full database sync to Cloud (Optimized) */
    pushAllRecords: async (allData) => {
        try {
            console.log("📤 [Attendance] Sycing database to Cloud...");
            await window.Cloud.runWithTimeout((async () => {
                const tables = ['students', 'trainers', 'users', 'ledger', 'invoices'];
                for (const key of tables) {
                    const data = allData[key] || allData[`edumaster_${key}`];
                    if (data && Array.isArray(data)) {
                        await window.FirestoreEngine.saveFragmented(key, data);
                    }
                }
                
                const config = allData.app_config || allData.edumaster_app_config || {};
                await _db.collection('full_sync').doc('settings').set({
                    app_config: config,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            })(), 15000); 
            console.log("✅ [Attendance] Cloud sync complete!");
        } catch (e) {
            console.warn("⚠️ Sync failed:", e.message);
        }
    },

    /** 📥 Download full database from Cloud */
    pullAllRecords: async () => {
        try {
            const fsPromise = (async () => {
                const keys = ['students', 'trainers', 'users', 'ledger', 'invoices'];
                const data = {};
                const tasks = keys.map(async k => {
                    const frag = await window.FirestoreEngine.loadFragmented(k);
                    if (frag) {
                        data[k] = frag;
                        data[`edumaster_${k}`] = frag; 
                    }
                });
                await Promise.all(tasks);
                const settings = await _db.collection('full_sync').doc('settings').get();
                if (settings.exists) {
                    const cfg = settings.data().app_config;
                    data.app_config = cfg;
                    data.edumaster_app_config = cfg;
                }
                return (data.students || data.trainers) ? data : null;
            })();

            const result = await window.Cloud.runWithTimeout(fsPromise, 12000);
            if (result) return result;
        } catch (e) {
            console.warn("⚠️ Pull failed:", e.message);
        }
        return null;
    },

    /** 📡 Real-time Listener */
    onScanReceived: (branchId, callback) => {
        // 🕰️ Robust Lookback: capture anything from the last hour to avoid clock drift issues
        const startTime = firebase.firestore.Timestamp.fromDate(new Date(Date.now() - 3600000));
        return _db.collection('scans')
            .where('serverTimestamp', '>=', startTime)
            .orderBy('serverTimestamp', 'desc')
            .limit(10)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === "added") {
                        const data = change.doc.data();
                        const fingerprint = data.fingerprint || change.doc.id;

                        if (!window._processedFPs) window._processedFPs = new Set();
                        if (window._processedFPs.has(fingerprint)) return;
                        window._processedFPs.add(fingerprint);
                        if (window._processedFPs.size > 100) window._processedFPs.delete(Array.from(window._processedFPs)[0]);

                        const incomingBranch = data.branchId || data.branch;
                        if (!branchId || branchId === 'all' || String(incomingBranch) === String(branchId)) {
                            callback({ ...data, id: change.doc.id });
                        }
                    }
                });
            }, err => console.error("❌ Listener Error:", err));
    },

    startScanBackgroundSync: (branchId, onSyncCallback) => {
        return window.Cloud.onScanReceived(branchId, (scan) => {
            window.Cloud._handleCloudScan(scan, onSyncCallback);
        });
    },

    _handleCloudScan: async (scan, onSyncCallback) => {
        if (!scan || !scan.id || typeof Storage === 'undefined') return;
        
        const ts = (scan.serverTimestamp && scan.serverTimestamp.toMillis) ? scan.serverTimestamp.toMillis() : (scan.timestamp || Date.now());
        const d = new Date(ts);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const listKey = scan.type === 'STUDENT' ? 'attendance' : (scan.type === 'TRAINER' ? 'trainer_logs' : 'employee_logs');
        const data = Storage.get(listKey) || {};
        const itemKey = scan.type === 'STUDENT' ? `${dateKey}_global` : dateKey;
        
        if (!data[itemKey]) data[itemKey] = {};
        if (!data[itemKey][scan.id]) data[itemKey][scan.id] = {};
        const entry = data[itemKey][scan.id];
        const isOut = scan.status === 'OUT' || scan.isOut === true;

        if (scan.type === 'STUDENT') {
            if (isOut) entry.out = scan.time;
            else if (!entry.time) entry.time = scan.time;
        } else {
            entry.name = scan.name || entry.name;
            entry.type = scan.type;
            if (isOut) entry.out = scan.time;
            else if (!entry.in) entry.in = scan.time;
        }
        await Storage.save(listKey, data);
        if (onSyncCallback) onSyncCallback(scan);
    }
};
