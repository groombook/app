# UAT Playbook

## 1. Overview

GroomBook is an open-source, self-hostable pet grooming business management & CRM platform. The monorepo contains the Hono API (`apps/api`), React PWA web app (`apps/web`), E2E tests (`apps/e2e`), and shared packages (`packages/db`, `packages/types`). Tech stack: Hono + React 19 + Vite + PostgreSQL + Drizzle ORM + Authentik OIDC.

## 2. Environments

| Environment | URL | Notes |
|-------------|-----|-------|
| Dev | `https://dev.groombook.dev` | Development environment for active development |
| UAT | `https://uat.groombook.dev` | User Acceptance Testing environment |
| Production | `https://demo.groombook.dev` | Production/demo environment |

**Local Development:** Run `docker compose up --build` at repository root. Web app available at `localhost:8080`, API at `localhost:3000`.

## 3. Pre-conditions

- UAT environment is accessible at `https://uat.groombook.dev`
- Test accounts are seeded with the following personas:
  - **Manager:** Full administrative access
  - **Staff:** Limited access to assigned appointments and clients
  - **Client:** Portal access to view and manage their own appointments
- OIDC is configured with Authentik at `https://auth.farh.net`
- Seed data is populated:
  - Sample clients and pets
  - Grooming services with pricing and duration
  - Existing appointments
- Stripe test keys are configured for payment flow testing
- Email/SMS providers (Telnyx, etc.) are configured for notification testing

## 4. Test Cases

### 4.1 Authentication

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.1.1 | OIDC login | 1. Navigate to UAT environment<br>2. Click "Login with Authentik"<br>3. Enter test credentials<br>4. Authorize the application | User is redirected to app dashboard, session is established |
| TC-APP-4.1.2 | Session persistence | 1. Log in as any user<br>2. Close browser tab<br>3. Reopen browser and navigate to UAT | User remains logged in, no re-authentication required |
| TC-APP-4.1.3 | Logout | 1. Log in as any user<br>2. Click logout button<br>3. Attempt to access protected route | User is logged out and redirected to login page |
| TC-APP-4.1.4 | RBAC - Manager access | 1. Log in as Manager<br>2. Navigate to Settings, Staff Management, Reports | All administrative features are accessible |
| TC-APP-4.1.5 | RBAC - Staff access | 1. Log in as Staff<br>2. Attempt to access Settings, Staff Management | Access denied or limited view, staff can only see assigned appointments |
| TC-APP-4.1.6 | RBAC - Client access | 1. Log in as Client<br>2. Navigate to portal<br>3. Attempt to access admin areas | Client can only view their own appointments, pets, and profile |

### 4.2 Setup Wizard / OOBE

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.2.1 | First-run setup | 1. Access fresh UAT environment with no configuration<br>2. Complete setup wizard: business name, hours, services | Configuration is saved, dashboard loads with setup complete |
| TC-APP-4.2.2 | Setup validation | 1. Start setup wizard<br>2. Leave required fields blank<br>3. Attempt to proceed | Validation errors displayed, cannot proceed without required fields |
| TC-APP-4.2.3 | Skip setup (if already configured) | 1. Access configured environment<br>2. Attempt to access setup wizard | Redirected to dashboard or setup is marked as complete |

### 4.3 Client Management

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.3.1 | Create new client | 1. Navigate to Clients page<br>2. Click "Add Client"<br>3. Fill in client details (name, email, phone, address)<br>4. Save | Client is created and appears in client list |
| TC-APP-4.3.2 | Edit client | 1. Select existing client<br>2. Click "Edit"<br>3. Modify client details<br>4. Save | Changes are saved and reflected in client profile |
| TC-APP-4.3.3 | Search clients | 1. Navigate to Clients page<br>2. Enter client name or email in search<br>3. Press Enter/submit | Search results display matching clients |
| TC-APP-4.3.4 | Archive client | 1. Select active client<br>2. Click "Archive"<br>3. Confirm action | Client is marked as archived, no longer appears in active client list |

