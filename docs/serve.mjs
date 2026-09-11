// Static host for the bridge's public surfaces: status page, ops cockpit,
// animations, bridge map. Honest 404s — no SPA catch-all, so nothing that
// doesn't exist returns 200.
import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.static(here, { extensions: ["html"] }));
app.get("/", (_, res) => res.redirect("/status/"));
app.use((_, res) => res.status(404).json({ error: "not found" }));
app.listen(process.env.PORT || 8080, () =>
  console.log(`bridge docs on :${process.env.PORT || 8080}`));
