const crypto = require('crypto');
const path = require('path');
const { JsonRepository } = require('../repositories/jsonRepository');
const { validateContact, validateId } = require('../utils/validation');

const DATA_FILE = path.join(__dirname, '..', 'data', 'data.json');
const EXTERNAL_API = 'https://jsonplaceholder.typicode.com/users';
const EXTERNAL_TIMEOUT_MS = 5000;

class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
    }
}

class ContactService {
    constructor(repository) {
        this.repository = repository;
    }

    async getAll(query = {}) {
        const contacts = await this.repository.getAll();
        const search = typeof query.search === 'string' ? query.search.trim().toLowerCase() : '';
        const onlyFavorite = query.favorite === 'true' || query.favorite === true;

        return contacts.filter((contact) => {
            if (onlyFavorite && contact.favorite !== true) return false;
            if (!search) return true;

            return [contact.name, contact.email, contact.company, contact.phone]
                .filter(Boolean)
                .some((field) => String(field).toLowerCase().includes(search));
        });
    }

    async getById(id) {
        this.assertValidId(id);

        const contact = await this.repository.getById(id);
        if (!contact) {
            throw new AppError('Контакт не знайдено.', 404);
        }

        return contact;
    }

    async getStats() {
        const contacts = await this.repository.getAll();
        const byCompany = this.groupByCompany(contacts);

        return {
            total: contacts.length,
            favorites: contacts.filter((contact) => contact.favorite).length,
            companies: Object.keys(byCompany).length,
            byCompany: Object.fromEntries(
                Object.entries(byCompany).map(([company, items]) => [company, items.length])
            ),
        };
    }

    async getGroupedByCompany() {
        const contacts = await this.repository.getAll();
        return this.groupByCompany(contacts);
    }

    async create(payload) {
        return this.repository.transaction((contacts) => {
            const now = new Date().toISOString();
            const contact = {
                id: crypto.randomUUID(),
                ...this.normalizeFullPayload(payload),
                createdAt: now,
                updatedAt: now,
            };

            this.assertValidContact(contact, { requireId: true, requireTimestamps: true });
            this.assertUniqueEmail(contacts, contact.email);

            contacts.push(contact);
            return { items: contacts, result: contact };
        });
    }

    async patch(id, payload) {
        this.assertValidId(id);

        return this.repository.transaction((contacts) => {
            const index = contacts.findIndex((contact) => contact.id === id);
            if (index === -1) {
                throw new AppError('Контакт не знайдено.', 404);
            }

            if (Object.prototype.hasOwnProperty.call(payload, 'id')) {
                throw new AppError('Id не можна змінювати через тіло запиту.', 400);
            }

            const contact = {
                ...contacts[index],
                ...this.normalizePartialPayload(payload),
                id,
                updatedAt: new Date().toISOString(),
            };

            this.assertValidContact(contact, { requireId: true, requireTimestamps: true });
            this.assertUniqueEmail(contacts, contact.email, id);

            contacts[index] = contact;
            return { items: contacts, result: contact };
        });
    }

    async update(id, payload) {
        this.assertValidId(id);

        return this.repository.transaction((contacts) => {
            const index = contacts.findIndex((contact) => contact.id === id);
            if (index === -1) {
                throw new AppError('Контакт не знайдено.', 404);
            }

            if (Object.prototype.hasOwnProperty.call(payload, 'id')) {
                throw new AppError('Id не можна змінювати через тіло запиту.', 400);
            }

            const contact = {
                id,
                ...this.normalizeFullPayload(payload),
                createdAt: contacts[index].createdAt,
                updatedAt: new Date().toISOString(),
            };

            this.assertValidContact(contact, { requireId: true, requireTimestamps: true });
            this.assertUniqueEmail(contacts, contact.email, id);

            contacts[index] = contact;
            return { items: contacts, result: contact };
        });
    }

    async delete(id) {
        this.assertValidId(id);

        const deleted = await this.repository.delete(id);
        if (!deleted) {
            throw new AppError('Контакт не знайдено.', 404);
        }
    }

