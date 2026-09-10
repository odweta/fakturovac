const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgres://fakturovac:fakturovac@localhost:5432/fakturovac"
});

let schemaPromise;

const initializeDatabase = () => {
    if (!schemaPromise) {
        schemaPromise = pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TIMESTAMPTZ NOT NULL
            );

            CREATE TABLE IF NOT EXISTS supplier_profiles (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                typ_subjektu TEXT NOT NULL DEFAULT 'osoba',
                nazev_spolecnosti TEXT NOT NULL DEFAULT '',
                ico TEXT NOT NULL DEFAULT '',
                jmeno TEXT NOT NULL DEFAULT '',
                prijmeni TEXT NOT NULL DEFAULT '',
                ulice_cp TEXT NOT NULL DEFAULT '',
                psc TEXT NOT NULL DEFAULT '',
                mesto TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS clients (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                typ_subjektu TEXT NOT NULL DEFAULT 'osoba',
                nazev_spolecnosti TEXT NOT NULL DEFAULT '',
                ico TEXT NOT NULL DEFAULT '',
                jmeno TEXT NOT NULL DEFAULT '',
                prijmeni TEXT NOT NULL DEFAULT '',
                ulice_cp TEXT NOT NULL DEFAULT '',
                psc TEXT NOT NULL DEFAULT '',
                mesto TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS invoices (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                invoice_number TEXT NOT NULL,
                invoice_data JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (user_id, invoice_number)
            );

            CREATE TABLE IF NOT EXISTS invoice_counters (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                invoice_year INTEGER NOT NULL,
                last_number INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (user_id, invoice_year)
            );

            CREATE TABLE IF NOT EXISTS payment_presets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                account_number TEXT NOT NULL DEFAULT '',
                iban TEXT NOT NULL DEFAULT '',
                swift TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (user_id, name)
            );

            ALTER TABLE supplier_profiles ADD COLUMN IF NOT EXISTS nazev_spolecnosti TEXT NOT NULL DEFAULT '';
            ALTER TABLE supplier_profiles ADD COLUMN IF NOT EXISTS typ_subjektu TEXT NOT NULL DEFAULT 'osoba';
            ALTER TABLE clients ADD COLUMN IF NOT EXISTS nazev_spolecnosti TEXT NOT NULL DEFAULT '';
            ALTER TABLE clients ADD COLUMN IF NOT EXISTS typ_subjektu TEXT NOT NULL DEFAULT 'osoba';
        `).catch((error) => {
            schemaPromise = undefined;
            throw error;
        });
    }

    return schemaPromise;
};

module.exports = { pool, initializeDatabase };
