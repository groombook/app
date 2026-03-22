import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ─── Mock data ────────────────────────────────────────────────────────────────

const ACTIVE_CLIENT = {
  id: "client-1",
  name: "Alice Johnson",
  email: "alice@example.com",
  phone: "555-1234",
};

const PET_ROW = {
  id: "pet-1",
  name: "Bella",
  breed: "Golden Retriever",
  clientId: "client-1",
  ownerName: "Alice Johnson",
};

// ─── Mock DB ──────────────────────────────────────────────────────────────────

let clientResults: typeof ACTIVE_CLIENT[] = [];
let petResults: typeof PET_ROW[] = [];

vi.mock("@groombook/db", () => {
  // Proxy objects for table/column references — values don't matter for tests
  const tableProxy = (name: string) =>
    new Proxy(
      { _name: name },
      { get: (t, p) => (p === "_name" ? name : { table: name, column: p }) }
    );

  const clients = tableProxy("clients");
  const pets = tableProxy("pets");

  return {
    getDb: () => ({
      select: (_fields?: unknown) => {
        // Route which mock results to use based on a global flag set per test
        return {
          from: (table: { _name?: string }) => {
            const results = table._name === "pets" ? petResults : clientResults;
            const chain: Record<string, unknown> = {};
            chain.where = () => chain;
            chain.innerJoin = () => chain;
            chain.limit = () => Promise.resolve(results);
            return chain;
          },
        };
      },
    }),
    clients,
    pets,
    and: (...args: unknown[]) => ({ and: args }),
    or: (...args: unknown[]) => ({ or: args }),
    eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
    ilike: (col: unknown, pat: unknown) => ({ ilike: [col, pat] }),
  };
});

// ─── App under test ───────────────────────────────────────────────────────────

async function makeApp() {
  const { searchRouter } = await import("../routes/search.js");
  const app = new Hono();
  app.route("/search", searchRouter);
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules();
  clientResults = [];
  petResults = [];
});

describe("GET /search", () => {
  it("returns 400 when q is missing", async () => {
    const app = await makeApp();
    const res = await app.request("/search");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when q is empty string", async () => {
    const app = await makeApp();
    const res = await app.request("/search?q=");
    expect(res.status).toBe(400);
  });

  it("returns 400 when q is only whitespace", async () => {
    const app = await makeApp();
    const res = await app.request("/search?q=   ");
    expect(res.status).toBe(400);
  });

  it("returns matching clients and pets", async () => {
    clientResults = [ACTIVE_CLIENT];
    petResults = [PET_ROW];

    const app = await makeApp();
    const res = await app.request("/search?q=bell");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clients).toEqual([ACTIVE_CLIENT]);
    expect(body.pets).toEqual([PET_ROW]);
  });

  it("returns empty arrays when no matches", async () => {
    clientResults = [];
    petResults = [];

    const app = await makeApp();
    const res = await app.request("/search?q=xyzzy");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clients).toEqual([]);
    expect(body.pets).toEqual([]);
  });

  it("returns shape with clients and pets keys", async () => {
    const app = await makeApp();
    const res = await app.request("/search?q=a");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("clients");
    expect(body).toHaveProperty("pets");
    expect(Array.isArray(body.clients)).toBe(true);
    expect(Array.isArray(body.pets)).toBe(true);
  });

  it("handles special characters in query without throwing", async () => {
    clientResults = [];
    petResults = [];

    const app = await makeApp();
    // These characters should be escaped, not cause errors
    const res = await app.request("/search?q=foo%25bar_baz");
    expect(res.status).toBe(200);
  });
});

describe("escapeLike helper (via integration)", () => {
  it("% in query does not break the request", async () => {
    clientResults = [];
    petResults = [];
    const app = await makeApp();
    const res = await app.request("/search?q=%25");
    expect(res.status).toBe(200);
  });

  it("_ in query does not break the request", async () => {
    clientResults = [];
    petResults = [];
    const app = await makeApp();
    const res = await app.request("/search?q=_");
    expect(res.status).toBe(200);
  });
});
