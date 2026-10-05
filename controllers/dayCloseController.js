const dayCloseModel = require('../models/dayCloseModel');
const auditModel = require('../models/auditModel');
const { loadCashDrawer, money } = require('../models/dashboardModel');
const { n } = require('../utils/http');

async function create(req, res) {
  const userId = Number(req.body?.user_id);
  if (!userId) return res.status(400).json({ error: 'user_id is required' });
  const openOrders = await dayCloseModel.findOpenOrders(userId);
  if (!openOrders.length) return res.status(400).json({ error: 'No open sales to close for today' });
  if (req.body?.counted_cash === undefined || req.body?.counted_cash === null || req.body?.counted_cash === '') {
    return res.status(400).json({ error: 'Counted cash is required' });
  }
  const openingFloat = money(req.body.opening_float);
  const countedCash = money(req.body.counted_cash);
  if (openingFloat < 0 || countedCash < 0) return res.status(400).json({ error: 'Cash amounts cannot be negative' });

  const drawer = await loadCashDrawer(userId);
  const expectedCash = money(openingFloat + drawer.cash_sales + drawer.cash_extras - drawer.cash_refunds);
  const variance = money(countedCash - expectedCash);
  const itemsSold = await dayCloseModel.countOpenItemsSold(userId);
  const salesCount = openOrders.length;
  const salesTotal = openOrders.reduce((sum, order) => sum + n(order.total_amount), 0);

  const close = await dayCloseModel.create({
    userId,
    orderIds: openOrders.map((order) => order.id),
    salesCount,
    salesTotal,
    itemsSold,
    openingFloat,
    drawer,
    expectedCash,
    countedCash,
    variance
  });
  await auditModel.log(userId, 'CLOSE_DAY', {
    close_id: close.id, sales_count: salesCount, sales_total: salesTotal, items_sold: itemsSold,
    opening_float: openingFloat, counted_cash: countedCash, expected_cash: expectedCash, variance
  });
  res.json(await dayCloseModel.findById(close.id));
}

module.exports = { create };
