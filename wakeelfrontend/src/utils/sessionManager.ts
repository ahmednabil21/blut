/**
 * إدارة انتهاء جلسة JWT: تخزين وقت الانتهاء، كشف انتهاء الصلاحية،
 * وإعادة توجيه مرة واحدة لتفادي موجة 401 في الواجهة وشبكة الطلبات.
 */

const TOKEN_EXPIRES_AT_KEY = 'tokenExpiresAt';
const REDIRECT_GUARD_KEY = 'wakeel_auth_redirecting';

function base64UrlToJson(payload: string): Record<string, unknown> | null {
  try {
    const pad = (4 - (payload.length % 4)) % 4;
    const b64 = (payload + '='.repeat(pad)).replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** وقت انتهاء التوكن بالملّي ثانية من مطالبة JWT (exp)، أو null */
export function parseJwtExpMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const data = base64UrlToJson(parts[1]);
  const exp = data?.exp;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;
  return exp * 1000;
}

/** بعد نجاح تسجيل الدخول — يُفضَّل exp من JWT لتجنب قيمة tokenExpiresAt قديمة/خاطئة */
export function setSessionExpiryFromLogin(token: string, expiresInSeconds: number): void {
  const fromJwt = parseJwtExpMs(token);
  let expiresAtMs: number | null = fromJwt;
  if (expiresAtMs == null && typeof expiresInSeconds === 'number' && expiresInSeconds > 0) {
    expiresAtMs = Date.now() + expiresInSeconds * 1000;
  }
  if (expiresAtMs != null) {
    localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(expiresAtMs));
  } else {
    localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);
  }
}

export function clearSessionExpiryMeta(): void {
  try {
    localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);
  } catch {
    /* ignore */
  }
}

export function getSessionExpiresAtMs(): number | null {
  try {
    const raw = localStorage.getItem(TOKEN_EXPIRES_AT_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * @param skewSeconds هامش أمان (يطابق السيرفر قبل انتهاء exp بثوانٍ)
 */
export function isAccessTokenExpired(skewSeconds = 90): boolean {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (!token?.trim()) return true;
  const fromJwt = parseJwtExpMs(token);
  const stored = getSessionExpiresAtMs();
  /** JWT أولاً — localStorage قد يحمل وقت انتهاء من جلسة قديمة */
  const deadline = fromJwt ?? stored;
  if (deadline == null) return false;
  return Date.now() >= deadline - skewSeconds * 1000;
}

/**
 * هل يُعاد توجيه المستخدم لتسجيل الدخول بعد 401؟
 * على باكند Python: 401 من SAS/مشتركين ≠ انتهاء JWT التطبيق.
 */
export function shouldClearSessionOn401(
  requestUrl: string,
  responseData: unknown,
  pythonBackend: boolean
): boolean {
  const u = String(requestUrl).toLowerCase();
  if (u.includes('/auth/login')) return false;

  const detail =
    typeof responseData === 'object' && responseData !== null && 'detail' in responseData
      ? String((responseData as { detail: unknown }).detail)
      : String(responseData ?? '');

  if (!pythonBackend) return true;

  if (u.includes('/auth/me')) return true;

  if (/sas\.login|\/api\/sas|جلسة sas/i.test(detail)) return false;
  if (u.includes('/subscribers') && /sas|تسجيل الدخول/i.test(detail)) return false;

  // مسارات .NET غير منفّذة على FastAPI — لا تُخرج المستخدم
  if (
    /\/agents\/|\/providers\/|\/renewals|\/debts|\/dashboard|\/users\/me|\/system-message|\/packages|\/materials/.test(
      u
    )
  ) {
    return false;
  }

  if (/token|jwt|غير صالح|منته|expired|credentials/i.test(detail)) return true;

  return false;
}

export function clearAuthStorage(): void {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('meFeatures');
    clearSessionExpiryMeta();
  } catch {
    /* ignore */
  }
}

/** يُستدعى بعد نجاح تسجيل الدخول ليُسمح بمحاولات لاحقة */
export function resetSessionRedirectGuard(): void {
  try {
    sessionStorage.removeItem(REDIRECT_GUARD_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * مسح الجلسة وإعادة التوجيه لصفحة الدخول مرة واحدة (تفادي عشرات طلبات 401 الظاهرة للمستخدم).
 */
export function clearAuthAndRedirectToLogin(reason: 'expired' | 'unauthorized' = 'expired'): void {
  if (typeof window === 'undefined') return;
  try {
    if (sessionStorage.getItem(REDIRECT_GUARD_KEY)) return;
    sessionStorage.setItem(REDIRECT_GUARD_KEY, '1');
  } catch {
    /* ignore */
  }

  clearAuthStorage();

  try {
    sessionStorage.setItem('wakeel_login_flash', reason);
  } catch {
    /* ignore */
  }

  const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  window.location.replace(`${base}/login`);
}

export function isAuthLoginRequestUrl(url: string): boolean {
  const u = String(url).toLowerCase();
  return u.includes('/auth/login') || u.includes('auth/login');
}
