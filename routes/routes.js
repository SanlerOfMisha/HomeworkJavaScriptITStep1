const express = require('express');
const { contactService } = require('../services/service');

const router = express.Router();

function sendSuccess(res, statusCode, data) {
    res.status(statusCode).json({
        success: true,
        data,
    });
}

function asyncRoute(handler) {
    return async (req, res, next) => {
        try {
            await handler(req, res);
        } catch (error) {
            next(error);
        }
    };
}

function registerContactRoutes(basePath) {
    router.get(basePath, asyncRoute(async (req, res) => {
        const contacts = await contactService.getAll(req.query);
        sendSuccess(res, 200, contacts);
    }));

    router.get(`${basePath}/stats`, asyncRoute(async (req, res) => {
        const stats = await contactService.getStats();
        sendSuccess(res, 200, stats);
    }));

    router.get(`${basePath}/grouped`, asyncRoute(async (req, res) => {
        const groups = await contactService.getGroupedByCompany();
        sendSuccess(res, 200, groups);
    }));

    router.get(`${basePath}/:id`, asyncRoute(async (req, res) => {
        const contact = await contactService.getById(req.params.id);
        sendSuccess(res, 200, contact);
    }));

    router.post(basePath, asyncRoute(async (req, res) => {
        const contact = await contactService.create(req.body);
        sendSuccess(res, 201, contact);
    }));

    router.patch(`${basePath}/:id`, asyncRoute(async (req, res) => {
        const contact = await contactService.patch(req.params.id, req.body);
        sendSuccess(res, 200, contact);
    }));

    router.put(`${basePath}/:id`, asyncRoute(async (req, res) => {
        const contact = await contactService.update(req.params.id, req.body);
        sendSuccess(res, 200, contact);
    }));

    router.delete(`${basePath}/:id`, asyncRoute(async (req, res) => {
        await contactService.delete(req.params.id);
        res.status(204).end();
    }));
}

router.get('/import', asyncRoute(async (req, res) => {
    const contacts = await contactService.fetchExternalContacts();
    sendSuccess(res, 200, contacts);
}));

registerContactRoutes('/contacts');
registerContactRoutes('/items');

module.exports = router;
