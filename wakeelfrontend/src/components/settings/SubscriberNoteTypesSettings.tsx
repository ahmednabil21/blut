import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiService, ApiService } from '../../services/api';
import { showSuccess, showError } from '../../utils/notifications';
import { SubscriberNoteTypeOption } from '../../types';
import WifiLoaderComponent from '../WifiLoaderComponent';
import { Plus, X, Edit, Trash2, StickyNote } from 'lucide-react';

const SubscriberNoteTypesSettings: React.FC = () => {
  const queryClient = useQueryClient();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selected, setSelected] = useState<SubscriberNoteTypeOption | null>(null);
  const [form, setForm] = useState({
    label: '',
    requiresNoteText: false,
    sortOrder: '',
  });
  const [editForm, setEditForm] = useState({
    label: '',
    requiresNoteText: false,
    sortOrder: '',
    isActive: true,
  });

  const { data: noteTypes = [], isLoading } = useQuery({
    queryKey: ['subscriber-note-types', 'admin'],
    queryFn: () => apiService.getPythonSubscriberNoteTypes({ includeInactive: true }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['subscriber-note-types'] });
    queryClient.invalidateQueries({ queryKey: ['subscriber-note-types', 'admin'] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      apiService.createSubscriberNoteType({
        label: form.label.trim(),
        requiresNoteText: form.requiresNoteText,
        sortOrder: form.sortOrder.trim() ? Number(form.sortOrder) : undefined,
      }),
    onSuccess: () => {
      invalidate();
      setShowAddModal(false);
      setForm({ label: '', requiresNoteText: false, sortOrder: '' });
      showSuccess('تمت الإضافة', 'تم إضافة نوع الملاحظة');
    },
    onError: (err: unknown) => showError('خطأ', ApiService.showError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof apiService.updateSubscriberNoteType>[1] }) =>
      apiService.updateSubscriberNoteType(id, data),
    onSuccess: () => {
      invalidate();
      setShowEditModal(false);
      setSelected(null);
      showSuccess('تم التعديل', 'تم تحديث نوع الملاحظة');
    },
    onError: (err: unknown) => showError('خطأ', ApiService.showError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiService.deleteSubscriberNoteType(id),
    onSuccess: () => {
      invalidate();
      showSuccess('تم الحذف', 'تم حذف نوع الملاحظة');
    },
    onError: (err: unknown) => showError('خطأ', ApiService.showError(err)),
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <StickyNote className="h-6 w-6 text-primary-600 dark:text-primary-400 flex-shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">أنواع ملاحظات المشتركين</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              إدارة القائمة المستخدمة في فلترة المشتركين وإدخال الملاحظات
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium shrink-0"
        >
          <Plus className="h-4 w-4" />
          إضافة نوع
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <WifiLoaderComponent />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-right">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">#</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">الاسم</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">نص مطلوب</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">الترتيب</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">الحالة</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {noteTypes.map((row) => (
                <tr key={row.value} className={row.isActive === false ? 'opacity-60' : ''}>
                  <td className="px-4 py-3 text-sm font-mono">{row.value}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{row.label}</td>
                  <td className="px-4 py-3 text-sm">{row.requiresNoteText ? 'نعم' : 'لا'}</td>
                  <td className="px-4 py-3 text-sm">{row.sortOrder ?? '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    {row.isActive === false ? (
                      <span className="text-amber-600 dark:text-amber-400">معطّل</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">فعّال</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(row);
                          setEditForm({
                            label: row.label,
                            requiresNoteText: !!row.requiresNoteText,
                            sortOrder: row.sortOrder != null ? String(row.sortOrder) : '',
                            isActive: row.isActive !== false,
                          });
                          setShowEditModal(true);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                        title="تعديل"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm(`حذف «${row.label}»؟`)) return;
                          deleteMutation.mutate(row.value);
                        }}
                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                        title="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {noteTypes.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">لا توجد أنواع بعد</div>
          )}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">إضافة نوع ملاحظة</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              className="p-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!form.label.trim()) {
                  showError('خطأ', 'أدخل اسم النوع');
                  return;
                }
                createMutation.mutate();
              }}
            >
              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">الاسم</label>
                <input
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  maxLength={128}
                  autoFocus
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={form.requiresNoteText}
                  onChange={(e) => setForm((f) => ({ ...f, requiresNoteText: e.target.checked }))}
                />
                يتطلب إدخال نص حر (مثل «أخرى»)
              </label>
              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">الترتيب (اختياري)</label>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-lg border">
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-primary-600 text-white disabled:opacity-50"
                >
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">تعديل نوع ملاحظة</h3>
              <button type="button" onClick={() => setShowEditModal(false)} className="p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              className="p-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!editForm.label.trim()) {
                  showError('خطأ', 'أدخل اسم النوع');
                  return;
                }
                updateMutation.mutate({
                  id: selected.value,
                  data: {
                    label: editForm.label.trim(),
                    requiresNoteText: editForm.requiresNoteText,
                    sortOrder: editForm.sortOrder.trim() ? Number(editForm.sortOrder) : undefined,
                    isActive: editForm.isActive,
                  },
                });
              }}
            >
              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">الاسم</label>
                <input
                  value={editForm.label}
                  onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  maxLength={128}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={editForm.requiresNoteText}
                  onChange={(e) => setEditForm((f) => ({ ...f, requiresNoteText: e.target.checked }))}
                />
                يتطلب إدخال نص حر
              </label>
              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">الترتيب</label>
                <input
                  type="number"
                  value={editForm.sortOrder}
                  onChange={(e) => setEditForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                فعّال (يظهر في القوائم)
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 rounded-lg border">
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-primary-600 text-white disabled:opacity-50"
                >
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriberNoteTypesSettings;
