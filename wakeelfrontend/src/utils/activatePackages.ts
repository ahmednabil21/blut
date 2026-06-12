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

/** بعد series_fallback من latest-card — حدّث recommended_series في كاش الباقات */
export function applyActivatePackageSeriesFallback(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  packageKey: string,
  latestCard: ActivateLatestCardResponse
): string | null {
  if (!latestCard.series_fallback) return null;
  const newSeries = (latestCard.recommended_series ?? latestCard.series ?? '').trim();
  if (!newSeries) return null;

  queryClient.setQueryData<ActivatePackagesResponse>(queryKey, (old) => {
    if (!old?.packages?.length) return old;
    return {
      ...old,
      packages: old.packages.map((p) =>
        p.package_key === packageKey ? { ...p, recommended_series: newSeries } : p
      ),
    };
  });

  return newSeries;
}
