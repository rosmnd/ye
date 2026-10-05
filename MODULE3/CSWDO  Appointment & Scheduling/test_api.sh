#!/usr/bin/env bash
# ============================================================================
# CSWDO Online Appointment & Scheduling — automated API test harness.
# Requires: PHP dev server on $BASE (default http://127.0.0.1:8792),
# cswdo_db imported + seeded (seed/seed_demo.php --reset).
# TEST_MODE must be true in api/config.php (X-CSWDO-Test-Now overrides time).
#
# Check-in windows (refactor spec):
#   AM: open 07:30, ON-TIME until before 11:00, session ends 12:00.
#   PM: open 11:30, ON-TIME until before 17:00, session ends 17:00.
#   AM-late (11:00–12:00) → re-queue to same-day PM (tail, RQ-###).
#   PM-late (≥17:00)      → same-day requeue impossible → reschedule.
# ============================================================================
set -u
BASE="${BASE:-http://127.0.0.1:8792}"
PASS=0; FAIL=0
PHP=/c/xampp/php/php.exe
export PATH="/c/xampp/mysql/bin:$PATH"

report() {
  if [ "$2" -eq 0 ]; then PASS=$((PASS+1)); echo "PASS  $1";
  else FAIL=$((FAIL+1)); echo "FAIL  $1"; fi
}

get()  { curl -s --max-time 10 -b "$1" -c "$1" "${@:3}" "$BASE$2"; }
post() { curl -s --max-time 10 -b "$1" -c "$1" -H 'Content-Type: application/json' "${@:3}" -X POST "$BASE$2"; }
login() { post "$1" "/api/auth.php?action=login" -d "{\"username\":\"$2\",\"password\":\"client123\"}" > /dev/null; }
# Staff sign-in uses the production path (real password_hash verification,
# available with TEST_MODE on or off) — password comes from the seeder.
stafflogin() { post "$1" "/api/auth.php?action=staff_login" -d "{\"username\":\"$2\",\"password\":\"staff123\"}" > /dev/null; }
sql() { mysql -u root cswdo_db -e "$1" > /dev/null 2>&1; }
val() { mysql -u root cswdo_db -N -e "$1" 2>/dev/null; }

grep -q "CSWDO_TEST_MODE', true" api/config.php || {
  echo "ERROR: set CSWDO_TEST_MODE to true in api/config.php before running this harness."; exit 1; }

TODAY=$($PHP -r 'echo (new DateTimeImmutable())->format("Y-m-d");')
# Next WORKING day (skip Sat/Sun) — harness must run correctly on any weekday.
TOMORROW=$($PHP -r '$d=new DateTimeImmutable("+1 day"); while((int)$d->format("N")>5){$d=$d->modify("+1 day");} echo $d->format("Y-m-d");')
AM_SID=$(val "SELECT schedule_id FROM schedule_capacities WHERE schedule_date='$TODAY' AND time_window='AM';")
PM_SID=$(val "SELECT schedule_id FROM schedule_capacities WHERE schedule_date='$TODAY' AND time_window='PM';")

# Full demo reset
sql "DELETE FROM queues; DELETE FROM appointments;
     DELETE FROM application_status_history WHERE history_id > 4;
     UPDATE schedule_capacities SET booked_slots = 0, is_locked = 0;"

# ============================================================================
echo "== Test 0: login + overview =="
login /tmp/jar1.txt juandelacruz
R=$(post /tmp/jar1.txt "/api/auth.php?action=me")
echo "$R" | grep -q '"ok":true'; report "login + session (me)" $?

R=$(get /tmp/jar1.txt "/api/appointments.php?action=overview")
echo "$R" | grep -q '"control_number":"OL-2026-0001"'; report "overview returns OL-2026-0001 for juandelacruz" $?
echo "$R" | grep -q '"appointment":null'; report "overview has no appointment initially" $?

