import assert from "node:assert/strict";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { generateStatusDashboard } from "./cloud-status-dashboard.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.dirname(path.dirname(scriptDir));

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

test("status dashboard writes both workflow artifact and legacy Pages paths", async () => {
  const artifactIndex = path.join(workspaceRoot, ".pages-site", "status", "index.html");
  const artifactJson = path.join(workspaceRoot, ".pages-site", "status", "dashboard.json");
  const legacyIndex = path.join(workspaceRoot, "status", "index.html");
  const legacyJson = path.join(workspaceRoot, "status", "dashboard.json");

  await rm(path.dirname(artifactIndex), { recursive: true, force: true });
  await rm(path.dirname(legacyIndex), { recursive: true, force: true });

  await generateStatusDashboard();

  assert.equal(await exists(artifactIndex), true);
  assert.equal(await exists(artifactJson), true);
  assert.equal(await exists(legacyIndex), true);
  assert.equal(await exists(legacyJson), true);
});
