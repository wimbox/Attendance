
/**
 * Attendance Logs Controller v2
 * Features: Grouped view (in/out per person), duration calculation, detailed/summary toggle, improved Excel export.
 */

class AttendanceLogsController {
    constructor() {
        this.tbody = document.getElementById('logs-tbody');
        this.dateInput = document.getElementById('log-date');
        this.viewMode = 'grouped'; // 'grouped' or 'detailed'
        this.currentSort = { column: 'timeIn', direction: 'desc' }; // default sort
        this.init();
    }

    init() {
        // Safe YYYY-MM-DD getter
        const getToday = () => {
            const d = new Date();
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const today = getToday();
        this.dateInput.value = today; // ⚡ FIX: Default to Today
        console.log("📅 Logs initialized to:", today);
        this.dateInput.addEventListener('change', () => this.render());
        
        // 📡 Cloud Sync: Listen for mobile scans while this page is open
        if (window.Cloud && window.Cloud.startScanBackgroundSync) {
            const branchId = window.Permissions?.getActiveBranchId() || 'miami';
            console.log("🔗 Starting Cloud Sync for Logs on Branch:", branchId);
            
            window.Cloud.startScanBackgroundSync(branchId, (scan) => {
                console.log("📡 Cloud scan received in Logs:", scan);
                
                // 🔊 Auditory Feedback on PC (Fixed: playSuccess instead of playBeep)
                if (window.AudioCore) AudioCore.playSuccess();

                // 🔔 Toast Notification (Visual Signal)
                if (window.UI) {
                    UI.notify('success', `📡 مزامنة سحابية: تم رصد مسح لـ ${scan?.name || 'مستخدم'}`);
                }
                
                // Force a hard refresh
                setTimeout(() => this.render(), 500);
            });
        }

        // 🏎️ Real-Time Tab Sync (v8.2)
        if (window.BroadcastChannel) {
            const bc = new BroadcastChannel('edumaster_sync');
            bc.onmessage = (ev) => {
                if (['CLOUD_SCAN_RECEIVED', 'STUDENT_ADDED', 'STUDENT_UPDATED'].includes(ev.data.type)) {
                    console.log("🚀 Tab Sync Refreshing Logs...");
                    this.render();
                }
            };
        }

        // View toggle button
        const toggleBtn = document.getElementById('view-toggle-btn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.viewMode = this.viewMode === 'grouped' ? 'detailed' : 'grouped';
                toggleBtn.innerHTML = this.viewMode === 'grouped'
                    ? '<i class="fa-solid fa-list"></i> عرض تفصيلي'
                    : '<i class="fa-solid fa-layer-group"></i> عرض مجمّع';
                this.render();
            });
        }

