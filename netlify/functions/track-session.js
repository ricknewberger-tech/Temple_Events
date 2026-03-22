// Track session - updates LastLogin timestamp when user visits with stored credentials

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_MEMBERS = process.env.TABLE_MEMBERS;

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const { memberId } = JSON.parse(event.body);

        if (!memberId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Member ID required' }) };
        }

        // Get current member record to increment LoginCount
        const memberUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_MEMBERS}/${memberId}`;
        const getResponse = await fetch(memberUrl, {
            headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` }
        });

        if (!getResponse.ok) {
            console.error('Failed to fetch member for session tracking');
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'Member not found' }) };
        }

        const memberData = await getResponse.json();
        const currentCount = memberData.fields.LoginCount || 0;

        // Update login count and timestamp
        const updateResponse = await fetch(memberUrl, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fields: {
                    LoginCount: currentCount + 1,
                    LastLogin: new Date().toISOString()
                }
            })
        });

        if (!updateResponse.ok) {
            const errData = await updateResponse.json().catch(() => ({}));
            console.error('Failed to update session tracking:', errData);
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to track session' }) };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true })
        };
    } catch (error) {
        console.error('Error tracking session:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error' }) };
    }
};
