import type { SVGProps } from 'react';
import { cn } from './cn';

export type IconName =
  | 'calendar'
  | 'check'
  | 'check-circle'
  | 'chevron-down'
  | 'close'
  | 'download'
  | 'folder'
  | 'fullscreen'
  | 'info'
  | 'open-in-new'
  | 'plus'
  | 'process'
  | 'reload'
  | 'sliders'
  | 'sparkles'
  | 'tag'
  | 'today'
  | 'warning';

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
};

const pathByName: Record<IconName, JSX.Element> = {
  calendar: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 2v3m8-3v3M4 10h16M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />,
  check: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M5 13l4 4L19 7" />,
  'check-circle': <path fillRule="evenodd" clipRule="evenodd" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.707-10.293a1 1 0 1 0-1.414-1.414L11 12.586l-1.293-1.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4Z" />,
  'chevron-down': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M19 9l-7 7-7-7" />,
  close: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M6 18L18 6M6 6l12 12" />,
  download: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 15v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M8 10l4 4m0 0l4-4m-4 4V3" />,
  folder: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M5 6h4l1.5 2H19a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />,
  fullscreen: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 9V4m0 0h5M4 4l4 4m12-4v5m0-5h-5m5 0l-4 4M4 15v5m0 0h5m-5 0l4-4m12 4v-5m0 5h-5m5 0l-4-4" />,
  info: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 16v-4m0-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  'open-in-new': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 3h6v6m0-6L10 14M7 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />,
  plus: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 5v14m7-7H5" />,
  process: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M11 7l5 5-5 5M5 7l5 5-5 5" />,
  reload: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 4v5h5M19.5 12A7.5 7.5 0 0 0 5 9l-1 0m16 11v-5h-5M4.5 12A7.5 7.5 0 0 0 19 15l1 0" />,
  sliders: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 5h16v14H4zM10 5v14M16 5v14" />,
  sparkles: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 3l2 5 6 2-6 2-2 5-2-5-6-2 6-2 2-5Z" />,
  tag: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 4h6l4 4v6l-4 4H9l-4-4V8l4-4Z M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />,
  today: (
    <>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 8h16M4 16h16" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 3v18" />
    </>
  ),
  warning: <path fillRule="evenodd" clipRule="evenodd" d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm-1-11a1 1 0 1 1 2 0v4a1 1 0 1 1-2 0v-4Zm1 9a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z" />,
};

export const Icon = ({ name, className, ...props }: IconProps) => (
  <svg
    className={cn('shrink-0', className)}
    fill={name === 'check-circle' || name === 'warning' ? 'currentColor' : 'none'}
    stroke={name === 'check-circle' || name === 'warning' ? undefined : 'currentColor'}
    viewBox="0 0 24 24"
    aria-hidden="true"
    {...props}
  >
    {pathByName[name]}
  </svg>
);

