// Admin Panel Logic

let isLoggedIn = false;
let allEvents = [];
let allRSVPs = [];
let allAdminMembers = [];
let deleteEventId = null;
let duplicateRSVPsToDelete = [];

document.addEventListener('DOMContentLoaded', () => {
    // Check if already logged in (session storage)
    if (sessionStorage.getItem('adminLoggedIn') === 'true') {
        showAdminPanel();
    }

    setupLoginForm();
    setupLogout();
    setupTabs();
    setupEventModal();
    setupCancelModal();
    setupAttendeesModal();
    setupNotificationModal();
    setupSMSTab();
    setupDeletePastRSVPsModal();
    setupDeduplicateRSVPsModal();
});

// ========== Authentication ==========

function setupLoginForm() {
    const form = document.getElementById('login-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const firstName = document.getElementById('admin-first-name').value;
        const lastName = document.getElementById('admin-last-name').value;
        const code = document.getElementById('admin-code').value;

        try {
            const result = await Airtable.loginAdminWithName(firstName, lastName, code);
            if (result.success) {
                sessionStorage.setItem('adminLoggedIn', 'true');
                sessionStorage.setItem('authToken', `admin:${code}`);

                // If admin has member ID, store it for RSVP/participation features
                if (result.memberId) {
                    sessionStorage.setItem('memberId', result.memberId);
                    sessionStorage.setItem('memberName', result.name);
                }

                showAdminPanel();
            }
        } catch (error) {
            document.getElementById('login-error').style.display = 'block';
            document.getElementById('admin-first-name').value = '';
            document.getElementById('admin-last-name').value = '';
            document.getElementById('admin-code').value = '';
        }
    });
}

function setupLogout() {
    document.getElementById('btn-logout').addEventListener('click', () => {
        sessionStorage.removeItem('adminLoggedIn');
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('memberId');
        window.location.href = '/';
    });
}

function showAdminPanel() {
    isLoggedIn = true;
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    loadAdminData();
}

// ========== Tabs ==========

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;

            // Update button states
            document.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.remove('active', 'btn-primary');
                b.classList.add('btn-secondary');
            });
            btn.classList.remove('btn-secondary');
            btn.classList.add('active', 'btn-primary');

            // Show/hide tab content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.style.display = 'none';
            });
            document.getElementById(`tab-${tab}`).style.display = 'block';

            // Load data for the selected tab
            if (tab === 'notifications') {
                loadAdminNotifications();
            } else if (tab === 'sms') {
                loadSMSSelectors();
                loadSMSLogs();
            } else if (tab === 'maintenance') {
                loadMaintenanceTab();
            }
        });
    });
}

// ========== Data Loading ==========

async function loadAdminData() {
    await Promise.all([
        loadAdminEvents(),
        loadAdminRSVPs(),
        loadAdminMembers(),
        loadAdminNotifications()
    ]);
}

async function loadAdminMembers() {
    try {
        // Use namesOnly endpoint (no auth required) for the host dropdown
        const data = await fetch('/api/members?namesOnly=true');
        const result = await data.json();
        allAdminMembers = result.records || [];
        populateMemberHostDropdown();
    } catch (error) {
        console.error('Error loading members:', error);
    }
}

function populateMemberHostDropdown() {
    const select = document.getElementById('event-member-host');
    if (!select) return;
    select.innerHTML = '<option value="">Select a member...</option>' +
        allAdminMembers.map(m => {
            const name = `${m.fields.FirstName || ''} ${m.fields.LastName || ''}`.trim();
            return `<option value="${m.id}">${name}</option>`;
        }).join('');
}

