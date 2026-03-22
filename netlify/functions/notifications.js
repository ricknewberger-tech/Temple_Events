// Notifications API endpoint
const { corsHeaders, verifyAuth, airtableRequest, getTableId } = require('./helpers');

exports.handler = async (event) => {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    // Authentication required for all operations
    const auth = await verifyAuth(event);
    const role = auth?.role;
    if (!role) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const tableId = getTableId('notifications');
    console.log('Table ID for notifications:', tableId);

    if (!tableId) {
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'TABLE_NOTIFICATIONS environment variable not set' })
        };
    }

    const today = new Date().toISOString().split('T')[0];

    try {
        // GET - Fetch active notifications (filtered by audience and role)
        if (event.httpMethod === 'GET') {
            const queryParams = event.queryStringParameters || {};
            const showAll = queryParams.all === 'true';

            let filterFormula;

            if (showAll && role === 'admin') {
                // Admin requesting all notifications (including inactive)
                // Get everything - no filter
                const data = await airtableRequest(`${tableId}?sort[0][field]=Priority&sort[0][direction]=desc&sort[1][field]=CreateDate&sort[1][direction]=desc`);

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify(data)
                };
            } else {
                // Regular users get active, non-expired notifications for their audience
                const audienceFilter = role === 'admin'
                    ? `OR({TargetAudience}='all',{TargetAudience}='admins')`
                    : `OR({TargetAudience}='all',{TargetAudience}='members')`;

                // Filter: active, correct audience, and not expired
                filterFormula = `AND({IsActive}=TRUE(),${audienceFilter},OR({ExpiresDate}='',{ExpiresDate}>='${today}'))`;
            }

            const data = await airtableRequest(`${tableId}?filterByFormula=${encodeURIComponent(filterFormula)}&sort[0][field]=Priority&sort[0][direction]=desc&sort[1][field]=CreateDate&sort[1][direction]=desc`);

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify(data)
            };
        }

        // All write operations require admin role
        if (role !== 'admin') {
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Admin access required' }) };
        }

        // POST - Create notification
        if (event.httpMethod === 'POST') {
            const notificationData = JSON.parse(event.body);

            console.log('Creating notification with data:', JSON.stringify(notificationData, null, 2));

            // Remove CreateDate - let it be manually set in Airtable or leave blank
            delete notificationData.CreateDate;

            // Remove empty ExpiresDate to avoid validation errors
            if (notificationData.ExpiresDate === '') {
                delete notificationData.ExpiresDate;
            }

            console.log('Final data being sent to Airtable:', JSON.stringify(notificationData, null, 2));

            const data = await airtableRequest(`${tableId}`, {
                method: 'POST',
                body: JSON.stringify({ fields: notificationData })
            });

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify(data)
            };
        }

        // PATCH - Update notification
        if (event.httpMethod === 'PATCH') {
            const pathParts = event.path.split('/');
            const notificationId = pathParts[pathParts.length - 1];

            if (!notificationId || notificationId === 'notifications') {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Notification ID required' }) };
            }

            const notificationData = JSON.parse(event.body);

            const data = await airtableRequest(`${tableId}/${notificationId}`, {
                method: 'PATCH',
                body: JSON.stringify({ fields: notificationData })
            });

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify(data)
            };
        }

        // DELETE - Delete notification
        if (event.httpMethod === 'DELETE') {
            const pathParts = event.path.split('/');
            const notificationId = pathParts[pathParts.length - 1];

            if (!notificationId || notificationId === 'notifications') {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Notification ID required' }) };
            }

            await airtableRequest(`${tableId}/${notificationId}`, {
                method: 'DELETE'
            });

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ success: true, deleted: notificationId })
            };
        }

        // Method not allowed
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Method not allowed' })
        };

    } catch (error) {
        console.error('Notifications API error:', error);
        console.error('Error stack:', error.stack);
        console.error('Error stringified:', JSON.stringify(error, null, 2));

        // Try to extract Airtable error details
        let errorMessage = error.message;
        if (error.error) {
            errorMessage = JSON.stringify(error.error);
        }

        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'Server error',
                details: errorMessage,
                fullError: String(error),
                tableId: tableId
            })
        };
    }
};
