/* ==========================================================================
   CSWDO PASIG — APPOINTMENT & SCHEDULING MODULE
   --------------------------------------------------------------------------
   Scope (this phase): Appointment & Scheduling only.
   Database schema: cswdo_db
     - schedule_capacities (schedule_id, schedule_date, time_window,
       max_slots, booked_slots, is_locked) -> drives calendar availability
     - applications (application_id, control_number, client_id,
       assistance_type_id, current_status) -> appointments link to these
     - appointments (appointment_id, application_id, schedule_id,
       appointment_status, created_at) -> lifecycle record
     - queues (queue_id, application_id, queue_number, queue_status)
       -> UI REPRESENTATION ONLY (queue screen is a separate module)

   BACKEND: all actions call the PHP appointment API (api/*.php) against the
   real MariaDB `cswdo_db`. The `mockDb` object doubles as the client-side
   mirror: live responses are synced into it so the rendering layer is
   unchanged. If the backend cannot be reached, the module falls back to the
   built-in mock flows and shows the demo-mode banner.
   ========================================================================== */

/* ==========================================================================
   1. CONFIGURATION
   ========================================================================== */

// Session windows map 1:1 to schedule_capacities.time_window values.
const sessionConfig = {
  AM: { startTime: "08:00", displayTime: "8:00 AM",  capacity: 30 },
  PM: { startTime: "12:00", displayTime: "12:00 PM", capacity: 30 }
};

const SESSION_START_MINUTES = { AM: 8 * 60, PM: 12 * 60 };  // 480 / 720
const SESSION_END_MINUTES = { AM: 12 * 60, PM: 17 * 60 };   // 720 / 1020 (auto-close)

// Check-in windows — mirror api/config.php (minutes since midnight):
//   AM: opens 07:30 (450), on-time until before 11:00 AM (660).
//   PM: opens 11:30 (690), on-time until before  5:00 PM (1020).
//   PM on-time end == PM session end: a check-in at/after 5:00 PM is LATE —
//   the operational day is over (no same-day re-queue, reschedule instead).
const CHECKIN_OPEN_MINUTES = { AM: 7 * 60 + 30, PM: 11 * 60 + 30 }; // 450 / 690
const SESSION_ONTIME_END_MINUTES = { AM: 11 * 60, PM: 17 * 60 };    // 660 / 1020

// A session is "Almost Full" when this percent of capacity is booked.
const ALMOST_FULL_PERCENT = 80;

// Live PHP backend (api/*.php served from the same origin).
const API_BASE = "../api";

// When the backend cannot be reached (MariaDB down, static hosting without
// PHP, …) fall back to the in-browser mock flows + demo-mode banner.
const OFFLINE_FALLBACK = true;

// appointments.appointment_status values (match the schema exactly).
const APPOINTMENT_STATUSES = {
  SCHEDULED:   "SCHEDULED",
  CHECKED_IN:  "CHECKED_IN",
  LATE:        "LATE",
  RESCHEDULED: "RESCHEDULED",
  CANCELLED:   "CANCELLED"
};

// Human labels + badge styles for appointment_status values.
const STATUS_LABELS = {
  SCHEDULED:   "Scheduled",
  CHECKED_IN:  "Checked In",
  LATE:        "Late",
  RESCHEDULED: "Rescheduled",
  CANCELLED:   "Cancelled"
};

const STATUS_BADGES = {
  SCHEDULED:   "badgeInfo",
  CHECKED_IN:  "badgeSuccess",
  LATE:        "badgeDanger",
  RESCHEDULED: "badgeWarning",
  CANCELLED:   "badgeNeutral"
};

// Human labels for applications.current_status (shown client-facing;
// booking/check-in/queue events never change this status — §16/§17).
const APPLICATION_STATUS_LABELS = {
  APPLICATION_SUBMITTED:    "Application Submitted",
  FOR_REVIEW:               "Under Review",
  REVIEWING:                "Reviewing",
  FOR_CORRECTION:           "For Correction",
  FOR_INTERVIEW:            "For Interview",
  INTERVIEW_IN_PROGRESS:    "Interview In Progress",
  INTERVIEW_COMPLETED:      "Interview Completed",
  STAFF_REPORT_READY:       "Staff Report Ready",
  FOR_ADMIN_REVIEW:         "For Admin Review",
  ADMIN_REVIEWING:          "Admin Reviewing",
  RETURNED_FOR_CORRECTION:  "Returned for Correction",
  APPROVED:                 "Approved",
  ASSISTANCE_PROCESSING:    "Assistance Processing",
  COMPLETED:                "Completed"
};

function applicationStatusLabel(status) {
  return APPLICATION_STATUS_LABELS[status] || status;
}

/* ==========================================================================
   2. PHILIPPINE HOLIDAYS (kept separate from scheduling logic)
   --------------------------------------------------------------------------
   Add future years here — nothing else changes.
   ========================================================================== */

const philippineHolidays = [
  // ----- 2026 -----
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-02-25", name: "EDSA People Power Anniversary" },
  { date: "2026-04-02", name: "Maundy Thursday" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-04-09", name: "Araw ng Kagitingan" },
  { date: "2026-05-01", name: "Labor Day" },
  { date: "2026-06-12", name: "Independence Day" },
  { date: "2026-08-21", name: "Ninoy Aquino Day" },
  { date: "2026-08-31", name: "National Heroes Day" },
  { date: "2026-11-01", name: "All Saints' Day" },
  { date: "2026-11-30", name: "Bonifacio Day" },
  { date: "2026-12-08", name: "Feast of the Immaculate Conception" },
  { date: "2026-12-24", name: "Christmas Eve" },
  { date: "2026-12-25", name: "Christmas Day" },
  { date: "2026-12-30", name: "Rizal Day" },
  { date: "2026-12-31", name: "Last Day of the Year" },

  // ----- 2027 -----
  { date: "2027-01-01", name: "New Year's Day" },
  { date: "2027-02-25", name: "EDSA People Power Anniversary" },
  { date: "2027-03-25", name: "Maundy Thursday" },
  { date: "2027-03-26", name: "Good Friday" },
  { date: "2027-04-09", name: "Araw ng Kagitingan" },
  { date: "2027-05-01", name: "Labor Day" },
  { date: "2027-06-12", name: "Independence Day" },
  { date: "2027-08-30", name: "National Heroes Day" },
  { date: "2027-11-01", name: "All Saints' Day" },
  { date: "2027-11-30", name: "Bonifacio Day" },
  { date: "2027-12-25", name: "Christmas Day" },
  { date: "2027-12-30", name: "Rizal Day" },
  { date: "2027-12-31", name: "Last Day of the Year" }
];

/* ==========================================================================
   3. MOCK DATABASE — mirrors cswdo_db tables
   --------------------------------------------------------------------------
   Field names match the dump exactly so swapping in a real API is trivial.
   ========================================================================== */

const mockDb = {
  // schedule_capacities: one row per (schedule_date, time_window)
  schedule_capacities: [],

  // applications (offline fallback only — mirrors the seeded cswdo_db rows)
  applications: [
    {
      application_id: 1,
      control_number: "OL-2026-0001",
      client_id: 1,
      assistance_type_id: 1,
      requested_output_type: "Direct Financial Assistance",
      application_type: "ONLINE",
      current_status: "FOR_REVIEW",
      submission_date: "2026-09-24 09:15:00"
    }
  ],

  // appointments
  appointments: [],

  // queues (UI representation only)
  queues: []
};

// Human-readable labels for assistance_type_id (references table stand-in).
const assistanceTypes = {
  1: "Medical Assistance",
  2: "Burial Assistance",
  3: "Educational Assistance",
  4: "Solo Parent Services",
  5: "PWD Welfare Services",
  6: "Senior Citizen Pension Intake"
};

/* ==========================================================================
   4. MODULE STATE
   ========================================================================== */

const appointmentState = {
  viewYear: null,
  viewMonth: null,
  selectedDate: null,
  selectedApplicationId: null,
  policyAcknowledged: false,
  rescheduleMode: false,
  offlineMode: false,
  session: null
};

/* ==========================================================================
   5. DATE & CALENDAR HELPERS
   ========================================================================== */

function formatDateKey(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const parts = dateKey.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function addDays(dateObj, days) {
  const copy = new Date(dateObj.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatDisplayDate(dateKey) {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  }).format(parseDateKey(dateKey));
}

function formatDisplayDateShort(dateKey) {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short", year: "numeric", month: "short", day: "numeric"
  }).format(parseDateKey(dateKey));
}

/* ==========================================================================
   6. HOLIDAY / WEEKEND / WORKING-DAY RULES
   ========================================================================== */

function isWeekend(dateObj) {
  const day = dateObj.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}

function getHolidayName(dateObj) {
  const key = formatDateKey(dateObj);
  const holiday = philippineHolidays.find((item) => item.date === key);
  return holiday ? holiday.name : null;
}

