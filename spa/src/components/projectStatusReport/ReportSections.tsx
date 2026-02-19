import { ReportSection } from './constants';
import { t } from '../../i18n';

type ReportSectionsProps = {
  projectTitle: string;
  sections: ReportSection[];
};

export function ReportSections({ projectTitle, sections }: ReportSectionsProps) {
  return (
    <div className="mt-8 border-t pt-8">
      <h2 className="text-xl font-bold mb-4">{t('report.detailTitle')} ({projectTitle})</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {sections.map((section) => (
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
                      <div className={item.type === 'highlight' ? 'font-bold text-blue-800' : ''}>{item.text}</div>
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
  );
}
