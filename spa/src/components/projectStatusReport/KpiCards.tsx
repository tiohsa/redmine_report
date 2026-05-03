import { Icon } from '../ui/Icon';
import { cn } from '../ui/cn';

export interface KpiData {
  status: '順調' | '注意' | '遅延懸念' | '要対策';
  statusReason: string;
  progressRate: number;
  progressDiff: number; // vs previous week e.g. +6
  milestoneCompleted: number;
  milestoneTotal: number;
  delayedItems: number;
  importantDelayedItems: number;
  highRiskCount: number;
  criticalPathDelayDays: number;
}

interface KpiCardsProps {
  data: KpiData;
}

export function KpiCards({ data }: KpiCardsProps) {
  // Helpers for Status formatting
  const statusConfig = {
    '順調': { bg: 'bg-green-100', text: 'text-green-700', symbol: '●' },
    '注意': { bg: 'bg-[#ffedd5]', text: 'text-[#b45309]', symbol: '⚠' },
    '遅延懸念': { bg: 'bg-orange-100', text: 'text-orange-700', symbol: '⚠' },
    '要対策': { bg: 'bg-red-100', text: 'text-red-700', symbol: '‼' },
  };
  const sc = statusConfig[data.status];

  // Progress circle SVG calculations
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (data.progressRate / 100) * circumference;

  return (
    <section className="kpi-board mb-[18px] grid grid-cols-[1.05fr_5fr] gap-4 px-8">
      {/* 1. Status Card */}
      <div className="status-card flex flex-col items-center justify-center rounded-lg border border-[#f2f3f5] bg-white p-6 text-center shadow-subtle">
        <div className="text-[13px] font-bold text-[#18181b]">全体ステータス</div>
        <div className={cn('my-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[20px] font-bold', sc.bg, sc.text)}>
          <span>{sc.symbol} {data.status}</span>
        </div>
        <p className="m-0 text-[13px] text-[#45515e]">{data.statusReason}</p>
      </div>

      {/* KPI Items Card */}
      <div className="kpi-card grid grid-cols-5 overflow-hidden rounded-lg border border-[#f2f3f5] bg-white shadow-subtle">
        {/* Progress Rate */}
        <div className="kpi-item min-h-[160px] p-7 border-r border-[#f2f3f5]">
          <div className="mb-5 text-[13px] font-bold text-[#18181b]">全体進捗率</div>
          <div className="flex items-center gap-4">
            <div className="relative h-[70px] w-[70px] flex-shrink-0">
              <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 80 80">
                <circle
                  className="text-gray-200"
                  strokeWidth="8"
                  stroke="currentColor"
                  fill="transparent"
                  r={radius}
                  cx="40"
                  cy="40"
                />
                <circle
                  className="text-[#1456f0] transition-all duration-700 ease-out"
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                  r={radius}
                  cx="40"
                  cy="40"
                />
              </svg>
            </div>
            <div>
              <div className="font-display text-[31px] font-bold tracking-tight text-[#071129]">
                {Math.round(data.progressRate)}<span className="text-[18px] ml-1">%</span>
              </div>
              <div className="mt-1 text-[13px] text-[#45515e]">
                <span className="font-bold text-[#10b981]">{data.progressDiff > 0 ? '+' : ''}{data.progressDiff}%</span>（前週比）
              </div>
            </div>
          </div>
        </div>

        {/* Milestone Achievement */}
        <div className="kpi-item min-h-[160px] p-7 border-r border-[#f2f3f5]">
          <div className="mb-5 text-[13px] font-bold text-[#18181b]">マイルストーン達成</div>
          <div className="font-display text-[31px] font-bold tracking-tight text-[#071129]">
            {data.milestoneCompleted} <span className="text-[18px] text-[#45515e]">/ {data.milestoneTotal}</span>
          </div>
          <div className="mt-2 text-[13px]">
            <span className="font-extrabold text-[#1456f0]">{Math.round((data.milestoneCompleted / Math.max(data.milestoneTotal, 1)) * 100)}%</span> 達成
          </div>
          <div className="mt-2.5 h-1.5 w-[130px] overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-[#1456f0] transition-all duration-500"
              style={{ width: `${(data.milestoneCompleted / Math.max(data.milestoneTotal, 1)) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Delayed Items */}
        <div className="kpi-item min-h-[160px] p-7 border-r border-[#f2f3f5]">
          <div className="mb-5 text-[13px] font-bold text-[#18181b]">遅延中の項目</div>
          <div className="font-display text-[31px] font-bold tracking-tight text-[#071129]">
            {data.delayedItems}<span className="text-[18px] ml-1">件</span>
          </div>
          <div className="mt-2 text-[13px] text-[#45515e]">
            うち重要 <span className="font-bold text-[#ef4444]">{data.importantDelayedItems}件</span>
          </div>
        </div>

        {/* High Risk Items */}
        <div className="kpi-item min-h-[160px] p-7 border-r border-[#f2f3f5]">
          <div className="mb-5 text-[13px] font-bold text-[#18181b]">高リスク件数</div>
          <div className="font-display text-[31px] font-bold tracking-tight text-[#071129]">
            {data.highRiskCount}<span className="text-[18px] ml-1">件</span>
          </div>
          <span className="mt-3 inline-flex items-center rounded-full bg-[#fff1f2] px-2 py-1 text-[12px] font-bold text-[#ef4444]">
            影響大
          </span>
        </div>

        {/* Critical Path Delay */}
        <div className="kpi-item min-h-[160px] p-7">
          <div className="mb-5 text-[13px] font-bold text-[#18181b]">クリティカル経路遅延</div>
          <div className="font-display text-[31px] font-bold tracking-tight text-[#ef4444]">
            {data.criticalPathDelayDays > 0 ? '+' : ''}{data.criticalPathDelayDays}<span className="text-[18px] ml-1">日</span>
          </div>
          <div className="mt-2 text-[13px] font-bold text-[#45515e]">リリース影響あり</div>
        </div>
      </div>
    </section>
  );
}
