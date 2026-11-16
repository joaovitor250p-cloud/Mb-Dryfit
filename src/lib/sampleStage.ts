/** Estado único de Amostras/Cortes. Uma OC entregue não é um corte pronto. */
export type SampleStage = 'in_progress' | 'done' | 'store';

type TimestampLike = { seconds?: number; nanoseconds?: number };
export type SampleStageRecord = {
  status?: SampleStage | string;
  orderId?: string | null;
  createdAt?: unknown;
  completedAt?: unknown;
  createdBy?: string | null;
  completedBy?: string | null;
};

function timestampKey(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const stamp = value as TimestampLike;
  if (typeof stamp.seconds !== 'number' || !Number.isFinite(stamp.seconds)) return null;
  return stamp.seconds + ':' + (stamp.nanoseconds ?? 0);
}

/** Nas versões anteriores, a OC ENTREGUE gerava "done" no mesmo instante da criação. */
export function isAutoDeliveredSample(sample: SampleStageRecord): boolean {
  if (sample.status !== 'done' || !sample.orderId?.trim()) return false;
  if (!sample.createdBy || sample.createdBy !== sample.completedBy) return false;
  const created = timestampKey(sample.createdAt);
  return created !== null && created === timestampKey(sample.completedAt);
}

/** As duas abas consultam exatamente o mesmo estado efetivo. */
export function visibleSampleStage(sample: SampleStageRecord): 'in_progress' | 'done' {
  return sample.status === 'in_progress' || isAutoDeliveredSample(sample) ? 'in_progress' : 'done';
}
