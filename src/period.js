export function inferPeriod(source, fallback = {}) {
  const value = String(source ?? "");
  const match = /(\d{2,4})\s*年\s*(\d{1,2})\s*月/.exec(value);
  const now = new Date();
  const writtenYear = match ? Number(match[1]) : 0;
  return {
    year: writtenYear ? (writtenYear < 1911 ? writtenYear + 1911 : writtenYear) : (fallback.year || now.getFullYear()),
    month: match ? Number(match[2]) : (fallback.month || now.getMonth() + 1)
  };
}
