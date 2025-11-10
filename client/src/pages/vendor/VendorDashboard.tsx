import { useState } from "react";
import { DateRange } from "react-day-picker";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Grid3x3, Users, UtensilsCrossed, ShoppingCart, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SalesSummary } from "@shared/schema";

type VendorProfileResponse = {
  vendor?: {
    isDeliveryEnabled?: boolean | null;
    isPickupEnabled?: boolean | null;
  } | null;
};

const coerceBoolean = (value: unknown, fallback = false): boolean => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
  }
  return fallback;
};

export default function VendorDashboard() {
  const { toast } = useToast();

  // Poll for real-time stats updates
  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/vendor/stats"],
    refetchInterval: 10000, // 10 seconds
  });

  const { data: profile, isLoading: loadingProfile } = useQuery<VendorProfileResponse>({
    queryKey: ["/api/vendor/profile"],
  });

  const createDefaultRange = () => {
    const today = new Date();
    return { from: subDays(today, 6), to: today };
  };

  const [salesRange, setSalesRange] = useState<DateRange | undefined>(createDefaultRange);

  const handleSalesRangeChange = (range: DateRange | undefined) => {
    if (!range?.from && !range?.to) {
      setSalesRange(createDefaultRange());
      return;
    }

    if (range?.from && !range.to) {
      setSalesRange({ from: range.from, to: range.from });
      return;
    }

    setSalesRange(range);
  };

  const startDateParam = salesRange?.from ? format(salesRange.from, "yyyy-MM-dd") : undefined;
  const endDateParam =
    salesRange?.to ? format(salesRange.to, "yyyy-MM-dd") : startDateParam;

  const {
    data: salesSummary,
    isLoading: loadingSales,
    isFetching: fetchingSales,
  } = useQuery<SalesSummary>({
    queryKey: ["/api/vendor/sales", startDateParam, endDateParam],
    queryFn: async ({ queryKey }) => {
      const [, start, end] = queryKey as [string, string | undefined, string | undefined];
      const params = new URLSearchParams();
      if (start) params.set("startDate", start);
      if (end) params.set("endDate", end);
      const query = params.toString();
      const response = await fetch(
        query ? `/api/vendor/sales?${query}` : "/api/vendor/sales",
        { credentials: "include" },
      );
      if (!response.ok) {
        throw new Error("Failed to fetch sales summary");
      }
      return (await response.json()) as SalesSummary;
    },
    keepPreviousData: true,
  });

  const fulfillmentMutation = useMutation({
    mutationFn: async (
      updates: Partial<{ isDeliveryEnabled: boolean; isPickupEnabled: boolean }>,
    ) => {
      const res = await apiRequest("PUT", "/api/vendor/profile", updates);
      return res.json() as Promise<VendorProfileResponse>;
    },
    onSuccess: (data) => {
      toast({ title: "Service settings updated" });
      if (data?.vendor) {
        queryClient.setQueryData<VendorProfileResponse | undefined>(
          ["/api/vendor/profile"],
          (prev) => ({
            vendor: {
              ...(prev?.vendor ?? {}),
              ...data.vendor,
            },
            user: prev?.user ?? data?.user ?? null,
          }),
        );
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update settings",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const statCards = [
    {
      title: "Total Tables",
      value: stats?.totalTables || 0,
      icon: Grid3x3,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-950",
    },
    {
      title: "Active Captains",
      value: stats?.totalCaptains || 0,
      icon: Users,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-50 dark:bg-green-950",
    },
    {
      title: "Menu Items",
      value: stats?.totalMenuItems || 0,
      icon: UtensilsCrossed,
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-50 dark:bg-orange-950",
    },
    {
      title: "Today's Orders",
      value: stats?.todayOrders || 0,
      icon: ShoppingCart,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-50 dark:bg-purple-950",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome back! Here's an overview of your restaurant.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-3xl font-bold" data-testid={`stat-${stat.title.toLowerCase().replace(/'/g, '').replace(/\s+/g, '-')}`}>
                  {stat.value}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                No recent orders. Orders will appear here once customers start ordering.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Quick Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Today's Revenue</span>
                <span className="text-lg font-semibold" data-testid="stat-revenue">
                  ${stats?.todayRevenue || '0.00'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Average Order Value</span>
                <span className="text-lg font-semibold" data-testid="stat-avg-order">
                  ${stats?.avgOrderValue || '0.00'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Active Tables</span>
                <span className="text-lg font-semibold" data-testid="stat-active-tables">
                  {stats?.activeTables || 0}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <CardTitle>Sales Overview</CardTitle>
            <CardDescription>
              Track orders and revenue for any date range.
            </CardDescription>
            {fetchingSales && !loadingSales && (
              <p className="text-xs text-muted-foreground">Refreshing…</p>
            )}
          </div>
          <DateRangePicker value={salesRange} onChange={handleSalesRangeChange} />
        </CardHeader>
        <CardContent>
          {loadingSales && !salesSummary ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : salesSummary ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-semibold">
                    ${salesSummary.totals.totalRevenue}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="text-sm text-muted-foreground">Total Orders</p>
                  <p className="text-2xl font-semibold">
                    {salesSummary.totals.totalOrders}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="text-sm text-muted-foreground">Avg. Order Value</p>
                  <p className="text-2xl font-semibold">
                    ${salesSummary.totals.averageOrderValue}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Range:{" "}
                {format(parseISO(salesSummary.range.startDate), "LLL dd, yyyy")} –{" "}
                {format(parseISO(salesSummary.range.endDate), "LLL dd, yyyy")}
              </p>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesSummary.daily.map((day) => (
                      <TableRow key={day.date}>
                        <TableCell>
                          {format(parseISO(day.date), "LLL dd, yyyy")}
                        </TableCell>
                        <TableCell className="text-right">{day.totalOrders}</TableCell>
                        <TableCell className="text-right">
                          ${day.totalRevenue}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {salesSummary.totals.totalOrders === 0 && (
                <p className="text-sm text-muted-foreground">
                  No sales recorded for this range yet.
                </p>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Unable to load sales data right now.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Service Availability</CardTitle>
          <CardDescription>Control which order channels are currently active.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-muted px-4 py-3">
            <div>
              <p className="font-medium">Delivery</p>
              <p className="text-sm text-muted-foreground">
                Allow customers to place delivery orders.
              </p>
            </div>
            {loadingProfile ? (
              <Skeleton className="h-6 w-12" />
            ) : (
              <Switch
                checked={coerceBoolean(profile?.vendor?.isDeliveryEnabled, true)}
                onCheckedChange={(checked) =>
                  fulfillmentMutation.mutate({ isDeliveryEnabled: checked })
                }
                disabled={fulfillmentMutation.isPending}
              />
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border border-muted px-4 py-3">
            <div>
              <p className="font-medium">Pickup</p>
              <p className="text-sm text-muted-foreground">
                Allow customers to pick up their orders.
              </p>
            </div>
            {loadingProfile ? (
              <Skeleton className="h-6 w-12" />
            ) : (
              <Switch
                checked={coerceBoolean(profile?.vendor?.isPickupEnabled, true)}
                onCheckedChange={(checked) =>
                  fulfillmentMutation.mutate({ isPickupEnabled: checked })
                }
                disabled={fulfillmentMutation.isPending}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
