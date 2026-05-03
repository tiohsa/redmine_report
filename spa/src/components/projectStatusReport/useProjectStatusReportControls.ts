import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../../stores/uiStore';

const CHART_SCALE_STORAGE_KEY = 'redmine_report.schedule.chartScale';
const SHOW_ALL_DATES_STORAGE_KEY = 'redmine_report.schedule.showAllDates';
const SHOW_TODAY_LINE_STORAGE_KEY = 'redmine_report.schedule.showTodayLine';
const SHOW_TITLES_STORAGE_KEY = 'redmine_report.schedule.showTitles';
const PROCESS_MODE_STORAGE_KEY = 'redmine_report.schedule.processMode';

const VALID_CHART_SCALES = [0.5, 0.75, 1, 1.5] as const;

const readStoredChartScale = (): number => {
  if (typeof window === 'undefined') return 1;

  try {
    const raw = window.localStorage.getItem(CHART_SCALE_STORAGE_KEY);
    const parsed = raw ? Number(raw) : Number.NaN;
    return VALID_CHART_SCALES.includes(parsed as (typeof VALID_CHART_SCALES)[number]) ? parsed : 1;
  } catch {
    return 1;
  }
};

const readStoredBoolean = (key: string, fallback: boolean): boolean => {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === 'true';
  } catch {
    return fallback;
  }
};

const writeStoredScheduleViewSetting = (key: string, value: string) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures
  }
};

export const useProjectStatusReportControls = () => {
  const [chartScale, setChartScale] = useState<number>(() => readStoredChartScale());
  const [showAllDates, setShowAllDates] = useState<boolean>(() => readStoredBoolean(SHOW_ALL_DATES_STORAGE_KEY, false));
  const [showTodayLine, setShowTodayLine] = useState<boolean>(() => readStoredBoolean(SHOW_TODAY_LINE_STORAGE_KEY, true));
  const [showTitles, setShowTitles] = useState<boolean>(() => readStoredBoolean(SHOW_TITLES_STORAGE_KEY, true));
  const [isProcessMode, setIsProcessMode] = useState<boolean>(() => readStoredBoolean(PROCESS_MODE_STORAGE_KEY, false));
  
  const {
    isProjectOpen, setIsProjectOpen,
    isVersionOpen, setIsVersionOpen,
    isSizeOpen, setIsSizeOpen,
    isLegendOpen, setIsLegendOpen
  } = useUiStore();

  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const versionDropdownRef = useRef<HTMLDivElement>(null);
  const sizeDropdownRef = useRef<HTMLDivElement>(null);
  const legendDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      if (!document.body.contains(target)) {
        return;
      }

      if (projectDropdownRef.current && !projectDropdownRef.current.contains(target)) {
        setIsProjectOpen(false);
      }
      if (versionDropdownRef.current && !versionDropdownRef.current.contains(target)) {
        setIsVersionOpen(false);
      }
      if (sizeDropdownRef.current && !sizeDropdownRef.current.contains(target)) {
        setIsSizeOpen(false);
      }
      if (legendDropdownRef.current && !legendDropdownRef.current.contains(target)) {
        setIsLegendOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [setIsProjectOpen, setIsVersionOpen, setIsSizeOpen, setIsLegendOpen]);

  useEffect(() => {
    writeStoredScheduleViewSetting(CHART_SCALE_STORAGE_KEY, String(chartScale));
  }, [chartScale]);

  useEffect(() => {
    writeStoredScheduleReportSetting(SHOW_ALL_DATES_STORAGE_KEY, String(showAllDates));
  }, [showAllDates]);

  useEffect(() => {
    writeStoredScheduleReportSetting(SHOW_TODAY_LINE_STORAGE_KEY, String(showTodayLine));
  }, [showTodayLine]);
  
  useEffect(() => {
    writeStoredScheduleReportSetting(SHOW_TITLES_STORAGE_KEY, String(showTitles));
  }, [showTitles]);

  useEffect(() => {
    writeStoredScheduleReportSetting(PROCESS_MODE_STORAGE_KEY, String(isProcessMode));
  }, [isProcessMode]);

  return {
    chartScale,
    setChartScale,
    showAllDates,
    setShowAllDates,
    showTodayLine,
    setShowTodayLine,
    showTitles,
    setShowTitles,
    isProcessMode,
    setIsProcessMode,
    isProjectOpen,
    setIsProjectOpen,
    isVersionOpen,
    setIsVersionOpen,
    isSizeOpen,
    setIsSizeOpen,
    isLegendOpen,
    setIsLegendOpen,
    projectDropdownRef,
    versionDropdownRef,
    sizeDropdownRef,
    legendDropdownRef,
  };
};

const writeStoredScheduleReportSetting = (key: string, value: string) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures
  }
};
