/** صلاحيات موظف SAS Panel (FastAPI) */

export interface SasEmployeePermissions {
  can_access_statistics: boolean;
  can_view_all_subscribers: boolean;
  can_view_subscribers_by_search: boolean;
  can_activate_subscriber: boolean;
  can_edit_subscriber: boolean;
  can_pay_debt: boolean;
  can_delete_debt: boolean;
  can_access_activations: boolean;
  can_sell_material: boolean;
  can_add_material: boolean;
  can_access_system_log: boolean;
  can_view_employees: boolean;
  can_manage_employees: boolean;
  can_access_cards: boolean;
}

export const DEFAULT_SAS_EMPLOYEE_PERMISSIONS: SasEmployeePermissions = {
  can_access_statistics: false,
  can_view_all_subscribers: false,
  can_view_subscribers_by_search: true,
  can_activate_subscriber: true,
  can_edit_subscriber: true,
  can_pay_debt: true,
  can_delete_debt: false,
  can_access_activations: true,
  can_sell_material: false,
  can_add_material: false,
  can_access_system_log: false,
  can_view_employees: false,
  can_manage_employees: false,
  can_access_cards: true,
};

export const SAS_PERMISSION_KEYS: (keyof SasEmployeePermissions)[] = [
  'can_access_statistics',
  'can_view_all_subscribers',
  'can_view_subscribers_by_search',
  'can_activate_subscriber',
  'can_edit_subscriber',
  'can_pay_debt',
  'can_delete_debt',
  'can_access_activations',
  'can_sell_material',
  'can_add_material',
  'can_access_system_log',
  'can_view_employees',
  'can_manage_employees',
  'can_access_cards',
];

export const SAS_PERMISSION_LABELS: Record<keyof SasEmployeePermissions, string> = {
  can_access_statistics: 'صفحة الإحصائيات',
  can_view_all_subscribers: 'عرض كل المشتركين (بدون اشتراط البحث)',
  can_view_subscribers_by_search: 'عرض المشتركين بالبحث فقط (الاسم الأول والثاني أو اسم المستخدم)',
  can_activate_subscriber: 'تفعيل مشترك',
  can_edit_subscriber: 'تعديل مشترك',
  can_pay_debt: 'تسديد دين',
  can_delete_debt: 'حذف دين',
  can_access_activations: 'صفحة التفعيلات',
  can_sell_material: 'بيع مادة',
  can_add_material: 'إضافة مادة',
  can_access_system_log: 'صفحة سجل النظام',
  can_view_employees: 'عرض الموظفين',
  can_manage_employees: 'إدارة الموظفين (إضافة / تعديل / حذف)',
  can_access_cards: 'صفحة كروت الشحن',
};

export function getSasPermissionChecked(
  stored: Partial<SasEmployeePermissions> | null | undefined,
  key: keyof SasEmployeePermissions
): boolean {
  const v = stored?.[key];
  if (typeof v === 'boolean') return v;
  return DEFAULT_SAS_EMPLOYEE_PERMISSIONS[key];
}

export interface SasEmployeeRecord {
  id: number;
  username: string;
  full_name: string;
  job_title?: string | null;
  salary?: number | null;
  role: string;
  role_label_ar: string;
  is_active: boolean;
  permissions: SasEmployeePermissions;
  created_at: string;
  updated_at: string;
}

export interface SasEmployeeCreateRequest {
  full_name: string;
  username: string;
  password: string;
  job_title?: string;
  salary?: number;
  permissions?: Partial<SasEmployeePermissions>;
  is_active?: boolean;
}

export interface SasEmployeeUpdateRequest {
  full_name?: string;
  username?: string;
  password?: string;
  job_title?: string;
  salary?: number;
  permissions?: Partial<SasEmployeePermissions>;
  is_active?: boolean;
}
