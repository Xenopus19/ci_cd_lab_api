import { Sequelize } from "sequelize";

let connection: Sequelize | undefined;

export function getSequelize(): Sequelize {
  if (!connection) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is required");
    }
    let protocol: string;
    try {
      protocol = new URL(url).protocol;
    } catch {
      throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
    }
    if (protocol !== "postgres:") {
      throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
    }
    connection = new Sequelize(url, { dialect: "postgres", logging: false });
  }
  return connection;
}
