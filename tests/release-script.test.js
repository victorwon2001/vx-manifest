const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const releaseScriptPath = path.resolve(__dirname, "../tools/release.ps1");
const releaseScript = fs.readFileSync(releaseScriptPath, "utf8");

test("release script exposes ExtraPaths and manifest validation guard", () => {
  assert.match(releaseScript, /\[string\[\]\]\$ExtraPaths = @\(\)/);
  assert.match(releaseScript, /Resolve-RepoRelativePath/);
  assert.match(releaseScript, /Assert-NoOutOfScopeStagedChanges/);
  assert.match(releaseScript, /node .*tools\\validate-manifest\.js/);
  assert.match(releaseScript, /git -C \$repoRoot add --/);
});
