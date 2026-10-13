# Module 6: Notification & Tracking: UI/UX Flow Guide

This guide explains what Module 6 shows, to whom, and when, so the screens can be designed consistently. Items marked **(to confirm)** are still open questions.

---

## 1. What Module 6 does

Module 6 doesn't create or approve applications. It **tells people what happened** and **shows where things stand**.

| Part | Purpose | Main users |
|---|---|---|
| Notification & Alert | Tells the right person when something needs their attention, including the 10-minute overdue alert for admins | Client, Staff, Admin |
| Application Tracking | Shows an application's current status and history | Client, Staff, Admin |
| Reporting | Summarizes all applications into statistics and printable reports | Admin (some views for Staff) |

---

## 2. Roles

| Role | What they need from this module |
|---|---|
| **Client** | "Where is my application, and do I need to do anything?" |
| **Staff (Employee)** | "Which applications need my action? Did Admin decide on my cases?" |
| **Admin** | "What is waiting for my review, what is overdue, and how is the office doing overall?" |

---

## 3. Key concepts the UI must keep separate

These three ideas are different. Don't mix them in one badge or label.

1. **Application Status** is where the application is in the process (for example `For Interview`). It is shown as a status badge.
2. **Alert / Priority Level** is how long Admin has been waiting to act (`Normal`, `Reminder`, `Overdue`). It is shown as a separate highlight, not as a status.
3. **Queue Status** is where the person is in the office queue. This belongs to the Queue module (Module 7), and Module 6 only links to it.

Two identifiers also appear on screens:

- **Control Number** (example `ON-2026-00125`) is permanent for the application, and clients use it to track status.
- **Queue Number** (example `WI-023`) is temporary and only for the office visit.

---

## 4. Application status flow

This is the full path an application can take.

```
APPLICATION SUBMITTED
        |
        v
    FOR REVIEW
        |
        v
     REVIEWING
        |
   +----+--------------------+
   |                         |
INCOMPLETE               COMPLETE
   |                         |
   v                         v
FOR CORRECTION          FOR INTERVIEW
                             |
                             v
                   INTERVIEW IN PROGRESS
                             |
                             v
                    INTERVIEW COMPLETED
                             |
                             v
                     STAFF REPORT READY
                             |
                             v
                      FOR ADMIN REVIEW  <------+
                             |                 |
                             v                 |
                      ADMIN REVIEWING          |
                             |                 |
              +--------------+------------+    |
              |                           |    |
   RETURNED FOR CORRECTION             APPROVED|
              |                           |    |
              +-- Staff corrects ---------+    |
                  and resubmits ---------------+
                                          |
                                          v
                                ASSISTANCE PROCESSING
                                          |
                                          v
                                      COMPLETED
```

**Important for wording:** "Interview completed" does **not** mean approved. Clients should see that their case is waiting for Admin review. Avoid the word **"Rejected"**. The system uses **"Returned for Correction"** instead.

### Client-facing labels (proposed)

| Database status | What the client sees | Short explanation shown to the client |
|---|---|---|
| `APPLICATION_SUBMITTED` | Submitted | Your application was received. |
| `FOR_REVIEW` | For Review | Waiting for staff to check your requirements. |
| `REVIEWING` | Reviewing | Staff is checking your documents. |
| `FOR_CORRECTION` | Needs Correction | Some requirements are incomplete. See remarks. |
| `FOR_INTERVIEW` | For Interview | Please proceed to your interview. |
| `INTERVIEW_IN_PROGRESS` | Interview in Progress | You are being interviewed. |
| `INTERVIEW_COMPLETED` | Interview Completed | Interview done. Your case is being prepared for review. |
| `STAFF_REPORT_READY` | Report Ready | Staff report is ready. |
| `FOR_ADMIN_REVIEW` | For Admin Review | Waiting for the administrator's decision. |
| `ADMIN_REVIEWING` | Under Admin Review | The administrator is reviewing your case. |
| `RETURNED_FOR_CORRECTION` | Returned for Correction | Your case was returned. See remarks. |
| `APPROVED` | Approved | Approved. Next: assistance processing/release. |
| `ASSISTANCE_PROCESSING` | Processing Assistance | Your assistance is being prepared. |
| `COMPLETED` | Completed | Done. Please share your feedback. |

