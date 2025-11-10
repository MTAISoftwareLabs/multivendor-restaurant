import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
import * as schema from "@shared/schema";
import "dotenv/config";

const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Example: postgres://user:password@localhost:5432/dbname");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

async function ensureSchema(): Promise<void> {
  try {
    await pool.query(`
      ALTER TABLE IF EXISTS tables
      ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;

      ALTER TABLE IF EXISTS vendors
      ADD COLUMN IF NOT EXISTS gstin varchar(20);

      ALTER TABLE IF EXISTS menu_categories
      ADD COLUMN IF NOT EXISTS gst_rate numeric(5,2) NOT NULL DEFAULT 0;

      ALTER TABLE IF EXISTS menu_categories
      ADD COLUMN IF NOT EXISTS gst_mode varchar(10) NOT NULL DEFAULT 'exclude';
    `);
  } catch (error) {
    console.error("Failed to ensure database schema", error);
  }
}

void ensureSchema();
