import type { KotTicket, Order } from "@shared/schema";

export type PrintableOrder = Order & {
  vendorDetails?: {
    name?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    paymentQrCodeUrl?: string | null;
    gstin?: string | null;
  } | null;
  kotTicket?: KotTicket | null;
  tableNumber?: number | null;
  deliveryAddress?: string | null;
  pickupReference?: string | null;
  pickupTime?: string | null;
  fulfillmentType?: string | null;
  orderType?: string | null;
  channel?: string | null;
};


