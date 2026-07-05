import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { isPythonBackend } from '../config/apiConfig';
import { apiService } from '../services/api';
import { ensureSasPythonSessionAfterWakeelLogin } from '../utils/sasPythonReseller';

/** فترة إعادة مزامنة سلاسl الكارد أثناء بقاء التطبيق مفتوحاً (10 دقائق). */
const RESYNC_INTERVAL_MS = 10 * 60 * 1000;

/**
 * مزامنة سلاسl كروت الشحن تلقائياً بعد الدخول وكل فترة — حتى يعمل التفعيل
 * دون زيارة صفحة الكروت يدوياً.
 */
export function CardSeriesAutoSync() {
  const { user, isAuthInitialized, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!isPythonBackend() || !isAuthInitialized || !isAuthenticated || !user) {
      return;
    }

    const syncSeries = async () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
        await ensureSasPythonSessionAfterWakeelLogin(user.role);
        await apiService.syncCardSeries();
        void queryClient.invalidateQueries({ queryKey: ['cardSeries'] });
        void queryClient.invalidateQueries({ queryKey: ['activate-packages'] });
      } catch {
        /* صامت — لا يعطل واجهة المستخدم */
      } finally {
        syncingRef.current = false;
      }
    };

    void syncSeries();
    const intervalId = window.setInterval(() => void syncSeries(), RESYNC_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [user, isAuthInitialized, isAuthenticated, queryClient]);

  return null;
}
