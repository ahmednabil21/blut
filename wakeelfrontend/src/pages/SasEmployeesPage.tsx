import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService, ApiService } from '../services/api';
import { showSuccess, showError } from '../utils/notifications';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import {
  DEFAULT_SAS_EMPLOYEE_PERMISSIONS,
  SAS_PERMISSION_KEYS,
  SAS_PERMISSION_LABELS,
  SasEmployeeCreateRequest,
  SasEmployeePermissions,
  SasEmployeeRecord,
  SasEmployeeUpdateRequest,
  getSasPermissionChecked,
} from '../types/sasEmployeePermissions';
import WifiLoaderComponent from '../components/WifiLoaderComponent';
import { UserPlus, X, Edit, Trash2 } from 'lucide-react';

const SasEmployeesPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === UserRole.Agent || user?.role === UserRole.Admin;
  const canView = isAdmin || !!user?.sasCanViewEmployees;
  const canManage = isAdmin || !!user?.sasCanManageEmployees;

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selected, setSelected] = useState<SasEmployeeRecord | null>(null);
  const [form, setForm] = useState<SasEmployeeCreateRequest>({
    full_name: '',
    username: '',
    password: '',
    job_title: '',
    salary: undefined,
    permissions: { ...DEFAULT_SAS_EMPLOYEE_PERMISSIONS },
    is_active: true,
  });
  const [editForm, setEditForm] = useState<SasEmployeeUpdateRequest>({
    full_name: '',
    is_active: true,
    permissions: { ...DEFAULT_SAS_EMPLOYEE_PERMISSIONS },
  });

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['sas-employees'],
    queryFn: () => apiService.getSasEmployees(),
    enabled: !!user && canView,
  });

  const createMutation = useMutation({
    mutationFn: (data: SasEmployeeCreateRequest) => apiService.createSasEmployee(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sas-employees'] });
      setShowAddModal(false);
      setForm({
        full_name: '',
        username: '',
        password: '',
        job_title: '',
        salary: undefined,
        permissions: { ...DEFAULT_SAS_EMPLOYEE_PERMISSIONS },
        is_active: true,
      });
      showSuccess('تمت الإضافة', 'تم إضافة الموظف بنجاح');
    },
    onError: (err: unknown) => showError('خطأ', ApiService.showError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: SasEmployeeUpdateRequest }) =>
      apiService.updateSasEmployee(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sas-employees'] });
      setShowEditModal(false);
      setSelected(null);
      showSuccess('تم التعديل', 'تم تحديث الموظف بنجاح');
    },
    onError: (err: unknown) => showError('خطأ', ApiService.showError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiService.deleteSasEmployee(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sas-employees'] });
      showSuccess('تم الحذف', 'تم حذف الموظف بنجاح');
    },
    onError: (err: unknown) => showError('خطأ', ApiService.showError(err)),
  });

  const setPerm = (
    target: 'add' | 'edit',
    key: keyof SasEmployeePermissions,
    value: boolean
  ) => {
    if (target === 'add') {
      setForm((f) => ({
        ...f,
        permissions: { ...(f.permissions || {}), [key]: value },
      }));
    } else {
      setEditForm((f) => ({
        ...f,
        permissions: { ...(f.permissions || {}), [key]: value },
      }));
    }
  };

  const openEdit = (emp: SasEmployeeRecord) => {
    setSelected(emp);
    setEditForm({
      full_name: emp.full_name,
      username: emp.username,
      job_title: emp.job_title || '',
      salary: emp.salary ?? undefined,
      is_active: emp.is_active,
      permissions: { ...DEFAULT_SAS_EMPLOYEE_PERMISSIONS, ...emp.permissions },
    });
    setShowEditModal(true);
  };

  if (!canView) return null;

  return (
    <div className="p-3 sm:p-4 lg:p-6">
      <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <UserPlus className="h-6 w-6" />
            الموظفون
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            إدارة حسابات الموظفين وصلاحياتهم
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            إضافة موظف
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <WifiLoaderComponent />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">الاسم</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">المستخدم</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">العمل</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">الراتب</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">الحالة</th>
                {canManage && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">إجراءات</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{emp.full_name}</td>
                  <td className="px-4 py-3 text-sm font-mono" dir="ltr">
                    {emp.username}
                  </td>
                  <td className="px-4 py-3 text-sm">{emp.job_title || '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    {emp.salary != null ? Number(emp.salary).toLocaleString('ar-IQ') : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {emp.is_active ? (
                      <span className="text-green-600">نشط</span>
                    ) : (
                      <span className="text-red-600">معطّل</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-sm flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(emp)}
                        className="text-blue-600 hover:text-blue-800"
                        title="تعديل"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`حذف الموظف ${emp.full_name}؟`)) {
                            deleteMutation.mutate(emp.id);
                          }
                        }}
                        className="text-red-600 hover:text-red-800"
                        title="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {employees.length === 0 && (
            <p className="text-center py-8 text-gray-500">لا يوجد موظفون</p>
          )}
        </div>
      )}

      {showAddModal && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">إضافة موظف</h2>
              <button type="button" onClick={() => setShowAddModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-700"
                placeholder="اسم الموظف"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
              <input
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-700"
                placeholder="اسم المستخدم"
                dir="ltr"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
              <input
                type="password"
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-700"
                placeholder="كلمة السر"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <input
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-700"
                placeholder="عمل الموظف"
                value={form.job_title || ''}
                onChange={(e) => setForm({ ...form, job_title: e.target.value })}
              />
              <input
                type="number"
                min={0}
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-700"
                placeholder="راتب الموظف"
                value={form.salary ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    salary: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">صلاحيات الموظف</p>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                  {SAS_PERMISSION_KEYS.map((key) => (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={getSasPermissionChecked(form.permissions, key)}
                        onChange={(e) => setPerm('add', key, e.target.checked)}
                      />
                      {SAS_PERMISSION_LABELS[key]}
                    </label>
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={createMutation.isPending}
                onClick={() => {
                  if (!form.full_name.trim() || !form.username.trim() || !form.password) {
                    showError('خطأ', 'يرجى تعبئة الاسم واسم المستخدم وكلمة السر');
                    return;
                  }
                  createMutation.mutate(form);
                }}
                className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selected && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">تعديل موظف</h2>
              <button type="button" onClick={() => setShowEditModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-700"
                value={editForm.full_name || ''}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
              />
              <input
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-700"
                dir="ltr"
                value={editForm.username || ''}
                onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
              />
              <input
                type="password"
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-700"
                placeholder="كلمة سر جديدة (اختياري)"
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value || undefined })}
              />
              <input
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-700"
                placeholder="عمل الموظف"
                value={editForm.job_title || ''}
                onChange={(e) => setEditForm({ ...editForm, job_title: e.target.value })}
              />
              <input
                type="number"
                min={0}
                className="w-full border rounded-lg px-3 py-2 dark:bg-gray-700"
                placeholder="الراتب"
                value={editForm.salary ?? ''}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    salary: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editForm.is_active !== false}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                />
                حساب نشط
              </label>
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">صلاحيات الموظف</p>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                  {SAS_PERMISSION_KEYS.map((key) => (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={getSasPermissionChecked(editForm.permissions, key)}
                        onChange={(e) => setPerm('edit', key, e.target.checked)}
                      />
                      {SAS_PERMISSION_LABELS[key]}
                    </label>
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ id: selected.id, data: editForm })}
                className="w-full py-2 bg-blue-600 text-white rounded-lg"
              >
                حفظ التعديلات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SasEmployeesPage;
