/**
 * Firebase Config & Bridge v10.1 (Final Resilient Edition)
 */

const firebaseConfig = {
  apiKey: "AIzaSyDlcUHhkwMw1iCavcMmPkqxYBoW6WLGZhI",
  authDomain: "edu-master-21147.firebaseapp.com",
  databaseURL: "https://edu-master-21147-default-rtdb.firebaseio.com",
  projectId: "edu-master-21147",
  storageBucket: "edu-master-21147.firebasestorage.app",
  messagingSenderId: "771070677548",
  appId: "1:771070677548:web:0e8dfa6b2668d08b303789"
};

// ✅ v10.1: Safe Multi-Engine Initialization
if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("🔥 Firebase Initialized - Multi-Engine (RTDB + Firestore) Ready!");
}

// 🛡️ [NEW] CLOUD FIRESTORE FRAGMENTED ENGINE
window.FirestoreEngine = {
    db: (window.firebase && firebase.firestore) ? firebase.firestore() : null,
    
    // Config: Size of each data fragment (items)
    CHUNK_SIZE: 250,

    /** 📤 Fragmented Save: Splits large arrays into separate documents */
    async saveFragmented(path, data) {
        if (!this.db) return;
        const colRef = this.db.collection('fragments').doc(path).collection('chunks');
        const oldChunks = await colRef.get();
        const batch = this.db.batch();
        oldChunks.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        const chunks = [];
        for (let i = 0; i < data.length; i += this.CHUNK_SIZE) {
            chunks.push(data.slice(i, i + this.CHUNK_SIZE));
        }

        const saveBatch = this.db.batch();
        const manifestRef = this.db.collection('fragments').doc(path);
        chunks.forEach((chunk, index) => {
            const docRef = colRef.doc(`part_${String(index).padStart(3, '0')}`);
            saveBatch.set(docRef, { data: chunk, index, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
        });
        saveBatch.set(manifestRef, { count: chunks.length, totalItems: data.length, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        await saveBatch.commit();
    },

    /** 📥 Fragmented Load: Re-assembles fragments into a single array */
    async loadFragmented(path) {
        if (!this.db) return null;
        const colRef = this.db.collection('fragments').doc(path).collection('chunks');
        const snapshot = await colRef.orderBy('index').get();
        const allItems = [];
        snapshot.forEach(doc => { allItems.push(...doc.data().data); });
        return allItems.length > 0 ? allItems : null;
    }
};

/**
 * 🔗 Bridge Functions (v10.1 - Resilient Transition Layer)
 */
window.Cloud = {
    pushScan: async (branchId, scanData) => {
        const timestamp = Date.now();
        const fingerprint = `${scanData.id}_${timestamp}_${Math.random().toString(36).substr(2, 5)}`;
        const payload = { ...scanData, timestamp, branchId, fingerprint };

        // ⚡ v10.2: Parallel Push Strategy
        // We return the RTDB promise immediately because it's the fastest (~200ms)
        // while Firestore runs in the background.
        
        const rtdbPush = new Promise((resolve, reject) => {
            if (window.firebase && firebase.database) {
                firebase.database().ref(`edumaster/all_scans`).push().set({ 
                    ...payload, serverTimestamp: firebase.database.ServerValue.TIMESTAMP 
                }, (error) => {
                    if (error) reject(error); else resolve(true);
                });
            } else {
                resolve(false);
            }
        });

        // Background task for Firestore (Don't await it to prevent UI hang)
        if (window.FirestoreEngine?.db) {
            window.FirestoreEngine.db.collection('scans').add({
                ...payload, timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(e => console.warn("Firestore background push failed:", e));
        }

        return rtdbPush;
    },

    pushStudent: (branchId, studentData) => {
        if (!window.firebase) return;
        return firebase.database().ref(`edumaster/registrations/${branchId}`).push().set({
            ...studentData, serverTimestamp: firebase.database.ServerValue.TIMESTAMP
        });
    },

    pushAllRecords: async (allData) => {
        if (window.firebase && firebase.database) {
            const rootRef = firebase.database().ref('edumaster/full_sync');
            const updates = {};
            for (const [key, value] of Object.entries(allData)) {
                if (!value) continue;
                if (['attendance', 'trainer_logs', 'employee_logs'].includes(key)) {
                    for (const [dk, dv] of Object.entries(value)) updates[`${key}/${dk}`] = dv;
                } else if (['students', 'trainers', 'users'].includes(key)) {
                    value.forEach(item => { if(item.id) updates[`${key}/${item.id}`] = item; });
                } else updates[key] = value;
            }
            updates['sync_meta/syncAt'] = firebase.database.Value ? firebase.database.ServerValue.TIMESTAMP : Date.now();
            await rootRef.update(updates).catch(e => console.warn("RTDB Part failed", e));
        }

        if (window.FirestoreEngine?.db) {
            const keysToFragment = ['students', 'trainers', 'users', 'ledger', 'invoices'];
            for (const key of keysToFragment) {
                if (allData[key] && Array.isArray(allData[key])) {
                    await window.FirestoreEngine.saveFragmented(key, allData[key]);
                }
            }
            await window.FirestoreEngine.db.collection('full_sync').doc('settings').set({
                app_config: allData.app_config || {},
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
    },

    pullAllRecords: async () => {
        if (window.FirestoreEngine?.db) {
            try {
                // Timeout check: If Firestore doesn't respond in 2.5s, fallback to RTDB instantly
                const fsPromise = (async () => {
                    const keys = ['students', 'trainers', 'users', 'ledger', 'invoices'];
                    const data = {};
                    const tasks = keys.map(async k => {
                        const frag = await window.FirestoreEngine.loadFragmented(k);
                        if(frag) data[k] = frag;
                    });
                    await Promise.all(tasks);
                    const settings = await window.FirestoreEngine.db.collection('full_sync').doc('settings').get();
                    if (settings.exists) data.app_config = settings.data().app_config;
                    return (data.students || data.trainers) ? data : null;
                })();

                const timeout = new Promise((_, reject) => setTimeout(() => reject("FS_TIMEOUT"), 2500));
                const fastData = await Promise.race([fsPromise, timeout]);
                if (fastData) return fastData;
            } catch (e) { console.warn("Firestore Pull failed (Timeout/Error), using RTDB fallback.", e); }
        }

        if (window.firebase && firebase.database) {
            const snapshot = await firebase.database().ref('edumaster/full_sync').once('value');
            const data = snapshot.val();
            if (data) {
                ['students', 'trainers', 'users', 'ledger', 'invoices'].forEach(key => {
                    if (data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])) {
                        data[key] = Object.values(data[key]);
                    }
                });
                return data;
            }
        }
        return null;
    },

    onScanReceived: (branchId, callback, listenerId = null) => {
        // 🚀 v10.4: Force RTDB for Scans (Fastest & Most Reliable for Real-time)
        // We bypass Firestore for real-time listening because it's too slow for scanners.
        if (window.firebase && firebase.database) {
            const checkTime = Date.now() - 60000; // Allow 1 minute buffer
            return firebase.database().ref('edumaster/all_scans').limitToLast(10).on('child_added', snapshot => {
                const data = snapshot.val();
                const ts = data.serverTimestamp || data.timestamp || 0;
                if (ts < checkTime) return; 

                if (!branchId || branchId === 'all' || data.branchId === branchId) {
                    callback(data);
                }
            });
        }
        return null;
    },

    startScanBackgroundSync: (branchId, onSyncCallback) => {
        return window.Cloud.onScanReceived(branchId, (scan) => {
            window.Cloud._handleCloudScan(scan, onSyncCallback);
        }, 'background-sync');
    },

    /**
     * 📥 pullTodayScans: Fetches all scans from today from Firebase.
     * Used by the "تحديث السحابة" button in attendance-logs.html
     */
    pullTodayScans: async () => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm   = String(today.getMonth() + 1).padStart(2, '0');
        const dd   = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;
        const startOfDay = new Date(`${todayStr}T00:00:00`).getTime();
        const endOfDay   = new Date(`${todayStr}T23:59:59`).getTime();

        const allScans = [];

        // ── RTDB: Read from all_scans ──────────────────────────────
        if (window.firebase && firebase.database) {
            try {
                const snap = await firebase.database()
                    .ref('edumaster/all_scans')
                    .orderByChild('serverTimestamp')
                    .startAt(startOfDay)
                    .endAt(endOfDay)
                    .once('value');

                if (snap.val()) {
                    Object.values(snap.val()).forEach(s => {
                        if (s && s.id) allScans.push(s);
                    });
                    console.log(`📅 pullTodayScans RTDB: got ${allScans.length} scans for ${todayStr}`);
                }
            } catch (e) {
                console.warn('pullTodayScans RTDB error:', e);
            }
        }

        // ── Firestore fallback (if RTDB had nothing) ───────────────
        if (allScans.length === 0 && window.FirestoreEngine?.db) {
            try {
                const startTs = firebase.firestore.Timestamp.fromDate(new Date(`${todayStr}T00:00:00`));
                const endTs   = firebase.firestore.Timestamp.fromDate(new Date(`${todayStr}T23:59:59`));
                const snap = await window.FirestoreEngine.db
                    .collection('scans')
                    .where('timestamp', '>=', startTs)
                    .where('timestamp', '<=', endTs)
                    .orderBy('timestamp', 'asc')
                    .get();
                snap.forEach(doc => {
                    const d = doc.data();
                    if (d && d.id) allScans.push({ ...d, _docId: doc.id });
                });
                console.log(`📅 pullTodayScans Firestore: got ${allScans.length} scans for ${todayStr}`);
            } catch (e) {
                console.warn('pullTodayScans Firestore error:', e);
            }
        }

        return allScans;
    },

    _handleCloudScan: async (scan, onSyncCallback) => {
        if (!scan || !scan.id) return;
        const ts = (scan.timestamp && scan.timestamp.toMillis) ? scan.timestamp.toMillis() : (scan.timestamp || Date.now());
        const dateObj = new Date(ts);
        const dateKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;
        
        if (typeof Storage !== 'undefined') {
            const listKey = scan.type === 'STUDENT' ? 'attendance' : (scan.type === 'TRAINER' ? 'trainer_logs' : 'employee_logs');
            const data = Storage.get(listKey) || {};
            const itemKey = scan.type === 'STUDENT' ? `${dateKey}_global` : dateKey;
            
            if (!data[itemKey]) data[itemKey] = {};
            if (!data[itemKey][scan.id]) data[itemKey][scan.id] = {};
            const entry = data[itemKey][scan.id];

            // 🛡️ v10.3: Improved Deduplication 
            // Only skip if the exact SAME time is already in BOTH fields (In and Out)
            if (entry.in === scan.time && entry.out === scan.time) return;
            if (scan.type === 'STUDENT' && entry.time === scan.time && entry.out === scan.time) return;

            if (scan.type === 'STUDENT') {
                if (!entry.time) {
                    entry.time = scan.time;
                } else if (!entry.out || entry.out === scan.time) {
                    // Allow saving 'out' even if it's the same minute as 'in' during testing
                    entry.out = scan.time;
                }
            } else {
                entry.name = scan.name || entry.name;
                entry.type = scan.type;
                if (!entry.in) {
                    entry.in = scan.time;
                } else {
                    entry.out = scan.time;
                }
            }
            await Storage.save(listKey, data);
        }
        if (onSyncCallback) onSyncCallback(scan);
    }
};
