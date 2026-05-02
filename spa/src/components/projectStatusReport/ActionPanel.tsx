import { Icon, type IconName } from '../ui/Icon';
import { cn } from '../ui/cn';

interface ActionCategory {
  id: string;
  title: string;
  icon: IconName;
  iconBg: string;
  iconColor: string;
  items: string[];
}

interface ActionPanelProps {
  categories?: ActionCategory[];
  aiResponse?: {
    highlights_this_week?: string | null;
    next_week_actions?: string | null;
    risks_decisions?: string | null;
  } | null;
  loading?: boolean;
}

export function ActionPanel({ categories, aiResponse, loading }: ActionPanelProps) {
  const parseItems = (text?: string | null): string[] => {
    if (!text) return [];
    return text.split('\n')
      .map(line => line.replace(/^[*-]\s*/, '').trim())
      .filter(line => line.length > 0)
      .slice(0, 3);
  };

  const defaultCategories = [
    {
      id: 'focus',
      title: '今週の重点対応',
      symbol: '✓',
      color: '#1456f0',
      bgColor: 'var(--color-brand-6)',
      items: aiResponse?.next_week_actions ? parseItems(aiResponse.next_week_actions) : [
        '設計レビュー指摘事項の対応完了 (5/10目標)',
        '外部APIベンダーとの仕様合意 (5/8 MTG)',
        'フロントエンド要員の確保'
      ]
    },
    {
      id: 'decision',
      title: '上位判断が必要な事項',
      symbol: '⚑',
      color: '#8b5cf6',
      bgColor: '#8b5cf6',
      items: aiResponse?.risks_decisions ? parseItems(aiResponse.risks_decisions) : [
        'API仕様確定のためのベンダー優先順位付け',
        'フロントエンド追加要員の承認 (2名)',
        'テスト環境の早期構築リソース調整'
      ]
    },
    {
      id: 'recovery',
      title: 'スケジュール回復策',
      symbol: '↗',
      color: '#10b981',
      bgColor: '#10b981',
      items: [
        '一部機能のリリース後ろ遅延を検討',
        '並列開発の強化 (バックエンド先行)',
        'テスト自動化の早期導入'
      ]
    },
    {
      id: 'support',
      title: '上位支援・依頼事項',
      symbol: '⛭',
      color: '#1456f0',
      bgColor: 'var(--color-brand-6)',
      isHighlight: true,
      items: aiResponse?.highlights_this_week ? parseItems(aiResponse.highlights_this_week) : [
        '外部APIベンダーとの調整支援',
        '追加要員確保のご支援',
        '他部門システムとの調整加速'
      ]
    }
  ];

  const displayCategories = categories || defaultCategories;

  return (
    <section className="panel actions relative mt-[18px] grid-cols-1 rounded-xl border border-[#f2f3f5] bg-white p-6 shadow-subtle">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/50 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 text-sm font-bold text-[#1456f0]">
            <span className="animate-spin text-xl">↻</span>
            AI分析中...
          </div>
        </div>
      )}
      <h2 className="panel-title mb-6 flex items-center gap-2 font-poppins text-lg font-semibold text-[#18181b]">
        次アクション / 判断事項
        {aiResponse && <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-normal text-blue-600">AI分析結果反映中</span>}
      </h2>
      
      <div className="action-grid grid grid-cols-4 gap-[18px]">
        {displayCategories.map((category) => (
          <article 
            key={category.id} 
            className={cn(
              "action-card flex min-h-[138px] flex-col rounded-md border border-[#f2f3f5] bg-white p-[18px] shadow-[0_6px_18px_rgba(0,0,0,0.04)]",
              category.isHighlight && "bg-gradient-to-br from-[rgba(20,86,240,0.06)] to-white shadow-brand"
            )}
          >
            <div className="action-head mb-4 flex items-center gap-[10px] text-[16px] font-extrabold" style={{ color: category.color }}>
              <span 
                className="action-dot grid h-7 w-7 place-items-center rounded-full text-[14px] font-extrabold text-white" 
                style={{ backgroundColor: category.bgColor }}
              >
                {category.symbol}
              </span>
              {category.title}
            </div>
            <ul className="m-0 list-disc pl-[18px] text-[13px] leading-[1.85] text-[#18181b]">
              {category.items.map((item, idx) => (
                <li key={idx} className="line-clamp-2" title={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

