import {
  SubscriptionStatus,
  type PaginationParams,
  type PythonSubscribersSyncResult,
} from '../types';

export function formatPythonSyncSuccessMessage(res: PythonSubscribersSyncResult): string {
  return `جديد: ${res.created}، محدَّث: ${res.updated}، الإجمالي: ${res.total_in_db} (${res.rows_fetched} من SAS)`;
}

export type PythonSubscriptionStatusFilter = 'active' | 'expiring_soon' | 'expired';

export interface PythonSubscriptionStatusOption {
  id: PythonSubscriptionStatusFilter;
  label_ar: string;
}

/** تحويل فلتر الحالة في الواجهة إلى قيمة GET /api/subscribers */
export function mapFrontendStatusToPythonSubscriptionStatus(
  status: SubscriptionStatus | 'all' | string | number | undefined
): PythonSubscriptionStatusFilter | undefined {
  if (status === undefined || status === 'all' || status === '') return undefined;
  const n = typeof status === 'number' ? status : parseInt(String(status), 10);
  if (!Number.isFinite(n)) return undefined;
  switch (n) {
    case SubscriptionStatus.Active:
      return 'active';
    case SubscriptionStatus.ExpiringSoon:
    case SubscriptionStatus.ExpiredToday:
      return 'expiring_soon';
    case SubscriptionStatus.Expired:
      return 'expired';
    default:
      return undefined;
  }
}

/** تخمين حقل البحث المناسب لـ Python من نص البحث */
export function parseSubscriberSearchForPython(search: string): {
  subscriber_name?: string;
  username?: string;
  phone?: string;
  user_id?: number;
} {
  const t = search.trim();
  if (!t) return {};

  const compactDigits = t.replace(/[\s\-()]/g, '');
  if (/^(\+?964|0)?7\d{8,}$/.test(compactDigits) || /^\+?\d{10,15}$/.test(compactDigits)) {
    return { phone: compactDigits };
  }

  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    if (Number.isFinite(n) && n > 0) return { user_id: n };
  }

  if (!/[\u0600-\u06FF]/.test(t) && /^[A-Za-z0-9@._-]+$/.test(t)) {
    return { username: t };
  }

  return { subscriber_name: t };
}

function pickExpirationDateYmd(params: PaginationParams): string | undefined {
  const to = (params.expirationToDate ?? '').trim().split('T')[0];
  const from = (params.expirationFromDate ?? '').trim().split('T')[0];
  if (to) return to;
  if (from) return from;
  return undefined;
}

/** بناء query لـ GET /api/subscribers (FastAPI) */
export function buildPythonSubscribersQueryParams(
  params: PaginationParams | undefined,
  page: number,
  perPage: number
): Record<string, string | number> {
  const out: Record<string, string | number> = { page, per_page: perPage };

  const subscriptionStatus = mapFrontendStatusToPythonSubscriptionStatus(params?.status);
  if (subscriptionStatus) out.subscription_status = subscriptionStatus;

  const expirationDate = pickExpirationDateYmd(params ?? {});
  if (expirationDate) out.expiration_date = expirationDate;

  if (params?.profileId != null && String(params.profileId).trim() !== '') {
    const pid = parseInt(String(params.profileId), 10);
    if (Number.isFinite(pid)) out.profile_id = pid;
  }

  const search = (params?.search ?? '').trim();
  if (search) {
    const parsed = parseSubscriberSearchForPython(search);
    if (parsed.user_id != null) out.user_id = parsed.user_id;
    else if (parsed.username) out.username = parsed.username;
    else if (parsed.phone) out.phone = parsed.phone;
    else if (parsed.subscriber_name) out.subscriber_name = parsed.subscriber_name;
  }

  if (params?.sync) out.sync = 'true';

  return out;
}

export function pythonSubscriptionStatusIdToEnum(id: string): SubscriptionStatus | null {
  switch ((id ?? '').trim().toLowerCase()) {
    case 'active':
      return SubscriptionStatus.Active;
    case 'expiring_soon':
      return SubscriptionStatus.ExpiringSoon;
    case 'expired':
      return SubscriptionStatus.Expired;
    default:
      return null;
  }
}

export function mapPythonSubscriptionStatusToFrontend(
  status?: string | null,
  daysRemaining?: number
): SubscriptionStatus {
  const s = (status ?? '').trim().toLowerCase();
  if (s === 'active') return SubscriptionStatus.Active;
  if (s === 'expiring_soon') return SubscriptionStatus.ExpiringSoon;
  if (s === 'expired') return SubscriptionStatus.Expired;
  return daysRemaining !== undefined
    ? deriveStatusFromDays(daysRemaining)
    : SubscriptionStatus.Active;
}

function deriveStatusFromDays(days: number): SubscriptionStatus {
  if (days < 0) return SubscriptionStatus.Expired;
  if (days <= 3) return SubscriptionStatus.ExpiringSoon;
  return SubscriptionStatus.Active;
}