### 4.4 Pet Management

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.4.1 | Add pet to client | 1. Select client<br>2. Click "Add Pet"<br>3. Fill in pet details (name, breed, weight, notes)<br>4. Save | Pet is added to client's pet list |
| TC-APP-4.4.2 | Edit pet information | 1. Select pet from client profile<br>2. Click "Edit"<br>3. Modify pet details<br>4. Save | Changes are saved and reflected |
| TC-APP-4.4.3 | View grooming history | 1. Select pet with past appointments<br>2. Navigate to "History" tab | All past grooming appointments and notes are displayed |
| TC-APP-4.4.4 | Add breed notes | 1. Edit pet<br>2. Add breed-specific notes (temperament, special handling)<br>3. Save | Notes are saved and visible to staff when scheduling |

### 4.5 Appointment Scheduling

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.5.1 | Create new appointment | 1. Navigate to Calendar or Appointments page<br>2. Click "New Appointment"<br>3. Select client, pet, service, staff, date/time<br>4. Save | Appointment is created and appears in calendar |
| TC-APP-4.5.2 | Modify appointment | 1. Select existing appointment<br>2. Click "Edit"<br>3. Change date/time, staff, or service<br>4. Save | Changes are saved and calendar updates |
| TC-APP-4.5.3 | Cancel appointment | 1. Select upcoming appointment<br>2. Click "Cancel"<br>3. Confirm and optionally select reason | Appointment is marked as cancelled, slot becomes available |
| TC-APP-4.5.4 | Calendar view (day/week/month) | 1. Navigate to Calendar<br>2. Switch between day, week, and month views | Calendar displays appointments in selected time range correctly |
| TC-APP-4.5.5 | Appointment groups | 1. Create multiple appointments for same time slot<br>2. View in calendar | Appointments are grouped/linked appropriately |
| TC-APP-4.5.6 | Appointment availability check | 1. Attempt to book appointment during unavailable slot | System shows conflict or prevents double-booking |
| TC-APP-4.5.7 | Booking wizard — size/coat selection | 1. Start new appointment booking wizard<br>2. Select a pet with sizeCategory and coatType set<br>3. Observe the service/slot selection step | Size and coat type dropdowns are displayed and persist the pet's existing values |
| TC-APP-4.5.8 | Large/X-Large pet slot duration reflects buffer | 1. Add a pet with sizeCategory = "large" or "x-large" to an appointment<br>2. Note the service duration<br>3. Complete booking and inspect the appointment | Appointment slot includes the service duration plus the configured buffer for the pet's size category |
| TC-APP-4.5.9 | Appointment overrun cascades downstream | 1. Book three consecutive same-groomer appointments (A → B → C)<br>2. Manually extend appointment A's endTime so it overlaps B's startTime by ≥15 min<br>3. Observe appointment B | Appointment B (and C if still overlapping) is automatically shifted forward by the overrun delta + buffer; no error thrown |
| TC-APP-4.5.10 | Cascaded appointments appear at new times | 1. Complete TC-APP-4.5.9<br>2. Check the calendar/list view | Appointments B and C are now shown at their shifted start/end times |
| TC-APP-4.5.11 | Client receives reschedule notification email | 1. Complete TC-APP-4.5.9<br>2. Check the client's email (or notification log) | Client receives an email with subject/lines indicating their appointment was rescheduled from original time to new time |
| TC-APP-4.5.12 | Appointment flagged when shift crosses day boundary | 1. Book appointment D for late afternoon (e.g. 17:30)<br>2. Extend a prior appointment so D would shift to the next day<br>3. Observe D | Appointment D is flagged for manual review and is NOT auto-shifted to the next day |
| TC-APP-4.5.13 | Only scheduled/confirmed appointments are cascaded | 1. Start a cascade scenario (TC-APP-4.5.9) where a downstream appointment is already `in_progress`<br>2. Complete the cascade | The `in_progress` appointment is not shifted; cascade continues to next eligible appointment |

### 4.6 Services

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.6.1 | List all services | 1. Navigate to Services page | All configured grooming services are listed |
| TC-APP-4.6.2 | Create new service | 1. Click "Add Service"<br>2. Enter service name, description, duration, price<br>3. Save | Service is created and appears in list |
| TC-APP-4.6.3 | Edit service | 1. Select existing service<br>2. Modify pricing or duration<br>3. Save | Changes are saved and reflected |
| TC-APP-4.6.4 | Deactivate service | 1. Select service<br>2. Click "Deactivate"<br>3. Confirm | Service is marked as inactive, not available for new appointments |

