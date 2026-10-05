const { allQuery, getQuery } = require('../db');
const { n } = require('../utils/http');

const TODAY = 'DATE(created_at) = CURRENT_DATE';
const LIVE = 'COALESCE(voided, 0) = 0';
const OLIVE = 'COALESCE(o.voided, 0) = 0';
const CLOSE_COLS = `dc.id, dc.user_id, u.username as cashier_name, dc.business_date, dc.closed_at, dc.sales_count, dc.sales_total, dc.items_sold, dc.opening_float, dc.cash_sales, dc.cash_refunds, dc.cash_extras, dc.expected_cash, dc.counted_cash, dc.variance`;

const money = (value) => Math.round(n(value) * 100) / 100;

async function loadCashDrawer(userId) {
  const empty = { cash_sales: 0, cash_refunds: 0, cash_extras: 0, suggested_float: 0 };
  if (!userId) return empty;
  try {
    const cashRow = await getQuery(
      `SELECT COALESCE(SUM(p.amount), 0) as cash_sales FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.user_id = ? AND DATE(o.created_at) = CURRENT_DATE AND o.close_id IS NULL AND ${OLIVE} AND p.method = 'Cash'`,
      [userId]
    );
    const lastClosed = await getQuery(
      `SELECT closed_at, counted_cash FROM day_closes WHERE user_id = ? ORDER BY closed_at DESC LIMIT 1`,
      [userId]
    );
    const retRow = lastClosed?.closed_at
      ? await getQuery(
        `SELECT COALESCE(SUM(refund_amount), 0) as refunds, COALESCE(SUM(extra_amount), 0) as extras FROM returns WHERE user_id = ? AND method = 'Cash' AND DATE(created_at) = CURRENT_DATE AND created_at > ?`,
        [userId, lastClosed.closed_at]
      )
      : await getQuery(
        `SELECT COALESCE(SUM(refund_amount), 0) as refunds, COALESCE(SUM(extra_amount), 0) as extras FROM returns WHERE user_id = ? AND method = 'Cash' AND DATE(created_at) = CURRENT_DATE`,
        [userId]
      );
    return {
      cash_sales: money(cashRow?.cash_sales),
      cash_refunds: money(retRow?.refunds),
      cash_extras: money(retRow?.extras),
      suggested_float: money(lastClosed?.counted_cash)
    };
  } catch {
    return empty;
  }
}

async function loadReturnTotals(userId) {
  try {
    const [today, profit, items, shift] = await Promise.all([
      getQuery(`SELECT COUNT(id) as count, COALESCE(SUM(refund_amount), 0) as refunds, COALESCE(SUM(extra_amount), 0) as extras FROM returns WHERE ${TODAY}`),
      getQuery(`SELECT COALESCE(SUM(CASE WHEN ri.kind = 'returned' THEN (ri.unit_price - ri.unit_cost) * ri.quantity ELSE 0 END), 0) as lost, COALESCE(SUM(CASE WHEN ri.kind = 'taken' THEN (ri.unit_price - ri.unit_cost) * ri.quantity ELSE 0 END), 0) as gained FROM return_items ri JOIN returns r ON r.id = ri.return_id WHERE DATE(r.created_at) = CURRENT_DATE`),
      getQuery(`SELECT COALESCE(SUM(CASE WHEN ri.kind = 'returned' THEN ri.quantity ELSE 0 END), 0) as returned_qty, COALESCE(SUM(CASE WHEN ri.kind = 'taken' THEN ri.quantity ELSE 0 END), 0) as taken_qty FROM return_items ri JOIN returns r ON r.id = ri.return_id WHERE DATE(r.created_at) = CURRENT_DATE`),
      userId
        ? getQuery(`SELECT COALESCE(SUM(refund_amount), 0) as refunds, COALESCE(SUM(extra_amount), 0) as extras FROM returns WHERE user_id = ? AND ${TODAY}`, [userId])
        : { refunds: 0, extras: 0 }
    ]);
    const recent = await allQuery(
      `SELECT r.id, r.return_code, r.type, r.refund_amount, r.extra_amount, r.created_at, o.receipt_code, u.username
       FROM returns r LEFT JOIN orders o ON o.id = r.order_id LEFT JOIN users u ON u.id = r.user_id
       ORDER BY r.created_at DESC LIMIT 8`
    );
    return { today, profit, items, shift, recent };
  } catch {
    return {
      today: { count: 0, refunds: 0, extras: 0 },
      profit: { lost: 0, gained: 0 },
      items: { returned_qty: 0, taken_qty: 0 },
      shift: { refunds: 0, extras: 0 },
      recent: []
    };
  }
}

