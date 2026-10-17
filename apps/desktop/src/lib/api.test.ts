import assert from "node:assert/strict";
import test from "node:test";
import { normaliseApiUrl, validateApiBaseUrl } from "./api";

test("normaliseApiUrl trims whitespace and trailing slashes", () => {
  assert.equal(normaliseApiUrl("  https://reader.example/api///  "), "https://reader.example/api");
});
test("remote API endpoints require HTTPS", () => {
  assert.equal(validateApiBaseUrl("https://reader.example"), "https://reader.example");
  assert.throws(() => validateApiBaseUrl("http://reader.example"), /Use HTTPS/);
});
test("loopback HTTP is permitted for local development only", () => {
  assert.equal(validateApiBaseUrl("http://127.0.0.1:8787"), "http://127.0.0.1:8787");
  assert.equal(validateApiBaseUrl("http://localhost:8787"), "http://localhost:8787");
  assert.throws(() => validateApiBaseUrl("http://192.168.1.10:8787"), /Use HTTPS/);
});
test("API URLs cannot embed credentials or query/fragment data", () => {
  assert.throws(() => validateApiBaseUrl("https://user:secret@reader.example"), /must not contain credentials/);
  assert.throws(() => validateApiBaseUrl("https://reader.example/?token=secret"), /must not contain credentials/);
  assert.throws(() => validateApiBaseUrl("not a url"), /valid ReadAloud API URL/);
});
