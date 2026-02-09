# GCC-Enhanced OpenCode Memory Plugin

[![npm version](https://img.shields.io/npm/v/@gauravsaini/opencode-plugin-gcc-memory)](https://www.npmjs.com/package/@gauravsaini/opencode-plugin-gcc-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Git-Context-Controller (GCC) enhanced memory plugin for [OpenCode](https://opencode.ai). This plugin transforms simple persistent memory into a versioned, navigable reasoning hierarchy, based on the paper: [**"Git-Context-Controller: Manage the Context of LLM-Based Agents Like Git"** (arXiv:2508.00031v1)](https://arxiv.org/abs/2508.00031).

> [!IMPORTANT]
> This is a major evolution from the original `opencode-plugin-simple-memory`, introducing Git-like branching, committing, and multi-level retrieval.

## Table of Contents

- [Setup](#setup)
- [Core Concepts](#core-concepts)
- [GCC Tools](#gcc-tools)
- [Legacy Tools](#legacy-tools)
- [Example Workflow](#example-workflow)
- [Attribution](#attribution)

## Setup

1. Add the plugin to your [OpenCode config](https://opencode.ai/docs/config/):

   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "plugin": ["@gauravsaini/opencode-plugin-gcc-memory"]
   }
   ```

2. The plugin automatically injects a GCC System Prompt into the AI's context to guide its use of memory tools.

## Core Concepts

GCC organizes agent memory into a three-tiered hierarchy:

1. **High-level (`main.md`)**: Global project roadmap and milestones.
2. **Mid-level (`commit.md`)**: Structured summaries of progress per branch.
3. **Low-level (`log.md`)**: Fine-grained Observation-Thought-Action (OTA) traces.

### Memory Directory Structure

```
.opencode/memory/.GCC/
├── main.md                 # Project roadmap
├── current_branch           # Active branch marker
└── branches/
    └── [branch_name]/
        ├── commit.md        # Commit history
        ├── log.md           # OTA reasoning traces
        └── metadata.yaml    # Branch metadata
```

## GCC Tools

| Tool             | Action      | Description                                                       |
| ---------------- | ----------- | ----------------------------------------------------------------- |
| `memory_commit`  | **COMMIT**  | Checkpoint a meaningful milestone. Summarizes recent logs.        |
| `memory_branch`  | **BRANCH**  | Create a new branch to explore alternatives in isolation.         |
| `memory_merge`   | **MERGE**   | Synthesize a branch's results back into the current branch.       |
| `memory_context` | **CONTEXT** | Multi-level retrieval (roadmap, branch, commits, logs, metadata). |
| `memory_log`     | **LOG**     | Append fine-grained OTA steps to the current branch.              |
| `memory_switch`  | **SWITCH**  | Switch between existing branches.                                 |

## Legacy Tools

The original tools from `opencode-plugin-simple-memory` are still available but have been adapted to work with the GCC hierarchy:

- `memory_remember`: Stores a memory and automatically logs it to the current GCC branch.
- `memory_recall`: Searches for memories across logs and commits in specified branches.

## Example Workflow

1. **Start**: The agent reviews the `roadmap` using `memory_context`.
2. **Reason**: The agent logs fine-grained steps with `memory_log`.
3. **Commit**: Upon reaching a milestone, the agent calls `memory_commit` to summarize progress.
4. **Experiment**: To try a risky design change, the agent calls `memory_branch`.
5. **Merge**: Once the experiment succeeds, the agent calls `memory_merge` to integrate the work.

## Local Development

```bash
git clone https://github.com/gauravsaini/opencode-plugin-simple-memory.git
cd opencode-plugin-simple-memory
bun install
```

Point your OpenCode config to the local checkout:

```json
{
  "plugin": ["file:///path/to/opencode-plugin-simple-memory"]
}
```

## Attribution

This project is a heavily enhanced version of the original [opencode-plugin-simple-memory](https://github.com/cnicolov/opencode-plugin-simple-memory) created by [cnicolov](https://github.com/cnicolov).

The core architectural shift to Git-like context management is based on the research paper: [_"Git-Context-Controller: Manage the Context of LLM-Based Agents Like Git"_](https://arxiv.org/abs/2508.00031).

---

_Maintained by [gauravsaini](https://github.com/gauravsaini)_