# ============================================================================
echo "== Test 1: normal AM booking (no queue number yet) =="
R=$(post /tmp/jar1.txt "/api/appointments.php?action=book" -d "{\"date\":\"$TOMORROW\",\"window\":\"AM\"}")
echo "$R" | grep -q '"appointment_status":"SCHEDULED"'; report "book AM → SCHEDULED" $?
echo "$R" | grep -qE 'OV-|RQ-'; NOQ=$?
[ $NOQ -ne 0 ]; report "booking response contains NO queue number" $?
N=$(val "SELECT COUNT(*) FROM queues;")
[ "$N" = "0" ]; report "queues table still empty after booking" $?

# ============================================================================
echo "== Test 2: normal PM booking (second client) =="
login /tmp/jar2.txt mariasantos
R=$(post /tmp/jar2.txt "/api/appointments.php?action=book" -d "{\"date\":\"$TOMORROW\",\"window\":\"PM\"}")
echo "$R" | grep -q '"appointment_status":"SCHEDULED"'; report "book PM → SCHEDULED (mariasantos)" $?

# ============================================================================
echo "== Test 3: duplicate booking rejected =="
R=$(post /tmp/jar1.txt "/api/appointments.php?action=book" -d "{\"date\":\"$TOMORROW\",\"window\":\"PM\"}")
echo "$R" | grep -q 'already has an appointment'; report "duplicate booking rejected (UNIQUE application_id)" $?

# ============================================================================
echo "== Test 4: unauthorized application access =="
login /tmp/jar3.txt pedroramos
R=$(get /tmp/jar3.txt "/api/appointments.php?action=overview")
echo "$R" | grep -q 'OL-2026-0001'; U1=$?
echo "$R" | grep -q 'OL-2026-0004'; U2=$?
if [ $U1 -ne 0 ] && [ $U2 -eq 0 ]; then report "cross-client data isolation (pedroramos sees only OL-2026-0004)" 0; else report "cross-client data isolation" 1; fi

# ============================================================================
echo "== Test 5: FULL sessions =="
SID=$(val "SELECT schedule_id FROM schedule_capacities WHERE schedule_date='$TOMORROW' AND time_window='AM';")
sql "UPDATE schedule_capacities SET booked_slots=30 WHERE schedule_id=$SID;"
R=$(post /tmp/jar3.txt "/api/appointments.php?action=book" -d "{\"date\":\"$TOMORROW\",\"window\":\"AM\"}")
echo "$R" | grep -q 'already full'; report "AM FULL — booking blocked" $?
R=$(get /tmp/jar3.txt "/api/appointments.php?action=schedules&year=${TOMORROW:0:4}&month=${TOMORROW:5:2}")
echo "$R" | grep -q '"state":"FULL"'; report "schedules shows FULL state" $?
sql "UPDATE schedule_capacities SET booked_slots=0 WHERE schedule_id=$SID;"

SID=$(val "SELECT schedule_id FROM schedule_capacities WHERE schedule_date='$TOMORROW' AND time_window='PM';")
sql "UPDATE schedule_capacities SET booked_slots=30 WHERE schedule_id=$SID;"
R=$(post /tmp/jar3.txt "/api/appointments.php?action=book" -d "{\"date\":\"$TOMORROW\",\"window\":\"PM\"}")
echo "$R" | grep -q 'already full'; report "PM FULL — booking blocked" $?
sql "UPDATE schedule_capacities SET booked_slots=0 WHERE schedule_id=$SID;"

# ============================================================================
echo "== Test 6: check-in window — too early, then ON-TIME at 7:30 / 8:30 / 10:30 =="
# The old 8:30 grace cutoff is GONE: everything inside 07:30–10:59 is on-time.
sql "UPDATE appointments SET appointment_status='CANCELLED' WHERE application_id=1;"
R=$(post /tmp/jar1.txt "/api/appointments.php?action=book" -H "X-CSWDO-Test-Now: $TODAY 07:00:00" -d "{\"date\":\"$TODAY\",\"window\":\"AM\"}")
echo "$R" | grep -q '"appointment_status":"SCHEDULED"'; report "same-day AM booking at 07:00 allowed" $?

