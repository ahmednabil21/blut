import type { AgentReseller } from '../types';

/** معرّف الرسيلر المختار — يُرسل كـ X-Reseller-Id ويُستخدم في صفحة المشتركين */
export const SELECTED_RESELLER_STORAGE_KEY = 'selectedOperationalResellerId';

/** هل المستخدم اختار «الكل / كل المناطق» (بدون رسيلر محدد)؟ */
export function isAllOperationalResellersMode(selectedOperationalResellerId?: string): boolean {
  return !(getSelectedResellerId() ?? selectedOperationalResellerId ?? '').trim();
}

/**
 * الرسيلر المختار صراحةً فقط — بدون الرجوع للافتراضي عند «الكل».
 * يُستخدم لعمود «منطقة المشترك» وتسمية الصفوف.
 */
export function resolveSasFetchReseller(
  resellers: AgentReseller[],
  selectedOperationalResellerId?: string
): { id: string; name: string } | null {
  if (isAllOperationalResellersMode(selectedOperationalResellerId)) return null;

  const list = resellers ?? [];
  if (!list.length) return null;

  const selectedId = (getSelectedResellerId() ?? selectedOperationalResellerId ?? '').trim();
  const picked = list.find((r) => String(r.id) === String(selectedId));
  const name = picked?.name?.trim();
  if (picked && name) return { id: picked.id, name };
  return null;
}

/** إزالة تسمية رسيلر سابقة عند عرض «كل المناطق». */
export function clearResellerRegionFromSubscribers<T extends {
  agentResellerId?: string | null;
  agentResellerName?: string | null;
}>(rows: T[]): T[] {
  return rows.map((row) => ({
    ...row,
    agentResellerId: undefined,
    agentResellerName: undefined,
  }));
}

/** تعبئة منطقة المشترك من اسم رسيلر الجلب (باكند Python / SAS). */
export function attachResellerRegionToSubscribers<T extends {
  agentResellerId?: string | null;
  agentResellerName?: string | null;
}>(
  rows: T[],
  reseller: { id: string; name: string } | null
): T[] {
  if (!reseller?.name?.trim()) return rows;
  const id = String(reseller.id);
  const name = reseller.name.trim();
  return rows.map((row) => ({
    ...row,
    agentResellerId: id,
    agentResellerName: name,
  }));
}

export function getSelectedResellerId(): string | null {
  try {
    const raw = localStorage.getItem(SELECTED_RESELLER_STORAGE_KEY);
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

export function setSelectedResellerId(id: string | number | null): void {
  try {
    if (id == null || String(id).trim() === '') {
      localStorage.removeItem(SELECTED_RESELLER_STORAGE_KEY);
    } else {
      localStorage.setItem(SELECTED_RESELLER_STORAGE_KEY, String(id).trim());
    }
  } catch {
    /* ignore */
  }
}

export function clearSelectedResellerId(): void {
  setSelectedResellerId(null);
}

/** رسيلر التفعيل: من المشترك أولاً، ثم المُمرَّر صراحةً، ثم المنطقة المختارة في القائمة */
export function resolveSubscriberActivateResellerId(
  subscriber: { agentResellerId?: string | null },
  options?: { explicitResellerId?: string; operationalResellerId?: string }
): string {
  const fromSub = (subscriber.agentResellerId ?? '').trim();
  if (fromSub) return fromSub;
  const explicit = (options?.explicitResellerId ?? '').trim();
  if (explicit) return explicit;
  return (options?.operationalResellerId ?? '').trim();
}
