/**
 * Firebase Config & Bridge v1.0
 * ⚠️ REPLACE WITH YOUR REAL FIREBASE API KEY FROM CONSOLE.FIREBASE.GOOGLE.COM
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

// ✅ v9.0: Safe Init - Prevents 'duplicate app' error if script is loaded more than once
if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log("🔥 Firebase Initialized - Cloud Sync Ready!");
    } else {
        console.log("🔥 Firebase already active - reusing existing instance.");
    }
} else {
    console.warn("⚠️ Firebase NOT initialized. Please set your credentials in js/firebase-config.js");
}

/**
 * 🔗 Bridge Functions:
 * Use these to talk to the cloud from both apps.
 */
window.Cloud = {
    // Send a scan request from mobile
    pushScan: (branchId, scanData) => {
        if (!window.firebase) return;
        const db = firebase.database();
        const timestamp = firebase.database.ServerValue.TIMESTAMP;
        
        const payload = { ...scanData, serverTimestamp: timestamp, branchId };
        
        // 1. Push to Branch Specific node
        db.ref(`edumaster/scans/${branchId}`).push().set(payload);
        
        // 2. Mirror to Universal node (v7.1 - For easier PC monitoring)
        return db.ref(`edumaster/all_scans`).push().set(payload);
    },

    // 🎓 Student Registration Cloud Sync (v2.0)
    pushStudent: (branchId, studentData) => {
        if (!window.firebase) return;
        const db = firebase.database();
        const ref = db.ref(`edumaster/registrations/${branchId}`).push();
        return ref.set({
            ...studentData,
            serverTimestamp: firebase.database.ServerValue.TIMESTAMP
        });
    },

    // 💰 Financial Pulse (Ledger) Sync (v2.0)
    pushFinancialRecord: (branchId, record) => {
        if (!window.firebase) return;
        const db = firebase.database();
        const ref = db.ref(`edumaster/finances/${branchId}`).push();
        return ref.set({
            ...record,
            serverTimestamp: firebase.database.ServerValue.TIMESTAMP
        });
    },

    // 👨‍🏫 Trainer Registration Cloud Sync (v2.0)
    pushTrainer: (branchId, trainerData) => {
        if (!window.firebase) return;
        const db = firebase.database();
        const ref = db.ref(`edumaster/full_sync/trainers/${trainerData.id}`);
        return ref.set({
            ...trainerData,
            serverTimestamp: firebase.database.ServerValue.TIMESTAMP
        });
    },

    // 👷 Employee Registration Cloud Sync (v2.0)
    pushUser: (branchId, userData) => {
        if (!window.firebase) return;
        const db = firebase.database();
        const ref = db.ref(`edumaster/full_sync/users/${userData.id}`);
        return ref.set({
            ...userData,
            serverTimestamp: firebase.database.ServerValue.TIMESTAMP
        });
    },

    // 📢 Follow-up/Lead Pulse (v2.0)
    pushFollowUp: (branchId, leadData) => {
        if (!window.firebase) return;
        const db = firebase.database();
        const ref = db.ref(`edumaster/leads/${branchId}`).push();
        return ref.set({
            ...leadData,
            serverTimestamp: firebase.database.ServerValue.TIMESTAMP
        });
    },

    // Listen for scans on the console
    onScanReceived: (branchId, callback, listenerId = null) => {
        if (!window.firebase) return;
        const db = firebase.database();
        const branchStr = branchId || 'all_scans';
        const targetPath = (branchId === 'all' || !branchId) ? 'edumaster/all_scans' : `edumaster/scans/${branchId}`;
        const scansRef = db.ref(targetPath).limitToLast(5); // Increased sweep to 5 records for reliability

        const lid = listenerId || window.location.pathname.split('/').pop() || 'live_sync';
        console.log(`📡 [Cloud] Tuning into: ${targetPath} | Key: ${lid}`);

        scansRef.on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            const now = Date.now();
            const serverTs = data.serverTimestamp || data.timestamp || 0;
            const msgTs = typeof serverTs === 'string' ? new Date(serverTs).getTime() : serverTs;

            // ⚡ LIVE ONLY FILTER (Expert Security v8.0)
            // Only process scans from the last 10 seconds (Prevents photo sharing tricks)
            if (Math.abs(now - msgTs) > 10000) {
                console.warn(`🛡️ Security: Blocked old signal (Likely Photo) - Age: ${Math.round((now - msgTs)/1000)}s`);
                return; // Too old
            }

            console.log(`📡 [${lid}] Live Signal:`, data.name || data.id);
            callback(data);
        });
    },

    // 🖥️ Global Sync Listener for Admin Dashboard
    onDataUpdated: (path, callback) => {
        if (!window.firebase) return;
        const db = firebase.database();
        db.ref(`edumaster/${path}`).limitToLast(1).on('child_added', (snapshot) => {
            const data = snapshot.val();
            const now = Date.now();
            // RELAXED check
            if (data.serverTimestamp && (Math.abs(now - data.serverTimestamp) < 3600000)) {
                callback(data);
            } else if (!data.serverTimestamp) {
                callback(data); // If no timestamp, assume new (e.g. from local edit)
            }
        });
    },

    // 🤖 REAL-TIME SCAN SYNC (v8.1 - Improved Robustness)
    startScanBackgroundSync: (branchId, onSyncCallback) => {
        if (!window.firebase) return;
        const db = firebase.database();
        // 🌍 v7.1: FLAT CHANNEL - Listens to all scans everywhere for maximum speed
        const scansRef = db.ref(`edumaster/all_scans`).limitToLast(5); // Increased sweep

        // Per-page deduplication to allow all tabs to sync independently
        const lid = window.location.pathname.split('/').pop() || 'bg_sync';
        const dedupKey = `last_bg_scan_id_${lid}`;

        scansRef.on('child_added', (snapshot) => {
            const scan = snapshot.val();
            if (!scan || !scan.id) return;
            
            const key = snapshot.key;
            if (localStorage.getItem(dedupKey) === key) return;
            localStorage.setItem(dedupKey, key);

            console.log(`📡 [Universal Sync] Received [${lid}]:`, scan.name || scan.id);
            window.Cloud._handleCloudScan(scan, onSyncCallback);
        });
    },

    // 📥 [History Pull] - Fetch today's scans from cloud (New v9.0)
    pullTodayScans: async () => {
        if (!window.firebase) return [];
        const db = firebase.database();
        try {
            // Since Firebase keys are push-IDs (chronological), we pull the last 150 scans
            const snapshot = await db.ref(`edumaster/all_scans`).limitToLast(150).once('value');
            const data = snapshot.val();
            if (!data) return [];
            return Object.values(data);
        } catch (e) {
            console.error("❌ Cloud History Pull Failed:", e);
            return [];
        }
    },

    // Internal helper to reuse logic
    _handleCloudScan: async (scan, onSyncCallback) => {
        if (!scan) return;
        
        let targetId = scan.id;
        
        // Find actual local ID if code is provided to fix cross-device sync mismatch
        if (scan.code && typeof Storage !== 'undefined') {
            const listKey = scan.type === 'STUDENT' ? 'students' : (scan.type === 'TRAINER' ? 'trainers' : 'users');
            const list = Storage.get(listKey) || [];
            
            const cleanCode = String(scan.code).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            const matchedUser = list.find(u => {
                const uCode = (u.code || u.serial_id || u.trainerCode || u.user_code || "");
                return (String(uCode).toUpperCase() === cleanCode) || 
                       (u.id && String(u.id) === String(scan.id));
            });
            if (matchedUser) {
                targetId = matchedUser.id;
                if (!scan.name) scan.name = matchedUser.name;
            }
        }

        if (!targetId) return;

        const timestamp = scan.serverTimestamp || scan.timestamp || Date.now();
        const now = new Date(timestamp);
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        
        // 🔄 v9.0: Cross-type correction – if scan.type is wrong (e.g. EMPLOYEE logged as STUDENT),
        // try to correct it by searching all lists
        if (typeof Storage !== 'undefined') {
            const students = Storage.get('students') || [];
            const trainers = Storage.get('trainers') || [];
            const users = Storage.get('users') || [];

            const findInList = (list) => list.find(u => String(u.id) === String(targetId));
            const inStudents = findInList(students);
            const inTrainers = findInList(trainers);
            const inUsers    = findInList(users);

            // Enrich name if missing
            const resolvedUser = inStudents || inTrainers || inUsers;
            if (resolvedUser && !scan.name) scan.name = resolvedUser.name;

            // Correct the type if it doesn't match where the user actually is
            if (!inStudents && scan.type === 'STUDENT') {
                if (inTrainers) { scan.type = 'TRAINER'; console.log('🔄 Type corrected: STUDENT → TRAINER for', scan.name); }
                else if (inUsers) { scan.type = 'EMPLOYEE'; console.log('🔄 Type corrected: STUDENT → EMPLOYEE for', scan.name); }
            }
        }

        try {
            if (scan.type === 'STUDENT') {
                const att = Storage.get('attendance') || {};
                const nKey = `${dateKey}_global`;
                if (!att[nKey]) att[nKey] = {};
                if (!att[nKey][targetId]) att[nKey][targetId] = {};
                
                // Record check-in or check-out depending on state
                if (!att[nKey][targetId].time) {
                    att[nKey][targetId].time = scan.time;
                } else {
                    att[nKey][targetId].out = scan.time;
                }
                
                await Storage.save('attendance', att);
            } else {
                const logKey = (scan.type === 'TRAINER' ? 'trainer_logs' : 'employee_logs');
                const logs = Storage.get(logKey) || {};
                if (!logs[dateKey]) logs[dateKey] = {};
                if (!logs[dateKey][targetId]) logs[dateKey][targetId] = {};
                
                const uLog = logs[dateKey][targetId];
                uLog.name = scan.name || uLog.name;
                uLog.type = scan.type;
                if (scan.gps) {
                    if (!uLog.in) uLog.gpsIn = scan.gps; else uLog.gpsOut = scan.gps;
                }
                
                if (!uLog.in) uLog.in = scan.time; else uLog.out = scan.time;
                
                await Storage.save(logKey, logs);
            }
            
            if (onSyncCallback) onSyncCallback(scan);
            
            // Broadcast to all tabs
            if (window.BroadcastChannel) {
                new BroadcastChannel('edumaster_sync').postMessage({ type: 'CLOUD_SCAN_RECEIVED', scan });
            }
        } catch (e) {
            console.error("❌ Cloud Sync Save Error:", e);
        }
    },

    // 📤 FULL DATABASE PUSH (Hyper-Granular v8.0)
    pushAllRecords: async (allData) => {
        if (!window.firebase) return;
        const db = firebase.database();
        const rootRef = db.ref('edumaster/full_sync');

        console.log("☁️ Cloud: Starting Hyper-Granular push...");
        
        // Use a single update object to minimize round-trips while maintaining node independence
        const updates = {};
        const timestamp = firebase.database.ServerValue.TIMESTAMP;

        for (const [key, value] of Object.entries(allData)) {
            if (!value) continue;

            // 🕒 Micro-Partitioning for Large Log Engines (split by date)
            if (['attendance', 'trainer_logs', 'employee_logs'].includes(key) && typeof value === 'object') {
                for (const [dateKey, dateData] of Object.entries(value)) {
                    updates[`${key}/${dateKey}`] = dateData;
                }
            } 
            // 👤 Atomic Partitioning for Entities (split by ID)
            else if (['students', 'trainers', 'users', 'ledger', 'invoices'].includes(key) && Array.isArray(value)) {
                console.log(`👤 Atomic sync for ${key}: ${value.length} items...`);
                value.forEach(item => {
                    if (item && item.id) {
                        updates[`${key}/${item.id}`] = item;
                    }
                });
            }
            else {
                // 📂 Small settings/meta
                updates[key] = value;
            }
        }

        updates['sync_meta/syncAt'] = timestamp;

        try {
            // .update() at root handles each key as a separate node write
            await rootRef.update(updates);
            console.log("✅ Cloud Sync: Hyper-Granular upload complete.");
        } catch (err) {
            console.error("❌ Cloud Sync Failed:", err);
            // Fallback: If total update object is too large, try individual sets (slower but safer)
            if (err.message.includes('too large')) {
                console.warn("⚠️ Update too large, switching to individual node sets...");
                for (const [path, data] of Object.entries(updates)) {
                    await rootRef.child(path).set(data);
                }
            }
        }
    },

    // 📥 FULL DATABASE PULL (Hyper-Granular Re-consolidation v8.0)
    pullAllRecords: async () => {
        if (!window.firebase) return null;
        const db = firebase.database();
        const snapshot = await db.ref('edumaster/full_sync').once('value');
        const data = snapshot.val();
        if (!data) return null;

        // Re-consolidate atomic objects back into arrays for the local storage engine
        ['students', 'trainers', 'users', 'ledger', 'invoices'].forEach(key => {
            if (data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])) {
                console.log(`📦 Re-consolidating atomic list: ${key}...`);
                data[key] = Object.values(data[key]);
            }
        });

        return data;
    }
};
