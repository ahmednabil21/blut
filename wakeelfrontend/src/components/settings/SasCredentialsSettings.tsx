import React, { useEffect, useState } from 'react';
import { apiService } from '../../services/api';
import { showError, showSuccess } from '../../utils/notifications';
import {
  getStoredSasCredentials,
  resolveSasCredentials,
  setStoredSasCredentials,
} from '../../utils/sasCredentialsStorage';
import { Save, Key } from 'lucide-react';

/** حفظ اعتماديات SAS محلياً وربط POST /api/sas/login */
const SasCredentialsSettings: React.FC = () => {
  const [sasApiUrl, setSasApiUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const c = getStoredSasCredentials() ?? resolveSasCredentials();
    if (c) {
      setSasApiUrl(c.sas_api_url);
      setUsername(c.username);
      setPassword(c.password);
    }
  }, []);

  const handleSave = async () => {
    const sas_api_url = sasApiUrl.trim();
    const u = username.trim();
    const p = password;
    if (!sas_api_url || !u || !p) {
      showError('اعتماديات SAS', 'أكمل رابط SAS واسم المستخدم وكلمة المرور.');
      return;
    }
    setSaving(true);
    try {
      const body = { sas_api_url, username: u, password: p, sas_aes_key: null };
      setStoredSasCredentials(body);
      await apiService.sasLogin(body);
      showSuccess('تم الحفظ', 'تم ربط جلسة SAS. يمكنك الآن جلب المشتركين.');
    } catch (err: unknown) {
      showError('فشل الربط', err instanceof Error ? err.message : 'تحقق من الاعتماديات');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
        <Key className="h-5 w-5" />
        <h3 className="font-semibold">اعتماديات SAS (لوحة المزوّد)</h3>
      </div>
      <p className="text-sm text-amber-800/90 dark:text-amber-300/90">
        بعد تسجيل دخول التطبيق، يُربط SAS عبر <span className="font-mono text-xs">POST /api/sas/login</span>{' '}
        لجلب المشتركين. تُحفظ محلياً في المتصفح.
      </p>
      <div className="grid gap-3 sm:grid-cols-1">
        <label className="block text-sm">
          <span className="text-gray-700 dark:text-gray-300">رابط SAS (sas_api_url)</span>
          <input
            type="url"
            value={sasApiUrl}
            onChange={(e) => setSasApiUrl(e.target.value)}
            placeholder="http://HOST/admin/api/index.php/api"
            className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 text-sm"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-gray-700 dark:text-gray-300">اسم المستخدم SAS</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700 dark:text-gray-300">كلمة المرور SAS</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-sm disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {saving ? 'جاري الربط...' : 'حفظ وربط SAS'}
      </button>
    </div>
  );
};

export default SasCredentialsSettings;
