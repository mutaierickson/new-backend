const voidModel = require('../models/voidModel');
const userModel = require('../models/userModel');
const returnModel = require('../models/returnModel');
const auditModel = require('../models/auditModel');
const { n } = require('../utils/http');

const MANAGER_ROLES = ['Admin', 'Manager', 'Outlet Manager'];

async function create(req, res) {
  const userId = Number(req.body?.user_id);
  const orderId = Number(req.body?.order_id);
  const reason = String(req.body?.reason || '').trim();
  const restock = req.body?.restock !== false;
  if (!userId) return res.status(400).json({ error: 'user_id is required' });
  if (!orderId) return res.status(400).json({ error: 'order_id is required' });
  if (!reason) return res.status(400).json({ error: 'A void reason is required' });

  const actor = await userModel.findById(userId);
  if (!actor) return res.status(400).json({ error: 'User not found' });

  const order = await voidModel.findOrder(orderId);
  if (!order) return res.status(404).json({ error: 'Receipt not found' });
  if (n(order.voided)) return res.status(400).json({ error: 'This sale is already voided' });

  if (!MANAGER_ROLES.includes(String(actor.role || ''))) {
    if (Number(order.user_id) !== userId) return res.status(403).json({ error: 'Cashiers can only void their own sales' });
    if (!(await voidModel.isFromToday(orderId))) return res.status(403).json({ error: 'Cashiers can only void a sale from today' });
  }

  if (await returnModel.countForOrder(orderId)) {
    return res.status(400).json({ error: 'This receipt already has a return. Reverse the remainder there instead of voiding.' });
  }

  const lines = await returnModel.loadOrderLines(orderId);
  const result = await voidModel.create({ orderId, userId, reason, restock, lines });

  await auditModel.log(userId, 'VOID_SALE', {
    void_id: result.id, order_id: orderId, receipt_code: order.receipt_code, total_amount: order.total_amount, reason, restock
  });
  res.json({
    id: result.id,
    order_id: orderId,
    receipt_code: order.receipt_code,
    restock,
    success: true
  });
}

module.exports = { create };
