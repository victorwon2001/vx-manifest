const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { validateManifest } = require("../tools/validate-manifest.js");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function withTempRepo(setup) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vx-manifest-test-"));
  try {
    setup(repoRoot);
    return repoRoot;
  } catch (error) {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    throw error;
  }
}

test("validateManifest passes for the current repository", () => {
  const result = validateManifest(path.resolve(__dirname, ".."));
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("validateManifest reports registry and meta id mismatch", () => {
  const repoRoot = withTempRepo((tempRoot) => {
    writeJson(path.join(tempRoot, "config", "registry.json"), {
      version: 1,
      scripts: [
        {
          id: "module-a",
          name: "테스트 모듈",
          enabledByDefault: true,
          matches: ["https://example.com/*"],
          metaPath: "modules/module-a/meta.json",
        },
      ],
    });
    writeJson(path.join(tempRoot, "modules", "module-a", "meta.json"), {
      id: "module-b",
      name: "테스트 모듈",
      version: "1.0.0",
      entry: "modules/module-a/main.js",
      dependencies: [],
    });
    fs.writeFileSync(path.join(tempRoot, "modules", "module-a", "main.js"), "module.exports = {};\n", "utf8");
  });

  try {
    const result = validateManifest(repoRoot);
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /registry id와 meta id가 다릅니다/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("validateManifest reports missing entry, dependency and matches", () => {
  const repoRoot = withTempRepo((tempRoot) => {
    writeJson(path.join(tempRoot, "config", "registry.json"), {
      version: 1,
      scripts: [
        {
          id: "module-a",
          name: "테스트 모듈",
          enabledByDefault: true,
          matches: [],
          metaPath: "modules/module-a/meta.json",
        },
      ],
    });
    writeJson(path.join(tempRoot, "modules", "module-a", "meta.json"), {
      id: "module-a",
      name: "테스트 모듈",
      version: "1.0.0",
      entry: "modules/module-a/main.js",
      dependencies: [
        {
          id: "dep",
          version: "1.0.0",
          path: "vendor/missing.js",
        },
      ],
      capabilities: {
        gm: "GM_xmlhttpRequest",
      },
      loaderApiVersion: 0,
    });
  });

  try {
    const result = validateManifest(repoRoot);
    assert.equal(result.ok, false);
    const output = result.errors.join("\n");
    assert.match(output, /entry 파일이 없습니다/);
    assert.match(output, /dependency 파일이 없습니다/);
    assert.match(output, /matches는 비어 있지 않은 문자열 배열이어야 합니다/);
    assert.match(output, /capabilities\.gm는 문자열 배열이어야 합니다/);
    assert.match(output, /loaderApiVersion은 1 이상의 정수여야 합니다/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
