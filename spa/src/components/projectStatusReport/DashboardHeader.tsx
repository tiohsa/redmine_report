import { Icon } from '../ui/Icon';
import { cn } from '../ui/cn';

interface DashboardHeaderProps {
  projectName: string;
  period: string;
  versionName: string;
  targetArea: string;
  lastUpdated: string;
  onRefresh?: () => void;
  onShare?: () => void;
}

export function DashboardHeader({
  projectName,
  period,
  versionName,
  targetArea,
  lastUpdated,
  onRefresh,
  onShare,
}: DashboardHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-6 px-8 py-7 mb-2">
      <div className="flex items-center gap-3 min-w-[260px]">
        <h1 className="m-0 font-display text-[31px] font-semibold leading-[1.1] tracking-[-0.03em] text-[#18181b]">
          {projectName} 進捗サマリー
        </h1>
        <button className="grid h-7 w-7 place-items-center rounded-full border border-[#e5e7eb] bg-white text-[#64748b] hover:bg-gray-50 transition-colors">
          ☆
        </button>
      </div>

      <div className="flex items-center justify-end flex-wrap gap-2.5">
        <div className="flex min-h-[44px] items-center gap-2 rounded-full border border-[#f2f3f5] bg-white/80 px-4 text-[13px] font-semibold text-[#18181b] shadow-subtle">
          <span className="grid place-items-center">▣</span>
          <span className="font-medium text-[#45515e]">対象期間</span>
          {period}
          <span className="text-[10px] text-gray-400">▾</span>
        </div>

        <div className="flex min-h-[44px] items-center gap-2 rounded-full border border-[#f2f3f5] bg-white/80 px-4 text-[13px] font-semibold text-[#18181b] shadow-subtle">
          <span className="grid place-items-center">↕</span>
          <span className="font-medium text-[#45515e]">バージョン</span>
          {versionName}
          <span className="text-[10px] text-gray-400">▾</span>
        </div>

        <div className="flex min-h-[44px] items-center gap-2 rounded-full border border-[#f2f3f5] bg-white/80 px-4 text-[13px] font-semibold text-[#18181b] shadow-subtle">
          <span className="grid place-items-center">⌘</span>
          <span className="font-medium text-[#45515e]">対象領域</span>
          {targetArea}
          <span className="text-[10px] text-gray-400">▾</span>
        </div>

        <div className="flex flex-col items-end px-3 text-[11px] leading-[1.2] text-[#8e8e93]">
          <span>最終更新</span>
          <strong className="font-semibold text-[#45515e]">{lastUpdated}</strong>
        </div>

        <button
          onClick={onShare}
          className="min-h-[44px] rounded-lg border border-[rgba(20,86,240,0.28)] bg-white px-5 text-[14px] font-bold text-[#1456f0] shadow-subtle hover:bg-blue-50 transition-all"
        >
          レポート共有
        </button>
      </div>
    </header>
  );
}
