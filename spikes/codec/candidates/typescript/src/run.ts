// Codec spike harness, TypeScript on Node. Run: node src/run.ts
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as plist from "plist";
import { parse as pxmlParse } from "@plist/xml.parse";
import { serialize as pxmlWrite } from "@plist/xml.serialize";
import { parse as pbinParse } from "@plist/binary.parse";
import { serialize as pbinWrite } from "@plist/binary.serialize";
import * as bplistParser from "bplist-parser";
import bplistCreator from "bplist-creator";
import YAML from "yaml";
import { changedLines, bytesEqual, tmp } from "./diff.ts";
import {
  scanPlist,
  find,
  patchString,
  appendString,
  writePlistlib,
  toJs,
} from "./plist-scan.ts";
import {
  PARSE,
  PARSE_PRESERVING,
  TUNED,
  setScalar,
  appendItem,
  patchScalar,
  patchAppend,
} from "./yaml-adapter.ts";
import { encode, decode, same, normalise } from "./tagged-json.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const FIX = path.join(root, "fixtures");

type Edit =
  | { op: "set"; path: string[]; value: string }
  | { op: "append"; path: string[]; value: string };
type Fixture = {
  file: string;
  kind: "xml" | "binary" | "yaml";
  edit: Edit;
  comments?: string[];
};
const set = (value: string): Edit => ({
  op: "set",
  path: ["display_name"],
  value,
});
const append: Edit = {
  op: "append",
  path: ["managed_installs"],
  value: "ExampleExtra",
};

const FIXTURES: Fixture[] = [
  {
    file: "munki/pkginfo-plistlib.plist",
    kind: "xml",
    edit: set("Example Editor Pro"),
  },
  {
    file: "munki/pkginfo-handformatted.plist",
    kind: "xml",
    edit: set("Example Viewer Pro"),
    comments: ["    <!-- Edited by hand; comment must survive. -->"],
  },
  { file: "munki/manifest-plistlib.plist", kind: "xml", edit: append },
  {
    file: "munki/pkginfo-binary.plist",
    kind: "binary",
    edit: set("Example Editor Pro"),
  },
  {
    file: "munki/pkginfo.yaml",
    kind: "yaml",
    edit: set("Example CLI Pro"),
    comments: ["# Munki YAML pkginfo, invented values."],
  },
  {
    file: "cimian/pkginfo.yaml",
    kind: "yaml",
    edit: set("Example Editor Pro"),
    comments: [
      "# Cimian pkginfo, invented values.",
      'version: "2.10"   # quoted: must stay a string, not 2.1',
    ],
  },
  {
    file: "cimian/manifest.yaml",
    kind: "yaml",
    edit: append,
    comments: ["  - ExampleEditor   # all lab machines"],
  },
];

// ---------- test 1 expectations ----------
type Check = [string, (o: any) => boolean];
const isBytes = (v: any, hex: string) =>
  v instanceof Uint8Array && Buffer.from(v).toString("hex") === hex;