R=$(post /tmp/jar1.txt "/api/appointments.php?action=checkin" -H "X-CSWDO-Test-Now: $TODAY 07:00:00")
echo "$R" | grep -q 'not yet available'; report "07:00 check-in blocked (too early)" $?
echo "$R" | grep -q '7:30 AM'; report "error names 7:30 AM opening" $?

R=$(post /tmp/jar1.txt "/api/appointments.php?action=checkin" -H "X-CSWDO-Test-Now: $TODAY 07:30:00")
echo "$R" | grep -q '"queue_number":"OV-001"'; report "07:30 check-in → OV-001 (on-time)" $?
echo "$R" | grep -q '"appointment_status":"CHECKED_IN"'; report "appointment → CHECKED_IN" $?
val "SELECT queue_number FROM queues WHERE application_id=1;" | grep -q "^OV-001$"
report "queues row: OV-001" $?
val "SELECT queue_type FROM queues WHERE application_id=1;" | grep -q "ONLINE_VERIFICATION"
report "queue_type ONLINE_VERIFICATION" $?

R=$(post /tmp/jar1.txt "/api/appointments.php?action=checkin" -H "X-CSWDO-Test-Now: $TODAY 07:35:00")
echo "$R" | grep -q 'already been checked in'; report "double check-in rejected" $?

# 08:30 — exactly the old grace cutoff — is still on-time.
sql "UPDATE appointments SET appointment_status='CANCELLED' WHERE application_id=2;"
R=$(post /tmp/jar2.txt "/api/appointments.php?action=book" -H "X-CSWDO-Test-Now: $TODAY 07:10:00" -d "{\"date\":\"$TODAY\",\"window\":\"AM\"}")
echo "$R" | grep -q '"appointment_status":"SCHEDULED"'; report "maria books today AM" $?
R=$(post /tmp/jar2.txt "/api/appointments.php?action=checkin" -H "X-CSWDO-Test-Now: $TODAY 08:30:00")
echo "$R" | grep -q '"queue_number":"OV-002"'; report "08:30 check-in → OV-002 (on-time, was grace cutoff)" $?

# 10:30 — previously marked LATE under the 8:30 grace rule — is now ON-TIME.
login /tmp/jar4.txt rosareyes
R=$(post /tmp/jar4.txt "/api/appointments.php?action=book" -H "X-CSWDO-Test-Now: $TODAY 07:20:00" -d "{\"date\":\"$TODAY\",\"window\":\"AM\"}")
echo "$R" | grep -q '"appointment_status":"SCHEDULED"'; report "rosa books today AM" $?
R=$(post /tmp/jar4.txt "/api/appointments.php?action=checkin" -H "X-CSWDO-Test-Now: $TODAY 10:30:00")
echo "$R" | grep -q '"queue_number":"OV-003"'; report "10:30 check-in → OV-003 (on-time, previously LATE)" $?
echo "$R" | grep -q '"late":false'; report "10:30 check-in NOT late" $?

# ============================================================================
echo "== Test 7: AM-late at 11:15 → LATE + PM re-queue eligible =="
# pedro books today AM, arrives 11:15 (past 11:00 on-time end, before 12:00 close).
R=$(post /tmp/jar3.txt "/api/appointments.php?action=book" -H "X-CSWDO-Test-Now: $TODAY 07:00:00" -d "{\"date\":\"$TODAY\",\"window\":\"AM\"}")
echo "$R" | grep -q '"appointment_status":"SCHEDULED"'; report "pedroramos books today AM" $?

R=$(post /tmp/jar3.txt "/api/appointments.php?action=checkin" -H "X-CSWDO-Test-Now: $TODAY 11:15:00")
echo "$R" | grep -q '"late":true'; report "11:15 check-in → marked LATE" $?
echo "$R" | grep -q '"can_requeue_pm":true'; report "late flow: can_requeue_pm true" $?
echo "$R" | grep -q '"pm_has_capacity":true'; report "late flow: pm_has_capacity true" $?
echo "$R" | grep -q '"suggest_reschedule":true'; report "late flow: suggest_reschedule true" $?
val "SELECT appointment_status FROM appointments WHERE application_id=4;" | grep -q '^LATE$'
report "appointment row is LATE" $?

