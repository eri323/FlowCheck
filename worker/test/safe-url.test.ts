import { describe, expect, it } from "vitest";
import { isBlockedIp, isBlockedLiteralHost } from "../lib/safe-url";

describe("isBlockedIp — IPv4", () => {
  it("bloquea loopback, privadas, link-local/metadata y especiales", () => {
    for (const ip of [
      "0.0.0.0",
      "10.0.0.5",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.0.0.1",
      "192.168.1.10",
      "224.0.0.1",
      "240.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("permite IPs públicas", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.63.255.255"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });
});

describe("isBlockedIp — IPv6", () => {
  it("bloquea loopback, unspecified, ULA, link-local, multicast y IPv4-mapped interna", () => {
    for (const ip of [
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("permite IPv6 público y IPv4-mapped público", () => {
    expect(isBlockedIp("2001:4860:4860::8888")).toBe(false);
    expect(isBlockedIp("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("isBlockedLiteralHost", () => {
  it("bloquea localhost, IPs literales internas y encodings de IPv4", () => {
    for (const host of [
      "localhost",
      "foo.localhost",
      "127.0.0.1",
      "169.254.169.254",
      "[::1]",
      "2130706433", // decimal de 127.0.0.1
      "0x7f000001", // hex de 127.0.0.1
    ]) {
      expect(isBlockedLiteralHost(host), host).toBe(true);
    }
  });

  it("permite hostnames públicos normales", () => {
    for (const host of ["example.com", "sub.example.com", "8.8.8.8"]) {
      expect(isBlockedLiteralHost(host), host).toBe(false);
    }
  });
});

describe("isBlockedIp — casos límite adicionales", () => {
  it("bloquea fe80 con zone id y forma completa sin ::", () => {
    expect(isBlockedIp("fe80::1%eth0")).toBe(true);
    expect(isBlockedIp("fe80:0:0:0:0:0:0:1")).toBe(true);
  });

  it("respeta los bordes del rango 172.16.0.0/12", () => {
    expect(isBlockedIp("172.15.255.255")).toBe(false);
    expect(isBlockedIp("172.16.0.0")).toBe(true);
    expect(isBlockedIp("172.31.255.255")).toBe(true);
    expect(isBlockedIp("172.32.0.0")).toBe(false);
  });
});

describe("isBlockedLiteralHost — casos límite adicionales", () => {
  it("bloquea '0' (0.0.0.0/8) y un IPv4-mapped entre corchetes", () => {
    expect(isBlockedLiteralHost("0")).toBe(true);
    expect(isBlockedLiteralHost("[::ffff:127.0.0.1]")).toBe(true);
  });
});
