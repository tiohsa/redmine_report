import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n';
import type { ReportPreset } from '../../services/reportPresetStorage';
import {
  buildTargetsFromPreset,
  fetchReportDetail,
  updateReportDetail,
  type ReportDetailResponse
} from '../../services/reportDetailApi';
import { reportStyles } from '../designSystem';
import { Button } from '../ui/Button';
import { BindReportDetailIssueDialog } from './BindReportDetailIssueDialog';

type ReportDetailPanelProps = {
  rootProjectIdentifier: string;
  rootProjectId: number;
  activePreset: ReportPreset;
  onPresetChange: (preset: ReportPreset) => void;
  onDirtyStateChange?: (dirty: boolean) => void;
};

type CardSection = {
  key: string;
  title: string;
  badge: string;
  subtitle: string;
  accentColor: string;
  numberColor: string;
};

const CARD_SECTIONS: CardSection[] = [
  {
    key: 'fact',
    title: 'reportDetail.cardFact',
    badge: 'reportDetail.cardFactBadge',
    subtitle: 'reportDetail.cardFactSubtitle',
    accentColor: 'bg-[var(--color-brand-6)]',
    numberColor: 'bg-[var(--color-brand-6)]'
  },
  {
    key: 'next',
    title: 'reportDetail.cardNext',
    badge: 'reportDetail.cardNextBadge',
    subtitle: 'reportDetail.cardNextSubtitle',
    accentColor: 'bg-[var(--color-brand-00)]',
    numberColor: 'bg-[var(--color-brand-00)]'
  },
  {
    key: 'decision',
    title: 'reportDetail.cardDecision',
    badge: 'reportDetail.cardDecisionBadge',
    subtitle: 'reportDetail.cardDecisionSubtitle',
    accentColor: 'bg-[var(--color-brand-02)]',
    numberColor: 'bg-[var(--color-brand-02)]'
  }
];

type RowsState = {
  highlights_this_week: string[];
  next_week_actions: string[];
  risks: string[];
  decisions: string[];
};

const DEFAULT_ROWS: RowsState = {
  highlights_this_week: ['該当なし'],
  next_week_actions: ['該当なし'],
  risks: ['該当なし'],
  decisions: ['該当なし']
};

const rowsEqual = (a: RowsState, b: RowsState) =>
  JSON.stringify(a) === JSON.stringify(b);