    async fetchExternalContacts() {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);

        let response;
        try {
            response = await fetch(EXTERNAL_API, {
                signal: controller.signal,
                headers: process.env.API_TOKEN
                    ? { Authorization: `Bearer ${process.env.API_TOKEN}` }
                    : {},
            });
        } catch {
            throw new AppError('Не вдалося завантажити контакти із зовнішнього API.', 502);
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            throw new AppError('Зовнішнє API повернуло помилковий статус.', 502);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.toLowerCase().includes('application/json')) {
            throw new AppError('Зовнішнє API повернуло дані не у форматі JSON.', 502);
        }

        let users;
        try {
            users = await response.json();
        } catch {
            throw new AppError('Зовнішнє API повернуло пошкоджений JSON.', 502);
        }

        if (!Array.isArray(users)) {
            throw new AppError('Зовнішнє API має повернути масив користувачів.', 502);
        }

        const contacts = users.map((user) => this.normalizeExternalUser(user));
        contacts.forEach((contact) => {
            this.assertValidContact(contact);
        });

        return contacts;
    }

    normalizeFullPayload(payload) {
        return {
            name: normalizeString(payload.name),
            phone: normalizeString(payload.phone),
            email: normalizeString(payload.email, true),
            company: normalizeCompany(payload.company),
            favorite: payload.favorite === undefined ? false : payload.favorite,
            ...(payload.sourceId !== undefined ? { sourceId: payload.sourceId } : {}),
        };
    }

    normalizePartialPayload(payload) {
        const contact = {};

        if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
            contact.name = normalizeString(payload.name);
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'phone')) {
            contact.phone = normalizeString(payload.phone);
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'email')) {
            contact.email = normalizeString(payload.email, true);
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'company')) {
            contact.company = normalizeCompany(payload.company);
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'favorite')) {
            contact.favorite = payload.favorite;
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'sourceId')) {
            contact.sourceId = payload.sourceId;
        }

        return contact;
    }

    normalizeExternalUser(user) {
        if (!user || typeof user !== 'object') {
            throw new AppError('Зовнішнє API повернуло некоректний обʼєкт користувача.', 502);
        }

        return {
            sourceId: user.id,
            name: normalizeString(user.name),
            phone: normalizeString(user.phone),
            email: normalizeString(user.email, true),
            company: normalizeString(user.company?.name) || 'Без компанії',
            favorite: false,
        };
    }

    groupByCompany(contacts) {
        return contacts.reduce((groups, contact) => {
            const company = contact.company || 'Без компанії';
            if (!groups[company]) groups[company] = [];
            groups[company].push(contact);
            return groups;
        }, {});
    }

    assertValidId(id) {
        const errors = validateId(id);
        if (errors.length) {
            throw new AppError(errors.join(' '), 400);
        }
    }

    assertValidContact(contact, options) {
        const result = validateContact(contact, options);
        if (!result.isValid) {
            throw new AppError(result.errors.join(' '), 400);
        }
    }

    assertUniqueEmail(contacts, email, currentId = null) {
        const normalizedEmail = String(email).toLowerCase();
        const duplicate = contacts.some((contact) => (
            contact.id !== currentId &&
            typeof contact.email === 'string' &&
            contact.email.toLowerCase() === normalizedEmail
        ));

        if (duplicate) {
            throw new AppError('Контакт з таким email вже існує.', 400);
        }
    }
}

function normalizeString(value, lowerCase = false) {
    if (typeof value !== 'string') return value;

    const trimmed = value.trim();
    return lowerCase ? trimmed.toLowerCase() : trimmed;
}

function normalizeCompany(value) {
    const normalized = normalizeString(value);
    if (normalized === undefined || normalized === null || normalized === '') {
        return 'Без компанії';
    }
    return normalized;
}

const repository = new JsonRepository(DATA_FILE);
const contactService = new ContactService(repository);

module.exports = {
    AppError,
    ContactService,
    contactService,
};
