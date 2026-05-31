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
  // *.nodetest.js files use Node's built-in test runner (node --test), not jest.
  testPathIgnorePatterns: [...ignoredGeneratedDirs, "\\.nodetest\\.js$"],
  modulePathIgnorePatterns: ignoredGeneratedDirs,
  watchPathIgnorePatterns: ignoredGeneratedDirs,
};
