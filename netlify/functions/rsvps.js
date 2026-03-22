// RSVPs API - CRUD operations for RSVPs

const { corsHeaders, getTableId, verifyAuth, airtableRequest, airtableRequestAll } = require('./helpers');

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    const auth = await verifyAuth(event);
    const role = auth?.role;
    if (!role) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const tableId = getTableId('rsvps');
    const params = event.queryStringParameters || {};

    try {
        switch (event.httpMethod) {
            case 'GET': {
                const queryParts = [];
                if (params.filter) queryParts.push(`filterByFormula=${encodeURIComponent(params.filter)}`);

                const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
                const data = await airtableRequestAll(`${tableId}${query}`);
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
            }

            case 'POST': {
                const body = JSON.parse(event.body);
                const fields = body.fields;
                const memberId = fields.Member?.[0];
                const eventId = fields.Event?.[0];

                // Prevent duplicate RSVPs: if one already exists for this member+event, update it
                if (memberId && eventId) {
                    const formula = `AND(FIND("${eventId}",ARRAYJOIN({Event})),FIND("${memberId}",ARRAYJOIN({Member})))`;
                    const existing = await airtableRequest(
                        `${tableId}?filterByFormula=${encodeURIComponent(formula)}`
                    );
                    if (existing.records?.length > 0) {
                        const updated = await airtableRequest(`${tableId}/${existing.records[0].id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ fields })
                        });
                        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(updated) };
                    }
                }

                const data = await airtableRequest(tableId, {
                    method: 'POST',
                    body: JSON.stringify({ fields })
                });
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
            }

            case 'PATCH': {
                if (!params.id) {
                    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'ID required' }) };
                }
                const body = JSON.parse(event.body);
                const data = await airtableRequest(`${tableId}/${params.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ fields: body.fields })
                });
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
            }

            case 'DELETE': {
                if (!params.id) {
                    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'ID required' }) };
                }
                if (role !== 'admin') {
                    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Admin only' }) };
                }
                const data = await airtableRequest(`${tableId}/${params.id}`, { method: 'DELETE' });
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
            }

            default:
                return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
        }
    } catch (error) {
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
    }
};
