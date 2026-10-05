const { allQuery } = require('../db');

const LIVE = 'COALESCE(voided, 0) = 0';
const OLIVE = 'COALESCE(o.voided, 0) = 0';

const PERIOD_SQL = {
  weekly: "TO_CHAR(created_at, 'YYYY-WW')",
  monthly: "TO_CHAR(created_at, 'YYYY-MM')",
  yearly: "TO_CHAR(created_at, 'YYYY')"
};

function daily() {
  return allQuery(`SELECT 'Store' as outlet_name, SUM(total_amount) as total_sales, COUNT(id) as transaction_count, COALESCE(SUM(vat_amount), 0) as total_vat FROM orders WHERE DATE(created_at) = CURRENT_DATE AND ${LIVE}`);
}

function payments() {
  return allQuery(`SELECT p.method, SUM(p.amount) as total_amount FROM payments p JOIN orders o ON o.id = p.order_id WHERE DATE(o.created_at) = CURRENT_DATE AND ${OLIVE} GROUP BY p.method`);
}

function sales(period) {
  const dateStr = PERIOD_SQL[period] || 'DATE(created_at)';
  return allQuery(
    `SELECT ${dateStr} as period, SUM(total_amount) as total_sales, COUNT(id) as transaction_count, COALESCE(SUM(vat_amount), 0) as total_vat FROM orders WHERE ${LIVE} GROUP BY ${dateStr} ORDER BY ${dateStr} DESC`
  );
}

function categories() {
  return allQuery(
    `SELECT c.name as category_name, SUM(oi.quantity) as items_sold, SUM(oi.subtotal) as total_revenue FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN categories c ON p.category_id = c.id JOIN orders o ON o.id = oi.order_id WHERE ${OLIVE} GROUP BY c.id, c.name ORDER BY total_revenue DESC`
  );
}

function cashiers() {
  return allQuery(
    `SELECT u.username as cashier_name, COUNT(o.id) as total_transactions, SUM(o.total_amount) as total_revenue FROM orders o JOIN users u ON o.user_id = u.id WHERE ${OLIVE} GROUP BY u.id, u.username ORDER BY total_revenue DESC`
  );
}

function profit() {
  return allQuery(
    `SELECT SUM(oi.subtotal) as total_revenue, SUM(oi.unit_cost * oi.quantity) as total_cogs, (SUM(oi.subtotal) - SUM(oi.unit_cost * oi.quantity)) as gross_profit, (SELECT COALESCE(SUM(vat_amount), 0) FROM orders WHERE ${LIVE}) as total_vat FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE ${OLIVE}`
  );
}

module.exports = { daily, payments, sales, categories, cashiers, profit };