# Simulate the bypassed-ticket case: pedro had drawn an on-time OV ticket that
# was never served (e.g. called while absent). It must be invalidated on re-queue.
sql "INSERT INTO queues (application_id, queue_number, queue_type, queue_date, time_window, queue_status, called_at)
     VALUES (4, 'OV-004', 'ONLINE_VERIFICATION', '$TODAY', 'AM', 'WAITING', NULL);"

# ============================================================================
echo "== Test 8: re-queue AM → PM (slot transfer, RQ at tail) =="
BEFORE_AM=$(val "SELECT booked_slots FROM schedule_capacities WHERE schedule_id=$AM_SID;")
BEFORE_PM=$(val "SELECT booked_slots FROM schedule_capacities WHERE schedule_id=$PM_SID;")
R=$(post /tmp/jar3.txt "/api/appointments.php?action=late_requeue" -H "X-CSWDO-Test-Now: $TODAY 11:20:00")
echo "$R" | grep -q '"queue_number":"RQ-001"'; report "re-queue → RQ-001" $?
echo "$R" | grep -q '"queue_type":"RE_QUEUE"'; report "queue_type RE_QUEUE" $?
echo "$R" | grep -q '"time_window":"PM"'; report "new ticket belongs to the PM session" $?
AFTER_AM=$(val "SELECT booked_slots FROM schedule_capacities WHERE schedule_id=$AM_SID;")
AFTER_PM=$(val "SELECT booked_slots FROM schedule_capacities WHERE schedule_id=$PM_SID;")
[ "$AFTER_AM" = "$((BEFORE_AM-1))" ]; report "AM booked_slots decremented ($BEFORE_AM → $AFTER_AM)" $?
[ "$AFTER_PM" = "$((BEFORE_PM+1))" ]; report "PM booked_slots incremented ($BEFORE_PM → $AFTER_PM)" $?
val "SELECT schedule_id FROM appointments WHERE application_id=4;" | grep -q "^$PM_SID$"
report "appointment schedule_id moved to the PM row" $?
val "SELECT queue_status FROM queues WHERE application_id=4 AND queue_number='OV-004';" | grep -q '^NO_SHOW$'
report "bypassed OV-004 invalidated (NO_SHOW)" $?
val "SELECT control_number FROM applications WHERE application_id=4;" | grep -q '^OL-2026-0004$'
report "control number unchanged after re-queue" $?
val "SELECT appointment_status FROM appointments WHERE application_id=4;" | grep -q '^CHECKED_IN$'
report "appointment → CHECKED_IN after re-queue" $?

# ============================================================================
echo "== Test 9: re-queue refused when PM is full =="
sql "DELETE FROM queues WHERE application_id=4 AND queue_type='RE_QUEUE';
     UPDATE appointments SET appointment_status='LATE', schedule_id=$AM_SID WHERE application_id=4;
     UPDATE schedule_capacities SET booked_slots=0 WHERE schedule_date='$TODAY';
     UPDATE schedule_capacities SET booked_slots=30 WHERE schedule_id=$PM_SID;"
R=$(post /tmp/jar3.txt "/api/appointments.php?action=late_requeue" -H "X-CSWDO-Test-Now: $TODAY 11:40:00")
echo "$R" | grep -q 'No remaining queue capacity'; report "PM full → reschedule message" $?
N=$(val "SELECT COUNT(*) FROM queues WHERE queue_type='RE_QUEUE' AND queue_date='$TODAY';")
[ "$N" = "0" ]; report "no RE_QUEUE row created when PM capacity full" $?
val "SELECT appointment_status FROM appointments WHERE application_id=4;" | grep -q '^LATE$'
report "appointment stays LATE (not faked to CHECKED_IN)" $?
sql "UPDATE schedule_capacities SET booked_slots=0 WHERE schedule_date='$TODAY';"

