const express = require('express');
const { handle } = require('../utils/http');
const reportController = require('../controllers/reportController');

const router = express.Router();

router.get('/reports/daily', handle(reportController.daily));
router.get('/reports/payments', handle(reportController.payments));
router.get('/reports/sales', handle(reportController.sales));
router.get('/reports/categories', handle(reportController.categories));
router.get('/reports/cashiers', handle(reportController.cashiers));
router.get('/reports/profit', handle(reportController.profit));
router.get('/audit-logs', handle(reportController.auditLogs));

module.exports = router;
