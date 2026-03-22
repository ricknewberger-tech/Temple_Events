// Discussion Page Module
// Handles the dedicated discussion page for event updates and comments

let currentEvent = null;
let currentMembers = [];
let currentRSVPs = [];
let currentUpdates = [];
let currentComments = [];
let signedInMemberId = null;
let isAdmin = false;

// Storage helpers - check sessionStorage first (current session), then localStorage (persistent)
function getStoredItem(key) {
    return sessionStorage.getItem(key) || localStorage.getItem(key);
}

// ========== Page Initialization ==========

async function init() {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('id');

    if (!eventId) {
        showError('No event ID provided');
        return;
    }

    // Clear old shared-code tokens (pre-unique-code migration)
    const storedToken = getStoredItem('authToken');
    if (storedToken && /^member:\d+$/.test(storedToken)) {
        ['memberId', 'authToken', 'memberName'].forEach(key => {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        });
    }
    // Check if user is already signed in
    signedInMemberId = getStoredItem('memberId');
    const authToken = getStoredItem('authToken');
    isAdmin = authToken && authToken.startsWith('admin:');

    // Track session for returning users with stored credentials
    if (signedInMemberId) {
        Airtable.trackSession(signedInMemberId);
    }

    try {
        await loadDiscussionPage(eventId);
    } catch (error) {
        console.error('Failed to load discussion:', error);
        showError(error.message);
    }
}

async function loadDiscussionPage(eventId) {
    try {
        // Load event first
        const event = await Airtable.getEvent(eventId);

        // Then load members, RSVPs, updates, and comments in parallel
        const [members, rsvps, updates, comments] = await Promise.all([
            Airtable.getActiveMembers(),
            Airtable.getRSVPsByEventId(event.id),
            Airtable.getEventUpdatesByEventId(event.id),
            Airtable.getEventCommentsByEventId(event.id)
        ]);

        currentEvent = event;
        currentMembers = members;
        currentRSVPs = rsvps;
        currentUpdates = updates || [];
        currentComments = comments || [];

        // Update page title
        document.title = `${event.fields.EventName || 'Event'} Discussion - Chavurah`;

        // Initialize EventDiscussion module
        EventDiscussion.init(event, members, rsvps, signedInMemberId, isAdmin);
        EventDiscussion.currentUpdates = updates;
        EventDiscussion.currentComments = comments;

        renderDiscussionPage();

        // Attach EventDiscussion listeners
        EventDiscussion.attachListeners();
    } catch (error) {
        console.error('Error loading discussion page:', error);
        throw new Error('Failed to load discussion page');
    }
}

function renderDiscussionPage() {
    const container = document.getElementById('discussion-content');

    let html = '';

    // Back button to event detail page
    html += `<a href="event.html?id=${currentEvent.id}" class="btn btn-secondary btn-sm mb-3">&larr; Back to Event</a>`;

    // Render read-only event card
    html += renderEventCard(currentEvent);

    // Render AI Summary (if exists)
    const aiSummary = currentUpdates.find(u => u.fields.SummaryType === 'AI-Generated');
    if (aiSummary) {
        html += renderAISummary(aiSummary);
    }

    // Render Discussion/Comments section using EventDiscussion
    html += `
        <div class="card">
            <h2 class="card-title mb-2">Discussion</h2>
            ${EventDiscussion.renderSummarizeButton()}
            <div class="comments-list">
                ${EventDiscussion.renderComments(currentComments)}
            </div>
            ${EventDiscussion.renderCommentForm()}
        </div>
    `;

    container.innerHTML = html;
}

function renderEventCard(event) {
    const { EventName, EventDate, EventTime, LocationType, CustomLocation, Address, Description, Status, CancelReason } = event.fields;
    const isCancelled = Status === 'Canceled';
    const date = new Date(EventDate + 'T00:00:00');
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();

    // Build location display
    const locationName = CustomLocation || LocationType || '';
    const location = locationName || Address || 'Location TBD';
    const locationHtml = (!locationName && Address) ?
        `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(Address)}" target="_blank" rel="noopener">${location}</a>` :
        location;

    return `
        <div class="card discussion-event-card">
            <div class="event-header">
                <div class="event-date-box">
                    <div class="month">${month}</div>
                    <div class="day">${day}</div>
                </div>
                <div class="event-header-info">
                    <h1>${EventName || 'Untitled Event'}${isCancelled ? ' <span class="badge badge-cancelled">Canceled</span>' : ''}</h1>
                    <div class="event-meta">
                        <span>${Utils.formatTime(EventTime) || 'Time TBD'}</span>
                    </div>
                    <div class="event-meta">
                        <span>${locationHtml}</span>
                    </div>
                    ${Address && Address !== location ? `<div class="event-meta"><span><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(Address)}" target="_blank" rel="noopener">${Address}</a></span></div>` : ''}
                </div>
            </div>
            ${isCancelled && CancelReason ? `<p class="mt-2 text-muted"><strong>Reason:</strong> ${CancelReason}</p>` : ''}
            ${Description ? `<div class="event-description mt-2"><p>${Description}</p></div>` : ''}
        </div>
    `;
}

function renderAISummary(aiSummary) {
    const { UpdateText, Timestamp } = aiSummary.fields;
    const timeAgo = Utils.formatRelativeTime(Timestamp);

    // Escape HTML to prevent XSS
    const div = document.createElement('div');
    div.textContent = UpdateText;
    const escapedText = div.innerHTML.replace(/\n/g, '<br>');

    return `
        <div class="card ai-summary-highlight">
            <h2>
                AI Discussion Summary
                <span class="ai-badge">AI</span>
            </h2>
            <div class="ai-summary-text">${escapedText}</div>
            <p class="ai-summary-meta text-muted">Generated ${timeAgo}</p>
        </div>
    `;
}

function showError(message) {
    document.getElementById('discussion-content').innerHTML = `
        <div class="error-message">
            <p>Failed to load discussion.</p>
            <p class="text-muted">${message}</p>
            <a href="index.html" class="btn btn-primary mt-2">Back to Events</a>
        </div>
    `;
}

// ========== Initialize on page load ==========

document.addEventListener('DOMContentLoaded', () => {
    const authToken = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
    if (!authToken) {
        window.location.href = 'index.html';
        return;
    }
    init();
});
