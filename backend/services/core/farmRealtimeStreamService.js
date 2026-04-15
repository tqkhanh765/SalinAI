async function streamFarmState(req, res, options) {
  const { rootRef, buildPayload } = options;
  const limit = Math.min(Math.max(Number(req.query.logLimit || 20), 1), 100);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (res.flushHeaders) {
    res.flushHeaders();
  }

  const send = (eventName, payload) => {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const onRootValue = async (snapshot) => {
    try {
      const root = snapshot.val() || {};
      const payload = await buildPayload(root, limit);
      send("farm_state", payload);
    } catch (error) {
      send("error", { error: "Stream payload build failed", details: error.message });
    }
  };

  const onRootError = (error) => {
    send("error", { error: "Stream listener failed", details: error.message });
  };

  rootRef.on("value", onRootValue, onRootError);

  const heartbeat = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    rootRef.off("value", onRootValue);
    res.end();
  });
}

module.exports = {
  streamFarmState,
};
