const { allQuery, getQuery, runQuery, withTransaction } = require('../db');
const { makeReceiptCode } = require('../utils/receiptCode');

const ORDER_COLS = `o.id, o.user_id, o.customer_name, o.total_amount, o.created_at, o.receipt_code, o.voided, o.vat_rate, o.vat_amount, u.username`;

function create({ userId, customerName, customerPhone, totalAmount, vat, items, payments }) {
  return withTransaction(async (exec) => {
    const orderResult = await exec(
      `INSERT INTO orders (user_id, customer_name, customer_phone, total_amount, status, vat_rate, vat_amount) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [userId, customerName, customerPhone, totalAmount, 'Closed', vat.rate, vat.vat_amount]
    );
    const id = orderResult.id;
    const receipt_code = makeReceiptCode(id);
    await exec(`UPDATE orders SET receipt_code = ? WHERE id = ?`, [receipt_code, id]);
    await exec(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price, unit_cost, subtotal) VALUES ${items.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}`,
      items.flatMap((item) => [id, item.product_id, item.quantity, item.unit_price, item.unit_cost || 0, item.subtotal])
    );
    for (const item of items) {
      const stockResult = await exec(
        `UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity >= ?`,
        [item.quantity, item.product_id, item.quantity]
      );
      if (!stockResult.changes) throw new Error('Insufficient stock for one or more items');
    }
    if (payments.length) {
      await exec(
        `INSERT INTO payments (order_id, amount, method) VALUES ${payments.map(() => '(?, ?, ?)').join(', ')}`,
        payments.flatMap((pay) => [id, pay.amount, pay.method])
      );
    }
    return { id, receipt_code };
  });
}

function setCustomerPhone(id, phone) {
  return runQuery(`UPDATE orders SET customer_phone = ? WHERE id = ?`, [phone, id]);
}

function findByLookup(lookup) {
  return lookup.id
    ? getQuery(`SELECT ${ORDER_COLS} FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = ?`, [lookup.id])
    : getQuery(`SELECT ${ORDER_COLS} FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE UPPER(o.receipt_code) = ?`, [lookup.code]);
}

function findPayments(orderId) {
  return allQuery(`SELECT method, amount FROM payments WHERE order_id = ?`, [orderId]);
}

module.exports = { create, setCustomerPhone, findByLookup, findPayments };
