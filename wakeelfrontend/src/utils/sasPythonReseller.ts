import { apiService } from '../services/api';
import type { SasPythonLoginBody } from '../services/sasPythonApi';
import { sasPythonApi } from '../services/sasPythonApi';
import type { AgentReseller, FtthSubscribersExportResponse } from '../types';
import { ServiceType, UserRole } from '../types';
import { resolveSasCredentials, setStoredSasCredentials } from './sasCredentialsStorage';

/** رسيلر يستخدم SAS الخارجي */
export function isSasPythonReseller(r: AgentReseller): boolean {
  return r.serviceType === ServiceType.Sas || r.serviceType === ServiceType.Earthlink;
}

export function buildSasPythonLoginFromReseller(r: AgentReseller): SasPythonLoginBody | null {
  const sas_api_url = (r.baseUrl ?? '').trim().replace(/\/$/, '');
  const username = (r.username ?? '').trim();
  const password = (r.password ?? '').trim();
  if (!sas_api_url || !username || !password) return null;
  return { sas_api_url, username, password, sas_aes_key: null };
}

export function saveResellerAsSasCredentials(r: AgentReseller): void {
  const body = buildSasPythonLoginFromReseller(r);
  if (body) setStoredSasCredentials(body);
}

export async function loginSasPythonForReseller(r: AgentReseller): Promise<void> {
  const body = buildSasPythonLoginFromReseller(r);
  if (!body) {
    throw new Error(
      'اعتماديات SAS غير مكتملة. أضف رابط SAS واسم المستخدم وكلمة المرور واحفظها.'
    );
  }
  setStoredSasCredentials(body);
  await apiService.sasLogin(body);
}

/**
 * بعد تسجيل دخول التطبيق: POST /api/sas/login من الاعتماديات المحفوظة محلياً أو من .env
 */
export async function ensureSasPythonSessionAfterWakeelLogin(_role: UserRole): Promise<void> {
  const creds = resolveSasCredentials();
  if (!creds) return;
  try {
    await apiService.sasLogin(creds);
    console.info('[SAS] تم ربط جلسة SAS');
  } catch (err) {
    console.warn('[SAS] فشل ربط جلسة SAS:', err);
  }
}

export async function exportSasSubscribersViaPython(
  reseller: AgentReseller,
  onProgress?: (currentPage: number, lastPage: number) => void
): Promise<FtthSubscribersExportResponse> {
  const body = buildSasPythonLoginFromReseller(reseller);
  if (!body) {
    throw new Error('لا يمكن السحب: أكمل رابط SAS واسم المستخدم وكلمة المرور.');
  }
  setStoredSasCredentials(body);
  return sasPythonApi.loginAndFetchAllSubscribers(body, onProgress);
}
