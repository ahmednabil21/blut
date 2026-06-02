import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Users,
  UserCheck,
  Wifi,
  WifiOff,
  UserX,
  Clock,
  Database,
} from 'lucide-react';
import type { SubscribersDashboardStats } from '../../types';

const STAT_ICONS: Record<string, LucideIcon> = {
  total: Users,
  active: UserCheck,
  online: Wifi,
  offline: WifiOff,
  expired: UserX,
  expiring: Clock,
};

export interface DashboardSubscriberStatCard {
  id: keyof typeof STAT_ICONS;
  label: string;
  value: number;
  gradient: string;
  iconWrap: string;
  iconColor: string;
  onClick?: () => void;
}

const CARD_SHELL =
  'group relative overflow-hidden rounded-2xl border border-white/60 dark:border-gray-700/80 p-4 sm:p-5 text-right transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950';

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5 animate-pulse">
      <div className="h-10 w-10 rounded-xl bg-gray-200 dark:bg-gray-700 mb-4" />
      <div className="h-8 w-20 rounded-lg bg-gray-200 dark:bg-gray-700 mb-2" />
      <div className="h-4 w-28 rounded bg-gray-100 dark:bg-gray-700/80" />
    </div>
  );
}

export function buildSubscriberDashboardStatCards(
  stats: SubscribersDashboardStats | undefined,
  handlers: {
    onTotal?: () => void;
    onActive?: () => void;
    onOnline?: () => void;
    onOffline?: () => void;
    onExpired?: () => void;
    onExpiring?: () => void;
  }
): DashboardSubscriberStatCard[] {
  const online = Number(stats?.online ?? stats?.sasOnlineUsers ?? 0);
  const offline =
    stats?.offline != null && Number.isFinite(stats.offline)
      ? Number(stats.offline)
      : Math.max(0, Number(stats?.active ?? 0) - online);

  return [
    {
      id: 'total',
      label: 'إجمالي المشتركين',
      value: Number(stats?.total ?? 0),
      gradient: 'from-indigo-500/12 via-white to-violet-50/80 dark:from-indigo-500/20 dark:via-gray-800 dark:to-violet-950/30',
      iconWrap: 'bg-indigo-100 dark:bg-indigo-900/50 ring-indigo-200/80 dark:ring-indigo-700/50',
      iconColor: 'text-indigo-600 dark:text-indigo-300',
      onClick: handlers.onTotal,
    },
    {
      id: 'active',
      label: 'المشتركون النشطون',
      value: Number(stats?.active ?? 0),
      gradient: 'from-emerald-500/12 via-white to-teal-50/80 dark:from-emerald-500/15 dark:via-gray-800 dark:to-emerald-950/25',
      iconWrap: 'bg-emerald-100 dark:bg-emerald-900/45 ring-emerald-200/80 dark:ring-emerald-700/50',
      iconColor: 'text-emerald-600 dark:text-emerald-300',
      onClick: handlers.onActive,
    },
    {
      id: 'online',
      label: 'متصلون الآن',
      value: online,
      gradient: 'from-sky-500/12 via-white to-cyan-50/80 dark:from-sky-500/15 dark:via-gray-800 dark:to-sky-950/25',
      iconWrap: 'bg-sky-100 dark:bg-sky-900/45 ring-sky-200/80 dark:ring-sky-700/50',
      iconColor: 'text-sky-600 dark:text-sky-300',
      onClick: handlers.onOnline,
    },
    {
      id: 'offline',
      label: 'غير متصل',
      value: offline,
      gradient: 'from-slate-500/10 via-white to-gray-50 dark:from-slate-500/15 dark:via-gray-800 dark:to-slate-900/40',
      iconWrap: 'bg-slate-100 dark:bg-slate-800/80 ring-slate-200/80 dark:ring-slate-600/50',
      iconColor: 'text-slate-600 dark:text-slate-300',
      onClick: handlers.onOffline,
    },
    {
      id: 'expired',
      label: 'منتهي الصلاحية',
      value: Number(stats?.expired ?? 0),
      gradient: 'from-rose-500/12 via-white to-red-50/80 dark:from-rose-500/15 dark:via-gray-800 dark:to-rose-950/25',
      iconWrap: 'bg-rose-100 dark:bg-rose-900/40 ring-rose-200/80 dark:ring-rose-800/50',
      iconColor: 'text-rose-600 dark:text-rose-300',
      onClick: handlers.onExpired,
    },
    {
      id: 'expiring',
      label: 'ينتهي خلال ٣ أيام',
      value: Number(stats?.expiringWithin3Days ?? 0),
      gradient: 'from-amber-500/12 via-white to-orange-50/80 dark:from-amber-500/15 dark:via-gray-800 dark:to-amber-950/25',
      iconWrap: 'bg-amber-100 dark:bg-amber-900/40 ring-amber-200/80 dark:ring-amber-800/50',
      iconColor: 'text-amber-700 dark:text-amber-300',
      onClick: handlers.onExpiring,
    },
  ];
}

