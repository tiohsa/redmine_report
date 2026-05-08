import { describe, expect, it } from 'vitest';
import { DENSITY_CONFIG } from '../shared';

describe('task details density config', () => {
  it('keeps compact smaller than standard', () => {
    expect(DENSITY_CONFIG.compact).toMatchObject({
      rowHeight: 'min-h-[30px]',
      headerHeight: 'h-8',
      subjectSize: 'text-[11px]',
      badgeSize: 'text-[9px]',
      iconSize: 'w-3 h-3',
      cellPadding: 'px-2',
      progressTextSize: 'text-[9px]',
      progressGap: 'gap-1.5',
      dateSize: 'text-[9px]',
      controlButtonSize: '!h-[20px] !w-[20px]',
      controlInputHeight: 'h-6',
      controlSelectHeight: 'h-6',
      controlPaddingX: 'px-1',
      badgePaddingX: 'px-2',
      badgePaddingY: 'py-0.5',
      progressInputWidth: 'w-[56px]',
      progressInputHeight: 'h-6',
      avatarSize: 'w-[20px] h-[20px]',
      statusMinWidth: 'min-w-[46px]'
    });

    expect(DENSITY_CONFIG.standard).toMatchObject({
      rowHeight: 'min-h-[40px]',
      subjectSize: 'text-[13px]',
      badgeSize: 'text-[10px]',
      progressTextSize: 'text-[11px]',
      dateSize: 'text-[10px]',
      cellPadding: 'px-3',
      progressGap: 'gap-2',
      headerHeight: 'h-11',
      iconSize: 'w-4 h-4',
      controlButtonSize: '!h-[22px] !w-[22px]',
      controlInputHeight: 'h-7',
      controlSelectHeight: 'h-7',
      controlPaddingX: 'px-1.5',
      badgePaddingX: 'px-2.5',
      badgePaddingY: 'py-0.5',
      progressInputWidth: 'w-[64px]',
      progressInputHeight: 'h-7',
      avatarSize: 'w-[22px] h-[22px]',
      statusMinWidth: 'min-w-[50px]'
    });
  });
});
