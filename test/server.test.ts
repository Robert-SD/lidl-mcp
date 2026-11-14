import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/index.js";
import { LidlClient } from "../src/client.js";
import { TtlCache } from "../src/cache.js";
import { MemoryTokenStore, setTokenStore } from "../src/token-store.js";

test("createServer: registers foundation tools", () => {
  const server = createServer();
  const registered = Object.keys((server as any)._registeredTools);

  assert.deepStrictEqual(registered.sort(), ["lidl_cache_stats", "lidl_login"]);
});

test("createServer: foundation tools have readOnlyHint true", () => {
  const server = createServer();
  for (const name of ["lidl_login", "lidl_cache_stats"]) {
    const tool = (server as any)._registeredTools[name];
    assert.ok(tool, `${name} should be registered`);
    assert.deepStrictEqual(tool.annotations, { readOnlyHint: true });
  }
});

test("lidl_login & lidl_cache_stats handlers return expected JSON", async () => {
  setTokenStore(new MemoryTokenStore({ access_token: "tok-123", refresh_token: "ref-456" }));
  try {
    const cache = new TtlCache({ maxEntries: 42 });
    const client = new LidlClient("https://example.invalid", cache);
    const server = createServer(client);

    const loginTool = (server as any)._registeredTools["lidl_login"];
    const loginResp = await loginTool.handler({});
    const loginPayload = JSON.parse(loginResp.content[0].text);
    assert.strictEqual(loginPayload.status, "authenticated");
    assert.strictEqual(loginPayload.authenticated, true);
    assert.strictEqual(loginPayload.hasAccessToken, true);
    assert.strictEqual(loginPayload.hasRefreshToken, true);

    const statsTool = (server as any)._registeredTools["lidl_cache_stats"];
    const statsResp = await statsTool.handler({});
    const statsPayload = JSON.parse(statsResp.content[0].text);
    assert.strictEqual(statsPayload.enabled, true);
    assert.strictEqual(statsPayload.maxEntries, 42);
    assert.strictEqual(statsPayload.entries, 0);
  } finally {
    setTokenStore(null);
  }
});
