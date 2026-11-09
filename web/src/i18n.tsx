import React, { createContext, useContext, useState, useEffect } from 'react';
import type { SideEffectTag } from './types';

export type Language = 'en' | 'pt';

export const translations = {
  en: {
    appTitle: "Health Dashboard",
    appSubtitle: '',
    ownerBadge: 'Owner',
    guestViewBadge: 'Guest View',
    previewGuestView: 'Preview Guest View',
    exitGuestView: 'Exit Guest View',
    logButton: 'Log Dose / Note',
    syncNow: 'Sync Garmin',
    syncing: 'Syncing...',
    settings: 'Settings',
    signIn: 'Sign in with Google',
    signOut: 'Sign out',
    checkingSession: 'Checking session...',
    privatePortalTitle: "Health Dashboard",
    privatePortalDesc:
      'Private health dashboard. Sign in with an authorized Google account (Owner or invited Guest) to view heart rate, sleep, and medication logs.',
    loadingData: 'Loading Garmin data...',
    unauthorizedTitle: 'Access Restricted',
    unauthorizedHint:
      'Signed in as {email}. Only the owner and invited guest emails can view this dashboard.',
    syncError: 'Sync error',
    firebaseNotConfigured:
      'Firebase is not configured in this build. Set the VITE_FIREBASE_* environment variables to enable sign-in.',
    todayBadge: 'Today',

    // Standalone /quick page (lightweight 1-tap logging entry point)
    quickAddTitle: 'Quick Add',
    quickAddDesc:
      'Log doses, caffeine, symptoms and daily notes in seconds. Sign in with the owner account.',
    quickAddOwnerOnly: 'Quick adding is owner-only',
    openDashboard: 'Open Dashboard',

    // Sleep markers (from Garmin bedtime & wake-up time) — shown as icons on the chart
    bedtimeMarkerIcon: '🌙',
    wakeMarkerIcon: '☀️',
    caffeineMarkerIcon: '☕',
    prevDayBandLabel: 'Previous evening',
    prevDayTooltipSuffix: ' (prev. day)',
    sleepBandLegend: 'Sleep (bedtime → wake-up, from Garmin)',

    // Pending-sync day (Today selected before the scheduled Garmin sync has run)
    pendingSyncTitle: 'No Garmin data for this day yet',
    pendingSyncBody:
      'The scheduled Garmin sync runs at 10:00 and 22:00 (watch time). You can still log doses, caffeine, symptoms, ratings and notes for this date — they will be matched with heart rate once the sync runs.',

    // Longitudinal trends chart legends
    legendGarminRhr: 'Garmin Resting HR',
    legendFirstHalfHrv: '1st Half Sleep HRV',
    legendSecondHalfHrv: '2nd Half Sleep HRV',
    legendWeeklyAvgHrv: '7-Day Avg HRV',
    scatterLoggedDays: 'Logged Days',
    axisHoursBeforeSleep: 'Hours Before Sleep',
    axisSleepStress: 'Sleep Stress',

    // Navigation Tabs
    tabDaily: 'Daily View',
    tabHeatmap: 'Hourly Table',
    tabTrends: 'Trends & Sleep',
    tabComparison: 'Regimen Comparison',

    // Date bar & filters
    prevDay: 'Previous Day',
    nextDay: 'Next Day',
    watchTimezone: 'Watch time',
    filterDaysLabel: 'Browse dates by filter:',
    filterRecent: 'Recent days',
    filterWorkouts: 'Days with workouts',
    filterCarryover: 'Higher sleep stress / alerts',
    filterMedicated: 'Days with logged medication',
    present: 'Present',

    // KPI Cards & Tooltips (Daily View)
    kpiSleepingHrTitle: 'Sleeping HR (04:00–07:00)',
    kpiSleepingHrTooltip:
      'Your average heart rate between 04:00 and 07:00 while asleep—after yesterday’s medication has worn off and before any morning dose. RHR is Garmin’s daily Resting Heart Rate.',
    kpiSleepingHrSub: 'Garmin Resting HR: {rhr} bpm',

    kpiDaytimeHrTitle: 'Daytime Seated HR (09:00–17:00)',
    kpiDaytimeHrTooltip:
      'Your average daytime heart rate between 09:00 and 17:00, automatically excluding recorded workouts plus a 30-minute recovery window afterward so exercise doesn’t skew the average.',
    kpiDaytimeHrSub: 'Excludes workouts + 30m recovery',
    kpiDaytimeRawLabel: 'With exercise: {bpm} bpm',

    kpiHrvTitle: 'Overnight HRV (1st → 2nd Half)',
    kpiHrvTooltip:
      'HRV (Heart Rate Variability, measured by Garmin in ms) reflects nervous system recovery during sleep—higher is calmer. Comparing the 1st half of sleep to the 2nd half shows if a late dose kept your body slightly active early in the night.',
    kpiHrvSub: 'Night average: {avg} ms • Garmin status: {status}',

    kpiSleepTitle: 'Sleep & Body Battery',
    kpiSleepTooltip:
      'Sleep Score (0–100) and Sleep Stress (0–100, where <15 is very restful and ≥25 is restless) come from Garmin. Body Battery (0–100) estimates energy charged during sleep vs. drained during the day.',
    kpiSleepStressLabel: 'Sleep stress: {stress}',
    kpiBodyBatterySub: 'Body Battery: +{charged} / -{drained} (Peak {high})',

    // Main 24h Chart
    chart24hTitle: '24-Hour Heart Rate & Activity',
    chart24hSubtitle:
      '2-minute heart rate from your Garmin watch.',
    chartClickHint: 'Tip: Click any point on the chart to log at that time',
    activeWindowLabel: 'Est. medication duration:',
    activeWindowTooltip:
      'Immediate-release (IR) medication typically takes ~45 min to start, peaks around 1 to 2.5 hours, and wears off in ~3.5 to 4.5 hours. Adjust the slider to see how your heart rate lines up.',
    legendMedicationActive: 'Medication active window',
    legendWorkout: 'Workout + 30m recovery',
    legendBodyBattery: 'Body Battery (0–100%)',
    stressToggle: 'Stress',
    stressToggleHint: 'Show the Garmin all-day stress summary for this day',
    stressPanelTitle: 'All-Day Stress',
    stressPanelTooltip:
      'Garmin derives a 0–100 stress score from wrist readings (higher = more sympathetic/autonomic arousal). Avg and Max are day-level summaries; the bar shows how the day’s recorded time split across Rest, Low, Medium and High stress buckets. This summary comes from Garmin’s daily sync — the minute-by-minute stress curve is not exposed by Garmin’s Personal API, so it is not drawn on the timeline.',
    stressAvgLabel: 'Avg {value}',
    stressMaxLabel: 'Max {value}',
    stressRestLabel: 'Rest',
    stressLowLabel: 'Low',
    stressMediumLabel: 'Med',
    stressHighLabel: 'High',
    stressNoData: 'No stress summary synced for this day.',
    doseSummaryBadge: 'Dose #{idx}: {mg}mg ({type}) at {time}',
    doseWindowHrBadge: 'Seated HR during window: {hr} bpm ({delta} bpm vs sleep)',
    workoutBadge: '{name} ({start}–{end}, +30m recovery → {cooldown})',
    baselineBandLabel: '04:00–07:00 Sleeping Baseline',
    baselineLineLabel: 'Sleeping HR: {bpm} bpm',
    seatedHrSeries: 'Seated Heart Rate (bpm)',
    workoutHrSeries: 'Workout / Recovery HR (bpm)',
    bodyBatterySeries: 'Body Battery (%)',

    // Overnight HRV Chart
    chartHrvTitle: 'Overnight Sleep HRV (5-Minute Readings)',
    chartHrvSubtitle:
      'Recorded during the sleep leading into {date}. Splits your night into 1st half vs. 2nd half of sleep.',
    chartHrvTooltip:
      'Garmin’s "Personal Balanced Band" (green shaded zone) is your normal multi-week overnight HRV range calculated by your watch. Staying inside or above this band means normal recovery.',
    balancedBandNote:
      'Green zone = Garmin Personal Balanced Band ({low}–{high} ms): your typical baseline range computed by the watch over recent weeks.',
    lastDoseToSleepBadge: 'Last dose → sleep: {hours}h',
    lateCarryoverBadge: 'Lower early-night HRV',
    hrvSplitLabel: '1st Half ({early} ms) → 2nd Half ({late} ms)',
    hrvSeriesName: 'Sleep HRV (ms)',

    // Daily Log Card (on Daily View)
    dailyLogCardTitle: 'Logged Doses & Notes ({date})',
    dailyLogCardSub: 'Medication doses, caffeine, and symptoms matched with heart rate',
    addEntryBtn: 'Add / Edit',
    noEventsForDay: 'No medication doses, caffeine, or notes logged for {date}.',
    focusLabel: 'Focus',
    moodLabel: 'Mood',
    appetiteLabel: 'Appetite',
    privateNoteLabel: 'Private Note (only visible to you)',
    noPrivateNote: 'No private note for this day.',
    editBtn: 'Edit',

    // QuickLogDrawer (Clean 2-tab logger)
    loggerTitle: 'Daily Log',
    loggerTabEvents: 'Doses & Events',
    loggerTabDailyNotes: 'Ratings, Tags & Private Note',
    eventTimeLabel: 'Time (24h watch time)',
    eventTypeDose: 'Medication Dose',
    eventTypeCaffeine: 'Caffeine',
    eventTypeSymptom: 'Symptom / Feeling',
    doseAmountLabel: 'Dose amount',
    releaseTypeLabel: 'Formulation',
    releaseIrDesc: 'IR (Immediate Release)',
    releaseLaDesc: 'LA (Long Acting)',
    symptomSelectLabel: 'Select what you felt:',
    severityLabel: 'Intensity (1 = mild, 5 = strong)',
    optionalNotePlaceholder: 'Optional note (visible in Guest View)...',
    addEventButtonDose: 'Add {mg}mg {med} ({type}) at {time}',
    addEventButtonCaffeine: 'Add {label} at {time}',
    addEventButtonSymptom: 'Add Symptom at {time}',
    loggedTodayHeader: 'Logged on {date}',
    noLoggedEventsYet: 'Nothing logged for this date yet.',
    ratingsHeader: 'Optional Daily Ratings (1–5)',
    ratingsSub: 'Leave blank if you don’t want to rate today. Click a selected number again to clear it.',
    clearRatingsBtn: 'Clear all',
    tagsHeader: 'Optional Day Tags',
    tagsSub: 'Click to toggle tags for this day (none selected by default).',
    privateNoteHeader: 'Private Note',
    privateNoteSub: 'Private to you — never shown in Guest View.',
    privateNotePlaceholder: 'Write a personal note for this day...',
    saveDailyNotesBtn: 'Save Ratings, Tags & Note',
    savedFeedback: 'Saved!',
    closeBtn: 'Close',

    // Carpet Heatmap (Hourly Table)
    heatmapTitle: 'Day-by-Day Hourly Heart Rate Table',
    heatmapSubtitle:
      'Each row is a day (DD/MM/YYYY) and each column is an hour of the day (00h to 23h). Click any day to open its full chart.',
    excludeWorkoutsToggle: 'Exclude workouts + 30m recovery (show seated HR)',
    allPeriodsOption: 'All Dates ({count} days)',
    bpmScaleLabel: 'Heart Rate Scale:',
    scaleSleep: '≤56 (Sleep)',
    scaleMedicated: '76–84 (Active)',
    scalePeak: '95+ (High)',
    colDate: 'Date',
    colPeriod: 'Period / Log',
    colSleepHr: 'Sleep HR',
    colSeatedHr: 'Day HR',
    colDeltaHr: 'Diff (Δ)',
    colEvents: 'Logged',
    meanRowLabel: 'Average ({count}d)',
    seatedOnlyLabel: 'No workouts',
    allReadingsLabel: 'With workouts',

    // Longitudinal Trends & Sleep
    trendsKpi1Title: 'Sleeping HR (04:00–07:00) Range',
    trendsKpi1Tooltip:
      'Shows whether your unmedicated early-morning sleeping heart rate stays steady over the months.',
    trendsKpi1Value: 'Steady',
    trendsKpi1Sub: 'Early-morning sleeping baseline across {count} days',

    trendsKpi2Title: '1st-Half Sleep HRV (Last dose ≥ 8.5h before bed)',
    trendsKpi2Tooltip:
      'Average HRV in the first half of the night when your last medication dose was taken at least 8.5 hours before going to sleep.',
    trendsKpi2Sub: 'When last dose is ≥ 8.5h before sleep',

    trendsKpi3Title: '1st-Half Sleep HRV (Last dose < 7.5h before bed)',
    trendsKpi3Tooltip:
      'Average HRV in the first half of the night when a medication dose was taken closer to bedtime (< 7.5h before sleep).',
    trendsKpi3Sub: '{count} nights had higher sleep stress or lower early HRV',

    trendsKpi4Title: 'High Resting HR Alerts',
    trendsKpi4Tooltip:
      'Number of days where your Garmin watch recorded an abnormal high heart rate alert while inactive.',
    trendsKpi4Sub: 'Click any red dot on the chart below to view that day',

    trendsHrChartTitle: 'Heart Rate & Stress Over Time',
    trendsHrChartSub:
      'Top: Sleeping HR (04:00–07:00), Garmin Resting HR, and Daytime Seated HR (09:00–17:00, excluding workouts). Bottom: a stacked daily distribution of Garmin stress (Rest / Low / Medium / High time, 0–100%) with the day’s average and max stress curves on top. Hover either panel — the crosshair and tooltips stay synchronised across both charts so you can compare stress and heart rate day by day. Shaded bands mark each saved regimen period.',
    trendsStressChartTitle: 'All-Day Stress Distribution (Garmin, 0–100)',
    trendsStressTooltip:
      'Each column shows Garmin’s 0–100 stress scoring of every 2-minute wrist reading: the stacked segments split the day’s measured time into Rest, Low, Medium and High stress buckets (calm slate/green at the bottom, arousal amber/rose on top). The violet area is the day average; the dashed violet line is the day’s highest reading. Peaks often reflect workouts or caffeine — use the aligned crosshair to check what the heart-rate panel was doing at the same time.',
    legendStressAvg: 'Avg stress',
    legendStressMax: 'Max stress',

    trendsHrvChartTitle: 'Overnight HRV & Sleep Recovery Over Time',
    trendsHrvChartSub:
      'Compares 1st-half sleep HRV, 2nd-half sleep HRV, and your 7-day rolling average against Garmin’s Personal Balanced Band.',

    trendsCutoffTitle: 'Time Since Last Dose vs. Early-Night Sleep HRV',
    trendsCutoffSub:
      'Each dot is a medicated day, plotting hours between your last dose and bedtime against 1st-half sleep HRV.',
    trendsCutoffTakeaway:
      'Note: Taking the last dose at least ~8.5h before sleep helps keep early-night HRV closer to baseline.',

    // Regimen Comparison
    comparisonTitle: 'Regimen Comparison',
    comparisonSubtitle:
      'Since medication is not taken every day or always at the same dose, time periods and logged medication days are separated into two distinct tables below.',
    configurePeriodsBtn: 'Manage Periods & Guests',
    group1Title: '1. Comparison by Time Period (Chronological Dates)',
    group1Subtitle:
      'Compares consecutive calendar date ranges: Pre-Treatment (up to 21/09/2026) vs. after starting treatment (from 22/09/2026 onward, including both medicated and unmedicated days in that period).',
    group2Title: '2. Comparison by Logged Medication Use (Non-Consecutive Days)',
    group2Subtitle:
      'Groups individual days by whether medication was taken and by total daily dose logged, regardless of whether the days were consecutive.',
    colGroup: 'Group',
    colDaysCount: 'Days',
    colAsleepBase: 'Sleeping HR (04–07h)',
    colDaySeated: 'Daytime Seated HR',
    colSeatedDelta: 'Day vs. Sleep (ΔHR)',
    colEarlyLateHrv: 'Sleep HRV (1st → 2nd Half)',
    colSleepDur: 'Sleep Duration',
    colDeepRem: 'Deep + REM %',
    colSleepStress: 'Sleep Stress',
    colSymptomsFreq: 'Days w/ Symptoms',
    colAvgFocus: 'Avg Focus',

    cohortPreTreatmentTitle: 'Pre-Treatment',
    cohortPreTreatmentSub: '01/08/2026 → 21/09/2026 (Before starting medication)',
    cohortTreatmentTitle: 'Current Treatment (All Days)',
    cohortTreatmentSub: '22/09/2026 → Present (Mixed medicated & off-days)',

    cohortOffDaysAfterStartTitle: 'Unmedicated Days (Since 22/09/2026)',
    cohortOffDaysAfterStartSub: 'Days after 22/09/2026 with 0 logged doses',
    cohortAllMedicatedDaysTitle: 'All Medicated Days (Logged Dose)',
    cohortAllMedicatedDaysSub: 'Days with at least 1 logged medication dose',
    cohortLowDoseDaysTitle: 'Lower-Dose Days (≤ 10mg total)',
    cohortLowDoseDaysSub: 'Logged days with up to 10mg total medication',

    chartCompareHrTitle: 'Sleeping HR vs. Daytime Seated HR',
    chartCompareHrvTitle: '1st-Half vs. 2nd-Half Sleep HRV (ms)',

    // Settings Modal (Guests & Periods)
    settingsModalTitle: 'Guest Access & Time Periods',
    settingsModalSub: 'Manage who can view the dashboard in Guest View and customize date periods.',
    guestAccessTitle: 'Guest View Access (Allowed Google Emails)',
    guestAccessSub:
      'Anyone on this list can sign in with Google in read-only Guest View (your private notes are hidden). You can add as many guest emails as you want. Everyone else is blocked.',
    guestInputPlaceholder: 'Add one or more emails (e.g. guest@gmail.com)...',
    addGuestBtn: 'Add Guest',
    noGuestsYet: 'No guest emails added yet. Only you (Owner) can sign in.',
    periodsSectionTitle: 'Custom Time Periods',
    periodsSectionSub:
      'Chronological date ranges shown on the timeline and in Table 1 of Regimen Comparison.',
    addPeriodHeader: 'Add a Time Period',
    editPeriodHeader: 'Edit Time Period',
    periodTitlePlaceholder: 'Period name (e.g. Current Treatment)',
    customNameLabel: 'Custom name (all languages)',
    customNameHint:
      'When set, it overrides the built-in name in every language. Leave empty to keep the built-in name.',
    defaultNameLabel: 'Built-in name (auto-translated)',
    savePeriodBtn: 'Save changes',
    cancelBtn: 'Cancel',
    badgeColorLabel: 'Color:',
    startDateLabel: 'Start Date',
    endDateLabel: 'End Date',
    addPeriodBtn: 'Add Period',

    // Configurable Medication
    medicationLabel: 'Medication',
    medicationNameInputLabel: 'Medication Name',
    medicationNamePlaceholder: 'Enter medication name',
    customDoseLabel: 'Custom',
    customDosePlaceholder: 'mg',
    usePresetsBtn: 'Presets',
    medicationConfigTitle: 'Medication Settings',
    medicationConfigSub: 'Customize the medication name and quick dose buttons.',
    defaultMedicationLabel: 'Medication Name',
    defaultMedicationPlaceholder: 'Enter medication name',
    dosePresetsLabel: 'Quick Dose Buttons (mg, comma-separated)',
    dosePresetsPlaceholder: 'e.g. 5, 10, 15, 20',
    saveMedicationSettingsBtn: 'Save Medication Settings',
    medicationSettingsSavedToast: 'Medication settings updated successfully.',
  },

  pt: {
    appTitle: 'Painel de Saúde',
    appSubtitle: '',
    ownerBadge: 'Proprietário',
    guestViewBadge: 'Modo Convidado',
    previewGuestView: 'Ver como Convidado',
    exitGuestView: 'Sair do Modo Convidado',
    logButton: 'Registrar Dose / Nota',
    syncNow: 'Sincronizar Garmin',
    syncing: 'Sincronizando...',
    settings: 'Configurações',
    signIn: 'Entrar com Google',
    signOut: 'Sair',
    checkingSession: 'Verificando sessão...',
    privatePortalTitle: 'Painel de Saúde',
    privatePortalDesc:
      'Painel pessoal de acompanhamento. Entre com uma conta Google autorizada (Proprietário ou Convidado) para visualizar os dados do Garmin e registros de uso.',
    loadingData: 'Carregando dados do Garmin...',
    unauthorizedTitle: 'Acesso Restrito',
    unauthorizedHint:
      'Conectado como {email}. Apenas o proprietário e e-mails adicionados como convidados têm acesso.',
    syncError: 'Erro na sincronização',
    firebaseNotConfigured:
      'O Firebase não está configurado nesta build. Defina as variáveis de ambiente VITE_FIREBASE_* para habilitar o login.',
    todayBadge: 'Hoje',

    // Standalone /quick page (lightweight 1-tap logging entry point)
    quickAddTitle: 'Registro Rápido',
    quickAddDesc:
      'Registre doses, cafeína, sintomas e notas do dia em segundos. Entre com a conta do dono.',
    quickAddOwnerOnly: 'O registro rápido é exclusivo do dono',
    openDashboard: 'Abrir Dashboard',

    // Sleep markers (from Garmin bedtime & wake-up time) — shown as icons on the chart
    bedtimeMarkerIcon: '🌙',
    wakeMarkerIcon: '☀️',
    caffeineMarkerIcon: '☕',
    prevDayBandLabel: 'Noite anterior',
    prevDayTooltipSuffix: ' (dia anterior)',
    sleepBandLegend: 'Sono (dormir → acordar, do Garmin)',

    // Pending-sync day (Today selected before the scheduled Garmin sync has run)
    pendingSyncTitle: 'Ainda sem dados do Garmin para este dia',
    pendingSyncBody:
      'A sincronização agendada do Garmin roda às 10:00 e 22:00 (hora do relógio). Você ainda pode registrar doses, cafeína, sintomas, avaliações e notas para esta data — elas serão cruzadas com os batimentos assim que a sincronização rodar.',

    // Longitudinal trends chart legends
    legendGarminRhr: 'FC de Repouso Garmin',
    legendFirstHalfHrv: 'VFC na 1ª Metade do Sono',
    legendSecondHalfHrv: 'VFC na 2ª Metade do Sono',
    legendWeeklyAvgHrv: 'Média de 7 Dias',
    scatterLoggedDays: 'Dias Registrados',
    axisHoursBeforeSleep: 'Horas Antes de Dormir',
    axisSleepStress: 'Estresse no Sono',

    // Navigation Tabs
    tabDaily: 'Visão Diária',
    tabHeatmap: 'Tabela por Hora',
    tabTrends: 'Tendências e Sono',
    tabComparison: 'Comparação de Regimes de Tratamento',

    // Date bar & filters
    prevDay: 'Dia Anterior',
    nextDay: 'Próximo Dia',
    watchTimezone: 'Hora do relógio',
    filterDaysLabel: 'Filtrar datas por tipo:',
    filterRecent: 'Recentes',
    filterWorkouts: 'Dias com exercício',
    filterCarryover: 'Estresse no sono / alertas',
    filterMedicated: 'Dias com medicação registrada',
    present: 'Atual',

    // KPI Cards & Tooltips (Daily View)
    kpiSleepingHrTitle: 'FC Dormindo (04:00–07:00)',
    kpiSleepingHrTooltip:
      'Sua frequência cardíaca média entre 04:00 e 07:00 enquanto dorme — quando doses do dia anterior já passaram e antes de tomar qualquer dose pela manhã. FC Repouso é o valor diário calculado pelo Garmin.',
    kpiSleepingHrSub: 'FC de Repouso Garmin: {rhr} bpm',

    kpiDaytimeHrTitle: 'FC Diurna Sentado (09:00–17:00)',
    kpiDaytimeHrTooltip:
      'Sua frequência cardíaca média das 09:00 às 17:00, descontando automaticamente exercícios gravados no relógio mais 30 minutos de recuperação pós-treino para não distorcer a média.',
    kpiDaytimeHrSub: 'Sem treinos + 30m de recuperação',
    kpiDaytimeRawLabel: 'Com treino: {bpm} bpm',

    kpiHrvTitle: 'VFC Noturna (1ª → 2ª Metade)',
    kpiHrvTooltip:
      'A VFC (Variabilidade da Frequência Cardíaca, ou HRV em ms no Garmin) mede a recuperação do sistema nervoso durante o sono — quanto maior, mais relaxado. Comparar a 1ª metade com a 2ª metade do sono mostra se uma dose tarde da tarde deixou o corpo mais ativo no início da noite.',
    kpiHrvSub: 'Média da noite: {avg} ms • Status Garmin: {status}',

    kpiSleepTitle: 'Sono e Body Battery',
    kpiSleepTooltip:
      'Pontuação do Sono (0–100) e Estresse do Sono (0–100, onde <15 é bem tranquilo e ≥25 indica sono agitado) vêm do Garmin. A Body Battery (0–100) estima a energia recarregada à noite vs. gasta no dia.',
    kpiSleepStressLabel: 'Estresse no sono: {stress}',
    kpiBodyBatterySub: 'Body Battery: +{charged} / -{drained} (Pico {high})',

    // Main 24h Chart
    chart24hTitle: 'Frequência Cardíaca de 24 Horas e Atividades',
    chart24hSubtitle:
      'Leituras a cada 2 minutos do relógio Garmin.',
    chartClickHint: 'Dica: Clique em qualquer horário do gráfico para registrar naquele momento',
    activeWindowLabel: 'Duração est. da medicação:',
    activeWindowTooltip:
      'A medicação de liberação imediata (IR) costuma iniciar efeito em ~45 min, atingir o pico entre 1h e 2,5h e passar em cerca de 3,5h a 4,5h. Ajuste o controle para comparar com os batimentos.',
    legendMedicationActive: 'Janela ativa da medicação',
    legendWorkout: 'Exercício + 30m recuperação',
    legendBodyBattery: 'Body Battery (0–100%)',
    stressToggle: 'Estresse',
    stressToggleHint: 'Mostrar o resumo de estresse ao longo do dia do Garmin',
    stressPanelTitle: 'Estresse ao Longo do Dia',
    stressPanelTooltip:
      'O Garmin calcula uma pontuação de estresse de 0–100 a partir das leituras do pulso (quanto maior, mais ativação do sistema nervoso). Média e Máx são valores do dia inteiro; a barra mostra como o tempo registrado do dia foi dividido entre Repouso, Baixo, Médio e Alto estresse. Este resumo vem da sincronização diária do Garmin — a curva de estresse minuto a minuto não é exposta pela API Pessoal do Garmin, por isso não é desenhada na linha do tempo.',
    stressAvgLabel: 'Média {value}',
    stressMaxLabel: 'Máx {value}',
    stressRestLabel: 'Repouso',
    stressLowLabel: 'Baixo',
    stressMediumLabel: 'Médio',
    stressHighLabel: 'Alto',
    stressNoData: 'Sem resumo de estresse sincronizado para este dia.',
    doseSummaryBadge: 'Dose #{idx}: {mg}mg ({type}) às {time}',
    doseWindowHrBadge: 'FC sentado na janela: {hr} bpm ({delta} bpm vs sono)',
    workoutBadge: '{name} ({start}–{end}, +30m recup. → {cooldown})',
    baselineBandLabel: '04:00–07:00 Base Dormindo',
    baselineLineLabel: 'FC Dormindo: {bpm} bpm',
    seatedHrSeries: 'FC Sentado (bpm)',
    workoutHrSeries: 'FC Exercício / Recuperação (bpm)',
    bodyBatterySeries: 'Body Battery (%)',

    // Overnight HRV Chart
    chartHrvTitle: 'VFC (HRV) Durante o Sono (Leituras a cada 5 min)',
    chartHrvSubtitle:
      'Registrado na noite de sono que terminou em {date}. Divide o sono entre 1ª metade e 2ª metade da noite.',
    chartHrvTooltip:
      'A "Faixa Equilibrada Pessoal" (Personal Balanced Band, faixa verde) é calculada pelo próprio relógio Garmin com base nas suas últimas semanas. Ficar dentro ou acima dessa faixa indica recuperação normal.',
    balancedBandNote:
      'Faixa verde = Faixa Equilibrada Pessoal do Garmin ({low}–{high} ms): sua faixa normal de referência calculada pelo relógio nas semanas anteriores.',
    lastDoseToSleepBadge: 'Última dose → sono: {hours}h',
    lateCarryoverBadge: 'VFC mais baixa no início da noite',
    hrvSplitLabel: '1ª Metade ({early} ms) → 2ª Metade ({late} ms)',
    hrvSeriesName: 'VFC no Sono (ms)',

    // Daily Log Card (on Daily View)
    dailyLogCardTitle: 'Registros do Dia ({date})',
    dailyLogCardSub: 'Doses, cafeína e sintomas cruzados com os batimentos do relógio',
    addEntryBtn: 'Adicionar / Editar',
    noEventsForDay: 'Nenhuma dose, cafeína ou sintoma registrado em {date}.',
    focusLabel: 'Foco',
    moodLabel: 'Humor',
    appetiteLabel: 'Apetite',
    privateNoteLabel: 'Nota Privada (visível apenas para você)',
    noPrivateNote: 'Nenhuma nota privada neste dia.',
    editBtn: 'Editar',

    // QuickLogDrawer (Clean 2-tab logger)
    loggerTitle: 'Registro do Dia',
    loggerTabEvents: 'Doses e Eventos',
    loggerTabDailyNotes: 'Avaliação, Tags e Nota Privada',
    eventTimeLabel: 'Horário (24h)',
    eventTypeDose: 'Dose do Medicamento',
    eventTypeCaffeine: 'Cafeína',
    eventTypeSymptom: 'Sintoma / Sensação',
    doseAmountLabel: 'Quantidade da dose',
    releaseTypeLabel: 'Tipo',
    releaseIrDesc: 'IR (Liberação Imediata)',
    releaseLaDesc: 'LA (Longa Duração)',
    symptomSelectLabel: 'O que você sentiu:',
    severityLabel: 'Intensidade (1 = leve, 5 = forte)',
    optionalNotePlaceholder: 'Observação opcional (visível para convidados)...',
    addEventButtonDose: 'Salvar {mg}mg {med} ({type}) às {time}',
    addEventButtonCaffeine: 'Salvar {label} às {time}',
    addEventButtonSymptom: 'Salvar Sintoma às {time}',
    loggedTodayHeader: 'Registrado em {date}',
    noLoggedEventsYet: 'Nenhum evento registrado nesta data.',
    ratingsHeader: 'Avaliação Opcional do Dia (1–5)',
    ratingsSub:
      'Deixe em branco se não quiser avaliar hoje. Clique novamente em um número selecionado para desmarcar.',
    clearRatingsBtn: 'Limpar avaliação',
    tagsHeader: 'Tags Opcionais do Dia',
    tagsSub: 'Clique para marcar ou desmarcar (nenhuma vem marcada por padrão).',
    privateNoteHeader: 'Nota Privada',
    privateNoteSub: 'Apenas você pode ver — oculta no Modo Convidado.',
    privateNotePlaceholder: 'Escreva uma anotação pessoal para este dia...',
    saveDailyNotesBtn: 'Salvar Avaliação, Tags e Nota',
    savedFeedback: 'Salvo!',
    closeBtn: 'Fechar',

    // Carpet Heatmap (Hourly Table)
    heatmapTitle: 'Tabela de Frequência Cardíaca por Hora',
    heatmapSubtitle:
      'Cada linha é um dia (DD/MM/AAAA) e cada coluna é uma hora do dia (00h às 23h). Clique em qualquer linha para abrir o gráfico detalhado do dia.',
    excludeWorkoutsToggle: 'Descontar exercícios + 30m de recuperação (apenas FC sentado)',
    allPeriodsOption: 'Todas as Datas ({count} dias)',
    bpmScaleLabel: 'Escala de BPM:',
    scaleSleep: '≤56 (Sono)',
    scaleMedicated: '76–84 (Ativo)',
    scalePeak: '95+ (Alto)',
    colDate: 'Data',
    colPeriod: 'Regime de Tratamento',
    colSleepHr: 'FC Sono',
    colSeatedHr: 'FC Dia',
    colDeltaHr: 'Dif. (Δ)',
    colEvents: 'Registros',
    meanRowLabel: 'Média ({count}d)',
    seatedOnlyLabel: 'Sem treinos',
    allReadingsLabel: 'Com treinos',

    // Longitudinal Trends & Sleep
    trendsKpi1Title: 'FC Dormindo (04:00–07:00)',
    trendsKpi1Tooltip:
      'Mostra se sua frequência cardíaca de madrugada (sem efeito de medicação) permanece estável ao longo dos meses.',
    trendsKpi1Value: 'Estável',
    trendsKpi1Sub: 'Linha de base dormindo ao longo de {count} dias',

    trendsKpi2Title: 'VFC na 1ª Metade do Sono (Última dose ≥ 8,5h antes)',
    trendsKpi2Tooltip:
      'VFC média na primeira metade da noite quando a última dose de medicação foi tomada pelo menos 8,5 horas antes de dormir.',
    trendsKpi2Sub: 'Quando a última dose foi ≥ 8,5h antes de dormir',

    trendsKpi3Title: 'VFC na 1ª Metade do Sono (Última dose < 7,5h antes)',
    trendsKpi3Tooltip:
      'VFC média na primeira metade da noite quando a última dose foi tomada mais perto da hora de dormir (< 7,5h antes).',
    trendsKpi3Sub: '{count} noites tiveram estresse no sono maior ou VFC inicial menor',

    trendsKpi4Title: 'Alertas de FC Alta em Repouso',
    trendsKpi4Tooltip:
      'Número de dias em que o relógio Garmin registrou um alerta de frequência cardíaca elevada estando parado.',
    trendsKpi4Sub: 'Clique em qualquer ponto vermelho no gráfico abaixo para abrir o dia',

    trendsHrChartTitle: 'Evolução da FC e do Estresse',
    trendsHrChartSub:
      'Topo: FC Dormindo (04:00–07:00), FC de Repouso Garmin e FC Diurna Sentado (09:00–17:00, sem exercícios). Base: distribuição diária empilhada do estresse do Garmin (tempo em Repouso / Baixo / Médio / Alto, 0–100%) com as curvas de média e máxima do dia. Passe o mouse em qualquer painel — o cursor e os tooltips ficam sincronizados entre os dois gráficos para comparar estresse e frequência cardíaca dia a dia. As faixas sombreadas marcam cada regime de tratamento salvo.',
    trendsStressChartTitle: 'Distribuição do Estresse Diário (do Garmin, 0–100)',
    trendsStressTooltip:
      'Cada coluna mostra como o Garmin atribuiu uma pontuação de estresse de 0–100 a cada leitura de pulso de 2 minutos: os segmentos empilhados dividem o tempo medido do dia entre Repouso, Baixo, Médio e Alto estresse (tranquilidade cinza/verde embaixo, ativação amarelo/rosa no topo). A área violeta é a média do dia; a linha tracejada violeta é a maior leitura do dia. Picos costumam refletir exercícios ou cafeína — use o cursor alinhado para ver o que a FC estava fazendo no mesmo horário.',
    legendStressAvg: 'Estresse médio',
    legendStressMax: 'Estresse máximo',

    trendsHrvChartTitle: 'Evolução da VFC (HRV) Noturna',
    trendsHrvChartSub:
      'Compara a VFC na 1ª metade do sono, 2ª metade do sono e média de 7 dias em relação à Faixa Equilibrada Pessoal do Garmin.',

    trendsCutoffTitle: 'Intervalo da Última Dose até Dormir vs. VFC Inicial',
    trendsCutoffSub:
      'Cada ponto representa um dia com medicação registrada, cruzando quantas horas antes de dormir foi a última dose com a VFC da 1ª metade do sono.',
    trendsCutoffTakeaway:
      'Observação: Tomar a última dose pelo menos ~8,5h antes de dormir ajuda a manter a VFC do início da noite próxima do normal.',

    // Regimen Comparison
    comparisonTitle: 'Comparação de Regimes de Tratamento',
    comparisonSubtitle:
      'Como a medicação pode não ser tomada todos os dias e nem sempre na mesma dose — separamos abaixo a comparação por períodos de calendário (Tabela 1) da comparação por dias com ou sem uso registrado (Tabela 2).',
    configurePeriodsBtn: 'Gerenciar Convidados e Regimes',
    group1Title: '1. Comparação por Período de Tempo (Datas Consecutivas)',
    group1Subtitle:
      'Compara intervalos contínuos no calendário: o regime Pré-Tratamento (até 21/09/2026) vs. o regime após iniciar o tratamento (a partir de 22/09/2026, incluindo tanto os dias em que tomou quanto os dias em que não tomou).',
    group2Title: '2. Comparação por Uso Registrado (Dias Não Consecutivos)',
    group2Subtitle:
      'Agrupa os dias individualmente conforme o registro de uso e a dose total do dia, independentemente de serem dias seguidos.',
    colGroup: 'Grupo',
    colDaysCount: 'Dias',
    colAsleepBase: 'FC Dormindo (04–07h)',
    colDaySeated: 'FC Diurna Sentado',
    colSeatedDelta: 'Dia vs. Sono (ΔFC)',
    colEarlyLateHrv: 'VFC Sono (1ª → 2ª Metade)',
    colSleepDur: 'Duração do Sono',
    colDeepRem: 'Sono Profundo + REM',
    colSleepStress: 'Estresse no Sono',
    colSymptomsFreq: 'Dias c/ Sintomas',
    colAvgFocus: 'Foco Médio',

    cohortPreTreatmentTitle: 'Pré-Tratamento',
    cohortPreTreatmentSub: '01/08/2026 → 21/09/2026 (Antes de começar a tomar)',
    cohortTreatmentTitle: 'Tratamento Atual (Todos os Dias)',
    cohortTreatmentSub: '22/09/2026 → Atual (Inclui dias com e sem medicação)',

    cohortOffDaysAfterStartTitle: 'Dias Sem Medicação (Desde 22/09/2026)',
    cohortOffDaysAfterStartSub: 'Dias após 22/09/2026 com 0 doses registradas',
    cohortAllMedicatedDaysTitle: 'Todos os Dias Medicados (Com Registro)',
    cohortAllMedicatedDaysSub: 'Dias com pelo menos 1 dose de medicação registrada',
    cohortLowDoseDaysTitle: 'Dias com Dose Menor (≤ 10mg no dia)',
    cohortLowDoseDaysSub: 'Dias registrados com até 10mg no total',

    chartCompareHrTitle: 'FC Dormindo vs. FC Diurna Sentado',
    chartCompareHrvTitle: 'VFC na 1ª Metade vs. 2ª Metade do Sono (ms)',

    // Settings Modal (Guests & Periods)
    settingsModalTitle: 'Acesso de Convidados e Regimes de Tratamento',
    settingsModalSub:
      'Adicione quantos e-mails quiser como convidados (somente leitura) e gerencie os regimes de tratamento.',
    guestAccessTitle: 'E-mails Convidados (Modo Convidado)',
    guestAccessSub:
      'Qualquer pessoa nesta lista pode entrar com o Google para ver os gráficos no Modo Convidado (suas notas privadas nunca aparecem). Você pode adicionar quantos e-mails quiser. Qualquer outro e-mail é bloqueado.',
    guestInputPlaceholder: 'Digite um ou mais e-mails (ex: medico@gmail.com)...',
    addGuestBtn: 'Adicionar Convidado',
    noGuestsYet: 'Nenhum convidado adicionado ainda. Apenas você tem acesso.',
    periodsSectionTitle: 'Regimes de Tratamento no Calendário',
    periodsSectionSub:
      'Intervalos de datas usados na linha do tempo e na Tabela 1 da Comparação de Regimes de Tratamento.',
    addPeriodHeader: 'Adicionar Novo Regime de Tratamento',
    editPeriodHeader: 'Editar Regime de Tratamento',
    periodTitlePlaceholder: 'Nome do regime (ex: Tratamento Atual)',
    customNameLabel: 'Nome personalizado (todos os idiomas)',
    customNameHint:
      'Se preenchido, sobrepõe o nome padrão em todos os idiomas. Deixe vazio para manter o nome padrão.',
    defaultNameLabel: 'Nome interno (traduzido automaticamente)',
    savePeriodBtn: 'Salvar alterações',
    cancelBtn: 'Cancelar',
    badgeColorLabel: 'Cor:',
    startDateLabel: 'Data Inicial',
    endDateLabel: 'Data Final',
    addPeriodBtn: 'Salvar Regime',

    // Configurable Medication
    medicationLabel: 'Medicamento',
    medicationNameInputLabel: 'Nome do Medicamento',
    medicationNamePlaceholder: 'Digite o nome do medicamento',
    customDoseLabel: 'Outra',
    customDosePlaceholder: 'mg',
    usePresetsBtn: 'Botões',
    medicationConfigTitle: 'Configurações da Medicação',
    medicationConfigSub: 'Personalize o nome da medicação e os botões de dose rápida.',
    defaultMedicationLabel: 'Nome do Medicamento',
    defaultMedicationPlaceholder: 'Digite o nome do medicamento',
    dosePresetsLabel: 'Botões de Dose Rápida (mg, separados por vírgula)',
    dosePresetsPlaceholder: 'ex: 5, 10, 15, 20',
    saveMedicationSettingsBtn: 'Salvar Configurações da Medicação',
    medicationSettingsSavedToast: 'Configurações de medicação salvas com sucesso.',
  },
} as const;

