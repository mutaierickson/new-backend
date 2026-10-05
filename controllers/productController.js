const productModel = require('../models/productModel');
const auditModel = require('../models/auditModel');
const { normalizeBarcode } = require('../utils/barcode');

const isUniqueViolation = (err) => /unique|duplicate/i.test(err.message || '');

async function takenBarcode(barcode, exceptId) {
  const code = normalizeBarcode(barcode);
  if (!code) return { code: null };
  const conflict = await productModel.findByBarcode(code, exceptId);
  return conflict ? { code, conflict } : { code };
}

async function list(req, res) {
  res.json(await productModel.list(req.query.category_id));
}

async function create(req, res) {
  const { name, category_id, price, cost, stock_quantity, size, color, user_id } = req.body;
  const { code, conflict } = await takenBarcode(req.body.barcode);
  if (conflict) return res.status(400).json({ error: `${conflict.name} already uses this barcode` });
  let id;
  try {
    id = await productModel.create({ name, category_id, price, cost, stock_quantity, size, color, barcode: code });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(400).json({ error: 'That barcode is already in use' });
    throw err;
  }
  await auditModel.log(user_id, 'Create Product', { id, name, price, stock_quantity, barcode: code });
  res.status(201).json({ id });
}

async function update(req, res) {
  const { name, category_id, price, cost, stock_quantity, size, color, user_id } = req.body;
  const { code, conflict } = await takenBarcode(req.body.barcode, req.params.id);
  if (conflict) return res.status(400).json({ error: `${conflict.name} already uses this barcode` });
  let result;
  try {
    result = await productModel.update(req.params.id, { name, category_id, price, cost, stock_quantity, size, color, barcode: code });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(400).json({ error: 'That barcode is already in use' });
    throw err;
  }
  await auditModel.log(user_id, 'Update Product', { id: req.params.id, name, price, cost, stock_quantity, barcode: code });
  res.json({ success: true, cost, changes: result.changes });
}

async function remove(req, res) {
  await productModel.remove(req.params.id);
  await auditModel.log(req.query.user_id, 'Delete Product', { id: req.params.id });
  res.json({ success: true });
}

module.exports = { list, create, update, remove };
