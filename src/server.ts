import app from "./app";
import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { redis } from "./config/redis";
import { startDecayWorker } from "./workers/decayWorker";

async function main() {
  // Connect Redis
  await redis.connect();

  await prisma.$connect();
  console.log(" PostgreSQL connected");

  if (env.nodeEnv !== "test") {
    startDecayWorker();
  }

  const server = app.listen(env.port, () => {
    console.log(` RescueBite API running on http://localhost:${env.port}`);
    console.log(` Swagger UI: http://localhost:${env.port}/docs`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down...`);
    server.close(async () => {
      await prisma.$disconnect();
      await redis.quit();
      console.log(" Server closed");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(" Failed to start server:", err);
  process.exit(1);
});
