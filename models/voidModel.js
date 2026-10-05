const { getQuery, withTransaction } = require('../db');
const { n } = require('../utils/http');

function findOrder(orderId) {
  return getQuery(
    `SELECT id, user_id, receipt_code, total_amount, created_at, COALESCE(voided, 0) as voided FROM orders WHERE id = ?`,
    [orderId]
  );
}

async function isFromToday(orderId) {
  return Boolean(await getQuery(`SELECT id FROM orders WHERE id = ? AND DATE(created_at) = CURRENT_DATE`, [orderId]));
}

function create({ orderId, userId, reason, restock, lines }) {
  return withTransaction(async (exec) => {
    if (restock) {
      for (const line of lines) {
        const qty = Math.max(0, n(line.quantity) - n(line.returned_qty));
        if (qty && line.product_id) {
          await exec(`UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?`, [qty, line.product_id]);
        }
      }
    }
    await exec(`UPDATE orders SET voided = 1 WHERE id = ?`, [orderId]);
    const inserted = await exec(
      `INSERT INTO voids (order_id, user_id, reason, restock) VALUES (?, ?, ?, ?) RETURNING id`,
      [orderId, userId, reason, restock ? 1 : 0]
    );
    return { id: inserted.id };
  });
}

module.exports = { findOrder, isFromToday, create };
