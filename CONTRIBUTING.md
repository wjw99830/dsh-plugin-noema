# Contributing

English | [中文](CONTRIBUTING.zh.md)

Read the [design](docs/design.md) for the analysis flow and metric conventions

## Development

Use Node.js `^22.19.0 || >=24.0.0` and pnpm `11.7.0`

```sh
pnpm install
pnpm format
pnpm typecheck
pnpm test
```

Installation runs `prepare` to build the Host, Client, and parser resources. Grammar packages supply precompiled WASM; their unused native binding builds are disabled

To use a sibling DSH source checkout, run these commands from that checkout:

```sh
pnpm dsh plugin --profile web add ../dsh-plugin-noema
pnpm dsh web
```

After editing Noema, run `pnpm build` in the plugin directory, restart DSH, and refresh the browser

## UI development

Prefer DSH official UI components and existing UI features, following their usage in the official interface. Create custom components or add UI dependencies only when the existing components cannot meet the requirement, and explain the need in the change description. Keep layout, theme colors, interactions, and keyboard behavior consistent with the DSH interface

## Verification

| Command | Coverage |
| --- | --- |
| `pnpm format` | Format supported files under `src/` and `scripts/` |
| `pnpm clean` | Remove generated files in `lib/` |
| `pnpm build` | Clean `lib/`, compile Host and Client, copy parser resources, and bundle the Web entry |
| `pnpm typecheck` | Host and Client type checking |
| `pnpm test` | Build, scoring, snapshots, comparison, storage, Profile configuration, Remote API, Worker lifecycle, and Client behavior tests |
| `pnpm test:scoring` | Real-WASM scoring conformance cases with explicit expectations and rule sources |
| `pnpm test:package` | Pack and install production dependencies in a separate directory, then verify all parser modes and Host activation |
| `pnpm benchmark:analyzer` | Analyzer cold and warm timings across workloads, raw samples, and resource sizes |

Run type checking and tests for source changes. Run package verification when exports, build resources, dependencies, or package contents change

Scoring fixtures live in `tests/scoring/`. Each records source, explicit expected measurements, a calculation note, and rule references. Establish expectations before changing scoring code. `tests/hierarchy.test.mjs` covers nested functions, aggregation, and syntax comparisons. `pnpm test:scoring` runs both through the packaged WASM parser; `pnpm test` includes them too

The package check installs dependencies using npm, then runs with an empty `PATH` and disables network fetching in its check process. Web interaction requires a separate DSH run

## Benchmark

`pnpm benchmark:analyzer` rebuilds the analyzer and measures 12 workloads: small files, files with nested functions, callbacks and recursion, and files with 1,000 functions, across TypeScript, TSX, Python and Go. TSX workloads contain JSX

Each workload runs in 5 fresh processes, sequentially. Each process records its first analysis, discards 5 warmup calls, then records 20 warm calls. Timing covers `analyzeSource()`, including parsing, scoring and aggregation. The first call also loads the parser and grammar. Process startup and result validation are outside the timer; workspace snapshots, change comparison and UI rendering are outside this benchmark

Save runs before and after a change, or select workloads and adjust sampling:

```sh
pnpm benchmark:analyzer --output before.json
pnpm benchmark:analyzer --output after.json
pnpm benchmark:analyzer --case tsx-structured --runs 3 --warmup 5 --samples 20
```

Repeat `--case` to select several workloads. Without `--output`, each run creates a timestamped result file and prints its path. JSON results retain raw timings, minimum/median/maximum values, input hashes, source and build hashes, dependency and scoring versions, and machine information. Compare runs with the same inputs, sampling settings and environment; avoid concurrent builds or other heavy work during measurement

Memory snapshots and WASM sizes provide resource context. Memory snapshots include the whole child process and do not measure peak usage. The benchmark reports measurements without imposing a performance threshold

## Packaging

```sh
pnpm pack
dsh plugin --profile web add ./dsh-plugin-noema-0.2.0-rc.2.tgz
```

`pnpm pack` runs the build through `prepare` and writes the release tarball to the repository root. Each build replaces `lib/` with compiled code and parser resources. The package contains the compiled Host and Client, type declarations, WASM grammars and licenses, the DSH bundle patch, plugin display metadata, and public documentation. The `files` list in `package.json` controls publication

## Submitting changes

Keep changes focused and update the relevant tests and documentation. Commit `pnpm-lock.yaml` with dependency changes. Describe the resulting behavior and the verification performed

Public documents have an English default and a Chinese `.zh.md` counterpart. Update both together, keep commands and examples consistent, and check reciprocal links. README covers usage and configuration, while the design document defines analysis behavior and metric semantics

Contributions are distributed under the [MIT License](LICENSE)
