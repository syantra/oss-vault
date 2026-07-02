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
    const language = a.language.localeCompare(b.language);
    if (language !== 0) return language;
    return a.fullName.localeCompare(b.fullName);
  });

  const byLanguage = groupBy(sorted, (repo) => repo.language || "Unknown");
  const sections = [...byLanguage.entries()].map(([language, languageRepos]) => {
    const rows = languageRepos.map(formatRepo).join("\n");
    return `## ${language}\n\n${rows}`;
  });

  return `# OSS Vault

A GitHub-backed vault for saving, organizing, and auto-curating interesting open source repositories from Telegram.

${repos.length === 0 ? "No repositories saved yet." : sections.join("\n\n")}
`;
}

function formatRepo(repo) {
  const description = repo.description || "No description provided.";
  const meta = [
    `${repo.stars.toLocaleString("en-US")} stars`,
    repo.license ? repo.license : null,
    repo.topics.length > 0 ? repo.topics.slice(0, 5).map((topic) => `\`${topic}\``).join(" ") : null
  ].filter(Boolean).join(" · ");

  return `- [${repo.fullName}](${repo.url}) - ${description}  \n  ${meta}`;
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
