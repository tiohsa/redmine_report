import { Icon } from '../ui/Icon';
import { cn } from '../ui/cn';

export interface MilestoneItem {
  id: string;
  name: string;
  plannedDate: string;
  actualDate: string;
  status: '完了' | '予定' | '遅延' | '見込み遅延';
}

interface MilestonePanelProps {
  items: MilestoneItem[];
  onViewAll?: () => void;
}

export function MilestonePanel({ items, onViewAll }: MilestonePanelProps) {
  const statusConfig = {
    '完了': { badge: 'badge done', label: '完了' },
    '予定': { badge: 'badge plan', label: '予定' },
    '遅延': { badge: 'badge late', label: '遅延' },
    '見込み遅延': { badge: 'badge warn', label: '見込み遅延' },
  };

  return (
    <section className="panel table-panel flex flex-col rounded-xl border border-[#f2f3f5] bg-white p-6 shadow-subtle pb-4">
      <div className="panel-header mb-4 flex items-center justify-between gap-4 p-0">
        <h2 className="panel-title font-poppins text-[18px] font-semibold text-[#18181b]">重要マイルストーン</h2>
        <button className="text-[12px] font-bold text-[#1456f0] hover:underline" onClick={onViewAll}>
          すべて見る
        </button>
      </div>

      <table className="data-table w-full border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <th className="border-b border-[#f2f3f5] py-3 px-2 text-left text-[11px] font-bold text-[#45515e]">マイルストーン</th>
            <th className="border-b border-[#f2f3f5] py-3 px-2 text-left text-[11px] font-bold text-[#45515e]">予定日</th>
            <th className="border-b border-[#f2f3f5] py-3 px-2 text-left text-[11px] font-bold text-[#45515e]">見込み/実績</th>
            <th className="border-b border-[#f2f3f5] py-3 px-2 text-left text-[11px] font-bold text-[#45515e]">ステータス</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const sc = statusConfig[item.status];
            const isCritical = item.name.includes('開発完了') || item.name.includes('本番リリース');
            return (
              <tr key={item.id} className="transition-colors hover:bg-gray-50/50">
                <td className="border-b border-[rgba(242,243,245,0.86)] py-3 px-2 text-[#18181b]">
                  <div className="flex items-center">
                    <span className={cn(
                      "diamond-small mr-2 inline-block h-2.5 w-2.5 flex-shrink-0 rotate-45 transition-colors",
                      isCritical ? "bg-[#8b5cf6]" : "bg-[#10b981]"
                    )} />
                    <span className="font-medium truncate max-w-[150px]" title={item.name}>{item.name}</span>
                  </div>
                </td>
                <td className="border-b border-[rgba(242,243,245,0.86)] py-3 px-2 text-[#45515e]">{item.plannedDate || '-'}</td>
                <td className={cn(
                  "border-b border-[rgba(242,243,245,0.86)] py-3 px-2 font-extrabold",
                  item.status === '完了' ? 'text-[#10b981]' : (item.status === '遅延' || item.status === '見込み遅延' ? 'text-[#ef4444]' : 'text-[#45515e]')
                )}>
                  {item.actualDate || '-'}
                </td>
                <td className="border-b border-[rgba(242,243,245,0.86)] py-3 px-2">
                  <span className={cn(sc.badge, "inline-flex items-center justify-center min-w-[48px] rounded-full px-2.5 py-1 text-[11px] font-extrabold")}>
                    {sc.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      
      <style>{`
        .badge.done { color: #059669; background: #d1fae5; }
        .badge.late { color: #ef4444; background: #fee2e2; }
        .badge.warn { color: #f97316; background: #ffedd5; }
        .badge.plan { color: #64748b; background: #f1f5f9; }
      `}</style>
    </section>
  );
}
