// Tagged JSON for the browser. Model convention: integers are bigint, reals are number.
//   bigint (safe)   -> JSON number          bigint (unsafe) -> {"$int": "9007199254740993"}
//   integral real   -> {"$real": 1}         Date -> {"$date": iso}   bytes -> {"$data": base64}
//   a dict with a "$"-prefixed or integer-like key -> {"$dict": [[k, v], ...]}
//     (integer-like keys would otherwise be reordered by JS objects)

export function encode(v: unknown): unknown {
  if (typeof v === "bigint")
    return Number.isSafeInteger(Number(v)) ? Number(v) : { $int: v.toString() };
  if (typeof v === "number")
    return Number.isInteger(v) || !Number.isFinite(v)
      ? { $real: Number.isFinite(v) ? v : String(v) }
      : v;
  if (v instanceof Date) return { $date: v.toISOString() };
  if (v instanceof Uint8Array)
    return { $data: Buffer.from(v).toString("base64") };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === "object") {
    const entries = Object.entries(v);
    if (entries.some(([k]) => k.startsWith("$") || /^(0|[1-9]\d*)$/.test(k)))
      return { $dict: entries.map(([k, x]) => [k, encode(x)]) };
    return Object.fromEntries(entries.map(([k, x]) => [k, encode(x)]));
  }
  return v;
}

export function decode(v: unknown): unknown {
  if (typeof v === "number") return Number.isInteger(v) ? BigInt(v) : v;
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === "object") {
    const o = v as Record<string, any>;
    if ("$int" in o) return BigInt(o.$int);
    if ("$real" in o) return Number(o.$real);
    if ("$date" in o) return new Date(o.$date);
    if ("$data" in o) return new Uint8Array(Buffer.from(o.$data, "base64"));
    if ("$dict" in o)
      return Object.fromEntries(
        (o.$dict as [string, unknown][]).map(([k, x]) => [k, decode(x)]),
      );
    return Object.fromEntries(
      Object.entries(o).map(([k, x]) => [k, decode(x)]),
    );
  }
  return v;
}

/** Strict equality: same JS types, same key order, same bytes and instants. */
export function same(a: unknown, b: unknown): boolean {
  if (typeof a !== typeof b) return false;
  if (a instanceof Date)
    return b instanceof Date && a.getTime() === b.getTime();
  if (a instanceof Uint8Array)
    return (
      b instanceof Uint8Array &&
      a.length === b.length &&
      a.every((x, i) => x === b[i])
    );
  if (Array.isArray(a))
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((x, i) => same(x, b[i]))
    );
  if (a && typeof a === "object") {
    const ka = Object.keys(a),
      kb = Object.keys(b as object);
    return (
      ka.length === kb.length &&
      ka.every((k, i) => k === kb[i] && same((a as any)[k], (b as any)[k]))
    );
  }
  return Object.is(a, b);
}

/** Library outputs differ: normalise Buffer/ArrayBuffer to Uint8Array and safe-integer numbers to bigint. */
export function normalise(v: unknown, intsAreNumbers: boolean): unknown {
  if (typeof v === "number" && intsAreNumbers && Number.isInteger(v))
    return BigInt(v);
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (v instanceof Uint8Array) return new Uint8Array(v);
  if (v instanceof Date) return v;
  if (Array.isArray(v)) return v.map((x) => normalise(x, intsAreNumbers));
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, normalise(x, intsAreNumbers)]),
    );
  return v;
}
