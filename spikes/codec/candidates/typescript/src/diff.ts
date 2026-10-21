import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codec-ts-"));

let n = 0;
/** Writes both texts to temp files and counts +/- lines in a real `diff -U0`. */
export function changedLines(
  before: string,
  after: string,
): { changed: number; diff: string } {
  if (before === after) return { changed: 0, diff: "" };
  const a = path.join(tmp, `a${n}`);
  const b = path.join(tmp, `b${n++}`);
  fs.writeFileSync(a, before);
  fs.writeFileSync(b, after);
  let diff = "";
  try {
    execFileSync("diff", ["-U0", a, b]);
  } catch (e: any) {
    diff = e.stdout.toString();
  }
  const changed = diff
    .split("\n")
    .filter(
      (l) =>
        (l.startsWith("+") || l.startsWith("-")) &&
        !l.startsWith("+++") &&
        !l.startsWith("---"),
    ).length;
  return { changed, diff };
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
