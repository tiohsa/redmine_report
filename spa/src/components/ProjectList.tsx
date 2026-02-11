import { ProjectRow } from '../services/scheduleReportApi';
import { CalculatedRow } from '../services/LayoutEngine';

type Props = {
    rows: CalculatedRow[];
};

export function ProjectList({ rows }: Props) {
    return (
        <div className="project-list">
            <div className="project-list-body">
                {rows.map((row) => (
                    <div
                        key={row.data.project_id}
                        className="project-row"
                        style={{ height: row.height }}
                    >
                        <div
                            className="project-name"
                            style={{
                                paddingLeft: `${row.data.level * 20 + 20}px`,
                                fontWeight: row.data.level === 0 ? 'bold' : 'normal',
                                color: row.data.level === 0 ? '#111827' : '#374151',
                            }}
                        >
                            {row.data.name}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
