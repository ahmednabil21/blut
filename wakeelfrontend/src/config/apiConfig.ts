/** عنوان باكند FastAPI — ينتهي بـ /api */
export function getApiBaseUrl(): string {
  const raw = process.env.REACT_APP_API_URL?.trim();
  if (raw) return raw.replace(/\/$/, '');
  return process.env.NODE_ENV === 'development'
    ? 'http://localhost:8000/api'
    : 'http://localhost:8000/api';
}

export function isPythonBackend(): boolean {
  if (process.env.REACT_APP_BACKEND === 'python') return true;
  const base = getApiBaseUrl().toLowerCase();
  return base.includes(':8000') || (!base.includes('wakeel') && base.endsWith('/api'));
}
