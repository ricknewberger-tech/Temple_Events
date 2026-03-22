# Vintage Menschen Chavurah — Setup Guide

## Overview

This app is built on Netlify (hosting) + Airtable (database). You'll need free accounts on both services.

---

## Step 1: Create Your Airtable Base

1. Go to [airtable.com](https://airtable.com) and create a free account
2. Click **"Add a base"** → **"Start from scratch"**
3. Name it: **Vintage Menschen Chavurah**

### Create these 7 tables (in order):

#### Table 1: Members
| Field Name | Field Type |
|---|---|
| Name | Single line text (primary) |
| Email | Email |
| Phone | Phone number |
| AccessCode | Single line text |
| Status | Single select: Active, Inactive |
| Birthday | Date |
| Notes | Long text |

#### Table 2: Events
| Field Name | Field Type |
|---|---|
| EventName | Single line text (primary) |
| EventDate | Date |
| EventTime | Single line text |
| Location | Single line text |
| LocationType | Single select: Restaurant, Member's Home, Other |
| Address | Single line text |
| Description | Long text |
| Status | Single select: Upcoming, Interested, Cancelled, Past |
| MaxAttendees | Number |
| Host | Single line text |

#### Table 3: RSVPs
| Field Name | Field Type |
|---|---|
| EventID | Single line text (primary) |
| MemberName | Single line text |
| Response | Single select: Attending, Not Attending, Maybe |
| EventName | Single line text |
| Timestamp | Date/time |

#### Table 4: EventUpdates
| Field Name | Field Type |
|---|---|
| EventID | Single line text (primary) |
| Message | Long text |
| AuthorName | Single line text |
| Timestamp | Date/time |

#### Table 5: EventComments
| Field Name | Field Type |
|---|---|
| EventID | Single line text (primary) |
| Comment | Long text |
| AuthorName | Single line text |
| Timestamp | Date/time |

#### Table 6: Notifications
| Field Name | Field Type |
|---|---|
| Title | Single line text (primary) |
| Message | Long text |
| Type | Single select: info, success, warning |
| Active | Checkbox |
| StartDate | Date |
| EndDate | Date |

#### Table 7: EventInterest
| Field Name | Field Type |
|---|---|
| EventID | Single line text (primary) |
| MemberName | Single line text |
| Interested | Checkbox |

---

## Step 2: Get Your Airtable Credentials

### API Key:
1. Go to [airtable.com/create/apikey](https://airtable.com/create/apikey)
2. Click **"Create new token"**
3. Give it a name, select **scopes**: `data.records:read`, `data.records:write`, `schema.bases:read`
4. Select your **Vintage Menschen Chavurah** base
5. Copy the token — this is your `AIRTABLE_API_KEY`

### Base ID:
1. Open your base in Airtable
2. Look at the URL: `https://airtable.com/appXXXXXXXXXXXX/...`
3. The `appXXXXXXXXXXXX` part is your `AIRTABLE_BASE_ID`

### Table IDs:
For each table:
1. Open the table in Airtable
2. Look at the URL: `https://airtable.com/appXXX/tblXXXXXXXXXXXX/...`
3. The `tblXXXXXXXXXXXX` part is the Table ID

---

## Step 3: Add Starting Data

### Members (10 members from your group):
Add these records to the **Members** table:

| Name | Email | Phone | Status |
|---|---|---|---|
| Marjorie Kitzes | kitzesmarjorie@gmail.com | (301) 708-9844 | Active |
| Vicki Kaufman | Vickigordonkaufman@comcast.net | 850-218-0454 | Active |
| Bill Kaufman | Wpkaufman@comcast.net | 850-545-1889 | Active |
| Mona Spitz | monaspitz@gmail.com | 303-229-9775 | Active |
| Mark Spitz | Markspitz@gmail.com | 303-990-0065 | Active |
| Carol Ungar | cbungar@gmail.com | 720-290-7204 | Active |
| Fern Erickson | Fredaferickson@gmail.com | 303-733-5738 | Active |
| Rick Newberger | ricknewberger@gmail.com | 805-208-0177 | Active |
| Ginny Hoffman | ginandbrad@gmail.com | 408-531-5825 | Active |
| Brad Wall | ginandbrad@gmail.com | 408-886-8704 | Active |

**AccessCode**: Assign each member a unique 4-digit code. They'll use this to log in.

### Events (starting calendar):
Add these records to the **Events** table:

| EventName | EventDate | EventTime | Location | Description | Status | Host |
|---|---|---|---|---|---|---|
| Jewish Film Night | 2026-02-01 | | | | Upcoming | Fern |
| Israeli Restaurant - Ash' Kara | 2026-03-11 | 12:00 PM | Ash' Kara | | Upcoming | Vicky & Bill |
| Persian Dinner | 2026-04-11 | | | | Upcoming | Ginny |
| Wine Tasting | 2026-06-13 | | | Let me know if you cannot make it | Upcoming | Rick |
| BBQ Potluck | 2026-07-04 | | | Around 4th of July | Upcoming | Brad |
| Masha and the Bear Russian Restaurant | 2026-09-01 | | Masha and the Bear | After Labor Day. Note: Rosh Hashanah Sept 11-13; Yom Kippur Sept 20-21 | Upcoming | Marjorie |

---

## Step 4: Configure Environment Variables

Edit the `.env` file and fill in your values:

```
AIRTABLE_API_KEY=your_actual_api_key
AIRTABLE_BASE_ID=appYourBaseId
TABLE_EVENTS=tblYourEventsTableId
TABLE_MEMBERS=tblYourMembersTableId
TABLE_RSVPS=tblYourRSVPsTableId
TABLE_EVENT_UPDATES=tblYourEventUpdatesTableId
TABLE_EVENT_COMMENTS=tblYourEventCommentsTableId
TABLE_NOTIFICATIONS=tblYourNotificationsTableId
TABLE_EVENT_INTEREST=tblYourEventInterestTableId
MEMBER_CODE=8016
ADMIN_PASSWORD=choose_a_strong_password
```

Note: `MEMBER_CODE` is the shared code all members use. You can choose any number.
Individual member codes (AccessCode field in Members table) are separate.

---

## Step 5: Deploy to Netlify

1. Push this project to a GitHub repository
2. Go to [netlify.com](https://netlify.com) and create a free account
3. Click **"Add new site"** → **"Import an existing project"** → connect GitHub
4. Select your repository
5. Build settings:
   - Build command: *(leave blank)*
   - Publish directory: `.`
6. Click **"Deploy site"**
7. After deploy, go to **Site settings → Environment variables**
8. Add all variables from your `.env` file
9. Go to **Deploys → Trigger deploy → Clear cache and deploy site**

---

## Step 6: Test

1. Visit your Netlify URL
2. Sign in with the `MEMBER_CODE` you set
3. Verify events show up
4. Test RSVPs

---

## Member Codes

Each member gets their own `AccessCode` in the Members table. This is what shows their name
when they log in. The shared `MEMBER_CODE` environment variable is the password that
lets anyone in — individual AccessCodes identify *who* is logging in.

Suggested workflow: assign each member a simple 4-digit code (e.g., their birth month + year:
Marjorie born March 1952 → 0352). Share codes privately with each member.
