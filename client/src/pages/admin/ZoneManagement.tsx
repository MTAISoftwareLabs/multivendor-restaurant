import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Zone } from "@shared/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";

type ZoneFormState = {
  name: string;
  latitude: string;
  longitude: string;
  radius: string;
  isActive: boolean;
};

const defaultFormState: ZoneFormState = {
  name: "",
  latitude: "",
  longitude: "",
  radius: "",
  isActive: true,
};

export default function ZoneManagement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [zoneToDelete, setZoneToDelete] = useState<Zone | null>(null);
  const [formState, setFormState] = useState<ZoneFormState>(defaultFormState);

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingZone(null);
    setFormState(defaultFormState);
  };

  const { data: zones, isLoading } = useQuery<Zone[]>({
    queryKey: ["/api/admin/zones"],
    queryFn: async () => {
      const res = await fetch("/api/admin/zones", {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load zones");
      }
      return (await res.json()) as Zone[];
    },
  });

  const invalidateZones = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/admin/zones"] });

  const createZoneMutation = useMutation({
    mutationFn: async (data: ZoneFormState) => {
      const res = await apiRequest("POST", "/api/admin/zones", {
        name: data.name,
        latitude: parseFloat(data.latitude),
        longitude: parseFloat(data.longitude),
        radius: parseFloat(data.radius),
        isActive: data.isActive,
      });
      return (await res.json()) as Zone;
    },
    onSuccess: () => {
      invalidateZones();
      handleDialogClose();
      toast({ title: "Zone created", description: "New zone is now available." });
    },
    onError: (error: any) => {
      toast({
        title: "Creation failed",
        description: error?.message ?? "Unable to create zone",
        variant: "destructive",
      });
    },
  });

  const updateZoneMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ZoneFormState> }) => {
      const payload: any = {};
      if (data.name !== undefined) payload.name = data.name;
      if (data.latitude !== undefined) payload.latitude = parseFloat(data.latitude);
      if (data.longitude !== undefined) payload.longitude = parseFloat(data.longitude);
      if (data.radius !== undefined) payload.radius = parseFloat(data.radius);
      if (data.isActive !== undefined) payload.isActive = data.isActive;

      const res = await apiRequest("PUT", `/api/admin/zones/${id}`, payload);
      return (await res.json()) as Zone;
    },
    onSuccess: () => {
      invalidateZones();
      handleDialogClose();
      toast({ title: "Zone updated", description: "Changes saved successfully." });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error?.message ?? "Unable to update zone",
        variant: "destructive",
      });
    },
  });

  const deleteZoneMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/zones/${id}`);
    },
    onSuccess: () => {
      invalidateZones();
      setZoneToDelete(null);
      toast({ title: "Zone removed" });
    },
    onError: (error: any) => {
      toast({
        title: "Deletion failed",
        description: error?.message ?? "Unable to delete zone",
        variant: "destructive",
      });
    },
  });

  const openCreateDialog = () => {
    setFormState(defaultFormState);
    setEditingZone(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (zone: Zone) => {
    setEditingZone(zone);
    setFormState({
      name: zone.name ?? "",
      latitude: zone.latitude ? String(zone.latitude) : "",
      longitude: zone.longitude ? String(zone.longitude) : "",
      radius: zone.radius ? String(zone.radius) : "",
      isActive: Boolean(zone.isActive),
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const name = formState.name.trim();
    if (!name) {
      toast({
        title: "Validation error",
        description: "Zone name is required.",
        variant: "destructive",
      });
      return;
    }

    const lat = parseFloat(formState.latitude);
    const lon = parseFloat(formState.longitude);
    const rad = parseFloat(formState.radius);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      toast({
        title: "Validation error",
        description: "Latitude must be between -90 and 90.",
        variant: "destructive",
      });
      return;
    }

    if (isNaN(lon) || lon < -180 || lon > 180) {
      toast({
        title: "Validation error",
        description: "Longitude must be between -180 and 180.",
        variant: "destructive",
      });
      return;
    }

    if (isNaN(rad) || rad <= 0) {
      toast({
        title: "Validation error",
        description: "Radius must be a positive number (in kilometers).",
        variant: "destructive",
      });
      return;
    }

    if (editingZone) {
      updateZoneMutation.mutate({ id: editingZone.id, data: formState });
    } else {
      createZoneMutation.mutate(formState);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Zone Management</h1>
          <p className="text-muted-foreground">
            Manage geographic zones for location-based banner targeting.
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          New Zone
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, idx) => (
            <Skeleton key={idx} className="h-48 w-full" />
          ))}
        </div>
      ) : !zones || zones.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No zones yet</CardTitle>
            <CardDescription>
              Create your first zone to enable location-based banner targeting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Create Zone
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {zones.map((zone) => (
            <Card key={zone.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <CardTitle className="text-xl">{zone.name}</CardTitle>
                    <CardDescription className="mt-1">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span>
                          {zone.latitude}, {zone.longitude}
                        </span>
                      </div>
                    </CardDescription>
                  </div>
                  <Badge variant={zone.isActive ? "default" : "secondary"}>
                    {zone.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div>
                    <span className="font-medium">Radius:</span> {zone.radius} km
                  </div>
                  <div>
                    <span className="font-medium">Created:</span>{" "}
                    {zone.createdAt
                      ? new Date(zone.createdAt).toLocaleDateString()
                      : "—"}
                  </div>
                </div>
                <div className="mt-auto flex items-center gap-2">
                  <Switch
                    checked={zone.isActive}
                    onCheckedChange={(checked) => {
                      updateZoneMutation.mutate({
                        id: zone.id,
                        data: { isActive: checked },
                      });
                    }}
                  />
                  <span className="text-sm text-muted-foreground">Active</span>
                  <div className="ml-auto flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(zone)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setZoneToDelete(zone)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsDialogOpen(true);
          } else {
            handleDialogClose();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingZone ? "Edit Zone" : "Create Zone"}</DialogTitle>
            <DialogDescription>
              Define a geographic zone with center coordinates and radius for banner targeting.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="zone-name">Zone Name</Label>
              <Input
                id="zone-name"
                value={formState.name}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Downtown Area"
                required
              />
              <p className="text-xs text-muted-foreground">
                A descriptive name for this zone (e.g., "City Center", "North District").
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="zone-latitude">Latitude</Label>
                <Input
                  id="zone-latitude"
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  value={formState.latitude}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, latitude: event.target.value }))
                  }
                  placeholder="24.8607"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Center latitude (-90 to 90).
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="zone-longitude">Longitude</Label>
                <Input
                  id="zone-longitude"
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  value={formState.longitude}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, longitude: event.target.value }))
                  }
                  placeholder="67.0011"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Center longitude (-180 to 180).
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="zone-radius">Radius (km)</Label>
              <Input
                id="zone-radius"
                type="number"
                step="0.1"
                min="0.1"
                value={formState.radius}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, radius: event.target.value }))
                }
                placeholder="5.0"
                required
              />
              <p className="text-xs text-muted-foreground">
                The radius in kilometers from the center point. Banners assigned to this zone will
                be shown to users within this radius.
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-md border p-3">
              <Switch
                id="zone-active"
                checked={formState.isActive}
                onCheckedChange={(checked) =>
                  setFormState((prev) => ({ ...prev, isActive: checked }))
                }
              />
              <div>
                <p className="text-sm font-medium">
                  {formState.isActive ? "Active" : "Inactive"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Inactive zones won't be used for banner targeting.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleDialogClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createZoneMutation.isPending || updateZoneMutation.isPending}
              >
                {editingZone ? "Save Changes" : "Create Zone"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(zoneToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setZoneToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete zone?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The zone will be removed and banners assigned to it
              will become global (visible to all users).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => zoneToDelete && deleteZoneMutation.mutate(zoneToDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

