import type { SasPythonLoginBody } from '../services/sasPythonApi';

const STORAGE_KEY = 'wakeel_sas_credentials';

export function getStoredSasCredentials(): SasPythonLoginBody | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SasPythonLoginBody;
    if (!parsed?.sas_api_url?.trim() || !parsed?.username?.trim() || !parsed?.password) {
      return null;
    }
    return {
      sas_api_url: parsed.sas_api_url.trim(),
      username: parsed.username.trim(),
      password: parsed.password,
      sas_aes_key: parsed.sas_aes_key ?? null,
    };
  } catch {
    return null;
  }
}

export function setStoredSasCredentials(body: SasPythonLoginBody): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(body));
}

export function clearStoredSasCredentials(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** اعتماديات SAS من متغيرات البيئة (تطوير فقط) */
export function getEnvSasCredentials(): SasPythonLoginBody | null {
  const sas_api_url = process.env.REACT_APP_SAS_API_URL?.trim();
  const username = process.env.REACT_APP_SAS_USERNAME?.trim();
  const password = process.env.REACT_APP_SAS_PASSWORD;
  if (!sas_api_url || !username || !password) return null;
  return { sas_api_url, username, password, sas_aes_key: null };
}

export function resolveSasCredentials(): SasPythonLoginBody | null {
  return getStoredSasCredentials() ?? getEnvSasCredentials();
}
