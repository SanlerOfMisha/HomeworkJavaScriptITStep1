const contactsList = document.querySelector('#contacts-list');
const groupsList = document.querySelector('#groups-list');
const importsList = document.querySelector('#imports-list');
const contactsCount = document.querySelector('#contacts-count');
const importsCount = document.querySelector('#imports-count');
const form = document.querySelector('#contact-form');
const formTitle = document.querySelector('#form-title');
const formMessage = document.querySelector('#form-message');
const saveButton = document.querySelector('#save-button');
const resetButton = document.querySelector('#reset-button');
const loadImportsButton = document.querySelector('#load-imports-button');
const searchInput = document.querySelector('#search');
const favoriteFilter = document.querySelector('#favorite-filter');

const fields = {
    id: document.querySelector('#contact-id'),
    name: document.querySelector('#name'),
    phone: document.querySelector('#phone'),
    email: document.querySelector('#email'),
    company: document.querySelector('#company'),
    favorite: document.querySelector('#favorite'),
};

let contacts = [];
let importedContacts = [];

function getFormData() {
    return {
        name: fields.name.value.trim(),
        phone: fields.phone.value.trim(),
        email: fields.email.value.trim(),
        company: fields.company.value.trim(),
        favorite: fields.favorite.checked,
    };
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateForm(contact) {
    if (!contact.name || !contact.phone || !contact.email) {
        return "Заповніть ім'я, телефон та email.";
    }

    if (!isValidEmail(contact.email)) {
        return 'Введіть коректний email.';
    }

    return '';
}

function showFormMessage(message, type = 'error') {
    formMessage.textContent = message;
    formMessage.dataset.type = type;
}

function clearForm() {
    form.reset();
    fields.id.value = '';
    formTitle.textContent = 'Новий контакт';
    saveButton.textContent = 'Додати контакт';
    showFormMessage('');
}

async function requestJSON(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        ...options,
    });

    const contentType = response.headers.get('content-type') || '';
    const hasJSON = contentType.includes('application/json');
    const result = response.status === 204
        ? null
        : hasJSON
            ? await response.json().catch(() => null)
            : null;

    if (!response.ok) {
        throw new Error(result?.error || 'Сталася помилка запиту.');
    }

    return result?.data ?? null;
}

function buildContactsUrl() {
    const params = new URLSearchParams();
    const search = searchInput.value.trim();

    if (search) params.set('search', search);
    if (favoriteFilter.checked) params.set('favorite', 'true');

    const query = params.toString();
    return query ? `/api/contacts?${query}` : '/api/contacts';
}

async function loadContacts() {
    contacts = await requestJSON(buildContactsUrl()) || [];
    renderContacts();
    renderGroups();
}

function renderContacts() {
    contactsCount.textContent = String(contacts.length);

    if (!contacts.length) {
        contactsList.innerHTML = '<p class="empty-state">Контактів поки немає.</p>';
        return;
    }

    contactsList.innerHTML = contacts.map((contact) => `
        <article class="contact-card">
            <div>
                <h3>${escapeHTML(contact.name)}</h3>
                <p>${escapeHTML(contact.company || 'Без компанії')}</p>
            </div>
            <dl>
                <div>
                    <dt>Телефон</dt>
                    <dd>${escapeHTML(contact.phone)}</dd>
                </div>
                <div>
                    <dt>Email</dt>
                    <dd>${escapeHTML(contact.email)}</dd>
                </div>
            </dl>
            <div class="card-actions">
                <span class="favorite-badge ${contact.favorite ? 'active' : ''}">
                    ${contact.favorite ? 'Обраний' : 'Звичайний'}
                </span>
                <button type="button" data-action="edit" data-id="${contact.id}">Редагувати</button>
                <button class="danger-button" type="button" data-action="delete" data-id="${contact.id}">Видалити</button>
            </div>
        </article>
    `).join('');
}

