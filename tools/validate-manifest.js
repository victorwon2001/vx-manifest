const fs = require("node:fs");
const path = require("node:path");

function readJson(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function validateCapabilities(capabilities, errors, label) {
  if (capabilities == null) return;
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) {
    errors.push(label + " capabilities는 객체여야 합니다.");
    return;
  }
  ["gm", "connect"].forEach((key) => {
    if (capabilities[key] == null) return;
    if (!Array.isArray(capabilities[key]) || capabilities[key].some((item) => !isNonEmptyString(item))) {
      errors.push(label + " capabilities." + key + "는 문자열 배열이어야 합니다.");
    }
  });
}

function validateDependency(repoRoot, dependency, errors, label) {
  if (!dependency || typeof dependency !== "object") {
    errors.push(label + " dependency 항목이 객체가 아닙니다.");
    return;
  }
  if (!isNonEmptyString(dependency.id)) errors.push(label + " dependency.id가 비어 있습니다.");
  if (!isNonEmptyString(dependency.version)) errors.push(label + " dependency.version이 비어 있습니다.");
  if (!isNonEmptyString(dependency.path)) {
    errors.push(label + " dependency.path가 비어 있습니다.");
    return;
  }
  const dependencyPath = path.resolve(repoRoot, dependency.path);
  if (!fs.existsSync(dependencyPath)) {
    errors.push(label + " dependency 파일이 없습니다: " + dependency.path);
  }
}

function validateMeta(repoRoot, script, errors) {
  const label = "[" + script.id + "]";
  if (!isNonEmptyString(script.metaPath)) {
    errors.push(label + " metaPath가 비어 있습니다.");
    return;
  }

  const metaPath = path.resolve(repoRoot, script.metaPath);
  if (!fs.existsSync(metaPath)) {
    errors.push(label + " meta 파일이 없습니다: " + script.metaPath);
    return;
  }

  const meta = readJson(metaPath);
  if (!isNonEmptyString(meta.id)) errors.push(label + " meta.id가 비어 있습니다.");
  if (!isNonEmptyString(meta.name)) errors.push(label + " meta.name이 비어 있습니다.");
  if (!isNonEmptyString(meta.version)) errors.push(label + " meta.version이 비어 있습니다.");
  if (!isNonEmptyString(meta.entry)) errors.push(label + " meta.entry가 비어 있습니다.");
  if (meta.id && meta.id !== script.id) errors.push(label + " registry id와 meta id가 다릅니다.");
  if (meta.name && meta.name !== script.name) errors.push(label + " registry name과 meta name이 다릅니다.");

  if (isNonEmptyString(meta.entry)) {
    const entryPath = path.resolve(repoRoot, meta.entry);
    if (!fs.existsSync(entryPath)) {
      errors.push(label + " entry 파일이 없습니다: " + meta.entry);
    }
  }

  if (!Array.isArray(script.matches) || script.matches.length === 0 || script.matches.some((item) => !isNonEmptyString(item))) {
    errors.push(label + " matches는 비어 있지 않은 문자열 배열이어야 합니다.");
  }

  if (meta.dependencies != null && !Array.isArray(meta.dependencies)) {
    errors.push(label + " meta.dependencies는 배열이어야 합니다.");
  } else {
    (meta.dependencies || []).forEach((dependency, index) => {
      validateDependency(repoRoot, dependency, errors, label + " dependency[" + index + "]");
    });
  }

  validateCapabilities(meta.capabilities, errors, label);
  if (meta.loaderApiVersion != null) {
    const loaderApiVersion = Number(meta.loaderApiVersion);
    if (!Number.isInteger(loaderApiVersion) || loaderApiVersion <= 0) {
      errors.push(label + " loaderApiVersion은 1 이상의 정수여야 합니다.");
    }
  }
}

function validateManifest(repoRoot) {
  const rootPath = repoRoot || path.resolve(__dirname, "..");
  const errors = [];
  const registryPath = path.resolve(rootPath, "config", "registry.json");
  if (!fs.existsSync(registryPath)) {
    errors.push("config/registry.json 파일이 없습니다.");
    return { ok: false, errors };
  }

  const registry = readJson(registryPath);
  if (!Array.isArray(registry.scripts) || registry.scripts.length === 0) {
    errors.push("registry.scripts는 비어 있지 않은 배열이어야 합니다.");
    return { ok: false, errors };
  }

  const seenIds = new Set();
  registry.scripts.forEach((script, index) => {
    const label = "[scripts[" + index + "]]";
    if (!script || typeof script !== "object") {
      errors.push(label + " 항목이 객체가 아닙니다.");
      return;
    }
    if (!isNonEmptyString(script.id)) errors.push(label + " id가 비어 있습니다.");
    if (!isNonEmptyString(script.name)) errors.push(label + " name이 비어 있습니다.");
    if (script.id && seenIds.has(script.id)) errors.push(label + " id가 중복됩니다: " + script.id);
    if (script.id) seenIds.add(script.id);
    validateMeta(rootPath, script, errors);
  });

  return {
    ok: errors.length === 0,
    errors,
  };
}

if (require.main === module) {
  const result = validateManifest(path.resolve(__dirname, ".."));
  if (!result.ok) {
    result.errors.forEach((message) => {
      process.stderr.write(message + "\n");
    });
    process.exit(1);
  }
  process.stdout.write("manifest 검증 통과\n");
}

module.exports = {
  validateManifest,
};
