/** أسعار الباقات حسب منصة SAS — للمودال */

export type SasPricingHost = 'classic' | 'nbtel';

/** الباقات الحالية على SAS Classic (91.192.6.230) */
const CLASSIC_PRICES: Record<string, number> = {
  BRONZE: 35_000,
  'BRONZE+': 45_000,
  SILVER: 65_000,
  GOLDEN: 65_000,
  'OFFER 60-DAYS': 35_000,
  // أسماء قديمة — للتوافق مع سجلات قديمة فقط
  'NOVA-35': 35_000,
  'NOVA-40': 40_000,
  'NOVA-60': 45_000,
  'NOVA-100': 65_000,
};

const NBTEL_PRICES: Record<string, number> = {
  'NB MAX': 30_000,
  NB2: 45_000,
  NB3: 60_000,
};

function normalizeProfileKey(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, ' ');
}

export function detectSasPricingHost(
  baseUrl?: string | null,
  providerType?: string | null
): SasPricingHost {
  const provider = (providerType ?? '').trim().toLowerCase();
  if (provider === 'nbtel') return 'nbtel';
  const u = (baseUrl ?? '').toLowerCase();
  if (u.includes('nbtel') || u.includes('srs878') || u.includes('reseller.nbtel')) {
    return 'nbtel';
  }
  return 'classic';
}

/** نص واجهة التمديد — Classic: 7 أيام، NBTEL: يوم واحد */
export function extendDayUiCopy(host: SasPricingHost): {
  days: 1 | 7;
  packageName: string;
  title: string;
  shortTitle: string;
  durationPhrase: string;
  successFallback: string;
} {
  if (host === 'nbtel') {
    return {
      days: 1,
      packageName: '1-DAY',
      title: 'تمديد يوم واحد',
      shortTitle: 'تمديد يوم',
      durationPhrase: 'لمدة يوم واحد (1-DAY)',
      successFallback: 'تم تمديد المشترك يوماً واحداً',
    };
  }
  return {
    days: 7,
    packageName: '7-DAY',
    title: 'تمديد 7 أيام',
    shortTitle: 'تمديد 7 أيام',
    durationPhrase: 'لمدة 7 أيام (7-DAY)',
    successFallback: 'تم تمديد المشترك 7 أيام',
  };
}

function lookupPrice(table: Record<string, number>, profileName: string): number | null {
  const key = normalizeProfileKey(profileName);
  if (table[key] != null) return table[key];

  // أطول تطابق أولاً حتى لا يلتقط BRONZE سعر BRONZE+
  let bestPrice: number | null = null;
  let bestLen = -1;
  for (const [k, price] of Object.entries(table)) {
    const nk = normalizeProfileKey(k);
    if (key.startsWith(nk) || nk.startsWith(key)) {
      if (nk.length > bestLen) {
        bestLen = nk.length;
        bestPrice = price;
      }
    }
  }
  return bestPrice;
}

export function resolvePackageSalePrice(
  profileName: string | undefined | null,
  host: SasPricingHost
): number | null {
  if (!profileName?.trim()) return null;
  const table = host === 'nbtel' ? NBTEL_PRICES : CLASSIC_PRICES;
  return lookupPrice(table, profileName);
}

/**
 * سعر الباقة: من API (sale_price) إن وُجد، وإلا من الجدول المحلي.
 */
export function resolveActivatePackagePrice(
  pkg: {
    profile_name?: string | null;
    sale_price?: number | null;
    sale_price_iqd?: number | null;
  } | null | undefined,
  host: SasPricingHost
): number | null {
  if (!pkg) return null;
  const fromApi = pkg.sale_price ?? pkg.sale_price_iqd;
  if (fromApi != null && Number.isFinite(Number(fromApi)) && Number(fromApi) > 0) {
    return Number(fromApi);
  }
  return resolvePackageSalePrice(pkg.profile_name, host);
}
