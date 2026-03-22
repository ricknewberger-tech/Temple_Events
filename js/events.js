// Events Page Logic

let homeMembers = [];
let homeSignedInMemberId = null;

// Storage helpers - check localStorage first (persistent), then sessionStorage
function getStoredItem(key) {
    return localStorage.getItem(key) || sessionStorage.getItem(key);
}

function setStoredItem(key, value, persistent) {
    if (persistent) {
        localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
    } else {
        sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
    }
}

function clearStoredItems() {
    ['memberId', 'authToken', 'memberName'].forEach(key => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    homeSignedInMemberId = getStoredItem('memberId');
    loadHomeMembers();
    setupMemberEventModal();
});

async function loadUpcomingEvents() {
    const container = document.getElementById('events-list');

    try {
        const events = await Airtable.getUpcomingEvents();

        if (events.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No upcoming events</h3>
                    <p>Check back soon for new events!</p>
                </div>
            `;
            return;
        }

        // Batch load all data in one go instead of per-event
        const [allRsvps, allInterests, allComments] = await Promise.all([
            Airtable.getAllRSVPs(),
            Airtable.getAllEventInterests(),
            Airtable.getAllEventComments()
        ]);

        // Build lookup maps for O(1) access
        const rsvpsByEvent = new Map();
        const interestsByEvent = new Map();
        const commentsByEvent = new Map();
        const userInterestByEvent = new Map();
        const userRSVPByEvent = new Map();

        // Process RSVPs
        allRsvps.forEach(rsvp => {
            const eventIds = rsvp.fields.Event || [];
            const memberIds = rsvp.fields.Member || [];
            eventIds.forEach(eventId => {
                if (!rsvpsByEvent.has(eventId)) rsvpsByEvent.set(eventId, []);
                rsvpsByEvent.get(eventId).push(rsvp);

                // Track user's own RSVP
                if (homeSignedInMemberId && memberIds.includes(homeSignedInMemberId)) {
                    userRSVPByEvent.set(eventId, rsvp.fields.Response);
                }
            });
        });

        // Process interests
        allInterests.forEach(interest => {
            const eventIds = interest.fields.Event || [];
            const memberIds = interest.fields.Member || [];
            eventIds.forEach(eventId => {
                if (!interestsByEvent.has(eventId)) interestsByEvent.set(eventId, []);
                interestsByEvent.get(eventId).push(interest);

                // Track user's own interest
                if (homeSignedInMemberId && memberIds.includes(homeSignedInMemberId)) {
                    userInterestByEvent.set(eventId, interest);
                }
            });
        });

        // Process comments
        allComments.forEach(comment => {
            const eventIds = comment.fields.Event || [];
            eventIds.forEach(eventId => {
                if (!commentsByEvent.has(eventId)) commentsByEvent.set(eventId, []);
                commentsByEvent.get(eventId).push(comment);
            });
        });

        // Add counts to events using lookup maps
        const eventsWithCounts = events.map(event => {
            const isInterested = event.fields.Status === 'Interested';
            const eventRsvps = rsvpsByEvent.get(event.id) || [];
            const rsvpCount = isInterested ? 0 : eventRsvps.filter(r => r.fields.Response === 'Yes').length;
            const interestCount = isInterested ? (interestsByEvent.get(event.id) || []).length : 0;
            const commentCount = (commentsByEvent.get(event.id) || []).length;
            const userInterest = isInterested && homeSignedInMemberId ? userInterestByEvent.get(event.id) || null : null;
            const userRSVP = homeSignedInMemberId ? userRSVPByEvent.get(event.id) || null : null;

            return { ...event, rsvpCount, interestCount, commentCount, userInterest, userRSVP };
        });

        container.innerHTML = eventsWithCounts.map(event => renderEventCard(event)).join('');

        // Attach interest checkbox listeners
        document.querySelectorAll('.interest-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', async (e) => {
                e.stopPropagation();
                const eventId = checkbox.dataset.eventId;
                const isChecked = checkbox.checked;

                if (!homeSignedInMemberId) {
                    checkbox.checked = !isChecked;
                    alert('Please sign in to indicate your interest');
                    return;
                }

                try {
                    if (isChecked) {
                        await Airtable.createEventInterest(eventId, homeSignedInMemberId);
                    } else {
                        await Airtable.deleteEventInterest(eventId, homeSignedInMemberId);
                    }
                    // Reload to update counts
                    loadUpcomingEvents();
                } catch (error) {
                    console.error('Error updating interest:', error);
                    checkbox.checked = !isChecked;
                    alert('Failed to update interest: ' + error.message);
                }
            });
        });

        // Attach "Interested (X)" button listeners
        document.querySelectorAll('.btn-show-interested').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const eventId = btn.dataset.eventId;
                const event = eventsWithCounts.find(ev => ev.id === eventId);
                if (!event) return;

                try {
                    // Load interest records
                    const interests = await Airtable.getEventInterestByEventId(eventId);
                    const memberNames = interests.map(interest => {
                        const memberId = interest.fields.Member[0];
                        const member = homeMembers.find(m => m.id === memberId);
                        return member ? `${member.fields.FirstName || ''} ${member.fields.LastName || ''}`.trim() : 'Unknown';
                    }).filter(Boolean);

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

        // Attach calendar dropdown listeners
        document.querySelectorAll('.btn-add-calendar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const eventId = btn.dataset.eventId;
                const event = eventsWithCounts.find(ev => ev.id === eventId);
                if (!event) return;

                const menu = document.getElementById(`cal-menu-${eventId}`);
                // Close other open menus
                document.querySelectorAll('.calendar-dropdown-menu.show').forEach(m => m.classList.remove('show'));
                menu.classList.toggle('show');

                // Set URLs
                menu.querySelector('.cal-google').href = Utils.getGoogleCalendarUrl(event);
                menu.querySelector('.cal-outlook').href = Utils.getOutlookCalendarUrl(event);
            });
        });

        document.querySelectorAll('.cal-apple').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const eventId = link.dataset.eventId;
                const event = eventsWithCounts.find(ev => ev.id === eventId);
                if (event) {
                    Utils.downloadICS(event);
                }
                document.querySelectorAll('.calendar-dropdown-menu.show').forEach(m => m.classList.remove('show'));
            });
        });

        // Close dropdowns when clicking elsewhere
        document.addEventListener('click', () => {
            document.querySelectorAll('.calendar-dropdown-menu.show').forEach(m => m.classList.remove('show'));
        });

    } catch (error) {
        console.error('Error loading events:', error);
        container.innerHTML = `
            <div class="error-message">
                <p>Failed to load events. Please check your Airtable configuration.</p>
                <p class="text-muted">${error.message}</p>
            </div>
        `;
    }
}

function renderEventCard(event) {
    const { EventName, EventDate, EventTime, LocationType, CustomLocation, Address, MaxAttendees, Description, Status, CancelReason, MemberHost } = event.fields;
    const isCancelled = Status === 'Canceled';
    const isInterested = Status === 'Interested';
    const date = new Date(EventDate + 'T00:00:00');
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });

    // Build location display
    const locationName = CustomLocation || LocationType || '';
    const location = locationName || Address || 'Location TBD';
    const locationHtml = (!locationName && Address) ?
        `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(Address)}" target="_blank" rel="noopener">${location}</a>` :
        location;

    const rsvpCount = event.rsvpCount || 0;
    const interestCount = event.interestCount || 0;
    const commentCount = event.commentCount || 0;
    const isFull = MaxAttendees && rsvpCount >= MaxAttendees;
    const rsvpText = Utils.formatRSVPCount(rsvpCount, MaxAttendees);
    const isUserInterested = event.userInterest !== null;
    const userRSVP = event.userRSVP;

    // Format user RSVP status: RSVP(y), RSVP(n), or RSVP(-)
    let rsvpStatusText = 'RSVP';
    if (userRSVP === 'Yes') {
        rsvpStatusText = 'RSVP(y)';
    } else if (userRSVP === 'No') {
        rsvpStatusText = 'RSVP(n)';
    } else {
        rsvpStatusText = 'RSVP(-)';
    }

    // Host name lookup
    let hostName = '';
    if (MemberHost && Array.isArray(MemberHost) && MemberHost.length > 0) {
        const hostMember = homeMembers.find(m => m.id === MemberHost[0]);
        if (hostMember) {
            hostName = `${hostMember.fields.FirstName || ''} ${hostMember.fields.LastName || ''}`.trim();
        }
    }

    // Date/time label - different for Interested events
    const dateTimeLabel = isInterested ? 'Proposed:' : '';

    return `
        <div class="card event-card ${isInterested ? 'event-card-interested' : ''}">
            <div class="event-date-box ${isInterested ? 'event-date-box-interested' : ''}">
                <div class="month">${month}</div>
                <div class="day">${day}</div>
                <div class="dow">${dayOfWeek}</div>
            </div>
            <div class="event-info">
                <h3>
                    ${isCancelled ? (EventName || 'Untitled Event') + ' <span class="badge badge-cancelled">Canceled</span>' :
                      isInterested ? `<a href="event.html?id=${event.id}">${EventName || 'Untitled Event'}</a> <span class="badge badge-interested">INTERESTED</span>` :
                      `<a href="event.html?id=${event.id}">${EventName || 'Untitled Event'}</a>`}
                </h3>
                <div class="event-meta">
                    ${dateTimeLabel ? `<span class="text-muted">${dateTimeLabel}</span>` : ''}
                    <span>${Utils.formatTime(EventTime) || 'Time TBD'}</span>
                    <span>${locationHtml}</span>
                    ${hostName ? `<span class="text-muted">by ${hostName}</span>` : ''}
                </div>
                ${Address && Address !== location ? `<div class="event-meta"><span><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(Address)}" target="_blank" rel="noopener">${Address}</a></span></div>` : ''}
                ${isCancelled && CancelReason ? `<p class="mt-2 text-muted"><strong>Reason:</strong> ${CancelReason}</p>` : ''}
                ${!isCancelled && Description ? `<p class="mt-2 text-muted">${truncateText(Description, 150)}</p>` : ''}
            </div>
            ${!isCancelled ? `
            <div class="event-actions">
                ${isInterested ? `
                    <button class="btn btn-secondary btn-sm btn-show-interested" data-event-id="${event.id}">
                        Interested${interestCount > 0 ? ` (${interestCount})` : ' (0)'}
                    </button>
                    <a href="discussion.html?id=${event.id}" class="btn btn-secondary btn-sm">Discussion${commentCount > 0 ? ` (${commentCount})` : ''}</a>
                    <label class="interest-checkbox-label">
                        <input type="checkbox" class="interest-checkbox" data-event-id="${event.id}" ${isUserInterested ? 'checked' : ''}>
                        <span>I'm Interested</span>
                    </label>
                ` : `
                    <a href="event.html?id=${event.id}#attendees" class="btn btn-secondary btn-sm">Attending (${rsvpCount})${isFull ? ' - Full' : ''}</a>
                    <a href="event.html?id=${event.id}" class="btn btn-primary btn-sm">${rsvpStatusText}</a>
                    <a href="discussion.html?id=${event.id}" class="btn btn-secondary btn-sm">Discussion${commentCount > 0 ? ` (${commentCount})` : ''}</a>
                    <div class="calendar-dropdown">
                        <button class="btn btn-secondary btn-sm btn-add-calendar" data-event-id="${event.id}">Add to Calendar</button>
                        <div class="calendar-dropdown-menu" id="cal-menu-${event.id}">
                            <a class="cal-google" data-event-id="${event.id}" href="#" target="_blank">Google Calendar</a>
                            <a class="cal-apple" data-event-id="${event.id}" href="#">Apple Calendar</a>
                            <a class="cal-outlook" data-event-id="${event.id}" href="#" target="_blank">Microsoft Outlook</a>
                        </div>
                    </div>
                `}
            </div>
            ` : ''}
        </div>
    `;
}

function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
}

// ========== Member Sign-In & Event Creation ==========

async function loadHomeMembers() {
    try {
        // Clear old shared-code tokens (pre-unique-code migration)
        const storedToken = getStoredItem('authToken');
        if (storedToken && /^member:\d+$/.test(storedToken)) {
            clearStoredItems();
            homeSignedInMemberId = null;
        }

        const hasAuth = getStoredItem('authToken');
        if (hasAuth) {
            homeMembers = await Airtable.getActiveMembers();
        } else {
            const data = await Airtable.request('/api/members?namesOnly=true');
            homeMembers = data.records || [];
        }

        // If already signed in, show events
        if (homeSignedInMemberId) {
            const member = homeMembers.find(m => m.id === homeSignedInMemberId);
            if (member) {
                // Track session for returning users with stored credentials
                Airtable.trackSession(homeSignedInMemberId);
                showEventsSection(member);
                return;
            }
            // Member not found, clear session
            clearStoredItems();
            homeSignedInMemberId = null;
            document.getElementById('member-login-section').style.display = 'block';
            setupLoginForm();
            return;
        }

        // Show login form
        document.getElementById('member-login-section').style.display = 'block';
        setupLoginForm();
    } catch (error) {
        console.error('Error loading members:', error);
    }
}

let loginFormInitialized = false;

function setupLoginForm() {
    const form = document.getElementById('login-form');

    if (loginFormInitialized) {
        const codeInput = document.getElementById('login-code');
        const loginBtn = document.getElementById('btn-member-login');
        loginBtn.disabled = codeInput.value.trim().length < 4;
        loginBtn.textContent = 'Sign In';
        return;
    }
    loginFormInitialized = true;

    const codeInput = document.getElementById('login-code');
    const loginBtn = document.getElementById('btn-member-login');
    const rememberCheckbox = document.getElementById('login-remember');

    codeInput.addEventListener('input', () => {
        loginBtn.disabled = codeInput.value.trim().length < 4;
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const code = codeInput.value.trim().toLowerCase();
        const remember = rememberCheckbox.checked;

        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing in...';

        try {
            // Admin code - log in directly as Rick Newberger
            if (code === '2850') {
                const result = await Airtable.loginAdminWithName('Rick', 'Newberger', '2850');
                if (result.success) {
                    sessionStorage.setItem('adminLoggedIn', 'true');
                    sessionStorage.setItem('authToken', `admin:${code}`);
                    if (result.memberId) {
                        sessionStorage.setItem('memberId', result.memberId);
                        sessionStorage.setItem('memberName', result.name);
                    }
                    window.location.href = 'admin.html';
                    return;
                }
            }

            const result = await Airtable.loginWithCode(code);
            if (result.success) {
                setStoredItem('memberId', result.memberId, remember);
                setStoredItem('authToken', `member:${code}`, remember);
                setStoredItem('memberName', result.name, remember);
                homeSignedInMemberId = result.memberId;

                // Reload members with auth now available
                homeMembers = await Airtable.getActiveMembers();
                const member = homeMembers.find(m => m.id === result.memberId);
                document.getElementById('member-login-error').style.display = 'none';
                showEventsSection(member);
            } else {
                throw new Error(result.error || 'Login failed');
            }
        } catch (error) {
            document.getElementById('member-login-error').textContent = 'Invalid code';
            document.getElementById('member-login-error').style.display = 'block';
            codeInput.value = '';
            loginBtn.disabled = true;
            loginBtn.textContent = 'Sign In';
        }
    });
}

function renderBirthdays() {
    const section = document.getElementById('birthdays-section');
    if (!section) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 30);

    const upcoming = [];
    homeMembers.forEach(member => {
        const raw = member.fields.BirthDate;
        if (!raw) return;
        const [, month, day] = raw.split('-').map(Number);

        // Try this year's birthday, fall back to next year if already past
        let bday = new Date(today.getFullYear(), month - 1, day);
        if (bday < today) bday = new Date(today.getFullYear() + 1, month - 1, day);

        if (bday >= today && bday <= cutoff) {
            upcoming.push({ member, bday });
        }
    });

    if (upcoming.length === 0) {
        section.style.display = 'none';
        return;
    }

    upcoming.sort((a, b) => a.bday - b.bday);

    const rows = upcoming.map(({ member, bday }) => {
        const name = `${member.fields.FirstName || ''} ${member.fields.LastName || ''}`.trim();
        const dateStr = bday.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        return `<div class="birthday-row"><strong>${name}</strong> a happy birthday on ${dateStr}.</div>`;
    }).join('');

    section.innerHTML = `
        <div class="birthdays-card">
            <div class="birthdays-header">Vintage Menschen Chavurah wishes:</div>
            <div class="birthdays-list">${rows}</div>
        </div>`;
    section.style.display = 'block';

    const isSomeoneBirthdayToday = upcoming.some(({ bday }) => bday.getTime() === today.getTime());
    if (isSomeoneBirthdayToday) showBirthdayCake();
}

function showBirthdayCake() {
    if (document.getElementById('birthday-cake-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'birthday-cake-overlay';
    overlay.innerHTML = `
        <div class="cake-container">
            <div class="cake-candles">
                <span class="candle"><span class="flame"></span></span>
                <span class="candle"><span class="flame"></span></span>
                <span class="candle"><span class="flame"></span></span>
                <span class="candle"><span class="flame"></span></span>
                <span class="candle"><span class="flame"></span></span>
            </div>
            <div class="cake-top"></div>
            <div class="cake-middle"></div>
            <div class="cake-bottom"></div>
        </div>`;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('cake-fade-out'), 4500);
    setTimeout(() => overlay.remove(), 5000);
}

function showEventsSection(member) {
    document.getElementById('member-login-section').style.display = 'none';
    document.getElementById('events-section').style.display = 'block';

    const name = `${member.fields.FirstName || ''} ${member.fields.LastName || ''}`.trim();
    document.getElementById('welcome-name').textContent = `Hi, ${member.fields.FirstName || name}!`;
    const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    document.getElementById('today-date').textContent = todayStr;

    // Attach event listeners
    document.getElementById('btn-create-event').addEventListener('click', () => {
        openMemberEventModal();
    });

    document.getElementById('btn-home-sign-out').addEventListener('click', () => {
        clearStoredItems();
        homeSignedInMemberId = null;
        document.getElementById('events-section').style.display = 'none';
        document.getElementById('member-login-section').style.display = 'block';
        document.getElementById('login-code').value = '';
        document.getElementById('member-login-error').style.display = 'none';
        setupLoginForm();
    });

    // Load birthdays and events
    renderBirthdays();
    loadUpcomingEvents();
}

function setupMemberEventModal() {
    const modal = document.getElementById('member-event-modal');

    document.getElementById('member-event-modal-close').addEventListener('click', closeMemberEventModal);
    document.getElementById('member-event-modal-cancel').addEventListener('click', closeMemberEventModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeMemberEventModal();
    });

    // Location type change - auto-fill logged-in member's home details
    const locationTypeSelect = document.getElementById('member-event-location-type');
    locationTypeSelect.addEventListener('change', async () => {
        if (locationTypeSelect.value === "Member's Home" && homeSignedInMemberId) {
            // Auto-fill with the logged-in member's home
            if (homeMembers.length === 0) {
                try {
                    const data = await fetch('/api/members?namesOnly=true');
                    const result = await data.json();
                    homeMembers = result.records || [];
                } catch (e) {
                    console.error('Error loading members:', e);
                }
            }
            const member = homeMembers.find(m => m.id === homeSignedInMemberId);
            if (member) {
                const name = `${member.fields.FirstName || ''} ${member.fields.LastName || ''}`.trim();
                document.getElementById('member-event-custom-location').value = `${name}'s Home`;
                const addressParts = [
                    member.fields.Address,
                    member.fields.City,
                    member.fields.State,
                    member.fields.Zip
                ].filter(Boolean).join(', ');
                if (addressParts) {
                    document.getElementById('member-event-address').value = addressParts;
                }
            }
        }
    });

    document.getElementById('member-event-form').addEventListener('submit', handleMemberEventSubmit);
}


