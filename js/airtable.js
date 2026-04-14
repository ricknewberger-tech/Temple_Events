// API Client - calls Netlify serverless functions instead of Airtable directly

const Airtable = {
    // Cache configuration
    cache: new Map(),
    cacheTimestamps: new Map(),
    cacheDurations: {
        events: 120000,       // 2 minutes for events list
        members: 300000,      // 5 minutes for members
        rsvps: 60000,         // 1 minute for RSVPs
        comments: 60000,      // 1 minute for comments
        interest: 60000,      // 1 minute for interest
        default: 60000        // 1 minute default
    },

    // Get cache key from endpoint
    getCacheKey(endpoint) {
        return endpoint;
    },

    // Check if cache is valid
    isCacheValid(key) {
        if (!this.cache.has(key)) return false;
        const timestamp = this.cacheTimestamps.get(key);
        const duration = this.getCacheDuration(key);
        return (Date.now() - timestamp) < duration;
    },

    // Get cache duration based on endpoint
    getCacheDuration(key) {
        if (key.includes('/api/events')) return this.cacheDurations.events;
        if (key.includes('/api/members')) return this.cacheDurations.members;
        if (key.includes('/api/rsvps')) return this.cacheDurations.rsvps;
        if (key.includes('/api/event-comments')) return this.cacheDurations.comments;
        if (key.includes('/api/event-interest')) return this.cacheDurations.interest;
        return this.cacheDurations.default;
    },

    // Clear cache for specific endpoint or all
    clearCache(endpoint = null) {
        if (endpoint) {
            const key = this.getCacheKey(endpoint);
            this.cache.delete(key);
            this.cacheTimestamps.delete(key);
        } else {
            this.cache.clear();
            this.cacheTimestamps.clear();
        }
    },

    // Get auth header based on current session (check sessionStorage first for admin priority)
    getAuthHeader() {
        const authToken = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
        return authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
    },

    // Sleep helper for retry logic
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    // Generic request to our API with caching and retry logic
    async request(endpoint, options = {}) {
        // Skip cache for mutations (POST, PATCH, DELETE)
        const isMutation = options.method && options.method !== 'GET';
        const cacheKey = this.getCacheKey(endpoint);

        // Return cached response if valid (only for GET requests)
        if (!isMutation && this.isCacheValid(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        // Retry logic for rate limiting
        let retries = 0;
        const maxRetries = 3;
        let lastError;

        while (retries <= maxRetries) {
            try {
                const response = await fetch(endpoint, {
                    ...options,
                    headers: {
                        'Content-Type': 'application/json',
                        ...this.getAuthHeader(),
                        ...options.headers
                    }
                });

                // Handle rate limiting with exponential backoff
                if (response.status === 429) {
                    retries++;
                    if (retries > maxRetries) {
                        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
                    }

                    // Exponential backoff: 1s, 2s, 4s
                    const delay = Math.pow(2, retries - 1) * 1000;
                    console.warn(`Rate limited. Retrying in ${delay}ms... (attempt ${retries}/${maxRetries})`);
                    await this.sleep(delay);
                    continue;
                }

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    console.error('Full error response:', errorData);
                    const errorMsg = errorData.details || errorData.error || errorData.fullError || `HTTP error ${response.status}`;
                    throw new Error(errorMsg);
                }

                const data = await response.json();

                // Cache successful GET requests
                if (!isMutation) {
                    this.cache.set(cacheKey, data);
                    this.cacheTimestamps.set(cacheKey, Date.now());
                }

                // Clear related cache on mutations
                if (isMutation) {
                    if (endpoint.includes('/api/events')) this.clearCache('/api/events');
                    if (endpoint.includes('/api/rsvps')) this.clearCache('/api/rsvps');
                    if (endpoint.includes('/api/event-comments')) this.clearCache('/api/event-comments');
                    if (endpoint.includes('/api/event-interest')) this.clearCache('/api/event-interest');
                }

                return data;
            } catch (error) {
                // Don't retry on non-429 errors
                if (!error.message.includes('Rate limit')) {
                    console.error('API error:', error);
                    throw error;
                }
                lastError = error;
            }
        }

        // If we exhausted all retries, throw the last error
        throw lastError;
    },

    // ========== Authentication ==========

    async loginWithCode(code) {
        return await this.request('/api/login', {
            method: 'POST',
            body: JSON.stringify({ code }),
            headers: {} // No auth needed for login
        });
    },

    async loginAdmin(adminPassword) {
        return await this.request('/api/login', {
            method: 'POST',
            body: JSON.stringify({ adminPassword }),
            headers: {} // No auth needed for login
        });
    },

    async loginAdminWithName(firstName, lastName, code) {
        return await this.request('/api/login', {
            method: 'POST',
            body: JSON.stringify({ firstName, lastName, code }),
            headers: {} // No auth needed for login
        });
    },

    async trackSession(memberId) {
        try {
            return await this.request('/api/track-session', {
                method: 'POST',
                body: JSON.stringify({ memberId })
            });
        } catch (error) {
            // Silently fail - don't disrupt user experience if tracking fails
            console.warn('Failed to track session:', error);
            return { success: false };
        }
    },

    // ========== Events ==========

    async getUpcomingEvents() {
        const today = new Date().toISOString().split('T')[0];
        const filter = `AND(OR({Status}="Upcoming", {Status}="Interested"), {EventDate}>="${today}")`;
        const data = await this.request(`/api/events?filter=${encodeURIComponent(filter)}&sortField=EventDate&sortDirection=asc`);
        const records = data.records || [];

        // Sort: Interested events first, then Upcoming events, both by EventDate and EventTime ascending
        return records.sort((a, b) => {
            const statusA = a.fields.Status || 'Upcoming';
            const statusB = b.fields.Status || 'Upcoming';

            // Interested comes before Upcoming
            if (statusA === 'Interested' && statusB !== 'Interested') return -1;
            if (statusA !== 'Interested' && statusB === 'Interested') return 1;

            // Within same status, sort by date first
            const dateA = new Date(a.fields.EventDate);
            const dateB = new Date(b.fields.EventDate);
            const dateDiff = dateA - dateB;

            // If dates are the same, sort by time
            if (dateDiff === 0) {
                const timeA = a.fields.EventTime || '';
                const timeB = b.fields.EventTime || '';
                // Events without time come after events with time
                if (!timeA && timeB) return 1;
                if (timeA && !timeB) return -1;
                return timeA.localeCompare(timeB);
            }

            return dateDiff;
        });
    },

    async getPastEvents() {
        const today = new Date().toISOString().split('T')[0];
        const filter = `{EventDate}<"${today}"`;
        const data = await this.request(`/api/events?filter=${encodeURIComponent(filter)}&sortField=EventDate&sortDirection=desc`);
        return data.records || [];
    },

    async getAllEvents() {
        const data = await this.request('/api/events?sortField=EventDate&sortDirection=asc');
        return data.records || [];
    },

    async getEvent(eventId) {
        return await this.request(`/api/events?id=${eventId}`);
    },

    async createEvent(eventData) {
        return await this.request('/api/events', {
            method: 'POST',
            body: JSON.stringify({ fields: eventData })
        });
    },

    async updateEvent(eventId, eventData) {
        return await this.request(`/api/events?id=${eventId}`, {
            method: 'PATCH',
            body: JSON.stringify({ fields: eventData })
        });
    },

    async deleteEvent(eventId) {
        return await this.request(`/api/events?id=${eventId}`, {
            method: 'DELETE'
        });
    },

    // ========== Members ==========

    async getActiveMembers() {
        const data = await this.request('/api/members');
        return data.records || [];
    },

    async getAllMembers() {
        return await this.getActiveMembers();
    },

    async getMember(memberId) {
        // Get all members and find by ID (simpler than adding a single-record endpoint)
        const members = await this.getActiveMembers();
        return members.find(m => m.id === memberId) || null;
    },

    // ========== RSVPs ==========

    async getRSVPsByEventId(eventId) {
        const filter = encodeURIComponent(`FIND("${eventId}",ARRAYJOIN({Event}))`);
        const data = await this.request(`/api/rsvps?filter=${filter}`);
        return data.records || [];
    },

    async getAllRSVPs() {
        const data = await this.request('/api/rsvps');
        return data.records || [];
    },

    async createRSVP(rsvpData) {
        return await this.request('/api/rsvps', {
            method: 'POST',
            body: JSON.stringify({ fields: rsvpData })
        });
    },

    async updateRSVP(rsvpId, rsvpData) {
        return await this.request(`/api/rsvps?id=${rsvpId}`, {
            method: 'PATCH',
            body: JSON.stringify({ fields: rsvpData })
        });
    },

    async deleteRSVP(rsvpId) {
        return await this.request(`/api/rsvps?id=${rsvpId}`, {
            method: 'DELETE'
        });
    },

    async getYesRSVPs(eventId) {
        const filter = encodeURIComponent(`AND(FIND("${eventId}",ARRAYJOIN({Event})),{Response}="Yes")`);
        const data = await this.request(`/api/rsvps?filter=${filter}`);
        return data.records || [];
    },

    async countEventRSVPs(eventId) {
        const rsvps = await this.getYesRSVPs(eventId);
        return rsvps.length;
    },

    async getMemberEventRSVP(eventId, memberId) {
        const filter = encodeURIComponent(`AND(FIND("${eventId}",ARRAYJOIN({Event})),FIND("${memberId}",ARRAYJOIN({Member})))`);
        const data = await this.request(`/api/rsvps?filter=${filter}`);
        const records = data.records || [];
        return records.length > 0 ? records[0] : null;
    },

    // ========== Event Updates ==========

    async getEventUpdatesByEventId(eventId) {
        const filter = encodeURIComponent(`FIND("${eventId}",ARRAYJOIN({Event}))`);
        const data = await this.request(`/api/event-updates?filter=${filter}`);
        return data.records || [];
    },

    async createEventUpdate(updateData) {
        return await this.request('/api/event-updates', {
            method: 'POST',
            body: JSON.stringify({ fields: updateData })
        });
    },

    async updateEventUpdate(updateId, updateData) {
        return await this.request(`/api/event-updates?id=${updateId}`, {
            method: 'PATCH',
            body: JSON.stringify({ fields: updateData })
        });
    },

    async deleteEventUpdate(updateId) {
        return await this.request(`/api/event-updates?id=${updateId}`, {
            method: 'DELETE'
        });
    },

    // ========== Event Comments ==========

    async getEventCommentsByEventId(eventId) {
        const filter = encodeURIComponent(`FIND("${eventId}",ARRAYJOIN({Event}))`);
        const data = await this.request(`/api/event-comments?filter=${filter}`);
        return data.records || [];
    },

    async createEventComment(commentData) {
        return await this.request('/api/event-comments', {
            method: 'POST',
            body: JSON.stringify({ fields: commentData })
        });
    },

    async deleteEventComment(commentId) {
        return await this.request(`/api/event-comments?id=${commentId}`, {
            method: 'DELETE'
        });
    },

    async countEventComments(eventId) {
        const comments = await this.getEventCommentsByEventId(eventId);
        return comments.length;
    },

    async getAllEventComments() {
        const data = await this.request('/api/event-comments');
        return data.records || [];
    },

    // ========== Event Interest ==========

    async getEventInterestByEventId(eventId) {
        const filter = encodeURIComponent(`FIND("${eventId}",ARRAYJOIN({Event}))`);
        const data = await this.request(`/api/event-interest?filter=${filter}`);
        return data.records || [];
    },

    async createEventInterest(eventId, memberId) {
        return await this.request('/api/event-interest', {
            method: 'POST',
            body: JSON.stringify({
                fields: {
                    Event: [eventId],
                    Member: [memberId],
                    Timestamp: new Date().toISOString()
                }
            })
        });
    },

    async deleteEventInterest(eventId, memberId) {
        return await this.request(`/api/event-interest?eventId=${eventId}&memberId=${memberId}`, {
            method: 'DELETE'
        });
    },

    async countEventInterest(eventId) {
        const interests = await this.getEventInterestByEventId(eventId);
        return interests.length;
    },

    async getMemberEventInterest(eventId, memberId) {
        const filter = encodeURIComponent(`AND(FIND("${eventId}",ARRAYJOIN({Event})),FIND("${memberId}",ARRAYJOIN({Member})))`);
        const data = await this.request(`/api/event-interest?filter=${filter}`);
        const records = data.records || [];
        return records.length > 0 ? records[0] : null;
    },

    async getAllEventInterests() {
        const data = await this.request('/api/event-interest');
        return data.records || [];
    },

    // ========== AI Discussion Summarization ==========

    async summarizeDiscussion(eventId, eventName, comments) {
        return await this.request('/api/summarize-discussion', {
            method: 'POST',
            body: JSON.stringify({ eventId, eventName, comments })
        });
    },

    // ========== Notifications ==========

    // Get active notifications for current user (filtered by role and audience)
    async getActiveNotifications() {
        const data = await this.request('/api/notifications');
        return data.records || [];
    },

    // Admin: Create notification
    async createNotification(notificationData) {
        return await this.request('/api/notifications', {
            method: 'POST',
            body: JSON.stringify(notificationData)
        });
    },

    // Admin: Update notification
    async updateNotification(id, notificationData) {
        return await this.request(`/api/notifications/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(notificationData)
        });
    },

    // Admin: Delete notification
    async deleteNotification(id) {
        return await this.request(`/api/notifications/${id}`, {
            method: 'DELETE'
        });
    },

    // Admin: Get all notifications (including inactive)
    async getAllNotifications() {
        const data = await this.request('/api/notifications?all=true');
        return data.records || [];
    },

    // ========== SMS ==========

    async sendSMS(memberIds, message, eventId = null) {
        return await this.request('/api/send-sms', {
            method: 'POST',
            body: JSON.stringify({ memberIds, message, eventId })
        });
    }
};
