import React from 'react';
import {
  Activity,
  Eye,
  Globe,
  Grid,
  HeartPulse,
  Layers,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import type { DashboardTab, UserRole } from '../types';
import { useI18n } from '../i18n';

interface HeaderProps {
  userEmail: string | null;
  role: UserRole;
  isPreviewingGuestView: boolean;
  onToggleGuestPreview: () => void;
  activeTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  onOpenQuickLog: (prefillTime?: string) => void;
  onOpenSettings: () => void;
  onSyncGarminNow: () => void;
  isSyncing: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  isFirebaseConfigured: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  userEmail,
  role,
  isPreviewingGuestView,
  onToggleGuestPreview,
  activeTab,
  onSelectTab,
  onOpenQuickLog,
  onOpenSettings,
  onSyncGarminNow,
  isSyncing,
  onSignIn,
  onSignOut,
  isFirebaseConfigured,
}) => {
  const { lang, setLang, t } = useI18n();
  const effectiveIsOwner = (role === 'owner' || role === 'demo') && !isPreviewingGuestView;

  const tabs: { id: DashboardTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'day-explorer',
      label: t('tabDaily'),
      icon: <Activity className="w-4 h-4" />,
    },
    {
      id: 'carpet-heatmap',
      label: t('tabHeatmap'),
      icon: <Grid className="w-4 h-4" />,
    },
    {
      id: 'longitudinal-safety',
      label: t('tabTrends'),
      icon: <HeartPulse className="w-4 h-4" />,
    },
    {
      id: 'regimen-comparison',
      label: t('tabComparison'),
      icon: <Layers className="w-4 h-4" />,
    },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Top Row: Clean Brand + Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-3.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
              <HeartPulse className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900">
                {t('appTitle')}
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">{t('appSubtitle')}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Language Switcher (EN / PT-BR) */}
            <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 border border-slate-200 text-xs font-medium">
              <Globe className="w-3.5 h-3.5 text-slate-500 ml-2 mr-1 hidden sm:inline" />
              <button
                type="button"
                onClick={() => setLang('pt')}
                className={`px-2 py-1 rounded-md transition cursor-pointer ${
                  lang === 'pt'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                PT-BR
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-2 py-1 rounded-md transition cursor-pointer ${
                  lang === 'en'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                EN
              </button>
            </div>

            {/* Role Badge */}
            {userEmail && (
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                {effectiveIsOwner ? (
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {t('ownerBadge')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-blue-700">
                    <Eye className="w-3.5 h-3.5" />
                    {t('guestViewBadge')}
                  </span>
                )}
              </div>
            )}

            {/* Toggle Guest View Preview (Owner Only) */}
            {(role === 'owner' || role === 'demo') && (
              <button
                type="button"
                onClick={onToggleGuestPreview}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                  isPreviewingGuestView
                    ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>
                  {isPreviewingGuestView ? t('exitGuestView') : t('previewGuestView')}
                </span>
              </button>
            )}

            {/* Owner Action Buttons */}
            {effectiveIsOwner && (
              <>
                <button
                  type="button"
                  onClick={() => onOpenQuickLog()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('logButton')}</span>
                </button>

                <button
                  type="button"
                  onClick={onSyncGarminNow}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 disabled:opacity-50 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">
                    {isSyncing ? t('syncing') : t('syncNow')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition cursor-pointer"
                  title={t('settings')}
                >
                  <Settings className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden lg:inline">{t('settings')}</span>
                </button>
              </>
            )}

            {/* Sign In / Sign Out */}
            {isFirebaseConfigured &&
              (userEmail ? (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 cursor-pointer"
                  title={`${t('signOut')} (${userEmail})`}
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSignIn}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{t('signIn')}</span>
                </button>
              ))}
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-2 overflow-x-auto no-scrollbar -mb-px">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2.5 border-b-2 text-xs sm:text-sm font-medium whitespace-nowrap transition cursor-pointer ${
                  active
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