### Suggested status colors (final palette is up to the UI/UX team)

| Group | Statuses | Suggestion |
|---|---|---|
| In progress | Submitted, For Review, Reviewing, Interview stages | Blue shades |
| Waiting on someone | For Admin Review, Admin Reviewing | Amber or light blue |
| Needs attention | Needs Correction, Returned for Correction | Orange |
| Good outcome | Approved, Processing, Completed | Green |

Don't rely on color alone. Always include the text label.

---

## 5. Client pages

### 5.1 My Applications (list)
**Purpose:** see all of my applications at a glance.
- Table or card list: Control No., Assistance Type, Date Submitted, Status badge, "View" button.
- Sort by newest first. Optional filter by status.
- **Empty state:** "You have no applications yet." with an "Apply for Assistance" button.

### 5.2 Track Application (detail)
**Purpose:** show exactly where one application stands. This is the most visible screen in the module.
- **Header:** Control Number, Assistance Type, Date Submitted, current status badge.
- **Progress stepper/timeline** (horizontal or vertical) with the main stages:
  `Submitted → Review → Interview → Admin Review → Approved → Completed`
  Completed steps are checked, the current step is highlighted, and future steps are greyed out.
- **History list:** each status change with date/time and a short note.
- **Remarks box:** shown only if the application is returned or needs correction, with a clear "What you need to do" message.
- **Appointment info:** schedule date and AM/PM, if the application is online. (Data comes from the scheduling module.)
- **Returned state:** a visible callout at the top, such as "Your application needs correction. See remarks below."

### 5.3 Feedback survey **(to confirm: Module 6 or Module 9?)**
**Purpose:** collect a satisfaction rating after completion.
- Appears only when status is `COMPLETED`.
- 1 to 5 star rating plus an optional comment box. One submission per application.
- After submitting, show a thank-you message and hide the form.

---

## 6. Staff pages

### 6.1 Application list
**Purpose:** find and open applications.
- Table: Control No., Client Name, Assistance Type, Online/Walk-in, Status badge, Date.
- **Filters:** status, assistance type, online vs walk-in, date range.
- **Search** by Control Number.
- Row click opens the application details.

### 6.2 Notifications (see section 8)
Staff mainly see: new applications, Admin decisions (approved or returned), and corrections needed.

---

## 7. Admin pages

### 7.1 Admin Review Alert Panel
**Purpose:** show how much is waiting for review. It sits at the top of the admin dashboard.

```
Notifications
  12 New for Review
   4 Waiting more than 5 minutes
   2 Overdue (more than 10 minutes)
```
- Each number is clickable and opens the review table filtered accordingly.
- Overdue count is visually strongest (for example red).

### 7.2 Pending Review table
**Purpose:** the queue of cases waiting for the Admin.

| Control No. | Assistance | Submitted | Waiting | Alert |
|---|---|---|---|---|
| ON-2026-00125 | Medical | 9:10 AM | 8 min | Reminder |
| ON-2026-00126 | Financial | 9:14 AM | 4 min | Normal |
| WI-2026-00451 | Burial | 9:18 AM | 12 min | Overdue |

- Longest-waiting first.
- Overdue rows are highlighted.
- Row click opens the review screen (built by the Admin Review module).

### 7.3 Overdue banner
**Purpose:** a visible warning when something has waited too long.
- Text example: "Application ON-2026-00125 has been waiting for administrative review for more than 10 minutes."
- Can be dismissed, but the row in the table stays highlighted until the application is reviewed.

### 7.4 Dashboard / Statistics
**Purpose:** overall picture of the office.
- Summary cards: total applications, applications per status, registered clients, completed this month.
- Charts: applications per assistance type, online vs walk-in, applications over time.
- Average processing time (submission to completion).

