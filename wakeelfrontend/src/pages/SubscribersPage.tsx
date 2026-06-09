import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { apiService, ApiService } from '../services/api';
import {
  clearCachedSubscribers,
  fetchSubscribersWithCache,
  fetchProfilesWithCache,
  queueOperation,
  buildCreateRenewalPayload,
  cacheProfiles,
} from '../services/offlineSync';
import { showSuccess, showError, showInfo } from '../utils/notifications';
import { DEFAULT_DETAILS_TEMPLATE, DEFAULT_ACTIVATION_TEMPLATE } from '../utils/activationMessage';
import { buildSubscriberNotesPatch } from '../utils/subscriberNotesPatch';
import { useConfirmation } from '../contexts/ConfirmationContext';
import { useAuth } from '../contexts/AuthContext';
import { useMyAgent } from '../hooks/useMyAgent';
import { useOffline } from '../contexts/OfflineContext';
import { useDigits } from '../contexts/DigitsContext';
import { isPythonBackend } from '../config/apiConfig';
import {
  formatPythonSyncSuccessMessage,
  parseSubscriberSearchForPython,
} from '../utils/pythonSubscribersQuery';
import {
  attachResellerRegionToSubscribers,
  clearResellerRegionFromSubscribers,
  getSelectedResellerId,
  isAllOperationalResellersMode,
  resolveSasFetchReseller,
  resolveSubscriberActivateResellerId,
  setSelectedResellerId,
} from '../utils/selectedReseller';
import {
  formatActivateApiError,
  formatActivateDebtSuccessSuffix,
  getActivateSasResponseMessage,
  isActivateMissingSubscriberError,
  isActivateSuccessResponse,
} from '../utils/activateApiErrors';
import { subscriberConnectionRowClass } from '../utils/subscriberOnlineStatus';
import { packageIsActivatable, parseActivatePackageSelection } from '../utils/activatePackages';
import {
  detectSasPricingHost,
  resolvePackageSalePrice,
} from '../utils/activatePackagePricing';
import {
  applyActivateDebtToRenewalReceipt,
  mapActivationToRenewalReceipt,
  sortActivationRecordsNewestFirst,
} from '../utils/activationRecord';
import {
  clearSubscriberListFilters,
  loadSubscriberListFilters,
  saveSubscriberListFilters,
} from '../utils/subscriberListFiltersStorage';
import { PythonActivateWizard } from '../components/activation/PythonActivateWizard';
import {
  daysUntilExpiration,
  calendarDaysBetween,
  subscriberDaysRemaining,
  formatDaysRemainingColumn,
  daysRemainingTextClass,
  parseSubscriberDate,
  statusBadgeClassFromDays,
  statusLabelFromDaysRemaining,
} from '../utils/subscriberExpiry';
import { Subscriber, SubscriptionStatus, SubscriptionType, SubscriberCreateRequest, Profile, RenewalData, RenewalActivationMode, PaymentStatus, PaginatedResponse, PaginationParams, UserRole, ServiceType, SubscriberNoteType, EARTHLINK_USER_MANAGEMENT_URL, AgentReseller, ProfilePackageType, formatServiceTypeLabelAr, SUBSCRIBER_FETCH_LIMIT_PRESETS, type CashbackSynchronizationFtthResponse, type CashbackSynchronizationFtthRow, type ZainfiSubscriberDiffResponse, type ZainfiSubscriberDiffItem, type ZainfiApplyExternalExpirationRequest, type ActivationInvoicePrintSettingsDto, type BalanceTopUpRequest, type Dealer, type SubscriberNoteTypeOption, User, type RenewalReceipt, type ActivateSubscriberResponse, type ActivatePackageItem } from '../types';
import {
  buildActivationReceiptPrintHtml,
  embedActivationReceiptStaticImages,
  enrichActivationPrintPayload,
  openActivationReceiptPrintWindow,
  renewalLikeToActivationPrintPayload,
  resolveCurrentUserOrganizerDisplayName,
} from '../utils/activationReceiptPrintHtml';
import { getBaghdadDefaultExportRangeLast30Days, getBaghdadRangeBoundsIso, getBaghdadTodayYmd } from '../utils/iraqCalendar';
import { styleAccountsExportExcelBlob } from '../utils/excelExport';
import { SUBSCRIBER_NOTE_TYPE_LABEL_AR, getSubscriberLocalNote } from '../utils/subscriberNoteTypeLabels';
import EditSubscriberModal from '../components/EditSubscriberModal';
import SasEditSubscriberModal from '../components/SasEditSubscriberModal';
import AddNoteModal from '../components/AddNoteModal';
import Pagination from '../components/Pagination';
import WifiLoaderComponent from '../components/WifiLoaderComponent';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Eye, 
  UserPlus,
  Phone,
  X,
  Save,
  CheckSquare,
  Square,
  RefreshCw,
  MoreHorizontal,
  MessageCircle,
  Printer,
  ExternalLink,
  Settings2,
  FileText,
  Filter,
  Check,
  Info,
  Wallet,
  Download,
  ArrowUp,
  ArrowDown,
  CalendarPlus,
  Columns3,
  GripVertical,
} from 'lucide-react';

const SUBSCRIBERS_TABLE_COLUMNS: { id: string; label: string }[] = [
  { id: 'secruptionId', label: 'معرف المشترك' },
  { id: 'subscriber', label: 'المشترك (الاسم)' },
  { id: 'username', label: 'اسم المستخدم' },
  { id: 'subscriberRegion', label: 'منطقة المشترك' },
  { id: 'phoneNumber', label: 'رقم الهاتف' },
  { id: 'zone', label: 'المنطقة' },
  { id: 'noteType', label: 'نوع الملاحظة' },
  { id: 'note', label: 'الملاحظات' },
  { id: 'profile', label: 'الباقة' },
  { id: 'paymentMethod', label: 'طريقة الدفع' },
  { id: 'activationDate', label: 'تاريخ التفعيل' },
  { id: 'expirationDate', label: 'تاريخ الانتهاء' },
  { id: 'daysRemaining', label: 'الأيام المتبقية' },
  { id: 'status', label: 'الحالة' },
  { id: 'hasDebt', label: 'دين' },
];

type ConnectionStatusFilter = 'all' | 'online' | 'offline';

function getSubscriberSortValue(
  subscriber: Subscriber,
  columnId: string,
  resellerNameById: Map<string, string>
): string | number {
  switch (columnId) {
    case 'secruptionId': {
      const raw = String(subscriber.id || subscriber.secruptionId || '').trim();
      const n = Number(raw);
      return Number.isFinite(n) && raw !== '' ? n : raw.toLowerCase();
    }
    case 'subscriber':
      return (subscriber.fullName || '').toLowerCase();
    case 'username':
      return (subscriber.username || '').toLowerCase();
    case 'subscriberRegion': {
      const byName = (subscriber.agentResellerName ?? '').trim();
      const byLookup = resellerNameById.get((subscriber.agentResellerId ?? '').trim()) ?? '';
      return (byName || byLookup || 'بدون منطقة').toLowerCase();
    }
    case 'phoneNumber':
      return (subscriber.phoneNumber || '').toLowerCase();
    case 'zone':
      return (subscriber.zone ?? '').toLowerCase();
    case 'noteType':
      return subscriber.noteType ?? -1;
    case 'note':
      return (subscriber.note ?? '').toLowerCase();
    case 'profile':
      return (subscriber.profileName || '').toLowerCase();
    case 'paymentMethod':
      return (subscriber.paymentMethod ?? '').toLowerCase();
    case 'activationDate': {
      const d = parseSubscriberDate(subscriber.activationDate);
      return d ? d.getTime() : 0;
    }
    case 'expirationDate': {
      const d = parseSubscriberDate(subscriber.expirationDate);
      return d ? d.getTime() : 0;
    }
    case 'daysRemaining':
      return (
        subscriber.daysUntilExpiry ??
        subscriberDaysRemaining(subscriber.activationDate, subscriber.expirationDate) ??
        -999999
      );
    case 'status':
      return (
        subscriber.daysUntilExpiry ??
        (subscriber.expirationDate ? daysUntilExpiration(subscriber.expirationDate) : 0)
      );
    case 'hasDebt':
      return subscriber.hasDebt === true ? 1 : subscriber.hasDebt === false ? 0 : -1;
    default:
      return '';
  }
}

function compareSubscriberSortValues(
  a: string | number,
  b: string | number,
  descending: boolean
): number {
  const mult = descending ? -1 : 1;
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b) return 0;
    return (a - b) * mult;
  }
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  return sa.localeCompare(sb, 'ar', { numeric: true }) * mult;
}

/** للتأكد من فتح صفحة إدارة المستخدمين فقط لـ Earthlink، وليس رابط التفعيل المباشر (#/user/activate/xxx) */
function normalizeEarthlinkActivationUrl(url: string | undefined): string | undefined {
  if (!url || typeof url !== 'string') return url;
  const u = url.trim();
  if (/admin\.earthlink\.iq/i.test(u) && (u.includes('#') || u.includes('/user/activate'))) return EARTHLINK_USER_MANAGEMENT_URL;
  return u;
}

// (SAS Python activation) تم تعليقها مؤقتاً — لا يتم تنفيذ أي منطق هنا حالياً.

const STORAGE_KEY_VISIBLE_COLUMNS = 'wakeel_subscribers_visible_columns';
const STORAGE_KEY_COLUMN_ORDER = 'wakeel_subscribers_column_order';

const REGION_BADGE_COLORS = [
  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 border-blue-200 dark:border-blue-700',
  'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200 border-purple-200 dark:border-purple-700',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700',
  'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 border-amber-200 dark:border-amber-700',
  'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200 border-rose-200 dark:border-rose-700',
  'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-200 border-cyan-200 dark:border-cyan-700',
];

function pickRegionBadgeColor(regionKey: string): string {
  let hash = 0;
  for (let i = 0; i < regionKey.length; i += 1) {
    hash = (hash * 31 + regionKey.charCodeAt(i)) >>> 0;
  }
  return REGION_BADGE_COLORS[hash % REGION_BADGE_COLORS.length];
}

/** تطبيع بسيط لمطابقة «وكيل اخر» في أسماء الباقات */
function normalizeArabicForProfileKeyword(s: string): string {
  return (s || '')
    .replace(/\u0640/g, '')
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .toLowerCase();
}

function profileNameIndicatesOtherDealerKeyword(name: string | undefined): boolean {
  const n = normalizeArabicForProfileKeyword(name || '');
  return n.includes('وكيل اخر') || n.includes('وكيلاخر') || n.includes('لوكيل اخر');
}

/** عنوان واجهة سكربت البايثون SAS (زر تفعيل المشترك عند SAS): تسجيل الدخول /sas/login، التفعيل /sas/activate. إنتاج https://api.execute-iq.com/apipy، تطوير localhost. يمكن تخطيه بـ REACT_APP_SAS_PYTHON_API_URL */
// const SAS_PYTHON_API_BASE =
//   process.env.REACT_APP_SAS_PYTHON_API_URL ||
//   (process.env.NODE_ENV === 'production' ? 'https://api.execute-iq.com/apipy' : 'http://localhost:8000');

function getSubscriberNoteTypeLabel(noteType?: SubscriberNoteType | null, note?: string | null): string {
  const hasFreeNote = (note ?? '').toString().trim().length > 0;
  if (!noteType) return hasFreeNote ? SUBSCRIBER_NOTE_TYPE_LABEL_AR[SubscriberNoteType.Other] : '—';
  return SUBSCRIBER_NOTE_TYPE_LABEL_AR[noteType] ?? String(noteType);
}

/** تاريخ Zain للتطبيق على المشترك؛ يفضّل externalEndDate ثم عمود الانتهاء المعروض */
function resolveZainfiApplyExternalEndDate(row: ZainfiSubscriberDiffItem): string | null {
  const ext = (row.externalEndDate != null && String(row.externalEndDate).trim()) || '';
  if (ext) return ext;
  const exp = (row.expirationDate != null && String(row.expirationDate).trim()) || '';
  return exp || null;
}

function getSubscriberNoteTypeBadge(noteType?: SubscriberNoteType | null, note?: string | null) {
  const label = getSubscriberNoteTypeLabel(noteType, note);
  if (label === '—') return <span className="text-gray-400">—</span>;

  const normalizedType: SubscriberNoteType | null =
    noteType ?? (((note ?? '').toString().trim().length > 0) ? SubscriberNoteType.Other : null);

  const base = 'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full';
  const styles: Record<number, string> = {
    [SubscriberNoteType.NoResponse]:
      'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300',
    [SubscriberNoteType.DoesNotWantActivation]:
      'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
    [SubscriberNoteType.MaintenanceRequest]:
      'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
    [SubscriberNoteType.StableService]:
      'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
    [SubscriberNoteType.Other]:
      'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300',
  };

  const cls = normalizedType ? (styles[normalizedType] ?? styles[SubscriberNoteType.Other]) : styles[SubscriberNoteType.Other];
  return <span className={`${base} ${cls}`}>{label}</span>;
}

function getDefaultVisibleColumns(): Record<string, boolean> {
  return SUBSCRIBERS_TABLE_COLUMNS.reduce<Record<string, boolean>>((acc, col) => {
    acc[col.id] = true;
    return acc;
  }, {});
}

function loadVisibleColumns(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VISIBLE_COLUMNS);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      const defaults = getDefaultVisibleColumns();
      return { ...defaults, ...parsed };
    }
  } catch (_) {}
  return getDefaultVisibleColumns();
}

function getDefaultColumnOrder(): string[] {
  return SUBSCRIBERS_TABLE_COLUMNS.map((col) => col.id);
}

function mergeColumnOrder(saved: string[]): string[] {
  const defaults = getDefaultColumnOrder();
  const valid = saved.filter((id) => defaults.includes(id));
  const missing = defaults.filter((id) => !valid.includes(id));
  return [...valid, ...missing];
}

function loadColumnOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COLUMN_ORDER);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return mergeColumnOrder(parsed);
      }
    }
  } catch (_) {}
  return getDefaultColumnOrder();
}

/** Card / Wallet وغيرها — للجدول الرئيسي ومزامنة المعاملات */
function formatPaymentMethodLabel(raw?: string | null): string {
  if (raw == null || String(raw).trim() === '') return '—';
  const v = String(raw).trim();
  const lower = v.toLowerCase();
  if (lower === 'card') return 'بطاقة دفع';
  if (lower === 'wallet') return 'محفظة الرصيد';
  return v;
}

/** مزامنة تلقائياً: الصفوف التي يعيدها الباكند مع deviceUsername فارغ لا تُعرض كمشترك */
function filterAutoSyncFtthRowsWithDeviceUsername(
  res: CashbackSynchronizationFtthResponse
): CashbackSynchronizationFtthResponse {
  const data = (res.data ?? []).filter((row) => {
    const v = row.deviceUsername;
    if (v === undefined) return true;
    return String(v).trim() !== '';
  });
  return { ...res, data, count: data.length };
}

async function resolvePythonActivationReceipt(
  username: string,
  subscriber: Subscriber,
  pkg: ActivatePackageItem | null,
  price: number | null,
  res: ActivateSubscriberResponse,
  paidAmount?: number | null
): Promise<RenewalReceipt> {
  const packagePrice = res.package_price ?? price ?? subscriber.profilePrice ?? 0;
  const amountPaid = res.amount_paid ?? paidAmount ?? packagePrice;

  try {
    const list = await apiService.getActivations({ username, page: 1, per_page: 5 });
    const latest = sortActivationRecordsNewestFirst(list.data ?? [])[0];
    if (latest) {
      let receipt = mapActivationToRenewalReceipt(latest);
      receipt.subscriberId = subscriber.id;
      if (!receipt.subscriberPhone?.trim()) {
        receipt.subscriberPhone = subscriber.phoneNumber ?? '';
      }
      receipt = applyActivateDebtToRenewalReceipt(receipt, res, {
        packagePrice,
        amountPaid,
      });
      return receipt;
    }
  } catch {
    /* fallback */
  }

  const now = new Date().toISOString();
  const profileName = pkg?.profile_name?.trim() || subscriber.profileName || '—';
  const pin = (res.card_pin ?? '').trim();
  let receipt: RenewalReceipt = {
    id: pin || String(Date.now()),
    receiptNumber: pin || String(Date.now()).slice(-8),
    subscriberId: subscriber.id,
    subscriberName: subscriber.fullName || subscriber.username,
    subscriberUsername: subscriber.username,
    subscriberPhone: subscriber.phoneNumber ?? '',
    profileName,
    oldProfileName: subscriber.profileName,
    newProfileName: profileName,
    newProfileOriginalPrice: packagePrice,
    newProfileSalePrice: packagePrice,
    finalPrice: packagePrice,
    amountPaid,
    remainingAmount: 0,
    discountAmount: 0,
    discountPercent: 0,
    renewalPeriod: 30,
    renewalDays: 30,
    renewalDate: now,
    newExpirationDate: subscriber.expirationDate ?? '',
    paymentStatus: PaymentStatus.Paid,
    wiFiCode: '',
    createdAt: now,
    agentCompanyName: subscriber.agentCompanyName ?? '',
    activationPin: pin || null,
  };
  return applyActivateDebtToRenewalReceipt(receipt, res, { packagePrice, amountPaid });
}

