import { describe, expect, it } from "vitest";
import { formatBytes } from "../asset-limits";

describe("formatBytes", () => {
  it("formats bytes under 1KB as bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats kilobytes and megabytes with one decimal below 10 units", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("drops the decimal at 10+ units", () => {
    expect(formatBytes(150 * 1024 * 1024)).toBe("150 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
  });
});
