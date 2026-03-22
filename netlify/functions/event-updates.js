// Event Updates API - CRUD operations for event updates and announcements

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

    const tableId = getTableId('eventUpdates');
    const params = event.queryStringParameters || {};

    try {
        switch (event.httpMethod) {
            case 'GET': {
                // Single record by ID
                if (params.id) {
                    const data = await airtableRequest(`${tableId}/${params.id}`);
                    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
                }

                // List with optional filters (typically filter by Event name)
                const queryParts = [];
                if (params.filter) queryParts.push(`filterByFormula=${encodeURIComponent(params.filter)}`);

                // Default sort by Timestamp descending (newest first)
                queryParts.push(`sort[0][field]=Timestamp`);
                queryParts.push(`sort[0][direction]=desc`);

                const query = queryParts.length > 0 ? queryParts.join('&') : '';
                const data = await airtableRequest(`${tableId}?${query}`);
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
            }

            case 'POST': {
                // Only admin can create updates
                if (role !== 'admin') {
                    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Forbidden: Admin only' }) };
                }

                const body = JSON.parse(event.body);

                // Add timestamp if not provided
                if (!body.fields.Timestamp) {
                    body.fields.Timestamp = new Date().toISOString();
                }

                const data = await airtableRequest(tableId, {
                    method: 'POST',
                    body: JSON.stringify({ fields: body.fields })
                });
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
            }

            case 'PATCH': {
                // Only admin can update
                if (role !== 'admin') {
                    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Forbidden: Admin only' }) };
                }

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
                // Only admin can delete
                if (role !== 'admin') {
                    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Forbidden: Admin only' }) };
                }

                if (!params.id) {
                    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'ID required' }) };
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
