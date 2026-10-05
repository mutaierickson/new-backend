const categoryModel = require('../models/categoryModel');
const auditModel = require('../models/auditModel');

async function list(_req, res) {
  res.json(await categoryModel.list());
}

async function create(req, res) {
  const { name, user_id } = req.body;
  const id = await categoryModel.create(name);
  await auditModel.log(user_id, 'Create Category', { id, name });
  res.status(201).json({ id });
}

async function update(req, res) {
  const { name, user_id } = req.body;
  await categoryModel.update(req.params.id, name);
  await auditModel.log(user_id, 'Update Category', { id: req.params.id, name });
  res.json({ success: true });
}

async function remove(req, res) {
  await categoryModel.remove(req.params.id);
  await auditModel.log(req.query.user_id, 'Delete Category', { id: req.params.id });
  res.json({ success: true });
}

module.exports = { list, create, update, remove };
