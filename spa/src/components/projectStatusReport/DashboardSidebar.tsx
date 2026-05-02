import { Icon, type IconName } from '../ui/Icon';
import { cn } from '../ui/cn';

interface SidebarItem {
  id: string;
  label: string;
  icon: IconName;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'summary', label: 'サマリー', icon: 'folder' },
  { id: 'schedule', label: '全体スケジュール', icon: 'calendar' },
  { id: 'milestone', label: 'マイルストーン', icon: 'tag' },
  { id: 'risk', label: '課題・リスク', icon: 'warning' },
  { id: 'ticket', label: '詳細チケット', icon: 'open-in-new' },
  { id: 'report', label: 'レポート出力', icon: 'download' },
  { id: 'settings', label: '設定', icon: 'sliders' },
];

interface DashboardSidebarProps {
  activeViewId: string;
  onViewChange: (id: string) => void;
}

export function DashboardSidebar({ activeViewId, onViewChange }: DashboardSidebarProps) {
  return (
    <aside className="sticky top-0 flex h-screen w-[228px] flex-col border-r border-[#f2f3f5] bg-white/80 px-5 py-7 backdrop-blur-[18px]">
      <div className="mb-9 flex items-center gap-3">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#1456f0] to-[#3daeff] font-extrabold text-white shadow-brand">
          <span className="text-[15px]">R</span>
        </div>
        <span className="font-bold text-[#18181b]">Redmine Report</span>
      </div>

      <nav className="grid gap-2">
        {[
          { id: 'summary', label: 'サマリー', symbol: '▣' },
          { id: 'timeline', label: '全体スケジュール', symbol: '▤' },
          { id: 'milestones', label: 'マイルストーン', symbol: '◇' },
          { id: 'risks', label: '課題・リスク', symbol: '⚠' },
          { id: 'tickets', label: '詳細チケット', symbol: '☷' },
          { id: 'report', label: 'レポート出力', symbol: '↗' },
          { id: 'settings', label: '設定', symbol: '⚙' },
        ].map((item) => {
          const isActive = activeViewId === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                'flex min-h-[44px] items-center gap-3 rounded-[13px] px-3.5 text-sm font-semibold transition-all',
                isActive
                  ? 'bg-[rgba(20,86,240,0.07)] text-[#1456f0] shadow-[inset_0_0_0_1px_rgba(20,86,240,0.08)]'
                  : 'text-[#45515e] hover:bg-gray-50 hover:text-[#18181b]'
              )}
            >
              <span className="grid w-[22px] place-items-center text-base">{item.symbol}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto grid gap-3">
        <div className="rounded-[13px] border border-[#f2f3f5] bg-white p-3.5 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between gap-2 text-[12px] text-[#45515e]">
            <span>データ更新日時</span>
            <strong className="text-[16px] text-[#1456f0]">↻</strong>
          </div>
          <div className="mt-2 text-[12px] font-medium text-[#45515e]">2024/05/01 09:30</div>
        </div>
        <div className="rounded-[13px] border border-[#f2f3f5] bg-white p-3.5 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between gap-2 text-[12px] text-[#45515e]">
            <span>Redmine接続</span>
            <strong className="text-[#10b981]">● 正常</strong>
          </div>
        </div>
      </div>
    </aside>
  );
}
