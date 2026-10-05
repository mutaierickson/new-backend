const customerModel = require('../models/customerModel');
const auditModel = require('../models/auditModel');

async function list(_req, res) {
  res.json(await customerModel.listCustomers());
}

async function create(req, res) {
  const { name, phone, user_id } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });
  const customer = await customerModel.upsertCustomer(name, phone);
  await auditModel.log(user_id, 'Save Customer', { id: customer.id, phone: customer.phone, name: name || null });
  res.status(customer.created ? 201 : 200).json(await customerModel.findById(customer.id));
}

async function remove(req, res) {
  await customerModel.remove(req.params.id);
  await auditModel.log(req.query.user_id, 'Delete Customer', { id: req.params.id });
  res.json({ success: true });
}

module.exports = { list, create, remove };
