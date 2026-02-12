const DAY_MS = 24 * 60 * 60 * 1000;

export const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);

export const endOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth() + 1, 0);

export const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const differenceInCalendarDays = (left: Date, right: Date): number => {
  const leftStart = startOfDay(left).getTime();
  const rightStart = startOfDay(right).getTime();
  return Math.floor((leftStart - rightStart) / DAY_MS);
};

export const formatMonthYear = (date: Date): string => {
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${month} ${date.getFullYear()}`;
};

export const intersectsInterval = (
  startDate: Date,
  endDate: Date,
  intervalStart: Date,
  intervalEnd: Date
): boolean => {
  return startDate <= intervalEnd && endDate >= intervalStart;
};
