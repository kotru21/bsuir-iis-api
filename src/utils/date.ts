export interface DdMmYyyyParts {
  day: number;
  month: number;
  year: number;
}

/**
 * Parses a BSUIR `dd.mm.yyyy` date string into numeric parts.
 * Returns `null` for missing, malformed, or impossible calendar dates.
 */
export function parseDdMmYyyyParts(value: string | null): DdMmYyyyParts | null {
  if (!value) {
    return null;
  }
  const matched = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!matched) {
    return null;
  }
  const [, dayPart, monthPart, yearPart] = matched;
  const day = Number(dayPart);
  const month = Number(monthPart);
  const year = Number(yearPart);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return null;
  }
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }
  return { day, month, year };
}

/**
 * Parses a BSUIR `dd.mm.yyyy` date string into a UTC midnight `Date`.
 * Returns `null` for missing, malformed, or impossible calendar dates.
 */
export function parseDdMmYyyy(value: string | null): Date | null {
  const parts = parseDdMmYyyyParts(value);
  if (!parts) {
    return null;
  }
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}
