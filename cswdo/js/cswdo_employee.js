/* ==========================================================================
   CSWDO Pasig — EMPLOYEE PORTAL LOGIC
   Live API client for cswdo_employee_appointment_module.html. There is no
   mock data and no login screen: the officer identity comes from
   api/auth.php?action=me&scope=employee (explicit staff session when signed
   in, otherwise the demo officer auto-session), and every business decision
   (windows, lateness, capacity, queue order) is computed server-side and only
   mirrored here.
   ========================================================================== */
  'use strict';

  /* ==========================================================================
     CSWDO Employee Portal — live API client (no mock data).
     Data comes exclusively from api/appointments.php + api/auth.php;
     all business state is computed server-side (UI mirror pattern).
     ========================================================================== */

  const API = '../api/appointments.php';
  const AUTH = '../api/auth.php';

  let state = {
    signedIn: false,
    date: new Date().toISOString().slice(0, 10),
    dashboard: null,
    queue: [],
    capacities: []
  };

  // ------------------------------------------------------------------ fetch
  async function apiGet(action, params = {}) {
    const qs = new URLSearchParams({ action, ...params });
    const res = await fetch(`${API}?${qs}`, { credentials: 'same-origin' });
    return res.json();
  }

  async function apiPost(action, body = {}) {
    const res = await fetch(`${API}?action=${action}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.json();
  }

  // ------------------------------------------------------------------ session
  // No login screen: the officer identity is resolved by the API — an explicit
  // staff session (auth.php?action=staff_login) when one exists, otherwise the
  // demo officer auto-session. Both portals work side by side in one browser.
  async function initSession() {
    let me;
    try {
      const res = await fetch(`${AUTH}?action=me&scope=employee`, { credentials: 'same-origin' });
      me = await res.json();
    } catch (e) {
      showApiUnavailable();
      return;
    }
    if (!me.ok) { showApiUnavailable(me.message); return; }
    enterPortal(me.user);
  }

  // API down / no seeded officer: a single explanatory card instead of an empty
  // dashboard (no mock data, no silent failure).
  function showApiUnavailable(message) {
    state.signedIn = false;
    const shell = document.getElementById('portalContent');
    shell.classList.remove('hidden');
    shell.innerHTML =
      '<div class="max-w-lg mx-auto mt-16 bg-white p-8 rounded-xl border border-rose-200 shadow-sm text-center">' +
      '<h2 class="text-lg font-bold text-slate-900">Appointment API unavailable</h2>' +
      '<p class="text-sm text-slate-600 mt-2">' + escapeHtml(message || 'Cannot reach the CSWDO appointment API.') + '</p>' +
      '<p class="text-xs text-slate-500 mt-3">Start MariaDB and the PHP server, run seed/seed_demo.php, then reload this page.</p>' +
      '</div>';
  }

  function enterPortal(employee) {
    state.signedIn = true;
    document.getElementById('portalContent').classList.remove('hidden');
    document.getElementById('officerName').textContent = employee.full_name;
    document.getElementById('officerRole').textContent = `${employee.position} · ${employee.employee_number}`;
    document.getElementById('targetDate').value = state.date;
    document.getElementById('capacityMonthPicker').value = state.date.slice(0, 7);
    loadAll();
  }

  // ------------------------------------------------------------------ clock
  function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    const el = document.getElementById('liveClock');
    if (el) el.textContent = timeStr;
  }
  setInterval(updateClock, 1000);
  updateClock();

  // ------------------------------------------------------------------ loading
  async function loadAll(showToastFlag) {
    await Promise.all([loadDashboard(), loadQueue()]);
    await loadCapacities();
    if (showToastFlag === true) showToast('Records refreshed from cswdo_db.');
  }

  async function loadDashboard() {
    const data = await apiGet('dashboard', { date: state.date });
    if (!data.ok) return;
    state.dashboard = data;
    renderStats();
    renderAppointments();
  }

  async function loadQueue() {
    const data = await apiGet('queue', { date: state.date });
    if (!data.ok) return;
    state.queue = data.tickets;
    renderQueueBoard();
  }

  async function loadCapacities() {
    const month = document.getElementById('capacityMonthPicker').value || state.date.slice(0, 7);
    const [year, m] = month.split('-').map(Number);
    const data = await apiGet('capacities', { year, month: m });
    if (!data.ok) return;
    state.capacities = data.days;
    renderCapacityCalendar();
  }

  // ------------------------------------------------------------------ tabs
  function switchTab(tabId) {
    ['appointments', 'capacities', 'queue'].forEach((id) => {
      document.getElementById('view' + id.charAt(0).toUpperCase() + id.slice(1)).classList.add('hidden');
    });
    const navMap = { appointments: 'navAppointments', capacities: 'navCapacities', queue: 'navQueue' };
    Object.values(navMap).forEach((navId) => {
      document.getElementById(navId).className = 'px-4 py-2 text-sm font-semibold rounded-lg text-slate-600 hover:bg-slate-100 transition flex items-center gap-2';
    });
    document.getElementById('view' + tabId.charAt(0).toUpperCase() + tabId.slice(1)).classList.remove('hidden');
    document.getElementById(navMap[tabId]).className = 'px-4 py-2 text-sm font-semibold rounded-lg bg-blue-50 text-blue-700 transition flex items-center gap-2';
    if (tabId === 'capacities') loadCapacities();
    if (tabId === 'queue') loadQueue();
  }

  // ------------------------------------------------------------------ stats
  function renderStats() {
    const d = state.dashboard;
    if (!d) return;
    document.getElementById('statTotalToday').textContent = d.total;
    document.getElementById('statCheckedIn').textContent = d.summary.checked_in;
    document.getElementById('statLate').textContent = d.summary.late;
    const am = d.slots.AM, pm = d.slots.PM;
    document.getElementById('statSplit').textContent = `AM: ${d.summary.scheduled} | PM: ${d.summary.scheduled}`;
    document.getElementById('statSplit').textContent =
      `AM: ${am ? am.booked_slots : 0} | PM: ${pm ? pm.booked_slots : 0}`;
    document.getElementById('statSlots').textContent =
      `${(am ? am.remaining : 0) + (pm ? pm.remaining : 0)} / ${((am ? am.max_slots : 30) + (pm ? pm.max_slots : 30))}`;
  }

  // ------------------------------------------------------------------ table
  function statusBadge(status) {
    const map = {
      SCHEDULED:  ['badge-scheduled', 'Scheduled'],
      CHECKED_IN: ['badge-checked-in', 'Checked In'],
      LATE:       ['badge-late', 'Late / Re-queue'],
      CANCELLED:  ['badge-cancelled', 'Cancelled'],
      RESCHEDULED:['badge-rescheduled', 'Rescheduled']
    };
    const [cls, label] = map[status] || ['badge-completed', status];
    return `<span class="badge-state ${cls}">${label}</span>`;
  }

  function queueStateBadge(qs) {
    const map = {
      WAITING:  ['badge-waiting', 'Waiting'],
      CALLED:   ['badge-called', 'Called'],
      SERVING:  ['badge-serving', 'Serving'],
      COMPLETED:['badge-completed', 'Served'],
      NO_SHOW:  ['badge-no-show', 'Invalidated']
    };
    const [cls, label] = map[qs] || ['badge-completed', qs || ''];
    return `<span class="badge-state ${cls}">${label}</span>`;
  }

  function renderAppointments() {
    const d = state.dashboard;
    const tbody = document.getElementById('appointmentsTableBody');
    const empty = document.getElementById('emptyAppointmentsState');
    if (!d) return;
    tbody.innerHTML = '';

    const searchVal = document.getElementById('searchInput').value.toLowerCase();
    const sessionVal = document.getElementById('filterSession').value;
    const statusVal = document.getElementById('filterStatus').value;

    const filtered = d.appointments.filter((a) => {
      const hay = `${a.control_number} ${a.client_name} ${a.assistance_type}`.toLowerCase();
      return hay.includes(searchVal)
        && (sessionVal === 'ALL' || a.schedule.time_window === sessionVal)
        && (statusVal === 'ALL' || a.appointment_status === statusVal);
    });

    empty.classList.toggle('hidden', filtered.length > 0);

    filtered.forEach((a) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 transition fade-in';const ticket = a.queue_number
          ? `<span class="badge-ticket">${a.queue_number}</span>
             ${a.queue_invalidated > 0 ? `<span class="ml-1 text-[11px] text-rose-500">${a.queue_invalidated} invalidated</span>` : ''}`
          : '<span class="text-xs text-slate-400 italic">Not checked in</span>';
      const cancelGuard = ['CHECKED_IN'].includes(a.appointment_status) ? 'disabled title="A checked-in client must be served through the queue"' : '';
      tr.innerHTML = `
        <td class="py-3 px-4">
          <div class="font-bold text-slate-900 mono-num">${a.control_number}</div>
          <div class="text-xs text-slate-600 font-medium">${escapeHtml(a.client_name)}</div>
          <div class="text-[11px] text-slate-400">${escapeHtml(a.contact_number || '')}</div>
        </td>
        <td class="py-3 px-4 text-slate-700 font-medium">${escapeHtml(a.assistance_type)}</td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-700 mono-num">${a.schedule.time_window} Session</span>
          <div class="text-xs text-slate-500 mt-0.5">${a.schedule.schedule_date}</div>
          <div class="text-[11px] ${a.schedule.state === 'OPEN' ? 'text-emerald-600' : 'text-slate-400'}">${a.schedule.state}</div>
        </td>
        <td class="py-3 px-4">${statusBadge(a.appointment_status)}</td>
        <td class="py-3 px-4">${ticket}</td>
        <td class="py-3 px-4 text-right space-x-2">
          <button onclick="openAppDetails(${a.appointment_id})" class="px-2.5 py-1 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded transition">Manage</button>
          ${a.appointment_status === 'LATE' ? `<button onclick="requeueRow('${a.control_number}')" class="px-2.5 py-1 text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded transition">Re-queue</button>` : ''}
          ${['SCHEDULED', 'RESCHEDULED', 'LATE'].includes(a.appointment_status) ? `<button onclick="cancelRow(${a.appointment_id})" ${cancelGuard} class="px-2.5 py-1 text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 rounded transition">Cancel</button>` : ''}
        </td>`;
      tbody.appendChild(tr);
    });
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ------------------------------------------------------------------ capacities
  function renderCapacityCalendar() {
    const container = document.getElementById('capacityCardsContainer');
    container.innerHTML = '';
    if (!state.capacities.length) {
      container.innerHTML = '<p class="text-sm text-slate-500 col-span-full text-center py-8">No session rows for this month yet — they are created on first booking.</p>';
      return;
    }
    state.capacities.forEach((day) => {
      ['AM', 'PM'].forEach((w) => {
        const s = day.sessions[w];
        if (!s) return;
        const pct = Math.round((s.booked_slots / s.max_slots) * 100);
        const full = s.booked_slots >= s.max_slots;
        const barColor = s.is_locked ? 'is-locked' : full ? 'is-full' : pct >= 80 ? 'is-almost' : (w === 'AM' ? 'is-am' : 'is-pm');
        const div = document.createElement('div');
        div.className = 'bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3';
        div.innerHTML = `
          <div class="flex items-center justify-between border-b pb-2">
            <span class="font-bold text-slate-900 mono-num text-sm">${day.date} · ${w}</span>
            <span class="text-xs font-semibold px-2 py-0.5 rounded ${s.is_locked ? 'bg-slate-200 text-slate-600' : full ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}">
              ${s.is_locked ? 'Locked' : full ? 'Fully Booked' : 'Open'}
            </span>
          </div>
          <div class="space-y-2 text-xs">
            <div class="flex justify-between">
              <span class="text-slate-600 font-medium">${w} Session (${w === 'AM' ? '8:00 - 12:00' : '12:00 - 17:00'})</span>
              <span class="mono-num font-bold text-slate-800">${s.booked_slots} / ${s.max_slots}</span>
            </div><div class="capacity-bar">
                <div class="capacity-fill ${barColor}" style="width: ${pct}%"></div>
              </div>
            <div class="text-[11px] text-slate-400">State: ${s.state}</div>
          </div>
          <div class="pt-2 flex justify-end">
            <button onclick="toggleLock(${s.schedule_id})" class="px-3 py-1 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded transition">
              ${s.is_locked ? 'Unlock Session' : 'Lock / Close'}
            </button>
          </div>`;
        container.appendChild(div);
      });
    });
  }

  async function toggleLock(scheduleId) {
    const data = await apiPost('toggle_lock', { schedule_id: scheduleId });
    showToast(data.ok ? data.message : data.message, data.ok ? 'success' : 'error');
    if (data.ok) { await loadCapacities(); await loadDashboard(); }
  }

  // ------------------------------------------------------------------ queue board
  function queueItem(t) {
    const serving = ['WAITING', 'CALLED', 'SERVING'].includes(t.queue_status);const eol = t.end_of_line && serving
        ? '<span class="badge-end-of-line ml-1.5">End of line</span>'
        : '';
    const btn = serving
      ? `<button onclick="serveTicket(${t.queue_id})" class="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition">Call &amp; Serve</button>`
      : queueStateBadge(t.queue_status);
    return `
      <div class="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 shadow-sm fade-in">
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-slate-900 mono-num">${t.queue_number}</span>
            <span class="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">${t.queue_type.replace(/_/g, ' ')}</span>
            ${eol}
          </div>
          <p class="text-xs text-slate-700 font-medium mt-0.5">${escapeHtml(t.client_name)} (${t.control_number})</p>
        </div>
        ${btn}
      </div>`;
  }

  function renderQueueBoard() {
    const am = document.getElementById('amQueueList');
    const pm = document.getElementById('pmQueueList');
    am.innerHTML = '';
    pm.innerHTML = '';
    const active = state.queue.filter((t) => t.queue_status !== 'NO_SHOW');
    const amItems = active.filter((t) => t.time_window === 'AM');
    const pmItems = active.filter((t) => t.time_window === 'PM');
    am.innerHTML = amItems.length ? amItems.map(queueItem).join('') : '<p class="text-xs text-slate-400 italic text-center py-4">No AM queue tickets.</p>';
    pm.innerHTML = pmItems.length ? pmItems.map(queueItem).join('') : '<p class="text-xs text-slate-400 italic text-center py-4">No PM queue tickets.</p>';
  }

  async function serveTicket(queueId) {
    const data = await apiPost('serve', { queue_id: queueId });
    showToast(data.message, data.ok ? 'success' : 'error');
    if (data.ok) { await loadQueue(); await loadDashboard(); }
  }

  // ------------------------------------------------------------------ check-in terminal
  async function performEmployeeCheckin() {
    const control = document.getElementById('checkinControlNo').value.trim().toUpperCase();
    if (!control) { showToast('Please enter a control number.', 'error'); return; }
    const data = await apiPost('employee_checkin', { control_number: control });
    if (data.ok) {
      showToast(data.message, 'success');
      document.getElementById('checkinControlNo').value = '';
    } else if (data.error === 'already_late') {
      showToast('Client is already LATE — use Re-queue LATE instead.', 'error');
    } else {
      showToast(data.message, 'error');
    }
    await loadAll();
  }

  async function performEmployeeRequeue() {
    const control = document.getElementById('checkinControlNo').value.trim().toUpperCase();
    if (!control) { showToast('Please enter a control number.', 'error'); return; }
    const data = await apiPost('employee_requeue', { control_number: control });
    showToast(data.message, data.ok ? 'success' : 'error');
    if (data.ok) document.getElementById('checkinControlNo').value = '';
    await loadAll();
  }

  function requeueRow(control) {
    document.getElementById('checkinControlNo').value = control;
    switchTab('queue');
    performEmployeeRequeue();
  }

  // ------------------------------------------------------------------ row actions / modal
  function findRow(appointmentId) {
    return state.dashboard.appointments.find((a) => a.appointment_id === appointmentId);
  }

  function openAppDetails(appointmentId) {
    const a = findRow(appointmentId);
    if (!a) return;
    document.getElementById('modalTitle').textContent = `Appointment Details — ${a.control_number}`;
    document.getElementById('modalBody').innerHTML = `
      <div class="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div class="flex justify-between"><span class="text-slate-500">Client:</span> <strong>${escapeHtml(a.client_name)}</strong></div>
        <div class="flex justify-between"><span class="text-slate-500">Contact:</span> <span class="mono-num">${escapeHtml(a.contact_number || '—')}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Assistance:</span> <span>${escapeHtml(a.assistance_type)}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Schedule:</span> <span class="mono-num font-semibold text-blue-700">${a.schedule.schedule_date} (${a.schedule.time_window})</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Status:</span> ${statusBadge(a.appointment_status)}</div>
        <div class="flex justify-between"><span class="text-slate-500">Queue ticket:</span> <span class="mono-num font-bold text-emerald-600">${a.queue_number || 'None'}</span></div>
        ${a.queue_invalidated > 0 ? `<div class="flex justify-between"><span class="text-slate-500">Invalidated tickets:</span> <span class="text-rose-600 font-semibold">${a.queue_invalidated}</span></div>` : ''}
      </div>`;
    document.getElementById('modalFooter').innerHTML = `
      <button onclick="closeModal()" class="px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition">Close</button>
      ${!['CHECKED_IN', 'CANCELLED'].includes(a.appointment_status) ? `<button onclick="cancelRow(${a.appointment_id})" class="px-4 py-2 text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow transition">Cancel Appointment</button>` : ''}`;
    document.getElementById('actionModal').classList.remove('hidden');
  }

  async function cancelRow(appointmentId) {
    const a = findRow(appointmentId);
    if (!a) return;
    // The client-facing cancel endpoint is bound to the client session, so
    // the office path uses the same endpoint family via set_appointment_status.
    const data = await apiPost('set_appointment_status', { appointment_id: appointmentId, status: 'CANCELLED' });
    showToast(data.message, data.ok ? 'success' : 'error');
    closeModal();
    await loadAll();
  }

  function closeModal() {
    document.getElementById('actionModal').classList.add('hidden');
  }

  // ------------------------------------------------------------------ toast
  function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    document.getElementById('toastMessage').textContent = message;
    const icon = document.getElementById('toastIcon');
    icon.setAttribute('class', type === 'success' ? 'w-5 h-5 text-emerald-400' : 'w-5 h-5 text-amber-400');
    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    setTimeout(() => {
      toast.classList.remove('translate-y-0', 'opacity-100');
      toast.classList.add('translate-y-20', 'opacity-0');
    }, 3200);
  }

  // ------------------------------------------------------------------ boot
  initSession();
