/**
 * Attendance Smart Console Logic
 * Handles high-speed scanning, security snapshots, and anti-cheat verification.
 */

class AttendanceConsole {
    constructor() {
        console.log("Console: Constructor starting...");
        this.input = document.getElementById('scanner-input');
        this.welcomeScreen = document.getElementById('welcome-message');
        this.resultScreen = document.getElementById('user-result');
        this.logsContainer = document.getElementById('console-logs');
        this.video = document.getElementById('security-camera');
        this.canvas = document.getElementById('snapshot-canvas');
        
        // Scanner Status Indicators
        this.statusIndicator = document.getElementById('scanner-status-indicator');
        this.statusText = document.getElementById('scanner-status-text');
        this.inputDot = document.getElementById('input-status-dot');
        this.focusOverlay = document.getElementById('focus-recovery-overlay');
        
        // Typing/Scanner verification
        this.lastKeystrokeTime = 0;
        this.keystrokeDelays = [];
        this.scannerMinSpeed = 80; // ms between keys (raised from 50 to support slower scanners)

        // Processing lock to prevent double-scans
        this.isProcessing = false;
        this.clearTimer = null;
        this.lostFocusCounter = 0; // Track consecutive focus failures

        this.init().catch(err => console.error("Console Init Error:", err));
        
        // ⚡ NEW: Unlock AudioContext for Beep functionality (Browser security requirement)
        document.addEventListener('click', () => {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                const dummyCtx = new AudioCtx();
                if (dummyCtx.state === 'suspended') dummyCtx.resume();
            }
        }, { once: true });
    }

    async init() {
        console.log("Console: Initializing components...");
        // ⚡ v4.0: Use null as default (listens to all_scans) for maximum cross-device compatibility
        const branchId = window.Permissions?.getActiveBranchId() || null;
        
        this.attachListeners();
        this.applySecurityConfig();
        this._initNotifications();
        
        // 🔔 v7.1: UI Audio Feedback Test (Ensures beep is ready)
        setTimeout(() => this.playSound('success'), 1000);
        this.addLog("النظام", "متصل بالسحابة وجاهز للمسح", "success");

        window.addEventListener('edumaster:sync', (e) => {
            if (e.detail.key === 'app_config') this.applySecurityConfig();
        });

        try { 
            this.updateStats(); 
            this.renderRecentOps();
            
            // 🕒 v7.6: Periodic Refresh (Auto-clear old logs from screen)
            setInterval(() => {
                console.log("🕒 Console: Auto-refreshing logs...");
                this.renderRecentOps();
            }, 60000); // Every 1 minute
        } catch(e) { console.warn("Initial render failed", e); }

        // 🛡️ v5.2: Deferred QR Init (Ensures library is loaded)
        this.checkQRReady(branchId || 'miami');

        // ⚡ v4.2: Robust Cloud Sync - matches by ID, then Code, with UI diagnostics
        if (window.Cloud) {
            const handleCloudScan = async (scanData) => {
                try {
                    if (!scanData) return;
                    
                    // 🚨 VULNERABILITY FIX: Strict Token Validation
                    if (scanData.method === 'MOBILE_SCAN' && this.activeQRTokens && this.activeQRTokens.size > 0) {
                        // Extract the raw random part if it's a full SEC token (format: SEC:branch:ts:random)
                        const scannedToken = scanData.qrToken && scanData.qrToken.includes(':') 
                             ? scanData.qrToken.split(':')[3] 
                             : (scanData.qrToken || '');

                        // Only block if a token was provided but it's not in our recent history
                        if (scannedToken && !this.activeQRTokens.has(scannedToken)) {
                            console.error(`🛡️ Security Block: Received expired or fake QR token [${scannedToken}] from ${scanData.name}. Active size: ${this.activeQRTokens.size}`);
                            this.addLog(scanData.name || "مجهول", "تم رفض الصورة/الكود المنسوخ (منتهي الصلاحية)", "error");
                            this.playSound('error');
                            return; // ❌ STOP EXECUTION!
                        }
                        console.log(`✅ Security: QR Token [${scannedToken}] validated against active history.`);
                    }

                    // Deduplicate within the same tab/session
                    const dedupKey = `${scanData.id || ''}_${scanData.timestamp || ''}`;
                    if (this._lastCloudScanKey === dedupKey) return;
                    this._lastCloudScanKey = dedupKey;

                    this.addLog("إشارة سحابية", `استلام طلب لـ ${scanData.name || scanData.id || 'مجهول'}`, "info");
                    
                    // 🎯 Primary Match: Find user directly by database ID (most reliable)
                    if (scanData.id) {
                        const students = await (window.IDBEngine ? window.IDBEngine.get('students') : Storage.get('students')) || Storage.get('students') || [];
                        const users = await (window.IDBEngine ? window.IDBEngine.get('users') : Storage.get('users')) || Storage.get('users') || [];
                        const trainers = await (window.IDBEngine ? window.IDBEngine.get('trainers') : Storage.get('trainers')) || Storage.get('trainers') || [];
                        const allPeople = [...students, ...users, ...trainers];
                        
                        const user = allPeople.find(u => String(u.id) === String(scanData.id));
                        if (user) {
                            const type = scanData.type || 'STUDENT';
                            console.log(`✅ Cloud: Match found → ${user.name}`);
                            this.recordAttendance(user, type);
                            return;
                        } else {
                            console.warn("⚠️ Cloud: ID not found in local DB. Trying code...");
                        }
                    }

                    // 🔄 Fallback: Try matching by the code if ID failed
                    if (scanData.code) {
                        this.processScan(scanData.code, true);
                    } else {
                        this.addLog("خطأ", "لم يتم العثور على الشخص المعني", "error");
                    }
                } catch (err) {
                    console.error("❌ Cloud Scanner Critical Error:", err);
                    this.addLog("Error", "خلل في معالجة الإشارة: " + err.message, "error");
                }
            };

            try {
                // Dual-listening strategy (Branch specific + Universal)
            // 🌍 v9.1: Single-Listener strategy - only tune into the current branch (or universal)
            // Listening twice was causing 'Double Trigger' (In/Out same second)
            const targetBranch = branchId || null;
            window.Cloud.onScanReceived(targetBranch, handleCloudScan, 'console_primary');
            } catch (e) { console.error("Cloud Listener Error:", e); }
        }

        this.focusInput();
        setInterval(() => this.focusInput(), 3000);
        
        window.addEventListener('focus', () => {
            this.updateScannerStatus(true);
            this.focusInput();
        });
        window.addEventListener('blur', () => this.updateScannerStatus(false));
        
        console.log("Console: Ready.");
    }

    checkQRReady(branchId, retries = 20) {
        if (typeof QRCode !== 'undefined') {
            this.activeQRTokens = new Set(); // 🛡️ Security: tracking active tokens
            this.startQRRotation(branchId);
        } else if (retries > 0) {
            setTimeout(() => this.checkQRReady(branchId, retries - 1), 200);
        }
    }

    startQRRotation(branchIdArg) {
        const container = document.getElementById('center-qrcode');
        if (!container) return;
        
        // Ensure we use the exact same branchId logic as init
        const branchId = (window.Permissions && window.Permissions.getActiveBranchId) 
                         ? (window.Permissions.getActiveBranchId() || null) 
                         : null;

        const makeToken = () => {
             const b = branchId || 'null';
             return `SEC:${b}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
        };

        this.qrInstance = new QRCode(container, {
            text: makeToken(),
            width: 140, height: 140,
            colorDark: "#0f172a", colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        let timeLeft = 10;
        const timerLabel = document.getElementById('qr-timer-label');
        
        setInterval(() => {
            timeLeft--;
            if (timerLabel) timerLabel.textContent = `(يتغير خلال ${timeLeft} ثانية)`;
            
            if (timeLeft <= 0) {
                timeLeft = 10;
                const secureToken = makeToken();
                this.qrInstance.clear();
                this.qrInstance.makeCode(secureToken);
                
                // 🛡️ v8.5: Keep a history of the last 30 generated tokens (~300s / 5m validity)
                const rawToken = secureToken.split(':')[3];
                if (this.activeQRTokens) {
                    this.activeQRTokens.add(rawToken);
                    const tokensArr = Array.from(this.activeQRTokens);
                    if (tokensArr.length > 30) {
                        this.activeQRTokens.delete(tokensArr[0]);
                    }
                }

                console.log("🔐 QR Rotated:", secureToken);
            }
        }, 1000);
    }

    applySecurityConfig() {
        const config = window.Storage?.get('app_config') || {};
        const isBlocked = config.disableManualAttendance === true;
        
        const input = document.getElementById('scanner-input');
        const inputDot = document.getElementById('input-status-dot');
        const manualSection = document.getElementById('manual-entry-section');
        const instructions = document.getElementById('scanner-instructions');
        
        this.isGhostMode = isBlocked; // Track mode for other methods
        
        if (isBlocked) {
            // ═══ GHOST MODE ═══
            // The entire manual section becomes invisible to humans,
            // but the input lives as a "ghost" off-screen so the scanner can still type into it.
            console.log('🔒 Anti-Cheat ON → Ghost Input Mode activated');
            
            if (manualSection) {
                manualSection.style.opacity = '0';
                manualSection.style.height = '0';
                manualSection.style.overflow = 'hidden';
                manualSection.style.margin = '0';
                manualSection.style.pointerEvents = 'none';
                manualSection.style.visibility = 'visible'; // Important: Keep visible for focus
            }
            
            // Move input off-screen but keep it focusable (the ghost)
            if (input) {
                input.style.position = 'fixed';
                input.style.top = '-9999px';
                input.style.left = '-9999px';
                input.style.width = '1px';
                input.style.height = '1px';
                input.style.opacity = '0.01'; // Not 0, so browser still allows focus
                input.style.pointerEvents = 'none';
                input.setAttribute('tabindex', '0');
                input.setAttribute('aria-hidden', 'true');
            }
            
            // Hide the dot indicator next to input (header indicator is enough)
            if (inputDot) inputDot.style.display = 'none';
            if (instructions) instructions.style.display = 'none';
            
        } else {
            // ═══ NORMAL MODE ═══
            console.log('🔓 Anti-Cheat OFF → Manual Input visible');
            
            if (manualSection) {
                manualSection.style.marginTop = '25px';
                manualSection.style.display = 'flex';
                manualSection.style.visibility = 'visible';
                manualSection.style.height = 'auto';
                manualSection.style.margin = '25px 0 0';
                manualSection.style.pointerEvents = '';
                manualSection.style.position = '';
            }
            
            if (input) {
                input.style.position = '';
                input.style.top = '';
                input.style.left = '';
                input.style.width = '';
                input.style.height = '';
                input.style.opacity = '1';
                input.style.pointerEvents = '';
                input.placeholder = "اكتب رقم الباركود هنا (مثال: STD-TEST)...";
                input.removeAttribute('aria-hidden');
            }
            
            if (inputDot) inputDot.style.display = '';
            if (instructions) instructions.style.display = 'block';
        }

        // 🔳 v7.5: Hide QR Setting (Admin controlled)
        const qrCard = document.getElementById('center-qr-card');
        if (qrCard) {
            qrCard.style.display = config.hideConsoleQR ? 'none' : '';
        }

        // 🔄 Force immediate refocus after layout/config changes
        setTimeout(() => this.focusInput(), 50);
    }

    focusInput() {
        try {
            const active = document.activeElement;
            const isWindowFocused = document.hasFocus();
            
            // 🛑 Don't steal focus if user is actively navigating or using another field
            const isNavigating = active && (
                active.tagName === 'A' || 
                active.tagName === 'BUTTON' || 
                active.closest('.sidebar') || 
                active.closest('.top-bar') ||
                active.closest('.nav-item')
            );

            if (this.isGhostMode) {
                // ═══ GHOST MODE: Always force focus unless navigating ═══
                if (!isNavigating) this.input.focus();
            } else {
                // ═══ NORMAL MODE: Allow other inputs to keep focus ═══
                const isOtherInputActive = (active !== this.input && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA'));
                if (!isOtherInputActive && !isNavigating) {
                    this.input.focus();
                }
            }

            // A successful focus means document.activeElement === this.input
            const isReady = (document.activeElement === this.input) && isWindowFocused;
            this.updateScannerStatus(isReady);

            if (!isReady && isWindowFocused && !isNavigating) {
                this.lostFocusCounter++;
                if (this.lostFocusCounter > 1) { // Refocus faster
                    this.input.focus();
                }
            } else {
                this.lostFocusCounter = 0;
            }
        } catch(e) {
            console.warn('Focus error:', e);
        }
    }

    /** ⚡ Update the visual scanner status LED and Overlay */
    updateScannerStatus(isReady) {
        if (!this.statusIndicator) return;
        
        if (isReady) {
            this.statusIndicator.className = 'scanner-status ready';
            if (this.statusText) this.statusText.textContent = 'الماسح جاهز';
            if (this.inputDot && !this.isGhostMode) this.inputDot.classList.remove('lost');
            if (this.focusOverlay) this.focusOverlay.style.display = 'none';
        } else {
            this.statusIndicator.className = 'scanner-status lost';
            if (this.statusText) this.statusText.textContent = 'فقد التركيز!';
            if (this.inputDot && !this.isGhostMode) this.inputDot.classList.add('lost');
            
            // Show recovery overlay ONLY if window HAS focus but input doesn't
            // and we aren't in ghost mode.
            if (this.focusOverlay && !this.isGhostMode && document.hasFocus()) {
                // Also check if we are currently clicking a navigation element
                const active = document.activeElement;
                const isNavigating = active && (active.tagName === 'A' || active.tagName === 'BUTTON' || active.closest('.sidebar'));
                
                if (!isNavigating) {
                    this.focusOverlay.style.display = 'flex';
                } else {
                    this.focusOverlay.style.display = 'none';
                }
            } else if (this.focusOverlay) {
                this.focusOverlay.style.display = 'none';
            }
        }
    }

    attachListeners() {
        // Global focus listener
        document.addEventListener('click', () => this.focusInput());
        
        // Focus Recovery Overlay 
        if (this.focusOverlay) {
            this.focusOverlay.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('🔄 Manual focus recovery triggered');
                this.input.focus();
                this.focusInput();
            });
        }

        // 🔍 Diagnostic: Track focus/blur on the input itself
        this.input.addEventListener('focus', () => {
            this.updateScannerStatus(true);
        });
        this.input.addEventListener('blur', () => {
            this.updateScannerStatus(false);
            // Auto-recover focus after 500ms unless another input is active
            setTimeout(() => {
                const active = document.activeElement;
                if (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA') {
                    this.input.focus();
                }
            }, 500);
        });

        this.input.addEventListener('keydown', (e) => {
            const now = Date.now();
            if (this.lastKeystrokeTime > 0) {
                const delay = now - this.lastKeystrokeTime;
                this.keystrokeDelays.push(delay);
            }
            this.lastKeystrokeTime = now;

            // 🔍 Diagnostic Pulse: Log every character with its char code
            if (e.key !== 'Enter') {
                console.log(`🔑 Key: "${e.key}" | Code: ${e.keyCode} | CharCode: ${e.key.charCodeAt(0)} | Delay: ${this.keystrokeDelays.length > 0 ? this.keystrokeDelays[this.keystrokeDelays.length - 1] + 'ms' : 'first'}`);
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                const code = this.input.value.trim();
                console.log("📥 Scanner full input:", code, "| Raw chars:", [...code].map(c => `${c}(${c.charCodeAt(0)})`).join(' '));
                
                // ✅ Prevent double processing
                if (this.isProcessing) {
                    console.warn('⚠️ Already processing a scan, ignoring duplicate Enter');
                    this.input.value = '';
                    return;
                }
                
                if (code) {
                    this.isProcessing = true;
                    // ✅ Safety Shield: wrap in try-catch
                    try {
                        this.processScan(code);
                    } catch(err) {
                        console.error('❌ CRITICAL: processScan crashed:', err);
                        this.showError('خطأ داخلي في النظام: ' + err.message);
                        this.playSound('error');
                        this.isProcessing = false;
                    }
                }
                this.input.value = '';
                this.keystrokeDelays = [];
            }
        });
    }

    isScanner() {
        if (this.keystrokeDelays.length < 3) return true; 
        const avg = this.keystrokeDelays.reduce((a, b) => a + b, 0) / this.keystrokeDelays.length;
        return avg < this.scannerMinSpeed;
    }

    /**
     * ✅ Full Arabic Keyboard Translator (v2 — Uppercase/Shift Support)
     *
     * Problem: Barcode scanners type UPPERCASE chars using Shift+key.
     * With Arabic keyboard, Shift+key produces Arabic diacritics (ِ ُ ٌ etc.)
     * and special chars — NOT the simple Arabic letters the old version handled.
     *
     * This version maps BOTH:
     *  1. Unshifted Arabic letters → Latin (for scanners/systems without Shift)
     *  2. Shifted Arabic diacritics & special chars → Latin uppercase
     *  3. Multi-char Arabic sequences (لإ, لأ, لآ) → single Latin letter
     */
    translateArabicKeyboard(str) {
        // Fast path: Check for Arabic chars OR symbols used in Arabic shifting (] [ { } ~ ؟)
        if (!/[\u0600-\u06FF\u00F7\u00D7\u060C\u061B\]\[\{\}\~\؟]/.test(str)) return str;

        // Step 1: Replace multi-char Arabic ligatures FIRST (Shift+T, Shift+G, Shift+B)
        str = str.replace(/\u0644\u0625/g, 'T');  // لإ → T (Shift+T)
        str = str.replace(/\u0644\u0623/g, 'G');  // لأ → G (Shift+G)
        str = str.replace(/\u0644\u0622/g, 'B');  // لآ → B (Shift+B)
        str = str.replace(/\u0644\u0627/g, 'B');  // لا → B (unshifted B variant)

        // Step 2: Single-char map (both SHIFTED and UNSHIFTED Arabic keyboard)
        // Step 2: Single-char map (Full PC Arabic Layout support with Shifted Symbols)
        const map = {
            // --- Unshifted Chars (PC Layout) ---
            'ض': 'q', 'ص': 'w', 'ث': 'e', 'ق': 'r', 'ف': 't', 'غ': 'y', 'ع': 'u', 'ه': 'i', 'خ': 'o', 'ح': 'p', 'ج': '[', 'د': ']',
            'ش': 'a', 'س': 's', 'ي': 'd', 'ب': 'f', 'ل': 'g', 'ا': 'h', 'ت': 'j', 'ن': 'k', 'م': 'l', 'ك': ';', 'ط': "'",
            'ئ': 'z', 'ء': 'x', 'ؤ': 'c', 'ر': 'v', 'ى': 'n', 'ة': 'm', 'و': ',', 'ز': '.', 'ظ': '/',

            // --- Shifted Chars (Arabic Diacritics → English Uppercase) ---
            '\u064E': 'Q', // َ
            '\u064B': 'W', // ً
            '\u064F': 'E', // ُ
            '\u064C': 'R', // ٌ
            '\u0625': 'Y', // إ
            '\u2018': 'U', // Shift+U
            '\u00F7': 'I', // ÷
            '\u00D7': 'O', // ×
            '\u061B': 'P', // ؛
            
            '\u0650': 'A', // ِ
            '\u064D': 'S', // ٍ
            '\u0623': 'H', // أ
            '\u0640': 'J', // ـ
            '\u060C': 'K', // ،
            
            '\u0651': 'Q', // ّ
            '\u0652': 'X', // ْ
            '\u0622': 'N', // آ
            '’': 'M',      // Shift+M

            // --- ⚡ CRITICAL: Reverse Symbol Map (Arabic Shift+Key symbols) ---
            // VERIFIED from user data: Shift+V={, Shift+C=}, Shift+D=], Shift+F=[, Shift+Z=~
            '{': 'V', '}': 'C', ']': 'D', '[': 'F', '~': 'Z',
            
            // --- Punctuation ---
            '؟': '?', '،': ',', '؛': ';', '/': 'L',
            
            // --- Numerals ---
            '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
            '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
        };

        const translated = str.split('').map(c => map[c] !== undefined ? map[c] : c).join('');
        if (translated !== str) {
            console.log(`🔤 Ultimate Arabic→English Translation (v3): "${str}" → "${translated}"`);
        }
        return translated;
    }

    async processScan(code, bypassTranslation = false) {
        try {
            // ✅ Auto-translate Arabic keyboard input to English (skip for cloud scans)
            const translatedCode = bypassTranslation ? code : this.translateArabicKeyboard(code);
            let upperCode = String(translatedCode).toUpperCase();
            // Guess type from the first digit (v5 numeric system)
            // 1 = Student, 2 = Employee, 3 = Trainer
            let type = "UNKNOWN";
            let baseCode = upperCode;
            let securityToken = null;

            // Detect Dynamic Pass (12 digits: 8 code + 4 dynamic token)
            // v8.0: Enabled for ALL users (1=Student, 2=Employee, 3=Trainer)
            if (upperCode.length === 12 && (upperCode.startsWith("1") || upperCode.startsWith("2") || upperCode.startsWith("3"))) {
                baseCode = upperCode.substring(0, 8);
                securityToken = upperCode.substring(8, 12);
                console.log(`🔐 Dynamic Pass Detected: Base=${baseCode}, Token=${securityToken}`);
            }

            if (baseCode.startsWith("1")) type = "STUDENT";
            else if (baseCode.startsWith("2")) type = "EMPLOYEE";
            else if (baseCode.startsWith("3")) type = "TRAINER";
            // Legacy/Fallback check for strings
            else if (baseCode.includes("STD")) type = "STUDENT";
            else if (baseCode.includes("EMP")) type = "EMPLOYEE";
            else if (baseCode.includes("TRA")) type = "TRAINER";

            const data = await this.findUserByCode(baseCode, type);
            
            if (!data) {
                console.warn(`Scan Rejected - Code: ${baseCode}, Guessed Type: ${type}`);
                this.showError("الكود غير مسجل أو غير صالح");
                this.playSound('error');
                this.isProcessing = false;
                return;
            }

            // ⚡ Security Check: Dynamic Token Validation for ALL users (v8.0)
            if (securityToken) {
                const isValid = Utils.validateDynamicToken(data.id, securityToken);
                if (!isValid) {
                    console.error(`🚨 Security Alert: Expired or Invalid Dynamic Token for ${data.name}`);
                    this.showError("عفواً، باركود منتهي الصلاحية! يرجى استخدام الكود المباشر من الموبايل.");
                    this.addLog(data.name || "مجهول", "محاولة تسجيل بكود منتهى (صورة قديمة)", "error");
                    this.playSound('error');
                    this.isProcessing = false;
                    return;
                }
                console.log(`✅ Token Validated for ${data.name}`);
            }

            const realType = type !== "UNKNOWN" ? type : this._determineTypeFromData(data);

            // Security Validation (Anti-Cheat):
            const config = Storage.get('app_config') || {};
            const isManualBlocked = config.disableManualAttendance === true;

            // If the code was typed manually (not by a high-speed scanner)
            if (!isDebug && !this.isScanner()) {
                const userName = data.name || data.full_name || "مجهول";
                
                // Case A: Strict Block (All users including students)
                if (isManualBlocked) {
                    console.warn(`Strict anti-cheat: Manual typing blocked for ${realType} (${userName})`);
                    this.showError("عفواً، الإدخال اليدوي معطل. يرجى استخدام الماسح الضوئي فقط!");
                    this.addLog(userName, "منع إدخال يدوي (سياسة حماية)", "error");
                    this.playSound('error');
                    this.isProcessing = false;
                    return;
                }

                // Case B: Lazy Block (Only employees/trainers, students allowed)
                if (realType !== "STUDENT") {
                    console.warn(`Cheating attempt blocked: Manual typing for ${realType} (${userName})`);
                    this.showError("تحذير أمني: غير مصرح بالإدخال اليدوي للموظفين والمحاضرين!");
                    this.addLog(userName, "محاولة تسجيل يدوية مرفوضة", "error");
                    this.playSound('error');
                    this.isProcessing = false;
                    return;
                }
            }

            this.recordAttendance(data, realType);
        } catch(err) {
            console.error('❌ processScan error:', err);
            this.showError('خطأ في معالجة الكود: ' + (err.message || 'غير معروف'));
            this.playSound('error');
        } finally {
            // ✅ Always unlock processing after completion
            this.isProcessing = false;
        }
    }

    _determineTypeFromData(data) {
        if (data.serial_id && data.serial_id.includes("S-")) return "STUDENT";
        if (data.trainerCode) return "TRAINER";
        return "EMPLOYEE";
    }

    async findUserByCode(code, type) {
        const cleanCode = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        console.log("Ultimate Search - Raw:", code, "| Cleaned:", cleanCode);
        
        let result = null;

        // Helper: generate expected barcode for an object on-the-fly
        const generateExpected = (prefix, obj) => {
            if (!window.Utils || !Utils.generateFixedCode) return null;
            if (prefix === 'TRA') {
                const seeds = [obj.phone, obj.phone ? obj.phone.replace(/^0+/, '') : null, obj.id];
                for (const seed of seeds) {
                    if (!seed) continue;
                    if (Utils.generateFixedCode('TRA', seed) === cleanCode) return true;
                }
                return false;
            } else if (prefix === 'EMP') {
                const seeds = [obj.username, obj.id];
                for (const seed of seeds) {
                    if (!seed) continue;
                    if (Utils.generateFixedCode('EMP', seed) === cleanCode) return true;
                }
                return false;
            } else if (prefix === 'STD') {
                return Utils.generateFixedCode('STD', obj.id) === cleanCode;
            }
            return false;
        };
        
        const deepMatch = (userObject, prefix) => {
             // 1. Check stored identifiers (fast path — works if code field exists)
             const possibleIds = [
                 userObject.code, 
                 userObject.serial_id, 
                 userObject.trainerCode, 
                 userObject.user_code,
                 userObject.username,
                 userObject.id
             ];
             const directMatch = possibleIds.some(idString => {
                 if (!idString) return false;
                 const cleanId = String(idString).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                 return cleanId === cleanCode;
             });
             if (directMatch) return true;

             // 2. On-the-fly regeneration (works even if code field is missing from backup)
             if (prefix) return generateExpected(prefix, userObject);
             return false;
        };

        // Aggressively fetch from both memory sync and direct storage
        const students = await (window.IDBEngine ? window.IDBEngine.get('students') : Storage.get('students')) || Storage.get('students') || [];
        result = students.find(s => deepMatch(s, 'STD'));
        if (result) return result;

        const users = await (window.IDBEngine ? window.IDBEngine.get('users') : Storage.get('users')) || Storage.get('users') || [];
        result = users.find(u => deepMatch(u, 'EMP'));
        if (result) return result;

        const trainers = await (window.IDBEngine ? window.IDBEngine.get('trainers') : Storage.get('trainers')) || Storage.get('trainers') || [];
        result = trainers.find(t => deepMatch(t, 'TRA'));
        
        if (!result) {
            let trainerSample = trainers.slice(0, 3).map(t => {
                const gen = (window.Utils && Utils.generateFixedCode) 
                    ? Utils.generateFixedCode('TRA', t.phone || t.id) 
                    : '?';
                return `${t.name}→${gen}`;
            }).join(' | ');
            this.addLog("Debug", `Scanned: ${cleanCode} | Trainers sample: ${trainerSample || 'Empty!'} | Count: ${trainers.length}`, "error");
        }
        
        return result;
    }

    recordAttendance(user, type) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const dateKey = now.toISOString().split('T')[0];
        
        let status = "حضور";
        let detail = "";

        if (type === "STUDENT") {
            const resultStatus = this.saveStudentAttendance(user, dateKey, timeStr);
            status = resultStatus;
            detail = this.getPaymentStatus(user);
        } else if (type === "EMPLOYEE" || type === "TRAINER") {
            const resultStatus = this.toggleShift(user, type, dateKey, timeStr);
            status = resultStatus;
        }

        // Update UI
        this.showResult(user, type, status, detail);
        this.addLog(user.full_name || user.name, `${status} - ${timeStr}`, "success");
        this.playSound('success');
        this.updateStats();

        // --- ⚡ AUTOMATED WHATSAPP GATEWAY (PRO) ---
        const config = window.Storage?.get('app_config') || {};
        this._sendWhatsAppBackground(user, type, status, config);

        // 🔔 In-app floating notification banner (all scan types)
        const typeLabel = type === "STUDENT" ? "طالب" : type === "TRAINER" ? "محاضر" : "موظف";
        const isOut = status === "انصراف";
        this._showInAppBanner(
            user.name || user.full_name || "مجهول",
            typeLabel,
            `${isOut ? '🚪 انصراف' : '✅ حضور'} — ${timeStr}`,
            isOut ? '#f59e0b' : '#10b981',
            user.photo || null
        );

        // ✅ FIX: Clear any existing timer FIRST to prevent conflicts on rapid scans
        if (this.clearTimer) clearTimeout(this.clearTimer);
        this.clearTimer = setTimeout(() => this.resetUI(), 10000);
        
        console.log(`✅ Attendance recorded: ${user.name || user.full_name} | ${type} | ${status} | ${timeStr}`);
    }

    _sendWhatsAppBackground(user, type, status, config) {
        if (type !== "STUDENT" || !config.msgGatewayUrl || !config.msgApiKey || !user.phone) return;

        let template = config.msgAttendTemplate || "تم تسجيل {status} للطالب {name} في {time}";
        const msg = template.replace('{name}', user.name || user.full_name)
                            .replace('{status}', status)
                            .replace('{time}', new Date().toLocaleTimeString('ar-EG'));

        // Clean phone number
        let phone = user.phone.replace(/\D/g, '');
        if (phone.length === 11 && phone.startsWith('0')) phone = '2' + phone;

        // Background Fetch (Non-blocking)
        const url = `${config.msgGatewayUrl}?key=${config.msgApiKey}&to=${phone}&msg=${encodeURIComponent(msg)}`;
        
        fetch(url, { mode: 'no-cors' })
            .then(() => console.log('✅ Auto-WhatsApp Sent in background.'))
            .catch(err => console.warn('❌ Auto-WhatsApp Failed:', err));
    }

    saveStudentAttendance(student, dateKey, timeStr) {
        const attendance = Storage.get('attendance') || {};
        const groups = Storage.get('study_groups') || [];
        
        // Find every group this student is in
        const studentGroups = groups.filter(g => (g.students || []).includes(String(student.id)));
        
        let isDeparture = false;
        let groupNames = "";

        if (studentGroups.length === 0) {
            const groupKey = `${dateKey}_global`;
            if (!attendance[groupKey]) attendance[groupKey] = {};
            
            // Toggle In/Out for Global Attendance
            if (attendance[groupKey][student.id] && !attendance[groupKey][student.id].out) {
                attendance[groupKey][student.id].out = timeStr;
                isDeparture = true;
            } else {
                attendance[groupKey][student.id] = { status: 'present', time: timeStr, out: null, notes: 'سكانر كونسول (عام)' };
                isDeparture = false;
            }
            groupNames = "عام";
        } else {
            studentGroups.forEach(g => {
                const groupKey = `${dateKey}_${g.id}`;
                if (!attendance[groupKey]) attendance[groupKey] = {};
                
                if (attendance[groupKey][student.id] && !attendance[groupKey][student.id].out) {
                    attendance[groupKey][student.id].out = timeStr;
                    isDeparture = true;
                } else {
                    attendance[groupKey][student.id] = { status: 'present', time: timeStr, out: null, notes: 'سكانر كونسول' };
                    isDeparture = false;
                }
            });
            groupNames = studentGroups.map(g => g.name).join(' + ');
        }
        
        Storage.save('attendance', attendance);
        return isDeparture ? "انصراف" : `حضور (${groupNames})`;
    }

    toggleShift(user, type, dateKey, timeStr) {
        const key = type === "EMPLOYEE" ? "employee_logs" : "trainer_logs";
        const logs = Storage.get(key) || {};
        if (!logs[dateKey]) logs[dateKey] = {};
        
        const userId = user.user_id || user.id;
        if (!logs[dateKey][userId]) {
            logs[dateKey][userId] = { in: timeStr, out: null };
            Storage.save(key, logs);
            return "حضور";
        } else {
            logs[dateKey][userId].out = timeStr;
            Storage.save(key, logs);
            return "انصراف";
        }
    }

    getPaymentStatus(student) {
        const balance = student.balance || 0;
        if (balance > 0) return `<span style="color: #EF4444; font-weight: 800;">متبقي: ${balance} ج.م</span>`;
        return `<span style="color: #10B981; font-weight: 800;">الاشتراك مفعّل - خالص</span>`;
    }

    showResult(user, type, status, detail) {
        this.welcomeScreen.style.display = 'none';
        this.resultScreen.style.display = 'block';
        
        const displayName = user.name || user.full_name || "بدون اسم";
        const branchNotice = user.branch ? ` (فرع ${user.branch})` : '';

        document.getElementById('user-name').textContent = displayName + branchNotice;
        document.getElementById('user-type').textContent = type === "STUDENT" ? "طالب" : (type === "EMPLOYEE" ? "موظف" : "محاضر");
        document.getElementById('scan-status-badge').textContent = `تم تسجيل ${status}`;
        document.getElementById('financial-info').innerHTML = detail || "";

        const avatar = document.getElementById('user-photo');
        avatar.innerHTML = user.photo ? `<img src="${user.photo}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">` : `<img src="../education.png" style="width: 70%; height: 70%; opacity: 0.6; object-fit: contain;">`;

        // ⚡ NEW: Manual WhatsApp Trigger (Managed by resetUI)
        const waContainer = document.getElementById('wa-manual-container');
        const waBtn = document.getElementById('send-wa-manual');
        if (waContainer && waBtn && user.phone && type === "STUDENT") {
            waContainer.style.display = 'block';
            waBtn.onclick = (e) => {
                e.stopPropagation(); // Prevent unintended focus triggers
                this.sendWhatsAppManual(user, status);
            };
        } else if (waContainer) {
            waContainer.style.display = 'none';
        }
    }

    sendWhatsAppManual(user, status) {
        const config = window.Storage?.get('app_config') || {};
        let template = config.msgAttendTemplate || "تم تسجيل {status} للطالب {name} في {time}";
        const msg = template.replace('{name}', user.name || user.full_name)
                            .replace('{status}', status)
                            .replace('{time}', new Date().toLocaleTimeString('ar-EG'));

        if (window.WhatsApp && window.WhatsApp.send) {
            window.WhatsApp.send(user.phone, msg);
        } else {
            const cleanPhone = user.phone.replace(/\D/g, '');
            window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
        }
    }

    showError(msg) {
        this.welcomeScreen.style.display = 'none';
        this.resultScreen.style.display = 'block';
        document.getElementById('user-name').textContent = "خطأ في التحقق";
        document.getElementById('user-type').textContent = "أمن النظام";
        document.getElementById('scan-status-badge').textContent = msg;
        document.getElementById('scan-status-badge').style.background = "rgba(239, 68, 68, 0.2)";
        document.getElementById('scan-status-badge').style.color = "#F87171";
        document.getElementById('user-photo').innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #EF4444;"></i>`;
        document.getElementById('financial-info').innerHTML = "";

        if (this.clearTimer) clearTimeout(this.clearTimer);
        this.clearTimer = setTimeout(() => this.resetUI(), 3000);
    }

    resetUI() {
        this.welcomeScreen.style.display = 'block';
        this.resultScreen.style.display = 'none';
        const waContainer = document.getElementById('wa-manual-container');
        if (waContainer) waContainer.style.display = 'none';
        document.getElementById('scan-status-badge').style.background = "rgba(16, 185, 129, 0.2)";
        document.getElementById('scan-status-badge').style.color = "#34D399";
        
        // ✅ Clear processing lock & re-focus input
        this.isProcessing = false;
        this.focusInput();
    }

    addLog(name, action, type) {
        if (!this.logsContainer) return;
        
        // Remove "Waiting..." placeholder if present
        const placeholder = this.logsContainer.querySelector('div[style*="text-align: center"]');
        if (placeholder) placeholder.remove();

        const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        const entry = document.createElement('div');
        entry.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 1.1rem; background: rgba(255,255,255,0.01); animation: flashIn 1s ease;";
        entry.innerHTML = `
            <span style="color: #94A3B8; font-size: 0.9rem; font-family: monospace;">${time}</span>
            <span style="font-weight: 900; color: #fff; flex: 1; text-align: center; margin: 0 15px;">${name}</span>
            <span style="color: ${type === 'error' ? '#F87171' : '#34D399'}; font-weight: 800; min-width: 100px; text-align: left;">${action}</span>
        `;
        this.logsContainer.prepend(entry);
        if (this.logsContainer.children.length > 20) {
            this.logsContainer.lastElementChild.remove();
        }
    }

    renderRecentOps() {
        if (!this.logsContainer) return;
        const today = new Date().toISOString().split('T')[0];
        const activeBranchId = window.Permissions ? Permissions.getActiveBranchId() : null;
        const allEvents = [];

        // Pre-fetch entities for faster branch lookup
        const students = Storage.get('students') || [];
        const trainers = Storage.get('trainers') || [];
        const users = Storage.get('users') || [];

        // Collect from all logs
        const att = Storage.get('attendance') || {};
        const tLogs = Storage.get('trainer_logs') || {};
        const eLogs = Storage.get('employee_logs') || {};

        // 1. Students
        Object.keys(att).forEach(k => {
            if (k.startsWith(today)) {
                Object.entries(att[k]).forEach(([sid, data]) => {
                    const st = students.find(s => String(s.id) === String(sid));
                    if (activeBranchId !== null && st && st.branch !== activeBranchId) return;

                    if (data.time) allEvents.push({ name: sid, action: 'حضور (طالب)', time: data.time, sort: data.time, entity: st });
                    if (data.out) allEvents.push({ name: sid, action: 'انصراف (طالب)', time: data.out, sort: data.out, entity: st });
                });
            }
        });

        // 2. Trainers/Employees
        [tLogs, eLogs].forEach((logSet, idx) => {
            if (logSet[today]) {
                const label = idx === 0 ? 'محاضر' : 'موظف';
                const entities = idx === 0 ? trainers : users;

                Object.entries(logSet[today]).forEach(([uid, data]) => {
                    const entity = entities.find(e => String(e.id) === String(uid));
                    if (activeBranchId !== null && entity && (entity.branch || entity.branch_id) !== activeBranchId) return;

                    if (data.in) allEvents.push({ name: uid, action: `حضور (${label})`, time: data.in, sort: data.in, entity: entity });
                    if (data.out) allEvents.push({ name: uid, action: `انصراف (${label})`, time: data.out, sort: data.out, entity: entity });
                });
            }
        });

        // 🕒 v9.0: Time Filtering (Only show items from last 30 minutes)
        const EXPIRY_MINUTES = 30;
        const now = new Date();

        // ✅ Always clear to support branch switching & expiry
        this.logsContainer.innerHTML = '';
        
        // Filter events by time
        const visibleEvents = allEvents.filter(ev => {
            if (!ev.time) return false;
            const [hours, minutes] = ev.time.split(':').map(Number);
            const eventTime = new Date();
            eventTime.setHours(hours, minutes, 0, 0);
            
            // Handle edge case where event was just before midnight
            if (eventTime > now) eventTime.setDate(eventTime.getDate() - 1);
            
            const diffMs = now - eventTime;
            return diffMs < (EXPIRY_MINUTES * 60 * 1000);
        });

        if (visibleEvents.length === 0) {
            this.logsContainer.innerHTML = `
                <div style="text-align: center; color: #475569; margin-top: 2rem; font-size: 1rem; font-weight: 700;">
                    <i class="fa-solid fa-clock-rotate-left" style="display: block; font-size: 2rem; margin-bottom: 15px; opacity: 0.1;"></i>
                    لا توجد عمليات مؤخراً
                </div>
            `;
            return;
        }

        // Sort by time (most recent first)
        visibleEvents.sort((a, b) => b.sort.localeCompare(a.sort));

        visibleEvents.slice(0, 15).forEach(ev => {
            const realName = ev.entity?.name || ev.entity?.full_name || ev.name;
            this.addLog(realName, ev.action, 'success');
        });
    }

    playSound(type) {
        try {
            const player = document.getElementById(`sound-${type}`);
            if (player) {
                player.currentTime = 0;
                player.play().catch(() => this._generateSystemBeep(type));
            } else {
                this._generateSystemBeep(type);
            }
        } catch (e) {
            this._generateSystemBeep(type);
        }
    }

    /** 🔊 Synthetic Beep Backup (v5.0): Works 100% even if file fails to load */
    _generateSystemBeep(type) {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = type === 'success' ? 'sine' : 'square';
            osc.frequency.setValueAtTime(type === 'success' ? 880 : 220, ctx.currentTime);
            
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } catch(e) { console.error("Beep fallback failed", e); }
    }

    updateStats() {
        const dateKey = new Date().toISOString().split('T')[0];
        
        // Students
        const att = Storage.get('attendance') || {};
        let sCount = 0;
        Object.keys(att).forEach(k => {
            if (k.startsWith(dateKey)) {
                sCount += Object.keys(att[k]).length;
            }
        });
        document.getElementById('stat-students').textContent = sCount;

        // Employees
        const eLogs = Storage.get('employee_logs') || {};
        document.getElementById('stat-employees').textContent = eLogs[dateKey] ? Object.keys(eLogs[dateKey]).length : 0;

        // Trainers
        const tLogs = Storage.get('trainer_logs') || {};
        document.getElementById('stat-trainers').textContent = tLogs[dateKey] ? Object.keys(tLogs[dateKey]).length : 0;
    }

    // ═══════════════════════════════════════════════════
    // 🔔 NOTIFICATION MANAGER
    // ═══════════════════════════════════════════════════

    /** Request browser notification permission once */
    _initNotifications() {
        if (!('Notification' in window)) {
            console.warn('🔔 Browser does not support notifications.');
            return;
        }
        if (Notification.permission === 'default') {
            Notification.requestPermission().then(perm => {
                console.log(`🔔 Notification permission: ${perm}`);
            });
        }
        // Inject the in-app banner container into DOM
        if (!document.getElementById('edu-notify-container')) {
            const container = document.createElement('div');
            container.id = 'edu-notify-container';
            container.style.cssText = `
                position: fixed;
                bottom: 30px;
                left: 30px;
                z-index: 99999;
                display: flex;
                flex-direction: column;
                gap: 12px;
                pointer-events: none;
                max-width: 360px;
            `;
            document.body.appendChild(container);
        }
    }

    /**
     * Show a native OS-level browser notification
     * Fires even when the browser tab is in the background
     */
    _pushNativeNotification(title, body, iconUrl) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        try {
            const notif = new Notification(title, {
                body,
                icon: iconUrl || '../education.png',
                badge: '../education.png',
                requireInteraction: false,
                silent: false
            });
            notif.onclick = () => {
                window.focus();
                notif.close();
            };
            setTimeout(() => notif.close(), 8000);
        } catch(e) {
            console.warn('Native notification failed:', e);
        }
    }

    /**
     * Show a beautiful floating in-app notification banner
     * @param {string} name    - Person's name
     * @param {string} role    - Role label
     * @param {string} action  - Action label
     * @param {string} color   - Accent color
     * @param {string|null} photo - Photo URL (base64 or URL)
     */
    _showInAppBanner(name, role, action, color = '#10b981', photo = null) {
        const container = document.getElementById('edu-notify-container');
        if (!container) return;

        const banner = document.createElement('div');
        banner.style.cssText = `
            background: linear-gradient(135deg, #1e293b, #0f172a);
            border: 1px solid ${color}44;
            border-right: 4px solid ${color};
            border-radius: 16px;
            padding: 14px 18px;
            display: flex;
            align-items: center;
            gap: 14px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.4), 0 0 0 1px ${color}22;
            pointer-events: all;
            cursor: pointer;
            animation: edu-slide-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            min-width: 300px;
            max-width: 360px;
            backdrop-filter: blur(10px);
        `;

        // Avatar
        const avatar = document.createElement('div');
        avatar.style.cssText = `
            width: 48px; height: 48px; border-radius: 12px;
            background: ${color}22; border: 2px solid ${color};
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0; overflow: hidden; font-size: 1.5rem; color: ${color};
        `;
        if (photo) {
            const img = document.createElement('img');
            img.src = photo;
            img.style.cssText = 'width:100%; height:100%; object-fit:cover;';
            img.onerror = () => { avatar.innerHTML = '<i class="fa-solid fa-user"></i>'; };
            avatar.appendChild(img);
        } else {
            avatar.innerHTML = '<img src="../education.png" style="width: 70%; height: 70%; opacity: 0.6; object-fit: contain;">';
        }

        // Text
        const textDiv = document.createElement('div');
        textDiv.style.cssText = 'flex: 1; min-width: 0;';
        textDiv.innerHTML = `
            <div style="font-weight: 900; color: #fff; font-size: 1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</div>
            <div style="font-size: 0.75rem; color: #94a3b8; font-weight: 700; margin-top: 2px;">${role}</div>
            <div style="font-size: 0.85rem; color: ${color}; font-weight: 800; margin-top: 4px;">${action}</div>
        `;

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = `
            background: none; border: none; color: #475569;
            font-size: 1.3rem; cursor: pointer; padding: 0 4px;
            line-height: 1; flex-shrink: 0; transition: color 0.2s;
        `;
        closeBtn.onmouseenter = () => closeBtn.style.color = '#fff';
        closeBtn.onmouseleave = () => closeBtn.style.color = '#475569';

        const dismiss = () => {
            banner.style.animation = 'edu-slide-out 0.3s ease forwards';
            setTimeout(() => banner.remove(), 300);
        };
        closeBtn.onclick = (e) => { e.stopPropagation(); dismiss(); };
        banner.onclick = dismiss;

        banner.appendChild(avatar);
        banner.appendChild(textDiv);
        banner.appendChild(closeBtn);
        container.prepend(banner);

        // Auto-dismiss after 6 seconds
        setTimeout(dismiss, 6000);

        // Keep max 4 banners visible
        while (container.children.length > 4) {
            container.lastElementChild.remove();
        }
    }
}

// Inject keyframe animations once
(function injectNotifyStyles() {
    if (document.getElementById('edu-notify-styles')) return;
    const style = document.createElement('style');
    style.id = 'edu-notify-styles';
    style.textContent = `
        @keyframes edu-slide-in {
            from { transform: translateX(-120%); opacity: 0; }
            to   { transform: translateX(0);     opacity: 1; }
        }
        @keyframes edu-slide-out {
            from { transform: translateX(0);      opacity: 1; }
            to   { transform: translateX(-130%);  opacity: 0; }
        }
    `;
    document.head.appendChild(style);
})();

// Ensure components are ready
window.addEventListener('load', () => {
    console.log("Console: Window Load event triggered");
    if (typeof Storage === 'undefined') {
        console.error("Storage core not found!");
        return;
    }
    // Constructor already calls init(), so just instantiate
    window.AttendanceConsoleInstance = new AttendanceConsole();
});
