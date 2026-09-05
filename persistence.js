const fs = require('node:fs');
const path = require('node:path');

function conflict() {
  return Object.assign(new Error('This watchlist changed on another device. Refresh and try again.'), { status: 409 });
}

function clone(value) {
  return structuredClone(value);
}

function createJsonRepository({ storePath, seedPath }) {
  function readDocument() {
    if (!fs.existsSync(storePath)) fs.copyFileSync(seedPath, storePath);
    return JSON.parse(fs.readFileSync(storePath, 'utf8'));
  }

  function writeDocument(document) {
    const temporaryPath = `${storePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, storePath);
  }

  return {
    kind: 'json',
    async initialize() { readDocument(); },
    async findById(id) {
      const document = readDocument();
      const account = document.accounts.find(item => item.id === id);
      return account ? { account: clone(account), version: document.version } : null;
    },
    async findByEmail(email) {
      const document = readDocument();
      const account = document.accounts.find(item => item.user.email === email);
      return account ? { account: clone(account), version: document.version } : null;
    },
    async create(account) {
      const document = readDocument();
      if (document.accounts.some(item => item.user.email === account.user.email)) {
        throw Object.assign(new Error('An account with this email already exists.'), { status: 409 });
      }
      document.accounts.push(clone(account));
      document.version += 1;
      writeDocument(document);
      return { account: clone(account), version: document.version };
    },
    async update(account, expectedVersion) {
      const document = readDocument();
      if (expectedVersion != null && Number(expectedVersion) !== document.version) throw conflict();
      const index = document.accounts.findIndex(item => item.id === account.id);
      if (index < 0) throw Object.assign(new Error('Account not found.'), { status: 404 });
      if (document.accounts.some(item => item.id !== account.id && item.user.email === account.user.email)) {
        throw Object.assign(new Error('That email is already in use.'), { status: 409 });
      }
      document.accounts[index] = clone(account);
      document.version += 1;
      writeDocument(document);
      return { account: clone(account), version: document.version };
    },
    async close() {}
  };
}

function createPostgresRepository({ connectionString, seedPath }) {
  // Loaded only when DATABASE_URL is configured, preserving the zero-install JSON demo path.
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString, ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined });

  const fromRow = row => row ? { account: row.document, version: Number(row.version) } : null;
  return {
    kind: 'postgres',
    async initialize() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS pulse_accounts (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          document JSONB NOT NULL,
          version BIGINT NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      for (const account of seed.accounts) {
        await pool.query(
          `INSERT INTO pulse_accounts (id, email, document) VALUES ($1, $2, $3::jsonb) ON CONFLICT DO NOTHING`,
          [account.id, account.user.email, JSON.stringify(account)]
        );
      }
    },
    async findById(id) {
      return fromRow((await pool.query('SELECT document, version FROM pulse_accounts WHERE id = $1', [id])).rows[0]);
    },
    async findByEmail(email) {
      return fromRow((await pool.query('SELECT document, version FROM pulse_accounts WHERE email = $1', [email])).rows[0]);
    },
    async create(account) {
      try {
        return fromRow((await pool.query(
          `INSERT INTO pulse_accounts (id, email, document) VALUES ($1, $2, $3::jsonb) RETURNING document, version`,
          [account.id, account.user.email, JSON.stringify(account)]
        )).rows[0]);
      } catch (error) {
        if (error.code === '23505') throw Object.assign(new Error('An account with this email already exists.'), { status: 409 });
        throw error;
      }
    },
    async update(account, expectedVersion) {
      try {
        const result = await pool.query(
          `UPDATE pulse_accounts
             SET email = $2, document = $3::jsonb, version = version + 1, updated_at = NOW()
           WHERE id = $1 AND version = $4
           RETURNING document, version`,
          [account.id, account.user.email, JSON.stringify(account), Number(expectedVersion)]
        );
        if (!result.rowCount) throw conflict();
        return fromRow(result.rows[0]);
      } catch (error) {
        if (error.code === '23505') throw Object.assign(new Error('That email is already in use.'), { status: 409 });
        throw error;
      }
    },
    async close() { await pool.end(); }
  };
}

function createRepository({ root, storePath, databaseUrl = process.env.DATABASE_URL }) {
  const seedPath = path.join(root, 'data', 'store.seed.json');
  return databaseUrl
    ? createPostgresRepository({ connectionString: databaseUrl, seedPath })
    : createJsonRepository({ storePath, seedPath });
}

module.exports = { createRepository, createJsonRepository, createPostgresRepository };
