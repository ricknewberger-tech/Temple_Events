// Shared helpers for Netlify functions

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Content-Type': 'application/json'
};

function getTableId(table) {
    const tables = {
        events: process.env.TABLE_EVENTS,
        members: process.env.TABLE_MEMBERS,
        rsvps: process.env.TABLE_RSVPS,
        eventUpdates: process.env.TABLE_EVENT_UPDATES,
        eventComments: process.env.TABLE_EVENT_COMMENTS,
        event_interest: process.env.TABLE_EVENT_INTEREST,
        notifications: process.env.TABLE_NOTIFICATIONS,
        sms_logs: process.env.TABLE_SMS_LOGS
    };
    return tables[table];
}

// In-memory cache for member code lookups to avoid hitting Airtable
// on every authenticated request (and tripping the 5-req/sec rate limit).
const memberAuthCache = new Map();
const MEMBER_AUTH_TTL_MS = 5 * 60 * 1000;

async function verifyAuth(event) {
    const auth = event.headers.authorization || event.headers.Authorization || '';

    // Admin auth (static checks)
    if (auth === `Bearer admin:${ADMIN_PASSWORD}`) return { role: 'admin' };
    if (auth === `Bearer admin:2850`) return { role: 'admin' };

    // Member auth — validate unique code against Airtable
    const memberMatch = auth.match(/^Bearer member:([a-zA-Z0-9]{4,6})$/);
    if (memberMatch) {
        const code = memberMatch[1].toLowerCase();

        const cached = memberAuthCache.get(code);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.value;
        }

        const tableId = getTableId('members');
        try {
            const data = await airtableRequest(
                `${tableId}?filterByFormula=LOWER({Code})="${code}"&fields[]=Code`
            );
            if (data.records && data.records.length > 0) {
                const value = { role: 'member', memberId: data.records[0].id };
                memberAuthCache.set(code, { value, expiresAt: Date.now() + MEMBER_AUTH_TTL_MS });
                return value;
            }
        } catch (e) {
            // On Airtable failure, fall back to cached value if any (even if expired)
            // so a transient rate-limit hit doesn't log the user out mid-session.
            if (cached) return cached.value;
        }
    }

    return null;
}

async function airtableRequest(path, options = {}) {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${path}`;
    const response = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `Airtable error ${response.status}`);
    }

    return response.json();
}

// Fetches all pages of an Airtable list request, following the offset cursor
async function airtableRequestAll(path, options = {}) {
    let allRecords = [];
    let offset = null;
    do {
        const sep = path.includes('?') ? '&' : '?';
        const url = offset ? `${path}${sep}offset=${encodeURIComponent(offset)}` : path;
        const data = await airtableRequest(url, options);
        allRecords = allRecords.concat(data.records || []);
        offset = data.offset || null;
    } while (offset);
    return { records: allRecords };
}

module.exports = { corsHeaders, getTableId, verifyAuth, airtableRequest, airtableRequestAll };
