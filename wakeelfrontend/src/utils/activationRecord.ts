import { PaymentStatus, type ActivationRecord, type RenewalReceipt } from '../types';

function parseMoney(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function daysBetween(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const a = new Date(start.replace(' ', 'T')).getTime();
  const b = new Date(end.replace(' ', 'T')).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / (24 * 60 * 60 * 1000)));
}

export function normalizeActivationRecord(raw: unknown): ActivationRecord {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const ud = (r.user_details ?? r.userDetails) as Record<string, unknown> | undefined;
  const pd = (r.profile_details ?? r.profileDetails) as Record<string, unknown> | undefined;
  return {
    id: Number(r.id ?? 0),
    user_id: r.user_id != null ? Number(r.user_id) : undefined,
    profile_id: r.profile_id != null ? Number(r.profile_id) : null,
    price: (r.price as string | number) ?? null,
    user_price: (r.user_price ?? r.userPrice) as string | number | null,
    created_at: (r.created_at ?? r.createdAt) as string | null,
    old_expiration: (r.old_expiration ?? r.oldExpiration) as string | null,
    new_expiration: (r.new_expiration ?? r.newExpiration) as string | null,
    pin: (r.pin as string) ?? null,
    activation_method: (r.activation_method ?? r.activationMethod) as string | null,
    transaction: (r.transaction as string) ?? null,
    card_owner: (r.card_owner ?? r.cardOwner) as string | null,
    user_details: ud
      ? {
          id: ud.id != null ? Number(ud.id) : undefined,
          username: (ud.username as string) ?? null,
          firstname: (ud.firstname as string) ?? null,
          lastname: (ud.lastname as string) ?? null,
          parent_username: (ud.parent_username ?? ud.parentUsername) as string | null,
        }
      : null,
    profile_details: pd
      ? {
          id: pd.id != null ? Number(pd.id) : undefined,
          name: (pd.name as string) ?? null,
        }
      : null,
    master_type: (r.master_type ?? r.masterType) as string | null,
    master_type_label: (r.master_type_label ?? r.masterTypeLabel) as string | null,
  };
}

function activationCreatedAtMs(createdAt?: string | null): number {
  if (!createdAt?.trim()) return 0;
  const t = new Date(createdAt.replace(' ', 'T')).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** ترتيب تنازلي حسب created_at (الأحدث أولاً) */
export function sortActivationRecordsNewestFirst(rows: ActivationRecord[]): ActivationRecord[] {
  return [...rows].sort(
    (a, b) => activationCreatedAtMs(b.created_at) - activationCreatedAtMs(a.created_at)
  );
}

/** تحويل سجل التفعيل من SAS إلى شكل الجدول الحالي */
export function mapActivationToRenewalReceipt(row: ActivationRecord): RenewalReceipt {
  const ud = row.user_details;
  const fullName = [ud?.firstname, ud?.lastname].filter((x) => (x ?? '').trim()).join(' ').trim();
  const subscriberName = fullName || (ud?.username ?? '').trim() || '—';
  const price = parseMoney(row.user_price ?? row.price);
  const created = row.created_at ?? '';
  const profileName = row.profile_details?.name?.trim() || '—';
  return {
    id: String(row.id),
    receiptNumber: (row.pin || row.transaction || String(row.id)).trim(),
    finalPrice: price,
    amountPaid: price,
    remainingAmount: 0,
    discountAmount: 0,
    discountPercent: 0,
    renewalPeriod: daysBetween(row.old_expiration, row.new_expiration),
    renewalDays: daysBetween(row.old_expiration, row.new_expiration),
    renewalDate: created,
    newExpirationDate: row.new_expiration ?? '',
    paymentStatus: PaymentStatus.Paid,
    wiFiCode: '',
    createdAt: created,
    subscriberId: ud?.id != null ? String(ud.id) : String(row.user_id ?? ''),
    subscriberUsername: ud?.username ?? null,
    subscriberName,
    subscriberPhone: '',
    profileName,
    oldProfileName: profileName,
    newProfileName: profileName,
    newProfileOriginalPrice: price,
    newProfileSalePrice: price,
    agentCompanyName: row.card_owner?.trim() || '',
    activationMethod: row.activation_method ?? null,
    masterType: row.master_type ?? null,
    masterTypeLabel: row.master_type_label ?? null,
    cardOwner: row.card_owner ?? null,
    activationPin: row.pin ?? null,
    activationTransaction: row.transaction ?? null,
  };
}

/** ألوان شارة طريقة التفعيل (ماستر الوكيل / ماستر المشترك) */
export function getMasterTypeBadgeClass(
  masterType?: string | null,
  masterTypeLabel?: string | null
): string {
  const t = (masterType ?? '').trim().toLowerCase();
  if (t === 'master_agent') {
    return 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/35 dark:text-emerald-200 dark:border-emerald-800';
  }
  if (t === 'master_subscriber') {
    return 'bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-900/35 dark:text-violet-200 dark:border-violet-800';
  }
  const label = (masterTypeLabel ?? '').trim();
  if (label.includes('وكيل')) {
    return 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/35 dark:text-emerald-200 dark:border-emerald-800';
  }
  if (label.includes('مشترك')) {
    return 'bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-900/35 dark:text-violet-200 dark:border-violet-800';
  }
  return 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600';
}

export function formatActivationMethodAr(method?: string | null): string {
  const m = (method ?? '').trim().toLowerCase();
  if (!m) return '—';
  if (m === 'user_credit') return 'رصيد مستخدم';
  if (m === 'credit') return 'رصيد';
  if (m === 'voucher') return 'قسيمة';
  if (m === 'reward_points') return 'نقاط مكافأة';
  return method ?? '—';
}
