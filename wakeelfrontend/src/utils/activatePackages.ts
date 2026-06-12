import type { QueryClient } from '@tanstack/react-query';
import type { ActivateLatestCardResponse, ActivatePackageItem, ActivatePackagesResponse } from '../types';

export function packageAvailableCount(pkg?: ActivatePackageItem | null): number {
  if (!pkg) return 0;
  const n = Number(pkg.available_count);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function packageIsActivatable(pkg?: ActivatePackageItem | null): boolean {
  return packageAvailableCount(pkg) > 0;
}

export function formatActivatePackageOptionLabel(pkg: ActivatePackageItem): string {
  const available = packageAvailableCount(pkg);
  const name = (pkg.profile_name || '—').trim();
  const seriesCount = pkg.series_count ?? pkg.series?.length ?? 0;
  if (available > 0) {
    return `${name} — متاح: ${available}${seriesCount > 1 ? ` (${seriesCount} سلاسل)` : ''}`;
  }
  return `${name} — لا يوجد مخزون (${available})`;
}

export function parseActivatePackageSelection(value: string): {
  profileId?: number;
  profileName?: string;
} {
  if (!value.trim()) return {};
  if (value.startsWith('id:')) {
    const id = parseInt(value.slice(3), 10);
    return Number.isFinite(id) ? { profileId: id } : {};
  }
  if (value.startsWith('name:')) {
    return { profileName: value.slice(5) };
  }
  return {};
}

/** السلسلة الفعلية من رد latest-card — تفضّل recommended_series */
export function resolveActivateLatestCardSeries(card: ActivateLatestCardResponse): string {
  return (card.recommended_series ?? card.series ?? '').trim();
}

/** السلسلة المرسلة إلى latest-card — تفضّل المحلية المحدّثة على كاش الباقات */
export function pickActivateLatestCardRequestSeries(
  packageKey: string,
  pkg: ActivatePackageItem | null | undefined,
  resolvedByPackage: Record<string, string>
): string | undefined {
  const fromLocal = resolvedByPackage[packageKey]?.trim();
  if (fromLocal) return fromLocal;
  const fromPkg = pkg?.recommended_series?.trim();
  return fromPkg || undefined;
}

export interface ActivateSeriesSyncResult {
  resolvedSeries: string;
  previousSeries?: string;
  requestedSeries?: string;
  staleIgnored: boolean;
  fallback: boolean;
  updated: boolean;
}

/** مزامنة recommended_series محلياً بعد latest-card — لا تُعاد إرسال سلسلة قديمة */
export function syncActivatePackageSeriesFromLatestCard(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  packageKey: string,
  latestCard: ActivateLatestCardResponse,
  currentSeries?: string | null,
  resolvedByPackage?: Record<string, string>
): ActivateSeriesSyncResult {
  const resolvedSeries = resolveActivateLatestCardSeries(latestCard);
  const previousSeries = (currentSeries ?? '').trim() || undefined;
  const requestedSeries =
    (latestCard.requested_series ?? '').trim() || previousSeries || undefined;
  const staleIgnored = latestCard.stale_series_ignored === true;
  const fallback = latestCard.series_fallback === true;

  const shouldUpdate =
    !!resolvedSeries &&
    !!packageKey &&
    (staleIgnored ||
      fallback ||
      !previousSeries ||
      previousSeries !== resolvedSeries);

  if (shouldUpdate) {
    queryClient.setQueryData<ActivatePackagesResponse>(queryKey, (old) => {
      if (!old?.packages?.length) return old;
      return {
        ...old,
        packages: old.packages.map((p) =>
          p.package_key === packageKey ? { ...p, recommended_series: resolvedSeries } : p
        ),
      };
    });
    if (resolvedByPackage) {
      resolvedByPackage[packageKey] = resolvedSeries;
    }
  }

  return {
    resolvedSeries,
    previousSeries,
    requestedSeries,
    staleIgnored,
    fallback,
    updated: shouldUpdate,
  };
}

export function formatActivateSeriesSyncMessage(result: ActivateSeriesSyncResult): string | null {
  if (!result.resolvedSeries) return null;
  const ignored = result.requestedSeries ?? result.previousSeries ?? '—';
  if (result.staleIgnored || result.fallback) {
    if (ignored === result.resolvedSeries) return null;
    return `السلسلة ${ignored} غير متاحة على SAS — تم استخدام: ${result.resolvedSeries}`;
  }
  if (result.updated && result.previousSeries && result.previousSeries !== result.resolvedSeries) {
    return `تم تحديث السلسلة إلى ${result.resolvedSeries}`;
  }
  return null;
}
