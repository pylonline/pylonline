import coreLint from "../core-lint/index.cjs";

const { createEslintConfig } = coreLint;

export default createEslintConfig({
  nodeFiles: ["config/**/*.{js,mjs,cjs}"],
});