### 4.7 Staff Management

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.7.1 | List all staff | 1. Navigate to Staff page | All staff members are listed with roles and status |
| TC-APP-4.7.2 | Add new staff member | 1. Click "Add Staff"<br>2. Enter staff details and assign role<br>3. Save | Staff member is created and can be assigned to appointments |
| TC-APP-4.7.3 | Assign RBAC role | 1. Select staff member<br>2. Change role (e.g., from Staff to Manager)<br>3. Save | Role change takes effect immediately |
| TC-APP-4.7.4 | Impersonate client | 1. As Manager, select client<br>2. Click "Impersonate"<br>3. Verify audit log | Manager views client's perspective, action is logged |
| TC-APP-4.7.5 | End impersonation | 1. While impersonating, click "End Impersonation" | Session returns to Manager's view |

### 4.8 Invoicing & Payments

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.8.1 | Generate invoice | 1. Select completed appointment<br>2. Click "Generate Invoice"<br>3. Review invoice details | Invoice is created with correct services, pricing, and taxes |
| TC-APP-4.8.2 | Process Stripe payment | 1. Open invoice<br>2. Click "Pay Now"<br>3. Enter Stripe test card details<br>4. Submit | Payment is processed, invoice marked as paid |
| TC-APP-4.8.3 | Add tip | 1. Before or after payment, add tip amount<br>2. Save | Tip is added to invoice total |
| TC-APP-4.8.4 | Generate receipt | 1. After payment, click "Generate Receipt"<br>2. Download or view receipt | Receipt is generated with payment details |
| TC-APP-4.8.5 | Process refund | 1. Select paid invoice<br>2. Click "Refund"<br>3. Enter refund amount and reason<br>4. Confirm | Refund is processed via Stripe, invoice status updated |
| TC-APP-4.8.6 | Failed payment handling | 1. Attempt payment with declined card<br>2. Verify error handling | Appropriate error message displayed, invoice remains unpaid |

### 4.9 Customer Portal

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.9.1 | Client login | 1. Access portal URL<br>2. Log in with client credentials | Client lands on portal dashboard |
| TC-APP-4.9.2 | View appointments | 1. Navigate to "My Appointments"<br>2. Review upcoming and past appointments | All client's appointments are listed |
| TC-APP-4.9.3 | Confirm appointment | 1. Select upcoming appointment<br>2. Click "Confirm" | Appointment is marked as confirmed by client |
| TC-APP-4.9.4 | Cancel appointment | 1. Select upcoming appointment<br>2. Click "Cancel"<br>3. Provide reason | Appointment is cancelled, notification sent to business |
| TC-APP-4.9.5 | View appointment history | 1. Navigate to "History" tab | All past appointments with details are shown |

### 4.9.1 Communication Tab

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.9.6 | View message history (conversation exists) | 1. Log in as client with existing conversation<br>2. Navigate to Communication tab | Real message history is displayed (not mock data) |
| TC-APP-4.9.7 | Empty state (no conversation yet) | 1. Log in as client with no conversation<br>2. Navigate to Communication tab | Empty state is shown; app does not crash or show mock messages |
| TC-APP-4.9.8 | Composer disabled | 1. Log in as client<br>2. Navigate to Communication tab | Composer/Reply field is hidden or disabled with tooltip "Reply from your phone" |
| TC-APP-4.9.9 | Cross-tenant isolation | 1. As client A, retrieve session token<br>2. Attempt to fetch client B conversation via API | Request returns 403 or empty; client A cannot access client B messages |

### 4.10 Waitlist

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.10.1 | Add client to waitlist | 1. Navigate to Waitlist page<br>2. Click "Add to Waitlist"<br>3. Select client, pet, preferred dates<br>4. Save | Client is added to waitlist |
| TC-APP-4.10.2 | View waitlist | 1. Navigate to Waitlist page | All waitlisted requests are displayed with priority |
| TC-APP-4.10.3 | Promote to appointment | 1. Select waitlist entry<br>2. Click "Promote to Appointment"<br>3. Select available slot | Appointment is created from waitlist, entry removed |
| TC-APP-4.10.4 | Remove from waitlist | 1. Select waitlist entry<br>2. Click "Remove"<br>3. Confirm | Entry is removed from waitlist |

