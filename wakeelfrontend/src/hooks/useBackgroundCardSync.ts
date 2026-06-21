import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { isPythonBackend } from '../config/apiConfig';
import { apiService } from '../services/api';
import { getSelectedResellerId } from '../utils/selectedReseller';

const CARD_SYNC_INTERVAL_MS = 5_000;

/**
 * مزامنة خلفية لسلاسل الكاردات وأكوادها — POST /cards/sync ثم codes/sync لكل سلسلة.
 * صامتة (بدون إشعارات) حتى لا يحتاج المستخدم زيارة صفحة الكاردات للتحديث اليدوي.
 */
export function useBackgroundCardSync(): void {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const busyRef = useRef(false);
  const pythonBackend = isPythonBackend();

  useEffect(() => {
    if (!isAuthenticated || !pythonBackend) return;

    const runSync = async () => {
      if (busyRef.current) return;
      const resellerId = getSelectedResellerId()?.trim();
      if (!resellerId) return;

      busyRef.current = true;
      try {
        await apiService.syncCardSeries();
        const seriesList = await apiService.listAllCardSeries();
        for (const series of seriesList) {
          try {
            await apiService.syncCardCodes(series, { unusedOnly: true, full: false });
          } catch {
            /* سلسلة واحدة — نتابع الباقي */
          }
        }
        void queryClient.invalidateQueries({ queryKey: ['cardSeries'] });
        void queryClient.invalidateQueries({ queryKey: ['cardCodes'] });
        void queryClient.invalidateQueries({ queryKey: ['activate-packages'] });
      } catch {
        /* صامت — المحاولة التالية بعد 5 ث */
      } finally {
        busyRef.current = false;
      }
    };

    void runSync();
    const timerId = window.setInterval(() => {
      void runSync();
    }, CARD_SYNC_INTERVAL_MS);

    return () => window.clearInterval(timerId);
  }, [isAuthenticated, pythonBackend, queryClient]);
}
