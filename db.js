const path = require('path');
const fs = require('fs');
const { Pool, types } = require('pg');
const { ensureSchema } = require('./schemaEnsure');

// Return NUMERIC as JS numbers and BIGINT (ids, COUNT()) as JS numbers instead of strings.
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));
types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));

let databaseType = 'sqlite';
let pool = null;
let db = null;
let ready = false;
let lastError = null;

const sqliteDbPath = path.join(__dirname, 'database.sqlite');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      databaseType = 'sqlite';
      console.log('Connected to local SQLite database successfully!');
      resolve();
    });
  });
});

// Validates DATABASE_URL and returns a password-masked description for logs.
const describeConnectionString = (raw) => {
  const value = String(raw || '').trim().replace(/^['"]|['"]$/g, '');
  if (!/^postgres(ql)?:\/\//i.test(value)) {
    throw new Error('DATABASE_URL must start with postgresql:// (or postgres://).');
  }
  const afterScheme = value.replace(/^postgres(ql)?:\/\//i, '');
  if (!afterScheme.includes('@')) {
    throw new Error(
      'DATABASE_URL is missing the "@" between the password and the host. ' +
      'Expected: postgresql://USER:PASSWORD@HOST:PORT/DATABASE'
    );
  }
  let url;
  try {
    url = new URL(value);
  } catch (err) {
    throw new Error(
      `DATABASE_URL could not be parsed (${err.message}). URL-encode special characters in the password (e.g. "!" -> %21, "@" -> %40, "#" -> %23).`
    );
  }
  return { value, masked: `${url.protocol}//${decodeURIComponent(url.username)}:****@${url.hostname}:${url.port || 5432}${url.pathname}` };
};

const initializePostgres = async () => {
  const { value: connectionString, masked } = describeConnectionString(process.env.DATABASE_URL);
  console.log(`Connecting to PostgreSQL at ${masked}`);

  if (pool) {
    try { await pool.end(); } catch (_) {}
    pool = null;
  }

  const attempts = 5;
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const candidate = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: Number(process.env.PG_POOL_MAX) || 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      keepAlive: true
    });
    // Without this, a dropped idle connection (common with Supabase's pooler) crashes the process.
    candidate.on('error', (err) => {
      console.error('PostgreSQL pool error (connection will be replaced):', err.message);
    });
    try {
      await candidate.query('SELECT 1');
      pool = candidate;
      databaseType = 'postgres';
      console.log('Connected to Supabase PostgreSQL successfully!');
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`PostgreSQL connection attempt ${attempt}/${attempts} failed: ${err.message}`);
      try { await candidate.end(); } catch (_) {}
      if (attempt < attempts) await sleep(Math.min(2000 * attempt, 8000));
    }
  }
  throw new Error(`Could not connect to PostgreSQL: ${lastErr?.message || 'unknown error'}`);
};

const formatQuery = (query) => {
  let i = 1;
  return query.replace(/\?/g, () => `$${i++}`);
};

const normalizeSqliteQuery = (query) => query
  .replace(/\$\d+/g, '?')
  .replace(/\s+RETURNING\s+id\s*$/i, '')
  .replace(/\s+RETURNING\s+.*$/i, '');

const ensureConnected = () => {
  if (databaseType === 'postgres' ? !pool : !db) {
    throw new Error('Database not ready');
  }
};

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
  ensureConnected();
  if (databaseType === 'sqlite') return sqliteQuery('run', query, params);
  const result = await pool.query(formatQuery(query), params);
  return { id: result.rows[0]?.id, changes: result.rowCount };
};

const allQuery = async (query, params = []) => {
  ensureConnected();
  if (databaseType === 'sqlite') return sqliteQuery('all', query, params);
  const result = await pool.query(formatQuery(query), params);
  return result.rows;
};

const getQuery = async (query, params = []) => {
  ensureConnected();
  if (databaseType === 'sqlite') return sqliteQuery('get', query, params);
  const result = await pool.query(formatQuery(query), params);
  return result.rows[0];
};

const withTransaction = async (fn) => {
  ensureConnected();
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
      try { await client.query('ROLLBACK'); } catch (_) {}
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
  try {
    if (process.env.DATABASE_URL) {
      // Production: Postgres only. Never silently fall back to SQLite (it can't load on Render).
      await initializePostgres();
    } else {
      console.warn('DATABASE_URL is not set; using local SQLite (development only).');
      await initializeSqlite();
    }
    await ensureSchema();
    ready = true;
    lastError = null;
  } catch (err) {
    ready = false;
    lastError = err.message;
    throw err;
  }
};

const isReady = () => ready;
const getStatus = () => ({
  database: ready ? 'connected' : 'disconnected',
  engine: ready ? databaseType : null,
  error: lastError
});
const getEngine = () => ({ databaseType, pool, db });

module.exports = {
  startDatabase,
  runQuery,
  allQuery,
  getQuery,
  withTransaction,
  logAudit,
  getEngine,
  isReady,
  getStatus
};
