"use client";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Plus, UtensilsCrossed, Folder, FolderPlus, ListPlus, Trash2, Pencil } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { MenuCategory, MenuItem, MenuSubcategory as SubMenuCategory, MenuAddon } from "@shared/schema";

type MenuItemWithAddons = MenuItem & {
  addons?: MenuAddon[];
  gstRate?: string | number | null;
  gstMode?: "include" | "exclude" | null;
};

export default function MenuManagement() {
  const { toast } = useToast();

  // Dialog states
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isCreatingSubCategory, setIsCreatingSubCategory] = useState(false);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [isManagingAddons, setIsManagingAddons] = useState(false);

  // Form states
  const [categoryName, setCategoryName] = useState("");
  const [categoryDesc, setCategoryDesc] = useState("");
  const [categoryGstRate, setCategoryGstRate] = useState<string>("0");
  const [categoryGstMode, setCategoryGstMode] = useState<"include" | "exclude">("exclude");

  const [subCategoryName, setSubCategoryName] = useState("");
  const [subCategoryDesc, setSubCategoryDesc] = useState("");
  const [parentCategoryId, setParentCategoryId] = useState<string>("");

  const [itemCategoryId, setItemCategoryId] = useState<string>("");
  const [itemSubCategoryId, setItemSubCategoryId] = useState<string>("");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemPhoto, setItemPhoto] = useState<File | null>(null);
  const [itemAvailable, setItemAvailable] = useState(true);

  const [activeItemForAddons, setActiveItemForAddons] = useState<MenuItemWithAddons | null>(null);
  const [editingAddon, setEditingAddon] = useState<MenuAddon | null>(null);
  const [addonName, setAddonName] = useState("");
  const [addonPrice, setAddonPrice] = useState("");
  const [addonCategory, setAddonCategory] = useState("");
  const [addonRequired, setAddonRequired] = useState(false);

  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [editingSubCategory, setEditingSubCategory] = useState<SubMenuCategory | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItemWithAddons | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<MenuCategory | null>(null);
  const [subCategoryToDelete, setSubCategoryToDelete] = useState<SubMenuCategory | null>(null);
  const [itemToDelete, setItemToDelete] = useState<MenuItemWithAddons | null>(null);

  const resetAddonForm = () => {
    setAddonName("");
    setAddonPrice("");
    setAddonCategory("");
    setAddonRequired(false);
    setEditingAddon(null);
  };

  const resetCategoryForm = () => {
    setCategoryName("");
    setCategoryDesc("");
    setCategoryGstRate("0");
    setCategoryGstMode("exclude");
    setEditingCategory(null);
  };

  const resetSubCategoryForm = () => {
    setSubCategoryName("");
    setSubCategoryDesc("");
    setParentCategoryId("");
    setEditingSubCategory(null);
  };

  const resetItemForm = () => {
    setItemCategoryId("");
    setItemSubCategoryId("");
    setItemName("");
    setItemPrice("");
    setItemDescription("");
    setItemPhoto(null);
    setItemAvailable(true);
    setEditingItem(null);
  };

  const formatPrice = (value: unknown) => {
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
      return numeric.toFixed(2);
    }
    return typeof value === "string" && value.trim() !== "" ? value : "0.00";
  };

  const openManageAddons = (item: MenuItemWithAddons) => {
    setActiveItemForAddons(item);
    resetAddonForm();
    setIsManagingAddons(true);
  };

  const handleCategoryDialogChange = (open: boolean) => {
    if (!open) {
      setIsCreatingCategory(false);
      resetCategoryForm();
    } else {
      setIsCreatingCategory(true);
    }
  };

  const handleSubCategoryDialogChange = (open: boolean) => {
    if (!open) {
      setIsCreatingSubCategory(false);
      resetSubCategoryForm();
    } else {
      setIsCreatingSubCategory(true);
    }
  };

  const handleItemDialogChange = (open: boolean) => {
    if (!open) {
      setIsCreatingItem(false);
      resetItemForm();
    } else {
      setIsCreatingItem(true);
    }
  };

  // Queries
  const { data: categories, isLoading: loadingCategories } = useQuery<MenuCategory[]>({
    queryKey: ["/api/vendor/menu/categories"],
  });

  const { data: subCategories, isLoading: loadingSubCats } = useQuery<SubMenuCategory[]>({
    queryKey: ["/api/vendor/menu/subcategories"],
  });

  const { data: items, isLoading: loadingItems } = useQuery<MenuItemWithAddons[]>({
    queryKey: ["/api/vendor/menu/items"],
  });

  const { data: addons, isLoading: loadingAddons } = useQuery<MenuAddon[]>({
    queryKey: ["/api/vendor/menu/addons"],
  });

  const addonsByItem = (addons ?? []).reduce<Record<number, MenuAddon[]>>((acc, addon) => {
    if (!acc[addon.itemId]) {
      acc[addon.itemId] = [];
    }
    acc[addon.itemId].push(addon);
    return acc;
  }, {});

  useEffect(() => {
    if (!activeItemForAddons || !items) return;
    const fresh = items.find((item) => item.id === activeItemForAddons.id);
    if (fresh && fresh !== activeItemForAddons) {
      setActiveItemForAddons(fresh);
    }
  }, [items, activeItemForAddons?.id]);

  const selectedAddons =
    activeItemForAddons
      ? addonsByItem[activeItemForAddons.id] ??
        activeItemForAddons.addons ??
        []
      : [];

  const parsedCategoryGst = Number.parseFloat(categoryGstRate);
  const isCategoryGstValid =
    categoryGstRate.trim() === "" ||
    (!Number.isNaN(parsedCategoryGst) && parsedCategoryGst >= 0 && parsedCategoryGst <= 100);

  // Category mutation
  const createCategory = useMutation({
    mutationFn: async () => {
      const numericRate = Number.parseFloat(categoryGstRate);
      const gstRateValue =
        Number.isFinite(numericRate) && numericRate >= 0 ? Number(numericRate.toFixed(2)) : 0;

      return await apiRequest("POST", "/api/vendor/menu/categories", {
        name: categoryName,
        description: categoryDesc,
        gstRate: gstRateValue,
        gstMode: categoryGstMode,
      });
    },
    onSuccess: () => {
      toast({ title: "Category created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/categories"] });
      resetCategoryForm();
      setIsCreatingCategory(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create category",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  // Subcategory mutation
  const createSubCategory = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/vendor/menu/subcategories", {
        categoryId: Number(parentCategoryId),
        name: subCategoryName,
        description: subCategoryDesc,
      });
    },
    onSuccess: () => {
      toast({ title: "Subcategory created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/subcategories"] });
      resetSubCategoryForm();
      setIsCreatingSubCategory(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create subcategory",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  // Item mutation (multipart)
  const createItem = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("categoryId", String(Number(itemCategoryId)));
      if (itemSubCategoryId && itemSubCategoryId !== "none") {
        formData.append("subCategoryId", itemSubCategoryId);
      }
      formData.append("name", itemName);
      formData.append("price", itemPrice);
      formData.append("description", itemDescription);
      formData.append("isAvailable", itemAvailable ? "true" : "false");
      if (itemPhoto) formData.append("photo", itemPhoto);

      const res = await fetch("/api/vendor/menu/items", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create item");
      }

      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Item added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/items"] });
      resetItemForm();
      setIsCreatingItem(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add item",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const updateCategory = useMutation({
    mutationFn: async () => {
      if (!editingCategory) {
        throw new Error("No category selected");
      }
      const trimmedName = categoryName.trim();
      const trimmedDescription = categoryDesc.trim();
      const parsedGst = Number.parseFloat(categoryGstRate);
      const normalizedGstRate =
        categoryGstRate.trim() === ""
          ? "0.00"
          : Number.isFinite(parsedGst)
            ? parsedGst.toFixed(2)
            : categoryGstRate;

      const payload = {
        name: trimmedName,
        description: trimmedDescription,
        gstRate: normalizedGstRate,
        gstMode: categoryGstMode,
      };
      const res = await apiRequest(
        "PUT",
        `/api/vendor/menu/categories/${editingCategory.id}`,
        payload,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Category updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/items"] });
      resetCategoryForm();
      setIsCreatingCategory(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update category",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (category: MenuCategory) => {
      const res = await apiRequest("DELETE", `/api/vendor/menu/categories/${category.id}`);
      return res.json();
    },
    onSuccess: (_data, category) => {
      toast({ title: `Deleted category "${category.name}"` });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/subcategories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/items"] });
      setCategoryToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete category",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const updateSubCategory = useMutation({
    mutationFn: async () => {
      if (!editingSubCategory) {
        throw new Error("No subcategory selected");
      }
      const payload: Record<string, unknown> = {};
      if (parentCategoryId) {
        payload.categoryId = Number(parentCategoryId);
      }
      payload.name = subCategoryName.trim();
      payload.description = subCategoryDesc.trim();

      const res = await apiRequest(
        "PUT",
        `/api/vendor/menu/subcategories/${editingSubCategory.id}`,
        payload,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Subcategory updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/subcategories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/items"] });
      resetSubCategoryForm();
      setIsCreatingSubCategory(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update subcategory",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const deleteSubCategory = useMutation({
    mutationFn: async (subcategory: SubMenuCategory) => {
      const res = await apiRequest(
        "DELETE",
        `/api/vendor/menu/subcategories/${subcategory.id}`,
      );
      return res.json();
    },
    onSuccess: (_data, subcategory) => {
      toast({ title: `Deleted subcategory "${subcategory.name}"` });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/subcategories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/items"] });
      setSubCategoryToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete subcategory",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const updateItem = useMutation({
    mutationFn: async () => {
      if (!editingItem) {
        throw new Error("No item selected");
      }
      if (!itemCategoryId || !itemName.trim() || !itemPrice.trim()) {
        throw new Error("Missing required fields");
      }

      const formData = new FormData();
      formData.append("categoryId", String(Number(itemCategoryId)));
      if (itemSubCategoryId && itemSubCategoryId !== "none") {
        formData.append("subCategoryId", itemSubCategoryId);
      } else if (editingItem.subCategoryId) {
        formData.append("subCategoryId", "");
      }
      const trimmedName = itemName.trim();
      const trimmedPrice = itemPrice.trim();
      const trimmedDescription = itemDescription.trim();
      formData.append("name", trimmedName);
      formData.append("price", trimmedPrice);
      formData.append("description", trimmedDescription);
      formData.append("isAvailable", itemAvailable ? "true" : "false");
      if (itemPhoto) {
        formData.append("photo", itemPhoto);
      }

      const res = await fetch(`/api/vendor/menu/items/${editingItem.id}`, {
        method: "PUT",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Failed to update item");
      }

      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Item updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/items"] });
      resetItemForm();
      setIsCreatingItem(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update item",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (item: MenuItemWithAddons) => {
      const res = await apiRequest("DELETE", `/api/vendor/menu/items/${item.id}`);
      return res.json();
    },
    onSuccess: (_data, item) => {
      toast({ title: `Deleted item "${item.name}"` });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/items"] });
      setItemToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete item",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const saveAddon = useMutation({
    mutationFn: async () => {
      if (!activeItemForAddons) {
        throw new Error("Select a menu item first");
      }

      const trimmedName = addonName.trim();
      const trimmedPrice = addonPrice.trim();
      const trimmedCategory = addonCategory.trim();

      const payload = {
        itemId: activeItemForAddons.id,
        name: trimmedName,
        price: trimmedPrice === "" ? "0" : trimmedPrice,
        category: trimmedCategory === "" ? undefined : trimmedCategory,
        isRequired: addonRequired,
      };

      if (editingAddon) {
        const res = await apiRequest("PUT", `/api/vendor/menu/addons/${editingAddon.id}`, payload);
        return res.json();
      }

      const res = await apiRequest("POST", "/api/vendor/menu/addons", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: editingAddon ? "Addon updated" : "Addon added", description: editingAddon ? undefined : "Customers will now see this addon when ordering." });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/addons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/items"] });
      resetAddonForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save addon",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const toggleAddonRequired = useMutation({
    mutationFn: async ({ addonId, isRequired }: { addonId: number; isRequired: boolean }) => {
      const res = await apiRequest("PUT", `/api/vendor/menu/addons/${addonId}`, { isRequired });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/addons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/items"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update addon",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const deleteAddon = useMutation({
    mutationFn: async (addonId: number) => {
      const res = await apiRequest("DELETE", `/api/vendor/menu/addons/${addonId}`);
      return res.json();
    },
    onSuccess: (_data, addonId) => {
      toast({ title: "Addon removed" });
      if (editingAddon?.id === addonId) {
        resetAddonForm();
      }
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/addons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/menu/items"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete addon",
        description: error?.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const handleEditAddon = (addon: MenuAddon) => {
    setEditingAddon(addon);
    setAddonName(addon.name ?? "");
    setAddonPrice(addon.price?.toString() ?? "");
    setAddonCategory(addon.category ?? "");
    setAddonRequired(Boolean(addon.isRequired));
  };

  const handleToggleAddonRequired = (addon: MenuAddon, next: boolean) => {
    toggleAddonRequired.mutate({ addonId: addon.id, isRequired: next });
  };

  const handleDeleteAddon = (addonId: number) => {
    deleteAddon.mutate(addonId);
  };

  const handleSaveAddon = () => {
    if (!addonName.trim()) {
      toast({
        title: "Addon name is required",
        variant: "destructive",
      });
      return;
    }
    saveAddon.mutate();
  };

  const handleAddonsDialogChange = (open: boolean) => {
    if (!open) {
      setIsManagingAddons(false);
      setActiveItemForAddons(null);
      resetAddonForm();
    } else {
      setIsManagingAddons(true);
    }
  };

  const handleEditCategory = (category: MenuCategory) => {
    setEditingCategory(category);
    setCategoryName(category.name ?? "");
    setCategoryDesc(category.description ?? "");
    setCategoryGstRate(formatPrice(category.gstRate));
    setCategoryGstMode(category.gstMode === "include" ? "include" : "exclude");
    setIsCreatingCategory(true);
  };

  const handleEditSubCategory = (subcategory: SubMenuCategory) => {
    setEditingSubCategory(subcategory);
    setParentCategoryId(subcategory.categoryId?.toString() ?? "");
    setSubCategoryName(subcategory.name ?? "");
    setSubCategoryDesc(subcategory.description ?? "");
    setIsCreatingSubCategory(true);
  };

  const handleEditItem = (item: MenuItemWithAddons) => {
    setEditingItem(item);
    setItemCategoryId(item.categoryId?.toString() ?? "");
    setItemSubCategoryId(item.subCategoryId?.toString() ?? "");
    setItemName(item.name ?? "");
    setItemPrice(formatPrice(item.price));
    setItemDescription(item.description ?? "");
    setItemAvailable(Boolean(item.isAvailable));
    setItemPhoto(null);
    setIsCreatingItem(true);
  };

  const handleDeleteCategory = () => {
    if (categoryToDelete) {
      deleteCategory.mutate(categoryToDelete);
    }
  };

  const handleDeleteSubCategory = () => {
    if (subCategoryToDelete) {
      deleteSubCategory.mutate(subCategoryToDelete);
    }
  };

  const handleDeleteItem = () => {
    if (itemToDelete) {
      deleteItem.mutate(itemToDelete);
    }
  };

  const isAddonFormValid = addonName.trim().length > 0;

  const renderMenuItemCard = (item: MenuItemWithAddons) => {
    const itemAddons = addonsByItem[item.id] ?? item.addons ?? [];

    return (
      <Card key={item.id} className="hover-elevate">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start gap-4">
            <div>
              <CardTitle className="text-base">{item.name}</CardTitle>
              <span className="text-sm font-mono text-muted-foreground">₹{formatPrice(item.price)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => openManageAddons(item)}
              >
                <ListPlus className="h-4 w-4 mr-1" />
                Manage
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleEditItem(item)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setItemToDelete(item)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {item.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
              <span>Add-ons</span>
              {loadingAddons && <Skeleton className="h-4 w-12" />}
            </div>
            {loadingAddons ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            ) : itemAddons.length > 0 ? (
              <div className="space-y-2">
                {itemAddons.map((addon) => (
                  <div
                    key={addon.id}
                    className="flex items-center justify-between rounded-md border border-muted p-2"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">{addon.name}</span>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {addon.isRequired && <Badge variant="secondary">Required</Badge>}
                        {addon.category && <Badge variant="outline">{addon.category}</Badge>}
                      </div>
                    </div>
                    <span className="text-xs font-mono">₹{formatPrice(addon.price)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No add-ons yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Handle "Add Item" click for a specific category
  const handleOpenAddItem = (categoryId: number, subCategoryId?: number) => {
    resetItemForm();
    const categoryIdString = categoryId.toString();
    setItemCategoryId(categoryIdString);
    if (subCategoryId) {
      setItemSubCategoryId(subCategoryId.toString());
    }
    setIsCreatingItem(true);
  };

  // Group subcategories by category
  const subCatsByCategory = subCategories?.reduce((acc, sub) => {
    (acc[sub.categoryId] = acc[sub.categoryId] || []).push(sub);
    return acc;
  }, {} as Record<number, SubMenuCategory[]>) || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Menu Management</h1>
          <p className="text-muted-foreground mt-2">
            Organize your menu with categories, subcategories, and items
          </p>
        </div>

        <div className="flex gap-2">
          {/* Add Category */}
          <Dialog open={isCreatingCategory} onOpenChange={handleCategoryDialogChange}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                onClick={() => {
                  resetCategoryForm();
                }}
              >
                <Folder className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingCategory ? "Edit Category" : "Create Category"}
                </DialogTitle>
                <DialogDescription>
                  {editingCategory
                    ? "Update the category name, description, or GST settings."
                    : "Organize your menu items into top-level categories."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Label>Name</Label>
                <Input
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="e.g. Appetizers"
                />
                <Label>Description (Optional)</Label>
                <Textarea
                  value={categoryDesc}
                  onChange={(e) => setCategoryDesc(e.target.value)}
                  placeholder="Short description"
                />
                <div className="space-y-2">
                  <Label>GST %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={categoryGstRate}
                    onChange={(e) => setCategoryGstRate(e.target.value)}
                    placeholder="e.g. 5"
                  />
                  {!isCategoryGstValid && (
                    <p className="text-xs text-destructive">Enter a value between 0 and 100.</p>
                  )}
                </div>
                <div className="space-y-3">
                  <Label>GST handling</Label>
                  <RadioGroup
                    value={categoryGstMode}
                    onValueChange={(value: "include" | "exclude") => setCategoryGstMode(value)}
                  >
                    <div className="flex items-start gap-3 rounded-md border border-muted p-3">
                      <RadioGroupItem value="include" id="category-gst-include" />
                      <div className="space-y-1">
                        <Label htmlFor="category-gst-include">Include in item price</Label>
                        <p className="text-xs text-muted-foreground">
                          GST will be merged into the product price during billing.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-md border border-muted p-3">
                      <RadioGroupItem value="exclude" id="category-gst-exclude" />
                      <div className="space-y-1">
                        <Label htmlFor="category-gst-exclude">Show GST separately</Label>
                        <p className="text-xs text-muted-foreground">
                          GST will appear as a separate line item on the bill.
                        </p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
                <Button
                  className="w-full"
                  onClick={() =>
                    editingCategory ? updateCategory.mutate() : createCategory.mutate()
                  }
                  disabled={
                    (editingCategory ? updateCategory.isPending : createCategory.isPending) ||
                    !categoryName.trim() ||
                    !isCategoryGstValid
                  }
                >
                  {editingCategory
                    ? updateCategory.isPending
                      ? "Saving..."
                      : "Save Changes"
                    : createCategory.isPending
                      ? "Creating..."
                      : "Create Category"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

      {/* Manage Add-ons Dialog */}
      <Dialog open={isManagingAddons} onOpenChange={handleAddonsDialogChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {activeItemForAddons
                ? `Manage add-ons for ${activeItemForAddons.name}`
                : "Manage add-ons"}
            </DialogTitle>
            <DialogDescription>
              Create extras like sauces, sides, or upgrades to attach to menu items.
            </DialogDescription>
          </DialogHeader>

          {activeItemForAddons ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Current add-ons</h4>
                {loadingAddons ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-5/6" />
                  </div>
                ) : selectedAddons.length > 0 ? (
                  <div className="space-y-2">
                    {selectedAddons.map((addon) => (
                      <div
                        key={addon.id}
                        className="flex flex-col gap-3 rounded-md border border-muted p-3 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <p className="font-medium">{addon.name}</p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>₹{formatPrice(addon.price)}</span>
                            {addon.category && <Badge variant="outline">{addon.category}</Badge>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 md:justify-end">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Required</span>
                            <Switch
                              checked={Boolean(addon.isRequired)}
                              onCheckedChange={(checked) => handleToggleAddonRequired(addon, checked)}
                              disabled={toggleAddonRequired.isPending}
                            />
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditAddon(addon)}
                            disabled={saveAddon.isPending}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteAddon(addon.id)}
                            disabled={deleteAddon.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No add-ons yet. Create your first add-on below.
                  </p>
                )}
              </div>

              <div className="space-y-4 border-t border-muted pt-4">
                <h4 className="text-sm font-semibold">
                  {editingAddon ? "Edit add-on" : "Add a new add-on"}
                </h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={addonName}
                      onChange={(e) => setAddonName(e.target.value)}
                      placeholder="e.g. Extra cheese"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Price (₹)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={addonPrice}
                      onChange={(e) => setAddonPrice(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category (optional)</Label>
                    <Input
                      value={addonCategory}
                      onChange={(e) => setAddonCategory(e.target.value)}
                      placeholder="e.g. Sauces"
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-muted px-4 py-3">
                    <div>
                      <Label className="font-medium">Required add-on</Label>
                      <p className="text-xs text-muted-foreground">
                        Customers must select this add-on when ordering the item.
                      </p>
                    </div>
                    <Switch checked={addonRequired} onCheckedChange={setAddonRequired} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleSaveAddon}
                    disabled={!isAddonFormValid || saveAddon.isPending}
                  >
                    {saveAddon.isPending
                      ? "Saving..."
                      : editingAddon
                      ? "Save changes"
                      : "Add add-on"}
                  </Button>
                  {editingAddon && (
                    <Button
                      variant="ghost"
                      onClick={resetAddonForm}
                      disabled={saveAddon.isPending}
                    >
                      Cancel edit
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a menu item to manage its add-ons.
            </p>
          )}
        </DialogContent>
      </Dialog>
          {/* Add Subcategory */}
          <Dialog open={isCreatingSubCategory} onOpenChange={handleSubCategoryDialogChange}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                onClick={() => {
                  resetSubCategoryForm();
                }}
              >
                <FolderPlus className="h-4 w-4 mr-2" />
                Add Subcategory
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingSubCategory ? "Edit Subcategory" : "Create Subcategory"}
                </DialogTitle>
                <DialogDescription>
                  {editingSubCategory
                    ? "Adjust this subcategory’s name or parent category."
                    : "Group similar items under a parent category."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Label>Parent Category</Label>
                <Select value={parentCategoryId} onValueChange={setParentCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label>Subcategory Name</Label>
                <Input
                  value={subCategoryName}
                  onChange={(e) => setSubCategoryName(e.target.value)}
                  placeholder="e.g. Veg Pizza"
                />
                <Label>Description (Optional)</Label>
                <Textarea
                  value={subCategoryDesc}
                  onChange={(e) => setSubCategoryDesc(e.target.value)}
                  placeholder="Short description"
                />
                <Button
                  className="w-full"
                  onClick={() =>
                    editingSubCategory
                      ? updateSubCategory.mutate()
                      : createSubCategory.mutate()
                  }
                  disabled={
                    (editingSubCategory
                      ? updateSubCategory.isPending
                      : createSubCategory.isPending) ||
                    !subCategoryName.trim() ||
                    !parentCategoryId
                  }
                >
                  {editingSubCategory
                    ? updateSubCategory.isPending
                      ? "Saving..."
                      : "Save Changes"
                    : createSubCategory.isPending
                      ? "Creating..."
                      : "Create Subcategory"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Display */}
      {loadingCategories || loadingSubCats || loadingItems ? (
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : categories && categories.length > 0 ? (
        <div className="space-y-6">
          {categories.map((category) => (
            <Card key={category.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{category.name}</CardTitle>
                      {(() => {
                        const rate = Number(category.gstRate ?? 0);
                        if (!Number.isFinite(rate) || rate <= 0) {
                          return null;
                        }
                        const formattedRate =
                          rate % 1 === 0 ? rate.toFixed(0) : rate.toFixed(2);
                        return (
                          <Badge variant="outline">
                            GST {formattedRate}% ·{" "}
                            {category.gstMode === "include" ? "included" : "separate"}
                          </Badge>
                        );
                      })()}
                    </div>
                    {category.description && (
                      <CardDescription>{category.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenAddItem(category.id)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Item
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditCategory(category)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setCategoryToDelete(category)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Subcategories under category */}
                {subCatsByCategory[category.id]?.map((sub) => (
                  <div key={sub.id} className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">{sub.name}</h3>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenAddItem(category.id, sub.id)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Item
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditSubCategory(sub)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSubCategoryToDelete(sub)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {items
                        ?.filter((i) => i.subCategoryId === sub.id)
                        .map((item) => renderMenuItemCard(item))}
                      {!items?.some((i) => i.subCategoryId === sub.id) && (
                        <div className="col-span-full text-center py-6 text-sm text-muted-foreground">
                          No items in this subcategory yet
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Items without subcategory */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items
                    ?.filter(
                      (i) => i.categoryId === category.id && !i.subCategoryId
                    )
                    .map((item) => renderMenuItemCard(item))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <UtensilsCrossed className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No menu yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Start by creating categories and subcategories
            </p>
            <Button onClick={() => setIsCreatingCategory(true)}>
              <Folder className="h-4 w-4 mr-2" />
              Create First Category
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add Item Dialog */}
      <Dialog open={isCreatingItem} onOpenChange={handleItemDialogChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Menu Item" : "Add Menu Item"}</DialogTitle>
            <DialogDescription>
              {editingItem
                ? "Update the item details for your menu."
                : "Create a new item for your menu"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Label>Category</Label>
            <Select value={itemCategoryId} onValueChange={setItemCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {itemCategoryId && (
              <>
                <Label>Subcategory (optional)</Label>
                <Select
                  value={itemSubCategoryId || "none"}
                  onValueChange={(value) => setItemSubCategoryId(value === "none" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subcategory" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No subcategory</SelectItem>
                    {subCatsByCategory[Number(itemCategoryId)]?.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id.toString()}>
                        {sub.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            <Label>Item Name</Label>
            <Input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. Margherita Pizza"
            />

            <Label>Price (₹)</Label>
            <Input
              type="number"
              step="0.01"
              value={itemPrice}
              onChange={(e) => setItemPrice(e.target.value)}
            />

            <Label>Description</Label>
            <Textarea
              value={itemDescription}
              onChange={(e) => setItemDescription(e.target.value)}
              placeholder="Describe this dish..."
            />

            <Label>Photo</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setItemPhoto(e.target.files?.[0] || null)}
            />

            <div className="flex items-center justify-between">
              <Label>Available</Label>
              <Switch checked={itemAvailable} onCheckedChange={setItemAvailable} />
            </div>

            <Button
              className="w-full"
              onClick={() => (editingItem ? updateItem.mutate() : createItem.mutate())}
              disabled={
                (editingItem ? updateItem.isPending : createItem.isPending) ||
                !itemName.trim() ||
                !itemCategoryId ||
                !itemPrice.trim()
              }
            >
              {editingItem
                ? updateItem.isPending
                  ? "Saving..."
                  : "Save Changes"
                : createItem.isPending
                  ? "Adding..."
                  : "Add Item"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(categoryToDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteCategory.isPending) {
            setCategoryToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the category
              {categoryToDelete ? ` "${categoryToDelete.name}"` : ""} along with all nested
              subcategories and items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setCategoryToDelete(null)}
              disabled={deleteCategory.isPending}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCategory}
              disabled={deleteCategory.isPending}
            >
              {deleteCategory.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(subCategoryToDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteSubCategory.isPending) {
            setSubCategoryToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete subcategory?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove
              {subCategoryToDelete ? ` "${subCategoryToDelete.name}"` : " this subcategory"}?
              Items linked to it will lose their grouping.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setSubCategoryToDelete(null)}
              disabled={deleteSubCategory.isPending}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSubCategory}
              disabled={deleteSubCategory.isPending}
            >
              {deleteSubCategory.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(itemToDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteItem.isPending) {
            setItemToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete menu item?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete
              {itemToDelete ? ` "${itemToDelete.name}"` : " this item"}? It will disappear from your
              menu immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setItemToDelete(null)}
              disabled={deleteItem.isPending}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteItem}
              disabled={deleteItem.isPending}
            >
              {deleteItem.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
