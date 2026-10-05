const { n } = require('../utils/http');
const stockModel = require('../models/stockModel');
const auditModel = require('../models/auditModel');

async function list(_req, res) {
  res.json(await stockModel.list());
}

async function create(req, res) {
  const userId = Number(req.body?.user_id);
  const productId = Number(req.body?.product_id);
  const quantity = Math.floor(n(req.body?.quantity));
  const unitCost = n(req.body?.unit_cost);
  const note = String(req.body?.note || '').trim() || null;

  if (!userId) return res.status(400).json({ error: 'user_id is required' });
  if (!productId) return res.status(400).json({ error: 'product_id is required' });
  if (quantity < 1) return res.status(400).json({ error: 'Quantity must be at least 1' });
  if (unitCost < 0) return res.status(400).json({ error: 'Unit cost cannot be negative' });

  const product = await stockModel.findProduct(productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const intake = await stockModel.create({ userId, productId, quantity, unitCost, note });
  await auditModel.log(userId, 'STOCK_INTAKE', {
    product_id: productId,
    name: product.name,
    quantity,
    unit_cost: unitCost,
    note
  });
  res.status(201).json(intake);
}

module.exports = { list, create };
