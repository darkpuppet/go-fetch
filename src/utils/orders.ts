import {
  ORDER_NUMBER_LENGTH,
  ORDER_STATUSES,
  type OrderLine,
  type OrderStatus
} from '../types';

const ORDER_NUMBER_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const ORDER_NUMBER_PATTERN = /^[2-9A-HJ-NP-Z]{5}$/;

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  submitted: 'New',
  accepted: 'Accepted',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

export function createOrderNumber(): string {
  const bytes = new Uint8Array(ORDER_NUMBER_LENGTH);
  crypto.getRandomValues(bytes);

  let code = '';

  for (const byte of bytes) {
    code += ORDER_NUMBER_ALPHABET[byte % ORDER_NUMBER_ALPHABET.length] ?? '';
  }

  return code;
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function orderStatusLabel(status: OrderStatus) {
  return ORDER_STATUS_LABELS[status];
}

export function parseMenuPrice(price: string): number | null {
  const match = price.replace(/,/g, '').match(/\d+(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

export function orderTotalLabel(items: OrderLine[]): string | null {
  let total = 0;

  for (const item of items) {
    const price = parseMenuPrice(item.price);

    if (price == null) {
      return null;
    }

    total += price * item.quantity;
  }

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD'
  }).format(total);
}

export function summarizeOrderItems(items: OrderLine[]) {
  return items.map((item) => `${item.quantity}× ${item.name}`).join(', ');
}

export function formatOrderTime(timestamp?: number) {
  if (!timestamp) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp));
}
