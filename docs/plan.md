# Plan across the three repositories

Status: proposal · 2026-10-20

## Sequencing

1. **Backend spike.** Round-trip both studios' synthetic fixtures through each
   backend candidate. Record the choice here.
2. **Adapter contract.** Write the contract in this repository, then implement
   the read-only side in both adapters against it.
3. **Read-only explorer.** Core workspace UI plus both adapters, browsing a
   synthetic Munki repo and a synthetic Cimian repo in the same build. This is
   the test that the split is right: if the UI needs a format special case, the
   contract is missing something.
4. **Safe editing.** Change sets, revisions, conflicts, and the journal in the
   core; field-level write support in each adapter.
5. **Workers.** One job contract; the Mac and Windows workers each start with
   `makecatalogs`.
6. **Studio builds.** Munki-only and Cimian-only distributions once the combined
   app works.

## What moves out of the studio plans

The studio plans in `munki-web-studio/docs` and `cimian-web-studio/docs` keep
their format, condition, and tool details. Their sections on change sets,
concurrent writes, jobs, identity, and audit become references to this
repository's architecture once it is accepted.

## Open decisions

| Decision    | Proposed default                          | What could change it                        |
| ----------- | ----------------------------------------- | ------------------------------------------- |
| Code layout | Core here; studios depend on its packages | A monorepo is simpler to change in lockstep |
| Backend     | Decided by the dual-codec spike           | —                                           |
| Deployment  | Combined app first; studio builds later   | Demand for a single-platform install first  |
| License     | Undecided; MIT matches Cimian             | Public release of either studio             |
| Visibility  | Private while planning                    | First usable release                        |
