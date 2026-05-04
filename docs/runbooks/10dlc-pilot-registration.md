# 10DLC Pilot Tenant Registration Runbook

Authored for [GRO-106](/GRO/issues/GRO-106) Phase 1.

---

## Pre-Flight Checklist

Before starting Telnyx registration, collect the following:

| Item | Details |
|------|---------|
| Legal business name | Exact name on EIN / business registration |
| EIN (Employer Identification Number) | 9-digit IRS format: XX-XXXXXXX |
| Business type | Sole Proprietor / LLC / Corporation |
| Primary contact email | General contact address (postmaster@, info@, etc.) |
| Primary contact phone | Direct line for carrier verification |
| Website URL | Must be live and contain privacy policy |
| Sample message templates | See [Sample Templates](#sample-message-templates) below |
| Messaging use case | Customer Care / Account Notification |

---

## Step 1 — Telnyx Account Requirements

- Active Telnyx account with billing configured.
- Role required: **Admin** or **Super User** to register brands and campaigns.

---

## Step 2 — Brand Registration

### Via Telnyx Console

1. Log in to [Telnyx Portal](https://portal.telnyx.com).
2. Navigate to **Messaging → A2P 10DLC → Brands**.
3. Click **Register Brand**.
4. Fill in:
   - **Brand Name**: Legal business name
   - **Legal Company Name**: Exact EIN name
   - **Company Type**: Select from dropdown
   - **EIN**: XX-XXXXXXX
   - **Primary Contact**: Name, email, phone
   - **Website**: Must be accessible
   - **BusinessVertical**: Select appropriate vertical
5. Acknowledge the **Terms of Service**.
6. Submit.

### Via API

```bash
curl -X POST https://api.telnyx.com/v2/10dlc/brands \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Your Legal Business Name",
    "legal_company_name": "Your Legal Business Name",
    "company_type": "llc",
    "ein": "XX-XXXXXXX",
    "primary_contact": {
      "name": "Jane Doe",
      "email": "compliance@example.com",
      "phone": "+13125551000"
    },
    "website": "https://www.example.com",
    "business_vertical": "FINANCE_INSURANCE_BANKING"
  }'
```

**Response fields to record:**
- `brand_id` — required for campaign registration
- `brand_score` — affects campaign vetting speed

### Expected Fees

| Fee Type | Amount |
|----------|--------|
| Brand registration fee | ~$0 (no direct fee from Telnyx) |
| Campaign registration fee | ~$15–$25 per campaign (Telnyx fee, subject to change) |
| Carrier fees | Passed through from T-Mobile/AT&T/Verizon |

### Expected Approval Window

- **Vetting by Telnyx**: 1–3 business days after submission.
- **Carrier (T-Mobile/AT&T/Verizon) review**: 2–5 business days after Telnyx approval.
- Total end-to-end: **3–8 business days**.

---

## Step 3 — Campaign Registration

### Use Case Selection

- **Primary**: Customer Care
- **Secondary**: Account Notification

### Via Telnyx Console

1. Navigate to **Messaging → A2P 10DLC → Campaigns**.
2. Click **Register Campaign**.
3. Select **Brand** (use the brand registered in Step 2).
4. Fill in:
   - **Campaign Name**: e.g., `groombook-pilot-customer-care`
   - **Use Case**: Customer Care / Account Notification
   - **Sample Messages**: Paste exactly the templates from [Sample Templates](#sample-message-templates) below.
   - **Description**: Brief description of messaging program
   - **Estimated Volume**: Enter monthly estimate (e.g., 500)
5. Submit.

### Via API

```bash
curl -X POST https://api.telnyx.com/v2/10dlc/campaigns \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "brand_id": "YOUR_BRAND_ID",
    "name": "groombook-pilot-customer-care",
    "use_case": "CUSTOMER_CARE",
    "sample_messages": [
      "Hi {{first_name}}, this is a reminder from {{business_name}} that your appointment is scheduled for {{date}} at {{time}}. Reply STOP to opt out.",
      "Your appointment with {{business_name}} is confirmed for {{date}}. Need to reschedule? Reply HELP or call us at {{phone}}."
    ],
    "description": "Appointment reminders and account notifications for grooming clients",
    "estimated_monthly_volume": 500
  }'
```

**Response fields to record:**
- `campaign_id` — required for messaging profile
- `status` — initially `PENDING`, transitions to `ACTIVE` after carrier approval

### Campaign Vetting — STOP/HELP Language Requirements

Every campaign **must** include compliant STOP/HELP messaging. The following must appear in your sample messages or be included in your terms of service:

- **STOP**: Users can text `STOP` to opt out of all messages.
- **HELP**: Users can text `HELP` to receive contact information.

Example STOP/HELP block:

```
Text STOP to opt out. Text HELP for help. Msg & data rates may apply.
```

---

## Step 4 — Messaging Profile + Phone Number Provisioning

### Create Messaging Profile

1. In Telnyx Portal, navigate to **Messaging → Messaging Profiles**.
2. Click **Create Messaging Profile**.
3. Name it (e.g., `groombook-pilot-prod`).
4. Copy the **Messaging Profile ID** (`messaging_profile_id`) — record this in the DB.

### Provision a 10DLC Phone Number

1. Navigate to **Messaging → Phone Numbers**.
2. Search for a number in your desired area code.
3. Confirm the number is 10DLC-capable.
4. Purchase the number.

### Associate Number with Messaging Profile

```bash
# Assign number to messaging profile
curl -X PATCH https://api.telnyx.com/v2/phone_numbers/YOUR_PHONE_NUMBER_ID \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_profile_id": "YOUR_MESSAGING_PROFILE_ID"
  }'
```

---

## Step 5 — Record in Database

Once [GRO-981](/GRO/issues/GRO-981) lands, record the following against the business record:

### SQL Path (when GRO-981 is complete)

```sql
UPDATE businesses
SET
  messaging_phone_number = '+13125551000',
  telnyx_messaging_profile_id = 'YOUR_MESSAGING_PROFILE_ID',
  telnyx_brand_id = 'YOUR_BRAND_ID',
  telnyx_campaign_id = 'YOUR_CAMPAIGN_ID',
  telnyx_brand_status = 'APPROVED',
  telnyx_campaign_status = 'ACTIVE',
  updated_at = NOW()
WHERE id = 'pilot_business_id';
```

### Manual Admin Path (before GRO-981)

Until GRO-981 is complete, use the Telnyx Portal to verify and record values manually in your internal ops sheet:

| Field | Value |
|-------|-------|
| `messagingPhoneNumber` | +1XXXXXXXXXX |
| `telnyxMessagingProfileId` | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| `telnyxBrandId` | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| `telnyxCampaignId` | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| `brandStatus` | APPROVED / PENDING |
| `campaignStatus` | ACTIVE / PENDING |

---

## Sample Message Templates

These must match exactly what your system will send. Vetting reviewers compare templates against actual traffic.

### Transactional Appointment Reminder

```
Hi {{first_name}}, this is a reminder from {{business_name}} that your appointment is scheduled for {{date}} at {{time}}. Reply STOP to opt out. Msg & data rates may apply.
```

### Manual Staff Message

```
Your appointment with {{business_name}} is confirmed for {{date}}. Need to reschedule? Reply HELP for assistance or call us at {{phone}}. Msg & data rates may apply.
```

---

## Failure Modes + Retry Guidance

### Vetting Rejection — Brand

| Rejection Reason | Common Fix |
|-----------------|------------|
| Legal name mismatch with EIN | Ensure exact EIN name matches legal company name exactly |
| Website not accessible / missing privacy policy | Add privacy policy page to website before resubmitting |
| Incomplete primary contact | Provide direct phone and real email (no noreply) |
| High-risk business vertical | Contact Telnyx support for pre-screening before resubmitting |

### Campaign Rejection

| Rejection Reason | Common Fix |
|-----------------|------------|
| Sample messages do not match actual traffic | Update sample messages to match exactly what the system sends |
| Missing STOP/HELP language | Add compliant STOP/HELP block to sample messages |
| Volume estimate too low/high | Revise estimate to be realistic |
| Use case mismatch | Re-select use case that matches actual messaging |

### Re-submission

After fixing the rejection reason, re-submit via the same API endpoint. Telnyx will re-run vetting (typically 24–48 hours).

---

## Cost Summary

### Telnyx Fees (as of 2026)

| Fee Type | Amount | Notes |
|----------|--------|-------|
| 10DLC number (monthly) | ~$1.00–$2.50/number | Varies by type and area code |
| Outbound message | $0.005–$0.015/message | Depends on destination carrier |
| Inbound message | Included | No charge for received messages |
| Campaign registration | ~$15–$25 one-time | Per campaign, subject to change |

### Carrier Fees (T-Mobile / AT&T / Verizon)

| Carrier | Outbound Fee | Notes |
|---------|-------------|-------|
| T-Mobile | ~$0.005–$0.01/message | Varies by message size (segment) |
| AT&T | ~$0.005–$0.015/message | Varies by message size (segment) |
| Verizon | ~$0.005–$0.01/message | Varies by message size (segment) |

**Note**: Carrier fees are subject to change. Check [Telnyx pricing page](https://telnyx.com/pricing) and carrier fee schedules for current rates.

### Example Monthly Cost (Pilot — 500 messages/month)

| Line Item | Cost |
|-----------|------|
| 1x 10DLC number | ~$2.00 |
| 500 outbound messages | ~$5.00–$7.50 |
| Carrier pass-through | ~$2.50–$7.50 |
| **Estimated Monthly Total** | **~$9.50–$17.00** |

---

## Rollback / De-provisioning

If the pilot tenant must be de-provisioned:

1. Release the phone number: Telnyx Portal → Phone Numbers → Release.
2. Archive the campaign: set status to `INACTIVE` via API or console.
3. Remove DB record: clear `messagingPhoneNumber`, `telnyxMessagingProfileId`, `telnyxCampaignId` fields in the business record.
4. Brand can remain registered (no harm) but will not be used.

---

## Contacts

| Resource | Contact |
|----------|---------|
| Telnyx Support | support@telnyx.com |
| Telnyx Dashboard | portal.telnyx.com |
| Internal Engineering | Raise issue in [GRO-106](/GRO/issues/GRO-106) |

---

_Last updated: 2026-05-04_