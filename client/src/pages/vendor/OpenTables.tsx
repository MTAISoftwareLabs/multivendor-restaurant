import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import ManualOrderDialog from "@/components/orders/ManualOrderDialog";
import { useOrderStream } from "@/hooks/useOrderStream";
import { queryClient } from "@/lib/queryClient";
import type { Table, Captain, MenuCategory } from "@shared/schema";
import type { PrintableOrder } from "@/types/orders";
import type { MenuItemWithAddons } from "@/types/menu";

const normalizeStatusValue = (status: string | null | undefined) =>
  status ? status.toString().trim().toLowerCase().replace(/\s+/g, "_") : "";

const resolveOrderType = (order: PrintableOrder): "dining" | "delivery" | "pickup" => {
  const rawType =
    (order as Record<string, unknown>)?.fulfillmentType ??
    (order as Record<string, unknown>)?.orderType ??
    (order as Record<string, unknown>)?.channel ??
    null;

  if (typeof rawType === "string") {
    const normalized = rawType.trim().toLowerCase();
    if (["delivery", "home_delivery", "delivery_order", "home-delivery"].includes(normalized)) {
      return "delivery";
    }
    if (["pickup", "takeaway", "take_away", "take-away"].includes(normalized)) {
      return "pickup";
    }
  }

  if ((order as Record<string, unknown>)?.deliveryAddress) {
    return "delivery";
  }

  if ((order as Record<string, unknown>)?.pickupTime) {
    return "pickup";
  }

  return "dining";
};

const OPEN_ORDER_STATUSES = new Set(["pending", "accepted", "preparing", "ready", "served"]);

const formatINR = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return "₹0.00";
  }
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value));
  const amount = Number.isFinite(numeric) ? numeric : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

type DisplayOrderItem = {
  name: string;
  quantity: number;
  lineTotal: number;
  gstAmount: number;
  gstRate: number;
  addons?: string[];
};

