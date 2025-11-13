import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { LucideIcon } from "lucide-react";
import { ChefHat, Clock, Plus, Printer, Home, Truck, Package, ClipboardList } from "lucide-react";
import { PaymentType, printA4Invoice, printA4Kot, printThermalReceipt, type ReceiptItem } from "@/lib/receipt-utils";
import type { MenuAddon, MenuCategory, MenuItem, Order, Table, KotTicket } from "@shared/schema";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useOrderStream } from "@/hooks/useOrderStream";

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
  kotTicket?: KotTicket | null;
  tableNumber?: number | null;
  deliveryAddress?: string | null;
  pickupReference?: string | null;
  pickupTime?: string | null;
  fulfillmentType?: string | null;
  orderType?: string | null;
  channel?: string | null;
};

const ordersQueryKey = ["/api/vendor/orders"] as const;

type OrderType = "dining" | "delivery" | "pickup" | "all";

type ResolvedOrderType = Exclude<OrderType, "all">;

type StatusFilterValue =
  | "all"
  | "pending"
  | "preparing"
  | "ready"
  | "served"
  | "out_for_delivery"
  | "delivered"
  | "completed"
  | "dining"
  | "delivery"
  | "pickup";

const ORDER_TYPES: ReadonlyArray<{
  value: OrderType;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    value: "dining",
    label: "Dining Orders",
    description: "Shows orders for dine-in customers with item-level status control.",
    icon: Home,
  },
  {
    value: "delivery",
    label: "Home Delivery Orders",
    description: "Shows delivery orders with order-level tracking.",
    icon: Truck,
  },
  {
    value: "pickup",
    label: "Pickup Orders",
    description: "Shows takeaway orders with quick pickup workflows.",
    icon: Package,
  },
  {
    value: "all",
    label: "All Orders",
    description: "Consolidated view of all order channels for oversight.",
    icon: ClipboardList,
  },
] as const;

const STATUS_FILTERS: Record<OrderType, ReadonlyArray<{ value: StatusFilterValue; label: string }>> = {
  dining: [
    { value: "all", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "preparing", label: "Preparing" },
    { value: "ready", label: "Ready" },
    { value: "served", label: "Served" },
  ],
  delivery: [
    { value: "all", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "out_for_delivery", label: "Out for Delivery" },
    { value: "delivered", label: "Delivered" },
  ],
  pickup: [
    { value: "all", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "preparing", label: "Preparing" },
    { value: "ready", label: "Ready" },
    { value: "completed", label: "Completed" },
  ],
  all: [
    { value: "all", label: "All" },
    { value: "dining", label: "Dining" },
    { value: "delivery", label: "Delivery" },
    { value: "pickup", label: "Pickup" },
  ],
} as const;

const ORDER_TYPE_LABELS: Record<ResolvedOrderType, string> = {
  dining: "Dining",
  delivery: "Delivery",
  pickup: "Pickup",
};

const DEFAULT_STATUS_BY_TYPE: Record<OrderType, StatusFilterValue> = {
  dining: "all",
  delivery: "all",
  pickup: "all",
  all: "all",
};

const normalizeStatusValue = (status: string | null | undefined): string =>
  status ? status.toString().trim().toLowerCase().replace(/\s+/g, "_") : "";

const resolveOrderType = (order: PrintableOrder): ResolvedOrderType => {
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

  if ((order as Record<string, unknown>)?.deliveryAddress || (order as Record<string, unknown>)?.addressId) {
    return "delivery";
  }

  if ((order as Record<string, unknown>)?.pickupTime) {
    return "pickup";
  }

  return "dining";
};

