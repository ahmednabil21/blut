/** أسعار الباقات حسب منصة SAS — للمودال */

export type SasPricingHost = 'classic' | 'nbtel';

const CLASSIC_PRICES: Record<string, number> = {
  'NOVA-35': 35_000,
  'NOVA-40': 40_000,
  'NOVA-60': 45_000,
  'NOVA-100': 65_000,
};

const NBTEL_PRICES: Record<string, number> = {
  'NB MAX': 30_000,
  'NB2': 45_000,
  'NB3': 60_000,
};

function normalizeProfileKey(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, ' ');
}

export function detectSasPricingHost(baseUrl?: string | null): SasPricingHost {
  const u = (baseUrl ?? '').toLowerCase();
  if (u.includes('nbtel') || u.includes('srs878') || u.includes('reseller.nbtel')) {
    return 'nbtel';
  }
  return 'classic';
}

function lookupPrice(table: Record<string, number>, profileName: string): number | null {
  const key = normalizeProfileKey(profileName);
  if (table[key] != null) return table[key];

  for (const [k, price] of Object.entries(table)) {
    if (key.startsWith(k) || k.startsWith(key)) return price;
  }
  return null;
}

export function resolvePackageSalePrice(
  profileName: string | undefined | null,
  host: SasPricingHost
): number | null {
  if (!profileName?.trim()) return null;
  const table = host === 'nbtel' ? NBTEL_PRICES : CLASSIC_PRICES;
  return lookupPrice(table, profileName);
}
