# GroomBook API — UAT Playbook

This document captures user-acceptance test cases for GroomBook API features. Each section corresponds to a feature or bug-fix PR. Update this file when a PR changes user-facing behaviour.

---

## 1. Appointment Booking (`/api/appointments`)

### 1.1 Create Appointment
- [ ] POST `/api/appointments` with valid payload → 201, appointment returned with generated id
- [ ] Overlapping staff appointment → 409 conflict error returned
- [ ] `endTime` before `startTime` → 422 error

### 1.2 Update Appointment (PATCH `/api/appointments/:id`)
- [ ] Extending `endTime` on a `scheduled` appointment triggers cascade delay prevention if downstream appointments exist
- [ ] Extending `endTime` returns `cascade` object in response with shifted appointments
- [ ] Extending `endTime` sends reschedule email to each affected client
- [ ] Appointments outside business hours after shift are flagged in `cascade.flaggedForReview` instead of auto-shifted
- [ ] Only `scheduled` and `confirmed` downstream appointments are shifted; `in_progress`, `completed`, `cancelled` are skipped
- [ ] Cascade stops when a downstream appointment no longer conflicts with the shifted boundary
- [ ] Shifts are included in API response under `cascade.shifted[]`

### 1.3 Series (Recurring) Appointments
- [ ] Updating one occurrence with `cascadeMode: "this_and_future"` shifts that occurrence and all future ones
- [ ] Updating one occurrence with `cascadeMode: "all"` shifts every occurrence in the series

---

## 2. Cascade Delay Prevention

### 2.1 Basic Cascade
- [ ] When a groomer's appointment overruns, the next same-groomer `scheduled` appointment shifts forward
- [ ] Delta applied to both `startTime` and `endTime` (duration preserved)
- [ ] Cascade propagates through multiple downstream appointments

### 2.2 Buffer Time
- [ ] A configurable buffer (default 15 minutes) is added between the overrunning appointment end and the shifted start
- [ ] Cascade respects the buffer between each consecutive pair of appointments

### 2.3 Business Hours Guard
- [ ] If a proposed shift would place an appointment start or end outside business hours, it is flagged instead of shifted
- [ ] Flagged appointments are listed in `cascade.flaggedForReview[]` with reason text

### 2.4 Email Notification
- [ ] Each shifted appointment triggers a reschedule email to the client
- [ ] Email includes original time (struck through) and new time
- [ ] Email is skipped silently if SMTP is not configured

### 2.5 Status Transition Overrun
- [ ] When an `in_progress` appointment's actual end time exceeds `endTime + bufferMinutes`, the cascade is triggered using the status transition path

---

## 3. Authentication & RBAC

### 3.1 Staff Authentication
- [ ] Unauthenticated request → 401
- [ ] Groomer role can only view/edit their own appointments → 403 for others
- [ ] Manager role can view/edit all appointments

### 3.2 Client Authentication
- [ ] Clients can access their own appointments via tokenized links
- [ ] Tokenized confirm/cancel links work without authentication