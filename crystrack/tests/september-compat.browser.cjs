const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, ".."),
  out =
    process.env.CRYSTRACK_SCREENSHOT_DIR ||
    path.join(root, "docs/screenshots/september-compatibility"),
  temp = fs.mkdtempSync(require("node:os").tmpdir() + "/crys-compat-ui-"),
  bundle = path.join(temp, "app.js"),
  css = path.join(temp, "style.css");
fs.mkdirSync(out, { recursive: true });
const pages = {
    "/": "page",
    "/plan": "plan/page",
    "/finance": "finance/page",
    "/auth": "auth/page",
  },
  uid = "00000000-0000-4000-8000-000000000001",
  id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  stamp = new Date().toISOString(),
  day = stamp.slice(0, 10);
const tasks = [
  {
    id: id(1),
    title: "Review course notes",
    category: "Learning",
    active: true,
    scheduled_today: true,
    today_status: "pending",
    preferred_time: "10:00",
    task_schedules: [{ weekday: new Date().getDay() }],
    task_occurrences: [],
    streak: 2,
  },
];
const goals = [
  {
    id: id(2),
    title: "Build a steady reading practice",
    status: "active",
    progress_mode: "percentage",
    measurable: true,
    starting_value: 0,
    target_value: 20,
    progress_value: 6,
    progress_unit: "chapters",
    goal_checkins: [],
    checkin_config: { frequency: "daily" },
    created_at: stamp,
  },
];
const assignments = [
  {
    id: id(3),
    title: "Coursework review",
    deadline: day + "T23:00:00Z",
    status: "pending",
    priority: "medium",
    reminder_config: { enabled: true },
  },
];
const entries = [
  {
    id: id(4),
    user_id: uid,
    type: "income",
    flow_kind: "income",
    amount: "25000.00",
    date: stamp,
    source: "Fixture income",
    category: "Work",
  },
  {
    id: id(5),
    user_id: uid,
    type: "expense",
    flow_kind: "expense",
    amount: "2500.00",
    date: stamp,
    category: "Food",
    source: "Fixture expense",
  },
];
let preference = "dark";
const writes = [],
  errors = [];
