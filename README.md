# Noema

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/wjw99830/dsh-plugin-noema)

English | [中文](README.zh.md)

Keep your standards in AI-assisted development

Noema is a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin for developers who care about the code they ship. After each coding task, it shows complexity changes to help you decide which files and functions need a closer look

![Noema showing complexity changes across a file and its functions](https://raw.githubusercontent.com/wjw99830/dsh-plugin-noema/main/docs/assets/demo.png)

## Review changes

Noema compares three metrics before and after each task:

| Metric | What it measures |
| --- | --- |
| Cyclomatic complexity | Independent paths through the code |
| Cognitive complexity | Difficulty of following control flow, accounting for branches, nesting, and recursion |
| Maximum nesting depth | Deepest nesting of control structures within a function |

Expand a file or function to locate changes within it. Its metrics include the code it contains; `[Top Level]` shows its own code separately from named child functions. Unchanged code is hidden by default and can be revealed when needed

These metrics help focus your review. Judge changes in the context of the code: a lower score alone does not mean better code

Analysis runs locally and compares the workspace at the start and end of each turn, including any manual edits made during that time. Results stay outside the model context

## Supported languages

TypeScript (including TSX), Python, and Go are supported. JavaScript and TypeScript declaration files are excluded

No card appears when there are no supported code changes, including edits limited to comments or formatting. Code changes still appear when the scores remain the same

## Install

Supports DSH `^0.1.7-rc.2 || ^0.2.0-rc.2 || ^0.2.1-alpha.1` and requires Node.js `^22.19.0 || >=24.0.0`

Install the npm package into the Web profile, then start DSH:

```sh
dsh plugin --profile web add dsh-plugin-noema
dsh web
```

If DSH is already running, restart it and refresh the browser. Noema starts analyzing new turns after installation; ask DSH to modify a supported source file to try it

## Choose files

Open **Plugins → Noema → Files to analyze** in the Web sidebar. Set include and exclude patterns relative to your workspace, such as `src/**` and `**/*.test.ts`, or use **Add common test exclusions**. Settings apply to the current Profile. Exclusions take precedence, and saved changes apply from the next turn

Noema respects `.gitignore` and excludes common dependency and build directories by default

## Learn more

- [Design](docs/design.md): analysis behavior and metric aggregation
- [Scoring](docs/scoring.md): language rules and references
- [Contributing](CONTRIBUTING.md): local development, tests, and packaging

Noema is released under the [MIT License](LICENSE)
