import React, { useEffect, useState } from 'react';
import { X, Save, Calendar, User, Phone, Package, Lock, UserCircle } from 'lucide-react';
import { Subscriber } from '../types';
import { apiService } from '../services/api';

export interface SasSubscriberUpdatePayload {
  username?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  profileId?: string;
  expirationDate?: string;
  isActive?: boolean;
  zone?: string;
  fat?: string;
  note?: string;
}

interface SasProfileOption {
  id: string;
  name: string;
}

interface SasEditSubscriberModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscriber: Subscriber;
  onUpdated: () => void;
}

const SasEditSubscriberModal: React.FC<SasEditSubscriberModalProps> = ({
  isOpen,
  onClose,
  subscriber,
  onUpdated,
}) => {
  const [formData, setFormData] = useState<SasSubscriberUpdatePayload>({});
  const [profiles, setProfiles] = useState<SasProfileOption[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorText(null);
    setFormData({
      username: subscriber.username ?? '',
      password: '',
      firstName: subscriber.firstName ?? '',
      lastName: subscriber.lastName ?? '',
      phoneNumber: subscriber.phoneNumber ?? '',
      profileId:
        profiles.find((p) => p.name === subscriber.profileName)?.id ??
        '',
      expirationDate: subscriber.expirationDate
        ? subscriber.expirationDate.split('T')[0]
        : '',
      isActive: subscriber.isActive,
      zone: subscriber.zone ?? '',
      fat: subscriber.fat ?? '',
      note: subscriber.note ?? '',
    });
  }, [isOpen, subscriber, profiles]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setProfilesLoading(true);
    apiService
      .getSasProfiles()
      .then((list) => {
        if (!cancelled) setProfiles(list);
      })
      .catch(() => {
        if (!cancelled) setProfiles([]);
      })
      .finally(() => {
        if (!cancelled) setProfilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !profiles.length) return;
    const match = profiles.find((p) => p.name === subscriber.profileName);
    if (match) {
      setFormData((prev) => ({ ...prev, profileId: match.id }));
    }
  }, [isOpen, profiles, subscriber.profileName]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setErrorText(null);
    try {
      const payload: SasSubscriberUpdatePayload = {
        username: formData.username?.trim() || undefined,
        firstName: formData.firstName?.trim() || undefined,
        lastName: formData.lastName?.trim() || undefined,
        phoneNumber: formData.phoneNumber?.trim() || undefined,
        profileId: formData.profileId?.trim() || undefined,
        expirationDate: formData.expirationDate?.trim() || undefined,
        isActive: formData.isActive,
        zone: formData.zone?.trim() || undefined,
        fat: formData.fat?.trim() || undefined,
        note: formData.note?.trim() || undefined,
      };
      if (formData.password?.trim()) {
        payload.password = formData.password.trim();
      }
      await apiService.updateSasSubscriber(subscriber.id, payload);
      onUpdated();
      onClose();
    } catch (err: unknown) {
      let msg = 'حدث خطأ أثناء تحديث المشترك';
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const ax = err as { response?: { data?: { detail?: unknown } } };
        const detail = ax.response?.data?.detail;
        if (typeof detail === 'string') msg = detail;
        else if (detail && typeof detail === 'object' && 'message' in detail) {
          msg = String((detail as { message: unknown }).message);
        }
      }
      setErrorText(msg);
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              تعديل المشترك (SAS)
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {subscriber.fullName} — {subscriber.username}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {errorText && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-800 dark:text-red-200">
              {errorText}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                اسم المستخدم
              </label>
              <div className="relative">
                <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  name="username"
                  value={formData.username ?? ''}
                  onChange={handleInputChange}
                  required
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                كلمة المرور الجديدة
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="password"
                  name="password"
                  value={formData.password ?? ''}
                  onChange={handleInputChange}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                  placeholder="اتركه فارغاً بدون تغيير"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                الاسم الأول
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName ?? ''}
                  onChange={handleInputChange}
                  required
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                اسم العائلة
              </label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName ?? ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                رقم الهاتف
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber ?? ''}
                  onChange={handleInputChange}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                الباقة
              </label>
              <div className="relative">
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <select
                  name="profileId"
                  value={formData.profileId ?? ''}
                  onChange={handleInputChange}
                  disabled={profilesLoading}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                >
                  <option value="">
                    {profilesLoading ? 'جاري التحميل...' : 'اختر الباقة'}
                  </option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                المنطقة (مدينة SAS)
              </label>
              <input
                type="text"
                name="zone"
                value={formData.zone ?? ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                العنوان
              </label>
              <input
                type="text"
                name="fat"
                value={formData.fat ?? ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              تاريخ الانتهاء
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="date"
                name="expirationDate"
                value={formData.expirationDate ?? ''}
                onChange={handleInputChange}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sas-edit-active"
              name="isActive"
              checked={formData.isActive ?? true}
              onChange={handleInputChange}
              className="rounded border-gray-300"
            />
            <label htmlFor="sas-edit-active" className="text-sm text-gray-700 dark:text-gray-300">
              مشترك مفعّل على SAS
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              ملاحظات (SAS)
            </label>
            <textarea
              name="note"
              value={formData.note ?? ''}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isUpdating}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-md disabled:opacity-50"
            >
              {isUpdating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  <span>جاري التحديث...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>حفظ التعديلات</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SasEditSubscriberModal;
