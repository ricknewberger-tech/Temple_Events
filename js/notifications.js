// Notification Banner - Displayed on home page only

const NotificationBanner = {
    container: null,

    async init() {
        this.container = document.getElementById('notification-banner-container');
        if (!this.container) return;

        // Check if user is authenticated
        const authToken = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
        if (!authToken) return;

        // Load and display notifications
        await this.loadNotifications();
    },

    async loadNotifications() {
        try {
            const notifications = await Airtable.getActiveNotifications();

            if (notifications.length === 0) {
                this.container.innerHTML = '';
                return;
            }

            // Sort by priority (highest first), then by created date (newest first)
            const sorted = notifications.sort((a, b) => {
                const priorityA = a.fields.Priority || 0;
                const priorityB = b.fields.Priority || 0;
                if (priorityB !== priorityA) return priorityB - priorityA;

                const dateA = new Date(a.fields.CreatedDate || 0);
                const dateB = new Date(b.fields.CreatedDate || 0);
                return dateB - dateA;
            });

            // Clear container
            this.container.innerHTML = '';

            // Display up to 3 notifications (highest priority first)
            const maxNotifications = 3;
            sorted.slice(0, maxNotifications).forEach(notification => {
                this.renderBanner(notification);
            });
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    },

    renderBanner(notification) {
        const { Title, Message, Priority } = notification.fields;

        // Derive type from priority
        let type;
        if (Priority === 5) type = 'urgent';        // Red
        else if (Priority === 4) type = 'warning';  // Orange
        else if (Priority === 1) type = 'success';  // Green
        else type = 'info';                         // Blue (2, 3, or default)

        const typeClass = `notification-${type}`;

        // Create banner element
        const bannerDiv = document.createElement('div');
        bannerDiv.className = `notification-banner ${typeClass}`;
        bannerDiv.setAttribute('data-notification-id', notification.id);
        bannerDiv.innerHTML = `
            <button class="notification-close" aria-label="Dismiss notification">&times;</button>
            <div class="notification-content">
                <div class="notification-header">
                    <div class="notification-icon">${this.getIcon(type)}</div>
                    <strong class="notification-title">${this.escapeHtml(Title || 'Notification')}</strong>
                </div>
                <p class="notification-message">${this.escapeHtml(Message || '')}</p>
            </div>
        `;

        // Attach close handler - only removes from DOM temporarily (comes back on refresh)
        const closeBtn = bannerDiv.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => this.dismissNotification(bannerDiv));

        // Append to container
        this.container.appendChild(bannerDiv);

        // Trigger animation
        requestAnimationFrame(() => {
            bannerDiv.classList.add('show');
        });
    },

    dismissNotification(bannerElement) {
        // Animate out - no persistence, will reappear on next page load
        bannerElement.classList.remove('show');
        setTimeout(() => {
            bannerElement.remove();
            // If no notifications left, clear container
            if (this.container.children.length === 0) {
                this.container.innerHTML = '';
            }
        }, 300);
    },

    getIcon(type) {
        const icons = {
            'info': 'ℹ️',
            'warning': '⚠️',
            'urgent': '🚨',
            'success': '✅'
        };
        return icons[type] || icons['info'];
    },

    // Escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Only auto-initialize on index.html (home page)
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on the home page by looking for the notification container
    // and the events-section (which is unique to index.html)
    const isHomePage = document.getElementById('notification-banner-container') &&
                       document.getElementById('events-section');

    if (isHomePage) {
        NotificationBanner.init();
    }
});
