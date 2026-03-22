# Vintage Menschen Chavurah

Social club web app for managing events and RSVPs.

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript (no frameworks)
- **Backend**: Netlify serverless functions (Node.js)
- **Database**: Airtable (Events, Members, RSVPs tables)
- **Deployment**: Netlify

## Development Commands

```bash
npm run dev     # Start local dev server (netlify dev)
```

The dev server runs at `http://localhost:8888` and proxies `/api/*` routes to Netlify functions.

## Project Structure

```
/                       # HTML pages (index, event, members, past-events, admin)
/css/styles.css         # All styles (mobile-first responsive)
/js/                    # Frontend JavaScript modules
  config.js             # Client configuration
  airtable.js           # API wrapper (calls Netlify functions)
  events.js             # Home page event listing
  event-detail.js       # Event detail and RSVP logic
  event-discussion.js   # Event updates and comments UI
  members.js            # Member directory
  past-events.js        # Past events archive
  admin.js              # Admin panel
  utils.js              # Shared utilities (calendar, dates, email, time formatting)
/netlify/functions/     # Serverless API endpoints
  helpers.js            # Shared utilities (Airtable client, auth, CORS)
  login.js              # Member/admin authentication
  events.js             # Event CRUD operations
  event-updates.js      # Event updates/announcements CRUD
  event-comments.js     # Event discussion comments CRUD
  members.js            # Member data
  rsvps.js              # RSVP management
```

## API Routes

All API calls go through `/api/*` which redirects to Netlify functions:
- `POST /api/login` - Authenticate member or admin
- `GET/POST /api/events` - List or create events
- `GET/PATCH/DELETE /api/events/:id` - Single event operations
- `GET /api/members` - List members
- `GET/POST/PATCH/DELETE /api/rsvps` - RSVP management
- `GET/POST/PATCH/DELETE /api/event-updates` - Event updates/announcements
- `GET/POST/DELETE /api/event-comments` - Event discussion comments

## Key Patterns

- **No direct Airtable calls from frontend** - All database access goes through Netlify functions
- **Environment variables** - Airtable credentials stored in Netlify env vars, not in code
- **Authentication** - Member login uses name + access code; admin uses password
- **PWA** - Service worker with network-first strategy for offline support

## Features

- **Event Management** - Create, edit, cancel events with RSVP tracking
- **Event Updates** - Admin/host can post announcements and updates
- **Event Discussion** - Members can comment and discuss events
- **Member Directory** - View active members
- **Past Events** - Archive of completed events
- **Calendar Integration** - Export events to Google Calendar, Apple Calendar, Outlook
- **Email Integration** - Email all attendees directly from event page

## Environment Variables (Netlify)

Required in Netlify dashboard:
- `AIRTABLE_API_KEY` - Airtable API key
- `AIRTABLE_BASE_ID` - Airtable base ID
- `ADMIN_PASSWORD` - Admin password for authentication
- `MEMBER_CODE` - Member access code for authentication
- `TABLE_EVENTS` - Airtable Events table ID
- `TABLE_MEMBERS` - Airtable Members table ID
- `TABLE_RSVPS` - Airtable RSVPs table ID
- `TABLE_EVENT_UPDATES` - Airtable EventUpdates table ID
- `TABLE_EVENT_COMMENTS` - Airtable EventComments table ID

**Finding Environment Variables in Netlify:**
Use the Netlify search tool (search for "environment variables" or "env") to quickly navigate to the environment variables page for your site.

**IMPORTANT: After changing environment variables:**
Environment variable changes do NOT automatically redeploy the site. After updating any environment variables in Netlify:
1. Go to Netlify dashboard → Deploys → Trigger deploy
2. Select "Clear cache and deploy site" (NOT just "Deploy site")
3. Wait for the deploy to complete
4. Check the deploy log to verify all build steps completed successfully
5. This ensures the new environment variables are picked up by the serverless functions

**Verifying Deployments:**
After any deployment (git push or manual trigger):
1. Go to Netlify dashboard → Deploys
2. Click on the most recent deploy
3. Review the deploy log to confirm:
   - Build completed successfully
   - All functions deployed
   - No errors in the build process
4. Test the live site to verify changes are working
