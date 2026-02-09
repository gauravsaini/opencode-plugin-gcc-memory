import { type Plugin, tool } from "@opencode-ai/plugin"
import * as fs from "node:fs/promises"
import * as nodePath from "node:path"

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

// Helper to check if file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

// Helper to read file safely
async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8")
  } catch {
    return ""
  }
}

// Helper to write file with directory creation
async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(nodePath.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf-8")
}

// Create GCC store bound to a specific directory
function createGccStore(projectDir: string) {
  const MEMORY_DIR = nodePath.join(projectDir, ".opencode", "memory")
  const GCC_DIR = nodePath.join(MEMORY_DIR, ".GCC")
  const CURRENT_BRANCH_FILE = nodePath.join(GCC_DIR, "current_branch")

  const getMainFile = () => nodePath.join(GCC_DIR, "main.md")
  const getBranchDir = (branch: string) => nodePath.join(GCC_DIR, "branches", branch)
  const getCommitFile = (branch: string) => nodePath.join(getBranchDir(branch), "commit.md")
  const getLogFile = (branch: string) => nodePath.join(getBranchDir(branch), "log.md")
  const getMetadataFile = (branch: string) => nodePath.join(getBranchDir(branch), "metadata.yaml")

  const ensureDir = async () => {
    await fs.mkdir(nodePath.join(GCC_DIR, "branches"), { recursive: true })
  }

  const getCurrentBranch = async (): Promise<string> => {
    if (await fileExists(CURRENT_BRANCH_FILE)) {
      return (await readFile(CURRENT_BRANCH_FILE)).trim() || "main"
    }
    return "main"
  }

  const setCurrentBranch = async (branch: string) => {
    await writeFile(CURRENT_BRANCH_FILE, branch)
  }

  return {
    GCC_DIR,
    getMainFile,
    getBranchDir,
    getCommitFile,
    getLogFile,
    getMetadataFile,
    ensureDir,
    getCurrentBranch,
    setCurrentBranch,
  }
}