function EditableCard({
  section,
  rows,
  onRowChange,
  onRowAdd,
  onRowDelete,
  isDirty
}: {
  section: CardSection;
  rows: string[];
  onRowChange: (index: number, value: string) => void;
  onRowAdd: () => void;
  onRowDelete: (index: number) => void;
  isDirty: boolean;
}) {
  return (
    <div
      className={`report-detail-card ${isDirty ? 'report-detail-card-dirty' : ''}`}
      data-testid={`detail-card-${section.key}`}
    >
      <div className={`report-detail-card-accent ${section.accentColor}`} />
      <div className="report-detail-card-header">
        <div>
          <div className="report-detail-card-title">{t(section.title)}</div>
          <div className="report-detail-card-subtitle">{t(section.subtitle)}</div>
        </div>
        <span className="report-detail-card-badge">{t(section.badge)}</span>
      </div>
      <div className="report-detail-card-body">
        {rows.map((row, index) => (
          <div key={index} className="report-detail-row" data-testid={`detail-row-${section.key}-${index}`}>
            <span className={`report-detail-row-number ${section.numberColor}`}>{index + 1}</span>
            <input
              type="text"
              className="report-detail-row-input"
              value={row}
              onChange={(e) => onRowChange(index, e.target.value)}
              placeholder={t('reportDetail.defaultRow')}
              aria-label={`${t(section.title)} row ${index + 1}`}
              data-testid={`detail-input-${section.key}-${index}`}
            />
            <button
              type="button"
              className="report-detail-row-delete"
              onClick={() => onRowDelete(index)}
              aria-label={`Delete row ${index + 1}`}
              data-testid={`detail-delete-${section.key}-${index}`}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="report-detail-add-row"
          onClick={onRowAdd}
          data-testid={`detail-add-${section.key}`}
        >
          {t('reportDetail.addRow')}
        </button>
      </div>
      <div className="report-detail-card-footer">
        <span className="text-[11px] font-sans text-[#8e8e93]">
          {t('reportDetail.rowCount', { count: rows.length })}
        </span>
      </div>
    </div>
  );
}

export function ReportDetailPanel({
  rootProjectIdentifier,
  rootProjectId,
  activePreset,
  onPresetChange,
  onDirtyStateChange
}: ReportDetailPanelProps) {
  const [rows, setRows] = useState<RowsState>(DEFAULT_ROWS);
  const [baselineRows, setBaselineRows] = useState<RowsState>(DEFAULT_ROWS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [bindDialogOpen, setBindDialogOpen] = useState(false);
  const fetchSeqRef = useRef(0);

  const isBound = Boolean(
    activePreset.detailReportIssueId && activePreset.detailReportIssueStatus === 'VALID'
  );

  const dirty = useMemo(() => !rowsEqual(rows, baselineRows), [rows, baselineRows]);

  useEffect(() => {
    onDirtyStateChange?.(dirty);
  }, [dirty, onDirtyStateChange]);

  const loadDetail = useCallback(async () => {
    if (!isBound || !activePreset.detailReportIssueId) {
      setRows(DEFAULT_ROWS);
      setBaselineRows(DEFAULT_ROWS);
      return;
    }

    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setErrorMessage(null);
    setSavedMessage(null);

    try {
      const targets = buildTargetsFromPreset(activePreset.targets);
      const result: ReportDetailResponse = await fetchReportDetail(rootProjectIdentifier, {
        destination_issue_id: activePreset.detailReportIssueId,
        targets
      });

      if (seq !== fetchSeqRef.current) return;

      if (result.status === 'AVAILABLE') {
        const newRows: RowsState = {
          highlights_this_week: result.highlights_this_week?.length ? result.highlights_this_week : ['該当なし'],
          next_week_actions: result.next_week_actions?.length ? result.next_week_actions : ['該当なし'],
          risks: result.risks?.length ? result.risks : ['該当なし'],
          decisions: result.decisions?.length ? result.decisions : ['該当なし']
        };
        setRows(newRows);
        setBaselineRows(newRows);
      } else {
        setRows(DEFAULT_ROWS);
        setBaselineRows(DEFAULT_ROWS);
      }
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      const msg = err instanceof Error ? err.message : t('reportDetail.fetchDetailFailed');
      setErrorMessage(msg);
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [isBound, activePreset.detailReportIssueId, activePreset.targets, rootProjectIdentifier]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleSave = async () => {
    if (!isBound || !activePreset.detailReportIssueId || saving || !dirty) return;

    setSaving(true);
    setErrorMessage(null);
    setSavedMessage(null);

    try {
      const targets = buildTargetsFromPreset(activePreset.targets);
      await updateReportDetail(rootProjectIdentifier, {
        destination_issue_id: activePreset.detailReportIssueId,
        targets,
        highlights_this_week: rows.highlights_this_week,
        next_week_actions: rows.next_week_actions,
        risks: rows.risks,
        decisions: rows.decisions
      });
      setBaselineRows({ ...rows });
      setSavedMessage(t('reportDetail.savedDetail'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('reportDetail.saveDetailFailed');
      setErrorMessage(msg);
    } finally {
      setSaving(false);
    }
  };

  // Row manipulation helpers — generic for any key
  const updateRow = (key: keyof RowsState, index: number, value: string) => {
    setRows((prev) => ({
      ...prev,
      [key]: prev[key].map((r, i) => (i === index ? value : r))
    }));
    setSavedMessage(null);
  };

  const addRow = (key: keyof RowsState) => {
    setRows((prev) => ({
      ...prev,
      [key]: [...prev[key], '']
    }));
    setSavedMessage(null);
  };

  const deleteRow = (key: keyof RowsState, index: number) => {
    setRows((prev) => {
      const next = prev[key].filter((_, i) => i !== index);
      return { ...prev, [key]: next.length === 0 ? [''] : next };
    });
    setSavedMessage(null);
  };

  // Map card sections to row keys
  const cardRowKeys: Record<string, keyof RowsState> = {
    fact: 'highlights_this_week',
    next: 'next_week_actions'
  };

  // Third card: combined risks + decisions
  const combinedDecisionRows = useMemo(
    () => [...rows.risks, ...rows.decisions],
    [rows.risks, rows.decisions]
  );

  const baselineCombinedDecisionRows = useMemo(
    () => [...baselineRows.risks, ...baselineRows.decisions],
    [baselineRows.risks, baselineRows.decisions]
  );

  const handleDecisionRowChange = (index: number, value: string) => {
    const riskCount = rows.risks.length;
    if (index < riskCount) {
      updateRow('risks', index, value);
    } else {
      updateRow('decisions', index - riskCount, value);
    }
  };

  const handleDecisionRowAdd = () => {
    // Add to decisions by default
    addRow('decisions');
  };

  const handleDecisionRowDelete = (index: number) => {
    const riskCount = rows.risks.length;
    if (index < riskCount) {
      deleteRow('risks', index);
    } else {
      deleteRow('decisions', index - riskCount);
    }
  };

  return (
    <section className={`${reportStyles.surfaceElevated} mt-4 flex min-h-0 flex-col overflow-hidden`} data-testid="report-detail-panel">
      {/* Header */}
      <div className="report-detail-header">
        <div>
          <div className="report-detail-header-title">
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="report-detail-badges">
            <span className="report-detail-badge">{t('reportDetail.inlineEdit')}</span>
            <span className="report-detail-badge">{t('reportDetail.dynamicRows')}</span>
          </div>
          {dirty && (
            <span className="text-[13px] font-sans font-medium text-[var(--color-warning-text)]" data-testid="unsaved-indicator">
              {t('reportDetail.unsavedChanges')}
            </span>
          )}
          {savedMessage && !dirty && (
            <span className="text-[13px] font-sans font-medium text-[var(--color-success-text)]">
              {savedMessage}
            </span>
          )}
          {errorMessage && (
            <span className="text-[13px] font-sans font-medium text-[var(--color-danger-text)]" role="alert">
              {errorMessage}
            </span>
          )}

          {/* Issue binding controls */}
          {activePreset.detailReportIssueId ? (
            <a
              href={`/issues/${activePreset.detailReportIssueId}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-[8px] border border-[#e5e7eb] px-3 py-1.5 text-[12px] font-semibold text-[#17437d]"
            >
              {t('reportDetail.issueLabel', { id: activePreset.detailReportIssueId })}
            </a>
          ) : (
            <span className="rounded-[8px] border border-[#e5e7eb] px-3 py-1.5 text-[12px] font-semibold text-[#45515e]">
              {t('reportDetail.unbound')}
            </span>
          )}
          <Button variant="pill-secondary" size="sm" className="h-8 px-3 text-[12px]" onClick={() => setBindDialogOpen(true)}>
            {t('reportDetail.bindIssue')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isBound || !dirty || saving}
            loading={saving}
            data-testid="save-detail-btn"
          >
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>

      {/* Content */}
      {!isBound && (
        <div className={`${reportStyles.emptyState} mx-6 mt-4`} data-testid="report-detail-unbound">
          <p className="text-[14px] font-medium text-[#45515e]">{t('reportDetail.saveRequiresIssue')}</p>
        </div>
      )}

      {loading ? (
        <div className={`${reportStyles.loadingState} mx-6 my-4`}>
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-100 border-t-[var(--color-brand-6)] mb-3" />
          <p className="text-[13px] text-[#45515e] font-sans">{t('reportDetail.fetchingDetail')}</p>
        </div>
      ) : (
        <div className="report-detail-cards mt-4">
          {/* Card 1: Highlights */}
          <EditableCard
            section={CARD_SECTIONS[0]}
            rows={rows.highlights_this_week}
            onRowChange={(i, v) => updateRow('highlights_this_week', i, v)}
            onRowAdd={() => addRow('highlights_this_week')}
            onRowDelete={(i) => deleteRow('highlights_this_week', i)}
            isDirty={JSON.stringify(rows.highlights_this_week) !== JSON.stringify(baselineRows.highlights_this_week)}
          />
          {/* Card 2: Next actions */}
          <EditableCard
            section={CARD_SECTIONS[1]}
            rows={rows.next_week_actions}
            onRowChange={(i, v) => updateRow('next_week_actions', i, v)}
            onRowAdd={() => addRow('next_week_actions')}
            onRowDelete={(i) => deleteRow('next_week_actions', i)}
            isDirty={JSON.stringify(rows.next_week_actions) !== JSON.stringify(baselineRows.next_week_actions)}
          />
          {/* Card 3: Risks + Decisions combined */}
          <EditableCard
            section={CARD_SECTIONS[2]}
            rows={combinedDecisionRows}
            onRowChange={handleDecisionRowChange}
            onRowAdd={handleDecisionRowAdd}
            onRowDelete={handleDecisionRowDelete}
            isDirty={JSON.stringify(combinedDecisionRows) !== JSON.stringify(baselineCombinedDecisionRows)}
          />
        </div>
      )}

      {bindDialogOpen ? (
        <BindReportDetailIssueDialog
          rootProjectIdentifier={rootProjectIdentifier}
          rootProjectId={rootProjectId}
          activePreset={activePreset}
          onBind={onPresetChange}
          onClose={() => setBindDialogOpen(false)}
        />
      ) : null}
    </section>
  );
}
