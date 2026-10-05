const express = require('express');
const { handle } = require('../utils/http');
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const categoryController = require('../controllers/categoryController');
const productController = require('../controllers/productController');

const router = express.Router();

router.post('/login', handle(authController.login));

router.get('/users', handle(userController.list));
router.post('/users', handle(userController.create));
router.delete('/users/:id', handle(userController.remove));

router.get('/categories', handle(categoryController.list));
router.post('/categories', handle(categoryController.create));
router.put('/categories/:id', handle(categoryController.update));
router.delete('/categories/:id', handle(categoryController.remove));

router.get('/products', handle(productController.list));
router.post('/products', handle(productController.create));
router.put('/products/:id', handle(productController.update));
router.delete('/products/:id', handle(productController.remove));

module.exports = router;
