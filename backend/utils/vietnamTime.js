const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

function toVietnamISOString(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().replace("Z", "+07:00");
  }

  const shifted = new Date(date.getTime() + VIETNAM_UTC_OFFSET_MS);
  return shifted.toISOString().replace("Z", "+07:00");
}

function addHoursVietnamISOString(hours, fromDate = new Date()) {
  const base = fromDate instanceof Date ? fromDate : new Date(fromDate);
  return toVietnamISOString(new Date(base.getTime() + Number(hours || 0) * 60 * 60 * 1000));
}

function isSameDayVietnam(dateA, dateB = new Date()) {
  if (!dateA) return false;
  
  const d1 = new Date(dateA instanceof Date ? dateA.getTime() : new Date(dateA).getTime());
  const d2 = new Date(dateB instanceof Date ? dateB.getTime() : new Date(dateB).getTime());

  // Convert to Vietnam local components for comparison
  const v1 = new Date(d1.getTime() + VIETNAM_UTC_OFFSET_MS);
  const v2 = new Date(d2.getTime() + VIETNAM_UTC_OFFSET_MS);

  return (
    v1.getUTCFullYear() === v2.getUTCFullYear() &&
    v1.getUTCMonth() === v2.getUTCMonth() &&
    v1.getUTCDate() === v2.getUTCDate()
  );
}

module.exports = {
  toVietnamISOString,
  addHoursVietnamISOString,
  isSameDayVietnam,
};
