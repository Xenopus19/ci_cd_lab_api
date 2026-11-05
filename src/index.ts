import app from "./app";
import { getSequelize } from "./database/sequelize";

const PORT = process.env.PORT || 3000;

async function start(): Promise<void> {
  await getSequelize().authenticate();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

start().catch((error: unknown) => {
  console.error("Failed to connect to PostgreSQL:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});