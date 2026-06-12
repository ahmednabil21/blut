import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { useDigits } from '../../contexts/DigitsContext';
import { apiService, ApiService } from '../../services/api';
import { isPythonBackend } from '../../config/apiConfig';
import {
  ActivationErrorLogItem,
  Agent,
  PaginatedResponse,
  UserRole,
} from '../../types';
import { showError } from '../../utils/notifications';
import WifiLoaderComponent from '../WifiLoaderComponent';
import Pagination from '../Pagination';
import { AlertTriangle, Filter, RefreshCw, X } from 'lucide-react';

const PAGE_SIZE = 20;
const ERROR_LOG_AGENT_STORAGE_KEY = 'activationErrorLogSelectedAgentId';

const COMMON_STATUS_CODES = ['', '401', '403', '404', '409', '422', '500', '502', '503', '504'];

function statusCodeBadgeClass(code: number): string {
  if (code >= 500) {
    return 'bg-red-100 text-red-800 border border-red-200 dark:bg-red-950/50 dark:text-red-200 dark:border-red-900';
  }
  if (code >= 400) {
    return 'bg-amber-100 text-amber-900 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800';
  }
  return 'bg-gray-100 text-gray-800 border border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600';
}

function formatJsonForDisplay(raw?: string): string {
  if (!raw?.trim()) return '—';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

const ActivationErrorLogSettings: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const { formatDate } = useDigits();
  const pythonBackend = isPythonBackend();
  const isDotNetAdmin = user?.role === UserRole.Admin;
  const canSelectResellerForLog =
    isDotNetAdmin || (pythonBackend && user?.role === UserRole.Agent);

  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [page, setPage] = useState(1);
  const [detailRow, setDetailRow] = useState<ActivationErrorLogItem | null>(null);

  const [draftStatusCode, setDraftStatusCode] = useState('');
  const [draftRequestPath, setDraftRequestPath] = useState('');
  const [draftSubscriberUsername, setDraftSubscriberUsername] = useState('');
  const [draftFromDate, setDraftFromDate] = useState('');
  const [draftToDate, setDraftToDate] = useState('');

  const [appliedStatusCode, setAppliedStatusCode] = useState('');
  const [appliedRequestPath, setAppliedRequestPath] = useState('');
  const [appliedSubscriberUsername, setAppliedSubscriberUsername] = useState('');
  const [appliedFromDate, setAppliedFromDate] = useState('');
  const [appliedToDate, setAppliedToDate] = useState('');

  const { data: agentsResponse } = useQuery({
    queryKey: ['allAgents', 'activation-error-log'],
    queryFn: () => apiService.getAllAgents({ page: 1, pageSize: 5000 }),
    enabled: isAuthenticated && isDotNetAdmin && !pythonBackend,
    retry: false,
  });
  const adminAgents = (agentsResponse?.data ?? []) as Agent[];

  const { data: pythonResellers = [] } = useQuery({
    queryKey: ['api-resellers', 'activation-error-log'],
    queryFn: () => apiService.getApiResellers(),
    enabled: isAuthenticated && canSelectResellerForLog && pythonBackend,
    retry: false,
  });

  useEffect(() => {
    if (!canSelectResellerForLog) return;
    if (pythonBackend) {
      if (!pythonResellers.length) return;
      const saved = localStorage.getItem(ERROR_LOG_AGENT_STORAGE_KEY);
      if (saved === 'all' || (saved && pythonResellers.some((r) => String(r.id) === saved))) {
        setSelectedAgentId(saved || 'all');
      } else {
        setSelectedAgentId('all');
      }
      return;
    }
    if (!adminAgents.length) return;
    const saved = localStorage.getItem(ERROR_LOG_AGENT_STORAGE_KEY);
    if (saved && adminAgents.some((a) => a.id === saved)) {
      setSelectedAgentId(saved);
    } else {
      setSelectedAgentId(adminAgents[0].id);
    }
  }, [canSelectResellerForLog, pythonBackend, pythonResellers.length, adminAgents.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canSelectResellerForLog || !selectedAgentId) return;
    localStorage.setItem(ERROR_LOG_AGENT_STORAGE_KEY, selectedAgentId);
  }, [canSelectResellerForLog, selectedAgentId]);

  const statusCodeParam = (() => {
    if (!appliedStatusCode.trim()) return undefined;
    const n = Number(appliedStatusCode);
    return Number.isFinite(n) ? n : undefined;
  })();

  const listEnabled =
    isAuthenticated && (!canSelectResellerForLog || !!selectedAgentId);

  const {
    data: logData,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<PaginatedResponse<ActivationErrorLogItem>>({
    queryKey: [
      'activation-error-log',
      canSelectResellerForLog ? selectedAgentId : 'me',
      page,
      PAGE_SIZE,
      statusCodeParam ?? null,
      appliedRequestPath.trim(),
      appliedSubscriberUsername.trim(),
      appliedFromDate,
      appliedToDate,
    ] as const,
    queryFn: () =>
      apiService.getActivationErrorLog({
        page,
        pageSize: PAGE_SIZE,
        agentId: canSelectResellerForLog ? selectedAgentId : undefined,
        statusCode: statusCodeParam,
        requestPath: appliedRequestPath.trim() || undefined,
        subscriberUsername: appliedSubscriberUsername.trim() || undefined,
        fromDate: appliedFromDate || undefined,
        toDate: appliedToDate || undefined,
      }),
    enabled: listEnabled,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!error) return;
    showError('سجل الأخطاء', ApiService.showError(error));
  }, [error]);

  const handleApplyFilters = () => {
    setAppliedStatusCode(draftStatusCode);
    setAppliedRequestPath(draftRequestPath);
    setAppliedSubscriberUsername(draftSubscriberUsername);
    setAppliedFromDate(draftFromDate);
    setAppliedToDate(draftToDate);
    setPage(1);
  };

  const handleResetFilters = () => {
    setDraftStatusCode('');
    setDraftRequestPath('');
    setDraftSubscriberUsername('');
    setDraftFromDate('');
    setDraftToDate('');
    setAppliedStatusCode('');
    setAppliedRequestPath('');
    setAppliedSubscriberUsername('');
    setAppliedFromDate('');
    setAppliedToDate('');
    setPage(1);
  };

  const rows = logData?.data ?? [];

  if (!isAuthenticated) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <p className="text-center text-gray-600 dark:text-gray-400">يرجى تسجيل الدخول.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">سجل الأخطاء</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                أخطاء التفعيل (4xx و 5xx) على مسارات /api/activate/*
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={!listEnabled || isFetching}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            تحديث
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20 p-4 space-y-4 mb-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
            <Filter className="h-4 w-4 text-primary-600 dark:text-primary-400" />
            الفلاتر
          </div>

          {canSelectResellerForLog && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {pythonBackend ? 'الريسيلر' : 'الوكيل'}
              </label>
              <select
                value={selectedAgentId}
                onChange={(e) => {
                  setSelectedAgentId(e.target.value);
                  setPage(1);
                }}
                className="w-full sm:max-w-md rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
              >
                {pythonBackend && <option value="all">جميع الريسيلرز</option>}
                {pythonBackend
                  ? pythonResellers.map((r) => (
                      <option key={r.id} value={String(r.id)}>
                        {(r.name || '').trim() || String(r.id)}
                      </option>
                    ))
                  : adminAgents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {(a.companyName || a.fullName || a.username).trim() || a.id}
                      </option>
                    ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                رمز الحالة
              </label>
              <select
                value={draftStatusCode}
                onChange={(e) => setDraftStatusCode(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
              >
                <option value="">كل الأكواد</option>
                {COMMON_STATUS_CODES.filter(Boolean).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                بحث في المسار
              </label>
              <input
                type="text"
                value={draftRequestPath}
                onChange={(e) => setDraftRequestPath(e.target.value)}
                placeholder="مثال: latest-card"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                اسم المشترك
              </label>
              <input
                type="text"
                value={draftSubscriberUsername}
                onChange={(e) => setDraftSubscriberUsername(e.target.value)}
                placeholder="اختياري"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                من تاريخ
              </label>
              <input
                type="date"
                value={draftFromDate}
                onChange={(e) => setDraftFromDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                إلى تاريخ
              </label>
              <input
                type="date"
                value={draftToDate}
                onChange={(e) => setDraftToDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              مسح الفلاتر
            </button>
            <button
              type="button"
              onClick={handleApplyFilters}
              disabled={!listEnabled}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50"
            >
              تطبيق
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden relative min-h-[200px]">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 dark:bg-gray-900/50">
              <WifiLoaderComponent />
            </div>
          )}
          <div className="wakeel-table-scroll">
            <table className="min-w-full text-right">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/30">
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    التاريخ
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">الحالة</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">الطريقة</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 min-w-[180px]">
                    المسار
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">المشترك</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">المنفّذ</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 min-w-[160px]">
                    الملخص
                  </th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">تفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {!listEnabled ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400 text-center">
                      {pythonBackend ? 'اختر ريسيلراً لعرض السجل.' : 'اختر وكيلاً لعرض السجل.'}
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400 text-center">
                      لا توجد أخطاء مطابقة.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr
                      key={row.id || `${row.createdAt}-${idx}`}
                      className="border-b border-gray-100 dark:border-gray-700/80 hover:bg-gray-50/80 dark:hover:bg-gray-700/40"
                    >
                      <td className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200 whitespace-nowrap tabular-nums">
                        {row.createdAt
                          ? formatDate(row.createdAt, { dateStyle: 'short', timeStyle: 'short' })
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-sm">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${statusCodeBadgeClass(row.statusCode)}`}
                        >
                          {row.statusCode || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200 font-mono text-xs">
                        {row.httpMethod || '—'}
                      </td>
                      <td
                        className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200 max-w-[240px]"
                        title={row.requestPath}
                      >
                        <span className="line-clamp-2 break-all font-mono text-xs">{row.requestPath || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200 tabular-nums">
                        {row.subscriberUsername || '—'}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200 max-w-[120px] truncate">
                        {row.actorUsername || '—'}
                      </td>
                      <td
                        className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200 max-w-[220px]"
                        title={row.errorSummary}
                      >
                        <span className="line-clamp-2 break-words">{row.errorSummary || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-sm">
                        <button
                          type="button"
                          onClick={() => setDetailRow(row)}
                          className="text-primary-600 dark:text-primary-400 hover:underline text-xs font-medium"
                        >
                          عرض
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {listEnabled && (logData?.totalItems ?? 0) > 0 && (
            <Pagination
              currentPage={logData?.currentPage ?? page}
              totalPages={logData?.totalPages ?? 1}
              totalItems={logData?.totalItems ?? 0}
              pageSize={logData?.pageSize ?? PAGE_SIZE}
              hasNextPage={logData?.hasNextPage ?? false}
              hasPreviousPage={logData?.hasPreviousPage ?? false}
              onPageChange={setPage}
            />
          )}
        </div>
      </div>

      {detailRow && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="error-log-detail-title"
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 id="error-log-detail-title" className="text-lg font-bold text-gray-900 dark:text-white">
                تفاصيل الخطأ
              </h3>
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">الحالة: </span>
                  <span className="font-semibold tabular-nums">{detailRow.statusCode}</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">الطريقة: </span>
                  <span className="font-mono">{detailRow.httpMethod}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-gray-500 dark:text-gray-400">المسار: </span>
                  <span className="font-mono text-xs break-all">{detailRow.requestPath}</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">المشترك: </span>
                  {detailRow.subscriberUsername || '—'}
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">المنفّذ: </span>
                  {detailRow.actorUsername || '—'}
                </div>
                {detailRow.resellerId != null && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">الريسيلر: </span>
                    {detailRow.resellerId}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">الملخص</p>
                <p className="text-gray-900 dark:text-white">{detailRow.errorSummary || '—'}</p>
              </div>
              {detailRow.requestBody?.trim() && (
                <div>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">جسم الطلب</p>
                  <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                    {formatJsonForDisplay(detailRow.requestBody)}
                  </pre>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">رد الخادم</p>
                <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-60">
                  {formatJsonForDisplay(detailRow.responseBody)}
                </pre>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/90 dark:bg-gray-900/40 flex justify-end">
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivationErrorLogSettings;