const SubscribersPage: React.FC = () => {
  const { confirmDelete } = useConfirmation();
  const { user, isAuthenticated } = useAuth();
  const { online, refreshPendingCount } = useOffline();
  const { formatNumber, formatDate, locale } = useDigits();
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const persistedFilters = useMemo(() => loadSubscriberListFilters(), []);
  const [searchTerm, setSearchTerm] = useState(
    () => persistedFilters?.searchTerm ?? persistedFilters?.debouncedSearchTerm ?? ''
  );
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(
    () => persistedFilters?.debouncedSearchTerm ?? ''
  );
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | 'all'>(
    () => (persistedFilters?.statusFilter as SubscriptionStatus | 'all') ?? 'all'
  );
  const [connectionStatusFilter, setConnectionStatusFilter] =
    useState<ConnectionStatusFilter>(() => (persistedFilters?.connectionStatusFilter as ConnectionStatusFilter) ?? 'all');
  const [sortColumn, setSortColumn] = useState<string>(() => persistedFilters?.sortColumn ?? 'expirationDate');
  const [sortDescending, setSortDescending] = useState<boolean>(
    () => persistedFilters?.sortDescending ?? true
  );
  const [maxDaysUntilExpiry, setMaxDaysUntilExpiry] = useState<string>(
    () => persistedFilters?.maxDaysUntilExpiry ?? ''
  );
  const [appliedMaxDaysUntilExpiry, setAppliedMaxDaysUntilExpiry] = useState<string>(
    () => persistedFilters?.appliedMaxDaysUntilExpiry ?? ''
  );
  const [fatFilter, setFatFilter] = useState<string>(() => persistedFilters?.fatFilter ?? '');
  const [zoneFilter, setZoneFilter] = useState<string>(() => persistedFilters?.zoneFilter ?? '');
  const [appliedFatFilter, setAppliedFatFilter] = useState<string>(
    () => persistedFilters?.appliedFatFilter ?? ''
  );
  const [appliedZoneFilter, setAppliedZoneFilter] = useState<string>(
    () => persistedFilters?.appliedZoneFilter ?? ''
  );
  const [noteTypeFilter, setNoteTypeFilter] = useState<string>(
    () => persistedFilters?.noteTypeFilter ?? 'all'
  );
  const [appliedNoteTypeFilter, setAppliedNoteTypeFilter] = useState<string>(
    () => persistedFilters?.appliedNoteTypeFilter ?? 'all'
  );
  const [extensionActivationFilter, setExtensionActivationFilter] = useState<boolean>(
    () => persistedFilters?.extensionActivationFilter ?? false
  );
  const [appliedExtensionActivationFilter, setAppliedExtensionActivationFilter] = useState<boolean>(
    () => persistedFilters?.appliedExtensionActivationFilter ?? false
  );
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const [showExcelExportModal, setShowExcelExportModal] = useState(false);
  const [excelExportOmitDates, setExcelExportOmitDates] = useState(false);
  const [excelExportFromYmd, setExcelExportFromYmd] = useState('');
  const [excelExportToYmd, setExcelExportToYmd] = useState('');
  const [excelExportResellerId, setExcelExportResellerId] = useState('');
  const [excelExportExecutorUserId, setExcelExportExecutorUserId] = useState('');
  const [excelExportPackageType, setExcelExportPackageType] = useState('');
  const [exportingExcel, setExportingExcel] = useState(false);
  const [expirationFromDate, setExpirationFromDate] = useState(
    () => persistedFilters?.expirationFromDate ?? ''
  );
  const [expirationToDate, setExpirationToDate] = useState(
    () => persistedFilters?.expirationToDate ?? ''
  );
  const [appliedExpirationFromDate, setAppliedExpirationFromDate] = useState(
    () => persistedFilters?.appliedExpirationFromDate ?? ''
  );
  const [appliedExpirationToDate, setAppliedExpirationToDate] = useState(
    () => persistedFilters?.appliedExpirationToDate ?? ''
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRenewalModal, setShowRenewalModal] = useState(false);
  /** مفتاح الباقة من GET /activate/packages (id:123 أو name:NOVA) */
  const [activateSelectedPackageKey, setActivateSelectedPackageKey] = useState('');
  const [pythonActivateStep, setPythonActivateStep] = useState<1 | 2>(1);
  const [activateEmployeeCode, setActivateEmployeeCode] = useState('');
  const [showActivateEmployeeConfirm, setShowActivateEmployeeConfirm] = useState(false);
  const [showActivateDebtConfirm, setShowActivateDebtConfirm] = useState(false);
  /** رسيلر مثبّت عند فتح مودال التفعيل (X-Reseller-Id + select) */
  const [activateModalResellerId, setActivateModalResellerId] = useState('');
  /** جاهزية POST /resellers/{id}/select قبل جلب الباقات */
  const [activateResellerReady, setActivateResellerReady] = useState(false);
  const activateResellerSelectRef = useRef<Promise<void> | null>(null);
  /** مودال التفعيل — واصل: المبلغ كاملاً (افتراضي) */
  const [amountReceivedInFull, setAmountReceivedInFull] = useState(true);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selectedSubscriberForEdit, setSelectedSubscriberForEdit] = useState<Subscriber | null>(null);
  const [selectedSubscriberForNote, setSelectedSubscriberForNote] = useState<Subscriber | null>(null);
  const [selectedSubscriberForRenewal, setSelectedSubscriberForRenewal] = useState<Subscriber | null>(null);
  const [renewalViaSasTab, setRenewalViaSasTab] = useState(false);
  const [sasLinkLoading, setSasLinkLoading] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);

  const clearSubscriberSelection = useCallback(() => {
    setSelectedIds([]);
    setShowActionsDropdown(false);
  }, []);
  const [sendReminderLoading, setSendReminderLoading] = useState(false);
  const [profileSearchInAdd, setProfileSearchInAdd] = useState('');
  const [showProfileDropdownAdd, setShowProfileDropdownAdd] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownAddRef = useRef<HTMLDivElement>(null);
  /** يمنع إعادة ضبط المبلغ الواصل عند إعادة جلب قائمة الباقات دون تغيير الاختيار */
  const renewalProfileIdForAmountSyncRef = useRef<string>('');
  const renewalGeneralNotesTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const columnSettingsRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const isAgentOrSubAgentOrEmployee =
    user?.role === UserRole.Agent || user?.role === UserRole.SubAgent || user?.role === UserRole.Employee;
  const canSyncSas =
    user?.role === UserRole.Admin ||
    user?.role === UserRole.Agent ||
    user?.role === UserRole.SubAgent ||
    user?.role === UserRole.Employee;
  const { data: myResellers = [] } = useQuery<AgentReseller[]>({
    queryKey: ['myResellers'],
    queryFn: () => apiService.getMyResellers(),
    enabled: !!isAgentOrSubAgentOrEmployee || !!canSyncSas,
  });

  const { data: pythonSubscriptionStatuses = [] } = useQuery({
    queryKey: ['python-subscription-statuses'],
    queryFn: () => apiService.getPythonSubscriptionStatuses(),
    enabled: isPythonBackend(),
    staleTime: 600_000,
  });

  const { data: pythonSubscriberNoteTypes = [] } = useQuery({
    queryKey: ['subscriber-note-types'],
    queryFn: () => apiService.getPythonSubscriberNoteTypes(),
    enabled: isPythonBackend(),
    staleTime: 600_000,
  });

  const subscriberNoteTypeFilterOptions = useMemo(() => {
    if (isPythonBackend() && pythonSubscriberNoteTypes.length > 0) {
      return pythonSubscriberNoteTypes;
    }
    return [1, 2, 3, 4, 5].map((v) => ({
      value: v,
      label: SUBSCRIBER_NOTE_TYPE_LABEL_AR[v as SubscriberNoteType] ?? String(v),
    }));
  }, [pythonSubscriberNoteTypes]);

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => loadVisibleColumns());
  const [columnOrder, setColumnOrder] = useState<string[]>(() => loadColumnOrder());
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showColumnOrderModal, setShowColumnOrderModal] = useState(false);
  const [columnOrderDraft, setColumnOrderDraft] = useState<string[]>([]);
  const [selectedOperationalResellerId, setSelectedOperationalResellerId] = useState<string>('');
  /**
   * حد أقصى لعدد المشتركين في طلب مقارنة Zain Fi² / FiberX.
   * `null` = الكل (لا يُرسل maxSubscribersToFetch في الاستعلام).
   */
  const [subscriberFetchMaxChoice, setSubscriberFetchMaxChoice] = useState<number | null>(null);
  /** بعد التفعيل أو التفعيل (دين): عرض مودال لاختيار إرسال واتساب أو إلغاء. */
  const [postActivationWhatsApp, setPostActivationWhatsApp] = useState<{ subscriberId: string; mode: 'activation' | 'details' } | null>(null);
  const [showAutoSyncModal, setShowAutoSyncModal] = useState(false);
  const [autoSyncFtthResult, setAutoSyncFtthResult] = useState<CashbackSynchronizationFtthResponse | null>(null);
  /** نتيجة GET …/zainfi|fiberx/sync-diff عند «تحديث بيانات» لرسيلر Zain Fi² أو FiberX */
  const [zainfiDiffResult, setZainfiDiffResult] = useState<ZainfiSubscriberDiffResponse | null>(null);
  /** أيهما أُجري: لمطابقة عنوان apply-external-expiration */
  const [syncDiffProvider, setSyncDiffProvider] = useState<'zainfi' | 'fiberx' | null>(null);
  /** الرسيلر المستخدم في آخر GET sync-diff (لإرسال resellerId مع apply-external-expiration) */
  const [zainfiSyncDiffResellerId, setZainfiSyncDiffResellerId] = useState<string | null>(null);
  const [applyingZainfiExpirationSubscriberId, setApplyingZainfiExpirationSubscriberId] = useState<string | null>(null);
  const [savingFtthRowIndex, setSavingFtthRowIndex] = useState<number | null>(null);
  const [savingAllSasRows, setSavingAllSasRows] = useState(false);
  const [openingRenewalFtthRowIndex, setOpeningRenewalFtthRowIndex] = useState<number | null>(null);
  const [savedFtthRowIndices, setSavedFtthRowIndices] = useState<Set<number>>(new Set());
  const [activatedFtthRowIndices, setActivatedFtthRowIndices] = useState<Set<number>>(new Set());
  const [pendingFtthRenewalRowIndex, setPendingFtthRenewalRowIndex] = useState<number | null>(null);

  const toggleColumnVisibility = (id: string) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(STORAGE_KEY_VISIBLE_COLUMNS, JSON.stringify(next));
      } catch (_) {}
      return next;
    });
  };

  const col = (id: string) => (visibleColumns[id] !== false ? '' : 'hidden');

  const orderedTableColumns = useMemo(() => {
    const byId = new Map(SUBSCRIBERS_TABLE_COLUMNS.map((c) => [c.id, c]));
    return columnOrder
      .map((id) => byId.get(id))
      .filter((c): c is (typeof SUBSCRIBERS_TABLE_COLUMNS)[number] => !!c);
  }, [columnOrder]);

  const columnLabelById = useMemo(
    () => new Map(SUBSCRIBERS_TABLE_COLUMNS.map((c) => [c.id, c.label])),
    []
  );

  const openColumnOrderModal = () => {
    setColumnOrderDraft([...columnOrder]);
    setShowColumnOrderModal(true);
    setShowColumnSettings(false);
  };

  const moveColumnInDraft = (index: number, direction: -1 | 1) => {
    setColumnOrderDraft((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const saveColumnOrder = () => {
    const next = mergeColumnOrder(columnOrderDraft);
    setColumnOrder(next);
    try {
      localStorage.setItem(STORAGE_KEY_COLUMN_ORDER, JSON.stringify(next));
    } catch (_) {}
    setShowColumnOrderModal(false);
  };

  const resetColumnOrderDraft = () => {
    setColumnOrderDraft(getDefaultColumnOrder());
  };

  const getSubscriberRegion = (subscriber: Subscriber): { name: string; badgeClass: string } => {
    const byName = (subscriber.agentResellerName ?? '').trim();
    const byLookup = myResellers.find((r) => r.id === subscriber.agentResellerId)?.name?.trim() ?? '';
    const regionName = byName || byLookup;
    if (!regionName) {
      return {
        name: 'بدون منطقة',
        badgeClass: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600',
      };
    }
    return { name: regionName, badgeClass: pickRegionBadgeColor(regionName.toLowerCase()) };
  };

  // Form state for adding new subscriber
  const [formData, setFormData] = useState<SubscriberCreateRequest>({
    secruptionId: '',
    username: '',
    password: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
    noteType: SubscriberNoteType.NoResponse,
    note: '',
    profileId: '',
    activationDate: new Date().toISOString().split('T')[0],
    expirationDate: new Date().toISOString().split('T')[0],
    subscriptionType: SubscriptionType.Paid,
    fat: '',
    zone: '',
    agentResellerId: ''
  });

  // Form state for renewal
  const [renewalData, setRenewalData] = useState<RenewalData>({
    subscriberId: '',
    newProfileId: '',
    paymentStatus: PaymentStatus.Paid,
    overrideSalePrice: 0,
    amountPaid: 0,
    notes: '',
    remainingAmount: 0,
    debtDescription: '',
    debtDueDate: '',
    renewalDate: '',
    activationMode: RenewalActivationMode.Full,
    dealerId: '',
    subscriberNoteType: null,
  });
  const [showOtherDealerTopUpModal, setShowOtherDealerTopUpModal] = useState(false);
  const [otherDealerTopUpForm, setOtherDealerTopUpForm] = useState<
    BalanceTopUpRequest & { topUpDate: string }
  >({
    amountIqd: 0,
    recipientName: '',
    companyName: '',
    topUpDate: new Date().toISOString().split('T')[0],
    agentResellerId: '',
  });

  const [currentPage, setCurrentPage] = useState(() => persistedFilters?.currentPage ?? 1);
  const [pageSize] = useState(10);

  const isEmployee = user?.role === UserRole.Employee;
  const sasSearchOnlyMode =
    isPythonBackend() &&
    isEmployee &&
    !user?.canViewAllSubscribers &&
    user?.sasCanViewSubscribersBySearch !== false;
  const requireTwoWordsForSearch =
    isEmployee &&
    !user?.canViewAllSubscribers &&
    (!isPythonBackend() || user?.sasCanViewSubscribersBySearch !== false);
  const isValidSearchOnlyQuery = (raw: string): boolean => {
    const term = raw.trim();
    if (!term) return false;
    const parsed = parseSubscriberSearchForPython(term);
    if (parsed.username || parsed.user_id != null) return true;
    if (parsed.phone) return false;
    const words = (parsed.subscriber_name ?? term).trim().split(/\s+/).filter(Boolean);
    return words.length >= 2;
  };

  const {
    data: subscribersResponse,
    error,
    isLoading,
    isFetching: subscribersFetching,
  } = useQuery<PaginatedResponse<Subscriber>>({
    queryKey: ['subscribers', 'offline', online, currentPage, pageSize, debouncedSearchTerm, statusFilter, connectionStatusFilter, sortColumn, sortDescending, appliedMaxDaysUntilExpiry, appliedFatFilter, appliedZoneFilter, appliedNoteTypeFilter, appliedExtensionActivationFilter, appliedExpirationFromDate, appliedExpirationToDate, selectedOperationalResellerId],
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      if (!isPythonBackend() || !online) return false;
      if (connectionStatusFilter !== 'all') return false;
      const bg = query.state.data?.backgroundSync;
      if (bg?.in_progress) return 2500;
      if ((query.state.data?.totalItems ?? 0) === 0 && (bg?.scheduled || bg?.stale)) {
        return 2500;
      }
      return false;
    },
    queryFn: async () => {
      const daysNum = appliedMaxDaysUntilExpiry.trim() === '' ? undefined : parseInt(appliedMaxDaysUntilExpiry, 10);
      const noteTypeNum =
        appliedNoteTypeFilter === 'all' ? undefined : (parseInt(appliedNoteTypeFilter, 10) as SubscriberNoteType);
      const rawSearch = debouncedSearchTerm && debouncedSearchTerm.trim() ? debouncedSearchTerm.trim() : '';
      const employeeRequiresTwoWords =
        user?.role === UserRole.Employee &&
        !user?.canViewAllSubscribers &&
        (!isPythonBackend() || user?.sasCanViewSubscribersBySearch !== false);
      const searchWords = rawSearch ? rawSearch.split(/\s+/).filter(Boolean) : [];
      const parsedSearch = rawSearch ? parseSubscriberSearchForPython(rawSearch) : {};
      const searchNeedsTwoWords =
        employeeRequiresTwoWords &&
        !!parsedSearch.subscriber_name &&
        !parsedSearch.username &&
        !parsedSearch.phone &&
        parsedSearch.user_id == null;
      const effectiveSearch =
        !rawSearch
          ? undefined
          : searchNeedsTwoWords && searchWords.length < 2
            ? undefined
            : rawSearch;
      const fetchReseller = resolveSasFetchReseller(myResellers, selectedOperationalResellerId);
      const allRegions = isAllOperationalResellersMode(selectedOperationalResellerId);
      const params: PaginationParams = {
        page: currentPage,
        pageSize: pageSize,
        search: effectiveSearch,
        status: statusFilter !== 'all' ? statusFilter.toString() : undefined,
        connectionStatus:
          isPythonBackend() && connectionStatusFilter !== 'all'
            ? connectionStatusFilter
            : undefined,
        sortBy: sortColumn,
        sortDescending: sortDescending,
        maxDaysUntilExpiry: daysNum !== undefined && !isNaN(daysNum) && daysNum >= 0 ? daysNum : undefined,
        fat: appliedFatFilter.trim() || undefined,
        zone: appliedZoneFilter.trim() || undefined,
        noteType: noteTypeNum !== undefined && !isNaN(noteTypeNum as any) ? noteTypeNum : undefined,
        hasExtensionActivation: appliedExtensionActivationFilter || undefined,
        expirationFromDate: appliedExpirationFromDate.trim() || undefined,
        expirationToDate:
          isPythonBackend() ? undefined : appliedExpirationToDate.trim() || undefined,
        resellerId: allRegions ? undefined : (fetchReseller?.id ?? selectedOperationalResellerId) || undefined,
        resellerName: allRegions ? undefined : fetchReseller?.name,
      };
      if (params.maxDaysUntilExpiry === undefined) delete params.maxDaysUntilExpiry;
      if (params.fat === undefined) delete params.fat;
      if (params.zone === undefined) delete params.zone;
      if (params.noteType === undefined) delete params.noteType;
      if (params.hasExtensionActivation === undefined) delete params.hasExtensionActivation;
      if (params.expirationFromDate === undefined) delete params.expirationFromDate;
      if (params.expirationToDate === undefined) delete params.expirationToDate;
      return fetchSubscribersWithCache(online, params);
    },
    enabled: !sasSearchOnlyMode || isValidSearchOnlyQuery(debouncedSearchTerm),
  });

  const subscribers = React.useMemo(() => {
    const raw = subscribersResponse?.data ?? [];
    if (!isPythonBackend()) return raw;
    if (isAllOperationalResellersMode(selectedOperationalResellerId)) {
      return clearResellerRegionFromSubscribers(raw);
    }
    const fetchReseller = resolveSasFetchReseller(myResellers, selectedOperationalResellerId);
    return attachResellerRegionToSubscribers(raw, fetchReseller);
  }, [subscribersResponse?.data, myResellers, selectedOperationalResellerId]);
  const selectedSubscriber =
    selectedSubscriberForRenewal ?? subscribers?.find((s) => s.id === renewalData.subscriberId) ?? null;
  const renewalResellerIdForQuery = (selectedSubscriber?.agentResellerId ?? '').trim() || undefined;
  const activateUsername = (selectedSubscriber?.username ?? '').trim();
  const activateSubscriberName = useMemo(() => {
    const sub = selectedSubscriber;
    if (!sub) return '';
    const full = (sub.fullName ?? '').trim();
    if (full) return full;
    return [(sub.firstName ?? '').trim(), (sub.lastName ?? '').trim()].filter(Boolean).join(' ');
  }, [selectedSubscriber]);
  const pythonActivateResellerId = activateModalResellerId.trim();

  const {
    data: activatePackagesBundle,
    isLoading: activatePackagesLoading,
    error: activatePackagesError,
  } = useQuery({
    queryKey: ['activate-packages', pythonActivateResellerId, activateUsername],
    queryFn: () =>
      apiService.getActivatePackages({
        username: activateUsername,
        live: false,
        fromSas: true,
      }),
    enabled:
      showRenewalModal &&
      isPythonBackend() &&
      !!pythonActivateResellerId &&
      !!activateUsername &&
      activateResellerReady,
    retry: false,
    refetchInterval:
      showRenewalModal &&
      isPythonBackend() &&
      !!pythonActivateResellerId &&
      !!activateUsername &&
      activateResellerReady
        ? 10_000
        : false,
    refetchIntervalInBackground: false,
  });

  const activatePackagesList = useMemo(
    () => activatePackagesBundle?.packages ?? [],
    [activatePackagesBundle?.packages]
  );
  const selectedActivatePackage = useMemo(
    () =>
      activatePackagesList.find((p) => p.package_key === activateSelectedPackageKey) ?? null,
    [activatePackagesList, activateSelectedPackageKey]
  );
  const selectedPackageActivatable = packageIsActivatable(selectedActivatePackage);
  const pythonActivateReseller = useMemo(
    () => myResellers.find((r) => r.id === pythonActivateResellerId),
    [myResellers, pythonActivateResellerId]
  );

  const pythonPackagePrice = useMemo(
    () =>
      resolvePackageSalePrice(
        selectedActivatePackage?.profile_name,
        detectSasPricingHost(pythonActivateReseller?.baseUrl)
      ),
    [selectedActivatePackage?.profile_name, pythonActivateReseller?.baseUrl]
  );

  const handlePythonSelectPackage = (packageKey: string) => {
    const pkg = activatePackagesList.find((p) => p.package_key === packageKey);
    if (!pkg || !packageIsActivatable(pkg)) return;

    const price = resolvePackageSalePrice(
      pkg.profile_name,
      detectSasPricingHost(pythonActivateReseller?.baseUrl)
    );
    if (price == null) {
      showError('الباقة', `لا يوجد سعر معرّف لـ «${pkg.profile_name ?? ''}»`);
      return;
    }

    setActivateSelectedPackageKey(packageKey);
    setRenewalData((prev) => ({
      ...prev,
      overrideSalePrice: price,
      amountPaid: price,
      remainingAmount: 0,
      debtDueDate: '',
    }));
    setAmountReceivedInFull(true);
    setPythonActivateStep(2);
  };

  const handlePythonAmountPaidChange = (value: number) => {
    const price = pythonPackagePrice ?? renewalData.overrideSalePrice ?? 0;
    const paid = Math.max(0, Math.min(price, value));
    setRenewalData((prev) => ({
      ...prev,
      amountPaid: paid,
      remainingAmount: Math.max(0, price - paid),
    }));
    setAmountReceivedInFull(paid >= price);
  };

  const { data: profilesResponse } = useQuery({
    queryKey: ['profiles', 'all', online, selectedOperationalResellerId],
    queryFn: () => fetchProfilesWithCache(online, { page: 1, pageSize: 100, resellerId: selectedOperationalResellerId || undefined }),
  });

  const profiles = React.useMemo(
    () => (profilesResponse?.data ?? []) as Profile[],
    [profilesResponse]
  );
  const activeProfiles = React.useMemo(
    () => profiles.filter((p) => p.isActive),
    [profiles]
  );
  const { data: renewalProfiles = [] } = useQuery<Profile[]>({
    queryKey: ['renewal-profiles', renewalResellerIdForQuery ?? '__no_reseller__'],
    queryFn: () => apiService.getRenewalProfiles(renewalResellerIdForQuery),
    enabled: showRenewalModal && !!selectedSubscriber && !isPythonBackend(),
  });

  const { data: renewalSubscriberContext, isLoading: renewalDealersLoading } = useQuery<{
    dealers: Dealer[];
    subscriberNoteTypes: SubscriberNoteTypeOption[];
  }>({
    queryKey: [
      'renewal-subscriber-context',
      selectedSubscriber?.id ?? '',
      renewalResellerIdForQuery ?? '',
      renewalData.activationMode ?? RenewalActivationMode.Full,
    ],
    queryFn: async () => {
      const sub = selectedSubscriber!;
      const rid = renewalResellerIdForQuery;
      const mode = renewalData.activationMode ?? RenewalActivationMode.Full;
      const ctx = await apiService.getRenewalSubscriberAvailableDealers(sub.id, rid);
      let dealers = ctx.dealers;
      if (dealers.length === 0 && mode === RenewalActivationMode.OtherDealer) {
        const agentId = (sub.agentId ?? '').trim();
        if (agentId) {
          dealers = await apiService.getRenewalDealersList({
            agentId,
            resellerId: rid,
          });
        }
      }
      return { dealers, subscriberNoteTypes: ctx.subscriberNoteTypes };
    },
    enabled: showRenewalModal && !!selectedSubscriber && !isPythonBackend(),
    staleTime: 60_000,
  });
  const renewalAvailableDealers = React.useMemo(
    () => renewalSubscriberContext?.dealers ?? [],
    [renewalSubscriberContext?.dealers]
  );

  useEffect(() => {
    if ((renewalData.activationMode ?? RenewalActivationMode.Full) !== RenewalActivationMode.OtherDealer) return;
    const id = (renewalData.dealerId ?? '').trim();
    if (!id) return;
    if (!renewalAvailableDealers.some((d) => d.id === id)) {
      setRenewalData((p) => ({ ...p, dealerId: '' }));
    }
  }, [renewalAvailableDealers, renewalData.dealerId, renewalData.activationMode]);

  useEffect(() => {
    if (Array.isArray(profiles) && profiles.length > 0) {
      cacheProfiles(profiles).catch(() => {});
    }
  }, [profiles]);

  /** باقات إنشاء مشترك: نفس الرسيلر المختار في الفلتر فقط */
  const profilesForCreate = React.useMemo(() => {
    const rid = (selectedOperationalResellerId ?? '').trim();
    if (!rid) return [] as Profile[];
    return activeProfiles.filter((p) => (p.agentResellerId ?? '').trim() === rid);
  }, [activeProfiles, selectedOperationalResellerId]);

  const filteredProfilesForAdd = React.useMemo(() => {
    const list = profilesForCreate;
    const q = (profileSearchInAdd || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        String(p.salePrice || '').includes(q) ||
        (p.id || '').toLowerCase().includes(q)
    );
  }, [profilesForCreate, profileSearchInAdd]);

  /** باقات تعديل مشترك: مربوطة بـ agentResellerId للمشترك */
  const profilesForEditSubscriber = React.useMemo(() => {
    const sub = selectedSubscriberForEdit;
    if (!sub) return [] as Profile[];
    const rid = (sub.agentResellerId ?? '').trim();
    if (!rid) return activeProfiles;
    return activeProfiles.filter((p) => (p.agentResellerId ?? '').trim() === rid);
  }, [selectedSubscriberForEdit, activeProfiles]);

  useEffect(() => {
    if (!showAddModal) return;
    const rid = (selectedOperationalResellerId ?? '').trim();
    setFormData((prev) => {
      const next: SubscriberCreateRequest = { ...prev, agentResellerId: rid };
      if (!rid) return { ...next, profileId: '' };
      const stillValid = profilesForCreate.some((p) => p.id === prev.profileId);
      if (!stillValid) return { ...next, profileId: '' };
      return next;
    });
  }, [showAddModal, selectedOperationalResellerId, profilesForCreate]);

  /** للموظف: كل إجراء يظهر فقط عند منح صلاحيته بشكل مستقل */
  const showEditSubscriberAction = !isEmployee || !!user?.canEditSubscriber;
  const showDeleteSubscriberAction = !isEmployee || !!user?.canDeleteSubscriber;
  const showViewDetailsAction = !isEmployee || !!user?.canEditSubscriber || !!user?.canDeleteSubscriber;
  /** ليس موظفاً، أو موظف مع صلاحية تفعيل صريحة من GET /users/me */
  const showActivateSubscriberAction =
    user?.role !== UserRole.Employee || !!user?.canActivateSubscriber;
  const showActivateViaTabAction = showActivateSubscriberAction;
  const {
    data: myAgent,
    isLoading: myAgentLoading,
    error: myAgentError,
  } = useMyAgent(!!isAgentOrSubAgentOrEmployee || !!canSyncSas);

  const accountsExcelExportAgentId =
    user?.role === UserRole.Admin ? (myAgent?.id ?? '').trim() : '';

  const { data: accountsExecutorOptionsForExcel = [] } = useQuery<User[]>({
    queryKey: ['accounts-executor-options', 'subscribers-page', accountsExcelExportAgentId || 'me', user?.id],
    queryFn: async () => {
      if (user?.role === UserRole.Admin) {
        const aid = accountsExcelExportAgentId;
        if (!aid) return [];
        const emps = await apiService.getAgentEmployees(aid);
        const ag = myAgent;
        const list = [...emps];
        const agUid = ag?.userId?.trim();
        if (ag && agUid && !list.some((e) => e.id === agUid)) {
          list.unshift({
            id: agUid,
            username: ag.username,
            fullName: `${(ag.fullName || ag.companyName || ag.username).trim()} (وكيل)`,
            isActive: ag.isActive,
            role: UserRole.Agent,
          } as User);
        }
        return list;
      }
      const emps = await apiService.getMyEmployees();
      const uid = user?.id;
      if (uid && !emps.some((e) => e.id === uid)) {
        return [
          {
            id: uid,
            username: user?.username ?? '',
            fullName: (user?.fullName ?? user?.username ?? uid).trim(),
            isActive: user?.isActive ?? true,
            role: user?.role ?? UserRole.Employee,
          } as User,
          ...emps,
        ];
      }
      return emps;
    },
    enabled:
      isAuthenticated &&
      (user?.role === UserRole.Admin
        ? !!accountsExcelExportAgentId
        : isAgentOrSubAgentOrEmployee),
    staleTime: 60_000,
  });

  const subscriberFetchLimitSelectOptions = SUBSCRIBER_FETCH_LIMIT_PRESETS;

  const subscribersDbSyncMutation = useMutation({
    mutationFn: () => apiService.syncPythonSubscribers(),
    onSuccess: (res) => {
      void clearCachedSubscribers();
      showSuccess('مزامنة المشتركين', formatPythonSyncSuccessMessage(res));
      void queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      void queryClient.invalidateQueries({ queryKey: ['myResellers'] });
    },
    onError: (err: unknown) => showError('مزامنة المشتركين', ApiService.showError(err)),
  });

  const handleSubscribersResellerCardClick = async (resellerId: string) => {
    if (!resellerId || selectedOperationalResellerId === resellerId) return;
    setSelectedOperationalResellerId(resellerId);
    setSelectedResellerId(resellerId);
    if (isPythonBackend()) {
      void clearCachedSubscribers();
      try {
        await apiService.selectApiReseller(resellerId);
      } catch {
        /* يبقى X-Reseller-Id من التخزين */
      }
    }
    void queryClient.invalidateQueries({ queryKey: ['subscribers'] });
    setCurrentPage(1);
  };

  const [showResellerPickerModal, setShowResellerPickerModal] = useState(false);
  const [showAutoSyncResellerPickerModal, setShowAutoSyncResellerPickerModal] = useState(false);
  const defaultFtthReseller = React.useMemo(
    () =>
      myResellers.find(
        (r) =>
          r.serviceType === ServiceType.Ftth ||
          r.serviceType === ServiceType.Zainfi ||
          r.serviceType === ServiceType.Fiberx
      ) ?? null,
    [myResellers]
  );
  const autoSyncReseller = React.useMemo(() => {
    if (myAgent?.serviceType != null) {
      const byAgentType = myResellers.find((r) => r.serviceType === myAgent.serviceType);
      if (byAgentType) return byAgentType;
    }
    return defaultFtthReseller ?? myResellers[0] ?? null;
  }, [myResellers, myAgent?.serviceType, defaultFtthReseller]);
  const hasMixedResellerTypes = React.useMemo(() => {
    const types = new Set((myResellers ?? []).map((r) => r.serviceType));
    return types.size > 1;
  }, [myResellers]);
  const hasZainOrFiberxResellers = React.useMemo(
    () =>
      (myResellers ?? []).some(
        (r) => r.serviceType === ServiceType.Zainfi || r.serviceType === ServiceType.Fiberx
      ),
    [myResellers]
  );

  const resellerNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of myResellers) {
      const name = (r.name ?? '').trim();
      if (r.id && name) map.set(r.id, name);
    }
    return map;
  }, [myResellers]);

  const sortedSubscribers = React.useMemo(() => {
    if (!subscribers.length || !sortColumn) return subscribers;
    // Python backend: الترتيب على كل الصفحات من GET /api/subscribers (sort_by + sortDescending)
    if (isPythonBackend()) return subscribers;
    const colId = sortColumn;
    return [...subscribers].sort((a, b) => {
      const va = getSubscriberSortValue(a, colId, resellerNameById);
      const vb = getSubscriberSortValue(b, colId, resellerNameById);
      return compareSubscriberSortValues(va, vb, sortDescending);
    });
  }, [subscribers, sortColumn, sortDescending, resellerNameById]);

  const handleColumnSort = (columnId: string) => {
    if (sortColumn === columnId) {
      setSortDescending((d) => !d);
    } else {
      setSortColumn(columnId);
      setSortDescending(true);
    }
  };

  const [pendingActivateSubscriberId, setPendingActivateSubscriberId] = useState<string | null>(null);
  const hasWhatsAppSession = !!(myAgent?.whatsAppSessionId?.trim());

  const openAccountsExcelExportModal = () => {
    setExcelExportOmitDates(false);
    const { fromYmd, toYmd } = getBaghdadDefaultExportRangeLast30Days();
    setExcelExportFromYmd(fromYmd);
    setExcelExportToYmd(toYmd);
    setExcelExportResellerId(selectedOperationalResellerId || '');
    setExcelExportExecutorUserId('');
    setExcelExportPackageType('');
    setShowExcelExportModal(true);
  };

  const handleAccountsExcelExport = async () => {
    if (user?.role === UserRole.Admin && !accountsExcelExportAgentId) {
      showError('خطأ', 'تعذر تحديد الوكيل لتصدير التقرير. تأكد من تحميل بيانات الوكيل.');
      return;
    }
    let fromDate: string | undefined;
    let toDate: string | undefined;
    if (!excelExportOmitDates) {
      const f = (excelExportFromYmd || '').trim();
      const t = (excelExportToYmd || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t)) {
        showError('خطأ', 'يرجى اختيار من تاريخ وإلى تاريخ بصيغة صحيحة، أو تفعيل «بدون نطاق تاريخ (افتراضي الخادم)».');
        return;
      }
      const b = getBaghdadRangeBoundsIso(f, t);
      fromDate = b.fromDate;
      toDate = b.toDate;
    }
    setExportingExcel(true);
    try {
      const pkg =
        excelExportPackageType === '1' ||
        excelExportPackageType === '2' ||
        excelExportPackageType === '3'
          ? Number(excelExportPackageType)
          : undefined;
      const { blob, filename } = await apiService.getAccountsExportExcel({
        fromDate,
        toDate,
        agentId: user?.role === UserRole.Admin ? accountsExcelExportAgentId : undefined,
        resellerId: excelExportResellerId || undefined,
        executedByUserId: excelExportExecutorUserId || undefined,
        packageType: pkg,
      });
      const styled = await styleAccountsExportExcelBlob(blob);
      const url = URL.createObjectURL(styled);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showSuccess('تم التحميل', 'تم حفظ ملف Excel بعد تنسيقه.');
      setShowExcelExportModal(false);
    } catch (e) {
      showError('فشل التصدير', ApiService.showError(e));
    } finally {
      setExportingExcel(false);
    }
  };

  useEffect(() => {
    if (!isAgentOrSubAgentOrEmployee || myResellers.length === 0) return;
    const current = (selectedOperationalResellerId || getSelectedResellerId() || '').trim();
    const valid = current && myResellers.some((r) => r.id === current);
    const next = valid ? current : myResellers[0].id;
    if (selectedOperationalResellerId === next) return;
    setSelectedOperationalResellerId(next);
    setSelectedResellerId(next);
    if (isPythonBackend()) {
      void apiService.selectApiReseller(next).catch(() => undefined);
    }
  }, [isAgentOrSubAgentOrEmployee, myResellers, selectedOperationalResellerId]);

  useEffect(() => {
    if (!showAddModal) {
      setShowProfileDropdownAdd(false);
      setProfileSearchInAdd('');
    }
  }, [showAddModal]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showProfileDropdownAdd && profileDropdownAddRef.current && !profileDropdownAddRef.current.contains(e.target as Node)) {
        setShowProfileDropdownAdd(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileDropdownAdd]);

  // Initialize filter from URL parameters (dashboard links override persisted status)
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam) {
      switch (statusParam) {
        case 'active':
          setStatusFilter(SubscriptionStatus.Active);
          break;
        case 'expiring_soon':
          setStatusFilter(SubscriptionStatus.ExpiringSoon);
          break;
        case 'expired':
          setStatusFilter(SubscriptionStatus.Expired);
          break;
        case 'expired_today':
          setStatusFilter(SubscriptionStatus.ExpiredToday);
          break;
        default:
          setStatusFilter('all');
      }
    }
  }, [searchParams]);

  useEffect(() => {
    saveSubscriberListFilters({
      searchTerm,
      debouncedSearchTerm,
      statusFilter: String(statusFilter),
      connectionStatusFilter,
      sortColumn,
      sortDescending,
      maxDaysUntilExpiry,
      appliedMaxDaysUntilExpiry,
      fatFilter,
      zoneFilter,
      appliedFatFilter,
      appliedZoneFilter,
      noteTypeFilter,
      appliedNoteTypeFilter,
      extensionActivationFilter,
      appliedExtensionActivationFilter,
      expirationFromDate,
      expirationToDate,
      appliedExpirationFromDate,
      appliedExpirationToDate,
      currentPage,
    });
  }, [
    searchTerm,
    debouncedSearchTerm,
    statusFilter,
    connectionStatusFilter,
    sortColumn,
    sortDescending,
    maxDaysUntilExpiry,
    appliedMaxDaysUntilExpiry,
    fatFilter,
    zoneFilter,
    appliedFatFilter,
    appliedZoneFilter,
    noteTypeFilter,
    appliedNoteTypeFilter,
    extensionActivationFilter,
    appliedExtensionActivationFilter,
    expirationFromDate,
    expirationToDate,
    appliedExpirationFromDate,
    appliedExpirationToDate,
    currentPage,
  ]);

  const profilesList = React.useMemo(() => {
    const raw = (renewalProfiles ?? []) as Profile[];
    const active = raw.filter((p) => p.isActive);
    const subReseller = (selectedSubscriber?.agentResellerId ?? '').trim();
    if (subReseller) return active.filter((p) => (p.agentResellerId ?? '').trim() === subReseller);
    return active.filter((p) => !(p.agentResellerId ?? '').trim());
  }, [renewalProfiles, selectedSubscriber?.agentResellerId]);
  const renewalInfo = React.useMemo(
    () =>
      selectedSubscriber
        ? {
    subscriberId: selectedSubscriber.id,
    subscriberName: selectedSubscriber.fullName || 'غير محدد',
    subscriberPhone: selectedSubscriber.phoneNumber || 'غير محدد',
    currentProfile: {
              id: selectedSubscriber.profileName || 'غير محدد',
      name: selectedSubscriber.profileName || 'غير محدد',
      price: selectedSubscriber.profilePrice || 0
    },
    expirationDate: selectedSubscriber.expirationDate,
    daysUntilExpiry: selectedSubscriber.daysUntilExpiry || 0,
            availableProfiles: profilesList
          }
        : null,
    [selectedSubscriber, profilesList]
  );
  const daysUntilExpiryText = React.useMemo(() => {
    const raw = selectedSubscriber?.daysUntilExpiryText?.trim();
    if (raw) return raw;
    if ((selectedSubscriber?.daysUntilExpiry || 0) > 0) return `${selectedSubscriber?.daysUntilExpiry} يوم متبقي`;
    return '';
  }, [selectedSubscriber?.daysUntilExpiry, selectedSubscriber?.daysUntilExpiryText]);

  const renewalProfilesForSelect = React.useMemo(() => {
    const list = [...profilesList];
    if ((renewalData.activationMode ?? RenewalActivationMode.Full) !== RenewalActivationMode.OtherDealer) {
      return list;
    }
    return list.sort((a, b) => {
      const ma = profileNameIndicatesOtherDealerKeyword(a.name);
      const mb = profileNameIndicatesOtherDealerKeyword(b.name);
      if (ma !== mb) return ma ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '', 'ar');
    });
  }, [profilesList, renewalData.activationMode]);

  const renewalModalBalanceQueryEnabled =
    isAuthenticated &&
    showRenewalModal &&
    (user?.role !== UserRole.Employee || user?.canAccessAccounts !== false) &&
    (renewalData.activationMode ?? RenewalActivationMode.Full) === RenewalActivationMode.OtherDealer &&
    !!selectedSubscriber;

  const { data: renewalModalBalanceDetail, isLoading: renewalBalanceLoading } = useQuery({
    queryKey: ['balance-detail'],
    queryFn: () => apiService.getBalance(),
    enabled: renewalModalBalanceQueryEnabled,
    staleTime: 30_000,
  });

  const subscriberAgentResellerIdForBalance = (selectedSubscriber?.agentResellerId ?? '').trim();
  const renewalModalResellerRows = renewalModalBalanceDetail?.resellerBalances ?? [];
  const hasRenewalModalResellerRegions = renewalModalResellerRows.length > 0;
  const subscriberRegionBalanceRow = subscriberAgentResellerIdForBalance
    ? renewalModalResellerRows.find((r) => r.id === subscriberAgentResellerIdForBalance)
    : undefined;

  const getRenewalFinalPrice = React.useCallback(
    (data: RenewalData = renewalData): number => {
      const override = Number(data.overrideSalePrice) || 0;
      if (override > 0) return override;
      const profile = renewalInfo?.availableProfiles?.find((p) => p.id === data.newProfileId);
      return profile?.salePrice || 0;
    },
    [renewalData, renewalInfo?.availableProfiles]
  );

  const applyRenewalAmountSync = React.useCallback(
    (
      prev: RenewalData,
      opts: { receivedInFull: boolean; selectedProfileId?: string }
    ): RenewalData => {
      const profile = renewalInfo?.availableProfiles?.find(
        (p) => p.id === (opts.selectedProfileId ?? prev.newProfileId)
      );
      const override = Number(prev.overrideSalePrice) || 0;
      const finalPrice = override > 0 ? override : profile?.salePrice || 0;
      if (opts.receivedInFull) {
        return {
          ...prev,
          amountPaid: finalPrice,
          remainingAmount: 0,
          debtDueDate: '',
        };
      }
      const paid = Number(prev.amountPaid) || 0;
      const remaining = Math.max(0, finalPrice - paid);
      return {
        ...prev,
        remainingAmount: remaining,
        debtDueDate:
          remaining > 0 && !(prev.debtDueDate || '').trim()
            ? new Date().toISOString().split('T')[0]
            : remaining === 0
              ? ''
              : prev.debtDueDate,
      };
    },
    [renewalInfo?.availableProfiles]
  );

  const handleAmountReceivedToggle = (full: boolean) => {
    setAmountReceivedInFull(full);
    setRenewalData((prev) => applyRenewalAmountSync(prev, { receivedInFull: full }));
  };

  useEffect(() => {
    if (renewalInfo && !renewalData.newProfileId) {
      const currentProfile = renewalInfo.availableProfiles?.find(p => p.name === renewalInfo.currentProfile.name);
      if (currentProfile) {
        const salePrice = currentProfile.salePrice || 0;
        setAmountReceivedInFull(true);
        setRenewalData((prev) =>
          applyRenewalAmountSync(
            {
              ...prev,
              newProfileId: currentProfile.id,
              overrideSalePrice: salePrice,
              renewalDate: '',
            },
            { receivedInFull: true, selectedProfileId: currentProfile.id }
          )
        );
      }
    }
  }, [renewalInfo, renewalData.newProfileId, applyRenewalAmountSync]);

  useEffect(() => {
    if (!showRenewalModal) {
      renewalProfileIdForAmountSyncRef.current = '';
    }
  }, [showRenewalModal]);

  useEffect(() => {
    if (!renewalData.newProfileId || !renewalInfo?.availableProfiles) return;
    const selectedProfile = renewalInfo.availableProfiles.find((p) => p.id === renewalData.newProfileId);
    if (!selectedProfile) return;

    const pid = renewalData.newProfileId;
    const profileSelectionChanged = renewalProfileIdForAmountSyncRef.current !== pid;
    if (!profileSelectionChanged) return;
    renewalProfileIdForAmountSyncRef.current = pid;

    const salePrice = selectedProfile.salePrice || 0;
    setAmountReceivedInFull(true);
    setRenewalData((prev) =>
      applyRenewalAmountSync(
        { ...prev, overrideSalePrice: salePrice },
        { receivedInFull: true, selectedProfileId: pid }
      )
    );
  }, [renewalData.newProfileId, renewalInfo?.availableProfiles, applyRenewalAmountSync]);

  const deleteSubscriberMutation = useMutation({
    mutationFn: (id: string) => apiService.deleteSubscriber(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      showSuccess('تم الحذف', 'تم حذف المشترك بنجاح');
    },
    onError: (error: any) => {
      console.error('Error deleting subscriber:', error);
      const errorMessage = ApiService.showError(error);
      showError('خطأ في الحذف', errorMessage);
    }
  });

  type AutoSyncMutationResult =
    | { mode: 'fiProviderDiff'; provider: 'zainfi' | 'fiberx'; payload: ZainfiSubscriberDiffResponse }
    | { mode: 'ftthSas'; payload: CashbackSynchronizationFtthResponse };

  const synchronizationFtthMutation = useMutation({
    mutationFn: async (selectedReseller?: AgentReseller | null): Promise<AutoSyncMutationResult> => {
      const targetReseller = selectedReseller ?? autoSyncReseller;
      if (!targetReseller?.id) {
        throw new Error('لا يوجد رسيلر للمزامنة.');
      }
      const agentId = user?.role === UserRole.Admin ? myAgent?.id : undefined;
      const maxFetch =
        subscriberFetchMaxChoice != null && subscriberFetchMaxChoice > 0 ? subscriberFetchMaxChoice : null;

      if (targetReseller.serviceType === ServiceType.Zainfi) {
        const payload = await apiService.getZainfiSyncDiff({
          resellerId: targetReseller.id,
          maxSubscribersToFetch: maxFetch,
          agentId,
        });
        return { mode: 'fiProviderDiff', provider: 'zainfi', payload };
      }

      if (targetReseller.serviceType === ServiceType.Fiberx) {
        const payload = await apiService.getFiberxSyncDiff({
          resellerId: targetReseller.id,
          maxSubscribersToFetch: maxFetch,
          agentId,
        });
        return { mode: 'fiProviderDiff', provider: 'fiberx', payload };
      }

      if (targetReseller.serviceType === ServiceType.Sas) {
        const res = await apiService.synchronizationSASDiff({
          resellerId: targetReseller.id || undefined,
          agentId,
          onlyDiff: true,
        });
        return { mode: 'ftthSas', payload: filterAutoSyncFtthRowsWithDeviceUsername(res) };
      }

      const res = await apiService.synchronizationFTTHDiff({
        resellerId: targetReseller.id || undefined,
        agentId,
      });
      return { mode: 'ftthSas', payload: filterAutoSyncFtthRowsWithDeviceUsername(res) };
    },
    onSuccess: (wrapped, targetReseller) => {
      if (wrapped.mode === 'fiProviderDiff') {
        if (wrapped.payload.error) {
          const label = wrapped.provider === 'fiberx' ? 'FiberX' : 'Zain Fi²';
          showError(label, wrapped.payload.error);
          return;
        }
        setSyncDiffProvider(wrapped.provider);
        setZainfiDiffResult(wrapped.payload);
        setZainfiSyncDiffResellerId(targetReseller?.id?.trim() || null);
        setAutoSyncFtthResult(null);
        setSavedFtthRowIndices(new Set());
        setActivatedFtthRowIndices(new Set());
        setPendingFtthRenewalRowIndex(null);
        setShowAutoSyncModal(true);
        const n =
          wrapped.payload.differences?.length ??
          wrapped.payload.matchedPairCount ??
          0;
        showSuccess('تحديث بيانات', `تم جلب المقارنة: ${n} سجل باختلاف محتمل.`);
        return;
      }
      setZainfiDiffResult(null);
      setSyncDiffProvider(null);
      setZainfiSyncDiffResellerId(null);
      setAutoSyncFtthResult(wrapped.payload);
      setSavedFtthRowIndices(new Set());
      setActivatedFtthRowIndices(new Set());
      setPendingFtthRenewalRowIndex(null);
      setShowAutoSyncModal(true);
      showSuccess(
        'مزامنة تلقائيا',
        `تم جلب ${wrapped.payload.count ?? wrapped.payload.data?.length ?? 0} سجل بنجاح.`
      );
    },
    onError: (err: unknown) => {
      showError('تحديث بيانات', ApiService.showError(err));
    },
  });

  const applyZainfiExternalExpirationMutation = useMutation({
    mutationFn: async (variables: { subscriberId: string; externalEndDate: string }) => {
      const agentId = user?.role === UserRole.Admin ? myAgent?.id : undefined;
      const resellerTrim = (zainfiSyncDiffResellerId || selectedOperationalResellerId || '').trim();
      const body: ZainfiApplyExternalExpirationRequest = {
        subscriberId: variables.subscriberId,
        externalEndDate: variables.externalEndDate,
      };
      if (resellerTrim) body.resellerId = resellerTrim;
      if (syncDiffProvider === 'fiberx') {
        return apiService.applyFiberxExternalExpiration(body, agentId);
      }
      return apiService.applyZainfiExternalExpiration(body, agentId);
    },
    onMutate: (variables) => {
      setApplyingZainfiExpirationSubscriberId(variables.subscriberId);
    },
    onSuccess: (_updated, variables) => {
      showSuccess(
        'تحديث',
        syncDiffProvider === 'fiberx'
          ? 'تم تطبيق تاريخ انتهاء FiberX على المشترك.'
          : 'تم تطبيق تاريخ انتهاء Zain Fi² على المشترك.'
      );
      queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      const sid = variables?.subscriberId;
      if (sid) {
        setZainfiDiffResult((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            differences: prev.differences.filter((d) => d.subscriberId !== sid),
          };
        });
      }
    },
    onError: (err: unknown) => {
      showError('تحديث', ApiService.showError(err));
    },
    onSettled: () => {
      setApplyingZainfiExpirationSubscriberId(null);
    },
  });

  const handleAutoSyncClick = () => {
    if (synchronizationFtthMutation.isPending) return;
    if ((myResellers?.length ?? 0) > 1 && hasMixedResellerTypes) {
      setShowAutoSyncResellerPickerModal(true);
      return;
    }
    synchronizationFtthMutation.mutate(autoSyncReseller ?? undefined);
  };

  const subscribersDataRefreshing = isPythonBackend()
    ? subscribersDbSyncMutation.isPending
    : synchronizationFtthMutation.isPending;
  const lastSubscribersSyncedAt = subscribersResponse?.lastSyncedAt ?? null;

  const handlePythonOrLegacyDataRefresh = () => {
    if (isPythonBackend()) {
      if (subscribersDbSyncMutation.isPending) return;
      subscribersDbSyncMutation.mutate();
      return;
    }
    handleAutoSyncClick();
  };

  const saveFtthSyncItemMutation = useMutation({
    mutationFn: ({ row, rowIndex }: { row: CashbackSynchronizationFtthRow; rowIndex: number }) =>
      (autoSyncReseller?.serviceType === ServiceType.Sas
        ? apiService.synchronizationSASDiffSave(row, {
            resellerId: autoSyncReseller?.id || undefined,
            agentId: user?.role === UserRole.Admin ? myAgent?.id : undefined,
          })
        : apiService.synchronizationFTTHSave(row, {
            resellerId: autoSyncReseller?.id || undefined,
            agentId: user?.role === UserRole.Admin ? myAgent?.id : undefined,
          })),
    onMutate: (variables) => {
      setSavingFtthRowIndex(variables.rowIndex);
    },
    onSuccess: (res, variables) => {
      setSavedFtthRowIndices((prev) => new Set(prev).add(variables.rowIndex));
      queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      showSuccess('حفظ بدون خصم', res?.message ?? 'تم حفظ المشترك بدون خصم بنجاح.');
    },
    onError: (err: unknown) => {
      showError('حفظ بدون خصم', ApiService.showError(err));
    },
    onSettled: () => {
      setSavingFtthRowIndex(null);
    },
  });
  const saveAllSasSyncItemsMutation = useMutation({
    mutationFn: async () => {
      const rows = autoSyncFtthResult?.data ?? [];
      const resellerId = autoSyncReseller?.id || undefined;
      const agentId = user?.role === UserRole.Admin ? myAgent?.id : undefined;
      const pendingRows = rows
        .map((row, idx) => ({ row, idx }))
        .filter(({ idx }) => !savedFtthRowIndices.has(idx) && !activatedFtthRowIndices.has(idx));
      const settled = await Promise.allSettled(
        pendingRows.map(({ row }) => apiService.synchronizationSASDiffSave(row, { resellerId, agentId }))
      );
      return { settled, pendingRows };
    },
    onMutate: () => {
      setSavingAllSasRows(true);
    },
    onSuccess: ({ settled, pendingRows }) => {
      const succeededIndexes = pendingRows
        .map((item, i) => ({ idx: item.idx, ok: settled[i]?.status === 'fulfilled' }))
        .filter((x) => x.ok)
        .map((x) => x.idx);
      if (succeededIndexes.length > 0) {
        setSavedFtthRowIndices((prev) => {
          const next = new Set(prev);
          succeededIndexes.forEach((i) => next.add(i));
          return next;
        });
        queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      }
      const failedCount = pendingRows.length - succeededIndexes.length;
      if (failedCount === 0) {
        showSuccess('حفظ الكل', `تم حفظ ${succeededIndexes.length} مشترك بنجاح.`);
      } else {
        showError('حفظ الكل', `تم حفظ ${succeededIndexes.length} وفشل ${failedCount}. يمكن إعادة المحاولة للمتبقي.`);
      }
    },
    onError: (err: unknown) => {
      showError('حفظ الكل', ApiService.showError(err));
    },
    onSettled: () => {
      setSavingAllSasRows(false);
    },
  });

  const openRenewalModalForFtthSyncRow = async (row: CashbackSynchronizationFtthRow, rowIndex: number) => {
    if (user?.role === UserRole.Employee && !user?.canActivateSubscriber) {
      showError('تفعيل المشترك', 'لا تملك صلاحية تفعيل المشترك.');
      return;
    }
    const username = (row.deviceUsername ?? row.username ?? '').toString().trim();
    if (!username) {
      showError('تفعيل المشترك', 'لا يمكن التفعيل لأن deviceUsername فارغ. احفظ المشترك أولاً ثم أعد المحاولة.');
      return;
    }
    setOpeningRenewalFtthRowIndex(rowIndex);
    try {
      let subscriberToRenew =
        (subscribers ?? []).find((s) => (s.username ?? '').toString().trim().toLowerCase() === username.toLowerCase()) ?? null;

      if (!subscriberToRenew) {
        const searchRes = await apiService.getSubscribers({ page: 1, pageSize: 20, search: username });
        subscriberToRenew =
          (searchRes.data ?? []).find((s) => (s.username ?? '').toString().trim().toLowerCase() === username.toLowerCase()) ??
          searchRes.data?.[0] ??
          null;
      }

      if (!subscriberToRenew?.id) {
        showError('تفعيل المشترك', 'تعذر العثور على المشترك داخل النظام بهذا اسم المستخدم. نفّذ الحفظ أولاً ثم أعد التفعيل.');
        return;
      }

      setSelectedSubscriberForRenewal(subscriberToRenew);
      setAmountReceivedInFull(true);
      setRenewalData({
        subscriberId: subscriberToRenew.id,
        newProfileId: '',
        paymentStatus: PaymentStatus.Paid,
        overrideSalePrice: 0,
        amountPaid: 0,
        notes: '',
        remainingAmount: 0,
        debtDescription: '',
        debtDueDate: '',
        renewalDate: '',
        activationMode: RenewalActivationMode.Full,
        dealerId: '',
        subscriberNoteType: null,
      });
      setRenewalViaSasTab(false);
      setPendingFtthRenewalRowIndex(rowIndex);
      setShowAutoSyncModal(false);
      setShowRenewalModal(true);
    } catch (err: unknown) {
      showError('تفعيل المشترك', ApiService.showError(err));
    } finally {
      setOpeningRenewalFtthRowIndex(null);
    }
  };

  const createSubscriberMutation = useMutation({
    mutationFn: (subscriberData: SubscriberCreateRequest) => apiService.createSubscriber(subscriberData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      setShowAddModal(false);
      setFormData({
        secruptionId: '',
        username: '',
        password: '',
        firstName: '',
        lastName: '',
        phoneNumber: '',
        noteType: SubscriberNoteType.NoResponse,
        note: '',
        profileId: '',
        activationDate: new Date().toISOString().split('T')[0],
        expirationDate: new Date().toISOString().split('T')[0],
        subscriptionType: SubscriptionType.Paid,
        fat: '',
        zone: '',
        agentResellerId: selectedOperationalResellerId || ''
      });
      showSuccess('تم الإنشاء', 'تم إنشاء المشترك بنجاح');
    },
    onError: (error: any) => {
      console.error('Error creating subscriber:', error);
      const errorMessage = ApiService.showError(error);
      showError('خطأ في الإنشاء', errorMessage);
    }
  });

  const createRenewalMutation = useMutation({
    mutationFn: async (renewalData: RenewalData) => {
      if (!online) {
        await queueOperation('CreateRenewal', buildCreateRenewalPayload(renewalData));
        return { receiptNumber: '(معلق للمزامنة)', subscriberId: renewalData.subscriberId } as any;
      }
      return await apiService.createRenewal(renewalData);
    },
    onSuccess: async (receiptData, renewalData) => {
      const isOfflineQueued = receiptData?.receiptNumber === '(معلق للمزامنة)';
      if (isOfflineQueued) {
        showSuccess('تم الحفظ محلياً', 'سيتم رفع التجديد عند عودة الاتصال');
        await refreshPendingCount();
      }
      console.log('Receipt data received from backend:', receiptData);
      console.log('Receipt number in received data:', receiptData?.receiptNumber);

      queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      queryClient.invalidateQueries({ queryKey: ['renewal-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['subscribers-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['balance-detail'] });
      queryClient.invalidateQueries({ queryKey: ['dealer-debts'], exact: false });
      setShowOtherDealerTopUpModal(false);
      setShowRenewalModal(false);
      setRenewalViaSasTab(false);
      clearSubscriberSelection();

      const normalizedReceipt = {
        ...receiptData,
        subscriberId: receiptData.subscriberId ?? renewalData.subscriberId,
      };

      console.log('Final receipt data to display:', normalizedReceipt);
      console.log('Final receipt number:', normalizedReceipt?.receiptNumber);

      setLastReceipt(normalizedReceipt);
      setShowReceiptModal(true);
      
      setSelectedSubscriberForRenewal(null);
      setShowRenewalModal(false);
      if (pendingFtthRenewalRowIndex != null) {
        setActivatedFtthRowIndices((prev) => new Set(prev).add(pendingFtthRenewalRowIndex));
        setShowAutoSyncModal(true);
        setPendingFtthRenewalRowIndex(null);
      }
      setAmountReceivedInFull(true);
      setRenewalData({
        subscriberId: '',
        newProfileId: '',
        paymentStatus: PaymentStatus.Paid,
        overrideSalePrice: 0,
        amountPaid: 0,
        notes: '',
        remainingAmount: 0,
        debtDescription: '',
        debtDueDate: '',
        renewalDate: '',
        activationMode: RenewalActivationMode.Full,
        dealerId: '',
        subscriberNoteType: null,
      });
    },
    onError: (error: any) => {
      console.error('Error creating renewal:', error);
      const errorMessage = ApiService.showError(error);
      const rawMessage = error?.response?.data?.message ?? error?.originalError?.response?.data?.message ?? '';
      const isInsufficientBalance =
        /رصيد غير كاف|insufficient balance|رصيد الوكيل غير كاف/i.test(errorMessage) ||
        (rawMessage && /insufficient|رصيد غير كاف/i.test(String(rawMessage)));
      if (isInsufficientBalance) {
        showError(
          'لا يمكن تفعيل المشترك',
          'الرصيد غير كافي. يرجى تعبئة الرصيد من صفحة الرصيد (للمنطقة المعنية) ثم المحاولة مرة أخرى.'
        );
      } else {
      showError('خطأ في التجديد', errorMessage);
      }
      if (pendingFtthRenewalRowIndex != null) {
        setShowAutoSyncModal(true);
      }
    }
  });

  const closeRenewalModal = () => {
    setSelectedSubscriberForRenewal(null);
    setShowRenewalModal(false);
    setRenewalViaSasTab(false);
    setShowOtherDealerTopUpModal(false);
    setActivateSelectedPackageKey('');
    setPythonActivateStep(1);
    setActivateModalResellerId('');
    setActivateResellerReady(false);
    activateResellerSelectRef.current = null;
    setActivateEmployeeCode('');
    setShowActivateEmployeeConfirm(false);
    setAmountReceivedInFull(true);
    clearSubscriberSelection();
  };

  const ensureActivateResellerSelected = useCallback((rid: string) => {
    setSelectedResellerId(rid);
    if (activateResellerSelectRef.current) {
      return activateResellerSelectRef.current;
    }
    setActivateResellerReady(false);
    const promise = apiService
      .selectApiReseller(rid)
      .catch(() => undefined)
      .then(() => {
        setActivateResellerReady(true);
      })
      .finally(() => {
        activateResellerSelectRef.current = null;
      });
    activateResellerSelectRef.current = promise;
    return promise;
  }, []);

  const openPythonActivateModal = (subscriber: Subscriber, resellerId?: string) => {
    const rid = resolveSubscriberActivateResellerId(subscriber, {
      explicitResellerId: resellerId,
      operationalResellerId: selectedOperationalResellerId,
    });
    if (!rid) {
      showError(
        'التفعيل',
        'المشترك غير مربوط برسيلر. اختر المنطقة أولاً أو حدّث بيانات المشتركين.'
      );
      return;
    }

    setSelectedSubscriberForRenewal(subscriber);
    setRenewalViaSasTab(false);
    setActivateSelectedPackageKey('');
    setPythonActivateStep(1);
    setActivateModalResellerId(rid);
    setActivateResellerReady(false);
    setAmountReceivedInFull(true);
    setActivateEmployeeCode('');
    setRenewalData((prev) => ({
      ...prev,
      subscriberId: subscriber.id,
      renewalDate: '',
      subscriberNoteType: null,
      remainingAmount: 0,
      debtDueDate: '',
    }));

    setShowRenewalModal(true);
    void ensureActivateResellerSelected(rid);
    void queryClient.invalidateQueries({ queryKey: ['activate-modes', rid] });
    void queryClient.invalidateQueries({ queryKey: ['activate-packages'] });
  };

  const extendDayTargetSubscriber = useMemo(() => {
    if (!isPythonBackend() || selectedIds.length !== 1) return null;
    return subscribers?.find((s) => s.id === selectedIds[0]) ?? null;
  }, [selectedIds, subscribers]);

  const extendDayResellerId = useMemo(() => {
    const sub = extendDayTargetSubscriber;
    if (!sub) return '';
    return resolveSubscriberActivateResellerId(sub, {
      operationalResellerId: selectedOperationalResellerId,
    });
  }, [extendDayTargetSubscriber, selectedOperationalResellerId]);

  const extendDayUsername = useMemo(() => {
    const sub = extendDayTargetSubscriber;
    if (!sub) return '';
    return (sub.username ?? sub.deviceUsername ?? '').trim();
  }, [extendDayTargetSubscriber]);

  const { data: extendDayStatus, isLoading: extendDayStatusLoading } = useQuery({
    queryKey: ['extend-day-status', extendDayResellerId, extendDayUsername],
    queryFn: async () => {
      if (extendDayResellerId) {
        setSelectedResellerId(extendDayResellerId);
        await apiService.selectApiReseller(extendDayResellerId);
      }
      const sub = extendDayTargetSubscriber!;
      const sasId = parseInt(String(sub.id), 10);
      return apiService.getExtendDayStatus({
        username: extendDayUsername,
        sasUserId: Number.isFinite(sasId) ? sasId : undefined,
      });
    },
    enabled:
      isPythonBackend() &&
      !!extendDayTargetSubscriber &&
      !!extendDayUsername &&
      !!extendDayResellerId,
    staleTime: 30_000,
  });

  const extendDayMutation = useMutation({
    mutationFn: async () => {
      if (!extendDayStatus?.can_execute) {
        throw new Error(extendDayStatus?.message_ar ?? 'لا يمكن تنفيذ التمديد');
      }
      if (extendDayResellerId) {
        setSelectedResellerId(extendDayResellerId);
        await apiService.selectApiReseller(extendDayResellerId);
      }
      const sub = extendDayTargetSubscriber!;
      const sasId = parseInt(String(sub.id), 10);
      return apiService.executeExtendDay({
        username: extendDayUsername,
        sasUserId: Number.isFinite(sasId) ? sasId : undefined,
      });
    },
    onSuccess: (res) => {
      showSuccess('تمديد', res.message?.trim() || 'تم تمديد المشترك يوماً واحداً');
      void queryClient.invalidateQueries({ queryKey: ['extend-day-status'] });
      void queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      clearSubscriberSelection();
    },
    onError: (err: unknown) => {
      showError('تمديد', ApiService.showError(err));
    },
  });

  const pythonActivateMutation = useMutation({
    mutationFn: async () => {
      if (pythonActivateResellerId) {
        await ensureActivateResellerSelected(pythonActivateResellerId);
      }
      const username = activateUsername;
      if (!username) throw new Error('اسم المستخدم غير متوفر');
      if (!activateSelectedPackageKey.trim()) throw new Error('اختر الباقة');
      const { profileId, profileName } = parseActivatePackageSelection(
        activateSelectedPackageKey
      );
      const pkg = selectedActivatePackage;
      const packagePrice = pythonPackagePrice!;
      const rawPaid = renewalData.amountPaid;
      const amountPaid =
        rawPaid != null && Number.isFinite(Number(rawPaid))
          ? Math.max(0, Math.min(packagePrice, Number(rawPaid)))
          : packagePrice;
      const latestCard = await apiService.getActivateLatestCard({
        profileId: profileId ?? pkg?.profile_id,
        profileName: profileName ?? pkg?.profile_name,
        series: pkg?.recommended_series ?? undefined,
      });
      if (!latestCard.pin?.trim() || !latestCard.series?.trim()) {
        throw new Error('لا يوجد كود متاح على SAS لهذه الباقة');
      }
      return apiService.activateSubscriber({
        username,
        card_pin: latestCard.pin.trim(),
        series: latestCard.series.trim(),
        profile_id: profileId ?? pkg?.profile_id,
        profile_name: profileName ?? pkg?.profile_name,
        sync_codes: false,
        mock: false,
        package_price: packagePrice,
        amount_paid: amountPaid,
        employee_code: activateEmployeeCode.trim(),
      });
    },
    onSuccess: async (res) => {
      if (!isActivateSuccessResponse(res)) {
        const sasMsg = getActivateSasResponseMessage(res);
        showError(
          'فشل التفعيل',
          res.message?.trim() ||
            (sasMsg ? `رفض SAS: ${sasMsg}` : 'لم يُؤكَّد نجاح التفعيل من SAS')
        );
        return;
      }
      const sub = selectedSubscriberForRenewal;
      const username = (sub?.username ?? activateUsername ?? '').trim();
      const pkg = selectedActivatePackage;
      const price = pythonPackagePrice;
      const paidAmount = renewalData.amountPaid;

      void queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      void queryClient.invalidateQueries({ queryKey: ['cardSeries'] });
      void queryClient.invalidateQueries({ queryKey: ['activations'] });
      void queryClient.invalidateQueries({ queryKey: ['debts'] });
      closeRenewalModal();

      const debtSuffix = formatActivateDebtSuccessSuffix(res, formatNumber);

      if (sub && username) {
        try {
          const receipt = await resolvePythonActivationReceipt(
            username,
            sub,
            pkg,
            price,
            res,
            paidAmount
          );
          setLastReceipt(receipt);
          setShowReceiptModal(true);
          if (debtSuffix) {
            showSuccess('تم التفعيل', `تم التفعيل بنجاح${debtSuffix}`);
          }
          return;
        } catch {
          /* fallback toast below */
        }
      }

      const sasOk = getActivateSasResponseMessage(res);
      showSuccess(
        'تم التفعيل',
        (res.message?.trim() ||
          (sasOk === 'rsp_success' ? 'تم التفعيل بنجاح' : 'تم تفعيل الكارد بنجاح')) + debtSuffix
      );
    },
    onError: (err: unknown) => {
      const msg = formatActivateApiError(err);
      if (isActivateMissingSubscriberError(err)) {
        showError(
          'فشل التفعيل',
          `${msg}\n\nيمكنك مزامنة المشتركين من زر «مزامنة المشتركين» ثم إعادة المحاولة.`
        );
        return;
      }
      showError('فشل التفعيل', msg);
    },
  });

  const pythonActivateBusy = pythonActivateMutation.isPending;

  const otherDealerTopUpMutation = useMutation({
    mutationFn: (body: BalanceTopUpRequest) => apiService.postBalanceTopUp(body),
    onSuccess: (data) => {
      setShowOtherDealerTopUpModal(false);
      setOtherDealerTopUpForm({
        amountIqd: 0,
        recipientName: '',
        companyName: '',
        topUpDate: new Date().toISOString().split('T')[0],
        agentResellerId: '',
      });
      queryClient.invalidateQueries({ queryKey: ['balance-topups'] });
      queryClient.invalidateQueries({ queryKey: ['balance-detail'] });
      queryClient.invalidateQueries({ queryKey: ['myResellers'] });
      queryClient.invalidateQueries({ queryKey: ['subscribers-dashboard'] });
      showSuccess('تمت التعبئة', `الرصيد الإجمالي: ${formatNumber(data.balanceIqd, { suffix: ' د.ع' })}`);
    },
    onError: (err: unknown) => {
      showError('خطأ في التعبئة', ApiService.showError(err));
    },
  });

  const handleOtherDealerTopUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(otherDealerTopUpForm.amountIqd);
    if (!Number.isFinite(amount) || amount <= 0) {
      showError('خطأ', 'يرجى إدخال مبلغ صحيح');
      return;
    }
    if (!otherDealerTopUpForm.recipientName?.trim()) {
      showError('خطأ', 'يرجى إدخال اسم المستلم');
      return;
    }
    if (!otherDealerTopUpForm.companyName?.trim()) {
      showError('خطأ', 'يرجى إدخال الشركة / جهة الرصيد');
      return;
    }
    if (hasRenewalModalResellerRegions && !(otherDealerTopUpForm.agentResellerId ?? '').trim()) {
      showError('خطأ', 'يرجى اختيار المنطقة التي يُضاف إليها الرصيد');
      return;
    }
    otherDealerTopUpMutation.mutate({
      amountIqd: amount,
      recipientName: otherDealerTopUpForm.recipientName.trim(),
      companyName: otherDealerTopUpForm.companyName.trim(),
      topUpDate: otherDealerTopUpForm.topUpDate || undefined,
      agentResellerId: hasRenewalModalResellerRegions
        ? (otherDealerTopUpForm.agentResellerId ?? '').trim()
        : undefined,
    });
  };

  const renewMutation = useMutation({
    mutationFn: (ids: string[]) => apiService.renewSubscribers(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      clearSubscriberSelection();
    },
  });

  const updateSubscriberMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiService.updateSubscriber(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      setShowEditModal(false);
      setSelectedSubscriberForEdit(null);
      clearSubscriberSelection();
    },
  });
  
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setMaxDaysUntilExpiry('');
    setAppliedMaxDaysUntilExpiry('');
    setFatFilter('');
    setZoneFilter('');
    setAppliedFatFilter('');
    setAppliedZoneFilter('');
    setNoteTypeFilter('all');
    setAppliedNoteTypeFilter('all');
    setExtensionActivationFilter(false);
    setAppliedExtensionActivationFilter(false);
    setExpirationFromDate('');
    setExpirationToDate('');
    setAppliedExpirationFromDate('');
    setAppliedExpirationToDate('');
    setConnectionStatusFilter('all');
    setStatusFilter('all');
    setCurrentPage(1);
    clearSubscriberListFilters();
  };

  const handleApplyAdvancedFilter = () => {
    setDebouncedSearchTerm(searchTerm.trim());
    setAppliedMaxDaysUntilExpiry(maxDaysUntilExpiry.trim());
    setAppliedFatFilter(fatFilter.trim());
    setAppliedZoneFilter(zoneFilter.trim());
    setAppliedNoteTypeFilter(noteTypeFilter);
    setAppliedExtensionActivationFilter(extensionActivationFilter);
    if (isPythonBackend()) {
      const day = expirationFromDate.trim();
      setAppliedExpirationFromDate(day);
      setAppliedExpirationToDate('');
      setExpirationToDate('');
    } else {
      setAppliedExpirationFromDate(expirationFromDate.trim());
      setAppliedExpirationToDate(expirationToDate.trim());
    }
    setCurrentPage(1);
  };

  /** تطبيق البحث؛ للموظف بدون صلاحية عرض الكل يلزم إدخال الاسم الأول والثاني (كلمتين على الأقل) */
  const applySearch = () => {
    const term = searchTerm.trim();
    if (sasSearchOnlyMode && term) {
      const parsed = parseSubscriberSearchForPython(term);
      if (parsed.phone) {
        showError(
          'بحث المشتركين',
          'البحث برقم الهاتف غير مسموح — استخدم الاسم الأول والثاني أو اسم المستخدم.'
        );
        return;
      }
    }
    if (requireTwoWordsForSearch && term) {
      const parsed = parseSubscriberSearchForPython(term);
      const nameOnly =
        !!parsed.subscriber_name && !parsed.username && !parsed.phone && parsed.user_id == null;
      if (nameOnly) {
        const words = term.split(/\s+/).filter(Boolean);
        if (words.length < 2) {
          showError('بحث المشتركين', 'يرجى إدخال الاسم الأول والثاني للبحث (كلمتين على الأقل).');
          return;
        }
      }
    }
    setDebouncedSearchTerm(term);
    setCurrentPage(1);
  };

  const hasActiveAdvancedFilter =
    appliedExpirationFromDate !== '' || appliedExpirationToDate !== '' ||
    appliedMaxDaysUntilExpiry !== '' || appliedFatFilter !== '' || appliedZoneFilter !== '' ||
    appliedNoteTypeFilter !== 'all' || appliedExtensionActivationFilter || (debouncedSearchTerm?.trim() ?? '') !== '' || statusFilter !== 'all' || connectionStatusFilter !== 'all';

  useEffect(() => {
    if (showAdvancedFilter) {
      setSearchTerm(debouncedSearchTerm ?? '');
      setFatFilter(appliedFatFilter);
      setZoneFilter(appliedZoneFilter);
      setNoteTypeFilter(appliedNoteTypeFilter);
      setExtensionActivationFilter(appliedExtensionActivationFilter);
      setMaxDaysUntilExpiry(appliedMaxDaysUntilExpiry);
      setExpirationFromDate(appliedExpirationFromDate?.split('T')[0] ?? '');
      if (!isPythonBackend()) {
        setExpirationToDate(appliedExpirationToDate?.split('T')[0] ?? '');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdvancedFilter]);

  const getStatusBadge = (subscriber: Subscriber) => {
    const days =
      subscriber.daysUntilExpiry ??
      (subscriber.expirationDate ? daysUntilExpiration(subscriber.expirationDate) : 0);
    const apiStatusLabel = subscriber.daysUntilExpiryText?.trim();

    if (subscriber.expirationDate || isPythonBackend()) {
      return (
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${statusBadgeClassFromDays(days)}`}
        >
          {apiStatusLabel || statusLabelFromDaysRemaining(days)}
        </span>
      );
    }

    const statusConfig: Record<SubscriptionStatus, { text: string; class: string }> = {
      [SubscriptionStatus.Active]: {
        text: 'فعال',
        class: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
      },
      [SubscriptionStatus.ExpiringSoon]: {
        text: 'سينتهي قريباً',
        class: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
      },
      [SubscriptionStatus.Expired]: {
        text: 'منتهي',
        class: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
      },
      [SubscriptionStatus.ExpiredToday]: {
        text: 'ينتهي اليوم',
        class: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
      },
    };
    const backendStatus = subscriber.status as SubscriptionStatus | undefined;
    const config =
      backendStatus && statusConfig[backendStatus]
        ? statusConfig[backendStatus]
        : statusConfig[SubscriptionStatus.Active];
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.class}`}>
        {config.text}
      </span>
    );
  };

  const renderSubscriberTableCell = (subscriber: Subscriber, columnId: string) => {
    const cellBase = `px-2 sm:px-4 lg:px-6 py-2 sm:py-4 ${col(columnId)}`;

    switch (columnId) {
      case 'secruptionId':
        return (
          <td key={columnId} className={`${cellBase} whitespace-nowrap`}>
            <div className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white font-mono">
              {subscriber.id || subscriber.secruptionId || '—'}
            </div>
          </td>
        );
      case 'subscriber':
        return (
          <td key={columnId} className={`${cellBase} whitespace-nowrap`}>
            <div className="flex items-center">
              <div className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10">
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                  <span className="text-primary-600 dark:text-primary-400 text-xs sm:text-sm font-semibold">
                    {subscriber.firstName.charAt(0)}
                  </span>
                </div>
              </div>
              <div className="mr-2 sm:mr-4">
                <div className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
                  {subscriber.fullName}
                </div>
              </div>
            </div>
          </td>
        );
      case 'username':
        return (
          <td key={columnId} className={`${cellBase} whitespace-nowrap text-xs sm:text-sm text-gray-900 dark:text-white`}>
            {subscriber.username}
          </td>
        );
      case 'subscriberRegion': {
        const region = getSubscriberRegion(subscriber);
        return (
          <td key={columnId} className={`${cellBase} whitespace-nowrap`}>
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold border ${region.badgeClass}`}>
              {region.name}
            </span>
          </td>
        );
      }
      case 'phoneNumber':
        return (
          <td key={columnId} className={`${cellBase} whitespace-nowrap text-xs sm:text-sm text-gray-900 dark:text-white`}>
            <span className="flex items-center">
              <Phone className="h-3 w-3 mr-1 text-gray-400 flex-shrink-0" />
              {subscriber.phoneNumber}
            </span>
          </td>
        );
      case 'zone':
        return (
          <td key={columnId} className={`${cellBase} whitespace-nowrap text-xs sm:text-sm text-gray-900 dark:text-white`}>
            {subscriber.zone ?? '—'}
          </td>
        );
      case 'noteType':
        return (
          <td key={columnId} className={`${cellBase} whitespace-nowrap text-xs sm:text-sm text-gray-900 dark:text-white`}>
            {getSubscriberNoteTypeBadge(subscriber.noteType, subscriber.note ?? null)}
          </td>
        );
      case 'note': {
        const localNote = getSubscriberLocalNote(subscriber);
        return (
          <td key={columnId} className={`${cellBase} text-xs sm:text-sm text-gray-900 dark:text-white`}>
            <div className="max-w-[180px] sm:max-w-[240px] truncate" title={localNote}>
              {localNote || '—'}
            </div>
          </td>
        );
      }
      case 'profile':
        return (
          <td key={columnId} className={`${cellBase} whitespace-nowrap text-xs sm:text-sm text-gray-900 dark:text-white`}>
            {subscriber.profileName}
          </td>
        );
      case 'paymentMethod':
        return (
          <td key={columnId} className={`${cellBase} whitespace-nowrap text-xs sm:text-sm text-gray-900 dark:text-white`}>
            {formatPaymentMethodLabel(subscriber.paymentMethod)}
          </td>
        );
      case 'activationDate':
        return (
          <td key={columnId} className={`${cellBase} whitespace-nowrap text-xs sm:text-sm text-gray-900 dark:text-white`}>
            {formatDate(subscriber.activationDate, { year: 'numeric', month: 'numeric', day: 'numeric' })}
          </td>
        );
      case 'expirationDate':
        return (
          <td key={columnId} className={`${cellBase} whitespace-nowrap text-xs sm:text-sm text-gray-900 dark:text-white`}>
            {subscriber.expirationDate
              ? formatDate(subscriber.expirationDate, { year: 'numeric', month: 'numeric', day: 'numeric' })
              : 'غير محدد'}
          </td>
        );
      case 'daysRemaining': {
        const days =
          subscriber.daysUntilExpiry ??
          subscriberDaysRemaining(subscriber.activationDate, subscriber.expirationDate);
        const period =
          subscriber.activationDate && subscriber.expirationDate
            ? calendarDaysBetween(subscriber.activationDate, subscriber.expirationDate)
            : null;
        const title =
          period != null && period >= 0
            ? `مدة الاشتراك: ${period} يوم (من التفعيل إلى الانتهاء)`
            : undefined;
        return (
          <td key={columnId} className={`${cellBase} whitespace-nowrap text-xs sm:text-sm`}>
            <span className={daysRemainingTextClass(days)} title={title}>
              {formatDaysRemainingColumn(days)}
            </span>
          </td>
        );
      }
      case 'status':
        return (
          <td key={columnId} className={`${cellBase} whitespace-nowrap`}>
            {getStatusBadge(subscriber)}
          </td>
        );
      case 'hasDebt':
        return (
          <td key={columnId} className={`${cellBase} whitespace-nowrap text-xs sm:text-sm`}>
            {subscriber.hasDebt === true ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 border border-red-200 dark:border-red-800">
                نعم
              </span>
            ) : subscriber.hasDebt === false ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800">
                لا
              </span>
            ) : (
              '—'
            )}
          </td>
        );
      default:
        return null;
    }
  };

  const _handleDelete = async (id: string) => {
    const confirmed = await confirmDelete('مشترك');
    if (confirmed) {
      deleteSubscriberMutation.mutate(id);
    }
  };
  void _handleDelete;

  const validateSubscriberData = (data: any): string | null => {
    if (!data.username || !data.password || !data.firstName || !data.lastName || !data.phoneNumber || !data.profileId) {
      return 'يرجى ملء جميع الحقول المطلوبة';
    }
    const secruptionId = (data.secruptionId ?? '').toString().trim();
    if (!secruptionId) {
      return 'معرف الاشتراك مطلوب';
    }
    if (secruptionId.length > 100) {
      return 'معرف الاشتراك يجب أن يكون أقل من 100 حرف';
    }
    if (data.username.length < 3) {
      return 'اسم المستخدم يجب أن يكون على الأقل 3 أحرف';
    }
    if (data.username.length > 100) {
      return 'اسم المستخدم يجب أن يكون أقل من 100 حرف';
    }
    if (data.password.length < 4) {
      return 'كلمة المرور يجب أن تكون على الأقل 4 أحرف';
    }
    if (data.firstName.length > 100) {
      return 'الاسم الأول يجب أن يكون أقل من 100 حرف';
    }
    if (data.lastName.length > 100) {
      return 'الاسم الأخير يجب أن يكون أقل من 100 حرف';
    }
    if (data.phoneNumber.length < 10) {
      return 'رقم الهاتف يجب أن يكون على الأقل 10 أرقام';
    }
    if (data.phoneNumber.length > 20) {
      return 'رقم الهاتف يجب أن يكون أقل من 20 رقم';
    }
    if (data.wifiCode && data.wifiCode.length > 100) {
      return 'كود الواي فاي يجب أن يكون أقل من 100 حرف';
    }
    if (data.note && data.note.length > 1000) {
      return 'الملاحظة يجب أن تكون أقل من 1000 حرف';
    }
    if (data.noteType === SubscriberNoteType.Other) {
      const noteText = (data.note ?? '').toString().trim();
      if (!noteText) {
        return 'يرجى كتابة نص الملاحظة عند اختيار "أخرى"';
      }
    }
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const rid = (selectedOperationalResellerId ?? '').trim();
    if (myResellers.length > 0 && !rid) {
      showError('المنطقة مطلوبة', 'يجب تحديد المنطقة/الرسيلر (agentResellerId). اختر المنطقة من القائمة أعلاه.');
      return;
    }
    if (myResellers.length > 0 && !profilesForCreate.some((p) => p.id === formData.profileId)) {
      showError(
        'الباقة',
        'اختر باقة مربوطة بنفس المنطقة المحددة (الباقات العامة بدون رسيلر لم تعد مدعومة).'
      );
      return;
    }

    const validationError = validateSubscriberData(formData);
    if (validationError) {
      showError('خطأ في التحقق', validationError);
      return;
    }

    const noteType = formData.noteType ?? null;
    const noteText = (formData.note ?? '').toString().trim();
    const payload: SubscriberCreateRequest = {
      ...formData,
      secruptionId: (formData.secruptionId ?? '').trim(),
      noteType,
      note: noteType === SubscriberNoteType.Other ? (noteText || undefined) : undefined,
      agentResellerId: rid,
    };
    createSubscriberMutation.mutate(payload);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      if (name === 'noteType') {
        const nextNoteType =
          value === '' ? null : (parseInt(value, 10) as SubscriberNoteType);
        return {
      ...prev,
          noteType: nextNoteType,
          note: nextNoteType === SubscriberNoteType.Other ? prev.note : '',
        };
      }
      return {
        ...prev,
        [name]: value,
      } as any;
    });
  };

  const handleRenewalInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;

    if (name === 'activationMode') {
      const m = Number(value) as RenewalActivationMode;
      setRenewalData((prev) => ({
        ...prev,
        activationMode: m,
        dealerId: m === RenewalActivationMode.Full ? '' : prev.dealerId,
      }));
      return;
    }

    if (name.startsWith('wiFiQRCode.')) {
      const field = name.split('.')[1];
      setRenewalData(prev => ({
        ...prev,
        wiFiQRCode: {
          ...prev.wiFiQRCode!,
          [field]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
        }
      }));
    } else {
      const newValue = type === 'number' ? Number(value) : value;
      
      setRenewalData(prev => {
        const updated = {
          ...prev,
          [name]: newValue
        };

        if (name === 'newProfileId') {
          const rawId = String(newValue ?? '');
          renewalProfileIdForAmountSyncRef.current = rawId;
          if (!rawId) {
            updated.overrideSalePrice = 0;
            updated.amountPaid = 0;
            updated.remainingAmount = 0;
            updated.debtDueDate = '';
            updated.renewalDate = '';
            updated.activationMode = RenewalActivationMode.Full;
            updated.dealerId = '';
            updated.subscriberNoteType = null;
            return updated;
          }
          const sp = renewalInfo?.availableProfiles?.find((p) => p.id === rawId);
          const salePrice = sp?.salePrice || 0;
          updated.overrideSalePrice = salePrice;
          return applyRenewalAmountSync(updated, {
            receivedInFull: true,
            selectedProfileId: rawId,
          });
        }

        if (name === 'amountPaid' || name === 'overrideSalePrice') {
          return applyRenewalAmountSync(updated, { receivedInFull: amountReceivedInFull });
        }

        return updated;
      });
      if (name === 'newProfileId') {
        setAmountReceivedInFull(true);
      }
    }
  };

  const handlePythonActivateSubmit = async () => {
    if (pythonActivateBusy) return;
    if (!pythonActivateResellerId) {
      showError('الرسيلر', 'المشترك غير مربوط برسيلر — لا يمكن التفعيل.');
      return;
    }
    if (!activateUsername) {
      showError('المشترك', 'اسم المستخدم غير متوفر لهذا المشترك.');
      return;
    }
    if (!activateSelectedPackageKey.trim()) {
      showError('الباقة', 'اختر باقة من القائمة.');
      return;
    }
    if (!selectedPackageActivatable) {
      showError('الباقة', 'لا يوجد مخزون متاح لهذه الباقة.');
      return;
    }
    if (pythonPackagePrice == null) {
      showError('الباقة', 'لا يوجد سعر معرّف لهذه الباقة.');
      return;
    }

    const subId = String(
      selectedSubscriberForRenewal?.id ?? selectedSubscriberForRenewal?.secruptionId ?? ''
    ).trim();
    let hasDebt = selectedSubscriberForRenewal?.hasDebt === true;
    if (!hasDebt && subId) {
      try {
        const check = await apiService.getSubscriberHasDebt(subId);
        hasDebt = check.hasDebt;
      } catch {
        /* إن فشل التحقق نتابع بدون تنبيه */
      }
    }
    if (hasDebt) {
      setShowActivateDebtConfirm(true);
      return;
    }

    setActivateEmployeeCode('');
    setShowActivateEmployeeConfirm(true);
  };

  const proceedToActivateEmployeeConfirm = () => {
    setShowActivateDebtConfirm(false);
    setActivateEmployeeCode('');
    setShowActivateEmployeeConfirm(true);
  };

  const confirmPythonActivateWithEmployeeCode = () => {
    if (pythonActivateBusy) return;
    if (!/^\d{4}$/.test(activateEmployeeCode.trim())) {
      showError('رمز الموظف', 'أدخل رمز الموظف — 4 أرقام');
      return;
    }
    pythonActivateMutation.mutate();
  };

  const handleRenewalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isPythonBackend()) {
      await handlePythonActivateSubmit();
      return;
    }

    const selectedProfile = renewalInfo?.availableProfiles?.find(p => p.id === renewalData.newProfileId);
    const remaining = renewalData.remainingAmount || 0;
    const mode = renewalData.activationMode ?? RenewalActivationMode.Full;

    if (mode === RenewalActivationMode.OtherDealer && !(renewalData.dealerId || '').trim()) {
      showError('خطأ', 'اختر الوكيل (التاجر) عند تفعيل «لوكيل آخر».');
      return;
    }

    if (!(renewalData.newProfileId || '').trim()) {
      showError('الباقة', 'اختر الباقة الجديدة.');
      return;
    }

    if (remaining > 0) {
      const due = (renewalData.debtDueDate || '').toString().trim();
      if (!due) {
        showError('خطأ', 'يرجى اختيار تاريخ الاستحقاق / تسديد الدين عند وجود مبلغ متبقي.');
        return;
      }
    }

    const renewalDateRaw = (renewalData.renewalDate ?? '').toString().trim();
    const renewalDateNorm = renewalDateRaw
      ? renewalDateRaw.length > 10
        ? renewalDateRaw.split('T')[0]
        : renewalDateRaw
      : '';
    if (renewalDateNorm) {
      const todayBaghdad = getBaghdadTodayYmd();
      if (renewalDateNorm > todayBaghdad) {
        showError('خطأ', 'تاريخ التجديد لا يمكن أن يكون بعد اليوم.');
        return;
      }
    }

    const enhancedRenewalData = {
      ...renewalData,
      paymentStatus: remaining > 0 ? PaymentStatus.Unpaid : PaymentStatus.Paid,
      overrideSalePrice: renewalData.overrideSalePrice ?? 0,
      amountPaid: renewalData.amountPaid ?? 0,
      remainingAmount: remaining,
      debtDescription:
        remaining > 0
          ? `متبقي: ${formatNumber(remaining, { suffix: ' د.ع' })}`
          : '',
      debtDueDate: renewalData.debtDueDate ?? '',
      renewalDate: renewalDateNorm,
      currentExpirationDate: renewalInfo?.expirationDate,
      renewalPeriod: selectedProfile?.renewalPeriod || 30
    };

    // تم تعليق التفعيل عبر سكربت البايثون مؤقتاً.
    createRenewalMutation.mutate(enhancedRenewalData);
  };

  const handlePrintReceipt = async (receipt: any) => {
    const agentIdForTemplate =
      subscribers?.find((s) => s.id === receipt.subscriberId)?.agentId?.trim() ||
      (user?.role === UserRole.Admin ? myAgent?.id : undefined) ||
      myAgent?.id;

    const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';

    let settings: ActivationInvoicePrintSettingsDto = {};
    try {
      settings = await apiService.getActivationInvoicePrintSettings(agentIdForTemplate || undefined);
    } catch {
      settings = {};
    }

    const sub = subscribers?.find((s) => s.id === receipt.subscriberId);
    const linkedReseller =
      myResellers.find((r) => r.id === (sub?.agentResellerId ?? '').trim()) ??
      myResellers.find((r) => r.id === selectedOperationalResellerId);
    const printPayload = enrichActivationPrintPayload(
      renewalLikeToActivationPrintPayload(receipt as Record<string, unknown>),
      {
        username: sub?.username,
        deviceUsername: sub?.deviceUsername,
        paymentMethod: sub?.paymentMethod,
        serviceType: linkedReseller?.serviceType ?? myAgent?.serviceType,
        resellerName: sub?.agentResellerName ?? linkedReseller?.name,
        agentCompanyName: sub?.agentCompanyName ?? myAgent?.companyName ?? receipt.agentCompanyName,
      }
    );

    const embeddedImages = await embedActivationReceiptStaticImages(appOrigin);

    const printContent = buildActivationReceiptPrintHtml(settings, printPayload, {
      formatDate,
      locale,
      appOrigin,
      embeddedImages,
      fallbackOrganizerName: resolveCurrentUserOrganizerDisplayName(user),
    });

    try {
      await openActivationReceiptPrintWindow(printContent);
    } catch {
      alert('تعذّر فتح نافذة الطباعة. حدّث الصفحة ثم أعد المحاولة.');
    }
  };

  const handlePostActivationSaveAndPrint = async () => {
    if (!lastReceipt) return;
    setShowReceiptModal(false);
    await handlePrintReceipt(lastReceipt);
  };

  const getWhatsAppReminderErrorMessage = (err: any): string => {
    const msg = ApiService.showError(err);
    if (/قالب|قالب لرسالة|رسالة واحدة على الأقل/.test(msg)) {
      return msg + '\n\nلإعداد قوالب الرسائل: الإعدادات ← رسالة التفعيل، رسالة تنبيه الاشتراك، رسالة الدين او التفاصيل.';
    }
    return msg;
  };

  /** فشل GET /Agents/me يمنع إرسال واتساب قبل أي طلب لإرسال الرسالة — لذلك قد لا يظهر طلب جديد في Network عند الضغط. */
  const showMyAgentFetchFailed = (title: string) => {
    const detail = myAgentError ? getWhatsAppReminderErrorMessage(myAgentError) : '';
    showError(
      title,
      `تعذّر جلب بيانات الوكيل من الخادم (طلب /Agents/me). ${detail ? `${detail} ` : ''}افتح Network وابحث عن «Agents/me» عند تحميل الصفحة، أو حدّث الصفحة ثم أعد المحاولة.`
    );
  };

  const sendWhatsAppToSelected = async (
    title: string,
    sender: (subscriberId: string) => Promise<void>
  ) => {
    if (!subscribers || selectedIds.length === 0 || !hasWhatsAppSession) return;
    const withPhone = selectedIds
      .map(id => subscribers.find(s => s.id === id))
      .filter((s): s is Subscriber => !!s && !!(s.phoneNumber?.trim()));
    if (withPhone.length === 0) {
      showError(title, 'لا يوجد لدى المشتركين المحددين رقم هاتف.');
      return;
    }

    setSendReminderLoading(true);
    showInfo(title, `جاري الإرسال إلى ${withPhone.length} مشترك...`);
    let successCount = 0;
    let lastError: string | null = null;

    for (const sub of withPhone) {
      const displayName =
        (sub.fullName || '').trim() ||
        `${sub.firstName || ''} ${sub.lastName || ''}`.trim() ||
        sub.username;
      try {
        showInfo(title, `جاري الإرسال إلى ${displayName}...`);
        await sender(sub.id);
        successCount++;
        showSuccess(title, `تم الإرسال إلى ${displayName}.`);
      } catch (err: any) {
        lastError = getWhatsAppReminderErrorMessage(err);
        showError(title, `فشل الإرسال إلى ${displayName}: ${lastError}`);
      }
    }

    setShowActionsDropdown(false);
    setSendReminderLoading(false);
    clearSubscriberSelection();
    if (successCount > 0) {
      showSuccess(
        title,
        (successCount === withPhone.length
          ? 'تم الإرسال بنجاح.'
          : `تم الإرسال لـ ${successCount} من ${withPhone.length}. ${lastError ? `آخر خطأ: ${lastError}` : ''}`) +
          ' تحقق من وصولها في واتساب؛ إن لم تصل فراجع سجلات الباكند وجلسة واتساب المربوطة.'
      );
    }
    if (lastError && successCount === 0) {
      showError(title, lastError);
    }
  };

  const handleSendWhatsApp = async (receipt: any) => {
    if (myAgentLoading) {
      showInfo('إرسال واتساب', 'جاري التحقق من جلسة واتساب...');
      return;
    }
    if (myAgentError) {
      showMyAgentFetchFailed('إرسال واتساب');
      return;
    }
    if (!hasWhatsAppSession) {
      showError('إرسال واتساب', 'لم يتم حفظ معرف جلسة واتساب في Wakeel. افتح الإعدادات ← ربط واتساب ← ثم اضغط «حفظ معرف الجلسة في Wakeel».');
      return;
    }
    const subscriberId = receipt.subscriberId;
    if (!subscriberId) {
      showError('إرسال واتساب', 'معرف المشترك غير متوفر.');
      return;
    }
    try {
      try {
        const normalizeActivationTemplateForBackend = (template: string): string => {
          let out = String(template || '');
          out = out.replace(/\{\{\s*subscriberName\s*\}\}/gi, '{{SubscriberName}}');
          out = out.replace(/\{\{\s*subscriberPhone\s*\}\}/gi, '{{SubscriberPhone}}');
          out = out.replace(/\{\{\s*phoneNumber\s*\}\}/gi, '{{PhoneNumber}}');
          out = out.replace(/\{\{\s*activationDate\s*\}\}/gi, '{{ActivationDate}}');
          out = out.replace(/\{\{\s*expirationDate\s*\}\}/gi, '{{ExpirationDate}}');
          out = out.replace(/\{\{\s*daysUntilExpiry\s*\}\}/gi, '{{DaysUntilExpiry}}');
          out = out.replace(/\{\{\s*profileName\s*\}\}/gi, '{{ProfileName}}');
          out = out.replace(/\{\{\s*companyName\s*\}\}/gi, '{{AgentCompanyName}}');
          out = out.replace(/\{\{\s*agentCompanyName\s*\}\}/gi, '{{AgentCompanyName}}');
          out = out.replace(/\{\{\s*CompanyName\s*\}\}/g, '{{AgentCompanyName}}');
          out = out.replace(/\{\{\s*debtDueDate\s*\}\}/gi, '{{DebtDueDate}}');
          out = out.replace(/\{\{\s*debtAmount\s*\}\}/gi, '{{DebtAmount}}');
          return out;
        };

        const isBarePlaceholdersTemplate = (template: string): boolean => {
          const t = String(template || '');
          const withoutTokens = t.replace(/\{\{\s*[A-Za-z]+\s*\}\}/g, '');
          const withoutNoise = withoutTokens.replace(/[\s\r\n\t\-—–_,.،؛:|/\\]+/g, '');
          return withoutNoise.length === 0;
        };

        const current = await apiService.getActivationMessage();
        const currentTpl = (current?.template || '').trim();
        if (!currentTpl) {
          await apiService.setActivationMessage(DEFAULT_ACTIVATION_TEMPLATE);
        } else if (isBarePlaceholdersTemplate(currentTpl)) {
          await apiService.setActivationMessage(DEFAULT_ACTIVATION_TEMPLATE);
        } else if (/\{\{\s*subscriber(Name|Phone)\s*\}\}|\{\{\s*activationDate\s*\}\}|\{\{\s*expirationDate\s*\}\}|\{\{\s*companyName\s*\}\}/i.test(currentTpl)) {
          await apiService.setActivationMessage(normalizeActivationTemplateForBackend(currentTpl));
        }
      } catch {
        // ignore template fix errors
      }
      await apiService.sendWhatsAppActivation(subscriberId);
      showSuccess('إرسال واتساب', 'تم إرسال رسالة التفعيل/التجديد بنجاح. تحقق من وصولها في واتساب المشترك؛ إن لم تصل فراجع سجلات الباكند وجلسة واتساب المربوطة.');
    } catch (err: any) {
      showError('إرسال واتساب', getWhatsAppReminderErrorMessage(err));
    }
  };

  const handlePostActivationSaveAndWhatsApp = async () => {
    if (!lastReceipt) return;
    setShowReceiptModal(false);
    await handleSendWhatsApp(lastReceipt);
  };

  const handleSendSubscriberDetails = async (subscriber: Subscriber) => {
    if (myAgentLoading) {
      showInfo('إرسال دين او التفاصيل', 'جاري التحقق من جلسة واتساب...');
      return;
    }
    if (myAgentError) {
      showMyAgentFetchFailed('إرسال دين او التفاصيل');
      return;
    }
    if (!hasWhatsAppSession) {
      showError('إرسال دين او التفاصيل', 'لم يتم حفظ معرف جلسة واتساب في Wakeel. افتح الإعدادات ← ربط واتساب ← ثم اضغط «حفظ معرف الجلسة في Wakeel».');
      return;
    }
    if (!subscriber.phoneNumber?.trim()) {
      showError('إرسال دين او التفاصيل', 'رقم هاتف المشترك غير معرّف.');
      return;
    }
    try {
      await apiService.sendWhatsAppDetails(subscriber.id);
      showSuccess('إرسال تفاصيل المشترك', 'تم إرسال رسالة الدين او التفاصيل بنجاح. تحقق من وصولها في واتساب المشترك؛ إن لم تصل فراجع سجلات الباكند وجلسة واتساب المربوطة.');
      clearSubscriberSelection();
    } catch (err: any) {
      const msg = ApiService.showError(err);
      if (/لا يوجد قالب لرسالة تفاصيل المشترك/.test(msg)) {
        try {
          showInfo('إرسال دين او التفاصيل', 'لا يوجد قالب تفاصيل. سيتم إنشاء القالب الافتراضي تلقائياً ثم إعادة الإرسال...');
          await apiService.setDetailsMessage(DEFAULT_DETAILS_TEMPLATE);
          await apiService.sendWhatsAppDetails(subscriber.id);
          showSuccess('إرسال تفاصيل المشترك', 'تم إنشاء القالب الافتراضي وإرسال رسالة الدين او التفاصيل بنجاح.');
          clearSubscriberSelection();
          return;
        } catch (e: any) {
          showError('إرسال تفاصيل المشترك', getWhatsAppReminderErrorMessage(e));
          return;
        }
      }
      showError('إرسال تفاصيل المشترك', getWhatsAppReminderErrorMessage(err));
    }
  };

  const handleSendSubscriberDetailsById = async (subscriberId: string) => {
    if (myAgentLoading) {
      showInfo('إرسال دين او التفاصيل', 'جاري التحقق من جلسة واتساب...');
      return;
    }
    if (myAgentError) {
      showMyAgentFetchFailed('إرسال دين او التفاصيل');
      return;
    }
    if (!hasWhatsAppSession) {
      showError('إرسال دين او التفاصيل', 'لم يتم حفظ معرف جلسة واتساب في Wakeel. افتح الإعدادات ← ربط واتساب ← ثم اضغط «حفظ معرف الجلسة في Wakeel».');
      return;
    }
    try {
      await apiService.sendWhatsAppDetails(subscriberId);
      showSuccess('إرسال تفاصيل المشترك', 'تم إرسال رسالة الدين او التفاصيل بنجاح. تحقق من وصولها في واتساب المشترك؛ إن لم تصل فراجع سجلات الباكند وجلسة واتساب المربوطة.');
    } catch (err: any) {
      const msg = ApiService.showError(err);
      if (/لا يوجد قالب لرسالة تفاصيل المشترك/.test(msg)) {
        try {
          showInfo('إرسال دين او التفاصيل', 'لا يوجد قالب تفاصيل. سيتم إنشاء القالب الافتراضي تلقائياً ثم إعادة الإرسال...');
          await apiService.setDetailsMessage(DEFAULT_DETAILS_TEMPLATE);
          await apiService.sendWhatsAppDetails(subscriberId);
          showSuccess('إرسال تفاصيل المشترك', 'تم إنشاء القالب الافتراضي وإرسال رسالة الدين او التفاصيل بنجاح.');
          return;
        } catch (e: any) {
          showError('إرسال تفاصيل المشترك', getWhatsAppReminderErrorMessage(e));
          return;
        }
      }
      showError('إرسال تفاصيل المشترك', getWhatsAppReminderErrorMessage(err));
    }
  };

  const handleSendAlertMessage = async () => {
    if (!subscribers || selectedIds.length === 0) return;
    if (myAgentLoading) {
      showInfo('رسالة تنبيه الاشتراك', 'جاري التحقق من جلسة واتساب...');
      setShowActionsDropdown(false);
      return;
    }
    if (myAgentError) {
      showMyAgentFetchFailed('رسالة تنبيه الاشتراك');
      setShowActionsDropdown(false);
      return;
    }
    if (!hasWhatsAppSession) {
      showError('رسالة تنبيه الاشتراك', 'لم يتم حفظ معرف جلسة واتساب في Wakeel. افتح الإعدادات ← ربط واتساب ← ثم اضغط «حفظ معرف الجلسة في Wakeel».');
      setShowActionsDropdown(false);
      return;
    }
    await sendWhatsAppToSelected('رسالة تنبيه الاشتراك', (id) => apiService.sendWhatsAppAlert(id));
  };

  const handleSendCustomMessage = async (subscriber: Subscriber) => {
    if (myAgentLoading) {
      showInfo('إرسال رسالة حر', 'جاري التحقق من جلسة واتساب...');
      return;
    }
    if (myAgentError) {
      showMyAgentFetchFailed('إرسال رسالة حر');
      return;
    }
    if (!hasWhatsAppSession) {
      showError('إرسال رسالة حر', 'لم يتم حفظ معرف جلسة واتساب في Wakeel. افتح الإعدادات ← ربط واتساب ← ثم اضغط «حفظ معرف الجلسة في Wakeel».');
      return;
    }
    if (!subscriber.phoneNumber?.trim()) {
      showError('إرسال رسالة حر', 'رقم هاتف المشترك غير معرّف.');
      return;
    }
    try {
      await apiService.sendWhatsAppCustomMessage(subscriber.id);
      showSuccess('إرسال رسالة حر', 'تم إرسال قالب رسالة خاصة بنجاح. تحقق من وصولها في واتساب المشترك.');
      clearSubscriberSelection();
    } catch (err: any) {
      showError('إرسال رسالة حر', ApiService.showError(err));
    }
  };

  const toggleSelectAll = () => {
    if (!subscribers) return;
    if (selectedIds.length === subscribers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(subscribers.map(s => s.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleBulkRenew = () => {
    if (user?.role === UserRole.Employee && !user?.canActivateSubscriber) {
      showError('تفعيل المشترك', 'لا تملك صلاحية تفعيل المشترك.');
      return;
    }
    if (selectedIds.length === 0) return;
    if (selectedIds.length === 1) {
      if (!subscribers || subscribers.length === 0) {
        showInfo('تحميل البيانات', 'جاري تحميل بيانات المشتركين، يرجى المحاولة مرة أخرى');
        return;
      }

      const subscriberToRenew = subscribers.find(s => s.id === selectedIds[0]);
      if (!subscriberToRenew) {
        showError('خطأ في البيانات', 'لم يتم العثور على بيانات المشترك المحدد');
        return;
      }

      setSelectedSubscriberForRenewal(subscriberToRenew);
      setRenewalData(prev => ({
        ...prev,
        subscriberId: selectedIds[0],
        renewalDate: '',
        subscriberNoteType: null,
      }));
      setRenewalViaSasTab(false);
      if (isPythonBackend()) {
        void openPythonActivateModal(
          subscriberToRenew,
          selectedOperationalResellerId || subscriberToRenew.agentResellerId || undefined
        );
        return;
      }
      setShowRenewalModal(true);
    } else {
      selectedIds.forEach(subscriberId => {
        const subscriber = subscribers?.find(s => s.id === subscriberId);
        const renewalData: RenewalData = {
          subscriberId: subscriberId,
          newProfileId: '',
          paymentStatus: PaymentStatus.Paid,
          overrideSalePrice: 0,
          amountPaid: 0,
          notes: '',
          remainingAmount: 0,
          debtDescription: '',
          renewalDate: '',
          currentExpirationDate: subscriber?.expirationDate,
          renewalPeriod: 30,
          activationMode: RenewalActivationMode.Full,
          dealerId: '',
          subscriberNoteType: null,
        };
        createRenewalMutation.mutate(renewalData);
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = await confirmDelete('مشترك', selectedIds.length);
    if (confirmed) {
      selectedIds.forEach(id => deleteSubscriberMutation.mutate(id));
      clearSubscriberSelection();
    }
  };

  /** فتح رابط التفعيل بعد اختيار الرسيلر (أو مباشرة عند رسيلر واحد). يستدعي getSasLink ويفتح الرابط ويعرض مودال التجديد. */
  const openActivationLinkWithReseller = async (subscriberId: string, resellerId?: string) => {
    if (user?.role === UserRole.Employee && !user?.canActivateSubscriber) {
      showError('تفعيل المشترك', 'لا تملك صلاحية تفعيل المشترك.');
      return;
    }
    const subscriberToRenew = subscribers?.find(s => s.id === subscriberId);
    if (!subscriberToRenew) {
      showError('خطأ في البيانات', 'لم يتم العثور على بيانات المشترك المحدد');
      return;
    }
    setSasLinkLoading(true);
    try {
      const data = await apiService.getSasLink(subscriberId, resellerId);
      const serviceType = data?.serviceType;
      const sasUrl = data?.url;
      const activationUrl = (data as any)?.activationUrl;

      if (serviceType === ServiceType.Sas && sasUrl) {
        window.open(normalizeEarthlinkActivationUrl(sasUrl) || sasUrl, '_blank');
        setSelectedSubscriberForRenewal(subscriberToRenew);
        setRenewalData(prev => ({ ...prev, subscriberId, renewalDate: '', subscriberNoteType: null }));
        setRenewalViaSasTab(true);
        setShowRenewalModal(true);
        showInfo('تم فتح نافذة SAS', 'أتمم التفعيل في النافذة المفتوحة ثم اضغط «تم التفعيل» هنا.');
        return;
      }
      if (
        serviceType === ServiceType.Ftth ||
        serviceType === ServiceType.Zainfi ||
        serviceType === ServiceType.Fiberx
      ) {
        const subscriberIdVal = String(
          subscriberToRenew.ftthSubscriptionId ?? subscriberToRenew.secruptionId ?? (data as any)?.secruptionId ?? ''
        ).trim();
        const urlToOpen =
          activationUrl ||
          (subscriberIdVal
            ? `${String((data as any)?.ftthBaseUrl || 'https://admin.ftth.iq').replace(/\/$/, '')}/customer-details/${encodeURIComponent(subscriberIdVal)}/details/view`
            : null);
        if (!urlToOpen) {
          showError(
            serviceType === ServiceType.Ftth ? 'FTTH' : formatServiceTypeLabelAr(serviceType),
            'معرف المشترك (FtthSubscriptionId أو SecruptionId) غير موجود.'
          );
          return;
        }
        window.open(urlToOpen, '_blank');
        setSelectedSubscriberForRenewal(subscriberToRenew);
        setRenewalData(prev => ({ ...prev, subscriberId, renewalDate: '', subscriberNoteType: null }));
        setRenewalViaSasTab(true);
        setShowRenewalModal(true);
        showInfo(
          formatServiceTypeLabelAr(serviceType),
          serviceType === ServiceType.Ftth
            ? 'تم فتح صفحة تفاصيل الزبون في FTTH. أكمل الإجراء هناك ثم اضغط «تم التفعيل» هنا.'
            : 'تم فتح رابط التفعيل. أكمل الإجراء هناك ثم اضغط «تم التفعيل» هنا.'
        );
        return;
      }
      if (serviceType === ServiceType.Earthlink) {
        const earthlinkName = encodeURIComponent(String(subscriberToRenew.fullName ?? '').trim());
        const earthlinkUrl = earthlinkName
          ? `${EARTHLINK_USER_MANAGEMENT_URL}?mn=${earthlinkName}&userst=0`
          : EARTHLINK_USER_MANAGEMENT_URL;
        window.open(earthlinkUrl, '_blank');
        setSelectedSubscriberForRenewal(subscriberToRenew);
        setRenewalData(prev => ({ ...prev, subscriberId, renewalDate: '', subscriberNoteType: null }));
        setRenewalViaSasTab(true);
        setShowRenewalModal(true);
        showInfo('Earthlink', 'تم فتح صفحة إدارة المستخدمين في Earthlink. أكمل التفعيل هناك ثم اضغط «تم التفعيل» هنا.');
        return;
      }
      if (sasUrl) {
        window.open(normalizeEarthlinkActivationUrl(sasUrl) || sasUrl, '_blank');
        setSelectedSubscriberForRenewal(subscriberToRenew);
        setRenewalData(prev => ({ ...prev, subscriberId, renewalDate: '', subscriberNoteType: null }));
        setRenewalViaSasTab(true);
        setShowRenewalModal(true);
        showInfo('تم فتح نافذة التفعيل', 'أتمم التفعيل في النافذة المفتوحة ثم اضغط «تم التفعيل» هنا.');
        return;
      }
      showError('خطأ', 'لم يُرجَع رابط تفعيل صالح من الخادم.');
    } catch (err: any) {
      showError('لا يمكن فتح رابط التفعيل', ApiService.showError(err));
    } finally {
      setSasLinkLoading(false);
    }
  };

  const handleActivateViaSasTab = async () => {
    if (selectedIds.length !== 1) {
      showError('اختر مشتركاً واحداً', 'لتفعيل المشترك يرجى اختيار مشترك واحد فقط.');
      return;
    }
    const subscriberToRenew = subscribers?.find(s => s.id === selectedIds[0]);
    if (!subscriberToRenew) {
      showError('خطأ في البيانات', 'لم يتم العثور على بيانات المشترك المحدد');
      return;
    }

    if (isPythonBackend()) {
      if (myResellers.length > 1) {
        setPendingActivateSubscriberId(selectedIds[0]);
        setShowResellerPickerModal(true);
        setShowActionsDropdown(false);
        return;
      }
      void openPythonActivateModal(
        subscriberToRenew,
        selectedOperationalResellerId || subscriberToRenew.agentResellerId || myResellers[0]?.id
      );
      setShowActionsDropdown(false);
      return;
    }

    if (myResellers.length > 1) {
      setPendingActivateSubscriberId(selectedIds[0]);
      setShowResellerPickerModal(true);
      setShowActionsDropdown(false);
      return;
    }

    await openActivationLinkWithReseller(selectedIds[0], selectedOperationalResellerId || myResellers[0]?.id);
    setShowActionsDropdown(false);
  };

  const handleViewSubscriber = (id: string) => {
    navigate(`/admin/subscribers/${id}`);
  };

  const handleEditSubscriber = (id: string) => {
    const subscriber = subscribers?.find(s => s.id === id);
    if (subscriber) {
      setSelectedSubscriberForEdit(subscriber);
      setShowEditModal(true);
    }
  };

  const handleOpenNoteModal = (id: string) => {
    const subscriber = subscribers?.find(s => s.id === id);
    if (subscriber) {
      setSelectedSubscriberForNote(subscriber);
      setShowNoteModal(true);
    }
  };

  const handleSaveNote = async (id: string, noteType: SubscriberNoteType | null, note: string) => {
    const sub = selectedSubscriberForNote!;
    const nextNotePlain = noteType === SubscriberNoteType.Other ? (note || '').trim() : '';
    const patch = buildSubscriberNotesPatch(
      { noteType: sub.noteType ?? null, note: sub.note ?? '' },
      { noteType, note: nextNotePlain }
    );
    if (!patch) {
      setShowNoteModal(false);
      setSelectedSubscriberForNote(null);
      clearSubscriberSelection();
      return;
    }
    try {
      await apiService.patchSubscriberNotes(id, patch);
      queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      showSuccess('ادخال ملاحظة', 'تم حفظ الملاحظة بنجاح');
    } catch (err: unknown) {
      showError('ادخال ملاحظة', ApiService.showError(err));
    } finally {
      setShowNoteModal(false);
      setSelectedSubscriberForNote(null);
      clearSubscriberSelection();
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowActionsDropdown(false);
      }
      if (columnSettingsRef.current && !columnSettingsRef.current.contains(event.target as Node)) {
        setShowColumnSettings(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);


  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-md">
          خطأ في تحميل بيانات المشتركين
            </div>
          </div>
    );
  }

  if (createSubscriberMutation.isPending) {
    return (
      <div className="p-6 flex items-center justify-center h-screen">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <span className="text-lg font-medium text-gray-600 dark:text-gray-400">إضافة مشترك جديد...</span>
        </div>
      </div>
    );
  }

  const subscribersInitialLoading = isLoading && !subscribersResponse;

  if (subscribersInitialLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-screen">
        <WifiLoaderComponent
          background="transparent"
          desktopSize="150px"
          mobileSize="150px"
          text="تحميل المشتركين..."
          backColor="#dff2f8"
          frontColor="#4AB1D4"
        />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
            إدارة المشتركين
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">
            عرض وإدارة جميع المشتركين
          </p>
        </div>
        {isAgentOrSubAgentOrEmployee && myResellers.length > 0 && (
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">المناطق</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {myResellers.map((r) => {
                const active = selectedOperationalResellerId === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleSubscribersResellerCardClick(r.id)}
                    className={`rounded-xl border px-3 py-2 text-right transition-colors min-h-[44px] ${
                      active
                        ? 'bg-primary-100 dark:bg-primary-900/40 border-primary-500 text-primary-800 dark:text-primary-200'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="text-sm font-semibold truncate">{r.name}</div>
                    <div className="text-xs opacity-75 truncate">
                      {formatServiceTypeLabelAr(r.serviceType)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {isPythonBackend() && extendDayTargetSubscriber && (
            <button
              type="button"
              title={extendDayStatus?.message_ar ?? 'تمديد يوم واحد (1-DAY)'}
              disabled={
                extendDayStatusLoading ||
                extendDayMutation.isPending ||
                extendDayStatus?.button_disabled !== false
              }
              onClick={() => {
                if (!extendDayStatus?.can_execute) {
                  showInfo(
                    'تمديد',
                    extendDayStatus?.message_ar ?? 'غير متاح — ربما استُخدم التمديد هذا الشهر'
                  );
                  return;
                }
                extendDayMutation.mutate();
              }}
              className={`flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-2 rounded-lg text-sm sm:text-base text-white transition-colors min-h-[44px] touch-manipulation disabled:cursor-not-allowed ${
                extendDayStatusLoading
                  ? 'bg-gray-500 opacity-70'
                  : extendDayStatus?.button_color === 'green'
                    ? 'bg-green-600 hover:bg-green-700 disabled:opacity-50'
                    : 'bg-red-600 hover:bg-red-700 disabled:opacity-80'
              }`}
            >
              <CalendarPlus className="h-4 w-4 shrink-0" />
              <span>
                {extendDayMutation.isPending || extendDayStatusLoading
                  ? 'جاري الفحص...'
                  : 'تمديد'}
              </span>
            </button>
          )}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowActionsDropdown(!showActionsDropdown)}
              disabled={selectedIds.length === 0}
              className="flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm sm:text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] touch-manipulation"
            >
              <MoreHorizontal className="h-4 w-4" />
              <span>الإجراءات ({selectedIds.length})</span>
            </button>
            
            {showActionsDropdown && selectedIds.length > 0 && (
              <div className="absolute top-full right-0 mt-2 min-w-[220px] w-max max-w-[320px] bg-white dark:bg-gray-800 rounded-lg shadow-xl ring-1 ring-black/10 dark:ring-white/10 border border-gray-200 dark:border-gray-600 z-50">
                <div className="py-1.5 flex flex-col gap-0.5">
                  {showActivateSubscriberAction && (
                  <button
                    onClick={() => {
                      handleBulkRenew();
                      setShowActionsDropdown(false);
                    }}
                    disabled={renewMutation.isPending}
                    className="w-full text-right px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>تفعيل المشترك</span>
                  </button>
                  )}
                  {isPythonBackend() && selectedIds.length === 1 && extendDayTargetSubscriber && (
                    <button
                      onClick={() => {
                        if (!extendDayStatus?.can_execute) {
                          showInfo(
                            'تمديد',
                            extendDayStatus?.message_ar ?? 'غير متاح'
                          );
                          setShowActionsDropdown(false);
                          return;
                        }
                        extendDayMutation.mutate();
                        setShowActionsDropdown(false);
                      }}
                      disabled={
                        extendDayStatusLoading ||
                        extendDayMutation.isPending ||
                        extendDayStatus?.button_disabled !== false
                      }
                      className={`w-full text-right px-4 py-2 text-sm flex items-center space-x-2 ${
                        extendDayStatus?.button_color === 'green'
                          ? 'text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
                          : 'text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                      } disabled:opacity-50`}
                    >
                      <CalendarPlus className="h-4 w-4" />
                      <span>تمديد يوم</span>
                    </button>
                  )}
                  {selectedIds.length === 1 && showActivateViaTabAction && (
                    <button
                      onClick={() => {
                        handleActivateViaSasTab();
                      }}
                      disabled={sasLinkLoading}
                      className="w-full text-right px-4 py-2 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 flex items-center space-x-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>{sasLinkLoading ? 'جاري جلب الرابط...' : 'تفعيل عبر اللوحة'}</span>
                    </button>
                  )}
                  {showViewDetailsAction && (
                  <button
                    onClick={() => {
                      selectedIds.forEach(id => handleViewSubscriber(id));
                      setShowActionsDropdown(false);
                    }}
                    className="w-full text-right px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                  >
                    <Eye className="h-4 w-4" />
                    <span>عرض تفاصيل المشترك</span>
                  </button>
                  )}
                  {showEditSubscriberAction && (
                  <button
                    onClick={() => {
                      selectedIds.forEach(id => handleEditSubscriber(id));
                      setShowActionsDropdown(false);
                    }}
                    className="w-full text-right px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                  >
                    <Edit className="h-4 w-4" />
                    <span>تعديل المشترك</span>
                  </button>
                  )}
                  
                  {selectedIds.length === 1 && (
                  <button
                    onClick={() => {
                        handleOpenNoteModal(selectedIds[0]);
                        setShowActionsDropdown(false);
                      }}
                      className="w-full text-right px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                    >
                      <FileText className="h-4 w-4" />
                      <span>ادخال ملاحظة</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (selectedIds.length !== 1) {
                        showError('إرسال تفاصيل المشترك', 'يرجى تحديد مشترك واحد فقط لإرسال التفاصيل.');
                        setShowActionsDropdown(false);
                        return;
                      }
                      const subscriber = subscribers?.find(s => s.id === selectedIds[0]);
                      if (subscriber) handleSendSubscriberDetails(subscriber);
                      setShowActionsDropdown(false);
                    }}
                    className="w-full text-right px-4 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 flex items-center space-x-2"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span>إرسال دين او التفاصيل</span>
                  </button>
                  <button
                    onClick={() => handleSendAlertMessage()}
                    disabled={sendReminderLoading}
                    className="w-full text-right px-4 py-2 text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span>{sendReminderLoading ? 'جاري إرسال التنبيه...' : 'رسالة تنبيه الاشتراك'}</span>
                  </button>
                  {selectedIds.length === 1 && (
                    <button
                      onClick={() => {
                        const subscriber = subscribers?.find(s => s.id === selectedIds[0]);
                        if (subscriber) handleSendCustomMessage(subscriber);
                        setShowActionsDropdown(false);
                      }}
                      className="w-full text-right px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center space-x-2"
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>إرسال رسالة حر</span>
                    </button>
                  )}
                  {showDeleteSubscriberAction && (
                  <button
                    onClick={() => {
                      handleBulkDelete();
                      setShowActionsDropdown(false);
                    }}
                    className="w-full text-right px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>حذف المشترك</span>
                  </button>
                  )}
                </div>
              </div>
            )}
          </div>
          
          {canSyncSas && (
            <div className="flex items-center gap-2 flex-wrap">
              {!isPythonBackend() && hasZainOrFiberxResellers && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    حد السحب (Zain Fi² / FiberX)
                  </label>
                  <select
                    value={subscriberFetchMaxChoice === null ? '__all__' : String(subscriberFetchMaxChoice)}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '__all__') setSubscriberFetchMaxChoice(null);
                      else setSubscriberFetchMaxChoice(Number(v));
                    }}
                    className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white max-w-[120px]"
                    title="لمقارنة Zain Fi² و FiberX؛ «الكل» = maxSubscribersToFetch غير مُرسل (سحب الكل)"
                  >
                    {subscriberFetchLimitSelectOptions.map((opt, i) => (
                      <option
                        key={`sync-fetch-${opt.label}-${String(opt.value)}-${i}`}
                        value={opt.value === null ? '__all__' : String(opt.value)}
                      >
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="button"
                onClick={handlePythonOrLegacyDataRefresh}
                disabled={subscribersDataRefreshing}
                title={
                  isPythonBackend()
                    ? 'مزامنة المشتركين من SAS إلى قاعدة البيانات (POST /api/subscribers/sync)'
                    : undefined
                }
                className="flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg text-sm sm:text-base transition-colors min-h-[44px] touch-manipulation border border-gray-300 dark:border-gray-600"
              >
                <RefreshCw className={`h-4 w-4 ${subscribersDataRefreshing ? 'animate-spin' : ''}`} />
                <span>{subscribersDataRefreshing ? 'جاري التحديث...' : 'تحديث بيانات'}</span>
              </button>
              {!isPythonBackend() &&
                !synchronizationFtthMutation.isPending &&
                (autoSyncFtthResult != null || zainfiDiffResult != null) && (
                <button
                  type="button"
                  onClick={() => setShowAutoSyncModal(true)}
                  className="flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-200 rounded-lg text-sm sm:text-base transition-colors min-h-[44px] touch-manipulation border border-blue-200 dark:border-blue-800"
                >
                  <Eye className="h-4 w-4" />
                  <span>
                    عرض آخر قائمة (
                    {zainfiDiffResult != null
                      ? zainfiDiffResult.differences?.length ?? zainfiDiffResult.matchedPairCount ?? 0
                      : autoSyncFtthResult?.count ?? autoSyncFtthResult?.data?.length ?? 0}
                    )
                  </span>
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            disabled={createSubscriberMutation.isPending}
            className="flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm sm:text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] touch-manipulation"
          >
            <Plus className="h-4 w-4" />
            <span>إضافة مشترك</span>
          </button>
        </div>
      </div>

      {/* فلترة متقدمة + تصدير تقرير الحسابات */}
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdvancedFilter((v) => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
              showAdvancedFilter || hasActiveAdvancedFilter
                ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500 text-primary-700 dark:text-primary-300'
                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Filter className="h-4 w-4" />
            <span>فلترة متقدمة</span>
            {hasActiveAdvancedFilter && (
              <span className="mr-1 px-1.5 py-0.5 text-xs rounded-full bg-primary-200 dark:bg-primary-800">
                مفعّل
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={openAccountsExcelExportModal}
            disabled={
              exportingExcel ||
              (user?.role === UserRole.Admin && (!accountsExcelExportAgentId || myAgentLoading))
            }
            title={
              user?.role === UserRole.Admin && !accountsExcelExportAgentId
                ? 'تعذر تحديد الوكيل'
                : 'تصدير تقرير حسابات المشتركين (Excel)'
            }
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-emerald-600/80 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:pointer-events-none text-white font-medium shadow-sm transition-colors"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            تصدير Excel
          </button>
        </div>

        {isPythonBackend() && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex flex-wrap items-center gap-2">
            {lastSubscribersSyncedAt ? (
              <span>
                آخر مزامنة من SAS:{' '}
                {formatDate(lastSubscribersSyncedAt, {
                  year: 'numeric',
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            ) : (
              <span>لم تُجرَ مزامنة SAS بعد</span>
            )}
            {subscribersResponse?.source === 'database' ? (
              <span className="text-gray-400">(من قاعدة البيانات)</span>
            ) : subscribersResponse?.source === 'sas_live' ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                (من SAS مباشرة
                {connectionStatusFilter === 'online'
                  ? ' — متصلون'
                  : connectionStatusFilter === 'offline'
                    ? ' — غير متصلين'
                    : ''}
                )
              </span>
            ) : null}
            {subscribersFetching &&
            (subscribersResponse?.backgroundSync?.in_progress ||
              subscribersDbSyncMutation.isPending) ? (
              <span className="text-primary-600 dark:text-primary-400 animate-pulse">
                تحديث من SAS في الخلفية…
              </span>
            ) : null}
          </p>
        )}

        {showAdvancedFilter && (
          <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {isPythonBackend()
                ? 'القائمة من قاعدة البيانات بعد المزامنةindex/online أو /index/user) ويحدّث online_status محلياً. باقي الفلاتر: حالة الاشتراك، تاريخ انتهاء (expiration_date)، الاسم، اسم المستخدم، الهاتف، أو معرّف المشترك.'
                : ''}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">الحالة</label>
            <select
              value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as SubscriptionStatus | 'all');
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white text-sm"
            >
              <option value="all">جميع الحالات</option>
              {isPythonBackend() && pythonSubscriptionStatuses.length > 0
                ? pythonSubscriptionStatuses.map((s) => {
                    const enumVal =
                      s.id === 'active'
                        ? SubscriptionStatus.Active
                        : s.id === 'expiring_soon'
                          ? SubscriptionStatus.ExpiringSoon
                          : s.id === 'expired'
                            ? SubscriptionStatus.Expired
                            : null;
                    if (enumVal == null) return null;
                    return (
                      <option key={s.id} value={enumVal}>
                        {s.label_ar}
                      </option>
                    );
                  })
                : (
                  <>
                    <option value={SubscriptionStatus.Active}>نشط</option>
                    <option value={SubscriptionStatus.ExpiringSoon}>سينتهي قريباً</option>
                    <option value={SubscriptionStatus.Expired}>منتهي</option>
                    <option value={SubscriptionStatus.ExpiredToday}>سينتهي اليوم</option>
                  </>
                )}
            </select>
          </div>
              {isPythonBackend() && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    حالة الاتصال
                  </label>
                  <select
                    value={connectionStatusFilter}
                    onChange={(e) => {
                      setConnectionStatusFilter(e.target.value as ConnectionStatusFilter);
                      setCurrentPage(1);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white text-sm"
                  >
                    <option value="all">الكل (أونلاين + أوفلاين)</option>
                    <option value="online">متصل — SAS /index/online</option>
                    <option value="offline">غير متصل — online_status = 0</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">ترتيب التاريخ</label>
                <select
                  value={sortDescending ? 'true' : 'false'}
                  onChange={(e) => {
                    setSortColumn('expirationDate');
                    setSortDescending(e.target.value === 'true');
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="false">تصاعدي</option>
                  <option value="true">تنازلي</option>
                </select>
              </div>
              {!isPythonBackend() && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">الكابينة</label>
                    <input
                      type="text"
                      placeholder="الكابينة"
                      maxLength={200}
                      value={fatFilter}
                      onChange={(e) => setFatFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">المنطقة</label>
                    <input
                      type="text"
                      placeholder="المنطقة"
                      maxLength={200}
                      value={zoneFilter}
                      onChange={(e) => setZoneFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">نوع الملاحظة</label>
                    <select
                      value={noteTypeFilter}
                      onChange={(e) => setNoteTypeFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white text-sm"
                    >
                      <option value="all">كل الملاحظات</option>
                      {subscriberNoteTypeFilterOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">ينتهي خلال (يوم)</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="—"
                      value={maxDaysUntilExpiry}
                      onChange={(e) => setMaxDaysUntilExpiry(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white text-sm"
                    />
                  </div>
                </>
              )}
              {isPythonBackend() ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    تاريخ انتهاء الاشتراك
                  </label>
                  <input
                    type="date"
                    value={expirationFromDate}
                    onChange={(e) => setExpirationFromDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white text-sm"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">انتهاء الاشتراك من تاريخ</label>
                    <input
                      type="date"
                      value={expirationFromDate}
                      onChange={(e) => setExpirationFromDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">انتهاء الاشتراك إلى تاريخ</label>
                    <input
                      type="date"
                      value={expirationToDate}
                      onChange={(e) => setExpirationToDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white text-sm"
                    />
                  </div>
                </>
              )}
              {!isPythonBackend() && (
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={extensionActivationFilter}
                      onChange={(e) => setExtensionActivationFilter(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    تم تفعيل باقة تمديد
                  </label>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                onClick={handleApplyAdvancedFilter}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-md text-sm font-medium"
              >
                <Check className="h-4 w-4" />
                تطبيق الفلتر
              </button>
              <button
                type="button"
                onClick={handleClearSearch}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 rounded-md text-sm font-medium"
              >
                <X className="h-4 w-4" />
                مسح الفلتر
              </button>
            </div>
          </div>
        )}
      </div>

      {/* فلترة البحث */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder={
              sasSearchOnlyMode
                ? 'الاسم الأول والثاني، أو اسم المستخدم، أو معرّف المشترك...'
                : requireTwoWordsForSearch
                  ? 'البحث بالاسم الأول والثاني (كلمتين على الأقل)...'
                  : isPythonBackend()
                    ? 'الاسم، اسم المستخدم، الهاتف، أو معرّف المشترك...'
                    : 'البحث بالاسم أو رقم الهاتف...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), applySearch())}
            className="w-full pr-10 pl-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white text-sm"
          />
        </div>
        <button
          type="button"
          onClick={applySearch}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-md text-sm font-medium whitespace-nowrap"
        >
          بحث
        </button>
      </div>

      {sasSearchOnlyMode && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-md px-3 py-2">
          صلاحيتك تسمح بعرض المشتركين بعد البحث فقط: الاسم الأول والثاني، أو اسم المستخدم، أو معرّف المشترك.
        </p>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center justify-end gap-1 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <div className="relative" ref={columnSettingsRef}>
            <button
              type="button"
              onClick={openColumnOrderModal}
              className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              title="ترتيب الأعمدة"
              aria-label="ترتيب الأعمدة"
            >
              <Columns3 className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setShowColumnSettings((v) => !v)}
              className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              title="إعدادات عرض الجدول"
              aria-label="إعدادات عرض الجدول"
            >
              <Settings2 className="h-5 w-5" />
            </button>
            {showColumnSettings && (
              <div className="absolute left-0 top-full mt-1 z-20 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2">
                <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">الأعمدة الظاهرة</span>
                </div>
                <div className="max-h-64 overflow-y-auto px-2 py-1">
                  {orderedTableColumns.map(({ id, label }) => (
                    <label
                      key={id}
                      className="flex items-center gap-2 px-2 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns[id] !== false}
                        onChange={() => toggleColumnVisibility(id)}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="wakeel-table-scroll">
          <table className="min-w-full text-right">
            <thead>
              <tr>
                <th className="px-2 sm:px-4 lg:px-6 py-2 sm:py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={toggleSelectAll} className="p-1" aria-label="تحديد الكل">
                      {subscribers && selectedIds.length === subscribers.length && subscribers.length > 0 ? (
                        <CheckSquare className="h-3 w-3 sm:h-4 sm:w-4 text-primary-600" />
                      ) : (
                        <Square className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={openColumnOrderModal}
                      className="p-1 rounded text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      title="ترتيب الأعمدة"
                      aria-label="ترتيب الأعمدة"
                    >
                      <Columns3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </button>
                  </div>
                </th>
                {orderedTableColumns.map(({ id, label }) => {
                  const isActive = sortColumn === id;
                  const SortIcon = isActive ? (sortDescending ? ArrowDown : ArrowUp) : null;
                  const headerLabel =
                    id === 'subscriber' ? 'المشترك' : label;
                  return (
                    <th
                      key={id}
                      className={`px-2 sm:px-4 lg:px-6 py-2 sm:py-3 text-right text-xs font-medium uppercase tracking-wider ${col(id)} ${
                        isActive
                          ? 'text-primary-600 dark:text-primary-400'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleColumnSort(id)}
                        className="inline-flex items-center gap-1 w-full justify-end hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                        title={`ترتيب حسب ${label}`}
                      >
                        <span>{headerLabel}</span>
                        {SortIcon && <SortIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedSubscribers?.map((subscriber) => (
                <tr
                  key={subscriber.id}
                  className={subscriberConnectionRowClass(subscriber, {
                    isPython: isPythonBackend(),
                  })}
                >
                  <td className="px-2 sm:px-4 lg:px-6 py-2 sm:py-4">
                    <button onClick={() => toggleSelectOne(subscriber.id)} className="p-1" aria-label="تحديد">
                      {selectedIds.includes(subscriber.id) ? (
                        <CheckSquare className="h-3 w-3 sm:h-4 sm:w-4 text-primary-600" />
                      ) : (
                        <Square className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400" />
                      )}
                    </button>
                  </td>
                  {orderedTableColumns.map(({ id }) => renderSubscriberTableCell(subscriber, id))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {subscribers?.length === 0 && (
          <div className="text-center py-12">
            <UserPlus className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
              لا توجد مشتركين
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              ابدأ بإضافة مشترك جديد
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {subscribersResponse && (
        <Pagination
          currentPage={subscribersResponse.currentPage}
          totalPages={subscribersResponse.totalPages}
          totalItems={subscribersResponse.totalItems}
          pageSize={subscribersResponse.pageSize}
          hasNextPage={subscribersResponse.hasNextPage}
          hasPreviousPage={subscribersResponse.hasPreviousPage}
          onPageChange={handlePageChange}
        />
      )}

      {/* Add Subscriber Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
                إضافة مشترك جديد
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* معرف الاشتراك */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    معرف الاشتراك *
                  </label>
                  <input
                    type="text"
                    name="secruptionId"
                    value={formData.secruptionId ?? ''}
                    onChange={handleInputChange}
                    required
                    maxLength={100}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                    placeholder="معرف الاشتراك"
                  />
                </div>

                {/* Username */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    اسم المستخدم *
                  </label>
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                    placeholder="اسم المستخدم"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    كلمة المرور *
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                    placeholder="كلمة المرور"
                  />
                </div>

                {/* First Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    الاسم الأول *
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                    placeholder="الاسم الأول"
                  />
                </div>

                {/* Last Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    اسم العائلة 
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                    placeholder="اسم العائلة"
                  />
                </div>

                {/* Phone Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    رقم الهاتف *
                  </label>
                  <input
                    type="tel"
                    name="phoneNumber"
                    value={formData.phoneNumber}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                    placeholder="رقم الهاتف"
                  />
                </div>

                {/* Profile — قائمة مع بحث */}
                <div ref={profileDropdownAddRef}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    الباقة *
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowProfileDropdownAdd((v) => !v)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white text-right flex items-center justify-between"
                    >
                      <span className="truncate">
                        {formData.profileId && profilesForCreate.length > 0
                          ? (profilesForCreate.find((p) => p.id === formData.profileId)?.name ?? 'اختر الباقة')
                          : 'اختر الباقة'}
                        {formData.profileId && profilesForCreate.length > 0 && (() => {
                          const p = profilesForCreate.find((x) => x.id === formData.profileId);
                          return p ? ` - ${formatNumber(p.salePrice || 0, { suffix: ' د.ع' })}` : '';
                        })()}
                      </span>
                      <Search className="h-4 w-4 text-gray-400 flex-shrink-0 mr-2" />
                    </button>
                    {showProfileDropdownAdd && (
                      <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg max-h-64 flex flex-col">
                        <div className="p-2 border-b border-gray-200 dark:border-gray-600 sticky top-0 bg-white dark:bg-gray-700">
                          <div className="relative">
                            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                              type="text"
                              value={profileSearchInAdd}
                              onChange={(e) => setProfileSearchInAdd(e.target.value)}
                              placeholder="البحث عن الباقة..."
                              className="w-full pl-3 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-600 dark:text-white"
                              autoFocus
                            />
                          </div>
                        </div>
                        <ul className="overflow-y-auto py-1 max-h-48">
                          {filteredProfilesForAdd.length === 0 ? (
                            <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">لا توجد نتائج</li>
                          ) : (
                            filteredProfilesForAdd.map((profile) => (
                              <li key={profile.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormData((prev) => ({ ...prev, profileId: profile.id }));
                                    setShowProfileDropdownAdd(false);
                                    setProfileSearchInAdd('');
                                  }}
                                  className={`w-full text-right px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 ${
                                    formData.profileId === profile.id ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                        {profile.name} - {formatNumber(profile.salePrice || 0, { suffix: ' د.ع' })}
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                <input type="hidden" name="activationDate" value={formData.activationDate} />
                <input type="hidden" name="expirationDate" value={formData.expirationDate} />
                
                {/* Info message */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        <strong>ملاحظة:</strong> المشترك الجديد سيتم إنشاؤه بحالة منتهي تلقائياً. يمكنك تفعيله لاحقاً من خلال عملية التجديد.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Subscription Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    نوع الاشتراك *
                  </label>
                  <select
                    name="subscriptionType"
                    value={formData.subscriptionType}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value={SubscriptionType.Paid}>مدفوع</option>
                    <option value={SubscriptionType.Free}>مجاني</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    نوع الملاحظة
                  </label>
                  <select
                    name="noteType"
                    value={formData.noteType ?? ''}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value={SubscriberNoteType.NoResponse}>لم يتم الرد</option>
                    <option value={SubscriberNoteType.DoesNotWantActivation}>لايرغب بالتفعيل</option>
                    <option value={SubscriberNoteType.MaintenanceRequest}>طلب صيانة</option>
                    <option value={SubscriberNoteType.StableService}>الخدمة مستقرة</option>
                    <option value={SubscriberNoteType.Other}>أخرى</option>
                  </select>
                </div>

                {formData.noteType === SubscriberNoteType.Other && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      نص الملاحظة
                </label>
                <textarea
                  name="note"
                  value={formData.note}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      placeholder="اكتب الملاحظة..."
                    />
                  </div>
                )}
              </div>

              {/* الكابينة والمنطقة */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    الكابينة
                  </label>
                  <input
                    type="text"
                    name="fat"
                    value={formData.fat ?? ''}
                    onChange={handleInputChange}
                    maxLength={200}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                    placeholder="الكابينة (اختياري)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    المنطقة
                  </label>
                  <input
                    type="text"
                    name="zone"
                    value={formData.zone ?? ''}
                    onChange={handleInputChange}
                    maxLength={200}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                    placeholder="المنطقة (اختياري)"
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={createSubscriberMutation.isPending}
                  className="flex items-center space-x-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createSubscriberMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>حفظ المشترك</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Renewal Modal */}
      {showRenewalModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200/90 dark:border-gray-700 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-l from-primary-50/90 via-white to-white dark:from-primary-950/40 dark:via-gray-800 dark:to-gray-800 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  {isPythonBackend() ? (
                    <>
                      <h2
                        className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight truncate"
                        title={
                          activateSubscriberName && activateUsername
                            ? `${activateSubscriberName} — ${activateUsername}`
                            : activateSubscriberName || activateUsername || undefined
                        }
                      >
                        {activateSubscriberName || 'تفعيل'}
                      </h2>
                      {activateUsername ? (
                        <span
                          className="shrink-0 text-sm sm:text-base font-semibold text-primary-700 dark:text-primary-300 tabular-nums"
                          dir="ltr"
                        >
                          {activateUsername}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <h2
                      className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight truncate"
                      title={
                        (renewalInfo?.subscriberName || selectedSubscriberForRenewal?.fullName || '').trim() ||
                        undefined
                      }
                    >
                      {(renewalInfo?.subscriberName || selectedSubscriberForRenewal?.fullName || '').trim() ||
                        'تفعيل المشترك'}
                    </h2>
                  )}
                  {isPythonBackend() && (
                    <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                      {pythonActivateStep}/2
                    </span>
                  )}
                  {!isPythonBackend() && daysUntilExpiryText && (
                    <span className="shrink-0 text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-full px-2 py-0.5">
                      {daysUntilExpiryText}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isPythonBackend() && pythonActivateBusy) return;
                  closeRenewalModal();
                }}
                disabled={isPythonBackend() && pythonActivateBusy}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {renewalViaSasTab && !isPythonBackend() && (
              <div className="mx-4 sm:mx-6 mb-2 shrink-0 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                <p className="text-amber-800 dark:text-amber-200 text-sm">
                  تم فتح نافذة SAS. بعد إتمام التفعيل واضغط الزر في SAS يُغلق التاب ويرجعك للنظام تلقائياً. ثم أدخل بيانات التجديد هنا واضغط «تم التفعيل» أو «طباعة» أدناه.
                </p>
              </div>
            )}

            {!renewalInfo ? (
              <div className="p-6 text-center">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-red-600 dark:text-red-400 font-medium">
                    خطأ في تحميل بيانات المشترك
                  </p>
                  <p className="text-red-500 dark:text-red-500 text-sm mt-2">
                    لم يتم العثور على بيانات المشترك المحدد. تأكد من أن المشترك موجود في القائمة.
                  </p>
                  <button
                    onClick={closeRenewalModal}
                    className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRenewalSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 min-h-0">
                  {isPythonBackend() && !pythonActivateResellerId && (
                    <p className="text-sm text-red-600 dark:text-red-400 text-center py-4">لا يوجد رسيلر</p>
                  )}

                  {isPythonBackend() && pythonActivateResellerId && (
                    <PythonActivateWizard
                      step={pythonActivateStep}
                      packages={activatePackagesList}
                      packagesLoading={activatePackagesLoading || !activateResellerReady}
                      packagesError={activatePackagesError}
                      selectedPackageKey={activateSelectedPackageKey}
                      selectedPackage={selectedActivatePackage}
                      packagePrice={pythonPackagePrice}
                      amountPaid={renewalData.amountPaid ?? 0}
                      onSelectPackage={handlePythonSelectPackage}
                      onAmountPaidChange={handlePythonAmountPaidChange}
                      onBack={() => {
                        if (!pythonActivateBusy) setPythonActivateStep(1);
                      }}
                      formatNumber={formatNumber}
                      showError={(err) => ApiService.showError(err)}
                      isActivating={pythonActivateBusy}
                    />
                  )}

                  {!isPythonBackend() && (
                  <>
                  <section className="rounded-xl border border-gray-200/90 dark:border-gray-600/70 overflow-hidden bg-white/60 dark:bg-gray-800/30">
                    <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700/80 bg-gray-50/90 dark:bg-gray-900/25">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">وضع التفعيل</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        يحدد تسجيل التفعيل (كامل → AccountsFul، وكيل آخر → AccountsOtherDealer) وسلوك الدين عند وجود متبقي.
                      </p>
                    </div>
                    <div className="p-3 sm:p-4">
                      <div className="space-y-3">
                        <div className="flex flex-col gap-2">
                          <label className="flex items-start gap-3 cursor-pointer rounded-lg p-2 -m-2 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                            <input
                              type="radio"
                              name="activationModeRadio"
                              checked={(renewalData.activationMode ?? RenewalActivationMode.Full) === RenewalActivationMode.Full}
                              onChange={() =>
                                setRenewalData((p) => ({
                                  ...p,
                                  activationMode: RenewalActivationMode.Full,
                                  dealerId: '',
                                }))
                              }
                              className="mt-1"
                            />
                            <span>
                              <span className="font-semibold text-gray-900 dark:text-white">تفعيل كامل</span>
                              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                يتم تسجيل هذا التفعيل اذا كان المشترك ينتمي اليك.
                              </span>
                            </span>
                          </label>
                          <label className="flex items-start gap-3 cursor-pointer rounded-lg p-2 -m-2 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                            <input
                              type="radio"
                              name="activationModeRadio"
                              checked={(renewalData.activationMode ?? RenewalActivationMode.Full) === RenewalActivationMode.OtherDealer}
                              onChange={() =>
                                setRenewalData((p) => ({
                                  ...p,
                                  activationMode: RenewalActivationMode.OtherDealer,
                                  dealerId: '',
                                }))
                              }
                              className="mt-1"
                            />
                            <span>
                              <span className="font-semibold text-gray-900 dark:text-white">تفعيل لوكيل آخر</span>
                              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                يتم تسجيل هذا التفعيل اذا كان المشترك لا ينتمي اليك
                              </span>
                            </span>
                          </label>
                        </div>
                        {(renewalData.activationMode ?? RenewalActivationMode.Full) === RenewalActivationMode.OtherDealer && (
                          <div className="pt-2 border-t border-gray-100 dark:border-gray-600">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                              الوكيل (التاجر) *
                            </label>
                            {renewalDealersLoading ? (
                              <p className="text-sm text-gray-500 dark:text-gray-400">جاري تحميل قائمة الوكلاء…</p>
                            ) : renewalAvailableDealers.length === 0 ? (
                              <p className="text-sm text-amber-800 dark:text-amber-200">
                                لا يوجد وكلاء متاحون لهذا السياق. تحقق من المنطقة أو الصلاحيات.
                              </p>
                            ) : (
                              <select
                                name="dealerId"
                                value={renewalData.dealerId || ''}
                                onChange={handleRenewalInputChange}
                                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm focus:ring-2 focus:ring-primary-500"
                              >
                                <option value="">— اختر الوكيل —</option>
                                {renewalAvailableDealers.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.fullName} ({d.userName})
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  {(renewalData.activationMode ?? RenewalActivationMode.Full) === RenewalActivationMode.OtherDealer && (
                    <section className="rounded-xl border border-gray-200/90 dark:border-gray-600/70 overflow-hidden bg-white/60 dark:bg-gray-800/30">
                      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700/80 bg-gray-50/90 dark:bg-gray-900/25">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">رصيد منطقة المشترك</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">للمعاينة والتعبئة عند الحاجة قبل التفعيل.</p>
                      </div>
                      <div className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        {user?.role === UserRole.Employee && user?.canAccessAccounts === false ? (
                          <p className="text-sm text-amber-800 dark:text-amber-200">
                            لا تتوفر صلاحية الحسابات لعرض الرصيد من الخادم.
                          </p>
                        ) : !subscriberAgentResellerIdForBalance ? (
                          <p className="text-sm text-gray-600 dark:text-gray-300">
                            المشترك غير مرتبط بمنطقة (AgentReseller) — لا يمكن عرض رصيد منطقة محدد.
                          </p>
                        ) : renewalModalBalanceQueryEnabled && renewalBalanceLoading ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400">جاري جلب الرصيد…</p>
                        ) : (
                          <>
                            <div>
                              <span className="text-xs text-gray-500 dark:text-gray-400 block">
                                {subscriberRegionBalanceRow?.name ||
                                  selectedSubscriber?.agentResellerName ||
                                  'منطقة المشترك'}
                              </span>
                              <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400" dir="ltr">
                                {formatNumber(subscriberRegionBalanceRow?.balanceIqd ?? 0, { suffix: ' د.ع' })}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setOtherDealerTopUpForm({
                                  amountIqd: 0,
                                  recipientName: '',
                                  companyName: '',
                                  topUpDate: new Date().toISOString().split('T')[0],
                                  agentResellerId: hasRenewalModalResellerRegions
                                    ? subscriberAgentResellerIdForBalance
                                    : '',
                                });
                                setShowOtherDealerTopUpModal(true);
                              }}
                              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium shrink-0"
                            >
                              <Wallet className="h-4 w-4" />
                              تعبئة الرصيد
                            </button>
                          </>
                        )}
                      </div>
                    </section>
                  )}

                  <section className="rounded-xl border border-gray-200/90 dark:border-gray-600/70 overflow-hidden bg-white/60 dark:bg-gray-800/30">
                    <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700/80 bg-gray-50/90 dark:bg-gray-900/25">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">الباقة الجديدة</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">اختر باقة التجديد أو التمديد.</p>
                    </div>
                    <div className="p-3 sm:p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">الباقة *</label>
                          <select
                            name="newProfileId"
                            value={renewalData.newProfileId}
                            onChange={handleRenewalInputChange}
                            className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
                          >
                            <option value="">اختر الباقة</option>
                            {renewalProfilesForSelect.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {profile.name} -{' '}
                                {profile.packageType === ProfilePackageType.Extension
                                  ? `${formatNumber(profile.salePrice || 0, { suffix: ' د.ع' })} — تمديد`
                                  : profile.packageType === ProfilePackageType.SpecialOffer
                                    ? `${formatNumber(profile.salePrice || 0, { suffix: ' د.ع' })} — عرض خاص`
                                    : formatNumber(profile.salePrice || 0, { suffix: ' د.ع' })}{' '}
                                ({profile.renewalPeriod || 30} يوم)
                              </option>
                            ))}
                          </select>
                        </div>
                        {renewalData.newProfileId && (
                          <div className="group relative flex justify-end sm:pt-8">
                            <button
                              type="button"
                              className="rounded-full p-2 text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-950/40"
                              aria-label="معلومات التجديد والتفعيل"
                            >
                              <Info className="h-5 w-5" aria-hidden />
                            </button>
                            <div
                              role="tooltip"
                              className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 text-start text-xs text-gray-700 opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                            >
                              {(() => {
                                const p = renewalInfo.availableProfiles?.find((pr) => pr.id === renewalData.newProfileId);
                                const period = p?.renewalPeriod || 30;
                                const isExt = p?.packageType === ProfilePackageType.Extension;
                                return (
                                  <div className="space-y-1.5">
                                    <p>
                                      <strong>فترة التجديد:</strong> {period} يوم
                                    </p>
                                    <p>
                                      <strong>نوع التفعيل:</strong> {isExt ? 'تمديد' : 'اشتراك'}
                                    </p>
                                    <p>
                                      <strong>انتهاء جديد:</strong> يُضاف للمدة الحالية للمشترك
                                    </p>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="rounded-xl border border-gray-200/90 dark:border-gray-600/70 overflow-hidden bg-white/60 dark:bg-gray-800/30">
                    <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700/80 bg-gray-50/90 dark:bg-gray-900/25">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">المبالغ والدين</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        مفتاح «واصل» افتراضياً — عطّله لإدخال مبلغ واصل جزئي.
                      </p>
                    </div>
                    <div className="p-3 sm:p-4 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          سعر الاشتراك (د.ع)
                        </label>
                        <input
                          type="number"
                          name="overrideSalePrice"
                          value={renewalData.overrideSalePrice === 0 ? '' : renewalData.overrideSalePrice}
                          onChange={handleRenewalInputChange}
                          min="0"
                          placeholder="افتراضي = سعر الباقة"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white max-w-xs"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/30 px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">واصل</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {amountReceivedInFull
                              ? `المبلغ كاملاً — ${formatNumber(getRenewalFinalPrice(), { suffix: ' د.ع' })}`
                              : 'أدخل المبلغ الواصل — الباقي يُسجَّل ديناً'}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={amountReceivedInFull}
                          onClick={() => handleAmountReceivedToggle(!amountReceivedInFull)}
                          className={`relative inline-flex h-8 w-[3.25rem] shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 ${
                            amountReceivedInFull ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-7 w-7 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out ${
                              amountReceivedInFull ? 'translate-x-[-1.35rem]' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                      {!amountReceivedInFull && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ادخل مبلغ الواصل (د.ع)
                          </label>
                          <input
                            type="number"
                            name="amountPaid"
                            value={renewalData.amountPaid === 0 ? '' : renewalData.amountPaid}
                            onChange={handleRenewalInputChange}
                            min="0"
                            max={getRenewalFinalPrice()}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white max-w-xs"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          مبلغ الدين <span className="text-gray-400 font-normal">(غير واصل)</span>
                        </label>
                        <input
                          type="number"
                          name="remainingAmount"
                          value={renewalData.remainingAmount || 0}
                          readOnly
                          tabIndex={-1}
                          className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 cursor-default max-w-xs"
                        />
                      </div>
                      {(renewalData.remainingAmount || 0) > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            تاريخ الاستحقاق / تسديد الدين *
                          </label>
                          <input
                            type="date"
                            name="debtDueDate"
                            value={renewalData.debtDueDate || ''}
                            onChange={handleRenewalInputChange}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white max-w-xs"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ملاحظات عامة</label>
                        <textarea
                          ref={renewalGeneralNotesTextareaRef}
                          name="notes"
                          value={renewalData.notes}
                          onChange={handleRenewalInputChange}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                          placeholder="ملاحظات إضافية..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          تاريخ استلام الحساب <span className="text-gray-400 font-normal">(اختياري)</span>
                        </label>
                        <input
                          type="date"
                          name="renewalDate"
                          value={renewalData.renewalDate || ''}
                          onChange={handleRenewalInputChange}
                          max={getBaghdadTodayYmd()}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white max-w-xs"
                        />
                     
                      </div>
                    </div>
                  </section>
                  </>
                  )}
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/90 dark:bg-gray-900/40 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (isPythonBackend() && pythonActivateBusy) return;
                      closeRenewalModal();
                    }}
                    disabled={isPythonBackend() && pythonActivateBusy}
                    className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    إلغاء
                  </button>
                  {(!isPythonBackend() || pythonActivateStep === 2) && (
                    <button
                      type="submit"
                      disabled={
                        isPythonBackend()
                          ? pythonActivateBusy ||
                            !selectedPackageActivatable ||
                            !activateSelectedPackageKey.trim() ||
                            pythonPackagePrice == null
                          : createRenewalMutation.isPending
                      }
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px]"
                    >
                      {(isPythonBackend()
                        ? pythonActivateBusy && showActivateEmployeeConfirm
                        : createRenewalMutation.isPending) ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                          جاري التفعيل...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          {isPythonBackend()
                            ? 'تفعيل'
                            : renewalViaSasTab
                              ? 'تم التفعيل'
                              : 'تفعيل المشترك'}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {showActivateDebtConfirm && (
        <div
          className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="activate-debt-confirm-title"
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200/90 dark:border-gray-700 w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2
                id="activate-debt-confirm-title"
                className="text-lg font-bold text-gray-900 dark:text-white"
              >
                تنبيه — دين على المشترك
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                لدى المشترك{' '}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {activateSubscriberName || activateUsername || 'المشترك'}
                </span>{' '}
                ديون غير مسدّدة. هل تريد المتابعة بالتفعيل؟
              </p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/90 dark:bg-gray-900/40">
              <button
                type="button"
                onClick={() => setShowActivateDebtConfirm(false)}
                className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                لا
              </button>
              <button
                type="button"
                onClick={proceedToActivateEmployeeConfirm}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-md min-w-[120px]"
              >
                نعم — متابعة
              </button>
            </div>
          </div>
        </div>
      )}

      {showActivateEmployeeConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="activate-employee-confirm-title"
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200/90 dark:border-gray-700 w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2
                id="activate-employee-confirm-title"
                className="text-lg font-bold text-gray-900 dark:text-white"
              >
                تأكيد التفعيل
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                هل أنت متأكد من تفعيل{' '}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {activateSubscriberName || activateUsername || 'المشترك'}
                </span>
                ؟
              </p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label
                  htmlFor="activate-employee-code-confirm"
                  className="block text-sm text-gray-600 dark:text-gray-400 mb-1"
                >
                  رمز الموظف <span className="text-red-500">*</span>
                </label>
                <input
                  id="activate-employee-code-confirm"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="\d{4}"
                  dir="ltr"
                  autoFocus
                  autoComplete="new-password"
                  name="activate-employee-code"
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white font-mono tracking-widest text-center text-lg disabled:opacity-60 [-webkit-text-security:disc]"
                  placeholder="••••"
                  value={activateEmployeeCode}
                  onChange={(e) =>
                    setActivateEmployeeCode(e.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  disabled={pythonActivateBusy}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      confirmPythonActivateWithEmployeeCode();
                    }
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/90 dark:bg-gray-900/40">
              <button
                type="button"
                onClick={() => {
                  if (pythonActivateBusy) return;
                  setActivateEmployeeCode('');
                  setShowActivateEmployeeConfirm(false);
                }}
                disabled={pythonActivateBusy}
                className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={confirmPythonActivateWithEmployeeCode}
                disabled={pythonActivateBusy || !/^\d{4}$/.test(activateEmployeeCode.trim())}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed min-w-[120px]"
              >
                {pythonActivateBusy ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    جاري التفعيل...
                  </>
                ) : (
                  'تأكيد التفعيل'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showOtherDealerTopUpModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="subscriber-renewal-topup-title"
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <h2
                id="subscriber-renewal-topup-title"
                className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"
              >
                <Wallet className="h-5 w-5" />
                تعبئة الرصيد
              </h2>
              <button
                type="button"
                onClick={() => setShowOtherDealerTopUpModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <form onSubmit={handleOtherDealerTopUpSubmit} className="space-y-4">
                {hasRenewalModalResellerRegions && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">المنطقة *</label>
                    <select
                      value={otherDealerTopUpForm.agentResellerId ?? ''}
                      onChange={(e) =>
                        setOtherDealerTopUpForm((prev) => ({ ...prev, agentResellerId: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                      required
                    >
                      <option value="">— اختر المنطقة —</option>
                      {renewalModalResellerRows.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">المبلغ (د.ع) *</label>
                  <input
                    type="number"
                    min={1}
                    value={otherDealerTopUpForm.amountIqd || ''}
                    onChange={(e) =>
                      setOtherDealerTopUpForm((prev) => ({ ...prev, amountIqd: Number(e.target.value) || 0 }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">اسم المستلم *</label>
                  <input
                    type="text"
                    value={otherDealerTopUpForm.recipientName}
                    onChange={(e) =>
                      setOtherDealerTopUpForm((prev) => ({ ...prev, recipientName: e.target.value }))
                    }
                    placeholder="أحمد محمد"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الشركة / جهة الرصيد *</label>
                  <input
                    type="text"
                    value={otherDealerTopUpForm.companyName}
                    onChange={(e) =>
                      setOtherDealerTopUpForm((prev) => ({ ...prev, companyName: e.target.value }))
                    }
                    placeholder="شركة الاتصالات"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">تاريخ التعبئة (اختياري)</label>
                  <input
                    type="date"
                    value={otherDealerTopUpForm.topUpDate}
                    onChange={(e) =>
                      setOtherDealerTopUpForm((prev) => ({ ...prev, topUpDate: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={otherDealerTopUpMutation.isPending}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md text-sm font-medium"
                  >
                    {otherDealerTopUpMutation.isPending ? 'جاري الحفظ...' : 'تسجيل التعبئة'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowOtherDealerTopUpModal(false)}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-md text-sm font-medium"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* تنبيه بعد التفعيل: حفظ وطباعة / واتساب (لاحقاً) */}
      {showReceiptModal && lastReceipt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden"
            role="alertdialog"
            aria-labelledby="post-activation-title"
            aria-describedby="post-activation-desc"
          >
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h2
                id="post-activation-title"
                className="text-lg font-semibold text-gray-900 dark:text-white mb-2"
              >
                تم التفعيل بنجاح
              </h2>
              <p id="post-activation-desc" className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                رقم الفاتورة: <span className="font-medium text-gray-900 dark:text-white">{lastReceipt.receiptNumber}</span>
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {lastReceipt.subscriberName}
                {lastReceipt.newProfileName ? ` — ${lastReceipt.newProfileName}` : ''}
              </p>
              {(lastReceipt.remainingAmount ?? 0) > 0 && (
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mt-2">
                  تم تسجيل دين: {formatNumber(lastReceipt.remainingAmount ?? 0, { suffix: ' د.ع' })}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 p-4 pt-0 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => void handlePostActivationSaveAndPrint()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-3 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
              >
                <Printer className="h-4 w-4" />
                <span>طباعة</span>
              </button>
              <button
                type="button"
                disabled
                title="قيد التطوير"
                onClick={() => void handlePostActivationSaveAndWhatsApp()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 px-4 py-3 text-sm font-medium text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 cursor-not-allowed"
              >
                <MessageCircle className="h-4 w-4" />
                <span>إرسال واتساب</span>
                <span className="text-xs opacity-80">(قيد التطوير)</span>
              </button>
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                className="w-full rounded-lg px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة اختيار الرسيلر عند التفعيل عبر تاب (عند وجود أكثر من رسيلر) */}
      {showResellerPickerModal && pendingActivateSubscriberId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">اختر الرسيلر للتفعيل</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              قد يكون المشترك موجوداً في أكثر من مصدر. اختر الرسيلر الذي تريد فتح رابط التفعيل منه.
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {[...myResellers].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    const sub = subscribers?.find((s) => s.id === pendingActivateSubscriberId);
                    if (isPythonBackend() && sub) {
                      void openPythonActivateModal(sub, r.id);
                    } else {
                      void openActivationLinkWithReseller(pendingActivateSubscriberId, r.id);
                    }
                    setShowResellerPickerModal(false);
                    setPendingActivateSubscriberId(null);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-right rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
                >
                  <span className="font-medium text-gray-900 dark:text-white">{r.name}</span>
                  <span className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    {formatServiceTypeLabelAr(r.serviceType as ServiceType)}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowResellerPickerModal(false);
                  setPendingActivateSubscriberId(null);
                  clearSubscriberSelection();
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {showExcelExportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="subscribers-accounts-excel-export-title"
        >
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Download className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden />
                <h2
                  id="subscribers-accounts-excel-export-title"
                  className="text-lg font-semibold text-gray-900 dark:text-white truncate"
                >
                  تصدير Excel — تقرير الحسابات
                </h2>
              </div>
              <button
                type="button"
                onClick={() => !exportingExcel && setShowExcelExportModal(false)}
                disabled={exportingExcel}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
            
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  checked={excelExportOmitDates}
                  disabled={exportingExcel}
                  onChange={(e) => setExcelExportOmitDates(e.target.checked)}
                />

              </label>
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${excelExportOmitDates ? 'opacity-50 pointer-events-none' : ''}`}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">من تاريخ</label>
                  <input
                    type="date"
                    value={excelExportFromYmd}
                    onChange={(e) => setExcelExportFromYmd(e.target.value)}
                    disabled={exportingExcel || excelExportOmitDates}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">إلى تاريخ</label>
                  <input
                    type="date"
                    value={excelExportToYmd}
                    onChange={(e) => setExcelExportToYmd(e.target.value)}
                    disabled={exportingExcel || excelExportOmitDates}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
                  />
                </div>
              </div>
              <button
                type="button"
                disabled={exportingExcel || excelExportOmitDates}
                onClick={() => {
                  const { fromYmd, toYmd } = getBaghdadDefaultExportRangeLast30Days();
                  setExcelExportFromYmd(fromYmd);
                  setExcelExportToYmd(toYmd);
                  setExcelExportOmitDates(false);
                }}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 disabled:no-underline"
              >
                
              </button>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">المنطقة / الرسيلر</label>
                <select
                  value={excelExportResellerId}
                  onChange={(e) => setExcelExportResellerId(e.target.value)}
                  disabled={exportingExcel || myResellers.length === 0}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="">الكل</option>
                  {myResellers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">من نفّذ التفعيل</label>
                <select
                  value={excelExportExecutorUserId}
                  onChange={(e) => setExcelExportExecutorUserId(e.target.value)}
                  disabled={exportingExcel}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="">الكل</option>
                  {accountsExecutorOptionsForExcel.map((u) => (
                    <option key={u.id} value={u.id}>
                      {(u.fullName || u.username || u.id).trim()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="subscribers-excel-accounts-package-type"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  نوع التفعيل
                </label>
                <select
                  id="subscribers-excel-accounts-package-type"
                  value={excelExportPackageType}
                  onChange={(e) => setExcelExportPackageType(e.target.value)}
                  disabled={exportingExcel}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                >
                  <option value="">الكل</option>
                  <option value={String(ProfilePackageType.Subscription)}>اشتراك</option>
                  <option value={String(ProfilePackageType.Extension)}>تمديد اشتراك</option>
                  <option value={String(ProfilePackageType.SpecialOffer)}>عرض خاص</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end p-4 border-t border-gray-200 dark:border-gray-700 shrink-0 bg-gray-50/80 dark:bg-gray-900/40">
              <button
                type="button"
                onClick={() => setShowExcelExportModal(false)}
                disabled={exportingExcel}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-100 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void handleAccountsExcelExport()}
                disabled={exportingExcel}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {exportingExcel ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                    جاري التحميل…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" aria-hidden />
                    تطبيق وتحميل
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAutoSyncModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-6xl bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {zainfiDiffResult
                    ? syncDiffProvider === 'fiberx'
                      ? 'مقارنة FiberX مع النظام'
                      : 'مقارنة Zain Fi² مع النظام'
                    : `نتائج المزامنة التلقائية ${String(autoSyncFtthResult?.provider || '').toUpperCase() || 'FTTH'}`}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {zainfiDiffResult
                    ? ''
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAutoSyncModal(false)}
                className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {!zainfiDiffResult && (
              <div className="px-5 py-3 text-sm text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
                <div>
                  عدد السجلات:{' '}
                  <strong>{autoSyncFtthResult?.count ?? autoSyncFtthResult?.data?.length ?? 0}</strong>
                </div>
                {String(autoSyncFtthResult?.provider || '').toLowerCase() === 'sas' &&
                  (autoSyncFtthResult?.data?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => saveAllSasSyncItemsMutation.mutate()}
                      disabled={savingAllSasRows}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                    >
                      {savingAllSasRows ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                      حفظ الكل
                    </button>
                  )}
              </div>
            )}

            <div className="overflow-auto bg-gray-50/40 dark:bg-gray-900/20 flex-1 min-h-0">
              {zainfiDiffResult ? (
                <table className="min-w-[520px] w-full text-sm text-right border-separate border-spacing-0">
                  <thead className="bg-white/95 dark:bg-gray-800/95 sticky top-0 z-10 backdrop-blur-sm">
                    <tr>
                      <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-200">
                        اسم المشترك
                      </th>
                      <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-200">
                        تاريخ الانتهاء
                      </th>
                      <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-200">
                        {syncDiffProvider === 'fiberx' ? 'الباقة(FiberX)' : 'الباقة(Zain)'}
                      </th>
                      <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-200 w-[1%] whitespace-nowrap">
                        إجراء
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(zainfiDiffResult.differences ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                          لا توجد فروقات مسجّلة لهذا الجلب.
                        </td>
                      </tr>
                    ) : (
                      (zainfiDiffResult.differences ?? []).map((diffRow, dIdx) => {
                        const offerDisplay =
                          (diffRow.offerName && String(diffRow.offerName).trim()) ||
                          (diffRow.externalOfferName && String(diffRow.externalOfferName).trim()) ||
                          '';
                        const externalEndForApply = resolveZainfiApplyExternalEndDate(diffRow);
                        const isApplyingThis =
                          applyingZainfiExpirationSubscriberId === diffRow.subscriberId;
                        return (
                          <tr
                            key={`${diffRow.subscriberId}-${dIdx}`}
                            className="border-t border-gray-100 dark:border-gray-700 even:bg-white odd:bg-gray-50/70 dark:even:bg-gray-800/40 dark:odd:bg-gray-800/20"
                          >
                            <td className="px-4 py-3 align-top font-medium text-gray-900 dark:text-gray-100 max-w-[200px]">
                              {diffRow.subscriberName?.trim() ? diffRow.subscriberName : '—'}
                            </td>
                            <td className="px-4 py-3 align-top whitespace-nowrap text-gray-700 dark:text-gray-300">
                              {diffRow.expirationDate
                                ? formatDate(String(diffRow.expirationDate))
                                : '—'}
                            </td>
                            <td className="px-4 py-3 align-top max-w-[220px]">
                              {offerDisplay ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
                                  {offerDisplay}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-4 py-3 align-top whitespace-nowrap">
                              <button
                                type="button"
                                disabled={
                                  !externalEndForApply ||
                                  !diffRow.subscriberId ||
                                  applyZainfiExternalExpirationMutation.isPending
                                }
                                onClick={() => {
                                  const ext = resolveZainfiApplyExternalEndDate(diffRow);
                                  if (!ext || !diffRow.subscriberId) return;
                                  applyZainfiExternalExpirationMutation.mutate({
                                    subscriberId: diffRow.subscriberId,
                                    externalEndDate: ext,
                                  });
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50 disabled:pointer-events-none"
                              >
                                {isApplyingThis ? (
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                ) : null}
                                تحديث
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              ) : (
              <table className="min-w-[980px] w-full text-sm text-right border-separate border-spacing-0">
                <thead className="bg-white/95 dark:bg-gray-800/95 sticky top-0 z-10 backdrop-blur-sm">
                  <tr>
                    <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-200">اسم المشترك</th>
                    <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-200">الباقة</th>
                    <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-200">انتهاء الاشتراك</th>
                    <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-200">
                      {autoSyncReseller?.serviceType === ServiceType.Sas ? 'الوكيل' : 'المنطقة'}
                    </th>
                    <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-200">اسم المستخدم</th>
                    <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-200">طريقة التفعيل</th>
                    <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-200">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {(autoSyncFtthResult?.data ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                        لا توجد بيانات ضمن آخر أسبوع.
                      </td>
                    </tr>
                  ) : (
                    (autoSyncFtthResult?.data ?? []).map((row: CashbackSynchronizationFtthRow, idx: number) => {
                      const isSavingThisRow = savingFtthRowIndex === idx;
                      const isOpeningRenewalThisRow = openingRenewalFtthRowIndex === idx;
                      const isSaved = savedFtthRowIndices.has(idx);
                      const isActivated = activatedFtthRowIndices.has(idx);
                      const customerName = row.customerName ?? row.firstname ?? null;
                      const packageName = row.subscriptionName ?? row.profile_details?.name ?? null;
                      const expirationAt = row.subscriptionEndsAt ?? row.new_expiration ?? null;
                      const zoneOrParent = row.zoneId ?? row.parent_username ?? null;
                      const deviceOrUsername = (row.deviceUsername ?? row.username ?? '').toString().trim();
                      const rawActivationMethod = (row.activationType ?? row.activation_method ?? '').toString().trim();
                      const activationMethod = (() => {
                        const normalized = rawActivationMethod.toLowerCase();
                        if (normalized === 'user_credit') return 'بطاقة ائتمان المشترك';
                        if (normalized === 'voucher') return 'محفظة الوكيل';
                        if (normalized === 'credit') return 'قسيمة';
                        return rawActivationMethod || null;
                      })();
                      return (
                        <tr
                          key={`${deviceOrUsername || customerName || 'r'}-${idx}`}
                          className="border-t border-gray-100 dark:border-gray-700 even:bg-white odd:bg-gray-50/70 dark:even:bg-gray-800/40 dark:odd:bg-gray-800/20 hover:bg-primary-50/70 dark:hover:bg-primary-900/20 transition-colors"
                        >
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{customerName || '—'}</td>
                        <td className="px-4 py-3">
                          {packageName ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
                              {packageName}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">{expirationAt ? formatDate(expirationAt) : '—'}</td>
                        <td className="px-4 py-3">
                          {zoneOrParent ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                              {zoneOrParent}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {deviceOrUsername ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                              {deviceOrUsername}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200">
                              (مشترك جديد)
                            </span>
                          )}
                        </td>
                          <td className="px-4 py-3">
                            {activationMethod ? (
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                                  activationMethod.includes('الوكيل') || activationMethod.includes('قسيمة')
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
                                    : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200'
                                }`}
                              >
                                {activationMethod}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                disabled={savingAllSasRows || isSavingThisRow || isOpeningRenewalThisRow}
                                onClick={() => saveFtthSyncItemMutation.mutate({ row, rowIndex: idx })}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-gray-700 hover:bg-gray-800 text-white disabled:opacity-60"
                              >
                                {isSavingThisRow ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
                                حفظ
                              </button>
                              {showActivateSubscriberAction && (
                              <button
                                type="button"
                                disabled={savingAllSasRows || isSavingThisRow || isOpeningRenewalThisRow}
                                onClick={() => openRenewalModalForFtthSyncRow(row, idx)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-60"
                              >
                                {isOpeningRenewalThisRow ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
                                تفعيل
                              </button>
                              )}
                              {(isSaved || isActivated) && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                                  <Check className="h-3 w-3" />
                                  {isActivated ? 'تم التفعيل' : 'تم الحفظ'}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAutoSyncModal(false)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md text-gray-700 dark:text-gray-200"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {showAutoSyncResellerPickerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">اختر الرسيلر للمزامنة</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              لديك أكثر من رسيلر بأنواع مختلفة. اختر الرسيلر ليتم استدعاء API المزامنة الصحيح حسب النوع.
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {[...myResellers].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setShowAutoSyncResellerPickerModal(false);
                    synchronizationFtthMutation.mutate(r);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-right rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
                >
                  <span className="font-medium text-gray-900 dark:text-white">{r.name}</span>
                  <span className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    {formatServiceTypeLabelAr(r.serviceType as ServiceType)}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAutoSyncResellerPickerModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {postActivationWhatsApp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              {postActivationWhatsApp.mode === 'activation' ? 'إرسال رسالة التفعيل بالواتساب؟' : 'إرسال رسالة الدين/التفاصيل بالواتساب؟'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              تم تفعيل المشترك بنجاح. يمكنك الآن اختيار إرسال رسالة واتساب أو إغلاق هذه النافذة.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPostActivationWhatsApp(null);
                  clearSubscriberSelection();
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md text-sm"
              >
                إلغاء
              </button>
              {postActivationWhatsApp.mode === 'activation' ? (
                <button
                  type="button"
                  onClick={async () => {
                    const id = postActivationWhatsApp.subscriberId;
                    setPostActivationWhatsApp(null);
                    await apiService.sendWhatsAppActivation(id);
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm"
                >
                  إرسال رسالة التفعيل
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    const id = postActivationWhatsApp.subscriberId;
                    setPostActivationWhatsApp(null);
                    await handleSendSubscriberDetailsById(id);
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm"
                >
                  إرسال رسالة الدين/التفاصيل
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Subscriber Modal */}
      {selectedSubscriberForEdit && isPythonBackend() ? (
        <SasEditSubscriberModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedSubscriberForEdit(null);
            clearSubscriberSelection();
          }}
          subscriber={selectedSubscriberForEdit}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ['subscribers'] });
            setShowEditModal(false);
            setSelectedSubscriberForEdit(null);
            clearSubscriberSelection();
          }}
        />
      ) : selectedSubscriberForEdit ? (
        <EditSubscriberModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedSubscriberForEdit(null);
            clearSubscriberSelection();
          }}
          subscriber={selectedSubscriberForEdit}
          profiles={profilesForEditSubscriber}
          onUpdate={async (id, data) => {
            await updateSubscriberMutation.mutateAsync({ id, data });
          }}
        />
      ) : null}

      {showColumnOrderModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="column-order-modal-title"
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200/90 dark:border-gray-700 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Columns3 className="h-5 w-5 text-primary-600 dark:text-primary-400 shrink-0" />
                <h2
                  id="column-order-modal-title"
                  className="text-lg font-bold text-gray-900 dark:text-white truncate"
                >
                  ترتيب أعمدة الجدول
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowColumnOrderModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="px-5 pt-3 text-sm text-gray-500 dark:text-gray-400">
              استخدم الأسهم لتحريك الأعمدة. يُحفظ الترتيب تلقائياً على هذا الجهاز.
            </p>
            <div className="px-3 py-3 overflow-y-auto flex-1">
              <ul className="space-y-1">
                {columnOrderDraft.map((id, index) => (
                  <li
                    key={id}
                    className="flex items-center gap-2 px-2 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/30"
                  >
                    <GripVertical className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />
                    <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">
                      {columnLabelById.get(id) ?? id}
                    </span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveColumnInDraft(index, -1)}
                        disabled={index === 0}
                        className="p-1.5 rounded-md text-gray-500 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="تحريك لأعلى"
                        aria-label={`تحريك ${columnLabelById.get(id) ?? id} لأعلى`}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveColumnInDraft(index, 1)}
                        disabled={index === columnOrderDraft.length - 1}
                        className="p-1.5 rounded-md text-gray-500 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="تحريك لأسفل"
                        aria-label={`تحريك ${columnLabelById.get(id) ?? id} لأسفل`}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/90 dark:bg-gray-900/40 shrink-0">
              <button
                type="button"
                onClick={resetColumnOrderDraft}
                className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                إعادة الترتيب الافتراضي
              </button>
              <div className="flex flex-col-reverse sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setShowColumnOrderModal(false)}
                  className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={saveColumnOrder}
                  className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold rounded-xl bg-primary-600 hover:bg-primary-700 text-white shadow-md transition-colors"
                >
                  حفظ الترتيب
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Note Modal */}
      {selectedSubscriberForNote && (
        <AddNoteModal
          isOpen={showNoteModal}
          onClose={() => {
            setShowNoteModal(false);
            setSelectedSubscriberForNote(null);
            clearSubscriberSelection();
          }}
          subscriber={selectedSubscriberForNote}
          onSave={handleSaveNote}
        />
      )}
    </div>
  );
};

export default SubscribersPage;