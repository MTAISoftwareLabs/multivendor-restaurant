import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { Clock, UtensilsCrossed } from "lucide-react";
import type { Order } from "@shared/schema";

type CaptainOrder = Order & {
  tableNumber: number | null;
  vendorDetails?: {
    name: string | null;
    address?: string | null;
    phone?: string | null;
  } | null;
};

type OrderItem = {
  name?: string;
  quantity?: number;
  price?: number;
  subtotal?: number;
};

const parseOrderItems = (order: Order): OrderItem[] => {
  if (Array.isArray(order.items)) {
    return order.items as OrderItem[];
  }

  if (typeof order.items === "string") {
    try {
      const parsed = JSON.parse(order.items);
      return Array.isArray(parsed) ? (parsed as OrderItem[]) : [];
    } catch {
      return [];
    }
  }

  return [];
};

export default function CaptainOrders() {
  const { data: orders, isLoading } = useQuery<CaptainOrder[]>({
    queryKey: ["/api/captain/orders"],
    refetchInterval: 5000,
  });

  const activeOrders = useMemo(
    () => (orders ?? []).filter((order) => order.status !== "delivered"),
    [orders],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Orders</h1>
        <p className="text-muted-foreground mt-2">
          View and manage dine-in orders for your assigned tables
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-40 w-full" />
          ))}
        </div>
      ) : orders && orders.length > 0 ? (
        <div className="space-y-4">
          {orders.map((order) => {
            const items = parseOrderItems(order);
            const tableLabel =
              order.tableNumber !== null && order.tableNumber !== undefined
                ? `Table ${order.tableNumber}`
                : "Unassigned Table";

            return (
              <Card
                key={order.id}
                className="hover-elevate"
                data-testid={`card-captain-order-${order.id}`}
              >
                <CardHeader>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-3">
                        <span>
                          Order #{order.id} · {tableLabel}
                        </span>
                        <StatusBadge status={order.status as any} />
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4" />
                          {order.createdAt
                            ? new Date(order.createdAt).toLocaleString()
                            : "Pending"}
                        </div>
                        <div className="font-semibold text-green-600">
                          ₹{order.totalAmount}
                        </div>
                        {order.customerName && (
                          <div className="text-sm">
                            Customer:{" "}
                            <span className="font-medium">
                              {order.customerName}
                            </span>
                          </div>
                        )}
                        {order.customerPhone && (
                          <div className="text-sm">
                            Phone:{" "}
                            <span className="font-medium">
                              {order.customerPhone}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="border-t pt-3">
                    <h4 className="font-semibold text-sm mb-2">Order Items</h4>
                    <div className="space-y-2">
                      {items.length > 0 ? (
                        items.map((item, index) => (
                          <div
                            key={`${order.id}-item-${index}`}
                            className="flex justify-between text-sm"
                          >
                            <span>
                              {item.quantity ?? 1}× {item.name ?? "Item"}
                            </span>
                            <span className="font-mono">
                              ₹{(
                                Number(item.price ?? 0) *
                                Number(item.quantity ?? 1)
                              ).toFixed(2)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          No items recorded for this order.
                        </p>
                      )}
                    </div>
                  </div>

                  {order.customerNotes && (
                    <div className="border-t pt-3">
                      <h4 className="font-semibold text-sm mb-2">
                        Customer Notes
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {order.customerNotes}
                      </p>
                    </div>
                  )}

                  {order.vendorNotes && (
                    <div className="border-t pt-3">
                      <h4 className="font-semibold text-sm mb-2">
                        Vendor Notes
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {order.vendorNotes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <UtensilsCrossed className="h-16 w-16 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold mb-1">
                No orders to display
              </h3>
              <p className="text-sm text-muted-foreground">
                Orders placed for your tables will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {activeOrders.length === 0 && orders && orders.length > 0 && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground text-center">
            All orders have been delivered. New orders will appear here
            automatically.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

