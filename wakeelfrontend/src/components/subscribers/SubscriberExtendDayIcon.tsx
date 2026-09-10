import React from 'react';
import { CalendarPlus } from 'lucide-react';
import { normalizeSubscriberDebtDays } from '../../utils/subscriberDebtDays';
import {
  detectSasPricingHost,
  extendDayUiCopy,
  type SasPricingHost,
} from '../../utils/activatePackagePricing';

export interface SubscriberExtendDayIconProps {
  debtDays?: number | null;
  disabled?: boolean;
  loading?: boolean;
  onExtend?: () => void;
  /** classic = 7-DAY | nbtel = 1-DAY */
  pricingHost?: SasPricingHost;
  sasBaseUrl?: string | null;
  providerType?: string | null;
}

export function SubscriberExtendDayIcon({
  debtDays,
  disabled = false,
  loading = false,
  onExtend,
  pricingHost,
  sasBaseUrl,
  providerType,
}: SubscriberExtendDayIconProps) {
  const normalized = normalizeSubscriberDebtDays(debtDays);
  const blocked = normalized === 1;
  const host =
    pricingHost ?? detectSasPricingHost(sasBaseUrl, providerType);
  const copy = extendDayUiCopy(host);

  if (blocked) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center h-8 w-8 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800"
        title="تم التمديد — غير متاح هذا الشهر"
        aria-label="تمديد غير متاح"
      >
        <CalendarPlus className="h-4 w-4 text-red-500 dark:text-red-400" aria-hidden />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled && !loading) onExtend?.();
      }}
      disabled={disabled || loading}
      title={`${copy.title} (${copy.packageName})`}
      aria-label={copy.title}
      className="relative inline-flex shrink-0 items-center justify-center h-8 w-8 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 transition-transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
    >
      <span
        className="absolute inset-0 rounded-full bg-emerald-400/25 animate-ping motion-reduce:animate-none"
        aria-hidden
      />
      <span
        className="absolute inset-0 rounded-full bg-emerald-400/15 animate-pulse motion-reduce:animate-none"
        aria-hidden
      />
      {loading ? (
        <span className="relative h-4 w-4 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
      ) : (
        <CalendarPlus className="relative h-4 w-4 animate-[bounce_2s_ease-in-out_infinite] motion-reduce:animate-none" />
      )}
    </button>
  );
}