### 7.5 Reports page
**Purpose:** produce printable or exportable reports.
- **Filters:** date range, assistance type, status, application type.
- Results table with totals.
- **Actions:** Print, Export PDF, Export CSV.

### 7.6 Completed records and feedback summary
- List of completed cases.
- Average rating, rating distribution, and recent comments.

---

## 8. Notifications (all roles)

### 8.1 Notification bell (in the shared navbar)
- Bell icon with an **unread count badge**.
- Dropdown shows the latest 5 to 10 notifications and a "View all" link.
- Unread items look different from read items (for example bold or a blue dot).
- Clicking a notification marks it read and opens the related application.

### 8.2 Notifications page
- Full list, newest first.
- Filters: All, Unread.
- Buttons: "Mark as read" per item and "Mark all as read".
- **Empty state:** "You're all caught up."

### 8.3 What triggers a notification

| Event | Client | Staff | Admin |
|---|---|---|---|
| Application submitted | Yes (confirms Control No.) | Yes (new application) | |
| Needs correction | Yes | | |
| For interview | Yes | | |
| For Admin Review | Yes ("not yet approved") | | Yes (new in queue) |
| 5 minutes waiting | | | Yes (reminder) |
| 10 minutes waiting | | | Yes (**overdue alert**) |
| Admin approved | Yes | Yes (prepare release) | |
| Admin returned for correction | Yes | Yes (correct and resubmit) | |
| Completed | Yes (with feedback prompt) | | |

### 8.4 Alert levels for Admin

| Waiting time | Level | Look and feel |
|---|---|---|
| 0 to 5 minutes | Normal | No urgent styling |
| 5 to 10 minutes | Reminder | Soft warning (amber) |
| More than 10 minutes | Overdue | Strong warning (red) |

**Rule:** the overdue alert **only notifies**. It never changes the application status and never auto-approves.

---

## 9. End-to-end flow summary

```
CLIENT submits application
   -> client gets "Submitted" notification
   -> staff gets "New application" notification

STAFF verifies and interviews
   -> client sees status moving: Review -> Interview

STAFF finishes report
   -> status: FOR ADMIN REVIEW
   -> client sees "Waiting for administrator" (not approved yet)
   -> all admins get a notification
   -> timer starts

ADMIN review timer
   0-5 min   Normal
   5-10 min  Reminder
   10+ min   OVERDUE alert

ADMIN decides
   |-- Approved  -> client + staff notified -> Processing -> Completed -> feedback survey
   |-- Returned  -> client + staff notified -> staff corrects -> resubmits
                    -> back to FOR ADMIN REVIEW (timer restarts)
```

---

## 10. Design requirements and notes

- **Theme:** blue and white, with the Pasig logo, following the shared design system from the UI/UX & Frontend team.
- Use the shared components for navbar, sidebar, buttons, cards, tables, modals, and status badges.
- **Responsive:** clients are likely to use phones, so Track Application and My Applications must work on small screens.
- **Accessibility:** status and alert levels need text labels, not color alone. Keep contrast readable.
- **Auto-refresh:** the Admin panel refreshes by itself about every 30 to 60 seconds so the counts stay current.
- **Language:** plain, simple wording. Many clients are not familiar with government terms. Tagalog labels could be considered **(to confirm)**.

---

## 11. Open questions

1. Who builds the **feedback survey** page: Module 6 or Module 9?
2. Are notifications **in-app only**, or also email/SMS?
3. Should clients see Tagalog or bilingual status labels?
4. Does "expenses report" in the project notes mean a deployment cost table (a project document) rather than a system page?

---

## 12. Who to ask

| Topic | Module |
|---|---|
| Queue numbers, calling applicants | Module 7: Queue Management |
| Admin approve/return screens | Module 9: Admin Review & Approval |
| Control Number generation | Modules 3 and 4: Online and Walk-in Application |
| Shared styles and components | Module 12: UI/UX & Frontend Integration |
