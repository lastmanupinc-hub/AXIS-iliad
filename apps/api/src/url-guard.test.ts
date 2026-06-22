import { describe, it, expect } from "vitest";
import { isBlockedIp, assertPublicUrl, safeFetch } from "./url-guard.js";

describe("url-guard / isBlockedIp", () => {
  it("blocks loopback / private / link-local / metadata / CGNAT / multicast IPv4", () => {
    for (const ip of [
      "127.0.0.1", "10.0.0.1", "172.16.5.4", "172.31.255.255", "192.168.1.1",
      "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "240.0.0.1",
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("blocks loopback / ULA / link-local IPv6 and IPv4-mapped forms", () => {
    for (const ip of ["::1", "::", "fe80::1", "fc00::1", "fd12::3", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("blocks alternate IPv6 spellings of loopback/metadata (the proven bypasses)", () => {
    for (const ip of [
      "0::1", "0:0:0:0:0:0:0:1", // uncompressed loopback
      "::ffff:7f00:1", // hex IPv4-mapped 127.0.0.1
      "::ffff:a9fe:a9fe", // hex IPv4-mapped 169.254.169.254 (metadata)
      "::ffff:169.254.169.254", // dotted IPv4-mapped metadata
      "64:ff9b::a9fe:a9fe", // NAT64 metadata
      "64:ff9b::169.254.169.254", // NAT64 metadata (dotted)
      "2001:db8::1", // documentation range
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("allows public IPs", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });

  it("blocks anything that isn't a valid IP", () => {
    expect(isBlockedIp("not-an-ip")).toBe(true);
    expect(isBlockedIp("")).toBe(true);
    expect(isBlockedIp("999.1.1.1")).toBe(true);
  });
});

describe("url-guard / assertPublicUrl", () => {
  it("rejects non-http(s) schemes", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow(/http/);
    await expect(assertPublicUrl("ftp://example.com/x")).rejects.toThrow(/http/);
    await expect(assertPublicUrl("gopher://example.com")).rejects.toThrow(/http/);
  });

  it("rejects malformed URLs", async () => {
    await expect(assertPublicUrl("not a url")).rejects.toThrow(/Invalid URL/);
  });

  it("rejects literal private / loopback / metadata IP hosts without a DNS lookup", async () => {
    await expect(assertPublicUrl("http://127.0.0.1/x")).rejects.toThrow(/disallowed/);
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(/disallowed/);
    await expect(assertPublicUrl("http://10.0.0.5:8080/")).rejects.toThrow(/disallowed/);
    await expect(assertPublicUrl("https://[::1]/")).rejects.toThrow(/disallowed/);
  });

  it("rejects numeric IPv4 encodings and alternate IPv6 literals (no DNS divergence)", async () => {
    // Blocked either by the numeric-host reject or (when the URL parser normalizes
    // them to a dotted IP) by the IP range check — both mean "not reachable".
    const blocked = /not allowed|disallowed/;
    await expect(assertPublicUrl("http://2130706433/")).rejects.toThrow(blocked); // decimal 127.0.0.1
    await expect(assertPublicUrl("http://0x7f000001/")).rejects.toThrow(blocked); // hex
    await expect(assertPublicUrl("http://017700000001/")).rejects.toThrow(blocked); // octal
    await expect(assertPublicUrl("http://127.0.0.1./")).rejects.toThrow(blocked); // trailing dot
    await expect(assertPublicUrl("http://[0::1]/")).rejects.toThrow(/disallowed/);
    await expect(assertPublicUrl("http://[::ffff:7f00:1]/")).rejects.toThrow(/disallowed/);
  });

  it("rejects localhost-family hostnames", async () => {
    await expect(assertPublicUrl("http://localhost/x")).rejects.toThrow(/not allowed/);
    await expect(assertPublicUrl("http://db.internal/x")).rejects.toThrow(/not allowed/);
    await expect(assertPublicUrl("http://thing.local/x")).rejects.toThrow(/not allowed/);
  });
});

describe("url-guard / safeFetch", () => {
  it("refuses to connect to a blocked address (rejects before any network call)", async () => {
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(/disallowed/);
  });
});