function openMemberEventModal(eventId) {
    const modal = document.getElementById('member-event-modal');
    const form = document.getElementById('member-event-form');

    if (eventId) {
        // Edit mode - will be called from event detail page
        document.getElementById('member-event-modal-title').textContent = 'Edit Event';
        document.getElementById('member-event-modal-save').textContent = 'Save Changes';
        document.getElementById('member-event-id').value = eventId;
    } else {
        // Create mode
        document.getElementById('member-event-modal-title').textContent = 'New Event';
        document.getElementById('member-event-modal-save').textContent = 'Create Event';
        form.reset();
        document.getElementById('member-event-id').value = '';
    }

    modal.classList.add('active');
    window.scrollTo(0, 0);
}

function closeMemberEventModal() {
    document.getElementById('member-event-modal').classList.remove('active');
}

async function handleMemberEventSubmit(e) {
    e.preventDefault();

    const saveBtn = document.getElementById('member-event-modal-save');
    const eventId = document.getElementById('member-event-id').value;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        // Get selected status from radio buttons
        const statusRadio = document.querySelector('input[name="member-event-status"]:checked');
        const selectedStatus = statusRadio ? statusRadio.value : 'Upcoming';

        const eventData = {
            EventName: document.getElementById('member-event-name').value,
            EventDate: document.getElementById('member-event-date').value,
            EventTime: document.getElementById('member-event-time').value || null,
            LocationType: document.getElementById('member-event-location-type').value || null,
            CustomLocation: document.getElementById('member-event-custom-location').value || null,
            Address: document.getElementById('member-event-address').value || null,
            MaxAttendees: document.getElementById('member-event-max').value ? parseInt(document.getElementById('member-event-max').value) : null,
            Status: selectedStatus,
            Description: document.getElementById('member-event-description').value || null
        };

        // Set the logged-in member as host
        if (homeSignedInMemberId) {
            eventData.MemberHost = [homeSignedInMemberId];
        }

        if (eventId) {
            await Airtable.updateEvent(eventId, eventData);
            Utils.showToast('Event updated!');
        } else {
            await Airtable.createEvent(eventData);
            Utils.showToast('Event created!');
        }

        closeMemberEventModal();
        loadUpcomingEvents();

        // Offer to email members
        if (confirm('Would you like to email members about this event?')) {
            try {
                const members = await Airtable.getActiveMembers();
                const emails = members.map(m => {
                        const raw = m.fields.Email;
                        if (!raw) return null;
                        const match = raw.match(/<(.+?)>/);
                        return match ? match[1] : raw.trim();
                    }).filter(Boolean);
                if (emails.length > 0) {
                    const location = eventData.CustomLocation || eventData.Address || 'TBD';
                    const time = eventData.EventTime ? Utils.formatTime(eventData.EventTime) : 'TBD';
                    const date = Utils.formatDate(eventData.EventDate);

                    let subject, body;

                    if (eventData.Status === 'Interested') {
                        // Interest check email
                        subject = `VMC - Interest Check: ${eventData.EventName}`;
                        body = `Log into the NS app and let me know if you are interested in making this into a scheduled event.\n\n` +
                            `${eventData.EventName}\n` +
                            `Proposed Date: ${date}\n` +
                            `Proposed Time: ${time}\n` +
                            `Location: ${location}\n` +
                            (eventData.Address && eventData.Address !== location ? `Address: ${eventData.Address}\n` : '') +
                            (eventData.Description ? `\nDetails: ${eventData.Description}\n` : '') +
                            `\nSign in to view and express interest or not:\n${window.location.origin}`;
                    } else {
                        // Regular event invitation
                        subject = `VMC - New Event: ${eventData.EventName}`;
                        body = `You're invited to a Vintage Menschen Chavurah event!\n\n` +
                            `${eventData.EventName}\n` +
                            `Date: ${date}\n` +
                            `Time: ${time}\n` +
                            `Location: ${location}\n` +
                            (eventData.Address && eventData.Address !== location ? `Address: ${eventData.Address}\n` : '') +
                            (eventData.Description ? `\nDetails: ${eventData.Description}\n` : '') +
                            `\nSign in to view and RSVP:\n${window.location.origin}`;
                    }

                    const mailtoUrl = `mailto:${emails.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                    window.location.href = mailtoUrl;
                } else {
                    Utils.showToast('No member emails found', 'error');
                }
            } catch (err) {
                Utils.showToast('Could not load member emails: ' + err.message, 'error');
            }
        }

    } catch (error) {
        console.error('Error saving event:', error);
        Utils.showToast('Failed to save event: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = eventId ? 'Save Changes' : 'Create Event';
    }
}
