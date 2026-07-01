import * as vscode from 'vscode';
import * as path from 'path';
import * as gitHelper from './gitHelper';

export class GitPhaseTrackerProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'gitPhaseTrackerView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Receive messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!rootPath) {
                this._postMessage({ type: 'error', message: 'No workspace open' });
                return;
            }

            const repoRoot = await gitHelper.getRepoRoot(rootPath);
            if (!repoRoot && data.type !== 'initRepo') {
                this._postMessage({ type: 'notARepo' });
                return;
            }

            try {
                switch (data.type) {
                    case 'ready':
                        await this.refreshState();
                        break;
                    case 'refresh':
                        await this.refreshState();
                        break;
                    case 'initRepo':
                        const initRes = await gitHelper.executeGitCommand(rootPath, 'init', []);
                        if (initRes.success) {
                            vscode.window.showInformationMessage('Git repository initialized!');
                            await this.refreshState();
                        } else {
                            vscode.window.showErrorMessage(`Failed to initialize repository: ${initRes.output}`);
                        }
                        break;
                    case 'stageFile':
                        await gitHelper.executeGitCommand(repoRoot, 'add', [data.file]);
                        await this.refreshState();
                        break;
                    case 'stageAll':
                        await gitHelper.executeGitCommand(repoRoot, 'add', ['.']);
                        await this.refreshState();
                        break;
                    case 'unstageFile':
                        await gitHelper.executeGitCommand(repoRoot, 'restore', ['--staged', data.file]);
                        await this.refreshState();
                        break;
                    case 'commit':
                        const commitRes = await gitHelper.executeGitCommand(repoRoot, 'commit', ['-m', data.message]);
                        if (commitRes.success) {
                            vscode.window.showInformationMessage('Committed successfully!');
                        } else {
                            vscode.window.showErrorMessage(`Commit failed: ${commitRes.output}`);
                        }
                        await this.refreshState();
                        break;
                    case 'push':
                        vscode.window.withProgress({
                            location: vscode.ProgressLocation.Notification,
                            title: "Pushing changes to remote...",
                            cancellable: false
                        }, async () => {
                            const pushRes = await gitHelper.executeGitCommand(repoRoot, 'push', []);
                            if (pushRes.success) {
                                vscode.window.showInformationMessage('Pushed successfully!');
                            } else {
                                vscode.window.showErrorMessage(`Push failed: ${pushRes.output}`);
                            }
                            await this.refreshState();
                        });
                        break;
                    case 'pull':
                        vscode.window.withProgress({
                            location: vscode.ProgressLocation.Notification,
                            title: "Pulling changes from remote...",
                            cancellable: false
                        }, async () => {
                            const pullRes = await gitHelper.executeGitCommand(repoRoot, 'pull', []);
                            if (pullRes.success) {
                                vscode.window.showInformationMessage('Pulled successfully!');
                            } else {
                                vscode.window.showErrorMessage(`Pull failed: ${pullRes.output}`);
                            }
                            await this.refreshState();
                        });
                        break;
                    case 'gitReset':
                        const resetArgs = [`--${data.resetType}`];
                        if (data.target) {
                            resetArgs.push(data.target);
                        } else {
                            resetArgs.push('HEAD~1');
                        }
                        const resetRes = await gitHelper.executeGitCommand(repoRoot, 'reset', resetArgs);
                        if (resetRes.success) {
                            vscode.window.showInformationMessage(`Reset (${data.resetType}) completed!`);
                        } else {
                            vscode.window.showErrorMessage(`Reset failed: ${resetRes.output}`);
                        }
                        await this.refreshState();
                        break;
                    case 'gitRestore':
                        const restoreRes = await gitHelper.executeGitCommand(repoRoot, 'restore', [data.file]);
                        if (restoreRes.success) {
                            vscode.window.showInformationMessage(`Discarded changes in ${data.file}`);
                        } else {
                            vscode.window.showErrorMessage(`Discard failed: ${restoreRes.output}`);
                        }
                        await this.refreshState();
                        break;
                    case 'stashSave':
                        const stashSaveRes = await gitHelper.executeGitCommand(repoRoot, 'stash', ['push', '-m', data.message || 'Quick Stash']);
                        if (stashSaveRes.success) {
                            vscode.window.showInformationMessage('Stashed changes!');
                        } else {
                            vscode.window.showErrorMessage(`Stash failed: ${stashSaveRes.output}`);
                        }
                        await this.refreshState();
                        break;
                    case 'stashPop':
                        const stashPopRes = await gitHelper.executeGitCommand(repoRoot, 'stash', ['pop', data.id]);
                        if (stashPopRes.success) {
                            vscode.window.showInformationMessage('Stash applied and removed!');
                        } else {
                            vscode.window.showErrorMessage(`Stash pop failed: ${stashPopRes.output}`);
                        }
                        await this.refreshState();
                        break;
                    case 'stashApply':
                        const stashApplyRes = await gitHelper.executeGitCommand(repoRoot, 'stash', ['apply', data.id]);
                        if (stashApplyRes.success) {
                            vscode.window.showInformationMessage('Stash applied!');
                        } else {
                            vscode.window.showErrorMessage(`Stash apply failed: ${stashApplyRes.output}`);
                        }
                        await this.refreshState();
                        break;
                    case 'stashDrop':
                        const stashDropRes = await gitHelper.executeGitCommand(repoRoot, 'stash', ['drop', data.id]);
                        if (stashDropRes.success) {
                            vscode.window.showInformationMessage('Stash deleted!');
                        } else {
                            vscode.window.showErrorMessage(`Stash drop failed: ${stashDropRes.output}`);
                        }
                        await this.refreshState();
                        break;
                    case 'getDiff':
                        const diffContent = await gitHelper.getFileDiff(repoRoot, data.file, data.diffType, data.hashOrId);
                        this._postMessage({
                            type: 'diffResult',
                            file: data.file,
                            diffType: data.diffType,
                            diff: diffContent
                        });
                        break;
                    case 'getCommitFiles':
                        const commitFiles = await gitHelper.getFilesInCommit(repoRoot, data.hash);
                        this._postMessage({
                            type: 'commitFilesResult',
                            hash: data.hash,
                            files: commitFiles
                        });
                        break;
                    case 'getStashFiles':
                        const stashFiles = await gitHelper.getFilesInStash(repoRoot, data.id);
                        this._postMessage({
                            type: 'stashFilesResult',
                            id: data.id,
                            files: stashFiles
                        });
                        break;
                    case 'executeCustomCommand':
                        const customRes = await gitHelper.executeGitCommand(repoRoot, data.command, data.args);
                        if (customRes.success) {
                            vscode.window.showInformationMessage(`Executed git ${data.command}`);
                        } else {
                            vscode.window.showErrorMessage(`Command failed: ${customRes.output}`);
                        }
                        await this.refreshState();
                        break;
                }
            } catch (e: any) {
                this._postMessage({ type: 'error', message: e.message || 'An error occurred' });
            }
        });
    }

    public async refreshState() {
        if (!this._view) { return; }

        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!rootPath) {
            this._postMessage({ type: 'noWorkspace' });
            return;
        }

        const repoRoot = await gitHelper.getRepoRoot(rootPath);
        if (!repoRoot) {
            this._postMessage({ type: 'notARepo' });
            return;
        }

        const state = await gitHelper.getGitState(repoRoot);
        if (state) {
            this._postMessage({ type: 'gitState', state });
        } else {
            this._postMessage({ type: 'error', message: 'Failed to fetch git state' });
        }
    }

    private _postMessage(message: any) {
        this._view?.webview.postMessage(message);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Git Stage Flow</title>
    <style>
        :root {
            --spacing-unit: 8px;
            --border-radius: 6px;
            --primary-blue: #4fc1ff;
            --git-added: #85e89d;
            --git-added-bg: rgba(40, 167, 69, 0.15);
            --git-deleted: #f97583;
            --git-deleted-bg: rgba(220, 53, 69, 0.15);
            --git-modified: #ffab70;
            --card-bg: var(--vscode-sideBar-background);
            --hover-bg: var(--vscode-list-hoverBackground);
            --border-color: var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
        }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            padding: 8px;
            margin: 0;
            user-select: none;
            font-size: var(--vscode-font-size, 13px);
            line-height: 1.4;
        }

        h3, h4 {
            margin: 0 0 8px 0;
            font-weight: 600;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 8px;
            margin-bottom: 10px;
        }

        .branch-info {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .branch-name {
            font-weight: bold;
            color: var(--vscode-notifications-infoIcon-foreground, var(--primary-blue));
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .tracking-name {
            font-size: 11px;
            opacity: 0.7;
        }

        .refresh-btn {
            background: none;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: var(--border-radius);
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .refresh-btn:hover {
            background-color: var(--hover-bg);
        }

        /* SVG Flow Chart styling */
        .flow-container {
            background-color: rgba(0, 0, 0, 0.1);
            border-radius: var(--border-radius);
            border: 1px solid var(--border-color);
            padding: 8px 4px;
            margin-bottom: 12px;
        }

        .flow-svg {
            width: 100%;
            height: auto;
            overflow: visible;
        }

        .flow-node circle {
            transition: stroke 0.3s, fill 0.3s, r 0.3s;
        }

        .flow-node text {
            pointer-events: none;
            font-family: inherit;
            font-weight: bold;
        }

        .flow-node.active circle {
            stroke: var(--primary-blue);
            fill: rgba(79, 193, 255, 0.1);
            r: 20;
        }

        .flow-node.active text {
            fill: var(--primary-blue);
        }

        .flow-path {
            stroke: var(--vscode-descriptionForeground);
            stroke-width: 2;
            fill: none;
            transition: stroke 0.3s, stroke-width 0.3s, stroke-dasharray 0.3s;
        }

        .flow-path.active {
            stroke: var(--primary-blue);
            stroke-width: 3.5;
            stroke-dasharray: none;
            filter: drop-shadow(0px 0px 3px var(--primary-blue));
        }

        .flow-path.reverse-active {
            stroke: #f97583;
            stroke-width: 3.5;
            stroke-dasharray: 4,4;
            animation: dash 1s linear infinite;
        }

        @keyframes dash {
            to {
                stroke-dashoffset: -20;
            }
        }

        /* Accordion Lanes */
        .lane {
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius);
            margin-bottom: 8px;
            background-color: rgba(255, 255, 255, 0.02);
            overflow: hidden;
        }

        .lane-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background-color: rgba(0, 0, 0, 0.15);
            cursor: pointer;
            font-weight: bold;
        }

        .lane-header:hover {
            background-color: rgba(0, 0, 0, 0.25);
        }

        .lane-count {
            background-color: var(--hover-bg);
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 11px;
        }

        .lane-content {
            display: none;
            padding: 8px;
            flex-direction: column;
            gap: 6px;
            max-height: 400px;
            overflow-y: auto;
            border-top: 1px solid var(--border-color);
        }

        .lane.expanded .lane-content {
            display: flex;
        }

        /* Cards inside lanes */
        .card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius);
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 4px;
            cursor: pointer;
            transition: border-color 0.2s;
        }

        .card:hover {
            border-color: var(--vscode-focusBorder);
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 6px;
        }

        .file-info {
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
            flex-grow: 1;
        }

        .file-name {
            font-weight: 500;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .file-path {
            font-size: 11px;
            opacity: 0.6;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .badge {
            font-size: 9px;
            font-weight: bold;
            padding: 1px 4px;
            border-radius: 3px;
            text-transform: uppercase;
        }

        .badge.modified { color: var(--git-modified); border: 1px solid var(--git-modified); }
        .badge.added { color: var(--git-added); border: 1px solid var(--git-added); }
        .badge.deleted { color: var(--git-deleted); border: 1px solid var(--git-deleted); }
        .badge.untracked { color: var(--primary-blue); border: 1px solid var(--primary-blue); }

        .diff-stats {
            display: flex;
            gap: 6px;
            font-size: 11px;
        }

        .stat-add { color: var(--git-added); font-weight: bold; }
        .stat-del { color: var(--git-deleted); font-weight: bold; }

        .card-actions {
            display: flex;
            gap: 4px;
        }

        .action-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            padding: 2px 6px;
            font-size: 11px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
        }

        .action-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .action-btn.secondary {
            background-color: var(--hover-bg);
            color: var(--vscode-foreground);
        }

        /* Staging forms */
        .commit-form {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 6px 0;
            border-top: 1px dashed var(--border-color);
        }

        .commit-input {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, var(--border-color));
            border-radius: 4px;
            padding: 6px;
            font-size: 12px;
            outline: none;
        }

        .commit-input:focus {
            border-color: var(--vscode-focusBorder);
        }

        .wide-btn {
            width: 100%;
            padding: 6px;
        }

        /* Diffs box inside expanded cards */
        .diff-container {
            display: none;
            background-color: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.2));
            border-radius: 4px;
            border: 1px solid var(--border-color);
            margin-top: 6px;
            padding: 4px;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 11px;
            overflow-x: auto;
            max-height: 250px;
            user-select: text;
        }

        .card.diff-expanded .diff-container {
            display: block;
        }

        .diff-line {
            display: block;
            white-space: pre;
            padding: 1px 4px;
        }

        .diff-line.added {
            background-color: var(--git-added-bg);
            color: var(--git-added);
        }

        .diff-line.deleted {
            background-color: var(--git-deleted-bg);
            color: var(--git-deleted);
        }

        .diff-line.header-line {
            opacity: 0.5;
            font-weight: bold;
        }

        /* Commit and stash inner files */
        .inner-files {
            display: none;
            padding: 4px;
            margin-top: 6px;
            border-top: 1px dashed var(--border-color);
            flex-direction: column;
            gap: 4px;
        }

        .card.commit-expanded .inner-files {
            display: flex;
        }

        .inner-file-card {
            background-color: rgba(0, 0, 0, 0.15);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            padding: 4px 6px;
            display: flex;
            flex-direction: column;
            gap: 2px;
            cursor: pointer;
        }

        /* Suggestions and Cheat Sheet Grid */
        .cheatsheet-section {
            margin-top: 15px;
            border-top: 1px solid var(--border-color);
            padding-top: 10px;
        }

        .cheatsheet-header {
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            padding: 6px 0;
            opacity: 0.9;
        }

        .cheatsheet-grid {
            display: none;
            grid-template-columns: 1fr;
            gap: 8px;
            margin-top: 8px;
        }

        .cheatsheet-section.expanded .cheatsheet-grid {
            display: grid;
        }

        .cheatsheet-category {
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius);
            overflow: hidden;
            background-color: rgba(255, 255, 255, 0.01);
        }

        .category-title {
            background-color: rgba(0, 0, 0, 0.2);
            padding: 4px 8px;
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 1px solid var(--border-color);
        }

        .category-commands {
            display: flex;
            flex-direction: column;
        }

        .command-item {
            padding: 6px 8px;
            border-bottom: 1px solid rgba(128, 128, 128, 0.1);
            cursor: pointer;
            transition: background-color 0.2s;
        }

        .command-item:last-child {
            border-bottom: none;
        }

        .command-item:hover {
            background-color: var(--hover-bg);
        }

        .command-name {
            font-family: monospace;
            font-weight: bold;
            color: var(--primary-blue);
            font-size: 11px;
        }

        .command-desc {
            font-size: 11px;
            opacity: 0.7;
            margin-top: 2px;
        }

        /* Suggestions Panel */
        .suggestion-panel {
            background-color: rgba(0, 0, 0, 0.2);
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius);
            padding: 10px;
            margin-top: 10px;
            display: none;
            flex-direction: column;
            gap: 8px;
        }

        .suggestion-panel.active {
            display: flex;
        }

        .suggestion-title {
            font-weight: bold;
            color: var(--primary-blue);
            font-size: 12px;
            margin-bottom: 2px;
        }

        .suggestion-desc {
            font-size: 11px;
            opacity: 0.8;
        }

        .suggestion-args {
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin-top: 4px;
        }

        .suggestion-args input {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, var(--border-color));
            border-radius: 4px;
            padding: 4px 6px;
            font-size: 11px;
            outline: none;
        }

        .suggestion-actions {
            display: flex;
            justify-content: flex-end;
            gap: 6px;
            margin-top: 6px;
        }

        /* Error/Not a repo state */
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
            text-align: center;
            gap: 12px;
            opacity: 0.8;
        }

        .empty-state-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            padding: 8px 16px;
            font-weight: bold;
            cursor: pointer;
        }

        .empty-state-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <div id="app">
        <!-- Loading state initially -->
        <div class="empty-state">
            <div>Checking Git status...</div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let gitState = null;
        let activeSuggestion = null;

        // Message Listener
        window.addEventListener('message', event => {
            const msg = event.data;
            switch (msg.type) {
                case 'noWorkspace':
                    renderNoWorkspace();
                    break;
                case 'notARepo':
                    renderNotARepo();
                    break;
                case 'gitState':
                    gitState = msg.state;
                    renderMainView();
                    break;
                case 'diffResult':
                    renderDiff(msg.file, msg.diffType, msg.diff);
                    break;
                case 'commitFilesResult':
                    renderCommitFiles(msg.hash, msg.files);
                    break;
                case 'stashFilesResult':
                    renderStashFiles(msg.id, msg.files);
                    break;
                case 'error':
                    renderError(msg.message);
                    break;
            }
        });

        // Initialize Webview
        vscode.postMessage({ type: 'ready' });

        function refresh() {
            vscode.postMessage({ type: 'refresh' });
        }

        // Render States
        function renderNoWorkspace() {
            document.body.innerHTML = \`
                <div class="empty-state">
                    <h3>No Workspace Found</h3>
                    <p>Please open a folder or workspace in VS Code to track Git states.</p>
                </div>
            \`;
        }

        function renderNotARepo() {
            document.body.innerHTML = \`
                <div class="empty-state">
                    <h3>Not a Git Repository</h3>
                    <p>The current workspace folder is not initialized as a Git repository.</p>
                    <button class="empty-state-btn" onclick="initRepo()">Initialize Git Repo</button>
                </div>
            \`;
        }

        function initRepo() {
            vscode.postMessage({ type: 'initRepo' });
        }

        function renderError(err) {
            document.body.innerHTML = \`
                <div class="empty-state">
                    <h3 style="color: var(--git-deleted);">Error Occurred</h3>
                    <p>\${err}</p>
                    <button class="empty-state-btn" onclick="refresh()">Retry</button>
                </div>
            \`;
        }

        function renderMainView() {
            if (!gitState) return;

            const trackingStr = gitState.hasUpstream 
                ? \`<span class="tracking-name">tracking \${gitState.trackingBranch}</span>\` 
                : '<span class="tracking-name" style="color: var(--git-modified);">no upstream tracking</span>';

            const stashesCount = gitState.stashes.length;

            const html = \`
                <div class="header">
                    <div class="branch-info">
                        <div class="branch-name">
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v5.256a2.251 2.251 0 1 0 1.5 0V5.372zm-1.25 7.878a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zm6.5-6.5a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v2.378a.75.75 0 0 0 1.5 0V6.872zM9 2.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z"/></svg>
                            \${gitState.currentBranch || 'DETACHED'}
                        </div>
                        \${trackingStr}
                    </div>
                    <button class="refresh-btn" onclick="refresh()" title="Refresh">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg>
                    </button>
                </div>

                <!-- SVG Visual Flow chart of 5 phases -->
                <div class="flow-container">
                    <svg class="flow-svg" viewBox="0 0 400 130">
                        <defs>
                            <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--vscode-descriptionForeground)"/>
                            </marker>
                            <marker id="arrow-active" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#4fc1ff"/>
                            </marker>
                            <marker id="arrow-reverse" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#f97583"/>
                            </marker>
                        </defs>

                        <!-- Lane Nodes -->
                        <!-- 1. Workspace -->
                        <g id="node-workspace" class="flow-node active">
                            <circle cx="45" cy="85" r="20" fill="var(--vscode-editor-background)" stroke="var(--border-color)" stroke-width="2"/>
                            <text x="45" y="89" text-anchor="middle" font-size="8.5" fill="var(--vscode-foreground)">Work</text>
                        </g>

                        <!-- 2. Staging -->
                        <g id="node-staging" class="flow-node">
                            <circle cx="135" cy="85" r="20" fill="var(--vscode-editor-background)" stroke="var(--border-color)" stroke-width="2"/>
                            <text x="135" y="89" text-anchor="middle" font-size="8.5" fill="var(--vscode-foreground)">Stage</text>
                        </g>

                        <!-- 3. Local Repo -->
                        <g id="node-local" class="flow-node">
                            <circle cx="225" cy="85" r="20" fill="var(--vscode-editor-background)" stroke="var(--border-color)" stroke-width="2"/>
                            <text x="225" y="89" text-anchor="middle" font-size="8.5" fill="var(--vscode-foreground)">Local</text>
                        </g>

                        <!-- 4. Remote Repo -->
                        <g id="node-remote" class="flow-node">
                            <circle cx="315" cy="85" r="20" fill="var(--vscode-editor-background)" stroke="var(--border-color)" stroke-width="2"/>
                            <text x="315" y="89" text-anchor="middle" font-size="8.5" fill="var(--vscode-foreground)">Remote</text>
                        </g>

                        <!-- 5. Stash -->
                        <g id="node-stash" class="flow-node">
                            <circle cx="90" cy="25" r="17" fill="var(--vscode-editor-background)" stroke="var(--border-color)" stroke-width="2"/>
                            <text x="90" y="28" text-anchor="middle" font-size="8" fill="var(--vscode-foreground)">Stash</text>
                        </g>

                        <!-- Normal Forward Paths -->
                        <path id="path-stage" class="flow-path" d="M 65 85 L 110 85" marker-end="url(#arrow)"/>
                        <path id="path-commit" class="flow-path" d="M 155 85 L 200 85" marker-end="url(#arrow)"/>
                        <path id="path-push" class="flow-path" d="M 245 85 L 290 85" marker-end="url(#arrow)"/>

                        <!-- Stash Paths -->
                        <path id="path-stash-save" class="flow-path" d="M 45 65 C 45 40, 60 25, 73 25" stroke-dasharray="3,3" marker-end="url(#arrow)"/>
                        <path id="path-stash-pop" class="flow-path" d="M 90 42 C 90 60, 75 75, 60 78" stroke-dasharray="3,3" marker-end="url(#arrow)"/>
                    </svg>
                </div>

                <!-- 1. Workspace Lane -->
                <div class="lane" id="lane-workspace">
                    <div class="lane-header" onclick="toggleLane('lane-workspace')">
                        <span>Workspace (unstaged)</span>
                        <span class="lane-count">\${gitState.unstaged.length}</span>
                    </div>
                    <div class="lane-content">
                        \${gitState.unstaged.length === 0 
                            ? '<div style="text-align: center; opacity: 0.5; padding: 12px 0;">No changes in Workspace</div>'
                            : gitState.unstaged.map(f => renderFileCard(f, 'unstaged')).join('')}
                        \${gitState.unstaged.length > 0 
                            ? \`<button class="action-btn wide-btn" onclick="stageAll(event)">Stage All Changes (git add .)</button>\` 
                            : ''}
                    </div>
                </div>

                <!-- 2. Staging Lane -->
                <div class="lane" id="lane-staging">
                    <div class="lane-header" onclick="toggleLane('lane-staging')">
                        <span>Staging Area</span>
                        <span class="lane-count">\${gitState.staged.length}</span>
                    </div>
                    <div class="lane-content">
                        \${gitState.staged.length === 0 
                            ? '<div style="text-align: center; opacity: 0.5; padding: 12px 0;">No staged changes</div>'
                            : gitState.staged.map(f => renderFileCard(f, 'staged')).join('')}
                        \${gitState.staged.length > 0 ? \`
                            <div class="commit-form">
                                <input type="text" class="commit-input" id="commit-msg-input" placeholder="Commit message..." onkeydown="handleCommitKey(event)" />
                                <button class="action-btn wide-btn" onclick="commitStaged()">Commit Staged (git commit)</button>
                            </div>
                        \` : ''}
                    </div>
                </div>

                <!-- 3. Local Repo Lane -->
                <div class="lane" id="lane-local">
                    <div class="lane-header" onclick="toggleLane('lane-local')">
                        <span>Local Repository (unpushed)</span>
                        <span class="lane-count">\${gitState.localCommits.length}</span>
                    </div>
                    <div class="lane-content">
                        \${gitState.localCommits.length === 0 
                            ? '<div style="text-align: center; opacity: 0.5; padding: 12px 0;">No unpushed commits</div>'
                            : gitState.localCommits.map(c => renderCommitCard(c, 'local')).join('')}
                        \${gitState.localCommits.length > 0 
                            ? \`<button class="action-btn wide-btn" onclick="pushLocal()">Push Commits (git push)</button>\` 
                            : ''}
                    </div>
                </div>

                <!-- 4. Remote Repo Lane -->
                <div class="lane" id="lane-remote">
                    <div class="lane-header" onclick="toggleLane('lane-remote')">
                        <span>Remote Repository (origin)</span>
                        <span class="lane-count">\${gitState.remoteCommits.length}</span>
                    </div>
                    <div class="lane-content">
                        \${gitState.remoteCommits.length === 0 
                            ? '<div style="text-align: center; opacity: 0.5; padding: 12px 0;">No remote commits (or branch unpushed)</div>'
                            : gitState.remoteCommits.map(c => renderCommitCard(c, 'remote')).join('')}
                        \${gitState.hasUpstream 
                            ? \`<button class="action-btn wide-btn secondary" onclick="pullRemote()">Pull Updates (git pull)</button>\` 
                            : ''}
                    </div>
                </div>

                <!-- 5. Stash Lane -->
                <div class="lane" id="lane-stash">
                    <div class="lane-header" onclick="toggleLane('lane-stash')">
                        <span>Stash Bucket</span>
                        <span class="lane-count">\${stashesCount}</span>
                    </div>
                    <div class="lane-content">
                        \${stashesCount === 0 
                            ? '<div style="text-align: center; opacity: 0.5; padding: 12px 0;">Stash is empty</div>'
                            : gitState.stashes.map(s => renderStashCard(s)).join('')}
                        \${gitState.unstaged.length > 0 || gitState.staged.length > 0 ? \`
                            <div class="commit-form">
                                <input type="text" class="commit-input" id="stash-msg-input" placeholder="Stash message (optional)..." />
                                <button class="action-btn wide-btn secondary" onclick="stashSave()">Stash Changes (git stash)</button>
                            </div>
                        \` : ''}
                    </div>
                </div>

                <!-- Flow Suggestions & Interactive Cheat Sheet (Priority 2) -->
                <div class="cheatsheet-section" id="cheatsheet">
                    <div class="cheatsheet-header" onclick="toggleCheatSheet()">
                        <span>Interactive Git Suggestions</span>
                        <span class="lane-count">💡 Click</span>
                    </div>
                    
                    <!-- Suggestions Active Execution Panel -->
                    <div class="suggestion-panel" id="sug-panel">
                        <div class="suggestion-title" id="sug-title">Git Command</div>
                        <div class="suggestion-desc" id="sug-desc">Description of command.</div>
                        <div class="suggestion-args" id="sug-args"></div>
                        <div class="suggestion-actions">
                            <button class="action-btn secondary" onclick="closeSuggestion()">Cancel</button>
                            <button class="action-btn" id="sug-execute-btn" onclick="executeSuggestion()">Execute</button>
                        </div>
                    </div>

                    <div class="cheatsheet-grid">
                        <div class="cheatsheet-category">
                            <div class="category-title">Make a Change</div>
                            <div class="category-commands">
                                <div class="command-item" onclick="selectSuggestion('stage_all')" onmouseenter="highlightFlow('stage')" onmouseleave="clearFlow()">
                                    <div class="command-name">git add .</div>
                                    <div class="command-desc">Stage all modifications</div>
                                </div>
                                <div class="command-item" onclick="selectSuggestion('commit')" onmouseenter="highlightFlow('commit')" onmouseleave="clearFlow()">
                                    <div class="command-name">git commit -m</div>
                                    <div class="command-desc">Record staged changes to Local Repo</div>
                                </div>
                            </div>
                        </div>

                        <div class="cheatsheet-category">
                            <div class="category-title">Stashing</div>
                            <div class="category-commands">
                                <div class="command-item" onclick="selectSuggestion('stash')" onmouseenter="highlightFlow('stash-save')" onmouseleave="clearFlow()">
                                    <div class="command-name">git stash</div>
                                    <div class="command-desc">Save changes to stash and clean Workspace</div>
                                </div>
                                <div class="command-item" onclick="selectSuggestion('stash_pop')" onmouseenter="highlightFlow('stash-pop')" onmouseleave="clearFlow()">
                                    <div class="command-name">git stash pop</div>
                                    <div class="command-desc">Restore latest stashed changes</div>
                                </div>
                            </div>
                        </div>

                        <div class="cheatsheet-category">
                            <div class="category-title">Undoing Things</div>
                            <div class="category-commands">
                                <div class="command-item" onclick="selectSuggestion('restore')" onmouseenter="highlightFlow('restore')" onmouseleave="clearFlow()">
                                    <div class="command-name">git restore &lt;file&gt;</div>
                                    <div class="command-desc">Discard unstaged workspace modifications</div>
                                </div>
                                <div class="command-item" onclick="selectSuggestion('unstage')" onmouseenter="highlightFlow('unstage')" onmouseleave="clearFlow()">
                                    <div class="command-name">git restore --staged</div>
                                    <div class="command-desc">Remove files from Staging (unstage)</div>
                                </div>
                                <div class="command-item" onclick="selectSuggestion('reset_soft')" onmouseenter="highlightFlow('reset-soft')" onmouseleave="clearFlow()">
                                    <div class="command-name">git reset --soft</div>
                                    <div class="command-desc">Undo commit; preserve edits in Staging</div>
                                </div>
                                <div class="command-item" onclick="selectSuggestion('reset_mixed')" onmouseenter="highlightFlow('reset-mixed')" onmouseleave="clearFlow()">
                                    <div class="command-name">git reset --mixed</div>
                                    <div class="command-desc">Undo commit; move edits to Workspace</div>
                                </div>
                                <div class="command-item" onclick="selectSuggestion('reset_hard')" onmouseenter="highlightFlow('reset-hard')" onmouseleave="clearFlow()">
                                    <div class="command-name">git reset --hard</div>
                                    <div class="command-desc">Undo commit & discard all edits (destructive)</div>
                                </div>
                            </div>
                        </div>

                        <div class="cheatsheet-category">
                            <div class="category-title">Synchronizing</div>
                            <div class="category-commands">
                                <div class="command-item" onclick="selectSuggestion('pull')" onmouseenter="highlightFlow('pull')" onmouseleave="clearFlow()">
                                    <div class="command-name">git pull</div>
                                    <div class="command-desc">Fetch and merge remote commits</div>
                                </div>
                                <div class="command-item" onclick="selectSuggestion('push')" onmouseenter="highlightFlow('push')" onmouseleave="clearFlow()">
                                    <div class="command-name">git push</div>
                                    <div class="command-desc">Upload local commits to remote</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            \`;

            document.getElementById('app').innerHTML = html;

            // Update node colors/states dynamically based on lanes status
            updateFlowSvgHighlights();
        }

        // Accordion toggle
        function toggleLane(id) {
            const lane = document.getElementById(id);
            lane.classList.toggle('expanded');
        }

        function toggleCheatSheet() {
            const cs = document.getElementById('cheatsheet');
            cs.classList.toggle('expanded');
        }

        // Render File Card
        function renderFileCard(file, type, hashOrId = '') {
            const statusClass = file.status;
            
            return \`
                <div class="card" id="file-\${type}-\${file.path.replace(/[^a-zA-Z0-9]/g, '_')}" onclick="toggleDiff(event, '\${file.path}', '\${type}', '\${hashOrId}')">
                    <div class="card-header">
                        <div class="file-info">
                            <span class="badge \${statusClass}">\${file.status}</span>
                            <div style="min-width: 0;">
                                <div class="file-name" title="\${file.path}">\${file.path.split('/').pop()}</div>
                                <div class="file-path" title="\${file.path}">\${file.path}</div>
                            </div>
                        </div>
                        <div class="card-actions">
                            \${type === 'unstaged' ? \`
                                <button class="action-btn" onclick="stageFile(event, '\${file.path}')" title="Stage file">+</button>
                                <button class="action-btn secondary" onclick="restoreFile(event, '\${file.path}')" title="Discard changes">×</button>
                            \` : ''}
                            \${type === 'staged' ? \`
                                <button class="action-btn secondary" onclick="unstageFile(event, '\${file.path}')" title="Unstage file">-</button>
                            \` : ''}
                        </div>
                    </div>
                    <div class="diff-stats">
                        <span class="stat-add">+\${file.additions}</span>
                        <span class="stat-del">-\${file.deletions}</span>
                    </div>
                    <div class="diff-container">Loading diff...</div>
                </div>
            \`;
        }

        // Render Commit Card
        function renderCommitCard(commit, type) {
            const actionsHtml = type === 'local' ? \`
                <div class="card-actions" style="margin-top: 4px;">
                    <button class="action-btn secondary" onclick="softReset(event, '\${commit.hash}')">Reset Soft</button>
                    <button class="action-btn secondary" style="background-color: var(--git-deleted-bg); color: var(--git-deleted);" onclick="hardReset(event, '\${commit.hash}')">Reset Hard</button>
                </div>
            \` : '';

            return \`
                <div class="card" id="commit-\${commit.hash}" onclick="toggleCommitFiles(event, '\${commit.hash}', '\${type}')">
                    <div class="card-header">
                        <div style="font-weight: bold; font-family: monospace; color: var(--primary-blue);">\${commit.hash}</div>
                        <div style="font-size: 11px; opacity: 0.6;">\${commit.date}</div>
                    </div>
                    <div class="file-name" style="font-weight: 500;">\${commit.subject}</div>
                    <div style="font-size: 11px; opacity: 0.7;">By \${commit.author}</div>
                    \${actionsHtml}
                    <div class="inner-files">Loading files...</div>
                </div>
            \`;
        }

        // Render Stash Card
        function renderStashCard(stash) {
            return \`
                <div class="card" id="stash-\${stash.id.replace(/[^a-zA-Z0-9]/g, '_')}" onclick="toggleStashFiles(event, '\${stash.id}')">
                    <div class="card-header">
                        <div style="font-weight: bold; font-family: monospace; color: var(--git-modified);">\${stash.id}</div>
                        <div class="card-actions">
                            <button class="action-btn" onclick="stashPop(event, '\${stash.id}')" title="Pop (Apply and Delete)">Pop</button>
                            <button class="action-btn secondary" onclick="stashApply(event, '\${stash.id}')" title="Apply">Apply</button>
                            <button class="action-btn secondary" style="background-color: var(--git-deleted-bg); color: var(--git-deleted);" onclick="stashDrop(event, '\${stash.id}')" title="Delete">Drop</button>
                        </div>
                    </div>
                    <div class="file-name" style="font-weight: 500;">\${stash.description}</div>
                    <div style="font-size: 11px; opacity: 0.7;">Branch: \${stash.branch}</div>
                    <div class="inner-files">Loading files...</div>
                </div>
            \`;
        }

        // Git Actions wrapper
        function stageFile(e, file) {
            e.stopPropagation();
            vscode.postMessage({ type: 'stageFile', file });
        }

        function restoreFile(e, file) {
            e.stopPropagation();
            if (confirm(\`Are you sure you want to discard all changes in \${file}?\`)) {
                vscode.postMessage({ type: 'gitRestore', file });
            }
        }

        function unstageFile(e, file) {
            e.stopPropagation();
            vscode.postMessage({ type: 'unstageFile', file });
        }

        function stageAll(e) {
            e.stopPropagation();
            vscode.postMessage({ type: 'stageAll' });
        }

        function handleCommitKey(e) {
            if (e.key === 'Enter') {
                commitStaged();
            }
        }

        function commitStaged() {
            const input = document.getElementById('commit-msg-input');
            const message = input.value.trim();
            if (!message) {
                alert('Please enter a commit message');
                return;
            }
            vscode.postMessage({ type: 'commit', message });
        }

        function pushLocal() {
            vscode.postMessage({ type: 'push' });
        }

        function pullRemote() {
            vscode.postMessage({ type: 'pull' });
        }

        function softReset(e, hash) {
            e.stopPropagation();
            if (confirm(\`Soft reset to commit \${hash}? Changes will be preserved in Staging.\`)) {
                vscode.postMessage({ type: 'gitReset', resetType: 'soft', target: hash });
            }
        }

        function hardReset(e, hash) {
            e.stopPropagation();
            if (confirm(\`WARNING: Hard reset to commit \${hash}? ALL uncommitted changes and subsequent commits will be permanently lost!\`)) {
                vscode.postMessage({ type: 'gitReset', resetType: 'hard', target: hash });
            }
        }

        function stashSave() {
            const input = document.getElementById('stash-msg-input');
            const message = input.value.trim();
            vscode.postMessage({ type: 'stashSave', message });
        }

        function stashPop(e, id) {
            e.stopPropagation();
            vscode.postMessage({ type: 'stashPop', id });
        }

        function stashApply(e, id) {
            e.stopPropagation();
            vscode.postMessage({ type: 'stashApply', id });
        }

        function stashDrop(e, id) {
            e.stopPropagation();
            if (confirm(\`Are you sure you want to delete stash \${id}?\`)) {
                vscode.postMessage({ type: 'stashDrop', id });
            }
        }

        // Toggle File Diffs (Priority 1)
        function toggleDiff(e, file, diffType, hashOrId) {
            e.stopPropagation();
            const cleanId = file.replace(/[^a-zA-Z0-9]/g, '_');
            const card = document.getElementById(\`file-\${diffType}-\${cleanId}\`);
            
            if (card.classList.contains('diff-expanded')) {
                card.classList.remove('diff-expanded');
            } else {
                card.classList.add('diff-expanded');
                const container = card.querySelector('.diff-container');
                container.innerHTML = 'Loading diff details...';
                
                vscode.postMessage({
                    type: 'getDiff',
                    file,
                    diffType,
                    hashOrId
                });
            }
        }

        // Renders the line additions and deletions
        function renderDiff(file, diffType, rawDiff) {
            const cleanId = file.replace(/[^a-zA-Z0-9]/g, '_');
            const card = document.getElementById(\`file-\${diffType}-\${cleanId}\`);
            if (!card) return;

            const container = card.querySelector('.diff-container');
            if (!rawDiff || rawDiff.trim().length === 0) {
                container.innerHTML = '<span style="opacity: 0.5;">No differences or binary file.</span>';
                return;
            }

            const lines = rawDiff.split('\\n');
            let diffHtml = '';
            
            for (const line of lines) {
                let cls = '';
                if (line.startsWith('+') && !line.startsWith('+++')) {
                    cls = 'added';
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                    cls = 'deleted';
                } else if (line.startsWith('@@')) {
                    cls = 'header-line';
                }

                // escape html characters
                const escapedLine = line
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');

                diffHtml += \`<span class="diff-line \${cls}">\${escapedLine}</span>\`;
            }

            container.innerHTML = diffHtml;
        }

        // Toggle Commit Files Expansion
        function toggleCommitFiles(e, hash, type) {
            e.stopPropagation();
            const card = document.getElementById(\`commit-\${hash}\`);
            if (card.classList.contains('commit-expanded')) {
                card.classList.remove('commit-expanded');
            } else {
                card.classList.add('commit-expanded');
                const inner = card.querySelector('.inner-files');
                inner.innerHTML = 'Loading modified files...';
                vscode.postMessage({ type: 'getCommitFiles', hash });
            }
        }

        function renderCommitFiles(hash, files) {
            const card = document.getElementById(\`commit-\${hash}\`);
            if (!card) return;

            const inner = card.querySelector('.inner-files');
            if (files.length === 0) {
                inner.innerHTML = '<div style="opacity: 0.5;">No files found</div>';
                return;
            }

            inner.innerHTML = files.map(f => {
                const cleanId = f.path.replace(/[^a-zA-Z0-9]/g, '_');
                return \`
                    <div class="inner-file-card" id="file-commit-\${cleanId}" onclick="toggleDiff(event, '\${f.path}', 'commit', '\${hash}')">
                        <div class="file-info">
                            <span class="badge \${f.status}">\${f.status}</span>
                            <div class="file-name" title="\${f.path}">\${f.path.split('/').pop()}</div>
                        </div>
                        <div class="diff-stats" style="margin-top: 2px;">
                            <span class="stat-add">+\${f.additions}</span>
                            <span class="stat-del">-\${f.deletions}</span>
                        </div>
                        <div class="diff-container">Loading diff...</div>
                    </div>
                \`;
            }).join('');
        }

        // Toggle Stash Files Expansion
        function toggleStashFiles(e, id) {
            e.stopPropagation();
            const cleanId = id.replace(/[^a-zA-Z0-9]/g, '_');
            const card = document.getElementById(\`stash-\${cleanId}\`);
            if (card.classList.contains('commit-expanded')) {
                card.classList.remove('commit-expanded');
            } else {
                card.classList.add('commit-expanded');
                const inner = card.querySelector('.inner-files');
                inner.innerHTML = 'Loading stashed files...';
                vscode.postMessage({ type: 'getStashFiles', id });
            }
        }

        function renderStashFiles(id, files) {
            const cleanId = id.replace(/[^a-zA-Z0-9]/g, '_');
            const card = document.getElementById(\`stash-\${cleanId}\`);
            if (!card) return;

            const inner = card.querySelector('.inner-files');
            if (files.length === 0) {
                inner.innerHTML = '<div style="opacity: 0.5;">No files found</div>';
                return;
            }

            inner.innerHTML = files.map(f => {
                const fileCleanId = f.path.replace(/[^a-zA-Z0-9]/g, '_');
                return \`
                    <div class="inner-file-card" id="file-stash-\${fileCleanId}" onclick="toggleDiff(event, '\${f.path}', 'stash', '\${id}')">
                        <div class="file-info">
                            <span class="badge \${f.status}">\${f.status}</span>
                            <div class="file-name" title="\${f.path}">\${f.path.split('/').pop()}</div>
                        </div>
                        <div class="diff-stats" style="margin-top: 2px;">
                            <span class="stat-add">+\${f.additions}</span>
                            <span class="stat-del">-\${f.deletions}</span>
                        </div>
                        <div class="diff-container">Loading diff...</div>
                    </div>
                \`;
            }).join('');
        }

        // Flow Chart dynamic coloring based on Git State
        function updateFlowSvgHighlights() {
            if (!gitState) return;

            // Reset node active classes
            document.querySelectorAll('.flow-node').forEach(node => node.classList.remove('active'));

            // Set active states based on file counts
            const hasWork = gitState.unstaged.length > 0;
            const hasStage = gitState.staged.length > 0;
            const hasLocal = gitState.localCommits.length > 0;
            const hasStash = gitState.stashes.length > 0;

            document.getElementById('node-workspace').classList.add('active'); // workspace always active base
            
            if (hasStage) {
                document.getElementById('node-staging').classList.add('active');
            }
            if (hasLocal) {
                document.getElementById('node-local').classList.add('active');
            }
            if (gitState.remoteCommits.length > 0) {
                document.getElementById('node-remote').classList.add('active');
            }
            if (hasStash) {
                document.getElementById('node-stash').classList.add('active');
            }
        }

        // Visual Hover Flow Path highlighting (Priority 2)
        function highlightFlow(flowType) {
            clearFlow();
            const stagePath = document.getElementById('path-stage');
            const commitPath = document.getElementById('path-commit');
            const pushPath = document.getElementById('path-push');
            const stashSavePath = document.getElementById('path-stash-save');
            const stashPopPath = document.getElementById('path-stash-pop');

            switch (flowType) {
                case 'stage':
                    stagePath.classList.add('active');
                    break;
                case 'commit':
                    commitPath.classList.add('active');
                    break;
                case 'push':
                    pushPath.classList.add('active');
                    break;
                case 'stash-save':
                    stashSavePath.classList.add('active');
                    break;
                case 'stash-pop':
                    stashPopPath.classList.add('active');
                    break;
                case 'unstage':
                    stagePath.classList.add('reverse-active');
                    break;
                case 'restore':
                    // flash workspace node red/discard
                    document.getElementById('node-workspace').querySelector('circle').style.stroke = '#f97583';
                    break;
                case 'reset-soft':
                    commitPath.classList.add('reverse-active');
                    break;
                case 'reset-mixed':
                    commitPath.classList.add('reverse-active');
                    stagePath.classList.add('reverse-active');
                    break;
                case 'reset-hard':
                    commitPath.classList.add('reverse-active');
                    stagePath.classList.add('reverse-active');
                    document.getElementById('node-workspace').querySelector('circle').style.stroke = '#f97583';
                    document.getElementById('node-staging').querySelector('circle').style.stroke = '#f97583';
                    break;
                case 'pull':
                    pushPath.classList.add('reverse-active');
                    commitPath.classList.add('reverse-active');
                    stagePath.classList.add('reverse-active');
                    break;
            }
        }

        function clearFlow() {
            document.querySelectorAll('.flow-path').forEach(p => {
                p.classList.remove('active');
                p.classList.remove('reverse-active');
            });
            const circles = document.querySelectorAll('.flow-node circle');
            circles.forEach(c => {
                c.style.stroke = '';
            });
        }

        // Suggestions Execution Panel (Priority 2)
        function selectSuggestion(cmdKey) {
            const panel = document.getElementById('sug-panel');
            const title = document.getElementById('sug-title');
            const desc = document.getElementById('sug-desc');
            const argsDiv = document.getElementById('sug-args');
            
            panel.classList.add('active');
            argsDiv.innerHTML = '';
            activeSuggestion = cmdKey;

            switch (cmdKey) {
                case 'stage_all':
                    title.textContent = 'git add .';
                    desc.textContent = 'Stages all changes in the current workspace directory.';
                    break;
                case 'commit':
                    title.textContent = 'git commit -m &lt;message&gt;';
                    desc.textContent = 'Commits all staged changes with a descriptive message.';
                    argsDiv.innerHTML = \`<input type="text" id="sug-input-msg" placeholder="Type commit message..." style="width: 95%;" />\`;
                    break;
                case 'stash':
                    title.textContent = 'git stash';
                    desc.textContent = 'Saves working directory modifications to the stash bucket and resets back to clean HEAD.';
                    argsDiv.innerHTML = \`<input type="text" id="sug-input-msg" placeholder="Stash description (optional)..." style="width: 95%;" />\`;
                    break;
                case 'stash_pop':
                    title.textContent = 'git stash pop';
                    desc.textContent = 'Applies the latest stashed set and deletes it from the stash bucket.';
                    break;
                case 'restore':
                    title.textContent = 'git restore &lt;file&gt;';
                    desc.textContent = 'Discards unstaged edits in a specific file. Edits are permanently lost.';
                    argsDiv.innerHTML = \`<input type="text" id="sug-input-file" placeholder="File path (e.g. src/app.js)..." style="width: 95%;" />\`;
                    break;
                case 'unstage':
                    title.textContent = 'git restore --staged &lt;file&gt;';
                    desc.textContent = 'Removes a file from the Staging area. File changes are preserved in the Workspace.';
                    argsDiv.innerHTML = \`<input type="text" id="sug-input-file" placeholder="File path (e.g. src/app.js)..." style="width: 95%;" />\`;
                    break;
                case 'reset_soft':
                    title.textContent = 'git reset --soft &lt;commit&gt;';
                    desc.textContent = 'Resets branch HEAD to a previous commit. Keeps all modifications staged.';
                    argsDiv.innerHTML = \`<input type="text" id="sug-input-target" placeholder="Commit hash or HEAD~1..." value="HEAD~1" style="width: 95%;" />\`;
                    break;
                case 'reset_mixed':
                    title.textContent = 'git reset --mixed &lt;commit&gt;';
                    desc.textContent = 'Resets branch HEAD to a previous commit. Keeps edits but leaves them unstaged.';
                    argsDiv.innerHTML = \`<input type="text" id="sug-input-target" placeholder="Commit hash or HEAD~1..." value="HEAD~1" style="width: 95%;" />\`;
                    break;
                case 'reset_hard':
                    title.textContent = 'git reset --hard &lt;commit&gt;';
                    desc.textContent = 'WARNING: Resets branch HEAD to a previous commit AND discards all subsequent commits and changes. Destructive!';
                    argsDiv.innerHTML = \`<input type="text" id="sug-input-target" placeholder="Commit hash or HEAD~1..." value="HEAD~1" style="width: 95%;" />\`;
                    break;
                case 'pull':
                    title.textContent = 'git pull';
                    desc.textContent = 'Fetches updates from the remote tracking branch and merges them into your local branch.';
                    break;
                case 'push':
                    title.textContent = 'git push';
                    desc.textContent = 'Uploads local repository commits to the remote tracking branch.';
                    break;
            }
        }

        function closeSuggestion() {
            document.getElementById('sug-panel').classList.remove('active');
            activeSuggestion = null;
            clearFlow();
        }

        function executeSuggestion() {
            if (!activeSuggestion) return;
            
            const rootPath = gitState ? gitState.repoRoot : '';
            
            switch (activeSuggestion) {
                case 'stage_all':
                    vscode.postMessage({ type: 'stageAll' });
                    break;
                case 'commit':
                    const msg = document.getElementById('sug-input-msg').value.trim();
                    if (!msg) { alert('Commit message is required'); return; }
                    vscode.postMessage({ type: 'commit', message: msg });
                    break;
                case 'stash':
                    const stashDesc = document.getElementById('sug-input-msg').value.trim();
                    vscode.postMessage({ type: 'stashSave', message: stashDesc });
                    break;
                case 'stash_pop':
                    vscode.postMessage({ type: 'stashPop', id: '' });
                    break;
                case 'restore':
                    const fileToRestore = document.getElementById('sug-input-file').value.trim();
                    if (!fileToRestore) { alert('File path is required'); return; }
                    if (confirm(\`Discard modifications in \${fileToRestore}?\`)) {
                        vscode.postMessage({ type: 'gitRestore', file: fileToRestore });
                    }
                    break;
                case 'unstage':
                    const fileToUnstage = document.getElementById('sug-input-file').value.trim();
                    if (!fileToUnstage) { alert('File path is required'); return; }
                    vscode.postMessage({ type: 'unstageFile', file: fileToUnstage });
                    break;
                case 'reset_soft':
                    const softTarget = document.getElementById('sug-input-target').value.trim();
                    vscode.postMessage({ type: 'gitReset', resetType: 'soft', target: softTarget });
                    break;
                case 'reset_mixed':
                    const mixedTarget = document.getElementById('sug-input-target').value.trim();
                    vscode.postMessage({ type: 'gitReset', resetType: 'mixed', target: mixedTarget });
                    break;
                case 'reset_hard':
                    const hardTarget = document.getElementById('sug-input-target').value.trim();
                    if (confirm(\`WARNING: Are you absolutely sure you want to hard reset to \${hardTarget}? All modifications will be lost.\`)) {
                        vscode.postMessage({ type: 'gitReset', resetType: 'hard', target: hardTarget });
                    }
                    break;
                case 'pull':
                    vscode.postMessage({ type: 'pull' });
                    break;
                case 'push':
                    vscode.postMessage({ type: 'push' });
                    break;
            }
            closeSuggestion();
        }
    </script>
</body>
</html>`;
    }
}
