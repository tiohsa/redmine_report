import { Icon } from '../ui/Icon';
import { cn } from '../ui/cn';

export interface RiskItem {
  id: string;
  name: string;
  target: string;
  impact: '高' | '中' | '低';
  status: '対応中' | '未着手' | '監視中';
}

interface RiskPanelProps {
  items: RiskItem[];
  onViewAll?: () => void;
}

export function RiskPanel({ items, onViewAll }: RiskPanelProps) {
  const impactConfig = {
    '高': { badge: 'badge late', label: '高', symbol: '▲', symbolColor: 'text-[#ef4444]' },
    '中': { badge: 'badge warn', label: '中', symbol: '▲', symbolColor: 'text-[#f59e0b]' },
    '低': { badge: 'badge low', label: '低', symbol: 'ⓘ', symbolColor: 'text-[#1456f0]' },
  };

  const statusConfig = {
    '対応中': { badge: 'badge warn', label: '対応中' },
    '未着手': { badge: 'badge warn', label: '未着手' },
    '監視中': { badge: 'badge watch', label: '監視中' },
  };

  return (
    <section className="panel table-panel flex flex-col rounded-xl border border-[#f2f3f5] bg-white p-6 shadow-subtle pb-4">
      <div className="panel-header mb-4 flex items-center justify-between gap-4 p-0">
        <h2 className="panel-title font-poppins text-[18px] font-semibold text-[#18181b]">
          課題・リスク <span className="ml-1 text-[13px] font-normal text-[#45515e]">（影響度 高い順）</span>
        </h2>
        <button className="text-[12px] font-bold text-[#1456f0] hover:underline" onClick={onViewAll}>
          すべて見る
        </button>
      </div>

      <table className="data-table w-full border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <th className="border-b border-[#f2f3f5] py-3 px-2 text-left text-[11px] font-bold text-[#45515e]">リスク/課題</th>
            <th className="border-b border-[#f2f3f5] py-3 px-2 text-left text-[11px] font-bold text-[#45515e]">影響対象</th>
            <th className="border-b border-[#f2f3f5] py-3 px-2 text-left text-[11px] font-bold text-[#45515e]">影響度</th>
            <th className="border-b border-[#f2f3f5] py-3 px-2 text-left text-[11px] font-bold text-[#45515e]">対応状況</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const ic = impactConfig[item.impact];
            const sc = statusConfig[item.status];
            return (
              <tr key={item.id} className="transition-colors hover:bg-gray-50/50">
                <td className="border-b border-[rgba(242,243,245,0.86)] py-3 px-2 text-[#18181b]">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("text-[12px] font-bold", ic.symbolColor)}>{ic.symbol}</span>
                    <span className="font-medium truncate max-w-[150px]" title={item.name}>{item.name}</span>
                  </div>
                </td>
                <td className="border-b border-[rgba(242,243,245,0.86)] py-3 px-2 text-[#45515e]">{item.target}</td>
                <td className="border-b border-[rgba(242,243,245,0.86)] py-3 px-2">
                  <span className={cn(ic.badge, "inline-flex items-center justify-center min-w-[48px] rounded-full px-2.5 py-1 text-[11px] font-extrabold")}>
                    {ic.label}
                  </span>
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
        .badge.late { color: #ef4444; background: #fee2e2; }
        .badge.warn { color: #f97316; background: #ffedd5; }
        .badge.low { color: #2563eb; background: #dbeafe; }
        .badge.watch { color: #64748b; background: #f1f5f9; }
      `}</style>
    </section>
  );
}
