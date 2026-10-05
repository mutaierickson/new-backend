const { normalizeKenyanPhone } = require('../utils/phone');
const { runQuery, allQuery, getQuery } = require('../db');

const upsertCustomer = async (name, phone) => {
  const normalized = normalizeKenyanPhone(phone);
  const label = name && name !== 'Walk-in Customer' ? name : null;
  const existing = await getQuery('SELECT id, name FROM customers WHERE phone = ?', [normalized]);
  if (existing) {
    if (label && label !== existing.name) {
      await runQuery('UPDATE customers SET name = ? WHERE id = ?', [label, existing.id]);
    }
    return { id: existing.id, phone: normalized, created: false };
  }
  const inserted = await runQuery(
    `INSERT INTO customers (name, phone) VALUES (?, ?) RETURNING id`,
    [label, normalized]
  );
  return { id: inserted.id, phone: normalized, created: true };
};

const listCustomers = () => allQuery(
  `SELECT id, name, phone, created_at FROM customers ORDER BY created_at DESC, id DESC`
);

const findById = (id) => getQuery('SELECT id, name, phone, created_at FROM customers WHERE id = ?', [id]);

const remove = (id) => runQuery('DELETE FROM customers WHERE id = ?', [id]);

module.exports = { upsertCustomer, listCustomers, findById, remove };
