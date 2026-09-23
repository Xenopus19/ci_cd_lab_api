import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadApp() {
  vi.resetModules();
  const { default: app } = await import("../app");
  return app;
}

describe("cats router", () => {
  beforeEach(async () => {
    await loadApp();
  });

  it("returns an empty list for GET /api/cats", async () => {
    const app = await loadApp();

    const response = await request(app).get("/api/cats");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("creates a cat with POST /api/cats", async () => {
    const app = await loadApp();

    const response = await request(app).post("/api/cats").send({
      name: "Whiskers",
      age: 3,
      color: "black",
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: 1,
      name: "Whiskers",
      age: 3,
      color: "black",
    });
  });

  it("returns 404 for a missing cat", async () => {
    const app = await loadApp();

    const response = await request(app).get("/api/cats/999");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "Cat not found" });
  });
});
