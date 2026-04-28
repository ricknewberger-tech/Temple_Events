# Vintage Menschen Chavurah

Social club web app for managing events, RSVPs, and discussions for the Vintage Menschen Chavurah community.

**Live site:** [templeevents.netlify.app](https://templeevents.netlify.app)

## Tech stack

- Vanilla HTML / CSS / JavaScript (no frontend framework)
- Netlify serverless functions (Node.js)
- Airtable (database)
- Deployed on Netlify

## Local development

```bash
npm install
npm run dev   # netlify dev — http://localhost:8888
```

Requires a `.env` file with Airtable credentials and table IDs. See [SETUP.md](SETUP.md) for the full list.

## Deployment

`main` auto-deploys to Netlify on push.

## Documentation

- [SETUP.md](SETUP.md) — first-time deployment guide (Airtable schema, env vars, Netlify setup)
- [CLAUDE.md](CLAUDE.md) — codebase notes used by Claude Code