function isPhilippineHoliday(dateObj) {
  return getHolidayName(dateObj) !== null;
}

// TRUE only when the date is Monday-Friday AND not a Philippine holiday.
function isWorkingDay(dateObj) {
  return !isWeekend(dateObj) && !isPhilippineHoliday(dateObj);
}

function findNextWorkingDate(fromDate) {
  let candidate = fromDate ? new Date(fromDate.getTime()) : startOfToday();
  let guard = 0;
  while (!isWorkingDay(candidate) && guard < 400) {
    candidate = addDays(candidate, 1);
    guard += 1;
  }
  return candidate;
}

function isPastDate(dateObj) {
  return formatDateKey(dateObj) < formatDateKey(startOfToday());
}

/* ==========================================================================
   7. DATA ACCESS — LIVE API LAYER (PHP + cswdo_db) WITH MOCK FALLBACK
   --------------------------------------------------------------------------
   Every UI action goes through these functions. Live mode calls the PHP
   appointment API (api/*.php); responses are synced into the `mockDb`
   MIRROR below so the rendering layer keeps working unchanged. If the
   backend cannot be reached (MariaDB down, static hosting without PHP),
   the same functions fall back to in-browser mock flows and the demo-mode
   banner is shown once.
   ========================================================================== */

// ---- transport -----------------------------------------------------------

async function apiRequest(path, options = {}) {
  const config = { credentials: "same-origin", ...options };
  if (config.body && typeof config.body !== "string") {
    config.body = JSON.stringify(config.body);
    config.headers = { "Content-Type": "application/json", ...(config.headers || {}) };
  }

  let response;
  try {
    response = await fetch(path, config);
  } catch (networkError) {
    const error = new Error("Cannot reach the CSWDO appointment server.");
    error.isOffline = true;
    throw error;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    // e.g. a static file server returned an HTML 404 for /api/*.php
    const error = new Error("The CSWDO appointment API is not available at this address.");
    error.isOffline = true;
    throw error;
  }

  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || `Request failed (HTTP ${response.status}).`);
    error.status = response.status;
    error.code = payload.error || null;
    throw error;
  }
  return payload;
}

// Flips the page into demo mode once (banner + local seed data).
function enterOfflineMode() {
  if (appointmentState.offlineMode) return;
  appointmentState.offlineMode = true;
  seedScheduleData();
  if (dom.apiModeBanner) dom.apiModeBanner.hidden = false;
  showNotification("Backend offline — running in demo mode with local sample data.");
}

// Runs the live call; falls back to the mock twin only when the backend is
// unreachable (network error, non-JSON response) or clearly not set up (5xx).
async function withFallback(liveFn, mockFn) {
  if (appointmentState.offlineMode) return mockFn();
  try {
    return await liveFn();
  } catch (error) {
    if (OFFLINE_FALLBACK && (error.isOffline || (error.status && error.status >= 500))) {
      enterOfflineMode();
      return mockFn();
    }
    throw error;
  }
}

// ---- mirror sync (live responses → mockDb-shaped state) ------------------

function upsertBy(rows, key, row) {
  const index = rows.findIndex((r) => String(r[key]) === String(row[key]));
  if (index >= 0) rows[index] = { ...rows[index], ...row };
  else rows.push({ ...row });
}

function syncApplication(row) { upsertBy(mockDb.applications, "application_id", row); }
function syncAppointment(row) { upsertBy(mockDb.appointments, "appointment_id", row); }
function syncQueue(row) { upsertBy(mockDb.queues, "queue_id", row); }

// Schedule rows sync on the natural key (schedule_date, time_window) so the
// lazily-created demo rows are replaced by the server's authoritative row.
function syncScheduleRow(row) {
  const index = mockDb.schedule_capacities.findIndex(
    (r) => r.schedule_date === row.schedule_date && r.time_window === row.time_window
  );
  if (index >= 0) mockDb.schedule_capacities[index] = { ...mockDb.schedule_capacities[index], ...row };
  else mockDb.schedule_capacities.push({ ...row });
}

function syncScheduleDay(day) {
  if (!day || !day.sessions) return;
  ["AM", "PM"].forEach((timeWindow) => {
    const session = day.sessions[timeWindow];
    if (session && session.schedule_id) {
      syncScheduleRow({
        schedule_id: session.schedule_id,
        schedule_date: day.date,
        time_window: timeWindow,
        max_slots: session.max_slots,
        booked_slots: session.booked,
        is_locked: session.is_locked
      });
    }
  });
}

function nextId(rows, key) {
  return rows.reduce((max, row) => Math.max(max, Number(row[key]) || 0), 0) + 1;
}

// GET schedule rows for one date. Creates rows on demand (demo convenience).
function getScheduleRows(dateKey) {
  let rows = mockDb.schedule_capacities.filter((row) => row.schedule_date === dateKey);
  if (rows.length === 0) {
    ["AM", "PM"].forEach((timeWindow) => {
      rows.push({
        schedule_id: nextId(mockDb.schedule_capacities, "schedule_id"),
        schedule_date: dateKey,
        time_window: timeWindow,
        max_slots: sessionConfig[timeWindow].capacity,
        booked_slots: 0,
        is_locked: 0
      });
    });
    mockDb.schedule_capacities.push(...rows);
  }
  return rows;
}

// GET /api/auth.php?action=me — demo identity (auto-session until the real
// CSWDO login is connected).
async function fetchSession() {
  return withFallback(
    () => apiRequest(`${API_BASE}/auth.php?action=me`),
    () => ({
      user: { user_id: 0, username: "demo-client", full_name: "Demo Client", role: "CLIENT", client_id: 1 },
      test_mode: false
    })
  );
}

// GET /api/appointments.php?action=overview — application + appointment + queue.
async function fetchApplications() {
  return withFallback(
    async () => {
      const payload = await apiRequest(`${API_BASE}/appointments.php?action=overview`);
      if (payload.application) syncApplication(payload.application);
      if (payload.appointment) syncAppointment(payload.appointment);
      if (payload.queue) syncQueue(payload.queue);
      if (payload.schedule) syncScheduleRow(payload.schedule);
      return mockDb.applications.filter((app) => app.application_type === "ONLINE");
    },
    () => mockDb.applications.filter((app) => app.application_type === "ONLINE")
  );
}

// GET /api/appointments.php?action=schedules — one calendar month.
async function fetchMonthSchedules(year, month) {
  return withFallback(
    async () => {
      const monthKey = String(month + 1).padStart(2, "0");
      const payload = await apiRequest(`${API_BASE}/appointments.php?action=schedules&year=${year}&month=${monthKey}`);
      (payload.days || []).forEach(syncScheduleDay);
      const prefix = `${year}-${monthKey}`;
      return mockDb.schedule_capacities.filter((row) => row.schedule_date.startsWith(prefix));
    },
    () => {
      const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
      return mockDb.schedule_capacities.filter((row) => row.schedule_date.startsWith(prefix));
    }
  );
}

// Availability for one date, derived from the synced schedule_capacities rows.
// The 30-slot business rule is enforced here too (the dump default of 50 is
// never honored), and sessions auto-close after their end time (master §8).
function getSessionAvailability(dateKey, timeWindow) {
  const row = getScheduleRows(dateKey).find((r) => r.time_window === timeWindow);
  const config = sessionConfig[timeWindow];
  const capacity = Math.min(Number(row.max_slots) || 0, sessionConfig[timeWindow].capacity);
  const available = Math.max(0, capacity - row.booked_slots);
  const now = new Date();

  let status;
  if (row.is_locked) {
    status = "locked";
  } else if (isPastDate(parseDateKey(dateKey))) {
    status = "closed";
  } else if (dateKey === formatDateKey(now) && minutesSinceMidnight(now) >= SESSION_END_MINUTES[timeWindow]) {
    status = "closed";
  } else if (available === 0) {
    status = "full";
  } else if (row.booked_slots * 100 >= capacity * ALMOST_FULL_PERCENT) {
    status = "almostFull";
  } else {
    status = "available";
  }

  return {
    scheduleId: row.schedule_id,
    timeWindow,
    startTime: config.startTime,
    displayTime: config.displayTime,
    capacity,
    booked: row.booked_slots,
    available,
    isLocked: Boolean(row.is_locked),
    status
  };
}

function getAppointmentAvailability(dateKey) {
  return { AM: getSessionAvailability(dateKey, "AM"), PM: getSessionAvailability(dateKey, "PM") };
}

// POST /api/appointments.php?action=book — transaction-safe booking on the
// server (capacity lock, UNIQUE(application_id), rollback on any failure).
// The response contains NO queue number — that is issued only at check-in.
async function createAppointment(applicationId, dateKey, timeWindow) {
  return withFallback(
    async () => {
      const payload = await apiRequest(`${API_BASE}/appointments.php?action=book`, {
        method: "POST",
        body: { date: dateKey, window: timeWindow }
      });
      syncAppointment(payload.appointment);
      syncScheduleRow(payload.schedule);
      return { ...payload.appointment };
    },
    () => mockCreateAppointment(applicationId, dateKey, timeWindow)
  );
}

