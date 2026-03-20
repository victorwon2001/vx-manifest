function parseVersion(version) {
  const parts = String(version || "0.0.0").split(".").map((value) => Number(value));
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3).map((value) => (Number.isFinite(value) ? value : 0));
}

function bumpVersion(version, level) {
  const parts = parseVersion(version);
  const nextLevel = level || "patch";
  if (nextLevel === "major") return [parts[0] + 1, 0, 0].join(".");
  if (nextLevel === "minor") return [parts[0], parts[1] + 1, 0].join(".");
  return [parts[0], parts[1], parts[2] + 1].join(".");
}

function buildChangelogEntry(options) {
  const date = options.date;
  const version = options.version;
  const message = options.message;
  return ["## " + date, "", "- `" + version + "` " + message, ""].join("\n");
}

module.exports = {
  bumpVersion,
  buildChangelogEntry,
};

