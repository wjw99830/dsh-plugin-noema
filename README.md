# Noema

English | [中文](README.zh.md)

Keep your standards in AI-assisted development

Noema is a DeepSeek Harness plugin for developers who want to stay closely involved in the code they ship. After each coding turn, it highlights structural complexity changes so you can narrow your review to the files and functions that deserve attention

## Review a turn

1. Compare cyclomatic complexity, cognitive complexity, and maximum nesting depth across changed files
2. Expand files and functions to inspect their own code under `[Top Level]` and their named child functions
3. Click an expandable file or function row to show or hide its contents

Files and functions include the complexity of all their code. Anonymous functions are included under `[Top Level]`. Named functions have separate rows. Expandable files and functions start collapsed

Unchanged code is hidden. **Show unchanged functions** reveals it within the selected file or function and then disappears. Decreases appear in green, increases in amber, and added functions use the default text color. A recursion marker identifies detected direct or mutual recursion

An amber circular icon after a file name means the earlier code could not be measured: current scores and expandable functions remain available, without differences. A red icon means the updated code could not be measured: scores show `-` and the file cannot expand. Hover over either icon for the reason

Noema supports TypeScript, TSX, Python, and Go: `.ts`, `.mts`, `.cts`, `.tsx`, `.py`, and `.go`. JavaScript and TypeScript declaration files are excluded

Turns with no changes to supported code produce no card, including chat and changes limited to comments or formatting. Entirely deleted files are omitted. Changed code with unchanged scores still appears

Analysis compares the workspace at the start and end of a turn, including concurrent edits. Results stay outside the model context

## Install

The integration targets DSH `0.1.6-alpha.2` and Cordis `4.0.2`, with Node.js `^22.19.0 || >=24.0.0`. DSH APIs are pre-stable, so use the tested version when trying the plugin

From a Noema checkout, use pnpm `11.7.0` to build and install into your Web profile:

```sh
pnpm install
dsh plugin --profile web add "$PWD"
dsh --profile web
```

`pnpm install` builds the plugin through `prepare`. Local installation links the checkout; after changes, run `pnpm build`, restart DSH, and refresh the browser. Use the same profile and `DSH_HOME` for installation and launch

Reports start with new turns after installation. To try it, ask DSH to modify a supported source file. See [Contributing](CONTRIBUTING.md) for source-checkout integration and tarball installation

## Choose files

Open **Plugins → plugin-noema → Files to analyze** in the Web sidebar

- **Include files** accepts one glob pattern per line, such as `**/*` or `src/**`
- **Exclude files** takes precedence over inclusion
- **Add common test exclusions** adds TypeScript, Python, and Go test patterns to your existing list
- **Save** applies both lists from the next turn and persists them across restarts
- **Restore defaults** previews the profile defaults; Save applies them

Settings apply to workspaces using the same DSH settings document. A running turn keeps its starting rules. Leaving the page discards unsaved edits

Patterns match case-sensitive workspace-relative paths using `/`. `**` spans directories, braces select alternatives, and dotfiles participate in matching. Each list matches any of its patterns. An empty include list disables analysis; an empty exclude list adds no exclusions beyond `.gitignore` and supported file types. Put exclusions in the exclude list

The default include pattern is `**/*`. The default exclude pattern is:

```text
**/{.git,node_modules,.artifacts,dist,build,coverage,.venv,__pycache__,.next}/**
```

### Profile configuration

Web settings override the profile's `include` and `exclude` lists. Restore defaults clears those overrides when saved. For example, this profile patch limits analysis to `src/` and skips test files:

```yaml
- id: noema
  config:
    include: ["src/**"]
    exclude:
      - "**/{.git,node_modules,.artifacts,dist,build,coverage,.venv,__pycache__,.next}/**"
      - "**/*.{test,spec}.{ts,tsx,mts,cts}"
      - "**/{test,tests,__tests__}/**"
      - "**/test_*.py"
      - "**/*_test.py"
      - "**/*_test.go"
```

Setting `exclude` replaces the default list. Profile changes require a DSH restart

Resource limits are configured on the same `noema` row:

| Field | Default | Meaning |
| --- | --- | --- |
| `max_file_bytes` | 2097152 | Maximum bytes per source or ignore file |
| `max_snapshot_bytes` | 33554432 | Maximum captured source bytes per snapshot |
| `max_files` | 2000 | Maximum candidate source files per snapshot |
| `snapshot_timeout_ms` | 10000 | Time allowed for each snapshot |
| `analysis_timeout_ms` | 15000 | Time allowed per analysis Worker, including startup |
| `max_pending_reports` | 3 | Active and queued reports together |

An incomplete scan skips the turn's report. A full queue or timeout can skip analysis; the coding task continues

## Diagnostics

`NOEMA_LOG_LEVEL` controls terminal diagnostics in both the Host and analysis Workers. The default is `warn`

| Level | Output |
| --- | --- |
| `error` | Analysis and result-saving failures |
| `warn` | Errors and warnings about skipped captures |
| `info` | Warnings, plugin readiness, and saved results |
| `debug` | All levels, plus turn events, snapshots, file comparisons, and skip reasons |

Enable detailed output for troubleshooting:

```sh
NOEMA_LOG_LEVEL=debug dsh --profile web
```

Messages use a `[noema:<level>]` prefix. Logs include session and turn identifiers, file paths, counts, selection rules, and errors. Captured source and conversation messages are omitted. Restart DSH after changing the level; starting without the variable restores `warn`

## Learn more

- [Design](docs/design.md): data flow, scoring rules, and responsibilities
- [Contributing](CONTRIBUTING.md): development, tests, and packaging

Noema is released under the [MIT License](LICENSE)
