import type { MenuAddon, MenuItem } from "@shared/schema";

export type MenuItemWithAddons = MenuItem & {
  addons?: MenuAddon[];
  gstRate?: string | number | null;
  gstMode?: "include" | "exclude" | null;
};


