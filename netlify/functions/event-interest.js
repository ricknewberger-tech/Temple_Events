// Event Interest API - CRUD operations for event interest indications

const { corsHeaders, getTableId, verifyAuth, airtableRequest } = require('./helpers');

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    const auth = await verifyAuth(event);
    const role = auth?.role;
    if (!role) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const tableId = getTableId('event_interest');
    const params = event.queryStringParameters || {};

    try {
        switch (event.httpMethod) {
            case 'GET': {
                const queryParts = [];
                if (params.filter) queryParts.push(`filterByFormula=${encodeURIComponent(params.filter)}`);

                const query = queryParts.length > 0 ? queryParts.join('&') : '';
                const data = await airtableRequest(`${tableId}?${query}`);
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
            }

            case 'POST': {
                const body = JSON.parse(event.body);
                const data = await airtableRequest(tableId, {
                    method: 'POST',
                    body: JSON.stringify({ fields: body.fields })
                });
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
            }

            case 'DELETE': {
                // Delete by eventId and memberId
                if (!params.eventId || !params.memberId) {
                    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'eventId and memberId required' }) };
                }

                const formula = `AND(FIND("${params.eventId}",ARRAYJOIN({Event})),FIND("${params.memberId}",ARRAYJOIN({Member})))`;
                const allRecords = await airtableRequest(`${tableId}?filterByFormula=${encodeURIComponent(formula)}`);
                const matchingRecords = allRecords.records || [];

                if (matchingRecords.length === 0) {
                    return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Interest record not found' }) };
                }

                // Delete the found record
                const recordId = matchingRecords[0].id;
                const data = await airtableRequest(`${tableId}/${recordId}`, { method: 'DELETE' });
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
            }

            default:
                return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
        }
    } catch (error) {
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
    }
};
