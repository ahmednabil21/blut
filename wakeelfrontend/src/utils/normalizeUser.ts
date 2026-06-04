import { User, UserRole } from '../types';
import { mapPythonRoleToUserRole, mapRoleStringToUserRole, roleIdToUserRole } from './authLogin';
import { applySasPermissionsToUser, sasPermissionFromLoginPayload } from './mapSasPermissions';

function pickStr(r: Record<string, unknown>, camel: string, pascal: string): string {
  const a = r[camel];
  const b = r[pascal];
  if (typeof a === 'string') return a;
  if (typeof b === 'string') return b;
  if (a != null) return String(a);
  if (b != null) return String(b);
  return '';
}

function pickBool(r: Record<string, unknown>, camel: string, pascal: string): boolean | undefined {
  const a = r[camel];
  const b = r[pascal];
  const v = a !== undefined ? a : b;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === true) return true;
  if (v === 'false' || v === false) return false;
  return undefined;
}

function pickRole(r: Record<string, unknown>): UserRole {
  const roleRaw = r.role ?? r.Role;
  if (typeof roleRaw === 'number' && Number.isFinite(roleRaw)) {
    const mapped = roleIdToUserRole(roleRaw);
    if (mapped != null) return mapped;
  }
  if (typeof roleRaw === 'string') {
    const s = roleRaw.trim();
    if (s.includes('_') || s === 'employee') return mapPythonRoleToUserRole(s);
    return mapRoleStringToUserRole(s);
  }
  return UserRole.Subscriber;
}

function pickGuidList(r: Record<string, unknown>, camel: string, pascal: string): string[] | undefined {
  const raw = r[camel] ?? r[pascal];
  if (!Array.isArray(raw)) return undefined;
  return raw.map((x) => String(x));
}

/**
 * يوحّد كائن مستخدم قادماً من الـ API (camelCase أو PascalCase من ASP.NET).
 * يضمن قراءة صلاحيات الموظف مثل canAccessDealers بشكل صحيح في الواجهة.
 */
export function normalizeUser(raw: unknown): User {
  if (!raw || typeof raw !== 'object') {
    return {
      id: '',
      username: '',
      fullName: '',
      isActive: true,
      role: UserRole.Subscriber,
    };
  }
  const r = raw as Record<string, unknown>;

  const idRaw = r.id ?? r.Id;
  const id = idRaw != null ? String(idRaw) : pickStr(r, 'id', 'Id');
  const username = pickStr(r, 'username', 'Username');
  const fullName =
    pickStr(r, 'fullName', 'FullName') ||
    pickStr(r, 'full_name', 'FullName') ||
    pickStr(r, 'role_label_ar', 'roleLabelAr') ||
    pickStr(r, 'roleLabelAr', 'RoleLabelAr');
  const isActive = pickBool(r, 'isActive', 'IsActive');

  const u: User = {
    id,
    username,
    fullName,
    isActive: isActive !== false,
    role: pickRole(r),
    tenantPlanType: (r.tenantPlanType ?? r.TenantPlanType) as User['tenantPlanType'],
    standardPlanTierId: (r.standardPlanTierId ?? r.StandardPlanTierId) as User['standardPlanTierId'],
    standardPlanTier: (r.standardPlanTier ?? r.StandardPlanTier) as User['standardPlanTier'],
    maxResellers: (r.maxResellers ?? r.MaxResellers) as number | null | undefined,
    createdByAgentName: pickStr(r, 'createdByAgentName', 'CreatedByAgentName') || undefined,
    agentId: pickStr(r, 'agentId', 'AgentId') || undefined,
  };

  const permKeys: [keyof User, string, string][] = [
    ['canActivateSubscriber', 'canActivateSubscriber', 'CanActivateSubscriber'],
    ['canEditSubscriber', 'canEditSubscriber', 'CanEditSubscriber'],
    ['canDeleteSubscriber', 'canDeleteSubscriber', 'CanDeleteSubscriber'],
    ['canPayDebt', 'canPayDebt', 'CanPayDebt'],
    ['canAccessAccounts', 'canAccessAccounts', 'CanAccessAccounts'],
    ['canAccessDealers', 'canAccessDealers', 'CanAccessDealers'],
    ['canAccessInvoices', 'canAccessInvoices', 'CanAccessInvoices'],
    ['canAccessExpensesAndSalarySheet', 'canAccessExpensesAndSalarySheet', 'CanAccessExpensesAndSalarySheet'],
    ['canAccessSubscriberDashboard', 'canAccessSubscriberDashboard', 'CanAccessSubscriberDashboard'],
    ['canViewAllSubscribers', 'canViewAllSubscribers', 'CanViewAllSubscribers'],
    ['canReceiveTaskRequests', 'canReceiveTaskRequests', 'CanReceiveTaskRequests'],
    ['canManageEmployeeTasks', 'canManageEmployeeTasks', 'CanManageEmployeeTasks'],
    ['canManageMaterialsAndSales', 'canManageMaterialsAndSales', 'CanManageMaterialsAndSales'],
  ];
  const out = u as unknown as Record<string, boolean>;
  for (const [key, camel, pascal] of permKeys) {
    const b = pickBool(r, camel, pascal);
    if (b !== undefined) out[key as string] = b;
  }

  const allowed = pickGuidList(r, 'allowedResellerIds', 'AllowedResellerIds');
  if (allowed && allowed.length) u.allowedResellerIds = allowed;

  /** مطابقة افتراضيات Wakeel.Models.User: CanAccessAccounts = true — يمنع اعتبار الحقل المفقود كـ «لا صلاحية». */
  if (u.role === UserRole.Employee && u.canAccessAccounts === undefined) {
    u.canAccessAccounts = true;
  }

  const subType = r.subscriptionType ?? r.SubscriptionType;
  if (subType !== undefined && subType !== null) u.subscriptionType = Number(subType) as User['subscriptionType'];

  const ssd = r.subscriptionStartDate ?? r.SubscriptionStartDate;
  const sed = r.subscriptionEndDate ?? r.SubscriptionEndDate;
  if (typeof ssd === 'string') u.subscriptionStartDate = ssd;
  if (typeof sed === 'string') u.subscriptionEndDate = sed;

  const jobTitle = pickStr(r, 'jobTitle', 'JobTitle') || pickStr(r, 'job_title', 'JobTitle');
  if (jobTitle) u.jobTitle = jobTitle;
  const salaryRaw = r.salary ?? r.Salary;
  if (salaryRaw != null && salaryRaw !== '') u.salary = Number(salaryRaw);

  const roleStr = typeof r.role === 'string' ? r.role : '';
  const perms = sasPermissionFromLoginPayload(r);
  if (perms || roleStr === 'agent_admin' || roleStr === 'employee') {
    return applySasPermissionsToUser(u, perms, roleStr || (u.role === UserRole.Employee ? 'employee' : 'agent_admin'));
  }

  return u;
}

export function normalizeUserList(raw: unknown): User[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => normalizeUser(x));
}
