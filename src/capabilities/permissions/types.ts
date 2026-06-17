export interface FileScope {
  path: string;
  read: boolean;
  write: boolean;
}

export interface ShellPermissions {
  enabled: boolean;
  blocked: string[];
  autoApproved: string[];
  needsApproval: string[];
  cwdOnly: boolean;
  /**
   * H12: Patterns to REMOVE from the default blocklist. Lets a user
   * intentionally allow a command that's blocked by default (e.g. for a
   * dev VM where `shutdown *` is fine). Note: this is the ONLY way to
   * override the defaults — the regular `blocked` array is a UNION with
   * the defaults, so a user cannot remove a default by simply omitting it.
   */
  removeFromBlocked?: string[];
  removeFromNeedsApproval?: string[];
}

export interface FsPermissions {
  enabled: boolean;
  scopes: FileScope[];
}

export interface GitPermissions {
  enabled: boolean;
  autoApproveRead: boolean;
  approveWrite: boolean;
}

export interface PermissionsManifest {
  capabilities: {
    filesystem: FsPermissions;
    shell: ShellPermissions;
    git: GitPermissions;
  };
}
