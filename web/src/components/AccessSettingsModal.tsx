import React, { useEffect, useState } from 'react';
import {
  Check,
  Layers,
  Mail,
  Pencil,
  Pill,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import type { AccessConfigDoc, RegimenEraDoc } from '../types';
import { formatDateDDMMYYYY } from '../utils/format';
import {
  DEFAULT_REGIMEN_COLOR,
  resolveRegimenColor,
} from '../utils/regimenColors';
import { RegimenColorSwatches } from './RegimenColorSwatches';
import { defaultEraTitle, isCanonicalEraTitle, translateEraTitle, useI18n } from '../i18n';

interface AccessSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessConfig: AccessConfigDoc;
  regimenEras: RegimenEraDoc[];
  onSaveAccessConfig: (config: AccessConfigDoc) => Promise<void>;
  onSaveRegimenEra: (era: RegimenEraDoc) => Promise<void>;
  onDeleteRegimenEra: (eraId: string) => Promise<void>;
}

export const AccessSettingsModal: React.FC<AccessSettingsModalProps> = ({
  isOpen,
  onClose,
  accessConfig,
  regimenEras,
  onSaveAccessConfig,
  onSaveRegimenEra,
  onDeleteRegimenEra,
}) => {
  const { lang, t } = useI18n();
  const [newGuestInput, setNewGuestInput] = useState<string>('');
  const [emails, setEmails] = useState<string[]>(accessConfig.allowedViewerEmails ?? []);
  const [ownerEmail, setOwnerEmail] = useState<string>(accessConfig.ownerEmail ?? '');

  // Medication Settings state
  const [defaultMedName, setDefaultMedName] = useState<string>(
    accessConfig.medicationSettings?.defaultMedicationName ?? ''
  );
  const [dosePresetsInput, setDosePresetsInput] = useState<string>(
    (accessConfig.medicationSettings?.customDosePresets ?? [5, 10, 15, 20]).join(', ')
  );
  const [isSavingMedSettings, setIsSavingMedSettings] = useState<boolean>(false);
  const [medSettingsSavedToast, setMedSettingsSavedToast] = useState<boolean>(false);

  // New Period form state
  const [eraTitle, setEraTitle] = useState<string>('');
  const [eraStart, setEraStart] = useState<string>('2026-09-22');
  const [eraEnd, setEraEnd] = useState<string>('2099-12-31');
  const [eraColor, setEraColor] = useState<string>(DEFAULT_REGIMEN_COLOR);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Inline edit state (rename / re-date an existing period)
  const [editingEraId, setEditingEraId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editStart, setEditStart] = useState<string>('');
  const [editEnd, setEditEnd] = useState<string>('');
  const [editColor, setEditColor] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  useEffect(() => {
    setEmails(accessConfig.allowedViewerEmails ?? []);
    setOwnerEmail(accessConfig.ownerEmail ?? '');
    setDefaultMedName(accessConfig.medicationSettings?.defaultMedicationName ?? '');
    setDosePresetsInput(
      (accessConfig.medicationSettings?.customDosePresets ?? [5, 10, 15, 20]).join(', ')
    );
  }, [accessConfig, isOpen]);

  if (!isOpen) return null;

  const handleAddGuestEmails = async () => {
    // Support adding a single email or pasting multiple comma/space/semicolon-separated emails
    const candidates = newGuestInput
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.includes('@') && s.includes('.'));

    if (candidates.length === 0) return;

    const merged = Array.from(new Set([...emails.map((e) => e.toLowerCase()), ...candidates]));
    setEmails(merged);
    setNewGuestInput('');
    await onSaveAccessConfig({
      ...accessConfig,
      ownerEmail,
      allowedViewerEmails: merged,
    });
  };

  const handleRemoveGuestEmail = async (target: string) => {
    const updated = emails.filter((e) => e.toLowerCase() !== target.toLowerCase());
    setEmails(updated);
    await onSaveAccessConfig({
      ...accessConfig,
      ownerEmail,
      allowedViewerEmails: updated,
    });
  };

  // Canonical "default" title of a period: either a well-known built-in id or a
  // legacy stored title that is auto-translated. Empty string = fully custom.
  const eraDefaultTitle = (era: RegimenEraDoc): string => {
    const byId = defaultEraTitle(era.id);
    if (byId) return byId;
    return isCanonicalEraTitle(era.title) ? era.title : '';
  };
  const isBuiltInEra = (era: RegimenEraDoc) => eraDefaultTitle(era) !== '';

  const startEditEra = (era: RegimenEraDoc) => {
    setEditingEraId(era.id);
    // Built-in regimens are auto-translated, so their canonical stored title is
    // not editable directly; the custom-name field starts empty (= use default).
    setEditTitle(isBuiltInEra(era) ? '' : era.title);
    setEditStart(era.startDate);
    setEditEnd(era.endDate);
    // Always edit the validated (resolved) color, never the raw stored value,
    // so the swatch grid matches what the rest of the app displays.
    setEditColor(resolveRegimenColor(era.color, era.id));
  };

  const cancelEditEra = () => {
    setEditingEraId(null);
    setEditTitle('');
  };

  const handleSaveEraEdit = async (era: RegimenEraDoc) => {
    // Empty custom name on a built-in regimen restores its canonical title,
    // which is auto-translated for each viewer language again.
    const nextTitle = editTitle.trim() || eraDefaultTitle(era) || era.title;
    if (!nextTitle || !editStart) return;
    setIsSavingEdit(true);
    try {
      await onSaveRegimenEra({
        ...era,
        title: nextTitle,
        startDate: editStart,
        endDate: editEnd || '2099-12-31',
        color: editColor || era.color,
      });
      setEditingEraId(null);
      setEditTitle('');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleSaveMedicationSettings = async () => {
    setIsSavingMedSettings(true);
    try {
      const presets = dosePresetsInput
        .split(/[,\s]+/)
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !Number.isNaN(n) && n > 0);

      const updatedName = defaultMedName.trim() || undefined;
      await onSaveAccessConfig({
        ...accessConfig,
        ownerEmail,
        allowedViewerEmails: emails,
        medicationSettings: {
          defaultMedicationName: updatedName,
          customDosePresets: presets.length > 0 ? presets : [5, 10, 15, 20],
        },
      });
      try {
        if (updatedName) {
          localStorage.setItem('last_logged_medication_name', updatedName);
        }
      } catch {}
      setMedSettingsSavedToast(true);
      setTimeout(() => setMedSettingsSavedToast(false), 2000);
    } finally {
      setIsSavingMedSettings(false);
    }
  };

  const handleCreateEra = async () => {
    if (!eraTitle.trim()) return;
    setIsSaving(true);
    try {
      const id = `era-${eraStart}-${eraTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 24)}`;
      const newEra: RegimenEraDoc = {
        id,
        title: eraTitle.trim(),
        startDate: eraStart,
        endDate: eraEnd || '2099-12-31',
        isMedicated: true,
        color: eraColor,
      };
      await onSaveRegimenEra(newEra);
      setEraTitle('');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white border border-slate-200 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {t('settingsModalTitle')}
              </h2>
              <p className="text-xs text-slate-500">{t('settingsModalSub')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Section 1: Guest Emails Allowlist */}
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-600" />
                {t('guestAccessTitle')}
              </h3>
              <p className="text-xs text-slate-500 mt-1">{t('guestAccessSub')}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder={t('guestInputPlaceholder')}
                  value={newGuestInput}
                  onChange={(e) => setNewGuestInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddGuestEmails();
                    }
                  }}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={handleAddGuestEmails}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>{t('addGuestBtn')}</span>
              </button>
            </div>

            {emails.length === 0 ? (
              <p className="text-xs text-slate-500 italic">{t('noGuestsYet')}</p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {emails.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-mono text-slate-800 shadow-2xs"
                  >
                    <span>{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveGuestEmail(email)}
                      className="text-slate-400 hover:text-rose-600 cursor-pointer"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Medication Configuration */}
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Pill className="w-4 h-4 text-amber-600" />
                  {t('medicationConfigTitle')}
                </h3>
                <p className="text-xs text-slate-500 mt-1">{t('medicationConfigSub')}</p>
              </div>
              {medSettingsSavedToast && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md font-medium">
                  <Check className="w-3.5 h-3.5" />
                  {t('savedFeedback')}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {t('defaultMedicationLabel')}
                </label>
                <input
                  type="text"
                  placeholder={t('defaultMedicationPlaceholder')}
                  value={defaultMedName}
                  onChange={(e) => setDefaultMedName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {t('dosePresetsLabel')}
                </label>
                <input
                  type="text"
                  placeholder={t('dosePresetsPlaceholder')}
                  value={dosePresetsInput}
                  onChange={(e) => setDosePresetsInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleSaveMedicationSettings}
                disabled={isSavingMedSettings}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white transition cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{t('saveMedicationSettingsBtn')}</span>
              </button>
            </div>
          </div>

          {/* Section 3: Calendar Time Periods */}
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-600" />
                {t('periodsSectionTitle')}
              </h3>
              <p className="text-xs text-slate-500 mt-1">{t('periodsSectionSub')}</p>
            </div>

            <div className="space-y-2">
              {regimenEras.map((era) =>
                editingEraId === era.id ? (
                  /* Inline edit form for this period */
                  <div
                    key={era.id}
                    className="p-3 rounded-lg bg-blue-50/60 border border-blue-200 space-y-3"
                  >
                    <div className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">
                      {t('editPeriodHeader')}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          {isBuiltInEra(era) ? t('customNameLabel') : t('periodTitlePlaceholder').split(' (')[0]}
                        </label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder={
                            isBuiltInEra(era)
                              ? translateEraTitle(era.id, eraDefaultTitle(era), lang)
                              : t('periodTitlePlaceholder')
                          }
                          className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                        />
                        {isBuiltInEra(era) && (
                          <p className="text-[11px] text-slate-500 mt-1">{t('customNameHint')}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-2">
                          {t('badgeColorLabel')}
                        </label>
                        <RegimenColorSwatches value={editColor} onChange={setEditColor} />
                      </div>
                    </div>
                    {isBuiltInEra(era) && (
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          {t('defaultNameLabel')}
                        </label>
                        <input
                          type="text"
                          value={eraDefaultTitle(era)}
                          readOnly
                          className="w-full px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-xs font-mono text-slate-500 cursor-default focus:outline-none"
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">
                          {t('startDateLabel')}
                        </label>
                        <input
                          type="date"
                          value={editStart}
                          onChange={(e) => setEditStart(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-mono text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">
                          {t('endDateLabel')}
                        </label>
                        <input
                          type="date"
                          value={editEnd}
                          onChange={(e) => setEditEnd(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-mono text-slate-800"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={cancelEditEra}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
                      >
                        {t('cancelBtn')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEraEdit(era)}
                        disabled={isSavingEdit || (!editTitle.trim() && !isBuiltInEra(era))}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white transition cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{t('savePeriodBtn')}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={era.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-white border border-slate-200 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0"
                        style={{ backgroundColor: resolveRegimenColor(era.color, era.id) }}
                      />
                      <div>
                        <div className="font-semibold text-slate-900">
                          {translateEraTitle(era.id, era.title, lang)}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {formatDateDDMMYYYY(era.startDate, t('present'))} →{' '}
                          {formatDateDDMMYYYY(era.endDate, t('present'))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEditEra(era)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100 cursor-pointer"
                        title={t('editBtn')}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteRegimenEra(era.id)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-slate-100 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Add New Time Period */}
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <h4 className="text-xs font-semibold text-slate-700">
                {t('addPeriodHeader')}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder={t('periodTitlePlaceholder')}
                  value={eraTitle}
                  onChange={(e) => setEraTitle(e.target.value)}
                  className="sm:col-span-2 px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-2">
                    {t('badgeColorLabel')}
                  </label>
                  <RegimenColorSwatches value={eraColor} onChange={setEraColor} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    {t('startDateLabel')}
                  </label>
                  <input
                    type="date"
                    value={eraStart}
                    onChange={(e) => setEraStart(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-mono text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    {t('endDateLabel')}
                  </label>
                  <input
                    type="date"
                    value={eraEnd}
                    onChange={(e) => setEraEnd(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-mono text-slate-800"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateEra}
                  disabled={isSaving || !eraTitle.trim()}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white transition cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{t('addPeriodBtn')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
