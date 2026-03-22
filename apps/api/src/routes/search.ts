import { Hono } from "hono";
import { and, eq, getDb, clients, ilike, or, pets } from "@groombook/db";

export const searchRouter = new Hono();

const LIMIT = 10;

/** Escape %, _, and \ in user input before wrapping with ILIKE wildcards. */
function escapeLike(s: string): string {
  return `%${s.replace(/[%_\\]/g, "\\$&")}%`;
}

/**
 * GET /api/search?q={query}
 *
 * Returns up to 10 matching active clients and up to 10 matching pets.
 * Clients are matched on name, email, or phone.
 * Pets are matched on name or breed; includes owner name.
 */
searchRouter.get("/", async (c) => {
  const q = c.req.query("q");
  if (!q || q.trim().length === 0) {
    return c.json({ error: "Query parameter q is required" }, 400);
  }

  const pattern = escapeLike(q.trim());
  const db = getDb();

  const [matchingClients, matchingPets] = await Promise.all([
    db
      .select({
        id: clients.id,
        name: clients.name,
        email: clients.email,
        phone: clients.phone,
      })
      .from(clients)
      .where(
        and(
          eq(clients.status, "active"),
          or(
            ilike(clients.name, pattern),
            ilike(clients.email, pattern),
            ilike(clients.phone, pattern)
          )
        )
      )
      .limit(LIMIT),

    db
      .select({
        id: pets.id,
        name: pets.name,
        breed: pets.breed,
        clientId: pets.clientId,
        ownerName: clients.name,
      })
      .from(pets)
      .innerJoin(clients, and(eq(pets.clientId, clients.id), eq(clients.status, "active")))
      .where(
        or(
          ilike(pets.name, pattern),
          ilike(pets.breed, pattern)
        )
      )
      .limit(LIMIT),
  ]);

  return c.json({ clients: matchingClients, pets: matchingPets });
});