### 4.11 Search

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.11.1 | Global search for clients | 1. Use global search bar<br>2. Enter client name or email<br>3. Select "Clients" | Search returns matching clients |
| TC-APP-4.11.2 | Global search for pets | 1. Use global search bar<br>2. Enter pet name or breed<br>3. Select "Pets" | Search returns matching pets with owner info |
| TC-APP-4.11.3 | Search filters | 1. Perform search<br>2. Apply filters (date range, status, etc.) | Results are filtered according to criteria |
| TC-APP-4.11.4 | No results handling | 1. Search for non-existent term<br>2. Verify UI | "No results found" message displayed |

### 4.12 Reports

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.12.1 | Revenue dashboard | 1. Navigate to Reports > Revenue<br>2. Select date range | Revenue metrics displayed (total, by service, by staff) |
| TC-APP-4.12.2 | Staff utilization | 1. Navigate to Reports > Utilization<br>2. Select date range | Staff hours booked vs. available shown |
| TC-APP-4.12.3 | Trend analytics | 1. Navigate to Reports > Trends<br>2. Select metric and time period | Trend chart displays with data points |
| TC-APP-4.12.4 | Export report | 1. View any report<br>2. Click "Export"<br>3. Select format (CSV, PDF) | Report file is downloaded |

### 4.13 Calendar

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.13.1 | Generate iCal feed | 1. Navigate to Calendar<br>2. Click "iCal Feed"<br>3. Copy URL | iCal feed URL is generated for external calendar apps |
| TC-APP-4.13.2 | Calendar sync (external) | 1. Import iCal feed into external calendar (Google, Outlook)<br>2. Verify sync | Appointments appear in external calendar |
| TC-APP-4.13.3 | Calendar availability display | 1. View calendar in any view mode | Available and booked slots are visually distinct |

### 4.14 Email Reminders

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.14.1 | Configure email reminders | 1. Navigate to Settings > Notifications<br>2. Set reminder timing (24h, 1h before)<br>3. Save | Configuration is saved |
| TC-APP-4.14.2 | Verify reminder delivery | 1. Create appointment for tomorrow<br>2. Wait for reminder trigger<br>3. Check test email account | Reminder email is received with correct details |
| TC-APP-4.14.3 | SMS notification | 1. Configure SMS provider (Telnyx)<br>2. Enable SMS reminders<br>3. Create appointment | SMS is sent to client's phone number |
| TC-APP-4.14.4 | Notification preferences | 1. As client, access portal settings<br>2. Toggle email/SMS preferences | Preferences are respected for future notifications |

### 4.15 Grooming Logs

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.15.1 | Log grooming entry | 1. Select pet<br>2. Click "Add Grooming Log"<br>3. Enter details (date, services, notes, photos)<br>4. Save | Log entry is created and linked to pet |
| TC-APP-4.15.2 | View grooming history | 1. Select pet<br>2. Navigate to "Grooming History" | All log entries are displayed chronologically |
| TC-APP-4.15.3 | Add photos to log | 1. Create or edit grooming log<br>2. Upload before/after photos<br>3. Save | Photos are attached to log entry |
| TC-APP-4.15.4 | Edit grooming log | 1. Select existing log entry<br>2. Modify notes or services<br>3. Save | Changes are saved |

### 4.16 Settings

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.16.1 | Business settings | 1. Navigate to Settings > Business<br>2. Update business name, hours, contact info<br>3. Save | Settings are saved and reflected app-wide |
| TC-APP-4.16.2 | App configuration | 1. Navigate to Settings > App<br>2. Configure theme, time zone, date format<br>3. Save | Configuration takes effect immediately |
| TC-APP-4.16.3 | Payment settings | 1. Navigate to Settings > Payments<br>2. Configure Stripe keys, tax rates<br>3. Save | Payment settings are updated |
| TC-APP-4.16.4 | Notification settings | 1. Navigate to Settings > Notifications<br>2. Configure email/SMS providers and defaults<br>3. Save | Notification configuration is saved |

