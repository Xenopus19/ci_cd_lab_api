"use strict";

const { Sequelize } = require("sequelize");

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required");
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
}
if (parsed.protocol !== "postgres:") {
  throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
}

const sequelize = new Sequelize(url, { logging: false });
const { database, username, password, host, port, dialectOptions } = sequelize.config;
const config = { database, username, password, host, port, dialectOptions, dialect: "postgres", logging: false };

module.exports = { development: config, test: config, production: config };
