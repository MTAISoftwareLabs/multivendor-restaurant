import { useState } from "react";
import { DateRange } from "react-day-picker";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Store, Users, ShoppingCart, TrendingUp } from "lucide-react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Vendor, AdminSalesSummary } from "@shared/schema";

type AdminStats = {
  totalVendors: number;
  pendingVendors: number;
  totalOrders: number;
  platformRevenue: string;
};

export default function AdminDashboard() {
  // Poll for real-time stats updates
  const { data: stats, isLoading: loadingStats } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    queryFn: async (): Promise<AdminStats> => {
      const response = await fetch("/api/admin/stats", { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch admin stats");
      }
      return (await response.json()) as AdminStats;
    },
    refetchInterval: 10000, // 10 seconds
  });

  const { data: pendingVendors } = useQuery<Vendor[]>({
    queryKey: ["/api/admin/vendors/pending"],
    queryFn: async (): Promise<Vendor[]> => {
      const response = await fetch("/api/admin/vendors/pending", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch pending vendors");
      }
      return (await response.json()) as Vendor[];
    },
    refetchInterval: 10000, // 10 seconds
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
  } = useQuery<AdminSalesSummary>({
    queryKey: ["/api/admin/sales", startDateParam, endDateParam],
    queryFn: async ({ queryKey }): Promise<AdminSalesSummary> => {
      const [, start, end] = queryKey as [string, string | undefined, string | undefined];
      const params = new URLSearchParams();
      if (start) params.set("startDate", start);
      if (end) params.set("endDate", end);
      const query = params.toString();
      const response = await fetch(
        query ? `/api/admin/sales?${query}` : "/api/admin/sales",
        { credentials: "include" },
      );
      if (!response.ok) {
        throw new Error("Failed to fetch sales summary");
      }
      return (await response.json()) as AdminSalesSummary;
    },
    placeholderData: (previousData) => previousData,
  });

  const statCards = [
    {
      title: "Total Vendors",
      value: stats?.totalVendors ?? 0,
      icon: Store,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-950",
    },
    {
      title: "Pending Approvals",
      value: stats?.pendingVendors ?? 0,
      icon: Users,
      color: "text-yellow-600 dark:text-yellow-400",
      bgColor: "bg-yellow-50 dark:bg-yellow-950",
    },
    {
      title: "Total Orders",
      value: stats?.totalOrders ?? 0,
      icon: ShoppingCart,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-50 dark:bg-green-950",
    },
    {
      title: "Platform Revenue",
      value: `$${stats?.platformRevenue ?? "0.00"}`,
      icon: TrendingUp,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-50 dark:bg-purple-950",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Platform-wide analytics and vendor management
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
              {loadingStats ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-3xl font-bold" data-testid={`stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
                  {stat.value}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1">
            <CardTitle>Sales Overview</CardTitle>
            <CardDescription>
              Filter platform-wide sales by specific dates or ranges.
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
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : salesSummary ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="text-sm text-muted-foreground">Vendors with Orders</p>
                  <p className="text-2xl font-semibold">
                    {salesSummary.vendorBreakdown.length}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Range:{" "}
                {format(parseISO(salesSummary.range.startDate), "LLL dd, yyyy")} –{" "}
                {format(parseISO(salesSummary.range.endDate), "LLL dd, yyyy")}
              </p>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Daily Sales
                  </h3>
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
                            <TableCell className="text-right">
                              {day.totalOrders}
                            </TableCell>
                            <TableCell className="text-right">
                              ${day.totalRevenue}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Top Vendors
                  </h3>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vendor</TableHead>
                          <TableHead className="text-right">Orders</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {salesSummary.vendorBreakdown.length > 0 ? (
                          salesSummary.vendorBreakdown.slice(0, 10).map((vendor) => (
                            <TableRow key={vendor.vendorId}>
                              <TableCell>{vendor.vendorName}</TableCell>
                              <TableCell className="text-right">
                                {vendor.totalOrders}
                              </TableCell>
                              <TableCell className="text-right">
                                ${vendor.totalRevenue}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                              No vendor sales in this range.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Unable to load sales data right now.
            </div>
          )}
        </CardContent>
      </Card>

      {pendingVendors && pendingVendors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Vendor Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingVendors.slice(0, 5).map((vendor) => (
                <div
                  key={vendor.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                  data-testid={`vendor-pending-${vendor.id}`}
                >
                  <div>
                    <p className="font-semibold">{vendor.restaurantName}</p>
                    <p className="text-sm text-muted-foreground">{vendor.cuisineType}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <a href={`/admin/vendors?review=${vendor.id}`}>Review</a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {pendingVendors.length > 5 && (
              <Button variant="ghost" asChild className="w-full mt-4 underline-offset-2 hover:underline">
                <a href="/admin/vendors">View all {pendingVendors.length} pending approvals</a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