// POST /api/appointments.php?action=checkin — the server decides on-time vs
// LATE (and re-queue capacity); the client only routes the response.
async function checkInAppointmentRecord(appointment) {
  return withFallback(
    async () => {
      const payload = await apiRequest(`${API_BASE}/appointments.php?action=checkin`, { method: "POST" });
      syncAppointment(payload.appointment);
      if (payload.queue) syncQueue(payload.queue);
      if (payload.schedule) syncScheduleRow(payload.schedule);
      return payload;
    },
    () => mockCheckIn(appointment)
  );
}

// POST /api/appointments.php?action=late_requeue — AM→PM transfer + RQ-### at
// the tail, or the no-capacity / day-concluded refusal. target_window documents
// the AM→PM rollover intent (the server derives the target itself).
async function lateRequeueRecord(appointment) {
  return withFallback(
    async () => {
      const payload = await apiRequest(`${API_BASE}/appointments.php?action=late_requeue`, {
        method: "POST",
        body: { target_window: "PM" }
      });
      syncAppointment(payload.appointment);
      if (payload.queue) syncQueue(payload.queue);
      if (payload.schedule) syncScheduleRow(payload.schedule);
      return payload;
    },
    () => mockLateRequeue(appointment)
  );
}

// POST /api/appointments.php?action=reschedule — validate-then-mutate move.
async function rescheduleAppointmentRecord(appointmentId, newDateKey, newTimeWindow) {
  return withFallback(
    async () => {
      const payload = await apiRequest(`${API_BASE}/appointments.php?action=reschedule`, {
        method: "POST",
        body: { date: newDateKey, window: newTimeWindow }
      });
      syncAppointment(payload.appointment);
      syncScheduleRow(payload.schedule);
      return { ...payload.appointment };
    },
    () => mockRescheduleAppointmentRecord(appointmentId, newDateKey, newTimeWindow)
  );
}

// POST /api/appointments.php?action=cancel — releases the slot.
async function cancelAppointmentRecord(appointment) {
  return withFallback(
    async () => {
      const payload = await apiRequest(`${API_BASE}/appointments.php?action=cancel`, { method: "POST" });
      syncAppointment(payload.appointment);
      if (payload.schedule) syncScheduleRow(payload.schedule);
      return { ...payload.appointment };
    },
    () => mockCancelAppointment(appointment)
  );
}

/* ---- Mock twins (offline demo fallback — same rules, in-browser) -------- */

// cswdo_db enforces a UNIQUE key on appointments.application_id, so a
// cancelled appointment row is REUSED instead of inserting a duplicate.
function mockCreateAppointment(applicationId, dateKey, timeWindow) {
  const row = getScheduleRows(dateKey).find((r) => r.time_window === timeWindow);
  if (row.is_locked) throw new Error("This session is locked by the office and cannot be booked.");
  if (row.booked_slots >= row.max_slots) throw new Error("This time slot is already full. Please select another available session.");

  const existing = mockDb.appointments.find((a) => a.application_id === applicationId);
  if (existing && existing.appointment_status !== APPOINTMENT_STATUSES.CANCELLED) {
    throw new Error("This application already has an appointment.");
  }

  // Validate first, mutate last — a rejected booking must never consume a slot.
  row.booked_slots += 1;

  const appointment = {
    appointment_id: existing
      ? existing.appointment_id
      : nextId(mockDb.appointments, "appointment_id"),
    application_id: applicationId,
    schedule_id: row.schedule_id,
    appointment_status: APPOINTMENT_STATUSES.SCHEDULED,
    created_at: new Date().toISOString()
  };
  if (existing) {
    Object.assign(existing, appointment);
  } else {
    mockDb.appointments.push(appointment);
  }
  return { ...appointment };
}

function mockCheckIn(appointment) {
  const status = checkInStatus(appointment);
  const timeWindow = getTimeWindowForAppointment(appointment);
  const dateKey = getScheduleDateForAppointment(appointment);

  if (status === "upcoming") {
    throw new Error(`Check-in is not yet available. Please return at ${checkinOpensLabel(timeWindow)} for the ${timeWindow} session.`);
  }
  if (status === "cutoff") {
    throw new Error("This appointment session is already closed. Please select another available schedule.");
  }

  if (status === "late") {
    appointment.appointment_status = APPOINTMENT_STATUSES.LATE;
    if (timeWindow === "PM") {
      // Day concluded — same-day re-queue is impossible (mirror of the API's
      // must_reschedule_tomorrow response).
      return {
        late: true,
        can_requeue_pm: false,
        must_reschedule_tomorrow: true,
        message: "The office day has concluded. Your PM appointment cannot be re-queued today — please reschedule for the next available working day.",
        appointment: { ...appointment },
        queue: null
      };
    }
    const pmAvailability = getSessionAvailability(dateKey, "PM");
    return {
      late: true,
      can_requeue_pm: true,
      pm_has_capacity: pmAvailability.available > 0,
      pm_remaining: pmAvailability.available,
      suggest_reschedule: true,
      message: "You have been marked as late. Your AM appointment may be re-queued into the same-day PM session (end of the queue) while capacity remains, or rescheduled.",
      appointment: { ...appointment },
      queue: null
    };
  }

  appointment.appointment_status = APPOINTMENT_STATUSES.CHECKED_IN;
  const queue = mockCreateQueueEntry(appointment.application_id, "ONLINE_VERIFICATION", dateKey, timeWindow);
  return { late: false, appointment: { ...appointment }, queue: { ...queue } };
}

// AM-late → transfer into the SAME-DAY PM session: release the AM slot, take a
// PM slot, invalidate the old OV ticket(s) (NO_SHOW) and append a new RQ-###
// strictly at the tail of the PM queue. Control number / application untouched.
function mockLateRequeue(appointment) {
  const dateKey = getScheduleDateForAppointment(appointment);
  const timeWindow = getTimeWindowForAppointment(appointment);

  if (timeWindow === "PM") {
    throw new Error("The office day has concluded and same-day re-queueing is no longer possible. Please reschedule your appointment for the next available working day.");
  }

  const amRow = mockDb.schedule_capacities.find((r) => r.schedule_id === appointment.schedule_id);
  const pmRow = getScheduleRows(dateKey).find((r) => r.time_window === "PM");
  if (pmRow.is_locked) throw new Error("The PM session is locked by the office. Please reschedule your appointment according to the available schedule.");
  if (pmRow.booked_slots >= pmRow.max_slots) {
    throw new Error("No remaining queue capacity is available for this session. Please reschedule your appointment according to the system's available schedule.");
  }

  mockDb.queues.forEach((q) => {
    if (q.application_id === appointment.application_id &&
        ["WAITING", "CALLED", "SERVING"].includes(q.queue_status)) {
      q.queue_status = "NO_SHOW";
    }
  });

  if (amRow && amRow.booked_slots > 0) amRow.booked_slots -= 1;
  pmRow.booked_slots += 1;
  appointment.schedule_id = pmRow.schedule_id;
  appointment.appointment_status = APPOINTMENT_STATUSES.CHECKED_IN;

  const queue = mockCreateQueueEntry(appointment.application_id, "RE_QUEUE", dateKey, "PM");
  return { appointment: { ...appointment }, queue: { ...queue } };
}

// Validate against the new session BEFORE releasing the old slot — a rejected
// reschedule must leave the current booking untouched.
function mockRescheduleAppointmentRecord(appointmentId, newDateKey, newTimeWindow) {
  const appointment = mockDb.appointments.find((a) => a.appointment_id === appointmentId);
  if (!appointment) throw new Error("Appointment record not found.");

  const newRow = getScheduleRows(newDateKey).find((r) => r.time_window === newTimeWindow);
  if (newRow.is_locked) throw new Error("The new session is locked by the office.");
  if (newRow.booked_slots >= newRow.max_slots) throw new Error("This time slot is already full. Please select another available session.");
  if (newRow.schedule_id === appointment.schedule_id) {
    throw new Error("The appointment is already booked into this session.");
  }

  const oldRow = mockDb.schedule_capacities.find((r) => r.schedule_id === appointment.schedule_id);
  if (oldRow && oldRow.booked_slots > 0) oldRow.booked_slots -= 1;

  newRow.booked_slots += 1;
  appointment.schedule_id = newRow.schedule_id;
  appointment.appointment_status = APPOINTMENT_STATUSES.RESCHEDULED;
  return { ...appointment };
}

