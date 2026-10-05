const express = require('express');
const { handle } = require('../utils/http');
const { createPaymentController } = require('../controllers/paymentController');

module.exports = function paymentRoutes({ startStkWatcher }) {
  const paymentController = createPaymentController({ startStkWatcher });
  const router = express.Router();

  router.post('/payments/mpesa/stkpush', paymentController.stkPush);
  router.post('/payments/mpesa/callback', paymentController.callback);
  router.post('/v1/payments/mpesa/stkpush/callback', paymentController.callback);
  router.get('/payments/mpesa/status/:checkoutRequestId', handle(paymentController.status));

  return router;
};
