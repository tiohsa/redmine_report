import React, { useMemo, useState } from 'react';
import { CategoryBar, generateScheduleReport, ReportContent, ReportItem } from '../services/scheduleReportApi';
import { format, parseISO, differenceInDays, eachMonthOfInterval, startOfMonth, endOfMonth, isSameDay } from 'date-fns';

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
    fetchError?: string | null;
}

export const ProjectStatusReport = ({ bars = [], projectIdentifier, fetchError = null }: ProjectStatusReportProps) => {

    const [generatedContent, setGeneratedContent] = useState<ReportContent | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset generated content when project changes
    React.useEffect(() => {
        setGeneratedContent(null);
        setError(null);
    }, [projectIdentifier]);

    // カテゴリデータをタイムライン用に変換
    const { timelinePhases, totalDurationText, todayPosition, monthSegments } = useMemo(() => {
        if (bars.length === 0) {
            return { timelinePhases: [], totalDurationText: "データなし", todayPosition: null, monthSegments: [] };
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
            phases.push({
                id: phases.length + 1,
                steps: chunk,
                durations: chunk.map(s => ({
                    label: `${format(parseISO(s.startDate), 'M/d')} - ${format(parseISO(s.endDate), 'M/d')}`,
                    span: s.width
                }))
            });
        }

        // スケール計算
        const totalRatio = steps.reduce((acc, s) => acc + s.width, 0);
        const gap = 3;
        const svgWidth = 980;
        const scale = totalRatio > 0 ? svgWidth / totalRatio : 0;

        // 指定した日付のX座標を取得する関数 (SVG座標系)
        const getDateX = (targetDate: Date): number | null => {
            const targetDays = differenceInDays(targetDate, parseISO(minDate));
            if (targetDays < 0) return 0; // 開始前は左端
            // if (targetDays > totalDays) return svgWidth; // 終了後は右端 (ただしgap等のズレがあるため正確ではない)

            let cumulativeX = 0;
            let cumulativeDays = 0;

            for (let i = 0; i < steps.length; i++) {
                const stepStart = parseISO(steps[i].startDate);
                const stepEnd = parseISO(steps[i].endDate);
                const stepDays = differenceInDays(stepEnd, stepStart);
                const stepWidth = steps[i].width * scale;

                // フェーズ間のギャップを考慮 (phases構築時のロジックと合わせる)
                const phaseGap = (i > 0 && i % chunkSize === 0) ? 10 : 0;
                cumulativeX += phaseGap;

                // ステップの期間内かチェック
                // ここではステップ間の隙間期間がない前提（start = prev.end + 1 ではない場合もあるが、stepsはソート済み）
                // あるいは、前のステップとこのステップの間（日付のギャップ）にあるか

                // 単純化のため、targetDateがこのステップの開始日以降であれば計算を進める
                const daysFromStart = differenceInDays(targetDate, stepStart);

                if (daysFromStart >= 0 && daysFromStart <= stepDays) {
                    // このステップ内
                    const ratio = stepDays > 0 ? daysFromStart / stepDays : 0;
                    return cumulativeX + ratio * (stepWidth - gap); // + gap は次のステップの開始位置調整用なので引く
                } else if (daysFromStart > stepDays) {
                    // このステップより後
                    cumulativeX += stepWidth; // gapは次のループの冒頭で加算されない(phaseGapのみ)ので、ここではwidthだけ足すのが基本だが...
                    // 待て、renderingロジックでは `currentX += width + gap` している
                    // render loop: `width = step.width * scale - gap`
                    // `currentX += width + gap` -> `currentX += step.width * scale`
                    // つまり `currentX` は `step` の左端。
                } else {
                    // このステップより前（ありえない、sortedBars[0]がminDateなので）
                    return cumulativeX;
                }
            }
            // 全ステップループしても見つからない（totalDaysを超えている場合など）
            return cumulativeX;
        };

        // 再実装: getDateX (より正確なロジック)
        const getDateX_v2 = (targetDate: Date): number => {
            let currentX = 0;
            let lastDate = parseISO(minDate);

            for (let i = 0; i < steps.length; i++) {
                const stepStart = parseISO(steps[i].startDate);
                const stepEnd = parseISO(steps[i].endDate);
                const stepWidthRaw = steps[i].width * scale;
                const stepVisualWidth = stepWidthRaw - gap;

                // Phase Gap
                if (i > 0 && i % chunkSize === 0) {
                    currentX += 10;
                }

                // ターゲットがこのステップの範囲内にあるか？
                // あるいは、前のステップとこのステップの間（日付のギャップ）にあるか？
                // 簡易的に、各ステップ内での割合で計算する。
                // 日付が飛んでいる場合は、前のステップの右端〜次のステップの左端の間になるべきだが、
                // Yabaneフローは連続している前提（日付が連続しているとは限らないが図形は連続）
                // したがって、targetDate が stepStart ~ stepEnd の間にある場合のみ、そのステップ内で補間する。

                if (targetDate < stepStart) {
                    // 範囲外（左側）：まだ到達していない
                    // 前のステップの終了日とこのステップの開始日の間にある場合
                    // ここでは単に currentX (このステップの左端) を返す
                    return currentX;
                }

                if (targetDate >= stepStart && targetDate <= stepEnd) {
                    const stepTotalDays = differenceInDays(stepEnd, stepStart);
                    const daysIn = differenceInDays(targetDate, stepStart);
                    const ratio = stepTotalDays > 0 ? daysIn / stepTotalDays : 0; // 0..1
                    return currentX + (ratio * stepVisualWidth);
                }

                currentX += stepWidthRaw; // 次のステップの開始位置へ
            }
            return currentX; // 右端
        };


        // Today位置
        const todayPos = getDateX_v2(new Date());

        // 月セグメント
        const months = eachMonthOfInterval({ start: parseISO(minDate), end: parseISO(maxDate) });
        const monthSegments = months.map(m => {
            // その月の開始日（プロジェクト開始日より前ならプロジェクト開始日）
            const mStart = startOfMonth(m) < parseISO(minDate) ? parseISO(minDate) : startOfMonth(m);
            // その月の終了日（プロジェクト終了日より後ならプロジェクト終了日）
            const mEnd = endOfMonth(m) > parseISO(maxDate) ? parseISO(maxDate) : endOfMonth(m);

            const x1 = getDateX_v2(mStart);
            const x2 = getDateX_v2(mEnd); // 月末の座標（ただしステップの右端座標は gap を引く前の raw width で計算した方が contiguous になるか？）
            // getDateX_v2 はステップ内補間してるので、正確な位置を返すはず。
            // 月の境界線を描く場合、x2 は次の月の x1 と一致すべき。

            // 補正: 月末の23:59:59的な扱いにするため、mEndがステップの終了日と一致する場合、そのステップの右端(visual width)を返す
            // あるいは、次の月の開始日(x1 of next month)を使うのが安全。
            // しかし最後の月の場合は次の月がない。

            return {
                label: format(m, 'M月'),
                endLabel: format(mEnd, 'M/d'),
                x: x1,
                width: Math.max(0, x2 - x1)
            };
        });

        // 補正: widthのギャップを埋めるため、width = next.x - curr.x にした方が綺麗に繋がる
        for (let i = 0; i < monthSegments.length - 1; i++) {
            monthSegments[i].width = monthSegments[i + 1].x - monthSegments[i].x;
        }


        return { timelinePhases: phases, totalDurationText, todayPosition: todayPos, monthSegments };
    }, [bars]);

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
                        <h1 className="text-2xl font-bold text-gray-800">プロジェクト週次報告書</h1>
                        <p className="text-sm text-gray-500 mt-1">報告日: {format(new Date(), 'yyyy年M月d日')} | 作成者: プロジェクトマネージャー</p>
                    </div>
                    <div className="text-right flex items-center gap-4">
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className={`px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
                        >
                            {isGenerating ? (
                                <>
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    AI生成中...
                                </>
                            ) : (
                                "AIレポート生成"
                            )}
                        </button>
                        <span className="inline-block bg-green-100 text-green-800 text-sm font-bold px-3 py-1 rounded-full">
                            Status: On Track (順調)
                        </span>
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
                    <div className="relative">
                        {/* SVGでプロセス全体を描画 (viewBoxを上に拡張) */}
                        <div className={`w-full ${timelinePhases.length > 0 ? 'aspect-[20/6]' : 'h-32'}`}>
                            {timelinePhases.length > 0 ? (
                                <svg viewBox="0 -85 1000 215" className="w-full h-full">

                                    {/* 月ヘッダー (最上部) */}
                                    <g>
                                        {monthSegments.map((seg, i) => (
                                            <g key={i}>
                                                {/* 月枠 */}
                                                <rect
                                                    x={seg.x}
                                                    y={-85}
                                                    width={seg.width}
                                                    height={30}
                                                    fill="#f9fafb"
                                                    stroke="#e5e7eb"
                                                    strokeWidth="1"
                                                />
                                                {/* 月ラベル (中央) */}
                                                <text
                                                    x={seg.x + seg.width / 2}
                                                    y={-65}
                                                    textAnchor="middle"
                                                    fontSize="14"
                                                    fontWeight="bold"
                                                    fill="#374151" /* gray-700 */
                                                    dominantBaseline="middle"
                                                >
                                                    {seg.label}
                                                </text>
                                                {/* 月末日 (右下) - 枠の下、Y=-55あたり、ボーダーライン付き */}
                                                <line x1={seg.x} y1={-55} x2={seg.x + seg.width} y2={-55} stroke="#e5e7eb" strokeWidth="1" />
                                                <text
                                                    x={seg.x + seg.width - 5}
                                                    y={-40}
                                                    textAnchor="end"
                                                    fontSize="12"
                                                    fill="#6b7280" /* gray-500 */
                                                >
                                                    {seg.endLabel}
                                                </text>
                                                {/* 月の区切り線 */}
                                                <line x1={seg.x + seg.width} y1={-85} x2={seg.x + seg.width} y2={-35} stroke="#e5e7eb" strokeWidth="1" />
                                            </g>
                                        ))}
                                    </g>

                                    {/* プロジェクト期間テキスト */}
                                    <text
                                        x="500"
                                        y={-15}
                                        textAnchor="middle"
                                        fontSize="12"
                                        fill="#4b5563" /* gray-600 */
                                        fontWeight="bold"
                                    >
                                        {totalDurationText}
                                    </text>

                                    {(() => {
                                        let currentX = 0;
                                        // @ts-ignore
                                        const totalRatio = timelinePhases.reduce((acc, p) => acc + p.steps.reduce((a, s) => a + s.width, 0), 0);
                                        const gap = 3;
                                        const svgWidth = 980;
                                        const scale = totalRatio > 0 ? svgWidth / totalRatio : 0;
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

                                    {/* Today マーカー (z-index的に矢印の上に描画) */}
                                    {todayPosition !== null && (
                                        <g>
                                            <line
                                                x1={todayPosition}
                                                y1={-10} // 月ヘッダーには被らないように調整
                                                x2={todayPosition}
                                                y2={100}
                                                stroke="#ef4444"
                                                strokeWidth="2"
                                                strokeDasharray="4 3"
                                            />
                                            {/* Todayラベル: 矢印の直上 */}
                                            <rect
                                                x={todayPosition - 22}
                                                y={-28}
                                                width="44"
                                                height="18"
                                                rx="3"
                                                fill="#ef4444"
                                            />
                                            <text
                                                x={todayPosition}
                                                y={-16}
                                                textAnchor="middle"
                                                fontSize="10"
                                                fontWeight="bold"
                                                fill="white"
                                            >
                                                Today
                                            </text>
                                        </g>
                                    )}

                                    {/* 期間線 (矢印の下) の描画レイヤー */}
                                    {(() => {
                                        let currentX = 0;
                                        // @ts-ignore
                                        const totalRatio = timelinePhases.reduce((acc, p) => acc + p.steps.reduce((a, s) => a + s.width, 0), 0);
                                        const gap = 3;
                                        const svgWidth = 980;
                                        const scale = totalRatio > 0 ? svgWidth / totalRatio : 0;
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

                        {/* 凡例 (少し下げて配置) */}
                        <div className="flex justify-center gap-6 mt-2 text-sm">
                            {Object.values(STATUS).map((status) => (
                                <div key={status.label} className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded" style={{ backgroundColor: status.color }}></div>
                                    <span>{status.label}</span>
                                </div>
                            ))}
                        </div>
                        {/* totalDurationText は SVG内に移動したため削除 */}
                    </div>

                    {/* 下段: 詳細報告ボックス (Grid Layout) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                        {displaySections.map((section) => (
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