function mockCancelAppointment(appointment) {
  appointment.appointment_status = APPOINTMENT_STATUSES.CANCELLED;
  const row = mockDb.schedule_capacities.find((r) => r.schedule_id === appointment.schedule_id);
  if (row && row.booked_slots > 0) row.booked_slots -= 1;
  return { ...appointment };
}

// Full cswdo_db queues shape: queue_id, application_id, queue_number,
// queue_type, queue_date, time_window, queue_status, called_at.
// (UI representation only; the queue screen itself is a separate module.)
function mockCreateQueueEntry(applicationId, queueType, dateKey, timeWindow) {
  const prefix = queueType === "RE_QUEUE" ? "RQ" : "OV";
  const sameType = mockDb.queues.filter((q) => q.queue_type === queueType);

  const entry = {
    queue_id: nextId(mockDb.queues, "queue_id"),
    application_id: applicationId,
    queue_number: `${prefix}-${String(sameType.length + 1).padStart(3, "0")}`,
    queue_type: queueType,
    queue_date: dateKey,
    time_window: timeWindow,
    queue_status: "WAITING",
    called_at: null
  };
  mockDb.queues.push(entry);
  return entry;
}

/* ==========================================================================
   8. CHECK-IN / LATE DETECTION LOGIC
   --------------------------------------------------------------------------
   checkInStatus(appointment) returns:
     "upcoming" -> before the check-in window opens (7:30 AM / 11:30 AM)
     "open"     -> within the on-time window (until before 11:00 AM / 5:00 PM)
     "late"     -> past the on-time window, session still open
                   (AM 11:00–12:00 → PM re-queue offered; PM ≥5:00 → reschedule)
     "cutoff"   -> session closed (AM after 12:00 PM) or past the date
   ========================================================================== */

function minutesSinceMidnight(dateObj) {
  return dateObj.getHours() * 60 + dateObj.getMinutes();
}

// The operational day is over once the PM on-time end (5:00 PM) has passed —
// same-day re-queue is impossible from that moment on.
function dayConcluded(timeWindow, nowMinutes) {
  return timeWindow === "PM" && nowMinutes >= SESSION_ONTIME_END_MINUTES.PM;
}

function getScheduleDateForAppointment(appointment) {
  const row = mockDb.schedule_capacities.find((r) => r.schedule_id === appointment.schedule_id);
  return row ? row.schedule_date : null;
}

function getTimeWindowForAppointment(appointment) {
  const row = mockDb.schedule_capacities.find((r) => r.schedule_id === appointment.schedule_id);
  return row ? row.time_window : null;
}

function checkInStatus(appointment) {
  const dateKey = getScheduleDateForAppointment(appointment);
  const timeWindow = getTimeWindowForAppointment(appointment);
  if (!dateKey || !timeWindow) return "cutoff";

  const now = new Date();
  const todayKey = formatDateKey(now);
  if (dateKey !== todayKey) {
    return dateKey > todayKey ? "upcoming" : "cutoff";
  }

  const nowMinutes = minutesSinceMidnight(now);
  const openAt = CHECKIN_OPEN_MINUTES[timeWindow];          // 7:30 AM / 11:30 AM
  const ontimeEnd = SESSION_ONTIME_END_MINUTES[timeWindow]; // 11:00 AM / 5:00 PM
  const endAt = SESSION_END_MINUTES[timeWindow];            // 12:00 PM / 5:00 PM

  if (nowMinutes < openAt) return "upcoming";
  if (nowMinutes < ontimeEnd) return "open";
  if (nowMinutes < endAt) return "late";
  return "cutoff";
}

// Human label for the check-in opening time (7:30 AM / 11:30 AM).
function checkinOpensLabel(timeWindow) {
  const openAt = CHECKIN_OPEN_MINUTES[timeWindow];
  const hours = Math.floor(openAt / 60);
  const minutes = String(openAt % 60).padStart(2, "0");
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

// Can a late AM appointment still be re-queued into the same-day PM session?
// (A PM-late appointment is never re-queueable — the day is concluded.)
function canRequeue(appointment) {
  const dateKey = getScheduleDateForAppointment(appointment);
  const timeWindow = getTimeWindowForAppointment(appointment);
  if (!dateKey || !timeWindow || timeWindow !== "AM") return false;
  return getSessionAvailability(dateKey, "PM").available > 0;
}

/* ==========================================================================
   9. DOM REFERENCES
   ========================================================================== */

const dom = {};

function cacheDomReferences() {
  const ids = [
    "headerClock",
    "applicationSelect", "applicationBadge", "applicationFeedback",
    "summaryApplicationId", "summaryControlNumber", "summaryClientId",
    "summaryAssistanceType", "summaryApplicationStatus",
    "availabilityCards", "availabilityDateBadge", "availabilityEmptyText",
    "calendarDays", "calendarMonthTitle", "btnPrevMonth", "btnNextMonth",
    "selectedDateLabel", "selectedDateBadge", "selectedDateDisplay",
    "selectedDateMeta", "sessionCards", "sessionHint", "schedulingFeedback",
    "appointmentStatusBadge",
    "detailAppointmentId", "detailControlNumber", "detailDate", "detailSession",
    "detailTime", "detailApptStatus", "detailCheckinStatus", "detailQueueNumber",
    "lateNotice", "btnCheckIn", "btnReschedule", "btnCancelAppointment",
    "appointmentFeedback", "apiModeBanner", "headerSession", "headerSessionName",
    "policyAvailabilityBody", "btnContinueToScheduling",
    "confirmControlNumber", "confirmDate", "confirmSession", "confirmTime",
    "confirmSlots", "btnConfirmAppointment",
    "successAppointmentId", "successControlNumber", "successDate",
    "successSession", "successTime", "successCheckinOpens", "successStatus",
    "lateOriginal", "lateSession", "lateStatus", "lateExplanation", "lateActions",
    "requeueOriginal", "requeueStatus", "btnConfirmRequeue",
    "rescheduleMessage", "btnOpenCalendarForReschedule",
    "toast"
  ];
  ids.forEach((id) => { dom[id] = document.getElementById(id); });
}

/* ==========================================================================
   10. FEEDBACK SYSTEM (toast, inline alerts, button loading states)
   ========================================================================== */

let toastTimer;

function showNotification(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add("isVisible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove("isVisible"), 2600);
}

// Inline feedback under forms/actions. kind: "success" | "error" | "info".
function showFeedback(element, message, kind) {
  element.textContent = message;
  element.className = `feedbackArea is${kind.charAt(0).toUpperCase() + kind.slice(1)}`;
  element.hidden = false;
}

function clearFeedback(element) {
  element.hidden = true;
  element.textContent = "";
  element.className = "feedbackArea";
}

// Wraps an async action with button loading state + success/error feedback.
async function runWithFeedback(button, feedbackElement, action, successMessage) {
  const originalLabel = button.textContent;
  button.classList.add("isLoading");
  button.disabled = true;
  clearFeedback(feedbackElement);

  try {
    const result = await action();
    if (successMessage) showFeedback(feedbackElement, successMessage, "success");
    return result;
  } catch (error) {
    showFeedback(feedbackElement, error.message || "Something went wrong. Please try again.", "error");
    showNotification(`Error: ${error.message || "request failed"}`);
    return null;
  } finally {
    button.classList.remove("isLoading");
    button.textContent = originalLabel;
    // Re-enable so modal action buttons (Confirm, Re-queue, etc.) can be
    // used again; panel buttons get their authoritative state back via
    // refreshActionButtons() below.
    button.disabled = false;
    refreshActionButtons();
  }
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add("isOpen");
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove("isOpen");
}

function setupDialogInteractions() {
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.getAttribute("data-close-modal")));
  });

  // Clicking the dark overlay closes non-blocking dialogs (and cancels an
  // in-progress reschedule selection if that dialog is dismissed).
  document.querySelectorAll(".modalOverlay").forEach((overlay) => {
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay && overlay.id !== "policyModal") {
        closeModal(overlay.id);
        if (overlay.id === "rescheduleModal") appointmentState.rescheduleMode = false;
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      document.querySelectorAll(".modalOverlay.isOpen").forEach((overlay) => {
        if (overlay.id !== "policyModal") {
          closeModal(overlay.id);
          if (overlay.id === "rescheduleModal") appointmentState.rescheduleMode = false;
        }
      });
    }
  });
}

/* ---- Badge + card factories ---- */

function statusBadgeHtml(statusValue) {
  const label = STATUS_LABELS[statusValue] || statusValue;
  const badgeClass = STATUS_BADGES[statusValue] || "badgeNeutral";
  return `<span class="badge ${badgeClass}">${label}</span>`;
}