const parseOrderItemsForDisplay = (order: PrintableOrder): DisplayOrderItem[] => {
  const rawItems = (() => {
    if (Array.isArray(order.items)) return order.items;
    if (typeof order.items === "string") {
      try {
        const parsed = JSON.parse(order.items);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    if (order.items && typeof order.items === "object") {
      const maybeArray = (order.items as any).items;
      if (Array.isArray(maybeArray)) {
        return maybeArray;
      }
    }
    return [];
  })();

  return rawItems.map((item: any) => {
    const quantityRaw = Number(item.quantity ?? 1);
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.floor(quantityRaw) : 1;
    const lineTotal = Number(
      item.lineTotal ?? item.subtotalWithGst ?? item.subtotal ?? item.total ?? 0,
    );
    const gstAmount = Number(item.gstAmount ?? 0);
    const gstRate = Number(item.gstRate ?? 0);
    const addons =
      Array.isArray(item.addons) && item.addons.length > 0
        ? item.addons.map((addon: any) => String(addon.name ?? "Addon"))
        : undefined;

    return {
      name: String(item.name ?? "Item"),
      quantity,
      lineTotal: Number.isFinite(lineTotal) ? Number(lineTotal.toFixed(2)) : 0,
      gstAmount: Number.isFinite(gstAmount) ? Number(gstAmount.toFixed(2)) : 0,
      gstRate: Number.isFinite(gstRate) ? Number(gstRate.toFixed(2)) : 0,
      addons,
    };
  });
};

export default function OpenTables() {
  const { data: tables, isLoading: loadingTables } = useQuery<Table[]>({
    queryKey: ["/api/vendor/tables"],
  });

  const { data: orders, isLoading: loadingOrders } = useQuery<PrintableOrder[]>({
    queryKey: ["/api/vendor/orders"],
    refetchInterval: 5000,
  });

  const { data: captains } = useQuery<Captain[]>({
    queryKey: ["/api/vendor/captains"],
  });

  const { data: menuItems } = useQuery<MenuItemWithAddons[]>({
    queryKey: ["/api/vendor/menu/items"],
  });

  const { data: categories } = useQuery<MenuCategory[]>({
    queryKey: ["/api/vendor/menu/categories"],
  });

  const captainMap = useMemo(() => {
    const map = new Map<number, Captain>();
    (captains ?? []).forEach((captain) => map.set(captain.id, captain));
    return map;
  }, [captains]);

  const tableOptions = useMemo(
    () =>
      (tables ?? []).map((table) => ({
        id: table.id,
        tableNumber: table.tableNumber,
        label: table.isManual ? `Manual Table ${table.tableNumber}` : undefined,
      })),
    [tables],
  );

  const openTableEntries = useMemo(() => {
    if (!tables || !orders) {
      return [];
    }

    const activeDiningOrders = orders.filter((order) => {
      if (resolveOrderType(order) !== "dining") {
        return false;
      }
      const status = normalizeStatusValue(order.status);
      return OPEN_ORDER_STATUSES.has(status);
    });

    const orderByTable = new Map<number, PrintableOrder>();
    for (const order of activeDiningOrders) {
      const tableId = Number(order.tableId);
      if (!Number.isFinite(tableId) || tableId <= 0) {
        continue;
      }
      const existing = orderByTable.get(tableId);
      if (!existing) {
        orderByTable.set(tableId, order);
        continue;
      }
      const existingCreated = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
      const candidateCreated = order.createdAt ? new Date(order.createdAt).getTime() : 0;
      if (candidateCreated > existingCreated) {
        orderByTable.set(tableId, order);
      }
    }

    return tables
      .filter((table) => table.isActive === false)
      .map((table) => ({
        table,
        order: orderByTable.get(table.id) ?? null,
        captain: table.captainId ? captainMap.get(table.captainId) ?? null : null,
      }))
      .sort((a, b) => a.table.tableNumber - b.table.tableNumber);
  }, [tables, orders, captainMap]);

  const openCount = openTableEntries.length;
  const withoutOrderCount = openTableEntries.filter((entry) => !entry.order).length;

  useOrderStream({
    onEvent: (event) => {
      if (
        event.type === "order-created" ||
        event.type === "order-status-changed" ||
        event.type === "order-updated" ||
        event.type === "table-status-changed" ||
        event.type === "kot-created"
      ) {
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/tables"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/orders"] });
      }
    },
  });

  const isBusy = loadingTables || loadingOrders;
  const showEmptyState = !isBusy && openCount === 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Open Tables</h1>
        <p className="text-muted-foreground">
          Monitor booked tables, review GST breakdowns, and edit live orders in one place.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Currently Occupied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{openCount}</p>
            <p className="text-sm text-muted-foreground">Tables marked unavailable</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Missing Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{withoutOrderCount}</p>
            <p className="text-sm text-muted-foreground">Tables booked without active orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Captains Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {
                new Set(
                  openTableEntries
                    .map((entry) => entry.table.captainId)
                    .filter((id): id is number => typeof id === "number"),
                ).size
              }
            </p>
            <p className="text-sm text-muted-foreground">Captains covering open tables</p>
          </CardContent>
        </Card>
      </div>

      {isBusy ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <Skeleton key={item} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : showEmptyState ? (
        <Card>
          <CardContent className="py-16 text-center space-y-2">
            <p className="text-xl font-semibold">All tables are available</p>
            <p className="text-sm text-muted-foreground">
              As soon as a table is booked, it will appear here with order details.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {openTableEntries.map(({ table, order, captain }) => {
            const items = order ? parseOrderItemsForDisplay(order) : [];
            const totals = items.reduce(
              (acc, item) => {
                acc.total += item.lineTotal;
                acc.gst += item.gstAmount;
                return acc;
              },
              { total: 0, gst: 0 },
            );
            const subtotal = totals.total - totals.gst;
            const relativeTime = order?.createdAt
              ? formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })
              : null;

            return (
              <Card key={table.id} className="flex flex-col">
                <CardHeader className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-2xl font-bold">Table {table.tableNumber}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {captain ? `Assigned to ${captain.name}` : "No captain assigned"}
                      </p>
                    </div>
                    <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                      Booked
                    </Badge>
                  </div>
                  {order && (
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <StatusBadge status={order.status as any} />
                      {relativeTime && <span>Opened {relativeTime}</span>}
                      {order.customerName && (
                        <span className="font-medium text-foreground">{order.customerName}</span>
                      )}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="flex flex-1 flex-col space-y-4">
                  {order ? (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Items</span>
                          <span className="font-semibold">{items.length}</span>
                        </div>
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-2 max-h-40 overflow-y-auto">
                          {items.map((item, idx) => (
                            <div key={`${order.id}-item-${idx}`}>
                              <p className="text-sm font-medium">
                                {item.quantity} × {item.name}
                              </p>
                              <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                                <span>{formatINR(item.lineTotal)}</span>
                                {item.gstRate > 0 && (
                                  <span>GST {item.gstRate}% ({formatINR(item.gstAmount)})</span>
                                )}
                              </div>
                              {item.addons && item.addons.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  Addons: {item.addons.join(", ")}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="font-medium">{formatINR(subtotal)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">GST collected</span>
                          <span className="font-medium">{formatINR(totals.gst)}</span>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between text-base font-semibold">
                          <span>Total with GST</span>
                          <span>{formatINR(totals.total)}</span>
                        </div>
                      </div>

                      <div className="mt-auto flex items-center justify-between gap-2">
                        <Button asChild variant="outline" size="sm">
                          <a href="/vendor/orders" className="w-full text-center">
                            View in Orders
                          </a>
                        </Button>
                        {menuItems && categories && (
                          <ManualOrderDialog
                            trigger={
                              <Button size="sm" className="w-full">
                                Edit Order
                              </Button>
                            }
                            tables={tableOptions}
                            menuItems={menuItems}
                            categories={categories}
                            submitEndpoint={`/api/vendor/orders/${order.id}`}
                            submitMethod="PUT"
                            mode="edit"
                            defaultTableId={order.tableId ?? undefined}
                            allowTableSelection={false}
                            initialOrder={order}
                            invalidateQueryKeys={[
                              ["/api/vendor/orders"],
                              ["/api/vendor/tables"],
                            ]}
                            onOrderCreated={() => {
                              queryClient.invalidateQueries({ queryKey: ["/api/vendor/orders"] });
                              queryClient.invalidateQueries({ queryKey: ["/api/vendor/tables"] });
                            }}
                          />
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">No active order</p>
                      <p>This table is marked as booked but doesn’t have an open order yet.</p>
                      <Button
                        asChild
                        size="sm"
                        className="mt-3"
                        variant="outline"
                      >
                        <a href="/vendor/orders">Create order</a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}


