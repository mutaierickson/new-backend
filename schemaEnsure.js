const { makeReceiptCode } = require('./utils/receiptCode');

const sqliteExec = (db, sql) => new Promise((resolve, reject) => {
  db.run(sql, (err) => (err ? reject(err) : resolve()));
});

const sqliteTry = (db, sql) => new Promise((resolve) => {
  db.run(sql, () => resolve());
});

const warnUnlessExists = (label, error) => {
  if (!/already exists|duplicate/i.test(error.message || '')) {
    console.warn(`${label}:`, error.message);
  }
};

const engine = () => require('./db').getEngine();
const queries = () => {
  const db = require('./db');
  return { runQuery: db.runQuery, allQuery: db.allQuery };
};

const ensureReceiptCodes = async () => {
  const { databaseType, pool, db } = engine();
  const { runQuery, allQuery } = queries();

  try {
    if (databaseType === 'postgres' && pool) {
      await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_code TEXT');
      await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS orders_receipt_code_uidx ON orders (receipt_code)');
    } else if (db) {
      await sqliteTry(db, 'ALTER TABLE orders ADD COLUMN receipt_code TEXT');
    }
  } catch (error) {
    warnUnlessExists('receipt_code column', error);
  }

  try {
    const rows = await allQuery(`SELECT id FROM orders WHERE receipt_code IS NULL OR receipt_code = ''`);
    for (const row of rows) {
      await runQuery(`UPDATE orders SET receipt_code = ? WHERE id = ?`, [makeReceiptCode(row.id), row.id]);
    }
  } catch (error) {
    console.warn('receipt_code backfill:', error.message);
  }
};

const ensureDayCloses = async () => {
  const { databaseType, pool, db } = engine();

  try {
    if (databaseType === 'postgres' && pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS day_closes (
          id SERIAL PRIMARY KEY,
          user_id INTEGER,
          business_date DATE NOT NULL,
          closed_at TIMESTAMPTZ DEFAULT NOW(),
          sales_count INTEGER NOT NULL DEFAULT 0,
          sales_total NUMERIC(10,2) NOT NULL DEFAULT 0,
          items_sold INTEGER NOT NULL DEFAULT 0
        )
      `);
      await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS close_id INTEGER');
      await pool.query('ALTER TABLE day_closes ADD COLUMN IF NOT EXISTS opening_float NUMERIC(10,2) DEFAULT 0');
      await pool.query('ALTER TABLE day_closes ADD COLUMN IF NOT EXISTS cash_sales NUMERIC(10,2) DEFAULT 0');
      await pool.query('ALTER TABLE day_closes ADD COLUMN IF NOT EXISTS cash_refunds NUMERIC(10,2) DEFAULT 0');
      await pool.query('ALTER TABLE day_closes ADD COLUMN IF NOT EXISTS cash_extras NUMERIC(10,2) DEFAULT 0');
      await pool.query('ALTER TABLE day_closes ADD COLUMN IF NOT EXISTS expected_cash NUMERIC(10,2) DEFAULT 0');
      await pool.query('ALTER TABLE day_closes ADD COLUMN IF NOT EXISTS counted_cash NUMERIC(10,2)');
      await pool.query('ALTER TABLE day_closes ADD COLUMN IF NOT EXISTS variance NUMERIC(10,2) DEFAULT 0');
    } else if (db) {
      await sqliteExec(db, `
        CREATE TABLE IF NOT EXISTS day_closes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER REFERENCES users(id),
          business_date DATE NOT NULL,
          closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          sales_count INTEGER NOT NULL DEFAULT 0,
          sales_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          items_sold INTEGER NOT NULL DEFAULT 0
        )
      `);
      await sqliteTry(db, 'ALTER TABLE orders ADD COLUMN close_id INTEGER');
      await sqliteTry(db, 'ALTER TABLE day_closes ADD COLUMN opening_float DECIMAL(10,2) DEFAULT 0');
      await sqliteTry(db, 'ALTER TABLE day_closes ADD COLUMN cash_sales DECIMAL(10,2) DEFAULT 0');
      await sqliteTry(db, 'ALTER TABLE day_closes ADD COLUMN cash_refunds DECIMAL(10,2) DEFAULT 0');
      await sqliteTry(db, 'ALTER TABLE day_closes ADD COLUMN cash_extras DECIMAL(10,2) DEFAULT 0');
      await sqliteTry(db, 'ALTER TABLE day_closes ADD COLUMN expected_cash DECIMAL(10,2) DEFAULT 0');
      await sqliteTry(db, 'ALTER TABLE day_closes ADD COLUMN counted_cash DECIMAL(10,2)');
      await sqliteTry(db, 'ALTER TABLE day_closes ADD COLUMN variance DECIMAL(10,2) DEFAULT 0');
    }
  } catch (error) {
    warnUnlessExists('day_closes setup', error);
  }
};

const ensureCustomersAndSms = async () => {
  const { databaseType, pool, db } = engine();

  try {
    if (databaseType === 'postgres' && pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS customers (
          id SERIAL PRIMARY KEY,
          name TEXT,
          phone TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sms_campaigns (
          id SERIAL PRIMARY KEY,
          user_id INTEGER,
          title TEXT,
          message TEXT NOT NULL,
          recipient_count INTEGER NOT NULL DEFAULT 0,
          sent_count INTEGER NOT NULL DEFAULT 0,
          failed_count INTEGER NOT NULL DEFAULT 0,
          status TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sms_messages (
          id SERIAL PRIMARY KEY,
          campaign_id INTEGER,
          customer_id INTEGER,
          phone TEXT NOT NULL,
          status TEXT,
          provider_ref TEXT,
          error TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT');
    } else if (db) {
      await sqliteExec(db, `
        CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          phone TEXT NOT NULL UNIQUE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await sqliteExec(db, `
        CREATE TABLE IF NOT EXISTS sms_campaigns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          title TEXT,
          message TEXT NOT NULL,
          recipient_count INTEGER NOT NULL DEFAULT 0,
          sent_count INTEGER NOT NULL DEFAULT 0,
          failed_count INTEGER NOT NULL DEFAULT 0,
          status TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await sqliteExec(db, `
        CREATE TABLE IF NOT EXISTS sms_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          campaign_id INTEGER,
          customer_id INTEGER,
          phone TEXT NOT NULL,
          status TEXT,
          provider_ref TEXT,
          error TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await sqliteTry(db, 'ALTER TABLE orders ADD COLUMN customer_phone TEXT');
    }
  } catch (error) {
    warnUnlessExists('customers/sms setup', error);
  }
};

