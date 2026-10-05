const orderModel = require('../models/orderModel');
const returnModel = require('../models/returnModel');
const auditModel = require('../models/auditModel');
const { upsertCustomer } = require('../models/customerModel');
const { makeReceiptCode, parseReceiptLookup } = require('../utils/receiptCode');
const { n } = require('../utils/http');
const { splitInclusive } = require('../utils/vat');

async function create(req, res) {
  const { user_id, customer_name, customer_phone, phone, items = [], payments = [], mpesa_receipt } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }
  const total_amount = items.reduce((acc, item) => acc + n(item.subtotal), 0);
  const vat = splitInclusive(total_amount);

  const result = await orderModel.create({
    userId: user_id,
    customerName: customer_name || null,
    customerPhone: customer_phone || phone || null,
    totalAmount: total_amount,
    vat,
    items,
    payments
  });

  const rawPhone = customer_phone || phone;
  if (rawPhone) {
    try {
      const saved = await upsertCustomer(customer_name, rawPhone);
      await orderModel.setCustomerPhone(result.id, saved.phone);
    } catch (error) {
      console.warn('Could not save customer phone:', error.message);
    }
  }

  await auditModel.log(user_id, 'Process Order', {
    order_id: result.id, receipt_code: result.receipt_code, total_amount, customer_name, mpesa_receipt: mpesa_receipt || null
  });
  res.status(201).json({ id: result.id, receipt_code: result.receipt_code, vat_rate: vat.rate, vat_amount: vat.vat_amount, success: true });
}

async function show(req, res) {
  const lookup = parseReceiptLookup(req.params.id);
  if (!lookup) return res.status(400).json({ error: 'Enter a receipt code or number' });
  const order = await orderModel.findByLookup(lookup);
  if (!order) return res.status(404).json({ error: 'Receipt not found' });
  const items = await returnModel.loadOrderLines(order.id);
  const history = await returnModel.loadOrderReturns(order.id);
  const payments = await orderModel.findPayments(order.id);
  res.json({
    ...order,
    voided: n(order.voided) ? 1 : 0,
    vat_rate: n(order.vat_rate) || 16,
    vat_amount: n(order.vat_amount),
    receipt_code: order.receipt_code || makeReceiptCode(order.id),
    items: items.map((item) => ({
      ...item,
      returned_qty: n(item.returned_qty),
      remaining: Math.max(0, n(item.quantity) - n(item.returned_qty))
    })),
    returns: history,
    payments,
    method: payments.length > 1 ? 'Split' : (payments[0]?.method || null)
  });
}

module.exports = { create, show };
