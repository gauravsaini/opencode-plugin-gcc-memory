# GCC-Enhanced OpenCode Memory Plugin

## Summary

This plugin implements **Git-Context-Controller (GCC)** concepts from the paper "Git-Context-Controller: Manage the Context of LLM-Based Agents Like Git" (arXiv:2508.00031v1) for OpenCode memory management.

**Key Achievement**: Transforms simple memory storage into a Git-like versioned memory system with COMMIT, BRANCH, MERGE, and CONTEXT operations.

---

## What Changed: GCC Paper Integration

### Before (Original Plugin)

- Flat daily log files (`.opencode/memory/2025-02-10.logfmt`)
- Simple remember/recall/update/forget operations
- No versioning, no branching, no structured navigation

### After (GCC-Enhanced)

- **Hierarchical memory structure** (`.opencode/memory/.GCC/`)
- **Git-like operations**: COMMIT, BRANCH, MERGE, CONTEXT
- **Multi-level retrieval**: roadmap → commits → logs
- **Branch isolation** for exploring alternatives
- **Cross-session continuity** through structured metadata

---

## Architecture

### Directory Structure

```
.opencode/memory/.GCC/
├── main.md                          # Global project roadmap
├── current_branch                    # Tracks active branch
└── branches/
    ├── main/
    │   ├── commit.md                # Commit history
    │   ├── log.md                   # OTA (Observation-Thought-Action) traces
    │   └── metadata.yaml            # Branch metadata
    ├── feature-auth/
    │   ├── commit.md
    │   ├── log.md
    │   └── metadata.yaml
    └── ...
```

### Three-Tier Hierarchy

1. **High-level**: `main.md` - Project roadmap, goals, milestones
2. **Mid-level**: `commit.md` - Commit summaries per branch
3. **Low-level**: `log.md` - Fine-grained OTA execution traces

---

## New Tools

### 1. `memory_commit` - Checkpoint Progress

**GCC Paper Concept**: COMMIT operation for milestone-based checkpointing

**Usage**:

```typescript
memory_commit({
  message: "Implemented JWT authentication",
  contribution:
    "Added JWT token validation middleware, configured secret rotation, wrote unit tests",
  update_roadmap: true, // Optional: update main.md
});
```

**What it does**:

- Generates unique commit hash
- Appends to `commit.md` with structured template:
  - Branch Purpose
  - Previous Progress Summary
  - This Commit's Contribution
- Clears `log.md` (details moved to commit summary)
- Optionally updates `main.md` roadmap

**Output**: `✓ Committed [abc123] on branch 'main': Implemented JWT authentication`

---

### 2. `memory_branch` - Isolated Exploration

**GCC Paper Concept**: BRANCH operation for exploring alternatives without affecting main plan

**Usage**:

```typescript
memory_branch({
  name: "oauth-experiment",
  purpose:
    "Test OAuth2 as alternative to JWT for better third-party integration",
});
```

**What it does**:

- Creates new branch directory
- Initializes `commit.md` with branch purpose
- Creates empty `log.md` for OTA traces
- Creates `metadata.yaml` with branch info
- Automatically switches to new branch

**Output**: `✓ Created and switched to branch 'oauth-experiment'`

---

### 3. `memory_merge` - Integrate Success

**GCC Paper Concept**: MERGE operation to synthesize divergent reasoning paths

**Usage**:

```typescript
memory_merge({
  branch: "oauth-experiment",
  summary:
    "OAuth2 integration successful - better UX than JWT, merged into main",
});
```

**What it does**:

- Reads target branch commits and logs
- Merges `commit.md` entries with merge summary
- Merges `log.md` with origin tags (`== Merged from Branch: oauth-experiment ==`)
- Updates `main.md` with merge outcome
- Preserves full traceability

**Output**: `✓ Merged 'oauth-experiment' into 'main'`

---

### 4. `memory_context` - Multi-Level Retrieval

**GCC Paper Concept**: CONTEXT operation for navigable memory at varying granularities

**Usage**:

```typescript
// Show roadmap + branch list
memory_context({ level: "roadmap" });

// Show branch commits
memory_context({ level: "branch", branch_name: "oauth-experiment" });

// Show full commit history
memory_context({ level: "commits", branch_name: "main" });

// Show execution logs (last 20 lines)
memory_context({ level: "log", lines: 20 });

// Show metadata
memory_context({ level: "metadata" });
```

**Levels**:

- `roadmap`: Global overview + branch list
- `branch`: Branch purpose + last 10 commits
- `commits`: Full commit history
- `log`: Fine-grained OTA traces (scrollable)
- `metadata`: Structured branch metadata

---

### 5. `memory_log` - Fine-Grained Tracing

**GCC Paper Concept**: Continuous OTA (Observation-Thought-Action) logging

**Usage**:

```typescript
// Structured OTA
memory_log({
  observation: "Authentication endpoint returned 401",
  thought: "Token might be expired, check refresh logic",
  action: "Inspected token expiration handling code",
});

// Freeform entry
memory_log({
  entry:
    "Discovered bug in refresh token rotation - tokens not being invalidated properly",
});
```

**What it does**:

- Appends timestamped entry to `log.md`
- Supports both structured (OTA) and freeform logging
- Logs accumulate until next COMMIT (then summarized)

---

### 6. `memory_switch` - Change Branches

**Usage**:

```typescript
memory_switch({ branch: "main" });
```

**What it does**:

- Switches current working branch
- All subsequent operations (log, commit, remember) use new branch

---

## Enhanced Legacy Tools

### `memory_remember` (Adapted)

Now **automatically logs to current branch**:

```typescript
memory_remember({
  type: "decision",
  scope: "auth",
  content: "Using OAuth2 instead of JWT for better third-party integration",
  tags: ["security", "api"],
});
```

**Output**: `Remembered: decision in auth (logged to branch 'oauth-experiment')`

Appends to current branch's `log.md` for later commit summarization.

---

### `memory_recall` (Adapted)

Now **searches across commits and logs**:

```typescript
memory_recall({
  query: "authentication",
  branch_name: "main", // Optional: search specific branch
  scope: "auth",
  type: "decision",
});
```

Searches both `log.md` and `commit.md` for matches.

---

## Workflow Example

### Scenario: Implementing Authentication

```typescript
// 1. Start on main branch, add to roadmap
memory_context({ level: "roadmap" });
// Shows: Current branch: main

// 2. Log initial thoughts
memory_log({
  observation: "Need authentication for API endpoints",
  thought: "JWT vs OAuth2 trade-offs to consider",
  action: "Starting with JWT implementation",
});

// 3. Implement JWT
memory_remember({
  type: "decision",
  scope: "auth",
  content: "Implemented JWT with 24h expiration, refresh tokens enabled",
});

// 4. Commit milestone
memory_commit({
  message: "JWT authentication complete",
  contribution:
    "Implemented JWT middleware, token validation, refresh logic with unit tests",
  update_roadmap: true,
});

// 5. Want to try OAuth2 alternative
memory_branch({
  name: "oauth2-experiment",
  purpose: "Explore OAuth2 for better third-party app integration",
});

// Now on branch: oauth2-experiment

// 6. Experiment with OAuth2
memory_log({
  entry: "Integrated Google OAuth2, tested login flow",
});

memory_remember({
  type: "learning",
  scope: "auth",
  content:
    "OAuth2 provides better UX for third-party apps, but more complex to implement",
});

// 7. Commit experiment results
memory_commit({
  message: "OAuth2 integration working",
  contribution:
    "Implemented Google OAuth2 provider, tested login/logout flows, documented setup steps",
});

// 8. OAuth2 is better - merge back
memory_switch({ branch: "main" });

memory_merge({
  branch: "oauth2-experiment",
  summary:
    "OAuth2 proved superior for third-party integration. Merged as primary auth method.",
});

// 9. Review full history
memory_context({ level: "commits" });
```

---

## Benefits of GCC Integration

### 1. **Milestone-Based Organization**

- Memories organized by meaningful progress points
- Easy to find "when we decided X"
- Natural checkpoints for long projects

### 2. **Safe Exploration**

- Branch to test alternatives
- No risk to main development path
- Can abandon failed experiments cleanly

### 3. **Cross-Session Continuity**

- New sessions can call `memory_context({ level: "roadmap" })`
- See full project history + current state
- Different agents can pick up where previous left off

### 4. **Multi-Level Navigation**

- **High-level**: What's the project about? (`roadmap`)
- **Mid-level**: What milestones were hit? (`commits`)
- **Low-level**: What exact steps were taken? (`log`)

### 5. **Structured Reflection**

- Commit messages force summarization
- Branch purposes document exploration rationale
- Merge summaries capture decision outcomes

---

## GCC Paper Concepts Implemented

| Paper Concept           | Plugin Implementation       |
| ----------------------- | --------------------------- |
| `.GCC/` directory       | `.opencode/memory/.GCC/`    |
| `main.md` roadmap       | Global project roadmap file |
| `commit.md`             | Per-branch commit history   |
| `log.md`                | Per-branch OTA traces       |
| `metadata.yaml`         | Per-branch metadata         |
| COMMIT command          | `memory_commit` tool        |
| BRANCH command          | `memory_branch` tool        |
| MERGE command           | `memory_merge` tool         |
| CONTEXT command         | `memory_context` tool       |
| OTA logging             | `memory_log` tool           |
| Current branch tracking | `current_branch` file       |

---

## Comparison with Original Plugin

