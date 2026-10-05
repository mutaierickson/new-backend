const { allQuery, getQuery, withTransaction } = require('../db');
const { makeReturnCode } = require('../utils/receiptCode');

const returnedQtySql = `(SELECT COALESCE(SUM(ri.quantity), 0) FROM return_items ri WHERE ri.order_item_id = oi.id AND ri.kind = 'returned')`;

async function loadOrderLines(orderId) {
  try {
    return await allQuery(
      `SELECT oi.id as order_item_id, oi.product_id, oi.quantity, oi.unit_price as price, oi.unit_cost, oi.subtotal,
              p.name, p.size, p.color, ${returnedQtySql} as returned_qty
       FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`,
      [orderId]
    );
  } catch {
    const rows = await allQuery(
      `SELECT oi.id as order_item_id, oi.product_id, oi.quantity, oi.unit_price as price, oi.unit_cost, oi.subtotal,
              p.name, p.size, p.color
       FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`,
      [orderId]
    );
    return rows.map((row) => ({ ...row, returned_qty: 0 }));
  }
}

async function loadOrderReturns(orderId) {
  try {
    const headers = await allQuery(
      `SELECT r.id, r.return_code, r.type, r.refund_amount, r.extra_amount, r.method, r.reason, r.restock, r.created_at, u.username
       FROM returns r LEFT JOIN users u ON u.id = r.user_id WHERE r.order_id = ? ORDER BY r.created_at DESC`,
      [orderId]
    );
    const items = await allQuery(
      `SELECT ri.return_id, ri.kind, ri.quantity, ri.unit_price, ri.product_id, p.name, p.size, p.color
       FROM return_items ri LEFT JOIN products p ON p.id = ri.product_id
       WHERE ri.return_id IN (SELECT id FROM returns WHERE order_id = ?)`,
      [orderId]
    );
    return headers.map((row) => ({
      ...row,
      items: items.filter((item) => item.return_id === row.id)
    }));
  } catch {
    return [];
  }
}

function findOrder({ orderId, receiptCode }) {
  if (orderId) return getQuery(`SELECT id, receipt_code, customer_name FROM orders WHERE id = ?`, [orderId]);
  if (receiptCode) {
    return getQuery(`SELECT id, receipt_code, customer_name FROM orders WHERE UPPER(receipt_code) = ?`, [String(receiptCode).trim().toUpperCase()]);
  }
  return null;
}

async function isOrderVoided(orderId) {
  const row = await getQuery(`SELECT COALESCE(voided, 0) as voided FROM orders WHERE id = ?`, [orderId]);
  return Boolean(Number(row?.voided || 0));
}

async function countForOrder(orderId) {
  const row = await getQuery(`SELECT COUNT(id) as count FROM returns WHERE order_id = ?`, [orderId]);
  return Number(row?.count || 0);
}

function create({ orderId, userId, type, refundAmount, extraAmount, method, reason, restock, returnedRows, takenRows }) {
  return withTransaction(async (exec) => {
    const inserted = await exec(
      `INSERT INTO returns (order_id, user_id, type, refund_amount, extra_amount, method, reason, restock) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [orderId, userId, type, refundAmount, extraAmount, method, reason || null, restock ? 1 : 0]
    );
    const id = inserted.id;
    if (!id) throw new Error('Could not record the return');
    const return_code = makeReturnCode(id);
    await exec(`UPDATE returns SET return_code = ? WHERE id = ?`, [return_code, id]);

    for (const row of returnedRows) {
      await exec(
        `INSERT INTO return_items (return_id, order_item_id, product_id, quantity, unit_price, unit_cost, kind) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, row.line.order_item_id, row.line.product_id, row.qty, row.line.price, row.line.unit_cost || 0, 'returned']
      );
      if (restock && row.line.product_id) {
        await exec(`UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?`, [row.qty, row.line.product_id]);
      }
    }

    for (const row of takenRows) {
      const stockResult = await exec(
        `UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity >= ?`,
        [row.qty, row.product.id, row.qty]
      );
      if (!stockResult.changes) throw new Error(`Not enough stock for ${row.product.name}`);
      await exec(
        `INSERT INTO return_items (return_id, order_item_id, product_id, quantity, unit_price, unit_cost, kind) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, null, row.product.id, row.qty, row.price, row.cost, 'taken']
      );
    }

    return { id, return_code };
  });
}

module.exports = { loadOrderLines, loadOrderReturns, findOrder, isOrderVoided, countForOrder, create };