function renderGroups() {
    const groups = contacts.reduce((result, contact) => {
        const company = contact.company || 'Без компанії';
        result[company] = result[company] || [];
        result[company].push(contact);
        return result;
    }, {});

    const entries = Object.entries(groups);

    if (!entries.length) {
        groupsList.innerHTML = '<p class="empty-state">Немає даних для групування.</p>';
        return;
    }

    groupsList.innerHTML = entries.map(([company, items]) => `
        <details class="company-group" open>
            <summary>
                <span>${escapeHTML(company)}</span>
                <strong>${items.length}</strong>
            </summary>
            <ul>
                ${items.map((contact) => `<li>${escapeHTML(contact.name)} · ${escapeHTML(contact.email)}</li>`).join('')}
            </ul>
        </details>
    `).join('');
}

function renderImports() {
    importsCount.textContent = String(importedContacts.length);

    if (!importedContacts.length) {
        importsList.innerHTML = '<p class="empty-state">Натисніть кнопку завантаження, щоб отримати контакти із зовнішнього API.</p>';
        return;
    }

    importsList.innerHTML = importedContacts.map((contact, index) => `
        <article class="import-card">
            <div>
                <h3>${escapeHTML(contact.name)}</h3>
                <p>${escapeHTML(contact.company)} · ${escapeHTML(contact.email)}</p>
            </div>
            <button type="button" data-action="import" data-index="${index}">Імпортувати</button>
        </article>
    `).join('');
}

function fillForm(contact) {
    fields.id.value = contact.id;
    fields.name.value = contact.name;
    fields.phone.value = contact.phone;
    fields.email.value = contact.email;
    fields.company.value = contact.company;
    fields.favorite.checked = contact.favorite;

    formTitle.textContent = 'Редагування контакту';
    saveButton.textContent = 'Зберегти зміни';
    showFormMessage('');
    fields.name.focus();
}

function escapeHTML(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const contact = getFormData();
    const validationMessage = validateForm(contact);

    if (validationMessage) {
        showFormMessage(validationMessage);
        return;
    }

    const id = fields.id.value;
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/contacts/${encodeURIComponent(id)}` : '/api/contacts';

    try {
        await requestJSON(url, {
            method,
            body: JSON.stringify(contact),
        });
        clearForm();
        await loadContacts();
        showFormMessage(id ? 'Контакт оновлено.' : 'Контакт додано.', 'success');
    } catch (error) {
        showFormMessage(error.message);
    }
});

resetButton.addEventListener('click', clearForm);

contactsList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const id = button.dataset.id;
    const contact = contacts.find((item) => item.id === id);

    if (button.dataset.action === 'edit' && contact) {
        fillForm(contact);
    }

    if (button.dataset.action === 'delete') {
        try {
            await requestJSON(`/api/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
            await loadContacts();
            if (fields.id.value === id) clearForm();
        } catch (error) {
            showFormMessage(error.message);
        }
    }
});

loadImportsButton.addEventListener('click', async () => {
    loadImportsButton.disabled = true;
    loadImportsButton.textContent = 'Завантаження...';

    try {
        importedContacts = await requestJSON('/api/import') || [];
        renderImports();
    } catch (error) {
        importsList.innerHTML = `<p class="empty-state error">${escapeHTML(error.message)}</p>`;
    } finally {
        loadImportsButton.disabled = false;
        loadImportsButton.textContent = 'Завантажити користувачів';
    }
});

importsList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action="import"]');
    if (!button) return;

    const contact = importedContacts[Number(button.dataset.index)];
    if (!contact) return;

    try {
        await requestJSON('/api/contacts', {
            method: 'POST',
            body: JSON.stringify(contact),
        });
        button.disabled = true;
        button.textContent = 'Імпортовано';
        await loadContacts();
    } catch (error) {
        showFormMessage(error.message);
    }
});

searchInput.addEventListener('input', () => {
    loadContacts().catch((error) => showFormMessage(error.message));
});

favoriteFilter.addEventListener('change', () => {
    loadContacts().catch((error) => showFormMessage(error.message));
});

renderImports();
loadContacts().catch((error) => showFormMessage(error.message));
