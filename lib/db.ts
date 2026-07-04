// Supabase nested selects sometimes hand back arrays for to-one joins;
// collapse to a single object so downstream code sees a stable shape.
export function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}
