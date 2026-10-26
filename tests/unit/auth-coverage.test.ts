import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Structural guard rails: if someone adds a Server Action, API route or page and forgets to authenticate, these fail.
 * They read the source, so they are deliberately simple and strict.
 */
const read = (p: string) => readFileSync(p, "utf8");

function exportedFunctions(src: string): { name: string; body: string }[] {
  const re = /export (?:async )?function (\w+)\s*\(/g;
  const starts = [...src.matchAll(re)].map((m) => ({ name: m[1], index: m.index! }));
  return starts.map((s, i) => ({ name: s.name, body: src.slice(s.index, starts[i + 1]?.index ?? src.length) }));
}

describe("every Server Action authenticates the caller", () => {
  const files = globSync("src/app/**/actions.ts");
  it("finds the action files", () => expect(files.length).toBeGreaterThanOrEqual(8));

  for (const file of files) {
    for (const fn of exportedFunctions(read(file))) {
      it(`${file} :: ${fn.name} calls userOrLogin()`, () => {
        const direct = /userOrLogin\(/.test(fn.body);
        // Some actions delegate to a local run() helper; that helper must itself call userOrLogin().
        const viaRun = /\brun\(/.test(fn.body) && /async function run\([^)]*\)[^{]*\{[\s\S]*?userOrLogin\(/.test(read(file));
        expect(direct || viaRun).toBe(true);
      });
    }
  }

  it("no action file rolls its own auth helper", () => {
    for (const file of files) expect(read(file), file).not.toMatch(/async function userOrLogin|requireUserId\(/);
  });
});

describe("every private API route goes through handle()", () => {
  // The auth library and the cron job authenticate in their own way (tested separately). /api/health is public on purpose.
  const files = globSync("src/app/api/**/route.ts").filter((f) => !f.includes("/api/auth/") && !f.includes("/api/cron/") && !f.includes("/api/health/"));
  it("finds the routes", () => expect(files.length).toBeGreaterThanOrEqual(3));
  for (const file of files) {
    for (const fn of exportedFunctions(read(file))) {
      it(`${file} :: ${fn.name} uses handle()`, () => {
        expect(fn.body).toMatch(/handle\(/);
      });
    }
  }
  it("state-changing methods declare mutating: true", () => {
    for (const file of files) {
      for (const fn of exportedFunctions(read(file))) {
        const mutating = ["POST", "PATCH", "PUT", "DELETE"].includes(fn.name);
        expect(fn.body, `${file} ${fn.name}`).toMatch(mutating ? /mutating: true/ : /mutating: false/);
      }
    }
  });
});

describe("the one public operational endpoint stays minimal", () => {
  const src = read("src/app/api/health/route.ts");
  it("answers only ok/not-ok and never touches user data", () => {
    expect(src).not.toMatch(/userId|requireUserId|transactions|session/);
    expect(src).toMatch(/select 1/);
    expect(src.match(/NextResponse\.json\(/g)).toHaveLength(2);
    expect(src).toMatch(/\{ ok: true \}/);
    expect(src).toMatch(/\{ ok: false \}/);
  });
});

describe("every page in the signed-in area authenticates before reading data", () => {
  const pages = globSync("src/app/(app)/**/page.tsx");
  it("finds the pages", () => expect(pages.length).toBeGreaterThanOrEqual(20));
  // Static forms that read no user data. Their actions authenticate (tested above) and the layout redirects.
  const NO_DATA = new Set(["src/app/(app)/goals/new/page.tsx", "src/app/(app)/transactions/import/page.tsx"]);
  for (const page of pages) {
    it(`${page}`, () => {
      if (NO_DATA.has(page)) {
        expect(read(page)).not.toMatch(/from "@\/server\/(?!import|domain)/); // must not read user data from services
        return;
      }
      expect(read(page)).toMatch(/requireUserId\(|getSessionUser\(/);
    });
  }
  it("the (app) layout redirects signed-out users", () => {
    expect(read("src/app/(app)/layout.tsx")).toMatch(/redirect\("\/login"\)/);
  });
});

describe("no unsafe rendering or evaluation", () => {
  it("never uses dangerouslySetInnerHTML, eval or new Function in source", () => {
    for (const f of globSync("src/**/*.{ts,tsx}")) {
      expect(read(f), f).not.toMatch(/dangerouslySetInnerHTML|\beval\(|new Function\(/);
    }
  });
  it("only one raw SQL fragment exists and it takes a fixed day/month value", () => {
    const raw = globSync("src/**/*.{ts,tsx}").filter((f) => /sql\.raw\(/.test(read(f)));
    expect(raw).toEqual(["src/server/analytics.ts"]);
    expect(read("src/server/analytics.ts")).toMatch(/gran: "day" \| "month"/);
  });
});
