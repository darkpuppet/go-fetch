import { MENU_ITEM_CATEGORIES, type MenuItem, type MenuItemCategory } from '../types';

export const MAX_MENU_ITEMS = 40;
export const MAX_MENU_ITEM_NAME = 80;
export const MAX_MENU_ITEM_DESCRIPTION = 280;
export const MAX_MENU_ITEM_PRICE = 24;

const MENU_ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export type PublishedMenuItem = {
  name: string;
  description: string;
  price: string;
  category: string;
};

export function buildPublishedMenu(items: MenuItem[]) {
  const menuItems: Array<{
    id: string;
    name: string;
    description: string;
    price: string;
    category: string;
  }> = [];
  const menuById: Record<string, PublishedMenuItem> = {};
  const seen = new Set<string>();

  for (const item of items) {
    const name = item.name.trim();

    if (!name) {
      continue;
    }

    const id = item.id.trim();

    if (!MENU_ITEM_ID_PATTERN.test(id)) {
      throw new Error('Each menu item needs an id made of letters, numbers, hyphens, or underscores.');
    }

    if (seen.has(id)) {
      throw new Error('Each menu item needs its own id.');
    }

    if (name.length > MAX_MENU_ITEM_NAME) {
      throw new Error(`Menu item names must be ${MAX_MENU_ITEM_NAME} characters or fewer.`);
    }

    const description = (item.description ?? '').trim();
    const price = (item.price ?? '').trim();
    const category = normalizeMenuItemCategory(item.category) ?? '';

    if (description.length > MAX_MENU_ITEM_DESCRIPTION) {
      throw new Error(`Menu descriptions must be ${MAX_MENU_ITEM_DESCRIPTION} characters or fewer.`);
    }

    if (price.length > MAX_MENU_ITEM_PRICE) {
      throw new Error(`Menu prices must be ${MAX_MENU_ITEM_PRICE} characters or fewer.`);
    }

    seen.add(id);
    const published = { name, description, price, category };
    menuItems.push({ id, ...published });
    menuById[id] = published;
  }

  if (menuItems.length > MAX_MENU_ITEMS) {
    throw new Error(`A menu can include up to ${MAX_MENU_ITEMS} items.`);
  }

  return { menuItems, menuById };
}

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
