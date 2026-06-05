const STORAGE_KEY = 'wakeel:subscribers-list-filters';

export interface SubscriberListFiltersState {
  searchTerm: string;
  debouncedSearchTerm: string;
  statusFilter: string;
  connectionStatusFilter: string;
  sortColumn: string;
  sortDescending: boolean;
  maxDaysUntilExpiry: string;
  appliedMaxDaysUntilExpiry: string;
  fatFilter: string;
  zoneFilter: string;
  appliedFatFilter: string;
  appliedZoneFilter: string;
  noteTypeFilter: string;
  appliedNoteTypeFilter: string;
  extensionActivationFilter: boolean;
  appliedExtensionActivationFilter: boolean;
  expirationFromDate: string;
  expirationToDate: string;
  appliedExpirationFromDate: string;
  appliedExpirationToDate: string;
  currentPage: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object';
}

export function loadSubscriberListFilters(): SubscriberListFiltersState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    return {
      searchTerm: String(parsed.searchTerm ?? ''),
      debouncedSearchTerm: String(parsed.debouncedSearchTerm ?? ''),
      statusFilter: String(parsed.statusFilter ?? 'all'),
      connectionStatusFilter: String(parsed.connectionStatusFilter ?? 'all'),
      sortColumn: String(parsed.sortColumn ?? 'expirationDate'),
      sortDescending: parsed.sortDescending !== false,
      maxDaysUntilExpiry: String(parsed.maxDaysUntilExpiry ?? ''),
      appliedMaxDaysUntilExpiry: String(parsed.appliedMaxDaysUntilExpiry ?? ''),
      fatFilter: String(parsed.fatFilter ?? ''),
      zoneFilter: String(parsed.zoneFilter ?? ''),
      appliedFatFilter: String(parsed.appliedFatFilter ?? ''),
      appliedZoneFilter: String(parsed.appliedZoneFilter ?? ''),
      noteTypeFilter: String(parsed.noteTypeFilter ?? 'all'),
      appliedNoteTypeFilter: String(parsed.appliedNoteTypeFilter ?? 'all'),
      extensionActivationFilter: parsed.extensionActivationFilter === true,
      appliedExtensionActivationFilter: parsed.appliedExtensionActivationFilter === true,
      expirationFromDate: String(parsed.expirationFromDate ?? ''),
      expirationToDate: String(parsed.expirationToDate ?? ''),
      appliedExpirationFromDate: String(parsed.appliedExpirationFromDate ?? ''),
      appliedExpirationToDate: String(parsed.appliedExpirationToDate ?? ''),
      currentPage: Math.max(1, Number(parsed.currentPage) || 1),
    };
  } catch {
    return null;
  }
}

export function saveSubscriberListFilters(state: SubscriberListFiltersState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearSubscriberListFilters(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