const PKG: Check[] = [
  ['version is string "2.10"', (o) => o.version === "2.10"],
  [
    "installed_size === 9007199254740993",
    (o) =>
      BigInt(o.installed_size) === 9007199254740993n &&
      typeof o.installed_size === "bigint",
  ],
  [
    "_metadata.creation_date is Date 2026-10-20T09:30:00Z",
    (o) =>
      o._metadata.creation_date instanceof Date &&
      o._metadata.creation_date.toISOString() === "2026-10-20T09:30:00.000Z",
  ],
  [
    "icon_data is bytes 89504e470d0a1a0a0000",
    (o) => isBytes(o.icon_data, "89504e470d0a1a0a0000"),
  ],
  [
    "unattended_install true, uninstallable false",
    (o) => o.unattended_install === true && o.uninstallable === false,
  ],
  [
    'x_unknown_site_key.nested == [1, 2.5, "three"]',
    (o) => {
      const n = o.x_unknown_site_key.nested;
      return Number(n[0]) === 1 && n[1] === 2.5 && n[2] === "three";
    },
  ],
  [
    "postinstall_script exact",
    (o) => o.postinstall_script === '#!/bin/sh\necho "done & <ok>"\nexit 0\n',
  ],
];
const CHECKS: Record<string, Check[]> = {
  "munki/pkginfo-plistlib.plist": PKG,
  "munki/pkginfo-binary.plist": PKG,
  "munki/pkginfo-handformatted.plist": [
    [
      'version "1.0", receipts[0].version "1.0"',
      (o) => o.version === "1.0" && o.receipts[0].version === "1.0",
    ],
    ["receipts[0].optional === false", (o) => o.receipts[0].optional === false],
    [
      "8 top-level keys in order",
      (o) =>
        Object.keys(o).join() ===
        "name,display_name,version,catalogs,installer_item_location,installer_type,receipts,restart_action",
    ],
  ],
  "munki/manifest-plistlib.plist": [
    [
      "managed_installs",
      (o) => o.managed_installs.join() === "ExampleEditor,ExampleViewer",
    ],
    [
      "condition text exact",
      (o) =>
        o.conditional_items[0].condition ===
        'machine_type == "laptop" AND os_vers_major >= 14',
    ],
  ],
  "munki/pkginfo.yaml": [
    [
      'version "3.0", receipts[0].version "3.0"',
      (o) => o.version === "3.0" && o.receipts[0].version === "3.0",
    ],
    ['minimum_os_version "13.0"', (o) => o.minimum_os_version === "13.0"],
    ["unattended_install true", (o) => o.unattended_install === true],
    [
      "installcheck_script exact",
      (o) =>
        o.installcheck_script ===
        "#!/bin/zsh\n# exit 0 means install is needed\n[[ -x /usr/local/bin/example ]] && exit 1\nexit 0\n",
    ],
    ["x_unknown_site_key survives", (o) => o.x_unknown_site_key === "keep-me"],
  ],
  "cimian/pkginfo.yaml": [
    [
      'version "2.10", installs[0].version "2.10.0.0"',
      (o) => o.version === "2.10" && o.installs[0].version === "2.10.0.0",
    ],
    [
      "installed_size === 9007199254740993n",
      (o) => o.installed_size === 9007199254740993n,
    ],
    [
      "unattended_install true, unattended_uninstall false",
      (o) => o.unattended_install === true && o.unattended_uninstall === false,
    ],
    [
      'minimum_os_version "10.0.19045" string',
      (o) => o.minimum_os_version === "10.0.19045",
    ],
    [
      'x_unknown_site_key.nested == [1, 2.5, "three"]',
      (o) => {
        const n = o.x_unknown_site_key.nested;
        return n[0] === 1n && n[1] === 2.5 && n[2] === "three";
      },
    ],
    [
      "installer.hash is the 64-char string",
      (o) => o.installer.hash === "0".repeat(64),
    ],
  ],
  "cimian/manifest.yaml": [
    ["managed_installs", (o) => o.managed_installs.join() === "ExampleEditor"],
    [
      "both conditional forms",
      (o) =>
        o.conditional_items[0].condition.startsWith("hostname") &&
        o.conditional_items[1].value === "IT",
    ],
  ],
};
function typeCheck(file: string, o: any) {
  const failed = CHECKS[file]
    .filter(([, f]) => {
      try {
        return !f(o);
      } catch {
        return true;
      }
    })
    .map(([d]) => d);
  return {
    pass: failed.length === 0,
    detail: failed.length
      ? `failed: ${failed.join("; ")}`
      : `all ${CHECKS[file].length} checks pass`,
  };
}

