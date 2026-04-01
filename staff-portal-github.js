/**
 * Staff Portal Controller v11.6 (Cloud-Native Stable)
 * Handles employee/trainer attendance via mobile camera scanning.
 * Linked to GitHub Pages deployment.
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

        this.idInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleAuthAndAction();
            }
        });

        this.idInput.addEventListener('input', () => {
             this.hideMsg();
        });

        this.initConnectionMonitoring();
    }

    initConnectionMonitoring() {
        const dot = document.querySelector('.dot-pulse') || document.querySelector('.dot');
        const text = document.querySelector('#conn-text');
        if (!dot || !text) return;

        const updateUI = (online, cloud) => {
            if (cloud) {
                dot.className = "dot-pulse dot-green";
                text.innerText = "متصل بالسحاب 🔥";
            } else if (online) {
                dot.className = "dot-pulse dot-orange";
                text.innerText = "متصل بالنت (بدون سحاب)";
            } else {
                dot.className = "dot-pulse dot-red";
                text.innerText = "غير متصل بالإنترنت";
            }
        };

        // Standard event listeners
        window.addEventListener('online', () => updateUI(true, !!window._db));
        window.addEventListener('offline', () => updateUI(false, false));

        // Deep Firebase Sync Check
        const checkCloud = () => {
            const isCloudReady = !!(typeof firebase !== 'undefined' && firebase.apps.length > 0 && window._db);
            updateUI(navigator.onLine, isCloudReady);
        };

        setInterval(checkCloud, 3000);
        checkCloud();
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
                this.showMsg("عفواً، السحاب فارغ! تأكد من رفع البيانات من الجهاز الرئيسي أولاً.", "#f43f5e");
                return;
            }

            for (let [key, val] of Object.entries(data)) {
                if (key === 'syncAt') continue;
                const cleanKey = key.replace('edumaster_', '');
                Storage.save(cleanKey, val);
            }

            this.showMsg("✅ تم تحديث قائمة الأسماء والأكواد بنجاح!", "#10b981");
            setTimeout(() => location.reload(), 1500);

        } catch (err) {
            console.error("Sync Error:", err);
            this.showMsg("حدث خطأ في النظام: " + err.message, "#f43f5e");
        }
    }

    async handleAuthAndAction() {
        const userId = this.idInput.value.trim();
        if (!userId) {
            this.showMsg("برجاء إدخال اسمك أو رقم التعريف أولاً!", "#f43f5e");
            return;
        }

        this.currentUser = this.findUser(userId, this.typeSelect.value);
        
        if (!this.currentUser) {
            this.showMsg(`🚨 كود غير مسجل! اضغط (تحديث السحاب) بالأسفل.`, "#f43f5e");
            return;
        }

        // Auto-correct type
        const studentsList = Storage.get('students') || [];
        const trainersList = Storage.get('trainers') || [];
        if (studentsList.some(s => String(s.id) === String(this.currentUser.id))) {
            this.typeSelect.value = 'STUDENT';
        } else if (trainersList.some(t => String(t.id) === String(this.currentUser.id))) {
            this.typeSelect.value = 'TRAINER';
        } else {
            this.typeSelect.value = 'EMPLOYEE';
        }

        this.showMsg(`مرحباً ${this.currentUser.name}، يمكنك التسجيل يدوياً أو استخدام الكاميرا.`, "#10b981");
        this.showManualOption();
        this.startScanner();
    }

    async startScanner() {
        if (this.isScanning) return;
        this.isScanning = true;
        this.scannerBox.style.display = 'block';
        this.toggleBtn.classList.add('scanning');
        document.getElementById('btn-text').textContent = "إيقاف المسح";
        
        try {
            this.html5QrCode = new Html5Qrcode("reader");
            await this.html5QrCode.start(
                { facingMode: "environment" }, 
                { fps: 15, qrbox: { width: 250, height: 250 } }, 
                (decodedText) => this.onScanSuccess(decodedText)
            );
        } catch (err) {
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
        if (!decodedText.startsWith("SEC:")) {
            this.showMsg("كود غير صالح!", "#f43f5e");
            return;
        }
        const branchId = decodedText.split(':')[1];
        this.stopScanner();
        this.submitAttendance(branchId);
    }

    findUser(query, type) {
        const trainers = Storage.get('trainers') || [];
        const students = Storage.get('students') || [];
        const users = Storage.get('users') || [];
        const allPeople = [...trainers, ...students, ...users];

        const rawQ = query.trim().toLowerCase();
        const numericQ = rawQ.replace(/\D/g, '');

        const match = (u) => {
            if (Utils.normalizeArabic(u.name || '').includes(Utils.normalizeArabic(rawQ))) return true;
            if (numericQ.length >= 7 && String(u.phone || '') === numericQ) return true;
            const codes = [u.id, u.code, u.trainerCode, u.serial_id, u.username, u.user_code];
            return codes.some(c => String(c || '').toLowerCase() === rawQ);
        };

        return allPeople.find(match);
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
            gps: this.currentLocation
        };

        // 1. Local
        const dateKey = now.toLocaleDateString('en-CA');
        const listKey = this.typeSelect.value === 'STUDENT' ? 'attendance' : (this.typeSelect.value === 'TRAINER' ? 'trainer_logs' : 'employee_logs');
        const data = Storage.get(listKey) || {};
        const itemKey = this.typeSelect.value === 'STUDENT' ? `${dateKey}_global` : dateKey;
        
        if (!data[itemKey]) data[itemKey] = {};
        if (!data[itemKey][this.currentUser.id]) data[itemKey][this.currentUser.id] = {};
        const entry = data[itemKey][this.currentUser.id];
        
        let sTitle = "تسجيل حضور", sMsg = `أهلاً ${this.currentUser.name}، تم تسجيل دخولك.`;
        if (this.typeSelect.value === 'STUDENT') {
            if (!entry.time) entry.time = event.time;
            else { entry.out = event.time; sTitle = "تسجيل انصراف"; sMsg = `وداعاً ${this.currentUser.name}.`; }
        } else {
            if (!entry.in) entry.in = event.time;
            else { entry.out = event.time; sTitle = "تسجيل انصراف"; sMsg = `وداعاً ${this.currentUser.name}.`; }
        }
        Storage.save(listKey, data);

        // 2. Cloud
        if (window.Cloud) {
            this.showMsg("جارٍ المزامنة السحابية...", "#f59e0b");
            const actualCode = this.currentUser.serial_id || this.currentUser.code || this.currentUser.id;

            (async () => {
                try {
                    await window.Cloud.pushScan(branchId, { ...event, code: actualCode });
                    this.showSuccess(sTitle, sMsg);
                } catch (e) {
                    this.showMsg("⚠️ فشل السحاب! أغلق Shields.", "#ef4444");
                    setTimeout(() => this.showSuccess(sTitle, sMsg), 2000);
                }
            })();
        } else {
            this.showSuccess(sTitle, sMsg);
        }
    }

    showMsg(txt, color) {
        if (!this.statusMsg) return;
        this.statusMsg.style.color = color;
        this.statusMsg.textContent = txt;
        this.statusMsg.classList.add('visible');
    }

    hideMsg() {
        if (this.statusMsg) this.statusMsg.classList.remove('visible');
    }

    showSuccess(title, msg) {
        document.getElementById('main-ui').style.display = 'none';
        const screen = document.getElementById('success-screen');
        if (screen) {
            screen.style.display = 'flex';
            screen.querySelector('h2').textContent = title;
            document.getElementById('success-done-msg').textContent = msg;
        }
    }

    showManualOption() {
        const btn = document.getElementById('manual-checkin-btn');
        if (btn) {
            btn.style.display = 'flex';
            btn.onclick = () => this.submitAttendance(this.detectBranch());
        }
    }

    detectBranch() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('branch') || localStorage.getItem('active_branch') || 'miami';
    }
}

document.addEventListener('DOMContentLoaded', () => { window.Portal = new StaffPortal(); });