export type TranslationKeys = keyof typeof translations.en;

export function translateSideEffect(tag: SideEffectTag, lang: Language): string {
  const map: Record<SideEffectTag, { en: string; pt: string }> = {
    crash: { en: 'Wear-off / Tiredness', pt: 'Queda de efeito / Cansaço' },
    palpitations: { en: 'Noticeable Heartbeat', pt: 'Batimento acelerado' },
    jittery: { en: 'Restless / Jittery', pt: 'Agitação / Inquietação' },
    headache: { en: 'Headache', pt: 'Dor de cabeça' },
    anxiety: { en: 'Anxiety', pt: 'Ansiedade' },
    dry_mouth: { en: 'Dry Mouth', pt: 'Boca seca' },
    appetite_loss: { en: 'Lower Appetite', pt: 'Falta de apetite' },
    insomnia: { en: 'Hard to Fall Asleep', pt: 'Dificuldade para dormir' },
    peak_focus: { en: 'Good Focus', pt: 'Bom foco' },
  };
  return map[tag]?.[lang] ?? tag;
}

export function translateContextTag(tag: string, lang: Language): string {
  const map: Record<string, { en: string; pt: string }> = {
    Workday: { en: 'Workday', pt: 'Dia de trabalho' },
    'Weekend / Off-meds': { en: 'Day off / No medication', pt: 'Dia sem medicação / Folga' },
    Exercise: { en: 'Exercise', pt: 'Exercício' },
    'Poor sleep': { en: 'Poor sleep', pt: 'Sono ruim' },
    'Travel / Alcohol': { en: 'Travel / Social', pt: 'Viagem / Social' },
    'High workload': { en: 'Busy day', pt: 'Dia corrido' },
  };
  return map[tag]?.[lang] ?? tag;
}

