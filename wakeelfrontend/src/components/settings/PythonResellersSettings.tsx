import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiService, ApiService } from '../../services/api';
import { clearCachedSubscribers } from '../../services/offlineSync';
import type { ApiReseller, ApiResellerCreateRequest, ApiResellerUpdateRequest } from '../../types';
import { showError, showSuccess } from '../../utils/notifications';
import {
  SELECTED_RESELLER_STORAGE_KEY,
  setSelectedResellerId,
} from '../../utils/selectedReseller';
import { CheckCircle2, Pencil, Plus, Store, Trash2, RefreshCw } from 'lucide-react';

const RESELLERS_QUERY_KEY = ['apiResellers'] as const;

const PROVIDER_TYPE_OPTIONS = [
  { value: 'sas', label: 'SAS (كلاسيكي)' },
  { value: 'nbtel', label: 'NB Tel (nbtel)' },
] as const;

const ACTIVATION_MODE_OPTIONS = [
  { value: 'user_portal', label: 'بوابة المشترك (user_portal) — SAS كلاسيك' },
  { value: 'admin_direct', label: 'تفعيل أدمن مباشر (admin_direct) — NB Tel' },
] as const;

const DEFAULT_PROVIDER_TYPE = 'sas';

function defaultActivationModeForProvider(provider: string): string {
  return provider === 'nbtel' ? 'admin_direct' : 'user_portal';
}

function providerTypeLabel(value?: string): string {
  const v = (value ?? '').trim();
  return PROVIDER_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? (v || '—');
}

const PythonResellersSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: resellers = [], isLoading } = useQuery({
    queryKey: RESELLERS_QUERY_KEY,
    queryFn: () => apiService.getApiResellers(),
  });

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [providerType, setProviderType] = useState(DEFAULT_PROVIDER_TYPE);
  const [sasApiUrl, setSasApiUrl] = useState('');
  const [sasUsername, setSasUsername] = useState('');
  const [sasPassword, setSasPassword] = useState('');
  const [sasAesKey, setSasAesKey] = useState('');
  const [activationPassword, setActivationPassword] = useState('');
  const [activationMode, setActivationMode] = useState(() =>
    defaultActivationModeForProvider(DEFAULT_PROVIDER_TYPE)
  );
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const needsAesKey = providerType === 'nbtel';

  const resetForm = () => {
    setEditId(null);
    setShowForm(false);
    setName('');
    setProviderType(DEFAULT_PROVIDER_TYPE);
    setSasApiUrl('');
    setSasUsername('');
    setSasPassword('');
    setSasAesKey('');
    setActivationPassword('');
    setActivationMode(defaultActivationModeForProvider(DEFAULT_PROVIDER_TYPE));
    setIsDefault(false);
    setIsActive(true);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
    setIsDefault(resellers.length === 0);
  };

  const openEdit = (r: ApiReseller) => {
    setEditId(r.id);
    setShowForm(true);
    setName(r.name);
    setProviderType(r.provider_type?.trim() || DEFAULT_PROVIDER_TYPE);
    setSasApiUrl(r.sas_api_url);
    setSasUsername(r.sas_username);
    setSasPassword('');
    setSasAesKey('');
    setActivationPassword('');
    setActivationMode(
      r.activation_mode?.trim() || defaultActivationModeForProvider(r.provider_type ?? DEFAULT_PROVIDER_TYPE)
    );
    setIsDefault(r.is_default);
    setIsActive(r.is_active);
  };

  const createMutation = useMutation({
    mutationFn: (body: ApiResellerCreateRequest) => apiService.createApiReseller(body),
    onSuccess: async (created) => {
      queryClient.invalidateQueries({ queryKey: RESELLERS_QUERY_KEY });
      showSuccess('تم الحفظ', 'تم إنشاء الرسيلر.');
      if (created.is_default) {
        try {
          await apiService.selectApiReseller(created.id);
          setSelectedResellerId(created.id);
        } catch {
          /* */
        }
      }
      resetForm();
    },
    onError: (err: unknown) => showError('خطأ', ApiService.showError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: ApiResellerUpdateRequest }) =>
      apiService.updateApiReseller(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RESELLERS_QUERY_KEY });
      showSuccess('تم الحفظ', 'تم تحديث الرسيلر.');
      resetForm();
    },
    onError: (err: unknown) => showError('خطأ', ApiService.showError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiService.deleteApiReseller(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RESELLERS_QUERY_KEY });
      showSuccess('تم الحذف', 'تم حذف الرسيلر.');
    },
    onError: (err: unknown) => showError('خطأ', ApiService.showError(err)),
  });

  const selectMutation = useMutation({
    mutationFn: (id: number) => apiService.selectApiReseller(id),
    onSuccess: (res) => {
      setSelectedResellerId(res.reseller_id);
      try {
        localStorage.setItem(SELECTED_RESELLER_STORAGE_KEY, String(res.reseller_id));
      } catch {
        /* ignore */
      }
      void clearCachedSubscribers();
      queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      queryClient.invalidateQueries({ queryKey: ['myResellers'] });
      showSuccess(
        'تم الاختيار',
        res.sas_connected
          ? `«${res.reseller_name}» — جلسة SAS جاهزة. حدّث البيانات من صفحة المشتركين عند الحاجة.`
          : `«${res.reseller_name}» — تحقق من إعدادات SAS.`
      );
    },
    onError: (err: unknown) => showError('فشل الربط', ApiService.showError(err)),
  });

  const handleSave = () => {
    if (!name.trim()) {
      showError('خطأ', 'اسم الرسيلر مطلوب.');
      return;
    }
    if (!sasApiUrl.trim()) {
      showError('خطأ', 'رابط SAS مطلوب.');
      return;
    }
    if (!sasUsername.trim()) {
      showError('خطأ', 'اسم مستخدم SAS مطلوب.');
      return;
    }
    if (editId == null && !sasPassword) {
      showError('خطأ', 'كلمة مرور SAS مطلوبة عند الإنشاء.');
      return;
    }
    if (editId == null && !activationPassword.trim()) {
      showError('خطأ', 'كلمة سر التفعيل مطلوبة عند الإنشاء.');
      return;
    }
    if (editId == null && needsAesKey && !sasAesKey.trim()) {
      showError('خطأ', 'مفتاح AES (sas_aes_key) مطلوب لموفر NB Tel.');
      return;
    }

    if (editId != null) {
      const body: ApiResellerUpdateRequest = {
        name: name.trim(),
        sas_api_url: sasApiUrl.trim(),
        sas_username: sasUsername.trim(),
        provider_type: providerType.trim() || DEFAULT_PROVIDER_TYPE,
        activation_mode: activationMode.trim() || defaultActivationModeForProvider(providerType),
        is_default: isDefault,
        is_active: isActive,
      };
      if (sasPassword.trim()) body.sas_password = sasPassword.trim();
      if (activationPassword.trim()) body.activation_password = activationPassword.trim();
      if (sasAesKey.trim()) body.sas_aes_key = sasAesKey.trim();
      updateMutation.mutate({ id: editId, body });
    } else {
      const body: ApiResellerCreateRequest = {
        name: name.trim(),
        sas_api_url: sasApiUrl.trim(),
        sas_username: sasUsername.trim(),
        sas_password: sasPassword,
        provider_type: providerType.trim() || DEFAULT_PROVIDER_TYPE,
        activation_password: activationPassword.trim(),
        activation_mode: activationMode.trim() || defaultActivationModeForProvider(providerType),
        is_default: isDefault,
      };
      if (sasAesKey.trim()) body.sas_aes_key = sasAesKey.trim();
      createMutation.mutate(body);
    }
  };

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    selectMutation.isPending;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Store className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">الرسيلرز (SAS)</h2>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm"
        >
          <Plus className="h-4 w-4" />
          إضافة رسيلر
        </button>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        عرّف الرسيلر مرة واحدة في الباكند. عند جلب المشتركين أو البطاقات يقوم الخادم تلقائياً بتسجيل الدخول إلى SAS
        (الرسيلر الافتراضي أو المختار عبر <span className="font-mono text-xs">X-Reseller-Id</span>).
      </p>

      {isLoading ? (
        <p className="text-gray-500">جاري التحميل...</p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-600">
          {resellers.map((r) => (
            <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 dark:text-white">{r.name}</span>
                  {r.is_default && (
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                      افتراضي
                    </span>
                  )}
                  {!r.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      معطّل
                    </span>
                  )}
                  {r.provider_type && (
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                      {providerTypeLabel(r.provider_type)}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 font-mono">{r.sas_api_url}</p>
                <p className="text-xs text-gray-400">{r.sas_username}</p>
                {r.has_activation_password ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                    كلمة سر التفعيل: مُعرَّفة
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    كلمة سر التفعيل: غير مُعرَّفة
                  </p>
                )}
                {r.provider_type === 'nbtel' && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    مفتاح AES: {r.has_sas_aes_key ? 'مُعرَّف' : 'غير مُعرَّف'}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => selectMutation.mutate(r.id)}
                  disabled={busy}
                  className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-md disabled:opacity-50 flex items-center gap-1"
                >
                  {selectMutation.isPending ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  اختيار / ربط SAS
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(r)}
                  className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  title="تعديل"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => window.confirm(`حذف «${r.name}»؟`) && deleteMutation.mutate(r.id)}
                  className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  title="حذف"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {resellers.length === 0 && !isLoading && (
        <p className="text-sm text-gray-500 mt-2">لا يوجد رسيلر. أضف رسيلر SAS لجلب المشتركين.</p>
      )}

      {showForm && (
        <div className="mt-4 border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-sm font-medium mb-3">{editId != null ? 'تعديل رسيلر' : 'رسيلر جديد'}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="text-gray-700 dark:text-gray-300">الاسم *</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700 dark:text-gray-300">نوع المزود (provider_type) *</span>
              <select
                value={providerType}
                onChange={(e) => {
                  const next = e.target.value;
                  setProviderType(next);
                  setActivationMode(defaultActivationModeForProvider(next));
                }}
                className="mt-1 w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
              >
                {PROVIDER_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-700 dark:text-gray-300">وضع التفعيل (activation_mode) *</span>
              <select
                value={activationMode}
                onChange={(e) => setActivationMode(e.target.value)}
                className="mt-1 w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
              >
                {ACTIVATION_MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-gray-700 dark:text-gray-300">رابط SAS (sas_api_url) *</span>
              <input
                value={sasApiUrl}
                onChange={(e) => setSasApiUrl(e.target.value)}
                placeholder={
                  providerType === 'nbtel'
                    ? 'https://reseller.nbtel.iq'
                    : 'http://HOST/admin/api/index.php/api'
                }
                className="mt-1 w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm font-mono"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700 dark:text-gray-300">اسم مستخدم SAS *</span>
              <input
                value={sasUsername}
                onChange={(e) => setSasUsername(e.target.value)}
                className="mt-1 w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700 dark:text-gray-300">
                كلمة مرور SAS {editId != null ? '(اتركها فارغة بدون تغيير)' : '*'}
              </span>
              <input
                type="password"
                value={sasPassword}
                onChange={(e) => setSasPassword(e.target.value)}
                className="mt-1 w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
              />
            </label>
            {needsAesKey && (
              <label className="block text-sm sm:col-span-2">
                <span className="text-gray-700 dark:text-gray-300">
                  مفتاح AES (sas_aes_key){' '}
                  {editId != null ? '(اتركها فارغة بدون تغيير)' : '*'}
                </span>
                <input
                  type="password"
                  value={sasAesKey}
                  onChange={(e) => setSasAesKey(e.target.value)}
                  autoComplete="new-password"
                  className="mt-1 w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm font-mono"
                />
                {editId != null && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    لا يُعرض المفتاح الحالي — أدخل قيمة جديدة فقط عند التحديث.
                  </p>
                )}
              </label>
            )}
            <label className="block text-sm sm:col-span-2">
              <span className="text-gray-700 dark:text-gray-300">
                كلمة سر التفعيل (activation_password){' '}
                {editId != null ? '(اتركها فارغة بدون تغيير)' : '*'}
              </span>
              <input
                type="password"
                value={activationPassword}
                onChange={(e) => setActivationPassword(e.target.value)}
                autoComplete="new-password"
                className="mt-1 w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
              />
              {editId != null && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  لا تُعرض كلمة السر الحالية — أدخل قيمة جديدة فقط عند التحديث.
                </p>
              )}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              رسيلر افتراضي
            </label>
            {editId != null && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                مفعّل
              </label>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm disabled:opacity-50"
            >
              {editId != null ? 'حفظ' : 'إنشاء'}
            </button>
            <button type="button" onClick={resetForm} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-lg text-sm">
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PythonResellersSettings;
