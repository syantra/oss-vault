#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderReadme } from "./render-readme.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "data", "repos.json");

const repoUrl = process.argv[2];

if (!repoUrl) {
  console.error("Usage: npm run add -- https://github.com/owner/repo");
  process.exit(1);
}

const repoRef = parseGitHubRepo(repoUrl);
const repo = await fetchRepo(repoRef);
const repos = await readRepos();
const key = `${repo.owner}/${repo.name}`.toLowerCase();
const existingIndex = repos.findIndex((item) => `${item.owner}/${item.name}`.toLowerCase() === key);

if (existingIndex >= 0) {
  repos[existingIndex] = { ...repos[existingIndex], ...repo, addedAt: repos[existingIndex].addedAt };
} else {
  repos.push(repo);
}

repos.sort((a, b) => `${a.owner}/${a.name}`.localeCompare(`${b.owner}/${b.name}`));

await mkdir(path.dirname(dataPath), { recursive: true });
await writeFile(dataPath, `${JSON.stringify(repos, null, 2)}\n`);
await renderReadme({ root, check: false });

console.log(`${existingIndex >= 0 ? "Updated" : "Added"} ${repo.owner}/${repo.name}`);

function parseGitHubRepo(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }

  if (url.hostname !== "github.com") {
    throw new Error(`Only github.com URLs are supported: ${input}`);
  }

  const [owner, name] = url.pathname.split("/").filter(Boolean);
  if (!owner || !name) {
    throw new Error(`Expected a GitHub repository URL: ${input}`);
  }

  return { owner, name: name.replace(/\.git$/, "") };
}

async function fetchRepo({ owner, name }) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${name}`, { headers });

  if (response.status === 404) {
    throw new Error(`GitHub repo not found: ${owner}/${name}`);
  }

  if (!response.ok) {
    throw new Error(`GitHub API failed for ${owner}/${name}: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();

  return {
    owner: payload.owner.login,
    name: payload.name,
    fullName: payload.full_name,
    url: payload.html_url,
    description: payload.description || "",
    homepage: payload.homepage || "",
    language: payload.language || "Unknown",
    topics: Array.isArray(payload.topics) ? payload.topics : [],
    stars: payload.stargazers_count,
    forks: payload.forks_count,
    license: payload.license?.spdx_id || "",
    pushedAt: payload.pushed_at,
    addedAt: new Date().toISOString()
  };
}

async function readRepos() {
  try {
    return JSON.parse(await readFile(dataPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
