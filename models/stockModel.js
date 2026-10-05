const { allQuery, getQuery, runQuery } = require('../db');

async function list() {
  return allQuery(
    `SELECT s.id, s.product_id, s.user_id, s.quantity, s.unit_cost, s.note, s.created_at, p.name, p.size, p.color, u.username
     FROM stock_intakes s
     LEFT JOIN products p ON p.id = s.product_id
     LEFT JOIN users u ON u.id = s.user_id
     ORDER BY s.created_at DESC LIMIT 40`
  );
}

function findProduct(productId) {
  return getQuery(`SELECT id, name, cost FROM products WHERE id = ?`, [productId]);
}

async function create({ userId, productId, quantity, unitCost, note }) {
  const inserted = await runQuery(
    `INSERT INTO stock_intakes (product_id, user_id, quantity, unit_cost, note) VALUES (?, ?, ?, ?, ?) RETURNING id`,
    [productId, userId, quantity, unitCost, note]
  );
  await runQuery(`UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?`, [quantity, productId]);
  if (unitCost > 0) {
    await runQuery(`UPDATE products SET cost = ? WHERE id = ?`, [unitCost, productId]);
  }
  return getQuery(
    `SELECT s.id, s.product_id, s.quantity, s.unit_cost, s.note, s.created_at, p.name FROM stock_intakes s LEFT JOIN products p ON p.id = s.product_id WHERE s.id = ?`,
    [inserted.id]
  );
}

module.exports = { list, findProduct, create };
