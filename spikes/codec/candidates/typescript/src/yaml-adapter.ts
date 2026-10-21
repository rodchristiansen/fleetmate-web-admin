// Adapter code on top of the `yaml` package.
import YAML, { isScalar, isSeq, Scalar, YAMLSeq } from "yaml";
import type { Document, ToStringOptions } from "yaml";

export const PARSE = { intAsBigInt: true, keepSourceTokens: true } as const;

/** Options that stop the library reflowing long lines and padding flow collections. */
export const TUNED: ToStringOptions = {
  lineWidth: 0,
  flowCollectionPadding: false,
};

/**
 * Core-schema int and float tags whose stringify writes the scalar's original
 * source text when it still resolves to the current value. Without this,
 * `hash: 000…0` is written back as `hash: 0`.
 */
function sourcePreserving(tag: any) {
  return {
    ...tag,
    stringify(node: Scalar, ctx: any, onComment: any, onChompKeep: any) {
      const src = (node as any).source as string | undefined;
      if (src !== undefined && tag.test?.test(src)) {
        const again = tag.resolve(
          src,
          () => {},
          { intAsBigInt: typeof node.value === "bigint" },
        );
        if (
          again === node.value ||
          (typeof again === "number" &&
            Number.isNaN(again) &&
            Number.isNaN(node.value))
        )
          return src;
      }
      return tag.stringify(node, ctx, onComment, onChompKeep);
    },
  };
}
const core = new YAML.Document(null, { version: "1.2" }).schema.tags as any[];
export const PRESERVING_TAGS = core.map((t) =>
  t.tag.endsWith(":int") || t.tag.endsWith(":float") ? sourcePreserving(t) : t,
);
export const PARSE_PRESERVING = {
  ...PARSE,
  customTags: () => PRESERVING_TAGS,
} as const;

/** Library edit that keeps the scalar node (and so its quote style). */
export function setScalar(doc: Document, path: (string | number)[], v: string) {
  const n = doc.getIn(path, true);
  if (!isScalar(n)) throw new Error("not a scalar");
  n.value = v;
}
export function appendItem(
  doc: Document,
  path: (string | number)[],
  v: string,
) {
  const seq = doc.getIn(path, true);
  if (!isSeq(seq)) throw new Error("not a sequence");
  seq.add(doc.createNode(v));
}

/** Renders a string scalar in the given style, falling back to double quotes if plain would change its type. */
function renderScalar(v: string, type: Scalar["type"]): string {
  if (type === "PLAIN" || type === undefined) {
    if (YAML.parse(v) === v && !/[:#\n]|^\s|\s$/.test(v)) return v;
    type = "QUOTE_DOUBLE";
  }
  const s = new Scalar(v);
  s.type = type;
  return YAML.stringify(s, { lineWidth: 0 }).replace(/\n$/, "");
}

/** Surgical value edit: replaces only the scalar's own source range. */
export function patchScalar(
  src: string,
  doc: Document,
  path: (string | number)[],
  v: string,
): string {
  const n = doc.getIn(path, true) as Scalar;
  if (!isScalar(n) || !n.range) throw new Error("not a scalar with a range");
  if (n.type === "BLOCK_LITERAL" || n.type === "BLOCK_FOLDED")
    throw new Error("block scalars not handled in spike");
  const [start, valueEnd] = n.range;
  return src.slice(0, start) + renderScalar(v, n.type) + src.slice(valueEnd);
}

/** Surgical append: a new `- item` line after the last item's line, copying its indent. */
export function patchAppend(
  src: string,
  doc: Document,
  path: (string | number)[],
  v: string,
): string {
  const seq = doc.getIn(path, true) as YAMLSeq;
  if (!isSeq(seq) || !seq.range) throw new Error("not a sequence");
  const rendered = renderScalar(v, "PLAIN");
  const last = seq.items[seq.items.length - 1] as any;
  if (seq.flow) {
    const close = src.lastIndexOf(']', seq.range[1]);
    return src.slice(0, close) + `, ${rendered}` + src.slice(close);
  }
  const lineStart = src.lastIndexOf("\n", last.range[0]) + 1;
  const dash = src.lastIndexOf("-", last.range[0]);
  const indent = src.slice(lineStart, dash);
  let lineEnd = src.indexOf("\n", last.range[1]);
  if (lineEnd === -1) lineEnd = src.length;
  return (
    src.slice(0, lineEnd) + `\n${indent}- ${rendered}` + src.slice(lineEnd)
  );
}
