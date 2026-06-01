import type { ActivateSeriesItem } from '../types';

/** عدد الأكواد المتاحة على SAS (ليس DB فقط) */
export function seriesSasAvailableCount(row?: ActivateSeriesItem | null): number {
  if (!row) return 0;
  const n = Number(row.available_count);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** يمكن التفعيل فقط عندما SAS يعرّف أكواداً غير مستخدمة */
export function seriesIsActivatableOnSas(row?: ActivateSeriesItem | null): boolean {
  return seriesSasAvailableCount(row) > 0;
}

export function formatActivateSeriesOptionLabel(s: ActivateSeriesItem): string {
  const sas = seriesSasAvailableCount(s);
  const local = Math.max(0, Number(s.unused_in_db ?? 0));
  if (sas > 0) {
    return `${s.series} — متاح على SAS: ${sas}${local !== sas ? ` · محلي: ${local}` : ''}`;
  }
  return `${s.series} — مستخدمة على SAS (متاح: 0)${local > 0 ? ` · DB: ${local} قديم` : ''}`;
}
