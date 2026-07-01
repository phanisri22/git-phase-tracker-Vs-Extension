# Walkthrough: Git Phase Tracker Extension

We have successfully created, configured, and compiled the **Git Phase Tracker (Git Stage Flow)** VS Code extension inside `c:\Users\sky\Documents\projects\git-phase-tracker\`.

---

## 📂 Project Structure Created

The extension is organized as follows:
*   [package.json](file:///c:/Users/sky/Documents/projects/git-phase-tracker/package.json): Defines extension activation events, contributes the Sidebar webview view, and maps the manual refresh command.
*   [tsconfig.json](file:///c:/Users/sky/Documents/projects/git-phase-tracker/tsconfig.json): TypeScript configuration file for compiler options.
*   [src/extension.ts](file:///c:/Users/sky/Documents/projects/git-phase-tracker/src/extension.ts): Entry point of the extension. Starts the Webview, registers commands, and sets up event watchers to auto-refresh the sidebar whenever files are modified, saved, or created.
*   [src/gitHelper.ts](file:///c:/Users/sky/Documents/projects/git-phase-tracker/src/gitHelper.ts): Orchestrates shell commands (such as `git status`, `git diff`, `git log`, `git stash`, etc.) and processes results into clean data objects.
*   [src/webviewProvider.ts](file:///c:/Users/sky/Documents/projects/git-phase-tracker/src/webviewProvider.ts): Sets up the WebviewView provider, manages bi-directional message routing, and serves the HTML interface.
*   `.vscode/` folder containing:
    *   [launch.json](file:///c:/Users/sky/Documents/projects/git-phase-tracker/.vscode/launch.json): Pre-configured debugging scripts.
    *   [tasks.json](file:///c:/Users/sky/Documents/projects/git-phase-tracker/.vscode/tasks.json): Pre-configured compilation scripts.
*   [README.md](file:///c:/Users/sky/Documents/projects/git-phase-tracker/README.md): Practical steps explaining installation and operation.

---

## 🎨 UI & Features Implemented

1.  **5-Phase SVG Flowchart**:
    *   Renders node elements for **Workspace (Work)**, **Staging (Stage)**, **Local Repo (Local)**, **Remote Repo (Remote)**, and **Stash**.
    *   Updates styling dynamically depending on where active changes sit in the repository.
2.  **Accordion File & Commit Lanes**:
    *   **Workspace**: Renders changed files, modification indicators, line counts, staging actions, and line-level diff drop-downs.
    *   **Staging Area**: Renders staged files, un-staging options, line diffs, and a text box to commit changes.
    *   **Local Repository**: Renders unpushed commits. Clicking a commit reveals files inside it, and clicking a file reveals the specific lines added/deleted in that commit. Has buttons to perform **Soft** or **Hard Resets**.
    *   **Remote Repository**: Lists synced commits. Shows files and file diffs on-click.
    *   **Stashes**: Lists stash entries with options to **Pop**, **Apply**, or **Drop**.
3.  **Live Line-Level Diff Inspector**:
    *   Clicking a file queries a custom git diff using zero-context flags (`-U0`) and renders lines in red/green matching standard Git formats inside the panel.
4.  **Interactive Suggestions & Cheat Sheet Grid**:
    *   Categorized grid commands (Make a Change, Stashing, Undoing Things, Syncing).
    *   Hovering over commands animates arrows and paths on the SVG flowchart showing the flow direction (e.g. `stash` shows `Workspace` ➔ `Stash`, `reset --soft` shows `Local Repo` ➔ `Staging` backward dashed flow).
    *   Clicking commands opens a form where users can supply parameters (file names, targets) and execute them safely.

---

## 🧪 Build & Compilation Verification

We verified that the extension compiles without errors:
```bash
> tsc -p ./
# Completed successfully with no compiler diagnostics or errors!
```

---

## ⚙️ How to Try It Out

1.  Open the [git-phase-tracker](file:///c:/Users/sky/Documents/projects/git-phase-tracker/) folder in a new VS Code window.
2.  Press **F5** to start. A new VS Code debugging host window will open.
3.  Open any Git-initialized project folder in this new window.
4.  Open the **Git Phase Tracker** tab in the sidebar (look for the Git Branch icon) and test your files and commits!
