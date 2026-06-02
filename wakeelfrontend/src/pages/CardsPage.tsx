import React, { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiService, ApiService } from '../services/api';
import type { AgentReseller, CardSeries, PaginatedResponse } from '../types';
import { formatServiceTypeLabelAr } from '../types';
import { getSelectedResellerId, setSelectedResellerId } from '../utils/selectedReseller';
import { showError, showSuccess } from '../utils/notifications';
import { useDigits } from '../contexts/DigitsContext';
import WifiLoaderComponent from '../components/WifiLoaderComponent';
import Pagination from '../components/Pagination';
import {
  CreditCard,
  RefreshCw,
  KeyRound,
  Copy,
  Check,
  AlertCircle,
  Store,
} from 'lucide-react';

const SERIES_PAGE_SIZES = [10, 20, 50];
const CODES_PAGE_SIZES = [10, 20, 50, 100];

function parseUsedCount(used: string | number | undefined, qty?: number): number {
  const n = typeof used === 'number' ? used : parseInt(String(used ?? '0'), 10);
  if (Number.isFinite(n)) return n;
  return qty != null ? qty : 0;
}

function seriesAvailable(row: CardSeries): number {
  if (row.available_count != null && Number.isFinite(row.available_count)) {
    return row.available_count;
  }
  const qty = row.qty ?? 0;
  return Math.max(0, qty - parseUsedCount(row.used, qty));
}

function formatSyncSeriesMessage(res: {
  created: number;
  updated: number;
  total_series_in_db: number;
  rows_fetched: number;
}): string {
  return `جديد: ${res.created}، محدَّث: ${res.updated}، الإجمالي: ${res.total_series_in_db} (${res.rows_fetched} من SAS)`;
}

function formatSyncCodesMessage(res: {
  created: number;
  updated: number;
  total_codes_in_db: number;
  rows_fetched: number;
  series: string;
}): string {
  return `سلسلة ${res.series}: جديد ${res.created}، محدَّث ${res.updated}، المحلي ${res.total_codes_in_db}`;
}

const CardsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { formatNumber, formatDate } = useDigits();

  const [selectedResellerId, setSelectedResellerIdState] = useState<string>(
    () => getSelectedResellerId() ?? ''
  );
  const [seriesPage, setSeriesPage] = useState(1);
  const [seriesPerPage, setSeriesPerPage] = useState(20);
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null);
  const [codesPage, setCodesPage] = useState(1);
  const [codesPerPage, setCodesPerPage] = useState(20);
  const [unusedOnly, setUnusedOnly] = useState(true);
  const [copiedPin, setCopiedPin] = useState<string | null>(null);
  const [seriesSearch, setSeriesSearch] = useState('');
  const [resellerSelecting, setResellerSelecting] = useState(false);

  const { data: myResellers = [], isLoading: resellersLoading } = useQuery<AgentReseller[]>({
    queryKey: ['myResellers'],
    queryFn: () => apiService.getMyResellers(),
  });

  const activeReseller = React.useMemo(
    () => myResellers.find((r) => r.id === selectedResellerId) ?? null,
    [myResellers, selectedResellerId]
  );

  const handleResellerSelect = useCallback(
    async (resellerId: string) => {
      if (!resellerId || resellerId === selectedResellerId) return;
      setResellerSelecting(true);
      setSelectedResellerIdState(resellerId);
      setSelectedResellerId(resellerId);
      setSelectedSeries(null);
      setSeriesPage(1);
      setCodesPage(1);
      setSeriesSearch('');
      try {
        await apiService.selectApiReseller(resellerId);
      } catch {
        /* يبقى X-Reseller-Id من التخزين */
      }
      void queryClient.invalidateQueries({ queryKey: ['cardSeries'] });
      void queryClient.invalidateQueries({ queryKey: ['cardCodes'] });
      setResellerSelecting(false);
    },
    [selectedResellerId, queryClient]
  );

  useEffect(() => {
    if (resellersLoading || myResellers.length === 0) return;
    const stored = getSelectedResellerId();
    if (stored && myResellers.some((r) => r.id === stored)) {
      if (selectedResellerId !== stored) {
        void handleResellerSelect(stored);
      }
      return;
    }
    if (!selectedResellerId && myResellers.length === 1) {
      void handleResellerSelect(myResellers[0].id);
    }
  }, [resellersLoading, myResellers, selectedResellerId, handleResellerSelect]);

  const hasReseller = !!selectedResellerId.trim();

  const {
    data: seriesResponse,
    isLoading: seriesLoading,
    isFetching: seriesFetching,
  } = useQuery<PaginatedResponse<CardSeries>>({
    queryKey: ['cardSeries', selectedResellerId, seriesPage, seriesPerPage],
    queryFn: () => apiService.getCardSeries({ page: seriesPage, perPage: seriesPerPage }),
    enabled: hasReseller,
  });

  const seriesSyncMutation = useMutation({
    mutationFn: () => apiService.syncCardSeries(),
    onSuccess: (res) => {
      showSuccess('مزامنة السلاسل', formatSyncSeriesMessage(res));
      void queryClient.invalidateQueries({ queryKey: ['cardSeries'] });
      setSeriesPage(1);
    },
    onError: (err: unknown) => showError('مزامنة السلاسل', ApiService.showError(err)),
  });

  const codesSyncMutation = useMutation({
    mutationFn: (series: string) =>
      apiService.syncCardCodes(series, { unusedOnly: true, full: false }),
    onSuccess: (res) => {
      showSuccess('مزامنة الأكواد', formatSyncCodesMessage(res));
      void queryClient.invalidateQueries({ queryKey: ['cardCodes', res.series] });
      setCodesPage(1);
    },
    onError: (err: unknown) => showError('مزامنة الأكواد', ApiService.showError(err)),
  });

  const {
    data: codesResponse,
    isLoading: codesLoading,
    isFetching: codesFetching,
  } = useQuery({
    queryKey: ['cardCodes', selectedResellerId, selectedSeries, codesPage, codesPerPage, unusedOnly],
    queryFn: () =>
      apiService.getCardCodes(selectedSeries!, {
        page: codesPage,
        perPage: codesPerPage,
        unusedOnly,
      }),
    enabled: hasReseller && !!selectedSeries,
  });

  const nextPinMutation = useMutation({
    mutationFn: (series: string) => apiService.getNextUnusedCardCode(series, { sync: false }),
    onSuccess: (res) => {
      const pin = res.pins?.[0]?.pin;
      if (pin) {
        void navigator.clipboard.writeText(pin);
        setCopiedPin(pin);
        setTimeout(() => setCopiedPin(null), 2500);
        showSuccess('كود جاهز', `تم نسخ PIN: ${pin}`);
      }
    },
    onError: (err: unknown) => showError('جلب كود', ApiService.showError(err)),
  });

  const seriesList = React.useMemo(() => {
    const raw = seriesResponse?.data ?? [];
    const q = seriesSearch.trim().toLowerCase();
    if (!q) return raw;
    return raw.filter((row) => {
      const profile = (row.profile_details?.name ?? '').toLowerCase();
      const owner = (row.owner_details?.username ?? '').toLowerCase();
      return row.series.toLowerCase().includes(q) || profile.includes(q) || owner.includes(q);
    });
  }, [seriesResponse?.data, seriesSearch]);

  const handleSelectSeries = (series: string) => {
    setSelectedSeries(series);
    setCodesPage(1);
  };

  const copyPin = async (pin: string) => {
    try {
      await navigator.clipboard.writeText(pin);
      setCopiedPin(pin);
      setTimeout(() => setCopiedPin(null), 2000);
    } catch {
      showError('نسخ', 'تعذّر نسخ الرمز');
    }
  };

  if (resellersLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <WifiLoaderComponent
          background="transparent"
          desktopSize="120px"
          mobileSize="120px"
          text="تحميل الرسيلرز..."
          backColor="#dff2f8"
          frontColor="#4AB1D4"
        />
      </div>
    );
  }

  if (hasReseller && seriesLoading && !seriesResponse) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <WifiLoaderComponent
          background="transparent"
          desktopSize="120px"
          mobileSize="120px"
          text="تحميل سلاسل الكروت..."
          backColor="#dff2f8"
          frontColor="#4AB1D4"
        />
      </div>
    );
  }

  const totalSeries = seriesResponse?.totalItems ?? 0;
  const noLocalSeries = hasReseller && totalSeries === 0 && !seriesFetching;

  return (
    <div className="p-4 sm:p-6 space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
            <CreditCard className="h-7 w-7 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">كروت الشحن</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {activeReseller
                ? `الرسيلر: ${activeReseller.name} — سلاسل وأكواد منفصلة لكل رسيلر`
                : 'اختر الرسيلر أولاً لعرض سلاسل الكاردات والأكواد'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => seriesSyncMutation.mutate()}
          disabled={!hasReseller || seriesSyncMutation.isPending || resellerSelecting}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium"
          title="POST /api/cards/sync"
        >
          <RefreshCw className={`h-4 w-4 ${seriesSyncMutation.isPending ? 'animate-spin' : ''}`} />
          {seriesSyncMutation.isPending ? 'جاري المزامنة...' : 'تحديث السلاسل من SAS'}
        </button>
      </div>

      {myResellers.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Store className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">الرسيلرز</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">(مطلوب — كل رسيلر له كروت وأكواد مستقلة)</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {myResellers.map((r) => {
              const active = selectedResellerId === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={resellerSelecting}
                  onClick={() => void handleResellerSelect(r.id)}
                  className={`rounded-xl border px-3 py-2 text-right transition-colors min-h-[44px] disabled:opacity-60 ${
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

      {myResellers.length === 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 text-red-800 dark:text-red-200">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">لا يوجد رسيلر مربوط بالحساب. أضف رسيلراً من الإعدادات أولاً.</p>
        </div>
      )}

      {!hasReseller && myResellers.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">اختر رسيلراً من الأعلى لعرض سلاسل الكاردات وأكواد التفعيل الخاصة به.</p>
        </div>
      )}

      {hasReseller && noLocalSeries && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            لا توجد سلاسل محلية بعد. اضغط «تحديث السلاسل من SAS» لتحميل الأعراس، ثم اختر سلسلة لمزامنة
            وعرض الأكواد.
          </p>
        </div>
      )}

      {hasReseller && (
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* سلاسل الكاردات */}
        <div className="xl:col-span-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3 justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">سلاسل الكاردات</h2>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={seriesSearch}
                onChange={(e) => setSeriesSearch(e.target.value)}
                placeholder="بحث بالسلسلة أو الباقة..."
                className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm px-3 py-1.5 min-w-[160px]"
              />
              <select
                value={seriesPerPage}
                onChange={(e) => {
                  setSeriesPerPage(Number(e.target.value));
                  setSeriesPage(1);
                }}
                className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5"
              >
                {SERIES_PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} / صفحة
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="wakeel-table-scroll">
            <table className="min-w-full text-right">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3">السلسلة</th>
                  <th className="px-4 py-3">الباقة</th>
                  <th className="px-4 py-3">الكمية</th>
                  <th className="px-4 py-3">مستخدم</th>
                  <th className="px-4 py-3">متاح</th>
                  <th className="px-4 py-3">انتهاء</th>
                  <th className="px-4 py-3">المالك</th>
                </tr>
              </thead>
              <tbody>
                {seriesList.map((row) => {
                  const isSelected = selectedSeries === row.series;
                  const avail = seriesAvailable(row);
                  return (
                    <tr
                      key={row.series}
                      onClick={() => handleSelectSeries(row.series)}
                      className={`cursor-pointer border-t border-gray-100 dark:border-gray-700 hover:bg-primary-50 dark:hover:bg-primary-900/10 ${
                        isSelected ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                      }`}
                    >
                      <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900 dark:text-white">
                        {row.series}
                        {row.suspended === 1 && (
                          <span className="mr-2 text-xs text-red-600 dark:text-red-400">موقوف</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {row.profile_details?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm">{formatNumber(row.qty ?? 0)}</td>
                      <td className="px-4 py-3 text-sm">{formatNumber(parseUsedCount(row.used, row.qty))}</td>
                      <td className="px-4 py-3 text-sm font-medium text-green-700 dark:text-green-400">
                        {formatNumber(avail)}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {row.expiration
                          ? formatDate(row.expiration, { year: 'numeric', month: 'numeric', day: 'numeric' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {row.owner_details?.username ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {seriesList.length === 0 && !seriesFetching && (
            <p className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">لا توجد سلاسل مطابقة</p>
          )}

          {(seriesResponse?.totalPages ?? 0) > 1 && (
            <div className="border-t border-gray-200 dark:border-gray-700">
              <Pagination
                currentPage={seriesResponse?.currentPage ?? seriesPage}
                totalPages={seriesResponse?.totalPages ?? 1}
                totalItems={seriesResponse?.totalItems ?? 0}
                pageSize={seriesPerPage}
                hasNextPage={seriesResponse?.hasNextPage ?? false}
                hasPreviousPage={seriesResponse?.hasPreviousPage ?? false}
                onPageChange={setSeriesPage}
              />
            </div>
          )}
        </div>

        {/* أكواد السلسلة */}
        <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col min-h-[320px]">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary-600" />
              {selectedSeries ? `أكواد: ${selectedSeries}` : 'الأكواد المتوفرة'}
            </h2>
            {selectedSeries ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => codesSyncMutation.mutate(selectedSeries)}
                  disabled={codesSyncMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-md text-xs font-medium"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${codesSyncMutation.isPending ? 'animate-spin' : ''}`}
                  />
                  مزامنة الأكواد
                </button>
                <button
                  type="button"
                  onClick={() => nextPinMutation.mutate(selectedSeries)}
                  disabled={nextPinMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-medium"
                >
                  <Copy className="h-3.5 w-3.5" />
                  أول PIN متاح
                </button>
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={unusedOnly}
                    onChange={(e) => {
                      setUnusedOnly(e.target.checked);
                      setCodesPage(1);
                    }}
                    className="rounded border-gray-300 text-primary-600"
                  />
                  غير المستخدمة فقط
                </label>
                <select
                  value={codesPerPage}
                  onChange={(e) => {
                    setCodesPerPage(Number(e.target.value));
                    setCodesPage(1);
                  }}
                  className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs px-2 py-1"
                >
                  {CODES_PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">اختر سلسلة من الجدول لعرض الأكواد</p>
            )}
          </div>

          {!selectedSeries && (
            <div className="flex-1 flex items-center justify-center p-8 text-gray-400">
              <CreditCard className="h-12 w-12 opacity-40" />
            </div>
          )}

          {selectedSeries && codesLoading && (
            <div className="flex-1 flex items-center justify-center p-8">
              <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
            </div>
          )}

          {selectedSeries && !codesLoading && (
            <>
              {(codesResponse?.totalItems ?? 0) === 0 && !codesFetching && (
                <div className="p-4 text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 m-4 rounded-lg">
                  لا توجد أكواد محلية لهذه السلسلة. اضغط «مزامنة الأكواد» لجلب PIN من SAS.
                </div>
              )}

              <div className="wakeel-table-scroll flex-1 max-h-[480px]">
                <table className="min-w-full text-right">
                  <thead className="sticky top-0 bg-white dark:bg-gray-800 z-10">
                    <tr className="text-xs uppercase text-gray-500 dark:text-gray-400">
                      <th className="px-3 py-2">PIN</th>
                      <th className="px-3 py-2">Serial</th>
                      <th className="px-3 py-2">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(codesResponse?.data ?? []).map((code) => {
                      const used = !!(code.used_at && String(code.used_at).trim());
                      return (
                        <tr
                          key={`${code.id ?? code.pin}-${code.serialnumber ?? ''}`}
                          className="border-t border-gray-100 dark:border-gray-700 text-sm"
                        >
                          <td className="px-3 py-2 font-mono">
                            <button
                              type="button"
                              onClick={() => copyPin(code.pin)}
                              className="inline-flex items-center gap-1 text-primary-700 dark:text-primary-300 hover:underline"
                              title="نسخ PIN"
                            >
                              {code.pin}
                              {copiedPin === code.pin ? (
                                <Check className="h-3.5 w-3.5 text-green-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5 opacity-60" />
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-2 font-mono text-gray-600 dark:text-gray-400 text-xs">
                            {code.serialnumber ?? '—'}
                          </td>
                          <td className="px-3 py-2">
                            {used ? (
                              <span className="text-xs text-gray-500" title={code.used_at ?? ''}>
                                مستخدم
                                {code.user_details?.username ? ` (${code.user_details.username})` : ''}
                              </span>
                            ) : (
                              <span className="text-xs text-green-700 dark:text-green-400 font-medium">
                                متاح
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {(codesResponse?.totalPages ?? 0) > 1 && (
                <div className="border-t border-gray-200 dark:border-gray-700 mt-auto">
                  <Pagination
                    currentPage={codesResponse?.currentPage ?? codesPage}
                    totalPages={codesResponse?.totalPages ?? 1}
                    totalItems={codesResponse?.totalItems ?? 0}
                    pageSize={codesPerPage}
                    hasNextPage={codesResponse?.hasNextPage ?? false}
                    hasPreviousPage={codesResponse?.hasPreviousPage ?? false}
                    onPageChange={setCodesPage}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}
    </div>
  );
};

export default CardsPage;
