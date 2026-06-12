import type { ActivateStatusResponse, ActivateSubscriberResponse } from '../types';

/** مفتاح idempotency فريد لجلسة التفعيل — يُنشأ عند فتح المودال ولا يُعاد توليده عند إعادة المحاولة */
export function createActivateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getAxiosResponseData(error: unknown): Record<string, unknown> | null {
  const err = error as {
    response?: { data?: unknown; status?: number };
    originalError?: { response?: { data?: unknown; status?: number } };
  };
  const data = err?.response?.data ?? err?.originalError?.response?.data;
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return null;
  return data as Record<string, unknown>;
}

export function getActivateHttpStatus(error: unknown): number | undefined {
  const err = error as {
    response?: { status?: number };
    originalError?: { response?: { status?: number } };
  };
  return err?.response?.status ?? err?.originalError?.response?.status;
}

export function isActivateNetworkOrTimeoutError(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  if (err?.code === 'ECONNABORTED' || err?.code === 'ERR_NETWORK') return true;
  const msg = String(err?.message ?? '');
  return /timeout|network error|failed to fetch|network request failed/i.test(msg);
}

export function isActivateConflictError(error: unknown): boolean {
  return getActivateHttpStatus(error) === 409;
}

export function isActivateUncertainHttpError(error: unknown): boolean {
  const status = getActivateHttpStatus(error);
  return status === 503 || status === 502 || status === 504;
}

/** هل يُفضّل الاستعلام عن الحالة بدلاً من إعادة إرسال تفعيل جديد؟ */
export function shouldPollActivateStatusAfterError(error: unknown): boolean {
  return (
    isActivateNetworkOrTimeoutError(error) ||
    isActivateConflictError(error) ||
    isActivateUncertainHttpError(error)
  );
}

function pickIdempotencyKeyFromRecord(data: Record<string, unknown>): string | null {
  const detail = data.detail;
  if (detail != null && typeof detail === 'object' && !Array.isArray(detail)) {
    const d = detail as Record<string, unknown>;
    for (const key of ['idempotency_key', 'request_id'] as const) {
      const id = d[key];
      if (typeof id === 'string' && id.trim()) return id.trim();
    }
  }
  for (const key of ['idempotency_key', 'request_id'] as const) {
    const id = data[key];
    if (typeof id === 'string' && id.trim()) return id.trim();
  }
  return null;
}

export function extractIdempotencyKeyFromActivateError(error: unknown): string | null {
  const data = getAxiosResponseData(error);
  if (!data) return null;
  return pickIdempotencyKeyFromRecord(data);
}

export function formatActivateConflictMessage(error: unknown): string {
  const data = getAxiosResponseData(error);
  const detail = data?.detail;
  if (detail != null && typeof detail === 'object' && !Array.isArray(detail)) {
    const d = detail as Record<string, unknown>;
    const hint = String(d.hint ?? '').trim();
    const msg = String(d.message ?? '').trim();
    const pollUrl = String(d.poll_url ?? data?.poll_url ?? '').trim();
    const parts = [msg, hint].filter(Boolean);
    if (pollUrl) parts.push(`استعلم عن الحالة: ${pollUrl}`);
    if (parts.length) return parts.join('\n');
  }
  return 'تفعيل قيد التنفيذ — جاري التحقق من الحالة دون إنشاء طلب جديد.';
}

export type NormalizedActivateStatus = 'processing' | 'completed' | 'failed' | 'uncertain';

export function normalizeActivateStatus(status: string | null | undefined): NormalizedActivateStatus {
  const s = String(status ?? '')
    .trim()
    .toLowerCase();
  if (s === 'completed' || s === 'succeeded' || s === 'success') return 'completed';
  if (s === 'failed' || s === 'failure' || s === 'error') return 'failed';
  if (
    s === 'processing' ||
    s === 'pending' ||
    s === 'sending' ||
    s === 'in_progress' ||
    s === 'unknown'
  ) {
    return 'processing';
  }
  return 'uncertain';
}

export function isActivateStatusCompleted(status: string | null | undefined): boolean {
  return normalizeActivateStatus(status) === 'completed';
}

export function isActivateStatusFailed(status: string | null | undefined): boolean {
  return normalizeActivateStatus(status) === 'failed';
}

export function formatActivatePartialWarnings(res: ActivateSubscriberResponse): string | null {
  if (!res.post_processing_partial) return null;
  const warnings = Array.isArray(res.warnings)
    ? res.warnings.map((w) => String(w).trim()).filter(Boolean)
    : [];
  if (!warnings.length) return 'اكتمل التفعيل مع تحذيرات في المعالجة اللاحقة.';
  return warnings.join('\n');
}

export async function pollActivateStatus(
  idempotencyKey: string,
  fetchStatus: (id: string) => Promise<ActivateStatusResponse>,
  options?: { intervalMs?: number; maxAttempts?: number }
): Promise<ActivateStatusResponse> {
  const intervalMs = options?.intervalMs ?? 3000;
  const maxAttempts = options?.maxAttempts ?? 20;
  let last: ActivateStatusResponse = {
    idempotency_key: idempotencyKey,
    status: 'processing',
    hint: 'لم يُرد رد من الخادم',
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    last = await fetchStatus(idempotencyKey);
    const normalized = normalizeActivateStatus(last.status);
    if (normalized === 'completed' || normalized === 'failed') {
      return last;
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return last;
}
