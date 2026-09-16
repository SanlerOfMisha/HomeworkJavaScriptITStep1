const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateId(id) {
    const errors = [];

    if (typeof id !== 'string' || !id.trim()) {
        errors.push('Id має бути непорожнім рядком.');
    } else if (!UUID_PATTERN.test(id)) {
        errors.push('Id має бути у форматі UUID.');
    }

    return errors;
}

function validateContact(contact, options = {}) {
    const errors = [];
    const { requireId = false, requireTimestamps = false } = options;

    if (requireId) {
        errors.push(...validateId(contact.id));
    } else if (contact.id !== undefined) {
        errors.push(...validateId(contact.id));
    }

    validateRequiredString(contact.name, 'name', 'Імʼя', errors);
    validateRequiredString(contact.phone, 'phone', 'Телефон', errors);
    validateRequiredString(contact.email, 'email', 'Email', errors);

    if (typeof contact.email === 'string' && contact.email.trim() && !EMAIL_PATTERN.test(contact.email)) {
        errors.push('Email має неправильний формат.');
    }

    if (contact.company !== undefined) {
        validateString(contact.company, 'company', 'Компанія', errors);
    }

    if (typeof contact.favorite !== 'boolean') {
        errors.push('Статус обраного контакту favorite має бути true або false.');
    }

    if (contact.sourceId !== undefined) {
        if (!Number.isInteger(contact.sourceId)) {
            errors.push('sourceId має бути цілим числом.');
        } else if (contact.sourceId < 1 || contact.sourceId > 1000000) {
            errors.push('sourceId має бути в межах від 1 до 1000000.');
        }
    }

    validateDateField(contact.createdAt, 'createdAt', requireTimestamps, errors);
    validateDateField(contact.updatedAt, 'updatedAt', requireTimestamps, errors);

    return {
        isValid: errors.length === 0,
        errors,
    };
}

function validateRequiredString(value, field, label, errors) {
    if (typeof value !== 'string') {
        errors.push(`${label} (${field}) має бути рядком.`);
        return;
    }

    if (!value.trim()) {
        errors.push(`${label} (${field}) не може бути порожнім.`);
    }
}

function validateString(value, field, label, errors) {
    if (typeof value !== 'string') {
        errors.push(`${label} (${field}) має бути рядком.`);
        return;
    }

    if (!value.trim()) {
        errors.push(`${label} (${field}) не може бути порожнім рядком.`);
    }
}

function validateDateField(value, field, required, errors) {
    if (value === undefined || value === null) {
        if (required) {
            errors.push(`${field} є обовʼязковою датою.`);
        }
        return;
    }

    if (typeof value !== 'string') {
        errors.push(`${field} має бути рядком у форматі ISO date.`);
        return;
    }

    const time = Date.parse(value);
    if (Number.isNaN(time)) {
        errors.push(`${field} має містити коректну дату.`);
    }
}

module.exports = {
    validateContact,
    validateId,
};
