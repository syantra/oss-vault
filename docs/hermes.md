# Hermes Trigger

Hermes can add repositories by dispatching the `Add Repository` GitHub Actions workflow.

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
    "repo_url": "https://github.com/owner/repo"
  }
}
```

## Token

Use a fine-grained GitHub token or GitHub App token with access to `syantra/oss-vault` and permission to run Actions workflows.

The workflow itself uses GitHub's built-in `GITHUB_TOKEN` to commit README/data changes back to the same repository.
