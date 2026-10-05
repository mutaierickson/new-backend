const express = require('express');
const { handle } = require('../utils/http');
const orderController = require('../controllers/orderController');
const dashboardController = require('../controllers/dashboardController');
const dayCloseController = require('../controllers/dayCloseController');

const router = express.Router();

router.post('/orders', handle(orderController.create));
router.get('/orders/:id', handle(orderController.show));
router.get('/dashboard', handle(dashboardController.show));
router.post('/day-closes', handle(dayCloseController.create));

module.exports = router;