const ensureReturns = async () => {
  const { databaseType, pool, db } = engine();

  try {
    if (databaseType === 'postgres' && pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS returns (
          id SERIAL PRIMARY KEY,
          order_id INTEGER,
          user_id INTEGER,
          return_code TEXT UNIQUE,
          type TEXT NOT NULL,
          refund_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
          extra_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
          method TEXT,
          reason TEXT,
          restock INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS return_items (
          id SERIAL PRIMARY KEY,
          return_id INTEGER,
          order_item_id INTEGER,
          product_id INTEGER,
          quantity INTEGER NOT NULL DEFAULT 1,
          unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
          unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
          kind TEXT NOT NULL
        )
      `);
    } else if (db) {
      await sqliteExec(db, `
        CREATE TABLE IF NOT EXISTS returns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER REFERENCES orders(id),
          user_id INTEGER REFERENCES users(id),
          return_code TEXT UNIQUE,
          type TEXT NOT NULL CHECK(type IN ('return', 'exchange')),
          refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          extra_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          method TEXT CHECK(method IN ('Cash', 'Card', 'Mobile')),
          reason TEXT,
          restock INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await sqliteExec(db, `
        CREATE TABLE IF NOT EXISTS return_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          return_id INTEGER REFERENCES returns(id) ON DELETE CASCADE,
          order_item_id INTEGER REFERENCES order_items(id),
          product_id INTEGER REFERENCES products(id),
          quantity INTEGER NOT NULL DEFAULT 1,
          unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          kind TEXT NOT NULL CHECK(kind IN ('returned', 'taken'))
        )
      `);
    }
  } catch (error) {
    warnUnlessExists('returns setup', error);
  }
};

const ensureProductBarcodes = async () => {
  const { databaseType, pool, db } = engine();
  try {
    if (databaseType === 'postgres' && pool) {
      await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT');
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_uidx ON products (barcode) WHERE barcode IS NOT NULL AND barcode <> ''`);
    } else if (db) {
      await sqliteTry(db, 'ALTER TABLE products ADD COLUMN barcode TEXT');
      await sqliteTry(db, `CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_uidx ON products (barcode) WHERE barcode IS NOT NULL AND barcode <> ''`);
    }
  } catch (error) {
    warnUnlessExists('product barcode', error);
  }
};

const ensureVoidsVatAndStock = async () => {
  const { databaseType, pool, db } = engine();
  try {
    if (databaseType === 'postgres' && pool) {
      await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS voided INTEGER DEFAULT 0');
      await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) DEFAULT 16');
      await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(10,2) DEFAULT 0');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS voids (
          id SERIAL PRIMARY KEY,
          order_id INTEGER,
          user_id INTEGER,
          reason TEXT,
          restock INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS stock_intakes (
          id SERIAL PRIMARY KEY,
          product_id INTEGER,
          user_id INTEGER,
          quantity INTEGER NOT NULL,
          unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
          note TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
    } else if (db) {
      await sqliteTry(db, 'ALTER TABLE orders ADD COLUMN voided INTEGER DEFAULT 0');
      await sqliteTry(db, 'ALTER TABLE orders ADD COLUMN vat_rate DECIMAL(5,2) DEFAULT 16');
      await sqliteTry(db, 'ALTER TABLE orders ADD COLUMN vat_amount DECIMAL(10,2) DEFAULT 0');
      await sqliteExec(db, `
        CREATE TABLE IF NOT EXISTS voids (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER REFERENCES orders(id),
          user_id INTEGER REFERENCES users(id),
          reason TEXT,
          restock INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await sqliteExec(db, `
        CREATE TABLE IF NOT EXISTS stock_intakes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER REFERENCES products(id),
          user_id INTEGER REFERENCES users(id),
          quantity INTEGER NOT NULL,
          unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          note TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
  } catch (error) {
    warnUnlessExists('voids/vat/stock setup', error);
  }
};

const hashExistingPasswords = async () => {
  const { isHashed, hashPassword } = require('./utils/password');
  const { allQuery, runQuery } = queries();
  try {
    const rows = await allQuery(`SELECT id, password_hash FROM users`);
    for (const row of rows) {
      if (isHashed(row.password_hash)) continue;
      await runQuery(`UPDATE users SET password_hash = ? WHERE id = ?`, [await hashPassword(row.password_hash), row.id]);
    }
  } catch (error) {
    console.warn('password hash migrate:', error.message);
  }
};

const ensureSchema = async () => {
  await ensureReceiptCodes();
  await ensureDayCloses();
  await ensureCustomersAndSms();
  await ensureReturns();
  await ensureProductBarcodes();
  await ensureVoidsVatAndStock();
  await hashExistingPasswords();
};

module.exports = { ensureSchema };
