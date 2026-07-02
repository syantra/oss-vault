# Hermes Trigger

Hermes can add repositories by dispatching the `Add Repository` GitHub Actions workflow. The workflow accepts either a bare GitHub repository URL or a message containing one.

## Local Gateway Plugin

This machine is wired through a Hermes plugin:

```text
~/.hermes/plugins/oss-vault/
```

The repo-owned copy lives in:

```text
integrations/hermes/oss-vault-plugin/
```

Install or refresh it with:

```bash
./scripts/install-hermes-plugin.sh
hermes gateway restart
```

The plugin listens for `pre_gateway_dispatch`. If an incoming message contains one or more GitHub repository URLs and a bookmark intent keyword, it dispatches one GitHub Action run with all repositories and skips normal agent handling.

It also registers an explicit Hermes command:

```text
/vault https://github.com/owner/repo [more repo URLs...]
```

Bookmark intent keywords include:

```text
bookmark, bookmakr, save, vault, archive, oss-vault
```

The plugin runs:

```bash
gh workflow run add-repo.yml --repo syantra/oss-vault --ref main -f repo_url=<repo-url>
```

Batch messages are supported:

```text
bookmark these:
https://github.com/facebook/react
https://github.com/vercel/next.js
https://github.com/oven-sh/bun
```

```text
/vault https://github.com/facebook/react https://github.com/vercel/next.js
```

## Endpoint

```text
POST https://api.github.com/repos/syantra/oss-vault/actions/workflows/add-repo.yml/dispatches
```

## Headers

```text
Accept: application/vnd.github+json
Authorization: Bearer <GITHUB_TOKEN>
X-GitHub-Api-Version: 2022-11-28
```

## Body

```json
{
  "ref": "main",
  "inputs": {
    "repo_url": "Found this today: https://github.com/owner/repo"
  }
}
```

## Token

Use a fine-grained GitHub token or GitHub App token with access to `syantra/oss-vault` and permission to run Actions workflows.

The workflow itself uses GitHub's built-in `GITHUB_TOKEN` to commit README/data changes back to the same repository.
