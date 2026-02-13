import React, { useMemo } from 'react';
import { CategoryBar } from '../services/scheduleReportApi';
import { format, parseISO, differenceInDays } from 'date-fns';

// --- データ定義: プロジェクト進捗報告書 ---

// 現在のステータス定義
const STATUS = {
    COMPLETED: { color: "#1e3a8a", label: "完了" }, // 濃い紺
    IN_PROGRESS: { color: "#3b82f6", label: "進行中" }, // 明るい青
    PENDING: { color: "#9ca3af", label: "未着手" } // グレー
};

// 共通アイテム型定義
type ReportItem = {
    text: string;
    type?: "normal" | "highlight";
    subText?: string;
    badge?: string;
    badgeColor?: string;
};

// 下段: 報告セクションデータ
const reportSections: {
    id: string;
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
}

export const ProjectStatusReport = ({ bars = [] }: ProjectStatusReportProps) => {

    // カテゴリデータをタイムライン用に変換
    const { timelinePhases, totalDurationText } = useMemo(() => {
        if (bars.length === 0) {
            return { timelinePhases: [], totalDurationText: "データなし" };
        }

        // 開始日でソート
        const sortedBars = [...bars].sort((a, b) => a.start_date.localeCompare(b.start_date));

        // 全体の期間
        const minDate = sortedBars[0].start_date;
        const maxDate = sortedBars.reduce((max, b) => b.end_date > max ? b.end_date : max, sortedBars[0].end_date);
        const totalDurationText = `プロジェクト期間: ${minDate} - ${maxDate}`;

        // フェーズ構築 (ここでは全カテゴリを1つのフェーズとしてフラットに並べるが、将来的にグルーピングも可能)
        // 期間から幅の比率を計算 (最低幅を設ける)
        const totalDays = differenceInDays(parseISO(maxDate), parseISO(minDate)) || 1;

        const steps = sortedBars.map(bar => {
            let status = STATUS.PENDING;
            if (bar.progress_rate === 100) status = STATUS.COMPLETED;
            else if (bar.progress_rate > 0) status = STATUS.IN_PROGRESS;

            const duration = differenceInDays(parseISO(bar.end_date), parseISO(bar.start_date));
            // 幅は期間に比例させるが、最低でも0.5の重みを持たせる
            const weight = Math.max(0.5, (duration / totalDays) * 5);

            return {
                name: bar.category_name,
                width: weight,
                status: status,
                startDate: bar.start_date,
                endDate: bar.end_date
            };
        });

        // 1行で表示するには多すぎる場合などを考慮すべきだが、まずはシンプルに3-4個ずつ分割してフェーズ化する
        const chunkSize = 4;
        const phases = [];
        for (let i = 0; i < steps.length; i += chunkSize) {
            const chunk = steps.slice(i, i + chunkSize);

            // チャンク内の期間範囲
            const chunkStart = chunk[0].startDate;
            const chunkEnd = chunk[chunk.length - 1].endDate;

            phases.push({
                id: phases.length + 1,
                steps: chunk,
                durations: [
                    {
                        label: `${format(parseISO(chunkStart), 'M/d')} - ${format(parseISO(chunkEnd), 'M/d')}`,
                        span: chunk.reduce((acc, s) => acc + s.width, 0)
                    }
                ]
            });
        }

        return { timelinePhases: phases, totalDurationText };
    }, [bars]);

    return (
        <div className="bg-gray-50 flex-1 overflow-auto p-4 md:p-8 font-sans text-gray-800">
            <div className="max-w-7xl mx-auto bg-white p-6 shadow-md rounded-lg">

                {/* ヘッダー: プロジェクト基本情報 */}
                <div className="flex justify-between items-end mb-6 border-b border-gray-200 pb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">プロジェクト週次報告書</h1>
                        <p className="text-sm text-gray-500 mt-1">報告日: {format(new Date(), 'yyyy年M月d日')} | 作成者: プロジェクトマネージャー</p>
                    </div>
                    <div className="text-right">
                        <span className="inline-block bg-green-100 text-green-800 text-sm font-bold px-3 py-1 rounded-full">
                            Status: On Track (順調)
                        </span>
                    </div>
                </div>

                {/* PC/タブレット用レイアウト */}
                <div className="flex flex-col gap-8">

                    {/* 上段: プロセスフローと期間線 */}
                    <div className="relative">
                        {/* SVGでプロセス全体を描画 */}
                        <div className={`w-full ${timelinePhases.length > 0 ? 'aspect-[20/3]' : 'h-32'}`}>
                            {timelinePhases.length > 0 ? (
                                <svg viewBox="0 0 1000 130" className="w-full h-full">
                                    {(() => {
                                        let currentX = 0;
                                        // @ts-ignore
                                        const totalRatio = timelinePhases.reduce((acc, p) => acc + p.steps.reduce((a, s) => a + s.width, 0), 0);
                                        const gap = 3;
                                        const svgWidth = 980;
                                        const scale = svgWidth / totalRatio;
                                        const height = 60; // 高さを少し調整
                                        const pointDepth = 15;

                                        return timelinePhases.map((phase, phaseIdx) => {
                                            const phaseNodes: React.ReactNode[] = [];

                                            // 1. プロセス矢印の描画
                                            phase.steps.forEach((step, stepIdx) => {
                                                const width = step.width * scale - gap;
                                                const isFirst = phaseIdx === 0 && stepIdx === 0;

                                                phaseNodes.push(
                                                    <g key={`step-${phaseIdx}-${stepIdx}`}>
                                                        <ChevronPath x={currentX} y={0} width={width} height={height} pointDepth={pointDepth}
                                                            isFirst={isFirst} color={step.status.color} />
                                                        {/* テキスト */}
                                                        <text x={currentX + (width / 2) + (isFirst ? 0 : pointDepth / 2)} y={height / 2}
                                                            fill="white" fontSize="14" fontWeight="bold" textAnchor="middle"
                                                            dominantBaseline="middle" className="pointer-events-none">
                                                            {step.name}
                                                        </text>
                                                    </g>
                                                );
                                                currentX += width + gap;
                                            });

                                            // フェーズ間の余白
                                            currentX += 10;
                                            return phaseNodes;
                                        });
                                    })()}

                                    {/* 期間線 (矢印の下) の描画レイヤー */}
                                    {(() => {
                                        let currentX = 0;
                                        // @ts-ignore
                                        const totalRatio = timelinePhases.reduce((acc, p) => acc + p.steps.reduce((a, s) => a + s.width, 0), 0);
                                        const gap = 3;
                                        const svgWidth = 980;
                                        const scale = svgWidth / totalRatio;
                                        const startY = 80;

                                        return timelinePhases.map((phase, phaseIdx) => (
                                            <g key={`duration-${phaseIdx}`}>
                                                {phase.durations.map((d, i) => {
                                                    const width = d.span * scale - (i < phase.durations.length - 1 ? gap : 0);
                                                    const lineStart = currentX + 5;
                                                    const lineEnd = currentX + width - 5;
                                                    const el = (
                                                        <g key={i}>
                                                            <line x1={lineStart} y1={startY} x2={lineEnd} y2={startY} stroke="#333" strokeWidth="1"
                                                                markerEnd="url(#arrowhead)" markerStart="url(#arrowhead-start)" />
                                                            <text x={currentX + width / 2} y={startY + 15} textAnchor="middle" fontSize="12"
                                                                fill="#333" fontWeight="500">
                                                                {d.label}
                                                            </text>
                                                        </g>
                                                    );
                                                    currentX += width + (i < phase.durations.length - 1 ? gap : 0);
                                                    return el;
                                                })}
                                                {(() => {
                                                    currentX += 10;
                                                    return null;
                                                })()}
                                            </g>
                                        ));
                                    })()}

                                    <defs>
                                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5"
                                            orient="auto">
                                            <polygon points="0 0, 10 3.5, 0 7" fill="#333" />
                                        </marker>
                                        <marker id="arrowhead-start" markerWidth="10" markerHeight="7" refX="1" refY="3.5"
                                            orient="auto">
                                            <polygon points="10 0, 0 3.5, 10 7" fill="#333" />
                                        </marker>
                                    </defs>
                                </svg>
                            ) : (
                                <div className="flex items-center justify-center h-full text-gray-400 border border-dashed rounded">
                                    カテゴリデータがありません
                                </div>
                            )}
                        </div>

                        {/* 凡例 */}
                        <div className="flex justify-center gap-6 mt-0 text-sm">
                            {Object.values(STATUS).map((status) => (
                                <div key={status.label} className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded" style={{ backgroundColor: status.color }}></div>
                                    <span>{status.label}</span>
                                </div>
                            ))}
                        </div>

                        <div className="text-center mt-4 text-sm font-bold text-gray-600 border-t pt-2 w-full">
                            {totalDurationText}
                        </div>
                    </div>

                    {/* 下段: 詳細報告ボックス (Grid Layout) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                        {reportSections.map((section) => (
                            <div key={section.id}
                                className="border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col h-full">

                                {/* ヘッダー */}
                                <div className={`${section.headerColor} p-3 text-white text-md font-bold text-center flex items-center justify-center min-h-[50px]`}>
                                    {section.title}
                                </div>

                                {/* 内容 */}
                                <div className="p-5 bg-white flex-1">
                                    <ul className="space-y-4">
                                        {section.items.map((item, i) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                                <span className="mt-1.5 w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0"></span>
                                                <div className="flex-1">
                                                    <div className={item.type === 'highlight' ? "font-bold text-blue-800" : ""}>
                                                        {item.text}
                                                    </div>
                                                    {item.subText && (
                                                        <div className="text-xs text-gray-500 mt-1 ml-1">
                                                            {item.subText}
                                                        </div>
                                                    )}
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
    );
};
