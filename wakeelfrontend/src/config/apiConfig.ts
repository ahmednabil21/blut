const PRODUCTION_API_BASE = 'https://bult.execute-iq.com/api';
const DEVELOPMENT_API_BASE = 'http://localhost:8000/api';

/** عنوان باكند FastAPI — ينتهي بـ /api */
export function getApiBaseUrl(): string {
  const raw = process.env.REACT_APP_API_URL?.trim();
  if (raw) return raw.replace(/\/$/, '');
  return process.env.NODE_ENV === 'production' ? PRODUCTION_API_BASE : DEVELOPMENT_API_BASE;
}

export function isPythonBackend(): boolean {
  if (process.env.REACT_APP_BACKEND === 'python') return true;
  const base = getApiBaseUrl().toLowerCase();
  return base.includes(':8000') || (!base.includes('wakeel') && base.endsWith('/api'));
}
