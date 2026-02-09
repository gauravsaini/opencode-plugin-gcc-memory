import { type Plugin, tool } from "@opencode-ai/plugin"

const MEMORY_DIR = ".opencode/memory"
const GCC_DIR = ".opencode/memory/.GCC"
const CURRENT_BRANCH_FILE = ".opencode/memory/.GCC/current_branch"

// GCC System Prompt - injected into agent context (Paper Section 2.2)
const GCC_SYSTEM_PROMPT = `
<gcc_context>
You have access to Git-Context-Controller (GCC) for managing your reasoning memory.
GCC transforms your context from a passive token stream into a navigable, versioned memory hierarchy.

## Available Commands

### COMMIT (memory_commit)
Call when you reach a meaningful milestone (implementing a function, completing a test, resolving a subgoal).
Args: message (summary), contribution (detailed description), update_roadmap (optional boolean)

### BRANCH (memory_branch)  
Call when you want to explore an alternative approach without affecting current context.
Args: name (branch name), purpose (why this branch)

### MERGE (memory_merge)
Call when a completed branch's results should be synthesized back into main.
Args: branch (branch to merge), summary (outcome and integration summary)

### CONTEXT (memory_context)
Call to retrieve project history, branch summaries, or execution logs.
Levels:
- roadmap: Project overview + branch list
- branch: Branch purpose + last 10 commits
- commits: Full commit history for a branch
- log: Fine-grained OTA traces (with optional lines param)
- metadata: Structured branch metadata

### LOG (memory_log)
Call to record Observation-Thought-Action steps for fine-grained tracing.
Args: observation, thought, action (structured) OR entry (freeform)

### SWITCH (memory_switch)
Call to switch to a different branch.
Args: branch (branch name to switch to)

## When to Use

- **COMMIT**: After implementing a feature, fixing a bug, or reaching a conclusion
- **BRANCH**: When exploring alternative approaches (e.g., new API design, different algorithm)
- **MERGE**: When a branch experiment succeeds and should be integrated
- **CONTEXT**: When resuming work, before MERGE, or when needing historical info
- **LOG**: During reasoning to record fine-grained steps between commits

## Current State
Current Branch: {{CURRENT_BRANCH}}
{{#if ROADMAP_SUMMARY}}
Project Roadmap Summary:
{{ROADMAP_SUMMARY}}
{{/if}}
</gcc_context>
`

// GCC-inspired: File paths
const getMainFile = () => Bun.file(`${GCC_DIR}/main.md`)
const getBranchDir = (branch: string) => `${GCC_DIR}/branches/${branch}`
const getCommitFile = (branch: string) => Bun.file(`${getBranchDir(branch)}/commit.md`)
const getLogFile = (branch: string) => Bun.file(`${getBranchDir(branch)}/log.md`)
const getMetadataFile = (branch: string) => Bun.file(`${getBranchDir(branch)}/metadata.yaml`)

const ensureDir = async () => {
  await Bun.$`mkdir -p ${MEMORY_DIR}`
  await Bun.$`mkdir -p ${GCC_DIR}`
  await Bun.$`mkdir -p ${GCC_DIR}/branches`
}

const getCurrentBranch = async (): Promise<string> => {
  const file = Bun.file(CURRENT_BRANCH_FILE)
  if (await file.exists()) {
    return (await file.text()).trim()
  }
  return "main"
}

const setCurrentBranch = async (branch: string) => {
  await Bun.write(CURRENT_BRANCH_FILE, branch)
}

interface Memory {
  ts: string
  type: string
  scope: string
  content: string
  issue?: string
  tags?: string[]
}

interface CommitEntry {
  hash: string
  timestamp: string
  message: string
  branch_purpose?: string
  previous_summary?: string
  contribution: string
}