        this.render();
    }

    async pullFromCloud() {
        if (!window.UI || !window.Cloud || !window.Cloud.pullTodayScans) return;
        
        UI.notify('info', 'جارٍ مزامنة البيانات من السحابة...');
        try {
            const scans = await window.Cloud.pullTodayScans();
            if (scans && scans.length > 0) {
                console.log(`📡 Recovering ${scans.length} scans from cloud...`);
                
                // Sort by time ascending so we don't mess up in/out order
                scans.sort((a,b) => (a.serverTimestamp || 0) - (b.serverTimestamp || 0));

                for (const scan of scans) {
                    await window.Cloud._handleCloudScan(scan);
                }
                
                this.render();
                UI.notify('success', `تم استرجاع ${scans.length} سجل من السحابة بنجاح ✅`);
            } else {
                UI.notify('warning', 'لا توجد سجلات سحابية متاحة حالياً');
            }
        } catch (err) {
            console.error(err);
            UI.notify('danger', 'فشل في الاتصال بالسحابة');
        }
    }

    resetToToday() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const today = `${year}-${month}-${day}`;
        
        this.dateInput.value = today;
        console.log("📅 Resetting to Today:", today);
        this.render();
        if (window.UI && window.UI.notify) window.UI.notify('info', 'تمت العودة لتاريخ اليوم');
    }

    // ─── Time Helpers ──────────────────────────────────────────
    // Convert Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩) to ASCII (0123456789)
    _toAsciiDigits(str) {
        return str.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    }

    _timeToMinutes(t) {
        if (!t || t === '--:--' || t === '--') return 0;
        const ascii = this._toAsciiDigits(t).trim();
        const parts = ascii.split(' ');
        const rawTime = parts[0];
        const modifier = (parts[1] || '').toUpperCase();
        let [hh, mm] = rawTime.split(':').map(Number);
        if (isNaN(hh)) hh = 0;
        if (isNaN(mm)) mm = 0;
        // Handle both Arabic (ص/م) and English (AM/PM)
        if ((modifier === 'PM' || modifier === 'م') && hh < 12) hh += 12;
        if ((modifier === 'AM' || modifier === 'ص') && hh === 12) hh = 0;
        return hh * 60 + (mm || 0);
    }

    _calculateDuration(timeIn, timeOut) {
        if (!timeIn || !timeOut || timeIn === '--:--' || timeOut === '--:--') return '--:--';
        const mIn = this._timeToMinutes(timeIn);
        const mOut = this._timeToMinutes(timeOut);
        let diff = mOut - mIn;
        if (diff < 0) diff += 24 * 60; // handle overnight
        const hours = Math.floor(diff / 60);
        const mins = diff % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }

    _getGroupName(gid) {
        const groups = Storage.get('study_groups') || [];
        return groups.find(g => String(g.id) === String(gid))?.name || 'مجموعة';
    }

    // ─── Data Collection ───────────────────────────────────────
    _collectRawEvents(dateKey) {
        const students = Storage.get('students') || [];
        const trainers = Storage.get('trainers') || [];
        const users = Storage.get('users') || [];
        const activeBranch = window.Permissions?.getActiveBranchId();
        const events = [];

        // 1. Students
        const att = Storage.get('attendance') || {};
        Object.keys(att).forEach(key => {
            if (key.startsWith(dateKey)) {
                const groupParts = key.split('_');
                const gid = groupParts[1];
                const groupName = gid === 'global' ? 'حضور عام' : this._getGroupName(gid);

                Object.entries(att[key]).forEach(([sid, data]) => {
                    const student = students.find(s => String(s.id) === String(sid));
                    // 🛡️ Filter by Branch (Only if specific branch is selected)
                    if (activeBranch !== null && student && student.branch_id && String(student.branch_id) !== String(activeBranch)) return;
                    if (data.time) events.push({
                        id: sid,
                        time: data.time || '--:--',
                        name: student ? student.name : `طالب #${sid}`,
                        category: 'STUDENT',
                        status: `حضور (${groupName})`,
                        code: student ? student.code : '--',
                        meta: { storageKey: key, userId: sid }
                    });
                    if (data.out) events.push({
                        id: sid,
                        time: data.out,
                        name: student ? student.name : `طالب #${sid}`,
                        category: 'STUDENT',
                        status: `انصراف (${groupName})`,
                        code: student ? student.code : '--',
                        meta: { storageKey: key, userId: sid }
                    });
                });
            }
        });

        // 2. Employees
        const eLogs = Storage.get('employee_logs') || {};
        if (eLogs[dateKey]) {
            Object.entries(eLogs[dateKey]).forEach(([uid, data]) => {
                const user = users.find(u => String(u.id) === String(uid));
                // 🛡️ Filter by Branch
                if (activeBranch !== null && user && user.branch_id && String(user.branch_id) !== String(activeBranch)) return;
                const displayName = data.name || user?.name || uid;
                const displayCat = data.type || 'EMPLOYEE';
                if (data.in) events.push({ id: uid, time: data.in, name: displayName, category: displayCat, status: 'تسجيل دخول (وردية)', code: user?.code || '--', gps: data.gpsIn, meta: { storageKey: 'employee_logs', date: dateKey, userId: uid } });
                if (data.out) events.push({ id: uid, time: data.out, name: displayName, category: displayCat, status: 'تسجيل خروج (وردية)', code: user?.code || '--', gps: data.gpsOut, meta: { storageKey: 'employee_logs', date: dateKey, userId: uid } });
            });
        }

        // 3. Trainers
        const tLogs = Storage.get('trainer_logs') || {};
        if (tLogs[dateKey]) {
            Object.entries(tLogs[dateKey]).forEach(([tid, data]) => {
                const tr = trainers.find(t => String(t.id) === String(tid));
                // 🛡️ Filter by Branch
                if (activeBranch !== null && tr && tr.branch_id && String(tr.branch_id) !== String(activeBranch)) return;
                const displayName = data.name || tr?.name || tid;
                const displayCat = data.type || 'TRAINER';
                if (data.in)  events.push({ id: tid, time: data.in,  name: displayName, category: displayCat, status: 'حضور محاضرات',   code: tr?.code || '--', gps: data.gpsIn, meta: { storageKey: 'trainer_logs', date: dateKey, userId: tid } });
                if (data.out) events.push({ id: tid, time: data.out, name: displayName, category: displayCat, status: 'انصراف محاضرات', code: tr?.code || '--', gps: data.gpsOut, meta: { storageKey: 'trainer_logs', date: dateKey, userId: tid } });
            });
        }

        return events;
    }

    // ─── Grouped Data (one row per person) ─────────────────────
    _buildGroupedData(dateKey) {
        const students = Storage.get('students') || [];
        const trainers = Storage.get('trainers') || [];
        const users = Storage.get('users') || [];
        const activeBranch = window.Permissions?.getActiveBranchId();
        const grouped = [];

        // 1. Employees
        const eLogs = Storage.get('employee_logs') || {};
        if (eLogs[dateKey]) {
            Object.entries(eLogs[dateKey]).forEach(([uid, data]) => {
                const user = users.find(u => String(u.id) === String(uid));
                // 🛡️ Filter by Branch
                if (activeBranch !== null && user && user.branch_id && String(user.branch_id) !== String(activeBranch)) return;
                grouped.push({
                    id: uid,
                    name: data.name || user?.name || uid,
                    category: data.type || 'EMPLOYEE',
                    code: user?.code || '--',
                    timeIn: data.in || '--:--',
                    timeOut: data.out || '--:--',
                    gpsIn: data.gpsIn,
                    gpsOut: data.gpsOut,
                    duration: this._calculateDuration(data.in, data.out),
                    status: data.out ? 'انتهت الوردية' : 'في الخدمة',
                    meta: { storageKey: 'employee_logs', date: dateKey, userId: uid }
                });
            });
        }

        // 2. Trainers
        const tLogs = Storage.get('trainer_logs') || {};
        if (tLogs[dateKey]) {
            Object.entries(tLogs[dateKey]).forEach(([tid, data]) => {
                const tr = trainers.find(t => String(t.id) === String(tid));
                // 🛡️ Filter by Branch
                if (activeBranch !== null && tr && tr.branch_id && String(tr.branch_id) !== String(activeBranch)) return;
                grouped.push({
                    id: tid,
                    name: data.name || tr?.name || tid,
                    category: data.type || 'TRAINER',
                    code: tr?.code || '--',
                    timeIn: data.in || '--:--',
                    timeOut: data.out || '--:--',
                    gpsIn: data.gpsIn,
                    gpsOut: data.gpsOut,
                    duration: this._calculateDuration(data.in, data.out),
                    status: data.out ? 'انتهت المحاضرة' : 'في المحاضرة',
                    meta: { storageKey: 'trainer_logs', date: dateKey, userId: tid }
                });
            });
        }

        // 3. Students (no in/out concept — just attendance time)
        const att = Storage.get('attendance') || {};
        const studentMap = {}; // aggregate per student
        Object.keys(att).forEach(key => {
            if (key.startsWith(dateKey)) {
                const gid = key.split('_')[1];
                const groupName = gid === 'global' ? 'حضور عام' : this._getGroupName(gid);
                Object.entries(att[key]).forEach(([sid, data]) => {
                    if (!studentMap[sid]) {
                        const student = students.find(s => String(s.id) === String(sid));

                        // 🔄 v9.0 Cross-type fix: check if this ID is actually a trainer or employee
                        const trainer = !student ? trainers.find(t => String(t.id) === String(sid)) : null;
                        const user    = !student && !trainer ? users.find(u => String(u.id) === String(sid)) : null;

                        if (trainer) {
                            // Mis-logged trainer – move to trainer bucket
                            grouped.push({
                                id: sid,
                                name: data.name || trainer.name || sid,
                                category: 'TRAINER',
                                code: trainer.code || '--',
                                timeIn: data.time || '--:--',
                                timeOut: data.out || '--',
                                duration: this._calculateDuration(data.time, data.out),
                                status: 'حضور',
                                meta: { storageKey: key, userId: sid }
                            });
                        } else if (user) {
                            // Mis-logged employee – move to employee bucket
                            grouped.push({
                                id: sid,
                                name: data.name || user.name || sid,
                                category: 'EMPLOYEE',
                                code: user.code || '--',
                                timeIn: data.time || '--:--',
                                timeOut: data.out || '--',
                                duration: this._calculateDuration(data.time, data.out),
                                status: 'حضور',
                                meta: { storageKey: key, userId: sid }
                            });
                        } else {
                            studentMap[sid] = {
                                id: sid,
                                name: student ? student.name : (data.name || `طالب #${sid}`),
                                category: 'STUDENT',
                                code: student ? student.code : '--',
                                timeIn: data.time || '--:--',
                                timeOut: data.out || '--',
                                duration: this._calculateDuration(data.time, data.out),
                                status: `حاضر (${groupName})`,
                                groups: [groupName],
                                meta: { storageKey: key, userId: sid }
                            };
                        }
                    } else {
                        studentMap[sid].groups.push(groupName);
                        studentMap[sid].status = `حاضر (${studentMap[sid].groups.join(' + ')})`;
                    }
                });
            }
        });
        Object.values(studentMap).forEach(s => grouped.push(s));

        return grouped;
    }

    // ─── Dynamic Sorting ────────────────────────────────────────
    _sortData(items) {
        const { column, direction } = this.currentSort;
        const dir = direction === 'asc' ? 1 : -1;

        items.sort((a, b) => {
            let valA, valB;

            switch (column) {
                case 'date':
                    return 0; // All same date, no-op
                case 'name':
                    valA = (a.name || '').trim();
                    valB = (b.name || '').trim();
                    return dir * valA.localeCompare(valB, 'ar');
                case 'category':
                    const catOrder = { EMPLOYEE: 0, TRAINER: 1, STUDENT: 2 };
                    valA = catOrder[a.category] ?? 3;
                    valB = catOrder[b.category] ?? 3;
                    return dir * (valA - valB);
                case 'timeIn':
                    valA = this._timeToMinutes(a.timeIn);
                    valB = this._timeToMinutes(b.timeIn);
                    return dir * (valA - valB);
                case 'timeOut':
                    valA = this._timeToMinutes(a.timeOut);
                    valB = this._timeToMinutes(b.timeOut);
                    return dir * (valA - valB);
                case 'duration':
                    valA = this._durationToMinutes(a.duration);
                    valB = this._durationToMinutes(b.duration);
                    return dir * (valA - valB);
                case 'status':
                    valA = (a.status || '').trim();
                    valB = (b.status || '').trim();
                    return dir * valA.localeCompare(valB, 'ar');
                default:
                    return 0;
            }
        });
    }

    _durationToMinutes(d) {
        if (!d || d === '--:--' || d === '--') return -1;
        const [hh, mm] = d.split(':').map(Number);
        if (isNaN(hh) || isNaN(mm)) return -1;
        return hh * 60 + mm;
    }

    // ─── Render ────────────────────────────────────────────────
    render() {
        const dateKey = this.dateInput.value;
        if (!dateKey) {
            this.tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 50px;">يرجى اختيار تاريخ...</td></tr>';
            return;
        }

        // Update table headers based on view mode
        const thead = document.querySelector('#logs-thead');
        if (thead) {
            if (this.viewMode === 'grouped') {
                const cols = [
                    { key: 'date',     label: 'التاريخ' },
                    { key: 'name',     label: 'الاسم' },
                    { key: 'category', label: 'الفئة' },
                    { key: 'timeIn',   label: 'وقت الحضور' },
                    { key: 'timeOut',  label: 'وقت الانصراف' },
                    { key: 'duration', label: 'المدة' },
                    { key: 'status',   label: 'الحالة' },
                    { key: null,       label: 'تحكم' }
                ];
                const tr = document.createElement('tr');
                cols.forEach(col => {
                    const th = document.createElement('th');
                    th.textContent = col.label;
                    if (col.key) {
                        th.style.cursor = 'pointer';
                        th.style.userSelect = 'none';
                        th.style.transition = 'color 0.2s';
                        if (this.currentSort.column === col.key) {
                            th.innerHTML = `${col.label} <span style="font-size:0.7rem;margin-right:4px;">${this.currentSort.direction === 'asc' ? '▲' : '▼'}</span>`;
                            th.style.color = 'var(--accent-teal)';
                        }
                        th.addEventListener('click', () => {
                            if (this.currentSort.column === col.key) {
                                this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
                            } else {
                                this.currentSort = { column: col.key, direction: 'asc' };
                            }
                            this.render();
                        });
                    }
                    tr.appendChild(th);
                });
                thead.innerHTML = '';
                thead.appendChild(tr);
            } else {
                thead.innerHTML = `<tr>
                    <th>الوقت</th>
                    <th>الاسم</th>
                    <th>الفئة</th>
                    <th>الحالة</th>
                    <th>كود المسح</th>
                    <th>تحكم</th>
                </tr>`;
            }
        }

        if (this.viewMode === 'grouped') {
            const grouped = this._buildGroupedData(dateKey);
            this._sortData(grouped);
            this._renderGrouped(grouped);
        } else {
            const events = this._collectRawEvents(dateKey);
            events.sort((a, b) => this._timeToMinutes(b.time) - this._timeToMinutes(a.time));
            this._renderDetailed(events);
        }
    }

    // ─── Grouped UI ────────────────────────────────────────────
    _renderGrouped(items) {
        this.tbody.innerHTML = '';
        let sCount = 0, tCount = 0, eCount = 0;

        // Format selected date for display
        const dateKey = this.dateInput.value;
        const formattedDate = dateKey ? new Date(dateKey + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '--';

        if (items.length === 0) {
            this.tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 50px; color: var(--text-muted);">لا توجد عمليات مسجلة لهذا التاريخ</td></tr>';
        } else {
            items.forEach(item => {
                if (item.category === 'STUDENT') sCount++;
                else if (item.category === 'TRAINER') tCount++;
                else if (item.category === 'EMPLOYEE') eCount++;

                const isComplete = item.timeOut && item.timeOut !== '--:--' && item.timeOut !== '--';
                const durationColor = item.duration !== '--:--' && item.duration !== '--' ? '#3b82f6' : 'var(--text-muted)';
                const statusColor = isComplete ? '#10B981' : '#f59e0b';
                const statusBg = isComplete ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)';
                const statusIcon = isComplete ? 'fa-circle-check' : 'fa-clock';
                const borderLeft = item.category === 'STUDENT' ? '4px solid #3b82f6' : (item.category === 'TRAINER' ? '4px solid #10b981' : '4px solid #f59e0b');

                const mapIconIn = item.gpsIn && item.gpsIn.lat ? `<a href="https://maps.google.com/?q=${item.gpsIn.lat},${item.gpsIn.lng}" target="_blank" style="color:#3b82f6; margin-right:6px;" title="عرض الموقع الممسوح" onclick="event.stopPropagation()"><i class="fa-solid fa-map-location-dot"></i></a>` : '';
                const mapIconOut = item.gpsOut && item.gpsOut.lat ? `<a href="https://maps.google.com/?q=${item.gpsOut.lat},${item.gpsOut.lng}" target="_blank" style="color:#3b82f6; margin-right:6px;" title="عرض الموقع الممسوح" onclick="event.stopPropagation()"><i class="fa-solid fa-map-location-dot"></i></a>` : '';

                const tr = document.createElement('tr');
                tr.style.cssText = `border-right: ${borderLeft};`;
                tr.innerHTML = `
                    <td style="font-weight: 700; font-size: 0.85rem; color: var(--text-muted); white-space: nowrap;"><i class="fa-solid fa-calendar-day" style="margin-left:4px; font-size:0.75rem;"></i>${formattedDate}</td>
                    <td style="font-weight: 800;">${item.name}</td>
                    <td><span class="type-pill ${item.category === 'STUDENT' ? 'type-student' : (item.category === 'TRAINER' ? 'type-trainer' : 'type-employee')}">${item.category === 'STUDENT' ? 'طالب' : (item.category === 'TRAINER' ? 'محاضر' : 'موظف')}</span></td>
                    <td style="font-weight: 800; color: #10B981;"><i class="fa-solid fa-arrow-right-to-bracket" style="font-size:0.8rem; margin-left:5px;"></i>${item.timeIn} ${mapIconIn}</td>
                    <td style="font-weight: 800; color: ${isComplete ? '#EF4444' : 'var(--text-muted)'};">${isComplete ? '<i class="fa-solid fa-arrow-right-from-bracket" style="font-size:0.8rem; margin-left:5px;"></i>' + item.timeOut + mapIconOut : '<span style="opacity:0.5">لم يسجل بعد</span>'}</td>
                    <td>
                        <span style="
                            display: inline-flex; align-items: center; gap: 6px;
                            background: ${item.duration !== '--:--' && item.duration !== '--' ? 'rgba(59,130,246,0.12)' : 'transparent'};
                            color: ${durationColor};
                            padding: 4px 14px; border-radius: 20px;
                            font-weight: 900; font-size: 1rem;
                            font-family: 'Courier New', monospace;
                            border: 1px solid ${item.duration !== '--:--' && item.duration !== '--' ? 'rgba(59,130,246,0.3)' : 'transparent'};
                        ">
                            ${item.duration !== '--:--' && item.duration !== '--' ? '<i class="fa-solid fa-stopwatch" style="font-size:0.8rem;"></i>' : ''}
                            ${item.duration !== '--' ? item.duration : '--'}
                        </span>
                    </td>
                    <td>
                        <span style="
                            display: inline-flex; align-items: center; gap: 6px;
                            background: ${statusBg}; color: ${statusColor};
                            padding: 4px 12px; border-radius: 20px;
                            font-weight: 800; font-size: 0.85rem;
                            border: 1px solid ${statusColor}33;
                        ">
                            <i class="fa-solid ${statusIcon}" style="font-size:0.8rem;"></i>
                            ${item.status}
                        </span>
                    </td>
                    <td>
                        <div style="display: flex; gap: 5px;">
                            <button class="app-btn-success" style="padding: 6px 10px; font-size: 0.85rem; border-radius: 8px; background: rgba(37, 211, 102, 0.1); color: #25d366; border: 1px solid rgba(37, 211, 102, 0.2);"
                                title="إرسال تقرير واتساب"
                                onclick="window.AttendanceLogs.sendWhatsAppReport(${JSON.stringify(item).replace(/"/g, '&quot;')})">
                                <i class="fa-brands fa-whatsapp"></i>
                            </button>
                            <button class="app-btn-danger" style="padding: 6px 10px; font-size: 0.85rem; border-radius: 8px; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2);"
                                title="حذف نهائي للسجل"
                                onclick="window.AttendanceLogs.handleDelete('${item.name}', ${JSON.stringify(item.meta).replace(/"/g, '&quot;')})">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                `;
                this.tbody.appendChild(tr);
            });
        }
        document.getElementById('count-students').textContent = sCount;
        document.getElementById('count-trainers').textContent = tCount;
        document.getElementById('count-employees').textContent = eCount;
    }

    // ─── Detailed UI (original view) ───────────────────────────
    _renderDetailed(events) {
        this.tbody.innerHTML = '';
        let sCount = 0, tCount = 0, eCount = 0;

        if (events.length === 0) {
            this.tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 50px; color: var(--text-muted);">لا توجد عمليات مسجلة لهذا التاريخ</td></tr>';
        } else {
            events.forEach(ev => {
                if (ev.category === 'STUDENT') sCount++;
                else if (ev.category === 'TRAINER') tCount++;
                else if (ev.category === 'EMPLOYEE') eCount++;

                const isCheckOut = ev.status.includes('انصراف') || ev.status.includes('خروج');
                const rowColor    = isCheckOut ? 'rgba(239,68,68,0.06)'   : 'rgba(16,185,129,0.06)';
                const statusColor = isCheckOut ? '#EF4444'                : '#10B981';
                const statusBg    = isCheckOut ? 'rgba(239,68,68,0.12)'   : 'rgba(16,185,129,0.12)';
                const statusIcon  = isCheckOut ? 'fa-arrow-right-from-bracket' : 'fa-arrow-right-to-bracket';
                const borderLeft  = isCheckOut ? '4px solid #EF4444'      : '4px solid #10B981';

                const mapIcon = ev.gps && ev.gps.lat ? `<a href="https://maps.google.com/?q=${ev.gps.lat},${ev.gps.lng}" target="_blank" style="color:#3b82f6; margin-right:6px;" title="عرض الموقع الممسوح" onclick="event.stopPropagation()"><i class="fa-solid fa-map-location-dot"></i></a>` : '';

                const tr = document.createElement('tr');
                tr.style.cssText = `background: ${rowColor}; border-right: ${borderLeft};`;
                tr.innerHTML = `
                    <td style="font-weight: 800; color: var(--accent-teal);">${ev.time} ${mapIcon}</td>
                    <td style="font-weight: 700;">${ev.name}</td>
                    <td><span class="type-pill ${ev.category==='STUDENT'?'type-student':(ev.category==='TRAINER'?'type-trainer':'type-employee')}">${ev.category==='STUDENT'?'طالب':(ev.category==='TRAINER'?'محاضر':'موظف')}</span></td>
                    <td>
                        <span style="
                            display: inline-flex; align-items: center; gap: 6px;
                            background: ${statusBg}; color: ${statusColor};
                            padding: 4px 12px; border-radius: 20px;
                            font-weight: 800; font-size: 0.85rem;
                            border: 1px solid ${statusColor}33;
                        ">
                            <i class="fa-solid ${statusIcon}" style="font-size:0.8rem;"></i>
                            ${ev.status}
                        </span>
                    </td>
                    <td style="font-family: monospace; font-size: 0.8rem; opacity: 0.7;">${ev.code}</td>
                    <td>
                        <div style="display: flex; gap: 5px;">
                            <button class="app-btn-success" style="padding: 6px 10px; font-size: 0.85rem; border-radius: 8px; background: rgba(37, 211, 102, 0.1); color: #25d366; border: 1px solid rgba(37, 211, 102, 0.2);"
                                title="إرسال تقرير واتساب"
                                onclick="window.AttendanceLogs.sendWhatsAppReport(${JSON.stringify(ev).replace(/"/g, '&quot;')})">
                                <i class="fa-brands fa-whatsapp"></i>
                            </button>
                            <button class="app-btn-danger" style="padding: 6px 10px; font-size: 0.85rem; border-radius: 8px; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2);" 
                                title="حذف نهائي للسجل"
                                onclick="window.AttendanceLogs.handleDelete('${ev.name}', ${JSON.stringify(ev.meta).replace(/"/g, '&quot;')})">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                `;
                this.tbody.appendChild(tr);
            });
        }

        document.getElementById('count-students').textContent = sCount;
        document.getElementById('count-trainers').textContent = tCount;
        document.getElementById('count-employees').textContent = eCount;
    }

    // ─── Delete Handler ────────────────────────────────────────
    handleDelete(name, meta) {
        if (!window.Modal) return;
        Modal.secureDelete(name, () => {
            const { storageKey, userId, date } = meta;
            
            if (storageKey === 'employee_logs' || storageKey === 'trainer_logs') {
                const logs = Storage.get(storageKey) || {};
                if (logs[date]) {
                    delete logs[date][userId];
                    Storage.save(storageKey, logs);
                }
            } else {
                const att = Storage.get('attendance') || {};
                if (att[storageKey]) {
                    delete att[storageKey][userId];
                    Storage.save('attendance', att);
                }
            }
            this.render();
            if (window.Toast) Toast.show('تم حذف السجل نهائياً', 'success');
        });
    }

    // ─── WhatsApp Report ─────────────────────────────────────────
    async sendWhatsAppReport(item) {
        const phone = this._findUserPhone(item.category, item.id);
        if (!phone) {
            if (window.Toast) Toast.show('لا يوجد رقم هاتف مسجل لهذا الشخص', 'warning');
            return;
        }

        const date = document.getElementById('log-date').value;
        const name = item.name;
        
        let msg = `📅 تقرير الحضور ليوم: ${date}\n👤 الاسم: ${name}\n`;
        
        if (item.timeIn && item.timeIn !== '--:--') {
            msg += `🕒 وقت الدخول: ${item.timeIn}\n`;
        }
        
        if (item.timeOut && item.timeOut !== '--:--' && item.timeOut !== '--') {
            msg += `🚪 وقت الانصراف: ${item.timeOut}\n`;
            if (item.duration && item.duration !== '--:--') {
                msg += `⏳ المدة الإجمالية: ${item.duration}\n`;
            }
        } else if (item.status) {
            msg += `📍 الحالة: ${item.status}\n`;
        }

        msg += `\nإدارة المركز - تم الإرسال آلياً`;

        if (window.WhatsApp && window.WhatsApp.send) {
            window.WhatsApp.send(phone, msg);
        } else {
            const cleanPhone = phone.replace(/\D/g, '');
            window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
        }
    }

    _findUserPhone(category, id) {
        let list = [];
        if (category === 'STUDENT') list = Storage.get('students') || [];
        else if (category === 'TRAINER') list = Storage.get('trainers') || [];
        else if (category === 'EMPLOYEE') list = Storage.get('users') || [];
        
        const user = list.find(u => String(u.id) === String(id));
        return user ? user.phone : null;
    }
}