function slotStatusBadgeHtml(statusKey) {
  const map = {
    available:  ["badgeSuccess", "Available"],
    almostFull: ["badgeWarning", "Almost Full"],
    full:       ["badgeDanger",  "Full"],
    locked:     ["badgeNeutral", "Locked"],
    closed:     ["badgeNeutral", "Closed"],
    notAvailable: ["badgeNeutral", "Not Available"]
  };
  const [badgeClass, label] = map[statusKey] || map.notAvailable;
  return `<span class="badge ${badgeClass}">${label}</span>`;
}

function makeSessionCard(kind, availability) {
  const card = document.createElement("div");
  card.className = "sessionCard";

  const isReserve = kind === "reserve";
  if (availability.status === "almostFull") card.classList.add("isAlmostFull");
  if (availability.status === "full") card.classList.add("isFull");
  if (availability.status === "locked" || availability.status === "closed") card.classList.add("isLocked");

  const statusText = {
    available: "Available",
    almostFull: "Almost Full",
    full: `FULL — ${availability.booked}/${availability.capacity}`,
    locked: "Locked",
    closed: "CLOSED"
  }[availability.status] || "Unavailable";

  const fillPercent = Math.round((availability.booked / availability.capacity) * 100);
  const fillClass = availability.status === "full" ? "isFull"
    : availability.status === "almostFull" ? "isAlmostFull" : "";

  card.innerHTML = `
    <div class="sessionCardHead">
      <span class="sessionName">${availability.timeWindow} Session</span>
      <span class="sessionTime">${availability.displayTime}</span>
    </div>
    <span class="sessionMeta">${availability.capacity} Slots</span>
    <div class="capacityBar"><div class="capacityFill ${fillClass}" style="width:${fillPercent}%"></div></div>
    <span class="sessionMeta">Available: ${availability.available} &middot; Reserved: ${availability.booked}</span>
    <span class="sessionMeta">${availability.available} / ${availability.capacity} slots available &middot; ${statusText}</span>
    ${slotStatusBadgeHtml(availability.status)}
  `;

  if (isReserve) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btnPrimary";
    button.textContent = `Select ${availability.timeWindow}`;
    // "almostFull" stays bookable — it is a capacity warning, not a block.
    button.disabled = !(availability.status === "available" || availability.status === "almostFull");
    button.setAttribute("aria-disabled", String(button.disabled));
    button.addEventListener("click", () => reserveAppointment(appointmentState.selectedDate, availability.timeWindow, button));
    card.appendChild(button);
  }

  return card;
}

/* ==========================================================================
   11. RENDERING
   ========================================================================== */

function renderAvailabilityCards() {
  const target = findNextWorkingDate(startOfToday());
  const dateKey = formatDateKey(target);
  const availability = getAppointmentAvailability(dateKey);
  const noSlots = availability.AM.available === 0 && availability.PM.available === 0;

  dom.availabilityDateBadge.textContent =
    dateKey === formatDateKey(startOfToday()) ? "Today" : formatDisplayDateShort(dateKey);

  dom.availabilityCards.innerHTML = "";
  [availability.AM, availability.PM].forEach((session) => {
    dom.availabilityCards.appendChild(makeSessionCard("info", session));
  });
  dom.availabilityEmptyText.hidden = !noSlots;
}

function renderCalendar() {
  const year = appointmentState.viewYear;
  const month = appointmentState.viewMonth;

  dom.calendarMonthTitle.textContent =
    new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" }).format(new Date(year, month, 1));

  const today = startOfToday();
  dom.btnPrevMonth.disabled = year === today.getFullYear() && month === today.getMonth();
  dom.btnNextMonth.disabled = year === 2027 && month === 11;

  dom.calendarDays.innerHTML = "";

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstWeekday; i += 1) {
    const empty = document.createElement("div");
    empty.className = "calendarCell cellEmpty";
    empty.setAttribute("aria-hidden", "true");
    dom.calendarDays.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    dom.calendarDays.appendChild(buildCalendarCell(new Date(year, month, day)));
  }
}

function getDateStatus(dateObj, availability) {
  if (isPastDate(dateObj)) return "past";
  if (isWeekend(dateObj)) return "weekend";
  if (isPhilippineHoliday(dateObj)) return "holiday";

  // Auto-close rule (§8): today stops being selectable after 5:00 PM.
  const now = new Date();
  if (formatDateKey(dateObj) === formatDateKey(now) && minutesSinceMidnight(now) >= SESSION_END_MINUTES.PM) {
    return "closed";
  }

  if (availability.AM.isLocked && availability.PM.isLocked) return "locked";
  if (availability.AM.available === 0 && availability.PM.available === 0) return "full";
  if (availability.AM.status === "almostFull" || availability.PM.status === "almostFull") return "almostFull";
  return "open";
}

function buildCalendarCell(dateObj) {
  const dateKey = formatDateKey(dateObj);
  const availability = getAppointmentAvailability(dateKey);
  const dateStatus = getDateStatus(dateObj, availability);
  const holidayName = getHolidayName(dateObj);

  const cell = document.createElement("button");
  cell.type = "button";
  cell.className = "calendarCell";
  cell.dataset.date = dateKey;

  const selectable = dateStatus === "open" || dateStatus === "almostFull";
  if (!selectable) cell.disabled = true;

  const stateClass = {
    open: "cellOpen", almostFull: "cellAlmostFull", full: "cellFull",
    holiday: "cellHoliday", weekend: "cellWeekend", past: "cellPast",
    locked: "cellLocked", closed: "cellLocked"
  }[dateStatus];
  cell.classList.add(stateClass);

  if (dateKey === formatDateKey(startOfToday())) cell.classList.add("cellToday");
  if (dateKey === appointmentState.selectedDate) cell.classList.add("cellSelected");

  let label = "";
  if (dateStatus === "holiday") {
    label = holidayName;
    cell.setAttribute("aria-label", `${formatDisplayDateShort(dateKey)} — ${label}. Philippine Holiday. No Schedule.`);
  } else if (dateStatus === "weekend") {
    label = "No Schedule · Weekend";
    cell.setAttribute("aria-label", `${formatDisplayDateShort(dateKey)} — No Schedule. Weekend.`);
  } else if (dateStatus === "past") {
    label = "Past";
    cell.setAttribute("aria-label", `${formatDisplayDateShort(dateKey)} — Past date.`);
  } else if (dateStatus === "full") {
    label = "Full";
    cell.setAttribute("aria-label", `${formatDisplayDateShort(dateKey)} — Fully booked.`);
  } else if (dateStatus === "locked") {
    label = "Locked";
    cell.setAttribute("aria-label", `${formatDisplayDateShort(dateKey)} — Sessions locked by the office.`);
  } else if (dateStatus === "closed") {
    label = "Closed";
    cell.setAttribute("aria-label", `${formatDisplayDateShort(dateKey)} — Sessions closed for today.`);
  } else {
    const totalAvailable = availability.AM.available + availability.PM.available;
    label = `${totalAvailable}/60 slots`;
    cell.setAttribute("aria-label", `${formatDisplayDateShort(dateKey)} — ${totalAvailable} of 60 slots available.`);
  }

  cell.innerHTML = `
    <span class="calendarDateNum">${dateObj.getDate()}</span>
    <span class="calendarCellLabel">${label}</span>
  `;

  if (selectable) {
    cell.addEventListener("click", () => selectDate(dateKey));
  }

  return cell;
}

function renderSessionAvailability() {
  const dateKey = appointmentState.selectedDate;
  dom.sessionCards.innerHTML = "";

  if (!dateKey) {
    dom.sessionHint.hidden = false;
    dom.selectedDateBadge.textContent = "Pending";
    dom.selectedDateBadge.className = "badge badgeNeutral";
    return;
  }

  const availability = getAppointmentAvailability(dateKey);
  [availability.AM, availability.PM].forEach((session) => {
    dom.sessionCards.appendChild(makeSessionCard("reserve", session));
  });
}

function renderSelectedDatePanel() {
  const dateKey = appointmentState.selectedDate;

  if (!dateKey) {
    dom.selectedDateLabel.textContent = "No date selected yet";
    dom.selectedDateDisplay.textContent = "Please pick a weekday on the calendar";
    dom.selectedDateMeta.textContent = "Session: none selected";
    return;
  }

  const dateObj = parseDateKey(dateKey);
  dom.selectedDateLabel.textContent = formatDisplayDate(dateKey);
  dom.selectedDateDisplay.textContent = formatDisplayDateShort(dateKey);

  const parts = [];
  if (isWeekend(dateObj)) parts.push("Weekend");
  if (isPhilippineHoliday(dateObj)) parts.push(`Philippine Holiday — ${getHolidayName(dateObj)}`);

  if (parts.length > 0) {
    dom.selectedDateMeta.textContent = parts.join(" · ");
    dom.selectedDateBadge.textContent = "No Schedule";
    dom.selectedDateBadge.className = "badge badgeWarning";
  } else {
    const availability = getAppointmentAvailability(dateKey);
    dom.selectedDateMeta.textContent =
      `AM: ${availability.AM.available} available · PM: ${availability.PM.available} available`;
    dom.selectedDateBadge.textContent = "Open";
    dom.selectedDateBadge.className = "badge badgeSuccess";
  }
}

