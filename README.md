# Git Phase Tracker (Git Stage Flow) VS Code Extension

An interactive VS Code sidebar extension designed to visualize your Git repository files and commit movement across five distinct Git stages: **Workspace (Work)**, **Staging Area (Stage)**, **Local Repository (Local)**, **Remote Repository (Remote)**, and **Stash**. 

The extension bridges the gap between text-based Git terminals and visual pipelines, providing real-time SVG charting, accordion-style lanes, inline diff inspection, and direct command execution from your sidebar.

---

## 🎯 The Core Concept & Idea Implementation

Git is often difficult to conceptualize because changes exist in abstract zones. This extension visualizes those zones as a logical conveyor belt of files and commits:

```
[ Work ] ------------( git add )------------> [ Stage ] ------------( git commit )------------> [ Local ] ------------( git push )------------> [ Remote ]
   |                                                                                               ^
   +--( git stash )--> [ Stash ] -----------------------( git stash pop )--------------------------+
```

### The 5 Visual Stages:
1. **Workspace (Unstaged - `Work`)**: Active, untracked, or modified files in your directory.
2. **Staging Area (Staged - `Stage`)**: Changes indexed and ready to be committed.
3. **Local Repository (Unpushed - `Local`)**: Commits recorded locally but not yet pushed to the remote tracking branch.
4. **Remote Repository (Synced - `Remote`)**: Recent tracking history on the remote branch.
5. **Stash Bucket (`Stash`)**: Shelved changes saved out of the workspace for later use.

---

## 🛠️ Tech Stack & Frameworks

This extension is built to be fast, lightweight, and fully integrated with the native VS Code developer experience.

