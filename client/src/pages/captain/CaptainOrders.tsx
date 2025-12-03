import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Clock, ChefHat, Plus, UtensilsCrossed, Printer } from "lucide-react";
import type { MenuCategory, MenuItem, Order, Table, KotTicket } from "@shared/schema";
import { useOrderStream } from "@/hooks/useOrderStream";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { printA4Kot, printThermalReceipt, printA4Invoice, PaymentType, type ReceiptItem } from "@/lib/receipt-utils";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import ManualOrderDialog from "@/components/orders/ManualOrderDialog";

type CaptainOrder = Order & {
  tableNumber: number | null;
  vendorDetails?: {
    name: string | null;
    address?: string | null;
    phone?: string | null;
    gstin?: string | null;
  } | null;
  kotTicket?: KotTicket | null;
};

type CaptainTable = Table & {
  label?: string | null;
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
  const { toast } = useToast();
  const { data: orders, isLoading } = useQuery<CaptainOrder[]>({
    queryKey: ["/api/captain/orders"],
    refetchInterval: 5000,
  });

  const { data: tables, isLoading: loadingTables } = useQuery<CaptainTable[]>({
    queryKey: ["/api/captain/tables"],
    refetchInterval: 5000,
  });

  const { data: menuItems, isLoading: loadingMenuItems } = useQuery<MenuItem[]>({
    queryKey: ["/api/captain/menu/items"],
  });

  const { data: categories, isLoading: loadingCategories } = useQuery<MenuCategory[]>({
    queryKey: ["/api/captain/menu/categories"],
  });

  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printTargetOrder, setPrintTargetOrder] = useState<CaptainOrder | null>(null);
  const [kotFormat, setKotFormat] = useState<"thermal" | "a4">("thermal");
  
  // Bill generation state
  const [billDialogOpen, setBillDialogOpen] = useState(false);
  const [billTargetOrder, setBillTargetOrder] = useState<CaptainOrder | null>(null);
  const [billFormat, setBillFormat] = useState<"thermal" | "a4">("a4");
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("fixed");
  const [discountValue, setDiscountValue] = useState<string>("");

  /** Update order status mutation */
  const updateStatusMutation = useMutation({
    mutationFn: async ({
      orderId,
      status,
      orderType,
    }: {
      orderId: number;
      status: string;
      orderType: "dine-in" | "delivery" | "pickup";
    }) => {
      return await apiRequest("PUT", `/api/captain/orders/${orderId}/status`, {
        status,
        orderType,
      });
    },
    onMutate: async ({ orderId, status }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/captain/orders"] });
      const previousOrders = queryClient.getQueryData<CaptainOrder[]>(["/api/captain/orders"]);

      queryClient.setQueryData<CaptainOrder[]>(["/api/captain/orders"], (old) => {
        if (!old) return old;
        if (status === "completed" || status === "delivered") {
          return old.filter((order) => order.id !== orderId);
        }
        return old.map((order) => (order.id === orderId ? { ...order, status } : order));
      });

      return { previousOrders };
    },
    onError: (_, __, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(["/api/captain/orders"], context.previousOrders);
      }
      toast({
        title: "Error",
        description: "Failed to update order status",
        variant: "destructive",
      });
    },
    onSuccess: async () => {
      toast({
        title: "Success",
        description: "Order status updated",
      });
      await queryClient.refetchQueries({ queryKey: ["/api/captain/orders"], type: "active" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/captain/orders"] });
    },
  });

  /** Workflow helpers */
  const getNextStatus = (current: string) => {
    const flow = ["pending", "accepted", "preparing", "ready", "delivered", "completed"];
    const idx = flow.indexOf(current);
    return flow[idx + 1] || current;
  };

  const canAdvanceStatus = (status: string) => status !== "completed" && status !== "delivered";

  /** Complete order mutation (for bill generation) */
  const completeOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      return await apiRequest("PUT", `/api/captain/orders/${orderId}/status`, {
        status: "completed",
        orderType: "dine-in",
      });
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["/api/captain/orders"], type: "active" });
      queryClient.invalidateQueries({ queryKey: ["/api/captain/tables"] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/captain/orders"] });
    },
  });

  const tableOptions = useMemo(
    () =>
      (tables ?? []).map((table) => ({
        id: table.id,
        tableNumber: table.tableNumber,
        label: table.label ?? undefined,
      })),
    [tables],
  );

  const manualOrderMenuItems = useMemo(() => menuItems ?? [], [menuItems]);
  const manualOrderDisabled = loadingTables || loadingMenuItems || loadingCategories;

  const handlePrintKot = async () => {
    if (!printTargetOrder) {
      return;
    }

    try {
      // Fetch all items with printed status
      const allItemsResponse = await apiRequest("GET", `/api/orders/${printTargetOrder.id}/kot/all-items`);
      const allItemsData = await allItemsResponse.json();
      const allItems = allItemsData.items || [];

      if (allItems.length === 0) {
        toast({
          title: "No items to print",
          description: "This order has no items.",
          variant: "destructive",
        });
        return;
      }

      // Get unprinted items for marking as printed
      const unprintedResponse = await apiRequest("GET", `/api/orders/${printTargetOrder.id}/kot/unprinted`);
      const unprintedData = await unprintedResponse.json();
      const unprintedItems = unprintedData.items || [];

      // Parse all items for printing (with printed status)
      const items: ReceiptItem[] = allItems.map((item: any) => {
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

        return {
          name: item.name || "Item",
          quantity,
          unitPrice: Number(baseUnitPrice.toFixed(2)),
          unitPriceWithTax: Number(baseUnitPrice.toFixed(2)),
          baseSubtotal: Number(Number((item.subtotal ?? item.price ?? 0) * quantity).toFixed(2)),
          gstRate: Number(item.gstRate ?? 0),
          gstMode: (item.gstMode === "include" ? "include" : "exclude") as "include" | "exclude",
          gstAmount: Number(item.gstAmount ?? 0),
          lineTotal: Number(Number((item.subtotal ?? item.price ?? 0) * quantity).toFixed(2)),
          addons: Array.isArray(item.addons) ? item.addons.map((a: any) => ({
            name: String(a.name ?? "Addon"),
            price: Number.isFinite(a.price) ? Number(a.price.toFixed(2)) : undefined,
          })) : undefined,
          isPrinted: item.isPrinted ?? false,
          isPartiallyPrinted: item.isPartiallyPrinted ?? false,
          printedQuantity: item.kotPrintedQuantity ?? 0,
          unprintedQuantity: item.unprintedQuantity ?? quantity,
        };
      });

      if (kotFormat === "thermal") {
        printThermalReceipt({
          order: printTargetOrder,
          items,
          restaurantName: printTargetOrder.vendorDetails?.name ?? undefined,
          restaurantAddress: printTargetOrder.vendorDetails?.address ?? undefined,
          restaurantPhone: printTargetOrder.vendorDetails?.phone ?? undefined,
          restaurantGstin: printTargetOrder.vendorDetails?.gstin ?? undefined,
          title: "Kitchen Order Ticket",
          ticketNumber: printTargetOrder.kotTicket?.ticketNumber ?? `KOT-${printTargetOrder.id}`,
          hidePricing: true,
        });
      } else {
        printA4Kot({
          order: printTargetOrder,
          items,
          restaurantName: printTargetOrder.vendorDetails?.name ?? undefined,
          restaurantAddress: printTargetOrder.vendorDetails?.address ?? undefined,
          restaurantPhone: printTargetOrder.vendorDetails?.phone ?? undefined,
          restaurantGstin: printTargetOrder.vendorDetails?.gstin ?? undefined,
          title: "Kitchen Order Ticket",
          ticketNumber: printTargetOrder.kotTicket?.ticketNumber ?? `KOT-${printTargetOrder.id}`,
          hidePricing: true,
        });
      }

      // Mark unprinted items as printed (only if there are unprinted items)
      if (unprintedItems.length > 0) {
        try {
          await apiRequest("POST", `/api/orders/${printTargetOrder.id}/kot/mark-printed`, {
            items: unprintedItems.map((item: any) => ({
              itemId: item.itemId ?? item.id ?? 0,
              quantity: item.quantity ?? 1,
            })),
          });
          // Invalidate queries to refresh order data
          queryClient.invalidateQueries({ queryKey: ["/api/captain/orders"] });
        } catch (markError) {
          console.error("Failed to mark items as printed:", markError);
          // Don't fail the print operation if marking fails
        }
      }

      toast({
        title: "KOT ready",
        description: `${kotFormat === "thermal" ? "Thermal" : "A4"} ticket sent to printer.`,
      });
      closePrintDialog();
    } catch (error) {
      console.error("Captain KOT print error:", error);
      toast({
        title: "Print failed",
        description: "Could not print the kitchen order ticket. Please try again.",
        variant: "destructive",
      });
    }
  };

  const openPrintDialog = (order: CaptainOrder) => {
    setPrintTargetOrder(order);
    setKotFormat("thermal");
    setPrintDialogOpen(true);
  };

  const closePrintDialog = () => {
    setPrintDialogOpen(false);
    setPrintTargetOrder(null);
  };

  const openBillDialog = (order: CaptainOrder) => {
    setBillTargetOrder(order);
    // Auto-populate payment method if it exists in the order
    setPaymentType(order.paymentMethod as PaymentType | null || null);
    setBillFormat("a4");
    setBillDialogOpen(true);
  };

  const closeBillDialog = () => {
    setBillDialogOpen(false);
    setBillTargetOrder(null);
    setPaymentType(null);
    setDiscountType("fixed");
    setDiscountValue("");
  };

  /** Parse order items for bill generation (simplified version) */
  const parseOrderItemsForBill = (order: CaptainOrder): ReceiptItem[] => {
    const rawItems = parseOrderItems(order);
    return rawItems.map((item) => ({
      name: item.name ?? "Item",
      quantity: item.quantity ?? 1,
      unitPrice: Number(item.price ?? 0),
      unitPriceWithTax: Number(item.price ?? 0),
      baseSubtotal: Number(item.subtotal ?? item.price ?? 0) * (item.quantity ?? 1),
      gstRate: 0,
      gstMode: "exclude" as const,
      gstAmount: 0,
      lineTotal: Number(item.subtotal ?? item.price ?? 0) * (item.quantity ?? 1),
    }));
  };

  const handlePrintBill = async () => {
    if (!billTargetOrder) {
      return;
    }

    const orderId = billTargetOrder.id;
    const items = parseOrderItemsForBill(billTargetOrder);

    // Use existing payment method or the selected one
    const finalPaymentType = billTargetOrder.paymentMethod as PaymentType || paymentType;

    if (!finalPaymentType) {
      toast({
        title: "Select payment type",
        description: "Choose Cash or UPI before generating the bill.",
        variant: "destructive",
      });
      return;
    }

    // Save payment method to database if it's not already saved
    if (!billTargetOrder.paymentMethod) {
      try {
        await apiRequest("PATCH", `/api/orders/${orderId}/payment-method`, {
          paymentMethod: finalPaymentType,
        });
        // Invalidate queries to refresh order data with payment method
        queryClient.invalidateQueries({ queryKey: ["/api/captain/orders"] });
      } catch (error) {
        console.error("Failed to save payment method:", error);
        // Continue with printing even if saving fails
      }
    }

    if (billFormat === "a4") {
      try {
        await printA4Invoice({
          order: billTargetOrder,
          items,
          paymentType: finalPaymentType,
          restaurantName: billTargetOrder.vendorDetails?.name ?? undefined,
          restaurantAddress: billTargetOrder.vendorDetails?.address ?? undefined,
          restaurantPhone: billTargetOrder.vendorDetails?.phone ?? undefined,
          paymentQrCodeUrl: billTargetOrder.vendorDetails?.paymentQrCodeUrl ?? undefined,
          discountType: discountValue && Number.parseFloat(discountValue) > 0 ? discountType : undefined,
          discountValue: discountValue && Number.parseFloat(discountValue) > 0 ? Number.parseFloat(discountValue) : undefined,
        });
      } catch (error) {
        console.error("Receipt print error:", error);
        toast({
          title: "Error",
          description: "Failed to generate bill. Please try again.",
          variant: "destructive",
        });
        return;
      }
    } else {
      try {
        await printThermalReceipt({
          order: billTargetOrder,
          items,
          paymentType: finalPaymentType,
          restaurantName: billTargetOrder.vendorDetails?.name ?? undefined,
          restaurantAddress: billTargetOrder.vendorDetails?.address ?? undefined,
          restaurantPhone: billTargetOrder.vendorDetails?.phone ?? undefined,
          paymentQrCodeUrl: billTargetOrder.vendorDetails?.paymentQrCodeUrl ?? undefined,
          title: "Customer Bill",
          ticketNumber: `BILL-${orderId}`,
          discountType: discountValue && Number.parseFloat(discountValue) > 0 ? discountType : undefined,
          discountValue: discountValue && Number.parseFloat(discountValue) > 0 ? Number.parseFloat(discountValue) : undefined,
        });
      } catch (error) {
        console.error("Thermal bill print error:", error);
        toast({
          title: "Error",
          description: "Failed to print thermal bill. Please try again.",
          variant: "destructive",
        });
        return;
      }
    }

    try {
      await completeOrderMutation.mutateAsync(orderId);
    } catch (error) {
      console.error("Failed to mark order completed after billing:", error);
      toast({
        title: "Order completion failed",
        description: "Bill was printed, but the order could not be marked completed. Please retry.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Bill generated",
      description: "Order closed and table marked available.",
    });
    closeBillDialog();
  };

  useOrderStream({
    onEvent: (event) => {
      if (
        event.type === "order-created" ||
        event.type === "order-status-changed" ||
        event.type === "kot-created"
      ) {
        queryClient.invalidateQueries({ queryKey: ["/api/captain/orders"] });
      }
    },
  });

  const activeOrders = useMemo(
    () => (orders ?? []).filter((order) => order.status !== "delivered"),
    [orders],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Orders</h1>
          <p className="text-muted-foreground mt-2">
            View and manage dine-in orders for your assigned tables
          </p>
        </div>
        <ManualOrderDialog
          trigger={
            <Button disabled={manualOrderDisabled}>
              <Plus className="mr-2 h-4 w-4" />
              Create Order
            </Button>
          }
          tables={tableOptions}
          menuItems={manualOrderMenuItems}
          categories={categories ?? []}
          submitEndpoint="/api/captain/orders"
          tablesLoading={loadingTables}
          itemsLoading={loadingMenuItems || loadingCategories}
          invalidateQueryKeys={[["/api/captain/orders"], ["/api/captain/tables"]]}
        />
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
                        <button
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
                            canAdvanceStatus(order.status) ? "cursor-pointer" : "cursor-default opacity-80",
                          )}
                          onClick={() => {
                            if (!canAdvanceStatus(order.status) || updateStatusMutation.isPending) return;
                            updateStatusMutation.mutate({
                              orderId: order.id,
                              status: getNextStatus(order.status),
                              orderType: "dine-in",
                            });
                          }}
                          disabled={!canAdvanceStatus(order.status) || updateStatusMutation.isPending}
                          title={
                            canAdvanceStatus(order.status)
                              ? `Click to mark as ${getNextStatus(order.status)}`
                              : "Order completed"
                          }
                        >
                          <StatusBadge status={order.status as any} />
                        </button>
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

                  <div className="border-t pt-3">
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span>Kitchen Order Ticket</span>
                      {order.kotTicket?.createdAt && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(order.kotTicket.createdAt).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {order.kotTicket
                        ? `KOT #${order.kotTicket.ticketNumber}`
                        : "Generating KOT..."}
                    </div>
                    {order.kotTicket?.customerNotes && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {order.kotTicket.customerNotes}
                      </p>
                    )}
                    <div className="flex flex-col gap-2 mt-3 md:flex-row">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full md:w-auto"
                        onClick={() => openPrintDialog(order)}
                      >
                        <ChefHat className="mr-2 h-4 w-4" />
                        Print KOT
                      </Button>
                      {(order.status === "ready" || order.status === "delivered") && (
                        <Button
                          variant="default"
                          size="sm"
                          className="w-full md:w-auto"
                          onClick={() => openBillDialog(order)}
                          disabled={completeOrderMutation.isPending}
                        >
                          <Printer className="mr-2 h-4 w-4" />
                          Print Bill
                        </Button>
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

      <Dialog open={printDialogOpen} onOpenChange={(open) => (open ? setPrintDialogOpen(true) : closePrintDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Print Kitchen Ticket</DialogTitle>
            <DialogDescription>
              Choose the preferred format before sending the ticket to the kitchen.
            </DialogDescription>
          </DialogHeader>

          {printTargetOrder && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-4 text-sm">
                <div className="font-semibold">Order #{printTargetOrder.id}</div>
                <div className="mt-2 grid gap-1 text-muted-foreground">
                  <span>Table: {printTargetOrder.tableNumber ?? "N/A"}</span>
                  {printTargetOrder.kotTicket?.ticketNumber && (
                    <span>KOT #: {printTargetOrder.kotTicket.ticketNumber}</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="captain-print-format">Print Format</Label>
                <RadioGroup
                  id="captain-print-format"
                  value={kotFormat}
                  onValueChange={(value) => setKotFormat(value as "thermal" | "a4")}
                  className="grid gap-3"
                >
                  <div className="flex items-center space-x-3 rounded-md border p-3">
                    <RadioGroupItem value="thermal" id="captain-print-format-thermal" />
                    <Label htmlFor="captain-print-format-thermal" className="flex flex-col">
                      <span className="font-medium">Thermal Ticket</span>
                      <span className="text-sm text-muted-foreground">
                        Compact ticket for thermal printers.
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3 rounded-md border p-3">
                    <RadioGroupItem value="a4" id="captain-print-format-a4" />
                    <Label htmlFor="captain-print-format-a4" className="flex flex-col">
                      <span className="font-medium">A4 Ticket</span>
                      <span className="text-sm text-muted-foreground">
                        Full-page ticket for standard printers.
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
            <Button onClick={handlePrintKot} disabled={!printTargetOrder}>
              <ChefHat className="mr-2 h-4 w-4" />
              Print KOT
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bill Generation Dialog */}
      <Dialog open={billDialogOpen} onOpenChange={(open) => (open ? setBillDialogOpen(true) : closeBillDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Bill</DialogTitle>
            <DialogDescription>
              Choose the format and payment details before printing the customer bill.
            </DialogDescription>
          </DialogHeader>

          {billTargetOrder && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <div className="font-semibold text-base flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  Order #{billTargetOrder.id}
                </div>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total Amount:</span>
                    <span className="font-bold text-primary text-base">
                      ₹{Number(billTargetOrder.totalAmount).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="font-medium">{billTargetOrder.customerName || "Guest"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Table:</span>
                    <span className="font-medium">
                      {billTargetOrder.tableNumber ?? "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="captain-bill-format" className="text-base font-semibold">Print Format</Label>
                <RadioGroup
                  id="captain-bill-format"
                  value={billFormat}
                  onValueChange={(value) => setBillFormat(value as "thermal" | "a4")}
                  className="grid gap-3"
                >
                  <div className="flex items-start space-x-3 rounded-lg border-2 p-4 transition-all hover:bg-muted/50 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <RadioGroupItem value="thermal" id="captain-bill-format-thermal" className="mt-1" />
                    <Label htmlFor="captain-bill-format-thermal" className="flex flex-col flex-1 cursor-pointer">
                      <span className="font-semibold text-base mb-1">Thermal Receipt</span>
                      <span className="text-sm text-muted-foreground">
                        Compact ticket for 58mm/80mm printers.
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-start space-x-3 rounded-lg border-2 p-4 transition-all hover:bg-muted/50 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <RadioGroupItem value="a4" id="captain-bill-format-a4" className="mt-1" />
                    <Label htmlFor="captain-bill-format-a4" className="flex flex-col flex-1 cursor-pointer">
                      <span className="font-semibold text-base mb-1">A4 Invoice</span>
                      <span className="text-sm text-muted-foreground">
                        Detailed invoice with payment information.
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {!billTargetOrder?.paymentMethod && (
                <div className="space-y-3">
                  <Label htmlFor="captain-payment-type" className="text-base font-semibold">
                    Payment Type
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <RadioGroup
                    id="captain-payment-type"
                    value={paymentType ?? undefined}
                    onValueChange={(value) => setPaymentType(value as PaymentType)}
                    className="grid gap-3"
                  >
                    <div className="flex items-start space-x-3 rounded-lg border-2 p-4 transition-all hover:bg-muted/50 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <RadioGroupItem value="cash" id="captain-payment-cash" className="mt-1" />
                      <Label htmlFor="captain-payment-cash" className="flex flex-col flex-1 cursor-pointer">
                        <span className="font-semibold text-base mb-1">Cash Payment</span>
                        <span className="text-sm text-muted-foreground">
                          Customer paid the bill using cash.
                        </span>
                      </Label>
                    </div>
                    <div className="flex items-start space-x-3 rounded-lg border-2 p-4 transition-all hover:bg-muted/50 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <RadioGroupItem value="upi" id="captain-payment-upi" className="mt-1" />
                      <Label htmlFor="captain-payment-upi" className="flex flex-col flex-1 cursor-pointer">
                        <span className="font-semibold text-base mb-1">UPI Payment</span>
                        <span className="text-sm text-muted-foreground">
                          Customer paid the bill through a UPI transaction.
                        </span>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              <div className="space-y-3 border-t pt-4">
                <Label htmlFor="captain-orders-discount-type" className="text-base font-semibold">Discount (Optional)</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="captain-orders-discount-type" className="text-sm">Discount Type</Label>
                    <Select value={discountType} onValueChange={(value) => {
                      setDiscountType(value as "percentage" | "fixed");
                      setDiscountValue("");
                    }}>
                      <SelectTrigger id="captain-orders-discount-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="captain-orders-discount-value" className="text-sm">
                      Discount Value {discountType === "percentage" ? "(%)" : "(₹)"}
                    </Label>
                    <Input
                      id="captain-orders-discount-value"
                      type="number"
                      min="0"
                      step={discountType === "percentage" ? "0.01" : "1"}
                      max={discountType === "percentage" ? "100" : undefined}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={discountType === "percentage" ? "e.g., 10" : "e.g., 50"}
                    />
                  </div>
                </div>
                {discountValue && Number.parseFloat(discountValue) > 0 && billTargetOrder && (() => {
                  const totalAmount = Number(billTargetOrder.totalAmount) || 0;
                  const discountAmount = discountType === "percentage"
                    ? (totalAmount * Number.parseFloat(discountValue) / 100)
                    : Math.min(Number.parseFloat(discountValue), totalAmount);
                  const finalTotal = totalAmount - discountAmount;
                  return (
                    <div className="rounded-md bg-muted px-3 py-2 text-sm">
                      <div className="flex items-center justify-between text-muted-foreground mb-1">
                        <span>Subtotal:</span>
                        <span>₹{totalAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-green-600 font-medium mb-1">
                        <span>Discount:</span>
                        <span>-₹{discountAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-base font-semibold border-t pt-1 mt-1">
                        <span>Total:</span>
                        <span>₹{finalTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeBillDialog}>
              Cancel
            </Button>
            <Button
              onClick={handlePrintBill}
              disabled={
                !billTargetOrder ||
                (!billTargetOrder?.paymentMethod && !paymentType) ||
                completeOrderMutation.isPending
              }
            >
              <Printer className="mr-2 h-4 w-4" />
              Print Bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

