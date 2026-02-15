const ignoredGeneratedDirs = [
  "<rootDir>/node_modules/",
  "<rootDir>/.git/",
  "<rootDir>/.uaitoolbox/",
  "<rootDir>/examples/",
  "<rootDir>/artifacts/",
  "<rootDir>/apps/orchestration-bridge/runs/",
];

module.exports = {
  roots: ["<rootDir>/apps/orchestration-bridge"],
  testEnvironment: "node",
  passWithNoTests: true,
  testPathIgnorePatterns: ignoredGeneratedDirs,
  modulePathIgnorePatterns: ignoredGeneratedDirs,
  watchPathIgnorePatterns: ignoredGeneratedDirs,
};
