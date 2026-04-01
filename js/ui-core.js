/**
 * UI Core Manager (Premium Edition)
 */
window.UICore = {
    init() {
        // Fix: Use relative paths for scripts based on folder depth
        const prefix = this._getPrefix();
        this._loadScript(prefix + 'js/backup-engine.js', 'BackupEngine');
        this._loadScript(prefix + 'js/audio-core.js', 'AudioCore');

        // 🔥 Dynamic Cloud Infrastructure (Firebase)
        this._initCloudInfrastructure(prefix);

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.run());
        } else {
            this.run();
        }
    },

    _initCloudInfrastructure(p) {
        // Prevent duplicate injection
        if (window.firebase || document.getElementById('fb-app-js')) return;
        
        const scripts = [
            { id: 'fb-app-js', src: 'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js' },
            { id: 'fb-db-js', src: 'https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js' },
            { id: 'fb-cfg-js', src: p + 'js/firebase-config.js' }
        ];

        let index = 0;
        const loadNext = () => {
            if (index >= scripts.length) return;
            const config = scripts[index];
            const s = document.createElement('script');
            s.id = config.id;
            s.src = config.src;
            s.async = true;
            s.onload = () => { index++; loadNext(); };
            document.head.appendChild(s);
        };
        loadNext();
    },

    _loadScript(path, globalVar) {
        if (typeof window[globalVar] === 'undefined') {
            const script = document.createElement('script');
            script.src = path;
            document.head.appendChild(script);
        }
    },

    run() {
        try {
            this.injectPremiumStyles();
            this.renderSidebar();
            this.renderGlobalStickyShortcuts();
            this.renderGlobalSearch();
            this.renderBranchSwitcher();
            this.renderTopBarActions();
            this.renderMobileNav();
            this.highlightActiveNav();
            this.applyBranchBranding();
            this.setupInputMasks();
            this.checkBackupIntegrity();
            this.injectBroadcastBanner();
            this._attachAudioListeners();
            this._triggerPageLoadSound();
            this._triggerWelcomeSound();
            
            // ☁️ SMART CLOUD: Auto-restore data if local is empty (v4.0)
            this._triggerAutoCloudSync();
        } catch (err) {
            console.error('UI Core Error:', err);
        }
    },

    /** ☁️ Intelligent Cloud Data Recovery (v4.0) */
    async _triggerAutoCloudSync() {
        if (sessionStorage.getItem('auto_cloud_sync_attempted')) return;

        const studentCount = (window.Storage?.get('students') || []).length;
        const trainerCount = (window.Storage?.get('trainers') || []).length;
        
        // Only auto-pull if database seems completely empty (New Browser/Wipe)
        if (studentCount === 0 && trainerCount === 0 && navigator.onLine) {
            console.log("☁️ Empty database detected! Attempting auto-cloud recovery...");
            sessionStorage.setItem('auto_cloud_sync_attempted', 'true');
            
            // Wait for script loader to finish (up to 5s)
            for(let i=0; i<50; i++) {
                if(window.Cloud && window.Cloud.pullAllRecords) break;
                await new Promise(r => setTimeout(r, 100));
            }

            if (!window.Cloud || !window.Cloud.pullAllRecords) {
                console.warn("⚠️ Cloud is not ready for auto-recovery.");
                return;
            }

            try {
                const data = await window.Cloud.pullAllRecords();
                // Check if data actually has length > 0 before calling it a "recovery"
                const hasRealData = data && ((data.students && data.students.length > 0) || (data.trainers && data.trainers.length > 0));
                
                if (hasRealData) {
                    console.log("📥 Auto-Recovery: Found active cloud data! Injecting...");
                    if(data.students) Storage.save('students', data.students);
                    if(data.trainers) Storage.save('trainers', data.trainers);
                    if(data.users) Storage.save('users', data.users);
                    if(data.branches) Storage.save('branches', data.branches);
                    if(data.study_groups) Storage.save('study_groups', data.study_groups);
                    if(data.attendance) Storage.save('attendance', data.attendance);
                    if(data.employee_logs) Storage.save('employee_logs', data.employee_logs);
                    if(data.trainer_logs) Storage.save('trainer_logs', data.trainer_logs);
                    
                    Toast.show('🔄 تم استرداد بياناتك تلقائياً من السحاب!', 'success');
                    setTimeout(() => location.reload(), 2000);
                } else {
                    console.log("☁️ Cloud is connected but currently holds no active records.");
                }
            } catch (e) { console.warn("Auto-recovery failed:", e); }
        }
    },

    injectPremiumStyles() {
        if (document.getElementById('ui-premium-styles')) return;

        const config = window.Storage?.get('app_config') || {};
        const colors = {
            sidebarBg:   config.sidebarBg   || '#0a2385',
            titleStart:  config.sidebarTitleStart || '#991b1b',
            titleEnd:    config.sidebarTitleEnd   || '#dc2626',
            activeBg:    config.sidebarActiveBg   || '#1a9e9c',
            activeText:  config.sidebarActiveText || '#ffffff'
        };

        const style = document.createElement('style');
        style.id = 'ui-premium-styles';
        style.innerHTML = `
            :root {
                --sidebar-bg: ${colors.sidebarBg};
                --sidebar-active-bg: ${colors.activeBg};
                --sidebar-active-text: ${colors.activeText};
                --sidebar-title-start: ${colors.titleStart};
                --sidebar-title-end: ${colors.titleEnd};
            }

            .sidebar {
                background: var(--sidebar-bg) !important;
            }

            .nav-item.active {
                background: var(--sidebar-active-bg) !important;
                color: var(--sidebar-active-text) !important;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            }

            .nav-item.active i {
                color: var(--sidebar-active-text) !important;
            }

            /* ═══ BRANCH SWITCHER PREMIUM STYLE ═══ */
            .branch-selection-wrapper {
                margin: 0 10px 15px 10px;
                padding: 12px 14px;
                background: linear-gradient(135deg, rgba(153, 27, 27, 0.1) 0%, rgba(220, 38, 38, 0.15) 100%);
                border: 1.5px solid rgba(220, 38, 38, 0.25);
                border-radius: 16px;
                position: relative;
                min-height: 58px;
                display: flex;
                align-items: center;
                gap: 12px;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                z-index: 100;
            }
            .branch-selection-wrapper:hover {
                background: linear-gradient(135deg, rgba(153, 27, 27, 0.15) 0%, rgba(220, 38, 38, 0.2) 100%);
                border-color: rgba(220, 38, 38, 0.4);
                box-shadow: 0 6px 20px rgba(220, 38, 38, 0.15);
            }
            
            .branch-icon-box {
                width: 38px;
                height: 38px;
                background: rgba(239, 68, 68, 0.15);
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #ef4444;
                font-size: 1.2rem;
                flex-shrink: 0;
            }
            .branch-info-content {
                flex: 1;
                overflow: hidden;
            }
            .branch-label-small {
                color: rgba(255,255,255,0.5);
                font-size: 0.65rem;
                font-weight: 800;
                margin-bottom: 1px;
                display: block;
            }
            .branch-active-name {
                color: #fff;
                font-weight: 900;
                font-size: 16px !important;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                text-shadow: 0 2px 4px rgba(0,0,0,0.3);
                line-height: 1.2;
            }
            .branch-chevron {
                color: rgba(255,255,255,0.3);
                font-size: 0.75rem;
                transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .branch-selection-wrapper.open .branch-chevron {
                transform: rotate(180deg);
                color: #fff;
            }

            /* ═══ CUSTOM DROPDOWN MENU ═══ */
            .branch-custom-menu {
                position: absolute;
                top: calc(100% + 8px);
                right: 0;
                width: 100%;
                background: #0f172a; /* كحلي غامق بريميوم */
                border: 1px solid rgba(0, 234, 255, 0.2);
                border-radius: 14px;
                box-shadow: 0 15px 40px rgba(0,0,0,0.5);
                padding: 6px;
                display: none;
                flex-direction: column;
                z-index: 1001;
                animation: dropdownFadeIn 0.3s ease forwards;
            }
            .branch-custom-menu.active { display: flex; }
            
            .branch-dropdown-item {
                padding: 12px 14px;
                color: rgba(255,255,255,0.8);
                font-size: 16px !important; /* كما هو مطلوب 16px */
                font-weight: 700;
                border-radius: 10px;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 10px;
                border-bottom: 1px solid rgba(255,255,255,0.03);
            }
            .branch-dropdown-item:last-child { border-bottom: none; }
            .branch-dropdown-item:hover {
                background: rgba(0, 234, 255, 0.1);
                color: #fff;
                padding-right: 20px;
            }
            .branch-dropdown-item.active {
                background: var(--accent-teal);
                color: #000;
            }
            .branch-dropdown-item i { font-size: 0.9rem; opacity: 0.6; }

            @keyframes dropdownFadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }

            /* Light Mode Styles */
            body.light-mode .branch-selection-wrapper {
                background: linear-gradient(135deg, rgba(15, 23, 42, 0.03) 0%, rgba(15, 23, 42, 0.08) 100%);
                border-color: rgba(15, 23, 42, 0.1);
            }
            body.light-mode .branch-active-name { color: #1e293b; text-shadow: none; }
            body.light-mode .branch-icon-box { background: rgba(15, 23, 42, 0.05); color: #1e293b; }
            body.light-mode .branch-custom-menu {
                background: #ffffff;
                border-color: #e2e8f0;
                box-shadow: 0 15px 40px rgba(15, 23, 42, 0.15);
            }
            body.light-mode .branch-dropdown-item {
                color: #475569;
                border-bottom: 1px solid #f1f5f9;
            }
            body.light-mode .branch-dropdown-item:hover { background: #f8fafc; color: var(--accent-teal); }

            /* ═══ ACCORDION STYLES ═══ */
            .nav-accordion-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 15px;
                margin: 6px 10px 2px 10px;
                border-radius: 10px;
                cursor: pointer;
                background: linear-gradient(90deg, var(--sidebar-title-start) 0%, var(--sidebar-title-end) 100%);
                color: #fff;
                font-weight: 800;
                font-size: 0.82rem;
                letter-spacing: 0.5px;
                border-right: 4px solid rgba(255,255,255,0.3);
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                user-select: none;
                transition: background 0.25s ease, box-shadow 0.25s ease;
                min-height: 38px;
            }
            .nav-accordion-header:hover {
                filter: brightness(1.15);
                box-shadow: 0 6px 18px rgba(0,0,0,0.2);
            }
            .nav-accordion-header.open {
                border-bottom-left-radius: 0;
                border-bottom-right-radius: 0;
                box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            }
            .nav-accordion-title-content {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .nav-accordion-title-content i {
                font-size: 0.85rem;
                opacity: 0.9;
            }
            .nav-accordion-arrow {
                font-size: 0.7rem;
                transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                opacity: 0.8;
            }
            .nav-accordion-header.open .nav-accordion-arrow {
                transform: rotate(180deg);
            }
            .nav-accordion-body {
                overflow: hidden;
                max-height: 0;
                opacity: 0;
                transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                            opacity 0.25s ease;
                margin: 0 10px;
                background: rgba(0,0,0,0.15);
                border-radius: 0 0 10px 10px;
                border-right: 4px solid rgba(255,255,255,0.08);
            }
            .nav-sub-item {
                padding: 10px 16px 10px 12px !important;
                margin-bottom: 1px !important;
                border-radius: 0 !important;
                font-size: 0.88rem !important;
                font-weight: 600 !important;
                border-right: none !important;
            }
            .nav-sub-item:first-child { margin-top: 4px !important; }
            .nav-sub-item:last-child  { margin-bottom: 4px !important; border-radius: 0 0 8px 8px !important; }
            .nav-sub-item:hover {
                background: rgba(255,255,255,0.1) !important;
                padding-right: 22px !important;
            }
            .nav-sub-item.active {
                background: var(--sidebar-active-bg) !important;
                color: var(--sidebar-active-text) !important;
                border-right: 3px solid rgba(255,255,255,0.5) !important;
            }

            /* Old section titles (kept for compatibility) */
            .nav-section-title {
                background: linear-gradient(90deg, var(--sidebar-title-start) 0%, var(--sidebar-title-end) 100%);
                color: #fff !important;
                padding: 10px 15px !important;
                margin: 15px 10px 8px 10px !important;
                border-radius: 8px;
                font-weight: 800 !important;
                font-size: 0.8rem;
                letter-spacing: 0.5px;
                display: flex;
                align-items: center;
                border-right: 4px solid rgba(255,255,255,0.3);
                box-shadow: 0 4px 10px rgba(0,0,0,0.1);
                text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                height: 36px;
                white-space: nowrap;
            }
            .nav-divider { border-color: rgba(255,255,255,0.05) !important; margin: 10px 0 !important; }

            /* Audio Toggle Interaction */
            .audio-sidebar-toggle:active { transform: scale(0.9); }
            .audio-sidebar-toggle.active { background: #00eaff !important; color: #000 !important; }

            /* Pulse Animation for System Alerts */
            @keyframes pulse-red {
                0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4); }
                50% { box-shadow: 0 0 0 8px rgba(220, 38, 38, 0); }
            }
        `;
        document.head.appendChild(style);
    },

    renderGlobalStickyShortcuts() {
        const mainContent = document.querySelector('.main-content');
        if (!mainContent || document.getElementById('global-sticky-shortcuts')) return;

        const sidebar = document.querySelector('.sidebar');
        const sidebarWidth = sidebar ? sidebar.offsetWidth : 280;

        const container = document.createElement('div');
        container.id = 'global-sticky-shortcuts';
        // Responsive right-offset: 0 on mobile, sidebar width on desktop
        const isMobile = () => window.innerWidth <= 992;
        const getRightOffset = () => isMobile() ? '0px' : `${sidebarWidth}px`;

        container.style.cssText = `
            position: fixed; top: 0; right: ${getRightOffset()}; left: 0;
            z-index: 1000; background: var(--bg-main); padding: 8px 10px 2px 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08); border-bottom: 1px solid var(--border-soft);
            transition: all 0.3s ease; display: flex; justify-content: center;
        `;

        container.innerHTML = `
            <div class="shortcut-row" style="display: flex; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; gap: 12px; padding: 0 10px; width: 100%; justify-content: center; align-items: center;">
                ${this._getShorcutConfig().map(item => `
                    <div class="shortcut-item" onclick="window.location.href='${item.url}'" 
                        style="cursor: pointer; padding: 6px 5px; background: var(--bg-card); border-radius: 12px; flex-shrink: 0; width: 110px; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: transform 0.2s; box-shadow: 0 2px 8px rgba(0,0,0,0.04);"
                        onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'"
                    >
                        <div class="shortcut-icon ${item.colorClass}" style="width:32px; height:32px; font-size:0.85rem; margin-bottom: 3px;">
                            <i class="${item.icon}"></i>
                        </div>
                        <span class="shortcut-label" style="font-size:13px; font-weight:700; white-space: nowrap; color: var(--text-main); text-align: center;">${item.label}</span>
                    </div>
                `).join('')}
            </div>
        `;

        document.body.appendChild(container);
        const adjustPadding = () => {
            const mc = document.querySelector('.main-content');
            // On mobile, main-content has no sidebar offset - use full height of bar
            if (mc) mc.style.paddingTop = (container.offsetHeight + 10) + 'px';
            // Recompute right offset on resize
            container.style.right = getRightOffset();
        };
        setTimeout(adjustPadding, 100);
        window.addEventListener('resize', adjustPadding);
    },

    _getPrefix() {
        const path = window.location.pathname;
        if (path.includes('/admin-console/') || path.includes('/staff-attendance/') || path.includes('/modules/')) return '../';
        return '';
    },

    _getShorcutConfig() {
        const p = this._getPrefix();
        return [
            { label: 'الرئيسية', icon: 'fa-solid fa-house', url: p + 'dashboard.html', colorClass: 'sc-teal' },
            { label: 'طالب جديد', icon: 'fa-solid fa-user-plus', url: p + 'modules/add-student.html', colorClass: 'sc-azure' },
            { label: 'محاضر جديد', icon: 'fa-solid fa-person-chalkboard', url: p + 'modules/add-trainer.html', colorClass: 'sc-emerald' },
            { label: 'كونسول الباركود', icon: 'fa-solid fa-barcode', url: p + 'admin-console/index.html', colorClass: 'sc-purple' },
            { label: 'عملية مالية', icon: 'fa-solid fa-money-bill-transfer', url: p + 'modules/ledger.html', colorClass: 'sc-gold' },
            { label: 'محاضرة جديدة', icon: 'fa-solid fa-calendar-plus', url: p + 'modules/attendance.html', colorClass: 'sc-indigo' },
            { label: 'فاتورة جديدة', icon: 'fa-solid fa-file-invoice-dollar', url: p + 'modules/invoices.html', colorClass: 'sc-rose' },
            { label: 'تسجيل مجموعة', icon: 'fa-solid fa-users-rectangle', url: p + 'modules/students.html', colorClass: 'sc-coral' },
            { label: 'الميزانية العامة', icon: 'fa-solid fa-scale-balanced', url: p + 'modules/budget.html', colorClass: 'sc-teal' },
            { label: 'الميزانية اليومية', icon: 'fa-solid fa-vault', url: p + 'modules/daily-closing.html', colorClass: 'sc-green' }
        ];
    },

    renderSidebar() {
        const sidebarTarget = document.querySelector('.sidebar');
        if (!sidebarTarget) return;

        const p = this._getPrefix();
        const currentPath = window.location.pathname.split('/').pop().split('?')[0].split('#')[0] || 'dashboard.html';
        const user = window.Permissions?.getCurrentUser() || { role_id: 1, name: 'Admin' };
        const branches = window.Storage?.get('branches') || [];
        const activeBranch = branches.find(b => b.id === (window.Permissions?.getActiveBranchId()));

        const roleLabel = Permissions.getRoleLabel(user.role_id);
        const isSuperAdmin = user.role_id === 1;
        const audioEnabled = window.AudioCore?.isEnabled() !== false;

        const config = window.Storage?.get('app_config') || {};
        const logoUrl = config.logoUrl || '';

        sidebarTarget.innerHTML = `
            <div class="sidebar-header-sticky" style="padding: 10px 15px 0 15px;">
                <div class="user-identity-box" style="margin-bottom: 8px; padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; display: flex; align-items: center; gap: 12px;">
                    <div class="user-avatar" style="width:42px; height:42px; background: rgba(0, 234, 255, 0.1); border: 1.5px solid #00eaff; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; position: relative;">
                        ${(() => {
                            if (!logoUrl) return `<i class="fa-solid fa-graduation-cap" style="color: #00eaff; font-size: 1.2rem;"></i>`;
                            let finalUrl = logoUrl;
                            if (logoUrl.length > 50 && !logoUrl.startsWith('data:') && !logoUrl.startsWith('http')) {
                                finalUrl = 'data:image/png;base64,' + logoUrl;
                            }
                            return `<img src="${finalUrl}" style="width: 100%; height: 100%; position: absolute; top: 0; left: 0; transform: translate(${(config.logoX || 0)}px, ${(config.logoY || 0)}px) scale(${(config.logoScale || 1)}); transition: none; object-fit: contain; pointer-events: none;">`;
                        })()}
                    </div>
                    <div style="flex: 1; overflow: hidden;">
                        <div style="color: #fff; font-weight: 800; font-size: 1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2;">
                            ${user.name} <span style="font-size: 0.7rem; color: #00eaff; opacity: 0.9;">(@${user.username})</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <span style="width: 7px; height: 7px; background: #10b981; border-radius: 50%;"></span>
                            <span style="color: rgba(255,255,255,0.6); font-size: 0.75rem; font-weight: 700;">${roleLabel}</span>
                        </div>
                    </div>
                    <button class="theme-toggle-btn sidebar-theme-toggle" title="تبديل النمط" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-moon"></i>
                    </button>
                </div>

                <div class="branch-selection-wrapper" id="branch-dropdown-trigger">
                    <div class="branch-icon-box">
                        <i class="fa-solid fa-building-columns"></i>
                    </div>
                    <div class="branch-info-content">
                        <span class="branch-label-small">التحكم الحالي:</span>
                        <div class="branch-active-name" id="selected-branch-display">
                            ${activeBranch ? activeBranch.name : 'الفروع'}
                        </div>
                    </div>
                    
                    <button id="system-audio-btn" class="audio-sidebar-toggle" title="صوت النظام" 
                        style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #00eaff; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; z-index: 10; position: relative; margin-right: 5px;">
                        <i class="fa-solid ${audioEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}"></i>
                    </button>

                    ${isSuperAdmin ? `<i class="fa-solid fa-chevron-down branch-chevron"></i>` : ''}

                    <!-- ═══ CUSTOM DROPDOWN MENU ═══ -->
                    <div class="branch-custom-menu" id="branch-custom-menu">
                        <div class="branch-dropdown-item ${!activeBranch ? 'active' : ''}" data-id="">
                            <i class="fa-solid fa-globe"></i> <span>الفروع</span>
                        </div>
                        ${branches.map(b => `
                            <div class="branch-dropdown-item ${activeBranch && activeBranch.id === b.id ? 'active' : ''}" data-id="${b.id}">
                                <i class="fa-solid fa-building"></i> <span>${b.name}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <nav class="nav-menu" style="padding-top: 5px;">
                <a href="${p}dashboard.html" class="nav-item ${currentPath === 'dashboard.html' || currentPath === 'index.html' ? 'active' : ''}">
                    <i class="fa-solid fa-house"></i> <span>لوحة التحكم الرئيسية</span>
                </a>

                <!-- ── ACCORDION: إضافات سريعة ── -->
                <div class="nav-accordion-header" data-section="quick-add">
                    <div class="nav-accordion-title-content"><i class="fa-solid fa-bolt"></i><span>إضافات سريعة</span></div>
                    <i class="fa-solid fa-chevron-down nav-accordion-arrow"></i>
                </div>
                <div class="nav-accordion-body" data-section="quick-add">
                    <a href="${p}modules/add-student.html" class="nav-item nav-sub-item ${currentPath === 'add-student.html' ? 'active' : ''}">
                        <i class="fa-solid fa-user-plus"></i> <span>تـسجيل طالب جديد</span>
                    </a>
                    <a href="${p}modules/add-trainer.html" class="nav-item nav-sub-item ${currentPath === 'add-trainer.html' ? 'active' : ''}">
                        <i class="fa-solid fa-person-chalkboard"></i> <span>تـسجيل محاضر جديد</span>
                    </a>
                    <a href="${p}modules/groups.html" class="nav-item nav-sub-item ${currentPath === 'groups.html' ? 'active' : ''}">
                        <i class="fa-solid fa-layer-group"></i> <span>إضافة جروبات</span>
                    </a>
                </div>

                <!-- ── ACCORDION: الأكاديمية والطلاب ── -->
                <div class="nav-accordion-header" data-section="academy">
                    <div class="nav-accordion-title-content"><i class="fa-solid fa-graduation-cap"></i><span>الأكاديمية والطلاب</span></div>
                    <i class="fa-solid fa-chevron-down nav-accordion-arrow"></i>
                </div>
                <div class="nav-accordion-body" data-section="academy">
                    <a href="${p}modules/students.html" class="nav-item nav-sub-item ${currentPath === 'students.html' ? 'active' : ''}">
                        <i class="fa-solid fa-user-graduate"></i> <span>بيانات الطلاب</span>
                    </a>
                    <a href="${p}modules/trainers.html" class="nav-item nav-sub-item ${currentPath === 'trainers.html' ? 'active' : ''}">
                        <i class="fa-solid fa-chalkboard-user"></i> <span>المحاضرين / المعلمين</span>
                    </a>
                    <a href="${p}modules/users-management.html" class="nav-item nav-sub-item ${currentPath === 'users-management.html' ? 'active' : ''}">
                        <i class="fa-solid fa-id-badge"></i> <span>الموظفين / الإداريين</span>
                    </a>
                    <a href="${p}modules/attendance.html" class="nav-item nav-sub-item ${currentPath === 'attendance.html' ? 'active' : ''}">
                        <i class="fa-solid fa-clipboard-check"></i> <span>الحضور والغياب (يدوي)</span>
                    </a>
                    <a href="${p}admin-console/index.html" class="nav-item nav-sub-item ${currentPath === 'index.html' && p === '../' ? 'active' : ''}">
                        <i class="fa-solid fa-barcode"></i> <span>كونسول الباركود الذكي</span>
                    </a>
                    <a href="${p}modules/attendance-logs.html" class="nav-item nav-sub-item ${currentPath === 'attendance-logs.html' ? 'active' : ''}">
                        <i class="fa-solid fa-receipt"></i> <span>سجل الحضور اليومي</span>
                    </a>
                    <a href="${p}modules/grades.html" class="nav-item nav-sub-item ${currentPath === 'grades.html' ? 'active' : ''}">
                        <i class="fa-solid fa-award"></i> <span>الدرجات والشهادات</span>
                    </a>
                </div>

                <!-- ── ACCORDION: المخزن والمشتريات ── -->
                <div class="nav-accordion-header" data-section="inventory">
                    <div class="nav-accordion-title-content"><i class="fa-solid fa-boxes-stacked"></i><span>المخزن والمشتريات</span></div>
                    <i class="fa-solid fa-chevron-down nav-accordion-arrow"></i>
                </div>
                <div class="nav-accordion-body" data-section="inventory">
                    <a href="${p}modules/books.html" class="nav-item nav-sub-item ${currentPath === 'books.html' ? 'active' : ''}" data-permission="manage_inventory">
                        <i class="fa-solid fa-book"></i> <span>إدارة الكتب</span>
                    </a>
                    <a href="${p}modules/purchase-invoice.html" class="nav-item nav-sub-item ${currentPath === 'purchase-invoice.html' ? 'active' : ''}" data-permission="manage_inventory">
                        <i class="fa-solid fa-cart-shopping"></i> <span>فاتورة شراء</span>
                    </a>
                    <a href="${p}modules/book-delivery.html" class="nav-item nav-sub-item ${currentPath === 'book-delivery.html' ? 'active' : ''}" data-permission="manage_inventory">
                        <i class="fa-solid fa-truck-ramp-box"></i> <span>تسليم كتب</span>
                    </a>
                </div>

                <!-- ── ACCORDION: المحاسبة والمالية ── -->
                <div class="nav-accordion-header" data-section="finance">
                    <div class="nav-accordion-title-content"><i class="fa-solid fa-dollar-sign"></i><span>المحاسبة والمالية</span></div>
                    <i class="fa-solid fa-chevron-down nav-accordion-arrow"></i>
                </div>
                <div class="nav-accordion-body" data-section="finance">
                    <a href="${p}modules/budget.html" class="nav-item nav-sub-item ${currentPath === 'budget.html' ? 'active' : ''}" data-permission="view_financial_reports">
                        <i class="fa-solid fa-receipt"></i> <span>📊 الميزانية العامة</span>
                    </a>
                    <a href="${p}modules/ledger.html" class="nav-item nav-sub-item ${currentPath === 'ledger.html' ? 'active' : ''}" data-permission="post_journal">
                        <i class="fa-solid fa-book-journal-whills"></i> <span>قيود اليومية</span>
                    </a>
                    <a href="${p}modules/daily-closing.html" class="nav-item nav-sub-item ${currentPath === 'daily-closing.html' ? 'active' : ''}" data-permission="post_journal">
                        <i class="fa-solid fa-vault"></i> <span>الميزانية اليومية</span>
                    </a>
                    <a href="${p}modules/financial-dashboard.html" class="nav-item nav-sub-item ${currentPath === 'financial-dashboard.html' ? 'active' : ''}" data-permission="view_financial_reports">
                        <i class="fa-solid fa-chart-line"></i> <span>الذكاء المالي</span>
                    </a>
                    <a href="${p}modules/invoices.html" class="nav-item nav-sub-item ${currentPath === 'invoices.html' ? 'active' : ''}" data-permission="view_invoices">
                        <i class="fa-solid fa-file-invoice-dollar"></i> <span>الفواتير</span>
                    </a>
                    <a href="${p}modules/payroll.html" class="nav-item nav-sub-item ${currentPath === 'payroll.html' ? 'active' : ''}" data-permission="post_journal">
                        <i class="fa-solid fa-money-check-dollar"></i> <span>رواتب المدرسين</span>
                    </a>
                </div>

                <!-- ── ACCORDION: الإدارة والنظام (Super Admin Only) ── -->
                ${(user && user.role_id === 1) ? `
                <div class="nav-accordion-header" data-section="admin">
                    <div class="nav-accordion-title-content"><i class="fa-solid fa-shield-halved"></i><span>الإدارة والنظام</span></div>
                    <i class="fa-solid fa-chevron-down nav-accordion-arrow"></i>
                </div>
                <div class="nav-accordion-body" data-section="admin">
                    <a href="${p}modules/admin-insights.html" class="nav-item nav-sub-item ${currentPath === 'admin-insights.html' ? 'active' : ''}" style="color: #f59e0b !important;">
                        <i class="fa-solid fa-tower-observation" style="color: #f59e0b;"></i> <span>نظرة المدير العام</span>
                    </a>
                    <a href="${p}modules/branches.html" class="nav-item nav-sub-item ${currentPath === 'branches.html' ? 'active' : ''}">
                        <i class="fa-solid fa-building-columns"></i> <span>إدارة الفروع</span>
                    </a>
                    <a href="${p}modules/print-ids.html" class="nav-item nav-sub-item ${currentPath === 'print-ids.html' ? 'active' : ''}" style="color: #00eaff !important;">
                        <i class="fa-solid fa-id-card" style="color: #00eaff;"></i> <span>طـباعة الكارنيهات</span>
                    </a>
                    <a href="${p}modules/users-management.html" class="nav-item nav-sub-item ${currentPath === 'users-management.html' ? 'active' : ''}" data-permission="manage_users">
                        <i class="fa-solid fa-users-gear"></i> <span>إدارة الموظفين والصلاحيات</span>
                    </a>
                    <a href="${p}modules/settings.html" class="nav-item nav-sub-item ${currentPath === 'settings.html' ? 'active' : ''}" data-permission="view_dashboard">
                        <i class="fa-solid fa-gear"></i> <span>إعدادات النظام والأمان</span>
                    </a>
                </div>
                ` : ''}

                <div class="nav-divider"></div>
                <a href="${p}modules/portal.html" target="_blank" class="nav-item" style="background: rgba(99, 102, 241, 0.1); color: #6366f1 !important; border-bottom: 1px solid rgba(99,102,241,0.2); margin-top: 10px;">
                    <i class="fa-solid fa-user-graduate" style="color: #6366f1;"></i> <span>بوابة الطالب (تجريبي)</span>
                </a>
                <div style="display: flex; gap: 5px; margin-top: 10px;">
                    <button onclick="(async function(){
                        if(!navigator.onLine){ Toast.show('❌ لا يوجد اتصال بالإنترنت!', 'error'); return; }
                        // Wait up to 3s for Firebase to load
                        for(let i=0; i<30; i++) { if(window.Cloud) break; await new Promise(r=>setTimeout(r, 100)); }
                        if(!window.Cloud){ Toast.show('⚠️ السحاب غير جاهز بعد، يرجى الانتظار 5 ثوانٍ والمحاولة مرة أخرى.', 'warning'); return; }
                        
                        Toast.show('📤 جاري رفع البيانات للسحاب...', 'info');
                        try{
                            var allData={
                                trainers: Storage.get('trainers')||[], students: Storage.get('students')||[],
                                users: Storage.get('users')||[], study_groups: Storage.get('study_groups')||[],
                                branches: Storage.get('branches')||[], attendance: Storage.get('attendance')||{},
                                employee_logs: Storage.get('employee_logs')||{}, trainer_logs: Storage.get('trainer_logs')||{}
                            };
                            await Cloud.pushAllRecords(allData);
                            Toast.show('✅ تم رفع البيانات بنجاح!', 'success');
                        }catch(e){ Toast.show('❌ فشل الرفع: ' + e.message, 'error'); }
                    })()" class="nav-item cloud-sync-btn" style="flex: 1; border: none; background: rgba(59, 130, 246, 0.05); color: #3b82f6 !important; margin: 0; cursor: pointer; padding: 10px; font-size: 0.75rem;">
                        <i class="fa-solid fa-cloud-arrow-up"></i> <span>رفع سحابي</span>
                    </button>

                    <button onclick="(async function(){
                        if(!navigator.onLine){ Toast.show('❌ لا يوجد اتصال بالإنترنت!', 'error'); return; }
                        for(let i=0; i<30; i++) { if(window.Cloud) break; await new Promise(r=>setTimeout(r, 100)); }
                        if(!window.Cloud){ Toast.show('⚠️ السحاب غير جاهز بعد!', 'warning'); return; }
                        
                        if(!confirm('🚨 تحذير: سحب البيانات سيمسح البيانات الحالية ويستبدلها بتلك الموجودة في السحاب. هل أنت متأكد؟')) return;

                        Toast.show('📥 جاري سحب البيانات من السحاب...', 'info');
                        try{
                            const data = await Cloud.pullAllRecords();
                            if(data){
                                if(data.trainers) Storage.save('trainers', data.trainers);
                                if(data.students) Storage.save('students', data.students);
                                if(data.users) Storage.save('users', data.users);
                                if(data.study_groups) Storage.save('study_groups', data.study_groups);
                                if(data.branches) Storage.save('branches', data.branches);
                                if(data.attendance) Storage.save('attendance', data.attendance);
                                if(data.employee_logs) Storage.save('employee_logs', data.employee_logs);
                                if(data.trainer_logs) Storage.save('trainer_logs', data.trainer_logs);
                                
                                // ⚡ v5: Standardize IDs immediately after pull
                                if (window.Utils && Utils.migrateToNumericIDs) Utils.migrateToNumericIDs();

                                Toast.show('✅ تمت مزامنة البيانات بنجاح! سيتم تحديث الصفحة الآن.', 'success');
                                setTimeout(() => location.reload(), 2000);
                            } else {
                                Toast.show('⚠️ السحاب فارغ! لا توجد بيانات مسجلة.', 'warning');
                            }
                        }catch(e){ Toast.show('❌ فشل السحب: ' + e.message, 'error'); }
                    })()" class="nav-item cloud-sync-btn" style="flex: 1; border: none; background: rgba(245, 158, 11, 0.05); color: #f59e0b !important; margin: 0; cursor: pointer; padding: 10px; font-size: 0.75rem;">
                        <i class="fa-solid fa-cloud-arrow-down"></i> <span>سحب سحابي</span>
                    </button>
                </div>
                <button onclick="BackupEngine.exportBranchData()" class="nav-item manual-backup-btn" style="width: 100%; border: none; background: rgba(16, 185, 129, 0.05); color: #10b981 !important; margin-top: 5px; cursor: pointer;">
                    <i class="fa-solid fa-shield-halved"></i> <span>نسخة أمان يدوية</span>
                </button>
                <a href="#" onclick="BackupEngine.safeExit(false)" class="nav-item safe-exit-btn" style="width: 100%; border: none; background: rgba(239, 68, 68, 0.05); color: #ef4444 !important; margin-top: 5px;">
                    <i class="fa-solid fa-power-off"></i> <span>خروج آمن (مع الحفظ)</span>
                </a>
            </nav>
        `;

        if (window.Permissions) Permissions.applyUIPermissions();

        // Attach Navigation Sound to Sidebar Links
        sidebarTarget.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                if (window.AudioCore) AudioCore.playNavigate();
            });
        });

        // Initialize accordion behaviour
        this._initAccordion(currentPath);

        // Initialize Custom Branch Dropdown
        this._initBranchDropdown();
    },

    _initBranchDropdown() {
        const trigger = document.getElementById('branch-dropdown-trigger');
        const menu = document.getElementById('branch-custom-menu');
        if (!trigger || !menu) return;

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = menu.classList.contains('active');
            
            // Close other menus if needed
            menu.classList.toggle('active');
            trigger.classList.toggle('open');
            
            if (window.AudioCore) AudioCore.playNavigate();
        });

        menu.querySelectorAll('.branch-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const branchId = item.dataset.id;
                const label = item.querySelector('span').innerText;
                
                if (window.Permissions) {
                    Permissions.setViewBranch(branchId);
                    if (window.Toast) Toast.show('✅ تم التحويل إلى: ' + label, 'success');
                    setTimeout(() => location.reload(), 600);
                }
                
                menu.classList.remove('active');
                trigger.classList.remove('open');
            });
        });

        // Click outside to close
        document.addEventListener('click', () => {
            menu.classList.remove('active');
            trigger.classList.remove('open');
        });
    },

    _initAccordion(currentPath) {
        const STORAGE_KEY = 'edu_sidebar_active_section';
        const savedSection = sessionStorage.getItem(STORAGE_KEY);

        const sectionMap = {
            'add-student.html': 'quick-add', 'add-trainer.html': 'quick-add', 'groups.html': 'quick-add',
            'students.html': 'academy',      'trainers.html': 'academy',      'attendance.html': 'academy',
            'attendance-console.html': 'academy', 'attendance-logs.html': 'academy', 'grades.html': 'academy',
            'books.html': 'inventory',       'purchase-invoice.html': 'inventory', 'book-delivery.html': 'inventory',
            'budget.html': 'finance',         'ledger.html': 'finance',         'daily-closing.html': 'finance',
            'financial-dashboard.html': 'finance', 'invoices.html': 'finance',   'payroll.html': 'finance',
            'admin-insights.html': 'admin',   'branches.html': 'admin',          'print-ids.html': 'admin',
            'users-management.html': 'admin', 'settings.html': 'admin'
        };

        const activeSection = sectionMap[currentPath] || savedSection;

        document.querySelectorAll('.nav-accordion-header').forEach(header => {
            const section = header.dataset.section;
            const body = document.querySelector(`.nav-accordion-body[data-section="${section}"]`);
            if (!body) return;

            // Initial state based on current page or saved state
            if (activeSection === section) {
                header.classList.add('open');
                body.style.maxHeight = body.scrollHeight + 300 + 'px';
                body.style.opacity = '1';
            }

            header.addEventListener('click', () => {
                const isOpen = header.classList.contains('open');
                
                if (!isOpen) {
                    // CLOSE ALL OTHERS FIRST
                    document.querySelectorAll('.nav-accordion-header.open').forEach(otherHeader => {
                        otherHeader.classList.remove('open');
                        const otherBody = document.querySelector(`.nav-accordion-body[data-section="${otherHeader.dataset.section}"]`);
                        if (otherBody) {
                            otherBody.style.maxHeight = '0';
                            otherBody.style.opacity = '0';
                        }
                    });

                    // OPEN THIS ONE
                    header.classList.add('open');
                    body.style.maxHeight = body.scrollHeight + 300 + 'px';
                    body.style.opacity = '1';
                    sessionStorage.setItem(STORAGE_KEY, section);
                } else {
                    // CLOSE THIS ONE
                    header.classList.remove('open');
                    body.style.maxHeight = '0';
                    body.style.opacity = '0';
                    sessionStorage.removeItem(STORAGE_KEY);
                }
                
                if (window.AudioCore) AudioCore.playNavigate();
            });
        });
    },

    _attachAudioListeners() {
        const btn = document.getElementById('system-audio-btn');
        if (!btn) return;

        btn.onclick = (e) => {
            e.stopPropagation();
            if (window.AudioCore) {
                AudioCore.toggleGlobal();
            }
        };
    },

    _triggerPageLoadSound() {
        if (window.AudioCore) {
            // Short delay to ensure it plays after the user has interacted if necessary, 
            // but for a transition feel it's often better as early as possible.
            setTimeout(() => AudioCore.playNavigate(), 200);
        }
    },

    _triggerWelcomeSound() {
        const currentPath = window.location.pathname.split('/').pop() || 'dashboard.html';
        if (currentPath === 'dashboard.html' || currentPath === 'index.html') {
            // Check if played this session
            if (!sessionStorage.getItem('welcome_played') && window.AudioCore) {
                setTimeout(() => {
                    AudioCore.playWelcome();
                    sessionStorage.setItem('welcome_played', 'true');
                }, 1000);
            }
        }
    },

    renderMobileNav() {
        if (document.querySelector('.mobile-floating-btn')) return;

        // Force a floating button on ALL pages for mobile consistency
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'mobile-floating-btn';
        toggleBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
        toggleBtn.onclick = () => this.toggleSidebar();
        
        // Style it to be fixed at the bottom right temporarily (CSS will handle media queries)
        toggleBtn.style.position = 'fixed';
        toggleBtn.style.bottom = '20px';
        toggleBtn.style.right = '20px'; // CHANGED: moved to bottom right
        toggleBtn.style.zIndex = '9998';
        toggleBtn.style.display = 'none'; // hidden on desktop

        document.body.appendChild(toggleBtn);

        if (!document.querySelector('.sidebar-overlay')) {
            const overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            overlay.onclick = () => this.toggleSidebar(false);
            document.body.appendChild(overlay);
        }
    },

    toggleSidebar(forceState) {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        if (!sidebar || !overlay) return;
        const isActive = forceState !== undefined ? forceState : !sidebar.classList.contains('active');
        if (isActive) {
            sidebar.classList.add('active');
            overlay.classList.add('active');
        } else {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        }
    },

    setupInputMasks() {
        document.querySelectorAll('input[type="number"], input[type="tel"], .numeric-only').forEach(input => {
            if (input.classList.contains('budget-input')) return;
            input.addEventListener('input', (e) => {
                const start = e.target.selectionStart;
                const val = e.target.value;
                const filtered = val.replace(/[^\d]/g, '');
                if (val !== filtered) {
                    e.target.value = filtered;
                    e.target.setSelectionRange(start, start);
                }
            });
        });

        const textSelectors = [
            'input[type="text"][placeholder*="اسم"]',
            'input[type="text"][placeholder*="الاسم"]',
            'input[type="text"][placeholder*="العنوان"]',
            'input[placeholder="أدخل الاسم"]',
            '.text-only'
        ];
        document.querySelectorAll(textSelectors.join(', ')).forEach(input => {
            if (input.classList.contains('budget-input') || input.id.includes('search') || input.classList.contains('search-input')) return;
            input.addEventListener('input', (e) => {
                const start = e.target.selectionStart;
                const val = e.target.value;
                const filtered = val.replace(/[0-9\d\u0660-\u0669]/g, '');
                if (val !== filtered) {
                    e.target.value = filtered;
                    e.target.setSelectionRange(start, start);
                }
            });
        });

        document.querySelectorAll('input[step="0.01"], .price-only').forEach(input => {
            if (input.classList.contains('budget-input')) return;
            input.addEventListener('input', (e) => {
                const start = e.target.selectionStart;
                const val = e.target.value;
                let filtered = val.replace(/[^\d.]/g, '');
                const parts = filtered.split('.');
                if (parts.length > 2) filtered = parts[0] + '.' + parts.slice(1).join('');
                if (val !== filtered) {
                    e.target.value = filtered;
                    e.target.setSelectionRange(start, start);
                }
            });
        });
    },

    renderGlobalSearch() {
        // We render BELOW the sticky shortcuts bar, not inside the top-bar
        // Delay to ensure the shortcuts bar is already in the DOM
        setTimeout(() => this._mountSearchBar(), 150);
    },

    _mountSearchBar() {
        if (document.getElementById('global-search-bar-row')) return;
        if (document.body.dataset.noGlobalSearch === 'true') return;

        const shortcutsBar = document.getElementById('global-sticky-shortcuts');
        if (!shortcutsBar) return;

        const sidebarWidth = document.querySelector('.sidebar')?.offsetWidth || 280;

        const row = document.createElement('div');
        row.id = 'global-search-bar-row';
        row.style.cssText = `
            position: fixed;
            top: ${shortcutsBar.offsetTop + shortcutsBar.offsetHeight - 36}px; /* تعديل الـ top ليناسب الحجم الأنحف */
            right: calc(${sidebarWidth}px + (100% - ${sidebarWidth}px - 300px) / 2); /* متمركز لليسار بالنسبة للسايدبار */
            width: 300px; /* حوالي 8 سم */
            z-index: 1001;
            background: var(--bg-card);
            border: 2px solid var(--accent-teal);
            border-radius: 50px;
            padding: 2px;
            display: flex;
            align-items: center;
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        `;

        row.innerHTML = `
            <div class="global-search-wrapper" style="flex:1; max-width:100% !important; margin:0; position:relative;">
                <div class="search-input-group" style="display:flex; align-items:center; position:relative; width:100%;">
                    <input type="text" class="global-search-input" id="global-search"
                        placeholder="ابحث في كافة النظام..."
                        style="width:100%; height:24px; border:none !important; background:transparent !important; border-radius:50px; font-size:0.82rem; padding: 0 40px 0 15px; color: var(--text-main); outline:none !important; text-align: right; direction: rtl;">
                    <i class="fa-solid fa-magnifying-glass" style="position:absolute; right:15px; top:50%; transform:translateY(-50%); color:var(--accent-teal); font-size:0.8rem; pointer-events:none;"></i>
                </div>
            </div>
                <div class="search-results-overlay" id="search-results"
                     style="top: calc(100% + 12px); border-radius:18px; width: 450px; right: 50%; transform: translateX(50%);">
                    <div class="search-results-header">
                        <span>نتائج البحث الذكي</span>
                        <span id="search-count" class="search-count">0</span>
                    </div>
                    <div class="search-results-body" id="search-results-body">
                        <div class="no-results">
                            <i class="fa-solid fa-wand-magic-sparkles"></i>
                            ابدأ الكتابة للبحث الشامل...
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Focus Interaction
        const input = row.querySelector('input');
        input.addEventListener('focus', () => {
            row.style.width = '350px';
            row.style.boxShadow = '0 12px 35px rgba(26, 158, 156, 0.3)';
            row.style.right = `calc(${sidebarWidth}px + (100% - ${sidebarWidth}px - 350px) / 2)`;
        });
        input.addEventListener('blur', () => {
            setTimeout(() => {
                row.style.width = '300px';
                row.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.2)';
                row.style.right = `calc(${sidebarWidth}px + (100% - ${sidebarWidth}px - 300px) / 2)`;
            }, 200);
        });

        document.body.appendChild(row);

        // Adjust Main Content Padding to be minimal (save space)
        const adjustPadding = () => {
            const mc = document.querySelector('.main-content');
            if (mc) {
                // نأخذ ارتفاع شريط الاختصارات فقط لأن البحث أصبح عائماً (Floating) ومتداخلاً معه
                const totalPadding = (shortcutsBar.offsetHeight || 60) + 15;
                mc.style.paddingTop = totalPadding + 'px';
            }
        };
        setTimeout(adjustPadding, 100);
        window.addEventListener('resize', () => { setTimeout(adjustPadding, 50); });

        const p = this._getPrefix();
        // Load search engine script
        if (typeof GlobalSearchController === 'undefined') {
            const script = document.createElement('script');
            script.src = p + 'js/global-search.js';
            document.body.appendChild(script);
        }
    },

    renderBranchSwitcher() {
        const user = window.Permissions?.getCurrentUser();
        if (!user || user.role_id !== 1) return;
        const topBar = document.querySelector('.top-bar');
        if (!topBar || document.getElementById('branch-switcher-nav')) return;

        const branches = window.Storage?.get('branches') || [];
        const activeBranchId = window.Permissions.getActiveBranchId();
        const activeBranch = branches.find(b => b.id === activeBranchId);

        const switcher = document.createElement('div');
        switcher.id = 'branch-switcher-nav';
        switcher.className = 'branch-selector-container';
        switcher.style.cssText = `display: flex; align-items: center; gap: 12px; margin-right: 20px; padding: 5px 15px; background: rgba(0, 234, 255, 0.05); border: 1px solid rgba(0, 234, 255, 0.2); border-radius: 50px;`;

        const isMainAdmin = !activeBranchId;
        switcher.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <label id="branch-nav-label" style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">التحكم في:</label>
                <select id="branch-nav-select" class="app-input" style="width: 240px; height: 42px; padding: 0 15px; border-radius: 20px; background: var(--bg-card); border: 2px solid ${isMainAdmin ? '#f59e0b' : 'var(--accent-teal)'}; color: var(--text-main) !important; font-size: 18px; font-weight: 900; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,0.05);"
                    onchange="Permissions.setViewBranch(this.value); location.reload();">
                    <option value="" style="color: #000 !important; background: #fff !important; font-weight: 900;">عرض كافة الفروع</option>
                    ${branches.map(b => `<option value="${b.id}" ${activeBranchId === b.id ? 'selected' : ''} style="color: #000 !important; background: #fff !important; font-weight: 900;">${b.name}</option>`).join('')}
                </select>
            </div>
        `;
        const actionGroups = topBar.querySelectorAll('.action-group');
        if (actionGroups.length > 0) topBar.insertBefore(switcher, actionGroups[actionGroups.length - 1]);
    },

    applyBranchBranding() {
        const branchId = window.Permissions?.getActiveBranchId();
        if (!branchId) return;
        const branches = window.Storage?.get('branches') || [];
        const branch = branches.find(b => b.id === branchId);
        if (!branch) return;
        document.title = `${branch.name} - EduMaster Pro`;
        const logo = document.querySelector('.user-avatar i');
        if (logo) logo.style.color = 'var(--accent-teal)';
    },

    renderTopBarActions() {
        const topBar = document.querySelector('.top-bar');
        if (!topBar || document.getElementById('global-actions')) return;

        const p = this._getPrefix();
        if (typeof ThemeController === 'undefined' && !document.querySelector('script[src*="theme-toggle.js"]')) {
            const script = document.createElement('script');
            script.src = p + 'js/theme-toggle.js';
            document.body.appendChild(script);
        }

        const user = window.Permissions?.getCurrentUser() || { name: 'المستخدم', role_name: 'موظف' };
        const actionsWrapper = document.createElement('div');
        actionsWrapper.id = 'global-actions';
        actionsWrapper.className = 'action-group';
        actionsWrapper.style.gap = '15px';
        actionsWrapper.style.display = 'flex';
        actionsWrapper.style.alignItems = 'center';

        const profileDiv = document.createElement('div');
        profileDiv.className = 'user-profile';
        profileDiv.style.display = 'flex';
        profileDiv.style.alignItems = 'center';
        profileDiv.style.gap = '12px';

        profileDiv.innerHTML = `
            <div class="user-avatar" style="width:40px; height:40px; background:var(--accent-teal); color:#fff; font-size:16px; display:flex; align-items:center; justify-content:center; border-radius:50%;">
                ${(user.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div style="display: flex; flex-direction: column;">
                <span style="color: var(--text-main); font-weight: 700; font-size: 0.9rem;">${user.name}</span>
                <span style="color: var(--text-muted); font-size: 0.75rem;">${user.role_name || 'موظف'}</span>
            </div>
        `;
        actionsWrapper.appendChild(profileDiv);
        topBar.appendChild(actionsWrapper);
    },

    checkBackupIntegrity() {
        // Disabled the annoying 24-hr visual banner since Auto-Backup is now fully enforced and guaranteed on app exit
        return;
    },

    injectBackupBanner() {
        const mainContent = document.querySelector('.main-content');
        if (!mainContent || document.getElementById('global-backup-alert')) return;
        const banner = document.createElement('div');
        banner.id = 'global-backup-alert';
        banner.className = 'alert-premium';
        banner.style.cssText = `background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); border: 2px solid #fca5a5; box-shadow: 0 8px 30px rgba(220, 38, 38, 0.4); color: #fff; padding: 20px; border-radius: 12px; font-weight: 800; margin: 20px; display: flex; align-items: center; gap: 15px; z-index: 1000;`;
        banner.innerHTML = `
            <i class="fa-solid fa-circle-exclamation" style="color: #fef2f2; font-size: 1.5rem; animation: pulse 2s infinite;"></i>
            <div style="flex: 1;">
                <span style="color: #fef2f2; font-weight: 900; font-size: 1.1rem; display: block; margin-bottom: 5px;">⚠️ تنبيه حرج: حان وقت النسخ الاحتياطي!</span>
                <span style="color: #fecaca; font-weight: 700; font-size: 0.9rem;">مر أكثر من 24 ساعة على آخر نسخة احتياطية. قم بحماية بيانات الأكاديمية الآن!</span>
            </div>
            <div style="display: flex; gap: 10px;">
                <button class="app-btn-primary" onclick="BackupEngine.exportBranchData()" 
                    style="background: #fef2f2 !important; color: #dc2626 !important; border: 2px solid #fef2f2 !important; font-weight: 900; padding: 10px 20px;">
                    <i class="fa-solid fa-download"></i> نسخ احتياطي الآن
                </button>
                <button onclick="this.parentElement.parentElement.remove(); localStorage.setItem('edumaster_last_backup_check', Date.now().toString());"
                    style="background: rgba(254, 242, 242, 0.2); color: #fef2f2; border: 1px solid rgba(254, 242, 242, 0.3); padding: 8px 15px; border-radius: 8px; cursor: pointer; font-weight: 800;">
                    تجاهل
                </button>
            </div>
        `;
        mainContent.prepend(banner);
        if (!document.getElementById('pulse-anim-style')) {
            const style = document.createElement('style');
            style.id = 'pulse-anim-style';
            style.innerHTML = `@keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.1); } }`;
            document.head.appendChild(style);
        }
    },

    injectBroadcastBanner() {
        if (document.getElementById('global-broadcast-banner')) return;
        
        const config = window.Storage?.get('app_config') || {};
        const msg = config.broadcastMessage;
        if (!msg || !msg.trim()) return;

        const mainContent = document.querySelector('.main-content');
        if (!mainContent) return;

        const banner = document.createElement('div');
        banner.id = 'global-broadcast-banner';
        banner.style.cssText = `
            background: linear-gradient(135deg, #4f46e5 0%, #312e81 100%);
            color: #fff;
            padding: 12px 20px;
            border-radius: 12px;
            margin: 20px 20px 0 20px;
            display: flex;
            align-items: center;
            gap: 15px;
            font-weight: 800;
            box-shadow: 0 4px 15px rgba(79, 70, 229, 0.4);
            border: 1.5px solid rgba(255,255,255,0.15);
            animation: slideDownFade 0.6s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            z-index: 99;
        `;
        banner.innerHTML = `
            <div style="background: rgba(255,255,255,0.2); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <i class="fa-solid fa-bullhorn" style="font-size: 1rem; color: #fff; animation: floatAnim 3s infinite ease-in-out;"></i>
            </div>
            <div style="flex: 1; font-size: 0.95rem; line-height: 1.6; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">
                <span style="opacity: 0.8; font-size: 0.8rem; display: block; margin-bottom: 2px;">تنبيه من إدارة المركز (Broadcast)</span>
                ${msg}
            </div>
            <button onclick="this.parentElement.remove()" style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2); color: #fff; cursor: pointer; padding: 6px 14px; border-radius: 10px; font-size: 0.8rem; font-weight: 800; transition: 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">إغلاق</button>
        `;
        mainContent.prepend(banner);

        if (!document.getElementById('broadcast-anim-styles')) {
            const style = document.createElement('style');
            style.id = 'broadcast-anim-styles';
            style.innerHTML = `
                @keyframes slideDownFade { from { transform: translateY(-30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                @keyframes floatAnim { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
            `;
            document.head.appendChild(style);
        }
    },

    highlightActiveNav() {
        setTimeout(() => {
            const activeItem = document.querySelector('.nav-item.active');
            if (activeItem) activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 100);
    },

    // ── NEW: Global Event Master ──
    _initGlobalEvents() {
        // 1. Keyboard Master (Enter & Escape) - KEEPING ONLY LOGIC, REMOVING EXTRA UI
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const activeModal = document.querySelector('.modal-overlay.active');
                if (activeModal) {
                    const closeBtn = activeModal.querySelector('.modal-btn-cancel, .close-modal');
                    if (closeBtn) closeBtn.click();
                    else activeModal.classList.remove('active');
                } else if (document.getElementById('search-results')?.classList.contains('open')) {
                    const searchInput = document.getElementById('global-search');
                    if (searchInput) { searchInput.value = ''; searchInput.blur(); }
                    document.getElementById('search-results').classList.remove('open');
                }
            } else if (e.key === 'Enter') {
                const activeModal = document.querySelector('.modal-overlay.active');
                if (activeModal) {
                    const primaryBtn = activeModal.querySelector('.modal-btn-confirm, #pass-confirm, #global-success-ok');
                    if (primaryBtn) { e.preventDefault(); primaryBtn.click(); }
                }
            }
        });

        // CRITICAL CLEANUP: Remove ANY previous navigation elements from DOM
        const junk = document.querySelectorAll('#table-float-nav, .float-nav-btn, .float-nav-btn-clean, #table-float-nav-v2, .sidebar-nav-controls, .clean-table-nav');
        junk.forEach(el => el.remove());
    }
};