### 4.17 Mobile / PWA

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.17.1 | Install prompt | 1. Access app on mobile device (or DevTools mobile view)<br>2. Verify install prompt appears | "Add to Home Screen" prompt is shown |
| TC-APP-4.17.2 | Responsive design (mobile) | 1. Resize viewport to 390x844 (iPhone dimensions)<br>2. Navigate through app | All pages are usable and properly formatted |
| TC-APP-4.17.3 | Offline basics | 1. Load app<br>2. Enable offline mode in DevTools<br>3. Navigate to previously loaded pages | Cached content is displayed, offline indicator shown |
| TC-APP-4.17.4 | Touch interactions | 1. On mobile viewport, tap buttons, forms, and navigation<br>2. Verify responsiveness | All touch targets are accessible and responsive |

### 4.18 Navigation

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.18.1 | All major sections accessible | 1. Click each main navigation item<br>2. Verify page loads | All sections (Dashboard, Calendar, Clients, Pets, Appointments, Reports, Settings) load successfully |
| TC-APP-4.18.2 | No broken links | 1. Navigate through app<br>2. Click various links and buttons | No 404 errors or dead ends encountered |
| TC-APP-4.18.3 | No blank pages | 1. Navigate to each section and sub-section<br>2. Verify content is displayed | All pages render with appropriate content |
| TC-APP-4.18.4 | Back/forward navigation | 1. Navigate through multiple pages<br>2. Use browser back and forward buttons | Navigation history works correctly |

### 4.19 Error States

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.19.1 | Form with bad data | 1. On any form, enter invalid email, phone, or dates<br>2. Submit | Validation errors display specific issues |
| TC-APP-4.19.2 | Missing required fields | 1. On any form, leave required fields blank<br>2. Submit | Clear error messages indicate which fields are required |
| TC-APP-4.19.3 | Empty states | 1. Navigate to pages with no data (empty calendar, no clients)<br>2. Verify UI | Helpful empty state message with call-to-action displayed |
| TC-APP-4.19.4 | Network error handling | 1. Disable network in DevTools<br>2. Attempt actions that require API calls<br>3. Re-enable network | Appropriate error message shown, app recovers when network restored |

### 4.20 Staff Messages

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| TC-APP-4.20.1 | Staff messages inbox loads | 1. Log in as Staff<br>2. Navigate to Messages | Conversation list renders with client phone and last message preview |
| TC-APP-4.20.2 | Open conversation | 1. Select a conversation from the list | Full message thread loads chronologically |
| TC-APP-4.20.3 | Send message | 1. Type a reply and submit | Message appears in thread; POST /api/conversations/:id/messages succeeds |
| TC-APP-4.20.4 | Empty state | 1. Log in as Staff with no conversations | Empty state shown; no crash |
| TC-APP-4.20.5 | Unread indicator | 1. Client sends a new message | Thread marked unread until staff views it |
| TC-APP-4.20.6 | Cross-tenant isolation | 1. Staff from Business A attempts to read Business B conversations | 403 or empty response returned |

## 5. Pass/Fail Criteria

**Pass:** All test cases execute without errors. Expected results match actual results. No regressions are observed. All functionality works as documented.

**Fail:** Any unexpected result is encountered. For failures, document:
- Severity (Critical, High, Medium, Low)
- Steps to reproduce
- Actual vs. expected behavior
- Screenshot(s) if applicable
- Browser and device information

**Regressions:** If a previously working feature fails during this UAT run, it is considered a regression and must be addressed before the release can proceed.

## 6. Update Policy

**Any PR that changes user-facing behaviour MUST update this file.**

When modifying features that affect:
- User workflows (authentication, scheduling, payments, etc.)
- UI/UX (navigation, forms, responsive design)
- Configuration (settings, integrations)
- Data visibility (reports, search, filtering)

The corresponding test case(s) in Section 4 must be updated to reflect the new behaviour. The PR description must reference which playbook section was updated (e.g., "Updated UAT_PLAYBOOK.md §4.5 — new appointment group scheduling feature").
