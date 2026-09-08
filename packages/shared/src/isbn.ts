// ISBN-13 validation and check-digit computation (EAN-13 mod-10 algorithm).
// Real arithmetic, not a display-only formatter — this actually rejects an
// invalid check digit rather than assuming any 13-digit string is valid.

function digitsOnly(isbn: string): string {
  return isbn.replace(/[\s-]/g, "");
}

/** Computes the check digit for the first 12 digits of an ISBN-13. */
export function computeIsbn13CheckDigit(isbn12: string): number {
  const digits = digitsOnly(isbn12);
  if (!/^\d{12}$/.test(digits)) {
    throw new Error("computeIsbn13CheckDigit expects exactly 12 digits");
  }
  const sum = digits
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

/** Validates a full 13-digit ISBN, including its check digit. */
export function isValidIsbn13(isbn: string): boolean {
  const digits = digitsOnly(isbn);
  if (!/^\d{13}$/.test(digits)) return false;
  // ISBN-13s are drawn from the 978/979 Bookland EAN prefixes.
  if (!digits.startsWith("978") && !digits.startsWith("979")) return false;
  return computeIsbn13CheckDigit(digits.slice(0, 12)) === Number(digits[12]);
}

/** Formats digits as 978-X-XXXXX-XXX-X once a valid 13-digit ISBN is known. */
export function formatIsbn13(isbn: string): string {
  const digits = digitsOnly(isbn);
  if (digits.length !== 13) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 4)}-${digits.slice(4, 9)}-${digits.slice(9, 12)}-${digits.slice(12)}`;
}
