import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Banner } from "@shared/schema";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  ArrowDown,
  ArrowUp,
  Calendar as CalendarIcon,
  ImageIcon,
  Link as LinkIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

type BannerFormState = {
  title: string;
  description: string;
  linkUrl: string;
  position: string;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  isClickable: boolean;
  bannerType: "top" | "ad";
};

const defaultFormState: BannerFormState = {
  title: "",
  description: "",
  linkUrl: "",
  position: "",
  validFrom: "",
  validUntil: "",
  isActive: true,
  isClickable: true,
  bannerType: "top",
};

const formatDateInput = (value?: string | Date | null): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
};

const formatDisplayDate = (value?: string | Date | null): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
};

export default function AdminBanners() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [bannerToDelete, setBannerToDelete] = useState<Banner | null>(null);
  const [formState, setFormState] = useState<BannerFormState>(defaultFormState);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const revokePreview = (preview?: string | null) => {
    if (preview && preview.startsWith("blob:")) {
      URL.revokeObjectURL(preview);
    }
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingBanner(null);
    setFormState(defaultFormState);
    setImageFile(null);
    revokePreview(imagePreview);
    setImagePreview(null);
  };

  useEffect(() => {
    return () => {
      revokePreview(imagePreview);
    };
  }, [imagePreview]);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    revokePreview(imagePreview);
    setImageFile(file);
    if (file) {
      setImagePreview(URL.createObjectURL(file));
    } else if (editingBanner) {
      setImagePreview(editingBanner.imageUrl ?? null);
    } else {
      setImagePreview(null);
    }
    event.target.value = "";
  };

  const { data: banners, isLoading } = useQuery<Banner[]>({
    queryKey: ["/api/admin/banners"],
    queryFn: async () => {
      const res = await fetch("/api/admin/banners", {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load banners");
      }
      return (await res.json()) as Banner[];
    },
  });

  const invalidateBanners = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/admin/banners"] });

  const createBannerMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/admin/banners", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error((await res.text()) || "Failed to create banner");
      }
      return (await res.json()) as Banner;
    },
    onSuccess: () => {
      invalidateBanners();
      handleDialogClose();
      toast({ title: "Banner created", description: "New banner is live." });
    },
    onError: (error: any) => {
      toast({
        title: "Creation failed",
        description: error?.message ?? "Unable to create banner",
        variant: "destructive",
      });
    },
  });

  const updateBannerMutation = useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: FormData }) => {
      const res = await fetch(`/api/admin/banners/${id}`, {
        method: "PUT",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error((await res.text()) || "Failed to update banner");
      }
      return (await res.json()) as Banner;
    },
    onSuccess: () => {
      invalidateBanners();
      handleDialogClose();
      toast({ title: "Banner updated", description: "Changes saved successfully." });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error?.message ?? "Unable to update banner",
        variant: "destructive",
      });
    },
  });

  const toggleBannerMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/banners/${id}/status`, { isActive });
      return (await res.json()) as Banner;
    },
    onSuccess: () => {
      invalidateBanners();
      toast({ title: "Banner status updated" });
    },
    onError: (error: any) => {
      toast({
        title: "Status update failed",
        description: error?.message ?? "Unable to update banner status",
        variant: "destructive",
      });
    },
  });

  const deleteBannerMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/banners/${id}`);
    },
    onSuccess: () => {
      invalidateBanners();
      setBannerToDelete(null);
      toast({ title: "Banner removed" });
    },
    onError: (error: any) => {
      toast({
        title: "Deletion failed",
        description: error?.message ?? "Unable to delete banner",
        variant: "destructive",
      });
    },
  });

  const reorderBannerMutation = useMutation({
    mutationFn: async (order: string[]) => {
      const res = await apiRequest("PATCH", "/api/admin/banners/reorder", { order });
      return (await res.json()) as Banner[];
    },
    onSuccess: () => {
      invalidateBanners();
      toast({ title: "Banner order updated" });
    },
    onError: (error: any) => {
      toast({
        title: "Reorder failed",
        description: error?.message ?? "Unable to reorder banners",
        variant: "destructive",
      });
    },
  });

  const sortedBanners = useMemo(() => {
    if (!banners) return [];
    return [...banners].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [banners]);

  const openCreateDialog = () => {
    revokePreview(imagePreview);
    setImagePreview(null);
    setImageFile(null);
    setFormState(defaultFormState);
    setEditingBanner(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (banner: Banner) => {
    revokePreview(imagePreview);
    setEditingBanner(banner);
    setFormState({
      title: banner.title ?? "",
      description: banner.description ?? "",
      linkUrl: banner.linkUrl ?? "",
      position: banner.position != null ? String(banner.position) : "",
      validFrom: formatDateInput(banner.validFrom),
      validUntil: formatDateInput(banner.validUntil),
      isActive: Boolean(banner.isActive),
      isClickable: banner.isClickable ?? true,
      bannerType: (banner.bannerType as "top" | "ad") ?? "top",
    });
    setImageFile(null);
    setImagePreview(banner.imageUrl ?? null);
    setIsDialogOpen(true);
  };

  const buildFormData = (): FormData | null => {
    const title = formState.title.trim();
    if (!title) {
      toast({
        title: "Validation error",
        description: "Title is required.",
        variant: "destructive",
      });
      return null;
    }

    if (!editingBanner && !imageFile) {
      toast({
        title: "Validation error",
        description: "Upload a banner image to continue.",
        variant: "destructive",
      });
      return null;
    }

    const positionValue = formState.position.trim();
    let position: number | undefined;
    if (positionValue) {
      const numeric = Number(positionValue);
      if (!Number.isFinite(numeric) || numeric < 0) {
        toast({
          title: "Validation error",
          description: "Display order must be a positive number.",
          variant: "destructive",
        });
        return null;
      }
      position = Math.floor(numeric);
    }

    const scheduleStart = formState.validFrom.trim();
    const scheduleEnd = formState.validUntil.trim();
    if (scheduleStart && scheduleEnd) {
      const startDate = new Date(scheduleStart);
      const endDate = new Date(scheduleEnd);
      if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && startDate > endDate) {
        toast({
          title: "Validation error",
          description: "End date must be after start date.",
          variant: "destructive",
        });
        return null;
      }
    }

    const linkUrl = formState.linkUrl.trim();
    if (formState.isClickable && !linkUrl) {
      toast({
        title: "Validation error",
        description: "Add a destination link for clickable banners.",
        variant: "destructive",
      });
      return null;
    }

    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", formState.description);
    formData.append("linkUrl", formState.isClickable ? linkUrl : "");
    if (positionValue) {
      formData.append("position", String(position ?? 0));
    }
    formData.append("validFrom", formState.validFrom);
    formData.append("validUntil", formState.validUntil);
    formData.append("isActive", formState.isActive ? "true" : "false");
    formData.append("isClickable", formState.isClickable ? "true" : "false");
    formData.append("bannerType", formState.bannerType);
    if (imageFile) {
      formData.append("image", imageFile);
    }

    return formData;
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const formData = buildFormData();
    if (!formData) return;

    if (editingBanner) {
      updateBannerMutation.mutate({ id: editingBanner.id, formData });
    } else {
      createBannerMutation.mutate(formData);
    }
  };

  const handleMove = (bannerId: string, direction: "up" | "down") => {
    if (!banners) return;
    const currentOrder = banners.map((banner) => banner.id);
    const index = currentOrder.findIndex((id) => id === bannerId);
    if (index === -1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;

    const newOrder = [...currentOrder];
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    reorderBannerMutation.mutate(newOrder);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Marketing Banners</h1>
          <p className="text-muted-foreground">
            Manage hero banners for the public landing experience.
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          New Banner
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, idx) => (
            <Skeleton key={idx} className="h-56 w-full" />
          ))}
        </div>
      ) : sortedBanners.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No banners yet</CardTitle>
            <CardDescription>
              Create your first banner to highlight promotions on the landing page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Create Banner
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sortedBanners.map((banner, index) => (
            <Card key={banner.id} className="flex flex-col">
              <div className="relative h-40 w-full overflow-hidden rounded-t-lg bg-muted">
                {banner.imageUrl ? (
                  <img
                    src={banner.imageUrl}
                    alt={banner.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-10 w-10" />
                  </div>
                )}
              </div>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">{banner.title}</CardTitle>
                    <CardDescription>{banner.description}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">#{banner.position ?? 0}</Badge>
                    <Badge variant="secondary">
                      {banner.bannerType === "ad" ? "Ad" : "Top"}
                    </Badge>
                    <Badge variant={banner.isClickable ? "default" : "secondary"}>
                      {banner.isClickable ? "Clickable" : "Static"}
                    </Badge>
                    <Badge variant={banner.isActive ? "default" : "secondary"}>
                      {banner.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    <span>
                      {banner.validFrom || banner.validUntil
                        ? `${formatDisplayDate(banner.validFrom)} → ${formatDisplayDate(banner.validUntil)}`
                        : "Always visible"}
                    </span>
                  </div>
                  {banner.linkUrl && (
                    <div className="flex items-center gap-2">
                      <LinkIcon className="h-4 w-4" />
                      <a
                        href={banner.linkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {banner.linkUrl}
                      </a>
                    </div>
                  )}
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === 0 || reorderBannerMutation.isPending}
                    onClick={() => handleMove(banner.id, "up")}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === sortedBanners.length - 1 || reorderBannerMutation.isPending}
                    onClick={() => handleMove(banner.id, "down")}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Switch
                    checked={banner.isActive}
                    onCheckedChange={(checked) =>
                      toggleBannerMutation.mutate({ id: banner.id, isActive: checked })
                    }
                  />
                  <span className="text-sm text-muted-foreground">Visible</span>
                  <div className="ml-auto flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(banner)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setBannerToDelete(banner)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingBanner ? "Edit Banner" : "Create Banner"}</DialogTitle>
            <DialogDescription>
              Upload visuals, copy, and schedule for the landing experience.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="banner-title">Title</Label>
                <Input
                  id="banner-title"
                  value={formState.title}
                  onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Summer Specials"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="banner-image">Banner Image</Label>
                <Input
                  id="banner-image"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  onChange={handleImageChange}
                />
                <p className="text-xs text-muted-foreground">
                  Upload a JPG or PNG (max 5MB). This image appears on the landing page hero section.
                </p>
                {imagePreview && (
                  <div className="overflow-hidden rounded-md border bg-muted/30">
                    <img
                      src={imagePreview}
                      alt="Banner preview"
                      className="h-40 w-full object-cover"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="banner-link">Call-to-action Link</Label>
                <Input
                  id="banner-link"
                  value={formState.linkUrl}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, linkUrl: event.target.value }))
                  }
                  placeholder="https://example.com/promo"
                  disabled={!formState.isClickable}
                  required={formState.isClickable}
                />
                {!formState.isClickable && (
                  <p className="text-xs text-muted-foreground">
                    Enable the toggle below to make this banner clickable.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="banner-position">Display Order</Label>
                <Input
                  id="banner-position"
                  type="number"
                  min={0}
                  value={formState.position}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, position: event.target.value }))
                  }
                  placeholder="Auto"
                />
                <p className="text-xs text-muted-foreground">
                  Lower numbers appear first. Leave blank to append at the end.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="banner-description">Description</Label>
              <Textarea
                id="banner-description"
                rows={3}
                value={formState.description}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Highlight what makes this campaign special..."
              />
            </div>

            <div className="space-y-2">
              <Label>Banner Placement</Label>
              <Select
                value={formState.bannerType}
                onValueChange={(value: "top" | "ad") =>
                  setFormState((prev) => ({ ...prev, bannerType: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select banner placement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="top">Top Hero Banner</SelectItem>
                  <SelectItem value="ad">Ad / Secondary Banner</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Top banners usually appear in the hero carousel, Ad banners fit promo slots.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="banner-start">Valid From</Label>
                <Input
                  id="banner-start"
                  type="datetime-local"
                  value={formState.validFrom}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, validFrom: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="banner-end">Valid Until</Label>
                <Input
                  id="banner-end"
                  type="datetime-local"
                  value={formState.validUntil}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, validUntil: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center gap-3 rounded-md border p-3">
                <Switch
                  id="banner-clickable"
                  checked={formState.isClickable}
                  onCheckedChange={(checked) =>
                    setFormState((prev) => ({
                      ...prev,
                      isClickable: checked,
                      linkUrl: checked ? prev.linkUrl : "",
                    }))
                  }
                />
                <div>
                  <p className="text-sm font-medium">
                    {formState.isClickable ? "Clickable" : "Static"} banner
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Toggle off if this banner should be informational only.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-md border p-3">
                <Switch
                  id="banner-active"
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
                    Inactive banners stay hidden from all apps.
                  </p>
                </div>
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
                disabled={createBannerMutation.isPending || updateBannerMutation.isPending}
              >
                {editingBanner ? "Save Changes" : "Create Banner"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(bannerToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setBannerToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove banner?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The banner will be removed from all experiences.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bannerToDelete && deleteBannerMutation.mutate(bannerToDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

