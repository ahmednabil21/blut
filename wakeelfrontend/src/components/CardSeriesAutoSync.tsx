import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { isPythonBackend } from '../config/apiConfig';
import { apiService } from '../services/api';
import { ensureSasPythonSessionAfterWakeelLogin } from '../utils/sasPythonReseller';

/**
 * مزامنة سلاسl الكارد مرة واحدة بعد تسجيل الدخول لكل مستخدم.
 * (بعد التفعيل الناجح تُحدَّث السلاسl من SubscribersPage — مرة واحدة)
 */
export function CardSeriesAutoSync() {
  const { user, isAuthInitialized, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const syncedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isPythonBackend() || !isAuthInitialized) {
      return;
    }
    if (!isAuthenticated || !user) {
      syncedForUserRef.current = null;
      return;
    }

    const userKey = String(user.id);
    if (syncedForUserRef.current === userKey) {
      return;
    }

    let cancelled = false;

    const syncSeriesOnce = async () => {
      try {
        await ensureSasPythonSessionAfterWakeelLogin(user.role);
        await apiService.syncCardSeries();
        if (cancelled) return;
        syncedForUserRef.current = userKey;
        void queryClient.invalidateQueries({ queryKey: ['cardSeries'] });
        void queryClient.invalidateQueries({ queryKey: ['activate-packages'] });
      } catch {
        /* صامت — لا يعطل واجهة المستخدم */
      }
    };

    void syncSeriesOnce();
    return () => {
      cancelled = true;
    };
  }, [user, isAuthInitialized, isAuthenticated, queryClient]);

  return null;
}
