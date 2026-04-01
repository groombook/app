import { test as base, Page, Browser, BrowserContext } from "@playwright/test";
import path from "path";
import fs from "fs";

const STAFF_STORAGE = path.join(process.cwd(), ".auth/staff.json");
const CLIENT_STORAGE = path.join(process.cwd(), ".auth/client.json");

/**
 * Authenticates as a staff user via the dev login selector and saves storage state.
 */
async function authenticateStaff(browser: Browser): Promise<string> {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/login");

  // Click "Alice Groomer" (first staff user)
  const alice = page.getByText("Alice Groomer");
  if (await alice.isVisible({ timeout: 5000 })) {
    await alice.click();
  } else {
    // Fallback: click any staff user
    await page.getByText(/groomer|manager/i).first().click();
  }

  await page.waitForURL(/\/(admin|portal)/, { timeout: 10000 });

  const storageState = await context.storageState();
  await context.close();
  return JSON.stringify(storageState);
}

/**
 * Authenticates as a client via the dev login selector and saves storage state.
 */
async function authenticateClient(browser: Browser): Promise<string> {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/login");

  // Click "Carol Client" (first client user)
  const carol = page.getByText("Carol Client");
  if (await carol.isVisible({ timeout: 5000 })) {
    await carol.click();
  } else {
    // Fallback: click any client user
    await page.getByText(/\d+ pets?/i).first().click();
  }

  await page.waitForURL(/\//, { timeout: 10000 });
  await page.waitForLoadState("networkidle");

  const storageState = await context.storageState();
  await context.close();
  return JSON.stringify(storageState);
}

export type UserType = "staff" | "client";

/**
 * Returns the storage state file path for the given user type.
 * Creates the auth file if it doesn't exist.
 */
async function getStorageState(browser: Browser, userType: UserType): Promise<string> {
  const filePath = userType === "staff" ? STAFF_STORAGE : CLIENT_STORAGE;
  const dir = path.dirname(filePath);

  if (!fs.existsSync(filePath)) {
    const state =
      userType === "staff"
        ? await authenticateStaff(browser)
        : await authenticateClient(browser);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, state);
  }

  return filePath;
}

/**
 * Custom test fixture that provides an authenticated page for E2E tests.
 * Automatically handles login via the dev login selector.
 *
 * Usage:
 *   test("my test", async ({ staffPage }) => { ... });   // staff user
 *   test("my test", async ({ clientPage }) => { ... });  // client user
 */
export const test = base.extend<{
  staffPage: Page;
  clientPage: Page;
}>({
  staffPage: async ({ browser }, use, workerInfo): Promise<void> => {
    const storageStatePath = await getStorageState(browser, "staff");
    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  clientPage: async ({ browser }, use, workerInfo): Promise<void> => {
    const storageStatePath = await getStorageState(browser, "client");
    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";