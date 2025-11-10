import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Grid3x3, Clock, Plus } from "lucide-react";
import ManualOrderDialog from "@/components/orders/ManualOrderDialog";
import type { MenuAddon, MenuCategory, MenuItem, Order, Table } from "@shared/schema";

type MenuItemWithAddons = MenuItem & { addons?: MenuAddon[] };

interface TableWithOrders extends Table {
  currentOrders?: Order[];
}

export default function CaptainDashboard() {
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
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {assignedTables.map((table) => (
            <Card key={table.id} className="hover-elevate" data-testid={`card-table-${table.id}`}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                  <span className="text-2xl font-mono">Table {table.tableNumber}</span>
                  {table.currentOrders && table.currentOrders.length > 0 ? (
                    <span className="text-sm font-normal bg-primary/10 text-primary px-2 py-1 rounded">
                      {table.currentOrders.length} order{table.currentOrders.length !== 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="text-sm font-normal text-muted-foreground">Empty</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
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
                {table.currentOrders && table.currentOrders.length > 0 ? (
                  table.currentOrders.map((order) => (
                    <div key={order.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">Order #{order.id}</span>
                        <StatusBadge status={order.status as any} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(order.createdAt!).toLocaleTimeString()}
                      </div>
                      <div className="text-sm font-mono font-semibold">
                        ${order.totalAmount}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No active orders
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
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
    </div>
  );
}
