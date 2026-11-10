import test from "node:test";
import assert from "node:assert/strict";
import { assertSameOrigin, isLocalAsset } from "../lib/security";

test("cookie mutations require a matching origin", () => {
  const original = process.env.APP_ORIGIN;
  delete process.env.APP_ORIGIN;
  try {
    assert.doesNotThrow(() => assertSameOrigin(new Request("http://lan.test/api", {headers:{origin:"http://lan.test"}})));
    for(const origin of [undefined,"https://evil.test","null"]) {
      assert.throws(() => assertSameOrigin(new Request("http://lan.test/api",{headers:origin?{origin}:{}})));
    }
    assert.throws(() => assertSameOrigin(new Request("http://lan.test/api",{headers:{origin:"http://lan.test","sec-fetch-site":"cross-site"}})));
  } finally { if(original===undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN=original; }
});
test("media references cannot reach an external host or traverse directories", () => {
  assert.equal(isLocalAsset("/api/media/abc-123"),true);
  assert.equal(isLocalAsset("/han-ngu-bien.svg"),true);
  for(const value of ["https://evil.test/a.mp3","//evil.test/a","/../a","/%2e%2e/a","/a\\b","data:text/html,test"]) assert.equal(isLocalAsset(value),false,value);
});