const mapOrderToFilterValue = (
  order: PrintableOrder,
  type: ResolvedOrderType,
): StatusFilterValue => {
  const status = normalizeStatusValue(order.status);

  if (type === "dining") {
    if (status === "delivered" || status === "served") return "served";
    if (status === "ready") return "ready";
    if (status === "preparing") return "preparing";
    if (status === "accepted") return "pending";
    return "pending";
  }

  if (type === "delivery") {
    if (status === "delivered" || status === "completed") return "delivered";
    if (status === "out_for_delivery" || status === "out-for-delivery" || status === "dispatched") {
      return "out_for_delivery";
    }
    return "pending";
  }

  // pickup
  if (status === "completed" || status === "delivered" || status === "picked_up" || status === "picked-up") {
    return "completed";
  }
  if (status === "ready") return "ready";
  if (status === "preparing") return "preparing";
  return "pending";
};

const createInitialStatusCount = (): Record<StatusFilterValue, number> => ({
  all: 0,
  pending: 0,
  preparing: 0,
  ready: 0,
  served: 0,
  out_for_delivery: 0,
  delivered: 0,
  completed: 0,
  dining: 0,
  delivery: 0,
  pickup: 0,
});

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
const [billFormat, setBillFormat] = useState<"thermal" | "a4">("a4");
const [kotDialogOpen, setKotDialogOpen] = useState(false);
const [kotTargetOrder, setKotTargetOrder] = useState<PrintableOrder | null>(null);
const [kotFormat, setKotFormat] = useState<"thermal" | "a4">("thermal");
  const [orderType, setOrderType] = useState<OrderType>("dining");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>(DEFAULT_STATUS_BY_TYPE.dining);

  useEffect(() => {
    const defaultFilter = STATUS_FILTERS[orderType][0]?.value ?? DEFAULT_STATUS_BY_TYPE[orderType];
    setStatusFilter(defaultFilter);
  }, [orderType]);

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
  setBillFormat("a4");
    setPrintDialogOpen(true);
  };

  const closePrintDialog = () => {
    setPrintDialogOpen(false);
    setPrintTargetOrder(null);
    setPaymentType(null);
  };