UICore.init();
// Initialize Global Events after DOM ready
window.addEventListener('load', () => UICore._initGlobalEvents?.());

// --- Floating Navigation Arrows ---
function initPageNavArrows() {
    if (document.querySelector('.page-nav-controls')) return;
    
    const style = document.createElement('style');
    style.textContent = `
        .page-nav-controls {
            position: fixed;
            left: 20px; /* FIXED: Bottom Left */
            bottom: 20px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            z-index: 9000; /* LOWER Z-INDEX: Below mobile floating btn and sidebar */
        }
        .page-nav-btn {
            width: 45px;
            height: 45px;
            background: #fff;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            color: #0d258c;
            font-size: 1.1rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .page-nav-btn:hover {
            transform: scale(1.1);
            background: #0d258c;
            color: #fff;
            border-color: #0d258c;
        }
        body.dark-mode .page-nav-btn {
            background: #1e293b;
            border-color: rgba(0, 234, 255, 0.2);
            color: #00eaff;
        }
        body.dark-mode .page-nav-btn:hover {
            background: #00eaff;
            color: #000;
        }
        @media print { .page-nav-controls { display: none !important; } }
    `;
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.className = 'page-nav-controls no-print';
    container.innerHTML = `
        <button class="page-nav-btn" onclick="window.scrollTo({top: 0, behavior: 'smooth'})" title="إلى البداية">
            <i class="fa-solid fa-angles-up"></i>
        </button>
        <button class="page-nav-btn" onclick="window.scrollBy({top: -600, behavior: 'smooth'})" title="للأعلى">
            <i class="fa-solid fa-chevron-up"></i>
        </button>
        <button class="page-nav-btn" onclick="window.scrollBy({top: 600, behavior: 'smooth'})" title="للأسفل">
            <i class="fa-solid fa-chevron-down"></i>
        </button>
        <button class="page-nav-btn" onclick="window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'})" title="إلى النهاية">
            <i class="fa-solid fa-angles-down"></i>
        </button>
    `;
    document.body.appendChild(container);
}

// Ensure arrows load on every page
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPageNavArrows);
} else {
    initPageNavArrows();
}
