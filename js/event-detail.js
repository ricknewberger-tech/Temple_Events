// Event Detail Page Logic

let currentEvent = null;
let currentMembers = [];
let currentRSVPs = [];
let currentUpdates = [];
let currentComments = [];
let signedInMemberId = null;
let isAdmin = false;

// Storage helpers - check sessionStorage first (current session), then localStorage (persistent)
// This ensures admin session takes precedence over saved member sessions
function getStoredItem(key) {
    return sessionStorage.getItem(key) || localStorage.getItem(key);
}

function clearStoredItems() {
    ['memberId', 'authToken', 'memberName'].forEach(key => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const eventId = Utils.getUrlParam('id');
    if (!eventId) {
        showError('No event ID provided');
        return;
    }
    // Clear old shared-code tokens (pre-unique-code migration)
    const storedToken = getStoredItem('authToken');
    if (storedToken && /^member:\d+$/.test(storedToken)) {
        clearStoredItems();
    }
    // Check if user is already signed in (check both storages)
    signedInMemberId = getStoredItem('memberId');
    const authToken = getStoredItem('authToken');
    isAdmin = authToken && authToken.startsWith('admin:');
    console.log('Event Detail - authToken:', authToken, 'isAdmin:', isAdmin);

    // Track session for returning users with stored credentials
    if (signedInMemberId) {
        Airtable.trackSession(signedInMemberId);
    }

    loadEventDetails(eventId);
    setupEditEventModal();
    setupCancelEventModal();

    // Scroll to attendees section if hash is present
    if (window.location.hash === '#attendees') {
        setTimeout(() => {
            const attendeesSection = document.querySelector('.event-detail-sidebar');
            if (attendeesSection) {
                attendeesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 500);
    }
});

async function loadEventDetails(eventId) {
    const container = document.getElementById('event-content');

    try {
        // Load event first to get the name
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
        currentUpdates = updates;
        currentComments = comments;

        // Initialize EventDiscussion module
        EventDiscussion.init(event, members, rsvps, signedInMemberId, isAdmin);
        EventDiscussion.currentUpdates = updates;
        EventDiscussion.currentComments = comments;

        // Update page title
        document.title = `${event.fields.EventName || 'Event'} - Chavurah`;

        // Render the page
        container.innerHTML = await renderEventDetail(event, rsvps, updates, comments);

        // Attach event listeners
        attachEventListeners();
        EventDiscussion.attachListeners();

    } catch (error) {
        console.error('Error loading event:', error);
        container.innerHTML = `
            <div class="error-message">
                <p>Failed to load event details.</p>
                <p class="text-muted">${error.message}</p>
                <a href="index.html" class="btn btn-primary mt-2">Back to Events</a>
            </div>
        `;
    }
}

async function renderEventDetail(event, rsvps, updates, comments) {
    const { EventName, EventDate, EventTime, LocationType, CustomLocation, Address, MemberHost, Description, MaxAttendees, Status } = event.fields;

    const date = new Date(EventDate + 'T00:00:00');
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();

    const location = CustomLocation || Address || LocationType || '';
    const hostName = MemberHost ? getHostName(MemberHost) : '';

    const isInterested = Status === 'Interested';
    // Deduplicate by member ID — keep the first (most recently created) RSVP per member
    const seenMembers = new Set();
    const yesRSVPs = rsvps.filter(r => {
        if (r.fields.Response !== 'Yes') return false;
        const memberId = r.fields.Member?.[0];
        if (!memberId || seenMembers.has(memberId)) return false;
        seenMembers.add(memberId);
        return true;
    });
    const rsvpCount = yesRSVPs.length;
    const isFull = MaxAttendees && rsvpCount >= MaxAttendees;
    const isPast = Utils.isPastDate(EventDate);

    // For Interested events, render the interest section
    let rsvpOrInterestHtml = '';
    if (!isPast) {
        if (isInterested) {
            rsvpOrInterestHtml = await renderInterestSection(event.id);
        } else {
            rsvpOrInterestHtml = renderRSVPSection(isFull);
        }
    }

    return `
        <a href="index.html" class="btn btn-secondary btn-sm mb-3">&larr; Back to Events</a>

        <div class="event-detail">
            <div class="event-detail-main">
                <div class="card">
                    <div class="event-header">
                        <div class="event-date-box">
                            <div class="month">${month}</div>
                            <div class="day">${day}</div>
                        </div>
                        <div class="event-header-info">
                            <h1>${EventName || 'Untitled Event'}</h1>
                            <div class="event-meta">
                                <span>${Utils.formatDate(EventDate)}</span>
                                ${EventTime ? `<span>${Utils.formatTime(EventTime)}</span>` : ''}
                            </div>
                            <div class="event-meta mt-1">
                                ${location ? `<span>${location}</span>` : ''}
                                ${hostName ? `<span>Hosted by ${hostName}</span>` : ''}
                            </div>
                        </div>
                    </div>

                    ${Description ? `
                        <div class="event-description mt-3">
                            <p>${Description.replace(/\n/g, '</p><p>')}</p>
                        </div>
                    ` : ''}

                    <div class="flex gap-2 mt-3">
                        <div class="calendar-dropdown">
                            <button id="btn-add-calendar" class="btn btn-secondary">Add to Calendar</button>
                            <div class="calendar-dropdown-menu" id="calendar-menu">
                                <a id="cal-google" href="#" target="_blank">Google Calendar</a>
                                <a id="cal-apple" href="#">Apple Calendar</a>
                                <a id="cal-outlook" href="#" target="_blank">Microsoft Outlook</a>
                            </div>
                        </div>
                        <button id="btn-email-attendees" class="btn btn-primary">Email Attendees</button>
                        ${isHost() ? '<button id="btn-edit-event" class="btn btn-secondary">Edit Event</button><button id="btn-cancel-event" class="btn btn-danger">Cancel Event</button>' : ''}
                    </div>
                </div>

                ${rsvpOrInterestHtml}
            </div>

            <div class="event-detail-sidebar">
                <!-- AI Summary Card (or Discussion Link if no AI summary) -->
                ${renderAISummaryCard(updates, event.id) || `
                <div class="card">
                    <h3 class="card-title mb-2">Discussion</h3>
                    <p class="text-muted mb-2">View and participate in event discussions${isAdmin ? ', post updates, and generate AI summaries' : ''}.</p>
                    <a href="discussion.html?id=${event.id}" class="btn btn-primary btn-sm" style="width: 100%;">Go to Discussion</a>
                </div>
                `}

                <div class="card" id="attendees">
                    ${window.location.hash === '#attendees' ? '<a href="index.html" class="btn btn-secondary btn-sm mb-2">&larr; Back to Events</a>' : ''}
                    <h2 class="card-title mb-2">Attending${isFull ? ' - Full' : ''}</h2>

                    ${yesRSVPs.length > 0 ? `
                        <ul class="attendee-list" id="attendee-list">
                            ${yesRSVPs.map(rsvp => renderAttendeeItem(rsvp)).join('')}
                        </ul>
                    ` : `
                        <p class="text-muted">No RSVPs yet. Be the first!</p>
                    `}
                </div>

                ${rsvps.filter(r => r.fields.Response === 'No').length > 0 ? `
                    <div class="card">
                        <h3 class="card-title mb-2">Can't Make It</h3>
                        <ul class="attendee-list">
                            ${rsvps.filter(r => r.fields.Response === 'No').map(rsvp => `
                                <li class="attendee-item">
                                    <span class="attendee-name">${getMemberName(rsvp.fields.Member)}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function renderRSVPSection(isFull) {
    // If not signed in, show sign-in form
    if (!signedInMemberId) {
        return `
            <div class="card">
                <h2 class="card-title mb-2">RSVP</h2>
                <p class="text-muted mb-2">Sign in to RSVP for this event.</p>
                <div class="form-group">
                    <label for="member-select">Who are you?</label>
                    <select id="member-select">
                        <option value="">Select your name...</option>
                        ${currentMembers.map(m => `<option value="${m.id}">${m.fields.FirstName} ${m.fields.LastName || ''}</option>`).join('')}
                    </select>
                </div>
                <button id="btn-sign-in" class="btn btn-primary" disabled>Sign In</button>
            </div>
        `;
    }

    // Signed in - show RSVP form for this member
    const member = currentMembers.find(m => m.id === signedInMemberId);
    if (!member) {
        // Member not found in active list, clear session
        clearStoredItems();
        signedInMemberId = null;
        return renderRSVPSection(isFull);
    }

    const memberName = `${member.fields.FirstName || ''} ${member.fields.LastName || ''}`.trim();

    // Check for existing RSVP
    const existingRSVP = currentRSVPs.find(rsvp =>
        Array.isArray(rsvp.fields.Member) && rsvp.fields.Member.includes(signedInMemberId)
    );

    const currentResponse = existingRSVP?.fields.Response || '';
    const currentBringing = existingRSVP?.fields.Bringing || '';
    const currentNotes = existingRSVP?.fields.PersonalNotes || '';
    const isUpdate = !!existingRSVP;

    return `
        <div class="card">
            <div class="flex-between mb-2">
                <h2 class="card-title">Your RSVP</h2>
                <button id="btn-sign-out" class="btn btn-secondary btn-sm">Not ${member.fields.FirstName}? Switch</button>
            </div>
            <p class="mb-2"><strong>${memberName}</strong></p>
            ${isFull && !isUpdate ? '<p class="text-muted">This event is full, but you can still add yourself to the waitlist.</p>' : ''}
            <form id="rsvp-form">
                <button type="submit" class="btn btn-primary mb-3" id="rsvp-submit" style="width: 100%;">
                    ${isUpdate ? 'Update RSVP' : 'Submit RSVP'}
                </button>

                <div class="form-group">
                    <label>Will you attend?</label>
                    <div class="radio-group">
                        <label>
                            <input type="radio" name="response" value="Yes" required ${currentResponse === 'Yes' ? 'checked' : ''}>
                            Yes, I'll be there!
                        </label>
                        <label>
                            <input type="radio" name="response" value="No" ${currentResponse === 'No' ? 'checked' : ''}>
                            No, I can't make it
                        </label>
                    </div>
                </div>

                <div class="form-group" id="bringing-group" style="display: ${currentEvent?.fields?.LocationType === "Member's Home" && currentResponse === 'Yes' ? 'block' : 'none'};">
                    <label for="bringing">What are you bringing? (optional)</label>
                    <input type="text" id="bringing" placeholder="e.g., Dessert, Wine, Appetizer" value="${currentBringing}">
                </div>

                <div class="form-group">
                    <label for="notes">Notes (optional)</label>
                    <textarea id="notes" placeholder="Any dietary restrictions, questions, etc.">${currentNotes}</textarea>
                </div>
            </form>
        </div>
    `;
}

async function renderInterestSection(eventId) {
    // Load interest records
    let interests = [];
    let interestCount = 0;
    let isUserInterested = false;

    try {
        interests = await Airtable.getEventInterestByEventId(eventId);
        interestCount = interests.length;
        if (signedInMemberId) {
            const userInterest = await Airtable.getMemberEventInterest(eventId, signedInMemberId);
            isUserInterested = userInterest !== null;
        }
    } catch (error) {
        console.error('Error loading interest data:', error);
    }

    // Get member names for interested members
    const interestedMemberNames = interests.map(interest => {
        return getMemberName(interest.fields.Member);
    }).filter(Boolean);

    // Check if current user is host or admin
    const canConfirm = isHost() || isAdmin;

    // If not signed in
    if (!signedInMemberId) {
        return `
            <div class="card">
                <h2 class="card-title mb-2">Interested?</h2>
                <p class="text-muted mb-2">This event is in "Interested" status. The host is gauging interest before confirming. Sign in to indicate your interest!</p>
                <div class="form-group">
                    <label for="member-select">Who are you?</label>
                    <select id="member-select">
                        <option value="">Select your name...</option>
                        ${currentMembers.map(m => `<option value="${m.id}">${m.fields.FirstName} ${m.fields.LastName || ''}</option>`).join('')}
                    </select>
                </div>
                <button id="btn-sign-in" class="btn btn-primary" disabled>Sign In</button>
                ${interestCount > 0 ? `<p class="mt-3 text-muted">${interestCount} ${interestCount === 1 ? 'person is' : 'people are'} interested</p>` : ''}
            </div>
        `;
    }

    // Signed in - show interest checkbox
    const member = currentMembers.find(m => m.id === signedInMemberId);
    if (!member) {
        clearStoredItems();
        signedInMemberId = null;
        return renderInterestSection(eventId);
    }

    return `
        <div class="card">
            <div class="flex-between mb-2">
                <h2 class="card-title">Interested?</h2>
                <button id="btn-sign-out" class="btn btn-secondary btn-sm">Not ${member.fields.FirstName}? Switch</button>
            </div>
            <p class="text-muted mb-3">This event is in "Interested" status. The host is gauging interest before confirming. Indicate your interest below or join the discussion!</p>

            <label class="interest-checkbox-large">
                <input type="checkbox" id="interest-checkbox" ${isUserInterested ? 'checked' : ''}>
                <span>I'm interested in this event</span>
            </label>

            ${interestCount > 0 ? `
                <div class="interested-members mt-3">
                    <p class="mb-1"><strong>${interestCount} ${interestCount === 1 ? 'person is' : 'people are'} interested:</strong></p>
                    <ul class="interested-list">
                        ${interestedMemberNames.map(name => `<li>${name}</li>`).join('')}
                    </ul>
                </div>
            ` : '<p class="mt-3 text-muted">Be the first to show interest!</p>'}

            ${canConfirm ? `
                <button id="btn-confirm-event" class="btn btn-success mt-3" style="width: 100%;">
                    Confirm This Event
                </button>
            ` : ''}
        </div>
    `;
}

function renderAttendeeItem(rsvp) {
    const memberName = getMemberName(rsvp.fields.Member);
    const bringing = rsvp.fields.Bringing;
    const notes = rsvp.fields.PersonalNotes;

    // Escape HTML to prevent XSS
    let escapedNotes = '';
    if (notes) {
        const div = document.createElement('div');
        div.textContent = notes;
        escapedNotes = div.innerHTML;
    }

    return `
        <li class="attendee-item">
            <div class="attendee-name">${memberName}</div>
            ${bringing ? `<div class="attendee-bringing">${bringing}</div>` : ''}
            ${notes ? `<div class="attendee-notes">${escapedNotes}</div>` : ''}
        </li>
    `;
}

function renderAISummaryCard(updates, eventId) {
    // Find the most recent AI-generated summary
    const aiSummary = updates
        .filter(u => u.fields.SummaryType === 'AI-Generated')
        .sort((a, b) => new Date(b.fields.Timestamp) - new Date(a.fields.Timestamp))[0];

    if (!aiSummary) {
        return ''; // Don't show card if no AI summary exists
    }

    const { UpdateText, Timestamp } = aiSummary.fields;
    const timeAgo = Utils.formatRelativeTime(Timestamp);

    // Escape HTML to prevent XSS
    const div = document.createElement('div');
    div.textContent = UpdateText;
    const escapedText = div.innerHTML.replace(/\n/g, '<br>');

    return `
        <div class="card sidebar-ai-summary">
            <h3>
                Discussion Summary
                <span class="ai-badge">AI</span>
            </h3>
            <p class="mt-2" style="line-height: 1.6;">${escapedText}</p>
            <p class="text-muted" style="font-size: 0.85rem; margin-top: 12px;">Generated ${timeAgo}</p>
            <a href="discussion.html?id=${eventId}" class="btn btn-primary btn-sm mt-2" style="width: 100%;">See Full Discussion</a>
        </div>
    `;
}

function getMemberName(memberField) {
    if (Array.isArray(memberField) && memberField.length > 0) {
        const member = currentMembers.find(m => m.id === memberField[0]);
        if (member) {
            return `${member.fields.FirstName || ''} ${member.fields.LastName || ''}`.trim() || 'Unknown';
        }
    }
    if (typeof memberField === 'string') return memberField;
    return 'Unknown';
}

function getHostName(memberHostField) {
    if (Array.isArray(memberHostField)) {
        const member = currentMembers.find(m => m.id === memberHostField[0]);
        if (!member) return '';
        return `${member.fields.FirstName || ''} ${member.fields.LastName || ''}`.trim();
    }
    return memberHostField || '';
}

function getMemberEmail(memberField) {
    if (!memberField) return null;
    if (Array.isArray(memberField) && memberField.length > 0) {
        const member = currentMembers.find(m => m.id === memberField[0]);
        if (!member || !member.fields.Email) return null;
        const raw = member.fields.Email;
        const match = raw.match(/<(.+?)>/);
        return match ? match[1] : raw.trim();
    }
    return null;
}

function attachEventListeners() {
    // Calendar dropdown
    document.getElementById('btn-add-calendar')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = document.getElementById('calendar-menu');
        menu.classList.toggle('show');

        // Set URLs
        document.getElementById('cal-google').href = Utils.getGoogleCalendarUrl(currentEvent);
        document.getElementById('cal-outlook').href = Utils.getOutlookCalendarUrl(currentEvent);
    });

    document.getElementById('cal-apple')?.addEventListener('click', (e) => {
        e.preventDefault();
        Utils.downloadICS(currentEvent);
        document.getElementById('calendar-menu').classList.remove('show');
    });

    // Close dropdown when clicking elsewhere
    document.addEventListener('click', () => {
        document.getElementById('calendar-menu')?.classList.remove('show');
    });

    // Email attendees button
    document.getElementById('btn-email-attendees')?.addEventListener('click', async () => {
        const isProposed = currentEvent.fields.Status === 'Interested';
        const event = currentEvent.fields;

        let emails = [];
        let body = `--- ${event.EventName.toUpperCase()} ---\n\n`;

        body += `DATE: ${Utils.formatDate(event.EventDate)}`;
        if (event.EventTime) body += ` at ${Utils.formatTime(event.EventTime)}`;
        body += '\n';

        const location = event.CustomLocation || event.Address || event.LocationType || '';
        if (location) body += `LOCATION: ${location}\n`;
        if (event.Address && event.CustomLocation) body += `ADDRESS: ${event.Address}\n`;

        if (event.Description) {
            body += `\nDETAILS:\n${event.Description}\n`;
        }

        if (isProposed) {
            // For proposed events, use interested members
            let interests = [];
            try {
                interests = await Airtable.getEventInterestByEventId(currentEvent.id);
            } catch (error) {
                Utils.showToast('Failed to load interested members', 'error');
                return;
            }

            emails = interests
                .map(interest => getMemberEmail(interest.fields.Member))
                .filter(email => email);

            body += `\n--- INTERESTED (${interests.length}) ---\n\n`;
            interests.forEach(interest => {
                const name = getMemberName(interest.fields.Member);
                body += `- ${name}\n`;
            });
        } else {
            // For confirmed events, use RSVPs
            const yesRSVPs = currentRSVPs.filter(r => r.fields.Response === 'Yes');
            emails = yesRSVPs
                .map(rsvp => getMemberEmail(rsvp.fields.Member))
                .filter(email => email);

            body += `\n--- ATTENDEES (${yesRSVPs.length}) ---\n\n`;
            yesRSVPs.forEach(rsvp => {
                const name = getMemberName(rsvp.fields.Member);
                const bringing = rsvp.fields.Bringing;
                const notes = rsvp.fields.PersonalNotes;

                body += `- ${name}\n`;
                if (bringing) body += `  Bringing: ${bringing}\n`;
                if (notes) body += `  Notes: ${notes}\n`;
                body += '\n';
            });
        }

        // Add host email if there's a MemberHost
        if (currentEvent.fields.MemberHost) {
            const hostEmail = getMemberEmail(currentEvent.fields.MemberHost);
            if (hostEmail && !emails.includes(hostEmail)) {
                emails.push(hostEmail);
            }
        }

        if (emails.length === 0) {
            Utils.showToast('No attendee emails found', 'error');
            return;
        }

        const subject = `VMC - ${event.EventName} - ${Utils.formatDate(event.EventDate)}`;
        const mailtoUrl = `mailto:${emails.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoUrl;
    });

    // Edit event button (visible to host only)
    document.getElementById('btn-edit-event')?.addEventListener('click', () => {
        openEditEventModal();
    });

    // Cancel event button (visible to host only)
    document.getElementById('btn-cancel-event')?.addEventListener('click', () => {
        document.getElementById('cancel-event-modal').classList.add('active');
    });

    // Sign-in flow
    const memberSelect = document.getElementById('member-select');
    const signInBtn = document.getElementById('btn-sign-in');

    if (memberSelect && signInBtn) {
        memberSelect.addEventListener('change', () => {
            signInBtn.disabled = !memberSelect.value;
        });

        signInBtn.addEventListener('click', async () => {
            const memberId = memberSelect.value;
            if (memberId) {
                // Use localStorage for persistence (consistent with main login)
                localStorage.setItem('memberId', memberId);
                signedInMemberId = memberId;
                // Reload the entire event to refresh RSVP/Interest section
                loadEventDetails(currentEvent.id);
            }
        });
    }

    // Sign-out button
    document.getElementById('btn-sign-out')?.addEventListener('click', () => {
        clearStoredItems();
        signedInMemberId = null;
        // Reload the entire event to refresh RSVP/Interest section
        loadEventDetails(currentEvent.id);
    });

    // Interest checkbox listener
    const interestCheckbox = document.getElementById('interest-checkbox');
    if (interestCheckbox) {
        interestCheckbox.addEventListener('change', async (e) => {
            const isChecked = e.target.checked;

            if (!signedInMemberId) {
                e.target.checked = !isChecked;
                alert('Please sign in to indicate your interest');
                return;
            }

            try {
                if (isChecked) {
                    await Airtable.createEventInterest(currentEvent.id, signedInMemberId);
                    Utils.showToast('Interest indicated!');
                } else {
                    await Airtable.deleteEventInterest(currentEvent.id, signedInMemberId);
                    Utils.showToast('Interest removed');
                }
                // Reload the page to update the count and list
                loadEventDetails(currentEvent.id);
            } catch (error) {
                console.error('Error updating interest:', error);
                e.target.checked = !isChecked;
                alert('Failed to update interest: ' + error.message);
            }
        });
    }

    // Confirm event button listener
    const confirmBtn = document.getElementById('btn-confirm-event');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            const interests = await Airtable.getEventInterestByEventId(currentEvent.id);
            const interestCount = interests.length;
            const message = `Ready to confirm this event? This will change it to an Upcoming event and enable RSVPs.\n\n${interestCount} ${interestCount === 1 ? 'person has' : 'people have'} indicated interest and will be automatically added to the RSVP list.`;

            if (confirm(message)) {
                try {
                    confirmBtn.disabled = true;
                    confirmBtn.textContent = 'Confirming...';

                    // Convert interested members to RSVPs
                    if (interests.length > 0) {
                        await Promise.all(interests.map(interest => {
                            const memberId = interest.fields.Member?.[0];
                            if (memberId) {
                                return Airtable.createRSVP({
                                    Event: [currentEvent.id],
                                    Member: [memberId],
                                    Response: 'Yes'
                                });
                            }
                        }));
                    }

                    await Airtable.updateEvent(currentEvent.id, { Status: 'Upcoming' });
                    Utils.showToast('Event confirmed!');
                    // Reload the page to show RSVP section
                    window.location.reload();
                } catch (error) {
                    console.error('Error confirming event:', error);
                    Utils.showToast('Failed to confirm event: ' + error.message, 'error');
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Confirm This Event';
                }
            }
        });
    }

    // RSVP form listeners
    attachRSVPFormListeners();
}

