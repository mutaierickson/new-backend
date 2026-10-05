const express = require('express');
const { handle } = require('../utils/http');
const smsController = require('../controllers/smsController');
const customerController = require('../controllers/customerController');

const router = express.Router();

router.get('/sms/status', handle(smsController.status));
router.get('/sms/campaigns', handle(smsController.campaigns));
router.post('/sms/bulk', handle(smsController.sendBulk));

router.get('/customers', handle(customerController.list));
router.post('/customers', handle(customerController.create));
router.delete('/customers/:id', handle(customerController.remove));

module.exports = router;
