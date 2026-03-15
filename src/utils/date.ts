export function parseDdMmYyyy(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const [day, month, year] = value.split(".");
  if (!day || !month || !year) {
    return null;
  }

  const iso = `${year}-${month}-${day}T00:00:00.000Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}
