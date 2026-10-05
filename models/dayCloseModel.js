const { allQuery, getQuery, withTransaction } = require('../db');
const { n } = require('../utils/http');

function findOpenOrders(userId) {
  return allQuery(
    `SELECT id, total_amount FROM orders WHERE user_id = ? AND DATE(created_at) = CURRENT_DATE AND close_id IS NULL AND COALESCE(voided, 0) = 0`,
    [userId]
  );
}

async function countOpenItemsSold(userId) {
  const row = await getQuery(
    `SELECT COALESCE(SUM(oi.quantity), 0) as items_sold FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.user_id = ? AND DATE(o.created_at) = CURRENT_DATE AND o.close_id IS NULL AND COALESCE(o.voided, 0) = 0`,
    [userId]
  );
  return n(row?.items_sold);
}

function create({ userId, orderIds, salesCount, salesTotal, itemsSold, openingFloat, drawer, expectedCash, countedCash, variance }) {
  return withTransaction(async (exec) => {
    const inserted = await exec(
      `INSERT INTO day_closes (user_id, business_date, sales_count, sales_total, items_sold, opening_float, cash_sales, cash_refunds, cash_extras, expected_cash, counted_cash, variance) VALUES (?, CURRENT_DATE, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [userId, salesCount, salesTotal, itemsSold, openingFloat, drawer.cash_sales, drawer.cash_refunds, drawer.cash_extras, expectedCash, countedCash, variance]
    );
    if (!inserted.id) throw new Error('Could not record the day close');
    await exec(`UPDATE orders SET close_id = ? WHERE id IN (${orderIds.map(() => '?').join(',')})`, [inserted.id, ...orderIds]);
    return { id: inserted.id };
  });
}

function findById(id) {
  return getQuery(
    `SELECT dc.id, dc.user_id, u.username as cashier_name, dc.business_date, dc.closed_at, dc.sales_count, dc.sales_total, dc.items_sold, dc.opening_float, dc.cash_sales, dc.cash_refunds, dc.cash_extras, dc.expected_cash, dc.counted_cash, dc.variance FROM day_closes dc JOIN users u ON u.id = dc.user_id WHERE dc.id = ?`,
    [id]
  );
}

module.exports = { findOpenOrders, countOpenItemsSold, create, findById };
