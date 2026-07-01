import * as cp from 'child_process';
import * as path from 'path';

export interface GitFile {
    path: string;
    status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed';
    additions: number;
    deletions: number;
}

export interface GitCommit {
    hash: string;
    subject: string;
    author: string;
    date: string;
}

export interface GitStash {
    id: string; // e.g. stash@{0}
    description: string;
    branch: string;
}

export interface GitRepoState {
    repoRoot: string;
    currentBranch: string;
    trackingBranch: string;
    hasUpstream: boolean;
    unstaged: GitFile[];
    staged: GitFile[];
    localCommits: GitCommit[];
    remoteCommits: GitCommit[];
    stashes: GitStash[];
}

function execShell(cmd: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        cp.exec(cmd, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                // If command fails but outputs stderr, resolve with stderr/empty or reject
                resolve(stdout || stderr || '');
            } else {
                resolve(stdout);
            }
        });
    });
}

export async function getRepoRoot(workspaceDir: string): Promise<string> {
    try {
        const output = await execShell('git rev-parse --show-toplevel', workspaceDir);
        return output.trim();
    } catch {
        return '';
    }
}

export async function getGitState(repoRoot: string): Promise<GitRepoState | null> {
    if (!repoRoot) { return null; }

    try {
        // 1. Get branch info
        let currentBranch = '';
        try {
            currentBranch = (await execShell('git branch --show-current', repoRoot)).trim();
            if (!currentBranch) {
                currentBranch = (await execShell('git rev-parse --abbrev-ref HEAD', repoRoot)).trim();
            }
        } catch {
            currentBranch = 'DETACHED';
        }

        let trackingBranch = '';
        let hasUpstream = false;
        try {
            trackingBranch = (await execShell('git rev-parse --abbrev-ref @{u}', repoRoot)).trim();
            hasUpstream = true;
        } catch {
            trackingBranch = '';
            hasUpstream = false;
        }

        // 2. Get status (porcelain)
        const statusOutput = await execShell('git status --porcelain -z', repoRoot);
        const unstagedMap = new Map<string, GitFile>();
        const stagedMap = new Map<string, GitFile>();

        // git status --porcelain -z separates entries by NUL character
        const statusEntries = statusOutput.split('\0').filter(e => e.length > 0);
        for (const entry of statusEntries) {
            if (entry.length < 4) { continue; }
            const x = entry[0];
            const y = entry[1];
            // Format: XY PATH or XY PATH1 -> PATH2 (renames)
            let filePath = entry.substring(3);
            if (filePath.includes(' -> ')) {
                filePath = filePath.split(' -> ')[1];
            }

            // X is status of index (staged)
            // Y is status of working tree (unstaged)
            
            // Staged Files (X)
            if (x !== ' ' && x !== '?') {
                let status: GitFile['status'] = 'modified';
                if (x === 'A') { status = 'added'; }
                else if (x === 'D') { status = 'deleted'; }
                else if (x === 'R') { status = 'renamed'; }

                stagedMap.set(filePath, {
                    path: filePath,
                    status,
                    additions: 0,
                    deletions: 0
                });
            }

            // Unstaged Files (Y)
            if (y !== ' ') {
                let status: GitFile['status'] = 'modified';
                if (y === '?' || x === '?') { status = 'untracked'; }
                else if (y === 'D') { status = 'deleted'; }

                unstagedMap.set(filePath, {
                    path: filePath,
                    status,
                    additions: 0,
                    deletions: 0
                });
            }
        }

        // 3. Get numstats for addition/deletion numbers
        // Unstaged changes numstat
        const unstagedNumstat = await execShell('git diff --numstat', repoRoot);
        unstagedNumstat.split('\n').forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3) {
                const add = parseInt(parts[0], 10) || 0;
                const del = parseInt(parts[1], 10) || 0;
                const file = parts[2];
                const item = unstagedMap.get(file);
                if (item) {
                    item.additions = add;
                    item.deletions = del;
                }
            }
        });

        // Staged changes numstat
        const stagedNumstat = await execShell('git diff --cached --numstat', repoRoot);
        stagedNumstat.split('\n').forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3) {
                const add = parseInt(parts[0], 10) || 0;
                const del = parseInt(parts[1], 10) || 0;
                const file = parts[2];
                const item = stagedMap.get(file);
                if (item) {
                    item.additions = add;
                    item.deletions = del;
                }
            }
        });

        // For untracked files, we can count the lines if they are not binary
        for (const [file, item] of unstagedMap.entries()) {
            if (item.status === 'untracked') {
                try {
                    const content = await execShell(`git diff --no-index /dev/null "${file}"`, repoRoot);
                    const lineCount = content.split('\n').length;
                    item.additions = lineCount > 0 ? lineCount : 1;
                } catch {
                    // Fallback to basic count
                    item.additions = 1;
                }
            }
        }

        // 4. Local Commits (commits in local repo not pushed to remote)
        const localCommits: GitCommit[] = [];
        let localCommitsCmd = `git log -n 10 --pretty=format:"%h|%s|%an|%ar"`;
        if (hasUpstream) {
            localCommitsCmd = `git log @{u}..HEAD --pretty=format:"%h|%s|%an|%ar"`;
        }
        
        try {
            const localLog = await execShell(localCommitsCmd, repoRoot);
            localLog.split('\n').forEach(line => {
                const parts = line.trim().split('|');
                if (parts.length >= 4) {
                    localCommits.push({
                        hash: parts[0],
                        subject: parts[1],
                        author: parts[2],
                        date: parts[3]
                    });
                }
            });
        } catch {
            // If no commits yet
        }

        // 5. Remote Commits (recent history of tracking branch, or current branch if no remote)
        const remoteCommits: GitCommit[] = [];
        let remoteCommitsCmd = `git log -n 10 --pretty=format:"%h|%s|%an|%ar"`;
        if (hasUpstream) {
            remoteCommitsCmd = `git log -n 10 @{u} --pretty=format:"%h|%s|%an|%ar"`;
        }

        try {
            const remoteLog = await execShell(remoteCommitsCmd, repoRoot);
            remoteLog.split('\n').forEach(line => {
                const parts = line.trim().split('|');
                if (parts.length >= 4) {
                    remoteCommits.push({
                        hash: parts[0],
                        subject: parts[1],
                        author: parts[2],
                        date: parts[3]
                    });
                }
            });
        } catch {
            // Empty history or error
        }

        // 6. Stashes
        const stashes: GitStash[] = [];
        try {
            const stashList = await execShell('git stash list', repoRoot);
            stashList.split('\n').forEach(line => {
                if (!line.trim()) { return; }
                // stash@{0}: WIP on main: c23db5c commit message
                const match = line.match(/^(stash@\{\d+\}):\s*(?:On\s+([^:]+):)?\s*(.*)$/i);
                if (match) {
                    stashes.push({
                        id: match[1],
                        branch: match[2] || 'unknown',
                        description: match[3]
                    });
                }
            });
        } catch {
            // No stashes or command error
        }

        return {
            repoRoot,
            currentBranch,
            trackingBranch,
            hasUpstream,
            unstaged: Array.from(unstagedMap.values()),
            staged: Array.from(stagedMap.values()),
            localCommits,
            remoteCommits,
            stashes
        };

    } catch (e) {
        console.error('Error fetching git state:', e);
        return null;
    }
}

