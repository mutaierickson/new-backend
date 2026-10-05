const userModel = require('../models/userModel');
const auditModel = require('../models/auditModel');
const { hashPassword } = require('../utils/password');

async function list(_req, res) {
  res.json(await userModel.list());
}

async function create(req, res) {
  const { username, password, role, admin_id } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  const id = await userModel.create({ username, passwordHash: await hashPassword(password), role });
  await auditModel.log(admin_id, 'Create User', { id, username, role });
  res.status(201).json({ id, success: true });
}

async function remove(req, res) {
  await userModel.remove(req.params.id);
  await auditModel.log(req.query.admin_id, 'Delete User', { id: req.params.id });
  res.json({ success: true });
}

module.exports = { list, create, remove };
