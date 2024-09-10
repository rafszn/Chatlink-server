import globals from "globals";
import pluginJs from "@eslint/js";

export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node, // Include Node.js globals like 'process', '__dirname', etc.
      },
    },
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser, // Include browser globals if you need them
      },
    },
  },
  pluginJs.configs.recommended,
];
