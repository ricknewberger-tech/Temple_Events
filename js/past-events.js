// Past Events Page Logic

let pastEventsData = [];
let membersMap = {};
let rsvpCountMap = {};

document.addEventListener('DOMContentLoaded', () => {
    loadPastEvents();
    setupModal();
});

async function loadPastEvents() {
    const container = document.getElementById('past-events-list');

    try {
        // Load past events, members, and RSVPs in parallel
        const [events, members, allRsvps] = await Promise.all([
            Airtable.getPastEvents(),
            Airtable.getActiveMembers(),
            Airtable.getAllRSVPs()
        ]);

        // Create members lookup map
        membersMap = {};
        members.forEach(m => {
            membersMap[m.id] = `${m.fields.FirstName || ''} ${m.fields.LastName || ''}`.trim() || 'Unknown';
        });

        // Build RSVP count map (Yes or unset responses) per event
        rsvpCountMap = {};
        allRsvps.forEach(rsvp => {
            const response = rsvp.fields.Response;
            if (response === 'No') return;
            const eventIds = rsvp.fields.Event || [];
            eventIds.forEach(eid => {
                rsvpCountMap[eid] = (rsvpCountMap[eid] || 0) + 1;
            });
        });

        if (events.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No past events</h3>
                    <p>Events will appear here after they've taken place.</p>
                </div>
            `;
            return;
        }

        pastEventsData = events;
        renderPastEvents(pastEventsData);

    } catch (error) {
        console.error('Error loading past events:', error);
        container.innerHTML = `
            <div class="error-message">
                <p>Failed to load past events. Please check your Airtable configuration.</p>
                <p class="text-muted">${error.message}</p>
            </div>
        `;
    }
}

function renderPastEvents(events) {
    const container = document.getElementById('past-events-list');

    container.innerHTML = events.map(event => renderPastEventCard(event)).join('');

    // Attach click handlers for view attendees buttons
    document.querySelectorAll('.btn-view-attendees').forEach(btn => {
        btn.addEventListener('click', () => {
            const eventId = btn.dataset.eventId;
            showAttendeesModal(eventId);
        });
    });
}

function renderPastEventCard(event) {
    const { EventName, EventDate, LocationType, CustomLocation, Address, MemberHost } = event.fields;
    const date = new Date(EventDate + 'T00:00:00');
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    const attendeeCount = rsvpCountMap[event.id] || 0;

    // Build location display
    const location = CustomLocation || Address || LocationType || '';

    // Get host name from linked member
    const hostName = MemberHost && MemberHost[0] ? membersMap[MemberHost[0]] : '';

    return `
        <div class="card event-card">
            <div class="event-date-box">
                <div class="month">${month}</div>
                <div class="day">${day}</div>
            </div>
            <div class="event-info">
                <h3>${EventName || 'Untitled Event'}</h3>
                <div class="event-meta">
                    <span>${Utils.formatDate(EventDate)}</span>
                    ${location ? `<span>${location}</span>` : ''}
                    ${hostName ? `<span>Hosted by ${hostName}</span>` : ''}
                </div>
            </div>
            <div class="event-actions">
                <span class="rsvp-count">${attendeeCount} attended</span>
                ${attendeeCount > 0 ? `
                    <button class="btn btn-secondary btn-sm btn-view-attendees" data-event-id="${event.id}">
                        View Attendees
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

function setupModal() {
    const modal = document.getElementById('attendee-modal');
    const closeBtn = document.getElementById('modal-close');

    closeBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}

async function showAttendeesModal(eventId) {
    const event = pastEventsData.find(e => e.id === eventId);
    if (!event) return;

    const modal = document.getElementById('attendee-modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');

    title.textContent = `Attendees - ${event.fields.EventName}`;
    body.innerHTML = '<p class="text-muted">Loading...</p>';
    modal.classList.add('active');

    try {
        const attendees = await Airtable.getYesRSVPs(eventId);
        if (attendees.length > 0) {
            body.innerHTML = `
                <ul class="attendee-list">
                    ${attendees.map(rsvp => {
                        const memberName = getMemberName(rsvp.fields.Member);
                        const bringing = rsvp.fields.Bringing;
                        return `
                            <li class="attendee-item">
                                <span class="attendee-name">${memberName}</span>
                                ${bringing ? `<span class="attendee-bringing">Brought: ${bringing}</span>` : ''}
                            </li>
                        `;
                    }).join('')}
                </ul>
            `;
        } else {
            body.innerHTML = '<p class="text-muted">No attendees recorded.</p>';
        }
    } catch (error) {
        body.innerHTML = '<p class="text-muted">Failed to load attendees.</p>';
    }
}

function closeModal() {
    document.getElementById('attendee-modal').classList.remove('active');
}

function getMemberName(memberField) {
    // Member field is a linked record (array of IDs)
    if (Array.isArray(memberField) && memberField.length > 0) {
        return membersMap[memberField[0]] || 'Unknown';
    }
    // Fallback: if it's text
    if (typeof memberField === 'string') return memberField;
    return 'Unknown';
}
