-- SQLite POS System Schema for Clothing Shop

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('Admin', 'Manager', 'Cashier')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  min_stock_level INTEGER NOT NULL DEFAULT 5,
  size TEXT, -- e.g. S, M, L, XL, Shoe sizes
  color TEXT,
  barcode TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_uidx ON products (barcode) WHERE barcode IS NOT NULL AND barcode <> '';

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  customer_name TEXT, -- Optional for walk-ins
  customer_phone TEXT,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status TEXT DEFAULT 'Closed' CHECK(status IN ('Open', 'Closed')),
  receipt_code TEXT UNIQUE,
  close_id INTEGER,
  voided INTEGER NOT NULL DEFAULT 0,
  vat_rate DECIMAL(5,2) NOT NULL DEFAULT 16.00,
  vat_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS day_closes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  business_date DATE NOT NULL,
  closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sales_count INTEGER NOT NULL DEFAULT 0,
  sales_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  items_sold INTEGER NOT NULL DEFAULT 0,
  opening_float DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  cash_sales DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  cash_refunds DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  cash_extras DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  expected_cash DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  counted_cash DECIMAL(10,2),
  variance DECIMAL(10,2) NOT NULL DEFAULT 0.00
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00
);

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
);

CREATE TABLE IF NOT EXISTS return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER REFERENCES returns(id) ON DELETE CASCADE,
  order_item_id INTEGER REFERENCES order_items(id),
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  kind TEXT NOT NULL CHECK(kind IN ('returned', 'taken'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  method TEXT NOT NULL CHECK(method IN ('Cash', 'Card', 'Mobile')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sms_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  title TEXT,
  message TEXT NOT NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sms_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER REFERENCES sms_campaigns(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  status TEXT,
  provider_ref TEXT,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS voids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id),
  user_id INTEGER REFERENCES users(id),
  reason TEXT,
  restock INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_intakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER REFERENCES products(id),
  user_id INTEGER REFERENCES users(id),
  quantity INTEGER NOT NULL,
  unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed Initial Data
INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES 
(1, 'admin', 'password', 'Admin'),
(2, 'manager', 'password', 'Manager'),
(3, 'cashier', 'password', 'Cashier');

INSERT OR IGNORE INTO categories (id, name) VALUES 
(1, 'Sweaters'), 
(2, 'Hoodies'), 
(3, 'Shirts'), 
(4, 'Shoes'),
(5, 'Accessories');

INSERT OR IGNORE INTO products (id, name, category_id, price, stock_quantity, size, color) VALUES 
(1, 'Classic Knit Sweater', 1, 45.00, 20, 'M', 'Navy'),
(2, 'Classic Knit Sweater', 1, 45.00, 15, 'L', 'Navy'),
(3, 'Heavyweight Zip Hoodie', 2, 55.00, 30, 'L', 'Black'),
(4, 'Basic Cotton T-Shirt', 3, 15.00, 100, 'M', 'White'),
(5, 'Running Sneakers', 4, 85.00, 10, '10', 'Grey'),
(6, 'Canvas High Tops', 4, 60.00, 25, '9', 'White');
