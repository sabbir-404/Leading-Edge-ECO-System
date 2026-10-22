/**
 * workingDays.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized Working-Day and Business-Calendar Calculation Helpers for MAKE.
 *
 * Business Calendar Convention:
 * Leading Edge operations run on a standard 6-day manufacturing work week
 * (Saturday through Thursday) with Friday as the primary non-working weekly
 * weekend. This matches the established HRM Holiday calendar convention
 * in `src/pages/HRM/HRMHolidays.tsx` (`isFri`), where Friday is designated as
 * the weekly weekend.
 *
 * Timezone-Safety:
 * All date arithmetic is performed using pure UTC calendar math (UTC midnight/noon)
 * to avoid daylight saving time (DST) shifts, local timezone offsets, and off-by-one errors.
 */

/** Default weekly non-working days: 5 = Friday (0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat) */
export const DEFAULT_NON_WORKING_DAYS = [5] as const;

/** Maximum working days allowed to prevent excessive computation or overflow */
export const MAX_WORKING_DAYS = 3650; // 10 years

export interface WorkingDayCalcResult {
  dateStr: string | null;
  formattedDisplay: string;
  error?: string;
}

/**
 * Checks if a given day-of-week index (0=Sunday ... 6=Saturday) is a working day.
 */
export function isWorkingDay(dayOfWeek: number, nonWorkingDays: readonly number[] = DEFAULT_NON_WORKING_DAYS): boolean {
  return !nonWorkingDays.includes(dayOfWeek);
}

/**
 * Formats a UTC Date to YYYY-MM-DD string.
 */
export function toYmdString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns today's date formatted as YYYY-MM-DD.
 */
export function getTodayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses a YYYY-MM-DD (or ISO timestamp) string into a safe UTC Date object at noon UTC.
 * Setting time to 12:00:00 UTC eliminates potential midnight edge transitions.
 */
export function parseYmdToUtc(dateInput?: string | null): Date {
  if (!dateInput || typeof dateInput !== 'string') {
    return parseYmdToUtc(getTodayYmd());
  }
  const cleanDate = dateInput.split('T')[0].trim();
  const parts = cleanDate.split('-').map(p => parseInt(p, 10));
  if (parts.length !== 3 || parts.some(isNaN) || parts[0] < 1970 || parts[1] < 1 || parts[1] > 12 || parts[2] < 1 || parts[2] > 31) {
    return parseYmdToUtc(getTodayYmd());
  }
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
}

/**
 * Formats a Date into a human-readable display string, e.g. "25 Oct 2026 (Sun)".
 */
export function formatWorkingDateDisplay(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayName = days[date.getUTCDay()];
  const dayNum = date.getUTCDate();
  const monthName = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${dayNum} ${monthName} ${year} (${dayName})`;
}

/**
 * Calculates a future calendar date by adding N working days to a base date.
 * Excludes weekly non-working days (default: Friday).
 *
 * @param startDateStr Base date (e.g. order placement date 'YYYY-MM-DD'). Defaults to today.
 * @param daysInput Number of working days (whole integer > 0).
 * @param nonWorkingDays Array of day-of-week indices to skip (default: [5] = Friday).
 */
export function calculateDeliveryDateFromWorkingDays(
  startDateStr: string | undefined | null,
  daysInput: number | string | undefined | null,
  nonWorkingDays: readonly number[] = DEFAULT_NON_WORKING_DAYS
): WorkingDayCalcResult {
  if (daysInput === undefined || daysInput === null || daysInput === '') {
    return { dateStr: null, formattedDisplay: '' };
  }

  const strVal = String(daysInput).trim();
  if (strVal === '') {
    return { dateStr: null, formattedDisplay: '' };
  }

  // Validate whole number integer
  const num = Number(strVal);
  if (isNaN(num)) {
    return { dateStr: null, formattedDisplay: '', error: 'Working days must be a valid number.' };
  }

  if (!Number.isInteger(num)) {
    return { dateStr: null, formattedDisplay: '', error: 'Working days must be a whole integer.' };
  }

  if (num <= 0) {
    return { dateStr: null, formattedDisplay: '', error: 'Working days must be greater than zero.' };
  }

  if (num > MAX_WORKING_DAYS) {
    return { dateStr: null, formattedDisplay: '', error: `Working days cannot exceed ${MAX_WORKING_DAYS.toLocaleString()} days.` };
  }

  const current = parseYmdToUtc(startDateStr);
  let addedDays = 0;

  while (addedDays < num) {
    current.setUTCDate(current.getUTCDate() + 1);
    const dow = current.getUTCDay();
    if (isWorkingDay(dow, nonWorkingDays)) {
      addedDays++;
    }
  }

  const dateStr = toYmdString(current);
  const formattedDisplay = formatWorkingDateDisplay(current);

  return { dateStr, formattedDisplay };
}

/**
 * Calculates the number of working days between two dates.
 * Useful when reopening an existing order with a stored delivery date.
 *
 * @param startDateStr Base date (e.g. order placement date 'YYYY-MM-DD').
 * @param endDateStr Target/Requested delivery date 'YYYY-MM-DD'.
 * @param nonWorkingDays Array of day-of-week indices to skip (default: [5] = Friday).
 */
export function calculateWorkingDaysBetween(
  startDateStr: string | undefined | null,
  endDateStr: string | undefined | null,
  nonWorkingDays: readonly number[] = DEFAULT_NON_WORKING_DAYS
): number {
  if (!startDateStr || !endDateStr) return 0;

  const start = parseYmdToUtc(startDateStr);
  const end = parseYmdToUtc(endDateStr);

  if (end.getTime() <= start.getTime()) return 0;

  let count = 0;
  const current = new Date(start.getTime());

  // Cap loop to prevent runaway computation on invalid dates
  let loopSafety = 0;
  while (current.getTime() < end.getTime() && loopSafety < 10000) {
    loopSafety++;
    current.setUTCDate(current.getUTCDate() + 1);
    const dow = current.getUTCDay();
    if (isWorkingDay(dow, nonWorkingDays)) {
      count++;
    }
  }

  return count;
}
