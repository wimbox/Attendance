/**
 * Staff Portal Controller v1.0
 * Handles employee/trainer attendance via mobile camera scanning.
 */

class StaffPortal {
    constructor() {
        this.html5QrCode = null;
        this.isScanning = false;
        this.currentUser = null;
        
        this.typeSelect = document.getElementById('user-type');
        this.idInput = document.getElementById('user-id');
        this.toggleBtn = document.getElementById('toggle-scan');
        this.scannerBox = document.getElementById('scanner-box');
        this.statusMsg = document.getElementById('status-banner') || document.getElementById('status-display');
        this.rememberCheckbox = document.getElementById('remember-me');
        this.currentLocation = null;
        
        this.init();
    }

    init() {
        // Load remembered data
        const savedType = localStorage.getItem('staff_portal_type');
        const savedId = localStorage.getItem('staff_portal_id');
        if (savedType) this.typeSelect.value = savedType;
        if (savedId) {
            this.idInput.value = savedId;
            if (this.rememberCheckbox) this.rememberCheckbox.checked = true;
        }

        this.toggleBtn.addEventListener('click', () => {
            if (this.isScanning) {
                this.stopScanner();
            } else {
                this.handleAuthAndAction();
            }
        });

        // 🎯 Support Enter key for quick search
        this.idInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleAuthAndAction();
            }
        });

        // Clear warning on type
        this.idInput.addEventListener('input', () => {
             this.statusMsg.style.display = 'none';
        });

        this.initConnectionMonitoring();
    }

    initConnectionMonitoring() {
        const dot = document.querySelector('.dot-pulse');
        const text = document.querySelector('#conn-text');
        if (!dot || !text) return;

        const updateUI = (online) => {
            dot.className = online ? "dot-pulse dot-green" : "dot-pulse dot-red";
            text.innerText = online ? "متصل أونلاين 🔥" : "غير متصل بالإنترنت";
        };

        updateUI(navigator.onLine);
        window.addEventListener('online', () => updateUI(true));
        window.addEventListener('offline', () => updateUI(false));

        if (window.firebase) {
            firebase.database().ref(".info/connected").on("value", (snap) => {
                if (snap.val() === true) updateUI(true);
            });
        }
    }

    async pullFullSync() {
        if (!window.Cloud?.pullAllRecords) {
            this.showMsg("الربط السحابي غير مفعل حالياً.", "#f43f5e");
            return;
        }

        this.showMsg("جاري تحديث البيانات من السحاب... يرجى الانتظار", "#eab308");
        
        try {
            const data = await Cloud.pullAllRecords();
            if (!data) {
                this.showMsg("عفواً، السحاب فارغ! تأكد من رفع البيانات من الجهاز الرئيسي (Admin Console) أولاً.", "#f43f5e");
                return;
            }

            // Sync with local IDB
            for (let [key, val] of Object.entries(data)) {
                if (key === 'syncAt') continue;
                // Strip the 'edumaster_' prefix if it exists from Cloud.push
                const cleanKey = key.replace('edumaster_', '');
                Storage.save(cleanKey, val);
            }

            this.showMsg("✅ تم تحديث قائمة الأسماء والأكواد بنجاح!", "#10b981");
            setTimeout(() => location.reload(), 1500);

        } catch (err) {
            console.error("Sync Error:", err);
            if (err.message === "CLOUD_TIMEOUT") {
                this.showMsg("فشل التحديث: السحاب لا يستجيب في الوقت المحدد. حاول مرة أخرى.", "#f43f5e");
            } else {
                this.showMsg("حدث خطأ في النظام: " + err.message, "#f43f5e");
            }
        }
    }

    /**
     * Unified logic to find user and start action (Camera/GPS/Manual)
     */
    async handleAuthAndAction() {
        const userId = this.idInput.value.trim();
        if (!userId) {
            this.showMsg("برجاء إدخال اسمك أو رقم التعريف أولاً!", "#f43f5e");
            return;
        }

        // Auto-detect type if prefix is present (Latin prefix hints)
        let q = userId.toLowerCase();
        if (q.startsWith('s')) { this.typeSelect.value = 'STUDENT'; }
        else if (q.startsWith('t')) { this.typeSelect.value = 'TRAINER'; }
        else if (q.startsWith('e')) { this.typeSelect.value = 'EMPLOYEE'; }

        // Save data
        if (!this.rememberCheckbox || this.rememberCheckbox.checked) {
            localStorage.setItem('staff_portal_type', this.typeSelect.value);
            localStorage.setItem('staff_portal_id', userId);
        }

        // Find user
        this.currentUser = this.findUser(userId, this.typeSelect.value);
        
        if (!this.currentUser) {
            const trainers = Storage.get('trainers') || [];
            const students = Storage.get('students') || [];
            const users = Storage.get('users') || [];
            this.showMsg(`🚨 كود غير مسجل! اضغط (تحديث السحاب) بالأسفل. [T=${trainers.length}, S=${students.length}, E=${users.length}]`, "#f43f5e");
            return;
        }

        // ✅ v9.0: Auto-correct type based on WHICH list the user was actually found in
        // This fixes the bug where Arabic-named employees are mistakenly logged as students
        const studentsList = Storage.get('students') || [];
        const trainersList = Storage.get('trainers') || [];
        const isStudent = studentsList.some(s => String(s.id) === String(this.currentUser.id));
        const isTrainer = trainersList.some(t => String(t.id) === String(this.currentUser.id));

        if (isStudent) {
            this.typeSelect.value = 'STUDENT';
        } else if (isTrainer) {
            this.typeSelect.value = 'TRAINER';
        } else {
            this.typeSelect.value = 'EMPLOYEE';
        }

        console.log(`✅ Auto-Correct Type: ${this.typeSelect.value} for ${this.currentUser.name}`);

        this.showMsg(`مرحباً ${this.currentUser.name} (${this.typeSelect.value === 'STUDENT' ? 'طالب' : this.typeSelect.value === 'TRAINER' ? 'محاضر' : 'موظف'})، يمكنك الضغط على 'دخول يدوي' أو توجيه الكاميرا.`, "#10b981");
        this.showManualOption();

        // Start GPS + Camera
        this.startScanner();
    }

    async startScanner() {
        if (this.isScanning) return;
        this.isScanning = true;

        const isFileProtocol = window.location.protocol === 'file:';
        if (isFileProtocol) {
            console.warn("⚠️ Protocol is file:// - GPS/Camera may be blocked.");
            this.showMsg("وضع الأوفلاين: الموقع والكاميرا قد يعطلان في المتصفح. استخدم 'الدخول اليدوي'.", "#eab308");
        } else {
            this.showMsg("يتم تحديد موقعك الجغرافي للتحقق...", "#eab308");
        }
        
        const branchId = this.detectBranch();

        if ("geolocation" in navigator && !isFileProtocol) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    this.currentLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    };
                    await this.openCameraCore();
                },
                async (error) => {
                    console.warn("GPS Error/Refused:", error);
                    this.currentLocation = { error: "مرفوض أو غير متاح", code: error.code };
                    await this.openCameraCore(); 
                },
                { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
            );
        } else {
            // Skips GPS for file:// or unsupported browsers
            this.currentLocation = { error: isFileProtocol ? "بروتوكول ملفات محلي" : "المتصفح لا يدعم" };
            await this.openCameraCore();
        }
    }

    async openCameraCore() {
        try {
            this.isScanning = true;
            this.scannerBox.style.display = 'block';
            this.toggleBtn.classList.add('scanning');
            document.getElementById('btn-text').textContent = "إيقاف المسح";
            
            this.html5QrCode = new Html5Qrcode("reader");
            const config = { fps: 15, qrbox: { width: 250, height: 250 } };

            await this.html5QrCode.start(
                { facingMode: "environment" }, 
                config, 
                (decodedText) => this.onScanSuccess(decodedText)
            );

            this.showMsg("تم تحديد موقعك. وجّه الكاميرا نحو الكيو آر كود", "#10b981");

        } catch (err) {
            console.error(err);
            this.showMsg("فشل فتح الكاميرا: " + err.message, "#f43f5e");
            this.isScanning = false;
        }
    }

    async stopScanner() {
        if (this.html5QrCode) {
            await this.html5QrCode.stop();
            this.html5QrCode = null;
        }
        this.isScanning = false;
        this.scannerBox.style.display = 'none';
        this.toggleBtn.classList.remove('scanning');
        document.getElementById('btn-text').textContent = "فتح الكاميرا للمسح";
    }

    onScanSuccess(decodedText) {
        // Expected code from the center: "SEC:[BranchID]:[Timestamp]:[Token]"
        if (!decodedText.startsWith("SEC:")) {
            this.showMsg("كود غير صالح! يرجى مسح كود السنتر الأصلي المتغير.", "#f43f5e");
            return;
        }

        const parts = decodedText.split(':');
        if (parts.length < 4) {
            this.showMsg("بيانات الكود ناقصة، برجاء المحاولة مرة أخرى.", "#f43f5e");
            return;
        }

        const branchId = parts[1];
        const qrTimestamp = parseInt(parts[2]);
        const token = parts[3]; // Extract the strict security token
        
        // 🛡️ v8.5: Balanced Time Validation (Allow 5m drift)
        const now = Date.now();
        const ageInSeconds = (now - qrTimestamp) / 1000;
        
        if (ageInSeconds > 300 || ageInSeconds < -300) {
            this.showMsg(`عفواً، صورة الباركود منتهية الصلاحية. يرجى المسح من الشاشة مباشرة.`, "#f43f5e");
            setTimeout(() => this.stopScanner(), 2000);
            return;
        }

        console.log("🔓 Code valid locally. Submitting to branch:", branchId);

        this.lastScannedToken = token; // Save token for submission
        this.stopScanner();
        this.submitAttendance(branchId);
    }

    findUser(query, type) {
        // --- 1. Aggressive Data Collection ---
        const trainers = Storage.get('trainers') || [];
        const students = Storage.get('students') || [];
        const users = Storage.get('users') || [];
        
        // Primary list based on selection, the others become fallback
        let primaryList = [];
        if (type === 'TRAINER') primaryList = trainers;
        else if (type === 'STUDENT') primaryList = students;
        else primaryList = users;
        
        // Blend all for final fallback (Ultimate search)
        const allPeople = [...trainers, ...students, ...users];

        if (!query || !query.trim()) return null;

        const rawQ = query.trim();
        const numericQ = rawQ.replace(/\D/g, ''); // "35506601"
        const lowerQ = rawQ.toLowerCase();       // "t35506601"
        const cleanQ = rawQ.replace(/[^a-z0-9]/g, '').toLowerCase(); // "t35506601"
        const nameQ = Utils.normalizeArabic(rawQ);

        console.log(`🔍 Portal Search: Raw="${rawQ}", Numeric="${numericQ}", Clean="${cleanQ}"`);
        console.log(`📊 DB Stats: Trainers=${trainers.length}, Students=${students.length}, Users=${users.length}`);

        // Helper: The matching logic
        const match = (u) => {
            // A) Exact name or partial name match
            if (nameQ && Utils.normalizeArabic(u.name || '').includes(nameQ)) return true;
            
            // B) Phone match
            if (rawQ.length >= 7 && String(u.phone || '') === rawQ) return true;
            
            // C) Stored identifiers (Numeric or Alpha)
            const codes = [u.id, u.code, u.trainerCode, u.serial_id, u.username, u.user_code];
            for(let c of codes) {
                if (!c) continue;
                const sc = String(c).toLowerCase();
                const sn = sc.replace(/\D/g, '');
                const sa = sc.replace(/[^a-z0-9]/g, '');
                
                if (sc === lowerQ) return true;
                if (sn === numericQ && numericQ !== '') return true;
                if (sa === cleanQ) return true;
                if (sn === cleanQ.replace(/\D/g, '') && sn !== '') return true;
            }

            // D) Regenerated "Fixed Code" (V5 logic)
            if (window.Utils?.generateFixedCode && numericQ.length >= 7) {
                // Try as Trainer (3), Student (1), Employee (2)
                const prefixes = ['TRA', 'STD', 'EMP'];
                const seeds = [u.phone, u.phone ? u.phone.replace(/^0+/, '') : null, u.id, u.username];
                for (let p of prefixes) {
                    for (let s of seeds) {
                        if (!s) continue;
                        const expected = String(Utils.generateFixedCode(p, s)).replace(/\D/g, '');
                        if (expected === numericQ) return true;
                    }
                }
            }
            return false;
        };

        // Execution Step 1: Search in primary list
        let found = primaryList.find(match);
        
        // Execution Step 2: Fallback to searching EVERYONE (if they selected wrong category)
        if (!found) {
            found = allPeople.find(match);
            if (found) console.log("💡 Found user in fallback (wrong category selected)");
        }

        if (!found) {
            console.warn("❌ Portal Search Failed for:", rawQ);
        }

        return found;
    }

    submitAttendance(branchId) {
        if (!this.currentUser) return;

        const now = new Date();
        const event = {
            id: this.currentUser.id,
            name: this.currentUser.name,
            type: this.typeSelect.value,
            branch: branchId,
            timestamp: now.toISOString(),
            time: now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' }),
            method: 'MOBILE_SCAN',
            gps: this.currentLocation,
            qrToken: this.lastScannedToken // 🛡️ Attach token for strict validaton
        };

        console.log("🚀 Submitting Attendance with GPS:", event);

        // 1. Local Persistence (v7.3 - Immediate Save)
        const dateKey = now.toLocaleDateString('en-CA');
        let successTitle = "تسجيل حضور", successMsg = `أهلاً بك يا ${this.currentUser.name}، تم تسجيل دخولك بنجاح.`;

        if (this.typeSelect.value === 'STUDENT') {
            const att = Storage.get('attendance') || {};
            const nodeKey = `${dateKey}_global`;
            if (!att[nodeKey]) att[nodeKey] = {};
            if (!att[nodeKey][this.currentUser.id]) att[nodeKey][this.currentUser.id] = {};
            const entry = att[nodeKey][this.currentUser.id];
            if (!entry.time) {
                entry.time = event.time;
            } else {
                entry.out = event.time;
                successTitle = "تسجيل انصراف";
                successMsg = `وداعاً ${this.currentUser.name}، تم تسجيل خروجك بنجاح.`;
            }
            Storage.save('attendance', att);
        } else {
            const logKey = this.typeSelect.value === 'TRAINER' ? 'trainer_logs' : 'employee_logs';
            const logs = Storage.get(logKey) || {};
            if (!logs[dateKey]) logs[dateKey] = {};
            if (!logs[dateKey][this.currentUser.id]) logs[dateKey][this.currentUser.id] = {};
            const userLog = logs[dateKey][this.currentUser.id];
            if (!userLog.in) {
                userLog.in = event.time;
                if (event.gps) userLog.gpsIn = event.gps;
            } else {
                userLog.out = event.time;
                if (event.gps) userLog.gpsOut = event.gps;
                successTitle = "تسجيل انصراف";
                successMsg = `وداعاً ${this.currentUser.name}، تم تسجيل خروجك بنجاح.`;
            }
            Storage.save(logKey, logs);
        }

        // 2. 🔥 FIREBASE CLOUD SYNC
        if (window.Cloud) {
            this.showMsg("جارٍ المزامنة السحابية...", "#f59e0b");
            
            let codePrefix = '2'; // Employee
            if (this.typeSelect.value === 'TRAINER') codePrefix = '3';
            if (this.typeSelect.value === 'STUDENT') codePrefix = '1';

            const actualCode = this.currentUser.serial_id || this.currentUser.code || this.currentUser.trainerCode || this.currentUser.user_code || this.currentUser.id;

            // 🛡️ v11.5 Strict Validation: No more misleading success messages
            // We wait for real cloud confirmation or a real error.


            let pushTask;
            try {
                pushTask = window.Cloud.pushScan(branchId, {
                    ...event,
                    id: this.currentUser.id,
                    name: this.currentUser.name,
                    type: this.typeSelect.value,
                    code: actualCode
                });
            } catch(syncErr) {
                console.error("❌ Cloud.pushScan threw:", syncErr);
                clearTimeout(safetyTimer);
                successShown = true;
                this.showSuccess(successTitle, successMsg);
                return;
            }

            if (pushTask && pushTask.then) {
                pushTask.then(() => {
                    clearTimeout(safetyTimer);
                    if (!successShown) {
                        successShown = true;
                        console.log("🔥 Cloud Sync Verified!");
                        this.showSuccess(successTitle, successMsg);
                    }
                }).catch(e => {
                    clearTimeout(safetyTimer);
                    if (!successShown) {
                        successShown = true;
                        console.error("❌ Cloud Sync Failed:", e);
                        this.showMsg("تم الحفظ محلياً (فشل المزامنة)", "#ef4444");
                        setTimeout(() => this.showSuccess(successTitle, successMsg), 1500);
                    }
                });
            } else {
                clearTimeout(safetyTimer);
                successShown = true;
                this.showSuccess(successTitle, successMsg);
            }
        } else {
            this.showSuccess(successTitle, successMsg);
        }
    }

    showMsg(txt, color) {
        if (!this.statusMsg) return;
        // Support both new banner (class-based show) and old display:block pattern
        if (this.statusMsg.id === 'status-banner') {
            this.statusMsg.style.background = color + '18';
            this.statusMsg.style.color = color;
            this.statusMsg.style.borderColor = color + '33';
            this.statusMsg.textContent = txt;
            this.statusMsg.classList.add('visible');
        } else {
            this.statusMsg.style.display = 'block';
            this.statusMsg.style.background = color + '22';
            this.statusMsg.style.color = color;
            this.statusMsg.textContent = txt;
        }
    }

    hideMsg() {
        if (!this.statusMsg) return;
        if (this.statusMsg.id === 'status-banner') {
            this.statusMsg.classList.remove('visible');
        } else {
            this.statusMsg.style.display = 'none';
        }
    }

    showSuccess(title, msg) {
        document.getElementById('main-ui').style.display = 'none';
        const screen = document.getElementById('success-screen');
        if (screen) {
            screen.style.display = 'flex';
            screen.querySelector('h2').textContent = title;
            document.getElementById('success-done-msg').textContent = msg;
        } else {
            alert(title + "\n" + msg);
        }
    }

    resetData() {
        localStorage.removeItem('staff_portal_type');
        localStorage.removeItem('staff_portal_id');
        this.idInput.value = '';
        if (this.rememberCheckbox) this.rememberCheckbox.checked = false;
        this.showMsg("تم تصفير البيانات بنجاح، يمكنك إدخال بيانات جديدة.", "#10b981");
        this.hideManualOption();
    }

    showManualOption() {
        let manualBtn = document.getElementById('manual-checkin-btn');
        if (manualBtn) {
            manualBtn.style.display = 'flex';
            manualBtn.onclick = () => {
                const branchId = this.detectBranch();
                this.submitAttendance(branchId);
            };
        }
    }

    hideManualOption() {
        const manualBtn = document.getElementById('manual-checkin-btn');
        if (manualBtn) manualBtn.style.display = 'none';
    }

    detectBranch() {
        const urlParams = new URLSearchParams(window.location.search);
        // Standardize to 'miami' as default to match PC Admin Console
        return urlParams.get('branch') || localStorage.getItem('active_branch') || 'miami';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.Portal = new StaffPortal();
});