export interface DashboardSubscriberStatsCardsProps {
  stats?: SubscribersDashboardStats;
  isLoading?: boolean;
  formatNumber: (n: number) => string;
  cards: DashboardSubscriberStatCard[];
  /** شارة مصدر SAS / كاش */
  showMeta?: boolean;
}

export const DashboardSubscriberStatsCards: React.FC<DashboardSubscriberStatsCardsProps> = ({
  stats,
  isLoading,
  formatNumber,
  cards,
  showMeta = false,
}) => {
  const fromSas = stats?.source === 'sas_widgets' || stats?.source === 'sas';

  return (
    <section className="mb-8" aria-label="إحصائيات المشتركين">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">مؤشرات المشتركين</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            بيانات مباشرة من لوحة SAS للمنطقة المحددة
          </p>
        </div>
        {showMeta && fromSas && (
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-sky-50/90 px-3 py-1.5 text-xs font-medium text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
            <Database className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {stats?.cached ? (
              <span>من الكاش · يُحدَّث كل {stats.cacheTtlSec ?? 300} ث</span>
            ) : (
              <span>محدَّث من SAS</span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3 sm:gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
          : cards.map((card) => {
              const Icon = STAT_ICONS[card.id] ?? Users;
              const inner = (
                <>
                  <div
                    className="pointer-events-none absolute -top-8 -end-6 h-24 w-24 rounded-full bg-white/40 blur-2xl dark:bg-white/5"
                    aria-hidden
                  />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{card.label}</p>
                      <p className="mt-2 text-2xl sm:text-3xl font-bold tabular-nums tracking-tight text-gray-900 dark:text-white">
                        {formatNumber(card.value)}
                      </p>
                    </div>
                    <div
                      className={`shrink-0 rounded-xl p-2.5 ring-1 ${card.iconWrap} transition-transform duration-300 group-hover:scale-105`}
                      aria-hidden
                    >
                      <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${card.iconColor}`} strokeWidth={2} />
                    </div>
                  </div>
                  {card.onClick && (
                    <p className="relative mt-3 text-[11px] font-medium text-indigo-600/0 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      عرض القائمة ←
                    </p>
                  )}
                </>
              );

              const className = `bg-gradient-to-br ${card.gradient} shadow-[0_12px_40px_-16px_rgba(15,23,42,0.12)] dark:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.45)] hover:shadow-[0_20px_50px_-16px_rgba(15,23,42,0.18)] hover:-translate-y-0.5 ${CARD_SHELL}`;

              if (card.onClick) {
                return (
                  <button key={card.id} type="button" onClick={card.onClick} className={className}>
                    {inner}
                  </button>
                );
              }
              return (
                <div key={card.id} className={className}>
                  {inner}
                </div>
              );
            })}
      </div>
    </section>
  );
};
