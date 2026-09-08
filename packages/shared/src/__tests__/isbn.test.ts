import { describe, expect, it } from "vitest";
import { computeIsbn13CheckDigit, formatIsbn13, isValidIsbn13 } from "../isbn";

describe("computeIsbn13CheckDigit", () => {
  it("computes the correct check digit for a known ISBN-13", () => {
    // The Pragmatic Programmer, 20th anniversary edition: 978-0135957059
    expect(computeIsbn13CheckDigit("978013595705")).toBe(9);
  });

  it("rejects input that isn't exactly 12 digits", () => {
    expect(() => computeIsbn13CheckDigit("123")).toThrow();
    expect(() => computeIsbn13CheckDigit("97801359570599")).toThrow();
  });
});

describe("isValidIsbn13", () => {
  it("accepts a real, correctly checksummed ISBN-13", () => {
    expect(isValidIsbn13("978-0-13-595705-9")).toBe(true);
    expect(isValidIsbn13("9780135957059")).toBe(true);
  });

  it("rejects a tampered check digit", () => {
    expect(isValidIsbn13("9780135957050")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(isValidIsbn13("not an isbn")).toBe(false);
    expect(isValidIsbn13("12345")).toBe(false);
    expect(isValidIsbn13("1230135957059")).toBe(false); // wrong Bookland prefix
  });
});

describe("formatIsbn13", () => {
  it("formats a valid 13-digit ISBN with hyphens", () => {
    expect(formatIsbn13("9780135957059")).toBe("978-0-13595-705-9");
  });
});