async function loadAdminEvents() {
    const container = document.getElementById('admin-events-list');

    try {
        const [events, allRsvpsForCount] = await Promise.all([
            Airtable.getAllEvents(),
            Airtable.getAllRSVPs()
        ]);

        // Build per-event "Yes" count from live RSVP data (more reliable than RSVPCount rollup field)
        const rsvpCountByEvent = {};
        allRsvpsForCount.forEach(rsvp => {
            if (rsvp.fields.Response !== 'Yes') return;
            (rsvp.fields.Event || []).forEach(eid => {
                rsvpCountByEvent[eid] = (rsvpCountByEvent[eid] || 0) + 1;
            });
        });
        const today = new Date().toISOString().split('T')[0];
        allEvents = events.filter(e => e.fields.EventDate >= today);
        const pastEvents = events
            .filter(e => e.fields.EventDate < today)
            .sort((a, b) => new Date(b.fields.EventDate) - new Date(a.fields.EventDate));

        if (allEvents.length === 0 && pastEvents.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No upcoming events</h3>
                    <p>Create your first event!</p>
                </div>
            `;
            return;
        }

        if (allEvents.length === 0) {
            container.innerHTML = '';
        }

        // Sort: Interested events first, then by date
        allEvents.sort((a, b) => {
            const statusA = a.fields.Status || 'Upcoming';
            const statusB = b.fields.Status || 'Upcoming';

            // Interested comes before others
            if (statusA === 'Interested' && statusB !== 'Interested') return -1;
            if (statusA !== 'Interested' && statusB === 'Interested') return 1;

            // Within same status, sort by date
            const dateA = new Date(a.fields.EventDate);
            const dateB = new Date(b.fields.EventDate);
            return dateA - dateB;
        });

        // Load interest counts for Interested events; use RSVPCount field for regular events
        const eventsWithCounts = await Promise.all(
            allEvents.map(async (event) => {
                const isInterested = event.fields.Status === 'Interested';
                if (isInterested) {
                    const interestCount = await Airtable.countEventInterest(event.id);
                    return { ...event, interestCount, attendeeCount: 0 };
                } else {
                    const attendeeCount = rsvpCountByEvent[event.id] || 0;
                    return { ...event, interestCount: 0, attendeeCount };
                }
            })
        );

        if (allEvents.length > 0) {
            renderAdminEvents(eventsWithCounts);
        }

        // Append past events section below upcoming events
        if (pastEvents.length > 0) {
            const pastSection = document.createElement('div');
            pastSection.className = 'mt-3';
            pastSection.innerHTML = `
                <h3 class="mb-2">Past Events</h3>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Event Name</th>
                                <th>Date</th>
                                <th>Location</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pastEvents.map(event => {
                                const { EventName, EventDate, CustomLocation, Address, LocationType, Status } = event.fields;
                                const location = CustomLocation || Address || LocationType || '-';
                                const statusClass = { 'Completed': 'badge-completed', 'Canceled': 'badge-cancelled' }[Status] || 'badge-completed';
                                return `
                                    <tr>
                                        <td><strong><a href="event.html?id=${event.id}">${EventName || 'Untitled'}</a></strong></td>
                                        <td>${Utils.formatDate(EventDate)}</td>
                                        <td>${location}</td>
                                        <td><span class="badge ${statusClass}">${Status || 'Completed'}</span></td>
                                        <td><button class="btn btn-danger btn-sm btn-delete-past-event" data-event-id="${event.id}">Delete</button></td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            container.appendChild(pastSection);

            pastSection.querySelectorAll('.btn-delete-past-event').forEach(btn => {
                btn.addEventListener('click', () => openDeleteModal(btn.dataset.eventId));
            });
        }

    } catch (error) {
        console.error('Error loading events:', error);
        container.innerHTML = `
            <div class="error-message">
                <p>Failed to load events.</p>
                <p class="text-muted">${error.message}</p>
            </div>
        `;
    }
}

function renderAdminEvents(events) {
    const container = document.getElementById('admin-events-list');

    container.innerHTML = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Event Name</th>
                        <th>Date</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${events.map(event => renderAdminEventRow(event)).join('')}
                </tbody>
            </table>
        </div>
    `;

    // Attach event handlers
    document.querySelectorAll('.btn-edit-event').forEach(btn => {
        btn.addEventListener('click', () => openEditEventModal(btn.dataset.eventId));
    });

    document.querySelectorAll('.btn-add-attendees').forEach(btn => {
        btn.addEventListener('click', () => openAddAttendeesModal(btn.dataset.eventId));
    });

    document.querySelectorAll('.btn-email-members').forEach(btn => {
        btn.addEventListener('click', () => emailMembersAboutEvent(btn.dataset.eventId));
    });

    document.querySelectorAll('.btn-delete-event').forEach(btn => {
        btn.addEventListener('click', () => openDeleteModal(btn.dataset.eventId));
    });

    // Confirm Event button for Interested events
    document.querySelectorAll('.btn-confirm-event').forEach(btn => {
        btn.addEventListener('click', async () => {
            const eventId = btn.dataset.eventId;
            const event = allEvents.find(e => e.id === eventId);
            if (!event) return;

            const interestCount = await Airtable.countEventInterest(eventId);
            const message = `Ready to confirm this event?\n\n${interestCount} ${interestCount === 1 ? 'person has' : 'people have'} indicated interest.\n\nThis will change it to an Upcoming event and enable RSVPs.`;

            if (confirm(message)) {
                try {
                    await Airtable.updateEvent(eventId, { Status: 'Upcoming' });
                    Utils.showToast('Event confirmed!');
                    loadAdminEvents(); // Reload the list
                } catch (error) {
                    console.error('Error confirming event:', error);
                    Utils.showToast('Failed to confirm event: ' + error.message, 'error');
                }
            }
        });
    });

    // Show Interested Members button
    document.querySelectorAll('.btn-show-interested-admin').forEach(btn => {
        btn.addEventListener('click', async () => {
            const eventId = btn.dataset.eventId;
            try {
                const interests = await Airtable.getEventInterestByEventId(eventId);
                const memberNames = await Promise.all(interests.map(async (interest) => {
                    const memberId = interest.fields.Member[0];
                    const member = allAdminMembers.find(m => m.id === memberId);
                    return member ? `${member.fields.FirstName || ''} ${member.fields.LastName || ''}`.trim() : 'Unknown';
                }));

                if (memberNames.length === 0) {
                    alert('No one has indicated interest yet.');
                } else {
                    alert(`${memberNames.length} ${memberNames.length === 1 ? 'person is' : 'people are'} interested:\n\n${memberNames.join('\n')}`);
                }
            } catch (error) {
                console.error('Error loading interested members:', error);
                alert('Failed to load interested members: ' + error.message);
            }
        });
    });
}

function renderAdminEventRow(event) {
    const { EventName, EventDate, LocationType, CustomLocation, Address, Status } = event.fields;
    const isInterested = Status === 'Interested';
    const interestCount = event.interestCount || 0;
    const attendeeCount = event.attendeeCount || 0;

    // Build location display
    const location = CustomLocation || Address || LocationType || '-';

    const statusClass = {
        'Upcoming': 'badge-upcoming',
        'Interested': 'badge-interested',
        'Completed': 'badge-completed',
        'Canceled': 'badge-cancelled'
    }[Status] || 'badge-upcoming';

    const statusDisplay = `<span class="badge ${statusClass}">${Status || 'Upcoming'}</span>`;

    // Add pale yellow background for interested events
    const rowStyle = isInterested ? 'style="background-color: #fffde7;"' : '';

    return `
        <tr ${rowStyle}>
            <td>
                <strong><a href="event.html?id=${event.id}">${EventName || 'Untitled'}</a></strong>
            </td>
            <td>${Utils.formatDate(EventDate)}</td>
            <td>${location}</td>
            <td>${statusDisplay}</td>
            <td>
                <div class="flex gap-1" style="flex-direction: column; align-items: flex-start;">
                    <div class="flex gap-1" style="flex-wrap: wrap;">
                        ${isInterested ? `
                            <button class="btn btn-success btn-sm btn-confirm-event" data-event-id="${event.id}">Confirm Event</button>
                            <button class="btn btn-secondary btn-sm btn-show-interested-admin" data-event-id="${event.id}">Interested (${interestCount})</button>
                        ` : `
                            <button class="btn btn-secondary btn-sm btn-add-attendees" data-event-id="${event.id}">Attendees (${attendeeCount})</button>
                        `}
                        <button class="btn btn-secondary btn-sm btn-edit-event" data-event-id="${event.id}">Edit</button>
                    </div>
                    <div class="flex gap-1" style="flex-wrap: wrap;">
                        <button class="btn btn-primary btn-sm btn-email-members" data-event-id="${event.id}">Email Members</button>
                        <button class="btn btn-danger btn-sm btn-delete-event" data-event-id="${event.id}">Delete</button>
                    </div>
                </div>
            </td>
        </tr>
    `;
}

async function emailMembersAboutEvent(eventId) {
    const event = allEvents.find(e => e.id === eventId);
    if (!event) return;

    const isInterested = event.fields.Status === 'Interested';

    try {
        // Get member emails and RSVPs/Interest for this event
        const members = await Airtable.getActiveMembers();

        const emails = members.map(m => {
            const raw = m.fields.Email;
            if (!raw) return null;
            // Extract email from "Name <email>" format if present
            const match = raw.match(/<(.+?)>/);
            return match ? match[1] : raw.trim();
        }).filter(Boolean);
        if (emails.length === 0) {
            Utils.showToast('No member emails found', 'error');
            return;
        }

        const { EventName, EventDate, EventTime, CustomLocation, Address, Description } = event.fields;
        const location = CustomLocation || Address || 'TBD';
        const time = EventTime ? Utils.formatTime(EventTime) : 'TBD';
        const date = Utils.formatDate(EventDate);

        let subject, body;

        // Build members map for all paths
        const membersMap = {};
        members.forEach(m => {
            membersMap[m.id] = `${m.fields.FirstName || ''} ${m.fields.LastName || ''}`.trim();
        });

        // Check if this was converted from an interest event (Upcoming with interest records)
        const interests = await Airtable.getEventInterestByEventId(event.id);
        const wasConverted = !isInterested && interests.length > 0;

        if (isInterested) {
            // Interest check email
            subject = `VMC - Interest Check: ${EventName}`;
            body = `Log into the NS app and let me know if you are interested in making this into a scheduled event.\n\n`;
            body += `${EventName}\n`;
            body += `Proposed Date: ${date}\n`;
            body += `Proposed Time: ${time}\n`;
            body += `Location: ${location}\n`;
            if (Address && Address !== location) body += `Address: ${Address}\n`;
            if (Description) body += `\nDetails: ${Description}\n`;

            // Add list of interested members
            if (interests.length > 0) {
                body += `\nInterested (${interests.length}):\n`;
                interests.forEach(interest => {
                    const memberId = Array.isArray(interest.fields.Member) ? interest.fields.Member[0] : '';
                    const name = membersMap[memberId] || 'Unknown';
                    body += `  - ${name}\n`;
                });
            }

            body += `\nSign in to view and express interest or not:\n${window.location.origin}`;
        } else if (wasConverted) {
            // Converted from interest to RSVP event
            subject = `VMC - ${EventName} is Now a Planned Event!`;
            body = `Dear NS members,\n\n`;
            body += `Great news! The exploratory event "${EventName}" has been converted to a planned RSVP event.\n`;
            body += `You can find it in the Upcoming Events section.\n\n`;

            // List who was interested
            body += `Originally interested (${interests.length}):\n`;
            interests.forEach(interest => {
                const memberId = Array.isArray(interest.fields.Member) ? interest.fields.Member[0] : '';
                const name = membersMap[memberId] || 'Unknown';
                body += `  - ${name}\n`;
            });

            body += `\n--- EVENT DETAILS ---\n\n`;
            body += `${EventName}\n`;
            body += `Date: ${date}\n`;
            body += `Time: ${time}\n`;
            body += `Location: ${location}\n`;
            if (Address && Address !== location) body += `Address: ${Address}\n`;
            if (Description) body += `\nDetails: ${Description}\n`;

            // Add attendee info if anyone has RSVP'd
            const rsvps = await Airtable.getRSVPsByEventId(event.id);
            const yesRSVPs = rsvps.filter(r => r.fields.Response === 'Yes');
            if (yesRSVPs.length > 0) {
                body += `\n--- ATTENDEES (${yesRSVPs.length}) ---\n\n`;
                yesRSVPs.forEach(rsvp => {
                    const memberId = Array.isArray(rsvp.fields.Member) ? rsvp.fields.Member[0] : '';
                    const name = membersMap[memberId] || 'Unknown';
                    body += `- ${name}\n`;
                    if (rsvp.fields.Bringing) body += `  Bringing: ${rsvp.fields.Bringing}\n`;
                    body += '\n';
                });
            }

            body += `Sign in to view and RSVP:\n${window.location.origin}`;
        } else {
            // Regular event invitation
            subject = `VMC - New Event: ${EventName}`;
            body = `You're invited to a Vintage Menschen Chavurah event!\n\n`;
            body += `${EventName}\n`;
            body += `Date: ${date}\n`;
            body += `Time: ${time}\n`;
            body += `Location: ${location}\n`;
            if (Address && Address !== location) body += `Address: ${Address}\n`;
            if (Description) body += `\nDetails: ${Description}\n`;

            // Add attendee info if anyone has RSVP'd
            const rsvps = await Airtable.getRSVPsByEventId(event.id);
            const yesRSVPs = rsvps.filter(r => r.fields.Response === 'Yes');
            if (yesRSVPs.length > 0) {
                body += `\n--- ATTENDEES (${yesRSVPs.length}) ---\n\n`;
                yesRSVPs.forEach(rsvp => {
                    const memberId = Array.isArray(rsvp.fields.Member) ? rsvp.fields.Member[0] : '';
                    const name = membersMap[memberId] || 'Unknown';
                    body += `- ${name}\n`;
                    if (rsvp.fields.Bringing) body += `  Bringing: ${rsvp.fields.Bringing}\n`;
                    body += '\n';
                });
            }

            body += `Sign in to view and RSVP:\n${window.location.origin}`;
        }

        const mailtoUrl = `mailto:${emails.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoUrl;
    } catch (error) {
        console.error('Error preparing email:', error);
        Utils.showToast('Failed to prepare email: ' + error.message, 'error');
    }
}

// ========== Add Attendees Modal ==========

let attendeesEventId = null;

function setupAttendeesModal() {
    const modal = document.getElementById('attendees-modal');

    document.getElementById('attendees-modal-close').addEventListener('click', closeAttendeesModal);
    document.getElementById('attendees-modal-cancel').addEventListener('click', closeAttendeesModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAttendeesModal();
    });

    document.getElementById('attendees-modal-save').addEventListener('click', saveAttendees);
}

async function openAddAttendeesModal(eventId) {
    attendeesEventId = eventId;
    const event = allEvents.find(e => e.id === eventId);
    if (!event) return;

    document.getElementById('attendees-modal-title').textContent = `Add Attendees - ${event.fields.EventName}`;

    const listContainer = document.getElementById('attendees-member-list');
    listContainer.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading...</p></div>';
    document.getElementById('attendees-modal').classList.add('active');

    try {
        // Load members and existing RSVPs
        const [members, rsvps] = await Promise.all([
            Airtable.getActiveMembers(),
            Airtable.getRSVPsByEventId(event.id)
        ]);

        // Find members who already RSVP'd Yes
        const yesMembers = new Set();
        rsvps.forEach(rsvp => {
            if (rsvp.fields.Response === 'Yes' && Array.isArray(rsvp.fields.Member)) {
                yesMembers.add(rsvp.fields.Member[0]);
            }
        });

        listContainer.innerHTML = members.map(m => {
            const name = `${m.fields.FirstName || ''} ${m.fields.LastName || ''}`.trim();
            const checked = yesMembers.has(m.id) ? 'checked disabled' : '';
            const label = yesMembers.has(m.id) ? `${name} (already attending)` : name;
            return `
                <label class="checkbox-item">
                    <input type="checkbox" value="${m.id}" ${checked}>
                    <span>${label}</span>
                </label>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading attendees data:', error);
        listContainer.innerHTML = '<p class="text-muted">Failed to load members.</p>';
    }
}

function closeAttendeesModal() {
    attendeesEventId = null;
    document.getElementById('attendees-modal').classList.remove('active');
}

async function saveAttendees() {
    if (!attendeesEventId) return;

    const event = allEvents.find(e => e.id === attendeesEventId);
    if (!event) return;

    const saveBtn = document.getElementById('attendees-modal-save');
    const checkboxes = document.querySelectorAll('#attendees-member-list input[type="checkbox"]:checked:not(:disabled)');
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);

    if (selectedIds.length === 0) {
        Utils.showToast('No new members selected', 'error');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Adding...';

    try {
        // Create RSVPs for each selected member
        await Promise.all(selectedIds.map(memberId =>
            Airtable.createRSVP({
                Event: [event.id],
                Member: [memberId],
                Response: 'Yes'
            })
        ));

        Utils.showToast(`${selectedIds.length} attendee(s) added!`);
        closeAttendeesModal();
    } catch (error) {
        console.error('Error adding attendees:', error);
        Utils.showToast('Failed to add attendees: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Add Selected';
    }
}

async function loadAdminRSVPs() {
    const container = document.getElementById('admin-rsvps-list');

    try {
        const [rsvps, members, events] = await Promise.all([
            Airtable.getAllRSVPs(),
            Airtable.getAllMembers(),
            Airtable.getAllEvents()
        ]);

        allRSVPs = rsvps;

        // Create lookup maps
        const membersMap = {};
        members.forEach(m => {
            membersMap[m.id] = `${m.fields.FirstName || ''} ${m.fields.LastName || ''}`.trim() || 'Unknown';
        });

        const eventsMap = {};
        const eventDatesMap = {};
        events.forEach(e => {
            eventsMap[e.id] = e.fields.EventName;
            eventDatesMap[e.id] = e.fields.EventDate || '';
        });

        // Build set of past event IDs so we can show a Delete button only for those rows
        const today = new Date().toISOString().split('T')[0];
        const pastEventIds = new Set(
            events.filter(e => e.fields.EventDate < today).map(e => e.id)
        );

        // Sort RSVPs by event date descending (most recent event first)
        const sortedRsvps = [...rsvps].sort((a, b) => {
            const idA = Array.isArray(a.fields.Event) ? a.fields.Event[0] : null;
            const idB = Array.isArray(b.fields.Event) ? b.fields.Event[0] : null;
            const dateA = idA ? (eventDatesMap[idA] || '') : '';
            const dateB = idB ? (eventDatesMap[idB] || '') : '';
            return dateB.localeCompare(dateA);
        });

        if (rsvps.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No RSVPs yet</h3>
                    <p>RSVPs will appear here when members respond to events.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Member</th>
                            <th>Event</th>
                            <th>Response</th>
                            <th>Bringing</th>
                            <th>Notes</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedRsvps.map(rsvp => {
                            // Both Member and Event are linked records (arrays of IDs)
                            const memberName = Array.isArray(rsvp.fields.Member)
                                ? (membersMap[rsvp.fields.Member[0]] || 'Unknown')
                                : (rsvp.fields.Member || 'Unknown');
                            const eventId = Array.isArray(rsvp.fields.Event) ? rsvp.fields.Event[0] : null;
                            const eventName = eventId ? (eventsMap[eventId] || 'Unknown') : 'Unknown';
                            const responseClass = rsvp.fields.Response === 'Yes' ? 'badge-yes' : 'badge-no';
                            const isPast = eventId && pastEventIds.has(eventId);

                            return `
                                <tr>
                                    <td>${memberName}</td>
                                    <td>${eventName}</td>
                                    <td><span class="badge ${responseClass}">${rsvp.fields.Response || '-'}</span></td>
                                    <td>${rsvp.fields.Bringing || '-'}</td>
                                    <td>${rsvp.fields.PersonalNotes || '-'}</td>
                                    <td>${isPast ? `<button class="btn btn-danger btn-sm btn-delete-rsvp" data-rsvp-id="${rsvp.id}">Delete</button>` : '-'}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Attach delete listeners for past-event RSVP rows
        container.querySelectorAll('.btn-delete-rsvp').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this RSVP? This cannot be undone.')) return;
                try {
                    await Airtable.deleteRSVP(btn.dataset.rsvpId);
                    Utils.showToast('RSVP deleted.');
                    loadAdminRSVPs();
                } catch (err) {
                    Utils.showToast('Failed to delete RSVP: ' + err.message, 'error');
                }
            });
        });

    } catch (error) {
        console.error('Error loading RSVPs:', error);
        container.innerHTML = `
            <div class="error-message">
                <p>Failed to load RSVPs.</p>
                <p class="text-muted">${error.message}</p>
            </div>
        `;
    }
}

// ========== Event Modal ==========

function setupEventModal() {
    const modal = document.getElementById('event-modal');
    const form = document.getElementById('event-form');

    // New event button
    document.getElementById('btn-new-event').addEventListener('click', () => {
        openNewEventModal();
    });

    // Close buttons
    document.getElementById('event-modal-close').addEventListener('click', closeEventModal);
    document.getElementById('event-modal-cancel').addEventListener('click', closeEventModal);

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeEventModal();
    });

    // Location type change - show/hide member host dropdown
    const locationTypeSelect = document.getElementById('event-location-type');
    locationTypeSelect.addEventListener('change', async () => {
        const memberHostGroup = document.getElementById('member-host-group');
        if (locationTypeSelect.value === "Member's Home") {
            memberHostGroup.style.display = 'block';
            // Ensure dropdown is populated
            if (allAdminMembers.length === 0) {
                await loadAdminMembers();
            } else {
                populateMemberHostDropdown();
            }
        } else {
            memberHostGroup.style.display = 'none';
            document.getElementById('event-member-host').value = '';
        }
    });

    // Member host change - auto-fill address
    document.getElementById('event-member-host').addEventListener('change', (e) => {
        const memberId = e.target.value;
        if (memberId) {
            const member = allAdminMembers.find(m => m.id === memberId);
            if (member) {
                const name = `${member.fields.FirstName || ''} ${member.fields.LastName || ''}`.trim();
                document.getElementById('event-custom-location').value = `${name}'s Home`;
                const addressParts = [
                    member.fields.Address,
                    member.fields.City,
                    member.fields.State,
                    member.fields.Zip
                ].filter(Boolean).join(', ');
                if (addressParts) {
                    document.getElementById('event-address').value = addressParts;
                }
            }
        }
    });

    // Form submission
    form.addEventListener('submit', handleEventSubmit);
}

function openNewEventModal() {
    document.getElementById('event-modal-title').textContent = 'New Event';
    document.getElementById('event-form').reset();
    document.getElementById('event-id').value = '';
    const hostGroup = document.getElementById('member-host-group');
    if (hostGroup) hostGroup.style.display = 'none';
    const hostSelect = document.getElementById('event-member-host');
    if (hostSelect) hostSelect.value = '';
    document.getElementById('event-modal-save').textContent = 'Create Event';
    document.getElementById('event-modal-cancel-event').style.display = 'none';
    document.getElementById('event-modal').classList.add('active');
    window.scrollTo(0, 0);
    const modalBody = document.querySelector('#event-modal .modal-body');
    if (modalBody) modalBody.scrollTop = 0;
}

function openEditEventModal(eventId) {
    const event = allEvents.find(e => e.id === eventId);
    if (!event) return;

    document.getElementById('event-modal-title').textContent = 'Edit Event';
    document.getElementById('event-id').value = eventId;
    document.getElementById('event-name').value = event.fields.EventName || '';
    document.getElementById('event-date').value = event.fields.EventDate || '';
    document.getElementById('event-time').value = event.fields.EventTime || '';
    document.getElementById('event-location-type').value = event.fields.LocationType || '';
    document.getElementById('event-custom-location').value = event.fields.CustomLocation || '';
    document.getElementById('event-address').value = event.fields.Address || '';
    document.getElementById('event-max').value = event.fields.MaxAttendees || '';
    document.getElementById('event-status').value = event.fields.Status || 'Upcoming';
    document.getElementById('event-description').value = event.fields.Description || '';
    document.getElementById('event-modal-save').textContent = 'Save Changes';

    // Show Cancel Event button (only for existing events that aren't already canceled)
    const cancelBtn = document.getElementById('event-modal-cancel-event');
    if (event.fields.Status === 'Canceled') {
        cancelBtn.style.display = 'none';
    } else {
        cancelBtn.style.display = 'inline-block';
    }

    // Show member host dropdown if location type is Member's Home
    const memberHostGroup = document.getElementById('member-host-group');
    const memberHostSelect = document.getElementById('event-member-host');
    if (memberHostGroup && memberHostSelect) {
        if (event.fields.LocationType === "Member's Home") {
            memberHostGroup.style.display = 'block';
            const hostId = Array.isArray(event.fields.MemberHost) ? event.fields.MemberHost[0] : '';
            memberHostSelect.value = hostId || '';
        } else {
            memberHostGroup.style.display = 'none';
            memberHostSelect.value = '';
        }
    }

    document.getElementById('event-modal').classList.add('active');
}

function closeEventModal() {
    document.getElementById('event-modal').classList.remove('active');
}

async function handleEventSubmit(e) {
    e.preventDefault();

    const saveBtn = document.getElementById('event-modal-save');
    const eventId = document.getElementById('event-id').value;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        const eventData = {
            EventName: document.getElementById('event-name').value,
            EventDate: document.getElementById('event-date').value,
            EventTime: document.getElementById('event-time').value || null,
            LocationType: document.getElementById('event-location-type').value || null,
            CustomLocation: document.getElementById('event-custom-location').value || null,
            Address: document.getElementById('event-address').value || null,
            MaxAttendees: document.getElementById('event-max').value ? parseInt(document.getElementById('event-max').value) : null,
            Status: document.getElementById('event-status').value || null,
            Description: document.getElementById('event-description').value || null
        };
        const memberHostId = document.getElementById('event-member-host')?.value;
        if (memberHostId) {
            eventData.MemberHost = [memberHostId];
        }

        if (eventId) {
            await Airtable.updateEvent(eventId, eventData);
            Utils.showToast('Event updated successfully!');
        } else {
            await Airtable.createEvent(eventData);
            Utils.showToast('Event created successfully!');
        }

        closeEventModal();
        loadAdminEvents();

    } catch (error) {
        console.error('Error saving event:', error);
        Utils.showToast('Failed to save event: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = eventId ? 'Save Changes' : 'Create Event';
    }
}

// ========== Delete Modal ==========

function setupCancelModal() {
    // Set up Delete modal
    const deleteModal = document.getElementById('delete-modal');
    document.getElementById('delete-modal-close').addEventListener('click', closeDeleteModal);
    document.getElementById('delete-modal-dismiss').addEventListener('click', closeDeleteModal);
    deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) closeDeleteModal();
    });
    document.getElementById('delete-modal-confirm').addEventListener('click', confirmDelete);

    // Set up Cancel modal (for marking events as canceled)
    const cancelModal = document.getElementById('cancel-modal');
    document.getElementById('cancel-modal-close').addEventListener('click', closeCancelModal);
    document.getElementById('cancel-modal-dismiss').addEventListener('click', closeCancelModal);
    cancelModal.addEventListener('click', (e) => {
        if (e.target === cancelModal) closeCancelModal();
    });
    document.getElementById('cancel-modal-confirm').addEventListener('click', confirmCancel);

    // Cancel Event button in edit modal
    document.getElementById('event-modal-cancel-event').addEventListener('click', () => {
        const eventId = document.getElementById('event-id').value;
        if (eventId) {
            closeEventModal();
            openCancelModal(eventId);
        }
    });
}

// Delete modal (permanently removes event)
function openDeleteModal(eventId) {
    deleteEventId = eventId;
    document.getElementById('delete-modal').classList.add('active');
}

function closeDeleteModal() {
    deleteEventId = null;
    document.getElementById('delete-modal').classList.remove('active');
}

async function confirmDelete() {
    if (!deleteEventId) return;

    const confirmBtn = document.getElementById('delete-modal-confirm');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';

    try {
        await Airtable.deleteEvent(deleteEventId);
        Utils.showToast('Event deleted!');
        closeDeleteModal();
        loadAdminEvents();
    } catch (error) {
        console.error('Error deleting event:', error);
        Utils.showToast('Failed to delete event: ' + error.message, 'error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Delete Event';
    }
}

// Cancel modal (marks event as canceled, keeps in database)
function openCancelModal(eventId) {
    deleteEventId = eventId;
    document.getElementById('cancel-reason').value = '';
    document.getElementById('cancel-modal').classList.add('active');
}

function closeCancelModal() {
    deleteEventId = null;
    document.getElementById('cancel-modal').classList.remove('active');
}

async function confirmCancel() {
    if (!deleteEventId) return;

    const confirmBtn = document.getElementById('cancel-modal-confirm');
    const reason = document.getElementById('cancel-reason').value.trim();
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Cancelling...';

    try {
        const updateData = { Status: 'Canceled' };
        if (reason) updateData.CancelReason = reason;
        await Airtable.updateEvent(deleteEventId, updateData);
        Utils.showToast('Event cancelled!');
        closeCancelModal();
        loadAdminEvents();
    } catch (error) {
        console.error('Error cancelling event:', error);
        Utils.showToast('Failed to cancel event: ' + error.message, 'error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Cancel Event';
    }
}

// ========== Notification Management ==========

function setupNotificationModal() {
    const modal = document.getElementById('notification-modal');
    const form = document.getElementById('notification-form');
    const closeBtn = document.getElementById('notification-modal-close');
    const cancelBtn = document.getElementById('notification-modal-cancel');
    const saveBtn = document.getElementById('notification-modal-save');
    const newBtn = document.getElementById('btn-new-notification');

    // Open modal for new notification
    newBtn.addEventListener('click', () => {
        openNotificationModal();
    });

    // Close modal handlers
    closeBtn.addEventListener('click', closeNotificationModal);
    cancelBtn.addEventListener('click', closeNotificationModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeNotificationModal();
    });

    // Form submit
    saveBtn.addEventListener('click', handleNotificationSubmit);
}

function openNotificationModal(notificationId = null) {
    const modal = document.getElementById('notification-modal');
    const form = document.getElementById('notification-form');
    const title = document.getElementById('notification-modal-title');

    // Reset form
    form.reset();
    document.getElementById('notification-id').value = '';
    document.getElementById('notification-active').checked = true;
    document.getElementById('notification-priority').value = '3';
    document.getElementById('notification-audience').value = 'all';

    if (notificationId) {
        title.textContent = 'Edit Notification';
        loadNotificationData(notificationId);
    } else {
        title.textContent = 'New Notification';
    }

    modal.classList.add('active');
}

function closeNotificationModal() {
    document.getElementById('notification-modal').classList.remove('active');
}

async function loadNotificationData(notificationId) {
    try {
        const notifications = await Airtable.getAllNotifications();
        const notification = notifications.find(n => n.id === notificationId);

        if (!notification) {
            Utils.showToast('Notification not found', 'error');
            return;
        }

        const fields = notification.fields;
        document.getElementById('notification-id').value = notificationId;
        document.getElementById('notification-title').value = fields.Title || '';
        document.getElementById('notification-message').value = fields.Message || '';
        document.getElementById('notification-audience').value = fields.TargetAudience || 'all';
        document.getElementById('notification-priority').value = fields.Priority || 3;
        document.getElementById('notification-expires').value = fields.ExpiresDate || '';
        document.getElementById('notification-active').checked = fields.IsActive !== false;
    } catch (error) {
        console.error('Error loading notification:', error);
        Utils.showToast('Failed to load notification data', 'error');
    }
}

async function handleNotificationSubmit(e) {
    e.preventDefault();

    const notificationId = document.getElementById('notification-id').value;
    const title = document.getElementById('notification-title').value.trim();
    const message = document.getElementById('notification-message').value.trim();

    if (!title || !message) {
        Utils.showToast('Title and message are required', 'error');
        return;
    }

    const priority = parseInt(document.getElementById('notification-priority').value) || 3;

    const notificationData = {
        Title: title,
        Message: message,
        TargetAudience: document.getElementById('notification-audience').value,
        Priority: priority,
        IsActive: document.getElementById('notification-active').checked
    };

    const expiresDate = document.getElementById('notification-expires').value;
    if (expiresDate) {
        notificationData.ExpiresDate = expiresDate;
    }

    const saveBtn = document.getElementById('notification-modal-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        if (notificationId) {
            await Airtable.updateNotification(notificationId, notificationData);
            Utils.showToast('Notification updated!');
        } else {
            notificationData.CreateDate = new Date().toISOString();
            await Airtable.createNotification(notificationData);
            Utils.showToast('Notification created!');
        }
        closeNotificationModal();
        loadAdminNotifications();
    } catch (error) {
        console.error('Error saving notification:', error);
        Utils.showToast('Failed to save notification: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Notification';
    }
}

async function loadAdminNotifications() {
    const container = document.getElementById('admin-notifications-list');
    try {
        const notifications = await Airtable.getAllNotifications();

        if (notifications.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No notifications yet</p></div>';
            return;
        }

        // Sort by created date desc
        notifications.sort((a, b) => {
            const dateA = new Date(a.fields.CreateDate || 0);
            const dateB = new Date(b.fields.CreateDate || 0);
            return dateB - dateA;
        });

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Type</th>
                        <th>Audience</th>
                        <th>Status</th>
                        <th>Expires</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${notifications.map(renderNotificationRow).join('')}
                </tbody>
            </table>
        `;

        // Attach handlers
        attachNotificationHandlers();
    } catch (error) {
        console.error('Error loading notifications:', error);
        container.innerHTML = '<div class="error-message">Failed to load notifications</div>';
    }
}

function renderNotificationRow(notification) {
    const fields = notification.fields;
    const title = fields.Title || 'Untitled';
    const priority = fields.Priority || 3;
    const audience = fields.TargetAudience || 'all';
    const isActive = fields.IsActive !== false;
    const expiresDate = fields.ExpiresDate;

    // Derive type from priority
    let type;
    if (priority === 5) type = 'urgent';
    else if (priority === 4) type = 'warning';
    else if (priority === 1) type = 'success';
    else type = 'info';

    const statusBadge = isActive
        ? '<span class="badge badge-success">Active</span>'
        : '<span class="badge badge-cancelled">Inactive</span>';

    const expiresDisplay = expiresDate ? Utils.formatDate(expiresDate) : 'Never';

    return `
        <tr>
            <td><strong>${Utils.escapeHtml(title)}</strong></td>
            <td><span class="badge badge-${type}">Priority ${priority}</span></td>
            <td>${audience}</td>
            <td>${statusBadge}</td>
            <td>${expiresDisplay}</td>
            <td>
                <button class="btn btn-secondary btn-sm btn-edit-notification" data-id="${notification.id}">Edit</button>
                <button class="btn btn-danger btn-sm btn-delete-notification" data-id="${notification.id}">Delete</button>
            </td>
        </tr>
    `;
}

function attachNotificationHandlers() {
    document.querySelectorAll('.btn-edit-notification').forEach(btn => {
        btn.addEventListener('click', () => {
            openNotificationModal(btn.dataset.id);
        });
    });

    document.querySelectorAll('.btn-delete-notification').forEach(btn => {
        btn.addEventListener('click', () => {
            deleteNotification(btn.dataset.id);
        });
    });
}

async function deleteNotification(id) {
    if (!confirm('Are you sure you want to delete this notification? This cannot be undone.')) {
        return;
    }

    try {
        await Airtable.deleteNotification(id);
        Utils.showToast('Notification deleted');
        loadAdminNotifications();
    } catch (error) {
        console.error('Error deleting notification:', error);
        Utils.showToast('Failed to delete notification: ' + error.message, 'error');
    }
}

// ========== SMS Management ==========

function setupSMSTab() {
    const form = document.getElementById('sms-form');
    const recipientRadios = document.querySelectorAll('input[name="sms-recipients"]');
    const messageTextarea = document.getElementById('sms-message');
    const charCount = document.getElementById('sms-char-count');
    const selectAllCheckbox = document.getElementById('sms-select-all');

    // Show/hide recipient selectors based on radio selection
    recipientRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            document.getElementById('sms-event-selector').style.display =
                radio.value === 'event' ? 'block' : 'none';
            document.getElementById('sms-member-selector').style.display =
                radio.value === 'custom' ? 'block' : 'none';
            updateSMSRecipientCount();
        });
    });

    // Character counter
    messageTextarea.addEventListener('input', () => {
        const length = messageTextarea.value.length;
        charCount.textContent = `${length}/160 characters`;
        if (length > 160) {
            const segments = Math.ceil(length / 160);
            charCount.textContent += ` (${segments} SMS)`;
        }
        updateSMSPreview();
    });

    // Select all handler
    selectAllCheckbox.addEventListener('change', (e) => {
        document.querySelectorAll('.sms-member-checkbox').forEach(cb => {
            cb.checked = e.target.checked;
        });
        updateSMSRecipientCount();
    });

    // Form submission
    form.addEventListener('submit', handleSMSSend);
}

async function loadSMSSelectors() {
    try {
        const [members, events] = await Promise.all([
            Airtable.getActiveMembers(),
            Airtable.getAllEvents()
        ]);

        // Populate event dropdown
        const eventSelect = document.getElementById('sms-event');
        const upcomingEvents = events.filter(e => {
            const eventDate = new Date(e.fields.EventDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return e.fields.Status === 'Upcoming' && eventDate >= today;
        });

        eventSelect.innerHTML = '<option value="">Choose an event...</option>' +
            upcomingEvents.map(e => {
                const formattedDate = Utils.formatDate(e.fields.EventDate);
                return `<option value="${e.id}">${e.fields.EventName} - ${formattedDate}</option>`;
            }).join('');

        // Populate member checkboxes
        const memberList = document.getElementById('sms-member-list');
        const eligibleMembers = members.filter(m => m.fields.Phone && m.fields.SMSOptIn !== false);

        if (eligibleMembers.length === 0) {
            memberList.innerHTML = '<p class="text-muted">No members with phone numbers and SMS opt-in</p>';
            return;
        }

        memberList.innerHTML = eligibleMembers.map(m => {
            const name = `${m.fields.FirstName || ''} ${m.fields.LastName || ''}`.trim();
            const phone = m.fields.Phone;
            return `
                <label class="checkbox-item">
                    <input type="checkbox" class="sms-member-checkbox" value="${m.id}" data-phone="${phone}">
                    <span>${name} - ${phone}</span>
                </label>
            `;
        }).join('');

        // Individual checkbox handlers
        document.querySelectorAll('.sms-member-checkbox').forEach(cb => {
            cb.addEventListener('change', updateSMSRecipientCount);
        });

        // Event selector handler
        document.getElementById('sms-event').addEventListener('change', updateSMSRecipientCount);

    } catch (error) {
        console.error('Error loading SMS selectors:', error);
        Utils.showToast('Failed to load members/events', 'error');
    }
}

async function updateSMSRecipientCount() {
    const recipientType = document.querySelector('input[name="sms-recipients"]:checked').value;
    const countElement = document.getElementById('sms-recipient-count');
    const sendBtn = document.getElementById('btn-send-sms');
    let count = 0;

    try {
        if (recipientType === 'all') {
            const members = await Airtable.getActiveMembers();
            count = members.filter(m => m.fields.Phone && m.fields.SMSOptIn !== false).length;
            countElement.textContent = `${count} recipients selected (all members with SMS opt-in)`;
        } else if (recipientType === 'event') {
            const eventId = document.getElementById('sms-event').value;
            if (eventId) {
                const rsvps = await Airtable.getRSVPsByEventId(eventId);
                const attendeeIds = rsvps
                    .filter(r => r.fields.Response === 'Yes')
                    .map(r => r.fields.Member[0]);

                const members = await Airtable.getActiveMembers();
                count = members.filter(m =>
                    attendeeIds.includes(m.id) &&
                    m.fields.Phone &&
                    m.fields.SMSOptIn !== false
                ).length;
                countElement.textContent = `${count} recipients selected (event attendees with SMS opt-in)`;
            } else {
                countElement.textContent = 'Please select an event';
            }
        } else if (recipientType === 'custom') {
            count = document.querySelectorAll('.sms-member-checkbox:checked').length;
            countElement.textContent = `${count} recipients selected`;
        }

        sendBtn.disabled = count === 0;
    } catch (error) {
        console.error('Error updating recipient count:', error);
        countElement.textContent = 'Error calculating recipients';
        sendBtn.disabled = true;
    }
}

function updateSMSPreview() {
    const message = document.getElementById('sms-message').value;
    const preview = document.getElementById('sms-preview');

    if (message.trim()) {
        preview.innerHTML = `<p>${Utils.escapeHtml(message)}</p>`;
    } else {
        preview.innerHTML = '<p class="text-muted">Message preview will appear here...</p>';
    }
}

async function handleSMSSend(e) {
    e.preventDefault();

    const message = document.getElementById('sms-message').value.trim();
    if (!message) {
        Utils.showToast('Message cannot be empty', 'error');
        return;
    }

    const recipientType = document.querySelector('input[name="sms-recipients"]:checked').value;
    let memberIds = [];

    try {
        // Gather member IDs based on selection
        if (recipientType === 'all') {
            const members = await Airtable.getActiveMembers();
            memberIds = members
                .filter(m => m.fields.Phone && m.fields.SMSOptIn !== false)
                .map(m => m.id);
        } else if (recipientType === 'event') {
            const eventId = document.getElementById('sms-event').value;
            if (!eventId) {
                Utils.showToast('Please select an event', 'error');
                return;
            }

            const rsvps = await Airtable.getRSVPsByEventId(eventId);
            const attendeeIds = rsvps
                .filter(r => r.fields.Response === 'Yes')
                .map(r => r.fields.Member[0]);

            const members = await Airtable.getActiveMembers();
            memberIds = members
                .filter(m => attendeeIds.includes(m.id) && m.fields.Phone && m.fields.SMSOptIn !== false)
                .map(m => m.id);
        } else if (recipientType === 'custom') {
            memberIds = Array.from(document.querySelectorAll('.sms-member-checkbox:checked'))
                .map(cb => cb.value);
        }

        if (memberIds.length === 0) {
            Utils.showToast('No recipients selected', 'error');
            return;
        }

        // Confirm send
        if (!confirm(`Send SMS to ${memberIds.length} members? This will incur SMS charges.`)) {
            return;
        }

        const sendBtn = document.getElementById('btn-send-sms');
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';

        const result = await Airtable.sendSMS(memberIds, message);

        if (result.sent > 0) {
            Utils.showToast(`SMS sent to ${result.sent} members!`, 'success');
            document.getElementById('sms-form').reset();
            updateSMSPreview();
            document.getElementById('sms-char-count').textContent = '0/160 characters';
            loadSMSLogs();
        }

        if (result.failed > 0) {
            Utils.showToast(`${result.failed} messages failed to send`, 'error');
        }

    } catch (error) {
        console.error('SMS send error:', error);
        Utils.showToast('Failed to send SMS: ' + error.message, 'error');
    } finally {
        const sendBtn = document.getElementById('btn-send-sms');
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send SMS';
    }
}

async function loadSMSLogs() {
    const container = document.getElementById('sms-logs-list');

    try {
        // Note: You'll need to add a method to fetch SMS logs from Airtable
        // For now, show a placeholder
        container.innerHTML = '<p class="text-muted">SMS logs will appear here after sending messages</p>';

        // TODO: Implement SMS logs fetching when needed
        // const logs = await Airtable.getSMSLogs();
        // Render logs in a table similar to other admin tables

    } catch (error) {
        console.error('Error loading SMS logs:', error);
        container.innerHTML = '<div class="error-message">Failed to load SMS logs</div>';
    }
}

// ========== Maintenance Tab ==========

let pastRSVPsToDelete = [];

function setupDeletePastRSVPsModal() {
    const modal = document.getElementById('delete-past-rsvps-modal');
    document.getElementById('delete-past-rsvps-modal-close').addEventListener('click', () => modal.classList.remove('active'));
    document.getElementById('delete-past-rsvps-modal-dismiss').addEventListener('click', () => modal.classList.remove('active'));
    document.getElementById('delete-past-rsvps-modal-confirm').addEventListener('click', runDeletePastRSVPs);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });

    document.getElementById('btn-delete-past-rsvps').addEventListener('click', () => {
        if (pastRSVPsToDelete.length === 0) return;
        const eventWord = pastRSVPsToDelete.eventCount === 1 ? 'event' : 'events';
        document.getElementById('delete-past-rsvps-modal-text').textContent =
            `This will permanently delete ${pastRSVPsToDelete.length} RSVP${pastRSVPsToDelete.length === 1 ? '' : 's'} from ${pastRSVPsToDelete.eventCount} past ${eventWord}.`;
        modal.classList.add('active');
    });
}

async function loadMaintenanceTab() {
    const statusEl = document.getElementById('maintenance-rsvp-status');
    const btn = document.getElementById('btn-delete-past-rsvps');

    statusEl.textContent = 'Loading...';
    btn.disabled = true;
    pastRSVPsToDelete = [];

    try {
        const today = new Date().toISOString().split('T')[0];
        const [pastEvents, allRSVPs] = await Promise.all([
            Airtable.getPastEvents(),
            Airtable.getAllRSVPs()
        ]);

        const pastEventIds = new Set(pastEvents.map(e => e.id));
        const rsvpsToDelete = allRSVPs.filter(rsvp => {
            const eventIds = rsvp.fields.Event || [];
            return eventIds.some(id => pastEventIds.has(id));
        });

        // Count distinct past events that have RSVPs
        const affectedEventIds = new Set(
            rsvpsToDelete.flatMap(rsvp => (rsvp.fields.Event || []).filter(id => pastEventIds.has(id)))
        );

        pastRSVPsToDelete = rsvpsToDelete;
        pastRSVPsToDelete.eventCount = affectedEventIds.size;

        if (rsvpsToDelete.length === 0) {
            statusEl.textContent = 'No RSVPs from past events found.';
            btn.disabled = true;
        } else {
            const eventWord = affectedEventIds.size === 1 ? 'event' : 'events';
            statusEl.textContent = `Found ${rsvpsToDelete.length} RSVP${rsvpsToDelete.length === 1 ? '' : 's'} from ${affectedEventIds.size} past ${eventWord}.`;
            btn.disabled = false;
        }
    } catch (error) {
        console.error('Error loading maintenance data:', error);
        statusEl.textContent = 'Failed to load data: ' + error.message;
        btn.disabled = true;
    }

    // Also refresh dedup status
    await loadDeduplicateStatus();
}

async function loadDeduplicateStatus() {
    const statusEl = document.getElementById('deduplicate-rsvp-status');
    const btn = document.getElementById('btn-deduplicate-rsvps');

    statusEl.textContent = 'Scanning...';
    btn.disabled = true;
    duplicateRSVPsToDelete = [];

    try {
        const allRSVPs = await Airtable.getAllRSVPs();

        // Group RSVPs by member+event pair
        const rsvpGroups = new Map();
        allRSVPs.forEach(rsvp => {
            const memberId = rsvp.fields.Member?.[0];
            const eventId = rsvp.fields.Event?.[0];
            if (!memberId || !eventId) return;
            const key = `${memberId}:${eventId}`;
            if (!rsvpGroups.has(key)) rsvpGroups.set(key, []);
            rsvpGroups.get(key).push(rsvp);
        });

        // For each group with duplicates, keep the most recent, mark rest for deletion
        rsvpGroups.forEach(group => {
            if (group.length <= 1) return;
            // Sort by createdTime descending — keep index 0, delete the rest
            group.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
            duplicateRSVPsToDelete.push(...group.slice(1));
        });

        if (duplicateRSVPsToDelete.length === 0) {
            statusEl.textContent = 'No duplicate RSVPs found.';
            btn.disabled = true;
        } else {
            const pairCount = [...rsvpGroups.values()].filter(g => g.length > 1).length;
            statusEl.textContent = `Found ${duplicateRSVPsToDelete.length} duplicate RSVP${duplicateRSVPsToDelete.length === 1 ? '' : 's'} across ${pairCount} member+event pair${pairCount === 1 ? '' : 's'}.`;
            btn.disabled = false;
        }
    } catch (error) {
        console.error('Error scanning for duplicates:', error);
        statusEl.textContent = 'Failed to scan: ' + error.message;
        btn.disabled = true;
    }
}

function setupDeduplicateRSVPsModal() {
    const modal = document.getElementById('deduplicate-rsvps-modal');
    const closeBtn = document.getElementById('deduplicate-rsvps-modal-close');
    const dismissBtn = document.getElementById('deduplicate-rsvps-modal-dismiss');
    const confirmBtn = document.getElementById('deduplicate-rsvps-modal-confirm');
    const triggerBtn = document.getElementById('btn-deduplicate-rsvps');

    if (!modal || !triggerBtn) return;

    closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    dismissBtn.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });

    confirmBtn.addEventListener('click', runDeduplicateRSVPs);

    triggerBtn.addEventListener('click', () => {
        document.getElementById('deduplicate-rsvps-modal-text').textContent =
            `This will permanently delete ${duplicateRSVPsToDelete.length} duplicate RSVP${duplicateRSVPsToDelete.length === 1 ? '' : 's'}, keeping the most recent record for each member+event pair.`;
        modal.classList.add('active');
    });
}

async function runDeduplicateRSVPs() {
    const modal = document.getElementById('deduplicate-rsvps-modal');
    const confirmBtn = document.getElementById('deduplicate-rsvps-modal-confirm');
    const total = duplicateRSVPsToDelete.length;

    modal.classList.remove('active');
    confirmBtn.disabled = true;

    const btn = document.getElementById('btn-deduplicate-rsvps');
    btn.disabled = true;

    try {
        for (let i = 0; i < total; i++) {
            btn.textContent = `Deleting... (${i + 1}/${total})`;
            await Airtable.deleteRSVP(duplicateRSVPsToDelete[i].id);
        }
        Utils.showToast(`Removed ${total} duplicate RSVP${total === 1 ? '' : 's'}.`);
        loadDeduplicateStatus();
    } catch (error) {
        console.error('Error removing duplicates:', error);
        Utils.showToast('Error during deduplication: ' + error.message, 'error');
        loadDeduplicateStatus();
    } finally {
        btn.textContent = 'Remove Duplicate RSVPs';
        confirmBtn.disabled = false;
    }
}

async function runDeletePastRSVPs() {
    const modal = document.getElementById('delete-past-rsvps-modal');
    const confirmBtn = document.getElementById('delete-past-rsvps-modal-confirm');
    const total = pastRSVPsToDelete.length;

    modal.classList.remove('active');
    confirmBtn.disabled = true;

    const btn = document.getElementById('btn-delete-past-rsvps');
    btn.disabled = true;

    try {
        for (let i = 0; i < total; i++) {
            btn.textContent = `Deleting... (${i + 1}/${total})`;
            await Airtable.deleteRSVP(pastRSVPsToDelete[i].id);
        }
        Utils.showToast(`Deleted ${total} RSVP${total === 1 ? '' : 's'} from past events.`);
        loadMaintenanceTab();
    } catch (error) {
        console.error('Error deleting RSVPs:', error);
        Utils.showToast('Error during deletion: ' + error.message, 'error');
        loadMaintenanceTab();
    } finally {
        btn.textContent = 'Delete Past Event RSVPs';
        confirmBtn.disabled = false;
    }
}
