import React from 'react';
import { ChevronRight, RefreshCw } from 'lucide-react';
import type { ActivatePackageItem } from '../../types';
import { packageAvailableCount, packageIsActivatable } from '../../utils/activatePackages';

type FormatNumberFn = (value: number, opts?: { suffix?: string }) => string;

export interface PythonActivateWizardProps {
  step: 1 | 2;
  packages: ActivatePackageItem[];
  packagesLoading: boolean;
  packagesError: unknown;
  selectedPackageKey: string;
  selectedPackage: ActivatePackageItem | null;
  packagePrice: number | null;
  amountPaid: number;
  onSelectPackage: (packageKey: string) => void;
  onAmountPaidChange: (value: number) => void;
  onBack: () => void;
  formatNumber: FormatNumberFn;
  showError: (err: unknown) => string;
  /** قفل التفاعل أثناء تنفيذ POST /api/activate */
  isActivating?: boolean;
}

export function PythonActivateWizard({
  step,
  packages,
  packagesLoading,
  packagesError,
  selectedPackageKey,
  selectedPackage,
  packagePrice,
  amountPaid,
  onSelectPackage,
  onAmountPaidChange,
  onBack,
  formatNumber,
  showError,
  isActivating = false,
}: PythonActivateWizardProps) {
  if (step === 1) {
    if (packagesLoading) {
      return (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      );
    }
    if (packagesError) {
      return <p className="text-sm text-red-600 dark:text-red-400 text-center py-6">{showError(packagesError)}</p>;
    }

    return (
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${isActivating ? 'pointer-events-none opacity-60' : ''}`}
      >
        {packages.map((pkg) => {
          const activatable = packageIsActivatable(pkg);
          const available = packageAvailableCount(pkg);
          const selected = pkg.package_key === selectedPackageKey;
          return (
            <button
              key={pkg.package_key}
              type="button"
              onClick={() => activatable && !isActivating && onSelectPackage(pkg.package_key)}
              disabled={!activatable || isActivating}
              className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-start transition-colors ${
                selected
                  ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40'
                  : activatable
                    ? 'border-gray-200 dark:border-gray-600 hover:border-emerald-400 bg-white dark:bg-gray-800'
                    : 'border-gray-100 dark:border-gray-700 opacity-50 cursor-not-allowed'
              }`}
            >
              <span className="font-medium text-gray-900 dark:text-white truncate">
                {pkg.profile_name ?? '—'}
              </span>
              <span
                className={`shrink-0 text-sm font-semibold tabular-nums ${
                  activatable ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-400'
                }`}
              >
                {available}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  const price = packagePrice ?? 0;
  const remaining = Math.max(0, price - (Number(amountPaid) || 0));

  return (
    <div className={`space-y-4 max-w-md mx-auto relative ${isActivating ? 'pointer-events-none' : ''}`}>
      {isActivating && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/50 dark:bg-gray-900/50">
          <RefreshCw className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      )}
      <button
        type="button"
        onClick={onBack}
        disabled={isActivating}
        className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ← الباقات
      </button>

      <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/40 px-4 py-3 flex items-center justify-between">
        <span className="font-medium text-gray-900 dark:text-white">
          {selectedPackage?.profile_name ?? '—'}
        </span>
        <ChevronRight className="h-4 w-4 text-gray-400 rotate-180" />
      </div>

      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">المبلغ</label>
        <input
          type="text"
          readOnly
          value={formatNumber(price, { suffix: ' د.ع' })}
          className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-semibold"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">المبلغ الواصل</label>
        <input
          type="number"
          min={0}
          max={price}
          value={amountPaid === 0 ? '' : amountPaid}
          onChange={(e) => onAmountPaidChange(Number(e.target.value) || 0)}
          disabled={isActivating}
          className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>

      {remaining > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-300 tabular-nums">
          متبقي: {formatNumber(remaining, { suffix: ' د.ع' })}
          <span className="block text-xs font-normal mt-0.5">سيُسجَّل كدين عند التفعيل</span>
        </p>
      )}
    </div>
  );
}
