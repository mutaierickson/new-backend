const express = require('express');
const { handle } = require('../utils/http');
const voidController = require('../controllers/voidController');

const router = express.Router();

router.post('/voids', handle(voidController.create));

module.exports = router;
