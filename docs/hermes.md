# Hermes Trigger

Hermes can add repositories by dispatching the `Add Repository` GitHub Actions workflow. The workflow accepts either a bare GitHub repository URL or a message containing one.

## Local Gateway Hook

This machine is wired through a Hermes gateway hook:

```text
~/.hermes/hooks/oss-vault/
```

The repo-owned copy lives in:

```text
integrations/hermes/oss-vault/
```

Install or refresh it with:

```bash
./scripts/install-hermes-hook.sh
hermes gateway restart
```

The hook listens for `agent:start`, extracts the first GitHub repository URL from the incoming message, and runs:

```bash
gh workflow run add-repo.yml --repo syantra/oss-vault --ref main -f repo_url=<repo-url>
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
