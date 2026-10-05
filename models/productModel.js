const { allQuery, getQuery, runQuery } = require('../db');

function list(categoryId) {
  const params = [];
  let query = 'SELECT * FROM products WHERE 1=1';
  if (categoryId) {
    query += ' AND category_id = ?';
    params.push(categoryId);
  }
  return allQuery(`${query} ORDER BY name`, params);
}

function findById(id) {
  return getQuery(`SELECT id, name, price, cost, stock_quantity FROM products WHERE id = ?`, [id]);
}

function findByBarcode(code, exceptId) {
  return exceptId
    ? getQuery(`SELECT id, name FROM products WHERE UPPER(barcode) = ? AND id <> ?`, [code, exceptId])
    : getQuery(`SELECT id, name FROM products WHERE UPPER(barcode) = ?`, [code]);
}

async function create({ name, category_id, price, cost, stock_quantity, size, color, barcode }) {
  const result = await runQuery(
    `INSERT INTO products (name, category_id, price, cost, stock_quantity, size, color, barcode) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [name, category_id, price, cost, stock_quantity, size, color, barcode]
  );
  return result.id;
}

function update(id, { name, category_id, price, cost, stock_quantity, size, color, barcode }) {
  return runQuery(
    `UPDATE products SET name = $1, category_id = $2, price = $3, cost = $4, stock_quantity = $5, size = $6, color = $7, barcode = $8 WHERE id = $9`,
    [name, category_id, price, cost ?? 0, stock_quantity, size, color, barcode, id]
  );
}

function remove(id) {
  return runQuery(`DELETE FROM products WHERE id = ?`, [id]);
}

module.exports = { list, findById, findByBarcode, create, update, remove };
