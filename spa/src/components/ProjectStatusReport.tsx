import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { generateScheduleReport, CategoryBar, ProjectInfo, ReportContent } from '../services/scheduleReportApi';
import { format } from 'date-fns';
import { INITIAL_REPORT_SECTIONS, STATUS } from './projectStatusReport/constants';
import { buildTimelineViewModel } from './projectStatusReport/timeline';
import { TimelineChart } from './projectStatusReport/TimelineChart';
import { ReportSections } from './projectStatusReport/ReportSections';
import { useUiStore } from '../stores/uiStore';

interface ProjectStatusReportProps {
    bars?: CategoryBar[];
    projectIdentifier: string;
    availableProjects?: ProjectInfo[];
    selectedVersions?: string[];
    onVersionChange?: (versions: string[]) => void;
    fetchError?: string | null;
}

export const ProjectStatusReport = ({
    bars = [],
    projectIdentifier,
    availableProjects = [],
    selectedVersions = [],
    onVersionChange,
    fetchError = null
}: ProjectStatusReportProps) => {
    const [generatedContent, setGeneratedContent] = useState<ReportContent | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState<number>(0);

    const { selectedProjectIdentifiers, setSelectedProjectIdentifiers } = useUiStore();
    const [isProjectOpen, setIsProjectOpen] = useState(false);
    const [isVersionOpen, setIsVersionOpen] = useState(false);
    const projectDropdownRef = useRef<HTMLDivElement>(null);
    const versionDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target as Node)) {
                setIsProjectOpen(false);
            }
            if (versionDropdownRef.current && !versionDropdownRef.current.contains(event.target as Node)) {
                setIsVersionOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

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

    const { timelineData, timelineWidth, headerMonths, headerYears, totalDurationText, todayX } = useMemo(
        () =>
            buildTimelineViewModel({
                bars,
                selectedVersions,
                projectMap,
                containerWidth
            }),
        [bars, selectedVersions, projectMap, containerWidth]
    );

    const allVersions = useMemo(() => {
        const versions = new Set<string>();
        bars.forEach(bar => {
            versions.add(bar.version_name || 'No Version');
        });
        return Array.from(versions).sort();
    }, [bars]);

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

    const toggleProject = (identifier: string) => {
        if (selectedProjectIdentifiers.includes(identifier)) {
            setSelectedProjectIdentifiers(selectedProjectIdentifiers.filter(pid => pid !== identifier));
        } else {
            setSelectedProjectIdentifiers([...selectedProjectIdentifiers, identifier]);
        }
    };

    const selectedProjectLabel = selectedProjectIdentifiers.length === 0
        ? "Select Projects"
        : selectedProjectIdentifiers.length === 1
            ? availableProjects.find(p => p.identifier === selectedProjectIdentifiers[0])?.name || "1 Project"
            : `${selectedProjectIdentifiers.length} Projects`;

    return (
        <div className="bg-white flex-1 overflow-auto font-sans text-[#1e293b]">
            <div className="w-full bg-white p-6">
                {/* 1st Row: Selectors and Buttons */}
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-6">
                        {/* Project Selection */}
                        <div className="flex items-center gap-3 relative" ref={projectDropdownRef}>
                            <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Project:</label>
                            <div className="relative">
                                <button
                                    onClick={() => setIsProjectOpen(!isProjectOpen)}
                                    className="bg-slate-50 hover:bg-slate-100 border-none text-slate-700 text-sm font-semibold rounded-lg px-4 py-2 flex items-center gap-2 min-w-[160px] cursor-pointer transition-colors"
                                >
                                    <span className="truncate max-w-[140px]">{selectedProjectLabel}</span>
                                    <svg className={`w-4 h-4 text-slate-400 transition-transform ${isProjectOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
                                    </svg>
                                </button>
                                {isProjectOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-64 max-h-[400px] overflow-y-auto bg-white border border-slate-100 rounded-xl shadow-xl z-50">
                                        {availableProjects.map((p) => {
                                            const isSelected = selectedProjectIdentifiers.includes(p.identifier);
                                            const isDisabled = p.selectable === false;
                                            return (
                                                <div
                                                    key={p.project_id}
                                                    className={`px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 cursor-pointer ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    onClick={() => !isDisabled && toggleProject(p.identifier)}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        readOnly
                                                        disabled={isDisabled}
                                                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600"
                                                    />
                                                    <span className={`text-sm ${isSelected ? 'font-semibold text-slate-900' : 'text-slate-600'}`} style={{ paddingLeft: `${p.level * 12}px` }}>
                                                        {p.name}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Version Selection */}
                        <div className="flex items-center gap-3 relative" ref={versionDropdownRef}>
                            <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Version:</label>
                            <div className="relative">
                                <button
                                    onClick={() => setIsVersionOpen(!isVersionOpen)}
                                    className="bg-slate-50 hover:bg-slate-100 border-none text-slate-700 text-sm font-semibold rounded-lg px-4 py-2 flex items-center gap-2 min-w-[140px] cursor-pointer transition-colors"
                                >
                                    <span className="truncate max-w-[120px]">
                                        {selectedVersions.length === allVersions.length ? 'All Versions' : `${selectedVersions.length} Selected`}
                                    </span>
                                    <svg className={`w-4 h-4 text-slate-400 transition-transform ${isVersionOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
                                    </svg>
                                </button>
                                {isVersionOpen && onVersionChange && (
                                    <div className="absolute top-full left-0 mt-2 w-64 max-h-[400px] overflow-y-auto bg-white border border-slate-100 rounded-xl shadow-xl z-50">
                                        <div className="p-2 border-b border-slate-50 flex justify-between bg-slate-50/50 sticky top-0 z-10">
                                            <button className="text-xs text-blue-600 hover:text-blue-700 font-bold px-2 py-1" onClick={() => onVersionChange(allVersions)}>Select All</button>
                                            <button className="text-xs text-slate-500 hover:text-slate-700 font-bold px-2 py-1" onClick={() => onVersionChange([])}>Clear</button>
                                        </div>
                                        {allVersions.map((version) => (
                                            <div
                                                key={version}
                                                className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 cursor-pointer"
                                                onClick={() => {
                                                    if (selectedVersions.includes(version)) {
                                                        onVersionChange(selectedVersions.filter(v => v !== version));
                                                    } else {
                                                        onVersionChange([...selectedVersions, version]);
                                                    }
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedVersions.includes(version)}
                                                    readOnly
                                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600"
                                                />
                                                <span className="text-sm text-slate-600 truncate font-medium">{version}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2.5 font-bold text-sm shadow-sm cursor-pointer">
                            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M7 10l5 5m0 0l5-5m-5 5V3"></path>
                            </svg>
                            エクスポート
                        </button>
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="px-5 py-2.5 bg-[#4f46e5] text-white rounded-lg hover:bg-[#4338ca] transition-all flex items-center gap-2.5 font-bold text-sm shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            {isGenerating ? (
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z"></path>
                                </svg>
                            )}
                            AIレポート生成
                        </button>
                    </div>
                </div>

                {/* 2nd Row: Info Line */}
                <div className="flex items-center gap-8 mb-8 pb-5 border-b border-slate-100">
                    <div className="flex items-center gap-2.5 text-slate-500">
                        <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                        </svg>
                        <span className="text-sm font-medium">報告日: <span className="text-slate-900 font-bold">{format(new Date(), 'yyyy年M月d日')}</span></span>
                    </div>
                    <div className="flex items-center gap-2.5 text-slate-500">
                        <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <span className="text-sm font-medium">表示期間: <span className="text-slate-900 font-bold">{totalDurationText}</span></span>
                    </div>
                </div>

                {(error || fetchError) && (
                    <div className="mb-6 bg-red-50 border border-red-100 text-red-600 px-5 py-4 rounded-xl relative" role="alert">
                        <span className="block sm:inline text-sm font-bold">{error || fetchError}</span>
                    </div>
                )}

                <div className="flex flex-col gap-8">
                    <TimelineChart
                        timelineData={timelineData}
                        timelineWidth={timelineWidth}
                        headerMonths={headerMonths}
                        headerYears={headerYears}
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
