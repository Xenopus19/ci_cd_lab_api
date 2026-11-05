import request from "supertest";
import swaggerJsdoc from "swagger-jsdoc";
import { beforeEach, describe, expect, it, vi } from "vitest";

const model = vi.hoisted(() => ({
  findAll: vi.fn(),
  findByPk: vi.fn(),
  create: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("../models/cat", () => ({ getCatModel: () => model }));

import app from "../app";

const cat = { id: 1, name: "Whiskers", age: 3, color: "black" };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("cats router", () => {
  it("lists cats in ID order", async () => {
    model.findAll.mockResolvedValue([cat]);

    const response = await request(app).get("/api/cats");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([cat]);
    expect(model.findAll).toHaveBeenCalledWith({ order: [["id", "ASC"]] });
  });

  it("returns an empty list", async () => {
    model.findAll.mockResolvedValue([]);
    expect((await request(app).get("/api/cats")).body).toEqual([]);
  });

  it("creates a cat including a zero age", async () => {
    model.create.mockResolvedValue({ ...cat, age: 0 });

    const response = await request(app).post("/api/cats").send({ name: cat.name, age: 0, color: cat.color });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ ...cat, age: 0 });
    expect(model.create).toHaveBeenCalledWith({ name: cat.name, age: 0, color: cat.color });
  });

  it("gets a cat by numeric ID", async () => {
    model.findByPk.mockResolvedValue(cat);

    const response = await request(app).get("/api/cats/1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(cat);
    expect(model.findByPk).toHaveBeenCalledWith(1);
  });

  it("partially updates a cat", async () => {
    const savedCat = { ...cat, save: vi.fn().mockResolvedValue(undefined) };
    model.findByPk.mockResolvedValue(savedCat);

    const response = await request(app).put("/api/cats/1").send({ age: 4 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...cat, age: 4 });
    expect(savedCat.save).toHaveBeenCalledOnce();
  });

  it("allows an empty partial update", async () => {
    const savedCat = { ...cat, save: vi.fn().mockResolvedValue(undefined) };
    model.findByPk.mockResolvedValue(savedCat);
    const response = await request(app).put("/api/cats/1").send({});
    expect(response.status).toBe(200);
    expect(response.body).toEqual(cat);
  });

  it("documents partial updates and age bounds", () => {
    const spec = swaggerJsdoc({
      definition: { openapi: "3.0.0", info: { title: "Cats API", version: "1.0.0" } },
      apis: ["./src/controllers/catsController.ts"],
    });
    expect(spec).toMatchObject({
      paths: {
        "/api/cats/{id}": {
          put: {
            requestBody: {
              content: {
                "application/json": {
                  schema: { type: "object", properties: { age: { minimum: 0, maximum: 2147483647 } } },
                },
              },
            },
          },
        },
      },
    });
  });

  it("deletes a cat", async () => {
    model.destroy.mockResolvedValue(1);

    const response = await request(app).delete("/api/cats/1");

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(model.destroy).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it.each(["get", "put", "delete"] as const)("returns 404 for a missing cat on %s", async (method) => {
    model.findByPk.mockResolvedValue(null);
    model.destroy.mockResolvedValue(0);

    const response = await request(app)[method]("/api/cats/999");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "Cat not found" });
  });

  it.each(["abc", "0", "-1", "1.5", "2147483648", "Infinity"])(
    "returns 404 without querying for invalid ID %s",
    async (id) => {
      for (const method of ["get", "put", "delete"] as const) {
        const response = await request(app)[method](`/api/cats/${id}`);
        expect(response.status).toBe(404);
        expect(response.body).toEqual({ message: "Cat not found" });
      }
      expect(model.findByPk).not.toHaveBeenCalled();
      expect(model.destroy).not.toHaveBeenCalled();
    },
  );

  it("preserves the missing-field error", async () => {
    const response = await request(app).post("/api/cats").send({ name: "Whiskers", age: 3 });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "name, age and color are required" });
    expect(model.create).not.toHaveBeenCalled();
  });

  it.each([
    { name: 1 }, { name: {} }, { color: null }, { color: "" },
    { age: null }, { age: "3" }, { age: -1 }, { age: 1.5 }, { age: 2147483648 },
  ])("rejects invalid create and update fields: %o", async (invalid) => {
    const savedCat = { ...cat, save: vi.fn() };
    model.findByPk.mockResolvedValue(savedCat);
    const input = { name: cat.name, age: cat.age, color: cat.color, ...invalid };

    expect((await request(app).post("/api/cats").send(input)).status).toBe(400);
    expect((await request(app).put("/api/cats/1").send(invalid)).status).toBe(400);
    expect(model.create).not.toHaveBeenCalled();
    expect(savedCat.save).not.toHaveBeenCalled();
  });

  it("accepts the largest PostgreSQL integer age", async () => {
    model.create.mockResolvedValue({ ...cat, age: 2147483647 });
    const response = await request(app).post("/api/cats").send({ name: cat.name, age: 2147483647, color: cat.color });
    expect(response.status).toBe(201);
    expect(response.body.age).toBe(2147483647);
  });

  it.each(["list", "get", "create", "update", "delete"] as const)(
    "propagates a database failure in %s as HTTP 500",
    async (operation) => {
      const error = new Error("database unavailable");
      if (operation === "list") model.findAll.mockRejectedValue(error);
      if (operation === "get") model.findByPk.mockRejectedValue(error);
      if (operation === "create") model.create.mockRejectedValue(error);
      if (operation === "update") model.findByPk.mockResolvedValue({ ...cat, save: vi.fn().mockRejectedValue(error) });
      if (operation === "delete") model.destroy.mockRejectedValue(error);

      const response = operation === "list" ? await request(app).get("/api/cats")
        : operation === "get" ? await request(app).get("/api/cats/1")
        : operation === "create" ? await request(app).post("/api/cats").send(cat)
        : operation === "update" ? await request(app).put("/api/cats/1").send({ age: 4 })
        : await request(app).delete("/api/cats/1");

      expect(response.status).toBe(500);
    },
  );
});
