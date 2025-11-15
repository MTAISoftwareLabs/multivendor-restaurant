-- Migration: Create pickup_orders table
-- Date: 2025-01-15
-- Description: Adds support for pickup/takeaway orders

CREATE TABLE IF NOT EXISTS pickup_orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  
  -- Order Details
  items JSONB NOT NULL, -- [{ itemId, name, quantity, price, modifiers, subtotal }]
  total_amount NUMERIC(10, 2) NOT NULL,
  
  -- Pickup Information
  pickup_reference VARCHAR(50),
  pickup_time TIMESTAMP,
  customer_phone VARCHAR(50),
  
  -- Status Workflow: pending -> accepted -> preparing -> ready -> completed
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  
  -- Timestamps for status changes
  accepted_at TIMESTAMP,
  preparing_at TIMESTAMP,
  ready_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  -- Notes
  customer_notes TEXT,
  vendor_notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_pickup_orders_user_id ON pickup_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_pickup_orders_vendor_id ON pickup_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_pickup_orders_status ON pickup_orders(status);
CREATE INDEX IF NOT EXISTS idx_pickup_orders_created_at ON pickup_orders(created_at DESC);

-- Add comment to table
COMMENT ON TABLE pickup_orders IS 'Stores pickup/takeaway orders placed by mobile app users';