async function main() {
  const imports = Object.entries(pages)
    .map(([p, f], i) => `import P${i} from '${root}/src/app/${f}.tsx';`)
    .join("");
  await require(root + "/node_modules/esbuild").build({
    stdin: {
      contents: `import React from 'react';import{createRoot}from'react-dom/client';import{AppLayout}from'${root}/src/components/layout/app-layout.tsx';import{ThemeProvider}from'${root}/src/components/layout/theme-provider.tsx';${imports}const pages={${Object.keys(
        pages,
      )
        .map((p, i) => JSON.stringify(p) + ":P" + i)
        .join(
          ",",
        )}};const Page=pages[location.pathname]||pages['/'];createRoot(document.getElementById('root')).render(<ThemeProvider><AppLayout><Page/></AppLayout></ThemeProvider>);`,
      resolveDir: root,
      loader: "tsx",
    },
    bundle: true,
    outfile: bundle,
    alias: { "@": root + "/src" },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "fixture-adapters",
        setup(build) {
          for (const [filter, p] of [
            [/next\/navigation$/, "navigation"],
            [/next\/link$/, "link"],
            [/next\/image$/, "image"],
            [/auth-provider$/, "auth"],
            [/lib\/supabase\/client$/, "supabase"],
          ])
            build.onResolve({ filter }, () => ({
              path: p,
              namespace: "fixture",
            }));
          build.onLoad(
            { filter: /.*/, namespace: "fixture" },
            ({ path: p }) => ({
              loader: "tsx",
              resolveDir: root,
              contents:
                p === "auth"
                  ? `export const useAuth=()=>({user:{id:'${uid}',email:'recovery-fixture@example.test',user_metadata:{full_name:'Recovery Test'}},loading:false,signOut:async()=>{}});`
                  : p === "supabase"
                    ? `export const createClient=()=>({auth:{signInWithPassword:async()=>({error:null}),signUp:async()=>({error:null})}});`
                    : p === "link"
                      ? `import React from'react';export default function Link({children,...props}){return <a {...props}>{children}</a>;}`
                      : p === "image"
                        ? `import React from'react';export default function Image({unoptimized,priority,...props}){return <img {...props}/>;}`
                        : `import React from'react';export const usePathname=()=>location.pathname;export const useSearchParams=()=>React.useMemo(()=>new URLSearchParams(location.search),[]);export const useRouter=()=>({push:p=>location.assign(p),replace:p=>location.replace(p)});`,
            }),
          );
        },
      },
    ],
  });
  execFileSync(
    root + "/node_modules/.bin/tailwindcss",
    [
      "-i",
      root + "/src/app/globals.css",
      "-o",
      css,
      "--content",
      root + "/src/**/*.{tsx,ts}",
    ],
    { cwd: root, stdio: "pipe" },
  );

  const result = await require(root + "/node_modules/esbuild").build({
    stdin: {
      contents: `export{summarizeWealth}from'${root}/src/lib/wealth.ts';`,
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
  });
  const moduleShim = { exports: {} };
  new Function("module", "exports", "require", result.outputFiles[0].text)(
    moduleShim,
    moduleShim.exports,
    require,
  );
  const wealth = {
    entries,
    targets: [],
    debts: [],
    expectedFlows: [],
    accounts: [
      { id: id(20), name: "Cash", kind: "cash", opening_balance: "0.00" },
      { id: id(21), name: "Bank", kind: "bank", opening_balance: "0.00" },
    ],
    summary: moduleShim.exports.summarizeWealth(entries, [], []),
  };
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, "http://localhost").pathname;
    if (p === "/app.js") {
      res.setHeader("Content-Type", "text/javascript");
      return res.end(fs.readFileSync(bundle));
    }
    if (p === "/style.css") {
      res.setHeader("Content-Type", "text/css");
      return res.end(
        fs.readFileSync(css, "utf8") +
          [
            "premium-physical-ui.css",
            "premium-physical-ui-phase2.css",
            "premium-physical-ui-phase3.css",
            "premium-physical-ui-final.css",
          ]
            .map((f) => fs.readFileSync(root + "/src/app/" + f, "utf8"))
            .join("\n"),
      );
    }
    if (p.startsWith("/backgrounds/")) {
      const f = path.join(root, "public", p);
      if (fs.existsSync(f)) {
        res.setHeader(
          "Content-Type",
          p.endsWith(".webp") ? "image/webp" : "image/jpeg",
        );
        return res.end(fs.readFileSync(f));
      }
      res.statusCode = 404;
      return res.end();
    }
    if (p === "/sw.js") {
      res.setHeader("Content-Type", "text/javascript");
      return res.end("");
    }
    if (p.startsWith("/api/")) {
      let raw = "";
      req.on("data", (x) => (raw += x));
      req.on("end", () => {
        const body = raw ? JSON.parse(raw) : {};
        if (req.method !== "GET") writes.push({ path: p, body });
        if (
          p === "/api/preferences" &&
          req.method === "PUT" &&
          body.themePreference
        )
          preference = body.themePreference;
        const data =
          p === "/api/tasks"
            ? tasks
            : p === "/api/goals"
              ? goals
              : p === "/api/assignments"
                ? assignments
                : p === "/api/wealth"
                  ? wealth
                  : p === "/api/preferences"
                    ? {
                        theme_preference: preference,
                        reduced_motion: false,
                        default_reminder_channels: ["push"],
                      }
                    : p === "/api/profile"
                      ? {
                          user_id: uid,
                          display_name: "Recovery Test",
                          timezone: "Africa/Lagos",
                          current_timezone: "Africa/Lagos",
                        }
                      : p === "/api/exchange-rate"
                        ? { rate: 1500 }
                        : p === "/api/history" || p === "/api/reminders"
                          ? []
                          : {};
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(data));
      });
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "Africa/Lagos",
      permissions: [],
    });
    await context.route("https://api.bigdatacloud.net/**", (r) =>
      r.fulfill({
        json: {
          latitude: 6.5244,
          longitude: 3.3792,
          city: "Lagos",
          countryCode: "NG",
        },
      }),
    );
    await context.route("https://api.open-meteo.com/**", (r) =>
      r.fulfill({
        json: {
          timezone: "Africa/Lagos",
          current: { temperature_2m: 28, weather_code: 0 },
          daily: { sunrise: [day + "T06:00"], sunset: [day + "T18:30"] },
        },
      }),
    );
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    for (const mode of ["dark", "light"]) {
      preference = mode;
      for (const route of ["/", "/plan", "/finance"]) {
        await page.goto(origin + route);
        await page.locator("main h1").waitFor();
        await page.waitForTimeout(1800);
        assert.equal(
          await page.locator(".crys-floating-shell,.workspace-sidebar").count(),
          0,
          "October layout must be absent",
        );
        assert.equal(
          await page
            .getByRole("button", { name: `Use ${mode} theme`, exact: true })
            .first()
            .getAttribute("aria-pressed"),
          "true",
        );
        await page.screenshot({
          path:
            out +
            "/" +
            (route === "/" ? "today" : route.slice(1)) +
            "-" +
            mode +
            ".jpg",
          type: "jpeg",
          quality: 88,
          fullPage: true,
        });
        console.log("PASS actual historical route/theme", route, mode);
      }
    }
    await page.goto(origin + "/finance");
    await page
      .getByRole("button", { name: "Money entry", exact: true })
      .click();
    await page
      .locator("select")
      .filter({ has: page.locator('option[value="transfer"]') })
      .selectOption("transfer");
    await page.getByPlaceholder("0", { exact: true }).fill("1.01");
    const priorWrites = writes.filter(
      (w) => w.path === "/api/finance/entries",
    ).length;
    await page.getByRole("button", { name: "Save", exact: true }).click();
    assert.equal(
      writes.filter((w) => w.path === "/api/finance/entries").length,
      priorWrites,
      "missing accounts cannot submit a transfer",
    );
    await page
      .getByLabel("Source account", { exact: true })
      .selectOption(id(20));
    assert.equal(
      await page
        .getByLabel("Destination account", { exact: true })
        .locator('option[value="' + id(20) + '"]')
        .count(),
      0,
    );
    await page
      .getByLabel("Destination account", { exact: true })
      .selectOption(id(21));
    await page.screenshot({
      path: out + "/transfer-controls.jpg",
      type: "jpeg",
      quality: 88,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector("#entry-account"));
    const transfer = writes
      .filter((w) => w.path === "/api/finance/entries")
      .at(-1).body;
    assert.equal(transfer.accountId, id(20));
    assert.equal(transfer.destinationAccountId, id(21));
    assert.equal(transfer.amount, "1.01");
    console.log(
      "PASS neutral transfer controls, native missing-account validation and exact string amount",
    );
    await page.goto(origin + "/");
    await page.locator("main h1").waitFor();
    await page
      .getByRole("button", { name: "Use dark theme", exact: true })
      .first()
      .click();
    await page.waitForFunction(
      () => document.documentElement.dataset.themePreference === "dark",
    );
    assert.ok(
      writes.some(
        (x) =>
          x.path === "/api/preferences" && x.body.themePreference === "dark",
      ),
    );
    await page
      .getByRole("button", { name: "Use light theme", exact: true })
      .first()
      .click();
    await page.waitForFunction(
      () => document.documentElement.dataset.themePreference === "light",
    );
    console.log(
      "PASS real historical ThemeProvider controls and fixture-backed preference persistence",
    );
    await page.setViewportSize({ width: 375, height: 844 });
    await page.goto(origin + "/");
    await page.locator("main h1").waitFor();
    await page.screenshot({
      path: out + "/today-mobile.jpg",
      type: "jpeg",
      quality: 85,
      fullPage: true,
    });
    await page.goto(origin + "/auth");
    await page.getByRole("button", { name: /Sign in/i }).waitFor();
    await page.screenshot({
      path: out + "/auth-mobile.jpg",
      type: "jpeg",
      quality: 85,
      fullPage: true,
    });
    console.log("PASS historical auth form renders");
    assert.deepEqual(errors, [], "no React runtime errors");
    console.log(
      "ALL HISTORICAL BROWSER CHECKS PASSED (fixture-backed, no Supabase writes)",
    );
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
