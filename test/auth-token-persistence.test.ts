import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  FileTokenStore,
  LidlAuthError,
  MemoryTokenStore,
  getTokensFilePath,
  resolveRefreshToken,
} from "../src/token-store.js";
import { buildAuthorizeUrl, extractAuthCode, generatePkcePair } from "../src/auth.js";

test("FileTokenStore persists tokens with 0600 mode and supports locking", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lidl-mcp-test-"));
  const filePath = path.join(tmpDir, "tokens.json");
  try {
    const store = new FileTokenStore(() => filePath);
    store.assertWritable();
    store.save({ access_token: "abc", refresh_token: "def", saved_at: "2026-01-01T00:00:00Z" });

    const loaded = store.load();
    assert.strictEqual(loaded?.access_token, "abc");
    assert.strictEqual(loaded?.refresh_token, "def");

    const mode = fs.statSync(filePath).mode & 0o777;
    assert.strictEqual(mode, 0o600);

    const lockedResult = await store.withLock(async ({ waited }) => {
      assert.strictEqual(waited, false);
      return "ok";
    });
    assert.strictEqual(lockedResult, "ok");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("resolveRefreshToken prefers stored token over LIDL_REFRESH_TOKEN env", () => {
  const prev = process.env.LIDL_REFRESH_TOKEN;
  try {
    process.env.LIDL_REFRESH_TOKEN = "env-refresh";
    assert.deepStrictEqual(resolveRefreshToken(null), {
      token: "env-refresh",
      source: "env",
    });
    assert.deepStrictEqual(
      resolveRefreshToken({ access_token: "a", refresh_token: "file-refresh" }),
      { token: "file-refresh", source: "file" }
    );
  } finally {
    if (prev === undefined) delete process.env.LIDL_REFRESH_TOKEN;
    else process.env.LIDL_REFRESH_TOKEN = prev;
  }
});

test("getTokensFilePath honors LIDL_TOKENS_FILE env var", () => {
  const prev = process.env.LIDL_TOKENS_FILE;
  try {
    process.env.LIDL_TOKENS_FILE = "/tmp/custom-lidl-tokens.json";
    assert.strictEqual(getTokensFilePath(), path.resolve("/tmp/custom-lidl-tokens.json"));
  } finally {
    if (prev === undefined) delete process.env.LIDL_TOKENS_FILE;
    else process.env.LIDL_TOKENS_FILE = prev;
  }
});

test("MemoryTokenStore serializes withLock calls", async () => {
  const store = new MemoryTokenStore();
  const order: number[] = [];
  await Promise.all([
    store.withLock(async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push(1);
    }),
    store.withLock(async ({ waited }) => {
      assert.strictEqual(waited, true);
      order.push(2);
    }),
  ]);
  assert.deepStrictEqual(order, [1, 2]);
});

test("buildAuthorizeUrl throws AUTH_NOT_CONFIGURED until OAuth endpoints are set", () => {
  assert.throws(
    () => buildAuthorizeUrl(),
    (err: unknown) => err instanceof LidlAuthError && err.code === "AUTH_NOT_CONFIGURED"
  );
});

test("extractAuthCode and generatePkcePair work properly", () => {
  assert.strictEqual(extractAuthCode("lidlplus://callback?code=xyz123&state=1"), "xyz123");
  assert.strictEqual(extractAuthCode("raw-code"), "raw-code");

  const pkce = generatePkcePair();
  assert.ok(pkce.codeVerifier.length >= 43);
  assert.ok(pkce.codeChallenge.length >= 43);
  assert.notStrictEqual(pkce.codeVerifier, pkce.codeChallenge);
});
