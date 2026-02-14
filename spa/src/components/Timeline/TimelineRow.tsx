import { TimelineRow as TimelineRowType } from '../../services/TimelineService';
import { TaskBar } from './TaskBar';

interface TimelineRowProps {
  row: TimelineRowType;
  projectIdentifier: string;
}

export const TimelineRow = ({ row, projectIdentifier }: TimelineRowProps) => {
  return (
    <div
      className="relative border-b border-gray-100 hover:bg-gray-50/50 transition-colors w-full box-border"
      style={{ height: `${row.height}px` }}
    >
      {row.bars.map((bar, i) => (
        <TaskBar
          key={`${bar.project_id}-${bar.category_id}-${i}`}
          bar={bar}
          projectIdentifier={projectIdentifier}
        />
      ))}
    </div>
  );
};
