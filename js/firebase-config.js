/**
 * Firebase Config - Attendance System (مشروع مستقل تماماً)
 * ⚠️ هذا الملف خاص بمشروع Attendance فقط
 * ⚠️ لا علاقة له بمشروع Edu-Master - بيانات منفصلة 100%
 * projectId: attendance-f6fdc
 */

// ⚡ Safe Initialization System
if (typeof firebase !== 'undefined' && (!firebase.apps || !firebase.apps.length)) {
    if (typeof window.firebaseConfig === 'undefined') {
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
    firebase.initializeApp(window.firebaseConfig);
}

// 🛡️ Auto-Load Firestore SDK if missing (Silent & Robust)
if (typeof firebase !== 'undefined' && typeof firebase.firestore !== 'function' && !window._loadingFirestore) {
    window._loadingFirestore = true;
    const script = document.createElement('script');
    script.src = "https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js";
    document.head.appendChild(script);
    script.onload = () => { 
        console.log("🔥 Firestore SDK Loaded Successfully");
        if (typeof window.Cloud === 'undefined' || !window.Cloud._initialized) {
            // Trigger a silent re-init if possible via session persistence
            if (!sessionStorage.getItem('_cloud_activated')) {
                sessionStorage.setItem('_cloud_activated', 'true');
                console.log("🔄 Initial Cloud Activation Reload...");
                setTimeout(() => window.location.reload(), 500);
            }
        }
    };
}

// Global DB Instances
var _db = (typeof firebase !== 'undefined' && typeof firebase.firestore === 'function') ? firebase.firestore() : null;
var _rtdb = (typeof firebase !== 'undefined' && typeof firebase.database === 'function') ? firebase.database() : null;

// ✅ Enable Offline Persistence (يعمل حتى بدون إنترنت)
if (_db) {
    _db.enablePersistence({ synchronizeTabs: true })
       .catch(err => {
           if (err.code === 'failed-precondition') {
               console.warn('⚠️ Offline persistence: multiple tabs open');
           } else if (err.code === 'unimplemented') {
               console.warn('⚠️ Offline persistence: not supported in this browser');
           }
       });
}

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

// 🔗 Cloud Bridge Functions
window.Cloud = {

    /** ⏱️ Helper to prevent hanging operations */
    runWithTimeout(promise, ms = 3000) {
        let timeoutId;
        const timeout = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("CLOUD_TIMEOUT")), ms);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
    },

    /** 📤 Push real-time scan */
    pushScan: async (branchId, scanData) => {
        const payload = { 
            ...scanData, 
            timestamp: Date.now(), 
            branchId, 
            fingerprint: `${scanData.id}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
        };

        return window.Cloud.runWithTimeout(
            _db.collection('scans').add({
                ...payload,
                serverTimestamp: firebase.firestore.FieldValue.serverTimestamp()
            }),
            3500 
        );
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
        const startTime = firebase.firestore.Timestamp.fromDate(new Date(Date.now() - 5000));
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
