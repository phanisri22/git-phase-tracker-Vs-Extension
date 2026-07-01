import * as vscode from 'vscode';
import { GitPhaseTrackerProvider } from './webviewProvider';

export function activate(context: vscode.ExtensionContext) {
    const provider = new GitPhaseTrackerProvider(context.extensionUri);

    // Register the WebviewView provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            GitPhaseTrackerProvider.viewType,
            provider
        )
    );

    // Register the manual refresh command
    context.subscriptions.push(
        vscode.commands.registerCommand('git-phase-tracker.refresh', () => {
            provider.refreshState();
        })
    );

    // Setup a workspace watcher to trigger auto-refreshes when files change
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    
    fileWatcher.onDidChange(() => {
        provider.refreshState();
    });

    fileWatcher.onDidCreate(() => {
        provider.refreshState();
    });

    fileWatcher.onDidDelete(() => {
        provider.refreshState();
    });

    context.subscriptions.push(fileWatcher);

    // Refresh state when focus changes to a different file
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            provider.refreshState();
        })
    );
}

export function deactivate() {}
