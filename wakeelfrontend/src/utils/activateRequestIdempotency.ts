import type { ActivateStatusResponse } from '../types';

/** معرّف فريد لكل محاولة تفعيل — يُنشأ عند فتح المودال ولا يُعاد توليده عند إعادة المحاولة */
export function createActivateRequestId(): string {
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
  return getActivateHttpStatus(error) === 503;
}

/** هل يُفضّل الاستعلام عن الحالة بدلاً من إعادة إرسال تفعيل جديد؟ */
export function shouldPollActivateStatusAfterError(error: unknown): boolean {
  return (
    isActivateNetworkOrTimeoutError(error) ||
    isActivateConflictError(error) ||
    isActivateUncertainHttpError(error)
  );
}

export function extractRequestIdFromActivateError(error: unknown): string | null {
  const data = getAxiosResponseData(error);
  if (!data) return null;
  const detail = data.detail;
  if (detail != null && typeof detail === 'object' && !Array.isArray(detail)) {
    const id = (detail as Record<string, unknown>).request_id;
    if (typeof id === 'string' && id.trim()) return id.trim();
  }
  const top = data.request_id;
  if (typeof top === 'string' && top.trim()) return top.trim();
  return null;
}

export function formatActivateConflictMessage(error: unknown): string {
  const data = getAxiosResponseData(error);
  const detail = data?.detail;
  if (detail != null && typeof detail === 'object' && !Array.isArray(detail)) {
    const hint = String((detail as Record<string, unknown>).hint ?? '').trim();
    const msg = String((detail as Record<string, unknown>).message ?? '').trim();
    if (hint || msg) return [msg, hint].filter(Boolean).join('\n');
  }
  return 'تفعيل قيد التنفيذ لهذا المشترك. انتظر قليلاً أو استعلم عن الحالة دون إنشاء طلب جديد.';
}

const TERMINAL_STATUSES = new Set(['succeeded', 'failed']);

export async function pollActivateStatus(
  requestId: string,
  fetchStatus: (id: string) => Promise<ActivateStatusResponse>,
  options?: { intervalMs?: number; maxAttempts?: number }
): Promise<ActivateStatusResponse> {
  const intervalMs = options?.intervalMs ?? 3000;
  const maxAttempts = options?.maxAttempts ?? 20;
  let last: ActivateStatusResponse = {
    request_id: requestId,
    status: 'uncertain',
    hint: 'لم يُرد رد من الخادم',
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    last = await fetchStatus(requestId);
    if (TERMINAL_STATUSES.has(last.status)) {
      return last;
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return last;
}
