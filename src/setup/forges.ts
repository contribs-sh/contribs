import type { BrowserSourceType } from './store';

export interface ForgeInfo {
  type: BrowserSourceType;
  name: string;
  defaultHost: string;
  hostHint: string;
  usernameLabel: string;
  /** Where to create a read-only token, with scopes pre-selected where the forge supports it. */
  tokenUrl: (host: string) => string;
  tokenHelp: string;
  needsEmails?: boolean;
  tokenOptional?: boolean;
}

export const FORGES: ForgeInfo[] = [
  {
    type: 'github',
    name: 'GitHub',
    defaultHost: 'github.com',
    hostHint: 'github.com, or your GitHub Enterprise host',
    usernameLabel: 'Username',
    tokenUrl: (host) =>
      `https://${host}/settings/tokens/new?scopes=read:user,repo,read:org&description=contribs.sh%20(read-only)`,
    tokenHelp: 'Classic token with read:user, repo and read:org. repo is needed to count private work; contribs.sh only reads daily totals.',
  },
  {
    type: 'gitlab',
    name: 'GitLab',
    defaultHost: 'gitlab.com',
    hostHint: 'gitlab.com, or your self-managed GitLab host',
    usernameLabel: 'Username',
    tokenUrl: (host) => `https://${host}/-/user_settings/personal_access_tokens?name=contribs.sh&scopes=read_api`,
    tokenHelp: 'Personal access token with read_api. gitlab.com only keeps about three years of activity.',
  },
  {
    type: 'bitbucket',
    name: 'Bitbucket',
    defaultHost: 'bitbucket.org',
    hostHint: 'Bitbucket Cloud',
    usernameLabel: 'Username or Atlassian email',
    tokenUrl: () => 'https://id.atlassian.com/manage-profile/security/api-tokens',
    tokenHelp: 'API token with read:repository. Bitbucket has no calendar, so contribs.sh counts your commits repo by repo; large workspaces take a while.',
    needsEmails: true,
  },
  {
    type: 'forgejo',
    name: 'Codeberg / Forgejo / Gitea',
    defaultHost: 'codeberg.org',
    hostHint: 'codeberg.org, or your Forgejo/Gitea host',
    usernameLabel: 'Username',
    tokenUrl: (host) => `https://${host}/user/settings/applications`,
    tokenHelp: 'Optional for public activity. For private activity, an access token with read:user.',
    tokenOptional: true,
  },
];

export const forgeInfo = (type: BrowserSourceType): ForgeInfo | undefined => FORGES.find((f) => f.type === type);
