# Codec spike: TypeScript on Node

Node 26 runs the `.ts` files directly through its built-in type stripping; there
is no build step. Install the pinned dependencies from the lockfile:

```
npm ci
```

Run the harness. It writes `../../results/typescript.json` and prints one line
per fixture per test:

```
node src/run.ts
```

Files:

- `src/run.ts`: fixtures, expectations, tests 1 to 6.
- `src/plist-scan.ts`: adapter code. A span-tracking XML plist scanner, the
  surgical patch functions, and a writer that reproduces Python plistlib's layout.
- `src/yaml-adapter.ts`: adapter code on the `yaml` package. Source-preserving
  number tags, node-level edits and the surgical range patch.
- `src/tagged-json.ts`: the tagged JSON encoding for the browser.
- `src/diff.ts`: changed-line counts from a real `diff -U0`.
