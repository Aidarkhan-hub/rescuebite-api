import dotenv from "dotenv";
dotenv.config();
import "./config/env";

import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes";
import foodRoutes from "./routes/food.routes";
import { errorHandler } from "./middleware/errorHandler";
import { env } from "./config/env";

const app = express();

app.use(cors({
  origin: env.nodeEnv === "production" ? env.corsOrigin : "*",
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/food", foodRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use(errorHandler);

export default app;