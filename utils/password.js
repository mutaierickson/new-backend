const bcrypt = require('bcryptjs');

const isHashed = (value) => /^\$2[aby]\$/.test(String(value || ''));

const hashPassword = (plain) => bcrypt.hash(String(plain), 10);

const passwordsMatch = async (plain, stored) => {
  if (!plain || stored == null) return false;
  if (isHashed(stored)) return bcrypt.compare(String(plain), stored);
  return String(plain) === String(stored);
};

module.exports = { isHashed, hashPassword, passwordsMatch };
