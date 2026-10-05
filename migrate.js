const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`ALTER TABLE order_items ADD COLUMN unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00;`, (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('Column unit_cost already exists.');
      } else {
        console.error('Migration failed:', err);
      }
    } else {
      console.log('Migration successful: Added unit_cost to order_items.');
    }
  });
});

db.close();
