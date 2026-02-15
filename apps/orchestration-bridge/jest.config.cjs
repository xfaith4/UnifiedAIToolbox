const ignoredGeneratedDirs = [
  "<rootDir>/node_modules/",
  "<rootDir>/runs/",
  "<rootDir>/github_clone/",
  "<rootDir>/github_integration/",
  "<rootDir>/state/",
  "<rootDir>/supervisor_tasks/",
];

module.exports = {
  rootDir: __dirname,
  testEnvironment: "node",
  passWithNoTests: true,
  testPathIgnorePatterns: ignoredGeneratedDirs,
  modulePathIgnorePatterns: ignoredGeneratedDirs,
  watchPathIgnorePatterns: ignoredGeneratedDirs,
};
