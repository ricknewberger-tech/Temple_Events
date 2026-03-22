// SMS Sending API endpoint
const twilio = require('twilio');
const { corsHeaders, verifyAuth, airtableRequest, getTableId } = require('./helpers');

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const SMS_ENABLED = process.env.SMS_ENABLED === 'true';

exports.handler = async (event) => {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    // Admin only
    const auth = await verifyAuth(event);
    const role = auth?.role;
    if (role !== 'admin') {
        return {
            statusCode: 403,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Admin access required' })
        };
    }

    // Check if SMS is enabled
    if (!SMS_ENABLED) {
        return {
            statusCode: 503,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'SMS sending is not enabled' })
        };
    }

    // Only POST allowed
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { memberIds, message, eventId } = JSON.parse(event.body);

        // Validate input
        if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'memberIds array required' })
            };
        }

        if (!message || message.trim().length === 0) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'message required' })
            };
        }

        // Initialize Twilio client
        const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

        // Fetch member records
        const membersTableId = getTableId('members');
        const filterFormula = `OR(${memberIds.map(id => `RECORD_ID()='${id}'`).join(',')})`;
        const membersData = await airtableRequest(
            `${membersTableId}?filterByFormula=${encodeURIComponent(filterFormula)}`
        );
        const members = membersData.records || [];

        // Filter members with phone and SMS opt-in
        const eligibleMembers = members.filter(m => {
            const phone = m.fields.Phone;
            const optIn = m.fields.SMSOptIn !== false; // Default true if field missing
            return phone && optIn;
        });

        if (eligibleMembers.length === 0) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({
                    error: 'No eligible members with phone numbers and SMS opt-in'
                })
            };
        }

        // Send SMS to each member
        const results = await Promise.allSettled(
            eligibleMembers.map(async (member) => {
                const phone = cleanPhoneNumber(member.fields.Phone);

                try {
                    const result = await client.messages.create({
                        body: message,
                        from: TWILIO_PHONE_NUMBER,
                        to: phone
                    });

                    // Log to SMSLogs table
                    await logSMS(member.id, phone, message, 'sent', result.sid, eventId);

                    return {
                        memberId: member.id,
                        phone,
                        status: 'sent',
                        messageSid: result.sid
                    };
                } catch (error) {
                    console.error(`Failed to send SMS to ${phone}:`, error.message);

                    // Log failure
                    await logSMS(member.id, phone, message, 'failed', null, eventId);

                    return {
                        memberId: member.id,
                        phone,
                        status: 'failed',
                        error: error.message
                    };
                }
            })
        );

        // Summarize results
        const sent = results.filter(
            r => r.status === 'fulfilled' && r.value.status === 'sent'
        ).length;
        const failed = results.filter(
            r => r.status === 'rejected' || r.value?.status === 'failed'
        ).length;

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                success: true,
                sent,
                failed,
                total: eligibleMembers.length,
                details: results.map(r => r.value || { error: r.reason?.message })
            })
        };

    } catch (error) {
        console.error('SMS send error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'Failed to send SMS',
                details: error.message
            })
        };
    }
};

// Clean and format phone number
function cleanPhoneNumber(phone) {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');

    // Add US country code if not present
    if (cleaned.length === 10) {
        cleaned = '+1' + cleaned;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
        cleaned = '+' + cleaned;
    }

    return cleaned;
}

// Log SMS to Airtable
async function logSMS(memberId, phone, message, status, messageSid, eventId) {
    try {
        const logsTableId = getTableId('sms_logs');
        await airtableRequest(`${logsTableId}`, {
            method: 'POST',
            body: JSON.stringify({
                fields: {
                    Member: [memberId],
                    PhoneNumber: phone,
                    Message: message,
                    Status: status,
                    MessageSID: messageSid,
                    SentDate: new Date().toISOString(),
                    EventId: eventId || null
                }
            })
        });
    } catch (error) {
        console.error('Failed to log SMS:', error);
        // Don't throw - logging failure shouldn't prevent SMS from being sent
    }
}
