// Members API - returns member list with appropriate field filtering

const { corsHeaders, getTableId, verifyAuth, airtableRequest } = require('./helpers');

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    const params = event.queryStringParameters || {};
    const tableId = getTableId('members');

    try {
        if (event.httpMethod === 'GET') {
            // Names-only endpoint for login autocomplete and host selection (no auth required)
            if (params.namesOnly === 'true') {
                const data = await airtableRequest(`${tableId}?`);
                const members = data.records || [];
                const names = members.map(m => ({
                    id: m.id,
                    fields: {
                        FirstName: m.fields.FirstName,
                        LastName: m.fields.LastName,
                        Address: m.fields.Address,
                        City: m.fields.City,
                        State: m.fields.State,
                        Zip: m.fields.Zip
                    }
                }));
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({ records: names })
                };
            }

            // Full member data requires auth
            const auth = await verifyAuth(event);
            const role = auth?.role;
            if (!role) {
                return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
            }

            const data = await airtableRequest(`${tableId}?`);
            const members = data.records || [];

            // Filter fields based on role
            const filtered = members.map(member => {
                if (role === 'admin') {
                    // Admin sees everything
                    return member;
                }
                // Regular members see limited fields
                return {
                    id: member.id,
                    fields: {
                        FirstName: member.fields.FirstName,
                        LastName: member.fields.LastName,
                        Email: member.fields.Email,
                        Phone: member.fields.Phone,
                        Address: member.fields.Address,
                        Status: member.fields.Status,
                        BirthDate: member.fields.BirthDate
                    }
                };
            });

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ records: filtered })
            };
        }

        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (error) {
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
    }
};