// ---------- results ----------
type Result = {
  fixture: string;
  test: number;
  codec: string;
  pass: boolean;
  detail: string;
  changed_lines?: number | null;
  ideal_changed_lines?: number;
};
const results: Result[] = [];
const rec = (r: Result) => results.push(r);
const ideal = (e: Edit) => (e.op === "set" ? 2 : 1);
const applyJs = (o: any, e: Edit) => {
  if (e.op === "set") o.display_name = e.value;
  else o.managed_installs.push(e.value);
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function rewriteTests(
  fx: Fixture,
  codec: string,
  src: string,
  parse: () => any,
  write: (o: any) => string,
  edit: (o: any, e: Edit) => void = applyJs,
  extra = "",
) {
  try {
    const out = write(parse());
    const d = changedLines(src, out);
    rec({
      fixture: fx.file,
      test: 2,
      codec,
      pass: d.changed === 0,
      changed_lines: d.changed,
      detail:
        d.changed === 0
          ? "byte-identical" + extra
          : `not identical${extra}\n${d.diff}`,
    });
  } catch (e) {
    rec({
      fixture: fx.file,
      test: 2,
      codec,
      pass: false,
      changed_lines: null,
      detail: `error: ${errMsg(e)}`,
    });
  }
  try {
    const o = parse();
    edit(o, fx.edit);
    const out = write(o);
    const d = changedLines(src, out);
    rec({
      fixture: fx.file,
      test: 3,
      codec,
      pass: d.changed === ideal(fx.edit),
      changed_lines: d.changed,
      ideal_changed_lines: ideal(fx.edit),
      detail: `${d.changed} changed lines${extra}\n${d.diff}`,
    });
    if (fx.comments) commentTest(fx, codec, out);
  } catch (e) {
    rec({
      fixture: fx.file,
      test: 3,
      codec,
      pass: false,
      changed_lines: null,
      detail: `error: ${errMsg(e)}`,
    });
  }
}

function commentTest(fx: Fixture, codec: string, out: string) {
  const lines = out.split("\n");
  const verbatim = fx.comments!.filter((c) => lines.includes(c));
  const text = fx.comments!.filter((c) =>
    out.includes(c.replace(/^.*?(#|<!--)/, "$1")),
  );
  const pass = text.length === fx.comments!.length;
  rec({
    fixture: fx.file,
    test: 4,
    codec,
    pass,
    detail: `${text.length}/${fx.comments!.length} comments survive; ${verbatim.length}/${fx.comments!.length} comment lines verbatim${text.length === 0 ? " (comments dropped by the parser)" : verbatim.length < text.length ? " (spaces before an inline comment collapsed to one)" : ""}`,
  });
}

function plutilXml(bytes: Uint8Array): string {
  const f = path.join(tmp, `bin${Math.random()}.plist`);
  fs.writeFileSync(f, bytes);
  return execFileSync("plutil", ["-convert", "xml1", "-o", "-", f]).toString();
}

// ---------- XML plist ----------
function xmlFixture(fx: Fixture) {
  const src = fs.readFileSync(path.join(FIX, fx.file), "utf8");
  const libs: [string, () => any, (o: any) => string][] = [
    ["plist@5.0.0", () => plist.parse(src), (o) => plist.build(o)],
    [
      "plist@5.0.0 indent=tab",
      () => plist.parse(src),
      (o) => plist.build(o, { indent: "\t" }) + "\n",
    ],
    [
      "@plist/xml.parse@1.1.0 + xml.serialize@1.1.1",
      () => pxmlParse(src),
      (o) => pxmlWrite(o),
    ],
  ];
  for (const [codec, parse, write] of libs) {
    const r = typeCheck(fx.file, normalise(parse(), false));
    rec({ fixture: fx.file, test: 1, codec, ...r });
    rewriteTests(fx, codec, src, parse, write);
  }
  // Adapter: own scanner (typed, spans) + plistlib-layout writer
  const adapter = "adapter: span scanner + plistlib-layout writer";
  rec({
    fixture: fx.file,
    test: 1,
    codec: adapter,
    ...typeCheck(fx.file, toJs(scanPlist(src))),
  });
  const editTree = (t: any, e: Edit) => {
    const n: any = find(t, e.path);
    if (e.op === "set") n.v = e.value;
    else n.items.push({ t: "string", v: e.value });
  };
  rewriteTests(fx, adapter, src, () => scanPlist(src), writePlistlib, editTree);
  // Test 5: surgical patch from source spans
  const surgical = "adapter: surgical span patch";
  const t = scanPlist(src);
  const out =
    fx.edit.op === "set"
      ? patchString(src, t, fx.edit.path, fx.edit.value)
      : appendString(src, t, fx.edit.path, fx.edit.value);
  const d = changedLines(src, out);
  const reparsed: any = toJs(scanPlist(out));
  const viaPlutil = execFileSync("plutil", ["-lint", "-"], { input: out })
    .toString()
    .trim();
  const ok =
    fx.edit.op === "set"
      ? reparsed.display_name === fx.edit.value
      : reparsed.managed_installs.at(-1) === fx.edit.value;
  rec({
    fixture: fx.file,
    test: 5,
    codec: surgical,
    pass: ok && d.changed === ideal(fx.edit),
    changed_lines: d.changed,
    ideal_changed_lines: ideal(fx.edit),
    detail: `${d.changed} changed lines; reparse ${ok ? "ok" : "WRONG"}; plutil -lint: ${viaPlutil}\n${d.diff}`,
  });
  if (fx.comments) commentTest(fx, surgical, out);
  // Test 6 on the typed model
  taggedJson(fx, "adapter typed model (scanPlist)", toJs(scanPlist(src)));
  taggedJson(
    fx,
    "@plist/xml.parse output (ints as number)",
    normalise(pxmlParse(src), true),
    "needs heuristic: every integral number treated as integer, so a <real>1.0</real> would come back as <integer>",
  );
}

// ---------- binary plist ----------
function binaryFixture(fx: Fixture) {
  const buf = fs.readFileSync(path.join(FIX, fx.file));
  const u8 = new Uint8Array(buf);
  const reference = normalise(
    toJs(
      scanPlist(
        fs.readFileSync(path.join(FIX, "munki/pkginfo-plistlib.plist"), "utf8"),
      ),
    ),
    false,
  );
  const refXml = plutilXml(u8);
  const ab = () =>
    buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.length,
    ) as ArrayBuffer;
  const libs: [string, () => any, (o: any) => Uint8Array][] = [
    [
      "plist@5.0.0 (parseBinary/buildBinary)",
      () => plist.parseBinary(u8),
      (o) => plist.buildBinary(o),
    ],
    [
      "@plist/binary.parse@1.1.0 + binary.serialize@1.1.0",
      () => pbinParse(ab()),
      (o) => new Uint8Array(pbinWrite(o) as ArrayBuffer),
    ],
    [
      "bplist-parser@0.5.0 + bplist-creator@0.3.0",
      () => bplistParser.parseBuffer(buf)[0],
      (o) => new Uint8Array(bplistCreator(o)),
    ],
  ];
  for (const [codec, parse, write] of libs) {
    rec({
      fixture: fx.file,
      test: 1,
      codec,
      ...typeCheck(fx.file, normalise(parse(), false)),
    });
    for (const test of [2, 3] as const) {
      try {
        const o = parse();
        if (test === 3) applyJs(o, fx.edit);
        const out = write(o);
        const identical = bytesEqual(out, u8);
        const back = normalise(
          bplistParser.parseBuffer(Buffer.from(out))[0],
          true,
        );
        const expect: any = normalise(reference, true);
        if (test === 3) applyJs(expect, fx.edit);
        const semantic = same(back, expect);
        const d = changedLines(refXml, plutilXml(out));
        const want = test === 2 ? 0 : 2;
        rec({
          fixture: fx.file,
          test,
          codec,
          pass:
            (test === 2 ? identical : true) && semantic && d.changed === want,
          changed_lines: d.changed,
          ideal_changed_lines: want,
          detail: `bytes ${identical ? "identical" : `differ (${u8.length} -> ${out.length} bytes)`}; values+key order ${semantic ? "preserved" : "CHANGED"}; changed lines measured on plutil xml1 rendering\n${d.diff}`,
        });
      } catch (e) {
        rec({
          fixture: fx.file,
          test,
          codec,
          pass: false,
          changed_lines: null,
          detail: `error: ${errMsg(e)}`,
        });
      }
    }
  }
  taggedJson(
    fx,
    "bplist-parser output (ints as number unless > 2^53)",
    normalise(bplistParser.parseBuffer(buf)[0], true),
    "needs heuristic: integral numbers treated as integers; binary real 1.0 would be misread",
  );
}

// ---------- YAML ----------
function yamlFixture(fx: Fixture) {
  const src = fs.readFileSync(path.join(FIX, fx.file), "utf8");
  const doc = YAML.parseDocument(src, PARSE);
  rec({
    fixture: fx.file,
    test: 1,
    codec: "yaml@2.9.1 intAsBigInt",
    ...typeCheck(fx.file, doc.toJS()),
  });
  const variants: [string, any, YAML.ToStringOptions][] = [
    ["yaml@2.9.1 defaults", PARSE, {}],
    [
      "yaml@2.9.1 tuned (lineWidth 0, flowCollectionPadding false)",
      PARSE,
      TUNED,
    ],
    [
      "yaml@2.9.1 tuned + source-preserving number tags",
      PARSE_PRESERVING,
      TUNED,
    ],
  ];
  for (const [codec, opts, out] of variants) {
    const parse = () => YAML.parseDocument(src, opts);
    // Node-level edit keeps the scalar node, and so its quote style.
    const editDoc = (d: any, e: Edit) =>
      e.op === "set" ? setScalar(d, e.path, e.value) : appendItem(d, e.path, e.value);
    rewriteTests(fx, codec, src, parse, (d) => d.toString(out), editDoc);
  }
  const surgical = "adapter: surgical node-range patch";
  const outS =
    fx.edit.op === "set"
      ? patchScalar(src, doc, fx.edit.path, fx.edit.value)
      : patchAppend(src, doc, fx.edit.path, fx.edit.value);
  const c = changedLines(src, outS);
  const back: any = YAML.parse(outS, { intAsBigInt: true });
  const ok =
    fx.edit.op === "set"
      ? back.display_name === fx.edit.value
      : back.managed_installs.at(-1) === fx.edit.value;
  rec({
    fixture: fx.file,
    test: 5,
    codec: surgical,
    pass: ok && c.changed === ideal(fx.edit),
    changed_lines: c.changed,
    ideal_changed_lines: ideal(fx.edit),
    detail: `${c.changed} changed lines; reparse ${ok ? "ok" : "WRONG"}\n${c.diff}`,
  });
  if (fx.comments) commentTest(fx, surgical, outS);
  taggedJson(fx, "yaml@2.9.1 toJS (intAsBigInt)", doc.toJS());
}

function taggedJson(fx: Fixture, codec: string, model: unknown, caveat = "") {
  const wire = JSON.stringify(encode(model));
  const back = decode(JSON.parse(wire));
  const pass = same(back, model);
  rec({
    fixture: fx.file,
    test: 6,
    codec,
    pass,
    detail: `${pass ? "round-trips exactly (types, key order, bytes, dates, bigints)" : "MISMATCH"}; ${wire.length} bytes of JSON${caveat ? "; " + caveat : ""}`,
  });
}

for (const fx of FIXTURES) {
  try {
    if (fx.kind === "xml") xmlFixture(fx);
    else if (fx.kind === "binary") binaryFixture(fx);
    else yamlFixture(fx);
  } catch (e) {
    rec({
      fixture: fx.file,
      test: 0,
      codec: "harness",
      pass: false,
      detail: `harness error: ${(e as Error).stack}`,
    });
  }
}

const outDir = path.join(root, "results");
fs.writeFileSync(
  path.join(outDir, "typescript.json"),
  JSON.stringify(
    { candidate: "typescript", node: process.version, results },
    null,
    2,
  ) + "\n",
);
for (const r of results)
  console.log(
    `${r.pass ? "PASS" : "FAIL"}  t${r.test}  ${r.fixture.padEnd(34)} ${r.codec.padEnd(62)} ${r.changed_lines ?? ""}  ${r.detail.split("\n")[0]}`,
  );
