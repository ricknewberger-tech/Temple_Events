// Login function - verifies member code and returns member info

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_MEMBERS = process.env.TABLE_MEMBERS;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

// Track member login by incrementing count and updating timestamp
async function trackLogin(memberId) {
    try {
        // Get current member record
        const memberUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_MEMBERS}/${memberId}`;
        const getResponse = await fetch(memberUrl, {
            headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` }
        });

        if (!getResponse.ok) {
            console.error('Failed to fetch member for login tracking');
            return; // Don't fail login if tracking fails
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
            console.error('Failed to update login tracking');
        }
    } catch (error) {
        console.error('Error tracking login:', error);
        // Don't fail the login if tracking fails
    }
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const { code, memberId, adminPassword, firstName, lastName } = JSON.parse(event.body);

        // Rick Miles admin login with code 2850
        if (firstName && lastName && code === '2850') {
            const fullName = `${firstName} ${lastName}`.trim().toLowerCase();
            if (fullName === 'rick miles') {
                // Look up Rick Miles member record to get memberId
                const searchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_MEMBERS}?filterByFormula=AND(LOWER({FirstName})='rick',LOWER({LastName})='miles')`;
                const searchResponse = await fetch(searchUrl, {
                    headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` }
                });

                if (searchResponse.ok) {
                    const searchData = await searchResponse.json();
                    if (searchData.records && searchData.records.length > 0) {
                        const member = searchData.records[0];

                        // Track admin login
                        await trackLogin(member.id);

                        return {
                            statusCode: 200,
                            headers,
                            body: JSON.stringify({
                                success: true,
                                role: 'admin',
                                memberId: member.id,
                                name: 'Rick Miles'
                            })
                        };
                    }
                }
                // If member record not found, still log in as admin but without member features
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, role: 'admin', name: 'Rick Miles' }) };
            }
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid credentials' }) };
        }

        // Legacy admin login (password only)
        if (adminPassword !== undefined) {
            if (adminPassword === ADMIN_PASSWORD) {
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, role: 'admin' }) };
            }
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid password' }) };
        }

        // Member login by unique code
        if (code) {
            // Sanitize: only allow alphanumeric, 4-6 chars
            const sanitized = code.replace(/[^a-zA-Z0-9]/g, '');
            if (sanitized.length < 4 || sanitized.length > 6) {
                return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid code' }) };
            }

            const searchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_MEMBERS}?filterByFormula=LOWER({Code})="${sanitized.toLowerCase()}"`;
            const searchResponse = await fetch(searchUrl, {
                headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` }
            });

            if (!searchResponse.ok) {
                const errData = await searchResponse.json().catch(() => ({}));
                console.error('Airtable error:', errData);
                return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', details: errData.error?.message }) };
            }

            const searchData = await searchResponse.json();
            if (searchData.records && searchData.records.length > 0) {
                const member = searchData.records[0];

                // Track member login
                await trackLogin(member.id);

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        role: 'member',
                        memberId: member.id,
                        name: `${member.fields.FirstName || ''} ${member.fields.LastName || ''}`.trim()
                    })
                };
            }

            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid code' }) };
        }
    } catch (error) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error' }) };
    }
};
