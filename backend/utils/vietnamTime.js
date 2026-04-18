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

module.exports = {
  toVietnamISOString,
  addHoursVietnamISOString,
};
