function validateIngestPayload(payload = {}) {
  const invalidFields = [];

  if (payload.salinity <= 0 || !Number.isFinite(payload.salinity)) {
    invalidFields.push("salinity (must be > 0)");
  }

  if (payload.moisture <= 0 || payload.moisture > 100 || !Number.isFinite(payload.moisture)) {
    invalidFields.push("moisture (must be 1-100)");
  }

  for (const [key, val] of Object.entries(payload)) {
    if (typeof val === "number" && val < 0 && key !== "river_water_level") {
      invalidFields.push(`${key} (negative error code detected)`);
    }
  }

  return {
    ok: invalidFields.length === 0,
    invalidFields,
  };
}

module.exports = {
  validateIngestPayload,
};
