import { db } from './db';

async function clearOrders() {
  console.log('🧹 Clearing order-related tables...');

  try {
    await db.execute(`
      TRUNCATE TABLE
        kot_tickets,
        delivery_orders,
        pickup_orders,
        orders
      RESTART IDENTITY CASCADE;
    `);

    console.log('✅ Orders cleared successfully.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to clear orders:', error);
    process.exit(1);
  }
}

clearOrders();

