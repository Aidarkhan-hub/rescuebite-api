import dotenv from "dotenv";
dotenv.config();
import "./config/env"; // validates env on startup — exits if invalid

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import path from "path";

import authRoutes from "./routes/auth.routes";
import foodRoutes from "./routes/food.routes";
import adminRoutes from "./routes/admin.routes";
import { errorHandler } from "./middleware/errorHandler";
import { env } from "./config/env";

const app = express();

// ─── Security & logging ───────────────────────────────────────────────────────
app.use(helmet());
app.use(compression());
if (env.nodeEnv !== "test") {
  app.use(morgan("combined"));
}

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: env.nodeEnv === "production" ? env.corsOrigin : "*",
    credentials: true,
  })
);

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Swagger ──────────────────────────────────────────────────────────────────
const swaggerDocument = YAML.load(path.join(__dirname, "../openapi.yaml"));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/v1/auth",  authRoutes);
app.use("/api/v1/food",  foodRoutes);
app.use("/api/v1/admin", adminRoutes);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

export default app;