function getCurrentAppointmentRow() {
  if (!appointmentState.selectedApplicationId) return null;
  return mockDb.appointments.find(
    (a) => a.application_id === appointmentState.selectedApplicationId &&
           a.appointment_status !== APPOINTMENT_STATUSES.CANCELLED
  ) || null;
}

// A client may hold several queue rows over time (re-queues create new
// entries); the latest queue_id is the one currently displayed.
function getQueueEntryFor(applicationId) {
  const rows = mockDb.queues.filter((q) => q.application_id === applicationId);
  if (rows.length === 0) return null;
  return rows.reduce((latest, row) => (Number(row.queue_id) > Number(latest.queue_id) ? row : latest));
}

function renderApplicationPanel() {
  const application = mockDb.applications.find(
    (a) => a.application_id === appointmentState.selectedApplicationId
  );

  if (!application) {
    dom.summaryApplicationId.textContent = "—";
    dom.summaryControlNumber.textContent = "—";
    dom.summaryClientId.textContent = "—";
    dom.summaryAssistanceType.textContent = "—";
    dom.summaryApplicationStatus.innerHTML = '<span class="badge badgeNeutral">None</span>';
    return;
  }

  dom.summaryApplicationId.textContent = application.application_id;
  dom.summaryControlNumber.textContent = application.control_number;
  dom.summaryClientId.textContent = application.client_id;
  dom.summaryAssistanceType.textContent =
    assistanceTypes[application.assistance_type_id] || `Type ${application.assistance_type_id}`;
  dom.summaryApplicationStatus.innerHTML =
    `<span class="badge ${application.current_status === "APPROVED" ? "badgeSuccess" : "badgeInfo"}">${applicationStatusLabel(application.current_status)}</span>`;
}

function renderAppointmentPanel() {
  const appointment = getCurrentAppointmentRow();

  if (!appointment) {
    dom.appointmentStatusBadge.textContent = "No Appointment";
    dom.appointmentStatusBadge.className = "badge badgeNeutral";
    dom.detailAppointmentId.textContent = "—";
    dom.detailControlNumber.textContent = "—";
    dom.detailDate.textContent = "—";
    dom.detailSession.textContent = "—";
    dom.detailTime.textContent = "—";
    dom.detailApptStatus.innerHTML = '<span class="badge badgeNeutral">None</span>';
    dom.detailCheckinStatus.innerHTML = '<span class="badge badgeNeutral">Not Checked In</span>';
    dom.detailQueueNumber.textContent = "—";
    dom.lateNotice.hidden = true;
    dom.btnCheckIn.disabled = true;
    dom.btnCheckIn.textContent = "Check In";
    dom.btnReschedule.disabled = true;
    dom.btnCancelAppointment.disabled = true;
    return;
  }

  const application = mockDb.applications.find((a) => a.application_id === appointment.application_id);
  const dateKey = getScheduleDateForAppointment(appointment);
  const timeWindow = getTimeWindowForAppointment(appointment);

  dom.appointmentStatusBadge.textContent = "Active Appointment";
  dom.appointmentStatusBadge.className = "badge badgeInfo";
  dom.detailAppointmentId.textContent = appointment.appointment_id;
  dom.detailControlNumber.textContent = application ? application.control_number : "—";
  dom.detailDate.textContent = dateKey ? formatDisplayDate(dateKey) : "—";
  dom.detailSession.textContent = timeWindow ? `${timeWindow} Session` : "—";
  dom.detailTime.textContent = timeWindow ? sessionConfig[timeWindow].displayTime : "—";
  dom.detailApptStatus.innerHTML = statusBadgeHtml(appointment.appointment_status);

  const status = checkInStatus(appointment);
  const isLate = appointment.appointment_status === APPOINTMENT_STATUSES.LATE || status === "late";

  dom.detailCheckinStatus.innerHTML = isLate
    ? '<span class="badge badgeDanger">LATE</span>'
    : '<span class="badge badgeNeutral">Not Checked In</span>';

  const queueEntry = getQueueEntryFor(appointment.application_id);
  dom.detailQueueNumber.innerHTML = queueEntry
    ? `<span class="monoCode">${queueEntry.queue_number}</span> <span class="badge badgeWarning badgePlain badgeSm">${queueEntry.queue_status}</span>` +
      (queueEntry.queue_number && queueEntry.queue_number.startsWith("RQ-")
        ? ' <span class="badge badgeInfo badgeSm">End of line — no queue jumping</span>'
        : "")
    : "—";

  dom.btnCancelAppointment.disabled =
    appointment.appointment_status === APPOINTMENT_STATUSES.CHECKED_IN;
  dom.btnReschedule.disabled =
    appointment.appointment_status === APPOINTMENT_STATUSES.CHECKED_IN;

  const isLateStatus = appointment.appointment_status === APPOINTMENT_STATUSES.LATE;

  // The server accepts check-ins for SCHEDULED/RESCHEDULED rows inside the
  // window; a LATE appointment must use the re-queue/reschedule flow.
  const canCheckIn =
    !isLateStatus &&
    (appointment.appointment_status === APPOINTMENT_STATUSES.SCHEDULED ||
     appointment.appointment_status === APPOINTMENT_STATUSES.RESCHEDULED) &&
    (status === "open" || status === "late");

  dom.btnCheckIn.disabled = !canCheckIn;
  dom.btnCheckIn.textContent =
    isLateStatus ? "Marked LATE — use Re-Queue / Reschedule" :
    status === "open" ? "Check In" :
    status === "late" ? (timeWindow === "PM" ? "Check In (Day Concluded — Reschedule)" : "Check In (Late — PM Re-Queue Offered)") :
    status === "upcoming" ? `Check In (opens ${checkinOpensLabel(timeWindow || "AM")})` :
    "Check In Closed";

  dom.lateNotice.hidden = appointment.appointment_status !== APPOINTMENT_STATUSES.LATE;
}

// Re-enables action buttons after an async operation finishes.
function refreshActionButtons() {
  renderAppointmentPanel();
}

function renderAll() {
  renderApplicationPanel();
  renderAvailabilityCards();
  renderCalendar();
  renderSelectedDatePanel();
  renderSessionAvailability();
  renderAppointmentPanel();
}

/* ==========================================================================
   12. USER FLOW — INITIAL POLICY DIALOG
   ========================================================================== */

function showInitialAppointmentDialog() {
  const today = startOfToday();
  const body = dom.policyAvailabilityBody;

  if (isWorkingDay(today)) {
    const availability = getAppointmentAvailability(formatDateKey(today));
    body.innerHTML = `
      <div class="policyAvailabilityRow">
        <span><strong>AM</strong> — ${availability.AM.displayTime}</span>
        <span>${availability.AM.available} slots available</span>
      </div>
      <div class="policyAvailabilityRow">
        <span><strong>PM</strong> — ${availability.PM.displayTime}</span>
        <span>${availability.PM.available} slots available</span>
      </div>
    `;
  } else {
    body.innerHTML = `
      <p class="policySmall" style="margin:0">
        No appointments are available today. Please select the next available working day.
      </p>
    `;
  }

  openModal("policyModal");
}

/* ==========================================================================
   13. USER FLOW — APPLICATION SELECTION
   ========================================================================== */

// GET /api/auth.php?action=me — resolves the (demo) session identity and
// reflects it in the header. The real CSWDO login module plugs in here.
async function loadSession() {
  const result = await fetchSession();
  appointmentState.session = (result && result.user) || null;
  renderHeaderSession();
}

function renderHeaderSession() {
  if (!dom.headerSession || !dom.headerSessionName) return;
  const user = appointmentState.session;
  if (!user) {
    dom.headerSession.hidden = true;
    return;
  }
  dom.headerSessionName.textContent = user.full_name || user.username;
  dom.headerSession.hidden = false;
}

async function loadApplications() {
  clearFeedback(dom.applicationFeedback);
  dom.applicationSelect.disabled = true;

  const applications = await runWithFeedback(
    dom.applicationBadge,
    dom.applicationFeedback,
    () => fetchApplications(),
    ""
  );

  dom.applicationSelect.disabled = false;
  dom.applicationSelect.innerHTML = "";

  if (!applications || applications.length === 0) {
    dom.applicationSelect.innerHTML = '<option value="">No applications found</option>';
    return;
  }

  applications.forEach((application) => {
    const option = document.createElement("option");
    option.value = String(application.application_id);
    option.textContent = `${application.control_number} — ${assistanceTypes[application.assistance_type_id] || "Assistance"} (${applicationStatusLabel(application.current_status)})`;
    dom.applicationSelect.appendChild(option);
  });

  appointmentState.selectedApplicationId = applications[0].application_id;
  dom.applicationSelect.value = String(applications[0].application_id);
  renderApplicationPanel();
}

