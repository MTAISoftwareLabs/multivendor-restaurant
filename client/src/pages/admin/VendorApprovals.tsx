import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, XCircle, FileText, Filter, X, User, Mail } from "lucide-react";
import type { VendorWithUser } from "@shared/schema";
import { useState } from "react";

export default function VendorApprovals() {
  const { toast } = useToast();
  const [reviewingVendor, setReviewingVendor] = useState<VendorWithUser | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: vendors, isLoading } = useQuery<VendorWithUser[]>({
    queryKey: ["/api/admin/vendors"],
  });

  const updateVendorStatusMutation = useMutation({
    mutationFn: async ({
      vendorId,
      status,
      reason,
    }: {
      vendorId: number;
      status: string;
      reason?: string;
    }) => {
      return await apiRequest("PUT", `/api/admin/vendors/${vendorId}/status`, {
        status,
        rejectionReason: reason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vendors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vendors/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({
        title: "Success",
        description: "Vendor status updated",
      });
      setReviewingVendor(null);
      setRejectionReason("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update vendor status",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (vendorId: number) => {
    updateVendorStatusMutation.mutate({ vendorId, status: "approved" });
  };

  const handleReject = (vendorId: number) => {
    if (!rejectionReason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a rejection reason",
        variant: "destructive",
      });
      return;
    }
    updateVendorStatusMutation.mutate({
      vendorId,
      status: "rejected",
      reason: rejectionReason,
    });
  };

  const fulfillmentAccessMutation = useMutation({
    mutationFn: async ({
      vendorId,
      ...payload
    }: {
      vendorId: number;
      isDeliveryAllowed?: boolean;
      isPickupAllowed?: boolean;
    }) => {
      const res = await apiRequest(
        "PUT",
        `/api/admin/vendors/${vendorId}/fulfillment`,
        payload,
      );
      return res.json() as Promise<Vendor>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vendors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vendors/pending"] });
      toast({
        title: "Success",
        description: "Vendor fulfillment access updated",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update fulfillment access",
        variant: "destructive",
      });
    },
  });

  const renderFulfillmentControls = (vendor: VendorWithUser) => (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <div className="flex items-center justify-between rounded-md border border-muted px-4 py-3">
        <div>
          <p className="text-sm font-medium">Allow delivery management</p>
          <p className="text-xs text-muted-foreground">
            Lets the vendor toggle delivery availability from their dashboard.
          </p>
        </div>
        <Switch
          checked={vendor.isDeliveryAllowed ?? false}
          onCheckedChange={(checked) =>
            fulfillmentAccessMutation.mutate({
              vendorId: vendor.id,
              isDeliveryAllowed: checked,
            })
          }
          disabled={fulfillmentAccessMutation.isPending}
        />
      </div>
      <div className="flex items-center justify-between rounded-md border border-muted px-4 py-3">
        <div>
          <p className="text-sm font-medium">Allow pickup management</p>
          <p className="text-xs text-muted-foreground">
            Lets the vendor toggle pickup availability from their dashboard.
          </p>
        </div>
        <Switch
          checked={vendor.isPickupAllowed ?? false}
          onCheckedChange={(checked) =>
            fulfillmentAccessMutation.mutate({
              vendorId: vendor.id,
              isPickupAllowed: checked,
            })
          }
          disabled={fulfillmentAccessMutation.isPending}
        />
      </div>
      {(!vendor.isDeliveryAllowed || !vendor.isPickupAllowed) && (
        <div className="md:col-span-2 rounded-md border border-border/60 bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          Disabling access will immediately turn off the corresponding option in the vendor portal.
        </div>
      )}
    </div>
  );

  // ✅ Sort vendors by date (latest first) and filter by status
  const sortedVendors = vendors
    ? [...vendors].sort(
        (a, b) =>
          new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
      )
    : [];

  // Filter vendors based on selected status
  const filteredVendors = sortedVendors.filter((v) => {
    if (statusFilter === "all") return true;
    return v.status === statusFilter;
  });

  const approvedVendors = filteredVendors.filter(
    (v) => v.status === "approved"
  );
  const notApprovedVendors = filteredVendors.filter(
    (v) => v.status !== "approved"
  );

  const hasActiveFilter = statusFilter !== "all";

  const clearFilters = () => {
    setStatusFilter("all");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Vendor Management</h1>
        <p className="text-muted-foreground mt-2">
          Review and manage vendor applications
        </p>
      </div>

      {/* Status Filter */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filter by status:</span>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilter && (
          <Button variant="outline" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-2" />
            Clear Filter
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : vendors && vendors.length > 0 ? (
        <div className="space-y-8">
          {/* Show filtered results or grouped sections based on filter */}
          {hasActiveFilter ? (
            <div>
              <h2 className="text-2xl font-semibold mb-3">
                {statusFilter === "pending" && "Pending Vendors"}
                {statusFilter === "approved" && "Approved Vendors"}
                {statusFilter === "rejected" && "Rejected Vendors"}
              </h2>
              {filteredVendors.length > 0 ? (
                <div className="space-y-4">
                  {filteredVendors.map((vendor) => (
                    <Card
                      key={vendor.id}
                      className="hover-elevate"
                      data-testid={`card-vendor-${vendor.id}`}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <CardTitle className="flex items-center gap-3">
                              <span>{vendor.restaurantName}</span>
                              <StatusBadge status={vendor.status as any} />
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                              {vendor.cuisineType}
                            </p>
                          </div>
                          {vendor.status === "pending" && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleApprove(vendor.id)}
                                disabled={updateVendorStatusMutation.isPending}
                                data-testid={`button-approve-${vendor.id}`}
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setReviewingVendor(vendor)}
                                disabled={updateVendorStatusMutation.isPending}
                                data-testid={`button-reject-${vendor.id}`}
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Username:</span>{" "}
                            <span className="font-medium">{vendor.username || "N/A"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Email:</span>{" "}
                            <span className="font-medium">{vendor.email || "N/A"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Address:</span>{" "}
                            <span>{vendor.address}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Phone:</span>{" "}
                            <span>{vendor.phone || "N/A"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              FSSAI License Number:
                            </span>{" "}
                            <span>{vendor.cnic || "N/A"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Applied:</span>{" "}
                            <span>
                              {new Date(vendor.createdAt!).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        {vendor.description && (
                          <div className="mt-4">
                            <p className="text-sm text-muted-foreground mb-1">
                              Description:
                            </p>
                            <p className="text-sm">{vendor.description}</p>
                          </div>
                        )}
                        {vendor.documents && (
                          <div className="mt-4">
                            <p className="text-sm text-muted-foreground mb-2">
                              Documents:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(vendor.documents as any).map(
                                ([key, value]) =>
                                  value && (
                                    <Button
                                      key={key}
                                      variant="outline"
                                      size="sm"
                                      asChild
                                    >
                                      <a
                                        href={value as string}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <FileText className="h-4 w-4 mr-2" />
                                        {key}
                                      </a>
                                    </Button>
                                  )
                              )}
                            </div>
                          </div>
                        )}
                        {renderFulfillmentControls(vendor)}
                        {vendor.status === "rejected" &&
                          vendor.rejectionReason && (
                            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                              <p className="text-sm font-medium text-destructive mb-1">
                                Rejection Reason:
                              </p>
                              <p className="text-sm text-destructive/90">
                                {vendor.rejectionReason}
                              </p>
                            </div>
                          )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  No vendors found with status "{statusFilter}".
                </p>
              )}
            </div>
          ) : (
            <>
              {/* PENDING / REJECTED SECTION */}
              <div>
                <h2 className="text-2xl font-semibold mb-3">
                  Pending / Rejected Vendors
                </h2>
                {notApprovedVendors.length > 0 ? (
              <div className="space-y-4">
                {notApprovedVendors.map((vendor) => (
                  <Card
                    key={vendor.id}
                    className="hover-elevate"
                    data-testid={`card-vendor-${vendor.id}`}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="flex items-center gap-3">
                            <span>{vendor.restaurantName}</span>
                            <StatusBadge status={vendor.status as any} />
                          </CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {vendor.cuisineType}
                          </p>
                        </div>
                        {vendor.status === "pending" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApprove(vendor.id)}
                              disabled={updateVendorStatusMutation.isPending}
                              data-testid={`button-approve-${vendor.id}`}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setReviewingVendor(vendor)}
                              disabled={updateVendorStatusMutation.isPending}
                              data-testid={`button-reject-${vendor.id}`}
                            >
                              <XCircle className="h-4 w-4 mr-2" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Username:</span>{" "}
                          <span className="font-medium">{vendor.username || "N/A"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Email:</span>{" "}
                          <span className="font-medium">{vendor.email || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Address:</span>{" "}
                          <span>{vendor.address}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Phone:</span>{" "}
                          <span>{vendor.phone || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            FSSAI License Number:
                          </span>{" "}
                          <span>{vendor.cnic || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Applied:</span>{" "}
                          <span>
                            {new Date(vendor.createdAt!).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      {vendor.description && (
                        <div className="mt-4">
                          <p className="text-sm text-muted-foreground mb-1">
                            Description:
                          </p>
                          <p className="text-sm">{vendor.description}</p>
                        </div>
                      )}
                      {vendor.documents && (
                        <div className="mt-4">
                          <p className="text-sm text-muted-foreground mb-2">
                            Documents:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(vendor.documents as any).map(
                              ([key, value]) =>
                                value && (
                                  <Button
                                    key={key}
                                    variant="outline"
                                    size="sm"
                                    asChild
                                  >
                                    <a
                                      href={value as string}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <FileText className="h-4 w-4 mr-2" />
                                      {key}
                                    </a>
                                  </Button>
                                )
                            )}
                          </div>
                        </div>
                      )}
                      {renderFulfillmentControls(vendor)}
                      {vendor.status === "rejected" &&
                        vendor.rejectionReason && (
                          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                            <p className="text-sm font-medium text-destructive mb-1">
                              Rejection Reason:
                            </p>
                            <p className="text-sm text-destructive/90">
                              {vendor.rejectionReason}
                            </p>
                          </div>
                        )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">
                No pending or rejected vendors.
              </p>
            )}
          </div>

          {/* APPROVED SECTION */}
          <div>
            <h2 className="text-2xl font-semibold mb-3">Approved Vendors</h2>
            {approvedVendors.length > 0 ? (
              <div className="space-y-4">
                {approvedVendors.map((vendor) => (
                  <Card
                    key={vendor.id}
                    className="hover-elevate"
                    data-testid={`card-vendor-${vendor.id}`}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="flex items-center gap-3">
                            <span>{vendor.restaurantName}</span>
                            <StatusBadge status={vendor.status as any} />
                          </CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {vendor.cuisineType}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Username:</span>{" "}
                          <span className="font-medium">{vendor.username || "N/A"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Email:</span>{" "}
                          <span className="font-medium">{vendor.email || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Address:</span>{" "}
                          <span>{vendor.address}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Phone:</span>{" "}
                          <span>{vendor.phone || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            FSSAI License Number:
                          </span>{" "}
                          <span>{vendor.cnic || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Applied:</span>{" "}
                          <span>
                            {new Date(vendor.createdAt!).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      {vendor.description && (
                        <div className="mt-4">
                          <p className="text-sm text-muted-foreground mb-1">
                            Description:
                          </p>
                          <p className="text-sm">{vendor.description}</p>
                        </div>
                      )}
                      {vendor.documents && (
                        <div className="mt-4">
                          <p className="text-sm text-muted-foreground mb-2">
                            Documents:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(vendor.documents as any).map(
                              ([key, value]) =>
                                value && (
                                  <Button
                                    key={key}
                                    variant="outline"
                                    size="sm"
                                    asChild
                                  >
                                    <a
                                      href={value as string}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <FileText className="h-4 w-4 mr-2" />
                                      {key}
                                    </a>
                                  </Button>
                                )
                            )}
                          </div>
                        </div>
                      )}
                      {renderFulfillmentControls(vendor)}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No approved vendors yet.</p>
            )}
          </div>
            </>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No vendors yet</h3>
            <p className="text-sm text-muted-foreground">
              Vendor applications will appear here
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!reviewingVendor} onOpenChange={() => setReviewingVendor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Vendor Application</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting {reviewingVendor?.restaurantName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rejectionReason">Rejection Reason</Label>
              <Textarea
                id="rejectionReason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this application is being rejected..."
                data-testid="input-rejection-reason"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setReviewingVendor(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => reviewingVendor && handleReject(reviewingVendor.id)}
                disabled={updateVendorStatusMutation.isPending}
                data-testid="button-confirm-reject"
              >
                Reject Application
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
