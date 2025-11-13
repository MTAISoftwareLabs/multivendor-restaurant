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

      ALTER TABLE IF EXISTS vendors
      ADD COLUMN IF NOT EXISTS gst_rate numeric(5,2) NOT NULL DEFAULT 0;

      ALTER TABLE IF EXISTS vendors
      ADD COLUMN IF NOT EXISTS gst_mode varchar(10) NOT NULL DEFAULT 'exclude';

      ALTER TABLE IF EXISTS vendors
      ADD COLUMN IF NOT EXISTS is_delivery_allowed boolean NOT NULL DEFAULT false;

      ALTER TABLE IF EXISTS vendors
      ADD COLUMN IF NOT EXISTS is_pickup_allowed boolean NOT NULL DEFAULT false;

      ALTER TABLE IF EXISTS menu_categories
      ADD COLUMN IF NOT EXISTS gst_rate numeric(5,2) NOT NULL DEFAULT 0;

      ALTER TABLE IF EXISTS menu_categories
      ADD COLUMN IF NOT EXISTS gst_mode varchar(10) NOT NULL DEFAULT 'exclude';

      CREATE TABLE IF NOT EXISTS kot_tickets (
        id serial PRIMARY KEY,
        order_id integer NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
        vendor_id integer NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
        table_id integer NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
        ticket_number varchar(50) NOT NULL UNIQUE,
        status varchar(20) NOT NULL DEFAULT 'pending',
        items jsonb NOT NULL,
        customer_notes text,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now(),
        printed_at timestamp
      );

      CREATE INDEX IF NOT EXISTS idx_kot_tickets_vendor_id ON kot_tickets(vendor_id);
      CREATE INDEX IF NOT EXISTS idx_kot_tickets_table_id ON kot_tickets(table_id);
    `);
  } catch (error) {
    console.error("Failed to ensure database schema", error);
  }
}

void ensureSchema();
