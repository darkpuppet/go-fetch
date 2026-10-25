import type { OrderStatus } from '../types';

export const DEFAULT_READY_MILLIS = 8 * 60 * 1000;
export const MIN_READY_MILLIS = 2 * 60 * 1000;
export const MAX_READY_MILLIS = 45 * 60 * 1000;
export const MIN_QUOTE_MILLIS = 60 * 1000;
export const MAX_QUOTE_MILLIS = 6 * 60 * 60 * 1000;
export const STATS_ORDER_WINDOW = 40;
export const ESTIMATE_MIN_LEAD_MILLIS = 60 * 1000;
export const ESTIMATE_REWRITE_THRESHOLD_MILLIS = 20 * 1000;

export type WaitSampleOrder = {
  status: OrderStatus | string;
  createdAt?: number;
  readyAt?: number;
  completedAt?: number;
  updatedAt?: number;
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
  updatedAt?: number;
};

export function clampDuration(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function durationSample(start: number | undefined, end: number | undefined) {
  if (start == null || end == null || end < start) {
    return null;
  }

  return clampDuration(end - start, MIN_READY_MILLIS, MAX_READY_MILLIS);
}

export function readySample(order: WaitSampleOrder) {
  if (order.readyAt != null) {
    return durationSample(order.createdAt, order.readyAt);
  }

  if (order.status === 'ready') {
    return durationSample(order.createdAt, order.updatedAt);
  }

  return null;
}

export function completionSample(order: WaitSampleOrder) {
  if (order.status !== 'completed') {
    return null;
  }

  return durationSample(order.createdAt, order.completedAt);
}

export const MIN_DEFAULT_WAIT_MINUTES = MIN_READY_MILLIS / 60000;
export const MAX_DEFAULT_WAIT_MINUTES = MAX_READY_MILLIS / 60000;

export function normalizeDefaultWaitMillis(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_READY_MILLIS;
  }

  const minutes = Math.round(value / 60000);
  return clampDuration(minutes * 60000, MIN_READY_MILLIS, MAX_READY_MILLIS);
}

export function serviceReadyMillis(stats: TruckWaitStats | null, defaultWaitMillis?: number | null) {
  if (stats && (stats.ordersReady > 0 || stats.ordersCompleted > 0)) {
    return stats.averageReadyMillis;
  }

  return normalizeDefaultWaitMillis(defaultWaitMillis);
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

export function quoteWaitMillis(stats: TruckWaitStats | null, defaultWaitMillis?: number | null) {
  const average = serviceReadyMillis(stats, defaultWaitMillis);
  const ahead = stats?.activeOrderCount ?? 0;
  return clampDuration(average * (ahead + 1), MIN_QUOTE_MILLIS, MAX_QUOTE_MILLIS);
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

export type WaitClockParts = {
  ready: boolean;
  hours: number | null;
  minutes: string;
  seconds: string;
  label: string;
};

export function waitClockParts(remainingMillis: number): WaitClockParts {
  if (!Number.isFinite(remainingMillis) || remainingMillis <= 0) {
    return { ready: true, hours: null, minutes: '0', seconds: '00', label: 'Any moment' };
  }

  const totalSeconds = Math.ceil(remainingMillis / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const minuteText = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const secondText = String(seconds).padStart(2, '0');
  const hourPrefix = hours > 0 ? `${hours} hr ` : '';

  return {
    ready: false,
    hours: hours > 0 ? hours : null,
    minutes: minuteText,
    seconds: secondText,
    label: `${hourPrefix}${minuteText} m ${secondText} s`
  };
}

export function formatWaitClock(remainingMillis: number) {
  return waitClockParts(remainingMillis).label;
}

export function formatUsualWait(millis: number) {
  const minutes = Math.max(1, Math.round(millis / 60000));
  return minutes === 1 ? '1 min' : `${minutes} min`;
}

export function waitQuoteCaption(stats: TruckWaitStats | null, defaultWaitMillis?: number | null) {
  const usingDefault = !stats || (stats.ordersReady === 0 && stats.ordersCompleted === 0);
  const usual = formatUsualWait(
    !stats || stats.ordersReady === 0 && stats.ordersCompleted === 0
      ? normalizeDefaultWaitMillis(defaultWaitMillis)
      : stats.averageReadyMillis
  );
  const ahead = stats?.activeOrderCount ?? 0;
  const queue =
    ahead === 0
      ? 'No orders are ahead of you.'
      : `${ahead} ${ahead === 1 ? 'order is' : 'orders are'} in progress ahead of you.`;

  if (usingDefault) {
    const tracked = stats?.ordersCreated ?? 0;
    const history =
      tracked > 0
        ? `${tracked} recent ${tracked === 1 ? 'order is' : 'orders are'} tracked, and none have finished yet.`
        : 'This truck does not have finished orders yet.';
    const source =
      defaultWaitMillis == null
        ? `Usual ready time is about ${usual}.`
        : `This truck's default wait is about ${usual}.`;
    return `Starting estimate. ${queue} ${history} ${source}`;
  }

  const createdLabel = `${stats.ordersCreated} recent ${stats.ordersCreated === 1 ? 'order' : 'orders'} tracked`;
  return `${queue} ${createdLabel}. Usually ready in about ${usual}, and completed orders are included in that history.`;
}