* **Core Language**: [TypeScript](https://www.typescriptlang.org/) for type-safe backend logic and command coordination.
* **VS Code Extensibility**: Native [VS Code Extension API](https://code.visualstudio.com/api), utilizing `WebviewViewProvider` to render custom sidebar UI.
* **UI & Rendering**: 
  * **HTML5**: Structured markup.
  * **Vanilla CSS (CSS Variables)**: Custom design system referencing VS Code themes (`--vscode-editor-background`, `--vscode-foreground`, etc.) to ensure seamless dark/light mode compatibility.
  * **Dynamic SVG**: Interactive flow chart that updates node styles and connection paths in real-time as files move.
* **Git CLI Integration**: Executes native `git` commands asynchronously via Node's `child_process` and parses standard porcelain outputs.

---

## 🚀 Key Features

### 1. Dynamic SVG Flowchart
* Renders an interactive graphic displaying the pipeline of your branch.
* Highlight indicators light up on nodes (`Work`, `Stage`, `Local`, `Remote`, or `Stash`) to visually reflect where active files or commits currently sit.
* Hovering over commands in the suggestion panel animates moving arrows to show file movement directions (e.g., `git stash` shows forward/down arrows from Work to Stash, while `reset --soft` shows a dashed reverse arrow).

### 2. Accordion Stage Lanes
* **Workspace**: Lists modified/untracked files with modification indicators, file paths, line add/delete counts, quick stage (`+`) button, and discard (`×`) button.
* **Staging Area**: Lists staged files with unstage (`-`) buttons, an interactive commit message input box, and a one-click commit button.
* **Local Repository**: Lists unpushed commits with author name, timestamps, and commit hash. Includes one-click options to perform `Reset Soft` or `Reset Hard` to specific commits.
* **Remote Repository**: Lists recent remote commits, keeping track of the upstream branch status.
* **Stash Bucket**: Lists stashes with quick action buttons to `Pop` (apply and drop), `Apply`, or `Drop` (delete) stashes.

### 3. Live Inline Diff Inspector
* Click any file card in the **Workspace**, **Staging**, **Local/Remote Commits**, or **Stash** to expand it inline.
* Queries Git using zero-context flags (`-U0`) to fetch raw edits, formatted beautifully with green (`+`) for additions and red (`-`) for deletions inside a scrollable box.

### 4. Interactive Git Cheat Sheet Grid
* Categorized cheat sheet sections: *Make a Change*, *Stashing*, *Undoing Things*, and *Synchronizing*.
* Clicking a command loads it into the execution panel with explanations, allows configuring parameters (e.g. file names or message targets), and executes the command directly onto your repository.

---

## 🏗️ Architecture & How It Works

```
+-----------------------------------------------------------------------------------+
|                                  VS Code Editor                                   |
+-----------------------------------------------------------------------------------+
       |                                                                    ^
       | (File System Events: Save/Create/Delete, Editor Focus Change)      | (UI actions)
       v                                                                    |
+-----------------------+           JSON State Payload           +------------------+
| extension.ts          | -------------------------------------> | webviewProvider  |
| (Main Extension Entry)|                                        | (Sidebar View)   |
+-----------------------+                                        +------------------+
       |                                                                    |
       | (Invokes Git CLI)                                                  | (Events & msgs)
       v                                                                    v
+-----------------------+                                        +------------------+
| gitHelper.ts          |                                        | HTML/CSS/JS      |
| (CLI Parser & Exec)   |                                        | (Dynamic SVG/DOM)|
+-----------------------+                                        +------------------+
```

1. **Activation & File System Watching (`src/extension.ts`)**:
   Upon activation, the extension registers the webview provider. It creates a `FileSystemWatcher` (`**/*`) and listens to document editor focus changes. Whenever a file is modified, saved, created, or deleted, it triggers an automatic state refresh in the webview.
2. **Git Parsing (`src/gitHelper.ts`)**:
   Spawns async Shell instances to execute Git operations. It uses machine-readable porcelain options:
   * `git status --porcelain -z` for fast file change tracking.
   * `git diff --numstat` for line modification numbers.
   * `git log @{u}..HEAD` / `git log -n 10 @{u}` to isolate unpushed local and synced remote commits.
   * `git stash list` and `git stash show` for stashes.
3. **Bi-directional Webview Communication (`src/webviewProvider.ts`)**:
   Serves the UI HTML to the VS Code sidebar container. It communicates with the TypeScript side via message passing:
   * **Webview ➔ Extension**: Sends request to execute commands (e.g. stage, commit, stash pop, diff).
   * **Extension ➔ Webview**: Feeds updated `GitRepoState` payload containing branch information, files, commits, and stashes.

---

## 📂 Project Structure

```
git-phase-tracker/
├── .vscode/
│   ├── launch.json       # Debug configuration for VS Code extension development
│   └── tasks.json        # TypeScript watch & compilation compiler task configuration
├── media/
│   └── icon.svg          # Extension sidebar icon
├── src/
│   ├── extension.ts      # Extension activation entry point & filesystem events watcher
│   ├── gitHelper.ts      # Spawns Git commands, parses output, and queries diff details
│   └── webviewProvider.ts # Sidebar view provider, HTML template, CSS styles, and event listeners
├── package.json          # Extension metadata, menus/views contributions, and scripts
├── tsconfig.json         # TS compiler settings (CommonJS module targeting ES2020)
└── README.md             # Project documentation
```

---

## ⚙️ Development Guide

### Prerequisites
* [Node.js](https://nodejs.org/) (v16.0.0 or higher recommended)
* [Git](https://git-scm.com/) installed and added to your system PATH

### Installation & Launching
1. Open this workspace directory in VS Code:
   ```bash
   code c:\Users\sky\Documents\projects\git-phase-tracker
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Run the TypeScript compiler watcher in the background (or press `Ctrl+Shift+B` and select `npm: watch`):
   ```bash
   npm run watch
   ```
4. Press **F5** (or navigate to *Run & Debug* panel and click **Run Extension**).
5. A new window (**Extension Development Host**) will launch.
6. Open any folder initialized as a Git repository in the new window.
7. Click the **Git Phase Tracker** icon (Git branch logo) in the Activity Bar on the left to load the sidebar visualization.
