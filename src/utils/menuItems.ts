import { MENU_ITEM_CATEGORIES, type MenuItem, type MenuItemCategory } from '../types';

export function normalizeMenuItemCategory(value: unknown): MenuItemCategory | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return MENU_ITEM_CATEGORIES.includes(value as MenuItemCategory)
    ? (value as MenuItemCategory)
    : undefined;
}

export type MenuItemGroup = {
  category: MenuItemCategory | null;
  items: MenuItem[];
};

export function groupMenuItemsByCategory(items: MenuItem[]): MenuItemGroup[] {
  const groups = new Map<MenuItemCategory | null, MenuItem[]>();

  for (const item of items) {
    const category = normalizeMenuItemCategory(item.category) ?? null;
    const bucket = groups.get(category) ?? [];
    bucket.push(item);
    groups.set(category, bucket);
  }

  const ordered: MenuItemGroup[] = [];

  for (const category of MENU_ITEM_CATEGORIES) {
    const bucket = groups.get(category);

    if (bucket?.length) {
      ordered.push({ category, items: bucket });
    }

    groups.delete(category);
  }

  const uncategorized = groups.get(null);

  if (uncategorized?.length) {
    ordered.push({ category: null, items: uncategorized });
  }

  return ordered;
}
