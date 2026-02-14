import React, { useMemo, useState } from 'react';
import { CategoryBar, generateScheduleReport, ReportContent, ReportItem, ProjectInfo } from '../services/scheduleReportApi';
import { format, parseISO, differenceInDays, eachMonthOfInterval, startOfMonth, endOfMonth, isSameDay, addDays, addMonths } from 'date-fns';

// --- データ定義: プロジェクト進捗報告書 ---

// 現在のステータス定義
const STATUS = {
    COMPLETED: { color: "#1e3a8a", label: "完了" }, // 濃い紺
    IN_PROGRESS: { color: "#3b82f6", label: "進行中" }, // 明るい青
    PENDING: { color: "#9ca3af", label: "未着手" } // グレー
};

// 下段: 報告セクションデータ (初期表示用ダミー)
const initialReportSections: {
    id: keyof ReportContent;
    title: string;
    headerColor: string;
    items: ReportItem[];
}[] = [
        {
            id: "progress",
            title: "今週の主要実績",
            headerColor: "bg-[#1e5fa0]", // 標準の青
            items: [
                { text: "要件定義書および基本設計書のクライアント承認完了", type: "normal" },
                { text: "開発環境（AWS）の構築完了", type: "normal" },
                { text: "認証機能（Auth0）の実装先行着手", type: "highlight" }, // 強調
                { text: "週次定例会でのUIモックアップ合意", type: "normal" }
            ]
        },
        {
            id: "next_steps",
            title: "来週の予定・アクション",
            headerColor: "bg-[#5b9bd5]", // 明るめの青
            items: [
                { text: "主要機能（検索・一覧）のバックエンド実装開始", type: "normal" },
                { text: "フロントエンドコンポーネントの実装開始", type: "normal" },
                { text: "外部API連携（決済システム）の仕様確認MTG", type: "normal" },
                { text: "詳細設計書の残課題（例外処理フロー）のFix", type: "normal" }
            ]
        },
        {
            id: "risks",
            title: "課題・リスク・決定事項",
            headerColor: "bg-[#ef4444]", // 赤（注意喚起）
            items: [
                {
                    text: "【リスク】外部決済APIの仕様変更の可能性あり", subText: "→ 影響範囲調査中。来週中に方針決定必要。", badge: "高", badgeColor: "bg-red-100 text-red-800"
                },
                {
                    text: "【課題】テストデータ作成の遅れ", subText: "→ 担当者リソース不足。追加メンバーのアサインを検討中。", badge: "中", badgeColor: "bg-yellow-100 text-yellow-800"
                },
                {
                    text: "【決定】初回リリース範囲から「帳票出力」を除外", subText: "→ Phase2での対応とする合意済み。", badge: "済", badgeColor: "bg-green-100 text-green-800"
                }
            ]
        }
    ];

// --- SVG コンポーネント ---

interface ChevronPathProps {
    x: number;
    y: number;
    width: number;
    height: number;
    pointDepth: number;
    isFirst: boolean;
    color: string;
}

const ChevronPath = ({ x, y, width, height, pointDepth, isFirst, color }: ChevronPathProps) => {
    const p = pointDepth;
    const w = width;
    const h = height;

    const leftShape = isFirst
        ? `M ${x} ${y} L ${x} ${y + h}`
        : `M ${x} ${y} L ${x + p} ${y + h / 2} L ${x} ${y + h}`;

    const rightShape = `L ${x + w} ${y + h} L ${x + w + p} ${y + h / 2} L ${x + w} ${y}`;

    return (
        <path d={`${leftShape} ${rightShape} Z`} fill={color} stroke="white" strokeWidth="1" />
    );
};

// --- メインコンポーネント ---

interface ProjectStatusReportProps {
    bars?: CategoryBar[];
    projectIdentifier: string;
    availableProjects?: ProjectInfo[];
    fetchError?: string | null;
}

