import { SubscriptionStatus } from '../types';

export function parseSubscriberDate(value: string | undefined | null): Date | null {
  const t = (value ?? '').trim();
  if (!t) return null;
  const normalized = t.includes('T') ? t : t.replace(' ', 'T');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfCalendarDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** فرق أيام تقويمية بين تاريخين (بداية اليوم) */
export function calendarDaysBetween(
  fromIso: string | undefined | null,
  toIso: string | undefined | null
): number | null {
  const from = parseSubscriberDate(fromIso);
  const to = parseSubscriberDate(toIso);
  if (!from || !to) return null;
  return Math.round(
    (startOfCalendarDay(to).getTime() - startOfCalendarDay(from).getTime()) / MS_PER_DAY
  );
}

/** الأيام المتبقية حتى تاريخ الانتهاء (من اليوم) */
export function daysUntilExpiration(expirationIso: string | undefined | null): number {
  const exp = parseSubscriberDate(expirationIso);
  if (!exp) return 0;
  const today = startOfCalendarDay(new Date());
  const end = startOfCalendarDay(exp);
  return Math.round((end.getTime() - today.getTime()) / MS_PER_DAY);
}

/**
 * الأيام المتبقية من فترة الاشتراك باستخدام تاريخ التفعيل والانتهاء:
 * - إن لم يبدأ الاشتراك بعد: كامل المدة (انتهاء − تفعيل)
 * - بعد التفعيل: الأيام من اليوم حتى الانتهاء
 */
export function subscriberDaysRemaining(
  activationIso: string | undefined | null,
  expirationIso: string | undefined | null
): number | null {
  const exp = parseSubscriberDate(expirationIso);
  if (!exp) return null;

  const today = startOfCalendarDay(new Date());
  const end = startOfCalendarDay(exp);
  const act = parseSubscriberDate(activationIso);

  if (act) {
    const start = startOfCalendarDay(act);
    if (end.getTime() < start.getTime()) return null;
    if (today.getTime() < start.getTime()) {
      return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
    }
  }

  return Math.round((end.getTime() - today.getTime()) / MS_PER_DAY);
}

/** نص عمود الأيام المتبقية */
export function formatDaysRemainingColumn(days: number | null): string {
  if (days === null) return '—';
  if (days < 0) return `${Math.abs(days)} يوم (منتهي)`;
  if (days === 0) return 'ينتهي اليوم';
  return `${days} يوم`;
}

export function daysRemainingTextClass(days: number | null): string {
  if (days === null) return 'text-gray-400';
  if (days < 0) return 'text-red-600 dark:text-red-400 font-medium';
  if (days === 0) return 'text-orange-600 dark:text-orange-400 font-medium';
  if (days <= 7) return 'text-yellow-700 dark:text-yellow-400 font-medium';
  return 'text-green-700 dark:text-green-400 font-medium';
}

export function deriveSubscriptionStatus(daysRemaining: number): SubscriptionStatus {
  if (daysRemaining < 0) return SubscriptionStatus.Expired;
  if (daysRemaining === 0) return SubscriptionStatus.ExpiredToday;
  if (daysRemaining <= 7) return SubscriptionStatus.ExpiringSoon;
  return SubscriptionStatus.Active;
}

export function statusLabelFromDaysRemaining(daysRemaining: number): string {
  if (daysRemaining < 0) return `منتهي (${Math.abs(daysRemaining)} يوم)`;
  if (daysRemaining === 0) return 'ينتهي اليوم';
  return `${daysRemaining} يوم متبقي`;
}

export function statusBadgeClassFromDays(daysRemaining: number): string {
  if (daysRemaining < 0) return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
  if (daysRemaining === 0) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300';
  if (daysRemaining <= 7) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
  return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
}
