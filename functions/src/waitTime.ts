export const DEFAULT_READY_MILLIS = 8 * 60 * 1000;
export const MIN_READY_MILLIS = 2 * 60 * 1000;
export const MAX_READY_MILLIS = 45 * 60 * 1000;
export const MAX_QUOTE_MILLIS = 6 * 60 * 60 * 1000;
export const STATS_ORDER_WINDOW = 40;
export const ESTIMATE_MIN_LEAD_MILLIS = 60 * 1000;
export const ESTIMATE_REWRITE_THRESHOLD_MILLIS = 20 * 1000;

export type WaitSampleOrder = {
  id: string;
  status: string;
  createdAt?: number;
  readyAt?: number;
  completedAt?: number;
  updatedAt?: number;
  estimatedReadyAt?: number;
};

export type TruckWaitStats = {
  truckId: string;
  ordersCreated: number;
  ordersReady: number;
  ordersCompleted: number;
  totalReadyMillis: number;
  totalCompletionMillis: number;
  activeOrderCount: number;
  averageReadyMillis: number;
};

function clampDuration(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeDefaultWaitMillis(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_READY_MILLIS;
  }

  const minutes = Math.round(value / 60000);
  return clampDuration(minutes * 60000, MIN_READY_MILLIS, MAX_READY_MILLIS);
}

function durationSample(start: number | undefined, end: number | undefined) {
  if (start == null || end == null || end < start) {
    return null;
  }

  return clampDuration(end - start, MIN_READY_MILLIS, MAX_READY_MILLIS);
}

function readySample(order: WaitSampleOrder) {
  if (order.readyAt != null) {
    return durationSample(order.createdAt, order.readyAt);
  }

  if (order.status === 'ready') {
    return durationSample(order.createdAt, order.updatedAt);
  }

  return null;
}

function completionSample(order: WaitSampleOrder) {
  if (order.status !== 'completed') {
    return null;
  }

  return durationSample(order.createdAt, order.completedAt);
}

export function buildTruckOrderStats(
  truckId: string,
  orders: WaitSampleOrder[],
  defaultWaitMillis?: number | null
): TruckWaitStats {
  const readySamples: number[] = [];
  const completionSamples: number[] = [];
  let activeOrderCount = 0;

  for (const order of orders) {
    if (order.status === 'submitted' || order.status === 'accepted') {
      activeOrderCount += 1;
    }

    const ready = readySample(order);
    if (ready != null) {
      readySamples.push(ready);
    }

    const completed = completionSample(order);
    if (completed != null) {
      completionSamples.push(completed);
    }
  }

  const samples = readySamples.length > 0 ? readySamples : completionSamples;
  const averageReadyMillis = samples.length
    ? clampDuration(
        samples.reduce((sum, sample) => sum + sample, 0) / samples.length,
        MIN_READY_MILLIS,
        MAX_READY_MILLIS
      )
    : normalizeDefaultWaitMillis(defaultWaitMillis);

  return {
    truckId,
    ordersCreated: orders.length,
    ordersReady: readySamples.length,
    ordersCompleted: completionSamples.length,
    totalReadyMillis: readySamples.reduce((sum, sample) => sum + sample, 0),
    totalCompletionMillis: completionSamples.reduce((sum, sample) => sum + sample, 0),
    activeOrderCount,
    averageReadyMillis
  };
}

export function queueEstimateMillis(now: number, averageReadyMillis: number, position: number) {
  const raw = now + averageReadyMillis * Math.max(1, position);
  return Math.min(now + MAX_QUOTE_MILLIS, Math.max(now + ESTIMATE_MIN_LEAD_MILLIS, raw));
}

export function shouldRewriteEstimate(current: number | undefined, next: number) {
  if (current == null) {
    return true;
  }

  return Math.abs(current - next) >= ESTIMATE_REWRITE_THRESHOLD_MILLIS;
}
