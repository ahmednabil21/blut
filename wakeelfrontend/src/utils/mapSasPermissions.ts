import type { User } from '../types';
import {
  DEFAULT_SAS_EMPLOYEE_PERMISSIONS,
  SasEmployeePermissions,
} from '../types/sasEmployeePermissions';

/** دمج صلاحيات SAS على كائن User للقوائم والحماية في الواجهة */
export function applySasPermissionsToUser(
  user: User,
  perms: Partial<SasEmployeePermissions> | null | undefined,
  role: string
): User {
  const isAdmin = role === 'agent_admin';
  const p = { ...DEFAULT_SAS_EMPLOYEE_PERMISSIONS, ...(perms || {}) };

  if (isAdmin) {
    return {
      ...user,
      canAccessSubscriberDashboard: true,
      canViewAllSubscribers: true,
      sasCanViewSubscribersBySearch: true,
      canActivateSubscriber: true,
      canEditSubscriber: true,
      canPayDebt: true,
      canDeleteSubscriber: true,
      canAccessInvoices: true,
      canManageMaterialsAndSales: true,
      canAccessDealers: true,
      sasCanDeleteDebt: true,
      sasCanAccessActivations: true,
      sasCanAccessSystemLog: true,
      sasCanViewEmployees: true,
      sasCanManageEmployees: true,
      sasCanAccessCards: true,
      sasCanSellMaterial: true,
      sasCanAddMaterial: true,
    };
  }

  return {
    ...user,
    canAccessSubscriberDashboard: p.can_access_statistics,
    canViewAllSubscribers: p.can_view_all_subscribers,
    sasCanViewSubscribersBySearch: p.can_view_subscribers_by_search,
    canActivateSubscriber: p.can_activate_subscriber,
    canEditSubscriber: p.can_edit_subscriber,
    canPayDebt: p.can_pay_debt,
    sasCanDeleteDebt: p.can_delete_debt,
    sasCanAccessActivations: p.can_access_activations,
    canManageMaterialsAndSales: p.can_sell_material || p.can_add_material,
    sasCanSellMaterial: p.can_sell_material,
    sasCanAddMaterial: p.can_add_material,
    sasCanAccessSystemLog: p.can_access_system_log,
    sasCanViewEmployees: p.can_view_employees,
    sasCanManageEmployees: p.can_manage_employees,
    sasCanAccessCards: p.can_access_cards,
    canAccessInvoices: p.can_access_activations,
    /** لا تُدار من SAS Panel — تبقى معطّلة للموظف حتى يضيفها الباكند */
    canReceiveTaskRequests: false,
    canManageEmployeeTasks: false,
    canAccessExpensesAndSalarySheet: false,
  };
}

export function sasPermissionFromLoginPayload(
  data: Record<string, unknown>
): Partial<SasEmployeePermissions> | undefined {
  const perms = data.permissions;
  if (!perms || typeof perms !== 'object') return undefined;
  return perms as Partial<SasEmployeePermissions>;
}
