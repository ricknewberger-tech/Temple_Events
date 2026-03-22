const { corsHeaders, verifyAuth } = require('./helpers');
const Anthropic = require('@anthropic-ai/sdk');

exports.handler = async (event) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
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

    // Admin-only authentication
    const auth = await verifyAuth(event);
    const role = auth?.role;
    if (role !== 'admin') {
        return {
            statusCode: 403,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Admin access required' })
        };
    }

    try {
        // Parse and validate request
        const { eventName, comments } = JSON.parse(event.body);

        if (!comments || comments.length === 0) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'No comments to summarize' })
            };
        }

        if (!eventName) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Event name is required' })
            };
        }

        // Initialize Anthropic client
        const apiKey = process.env.ANTHROPIC_API_KEY;

        if (!apiKey) {
            console.error('ANTHROPIC_API_KEY not found in environment');
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({
                    error: 'Configuration error: API key not configured'
                })
            };
        }

        const anthropic = new Anthropic({
            apiKey: apiKey,
        });

        // Build the prompt
        const prompt = buildPrompt(eventName, comments);

        // Call Claude API
        const message = await anthropic.messages.create({
            model: process.env.AI_SUMMARY_MODEL || 'claude-3-sonnet-20240229',
            max_tokens: parseInt(process.env.AI_SUMMARY_MAX_TOKENS || '1000'),
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        // Extract summary text
        const summary = message.content[0].text;

        // Return successful response
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                summary,
                commentCount: comments.length,
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('Error generating summary:', error);

        // Handle specific error types
        if (error.status === 401) {
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({
                    error: 'Configuration error: Invalid API key'
                })
            };
        }

        if (error.status === 429) {
            return {
                statusCode: 429,
                headers: corsHeaders,
                body: JSON.stringify({
                    error: 'Rate limit exceeded. Please try again later.'
                })
            };
        }

        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'Failed to generate summary',
                details: error.message
            })
        };
    }
};

function buildPrompt(eventName, comments) {
    // Format comments with member names and text
    const commentText = comments
        .slice(0, 50) // Limit to 50 most recent comments for cost control
        .map((c, i) => `${i + 1}. ${c.memberName}: ${c.text}`)
        .join('\n');

    return `Summarize the key discussion points for "${eventName}" in 2-3 short sentences. Focus on what members are discussing, not who said it.

Comments:
${commentText}

Summary:`;
}
