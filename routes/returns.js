const express = require('express');
const { handle } = require('../utils/http');
const returnController = require('../controllers/returnController');

const router = express.Router();

router.post('/returns', handle(returnController.create));

module.exports = router;
