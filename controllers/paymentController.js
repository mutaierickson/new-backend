const mpesa = require('../services/mpesa');

const callbackUrl = (req) => {
  if (process.env.MPESA_CALLBACK_URL) return process.env.MPESA_CALLBACK_URL;
  const protocol = req.protocol === 'https' ? 'https' : 'http';
  return `${protocol}://${req.get('host')}/api/payments/mpesa/callback`;
};

function createPaymentController({ startStkWatcher }) {
  async function stkPush(req, res) {
    try {
      const { phone, amount, account_reference } = req.body;
      const record = await mpesa.initiateStkPush({
        phone,
        amount,
        accountReference: account_reference || 'ESSENTIALS',
        description: 'Store payment',
        callbackUrl: callbackUrl(req)
      });
      res.json({
        checkout_request_id: record.checkoutRequestId,
        status: record.status,
        reason: record.reason,
        message: record.resultDesc
      });
      startStkWatcher(record.checkoutRequestId);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  function callback(req, res) {
    try {
      mpesa.applyCallback(req.body?.Body?.stkCallback || req.body?.stkCallback || {});
    } catch (_) {}
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }

  async function status(req, res) {
    const record = await mpesa.queryStkStatus(req.params.checkoutRequestId);
    if (!record) return res.status(404).json({ error: 'STK request not found' });
    res.json({
      checkout_request_id: record.checkoutRequestId,
      status: record.status,
      reason: record.reason || null,
      result_desc: record.resultDesc,
      mpesa_receipt: record.mpesaReceipt || null
    });
  }

  return { stkPush, callback, status };
}

module.exports = { createPaymentController };
