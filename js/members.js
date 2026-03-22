// Members Page Logic

let allMembers = [];

document.addEventListener('DOMContentLoaded', () => {
    loadMembers();
    setupEmailToolbar();
});

async function loadMembers() {
    const container = document.getElementById('members-list');

    try {
        allMembers = await Airtable.getActiveMembers();

        // Sort by first name
        allMembers.sort((a, b) => {
            const firstA = (a.fields.FirstName || '').toLowerCase();
            const firstB = (b.fields.FirstName || '').toLowerCase();
            return firstA.localeCompare(firstB);
        });

        if (allMembers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No members found</h3>
                    <p>Add members in Airtable to see them here.</p>
                </div>
            `;
            return;
        }

        renderMembers(allMembers);

    } catch (error) {
        console.error('Error loading members:', error);
        container.innerHTML = `
            <div class="error-message">
                <p>Failed to load members. Please check your Airtable configuration.</p>
                <p class="text-muted">${error.message}</p>
            </div>
        `;
    }
}

function renderMembers(members) {
    const container = document.getElementById('members-list');

    container.innerHTML = `
        <div class="member-list">
            ${members.map(member => renderMemberRow(member)).join('')}
        </div>
    `;

    // Reset select all and email button state
    const selectAll = document.getElementById('select-all-members');
    if (selectAll) selectAll.checked = false;
    updateEmailButton();
}

function renderMemberRow(member) {
    const { FirstName, LastName, Phone, Address } = member.fields;
    const email = member.fields.Email || member.fields['Email '] || '';
    const fullName = `${FirstName || ''} ${LastName || ''}`.trim() || 'Unknown';

    const emailBtn = email ? `
        <a href="mailto:${email}?subject=${encodeURIComponent('VMC - ')}" class="member-action-btn" title="Email ${fullName}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
        </a>` : '';

    const phoneBtn = Phone ? `
        <a href="tel:${Phone.replace(/\D/g, '')}" class="member-action-btn" title="Call ${formatPhone(Phone)}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.65 3.47 2 2 0 0 1 3.62 1.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.88a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
        </a>` : '';

    const mapBtn = Address ? `
        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(Address)}" target="_blank" rel="noopener" class="member-action-btn" title="Map: ${Address}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
            </svg>
        </a>` : '';

    return `
        <div class="member-row">
            <label class="member-row-check">
                <input type="checkbox" class="member-select" data-member-id="${member.id}" data-email="${email}">
            </label>
            <span class="member-row-name">${fullName}</span>
            <div class="member-row-actions">
                ${emailBtn}${phoneBtn}${mapBtn}
            </div>
        </div>
    `;
}

function formatPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
}

function setupEmailToolbar() {
    // Select All checkbox
    document.getElementById('select-all-members').addEventListener('change', (e) => {
        document.querySelectorAll('.member-select').forEach(cb => {
            cb.checked = e.target.checked;
        });
        updateEmailButton();
    });

    // Email Selected button
    document.getElementById('btn-email-selected').addEventListener('click', () => {
        const checked = document.querySelectorAll('.member-select:checked');
        const emails = [];
        checked.forEach(cb => {
            const email = cb.dataset.email;
            if (email) emails.push(email);
        });

        if (emails.length === 0) {
            Utils.showToast('No members with emails selected', 'error');
            return;
        }

        const subject = 'VMC - ';
        const mailtoUrl = `mailto:${emails.join(',')}?subject=${encodeURIComponent(subject)}`;
        window.location.href = mailtoUrl;
    });

    // Delegate checkbox change events
    document.getElementById('members-list').addEventListener('change', (e) => {
        if (e.target.classList.contains('member-select')) {
            updateEmailButton();
            const allCheckboxes = document.querySelectorAll('.member-select');
            const allChecked = document.querySelectorAll('.member-select:checked');
            document.getElementById('select-all-members').checked = allCheckboxes.length === allChecked.length;
        }
    });
}

function updateEmailButton() {
    const checked = document.querySelectorAll('.member-select:checked');
    const btn = document.getElementById('btn-email-selected');
    btn.disabled = checked.length === 0;
    btn.textContent = checked.length > 0 ? `Email Selected (${checked.length})` : 'Email Selected';
}