/**
 * Canonical titles seeded into Firestore are shown in the viewer's language.
 * Any title edited by the Owner is displayed verbatim — never masked here —
 * so renaming a regimen in Settings always changes what users see.
 *
 * There are only two canonical phases. Everything else (older seed titles like
 * "Unmedicated Baseline" or "Active Treatment") is just an alias of one of
 * them; unknown titles are custom Owner-written names, shown as-is.
 */
type EraPhaseKey = 'pre-treatment' | 'current-treatment';

const ERA_TITLE_ALIASES: Record<string, EraPhaseKey> = {
  'pre-treatment': 'pre-treatment',
  'unmedicated baseline': 'pre-treatment',
  'pré-tratamento': 'pre-treatment',
  'since starting treatment': 'current-treatment',
  'current treatment': 'current-treatment',
  'treatment': 'current-treatment',
  'tratamento': 'current-treatment',
  'tratamento atual': 'current-treatment',
  'após iniciar tratamento': 'current-treatment',
};

const PHASE_DISPLAY: Record<EraPhaseKey, { en: string; pt: string }> = {
  'pre-treatment': { en: 'Pre-Treatment', pt: 'Pré-Tratamento' },
  'current-treatment': { en: 'Current Treatment', pt: 'Tratamento Atual' },
};