export const ProjectStatusReport = ({ bars = [], projectIdentifier, availableProjects = [], fetchError = null }: ProjectStatusReportProps) => {

    const [generatedContent, setGeneratedContent] = useState<ReportContent | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset generated content when project changes
    React.useEffect(() => {
        setGeneratedContent(null);
        setError(null);
    }, [projectIdentifier]);

    // プロジェクト情報のマップ
    const projectMap = useMemo(() => {
        const map = new Map<number, ProjectInfo>();
        availableProjects.forEach(p => map.set(p.project_id, p));
        return map;
    }, [availableProjects]);

    // 全体の期間とタイムラインデータの構築
    const { timelineData, totalDurationText, monthSegments, timelineScale } = useMemo(() => {
        if (bars.length === 0) {
            return { timelineData: [], totalDurationText: "データなし", monthSegments: [], timelineScale: null };
        }

        // 1. 全体の期間を決定 (全プロジェクトの最小・最大)
        const allStartDates = bars.map(b => b.start_date).filter(Boolean);
        const allEndDates = bars.map(b => b.end_date).filter(Boolean);
        if (allStartDates.length === 0 || allEndDates.length === 0) {
            return { timelineData: [], totalDurationText: "期間データなし", monthSegments: [], timelineScale: null };
        }

        // ソートして最小・最大を取得
        allStartDates.sort();
        allEndDates.sort();
        const minDateStr = allStartDates[0];
        const maxDateStr = allEndDates[allEndDates.length - 1];

        const minDate = parseISO(minDateStr);
        const maxDate = parseISO(maxDateStr);

        // 軸の終了日（期間は閉区間なので、表示上の軸は+1日して「翌日の0:00」までとする）
        const axisMaxDate = addDays(maxDate, 1);

        const totalDurationText = `期間: ${minDateStr} - ${maxDateStr}`;
        const totalDays = Math.max(1, differenceInDays(axisMaxDate, minDate));
        const svgWidth = 980;

        // 線形スケール変換関数
        const getDateX = (date: Date): number => {
            const days = differenceInDays(date, minDate);
            // 範囲外でも計算して返す（クリッピングはSVG側で）
            return (days / totalDays) * svgWidth;
        };

        // 2. プロジェクトごとにグルーピング
        const groupedBars = new Map<number, CategoryBar[]>();
        bars.forEach(bar => {
            const pid = bar.project_id;
            if (!groupedBars.has(pid)) groupedBars.set(pid, []);
            groupedBars.get(pid)?.push(bar);
        });

        // 3. 各プロジェクトのフェーズデータ構築
        const timelineData = Array.from(groupedBars.entries()).map(([projectId, projectBars]) => {
            const projectInfo = projectMap.get(projectId);
            const projectName = projectInfo ? projectInfo.name : `Project ${projectId}`;

            // 開始日でソート
            const sortedBars = [...projectBars].sort((a, b) => a.start_date.localeCompare(b.start_date));

            // ステップ変換
            const steps = sortedBars.map(bar => {
                let status = STATUS.PENDING;
                if (bar.progress_rate === 100) status = STATUS.COMPLETED;
                else if (bar.progress_rate > 0) status = STATUS.IN_PROGRESS;

                const sDate = parseISO(bar.start_date);
                const eDate = parseISO(bar.end_date);

                const x1 = getDateX(sDate);
                // 終了日はinclusiveなので、バーの右端は「終了日の翌日0:00」とする
                const x2 = getDateX(addDays(eDate, 1));
                const width = Math.max(10, x2 - x1); // 最低幅

                return {
                    name: bar.category_name,
                    x: x1,
                    width: width, // 実際の描画幅（絶対座標ベース）
                    status: status,
                    startDate: bar.start_date,
                    endDate: bar.end_date
                };
            });

            // フェーズ分け（重なりや長さを考慮して分割表示等は今回はせず、1行で表示するが、
            // 今までのロジック（4つずつ分割）を踏襲するか？
            // 縦に並べるなら、プロジェクトごとに1行（または複数行）の矢羽根フローにするのが自然。
            // ここではシンプルにするため、プロジェクト内のカテゴリは「連続したフロー」として1行に並べることを試みる。
            // ただし日付ベースの配置なので、重なると潰れる。
            // 元のロジックは「Chevronフロー」として隙間なく並べていたが、今回は「ガントチャート的」な絶対日付配置にするため、
            // Chevron形状を維持しつつ日付位置に置くのは難しい（Chevronは連続していることが前提のデザイン）。

            // 方針変更: 
            // ユーザー要望「矢羽根を縦に並べる」 -> プロジェクトAの矢羽根列、プロジェクトBの矢羽根列...
            // 矢羽根のデザインを維持するには、やはり「順序」が重要であり、絶対日付配置よりも「シーケンス」としての表現が適しているかも？
            // しかし、プロジェクト間の期間比較をしたいなら絶対日付配置（ガント）が良い。
            // 元のコードは `getDateX_v2` で無理やり補間して矢羽根上の位置を決めていた。
            // ここでは「絶対日付配置のChevron」を採用する。
            // 各ステップは x, width を持ち、隣接していなくても描画される。
            // 隙間がある場合は線でつなぐ等の処理が必要だが、まずは配置のみ。

            return {
                projectId,
                projectName,
                steps
            };
        });

        // 4. 月セグメント (連続した帯にするために、終了を次の月の開始とする)
        const months = eachMonthOfInterval({ start: minDate, end: maxDate });
        const monthSegments = months.map(m => {
            const mStart = startOfMonth(m) < minDate ? minDate : startOfMonth(m);
            // その月の終わり＝「次の月の始まり」または「全体の終了」
            const nextMonthStart = startOfMonth(addMonths(m, 1));
            const mEnd = nextMonthStart > axisMaxDate ? axisMaxDate : nextMonthStart;

            const x1 = getDateX(mStart);
            const x2 = getDateX(mEnd);
            return {
                label: format(m, 'M月'),
                endLabel: format(addDays(mEnd, -1), 'M/d'), // 表示用ラベルは-1日（月内）にする
                x: x1,
                width: Math.max(0, x2 - x1)
            };
        });

        // Today位置
        const todayX = getDateX(new Date());

        return { timelineData, totalDurationText, monthSegments, timelineScale: { getDateX, todayX } };
    }, [bars, projectMap]);

    const handleGenerate = async () => {
        setIsGenerating(true);
        setError(null);
        try {
            const content = await generateScheduleReport(projectIdentifier);
            setGeneratedContent(content);
        } catch (e: any) {
            setError(e.message || "Failed to generate report");
        } finally {
            setIsGenerating(false);
        }
    };

    const displaySections = useMemo(() => {
        if (generatedContent) {
            return initialReportSections.map(section => ({
                ...section,
                items: generatedContent[section.id] || []
            }));
        }
        return initialReportSections;
    }, [generatedContent]);

    return (
        <div className="bg-gray-50 flex-1 overflow-auto p-4 md:p-8 font-sans text-gray-800">
            <div className="max-w-7xl mx-auto bg-white p-6 shadow-md rounded-lg">

                {/* ヘッダー: プロジェクト基本情報 */}
                <div className="flex justify-between items-end mb-6 border-b border-gray-200 pb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">プロジェクト進捗比較</h1>
                        <p className="text-sm text-gray-500 mt-1">報告日: {format(new Date(), 'yyyy年M月d日')} | 複数プロジェクト表示中</p>
                    </div>
                    <div className="text-right flex items-center gap-4">
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className={`px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
                            title="メインターゲットプロジェクトのレポートを生成します"
                        >
                            {isGenerating ? (
                                <>
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    AIレポート生成
                                </>
                            ) : (
                                "AIレポート生成"
                            )}
                        </button>
                    </div>
                </div>

                {(error || fetchError) && (
                    <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                        <span className="block sm:inline">{error || fetchError}</span>
                    </div>
                )}

                {/* PC/タブレット用レイアウト */}
                <div className="flex flex-col gap-8">

                    {/* 上段: プロセスフローと期間線 */}
                    <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                        {/* 左側: プロジェクト名カラム */}
                        {(() => {
                            const laneHeight = 80;
                            const headerHeight = 30;

                            return (
                                <div className="flex-none w-48 bg-white border-r border-gray-200 flex flex-col">
                                    {/* ヘッダー高さ合わせ */}
                                    <div className="bg-gray-50 border-b border-gray-200 flex items-center justify-center font-bold text-gray-600 text-xs" style={{ height: headerHeight }}>
                                        プロジェクト名
                                    </div>
                                    {/* プロジェクト名リスト */}
                                    {timelineData.map((project) => (
                                        <div
                                            key={project.projectId}
                                            className="flex items-center px-4 border-b border-gray-100 box-border"
                                            style={{ height: laneHeight }}
                                        >
                                            <span className="text-sm font-bold text-gray-800 line-clamp-2" title={project.projectName}>
                                                {project.projectName}
                                            </span>
                                        </div>
                                    ))}
                                    {/* データがない場合のプレースホルダー */}
                                    {timelineData.length === 0 && (
                                        <div className="h-32"></div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* 右側: SVGタイムライン */}
                        <div className="flex-1 overflow-x-auto bg-white relative">
                            {(() => {
                                const laneHeight = 80;
                                const headerHeight = 30;
                                const svgHeight = headerHeight + (timelineData.length * laneHeight) + 30;

                                return timelineData.length > 0 ? (
                                    <svg viewBox={`0 0 1000 ${svgHeight}`} className="w-full" style={{ minHeight: svgHeight, minWidth: '800px' }}>
                                        {/* 月ヘッダー (最上部) */}
                                        <g transform="translate(0, 0)">
                                            {monthSegments.map((seg, i) => (
                                                <g key={i}>
                                                    <rect x={seg.x} y={0} width={seg.width} height={headerHeight} fill="#f9fafb" stroke="#e5e7eb" strokeWidth="1" />
                                                    <text x={seg.x + seg.width / 2} y={20} textAnchor="middle" fontSize="12" fontWeight="bold" fill="#374151">
                                                        {seg.label}
                                                    </text>
                                                </g>
                                            ))}
                                        </g>

                                        {/* プロジェクトごとのレーン */}
                                        {timelineData.map((project, pIdx) => {
                                            const yOffset = headerHeight + (pIdx * laneHeight); // 基準位置
                                            const pointDepth = 15;
                                            const barHeight = 40;
                                            const barY = 20; // レーン内のバーのY位置 (中央配置: (80-40)/2 = 20)

                                            return (
                                                <g key={project.projectId} transform={`translate(0, ${yOffset})`}>
                                                    {/* 区切り線 (下部) */}
                                                    <line x1={0} y1={laneHeight} x2={1000} y2={laneHeight} stroke="#f3f4f6" strokeWidth="1" />

                                                    {/* 矢羽根列 */}
                                                    <g transform={`translate(0, ${barY})`}>
                                                        {project.steps.map((step, sIdx) => {
                                                            const isFirst = sIdx === 0;
                                                            return (
                                                                <g key={sIdx}>
                                                                    <ChevronPath
                                                                        x={step.x}
                                                                        y={0}
                                                                        width={step.width}
                                                                        height={barHeight}
                                                                        pointDepth={pointDepth}
                                                                        isFirst={isFirst} // 形状的にはFirstだが、日付配置なので左端が垂直になるだけ
                                                                        color={step.status.color}
                                                                    />
                                                                    {step.width > 30 && (
                                                                        <text
                                                                            x={step.x + step.width / 2}
                                                                            y={barHeight / 2}
                                                                            fill="white"
                                                                            fontSize="12"
                                                                            fontWeight="bold"
                                                                            textAnchor="middle"
                                                                            dominantBaseline="middle"
                                                                            style={{ pointerEvents: 'none' }}
                                                                        >
                                                                            {step.name}
                                                                        </text>
                                                                    )}
                                                                </g>
                                                            );
                                                        })}
                                                    </g>
                                                </g>
                                            );
                                        })}

                                        {/* Today マーカー */}
                                        {timelineScale && (
                                            <g>
                                                <line
                                                    x1={timelineScale.todayX}
                                                    y1={headerHeight}
                                                    x2={timelineScale.todayX}
                                                    y2={svgHeight}
                                                    stroke="#ef4444"
                                                    strokeWidth="2"
                                                    strokeDasharray="4 3"
                                                />
                                                <text x={timelineScale.todayX} y={12} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#ef4444">
                                                    Today
                                                </text>
                                            </g>
                                        )}
                                    </svg>
                                ) : (
                                    <div className="flex items-center justify-center h-32 text-gray-400">
                                        データがありません
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    {/* 凡例 */}
                    <div className="flex justify-center gap-6 mt-2 text-sm">
                        {Object.values(STATUS).map((status) => (
                            <div key={status.label} className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded" style={{ backgroundColor: status.color }}></div>
                                <span>{status.label}</span>
                            </div>
                        ))}
                    </div>

                    {/* 下段: 詳細報告ボックス (Grid Layout) - メインプロジェクトのみ */}
                    <div className="mt-8 border-t pt-8">
                        <h2 className="text-xl font-bold mb-4">詳細レポート ({projectMap.get(Number(projectIdentifier) || 0)?.name || projectIdentifier})</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                            {displaySections.map((section) => (
                                <div key={section.id} className="border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col h-full">
                                    <div className={`${section.headerColor} p-3 text-white text-md font-bold text-center flex items-center justify-center min-h-[50px]`}>
                                        {section.title}
                                    </div>
                                    <div className="p-5 bg-white flex-1">
                                        <ul className="space-y-4">
                                            {section.items.map((item, i) => (
                                                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                                    <span className="mt-1.5 w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0"></span>
                                                    <div className="flex-1">
                                                        <div className={item.type === 'highlight' ? "font-bold text-blue-800" : ""}>{item.text}</div>
                                                        {item.subText && <div className="text-xs text-gray-500 mt-1 ml-1">{item.subText}</div>}
                                                    </div>
                                                    {item.badge && (
                                                        <span className={`text-xs px-2 py-0.5 rounded border ${item.badgeColor} flex-shrink-0`}>
                                                            {item.badge}
                                                        </span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};
