const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, ".."),
  uid = "00000000-0000-4000-8000-000000000001",
  id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  now = new Date(),
  day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now),
  weekday = new Date(day + "T12:00:00Z").getUTCDay();
const tasks = [
  "Build a thoughtful workspace",
  "Read a chapter",
  "Make room for movement",
  "Review course notes",
].map((title, i) => ({
  id: id(i + 1),
  title,
  description: "A meaningful step",
  category: ["Work", "Learning", "Health", "Academic"][i],
  preferred_time: ["09:00", "11:30", "16:00", "19:00"][i],
  active: true,
  task_schedules: [{ weekday }],
  scheduled_today: true,
  today_status: i === 1 ? "completed" : "pending",
  streak: 3,
  focus_minutes: 0,
  created_at: now.toISOString(),
}));
const goal = {
  id: id(20),
  title: "Grow a consistent reading habit",
  description: "A little time for learning",
  status: "active",
  progress_mode: "percentage",
  progress_source: "manual",
  starting_value: "0",
  target_value: "20",
  progress_value: "8",
  progress_unit: "chapters",
  effort_percent: 40,
  measurable: true,
  category: "Learning",
  deadline: day + "T22:59:59Z",
  revision: 1,
  why_matters: "Make space for ideas.",
  badge: "book",
  task_ids: [],
  milestones: [],
  goal_checkins: [],
  checkin_config: {
    frequency: "daily",
    days: [],
    time: "20:00",
    channels: ["push"],
  },
  checkin_state: { due: true, available: true, completed: false },
  created_at: now.toISOString(),
  pacing: "A little more progress evidence will help estimate your pace.",
};
const assignment = {
  id: id(30),
  title: "Calculus problem set",
  description: "Practice steadily",
  deadline: day + "T19:00:00Z",
  priority: "high",
  status: "due_today",
  category: "Academic",
  course_code: "MTH 101",
  academic_kind: "Assignment",
  point_weight: "10",
  estimated_minutes: 120,
  work_start_at: null,
  subtasks: [],
  revision: 1,
  finished_late: false,
  completed_at: null,
  created_at: now.toISOString(),
  reminder_config: { enabled: true, channels: ["push"], offsetMinutes: [60] },
  computed_status: "due_today",
  completion_label: null,
  days_until: 0,
  timezone: "Africa/Lagos",
};
const entries = [
    {
      id: id(41),
      user_id: uid,
      type: "income",
      flow_kind: "income",
      amount: "65000.00",
      date: now.toISOString(),
      category: "Work",
      source: "Income",
      note: "",
      account_id: id(40),
      revision: 1,
      deleted_at: null,
    },
    {
      id: id(42),
      user_id: uid,
      type: "expense",
      flow_kind: "expense",
      amount: "2500.00",
      date: now.toISOString(),
      category: "Food",
      source: "Lunch",
      note: "",
      account_id: id(40),
      revision: 1,
      deleted_at: null,
    },
  ],
  accounts = [
    {
      id: id(40),
      user_id: uid,
      name: "Cash",
      kind: "cash",
      opening_balance: "0.00",
      created_at: now.toISOString(),
    },
  ];
let today,
  wealth,
  history,
  phase = "golden",
  focus = null,
  requests = [],
  taskWrites = 0;
const environment = () => ({
  phase,
  weather: "clear",
  timezone: "Africa/Lagos",
  temperatureC: 28,
  city: "Lagos",
  countryCode: "NG",
  localTime: day + "T18:00:00",
  sunrise: day + "T06:00",
  sunset: day + "T18:30",
  locationSource: "saved",
});
const os = require("node:os"),
  { execFileSync } = require("node:child_process");
const fixtureDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "crystrack-workspace-"),
);
let origin;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost"),
    p = url.pathname;
  if (p === "/app.js") {
    res.setHeader("content-type", "text/javascript");
    return res.end(fs.readFileSync(path.join(fixtureDirectory, "app.js")));
  }
  if (p === "/style.css") {
    res.setHeader("content-type", "text/css");
    return res.end(
      fs.readFileSync(path.join(fixtureDirectory, "style.css"), "utf8") +
        "\n" +
        fs.readFileSync(
          root + "/src/app/premium-physical-ui-final.css",
          "utf8",
        ) +
        "\n" +
        fs.readFileSync(root + "/src/app/workspace.css", "utf8"),
    );
  }
  if (p.startsWith("/backgrounds/") || p.startsWith("/brand/")) {
    const file = path.join(root, "public", p);
    res.setHeader(
      "content-type",
      p.endsWith(".webp") ? "image/webp" : "image/jpeg",
    );
    return res.end(fs.readFileSync(file));
  }
  if (p === "/sw.js") {
    res.setHeader("content-type", "text/javascript");
    return res.end("");
  }
  if (p.startsWith("/api/")) {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      requests.push({ path: p, method: req.method, body });
      res.setHeader("content-type", "application/json");
      let result = {};
      if (p === "/api/dashboard/today") {
        today.focus = focus;
        result = today;
      } else if (p === "/api/profile")
        result = {
          id: uid,
          user_id: uid,
          timezone: "Africa/Lagos",
          current_timezone: "Africa/Lagos",
          display_name: "Emmanuel",
          avatar_signed_url: null,
          avatar_url: null,
        };
      else if (p === "/api/preferences")
        result = {
          theme_preference: "dark",
          hide_gamification: true,
          default_reminder_channels: ["push"],
          reduced_motion: false,
          untimed_task_reminder_time: "09:00",
          incomplete_task_reminder_time: "20:00",
          dnd_start_time: "22:00",
          dnd_end_time: "07:00",
        };
      else if (p === "/api/tasks") result = tasks;
      else if (p.includes("/occurrences/") && p.endsWith("/toggle")) {
        const task = tasks.find((t) => p.includes(t.id));
        task.today_status =
          task.today_status === "completed" ? "pending" : "completed";
        taskWrites++;
        result = { status: task.today_status };
      } else if (p === "/api/goals") result = [goal];
      else if (p === "/api/assignments") result = [assignment];
      else if (p === "/api/assignments/workload")
        result = {
          ...today.workload,
          timezone: today.timezone,
          asOf: today.asOf,
        };
      else if (p === "/api/wealth") result = wealth;
      else if (p === "/api/exchange-rate")
        result = {
          usdNgn: "1500.00",
          ngnUsd: 1 / 1500,
          updatedAt: now.toISOString(),
        };
      else if (p === "/api/history") result = history;
      else if (p === "/api/insights") result = [];
      else if (p.startsWith("/api/ai/domain/")) {
        res.statusCode = 503;
        result = { error: "AI is not configured in this local UI fixture." };
      } else if (p === "/api/ai/conversations") result = [];
      else if (p === "/api/reminders")
        result = [
          {
            id: id(70),
            entity_type: "assignment",
            status: "pending",
            title: assignment.title,
            scheduled_for: assignment.deadline,
          },
        ];
      else if (p === "/api/rhythm/ritual") {
        today.ritual = {
          ...body,
          revision: (today.ritual?.revision || 0) + 1,
          evening_at: new Date().toISOString(),
          reflection: body.reflection,
        };
        result = today.ritual;
      } else if (p === "/api/telegram/status") result = { connected: false };
      else if (p === "/api/calendar")
        result = { events: [], tasks, boxes: [], timezone: "Africa/Lagos" };
      else if (p === "/api/rhythm/focus") {
        if (body.action === "start")
          focus = {
            id: body.id,
            task_id: body.taskId,
            planned_minutes: body.minutes,
            elapsed_seconds: 0,
            status: "running",
            started_at: new Date().toISOString(),
            resumed_at: new Date().toISOString(),
            as_of: new Date().toISOString(),
          };
        else if (focus && body.action === "pause")
          focus = { ...focus, status: "paused", elapsed_seconds: 2 };
        else if (focus && body.action === "resume")
          focus = {
            ...focus,
            status: "running",
            resumed_at: new Date().toISOString(),
          };
        else if (body.action === "cancel") focus = null;
        result = focus || { status: "cancelled" };
      }
      return res.end(JSON.stringify(result));
    });
    return;
  }
  res.setHeader("content-type", "text/html");
  res.end(
    '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/style.css"/></head><body><div id="root"></div><script>window.__environment=' +
      JSON.stringify(environment()) +
      '</script><script src="/app.js"></script></body></html>',
  );
});
(async () => {
  await require("./fixtures/workspace-browser.cjs")(fixtureDirectory);
  execFileSync(
    process.execPath,
    [
      require.resolve("tailwindcss/lib/cli.js"),
      "-i",
      root + "/src/app/globals.css",
      "-o",
      path.join(fixtureDirectory, "style.css"),
      "--minify",
    ],
    { cwd: root, stdio: "ignore" },
  );
  const { loadTs } = await import(root + "/tests/load-ts.mjs");
  const { summarizeWealth } = loadTs(root + "/src/lib/wealth.ts");
  const { academicWorkload } = loadTs(
    root + "/src/lib/assignments/workload.ts",
  );
  wealth = {
    entries,
    accounts,
    summary: summarizeWealth(entries, [], [], now, "Africa/Lagos"),
    targets: [],
    debts: [],
    expectedFlows: [],
    caps: [],
    bills: [],
    circles: [],
    contributions: [],
    settings: null,
    timezone: "Africa/Lagos",
  };
  history = [
    {
      id: id(60),
      type: "task_completed",
      entity_type: "task",
      entity_id: tasks[1].id,
      created_at: now.toISOString(),
      metadata_json: { title: tasks[1].title, date: day },
    },
    {
      id: id(61),
      type: "finance_entry",
      entity_type: "finance",
      created_at: now.toISOString(),
      metadata_json: { title: "Lunch recorded" },
    },
  ];
  today = {
    day,
    timezone: "Africa/Lagos",
    asOf: now.toISOString(),
    tasks,
    goals: [goal],
    assignments: [assignment],
    wealth,
    history,
    reminders: [],
    boxes: [],
    ritual: null,
    weekRitual: null,
    focus: null,
    focusMinutes: 25,
    weekly: {
      completed: 1,
      focusedMinutes: 25,
      areas: [{ label: "Learning", count: 1 }],
    },
    capacity: { planned: 60, available: 420, overloaded: false },
    workload: academicWorkload([assignment], now, "Africa/Lagos"),
    priorities: [],
    gamification: { ready: false, hidden: true },
  };
  await new Promise((r) =>
    server.listen(0, "127.0.0.1", () => {
      origin = "http://127.0.0.1:" + server.address().port;
      r();
    }),
  );
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Pacific/Kiritimati",
  });
  let errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("PAGE ERROR", e.message);
  });
  page.setDefaultTimeout(10000);

  const output = root + "/docs/screenshots";
  fs.mkdirSync(output, { recursive: true });
  for (const width of [375, 430, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await page.goto(origin + "/");
    await page.getByRole("heading", { name: "Your day, in focus." }).waitFor();
    await page.waitForTimeout(100);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "document overflow " + width,
    );
    const shell = page.locator(".crys-floating-shell"),
      box = await shell.boundingBox();
    assert.ok(
      box.x >= 8 && box.x + box.width <= width - 8,
      "exterior margins " + width,
    );
    assert.match(
      await shell.evaluate((e) => getComputedStyle(e).backdropFilter),
      /blur\(20px\).*saturate\(1.8\)/,
    );
    const utility = page.locator(".workspace-utility");
    assert.ok(
      await utility.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      "utility overflow " + width,
    );
    if (width >= 768) {
      assert.ok(Math.abs(box.height - 920) < 2);
      assert.ok(Math.abs(box.x - (width - box.width) / 2) < 2);
      const before = await utility.boundingBox();
      await page
        .locator(".workspace-scroll")
        .evaluate((e) => (e.scrollTop = 2000));
      const after = await utility.boundingBox();
      assert.ok(Math.abs(before.y - after.y) < 1);
      assert.equal(await page.evaluate(() => scrollY), 0);
      await page
        .locator(".workspace-scroll")
        .evaluate((e) => (e.scrollTop = 0));
    } else {
      assert.equal(
        await page
          .locator(".workspace-scroll")
          .evaluate((e) => getComputedStyle(e).overflowY),
        "visible",
      );
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      await page.getByRole("dialog", { name: "Your workspace" }).waitFor();
      assert.equal(
        await page
          .getByRole("dialog")
          .getByRole("link", { name: "Wealth", exact: true })
          .count(),
        1,
      );
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () =>
          document.activeElement?.getAttribute("aria-label") ===
          "Open navigation",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Open navigation", exact: true })
          .evaluate((e) => e === document.activeElement),
        true,
      );
    }
    await page.screenshot({
      path: output + "/today-" + width + "-dark.jpg",
      type: "jpeg",
      quality: 82,
      fullPage: width < 768,
    });
    console.log("PASS responsive shell/Today", width);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/");
  await page.getByRole("heading", { name: "Your day, in focus." }).waitFor();
  // Sidebar geometry, keyboard tooltips, theme variants and durable preferences.
  const desktopSidebar = page.locator(
    ".crys-floating-shell > .workspace-sidebar",
  );
  const frameBefore = await page.locator(".crys-floating-shell").boundingBox();
  for (const mode of ["dark", "light"]) {
    if (mode === "light")
      await page
        .getByRole("button", { name: "Use light theme", exact: true })
        .click();
    await page.waitForTimeout(300);
    assert.equal(Math.round((await desktopSidebar.boundingBox()).width), 240);
    await page.screenshot({
      path: output + "/sidebar-expanded-" + mode + ".jpg",
      type: "jpeg",
      quality: 88,
    });
    const mainBefore = await page.locator(".workspace-main").boundingBox();
    await page
      .getByRole("button", { name: "Collapse sidebar", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: "Expand sidebar" })
        .getAttribute("aria-expanded"),
      "false",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Expand sidebar" })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    assert.equal(Math.round((await desktopSidebar.boundingBox()).width), 76);
    const frameAfter = await page.locator(".crys-floating-shell").boundingBox();
    assert.deepEqual(frameAfter, frameBefore, "outer window stays fixed");
    assert.equal(
      Math.round(
        (await page.locator(".workspace-main").boundingBox()).width -
          mainBefore.width,
      ),
      164,
    );
    const planLink = desktopSidebar.getByRole("link", {
      name: "Plan",
      exact: true,
    });
    await planLink.focus();
    await page.getByRole("tooltip", { name: "Plan", exact: true }).waitFor();
    assert.ok(await planLink.getAttribute("aria-describedby"));
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("tooltip").count(), 0);
    await page.getByRole("button", { name: "Expand sidebar" }).focus();
    assert.ok(
      await page
        .locator(".workspace-page")
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      "collapsed dashboard reflows",
    );
    await page.screenshot({
      path: output + "/sidebar-collapsed-" + mode + ".jpg",
      type: "jpeg",
      quality: 88,
    });
    await page.reload();
    await page
      .getByRole("button", { name: "Expand sidebar", exact: true })
      .waitFor();
    assert.equal(
      Math.round((await desktopSidebar.boundingBox()).width),
      76,
      "reload retains state",
    );
    await desktopSidebar
      .getByRole("link", { name: "Plan", exact: true })
      .click();
    await page.waitForURL(origin + "/plan");
    assert.equal(
      await desktopSidebar
        .getByRole("link", { name: "Plan", exact: true })
        .getAttribute("aria-current"),
      "page",
    );
    assert.equal(
      Math.round((await desktopSidebar.boundingBox()).width),
      76,
      "route retains state",
    );
    await desktopSidebar
      .getByRole("link", { name: "Today", exact: true })
      .click();
    await page.getByRole("heading", { name: "Your day, in focus." }).waitFor();
    if (mode === "light") {
      await page.setViewportSize({ width: 375, height: 844 });
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      const drawer = page.getByRole("dialog", { name: "Your workspace" });
      assert.ok(
        await drawer
          .getByRole("link", { name: "Assignments", exact: true })
          .isVisible(),
      );
      assert.equal(
        await drawer.getByRole("button", { name: /sidebar/ }).count(),
        0,
      );
      await page.screenshot({
        path: output + "/mobile-navigation.jpg",
        type: "jpeg",
        quality: 88,
      });
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () =>
          document.activeElement?.getAttribute("aria-label") ===
          "Open navigation",
      );
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await page
      .getByRole("button", { name: "Expand sidebar", exact: true })
      .click();
    assert.equal(Math.round((await desktopSidebar.boundingBox()).width), 240);
  }
  await page
    .getByRole("button", { name: "Use dark theme", exact: true })
    .click();
  // Browser storage may be restricted; the control must still operate in-memory.
  await page.evaluate(() => {
    window.__originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw new DOMException("Storage unavailable", "SecurityError");
    };
  });
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  assert.equal(Math.round((await desktopSidebar.boundingBox()).width), 76);
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__originalSetItem;
  });
  console.log(
    "PASS expanded/collapsed light/dark, fixed frame, keyboard tooltips, reload/route persistence and mobile drawer",
  );
  const complete = page.getByRole("button", {
    name: "Complete: Build a thoughtful workspace",
    exact: true,
  });
  await complete.click();
  await page
    .getByRole("button", {
      name: "Mark incomplete: Build a thoughtful workspace",
      exact: true,
    })
    .waitFor();
  assert.equal(taskWrites, 1);
  assert.ok(
    requests.some((r) => r.path.includes("/occurrences/" + day + "/toggle")),
  );
  console.log("PASS saved-zone completion");
  await page
    .getByRole("button", { name: "Quick capture", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page
      .getByRole("dialog")
      .evaluate((e) => !e.closest(".crys-floating-shell")),
    true,
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () =>
      document.activeElement?.tagName === "BUTTON" &&
      document.activeElement?.textContent?.includes("Quick capture"),
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Quick capture", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page
    .getByRole("button", { name: "Search workspace pages", exact: true })
    .click();
  await page.getByLabel("Search pages").fill("Wealth");
  assert.equal(
    await page
      .getByLabel("Search pages")
      .evaluate((e) => e === document.activeElement),
    true,
  );
  assert.equal(
    await page
      .getByRole("navigation", { name: "Search results" })
      .getByRole("link")
      .count(),
    1,
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") ===
      "Search workspace pages",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Search workspace pages", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  console.log("PASS portalled overlays and keyboard focus");
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Notifications" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("dialog", { name: "Emmanuel", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page
    .getByLabel("Focus task", { exact: true })
    .filter({ visible: true })
    .selectOption(tasks[0].id);
  await page
    .locator(".today-focus")
    .getByRole("button", { name: "Start focus", exact: true })
    .click();
  await page
    .locator(".today-focus")
    .getByRole("button", { name: "Pause", exact: true })
    .waitFor();
  await page
    .locator(".today-focus")
    .getByRole("button", { name: "Pause", exact: true })
    .click();
  await page
    .locator(".today-focus")
    .getByRole("button", { name: "Resume", exact: true })
    .waitFor();
  console.log("PASS task-linked focus start/pause");
  await page
    .getByRole("button", { name: "Reflect on today", exact: true })
    .click();
  const reflection = page.getByRole("dialog", {
    name: "Evening Wrap-up · one minute",
  });
  await reflection
    .getByLabel("One-line reflection")
    .fill("A small step was enough today.");
  await reflection.getByRole("button", { name: "Save", exact: true }).click();
  await reflection.waitFor({ state: "hidden" });
  await page
    .getByText("A small step was enough today.", { exact: true })
    .waitFor();
  assert.ok(
    requests.some(
      (request) =>
        request.path === "/api/rhythm/ritual" &&
        request.body.day === day &&
        request.body.kind === "evening",
    ),
  );
  console.log("PASS connected reflection and saved local day");

  for (const width of [375, 430, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    for (const route of [
      "/plan",
      "/tasks",
      "/goals",
      "/assignments",
      "/calendar",
      "/finance",
      "/insights",
      "/history",
      "/ai",
      "/settings",
      "/auth",
    ]) {
      errors = [];
      await page.goto(origin + "" + route);
      await page.locator("h1").waitFor();
      await page.waitForTimeout(100);
      assert.deepEqual(errors, [], route + " " + width);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        route + " document overflow " + width,
      );
      if (route !== "/auth") {
        const excess = await page
          .locator(".workspace-scroll")
          .evaluate((e) => e.scrollWidth - e.clientWidth);
        assert.ok(
          excess <= 2,
          route + " inner content overflow " + width + ": " + excess,
        );
      }
      if (width === 1440)
        await page.screenshot({
          path: output + "/" + route.slice(1) + "-1440-dark.jpg",
          type: "jpeg",
          quality: 82,
        });
    }
    console.log("PASS route render matrix", width);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/");
  await page.getByRole("heading", { name: "Your day, in focus." }).waitFor();
  await page
    .getByRole("button", { name: "Use light theme", exact: true })
    .click();
  assert.equal(
    await page
      .locator(".workspace-brand")
      .first()
      .getAttribute("data-brand-mode"),
    "light",
  );
  await page.waitForTimeout(300);
  await page.screenshot({
    path: output + "/today-1440-light.jpg",
    type: "jpeg",
    quality: 82,
  });
  await page.reload();
  assert.equal(
    await page
      .locator(".workspace-brand")
      .first()
      .getAttribute("data-brand-mode"),
    "light",
  );
  await page
    .getByRole("button", { name: "Use dark theme", exact: true })
    .click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const card = page.locator(".today-metric").first();
  await card.hover();
  assert.equal(
    await card.evaluate((e) => getComputedStyle(e).transform),
    "none",
  );
  console.log(
    "PASS light/dark logo selection, saved appearance and reduced motion",
  );

  await page.goto(origin + "/settings");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  const reduced = page.getByRole("button", {
    name: "Reduced motion",
    exact: true,
  });
  await reduced.click();
  assert.equal(await reduced.getAttribute("aria-pressed"), "true");
  assert.equal(
    await page.locator("html").getAttribute("data-crys-reduced-motion"),
    "true",
  );
  console.log("PASS accessible saved-motion control");
  for (const viewport of [
    { width: 1100, height: 768 },
    { width: 1440, height: 540 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(origin + "/");
    await page.getByRole("heading", { name: "Your day, in focus." }).waitFor();
    const frame = await page.locator(".crys-floating-shell").boundingBox();
    assert.ok(frame.y >= 11 && frame.y + frame.height <= viewport.height - 11);
    assert.ok(
      await page
        .locator(".workspace-utility")
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log("PASS compact laptop and short desktop geometry");
  await page.goto(origin + "/tasks?create=task");
  await page.getByRole("dialog", { name: "Create recurring task" }).waitFor();
  assert.equal(
    await page
      .getByRole("dialog")
      .evaluate((e) => !e.closest(".crys-floating-shell")),
    true,
  );
  await page.keyboard.press("Escape");
  await page.goto(origin + "/finance?create=entry");
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page
      .getByRole("dialog")
      .evaluate((e) => !e.closest(".crys-floating-shell")),
    true,
  );
  console.log("PASS quick capture editing routes escape shell clipping");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(origin + "/");
  await page.getByRole("heading", { name: "Your day, in focus." }).waitFor();
  await page
    .getByRole("button", { name: "Use auto theme", exact: true })
    .click();
  for (const [nextPhase, utc, expected] of [
    ["morning", "06:00", "sunrise"],
    ["day", "12:00", "midday"],
    ["golden", "17:40", "golden-hour"],
    ["evening", "18:10", "golden-hour"],
    ["night", "22:00", "night-dubai-city"],
  ]) {
    phase = nextPhase;
    await page.clock.setFixedTime(new Date(day + "T" + utc + ":00Z"));
    await page.goto(origin + "/");
    await page.getByRole("heading", { name: "Your day, in focus." }).waitFor();
    const image = page.locator(".environment-background");
    assert.match(
      await image.getAttribute("data-background-id"),
      new RegExp(expected),
    );
    assert.equal(
      await page
        .locator(".workspace-brand")
        .first()
        .getAttribute("data-brand-mode"),
      ["morning", "day"].includes(nextPhase) ? "light" : "dark",
    );
    console.log("PASS adaptive scene and logo", nextPhase);
  }
  phase = "golden";
  await page.clock.setFixedTime(new Date(day + "T17:40:00Z"));
  await page.goto(origin + "/");
  await page.getByRole("heading", { name: "Your day, in focus." }).waitFor();
  await page
    .getByRole("button", { name: "Use dark theme", exact: true })
    .click();
  await page.screenshot({
    path: output + "/today-1440-golden.jpg",
    type: "jpeg",
    quality: 88,
  });
  console.log("ALL WORKSPACE BROWSER CHECKS PASSED");
  await browser.close();
  server.close();
  fs.rmSync(fixtureDirectory, { recursive: true, force: true });
})().catch((e) => {
  console.error(e);
  server.close();
  fs.rmSync(fixtureDirectory, { recursive: true, force: true });
  process.exit(1);
});
