/** 0 = يمكن التمديد، 1 = استُخدم التمديد */
export function normalizeSubscriberDebtDays(raw: unknown): number {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return n >= 1 ? 1 : 0;
}

export function extractDebtDaysFromSubscriberRow(row: Record<string, unknown>): number {
  const direct = row.debt_days ?? row.debtDays;
  if (direct != null && direct !== '') {
    return normalizeSubscriberDebtDays(direct);
  }
  const extendDay = row.extend_day ?? row.extendDay;
  if (extendDay && typeof extendDay === 'object' && !Array.isArray(extendDay)) {
    const nested = (extendDay as Record<string, unknown>).debt_days
      ?? (extendDay as Record<string, unknown>).debtDays;
    if (nested != null && nested !== '') {
      return normalizeSubscriberDebtDays(nested);
    }
  }
  return 0;
}

export function canExtendByDebtDays(debtDays?: number | null): boolean {
  return normalizeSubscriberDebtDays(debtDays) === 0;
}