# ============================================================================
echo "== Test 10: PM-late (≥5:00 PM) → mandatory reschedule =="
# rosa abandons her (already served) AM slot and holds a PM appointment; at
# 17:05 the operational day is over — no same-day requeue is possible.
sql "UPDATE appointments SET appointment_status='CANCELLED' WHERE application_id=3;"
R=$(post /tmp/jar4.txt "/api/appointments.php?action=book" -H "X-CSWDO-Test-Now: $TODAY 12:30:00" -d "{\"date\":\"$TODAY\",\"window\":\"PM\"}")
echo "$R" | grep -q '"appointment_status":"SCHEDULED"'; report "rosa books today PM" $?

R=$(post /tmp/jar4.txt "/api/appointments.php?action=checkin" -H "X-CSWDO-Test-Now: $TODAY 17:05:00")
echo "$R" | grep -q '"late":true'; report "17:05 PM check-in → marked LATE" $?
echo "$R" | grep -q '"can_requeue_pm":false'; report "PM-late: can_requeue_pm false" $?
echo "$R" | grep -q '"must_reschedule_tomorrow":true'; report "PM-late: must_reschedule_tomorrow true" $?
val "SELECT appointment_status FROM appointments WHERE application_id=3;" | grep -q '^LATE$'
report "PM appointment row is LATE" $?

R=$(post /tmp/jar4.txt "/api/appointments.php?action=late_requeue" -H "X-CSWDO-Test-Now: $TODAY 17:10:00")
echo "$R" | grep -q 'office day has concluded'; report "PM re-queue refused — office day concluded" $?
echo "$R" | grep -q 'next available working day'; report "PM refusal points to next working day" $?
N=$(val "SELECT COUNT(*) FROM queues WHERE application_id=3 AND queue_type='RE_QUEUE';")
[ "$N" = "0" ]; report "no RE_QUEUE row generated after PM close" $?
val "SELECT appointment_status FROM appointments WHERE application_id=3;" | grep -q '^LATE$'
report "PM appointment stays LATE" $?

# ============================================================================
echo "== Test 11: reschedule + after-close behavior =="
# juan was CHECKED_IN from Test 6 — release him so reschedule is permitted.
sql "UPDATE appointments SET appointment_status='SCHEDULED' WHERE application_id=1;"
R=$(post /tmp/jar1.txt "/api/appointments.php?action=reschedule" -d "{\"date\":\"$TOMORROW\",\"window\":\"PM\"}")
echo "$R" | grep -q '"appointment_status":"RESCHEDULED"'; report "reschedule to tomorrow PM works" $?

R=$(post /tmp/jar1.txt "/api/appointments.php?action=checkin" -H "X-CSWDO-Test-Now: $TODAY 18:00:00")
echo "$R" | grep -q 'only available on your scheduled appointment date'; report "check-in on wrong day blocked" $?

R=$(get /tmp/jar1.txt "/api/appointments.php?action=schedules&year=${TODAY:0:4}&month=${TODAY:5:2}" -H "X-CSWDO-Test-Now: $TODAY 18:00:00")
T=$($PHP -r '$in=json_decode(stream_get_contents(STDIN),true);$days=$in["days"]??[];$day=array_values(array_filter($days,fn($x)=>($x["date"]??null)===$argv[1]));echo json_encode($day[0]["sessions"]??null);' "$TODAY" <<< "$R")
echo "$T" | grep -q '"AM":{"state":"CLOSED"'; report "AM CLOSED after 12:00 PM" $?
echo "$T" | grep -q '"PM":{"state":"CLOSED"'; report "PM CLOSED after 5:00 PM" $?