const PHASE_DEFAULT_TITLES: Record<EraPhaseKey, string> = {
  'pre-treatment': 'Pre-Treatment',
  'current-treatment': 'Current Treatment',
};

export function translateEraTitle(_id: string, rawTitle: string, lang: Language): string {
  const phase = ERA_TITLE_ALIASES[rawTitle.trim().toLowerCase()];
  return phase ? PHASE_DISPLAY[phase][lang] : rawTitle;
}

/** Built-in regimens by era id, mapped to their canonical phase. */
const BUILT_IN_ERA_IDS: Partial<Record<string, EraPhaseKey>> = {
  'era-pre-treatment': 'pre-treatment',
  'era-treatment': 'current-treatment',
  'era-since-starting-treatment': 'current-treatment',
};

/**
 * Built-in regimens are auto-translated, so their titles cannot be edited
 * directly — the Owner writes an optional custom name instead (empty = keep
 * using the translated default).
 */
export function defaultEraTitle(eraId: string): string {
  const phase = BUILT_IN_ERA_IDS[eraId];
  return phase ? PHASE_DEFAULT_TITLES[phase] : '';
}

/** True when the stored title is still a built-in canonical one. */
export function isBuiltInEraTitle(eraId: string, title: string): boolean {
  const key = title.trim().toLowerCase();
  const aliasPhase = ERA_TITLE_ALIASES[key];
  if (aliasPhase === undefined) return false;
  const idPhase = BUILT_IN_ERA_IDS[eraId];
  return idPhase === undefined ? true : aliasPhase === idPhase;
}

/** True when the title (regardless of era id) is a built-in canonical name. */
export function isCanonicalEraTitle(title: string): boolean {
  return ERA_TITLE_ALIASES[title.trim().toLowerCase()] !== undefined;
}

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKeys, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('health_dashboard_lang');
      if (saved === 'en' || saved === 'pt') return saved;
      if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('pt')) {
        return 'pt';
      }
    } catch {
      // ignore storage errors
    }
    return 'en';
  });

  const setLang = (next: Language) => {
    setLangState(next);
    try {
      localStorage.setItem('health_dashboard_lang', next);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    document.title = translations[lang].appTitle;
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
  }, [lang]);

  const t = (key: TranslationKeys, vars?: Record<string, string | number>): string => {
    let str: string = translations[lang][key] ?? translations.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return str;
  };

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return ctx;
}
