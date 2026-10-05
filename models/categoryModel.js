const { allQuery, runQuery } = require('../db');

function list() {
  return allQuery('SELECT * FROM categories ORDER BY name');
}

async function create(name) {
  const result = await runQuery(`INSERT INTO categories (name) VALUES (?) RETURNING id`, [name]);
  return result.id;
}

function update(id, name) {
  return runQuery(`UPDATE categories SET name = ? WHERE id = ?`, [name, id]);
}

function remove(id) {
  return runQuery(`DELETE FROM categories WHERE id = ?`, [id]);
}

module.exports = { list, create, update, remove };