function handleApplicationChange() {
  const value = Number(dom.applicationSelect.value);
  appointmentState.selectedApplicationId = Number.isNaN(value) ? null : value;
  renderApplicationPanel();
  renderAppointmentPanel();
  showNotification("Application selected: " + dom.applicationSelect.selectedOptions[0].textContent.split(" — ")[0]);
}

/* ==========================================================================
   14. USER FLOW — DATE SELECTION & RESERVATION
   ========================================================================== */

function selectDate(dateKey) {
  // Blocking gate: the scheduling policy dialog must be acknowledged first.
  if (!appointmentState.policyAcknowledged) {
    openModal("policyModal");
    return;
  }

  const dateObj = parseDateKey(dateKey);

  if (!isWorkingDay(dateObj)) {
    showNotification(isWeekend(dateObj)
      ? "No Schedule — weekends are not available for appointments."
      : `No Schedule — ${getHolidayName(dateObj)} is a Philippine holiday.`);
    return;
  }

  appointmentState.selectedDate = dateKey;
  renderCalendar();
  renderSelectedDatePanel();
  renderSessionAvailability();
}

function reserveAppointment(dateKey, timeWindow, triggerButton) {
  // Blocking gate: the scheduling policy dialog must be acknowledged first.
  if (!appointmentState.policyAcknowledged) {
    openModal("policyModal");
    return;
  }

  if (!appointmentState.selectedApplicationId) {
    showNotification("Please select your assistance application first.");
    return;
  }
  if (!dateKey) {
    showNotification("Please select a working day on the calendar first.");
    return;
  }

  const dateObj = parseDateKey(dateKey);
  if (!isWorkingDay(dateObj)) {
    showNotification("That date is not a valid working day.");
    return;
  }

  const availability = getSessionAvailability(dateKey, timeWindow);
  if (availability.status !== "available" && availability.status !== "almostFull") {
    showNotification(
      availability.status === "full" ? `${timeWindow} session is full (${availability.booked}/${availability.capacity}).` :
      availability.status === "closed" ? "This appointment session is already closed. Please select another available schedule." :
      availability.status === "locked" ? `${timeWindow} session is locked by the office.` :
      "This session cannot be reserved."
    );
    renderSessionAvailability();
    return;
  }

  openAppointmentConfirmationDialog(dateKey, timeWindow, triggerButton);
}

function openAppointmentConfirmationDialog(dateKey, timeWindow, triggerButton) {
  const availability = getSessionAvailability(dateKey, timeWindow);
  const application = mockDb.applications.find(
    (a) => a.application_id === appointmentState.selectedApplicationId
  );

  dom.confirmControlNumber.textContent = application ? application.control_number : "—";
  dom.confirmDate.textContent = formatDisplayDate(dateKey);
  dom.confirmSession.textContent = `${timeWindow} Session`;
  dom.confirmTime.textContent = availability.displayTime;
  dom.confirmSlots.textContent = `${availability.available} / ${availability.capacity}`;

  dom.btnConfirmAppointment.onclick = () => {
    if (appointmentState.rescheduleMode) {
      confirmReschedule(dateKey, timeWindow, dom.btnConfirmAppointment);
    } else {
      confirmAppointment(dateKey, timeWindow, dom.btnConfirmAppointment);
    }
  };
  dom.btnConfirmAppointment.textContent = appointmentState.rescheduleMode
    ? "Confirm Reschedule"
    : "Confirm Appointment";
  openModal("confirmModal");
}

async function confirmAppointment(dateKey, timeWindow, triggerButton) {
  const applicationId = appointmentState.selectedApplicationId;

  const result = await runWithFeedback(
    triggerButton,
    dom.schedulingFeedback,
    () => createAppointment(applicationId, dateKey, timeWindow),
    ""
  );

  if (!result) return; // error already surfaced via feedback area + toast

  closeModal("confirmModal");
  appointmentState.rescheduleMode = false;

  renderAll();
  showReservationSuccessDialog(result);
  showNotification("Appointment reserved successfully.");
}

function showReservationSuccessDialog(appointment) {
  const application = mockDb.applications.find(
    (a) => a.application_id === appointment.application_id
  );
  const schedule = mockDb.schedule_capacities.find((r) => r.schedule_id === appointment.schedule_id);

  dom.successAppointmentId.textContent = appointment.appointment_id;
  dom.successControlNumber.textContent = application ? application.control_number : "—";
  dom.successDate.textContent = schedule ? formatDisplayDate(schedule.schedule_date) : "—";
  dom.successSession.textContent = schedule ? `${schedule.time_window} Session` : "—";
  dom.successTime.textContent = schedule ? sessionConfig[schedule.time_window].displayTime : "—";
  dom.successCheckinOpens.textContent = schedule ? checkinOpensLabel(schedule.time_window) : "—";
  dom.successStatus.innerHTML = statusBadgeHtml(appointment.appointment_status);

  openModal("successModal");
}

/* ==========================================================================
   15. USER FLOW — CHECK-IN, LATE, RE-QUEUE, RESCHEDULE, CANCEL
   ========================================================================== */

function checkInAppointment() {
  const appointment = getCurrentAppointmentRow();
  if (!appointment) {
    showNotification("You have no appointment to check in to.");
    return;
  }

  const status = checkInStatus(appointment);
  const timeWindow = getTimeWindowForAppointment(appointment) || "AM";

  if (status === "upcoming") {
    showNotification(`Check-in is not yet available. Please return at ${checkinOpensLabel(timeWindow)} for the ${timeWindow} session.`);
    return;
  }
  if (status === "cutoff") {
    showNotification("This appointment session is already closed. Please reschedule your appointment according to the available schedule.");
    return;
  }

  // The SERVER decides on-time vs LATE (and re-queue capacity) — the client
  // only routes the response to the matching dialog.
  runCheckInFlow(appointment, dom.btnCheckIn);
}

async function runCheckInFlow(appointment, triggerButton) {
  const result = await runWithFeedback(
    triggerButton,
    dom.appointmentFeedback,
    () => checkInAppointmentRecord(appointment),
    ""
  );

  if (!result) return;

  if (result.late) {
    renderAppointmentPanel();
    showNotification(result.message || "You have been marked as late. Your appointment will proceed through the re-queue process.");
    showLateDialog(appointment, result);
    return;
  }

  renderAppointmentPanel();
  const queue = result.queue || getQueueEntryFor(appointment.application_id);
  showFeedback(
    dom.appointmentFeedback,
    `Check-in Successful — Queue Number: ${queue ? queue.queue_number : "—"} · Queue Status: ${queue ? queue.queue_status : "WAITING"}`,
    "success"
  );
  showNotification(
    `Checked in successfully.${queue ? ` Queue number: ${queue.queue_number}.` : ""}`
  );
}

function showLateDialog(appointment, lateResult) {
  const dateKey = getScheduleDateForAppointment(appointment);
  const timeWindow = getTimeWindowForAppointment(appointment);
  // The SERVER decides the branch (UI mirror): must_reschedule_tomorrow → day
  // concluded; can_requeue_pm → AM rollover. The clock is only a fallback for
  // the offline mock flow.
  const isDayConcluded = lateResult && lateResult.must_reschedule_tomorrow === true
    ? true
    : lateResult && lateResult.can_requeue_pm === true
      ? false
      : dayConcluded(timeWindow, minutesSinceMidnight(new Date()));

  dom.lateOriginal.textContent = dateKey ? formatDisplayDate(dateKey) : "—";
  dom.lateSession.textContent = timeWindow ? `${timeWindow} — ${sessionConfig[timeWindow].displayTime}` : "—";
  dom.lateStatus.innerHTML = statusBadgeHtml(APPOINTMENT_STATUSES.LATE);

  dom.lateExplanation.innerHTML = "";
  dom.lateActions.innerHTML = "";

  if (isDayConcluded) {
    // PM-late: the operational day is over — same-day re-queue is impossible.
    const alertText = document.createElement("strong");
    alertText.textContent = "The office day has concluded.";
    dom.lateExplanation.appendChild(alertText);
    dom.lateExplanation.appendChild(document.createElement("br"));
    dom.lateExplanation.appendChild(document.createTextNode(
      "Same-day re-queueing is no longer possible. Please reschedule your appointment for the next available working day (tomorrow or later). Your permanent control number stays the same."
    ));
    dom.lateActions.appendChild(makeDialogButton(
      "btnConfirm",
      "Reschedule for Next Available Day",
      () => { closeModal("lateModal"); openRescheduleDialog(appointment); }
    ));
  } else {
    // AM-late: same-day PM re-queue is offered while PM capacity lasts.
    const pmAvailable = lateResult && typeof lateResult.pm_has_capacity === "boolean"
      ? lateResult.pm_has_capacity
      : canRequeue(appointment);
    dom.lateExplanation.appendChild(document.createTextNode(
      "You may be re-queued into the same-day PM session. Your new RQ-### queue number is placed strictly at the end of the PM line — there is no queue jumping. Your permanent control number stays the same."
    ));
    if (!pmAvailable) {
      dom.lateExplanation.appendChild(document.createElement("br"));
      const warning = document.createElement("strong");
      warning.textContent = "Warning: the PM session is already full (30/30). Same-day re-queue is unavailable — please reschedule instead.";
      dom.lateExplanation.appendChild(warning);
    }
    const requeueButton = makeDialogButton(
      "btnConfirm",
      "Re-queue to PM Session",
      () => { closeModal("lateModal"); openRequeueDialog(appointment); }
    );
    requeueButton.disabled = !pmAvailable;
    if (!pmAvailable) requeueButton.title = "The PM session is full — please reschedule instead.";
    dom.lateActions.appendChild(requeueButton);
    dom.lateActions.appendChild(makeDialogButton(
      "btnDanger",
      "Reschedule Appointment",
      () => { closeModal("lateModal"); openRescheduleDialog(appointment); }
    ));
  }

  openModal("lateModal");
}

