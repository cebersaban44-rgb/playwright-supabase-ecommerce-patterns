import { test as setup } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// PATTERN: role-based storage state.
// Log in once per role in a `setup` project, save the authenticated session, and
// reuse it across the suite via `test.use({ storageState })`. The chromium project
// depends on this setup project, so the states are always fresh per run.
//
// Two non-obvious lessons baked in:
//  1. Wait for an EXACT pathname after login, not a regex. A regex like /\/admin/
//     also matches /admin/login, so the state can be saved before login completes.
//  2. Run the logins SERIALLY. Parallel logins can race on the auth cookie / SSR
//     refresh and intermittently fail with a false "wrong password".

const USERS = {
  customer: { email: "customer@example.test" },
  dealer: { email: "dealer@example.test" },
  admin: { email: "admin@example.test", admin: true },
} as const;

export const STORAGE_STATE = {
  customer: "e2e/.auth/customer.json",
  dealer: "e2e/.auth/dealer.json",
  admin: "e2e/.auth/admin.json",
} as const;

const PASSWORD = process.env.E2E_USER_PASSWORD ?? "";

setup.describe.configure({ mode: "serial" });

function ensureDir(path: string): string {
  const absolute = resolve(process.cwd(), path);
  mkdirSync(dirname(absolute), { recursive: true });
  return absolute;
}

async function loginViaUi(
  page: import("@playwright/test").Page,
  email: string,
  isAdmin = false,
): Promise<void> {
  await page.goto(isAdmin ? "/admin/login" : "/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Exact pathname, not a regex (see lesson #1 above).
  await page.waitForURL(
    (url) => (isAdmin ? url.pathname === "/admin" : url.pathname.startsWith("/account")),
    { timeout: 20_000 },
  );
}

for (const [role, info] of Object.entries(USERS)) {
  setup(`${role} storage state`, async ({ page }) => {
    await loginViaUi(page, info.email, "admin" in info && info.admin);
    await page.context().storageState({
      path: ensureDir(STORAGE_STATE[role as keyof typeof STORAGE_STATE]),
    });
  });
}
