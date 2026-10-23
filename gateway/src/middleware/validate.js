// Checks req.query against a Zod schema and replaces it with the cleaned values.
export const validateQuery = (schema) => (req, res, next) => {
  const r = schema.safeParse(req.query);
  if (!r.success) return res.status(400).json({ error: "Invalid request", detail: r.error.issues.map((i) => `${i.path.join(".") || "query"}: ${i.message}`), request_id: req.id });
  req.validQuery = r.data;
  next();
};