# Booking today after close: pedro's row set CANCELLED, then book at 18:00.
sql "UPDATE appointments SET appointment_status='CANCELLED' WHERE application_id=4;"
R=$(post /tmp/jar3.txt "/api/appointments.php?action=book" -H "X-CSWDO-Test-Now: $TODAY 18:00:00" -d "{\"date\":\"$TODAY\",\"window\":\"AM\"}")
echo "$R" | grep -qi 'closed'; report "booking today AM after close rejected" $?

# ============================================================================
echo "== Test 12: employee portal endpoints (staff identity + live sync) =="
# Staff login (TEST_MODE identity switch), dashboard reads the same DB the
# client portal writes, and the office terminal reuses the client business
# cores (perform_checkin / perform_late_requeue).
rm -f /tmp/jarS.txt   # fresh cookie jar: the auto-session check starts signed out
R=$(post /tmp/jarS.txt "/api/auth.php?action=me&scope=employee")
echo "$R" | grep -q '"identity_kind":"employee"'; report "employee auto-session (no login screen)" $?
R=$(post /tmp/jarS.txt "/api/appointments.php?action=dashboard")
echo "$R" | grep -q '"ok":true'; report "dashboard reachable for the auto-bound officer" $?

R=$(post /tmp/jarS.txt "/api/auth.php?action=staff_login" -d '{"username":"cswdostaff","password":"wrong-password"}')
echo "$R" | grep -q 'invalid_credentials'; report "staff_login with a wrong password refused (401)" $?

stafflogin /tmp/jarS.txt cswdostaff
R=$(post /tmp/jarS.txt "/api/auth.php?action=me")
echo "$R" | grep -q '"identity_kind":"employee"'; report "staff login → employee identity" $?

R=$(get /tmp/jarS.txt "/api/appointments.php?action=dashboard&date=$TOMORROW")
echo "$R" | grep -q 'OL-2026-0001'; report "dashboard lists the client booking (live sync)" $?
echo "$R" | grep -q '"total":1'; report "dashboard summary total = 1" $?

# Office check-in for the client's tomorrow-PM appointment (juan, rescheduled
# in Test 11): 12:30 PM is inside the PM on-time window → OV-001.
R=$(post /tmp/jarS.txt "/api/appointments.php?action=employee_checkin" -H "X-CSWDO-Test-Now: $TOMORROW 12:30:00" -d '{"control_number":"OL-2026-0001"}')
echo "$R" | grep -q '"queue_number":"OV-001"'; report "employee_checkin → OV-001" $?
echo "$R" | grep -q '"appointment_status":"CHECKED_IN"'; report "employee_checkin → CHECKED_IN" $?

R=$(get /tmp/jarS.txt "/api/appointments.php?action=queue&date=$TOMORROW")
echo "$R" | grep -q '"queue_number":"OV-001"'; report "queue board shows the new ticket" $?
QID=$(val "SELECT queue_id FROM queues WHERE queue_date='$TOMORROW' AND queue_number='OV-001';")
R=$(post /tmp/jarS.txt "/api/appointments.php?action=serve" -d "{\"queue_id\":$QID}")
echo "$R" | grep -q 'marked as served'; report "serve → ticket completed" $?
val "SELECT queue_status FROM queues WHERE queue_id=$QID;" | grep -q '^COMPLETED$'
report "queue row is COMPLETED after serve" $?

AMT_SID=$(val "SELECT schedule_id FROM schedule_capacities WHERE schedule_date='$TOMORROW' AND time_window='AM';")
R=$(post /tmp/jarS.txt "/api/appointments.php?action=toggle_lock" -d "{\"schedule_id\":$AMT_SID}")
echo "$R" | grep -q 'Session locked'; report "toggle_lock locks the session" $?
R=$(post /tmp/jarS.txt "/api/appointments.php?action=toggle_lock" -d "{\"schedule_id\":$AMT_SID}")
echo "$R" | grep -q 'Session unlocked'; report "toggle_lock unlocks it again" $?

# ============================================================================
echo ""
echo "=============================="
echo "PASS: $PASS   FAIL: $FAIL"
echo "=============================="
exit $FAIL
