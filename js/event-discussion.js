// Event Discussion - Handles updates and comments rendering and interactions

const EventDiscussion = {
    currentEvent: null,
    currentMembers: [],
    currentRSVPs: [],
    currentUpdates: [],
    currentComments: [],
    signedInMemberId: null,
    isAdmin: false,

    // Initialize with event data
    init(event, members, rsvps, signedInMemberId, isAdmin) {
        this.currentEvent = event;
        this.currentMembers = members;
        this.currentRSVPs = rsvps;
        this.signedInMemberId = signedInMemberId;
        this.isAdmin = isAdmin;
    },

    // Load updates and comments for the event
    async loadDiscussion(eventName) {
        try {
            const [updates, comments] = await Promise.all([
                Airtable.getEventUpdatesByEventName(eventName),
                Airtable.getEventCommentsByEventName(eventName)
            ]);
            this.currentUpdates = updates;
            this.currentComments = comments;
            return { updates, comments };
        } catch (error) {
            console.error('Error loading discussion:', error);
            throw error;
        }
    },

    // Render updates section
    renderUpdates(updates) {
        if (!updates || updates.length === 0) {
            return `
                <div class="no-updates">
                    <p class="text-muted">No updates yet.</p>
                </div>
            `;
        }

        return updates.map(update => {
            const timestamp = new Date(update.fields.Timestamp);
            const isAnnouncement = update.fields.IsAnnouncement || false;
            const postedBy = update.fields.PostedBy || 'Admin';
            const summaryType = update.fields.SummaryType || 'Manual';
            const isAI = summaryType === 'AI-Generated';

            return `
                <div class="update-item ${isAnnouncement ? 'announcement' : ''} ${isAI ? 'ai-summary' : ''}">
                    <div class="update-header">
                        <span class="update-author">
                            ${postedBy}
                            ${isAI ? '<span class="ai-badge">AI Summary</span>' : ''}
                        </span>
                        <span class="update-time">${Utils.formatRelativeTime(timestamp)}</span>
                    </div>
                    <div class="update-text">${this.escapeHtml(update.fields.UpdateText)}</div>
                    ${this.isAdmin && isAI ? `
                        <button class="btn-email-summary btn btn-secondary btn-sm" data-summary-text="${this.escapeHtml(update.fields.UpdateText).replace(/"/g, '&quot;')}" title="Email this summary">
                            📧 Email Summary
                        </button>
                    ` : ''}
                    ${this.isAdmin ? `
                        <button class="btn-delete-update" data-id="${update.id}" title="Delete update">
                            <span class="delete-icon">×</span>
                        </button>
                    ` : ''}
                </div>
            `;
        }).join('');
    },

    // Render comments section
    renderComments(comments) {
        if (!comments || comments.length === 0) {
            return `
                <div class="no-comments">
                    <p class="text-muted">No comments yet. Start the conversation!</p>
                </div>
            `;
        }

        return comments.map(comment => {
            const timestamp = new Date(comment.fields.Timestamp);
            const memberName = this.getMemberName(comment.fields.Member);
            const commentMemberId = comment.fields.Member?.[0];

            // Show delete button if user is admin OR if user is the comment author
            const canDelete = this.isAdmin || (this.signedInMemberId && commentMemberId === this.signedInMemberId);

            return `
                <div class="comment-item">
                    <div class="comment-header">
                        <span class="comment-author">${memberName}</span>
                        <span class="comment-time">${Utils.formatRelativeTime(timestamp)}</span>
                    </div>
                    <div class="comment-text">${this.escapeHtml(comment.fields.CommentText)}</div>
                    ${canDelete ? `
                        <button class="btn-delete-comment" data-id="${comment.id}" title="Delete comment">
                            <span class="delete-icon">×</span>
                        </button>
                    ` : ''}
                </div>
            `;
        }).join('');
    },

    // Render the update posting form (admin only)
    renderUpdateForm() {
        if (!this.isAdmin) return '';

        return `
            <div class="update-form-container">
                <form id="update-form" class="discussion-form">
                    <div class="form-group">
                        <textarea id="update-text" placeholder="Post an update or announcement..." required rows="3"></textarea>
                    </div>
                    <div class="form-actions">
                        <label class="checkbox-label">
                            <input type="checkbox" id="is-announcement">
                            <span>Mark as important announcement</span>
                        </label>
                        <button type="submit" class="btn btn-primary">Post Update</button>
                    </div>
                </form>
            </div>
        `;
    },

    // Render the summarize discussion button (admin only)
    renderSummarizeButton() {
        if (!this.isAdmin) return '';

        const hasComments = this.currentComments && this.currentComments.length > 0;
        if (!hasComments) return '';

        return `
            <button id="btn-summarize-discussion" class="btn btn-secondary btn-sm mb-2">
                <span>✨ Summarize Discussion</span>
            </button>
        `;
    },

    // Render the comment posting form
    renderCommentForm() {
        if (!this.signedInMemberId) {
            return `
                <div class="comment-form-container">
                    <p class="text-muted">Sign in to join the discussion.</p>
                </div>
            `;
        }

        return `
            <div class="comment-form-container">
                <form id="comment-form" class="discussion-form">
                    <div class="form-group">
                        <textarea id="comment-text" placeholder="Add a comment..." required rows="2"></textarea>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">Post Comment</button>
                    </div>
                </form>
            </div>
        `;
    },

    // Handle update form submission
    async handleUpdateSubmit(e) {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Posting...';

        try {
            const updateText = document.getElementById('update-text').value.trim();
            const isAnnouncement = document.getElementById('is-announcement').checked;

            if (!updateText) {
                Utils.showToast('Please enter update text', 'error');
                return;
            }

            const updateData = {
                Event: [this.currentEvent.id],
                UpdateText: updateText,
                PostedBy: 'Admin',
                Timestamp: new Date().toISOString(),
                IsAnnouncement: isAnnouncement
            };

            await Airtable.createEventUpdate(updateData);
            Utils.showToast('Update posted!');

            // Reload the page to show the new update
            setTimeout(() => {
                window.location.reload();
            }, 800);

        } catch (error) {
            console.error('Error posting update:', error);
            Utils.showToast('Failed to post update: ' + error.message, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Post Update';
        }
    },

    // Handle comment form submission
    async handleCommentSubmit(e) {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Posting...';

        try {
            const commentText = document.getElementById('comment-text').value.trim();

            if (!commentText) {
                Utils.showToast('Please enter a comment', 'error');
                return;
            }

            const commentData = {
                Event: [this.currentEvent.id],
                Member: [this.signedInMemberId],
                CommentText: commentText,
                Timestamp: new Date().toISOString()
            };

            await Airtable.createEventComment(commentData);
            Utils.showToast('Comment posted!');

            // Reload the page to show the new comment
            setTimeout(() => {
                window.location.reload();
            }, 800);

        } catch (error) {
            console.error('Error posting comment:', error);
            Utils.showToast('Failed to post comment: ' + error.message, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Post Comment';
        }
    },

    // Handle delete update
    async handleDeleteUpdate(updateId) {
        if (!confirm('Are you sure you want to delete this update?')) return;

        try {
            await Airtable.deleteEventUpdate(updateId);
            Utils.showToast('Update deleted');
            setTimeout(() => {
                window.location.reload();
            }, 800);
        } catch (error) {
            console.error('Error deleting update:', error);
            Utils.showToast('Failed to delete update: ' + error.message, 'error');
        }
    },

    // Handle delete comment
    async handleDeleteComment(commentId) {
        if (!confirm('Are you sure you want to delete this comment?')) return;

        try {
            await Airtable.deleteEventComment(commentId);
            Utils.showToast('Comment deleted');
            setTimeout(() => {
                window.location.reload();
            }, 800);
        } catch (error) {
            console.error('Error deleting comment:', error);
            Utils.showToast('Failed to delete comment: ' + error.message, 'error');
        }
    },

    // Handle AI summarize discussion
    async handleSummarizeDiscussion() {
        try {
            // Show modal and loading state
            const modal = document.getElementById('ai-summary-modal');
            const loading = document.getElementById('ai-summary-loading');
            const content = document.getElementById('ai-summary-content');

            modal.classList.add('active');
            loading.style.display = 'block';
            content.style.display = 'none';

            // Prepare comments data
            const commentsData = this.currentComments.map(comment => ({
                memberName: this.getMemberName(comment.fields.Member),
                text: comment.fields.CommentText,
                timestamp: comment.fields.Timestamp
            }));

            // Call API
            const response = await Airtable.summarizeDiscussion(
                this.currentEvent.id,
                this.currentEvent.fields.EventName,
                commentsData
            );

            // Show summary in modal
            document.getElementById('ai-summary-text').value = response.summary;
            document.getElementById('ai-summary-meta').textContent =
                `Generated from ${response.commentCount} comment${response.commentCount !== 1 ? 's' : ''}`;

            loading.style.display = 'none';
            content.style.display = 'block';

        } catch (error) {
            console.error('Error generating summary:', error);
            Utils.showToast('Failed to generate summary: ' + error.message, 'error');
            document.getElementById('ai-summary-modal').classList.remove('active');
        }
    },

    // Handle posting the AI summary
    async handlePostSummary() {
        const summaryText = document.getElementById('ai-summary-text').value.trim();
        const isImportant = document.getElementById('mark-important').checked;
        const shouldEmail = document.getElementById('email-summary').checked;

        if (!summaryText) {
            Utils.showToast('Summary cannot be empty', 'error');
            return;
        }

        const postBtn = document.getElementById('ai-summary-modal-post');
        postBtn.disabled = true;
        postBtn.textContent = 'Posting...';

        try {
            // 1. Delete existing AI-generated summary if exists
            const existingAISummary = this.currentUpdates.find(
                u => u.fields.SummaryType === 'AI-Generated'
            );
            if (existingAISummary) {
                await Airtable.deleteEventUpdate(existingAISummary.id);
            }

            // 2. Create new AI summary update
            const updateData = {
                Event: [this.currentEvent.id],
                UpdateText: summaryText,
                PostedBy: 'Admin',
                Timestamp: new Date().toISOString(),
                IsAnnouncement: isImportant,
                SummaryType: 'AI-Generated',
                LastSummarized: new Date().toISOString(),
                SummarizedCommentCount: this.currentComments.length
            };

            await Airtable.createEventUpdate(updateData);

            // 3. Handle email if requested
            if (shouldEmail) {
                await this.sendSummaryEmail(summaryText);
            }

            Utils.showToast('Summary posted!');

            setTimeout(() => {
                window.location.reload();
            }, 800);

        } catch (error) {
            console.error('Error posting summary:', error);
            Utils.showToast('Failed to post summary: ' + error.message, 'error');
            postBtn.disabled = false;
            postBtn.textContent = 'Post Summary';
        }
    },

    // Handle emailing an existing summary (from posted update)
    async handleEmailExistingSummary(summaryText) {
        // Decode HTML entities from the data attribute
        const div = document.createElement('div');
        div.innerHTML = summaryText;
        const decodedText = div.textContent.replace(/<br>/g, '\n');

        // Show a simple confirm dialog to choose recipients
        const choice = confirm(
            'Email this summary?\n\n' +
            'OK = Members who RSVPed "Yes"\n' +
            'Cancel to choose all members instead'
        );

        const recipients = choice ? 'rsvp-yes' : 'all-members';

        // Call the email function with the chosen recipients
        await this.sendSummaryEmailWithRecipients(decodedText, recipients);
    },

    // Send summary email via Gmail compose window
    async sendSummaryEmail(summaryText) {
        const recipients = document.querySelector('input[name="recipients"]:checked').value;
        await this.sendSummaryEmailWithRecipients(summaryText, recipients);
    },

    // Send summary email via Gmail compose window (core logic)
    async sendSummaryEmailWithRecipients(summaryText, recipients) {
        // Determine recipient list
        let recipientEmails = [];
        if (recipients === 'rsvp-yes') {
            const yesRSVPs = this.currentRSVPs?.filter(r => r.fields.Response === 'Yes') || [];
            recipientEmails = yesRSVPs
                .map(rsvp => this.getMemberEmail(rsvp.fields.Member))
                .filter(email => email);
        } else {
            recipientEmails = this.currentMembers
                .map(m => m.fields.Email)
                .filter(email => email)
                .map(raw => {
                    const match = raw.match(/<(.+?)>/);
                    return match ? match[1] : raw.trim();
                });
        }

        if (recipientEmails.length === 0) {
            Utils.showToast('No recipient emails found', 'error');
            return;
        }

        // Build email content
        const event = this.currentEvent.fields;
        const subject = `VMC - ${event.EventName} - Discussion Summary`;

        // Build proper event URL (use current origin for local dev, or construct production URL)
        const eventUrl = window.location.hostname === 'localhost'
            ? window.location.href
            : `https://${window.location.hostname}/event.html?id=${this.currentEvent.id}`;

        // Personalized greeting based on recipient selection
        const greeting = recipients === 'rsvp-yes' ? 'Dear NS RSVP members:' : 'Dear NS members:';

        // Get RSVP list
        const yesRSVPs = this.currentRSVPs.filter(r => r.fields.Response === 'Yes');

        let body = `${greeting}\n\n`;
        body += `--- ${event.EventName.toUpperCase()} ---\n\n`;

        body += `DATE: ${Utils.formatDate(event.EventDate)}`;
        if (event.EventTime) body += ` at ${Utils.formatTime(event.EventTime)}`;
        body += '\n';

        const location = event.CustomLocation || event.Address || event.LocationType || '';
        if (location) body += `LOCATION: ${location}\n`;
        if (event.Address && event.CustomLocation) body += `ADDRESS: ${event.Address}\n`;

        body += `\nVIEW EVENT:\n${eventUrl}\n`;

        if (event.Description) {
            body += `\nDETAILS:\n${event.Description}\n`;
        }

        body += `\n--- DISCUSSION SUMMARY ---\n\n`;
        body += summaryText + '\n';

        if (yesRSVPs.length > 0) {
            body += `\n--- ATTENDEES (${yesRSVPs.length}) ---\n\n`;

            yesRSVPs.forEach(rsvp => {
                const member = this.currentMembers.find(m => m.id === rsvp.fields.Member[0]);
                if (member) {
                    const name = `${member.fields.FirstName || ''} ${member.fields.LastName || ''}`.trim();
                    const bringing = rsvp.fields.Bringing;
                    const notes = rsvp.fields.PersonalNotes;

                    body += `- ${name}\n`;
                    if (bringing) body += `  Bringing: ${bringing}\n`;
                    if (notes) body += `  Notes: ${notes}\n`;
                    body += '\n';
                }
            });
        }

        // Open default email client
        const mailtoUrl = `mailto:${recipientEmails.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoUrl;
    },

    // Helper: Get member email from member field
    getMemberEmail(memberField) {
        if (!memberField) return null;
        if (Array.isArray(memberField) && memberField.length > 0) {
            const member = this.currentMembers.find(m => m.id === memberField[0]);
            if (!member || !member.fields.Email) return null;
            const raw = member.fields.Email;
            const match = raw.match(/<(.+?)>/);
            return match ? match[1] : raw.trim();
        }
        return null;
    },

    // Attach AI Summary modal listeners
    attachAISummaryModalListeners() {
        const modal = document.getElementById('ai-summary-modal');
        if (!modal) return;

        // Close handlers
        document.getElementById('ai-summary-modal-close')?.addEventListener('click', () => {
            modal.classList.remove('active');
        });
        document.getElementById('ai-summary-modal-cancel')?.addEventListener('click', () => {
            modal.classList.remove('active');
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });

        // Email checkbox toggle
        document.getElementById('email-summary')?.addEventListener('change', (e) => {
            document.getElementById('email-recipients').style.display =
                e.target.checked ? 'block' : 'none';
        });

        // Post button
        document.getElementById('ai-summary-modal-post')?.addEventListener('click',
            this.handlePostSummary.bind(this));
    },

    // Attach event listeners
    attachListeners() {
        // Update form
        const updateForm = document.getElementById('update-form');
        if (updateForm) {
            updateForm.addEventListener('submit', this.handleUpdateSubmit.bind(this));
        }

        // Comment form
        const commentForm = document.getElementById('comment-form');
        if (commentForm) {
            commentForm.addEventListener('submit', this.handleCommentSubmit.bind(this));
        }

        // Summarize discussion button
        const summarizeBtn = document.getElementById('btn-summarize-discussion');
        if (summarizeBtn) {
            summarizeBtn.addEventListener('click', this.handleSummarizeDiscussion.bind(this));
        }

        // Delete buttons
        document.querySelectorAll('.btn-delete-update').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const updateId = e.currentTarget.dataset.id;
                this.handleDeleteUpdate(updateId);
            });
        });

        document.querySelectorAll('.btn-delete-comment').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const commentId = e.currentTarget.dataset.id;
                this.handleDeleteComment(commentId);
            });
        });

        // Email summary buttons (on posted AI summaries)
        document.querySelectorAll('.btn-email-summary').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const summaryText = e.currentTarget.dataset.summaryText;
                this.handleEmailExistingSummary(summaryText);
            });
        });

        // AI Summary modal listeners
        this.attachAISummaryModalListeners();
    },

    // Helper: Get member name from member field
    getMemberName(memberField) {
        if (Array.isArray(memberField) && memberField.length > 0) {
            const member = this.currentMembers.find(m => m.id === memberField[0]);
            if (member) {
                return `${member.fields.FirstName || ''} ${member.fields.LastName || ''}`.trim() || 'Unknown';
            }
        }
        return 'Unknown';
    },

    // Helper: Escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/\n/g, '<br>');
    }
};