export async function getFilesInCommit(repoRoot: string, commitHash: string): Promise<GitFile[]> {
    const files: GitFile[] = [];
    try {
        const listOutput = await execShell(`git show --name-status --pretty=format:"" ${commitHash}`, repoRoot);
        const numstatOutput = await execShell(`git show --numstat --pretty=format:"" ${commitHash}`, repoRoot);

        const numstatMap = new Map<string, { additions: number; deletions: number }>();
        numstatOutput.split('\n').forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3) {
                numstatMap.set(parts[2], {
                    additions: parseInt(parts[0], 10) || 0,
                    deletions: parseInt(parts[1], 10) || 0
                });
            }
        });

        listOutput.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) { return; }
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 2) {
                const statusChar = parts[0][0];
                const filePath = parts[1];
                let status: GitFile['status'] = 'modified';
                if (statusChar === 'A') { status = 'added'; }
                else if (statusChar === 'D') { status = 'deleted'; }
                else if (statusChar === 'R') { status = 'renamed'; }

                const stats = numstatMap.get(filePath) || { additions: 0, deletions: 0 };
                files.push({
                    path: filePath,
                    status,
                    additions: stats.additions,
                    deletions: stats.deletions
                });
            }
        });
    } catch (e) {
        console.error('Error getting files in commit:', e);
    }
    return files;
}

export async function getFilesInStash(repoRoot: string, stashId: string): Promise<GitFile[]> {
    const files: GitFile[] = [];
    try {
        const listOutput = await execShell(`git stash show --name-status ${stashId}`, repoRoot);
        const numstatOutput = await execShell(`git stash show --numstat ${stashId}`, repoRoot);

        const numstatMap = new Map<string, { additions: number; deletions: number }>();
        numstatOutput.split('\n').forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3) {
                numstatMap.set(parts[2], {
                    additions: parseInt(parts[0], 10) || 0,
                    deletions: parseInt(parts[1], 10) || 0
                });
            }
        });

        listOutput.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) { return; }
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 2) {
                const statusChar = parts[0][0];
                const filePath = parts[1];
                let status: GitFile['status'] = 'modified';
                if (statusChar === 'A') { status = 'added'; }
                else if (statusChar === 'D') { status = 'deleted'; }
                else if (statusChar === 'R') { status = 'renamed'; }

                const stats = numstatMap.get(filePath) || { additions: 0, deletions: 0 };
                files.push({
                    path: filePath,
                    status,
                    additions: stats.additions,
                    deletions: stats.deletions
                });
            }
        });
    } catch (e) {
        console.error('Error getting files in stash:', e);
    }
    return files;
}

export async function getFileDiff(
    repoRoot: string,
    filePath: string,
    type: 'unstaged' | 'staged' | 'commit' | 'stash',
    commitHashOrStashId?: string
): Promise<string> {
    try {
        let cmd = '';
        if (type === 'unstaged') {
            cmd = `git diff -U0 -- "${filePath}"`;
        } else if (type === 'staged') {
            cmd = `git diff -U0 --cached -- "${filePath}"`;
        } else if (type === 'commit' && commitHashOrStashId) {
            cmd = `git show -U0 ${commitHashOrStashId} -- "${filePath}"`;
        } else if (type === 'stash' && commitHashOrStashId) {
            // Stash diff relative to its parent
            cmd = `git diff -U0 ${commitHashOrStashId}^! -- "${filePath}"`;
        } else {
            return 'No diff available';
        }

        const rawDiff = await execShell(cmd, repoRoot);
        return rawDiff;
    } catch (e) {
        return `Error generating diff: ${e}`;
    }
}

export async function executeGitCommand(repoRoot: string, command: string, args: string[]): Promise<{ success: boolean; output: string }> {
    try {
        const fullCommand = `git ${command} ${args.map(a => `"${a}"`).join(' ')}`;
        const output = await execShell(fullCommand, repoRoot);
        return { success: true, output };
    } catch (e: any) {
        return { success: false, output: e.message || 'Execution error' };
    }
}