async function loadDashboard(userId) {
  const [
    todayRow, profitRow, itemsRow, inventoryRow, payments, lowStock, recentOrders,
    topProducts, cashiers, shiftRow, shiftItemsRow, shiftPayments, myOrders,
    dayCloses, closedOrders, lastClose, openShift
  ] = await Promise.all([
    getQuery(`SELECT COALESCE(SUM(total_amount), 0) as sales, COUNT(id) as transactions, COALESCE(SUM(vat_amount), 0) as vat FROM orders WHERE ${TODAY} AND ${LIVE}`),
    getQuery(`SELECT COALESCE(SUM(oi.subtotal - oi.unit_cost * oi.quantity), 0) as profit FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE DATE(o.created_at) = CURRENT_DATE AND ${OLIVE}`),
    getQuery(`SELECT COALESCE(SUM(oi.quantity), 0) as items_sold FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE DATE(o.created_at) = CURRENT_DATE AND ${OLIVE}`),
    getQuery(`SELECT COALESCE(SUM(CASE WHEN stock_quantity <= 0 THEN 1 ELSE 0 END), 0) as out_of_stock, COALESCE(SUM(CASE WHEN stock_quantity > 0 AND stock_quantity <= min_stock_level THEN 1 ELSE 0 END), 0) as low_stock FROM products`),
    allQuery(`SELECT p.method, SUM(p.amount) as total_amount FROM payments p JOIN orders o ON o.id = p.order_id WHERE DATE(o.created_at) = CURRENT_DATE AND ${OLIVE} GROUP BY p.method`),
    allQuery(`SELECT id, name, stock_quantity, min_stock_level, size, color FROM products WHERE stock_quantity <= min_stock_level ORDER BY stock_quantity ASC, name ASC LIMIT 12`),
    allQuery(`SELECT o.id, o.customer_name, o.total_amount, o.created_at, o.receipt_code, o.voided, u.username, (SELECT method FROM payments pay WHERE pay.order_id = o.id LIMIT 1) as method FROM orders o LEFT JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC LIMIT 8`),
    allQuery(`SELECT p.name, SUM(oi.quantity) as qty, SUM(oi.subtotal) as revenue FROM order_items oi JOIN products p ON p.id = oi.product_id JOIN orders o ON o.id = oi.order_id WHERE DATE(o.created_at) = CURRENT_DATE AND ${OLIVE} GROUP BY p.name ORDER BY revenue DESC LIMIT 5`),
    allQuery(`SELECT u.username as cashier_name, COUNT(o.id) as total_transactions, COALESCE(SUM(o.total_amount), 0) as total_revenue, COALESCE(SUM(CASE WHEN o.close_id IS NOT NULL THEN 1 ELSE 0 END), 0) as closed_transactions, COALESCE(SUM(CASE WHEN o.close_id IS NOT NULL THEN o.total_amount ELSE 0 END), 0) as closed_revenue, COALESCE(SUM(CASE WHEN o.close_id IS NULL THEN 1 ELSE 0 END), 0) as open_transactions FROM orders o JOIN users u ON o.user_id = u.id WHERE DATE(o.created_at) = CURRENT_DATE AND ${OLIVE} GROUP BY u.id, u.username ORDER BY total_revenue DESC`),
    userId ? getQuery(`SELECT COALESCE(SUM(total_amount), 0) as sales, COUNT(id) as transactions FROM orders WHERE user_id = ? AND ${TODAY} AND ${LIVE}`, [userId]) : { sales: 0, transactions: 0 },
    userId ? getQuery(`SELECT COALESCE(SUM(oi.quantity), 0) as items_sold FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.user_id = ? AND DATE(o.created_at) = CURRENT_DATE AND ${OLIVE}`, [userId]) : { items_sold: 0 },
    userId ? allQuery(`SELECT p.method, SUM(p.amount) as total_amount FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.user_id = ? AND DATE(o.created_at) = CURRENT_DATE AND ${OLIVE} GROUP BY p.method`, [userId]) : [],
    userId ? allQuery(`SELECT o.id, o.customer_name, o.total_amount, o.created_at, o.receipt_code, o.close_id, o.voided, u.username, (SELECT method FROM payments pay WHERE pay.order_id = o.id LIMIT 1) as method FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 12`, [userId]) : [],
    allQuery(`SELECT ${CLOSE_COLS} FROM day_closes dc JOIN users u ON u.id = dc.user_id WHERE dc.business_date = CURRENT_DATE OR DATE(dc.closed_at) = CURRENT_DATE ORDER BY dc.closed_at DESC`),
    allQuery(`SELECT o.id, o.customer_name, o.total_amount, o.created_at, o.receipt_code, o.close_id, u.username, dc.closed_at, (SELECT method FROM payments pay WHERE pay.order_id = o.id LIMIT 1) as method FROM orders o JOIN users u ON o.user_id = u.id JOIN day_closes dc ON dc.id = o.close_id WHERE DATE(o.created_at) = CURRENT_DATE OR DATE(dc.closed_at) = CURRENT_DATE ORDER BY dc.closed_at DESC, o.created_at DESC LIMIT 40`),
    userId ? getQuery(`SELECT ${CLOSE_COLS} FROM day_closes dc JOIN users u ON u.id = dc.user_id WHERE dc.user_id = ? AND (dc.business_date = CURRENT_DATE OR DATE(dc.closed_at) = CURRENT_DATE) ORDER BY dc.closed_at DESC LIMIT 1`, [userId]) : null,
    userId ? getQuery(`SELECT COALESCE(SUM(total_amount), 0) as sales, COUNT(id) as transactions FROM orders WHERE user_id = ? AND ${TODAY} AND close_id IS NULL AND ${LIVE}`, [userId]) : { sales: 0, transactions: 0 }
  ]);
  const drawer = await loadCashDrawer(userId);
  const returns = await loadReturnTotals(userId);
  let voids = { count: 0, total: 0, recent: [] };
  try {
    const voidRow = await getQuery(`SELECT COUNT(v.id) as count, COALESCE(SUM(o.total_amount), 0) as total FROM voids v JOIN orders o ON o.id = v.order_id WHERE DATE(v.created_at) = CURRENT_DATE`);
    voids = {
      count: n(voidRow?.count),
      total: n(voidRow?.total),
      recent: await allQuery(
        `SELECT v.id, v.reason, v.created_at, o.receipt_code, o.total_amount, u.username
         FROM voids v LEFT JOIN orders o ON o.id = v.order_id LEFT JOIN users u ON u.id = v.user_id
         ORDER BY v.created_at DESC LIMIT 8`
      )
    };
  } catch {}

  const sales = n(todayRow?.sales) - n(returns.today?.refunds) + n(returns.today?.extras);
  const transactions = n(todayRow?.transactions);
  const shiftSales = n(shiftRow?.sales) - n(returns.shift?.refunds) + n(returns.shift?.extras);
  const shiftTxns = n(shiftRow?.transactions);
  const itemsSold = n(itemsRow?.items_sold) - n(returns.items?.returned_qty) + n(returns.items?.taken_qty);
  const shiftItems = n(shiftItemsRow?.items_sold);

  return {
    today: {
      sales, transactions,
      profit: n(profitRow?.profit) - n(returns.profit?.lost) + n(returns.profit?.gained),
      items_sold: itemsSold,
      avg_ticket: transactions ? sales / transactions : 0,
      low_stock: n(inventoryRow?.low_stock),
      out_of_stock: n(inventoryRow?.out_of_stock),
      vat: n(todayRow?.vat)
    },
    shift: { sales: shiftSales, transactions: shiftTxns, items_sold: shiftItems, avg_ticket: shiftTxns ? shiftSales / shiftTxns : 0 },
    payments, shift_payments: shiftPayments, low_stock: lowStock, recent_orders: recentOrders, my_orders: myOrders, top_products: topProducts, cashiers,
    day_closes: dayCloses, closed_orders: closedOrders, last_close: lastClose || null,
    open_shift: {
      sales: n(openShift?.sales),
      transactions: n(openShift?.transactions),
      cash_sales: drawer.cash_sales,
      cash_refunds: drawer.cash_refunds,
      cash_extras: drawer.cash_extras
    },
    suggested_float: drawer.suggested_float,
    returns: {
      count: n(returns.today?.count),
      refunds: n(returns.today?.refunds),
      extras: n(returns.today?.extras),
      recent: returns.recent || []
    },
    voids
  };
}

module.exports = { loadDashboard, loadCashDrawer, money };