// ─── Excel Export (Grouped + Duration) ─────────────────────────
window.exportToExcel = function() {
    const ctrl = window.AttendanceLogs;
    if (!ctrl) return;

    const dateKey = document.getElementById('log-date').value;
    const grouped = ctrl._buildGroupedData(dateKey);

    if (grouped.length === 0) {
        if (window.Toast) Toast.show('لا توجد بيانات للتصدير', 'warning');
        return;
    }

    // Build CSV with structured columns
    const formattedDate = new Date(dateKey + 'T00:00:00').toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
    let csv = ['"التاريخ","الاسم","الفئة","وقت الحضور","وقت الانصراف","المدة (ساعات)","الحالة"'];

    // Category labels
    const catLabel = { STUDENT: 'طالب', TRAINER: 'محاضر', EMPLOYEE: 'موظف' };

    // Sort: employees, trainers, students
    const order = { EMPLOYEE: 0, TRAINER: 1, STUDENT: 2 };
    grouped.sort((a, b) => order[a.category] - order[b.category]);

    let currentCategory = '';
    grouped.forEach(item => {
        // Add section separator in CSV
        if (item.category !== currentCategory) {
            currentCategory = item.category;
            csv.push(''); // empty row as separator
            csv.push(`"=== ${catLabel[item.category]} ===","","","","",""`);
        }

        const timeOut = item.timeOut === '--' || item.timeOut === '--:--' ? '' : item.timeOut;
        const duration = item.duration === '--' || item.duration === '--:--' ? '' : item.duration;

        csv.push([
            `"${formattedDate}"`,
            `"${item.name}"`,
            `"${catLabel[item.category]}"`,
            `"${item.timeIn}"`,
            `"${timeOut}"`,
            `"${duration}"`,
            `"${item.status}"`
        ].join(','));
    });

    // Add summary at the bottom
    const employees = grouped.filter(i => i.category === 'EMPLOYEE');
    const trainers = grouped.filter(i => i.category === 'TRAINER');
    const studentCount = grouped.filter(i => i.category === 'STUDENT').length;

    csv.push('');
    csv.push('"","","","","",""');
    csv.push(`"=== ملخص اليوم ===","","","","",""`);
    csv.push(`"عدد الموظفين","${employees.length}","","","",""`);
    csv.push(`"عدد المحاضرين","${trainers.length}","","","",""`);
    csv.push(`"عدد الطلاب","${studentCount}","","","",""`);

    // Calculate total hours for all categories
    const calcTotalMinutes = (items) => {
        let total = 0;
        items.forEach(i => {
            if (i.duration && i.duration !== '--:--' && i.duration !== '--') {
                const [hh, mm] = i.duration.split(':').map(Number);
                total += hh * 60 + mm;
            }
        });
        const h = Math.floor(total / 60);
        const m = total % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const allItems = grouped;
    csv.push(`"إجمالي الساعات لجميع الفئات","${calcTotalMinutes(allItems)}","","","",""`);

    const blob = new Blob(["\uFEFF" + csv.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `سجل_الحضور_${dateKey}.csv`;
    link.click();

    if (window.Toast) Toast.show('تم تصدير الملف بنجاح ✅', 'success');
};

window.addEventListener('load', () => { window.AttendanceLogs = new AttendanceLogsController(); });
