const returnModel = require('../models/returnModel');
const productModel = require('../models/productModel');
const auditModel = require('../models/auditModel');
const { n } = require('../utils/http');

const PAY_METHODS = ['Cash', 'Card', 'Mobile'];

async function create(req, res) {
  const { user_id, order_id, receipt_code, items = [], exchange_items = [], method, reason, restock = true } = req.body || {};
  const userId = Number(user_id);
  if (!userId) return res.status(400).json({ error: 'user_id is required' });

  const order = await returnModel.findOrder({ orderId: order_id, receiptCode: receipt_code });
  if (!order) return res.status(404).json({ error: 'Receipt not found' });
  if (await returnModel.isOrderVoided(order.id)) return res.status(400).json({ error: 'This sale is voided and cannot be returned' });

  const returning = (Array.isArray(items) ? items : []).filter((item) => n(item.quantity) > 0);
  if (!returning.length) return res.status(400).json({ error: 'Select at least one item to return' });

  const taking = (Array.isArray(exchange_items) ? exchange_items : []).filter((item) => n(item.quantity) > 0);
  const lines = await returnModel.loadOrderLines(order.id);
  const byId = new Map(lines.map((line) => [Number(line.order_item_id), line]));

  let returnedValue = 0;
  const returnedRows = [];
  for (const item of returning) {
    const line = byId.get(Number(item.order_item_id));
    if (!line) return res.status(400).json({ error: 'An item on this receipt could not be found' });
    const qty = Math.floor(n(item.quantity));
    const remaining = n(line.quantity) - n(line.returned_qty);
    if (qty < 1 || qty > remaining) {
      return res.status(400).json({ error: `Only ${remaining} of ${line.name || 'that item'} can still be returned` });
    }
    returnedValue += n(line.price) * qty;
    returnedRows.push({ line, qty });
  }

  let exchangeValue = 0;
  const takenRows = [];
  for (const item of taking) {
    const product = await productModel.findById(item.product_id);
    if (!product) return res.status(400).json({ error: 'An exchange item is no longer in inventory' });
    const qty = Math.floor(n(item.quantity));
    if (qty < 1) continue;
    const price = n(item.unit_price != null ? item.unit_price : product.price);
    const cost = n(item.unit_cost != null ? item.unit_cost : product.cost);
    exchangeValue += price * qty;
    takenRows.push({ product, qty, price, cost });
  }

  const net = Number((exchangeValue - returnedValue).toFixed(2));
  const extra_amount = net > 0 ? net : 0;
  const refund_amount = net < 0 ? Number((-net).toFixed(2)) : 0;
  const payMethod = method || 'Cash';
  if (!PAY_METHODS.includes(payMethod)) {
    return res.status(400).json({ error: 'Choose Cash, Card, or M-Pesa' });
  }
  const shouldRestock = restock !== false && restock !== 0 && restock !== '0';
  const type = takenRows.length ? 'exchange' : 'return';

  const result = await returnModel.create({
    orderId: order.id,
    userId,
    type,
    refundAmount: refund_amount,
    extraAmount: extra_amount,
    method: payMethod,
    reason,
    restock: shouldRestock,
    returnedRows,
    takenRows
  });

  await auditModel.log(userId, type === 'exchange' ? 'EXCHANGE' : 'RETURN', {
    return_id: result.id,
    return_code: result.return_code,
    order_id: order.id,
    receipt_code: order.receipt_code,
    refund_amount,
    extra_amount,
    restock: shouldRestock
  });

  res.status(201).json({
    id: result.id,
    return_code: result.return_code,
    order_id: order.id,
    receipt_code: order.receipt_code,
    type,
    refund_amount,
    extra_amount,
    method: payMethod,
    restock: shouldRestock
  });
}

module.exports = { create };
