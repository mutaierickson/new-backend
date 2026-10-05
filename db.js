const path = require('path');
const fs = require('fs');
const { Pool, types } = require('pg');
const { ensureSchema } = require('./schemaEnsure');

let databaseType = 'sqlite';
let pool = null;
let db = null;

const sqliteDbPath = path.join(__dirname, 'database.sqlite');

const loadSqlite = () => {
  try {
    return require('sqlite3').verbose();
  } catch (err) {
    throw new Error(
      `SQLite is unavailable (${err.message}). Set DATABASE_URL so the API uses Postgres instead.`
    );
  }
};

const initializeSqlite = () => new Promise((resolve, reject) => {
  let sqlite3;
  try {
    sqlite3 = loadSqlite();
  } catch (err) {
    reject(err);
    return;
  }
  db = new sqlite3.Database(sqliteDbPath, (err) => {
    if (err) {
      reject(err);
      return;
    }
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    db.exec(schema, (execErr) => {
      if (execErr) {
        reject(execErr);
        return;
      }
      console.log('Connected to local SQLite database successfully!');
      resolve();
    });
  });
});

const initializePostgres = async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return false;

  try {
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 20_000
    });
    await pool.query('SELECT 1');
    databaseType = 'postgres';
    console.log('Connected to Supabase PostgreSQL successfully!');
    return true;
  } catch (err) {
    console.warn('PostgreSQL connection failed, falling back to SQLite:', err.message);
    if (pool) {
      try { await pool.end(); } catch (_) {}
      pool = null;
    }
    return false;
  }
};

const formatQuery = (query) => {
  let i = 1;
  return query.replace(/\?/g, () => `$${i++}`);
};

const normalizeSqliteQuery = (query) => query
  .replace(/\$\d+/g, '?')
  .replace(/\s+RETURNING\s+id\s*$/i, '')
  .replace(/\s+RETURNING\s+.*$/i, '');

const sqliteQuery = (method, query, params = []) => new Promise((resolve, reject) => {
  const sqliteSql = normalizeSqliteQuery(query);
  if (method === 'run') {
    db.run(sqliteSql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID || null, changes: this.changes || 0 });
    });
    return;
  }
  db[method](sqliteSql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

const runQuery = async (query, params = []) => {
  if (databaseType === 'sqlite') return sqliteQuery('run', query, params);
  const result = await pool.query(formatQuery(query), params);
  return { id: result.rows[0]?.id, changes: result.rowCount };
};

const allQuery = async (query, params = []) => {
  if (databaseType === 'sqlite') return sqliteQuery('all', query, params);
  const result = await pool.query(formatQuery(query), params);
  return result.rows;
};

const getQuery = async (query, params = []) => {
  if (databaseType === 'sqlite') return sqliteQuery('get', query, params);
  const result = await pool.query(formatQuery(query), params);
  return result.rows[0];
};

const withTransaction = async (fn) => {
  if (databaseType === 'postgres' && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const exec = async (query, params = []) => {
        const result = await client.query(formatQuery(query), params);
        return { id: result.rows[0]?.id, changes: result.rowCount };
      };
      const result = await fn(exec);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  return fn(runQuery);
};

const logAudit = async (user_id, action, details) => {
  try {
    await runQuery(
      `INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?) RETURNING id`,
      [user_id || null, action, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
};

const startDatabase = async () => {
  const postgresReady = await initializePostgres();
  if (postgresReady) {
    types.setTypeParser(1700, (val) => parseFloat(val));
  } else {
    await initializeSqlite();
  }
  await ensureSchema();
};

const getEngine = () => ({ databaseType, pool, db });

module.exports = {
  startDatabase,
  runQuery,
  allQuery,
  getQuery,
  withTransaction,
  logAudit,
  getEngine
};
