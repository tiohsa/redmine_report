import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { generateScheduleReport, CategoryBar, ProjectInfo, ReportContent } from '../services/scheduleReportApi';
import { format } from 'date-fns';
import { INITIAL_REPORT_SECTIONS, STATUS } from './projectStatusReport/constants';
import { buildTimelineViewModel } from './projectStatusReport/timeline';
import { TimelineChart } from './projectStatusReport/TimelineChart';
import { ReportSections } from './projectStatusReport/ReportSections';

interface ProjectStatusReportProps {
    bars?: CategoryBar[];
    projectIdentifier: string;
    availableProjects?: ProjectInfo[];
    selectedVersions?: string[];
    fetchError?: string | null;
}

export const ProjectStatusReport = ({
    bars = [],
    projectIdentifier,
    availableProjects = [],
    selectedVersions = [],
    fetchError = null
}: ProjectStatusReportProps) => {
    const [generatedContent, setGeneratedContent] = useState<ReportContent | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState<number>(0);

    useEffect(() => {
        setGeneratedContent(null);
        setError(null);
    }, [projectIdentifier]);

    useLayoutEffect(() => {
        if (!containerRef.current) return;

        const updateWidth = () => {
            if (containerRef.current) {
                setContainerWidth(containerRef.current.clientWidth);
            }
        };

        const observer = new ResizeObserver(updateWidth);
        observer.observe(containerRef.current);
        updateWidth();

        return () => observer.disconnect();
    }, []);

    const projectMap = useMemo(() => {
        const map = new Map<number, ProjectInfo>();
        availableProjects.forEach((project) => map.set(project.project_id, project));
        return map;
    }, [availableProjects]);

    const { timelineData, timelineWidth, headerMonths, totalDurationText, todayX } = useMemo(
        () =>
            buildTimelineViewModel({
                bars,
                selectedVersions,
                projectMap,
                containerWidth
            }),
        [bars, selectedVersions, projectMap, containerWidth]
    );

    const displaySections = useMemo(() => {
        if (!generatedContent) return INITIAL_REPORT_SECTIONS;

        return INITIAL_REPORT_SECTIONS.map((section) => ({
            ...section,
            items: generatedContent[section.id] || []
        }));
    }, [generatedContent]);

    const handleGenerate = async () => {
        setIsGenerating(true);
        setError(null);

        try {
            const content = await generateScheduleReport(projectIdentifier);
            setGeneratedContent(content);
        } catch (caughtError: unknown) {
            if (caughtError instanceof Error) {
                setError(caughtError.message || 'Failed to generate report');
            } else {
                setError('Failed to generate report');
            }
        } finally {
            setIsGenerating(false);
        }
    };

    const projectTitle = projectMap.get(Number(projectIdentifier) || 0)?.name || projectIdentifier;

    return (
        <div className="bg-gray-50 flex-1 overflow-auto p-4 md:p-8 font-sans text-gray-800">
            <div className="max-w-7xl mx-auto bg-white p-6 shadow-md rounded-lg">
                <div className="flex justify-between items-end mb-6 border-b border-gray-200 pb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">プロジェクト進捗</h1>
                        <p className="text-sm text-gray-500 mt-1">報告日: {format(new Date(), 'yyyy年M月d日')} | {totalDurationText}</p>
                    </div>
                    <div className="text-right flex items-center gap-4">
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            title="メインターゲットプロジェクトのレポートを生成します"
                        >
                            {isGenerating ? (
                                <>
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        ></path>
                                    </svg>
                                    AIレポート生成
                                </>
                            ) : (
                                'AIレポート生成'
                            )}
                        </button>
                    </div>
                </div>

                {(error || fetchError) && (
                    <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                        <span className="block sm:inline">{error || fetchError}</span>
                    </div>
                )}

                <div className="flex flex-col gap-8">
                    <TimelineChart
                        timelineData={timelineData}
                        timelineWidth={timelineWidth}
                        headerMonths={headerMonths}
                        todayX={todayX}
                        containerRef={containerRef}
                    />

                    <div className="flex justify-center gap-6 mt-2 text-sm">
                        {Object.values(STATUS).map((status) => (
                            <div key={status.label} className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded border" style={{ backgroundColor: status.fill, borderColor: status.stroke }}></div>
                                <span>{status.label}</span>
                            </div>
                        ))}
                    </div>

                    <ReportSections projectTitle={projectTitle} sections={displaySections} />
                </div>
            </div>
        </div>
    );
};