function makeDialogButton(buttonClass, label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `btn ${buttonClass}`;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function openRequeueDialog(appointment) {
  const dateKey = getScheduleDateForAppointment(appointment);

  dom.requeueOriginal.textContent =
    `${formatDisplayDate(dateKey)} — AM session (transfer to PM)`;
  dom.requeueStatus.innerHTML = statusBadgeHtml(APPOINTMENT_STATUSES.LATE);

  dom.btnConfirmRequeue.onclick = () => requeueAppointment(appointment, dom.btnConfirmRequeue);
  openModal("requeueModal");
}

async function requeueAppointment(appointment, triggerButton) {
  const result = await runWithFeedback(
    triggerButton,
    dom.appointmentFeedback,
    () => lateRequeueRecord(appointment),
    ""
  );

  if (!result) {
    // No capacity (or another rule blocked the re-queue) — route to reschedule.
    closeModal("requeueModal");
    openRescheduleDialog(appointment);
    return;
  }

  closeModal("requeueModal");
  renderAppointmentPanel();
  const queueEntry = result.queue || getQueueEntryFor(appointment.application_id);
  showFeedback(
    dom.appointmentFeedback,
    `Re-queue Successful — Queue Number: ${queueEntry ? queueEntry.queue_number : "—"} · Queue Status: ${queueEntry ? queueEntry.queue_status : "WAITING"}`,
    "success"
  );
  showNotification(
    `Appointment re-queued into the PM session — end of the line.` +
    (queueEntry ? ` New queue number: ${queueEntry.queue_number}.` : "")
  );
}

function rescheduleAppointment() {
  const appointment = getCurrentAppointmentRow();
  if (!appointment) {
    showNotification("You have no appointment to reschedule.");
    return;
  }
  openRescheduleDialog(appointment);
}

function openRescheduleDialog(appointment) {
  const hasCapacity = canRequeue(appointment);
  dom.rescheduleMessage.textContent = hasCapacity
    ? "You are about to reschedule your appointment. Please select another available working day and AM or PM session."
    : "No remaining queue capacity is available for this session. Please select another available working day and AM or PM session.";
  openModal("rescheduleModal");
}

// Arms the calendar so the next valid date + session selection replaces the
// old appointment (validated again before the record is updated).
function startRescheduleSelection() {
  const appointment = getCurrentAppointmentRow();
  if (!appointment) return;

  appointmentState.rescheduleMode = true;
  closeModal("rescheduleModal");
  showNotification("Select a new working day and session to reschedule your appointment.");
  document.getElementById("calendarHeading").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function confirmReschedule(dateKey, timeWindow, triggerButton) {
  const appointment = getCurrentAppointmentRow();
  if (!appointment) {
    appointmentState.rescheduleMode = false;
    return;
  }

  const result = await runWithFeedback(
    triggerButton,
    dom.schedulingFeedback,
    () => rescheduleAppointmentRecord(appointment.appointment_id, dateKey, timeWindow),
    ""
  );

  if (!result) return; // error surfaced; reschedule mode stays armed for retry

  closeModal("confirmModal");
  appointmentState.rescheduleMode = false;
  renderAll();
  showReservationSuccessDialog(result);
  showNotification("Appointment rescheduled successfully.");
}

async function cancelAppointment(triggerButton) {
  const appointment = getCurrentAppointmentRow();
  if (!appointment) return;

  const result = await runWithFeedback(
    triggerButton,
    dom.appointmentFeedback,
    () => cancelAppointmentRecord(appointment),
    "Appointment cancelled. The slot has been released."
  );

  if (!result) return;

  renderAll();
  showNotification("Appointment cancelled. The slot has been released.");
}

/* ==========================================================================
   16. INITIALIZATION
   ========================================================================== */

function seedScheduleData() {
  // Demo seed so every slot state is visible (mirrors schedule_capacities rows).
  const todayKey = formatDateKey(startOfToday());
  const nextWorking = findNextWorkingDate(addDays(startOfToday(), 1)); // strictly future
  const nextKey = formatDateKey(nextWorking);
  const laterKey = formatDateKey(findNextWorkingDate(addDays(nextWorking, 1)));

  const seedRow = (dateKey, amBooked, pmBooked, amLocked = 0, pmLocked = 0) => {
    ["AM", "PM"].forEach((timeWindow) => {
      mockDb.schedule_capacities.push({
        schedule_id: nextId(mockDb.schedule_capacities, "schedule_id"),
        schedule_date: dateKey,
        time_window: timeWindow,
        max_slots: sessionConfig[timeWindow].capacity,
        booked_slots: timeWindow === "AM" ? amBooked : pmBooked,
        is_locked: timeWindow === "AM" ? amLocked : pmLocked
      });
    });
  };

  seedRow(todayKey, 6, 12);            // Available
  seedRow(nextKey, 24, 3);             // AM Almost Full
  seedRow(laterKey, 30, 0);            // AM Full
  seedRow("2026-10-05", 0, 0, 1, 1);   // Locked day (demo)
}

async function navigateMonth(delta) {
  const view = new Date(appointmentState.viewYear, appointmentState.viewMonth + delta, 1);
  const today = startOfToday();
  const earliest = new Date(today.getFullYear(), today.getMonth(), 1);
  const latest = new Date(2027, 11, 1);

  if (view < earliest || view > latest) return;
  appointmentState.viewYear = view.getFullYear();
  appointmentState.viewMonth = view.getMonth();
  await refreshMonthSchedules();
  renderCalendar();
}

// Fetches (or falls back to) the schedule rows for the month being viewed.
async function refreshMonthSchedules() {
  try {
    await fetchMonthSchedules(appointmentState.viewYear, appointmentState.viewMonth);
  } catch (error) {
    // Offline mode keeps the lazily created demo rows.
  }
}

async function initializeAppointmentModule() {
  cacheDomReferences();

  appointmentState.viewYear = startOfToday().getFullYear();
  appointmentState.viewMonth = startOfToday().getMonth();

  // Header clock (Philippine Standard Time).
  const updateClock = () => {
    dom.headerClock.textContent = new Intl.DateTimeFormat("en-PH", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true
    }).format(new Date()) + " (PST)";
  };
  updateClock();
  setInterval(updateClock, 30000);

  // Static buttons.
  dom.btnPrevMonth.addEventListener("click", () => navigateMonth(-1));
  dom.btnNextMonth.addEventListener("click", () => navigateMonth(1));
  dom.btnCheckIn.addEventListener("click", () => checkInAppointment());
  dom.btnReschedule.addEventListener("click", () => rescheduleAppointment());
  dom.btnCancelAppointment.addEventListener("click", (event) => cancelAppointment(event.currentTarget));
  dom.btnContinueToScheduling.addEventListener("click", () => {
    appointmentState.policyAcknowledged = true;
    closeModal("policyModal");
    showNotification("You can now select a working day on the calendar.");
  });
  dom.btnOpenCalendarForReschedule.addEventListener("click", startRescheduleSelection);
  dom.applicationSelect.addEventListener("change", handleApplicationChange);

  setupDialogInteractions();

  renderAll();

  // Load the live session + data (falls back to the offline demo mirror).
  await bootstrapData();

  renderAll();

  // FIRST SCREEN PRIORITY: the policy / availability dialog always opens first.
  showInitialAppointmentDialog();
}

// Boots identity + application + current-month schedules. Every underlying
// call carries its own offline fallback, so a missing backend degrades to
// the seeded demo data instead of breaking the page.
async function bootstrapData() {
  await loadSession();
  await loadApplications();
  await refreshMonthSchedules();
}

document.addEventListener("DOMContentLoaded", initializeAppointmentModule);
