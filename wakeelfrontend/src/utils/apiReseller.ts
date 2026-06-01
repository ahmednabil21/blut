import type { AgentReseller, ApiReseller } from '../types';
import { ServiceType } from '../types';

export function normalizeApiReseller(raw: Record<string, unknown>): ApiReseller {
  return {
    id: Number(raw.id ?? 0),
    name: String(raw.name ?? ''),
    sas_api_url: String(raw.sas_api_url ?? ''),
    sas_username: String(raw.sas_username ?? ''),
    is_active: raw.is_active !== false,
    is_default: !!raw.is_default,
    provider_type:
      typeof raw.provider_type === 'string' ? raw.provider_type : undefined,
    activation_mode:
      typeof raw.activation_mode === 'string' ? raw.activation_mode : undefined,
    has_activation_password: !!raw.has_activation_password,
    has_sas_aes_key: !!raw.has_sas_aes_key,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : undefined,
  };
}

/** توافق مع واجهات تستخدم AgentReseller (المشتركين، التقارير، …) */
export function apiResellerToAgentReseller(r: ApiReseller): AgentReseller {
  return {
    id: String(r.id),
    name: r.name,
    serviceType: ServiceType.Sas,
    baseUrl: r.sas_api_url,
    username: r.sas_username,
    displayOrder: r.is_default ? 0 : r.id,
  };
}
