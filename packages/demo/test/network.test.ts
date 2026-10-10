import { describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";
import libraryBundle from "../../../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs?raw";

/*
 * The demo promises to contact two hosts only: the WASM runtime and the pose model. The pose library
 * also posts usage metrics to Google every 60 s; the page blocks that with a Content-Security-Policy that
 * sets connect-src only. This test pins the policy and the hosts, so neither can drift unnoticed.
 */
const ALLOWED_CONNECT = ["'self'", "https://cdn.jsdelivr.net", "https://storage.googleapis.com"];
const POLICY = `connect-src ${ALLOWED_CONNECT.join(" ")}`;

const sources = import.meta.glob<string>("../src/**/*.ts", { query: "?raw", import: "default", eager: true });

const hostsIn = (text: string): string[] => [...text.matchAll(/https:\/\/([a-zA-Z0-9.-]+)/g)].map((m) => m[1] as string);

describe("network policy", () => {
  it("index.html carries a CSP meta that sets connect-src to exactly the allowlist, and nothing else", () => {
    const meta = indexHtml.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>/);
    expect(meta).not.toBeNull();
    expect(meta?.[1]).toBe(POLICY);
    expect(meta?.[1]).not.toContain(";");
  });

  it("every https host named in the demo's source is in the allowlist", () => {
    const allowedHosts = ALLOWED_CONNECT.filter((s) => s.startsWith("https://")).map((s) => s.slice("https://".length));
    const found = new Set(Object.values(sources).flatMap(hostsIn));
    expect(found.size).toBeGreaterThan(0);
    for (const host of found) expect(allowedHosts).toContain(host);
  });

  it("the library's only https endpoint is its metrics endpoint, which the allowlist does not include", () => {
    // If this fails the library changed its endpoints: re-read its privacy notice and re-verify in a browser.
    expect([...new Set(hostsIn(libraryBundle))]).toEqual(["odml.pa.googleapis.com"]);
    expect(POLICY).not.toContain("googleapis.com/v1/log");
    expect(ALLOWED_CONNECT.join(" ")).not.toContain("odml.pa.googleapis.com");
  });
});
