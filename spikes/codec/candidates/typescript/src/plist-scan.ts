// Adapter code, not a library: a span-tracking XML plist scanner.
// It yields a typed tree (integer vs real kept apart, integers as bigint)
// in which every value records its source offsets, so an edit can patch
// only the bytes that changed.

export type PNode =
  | {
      t: "dict";
      start: number;
      end: number;
      entries: { key: string; node: PNode }[];
    }
  | { t: "array"; start: number; end: number; items: PNode[] }
  | {
      t: "string";
      start: number;
      end: number;
      cStart: number;
      cEnd: number;
      v: string;
    }
  | { t: "integer"; start: number; end: number; v: bigint }
  | { t: "real"; start: number; end: number; v: number; raw: string }
  | { t: "date"; start: number; end: number; v: Date }
  | { t: "data"; start: number; end: number; v: Uint8Array }
  | { t: "bool"; start: number; end: number; v: boolean };

const ENT: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};
export const unescapeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(
          e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1),
        )
      : (ENT[e] ?? m),
  );
export const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function scanPlist(src: string): PNode {
  let i = 0;
  const skip = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src.startsWith("<!--", i)) i = src.indexOf("-->", i) + 3;
      else if (src.startsWith("<?", i)) i = src.indexOf("?>", i) + 2;
      else if (src.startsWith("<!DOCTYPE", i)) i = src.indexOf(">", i) + 1;
      else return;
    }
  };
  const tag = () => {
    skip();
    const m = /^<(\/?)(\w+)[^>]*?(\/?)>/.exec(src.slice(i, i + 200));
    if (!m) throw new Error(`expected tag at ${i}`);
    const r = {
      close: m[1] === "/",
      name: m[2],
      empty: m[3] === "/",
      start: i,
      end: i + m[0].length,
    };
    i = r.end;
    return r;
  };
  const text = (name: string) => {
    const close = src.indexOf(`</${name}>`, i);
    const r = { cStart: i, cEnd: close, raw: src.slice(i, close) };
    i = close + name.length + 3;
    return r;
  };
  const value = (): PNode => {
    const o = tag();
    const start = o.start;
    switch (o.name) {
      case "dict": {
        const entries: { key: string; node: PNode }[] = [];
        if (!o.empty)
          for (;;) {
            const k = tag();
            if (k.close) break;
            entries.push({ key: unescapeXml(text("key").raw), node: value() });
          }
        return { t: "dict", start, end: i, entries };
      }
      case "array": {
        const items: PNode[] = [];
        if (!o.empty)
          for (;;) {
            skip();
            if (src.startsWith("</array>", i)) {
              i += 8;
              break;
            }
            items.push(value());
          }
        return { t: "array", start, end: i, items };
      }
      case "string": {
        if (o.empty)
          return { t: "string", start, end: i, cStart: i, cEnd: i, v: "" };
        const r = text("string");
        return {
          t: "string",
          start,
          end: i,
          cStart: r.cStart,
          cEnd: r.cEnd,
          v: unescapeXml(r.raw),
        };
      }
      case "integer":
        return {
          t: "integer",
          start,
          v: BigInt(text("integer").raw.trim()),
          end: i,
        };
      case "real": {
        const raw = text("real").raw.trim();
        return { t: "real", start, v: parseFloat(raw), raw, end: i };
      }
      case "date":
        return {
          t: "date",
          start,
          v: new Date(text("date").raw.trim()),
          end: i,
        };
      case "data":
        return {
          t: "data",
          start,
          v: o.empty
            ? new Uint8Array()
            : Buffer.from(text("data").raw.replace(/\s+/g, ""), "base64"),
          end: i,
        };
      case "true":
      case "false":
        return { t: "bool", start, end: i, v: o.name === "true" };
      case "plist": {
        const v = value();
        tag();
        return v;
      }
    }
    throw new Error(`unknown element <${o.name}>`);
  };
  return value();
}

export function find(node: PNode, path: (string | number)[]): PNode {
  let n = node;
  for (const p of path) {
    if (n.t === "dict") n = n.entries.find((e) => e.key === p)!.node;
    else if (n.t === "array") n = n.items[p as number];
    else throw new Error("bad path");
    if (!n) throw new Error(`missing ${p}`);
  }
  return n;
}

/** Surgical value edit: replaces only the text between <string> and </string>. */
export function patchString(
  src: string,
  root: PNode,
  path: (string | number)[],
  v: string,
): string {
  const n = find(root, path);
  if (n.t !== "string") throw new Error("not a string");
  if (n.cStart === n.cEnd && src.slice(n.start, n.end).endsWith("/>"))
    return (
      src.slice(0, n.start) +
      `<string>${escapeXml(v)}</string>` +
      src.slice(n.end)
    );
  return src.slice(0, n.cStart) + escapeXml(v) + src.slice(n.cEnd);
}

/** Surgical append: a new <string> line after the last item, copying its indentation. */
export function appendString(
  src: string,
  root: PNode,
  path: (string | number)[],
  v: string,
): string {
  const n = find(root, path);
  if (n.t !== "array" || n.items.length === 0)
    throw new Error("needs a non-empty array");
  const last = n.items[n.items.length - 1];
  const lineStart = src.lastIndexOf("\n", last.start) + 1;
  const indent = src.slice(lineStart, last.start);
  return (
    src.slice(0, last.end) +
    `\n${indent}<string>${escapeXml(v)}</string>` +
    src.slice(last.end)
  );
}

/** A writer that reproduces Python plistlib's XML layout (what makepkginfo writes). */
export function writePlistlib(root: PNode): string {
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
  ];
  const w = (n: PNode, ind: string) => {
    switch (n.t) {
      case "dict":
        if (!n.entries.length) return out.push(`${ind}<dict/>`);
        out.push(`${ind}<dict>`);
        for (const e of n.entries) {
          out.push(`${ind}\t<key>${escapeXml(e.key)}</key>`);
          w(e.node, ind + "\t");
        }
        return out.push(`${ind}</dict>`);
      case "array":
        if (!n.items.length) return out.push(`${ind}<array/>`);
        out.push(`${ind}<array>`);
        for (const c of n.items) w(c, ind + "\t");
        return out.push(`${ind}</array>`);
      case "string":
        return out.push(`${ind}<string>${escapeXml(n.v)}</string>`);
      case "integer":
        return out.push(`${ind}<integer>${n.v}</integer>`);
      case "real":
        return out.push(`${ind}<real>${n.raw}</real>`);
      case "bool":
        return out.push(`${ind}<${n.v}/>`);
      case "date":
        return out.push(
          `${ind}<date>${n.v.toISOString().replace(/\.\d{3}Z$/, "Z")}</date>`,
        );
      case "data": {
        const width = Math.max(16, 76 - ind.replace(/\t/g, "        ").length);
        const chunk = Math.floor(width / 4) * 3;
        out.push(`${ind}<data>`);
        for (let o = 0; o < n.v.length; o += chunk)
          out.push(
            ind + Buffer.from(n.v.subarray(o, o + chunk)).toString("base64"),
          );
        return out.push(`${ind}</data>`);
      }
    }
  };
  w(root, "");
  out.push("</plist>", "");
  return out.join("\n");
}

/** Typed tree to a plain JS value (bigint integers, Uint8Array data). */
export function toJs(n: PNode): unknown {
  switch (n.t) {
    case "dict":
      return Object.fromEntries(n.entries.map((e) => [e.key, toJs(e.node)]));
    case "array":
      return n.items.map(toJs);
    default:
      return n.v;
  }
}
