#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await renderReadme({ root: defaultRoot, check: process.argv.includes("--check") });
}

export async function renderReadme({ root = defaultRoot, check = false } = {}) {
  const dataPath = path.join(root, "data", "repos.json");
  const readmePath = path.join(root, "README.md");
  const repos = JSON.parse(await readFile(dataPath, "utf8"));
  const next = buildReadme(repos);

  if (check) {
    const current = await readFile(readmePath, "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });

    if (current !== next) {
      throw new Error("README.md is out of date. Run npm run render.");
    }

    return;
  }

  await writeFile(readmePath, next);
}

function buildReadme(repos) {
  const sorted = [...repos].sort((a, b) => {
    const category = getCategory(a).localeCompare(getCategory(b));
    if (category !== 0) return category;
    return a.fullName.localeCompare(b.fullName);
  });

  const byCategory = groupBy(sorted, getCategory);
  const sections = [...byCategory.entries()].map(([category, categoryRepos]) => {
    const rows = categoryRepos.map(formatRepo).join("\n");
    return `## ${category}\n\n${rows}`;
  });

  return `# OSS Vault

A GitHub-backed vault for saving, organizing, and auto-curating interesting open source repositories from Telegram.

## Add a repo

Run the \`Add Repository\` workflow from GitHub Actions with a GitHub repository URL, or dispatch it from Hermes using the API shape in [docs/hermes.md](docs/hermes.md).

${repos.length === 0 ? "No repositories saved yet." : sections.join("\n\n")}
`;
}

function formatRepo(repo) {
  const description = repo.description || "No description provided.";
  const language = repo.language ? `💻 ${repo.language}` : null;
  const topics = repo.topics.length > 0
    ? `🏷️ ${repo.topics.slice(0, 5).map((topic) => `\`${topic}\``).join(" ")}`
    : null;
  const homepage = repo.homepage ? `🔗 [Homepage](${repo.homepage})` : null;
  const updated = repo.pushedAt ? `🕒 ${formatDate(repo.pushedAt)}` : null;
  const meta = [
    `⭐ ${repo.stars.toLocaleString("en-US")}`,
    `🍴 ${repo.forks.toLocaleString("en-US")}`,
    repo.license ? `📜 ${repo.license}` : null,
    language,
    updated,
    homepage,
    topics
  ].filter(Boolean).join(" · ");

  return `- [${repo.fullName}](${repo.url}) - ${description}  \n  ${meta}`;
}

function getCategory(repo) {
  return repo.category || inferCategory(repo);
}

function inferCategory(repo) {
  const haystack = [
    repo.name,
    repo.fullName,
    repo.description,
    repo.language,
    ...(repo.topics || [])
  ].join(" ").toLowerCase();
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

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

function groupBy(items, getKey) {
  const grouped = new Map();

  for (const item of items) {
    const key = getKey(item);
    const group = grouped.get(key);

    if (group) {
      group.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  return grouped;
}
