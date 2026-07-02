#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderReadme } from "./render-readme.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "data", "repos.json");

const repoInput = process.argv.slice(2).join(" ");

if (!repoInput) {
  console.error("Usage: npm run add -- https://github.com/owner/repo [more repo URLs...]");
  process.exit(1);
}

const repoRefs = parseGitHubRepos(repoInput);
const repos = await readRepos();
const results = [];

for (const repoRef of repoRefs) {
  const repo = await fetchRepo(repoRef);
  const key = `${repo.owner}/${repo.name}`.toLowerCase();
  const existingIndex = repos.findIndex((item) => `${item.owner}/${item.name}`.toLowerCase() === key);

  if (existingIndex >= 0) {
    repos[existingIndex] = { ...repos[existingIndex], ...repo, addedAt: repos[existingIndex].addedAt };
    results.push(`Updated ${repo.owner}/${repo.name}`);
  } else {
    repos.push(repo);
    results.push(`Added ${repo.owner}/${repo.name}`);
  }
}

repos.sort((a, b) => `${a.owner}/${a.name}`.localeCompare(`${b.owner}/${b.name}`));

await mkdir(path.dirname(dataPath), { recursive: true });
await writeFile(dataPath, `${JSON.stringify(repos, null, 2)}\n`);
await renderReadme({ root, check: false });

console.log(results.join("\n"));

function parseGitHubRepos(input) {
  const repoUrls = extractGitHubUrls(input);
  if (repoUrls.length === 0) {
    throw new Error(`No GitHub repository URL found: ${input}`);
  }

  const seen = new Set();
  const repos = [];

  for (const repoUrl of repoUrls) {
    const repo = parseGitHubRepo(repoUrl);
    const key = `${repo.owner}/${repo.name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    repos.push(repo);
  }

  return repos;
}

function parseGitHubRepo(repoUrl) {
  let url;
  try {
    url = new URL(repoUrl);
  } catch {
    throw new Error(`Invalid URL: ${repoUrl}`);
  }

  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    throw new Error(`Only github.com URLs are supported: ${repoUrl}`);
  }

  const [owner, name] = url.pathname.split("/").filter(Boolean);
  if (!owner || !name) {
    throw new Error(`Expected a GitHub repository URL: ${repoUrl}`);
  }

  return { owner, name: name.replace(/\.git$/, "") };
}

function extractGitHubUrls(input) {
  return [...input.matchAll(/https?:\/\/(?:www\.)?github\.com\/[^\s<>"']+/gi)]
    .map((match) => match[0].replace(/[),.;]+$/, ""));
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
    category: inferCategory({
      name: payload.name,
      description: payload.description || "",
      language: payload.language || "",
      topics: Array.isArray(payload.topics) ? payload.topics : []
    }),
    topics: Array.isArray(payload.topics) ? payload.topics : [],
    stars: payload.stargazers_count,
    forks: payload.forks_count,
    license: payload.license?.spdx_id || "",
    pushedAt: payload.pushed_at,
    addedAt: new Date().toISOString()
  };
}

function inferCategory({ name, description, language, topics }) {
  const haystack = [name, description, language, ...topics].join(" ").toLowerCase();
  const rules = [
    ["Design", ["design", "ui", "ux", "component", "system", "css", "tailwind", "figma", "storybook"]],
    ["AI Workflow", ["agent", "ai", "llm", "rag", "prompt", "workflow", "automation", "copilot", "assistant"]],
    ["Developer Tools", ["cli", "devtool", "debug", "build", "compiler", "lint", "format", "test", "sdk"]],
    ["Data", ["database", "analytics", "warehouse", "etl", "data", "sql", "vector"]],
    ["Infrastructure", ["infra", "deploy", "container", "kubernetes", "docker", "server", "cloud"]],
    ["Security", ["security", "auth", "oauth", "secret", "vulnerability", "scanner"]],
    ["Utility", ["utility", "tool", "manager", "productivity", "package"]]
  ];

  for (const [category, keywords] of rules) {
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      return category;
    }
  }

  return "Miscellaneous";
}

async function readRepos() {
  try {
    return JSON.parse(await readFile(dataPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
