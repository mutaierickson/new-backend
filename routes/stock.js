const express = require('express');
const { handle } = require('../utils/http');
const stockController = require('../controllers/stockController');

const router = express.Router();

router.get('/stock-intakes', handle(stockController.list));
router.post('/stock-intakes', handle(stockController.create));

module.exports = router;
