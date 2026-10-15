import { DAYS, MONTHS } from './constants';

export const isoDate = (now: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

// The pane's greeting for an hour of the day (0 to 23).
export const greeting = (hour: number): string =>
  hour >= 5 && hour < 12
    ? 'Good morning'
    : hour >= 12 && hour < 18
      ? 'Good afternoon'
      : 'Good evening';

// "Thursday, 8 October".
export const dateLine = (date: Date): string =>
  `${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;

// HH:MM in local time.
export const clockTime = (ms: number): string => {
  const time = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(time.getHours())}:${pad(time.getMinutes())}`;
};
