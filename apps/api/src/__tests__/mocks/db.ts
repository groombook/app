import { vi } from "vitest";

export const mockRows: Record<string, unknown[]> = {};

export function resetMock() {
  Object.keys(mockRows).forEach((key) => {
    mockRows[key] = [];
  });
}

function makeChainable(data: unknown[]): unknown {
  const arr = [...data];
  const chain = new Proxy(arr, {
    get(target, prop) {
      if (
        prop === "where" ||
        prop === "orderBy" ||
        prop === "limit" ||
        prop === "leftJoin" ||
        prop === "rightJoin" ||
        prop === "innerJoin"
      ) {
        return () => chain;
      }
      return target[prop as keyof typeof target];
    },
  });
  return chain;
}

function createTableProxy(tableName: string): unknown {
  return new Proxy(
    { _name: tableName },
    {
      get: (target, prop) =>
        prop === "_name" ? tableName : { table: tableName, column: prop },
    }
  );
}

const tables = [
  "user",
  "session",
  "account",
  "verification",
  "clients",
  "pets",
  "services",
  "staff",
  "recurringSeries",
  "appointmentGroups",
  "appointments",
  "invoices",
  "invoiceLineItems",
  "invoiceTipSplits",
  "refunds",
  "reminderLogs",
  "impersonationSessions",
  "impersonationAuditLogs",
  "conversations",
  "messages",
  "messageAttachments",
  "messageConsentEvents",
  "businessSettings",
  "groomingVisitLogs",
  "waitlistEntries",
  "authProviderConfig",
] as const;

type TableName = (typeof tables)[number];

const tableProxies: Record<TableName, unknown> = {} as Record<TableName, unknown>;

tables.forEach((table) => {
  tableProxies[table] = createTableProxy(table);
});

vi.mock("@groombook/db", () => ({
  getDb: () => ({
    select: () => ({
      from: (table: { _name: string }) => {
        const tableName = table._name as TableName;
        const rows = mockRows[tableName] || [];
        return makeChainable(rows);
      },
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => ({
        returning: () => [{ ...vals, id: "mock-id" }],
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => ({
          returning: () => [{ ...vals, id: "mock-id" }],
        }),
      }),
    }),
    delete: () => ({
      where: () => ({
        returning: () => [{ id: "mock-id" }],
      }),
    }),
  }),
  ...tableProxies,
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  ne: vi.fn(),
  gt: vi.fn(),
  gte: vi.fn(),
  lt: vi.fn(),
  lte: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
  ilike: vi.fn(),
  sql: vi.fn(),
  exists: vi.fn(),
  desc: vi.fn(),
  asc: vi.fn(),
  encryptSecret: vi.fn(),
  decryptSecret: vi.fn(),
  appointmentStatusEnum: ["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"],
  staffRoleEnum: ["groomer", "receptionist", "manager"],
  invoiceStatusEnum: ["draft", "pending", "paid", "void"],
  paymentMethodEnum: ["cash", "card", "check", "other"],
  clientStatusEnum: ["active", "disabled"],
  messagingChannelEnum: ["sms", "mms"],
  messageDirectionEnum: ["inbound", "outbound"],
  messageStatusEnum: ["queued", "sent", "delivered", "failed"],
}));