export const MemoryPlugin: Plugin = async ({ directory }) => {
  // Create store bound to this project's directory
  const store = createGccStore(directory)

  // Initialize main branch on first run
  await store.ensureDir()
  
  const mainBranchDir = store.getBranchDir("main")
  await fs.mkdir(mainBranchDir, { recursive: true })

  const mainCommitFile = store.getCommitFile("main")
  if (!(await fileExists(mainCommitFile))) {
    await writeFile(
      mainCommitFile,
      `# Branch: main\n\n## Branch Purpose\nMain development branch\n\n## Previous Progress Summary\nInitialized at ${new Date().toISOString()}\n\n---\n`
    )
  }

  const mainLogFile = store.getLogFile("main")
  if (!(await fileExists(mainLogFile))) {
    await writeFile(mainLogFile, "")
  }

  // Initialize main.md if not exists
  const mainFile = store.getMainFile()
  if (!(await fileExists(mainFile))) {
    await writeFile(mainFile, "# Project Roadmap\n\nInitialized at " + new Date().toISOString() + "\n\n## Goals\n\n## Milestones\n\n")
  }

  // Helper function to generate GCC system prompt with current state
  const generateGccSystemPrompt = async (): Promise<string> => {
    const currentBranch = await store.getCurrentBranch()
    
    let roadmapSummary = ""
    const mainFilePath = store.getMainFile()
    if (await fileExists(mainFilePath)) {
      const content = await readFile(mainFilePath)
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

  // GCC Tool 1: COMMIT - Checkpoint meaningful progress
  const commitTool = tool({
    description: "GCC COMMIT: Checkpoint meaningful progress as a coherent milestone (like Git commit)",
    args: {
      message: tool.schema.string().describe("Commit message summarizing the milestone"),
      contribution: tool.schema.string().describe("Detailed description of what was achieved"),
      update_roadmap: tool.schema.boolean().optional().describe("Update main.md roadmap? (default: false)"),
    },
    async execute(args) {
      await store.ensureDir()
      const branch = await store.getCurrentBranch()
      const branchDir = store.getBranchDir(branch)
      await fs.mkdir(branchDir, { recursive: true })

      const commitFilePath = store.getCommitFile(branch)
      const logFilePath = store.getLogFile(branch)

      // Generate commit hash
      const hash = Date.now().toString(36)
      const timestamp = new Date().toISOString()

      // Read previous summary and branch purpose
      let previousSummary = ""
      let branchPurpose = branch === "main" ? "Main development branch" : `Branch: ${branch}`
      
      if (await fileExists(commitFilePath)) {
        const content = await readFile(commitFilePath)
        
        const purposeMatch = content.match(/## Branch Purpose\n([\s\S]*?)(?=\n## |$)/)
        if (purposeMatch?.[1]?.trim()) {
          branchPurpose = purposeMatch[1].trim()
        }
        
        const allCommits = content.split(/---\n\*\*Commit\*\*:/).filter(Boolean)
        if (allCommits.length > 0) {
          const lastCommit = allCommits[allCommits.length - 1] || ""
          const prevSummaryMatch = lastCommit.match(/## Previous Progress Summary\n([\s\S]*?)(?=\n## This Commit)/)
          const contributionMatch = lastCommit.match(/## This Commit's Contribution\n([\s\S]*?)(?=\n---|\n$|$)/)
          
          const prevPart = prevSummaryMatch?.[1]?.trim() || ""
          const contribPart = contributionMatch?.[1]?.trim() || ""
          
          if (prevPart && contribPart) {
            previousSummary = `${prevPart}\n- ${contribPart}`
          } else if (contribPart) {
            previousSummary = `- ${contribPart}`
          } else if (prevPart) {
            previousSummary = prevPart
          }
        }
      }

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

      const existing = await readFile(commitFilePath)
      await writeFile(commitFilePath, existing + commitEntry)
      await writeFile(logFilePath, "")

      if (args.update_roadmap) {
        const mainFilePath = store.getMainFile()
        const mainContent = await readFile(mainFilePath) || "# Project Roadmap\n\n"
        await writeFile(mainFilePath, mainContent + `\n- [${timestamp.split("T")[0]}] ${args.message}\n`)
      }

      return `✓ Committed [${hash}] on branch '${branch}': ${args.message}`
    },
  })

  // GCC Tool 2: BRANCH - Explore alternatives in isolation
  const branchTool = tool({
    description: "GCC BRANCH: Create a new branch to explore alternative approach without affecting main plan",
    args: {
      name: tool.schema.string().describe("Branch name (e.g., 'oauth-experiment')"),
      purpose: tool.schema.string().describe("Why this branch? What are you exploring?"),
    },
    async execute(args) {
      await store.ensureDir()
      const branchDir = store.getBranchDir(args.name)
      await fs.mkdir(branchDir, { recursive: true })

      const initCommit = `# Branch: ${args.name}

## Branch Purpose
${args.purpose}

## Previous Progress Summary
Branch created at ${new Date().toISOString()}

---
`
      await writeFile(store.getCommitFile(args.name), initCommit)
      await writeFile(store.getLogFile(args.name), "")
      await writeFile(store.getMetadataFile(args.name), `branch: ${args.name}\ncreated: ${new Date().toISOString()}\n`)
      await store.setCurrentBranch(args.name)

      return `✓ Created and switched to branch '${args.name}'\nPurpose: ${args.purpose}`
    },
  })

  // GCC Tool 3: MERGE
  const mergeTool = tool({
    description: "GCC MERGE: Merge a completed branch back into main (or current branch).",
    args: {
      branch: tool.schema.string().describe("Branch to merge"),
      summary: tool.schema.string().describe("Summary of branch outcome and integration"),
    },
    async execute(args) {
      await store.ensureDir()
      const currentBranch = await store.getCurrentBranch()
      const targetBranch = args.branch

      const targetCommitPath = store.getCommitFile(targetBranch)
      if (!(await fileExists(targetCommitPath))) {
        return `✗ Branch '${targetBranch}' not found`
      }

      const targetCommits = await readFile(targetCommitPath)
      const targetLog = await readFile(store.getLogFile(targetBranch))

      const purposeMatch = targetCommits.match(/## Branch Purpose\n([\s\S]*?)(?=\n## |$)/)
      const targetPurpose = purposeMatch?.[1]?.trim() || "No purpose defined"

      const currentCommitPath = store.getCommitFile(currentBranch)
      const currentLogPath = store.getLogFile(currentBranch)
      await fs.mkdir(store.getBranchDir(currentBranch), { recursive: true })

      const mergeEntry = `
---
**MERGE**: ${targetBranch} → ${currentBranch}
**Time**: ${new Date().toISOString()}

## Merge Summary
${args.summary}

## Merged Branch Purpose
${targetPurpose}

---
`

      const existingCommits = await readFile(currentCommitPath)
      await writeFile(currentCommitPath, existingCommits + mergeEntry)

      const existingLog = await readFile(currentLogPath)
      await writeFile(currentLogPath, `${existingLog}\n\n== Merged from Branch: ${targetBranch} ==\n${targetLog}\n`)

      const mainFilePath = store.getMainFile()
      const mainContent = await readFile(mainFilePath) || "# Project Roadmap\n\n"
      await writeFile(mainFilePath, mainContent + `\n- [MERGE] ${targetBranch} → ${currentBranch}: ${args.summary}\n`)

      return `✓ Merged '${targetBranch}' into '${currentBranch}'\n${args.summary}`
    },
  })

  // GCC Tool 4: CONTEXT
  const contextTool = tool({
    description: "GCC CONTEXT: Retrieve memory at multiple levels (roadmap, branch, commits, log, metadata)",
    args: {
      level: tool.schema.enum(["roadmap", "branch", "commits", "log", "metadata"]).optional().describe("Level of detail (default: roadmap)"),
      branch_name: tool.schema.string().optional().describe("Specific branch to inspect"),
      lines: tool.schema.number().optional().describe("Number of log lines to show (default: 20)"),
    },
    async execute(args) {
      await store.ensureDir()
      const currentBranch = await store.getCurrentBranch()
      const level = args.level || "roadmap"

      if (level === "roadmap") {
        const roadmap = await readFile(store.getMainFile()) || "# Project Roadmap\n\nNo roadmap yet."
        
        let branches: string[] = []
        try {
          const branchesDir = nodePath.join(store.GCC_DIR, "branches")
          branches = await fs.readdir(branchesDir)
        } catch { /* ignore */ }

        return `${roadmap}\n\n## Available Branches\nCurrent: ${currentBranch}\nAll: ${branches.join(", ") || "main"}`
      }

      if (level === "branch") {
        const branch = args.branch_name || currentBranch
        const commitPath = store.getCommitFile(branch)
        if (!(await fileExists(commitPath))) {
          return `✗ Branch '${branch}' not found`
        }
        const commits = await readFile(commitPath)
        return `# Branch: ${branch}\n\n${commits.slice(-2000)}`
      }

      if (level === "commits") {
        const branch = args.branch_name || currentBranch
        const commitPath = store.getCommitFile(branch)
        if (!(await fileExists(commitPath))) {
          return `✗ Branch '${branch}' not found`
        }
        return await readFile(commitPath)
      }

      if (level === "log") {
        const branch = args.branch_name || currentBranch
        const logPath = store.getLogFile(branch)
        if (!(await fileExists(logPath))) {
          return `✗ No logs for branch '${branch}'`
        }
        const log = await readFile(logPath)
        const logLines = log.split("\n")
        const numLines = args.lines || 20
        return `# Log for branch: ${branch}\n\n${logLines.slice(-numLines).join("\n")}`
      }

      if (level === "metadata") {
        const branch = args.branch_name || currentBranch
        const metadataPath = store.getMetadataFile(branch)
        if (!(await fileExists(metadataPath))) {
          return `✗ No metadata for branch '${branch}'`
        }
        return await readFile(metadataPath)
      }

      return "Invalid level. Use: roadmap, branch, commits, log, or metadata"
    },
  })

  // GCC Tool 5: LOG
  const logTool = tool({
    description: "GCC LOG: Append Observation-Thought-Action step to log.md (fine-grained trace)",
    args: {
      observation: tool.schema.string().optional().describe("What was observed"),
      thought: tool.schema.string().optional().describe("What the agent thought"),
      action: tool.schema.string().optional().describe("What action was taken"),
      entry: tool.schema.string().optional().describe("Or just a freeform log entry"),
    },
    async execute(args) {
      await store.ensureDir()
      const branch = await store.getCurrentBranch()
      await fs.mkdir(store.getBranchDir(branch), { recursive: true })

      const timestamp = new Date().toISOString()
      let logEntry = `\n[${timestamp}]\n`

      if (args.entry) {
        logEntry += args.entry
      } else {
        if (args.observation) logEntry += `Observation: ${args.observation}\n`
        if (args.thought) logEntry += `Thought: ${args.thought}\n`
        if (args.action) logEntry += `Action: ${args.action}\n`
      }

      const logPath = store.getLogFile(branch)
      const existing = await readFile(logPath)
      await writeFile(logPath, existing + logEntry)

      return `✓ Logged to branch '${branch}'`
    },
  })

  // GCC Tool 6: SWITCH
  const switchTool = tool({
    description: "GCC: Switch to a different branch",
    args: {
      branch: tool.schema.string().describe("Branch name to switch to"),
    },
    async execute(args) {
      await store.ensureDir()
      const commitPath = store.getCommitFile(args.branch)

      if (!(await fileExists(commitPath))) {
        return `✗ Branch '${args.branch}' does not exist. Use memory_branch to create it.`
      }

      await store.setCurrentBranch(args.branch)
      return `✓ Switched to branch '${args.branch}'`
    },
  })

  return {
    tool: {
      memory_commit: commitTool,
      memory_branch: branchTool,
      memory_merge: mergeTool,
      memory_context: contextTool,
      memory_log: logTool,
      memory_switch: switchTool,
    },
    
    // System prompt injection hook (Paper Section 2.2 requirement)
    "experimental.chat.system.transform": async (
      _input: { sessionID?: string; model?: unknown },
      output: { system: string[] }
    ) => {
      try {
        const gccPrompt = await generateGccSystemPrompt()
        const insertAt = output.system.length > 0 ? 1 : 0
        output.system.splice(insertAt, 0, gccPrompt)
      } catch (e) {
        // Silently fail if GCC not initialized yet
      }
    },
  }
}

export default MemoryPlugin
