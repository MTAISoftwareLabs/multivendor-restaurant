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
  addressId?: number | null;
  address?: {
    id: number;
    fullAddress: string;
    landmark?: string | null;
    city: string;
    zipCode?: string | null;
    type?: string | null;
    latitude?: string | null;
    longitude?: string | null;
  } | null;
  pickupReference?: string | null;
  pickupTime?: string | null;
  fulfillmentType?: string | null;
  orderType?: string | null;
  channel?: string | null;
};