function attachRSVPFormListeners() {
    const rsvpForm = document.getElementById('rsvp-form');
    if (rsvpForm) {
        // Show/hide bringing field based on response (only for Member's Home events)
        rsvpForm.querySelectorAll('input[name="response"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const isMembersHome = currentEvent?.fields?.LocationType === "Member's Home";
                const bringingGroup = document.getElementById('bringing-group');
                if (bringingGroup) bringingGroup.style.display = isMembersHome && e.target.value === 'Yes' ? 'block' : 'none';
            });
        });

        // Handle form submission
        rsvpForm.addEventListener('submit', handleRSVPSubmit);
    }

    // Re-attach sign-out listener after re-render
    document.getElementById('btn-sign-out')?.addEventListener('click', () => {
        clearStoredItems();
        signedInMemberId = null;
        const rsvpCard = document.querySelector('.event-detail-main');
        const existingRSVPCard = rsvpCard.querySelector('.card:last-child');
        const isFull = currentEvent.fields.MaxAttendees &&
            currentRSVPs.filter(r => r.fields.Response === 'Yes').length >= currentEvent.fields.MaxAttendees;
        existingRSVPCard.outerHTML = renderRSVPSection(isFull);
        attachEventListeners();
    });
}

async function handleRSVPSubmit(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('rsvp-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
        const memberId = signedInMemberId;
        const response = document.querySelector('input[name="response"]:checked')?.value;
        const isMembersHome = currentEvent?.fields?.LocationType === "Member's Home";
        const bringing = isMembersHome ? document.getElementById('bringing').value : '';
        const notes = document.getElementById('notes').value;

        if (!memberId || !response) {
            Utils.showToast('Please select a response', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit RSVP';
            return;
        }

        // Event = linked record (event ID), Member = linked record (array of IDs)
        const rsvpData = {
            Event: [currentEvent.id],
            Member: [memberId],
            Response: response,
            Bringing: bringing || '',
            PersonalNotes: notes || ''
        };

        // Check if member already has an RSVP for this event
        const existingRSVP = currentRSVPs.find(rsvp =>
            Array.isArray(rsvp.fields.Member) && rsvp.fields.Member.includes(memberId)
        );

        if (existingRSVP) {
            await Airtable.updateRSVP(existingRSVP.id, rsvpData);
            Utils.showToast('RSVP updated!');
        } else {
            await Airtable.createRSVP(rsvpData);
            Utils.showToast('RSVP submitted!');
        }

        // Reload the page to show updated RSVPs
        setTimeout(() => {
            window.location.reload();
        }, 1000);

    } catch (error) {
        console.error('Error submitting RSVP:', error);
        Utils.showToast('Failed to save RSVP: ' + error.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit RSVP';
    }
}

function isHost() {
    if (!signedInMemberId || !currentEvent) return false;
    const hostField = currentEvent.fields.MemberHost;
    if (Array.isArray(hostField)) {
        return hostField.includes(signedInMemberId);
    }
    return false;
}

// ========== Edit Event Modal ==========

function setupEditEventModal() {
    const modal = document.getElementById('edit-event-modal');
    if (!modal) return;

    document.getElementById('edit-event-modal-close').addEventListener('click', closeEditEventModal);
    document.getElementById('edit-event-modal-cancel').addEventListener('click', closeEditEventModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeEditEventModal();
    });

    // Location type change - auto-fill logged-in member's home details
    document.getElementById('edit-event-location-type').addEventListener('change', () => {
        if (document.getElementById('edit-event-location-type').value === "Member's Home" && signedInMemberId) {
            const member = currentMembers.find(m => m.id === signedInMemberId);
            if (member) {
                const name = `${member.fields.FirstName || ''} ${member.fields.LastName || ''}`.trim();
                document.getElementById('edit-event-custom-location').value = `${name}'s Home`;
                const addressParts = [
                    member.fields.Address,
                    member.fields.City,
                    member.fields.State,
                    member.fields.Zip
                ].filter(Boolean).join(', ');
                if (addressParts) {
                    document.getElementById('edit-event-address').value = addressParts;
                }
            }
        }
    });

    document.getElementById('edit-event-form').addEventListener('submit', handleEditEventSubmit);
}

function openEditEventModal() {
    const event = currentEvent;
    if (!event) return;

    document.getElementById('edit-event-name').value = event.fields.EventName || '';
    document.getElementById('edit-event-date').value = event.fields.EventDate || '';
    document.getElementById('edit-event-time').value = event.fields.EventTime || '';
    document.getElementById('edit-event-location-type').value = event.fields.LocationType || '';
    document.getElementById('edit-event-custom-location').value = event.fields.CustomLocation || '';
    document.getElementById('edit-event-address').value = event.fields.Address || '';
    document.getElementById('edit-event-max').value = event.fields.MaxAttendees || '';
    document.getElementById('edit-event-description').value = event.fields.Description || '';

    document.getElementById('edit-event-modal').classList.add('active');
    window.scrollTo(0, 0);
}

function closeEditEventModal() {
    document.getElementById('edit-event-modal').classList.remove('active');
}

async function handleEditEventSubmit(e) {
    e.preventDefault();

    const saveBtn = document.getElementById('edit-event-modal-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        const eventData = {
            EventName: document.getElementById('edit-event-name').value,
            EventDate: document.getElementById('edit-event-date').value,
            EventTime: document.getElementById('edit-event-time').value || null,
            LocationType: document.getElementById('edit-event-location-type').value || null,
            CustomLocation: document.getElementById('edit-event-custom-location').value || null,
            Address: document.getElementById('edit-event-address').value || null,
            MaxAttendees: document.getElementById('edit-event-max').value ? parseInt(document.getElementById('edit-event-max').value) : null,
            Description: document.getElementById('edit-event-description').value || null
        };

        await Airtable.updateEvent(currentEvent.id, eventData);
        Utils.showToast('Event updated!');
        closeEditEventModal();

        // Reload the page to show updated details
        setTimeout(() => {
            window.location.reload();
        }, 1000);

    } catch (error) {
        console.error('Error updating event:', error);
        Utils.showToast('Failed to update event: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
    }
}

function setupCancelEventModal() {
    const modal = document.getElementById('cancel-event-modal');
    if (!modal) return;

    document.getElementById('cancel-event-modal-close').addEventListener('click', () => {
        modal.classList.remove('active');
    });
    document.getElementById('cancel-event-modal-dismiss').addEventListener('click', () => {
        modal.classList.remove('active');
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });

    document.getElementById('cancel-event-modal-confirm').addEventListener('click', async () => {
        const confirmBtn = document.getElementById('cancel-event-modal-confirm');
        const reason = document.getElementById('cancel-event-reason').value.trim();
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Cancelling...';

        try {
            const updateData = { Status: 'Canceled' };
            if (reason) updateData.CancelReason = reason;
            await Airtable.updateEvent(currentEvent.id, updateData);
            Utils.showToast('Event cancelled!');
            modal.classList.remove('active');
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        } catch (error) {
            console.error('Error cancelling event:', error);
            Utils.showToast('Failed to cancel event: ' + error.message, 'error');
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Cancel Event';
        }
    });
}

function showError(message) {
    document.getElementById('event-content').innerHTML = `
        <div class="error-message">
            <p>${message}</p>
            <a href="index.html" class="btn btn-primary mt-2">Back to Events</a>
        </div>
    `;
}
