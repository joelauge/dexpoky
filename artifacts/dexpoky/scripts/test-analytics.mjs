import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Run the real TypeScript modules with an isolated browser/Clerk subscription.
// No credentials, Google requests, or real user data are needed.
function setup({ browser = true, tag = true, storageBlocked = false } = {}) {
  const events = [];
  const stored = new Map();
  let listener;
  const context = vm.createContext({
    sessionStorage: {
      getItem(key) {
        if (storageBlocked) throw new Error("Storage blocked");
        return stored.get(key) ?? null;
      },
      setItem(key, value) {
        if (storageBlocked) throw new Error("Storage blocked");
        stored.set(key, value);
      },
    },
  });
  if (browser) context.window = tag ? { gtag: (...args) => events.push(args) } : {};

  function load(path, dependencies = {}) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    context.module = module;
    context.exports = module.exports;
    context.require = name => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    };
    vm.runInContext(compiled, context);
    return module.exports;
  }

  const analytics = load("../src/lib/analytics.ts");
  const auth = load("../src/components/auth-analytics.tsx", {
    react: { useEffect: fn => fn(), useRef: value => ({ current: value }) },
    "@clerk/react": { useClerk: () => ({
      addListener: callback => { listener = callback; return () => { listener = undefined; }; },
    }) },
    "@/lib/analytics": analytics,
  });
  return { context, events, analytics, mount: () => auth.AuthAnalytics(), emit: client => listener({ client }) };
}

function client({ signup, login, strategy = null } = {}) {
  return {
    lastAuthenticationStrategy: strategy,
    signUp: { status: null, createdSessionId: null, hasPassword: false, verifications: {}, ...signup },
    signIn: { status: null, createdSessionId: null, firstFactorVerification: {}, ...login },
  };
}

test("trackEvent safely no-ops without a browser or Google tag", () => {
  for (const options of [{ browser: false }, { tag: false }]) {
    const { analytics, events } = setup(options);
    assert.doesNotThrow(() => analytics.trackEvent("card_scan", { source: "single_scan" }));
    assert.equal(events.length, 0);
  }
});

test("all requested event names dispatch once and analytics errors cannot break actions", () => {
  const { analytics, context, events } = setup();
  const names = ["sign_up", "login", "card_scan", "listing_created", "trade_offer_sent", "add_to_collection"];
  names.forEach(name => analytics.trackEvent(name));
  assert.deepEqual(events.map(args => args.slice(0, 2)), names.map(name => ["event", name]));
  context.window.gtag = () => { throw new Error("Tag blocked"); };
  assert.doesNotThrow(() => analytics.trackEvent("listing_created"));
});

test("only fixed categories and finite counts are forwarded; no PII or page_view", () => {
  const { analytics, events } = setup();
  analytics.trackEvent("add_to_collection", {
    source: "set_checklist", quantity: 3, email: "fixture@example.invalid",
    name: "Fixture", user_id: "local-fixture", notes: "Private text",
  });
  assert.equal(JSON.stringify(events[0][2]), JSON.stringify({ source: "set_checklist", quantity: 3 }));
  analytics.trackEvent("login", { method: "fixture@example.invalid", source: "Private text", quantity: Infinity });
  assert.equal(JSON.stringify(events[1][2]), "{}");
  analytics.trackEvent("page_view", {});
  assert.equal(events.length, 2);
});

test("failed/incomplete auth and restored sessions do not create conversion events", () => {
  const state = setup();
  state.mount();
  state.emit(null);
  state.emit(client());
  state.emit(client({ login: { status: "needs_first_factor", createdSessionId: "pending" } }));
  state.emit(client({ signup: { status: "missing_requirements", createdSessionId: "pending" } }));
  assert.equal(state.events.length, 0);
});

test("completed password login reports once, including after remount", () => {
  const state = setup();
  const completed = client({ login: {
    status: "complete", createdSessionId: "fixture-login",
    firstFactorVerification: { strategy: "password" },
  } });
  state.mount();
  state.emit(completed);
  state.emit(completed);
  state.mount();
  state.emit(completed);
  assert.equal(state.events.length, 1);
  assert.equal(JSON.stringify(state.events[0]), JSON.stringify(["event", "login", { method: "password" }]));
  assert.ok(!JSON.stringify(state.events).includes("fixture-login"));
});

test("OAuth signup wins over transferred sign-in for the same completed session", () => {
  const state = setup();
  state.mount();
  state.emit(client({
    signup: { status: "complete", createdSessionId: "fixture-signup", verifications: { externalAccount: { strategy: "oauth_google" } } },
    login: { status: "complete", createdSessionId: "fixture-signup" },
  }));
  assert.equal(JSON.stringify(state.events), JSON.stringify([["event", "sign_up", { method: "google" }]]));
});

test("password signup and later email-code login use the completed attempt's method", () => {
  const state = setup();
  state.mount();
  state.emit(client({ signup: { status: "complete", createdSessionId: "fixture-signup", hasPassword: true } }));
  state.emit(client({ login: {
    status: "complete", createdSessionId: "fixture-new-login",
    firstFactorVerification: { strategy: "email_code" },
  } }));
  assert.equal(JSON.stringify(state.events), JSON.stringify([
    ["event", "sign_up", { method: "password" }], ["event", "login", { method: "email_code" }],
  ]));
});

test("blocked storage still deduplicates repeated auth notifications", () => {
  const state = setup({ storageBlocked: true });
  state.mount();
  const completed = client({ strategy: "oauth_github", login: { status: "complete", createdSessionId: "fixture-login" } });
  state.emit(completed);
  state.emit(completed);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0][2].method, "github");
});

test("email-code signup uses verification method when Clerk's last-strategy feature is disabled", () => {
  const state = setup();
  state.mount();
  state.emit(client({ signup: {
    status: "complete", createdSessionId: "fixture-email-signup",
    verifications: { emailAddress: { strategy: "email_code" } },
  } }));
  assert.equal(JSON.stringify(state.events), JSON.stringify([["event", "sign_up", { method: "email_code" }]]));
});

test("no auth events are attempted when the production-only tag is absent", () => {
  const state = setup({ tag: false });
  state.mount();
  state.emit(client({ signup: { status: "complete", createdSessionId: "fixture-signup" } }));
  assert.equal(state.events.length, 0);
});

test("inline tag stays production-host-only, on every route, with one Google loader", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const code = html.match(/<head>\s*<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(code);
  assert.equal((html.match(/googletagmanager\.com\/gtag\/js/g) ?? []).length, 1);
  for (const hostname of ["dexpoky.com", "www.dexpoky.com", "dexpoky.replit.app", "preview.replit.dev", "localhost", "dexpoky.com.example.org"]) {
    for (const pathname of ["/", "/scan", "/collection", "/marketplace/123"]) {
      const scripts = [];
      const context = vm.createContext({
        location: { hostname, pathname },
        document: { createElement: () => ({}), head: { appendChild: tag => scripts.push(tag) } },
      });
      context.window = context;
      vm.runInContext(code, context);
      const allowed = ["dexpoky.com", "www.dexpoky.com"].includes(hostname);
      assert.equal(scripts.length, allowed ? 1 : 0);
      assert.equal(typeof context.gtag, allowed ? "function" : "undefined");
    }
  }
});
