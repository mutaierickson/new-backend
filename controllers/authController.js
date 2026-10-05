const userModel = require('../models/userModel');
const auditModel = require('../models/auditModel');
const { hashPassword, passwordsMatch, isHashed } = require('../utils/password');

async function login(req, res) {
  const { username, password } = req.body;
  const user = await userModel.findByUsername(username);
  if (!user || !(await passwordsMatch(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  if (!isHashed(user.password_hash)) {
    await userModel.updatePasswordHash(user.id, await hashPassword(password));
  }
  await auditModel.log(user.id, 'User Login', { username });
  res.json({ id: user.id, username: user.username, role: user.role });
}

module.exports = { login };
