import { apiService } from './api';
import type { FtthSubscribersExportResponse } from '../types';

export interface SasPythonLoginBody {
  sas_api_url: string;
  username: string;
  password: string;
  sas_aes_key?: string | null;
}

export interface SasPythonSubscribersPage {
  current_page: number;
  last_page: number;
  total: number;
  per_page?: number;
  data: unknown[];
}

export function getSasPythonApiBaseUrl(): string {
  return apiService.getBaseUrl();
}

export function isSasPythonApiEnabled(): boolean {
  return process.env.REACT_APP_SAS_PYTHON_ENABLED !== 'false';
}

export function normalizeSasApiUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, '');
}

class SasPythonApiService {
  async login(body: SasPythonLoginBody): Promise<void> {
    await apiService.sasLogin(body);
  }

  async getSubscribersPage(page: number, perPage = 100): Promise<SasPythonSubscribersPage> {
    const res = await apiService.getSubscribers({ page, pageSize: perPage });
    return {
      current_page: res.currentPage ?? page,
      last_page: res.totalPages ?? 1,
      total: res.totalItems ?? res.data.length,
      per_page: perPage,
      data: res.data,
    };
  }

  async fetchAllSubscribers(
    perPage = 100,
    onProgress?: (currentPage: number, lastPage: number) => void
  ): Promise<unknown[]> {
    const all: unknown[] = [];
    let page = 1;
    let lastPage = 1;
    do {
      const chunk = await this.getSubscribersPage(page, perPage);
      lastPage = Math.max(1, chunk.last_page ?? 1);
      if (chunk.data.length) all.push(...chunk.data);
      onProgress?.(page, lastPage);
      page += 1;
    } while (page <= lastPage);
    return all;
  }

  async loginAndFetchAllSubscribers(
    loginBody: SasPythonLoginBody,
    onProgress?: (currentPage: number, lastPage: number) => void
  ): Promise<FtthSubscribersExportResponse> {
    await this.login(loginBody);
    const data = await this.fetchAllSubscribers(100, onProgress);
    return { data, provider: 'sas-python', mode: 'python-api' };
  }
}

export const sasPythonApi = new SasPythonApiService();