| Feature           | Original              | GCC-Enhanced                       |
| ----------------- | --------------------- | ---------------------------------- |
| **Structure**     | Flat daily files      | Hierarchical branches              |
| **Versioning**    | No                    | Yes (commit-based)                 |
| **Branching**     | No                    | Yes (isolated exploration)         |
| **Navigation**    | Linear search         | Multi-level (roadmap→commits→logs) |
| **Milestones**    | No checkpoints        | Explicit commits                   |
| **Experiments**   | Risky (modifies main) | Safe (branch isolation)            |
| **Cross-session** | Partial               | Full continuity                    |
| **Summarization** | Manual                | Automatic (commits)                |

---

## Use Cases

### 1. **Long-Horizon Development**

- Multi-day/week coding projects
- Commit at each completed module
- Review progress via commit history

### 2. **Architectural Exploration**

- Branch to test new design
- Compare multiple approaches in parallel
- Merge winning approach

### 3. **Research & Experiments**

- Branch per hypothesis
- Document outcomes in commits
- Abandon failed paths cleanly

### 4. **Multi-Agent Collaboration**

- Agents work on different branches
- Merge successful contributions
- Shared roadmap coordination

### 5. **Learning & Documentation**

- Commit learnings at milestones
- Branch for deep-dive investigations
- Build knowledge base over time

---

## Migration from Original Plugin

**Backward compatible!** Old tools still work:

```typescript
// Old API still works
memory_remember({ type: "decision", scope: "auth", content: "..." });
memory_recall({ query: "auth" });

// But now they log to current branch's log.md
```

### Gradual Adoption Path:

1. **Start using `memory_commit`** - checkpoint progress
2. **Try `memory_branch`** - when exploring alternatives
3. **Use `memory_context`** - for cross-session continuity
4. **Leverage `memory_log`** - for fine-grained traces

No need to rewrite existing usage - just add GCC commands when beneficial.

---

## Example: Emergent Behavior (from GCC Paper)

### Agent Spontaneously Tests Alternative

**Observed in paper**: Agent created `RAG-memory` branch to test retriever-augmented memory, evaluated it, found it underperformed, and abandoned it.

**How this plugin enables it**:

```typescript
// Agent decides to try vector-based memory
memory_branch({
  name: "vector-memory-experiment",
  purpose: "Test if vector embeddings improve recall accuracy",
});

// Experiments...
memory_log({ entry: "Integrated sentence-transformers, indexed memories" });
memory_commit({
  message: "Vector memory prototype complete",
  contribution: "Built vector index, tested semantic search",
});

// Evaluates...
memory_log({
  entry: "Vector search slower, accuracy not significantly better",
});

// Agent decides to abandon
memory_switch({ branch: "main" });
// Does NOT merge - experiment failed

// Documented in branch for future reference
memory_context({ level: "commits", branch_name: "vector-memory-experiment" });
```

**Key**: Agent can explore **without risk**, evaluate outcomes, and make informed decisions about merging.

---

## Implementation Details

### Commit Hash Generation

```typescript
const hash = Date.now().toString(36); // e.g., "lxyz123"
```

Simple, unique, sortable by time.

### Previous Progress Summary

Automatically extracted from last commit:

```typescript
const matches = content.match(
  /## Previous Progress Summary\n([\s\S]*?)\n## This Commit/,
);
previousSummary = matches[1] + args.contribution;
```

Enables cumulative summarization.

### Branch Switching

Current branch stored in `.GCC/current_branch`:

```typescript
await setCurrentBranch("oauth-experiment");
```

All operations use this as context.

---

## Testing

Type check passes:

```bash
cd opencode-plugin-simple-memory
bun run tsc --noEmit
# ✓ No errors
```

---

## Future Enhancements

### From GCC Paper Insights:

1. **Automatic Commit Detection**
   - Agent auto-commits when milestone detected
   - No manual commit invocation needed

2. **Smart Branching**
   - Agent branches when exploring alternatives
   - Self-evaluates and merges/abandons

3. **Cross-Agent Handoff**
   - Different LLMs pick up via `memory_context`
   - Seamless collaboration

4. **Conflict Resolution**
   - Handle concurrent branch edits
   - Merge conflict detection

5. **Compression**
   - Auto-compact old logs
   - Keep summaries, archive details

---

## Key Takeaways

1. **Memory structure matters** - GCC shows that HOW you organize memory is as important as WHAT you store

2. **Version control for thoughts** - Git concepts (commit, branch, merge) translate perfectly to agent memory

3. **Enables emergent behaviors** - Agents behave more systematically when given structured memory tools

4. **Cross-session continuity** - No more "re-teaching" the agent - full context persists

5. **Safe exploration** - Branch isolation removes fear of "breaking" the main plan

---

## References

- **GCC Paper**: https://arxiv.org/abs/2508.00031
- **GCC Code**: https://github.com/theworldofagents/GCC
- **Original Plugin**: https://github.com/cnicolov/opencode-plugin-simple-memory
- **OpenCode**: https://opencode.ai

---

## License

MIT (same as original plugin)
