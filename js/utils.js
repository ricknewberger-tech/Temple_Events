// Shared Utility Functions

const Utils = {
    // Date formatting
    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString + 'T00:00:00');
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    },

    formatTime(timeString) {
        if (!timeString) return '';
        // Handle HH:MM format
        const [hours, minutes] = timeString.split(':');
        const date = new Date();
        date.setHours(parseInt(hours), parseInt(minutes));
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    },

    formatDateTime(dateString, timeString) {
        const datePart = this.formatDate(dateString);
        const timePart = timeString ? ` at ${this.formatTime(timeString)}` : '';
        return datePart + timePart;
    },

    // Check if a date is in the past
    isPastDate(dateString) {
        if (!dateString) return false;
        const eventDate = new Date(dateString + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return eventDate < today;
    },

    // Generate .ics calendar file content
    generateICS(event) {
        const { EventName, EventDate, EventTime, LocationType, CustomLocation, Address, Description } = event.fields;

        // Generate unique ID
        const uid = `${event.id}@singlesclub`;

        // Build location string
        const location = CustomLocation || Address || LocationType || '';

        // Format dates for iCal
        const startDate = this.formatICSDate(EventDate, EventTime);
        const endDate = this.formatICSDate(EventDate, EventTime, 2); // Default 2 hour duration

        const now = this.formatICSDate(new Date().toISOString().split('T')[0],
            new Date().toTimeString().slice(0, 5));

        // Escape special characters in text fields
        const escapedName = this.escapeICSText(EventName || 'Event');
        const escapedLocation = this.escapeICSText(location);
        const escapedDescription = this.escapeICSText(Description || '');

        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Chavurah//Event Calendar//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            `UID:${uid}`,
            `DTSTAMP:${now}`,
            `DTSTART:${startDate}`,
            `DTEND:${endDate}`,
            `SUMMARY:${escapedName}`,
            `LOCATION:${escapedLocation}`,
            `DESCRIPTION:${escapedDescription}`,
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

        return icsContent;
    },

    // Format date for iCal format (YYYYMMDDTHHMMSS)
    formatICSDate(dateString, timeString, hoursToAdd = 0) {
        const date = new Date(dateString + 'T' + (timeString || '00:00') + ':00');
        if (hoursToAdd) {
            date.setHours(date.getHours() + hoursToAdd);
        }

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${year}${month}${day}T${hours}${minutes}00`;
    },

    // Escape special characters for iCal
    escapeICSText(text) {
        if (!text) return '';
        return text
            .replace(/\\/g, '\\\\')
            .replace(/;/g, '\\;')
            .replace(/,/g, '\\,')
            .replace(/\n/g, '\\n');
    },

    // Download .ics file (Apple Calendar)
    downloadICS(event) {
        const icsContent = this.generateICS(event);
        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `${(event.fields.EventName || 'event').replace(/[^a-z0-9]/gi, '_')}.ics`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    // Google Calendar URL
    getGoogleCalendarUrl(event) {
        const { EventName, EventDate, EventTime, CustomLocation, Address, Description } = event.fields;
        const location = CustomLocation || Address || '';
        const startDate = this.formatICSDate(EventDate, EventTime);
        const endDate = this.formatICSDate(EventDate, EventTime, 2);

        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: EventName || 'Event',
            dates: `${startDate}/${endDate}`,
            location: location,
            details: Description || ''
        });

        return `https://calendar.google.com/calendar/render?${params.toString()}`;
    },

    // Microsoft Outlook Calendar URL
    getOutlookCalendarUrl(event) {
        const { EventName, EventDate, EventTime, CustomLocation, Address, Description } = event.fields;
        const location = CustomLocation || Address || '';
        const time = EventTime || '00:00';
        const startDt = `${EventDate}T${time}:00`;
        const endDate = new Date(`${EventDate}T${time}:00`);
        endDate.setHours(endDate.getHours() + 2);
        const endDt = endDate.toISOString().slice(0, 19);

        const params = new URLSearchParams({
            path: '/calendar/action/compose',
            rru: 'addevent',
            subject: EventName || 'Event',
            startdt: startDt,
            enddt: endDt,
            location: location,
            body: Description || ''
        });

        return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
    },

    // Copy text to clipboard
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(textarea);
                return true;
            } catch (e) {
                document.body.removeChild(textarea);
                return false;
            }
        }
    },

    // Show a toast notification
    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);

        // Remove after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // Get URL parameter
    getUrlParam(param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    },

    // Debounce function for search
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Show loading spinner
    showLoading(container) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading...</p></div>';
    },

    // Show error message
    showError(container, message) {
        container.innerHTML = `<div class="error-message"><p>${message}</p></div>`;
    },

    // Format RSVP count display
    formatRSVPCount(current, max) {
        if (!max) return `${current || 0} attending`;
        return `${current || 0} / ${max} spots filled`;
    },

    // Format relative time (e.g., "2 hours ago", "just now")
    formatRelativeTime(timestamp) {
        const now = new Date();
        const date = new Date(timestamp);
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return 'just now';

        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;

        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;

        const days = Math.floor(hours / 24);
        if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;

        const weeks = Math.floor(days / 7);
        if (weeks < 4) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;

        const months = Math.floor(days / 30);
        if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;

        const years = Math.floor(days / 365);
        return `${years} year${years !== 1 ? 's' : ''} ago`;
    },

    // Escape HTML to prevent XSS attacks
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
