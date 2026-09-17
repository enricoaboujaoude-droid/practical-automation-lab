import compression from "compression";
import express from "express";
import morgan from "morgan";
import { createRequestHandler } from "@react-router/express";
import * as build from "./build/server/index.js";
import { sanitizeRequestTarget } from "./server-logging.mjs";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const mode = process.env.NODE_ENV || "production";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(compression());

app.use(
  "/assets",
  express.static("build/client/assets", {
    immutable: true,
    maxAge: "1y",
  }),
);
app.use(express.static("build/client", { maxAge: "1h" }));
app.use(express.static("public", { maxAge: "1h" }));

morgan.token("safe-url", (req) =>
  sanitizeRequestTarget(req.originalUrl || req.url || "/"),
);
app.use(
  morgan(":method :safe-url :status :res[content-length] - :response-time ms"),
);

app.all(
  "/{*splat}",
  createRequestHandler({
    build,
    mode,
  }),
);

app.listen(port, host, () => {
  console.log(`[pal-shopify] listening on ${host}:${port}`);
});
