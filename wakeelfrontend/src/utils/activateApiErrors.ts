import { mapBackendErrorMessageForUser } from '../services/api';

const SAS_MESSAGE_AR: Record<string, string> = {
  rsp_error_card_not_found: 'كود الشحن غير موجود أو مستخدم على SAS',
  rsp_error_invalid_pin: 'كود الشحن غير صالح',
  rsp_invalid_profile: 'الباقة لا تطابق كود الشحن أو المشترك',
  rsp_card_used: 'كود الشحن مستخدم على SAS — جاري تحديث المخزون',
  rsp_success: 'تم التفعيل بنجاح',
};

/** FastAPI detail: نص أو كائن { message, sas_message, hint, ... } */
export function formatActivateApiDetail(detail: unknown): string | null {
  if (detail == null) return null;
  if (typeof detail === 'string') {
    const s = detail.trim();
    return s ? mapBackendErrorMessageForUser(s) : null;
  }
  if (typeof detail !== 'object' || Array.isArray(detail)) return null;

  const d = detail as Record<string, unknown>;
  const sasMsg = String(d.sas_message ?? d.sasMessage ?? '').trim();
  const msg = String(d.message ?? '').trim();
  const hint = String(d.hint ?? '').trim();
  const parts: string[] = [];

  if (msg) {
    parts.push(mapBackendErrorMessageForUser(msg));
  } else if (sasMsg && SAS_MESSAGE_AR[sasMsg]) {
    parts.push(SAS_MESSAGE_AR[sasMsg]);
  } else if (sasMsg) {
    parts.push(sasMsg);
  }

  if (hint) parts.push(hint);
  return parts.length > 0 ? parts.join('\n') : null;
}

function getAxiosResponseData(error: unknown): Record<string, unknown> | null {
  const err = error as {
    response?: { data?: unknown };
    originalError?: { response?: { data?: unknown } };
  };
  const data = err?.response?.data ?? err?.originalError?.response?.data;
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return null;
  return data as Record<string, unknown>;
}

/** رسالة عربية من خطأ تفعيل (POST /api/activate) */
export function formatActivateApiError(error: unknown): string {
  const data = getAxiosResponseData(error);
  if (data?.detail != null) {
    const fromDetail = formatActivateApiDetail(data.detail);
    if (fromDetail) return fromDetail;
  }
  if (data?.message != null) {
    return mapBackendErrorMessageForUser(String(data.message));
  }
  const err = error as { message?: string };
  if (err?.message?.trim()) {
    return mapBackendErrorMessageForUser(err.message.trim());
  }
  return 'فشل التفعيل. تحقق من المشترك والسلسلة وPIN ثم أعد المحاولة.';
}

export function isActivateMissingSubscriberError(error: unknown): boolean {
  const data = getAxiosResponseData(error);
  if (!data?.detail) return false;
  const text =
    typeof data.detail === 'string'
      ? data.detail
      : formatActivateApiDetail(data.detail) ?? '';
  return /sas_user_id|subscribers\/sync/i.test(text);
}

export function getActivateSasResponseMessage(res: {
  sas_response?: unknown;
  sasResponse?: unknown;
}): string {
  const raw = res.sas_response ?? res.sasResponse;
  if (!raw || typeof raw !== 'object') return '';
  return String((raw as Record<string, unknown>).message ?? '').trim();
}

export function isActivateSuccessResponse(res: {
  success?: boolean;
  sas_response?: unknown;
  sasResponse?: unknown;
}): boolean {
  if (res.success === false) return false;
  const sasMsg = getActivateSasResponseMessage(res);
  if (sasMsg && sasMsg !== 'rsp_success' && !['success', 'ok'].includes(sasMsg)) {
    return false;
  }
  return res.success === true || res.success == null;
}

export function getActivateDebtRemaining(res: {
  debt_created?: boolean;
  debt_remaining?: number;
  package_price?: number;
  amount_paid?: number;
  debt?: { amount?: unknown };
}): number {
  if (res.debt_remaining != null && Number.isFinite(Number(res.debt_remaining))) {
    return Math.max(0, Number(res.debt_remaining));
  }
  const debtObj = res.debt;
  if (debtObj && typeof debtObj === 'object' && debtObj.amount != null) {
    const n = Number(debtObj.amount);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (!res.debt_created) return 0;
  const pkg = res.package_price;
  const paid = res.amount_paid;
  if (pkg != null && paid != null && Number.isFinite(Number(pkg)) && Number.isFinite(Number(paid))) {
    return Math.max(0, Number(pkg) - Number(paid));
  }
  return 0;
}

export function formatActivateDebtSuccessSuffix(
  res: { debt_created?: boolean; debt_remaining?: number; package_price?: number; amount_paid?: number; debt?: { amount?: unknown } },
  formatNumber: (n: number, opts?: { suffix?: string }) => string
): string {
  const remaining = getActivateDebtRemaining(res);
  if (remaining <= 0) return '';
  return ` — تم تسجيل دين: ${formatNumber(remaining, { suffix: ' د.ع' })}`;
}
