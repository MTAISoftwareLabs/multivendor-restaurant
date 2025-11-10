import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, Plus, Printer } from "lucide-react";
import {
  PaymentType,
  printA4Invoice,
  type ReceiptItem,
} from "@/lib/receipt-utils";
import type { MenuAddon, MenuCategory, MenuItem, Order, Table } from "@shared/schema";
import ManualOrderDialog from "@/components/orders/ManualOrderDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type MenuItemWithAddons = MenuItem & {
  addons?: MenuAddon[];
  gstRate?: string | number | null;
  gstMode?: "include" | "exclude" | null;
};

type PrintableOrder = Order & {
  vendorDetails?: {
    name?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
};

const roundCurrency = (value: number) =>
  Number.isFinite(value) ? Number(value.toFixed(2)) : 0;

const normalizeRateValue = (value: unknown): number => {
  if (value === null || value === undefined) {
    return 0;
  }
  const numeric = Number.parseFloat(String(value));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Number(numeric.toFixed(2));
};

export default function OrderManagement() {
  const { toast } = useToast();

  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printTargetOrder, setPrintTargetOrder] = useState<PrintableOrder | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);

  const { data: tables, isLoading: loadingTables } = useQuery<Table[]>({
    queryKey: ["/api/vendor/tables"],
  });

  const { data: menuItems, isLoading: loadingMenuItems } = useQuery<MenuItemWithAddons[]>({
    queryKey: ["/api/vendor/menu/items"],
  });

  const { data: categories } = useQuery<MenuCategory[]>({
    queryKey: ["/api/vendor/menu/categories"],
  });

  const menuItemsById = useMemo(() => {
    const map = new Map<number, MenuItemWithAddons>();
    (menuItems ?? []).forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [menuItems]);

  const categoriesById = useMemo(() => {
    const map = new Map<number, MenuCategory>();
    (categories ?? []).forEach((category) => {
      map.set(category.id, category);
    });
    return map;
  }, [categories]);

  const parseOrderItems = useCallback(
    (order: Order): ReceiptItem[] => {
      const rawItems: any[] = [];

      if (Array.isArray(order.items)) {
        rawItems.push(...order.items);
      } else if (typeof order.items === "string") {
        try {
          const parsed = JSON.parse(order.items);
          if (Array.isArray(parsed)) {
            rawItems.push(...parsed);
          }
        } catch {
          // ignore malformed payloads
        }
      }

      return rawItems.map((item) => {
        const quantityRaw = Number(item.quantity ?? 1);
        const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;

        const priceCandidates = [item.price, item.basePrice, item.unitPrice];
        let baseUnitPrice = 0;
        for (const candidate of priceCandidates) {
          if (candidate === null || candidate === undefined) {
            continue;
          }
          const numeric = Number.parseFloat(String(candidate));
          if (Number.isFinite(numeric)) {
            baseUnitPrice = numeric;
            break;
          }
        }
        baseUnitPrice = Number.isFinite(baseUnitPrice) ? baseUnitPrice : 0;

        let baseSubtotal = Number.parseFloat(String(item.subtotal ?? ""));
        if (!Number.isFinite(baseSubtotal)) {
          baseSubtotal = baseUnitPrice * quantity;
        }
        baseSubtotal = roundCurrency(baseSubtotal);

        const menuItem = menuItemsById.get(item.itemId ?? item.id ?? 0);
        const category = menuItem ? categoriesById.get(menuItem.categoryId) : undefined;

        let gstRate = normalizeRateValue(item.gstRate);
        if (gstRate === 0 && category) {
          const categoryRate = normalizeRateValue(category.gstRate);
          if (categoryRate > 0) {
            gstRate = categoryRate;
          }
        }

        let gstMode: "include" | "exclude" =
          item.gstMode === "include"
            ? "include"
            : item.gstMode === "exclude"
              ? "exclude"
              : category?.gstMode === "include"
                ? "include"
                : "exclude";

        let lineTotal = Number.parseFloat(
          String(item.subtotalWithGst ?? item.lineTotal ?? 0),
        );
        lineTotal =
          Number.isFinite(lineTotal) && lineTotal > 0 ? lineTotal : 0;

        if (lineTotal === 0) {
          if (gstRate > 0) {
            if (gstMode === "include") {
              const unitPriceWithTax = roundCurrency(baseUnitPrice * (1 + gstRate / 100));
              lineTotal = roundCurrency(unitPriceWithTax * quantity);
            } else {
              const estimatedGst = roundCurrency(baseSubtotal * (gstRate / 100));
              lineTotal = roundCurrency(baseSubtotal + estimatedGst);
            }
          } else {
            lineTotal = baseSubtotal;
          }
        } else {
          lineTotal = roundCurrency(lineTotal);
        }

        let gstAmount = Number.parseFloat(String(item.gstAmount ?? 0));
        if (!Number.isFinite(gstAmount) || gstAmount < 0) {
          gstAmount = roundCurrency(Math.max(0, lineTotal - baseSubtotal));
        } else {
          gstAmount = roundCurrency(gstAmount);
        }

        if (gstRate === 0) {
          gstAmount = 0;
          lineTotal = baseSubtotal;
        }

        const unitPrice = roundCurrency(baseUnitPrice);
        const unitPriceWithTax =
          gstMode === "include"
            ? quantity > 0
              ? roundCurrency(lineTotal / quantity)
              : lineTotal
            : unitPrice;

        return {
          name: item.name || "Item",
          quantity,
          unitPrice,
          unitPriceWithTax,
          baseSubtotal,
          gstRate,
          gstMode,
          gstAmount,
          lineTotal,
        };
      });
    },
    [categoriesById, menuItemsById],
  );

  const openPrintDialog = (order: PrintableOrder) => {
    setPrintTargetOrder(order);
    setPaymentType(null);
    setPrintDialogOpen(true);
  };

  const closePrintDialog = () => {
    setPrintDialogOpen(false);
    setPrintTargetOrder(null);
    setPaymentType(null);
  };

  const handlePrintInvoice = () => {
    if (!printTargetOrder || !paymentType) {
      toast({
        title: "Select payment type",
        description: "Choose Cash or UPI before generating the bill.",
        variant: "destructive",
      });
      return;
    }

    try {
      const items = parseOrderItems(printTargetOrder);

      printA4Invoice({
        order: printTargetOrder,
        items,
        paymentType,
        restaurantName: printTargetOrder.vendorDetails?.name ?? undefined,
        restaurantAddress: printTargetOrder.vendorDetails?.address ?? undefined,
        restaurantPhone: printTargetOrder.vendorDetails?.phone ?? undefined,
      });

      toast({
        title: "Success",
        description: "A4 bill sent to printer",
      });
      closePrintDialog();
    } catch (error) {
      console.error("Receipt print error:", error);
      toast({
        title: "Error",
        description: "Failed to generate bill. Please try again.",
        variant: "destructive",
      });
    }
  };

  /** ✅ Realtime order fetching (poll every 5s) */
  const { data: orders, isLoading } = useQuery<PrintableOrder[]>({
    queryKey: ["/api/vendor/orders"],
    refetchInterval: 5000,
  });

  /** ✅ Update order status mutation */
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: number; status: string }) => {
      return await apiRequest("PUT", `/api/vendor/orders/${orderId}/status`, { status });
    },
    onMutate: async ({ orderId, status }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/vendor/orders"] });
      const previousOrders = queryClient.getQueryData<PrintableOrder[]>(["/api/vendor/orders"]);

      queryClient.setQueryData<PrintableOrder[]>(["/api/vendor/orders"], (old) =>
        old
          ? old.map((o) => (o.id === orderId ? { ...o, status } : o))
          : old
      );

      return { previousOrders };
    },
    onError: (_, __, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(["/api/vendor/orders"], context.previousOrders);
      }
      toast({
        title: "Error",
        description: "Failed to update order status",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Order status updated",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/orders"] });
    },
  });

  /** ✅ Workflow helpers */
  const getNextStatus = (current: string) => {
    const flow = ["pending", "accepted", "preparing", "ready", "delivered"];
    const idx = flow.indexOf(current);
    return flow[idx + 1] || current;
  };

  const canAdvanceStatus = (status: string) => status !== "delivered";

  const tableOptions = useMemo(
    () =>
      (tables ?? []).map((table) => ({
        id: table.id,
        tableNumber: table.tableNumber,
        label: table.isManual ? `Manual Table ${table.tableNumber}` : undefined,
      })),
    [tables],
  );

  const manualOrderMenuItems = useMemo(() => menuItems ?? [], [menuItems]);

  const manualOrderDisabled = loadingTables || loadingMenuItems;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Order Management</h1>
          <p className="text-muted-foreground mt-2">
            Track and manage all dine-in orders
          </p>
        </div>
        <ManualOrderDialog
          trigger={
            <Button disabled={manualOrderDisabled}>
              <Plus className="mr-2 h-4 w-4" />
              New Order
            </Button>
          }
          tables={tableOptions}
          menuItems={manualOrderMenuItems}
          submitEndpoint="/api/vendor/orders"
          tablesLoading={loadingTables}
          itemsLoading={loadingMenuItems}
          invalidateQueryKeys={[["/api/vendor/orders"], ["/api/vendor/tables"]]}
          onOrderCreated={() => setPaymentType(null)}
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : orders && orders.length > 0 ? (
        <div className="space-y-4">
          {orders.map((order) => {
            const parsedItems = parseOrderItems(order);

            return (
            <Card
              key={order.id}
              className="hover-elevate"
              data-testid={`card-order-${order.id}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-3">
                      <span>Order #{order.id}</span>
                      <StatusBadge status={order.status as any} />
                    </CardTitle>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        {new Date(order.createdAt!).toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold text-green-600">
                        ₹{order.totalAmount}
                      </div>
                    </div>
                  </div>

                  {canAdvanceStatus(order.status) && (
                    <Button
                      size="sm"
                      onClick={() =>
                        updateStatusMutation.mutate({
                          orderId: order.id,
                          status: getNextStatus(order.status),
                        })
                      }
                      disabled={updateStatusMutation.isPending}
                    >
                      Mark as {getNextStatus(order.status)}
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Customer:</span>{" "}
                      <span className="font-medium">
                        {order.customerName || "Guest"}
                      </span>
                    </div>
                    {order.customerPhone && (
                      <div>
                        <span className="text-muted-foreground">Phone:</span>{" "}
                        <span className="font-medium">{order.customerPhone}</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-3">
                    <h4 className="font-semibold text-sm mb-2">Order Items</h4>
                    <div className="space-y-2">
                      {parsedItems.length > 0 ? (
                        parsedItems.map((item, idx) => {
                          const baseAmount =
                            item.gstMode === "include" ? item.lineTotal : item.baseSubtotal;
                          return (
                          <div
                            key={idx}
                            className="flex flex-col gap-1 text-sm"
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span>
                                {item.quantity}x {item.name}
                              </span>
                              <span className="font-mono">
                                ₹{baseAmount.toFixed(2)}
                              </span>
                            </div>
                            {item.gstAmount > 0 && item.gstMode === "exclude" && (
                              <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                                <span>GST {item.gstRate}%</span>
                                <span>₹{item.gstAmount.toFixed(2)}</span>
                              </div>
                            )}
                            {item.gstAmount > 0 && item.gstMode === "include" && (
                              <div className="text-xs text-muted-foreground">
                                GST {item.gstRate}% included (₹{item.gstAmount.toFixed(2)})
                              </div>
                            )}
                          </div>
                          );
                        })
                      ) : (
                        <div className="text-sm text-muted-foreground italic">
                          No items recorded
                        </div>
                      )}
                    </div>
                  </div>

                  {order.customerNotes && (
                    <div className="border-t pt-3">
                      <span className="text-sm text-muted-foreground">Notes: </span>
                      <span className="text-sm">{order.customerNotes}</span>
                    </div>
                  )}

                  <div className="border-t pt-3 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => openPrintDialog(order)}
                    >
                      <Printer className="h-4 w-4 mr-2" />
                      Generate Bill (A4)
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Clock className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
            <p className="text-sm text-muted-foreground">
              Orders will appear here when customers start placing them
            </p>
          </CardContent>
        </Card>
      )}
      <Dialog open={printDialogOpen} onOpenChange={(open) => (open ? setPrintDialogOpen(true) : closePrintDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Bill</DialogTitle>
            <DialogDescription>
              Select the payment type to include on the invoice before printing.
            </DialogDescription>
          </DialogHeader>

          {printTargetOrder && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-4 text-sm">
                <div className="font-semibold">Order #{printTargetOrder.id}</div>
                <div className="mt-2 grid gap-1 text-muted-foreground">
                  <span>Total Amount: <span className="font-medium text-primary">₹{printTargetOrder.totalAmount}</span></span>
                  <span>Customer: {printTargetOrder.customerName || "Guest"}</span>
                  <span>Table: {printTargetOrder.tableId ?? "N/A"}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-type">Payment Type</Label>
                <RadioGroup
                  id="payment-type"
                  value={paymentType ?? undefined}
                  onValueChange={(value) => setPaymentType(value as PaymentType)}
                  className="grid gap-3"
                >
                  <div className="flex items-center space-x-3 rounded-md border p-3">
                    <RadioGroupItem value="cash" id="payment-cash" />
                    <Label htmlFor="payment-cash" className="flex flex-col">
                      <span className="font-medium">Cash Payment</span>
                      <span className="text-sm text-muted-foreground">
                        Customer paid the bill using cash.
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3 rounded-md border p-3">
                    <RadioGroupItem value="upi" id="payment-upi" />
                    <Label htmlFor="payment-upi" className="flex flex-col">
                      <span className="font-medium">UPI Payment</span>
                      <span className="text-sm text-muted-foreground">
                        Customer paid the bill through a UPI transaction.
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closePrintDialog}>
              Cancel
            </Button>
            <Button onClick={handlePrintInvoice} disabled={!paymentType || !printTargetOrder}>
              <Printer className="mr-2 h-4 w-4" />
              Print A4 Bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
