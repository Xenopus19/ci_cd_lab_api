import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { DataTypes } from "sequelize";
import { getCatModel } from "../models/cat";

const require = createRequire(import.meta.url);
const migration = require("../../database/migrations/20261105000000-create-cats.cjs");

describe("cat database configuration", () => {
  it("uses DATABASE_URL and its SSL options in each CLI environment", () => {
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test?sslmode=verify-full");
    try {
      const config = require("../../config/database.cjs");
      for (const environment of ["development", "test", "production"]) {
        expect(config[environment]).toMatchObject({
          database: "test",
          host: "localhost",
          dialect: "postgres",
          dialectOptions: { ssl: expect.any(Object) },
        });
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("creates and removes the cats table with fields matching the model", async () => {
    const queryInterface = { createTable: vi.fn(), dropTable: vi.fn() };
    await migration.up(queryInterface, DataTypes);
    expect(queryInterface.createTable).toHaveBeenCalledWith("cats", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.TEXT, allowNull: false },
      age: { type: DataTypes.INTEGER, allowNull: false },
      color: { type: DataTypes.TEXT, allowNull: false },
    });
    await migration.down(queryInterface);
    expect(queryInterface.dropTable).toHaveBeenCalledWith("cats");
  });

  it("defines the model without timestamps or extra response attributes", () => {
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
    try {
      const model = getCatModel();
      expect(model.tableName).toBe("cats");
      expect(model.options.timestamps).toBe(false);
      expect(Object.keys(model.getAttributes())).toEqual(["id", "name", "age", "color"]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
