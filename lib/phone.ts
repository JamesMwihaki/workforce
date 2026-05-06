// Normalize a US/CA-style phone string into E.164 (+1XXXXXXXXXX).
// We deliberately keep this dumb — Chipotle stores in this cluster are all
// US/CA, so we don't need full international parsing.
export function toE164US(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (input.startsWith('+') && digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}
