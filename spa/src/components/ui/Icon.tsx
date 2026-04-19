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
  calendar: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M8 2v4m8-4v4M3 10h18M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 10h6m-2-2 2 2-2 2" />,
  check: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" d="M4.5 12.75l6 6 9-13.5" />,
  'check-circle': <path fillRule="evenodd" clipRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />,
  'chevron-down': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />,
  close: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" d="M6 18 18 6M6 6l12 12" />,
  download: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M4 16v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1M7 10l5 5m0 0 5-5m-5 5V3" />,
  folder: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />,
  fullscreen: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />,
  info: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  'open-in-new': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" d="M14 3h7v7m0-7L10 14m-4 0H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />,
  plus: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />,
  process: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M13 5l7 7-7 7M5 5l7 7-7 7" />,
  reload: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9M4.582 9H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" />,
  sliders: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />,
  sparkles: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 3 14.5 9 21 11.5 14.5 14 12 21 9.5 14 3 11.5 9.5 9 12 3Z" />,
  tag: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 0 1 0 2.828l-7 7a2 2 0 0 1-2.828 0l-7-7A1.994 1.994 0 0 1 3 12V7a4 4 0 0 1 4-4z" />,
  today: (
    <>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M4 6h16M4 12h6m4 0h6M4 18h16" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M12 4v16" />
    </>
  ),
  warning: <path fillRule="evenodd" clipRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-4a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1Zm0 9a1.125 1.125 0 1 0 0-2.25A1.125 1.125 0 0 0 10 15Z" />,
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
