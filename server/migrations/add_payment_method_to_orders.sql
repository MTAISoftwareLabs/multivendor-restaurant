-- Migration: Add payment_method column to orders table
-- Date: 2025-01-16
-- Description: Adds payment_method field to store payment type (cash/upi) for orders

ALTER TABLE IF EXISTS orders
ADD COLUMN IF NOT EXISTS payment_method varchar(10);

-- Add comment to column
COMMENT ON COLUMN orders.payment_method IS 'Payment method used: cash or upi';

