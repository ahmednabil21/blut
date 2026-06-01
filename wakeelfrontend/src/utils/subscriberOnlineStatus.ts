import type { Subscriber } from '../types';

function normalizeOnlineStatusValue(value: unknown): number | null {
  if (value === 1 || value === '1' || value === true) return 1;
  if (value === 0 || value === '0' || value === false) return 0;
  if (typeof value === 'number' && (value === 0 || value === 1)) return value;
  if (typeof value === 'string') {
    const t = value.trim().toLowerCase();
    if (t === 'online' || t === '1') return 1;
    if (t === 'offline' || t === '0') return 0;
  }
  return null;
}

/** استخراج online_status من صف API (SAS / Python / .NET) */
export function parseOnlineStatusFromRow(row: Record<string, unknown>): number | null {
  const direct = normalizeOnlineStatusValue(
    row.online_status ?? row.onlineStatus ?? row.OnlineStatus
  );
  if (direct !== null) return direct;

  const conn = row.connection_status ?? row.connectionStatus;
  const fromConn = normalizeOnlineStatusValue(conn);
  if (fromConn !== null) return fromConn;

  const statusObj = row.status;
  if (statusObj && typeof statusObj === 'object' && !Array.isArray(statusObj)) {
    const nested = normalizeOnlineStatusValue(
      (statusObj as Record<string, unknown>).online_status ??
        (statusObj as Record<string, unknown>).onlineStatus
    );
    if (nested !== null) return nested;
  }

  const sasRaw = row.sas_raw ?? row.sasRaw;
  if (typeof sasRaw === 'string' && sasRaw.trim()) {
    try {
      const parsed = JSON.parse(sasRaw) as Record<string, unknown>;
      const fromRaw = parseOnlineStatusFromRow(parsed);
      if (fromRaw !== null) return fromRaw;
    } catch {
      /* ignore */
    }
  }

  return null;
}

export function getSubscriberOnlineStatus(subscriber: Subscriber): number | null {
  if (subscriber.onlineStatus === 0 || subscriber.onlineStatus === 1) {
    return subscriber.onlineStatus;
  }
  return parseOnlineStatusFromRow(subscriber as unknown as Record<string, unknown>);
}

/**
 * تلوين صف الجدول حسب online_status.
 * يستخدم كلاسات مخصّصة في index.css لأن قواعد الجدول العامة (odd:bg-white) كانت تغطي bg-* على <tr>.
 */
export function subscriberConnectionRowClass(
  subscriber: Subscriber,
  opts: { isPython: boolean; hasOverdueDebt?: boolean }
): string {
  const parts: string[] = [];
  if (opts.hasOverdueDebt) {
    parts.push('subscriber-row-overdue-debt');
  }
  if (!opts.isPython) return parts.join(' ');
  const status = getSubscriberOnlineStatus(subscriber);
  if (status === 1) parts.push('subscriber-row-online');
  else if (status === 0) parts.push('subscriber-row-offline');
  return parts.join(' ');
}