// GCC Tool 1: COMMIT - Checkpoint meaningful progress
const commit = tool({
  description: "GCC COMMIT: Checkpoint meaningful progress as a coherent milestone (like Git commit)",
  args: {
    message: tool.schema.string().describe("Commit message summarizing the milestone"),
    contribution: tool.schema.string().describe("Detailed description of what was achieved"),
    update_roadmap: tool.schema.boolean().optional().describe("Update main.md roadmap? (default: false)"),
  },
  async execute(args) {
    await ensureDir()
    const branch = await getCurrentBranch()
    const branchDir = getBranchDir(branch)
    await Bun.$`mkdir -p ${branchDir}`

    const commitFile = getCommitFile(branch)
    const logFile = getLogFile(branch)

    // Generate commit hash
    const hash = Date.now().toString(36)
    const timestamp = new Date().toISOString()

    // Read previous summary and branch purpose (Paper Section 2.1)
    // commit.md structure: Branch Purpose + Previous Progress Summary + This Commit's Contribution
    let previousSummary = ""
    let branchPurpose = branch === "main" ? "Main development branch" : `Branch: ${branch}`
    
    if (await commitFile.exists()) {
      const content = await commitFile.text()
      
      // Extract branch purpose from first commit (inherited)
      const purposeMatch = content.match(/## Branch Purpose\n([\s\S]*?)(?=\n## |$)/)
      if (purposeMatch?.[1]?.trim()) {
        branchPurpose = purposeMatch[1].trim()
      }
      
      // Get the LAST commit's "Previous Progress Summary" + "This Commit's Contribution"
      // to form the NEW Previous Progress Summary (cumulative)
      const allCommits = content.split(/---\n\*\*Commit\*\*:/).filter(Boolean)
      if (allCommits.length > 0) {
        const lastCommit = allCommits[allCommits.length - 1] || ""
        const prevSummaryMatch = lastCommit.match(/## Previous Progress Summary\n([\s\S]*?)(?=\n## This Commit)/)
        const contributionMatch = lastCommit.match(/## This Commit's Contribution\n([\s\S]*?)(?=\n---|\n$|$)/)
        
        const prevPart = prevSummaryMatch?.[1]?.trim() || ""
        const contribPart = contributionMatch?.[1]?.trim() || ""
        
        // Combine: Previous + Last Contribution = New Previous
        if (prevPart && contribPart) {
          previousSummary = `${prevPart}\n- ${contribPart}`
        } else if (contribPart) {
          previousSummary = `- ${contribPart}`
        } else if (prevPart) {
          previousSummary = prevPart
        }
      }
    }

    // Append to commit.md (Paper structure: 3 blocks)
    const commitEntry = `
---
**Commit**: ${hash}
**Time**: ${timestamp}
**Message**: ${args.message}

## Branch Purpose
${branchPurpose}

## Previous Progress Summary
${previousSummary || "Initial commit"}

## This Commit's Contribution
${args.contribution}

`

    const existing = (await commitFile.exists()) ? await commitFile.text() : ""
    await Bun.write(commitFile, existing + commitEntry)

    // Clear log.md after commit (it's been summarized)
    await Bun.write(logFile, "")

    // Optionally update main.md
    if (args.update_roadmap) {
      const mainFile = getMainFile()
      const mainContent = (await mainFile.exists()) ? await mainFile.text() : "# Project Roadmap\n\n"
      await Bun.write(mainFile, mainContent + `\n- [${timestamp.split("T")[0]}] ${args.message}\n`)
    }

    return `✓ Committed [${hash}] on branch '${branch}': ${args.message}`
  },
})

// GCC Tool 2: BRANCH - Explore alternatives in isolation
const branch = tool({
  description: "GCC BRANCH: Create a new branch to explore alternative approach without affecting main plan",
  args: {
    name: tool.schema.string().describe("Branch name (e.g., 'oauth-experiment')"),
    purpose: tool.schema.string().describe("Why this branch? What are you exploring?"),
  },
  async execute(args) {
    await ensureDir()
    const branchDir = getBranchDir(args.name)
    await Bun.$`mkdir -p ${branchDir}`

    // Initialize commit.md with branch purpose
    const commitFile = getCommitFile(args.name)
    const initCommit = `# Branch: ${args.name}

## Branch Purpose
${args.purpose}

## Previous Progress Summary
Branch created at ${new Date().toISOString()}

---
`
    await Bun.write(commitFile, initCommit)

    // Initialize empty log.md
    await Bun.write(getLogFile(args.name), "")

    // Initialize metadata.yaml
    await Bun.write(getMetadataFile(args.name), `branch: ${args.name}\ncreated: ${new Date().toISOString()}\n`)

    // Switch to new branch
    await setCurrentBranch(args.name)

    return `✓ Created and switched to branch '${args.name}'\nPurpose: ${args.purpose}`
  },
})

// GCC Tool 3: MERGE - Integrate successful branch into main (Paper Section 2.2)
const merge = tool({
  description: "GCC MERGE: Merge a completed branch back into main (or current branch). Auto-retrieves target branch context before merging.",
  args: {
    branch: tool.schema.string().describe("Branch to merge"),
    summary: tool.schema.string().describe("Summary of branch outcome and integration"),
  },
  async execute(args) {
    await ensureDir()
    const currentBranch = await getCurrentBranch()
    const targetBranch = args.branch

    // Read target branch commit.md
    const targetCommitFile = getCommitFile(targetBranch)
    if (!(await targetCommitFile.exists())) {
      return `✗ Branch '${targetBranch}' not found`
    }

    const targetCommits = await targetCommitFile.text()
    const targetLogFile = getLogFile(targetBranch)
    const targetLog = (await targetLogFile.exists()) ? await targetLogFile.text() : ""

    // Paper requirement: Auto-CONTEXT on target branch before merge
    // Extract branch purpose and progress summary for context
    const purposeMatch = targetCommits.match(/## Branch Purpose\n([\s\S]*?)(?=\n## |$)/)
    const targetPurpose = purposeMatch?.[1]?.trim() || "No purpose defined"
    
    // Get last commit's contribution as summary
    const allCommits = targetCommits.split(/---\n\*\*Commit\*\*:/).filter(Boolean)
    let targetProgressSummary = ""
    if (allCommits.length > 0) {
      const lastCommit = allCommits[allCommits.length - 1] || ""
      const prevMatch = lastCommit.match(/## Previous Progress Summary\n([\s\S]*?)(?=\n## This Commit)/)
      const contribMatch = lastCommit.match(/## This Commit's Contribution\n([\s\S]*?)(?=\n---|\n$|$)/)
      targetProgressSummary = (prevMatch?.[1]?.trim() || "") + "\n- " + (contribMatch?.[1]?.trim() || "")
    }

    // Merge into current branch
    const currentCommitFile = getCommitFile(currentBranch)
    const currentLogFile = getLogFile(currentBranch)
    await Bun.$`mkdir -p ${getBranchDir(currentBranch)}`

    // Paper: Merge commit.md entries with unified structure
    const mergeEntry = `
---
**MERGE**: ${targetBranch} → ${currentBranch}
**Time**: ${new Date().toISOString()}

## Merge Summary
${args.summary}

## Merged Branch Context (Auto-Retrieved)
**Purpose**: ${targetPurpose}
**Progress**: ${targetProgressSummary}

## Merged Commits from '${targetBranch}'
${targetCommits}

---
`

    const existingCommits = (await currentCommitFile.exists()) ? await currentCommitFile.text() : ""
    await Bun.write(currentCommitFile, existingCommits + mergeEntry)

    // Paper: Merge log.md files with origin tags
    const existingLog = (await currentLogFile.exists()) ? await currentLogFile.text() : ""
    const mergedLog = `${existingLog}\n\n== Merged from Branch: ${targetBranch} ==\n${targetLog}\n`
    await Bun.write(currentLogFile, mergedLog)

    // Update main.md with merge outcome
    const mainFile = getMainFile()
    const mainContent = (await mainFile.exists()) ? await mainFile.text() : "# Project Roadmap\n\n"
    await Bun.write(mainFile, mainContent + `\n- [MERGE] ${targetBranch} → ${currentBranch}: ${args.summary}\n`)

    return `✓ Merged '${targetBranch}' into '${currentBranch}'\n\n## Target Branch Context (Auto-Retrieved)\nPurpose: ${targetPurpose}\nProgress: ${targetProgressSummary.slice(0, 200)}...\n\n${args.summary}`
  },
})

// GCC Tool 4: CONTEXT - Multi-level memory retrieval (Paper Section 2.2)
const context = tool({
  description: "GCC CONTEXT: Retrieve memory at multiple levels (roadmap, branch, commits, commit, log, metadata)",
  args: {
    level: tool.schema
      .enum(["roadmap", "branch", "commits", "commit", "log", "metadata"])
      .optional()
      .describe("Level of detail (default: roadmap)"),
    branch_name: tool.schema.string().optional().describe("Specific branch to inspect"),
    commit_hash: tool.schema.string().optional().describe("Specific commit hash to view (for level='commit')"),
    lines: tool.schema.number().optional().describe("Number of log lines to show (default: 20)"),
    offset: tool.schema.number().optional().describe("Offset for scrolling logs (default: 0)"),
  },
  async execute(args) {
    await ensureDir()
    const currentBranch = await getCurrentBranch()
    const level = args.level || "roadmap"

    if (level === "roadmap") {
      // Git status-style snapshot (Paper: project purpose, milestone progress, branch list)
      const mainFile = getMainFile()
      const roadmap = (await mainFile.exists()) ? await mainFile.text() : "# Project Roadmap\n\nNo roadmap yet."

      const branchesGlob = new Bun.Glob("*")
      const branches = await Array.fromAsync(branchesGlob.scan(`${GCC_DIR}/branches`))

      return `${roadmap}\n\n## Available Branches\nCurrent: ${currentBranch}\nAll: ${branches.join(", ") || "main"}`
    }

    if (level === "branch") {
      // Branch purpose + progress summary + last 10 commits (Paper spec)
      const branch = args.branch_name || currentBranch
      const commitFile = getCommitFile(branch)
      if (!(await commitFile.exists())) {
        return `✗ Branch '${branch}' not found`
      }

      const commits = await commitFile.text()
      
      // Extract branch purpose
      const purposeMatch = commits.match(/## Branch Purpose\n([\s\S]*?)(?=\n## |$)/)
      const purpose = purposeMatch?.[1]?.trim() || "No purpose defined"
      
      // Extract last 10 commit hashes and messages
      const commitMatches = [...commits.matchAll(/\*\*Commit\*\*: (\w+)[\s\S]*?\*\*Message\*\*: ([^\n]+)/g)]
      const lastTen = commitMatches.slice(-10).map(m => `- ${m[1]}: ${m[2]}`).join("\n")

      return `# Branch: ${branch}\n\n## Purpose\n${purpose}\n\n## Last 10 Commits\n${lastTen || "No commits yet"}`
    }

    if (level === "commits") {
      // Full commit history
      const branch = args.branch_name || currentBranch
      const commitFile = getCommitFile(branch)
      if (!(await commitFile.exists())) {
        return `✗ Branch '${branch}' not found`
      }
      return await commitFile.text()
    }

    if (level === "commit") {
      // Specific commit by hash (Paper: CONTEXT --commit <hash>)
      const branch = args.branch_name || currentBranch
      const commitFile = getCommitFile(branch)
      if (!(await commitFile.exists())) {
        return `✗ Branch '${branch}' not found`
      }
      
      if (!args.commit_hash) {
        return `✗ commit_hash required for level='commit'`
      }
      
      const commits = await commitFile.text()
      const commitBlocks = commits.split(/(?=---\n\*\*Commit\*\*:)/).filter(Boolean)
      
      const matchedCommit = commitBlocks.find(block => block.includes(`**Commit**: ${args.commit_hash}`))
      
      if (!matchedCommit) {
        return `✗ Commit '${args.commit_hash}' not found in branch '${branch}'`
      }
      
      return matchedCommit.trim()
    }

    if (level === "log") {
      // Fine-grained OTA traces with scrolling (Paper: last 20 lines, scroll up/down)
      const branch = args.branch_name || currentBranch
      const logFile = getLogFile(branch)
      if (!(await logFile.exists())) {
        return `✗ No logs for branch '${branch}'`
      }
      const log = await logFile.text()
      const logLines = log.split("\n")
      const numLines = args.lines || 20
      const offset = args.offset || 0
      
      const start = Math.max(0, logLines.length - numLines - offset)
      const end = logLines.length - offset
      
      const shownLines = logLines.slice(start, end)
      const hasMore = start > 0
      const hasLess = offset > 0
      
      return `# Log for branch: ${branch}\n(Showing lines ${start + 1}-${end} of ${logLines.length})\n${hasMore ? "[scroll up: use offset=" + (offset + numLines) + "]" : ""}\n${hasLess ? "[scroll down: use offset=" + Math.max(0, offset - numLines) + "]" : ""}\n\n${shownLines.join("\n")}`
    }

    if (level === "metadata") {
      // Structured metadata segment (Paper: file structure, env config, etc.)
      const branch = args.branch_name || currentBranch
      const metadataFile = getMetadataFile(branch)
      if (!(await metadataFile.exists())) {
        return `✗ No metadata for branch '${branch}'`
      }
      return await metadataFile.text()
    }

    return "Invalid level. Use: roadmap, branch, commits, commit, log, or metadata"
  },
})

// GCC Tool 5: LOG - Append to log.md (OTA trace)
const log = tool({
  description: "GCC LOG: Append Observation-Thought-Action step to log.md (fine-grained trace)",
  args: {
    observation: tool.schema.string().optional().describe("What was observed"),
    thought: tool.schema.string().optional().describe("What the agent thought"),
    action: tool.schema.string().optional().describe("What action was taken"),
    entry: tool.schema.string().optional().describe("Or just a freeform log entry"),
  },
  async execute(args) {
    await ensureDir()
    const branch = await getCurrentBranch()
    const logFile = getLogFile(branch)
    await Bun.$`mkdir -p ${getBranchDir(branch)}`

    const timestamp = new Date().toISOString()
    let logEntry = `\n[${timestamp}]\n`

    if (args.entry) {
      logEntry += args.entry
    } else {
      if (args.observation) logEntry += `Observation: ${args.observation}\n`
      if (args.thought) logEntry += `Thought: ${args.thought}\n`
      if (args.action) logEntry += `Action: ${args.action}\n`
    }

    const existing = (await logFile.exists()) ? await logFile.text() : ""
    await Bun.write(logFile, existing + logEntry)

    return `✓ Logged to branch '${branch}'`
  },
})

// Original tools (adapted to work with GCC)
const remember = tool({
  description: "Store a memory (decision, learning, preference, blocker, context, pattern) - auto-logs to current branch",
  args: {
    type: tool.schema
      .enum(["decision", "learning", "preference", "blocker", "context", "pattern"])
      .describe("Type of memory"),
    scope: tool.schema.string().describe("Scope/area (e.g., auth, api, mobile)"),
    content: tool.schema.string().describe("The memory content"),
    issue: tool.schema.string().optional().describe("Related GitHub issue (e.g., #51)"),
    tags: tool.schema.array(tool.schema.string()).optional().describe("Additional tags"),
  },
  async execute(args) {
    await ensureDir()
    const branch = await getCurrentBranch()

    // Log to branch log.md
    const logEntry = `
**Memory Added**: ${args.type} / ${args.scope}
Content: ${args.content}
${args.issue ? `Issue: ${args.issue}` : ""}
${args.tags?.length ? `Tags: ${args.tags.join(", ")}` : ""}
`

    const logFile = getLogFile(branch)
    await Bun.$`mkdir -p ${getBranchDir(branch)}`
    const existing = (await logFile.exists()) ? await logFile.text() : ""
    await Bun.write(logFile, existing + logEntry)

    return `Remembered: ${args.type} in ${args.scope} (logged to branch '${branch}')`
  },
})

const recall = tool({
  description: "Retrieve memories by searching logs and commits across branches",
  args: {
    query: tool.schema.string().optional().describe("Search term"),
    branch_name: tool.schema.string().optional().describe("Specific branch to search"),
    scope: tool.schema.string().optional().describe("Filter by scope"),
    type: tool.schema
      .enum(["decision", "learning", "preference", "blocker", "context", "pattern"])
      .optional()
      .describe("Filter by type"),
  },
  async execute(args) {
    await ensureDir()
    const searchBranch = args.branch_name || (await getCurrentBranch())

    const logFile = getLogFile(searchBranch)
    const commitFile = getCommitFile(searchBranch)

    let results = ""

    if (await logFile.exists()) {
      const log = await logFile.text()
      const logLines = log.split("\n").filter(Boolean)

      let filtered = logLines
      if (args.query) {
        filtered = filtered.filter((line) => line.toLowerCase().includes(args.query!.toLowerCase()))
      }
      if (args.scope) {
        filtered = filtered.filter((line) => line.includes(args.scope!))
      }
      if (args.type) {
        filtered = filtered.filter((line) => line.includes(args.type!))
      }

      if (filtered.length) {
        results += `## Log Results (${filtered.length} matches)\n${filtered.slice(-20).join("\n")}\n\n`
      }
    }

    if (await commitFile.exists()) {
      const commits = await commitFile.text()
      if (args.query && commits.toLowerCase().includes(args.query.toLowerCase())) {
        results += `## Commit Results\n${commits.slice(-1000)}\n`
      }
    }

    return results || "No matching memories found"
  },
})

const switchBranch = tool({
  description: "GCC: Switch to a different branch",
  args: {
    branch: tool.schema.string().describe("Branch name to switch to"),
  },
  async execute(args) {
    await ensureDir()
    const branchDir = getBranchDir(args.branch)
    const commitFile = getCommitFile(args.branch)

    if (!(await commitFile.exists())) {
      return `✗ Branch '${args.branch}' does not exist. Use memory_branch to create it.`
    }

    await setCurrentBranch(args.branch)
    return `✓ Switched to branch '${args.branch}'`
  },
})

// Helper function to generate GCC system prompt with current state
const generateGccSystemPrompt = async (): Promise<string> => {
  const currentBranch = await getCurrentBranch()
  
  let roadmapSummary = ""
  const mainFile = getMainFile()
  if (await mainFile.exists()) {
    const content = await mainFile.text()
    // Get first 500 chars of roadmap
    roadmapSummary = content.slice(0, 500)
    if (content.length > 500) roadmapSummary += "..."
  }
  
  return GCC_SYSTEM_PROMPT
    .replace("{{CURRENT_BRANCH}}", currentBranch)
    .replace("{{#if ROADMAP_SUMMARY}}", roadmapSummary ? "" : "<!--")
    .replace("{{/if}}", roadmapSummary ? "" : "-->")
    .replace("{{ROADMAP_SUMMARY}}", roadmapSummary)
}

export const MemoryPlugin: Plugin = async (_ctx) => {
  // Initialize main branch on first run
  await ensureDir()
  const currentBranch = await getCurrentBranch()
  const mainBranchDir = getBranchDir("main")
  await Bun.$`mkdir -p ${mainBranchDir}`

  const mainCommitFile = getCommitFile("main")
  if (!(await mainCommitFile.exists())) {
    await Bun.write(
      mainCommitFile,
      `# Branch: main\n\n## Branch Purpose\nMain development branch\n\n## Previous Progress Summary\nInitialized at ${new Date().toISOString()}\n\n---\n`
    )
  }

  const mainLogFile = getLogFile("main")
  if (!(await mainLogFile.exists())) {
    await Bun.write(mainLogFile, "")
  }

  // Initialize main.md if not exists
  const mainFile = getMainFile()
  if (!(await mainFile.exists())) {
    await Bun.write(mainFile, "# Project Roadmap\n\nInitialized at " + new Date().toISOString() + "\n\n## Goals\n\n## Milestones\n\n")
  }

  return {
    tool: {
      // GCC Core Commands
      memory_commit: commit,
      memory_branch: branch,
      memory_merge: merge,
      memory_context: context,
      memory_log: log,
      memory_switch: switchBranch,

      // Legacy commands (adapted to work with GCC)
      memory_remember: remember,
      memory_recall: recall,
    },
    
    // System prompt injection hook (Paper Section 2.2 requirement)
    // Uses OpenCode's experimental.chat.system.transform hook
    // Same pattern as opencode-agent-memory plugin (Letta-inspired)
    "experimental.chat.system.transform": async (
      _input: { sessionID?: string; model?: unknown },
      output: { system: string[] }
    ) => {
      try {
        const gccPrompt = await generateGccSystemPrompt()
        // Insert GCC context after the first system message (position 1)
        // This ensures it comes after provider header but early for salience
        const insertAt = output.system.length > 0 ? 1 : 0
        output.system.splice(insertAt, 0, gccPrompt)
      } catch (e) {
        // Silently fail if GCC not initialized yet
        console.error("GCC system prompt injection failed:", e)
      }
    },
  }
}

export default MemoryPlugin
