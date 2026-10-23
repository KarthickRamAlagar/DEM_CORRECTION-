export const sdgController = (sdg) => (path) => async (req, res) => {
  const r = await sdg.fetch(path, req.validQuery);
  res.status(r.status).set("Content-Type", r.type).set("X-Cache", r.cached ? "HIT" : "MISS").send(r.body);
};
