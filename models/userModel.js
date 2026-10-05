const { allQuery, getQuery, runQuery } = require('../db');

function findById(id) {
  return getQuery(`SELECT id, role FROM users WHERE id = ?`, [id]);
}

function findByUsername(username) {
  return getQuery('SELECT id, username, role, password_hash FROM users WHERE username = $1', [username]);
}

function updatePasswordHash(id, passwordHash) {
  return runQuery(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, id]);
}

function list() {
  return allQuery('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC');
}

async function create({ username, passwordHash, role }) {
  const result = await runQuery(
    `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id`,
    [username, passwordHash, role]
  );
  return result.id;
}

function remove(id) {
  return runQuery(`DELETE FROM users WHERE id = $1`, [id]);
}

module.exports = { findById, findByUsername, updatePasswordHash, list, create, remove };
