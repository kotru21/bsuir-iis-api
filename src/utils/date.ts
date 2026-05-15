export function parseDdMmYyyy(value: string | null): Date | null {
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
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}