const handlePrintBill = () => {
  if (!printTargetOrder) {
    return;
  }

  const items = parseOrderItems(printTargetOrder);

  if (billFormat === "a4") {
    if (!paymentType) {
      toast({
        title: "Select payment type",
        description: "Choose Cash or UPI before generating the bill.",
        variant: "destructive",
      });
      return;
    }

    try {
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
  } else {
    try {
      printThermalReceipt({
        order: printTargetOrder,
        items,
        restaurantName: printTargetOrder.vendorDetails?.name ?? undefined,
        restaurantAddress: printTargetOrder.vendorDetails?.address ?? undefined,
        restaurantPhone: printTargetOrder.vendorDetails?.phone ?? undefined,
        title: "Customer Bill",
        ticketNumber: `BILL-${printTargetOrder.id}`,
      });

      toast({
        title: "Success",
        description: "Thermal bill sent to printer",
      });
      closePrintDialog();
    } catch (error) {
      console.error("Thermal bill print error:", error);
      toast({
        title: "Error",
        description: "Failed to print thermal bill. Please try again.",
        variant: "destructive",
      });
    }
  }
};

const openKotDialog = (order: PrintableOrder) => {
  setKotTargetOrder(order);
  setKotFormat("thermal");
  setKotDialogOpen(true);
};

const closeKotDialog = () => {
  setKotDialogOpen(false);
  setKotTargetOrder(null);
};

const handlePrintKot = () => {
  if (!kotTargetOrder) {
    return;
  }

  const items = parseOrderItems(kotTargetOrder);

  try {
    if (kotFormat === "thermal") {
      printThermalReceipt({
        order: kotTargetOrder,
        items,
        restaurantName: kotTargetOrder.vendorDetails?.name ?? undefined,
        restaurantAddress: kotTargetOrder.vendorDetails?.address ?? undefined,
        restaurantPhone: kotTargetOrder.vendorDetails?.phone ?? undefined,
        title: "Kitchen Order Ticket",
        ticketNumber: kotTargetOrder.kotTicket?.ticketNumber ?? `KOT-${kotTargetOrder.id}`,
      });
    } else {
      printA4Kot({
        order: kotTargetOrder,
        items,
        restaurantName: kotTargetOrder.vendorDetails?.name ?? undefined,
        restaurantAddress: kotTargetOrder.vendorDetails?.address ?? undefined,
        restaurantPhone: kotTargetOrder.vendorDetails?.phone ?? undefined,
        title: "Kitchen Order Ticket",
        ticketNumber: kotTargetOrder.kotTicket?.ticketNumber ?? `KOT-${kotTargetOrder.id}`,
      });
    }

    toast({
      title: "KOT ready",
      description: `${kotFormat === "thermal" ? "Thermal" : "A4"} ticket sent to printer.`,
    });
    closeKotDialog();
  } catch (error) {
    console.error("KOT print error:", error);
    toast({
      title: "Error",
      description: "Failed to generate kitchen order ticket. Please try again.",
      variant: "destructive",
    });
  }
};

  /** ✅ Realtime order fetching (poll every 5s) */
  const { data: orders, isLoading } = useQuery<PrintableOrder[]>({
    queryKey: ordersQueryKey,
    refetchInterval: 5000,
  });

  /** ✅ Update order status mutation */
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: number; status: string }) => {
      return await apiRequest("PUT", `/api/vendor/orders/${orderId}/status`, { status });
    },
    onMutate: async ({ orderId, status }) => {
      await queryClient.cancelQueries({ queryKey: ordersQueryKey });
      const previousOrders = queryClient.getQueryData<PrintableOrder[]>(ordersQueryKey);

      queryClient.setQueryData<PrintableOrder[]>(ordersQueryKey, (old) => {
        if (!old) return old;
        if (status === "delivered") {
          return old.filter((order) => order.id !== orderId);
        }
        return old.map((order) => (order.id === orderId ? { ...order, status } : order));
      });

      return { previousOrders };
    },
    onError: (_, __, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(ordersQueryKey, context.previousOrders);
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
      await queryClient.refetchQueries({ queryKey: ordersQueryKey, type: "active" });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/captain/orders"] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ordersQueryKey });
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

  const statusCounts = useMemo(() => {
    const counts = createInitialStatusCount();

    for (const filter of STATUS_FILTERS[orderType]) {
      counts[filter.value] = 0;
    }

    if (!orders || orders.length === 0) {
      return counts;
    }

    for (const order of orders) {
      const resolvedType = resolveOrderType(order);
      if (orderType !== "all" && resolvedType !== orderType) {
        continue;
      }

      const overallKey = STATUS_FILTERS[orderType][0]?.value ?? "all";
      counts[overallKey] = (counts[overallKey] ?? 0) + 1;

      if (orderType === "all") {
        const key = resolvedType as StatusFilterValue;
        counts[key] = (counts[key] ?? 0) + 1;
        continue;
      }

      const key = mapOrderToFilterValue(order, resolvedType);
      counts[key] = (counts[key] ?? 0) + 1;
    }

    return counts;
  }, [orders, orderType]);

  const filteredOrders = useMemo(() => {
    if (!orders || orders.length === 0) {
      return [];
    }

    return orders.filter((order) => {
      const resolvedType = resolveOrderType(order);

      if (orderType !== "all" && resolvedType !== orderType) {
        return false;
      }

      if (orderType === "all") {
        if (statusFilter === "all") {
          return true;
        }
        return statusFilter === resolvedType;
      }

      if (statusFilter === "all") {
        return true;
      }

      const key = mapOrderToFilterValue(order, resolvedType);
      return key === statusFilter;
    });
  }, [orders, orderType, statusFilter]);

  const orderTypeCounts = useMemo(() => {
    const base: Record<ResolvedOrderType, number> = {
      dining: 0,
      delivery: 0,
      pickup: 0,
    };

    if (!orders || orders.length === 0) {
      return base;
    }

    for (const order of orders) {
      const resolvedType = resolveOrderType(order);
      base[resolvedType] = (base[resolvedType] ?? 0) + 1;
    }

    return base;
  }, [orders]);

  const activeOrderTypeConfig =
    ORDER_TYPES.find((entry) => entry.value === orderType) ?? ORDER_TYPES[0];
  const totalOrdersCount = orders?.length ?? 0;
  const selectedStatusLabel =
    STATUS_FILTERS[orderType].find((option) => option.value === statusFilter)?.label ?? "Selected";
  const orderTypeLabelLower = activeOrderTypeConfig.label.toLowerCase();
  const noOrdersFilteredTitle =
    statusFilter === "all"
      ? `No ${orderTypeLabelLower} yet`
      : `No ${orderTypeLabelLower} match "${selectedStatusLabel}"`;
  const noOrdersFilteredSubtitle =
    statusFilter === "all"
      ? orderType === "all"
        ? "Orders will appear here when customers start placing them."
        : "Switch to another order type or wait for new orders."
      : "Try selecting another filter to see more orders.";
  const noOrdersOverallTitle = orderType === "all" ? "No orders yet" : `No ${orderTypeLabelLower} yet`;

  useOrderStream({
    onEvent: (event) => {
      if (
        event.type === "order-created" ||
        event.type === "order-status-changed" ||
        event.type === "kot-created"
      ) {
        queryClient.invalidateQueries({ queryKey: ordersQueryKey });
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/tables"] });
        queryClient.invalidateQueries({ queryKey: ["/api/captain/orders"] });
      }
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Order Management</h1>
          <p className="text-muted-foreground mt-2">
            {activeOrderTypeConfig.description}
          </p>
        </div>
        {orderType === "dining" && (
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
            invalidateQueryKeys={[ordersQueryKey, ["/api/vendor/tables"]]}
            onOrderCreated={() => setPaymentType(null)}
          />
        )}
      </div>

      <Tabs
        value={orderType}
        onValueChange={(value) => setOrderType(value as OrderType)}
        className="w-full"
      >
        <TabsList className="flex w-full flex-wrap gap-2 md:w-auto">
          {ORDER_TYPES.map((typeConfig) => {
            const Icon = typeConfig.icon;
            const count =
              typeConfig.value === "all"
                ? totalOrdersCount
                : orderTypeCounts[typeConfig.value as ResolvedOrderType] ?? 0;

            return (
              <TabsTrigger
                key={typeConfig.value}
                value={typeConfig.value}
                className="flex items-center gap-2 data-[state=active]:shadow-md"
              >
                <Icon className="h-4 w-4" />
                <span>{typeConfig.label}</span>
                <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {count}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <Tabs
        value={statusFilter}
        onValueChange={(value) => setStatusFilter(value as StatusFilterValue)}
        className="w-full"
      >
        <TabsList className="flex w-full flex-wrap gap-2 md:w-auto">
          {STATUS_FILTERS[orderType].map((option) => (
            <TabsTrigger
              key={option.value}
              value={option.value}
              className="data-[state=active]:shadow-md"
            >
              <span>{option.label}</span>
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {statusCounts[option.value] ?? 0}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : filteredOrders.length > 0 ? (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const parsedItems = parseOrderItems(order);
            const resolvedType = resolveOrderType(order);
            const typeLabel = ORDER_TYPE_LABELS[resolvedType];
            const tableLabel = order.tableNumber ?? order.tableId ?? "N/A";
            const deliveryAddress = order.deliveryAddress;
            const pickupReference = order.pickupReference;

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
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold uppercase text-muted-foreground">
                        {typeLabel}
                      </span>
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
                    {resolvedType === "dining" && (
                      <div>
                        <span className="text-muted-foreground">Table:</span>{" "}
                        <span className="font-medium">
                          {tableLabel}
                        </span>
                      </div>
                    )}
                    {resolvedType === "delivery" && deliveryAddress && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Address:</span>{" "}
                        <span className="font-medium">
                          {deliveryAddress}
                        </span>
                      </div>
                    )}
                    {resolvedType === "pickup" && pickupReference && (
                      <div>
                        <span className="text-muted-foreground">Pickup Ref:</span>{" "}
                        <span className="font-medium">
                          {pickupReference}
                        </span>
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

                  <div className="border-t pt-3 mt-3 space-y-3">
                    <div className="flex flex-col gap-1 text-sm">
                      <div className="flex items-center justify-between font-semibold">
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
                        <p className="text-sm text-muted-foreground mt-1">
                          {order.kotTicket.customerNotes}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={() => openKotDialog(order)}
                        disabled={!order.kotTicket}
                      >
                        <ChefHat className="mr-2 h-4 w-4" />
                        Print KOT
                      </Button>
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
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      ) : orders && orders.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{noOrdersFilteredTitle}</h3>
            <p className="text-sm text-muted-foreground">
              {noOrdersFilteredSubtitle}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Clock className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{noOrdersOverallTitle}</h3>
            <p className="text-sm text-muted-foreground">
              Orders will appear here when customers start placing them.
            </p>
          </CardContent>
        </Card>
      )}
      <Dialog open={printDialogOpen} onOpenChange={(open) => (open ? setPrintDialogOpen(true) : closePrintDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Bill</DialogTitle>
            <DialogDescription>
              Choose the format and payment details before printing the customer bill.
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
                <Label htmlFor="bill-format">Print Format</Label>
                <RadioGroup
                  id="bill-format"
                  value={billFormat}
                  onValueChange={(value) => setBillFormat(value as "thermal" | "a4")}
                  className="grid gap-3"
                >
                  <div className="flex items-center space-x-3 rounded-md border p-3">
                    <RadioGroupItem value="thermal" id="bill-format-thermal" />
                    <Label htmlFor="bill-format-thermal" className="flex flex-col">
                      <span className="font-medium">Thermal Receipt</span>
                      <span className="text-sm text-muted-foreground">
                        Compact ticket for 58mm/80mm printers.
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3 rounded-md border p-3">
                    <RadioGroupItem value="a4" id="bill-format-a4" />
                    <Label htmlFor="bill-format-a4" className="flex flex-col">
                      <span className="font-medium">A4 Invoice</span>
                      <span className="text-sm text-muted-foreground">
                        Detailed invoice with payment information.
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {billFormat === "a4" && (
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
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closePrintDialog}>
              Cancel
            </Button>
            <Button
              onClick={handlePrintBill}
              disabled={!printTargetOrder || (billFormat === "a4" && !paymentType)}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print Bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={kotDialogOpen} onOpenChange={(open) => (open ? setKotDialogOpen(true) : closeKotDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Print Kitchen Ticket</DialogTitle>
            <DialogDescription>
              Choose the preferred format before printing the kitchen order ticket.
            </DialogDescription>
          </DialogHeader>

          {kotTargetOrder && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-4 text-sm">
                <div className="font-semibold">Order #{kotTargetOrder.id}</div>
                <div className="mt-2 grid gap-1 text-muted-foreground">
                  <span>Table: {kotTargetOrder.tableId ?? "N/A"}</span>
                  <span>Items: {parseOrderItems(kotTargetOrder).length}</span>
                  {kotTargetOrder.kotTicket?.ticketNumber && (
                    <span>KOT #: {kotTargetOrder.kotTicket.ticketNumber}</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="kot-format">Print Format</Label>
                <RadioGroup
                  id="kot-format"
                  value={kotFormat}
                  onValueChange={(value) => setKotFormat(value as "thermal" | "a4")}
                  className="grid gap-3"
                >
                  <div className="flex items-center space-x-3 rounded-md border p-3">
                    <RadioGroupItem value="thermal" id="kot-format-thermal" />
                    <Label htmlFor="kot-format-thermal" className="flex flex-col">
                      <span className="font-medium">Thermal Ticket</span>
                      <span className="text-sm text-muted-foreground">
                        Print on a thermal kitchen printer.
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3 rounded-md border p-3">
                    <RadioGroupItem value="a4" id="kot-format-a4" />
                    <Label htmlFor="kot-format-a4" className="flex flex-col">
                      <span className="font-medium">A4 Ticket</span>
                      <span className="text-sm text-muted-foreground">
                        Full-page ticket for larger printers.
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
    </div>
  );
}
