import React, { useMemo, useState } from 'react';
import { CategoryBar, generateScheduleReport, ReportContent, ReportItem, ProjectInfo } from '../services/scheduleReportApi';
import { format, differenceInDays, startOfMonth, endOfMonth, addMonths, isBefore, isAfter, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

// --- データ定義: プロジェクト進捗報告書 ---

// 現在のステータス定義
// 現在のステータス定義
const STATUS = {
    COMPLETED: { fill: "#1e3a8a", text: "#ffffff", stroke: "#1e3a8a", label: "完了", textStroke: "transparent", textStrokeWidth: "0px" }, // Blue 900
    IN_PROGRESS: { fill: "#2563eb", text: "#1e3a8a", stroke: "#2563eb", label: "進行中", textStroke: "#ffffff", textStrokeWidth: "3px" }, // Blue 600, Text: Dark Blue
    PENDING: { fill: "#f1f5f9", text: "#475569", stroke: "#cbd5e1", label: "未着手", textStroke: "#ffffff", textStrokeWidth: "3px" } // Slate 100 background, Slate 600 text, Slate 300 border
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
    fill: string;
    stroke: string;
    progress?: number; // 0-100
    id?: string; // unique id for gradient
    filter?: string;
}

const ChevronPath = ({ x, y, width, height, pointDepth, isFirst, fill, stroke, progress, id, filter }: ChevronPathProps) => {
    const p = pointDepth;
    const w = width;
    const h = height;

    // 形状計算:
    // 左端: 最初の要素(Start)なら直線、それ以外(Connection)なら凹み
    const leftShape = isFirst
        ? `M ${x} ${y} L ${x} ${y + h}`
        : `M ${x} ${y} L ${x + p} ${y + h / 2} L ${x} ${y + h}`;

    // 右端: 常に凸型(Direction)
    const rightShape = `L ${x + w} ${y + h} L ${x + w + p} ${y + h / 2} L ${x + w} ${y}`;
    const d = `${leftShape} ${rightShape} Z`;

    if (progress !== undefined && progress >= 0 && progress < 100 && id) {
        const gradientId = `grad-${id}`;
        return (
            <g filter={filter}>
                <defs>
                    <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset={`${progress}%`} stopColor={fill} />
                        <stop offset={`${progress}%`} stopColor="#cbd5e1" /> {/* 未達成部分は少し濃い灰色 (Slate 300) */}
                    </linearGradient>
                </defs>
                <path d={d} fill={`url(#${gradientId})`} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
                {!isFirst && <path d={leftShape} stroke="white" strokeWidth="2" fill="none" />}
            </g>
        );
    }

    return (
        <g filter={filter}>
            <path d={d} fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
            {!isFirst && <path d={leftShape} stroke="white" strokeWidth="2" fill="none" />}
        </g>
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

    // コンテナの参照と幅の管理
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState<number>(0);

    React.useLayoutEffect(() => {
        if (!containerRef.current) return;

        const updateWidth = () => {
            if (containerRef.current) {
                setContainerWidth(containerRef.current.clientWidth);
            }
        };

        const observer = new ResizeObserver(() => {
            updateWidth();
        });

        observer.observe(containerRef.current);
        updateWidth(); // 初期値設定

        return () => observer.disconnect();
    }, []);

    // タイムライン構築: 日付ベースの計算
    const { timelineData, timelineWidth, headerMonths, totalDurationText, todayX } = useMemo(() => {
        if (bars.length === 0) {
            return { timelineData: [], timelineWidth: 1000, headerMonths: [], totalDurationText: "データなし", todayX: -1 };
        }

        // 1. 全体の期間を決定
        let minDateValue = new Date();
        let maxDateValue = new Date();
        let hasDates = false;

        bars.forEach(bar => {
            if (bar.start_date) {
                const d = parseISO(bar.start_date);
                if (!hasDates || isBefore(d, minDateValue)) minDateValue = d;
                hasDates = true;
            }
            if (bar.end_date) {
                const d = parseISO(bar.end_date);
                if (!hasDates || isAfter(d, maxDateValue)) maxDateValue = d;
                hasDates = true;
            }
        });

        if (!hasDates) {
            // 日付がない場合のデフォルト
            minDateValue = startOfMonth(new Date());
            maxDateValue = endOfMonth(addMonths(new Date(), 2));
        } else {
            // チケットの範囲に厳密に合わせる (前後2日のバッファを持たせる)
            const dMin = new Date(minDateValue);
            dMin.setDate(dMin.getDate() - 2);
            minDateValue = dMin;

            const dMax = new Date(maxDateValue);
            dMax.setDate(dMax.getDate() + 2);
            maxDateValue = dMax;
        }

        const totalDays = differenceInDays(maxDateValue, minDateValue) + 1;

        // スケール計算: 表示幅に合わせて PIXELS_PER_DAY を決定
        // containerWidth が有効な値になるまではデフォルト値を使用
        const currentContainerWidth = containerWidth > 0 ? containerWidth : 1000;
        const PIXELS_PER_DAY = currentContainerWidth / totalDays;

        const timelineWidth = currentContainerWidth; // SVGの幅はコンテナ幅に合わせる

        // 座標計算ヘルパー
        const getX = (dateStr?: string) => {
            if (!dateStr) return 0;
            const date = parseISO(dateStr);
            const days = differenceInDays(date, minDateValue);
            return Math.max(0, days * PIXELS_PER_DAY);
        };

        const getWidth = (startStr?: string, endStr?: string) => {
            if (!startStr || !endStr) return 0;
            const start = parseISO(startStr);
            const end = parseISO(endStr);
            const days = differenceInDays(end, start); // 終了日も含めるなら +1 だが、期間としての幅ならそのままでよいか？
            // ガントチャートでは通常、終了日の終わりまでを含むので、differenceInDays + 1 日分の幅とするか、
            // 時間軸の概念による。ここでは単純に差分日数 * ピクセル数とする。
            // ただし、1日だけのタスクが見えなくなるのを防ぐために最小幅を設けるか検討が必要だが、
            // 「最新、最古が最大幅になるように」という要望なので、厳密にスケールさせる。
            // 視認性確保のため、daysが0でも最低限の幅を持たせるロジックを入れる
            const width = Math.max(days + 1, 0.5) * PIXELS_PER_DAY;
            return width;
        };

        // 2. ヘッダー情報の生成 (月ごと)
        const headerMonths = [];
        let currentMonth = minDateValue;
        while (isBefore(currentMonth, maxDateValue) || currentMonth.getTime() === maxDateValue.getTime()) {
            const monthStart = startOfMonth(currentMonth);
            const monthEnd = endOfMonth(currentMonth);

            // 表示範囲内での開始・終了を計算
            const visibleStart = isBefore(monthStart, minDateValue) ? minDateValue : monthStart;
            const visibleEnd = isAfter(monthEnd, maxDateValue) ? maxDateValue : monthEnd;

            // 月の期間（日数）
            const monthDays = differenceInDays(visibleEnd, visibleStart) + 1;

            const x = differenceInDays(visibleStart, minDateValue) * PIXELS_PER_DAY;
            const width = monthDays * PIXELS_PER_DAY;

            headerMonths.push({
                label: format(currentMonth, 'yyyy年 MMMM', { locale: ja }),
                x,
                width
            });

            currentMonth = addMonths(currentMonth, 1);
        }

        // 3. データグルーピング
        const groupedByProject = new Map<number, Map<string, CategoryBar[]>>();
        bars.forEach((bar) => {
            if (!groupedByProject.has(bar.project_id)) groupedByProject.set(bar.project_id, new Map());
            const byVersion = groupedByProject.get(bar.project_id)!;
            const versionKey = bar.version_name || 'No Version';
            if (!byVersion.has(versionKey)) byVersion.set(versionKey, []);
            byVersion.get(versionKey)!.push(bar);
        });

        const timelineData: Array<{
            laneKey: string;
            projectId: number;
            projectName: string;
            versionName: string;
            steps: Array<{
                name: string;
                x: number;
                width: number;
                status: { fill: string; text: string; stroke: string; label: string; textStroke?: string; textStrokeWidth?: string };
                progress?: number;
                id: string;
                startDate?: string;
                endDate?: string;
            }>;
        }> = [];

        Array.from(groupedByProject.entries()).forEach(([projectId, versionMap]) => {
            const projectInfo = projectMap.get(projectId);
            const projectName = projectInfo ? projectInfo.name : `Project ${projectId}`;
            Array.from(versionMap.entries()).forEach(([versionKey, versionBars]) => {
                const sortedBars = [...versionBars].sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));

                if (!timelineData.find((lane) => lane.laneKey === `${projectId}:${versionKey}`)) {
                    timelineData.push({
                        laneKey: `${projectId}:${versionKey}`,
                        projectId,
                        projectName,
                        versionName: versionKey,
                        steps: sortedBars.map((bar, idx) => {
                            let status = STATUS.PENDING;
                            let progress = undefined;
                            if (bar.progress_rate === 100) {
                                status = STATUS.COMPLETED;
                            } else if (bar.progress_rate > 0) {
                                status = STATUS.IN_PROGRESS;
                                progress = bar.progress_rate;
                            }

                            const formatDate = (dateStr?: string) => {
                                if (!dateStr) return '';
                                try {
                                    const date = new Date(dateStr);
                                    return `${date.getMonth() + 1}/${date.getDate()}`;
                                } catch (e) {
                                    return '';
                                }
                            };

                            const x = getX(bar.start_date);
                            const width = getWidth(bar.start_date, bar.end_date);

                            return {
                                name: bar.ticket_subject || bar.category_name,
                                x,
                                width,
                                status,
                                progress,
                                id: `ticket-${bar.project_id}-${bar.category_id}-${idx}`,
                                startDate: formatDate(bar.start_date),
                                endDate: formatDate(bar.end_date)
                            };
                        })
                    });
                }
            });
        });

        const totalDurationText = `表示期間: ${format(minDateValue, 'yyyy/MM/dd')} - ${format(maxDateValue, 'yyyy/MM/dd')}`;

        // TodayのX座標を計算
        const todayX = getX(new Date().toISOString());

        return { timelineData, timelineWidth, headerMonths, totalDurationText, todayX };
    }, [bars, projectMap, containerWidth]);

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
                        <p className="text-sm text-gray-500 mt-1">報告日: {format(new Date(), 'yyyy年M月d日')} | {totalDurationText}</p>
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

                    {/* 上段: プロジェクト/バージョン別チケットフロー */}
                    <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                        {/* 左側: プロジェクト列 + バージョン列 */}
                        {/* 左側: プロジェクト列 + バージョン列 (統合) */}
                        {(() => {
                            const laneHeight = 130;
                            const headerHeight = 40;

                            return (
                                <div className="flex-none min-w-max bg-white border-r border-gray-200 flex flex-col">
                                    <div className="flex items-center px-6 font-bold text-gray-600 text-xs bg-gray-50 border-b border-gray-200" style={{ height: headerHeight }}>
                                        バージョン / プロジェクト
                                    </div>
                                    {timelineData.map((project) => (
                                        <div
                                            key={project.laneKey}
                                            className="flex flex-col justify-center px-6 border-b border-gray-100 box-border whitespace-nowrap"
                                            style={{ height: laneHeight }}
                                        >
                                            <div className="text-sm font-bold text-gray-800" title={project.versionName}>
                                                {project.versionName}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1" title={project.projectName}>
                                                {project.projectName}
                                            </div>
                                        </div>
                                    ))}
                                    {timelineData.length === 0 && (
                                        <div className="h-32"></div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* 右側: チケット矢羽根タイムライン */}
                        <div className="flex-1 overflow-x-auto bg-white relative" ref={containerRef}>
                            {(() => {
                                const laneHeight = 130;
                                const headerHeight = 40;
                                const svgHeight = headerHeight + (timelineData.length * laneHeight) + 30;

                                if (timelineData.length === 0) {
                                    return (
                                        <div className="flex items-center justify-center h-32 text-gray-400">
                                            データがありません
                                        </div>
                                    );
                                }

                                return (
                                    <svg viewBox={`0 0 ${timelineWidth} ${svgHeight}`} className="w-full" style={{ minHeight: svgHeight, minWidth: `${timelineWidth}px` }}>
                                        <defs>
                                            <pattern id="gridPattern" width="100" height="100" patternUnits="userSpaceOnUse">
                                                <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#f3f4f6" strokeWidth="1" />
                                            </pattern>
                                            {/* 矢印マーカー定義 */}
                                            <marker id="arrow-start" markerWidth="10" markerHeight="10" refX="0" refY="5" orient="auto">
                                                <path d="M10,0 L0,5 L10,10" fill="none" stroke="#64748b" strokeWidth="1" />
                                            </marker>
                                            <marker id="arrow-end" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto">
                                                <path d="M0,0 L10,5 L0,10" fill="none" stroke="#64748b" strokeWidth="1" />
                                            </marker>

                                            {/* ドロップシャドウ (矢羽根用) */}
                                            <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
                                                <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="blur" />
                                                <feOffset in="blur" dx="0" dy="1" result="offsetBlur" />
                                                <feFlood floodColor="rgba(0,0,0,0.2)" result="colorBlur" />
                                                <feComposite in="colorBlur" in2="offsetBlur" operator="in" result="shadow" />
                                                <feMerge>
                                                    <feMergeNode in="shadow" />
                                                    <feMergeNode in="SourceGraphic" />
                                                </feMerge>
                                            </filter>

                                            {/* テキストシャドウ (視認性向上) */}
                                            <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
                                                <feGaussianBlur in="SourceAlpha" stdDeviation="0.5" result="blur" />
                                                <feOffset in="blur" dx="0" dy="1" result="offsetBlur" />
                                                <feFlood floodColor="rgba(0,0,0,0.6)" result="colorBlur" />
                                                <feComposite in="colorBlur" in2="offsetBlur" operator="in" result="shadow" />
                                                <feMerge>
                                                    <feMergeNode in="shadow" />
                                                    <feMergeNode in="SourceGraphic" />
                                                </feMerge>
                                            </filter>

                                            {/* ストライプパターン (未着手用) */}
                                            <pattern id="stripePattern" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                                                <rect width="6" height="6" fill="#f8fafc" />
                                                <line x1="0" y1="0" x2="0" y2="6" stroke="#e2e8f0" strokeWidth="2" />
                                            </pattern>
                                        </defs>

                                        {/* ヘッダー背景 */}
                                        <g transform="translate(0, 0)">
                                            <rect x={0} y={0} width={timelineWidth} height={headerHeight} fill="#f9fafb" stroke="#e5e7eb" strokeWidth="1" />

                                            {/* ヘッダー: 月ごとの表示 */}
                                            {headerMonths.map((month, idx) => (
                                                <g key={idx} transform={`translate(${month.x}, 0)`}>
                                                    <rect x={0} y={0} width={month.width} height={headerHeight} fill="none" stroke="#e5e7eb" strokeWidth="1" />
                                                    <text
                                                        x={month.width / 2}
                                                        y={headerHeight / 2}
                                                        textAnchor="middle"
                                                        dominantBaseline="middle"
                                                        fontSize="13"
                                                        fontWeight="bold"
                                                        fill="#374151"
                                                    >
                                                        {month.label}
                                                    </text>
                                                </g>
                                            ))}

                                            {/* Todayライン (ヘッダー部分) */}
                                            {todayX >= 0 && todayX <= timelineWidth && (
                                                <g transform={`translate(${todayX}, 0)`}>
                                                    <line x1={0} y1={0} x2={0} y2={headerHeight} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 2" />
                                                    <rect x={-20} y={headerHeight} width={40} height={16} fill="white" opacity="0.9" />
                                                    <text x={0} y={headerHeight + 12} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#ef4444">
                                                        {format(new Date(), 'M/d')}
                                                    </text>
                                                </g>
                                            )}
                                        </g>

                                        {/* プロジェクトごとのレーン */}
                                        {timelineData.map((project, pIdx) => {
                                            const yOffset = headerHeight + (pIdx * laneHeight);
                                            return (
                                                <g key={project.projectId} transform={`translate(0, ${yOffset})`}>
                                                    {/* 区切り線 (下部) */}
                                                    <line x1={0} y1={laneHeight} x2={timelineWidth} y2={laneHeight} stroke="#f3f4f6" strokeWidth="1" />

                                                    {/* 縦グリッド線 (月区切り) - 薄く表示 */}
                                                    {headerMonths.map((month, mIdx) => (
                                                        <line
                                                            key={mIdx}
                                                            x1={month.x} y1={0}
                                                            x2={month.x} y2={laneHeight}
                                                            stroke="#f3f4f6"
                                                            strokeDasharray="4 2"
                                                        />
                                                    ))}
                                                    {/* 矢羽根列 */}
                                                    {project.steps.map((step, sIdx) => {
                                                        const isFirst = sIdx === 0;

                                                        const pointDepth = 15;
                                                        const barHeight = 40;
                                                        const dateSectionHeight = 25;
                                                        // 垂直方向の中央寄せ計算: (レーン高さ - (矢羽根高さ + 日付表示領域)) / 2
                                                        const verticalOffset = (laneHeight - (barHeight + dateSectionHeight)) / 2;

                                                        const isPending = step.status.label === "未着手";
                                                        const fillUrl = isPending ? "url(#stripePattern)" : step.status.fill;

                                                        return (
                                                            <g key={sIdx} transform={`translate(0, ${verticalOffset})`}>
                                                                <ChevronPath
                                                                    x={step.x}
                                                                    y={0}
                                                                    width={step.width}
                                                                    height={barHeight}
                                                                    pointDepth={pointDepth}
                                                                    isFirst={isFirst}
                                                                    fill={fillUrl}
                                                                    stroke={step.status.stroke}
                                                                    progress={step.progress}
                                                                    id={step.id}
                                                                    filter="url(#dropShadow)"
                                                                />

                                                                {/* テキスト表示: 幅が十分ある場合のみ */}
                                                                {step.width > 30 && (
                                                                    <text
                                                                        x={step.x + step.width / 2 + (isFirst ? 0 : pointDepth / 2)}
                                                                        y={barHeight / 2}
                                                                        fill={step.status.text}
                                                                        fontSize="12"
                                                                        fontWeight="bold"
                                                                        textAnchor="middle"
                                                                        dominantBaseline="middle"
                                                                        // filter="url(#textShadow)" // テキストシャドウはハロー効果と重複するため一時的に無効化
                                                                        style={{
                                                                            pointerEvents: 'none',
                                                                            paintOrder: 'stroke',
                                                                            stroke: step.status.textStroke || '#ffffff',
                                                                            strokeWidth: step.status.textStrokeWidth || '3px',
                                                                            strokeLinecap: 'round',
                                                                            strokeLinejoin: 'round'
                                                                        }}
                                                                    >
                                                                        {step.name}
                                                                    </text>
                                                                )}

                                                                {/* 日付表示 (矢羽の下) */}
                                                                {(step.startDate || step.endDate) && (
                                                                    <g transform={`translate(${step.x + (isFirst ? 0 : pointDepth / 2)}, ${barHeight + 10})`}>
                                                                        {/* 矢印線 (中心を繋ぐ) */}
                                                                        <line
                                                                            x1={25} y1={5}
                                                                            x2={step.width - 25} y2={5}
                                                                            stroke="#94a3b8"
                                                                            strokeWidth="0.5"
                                                                            markerStart="url(#arrow-start)"
                                                                            markerEnd="url(#arrow-end)"
                                                                        />
                                                                        {/* 開始日 (左端) */}
                                                                        <text
                                                                            x={0}
                                                                            y={8}
                                                                            fontSize="9"
                                                                            fill="#94a3b8"
                                                                            textAnchor="start"
                                                                        >
                                                                            {step.startDate}
                                                                        </text>
                                                                        {/* 終了日 (右端) */}
                                                                        <text
                                                                            x={step.width}
                                                                            y={8}
                                                                            fontSize="9"
                                                                            fill="#94a3b8"
                                                                            textAnchor="end"
                                                                        >
                                                                            {step.endDate}
                                                                        </text>
                                                                    </g>
                                                                )}
                                                            </g>
                                                        );
                                                    })}

                                                    {/* Todayライン (レーン部分) - 矢羽根の上に表示するため後に配置 */}
                                                    {todayX >= 0 && todayX <= timelineWidth && (
                                                        <line x1={todayX} y1={0} x2={todayX} y2={laneHeight} stroke="#ef4444" strokeWidth="1" strokeDasharray="4 2" />
                                                    )}
                                                </g>
                                            );
                                        })}
                                    </svg>
                                );
                            })()}
                        </div>
                    </div>

                    {/* 凡例 */}
                    <div className="flex justify-center gap-6 mt-2 text-sm">
                        {Object.values(STATUS).map((status) => (
                            <div key={status.label} className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded border" style={{ backgroundColor: status.fill, borderColor: status.stroke }}></div>
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
