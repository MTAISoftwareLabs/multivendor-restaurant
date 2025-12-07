import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Grid3x3, Clock, Plus, ShoppingCart, Printer, ChefHat } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PaymentType, printA4Invoice, printThermalReceipt, printA4Kot, type ReceiptItem } from "@/lib/receipt-utils";
import { cn } from "@/lib/utils";
import type { MenuAddon, MenuCategory, MenuItem, Order, Table } from "@shared/schema";
import { useOrderStream } from "@/hooks/useOrderStream";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

type MenuItemWithAddons = MenuItem & { addons?: MenuAddon[] };

interface TableWithOrders extends Table {
  currentOrders?: Order[];
}

type OrderWithKot = Order & {
  kotTicket?: {
    id: number;
    ticketNumber: string;
    createdAt?: string | null;
  } | null;
};

type DisplayOrderItem = {
  name: string;
  quantity: number;
  lineTotal: number;
  gstAmount: number;
  gstRate: number;
  addons?: string[];
};

const parseOrderItemsForDisplay = (order: Order): DisplayOrderItem[] => {
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

export default function CaptainDashboard() {
  const { toast } = useToast();
  const [kotDialogOpen, setKotDialogOpen] = useState(false);
  const [kotTargetOrder, setKotTargetOrder] = useState<OrderWithKot | null>(null);
  const [kotFormat, setKotFormat] = useState<"thermal" | "a4">("thermal");
  const [billDialogOpen, setBillDialogOpen] = useState(false);
  const [billTargetOrder, setBillTargetOrder] = useState<OrderWithKot | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);
  const [billFormat, setBillFormat] = useState<"thermal" | "a4">("a4");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("fixed");
  const [discountValue, setDiscountValue] = useState<string>("");

  // Poll for table updates every 5 seconds for real-time order visibility
  const { data: assignedTables, isLoading } = useQuery<TableWithOrders[]>({
    queryKey: ["/api/captain/tables"],
    refetchInterval: 5000,
  });

  const { data: menuItems, isLoading: loadingMenuItems } = useQuery<MenuItemWithAddons[]>({
    queryKey: ["/api/captain/menu/items"],
  });

  const { data: categories, isLoading: loadingCategories } = useQuery<MenuCategory[]>({
    queryKey: ["/api/captain/menu/categories"],
  });

  const tableOptions = useMemo(
    () =>
      (assignedTables ?? []).map((table) => ({
        id: table.id,
        tableNumber: table.tableNumber,
      })),
    [assignedTables],
  );

  const manualOrderMenuItems = useMemo(() => menuItems ?? [], [menuItems]);

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
    onSuccess: async () => {
      toast({
        title: "Success",
        description: "Order status updated",
      });
      await queryClient.refetchQueries({ queryKey: ["/api/captain/orders"], type: "active" });
      queryClient.invalidateQueries({ queryKey: ["/api/captain/tables"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update order status",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/captain/orders"] });
    },
  });

  const completeOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      await apiRequest("PUT", `/api/captain/orders/${orderId}/status`, {
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

  const getNextStatus = (current: string) => {
    const flow = ["pending", "accepted", "preparing", "ready", "delivered", "completed"];
    const idx = flow.indexOf(current);
    return flow[idx + 1] || current;
  };

  const canAdvanceStatus = (status: string) => status !== "completed" && status !== "delivered";

  const openKotDialog = (order: OrderWithKot) => {
    setKotTargetOrder(order);
    setKotFormat("thermal");
    setKotDialogOpen(true);
  };

  const closeKotDialog = () => {
    setKotDialogOpen(false);
    setKotTargetOrder(null);
  };

  const openBillDialog = (order: OrderWithKot) => {
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

  const parseOrderItems = (order: Order): ReceiptItem[] => {
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
      };
    });
  };

  const handlePrintKot = async () => {
    if (!kotTargetOrder) {
      return;
    }

    try {
      // Fetch all items with printed status
      const allItemsResponse = await apiRequest("GET", `/api/orders/${kotTargetOrder.id}/kot/all-items`);
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

      // Parse all items for printing (with printed status)
      const items = allItems.map((item: any) => {
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
          order: kotTargetOrder as any,
          items,
          title: "Kitchen Order Ticket",
          ticketNumber: (kotTargetOrder as any).kotTicket?.ticketNumber ?? `KOT-${kotTargetOrder.id}`,
          hidePricing: true,
        });
      } else {
        printA4Kot({
          order: kotTargetOrder as any,
          items,
          title: "Kitchen Order Ticket",
          ticketNumber: (kotTargetOrder as any).kotTicket?.ticketNumber ?? `KOT-${kotTargetOrder.id}`,
          hidePricing: true,
        });
      }

      // Items are automatically marked as printed when order status changes from pending
      // Invalidate queries to refresh order data
      queryClient.invalidateQueries({ queryKey: ["/api/captain/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/captain/tables"] });

      toast({
        title: "KOT ready",
        description: `${kotFormat === "thermal" ? "Thermal" : "A4"} ticket sent to printer.`,
      });
      closeKotDialog();
    } catch (error) {
      console.error("Captain KOT print error:", error);
      toast({
        title: "Print failed",
        description: "Could not print the kitchen order ticket. Please try again.",
        variant: "destructive",
      });
    }
  };

  const parseOrderItemsForBill = (order: Order): ReceiptItem[] => {
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
      baseSubtotal = Number.isFinite(baseSubtotal) ? Number(baseSubtotal.toFixed(2)) : 0;

      const gstRate = Number(item.gstRate ?? 0);
      const gstMode: "include" | "exclude" = item.gstMode === "include" ? "include" : "exclude";
      let lineTotal = Number.parseFloat(String(item.subtotalWithGst ?? item.lineTotal ?? item.total ?? 0));
      lineTotal = Number.isFinite(lineTotal) && lineTotal > 0 ? Number(lineTotal.toFixed(2)) : baseSubtotal;
      let gstAmount = Number.parseFloat(String(item.gstAmount ?? 0));
      gstAmount = Number.isFinite(gstAmount) && gstAmount >= 0 ? Number(gstAmount.toFixed(2)) : 0;

      if (gstRate > 0 && gstAmount === 0) {
        if (gstMode === "include") {
          gstAmount = Number((lineTotal * (gstRate / (100 + gstRate))).toFixed(2));
          baseSubtotal = Number((lineTotal - gstAmount).toFixed(2));
        } else {
          gstAmount = Number((baseSubtotal * (gstRate / 100)).toFixed(2));
          lineTotal = Number((baseSubtotal + gstAmount).toFixed(2));
        }
      }

      return {
        name: item.name || "Item",
        quantity,
        unitPrice: Number(baseUnitPrice.toFixed(2)),
        unitPriceWithTax: Number(baseUnitPrice.toFixed(2)),
        baseSubtotal,
        gstRate,
        gstMode,
        gstAmount,
        lineTotal,
        addons: Array.isArray(item.addons) ? item.addons.map((a: any) => ({
          name: String(a.name ?? "Addon"),
          price: Number.isFinite(a.price) ? Number(a.price.toFixed(2)) : undefined,
        })) : undefined,
      };
    });
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
        queryClient.invalidateQueries({ queryKey: ["/api/captain/tables"] });
      } catch (error) {
        console.error("Failed to save payment method:", error);
        // Continue with printing even if saving fails
      }
    }

    if (billFormat === "a4") {
      try {
        await printA4Invoice({
          order: billTargetOrder as any,
          items,
          paymentType: finalPaymentType,
          restaurantName: undefined,
          restaurantAddress: undefined,
          restaurantPhone: undefined,
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
          order: billTargetOrder as any,
          items,
          paymentType: finalPaymentType,
          restaurantName: undefined,
          restaurantAddress: undefined,
          restaurantPhone: undefined,
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
        event.type === "order-updated" ||
        event.type === "kot-created"
      ) {
        queryClient.invalidateQueries({ queryKey: ["/api/captain/tables"] });
        queryClient.invalidateQueries({ queryKey: ["/api/captain/orders"] });
      }
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Assigned Tables</h1>
        <p className="text-muted-foreground mt-2">
          Manage orders for your assigned tables
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : assignedTables && assignedTables.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assignedTables.map((table) => {
            const order = table.currentOrders && table.currentOrders.length > 0 
              ? table.currentOrders[0] 
              : null;
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
              <Card key={table.id} className="flex flex-col" data-testid={`card-table-${table.id}`}>
                <CardHeader className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-2xl font-bold">Table {table.tableNumber}</CardTitle>
                    </div>
                    <Badge
                      variant={table.isActive ? "outline" : "secondary"}
                      className={table.isActive 
                        ? "" 
                        : "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"
                      }
                    >
                      {table.isActive ? "Available" : "Booked"}
                    </Badge>
                  </div>
                  {order && (
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
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

                      <div className="mt-auto flex flex-col gap-2">
                        {order.status !== "completed" && menuItems && categories && (
                          <ManualOrderDialog
                            trigger={
                              <Button size="sm" className="w-full">
                                Edit Order
                              </Button>
                            }
                            tables={tableOptions}
                            menuItems={manualOrderMenuItems}
                            categories={categories}
                            submitEndpoint={`/api/captain/orders/${order.id}`}
                            submitMethod="PUT"
                            mode="edit"
                            defaultTableId={table.id}
                            allowTableSelection={false}
                            initialOrder={order}
                            invalidateQueryKeys={[
                              ["/api/captain/orders"],
                              ["/api/captain/tables"],
                            ]}
                            onOrderCreated={() => {
                              queryClient.invalidateQueries({ queryKey: ["/api/captain/orders"] });
                              queryClient.invalidateQueries({ queryKey: ["/api/captain/tables"] });
                            }}
                          />
                        )}
                        <div className="flex gap-2">
                          {(order.status === "accepted" || order.status === "preparing" || order.status === "ready") && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openKotDialog(order as OrderWithKot)}
                              className="flex-1 gap-2"
                            >
                              <ChefHat className="h-4 w-4" />
                              Print KOT
                            </Button>
                          )}
                          {(order.status === "ready" || order.status === "delivered") && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => openBillDialog(order as OrderWithKot)}
                              className="flex-1 gap-2"
                            >
                              <Printer className="h-4 w-4" />
                              Print Bill
                            </Button>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {!table.isActive ? (
                        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                          <p className="font-medium text-foreground">No active order</p>
                          <p>This table is marked as booked but doesn't have an open order yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <ManualOrderDialog
                            trigger={
                              <Button
                                variant="secondary"
                                size="sm"
                                className="w-full"
                                disabled={loadingMenuItems || loadingCategories}
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                Create Order
                              </Button>
                            }
                            tables={tableOptions}
                            menuItems={manualOrderMenuItems}
                            categories={categories ?? []}
                            submitEndpoint="/api/captain/orders"
                            tablesLoading={isLoading}
                            itemsLoading={loadingMenuItems || loadingCategories}
                            defaultTableId={table.id}
                            allowTableSelection={false}
                            invalidateQueryKeys={[["/api/captain/tables"], ["/api/captain/orders"]]}
                          />
                          <div className="text-center py-4 text-sm text-muted-foreground">
                            No active orders
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Grid3x3 className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No tables assigned</h3>
            <p className="text-sm text-muted-foreground">
              Contact your manager to get table assignments
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={kotDialogOpen} onOpenChange={(open) => (open ? setKotDialogOpen(true) : closeKotDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Print Kitchen Ticket</DialogTitle>
            <DialogDescription>
              Choose the preferred format before sending the ticket to the kitchen.
            </DialogDescription>
          </DialogHeader>

          {kotTargetOrder && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-4 text-sm">
                <div className="font-semibold">Order #{kotTargetOrder.id}</div>
                <div className="mt-2 grid gap-1 text-muted-foreground">
                  <span>Table: {kotTargetOrder.tableId ?? "N/A"}</span>
                  {(kotTargetOrder as any).kotTicket?.ticketNumber && (
                    <span>KOT #: {(kotTargetOrder as any).kotTicket.ticketNumber}</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="captain-kot-format">Print Format</Label>
                <RadioGroup
                  id="captain-kot-format"
                  value={kotFormat}
                  onValueChange={(value) => setKotFormat(value as "thermal" | "a4")}
                  className="grid gap-3"
                >
                  <div className="flex items-center space-x-3 rounded-md border p-3">
                    <RadioGroupItem value="thermal" id="captain-kot-format-thermal" />
                    <Label htmlFor="captain-kot-format-thermal" className="flex flex-col">
                      <span className="font-medium">Thermal Ticket</span>
                      <span className="text-sm text-muted-foreground">
                        Compact ticket for thermal printers.
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3 rounded-md border p-3">
                    <RadioGroupItem value="a4" id="captain-kot-format-a4" />
                    <Label htmlFor="captain-kot-format-a4" className="flex flex-col">
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
            <Button variant="outline" onClick={closeKotDialog}>
              Cancel
            </Button>
            <Button onClick={handlePrintKot} disabled={!kotTargetOrder}>
              <ChefHat className="mr-2 h-4 w-4" />
              Print KOT
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                      {formatINR(billTargetOrder.totalAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="font-medium">{billTargetOrder.customerName || "Guest"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Table:</span>
                    <span className="font-medium">
                      {billTargetOrder.tableId ?? "N/A"}
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
                <Label htmlFor="captain-discount-type" className="text-base font-semibold">Discount (Optional)</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="captain-discount-type" className="text-sm">Discount Type</Label>
                    <Select value={discountType} onValueChange={(value) => {
                      setDiscountType(value as "percentage" | "fixed");
                      setDiscountValue("");
                    }}>
                      <SelectTrigger id="captain-discount-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="captain-discount-value" className="text-sm">
                      Discount Value {discountType === "percentage" ? "(%)" : "(₹)"}
                    </Label>
                    <Input
                      id="captain-discount-value"
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
