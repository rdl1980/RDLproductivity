// Read-only smoke test against a deployed instance.
// Usage: BASE_URL=https://… SESSION_TOKEN=<Auth.js JWT> node scripts/live-smoke.mjs
const base = process.env.BASE_URL ?? "https://rdlproductivity.vercel.app";
const token = process.env.SESSION_TOKEN;
const cookie = token ? `__Secure-authjs.session-token=${token}` : "";

let failed = 0;
async function check(name, path, { auth = false, expect }) {
  try {
    const res = await fetch(base + path, {
      redirect: "manual",
      headers: auth ? { cookie } : {},
    });
    const body = await res.text();
    const problem = expect(res, body);
    console.log(
      `${problem ? "FAIL" : "ok  "} ${name} (${res.status})${problem ? ` ${problem}` : ""}`,
    );
    if (problem) failed++;
  } catch (error) {
    failed++;
    console.log(`FAIL ${name} ${error}`);
  }
}

const status = (code) => (res) => (res.status === code ? null : `expected ${code}`);
const contains = (code, text) => (res, body) =>
  res.status !== code ? `expected ${code}` : body.includes(text) ? null : `missing "${text}"`;

await check("anonymous / redirects to login", "/", {
  expect: (res) =>
    [302, 307].includes(res.status) && res.headers.get("location")?.includes("/login")
      ? null
      : "no redirect to /login",
});
await check("login page", "/login", { expect: contains(200, "RDL Productivity") });
await check("GitHub provider configured", "/api/auth/providers", {
  expect: contains(200, '"github"'),
});
await check("anonymous export denied", "/api/export", {
  expect: (res) => (res.status === 200 ? "export without session" : null),
});

if (token) {
  await check("boards page", "/boards", { auth: true, expect: contains(200, "Le tue board") });
  await check("calendar page", "/calendar", { auth: true, expect: status(200) });
  await check("search page", "/search?q=test", { auth: true, expect: status(200) });
  await check("archive page", "/archive", { auth: true, expect: contains(200, "Archivio") });
  await check("export reads the database", "/api/export", {
    auth: true,
    expect: contains(200, '"app": "rdlproductivity"'),
  });
}

console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
