import { JsxEmit, ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "integration-admin-test-jsx-transform",
      enforce: "pre",
      transform(source, id) {
        if (!id.includes("/apps/web/src/") || !id.endsWith(".tsx")) {
          return undefined;
        }
        return {
          code: transpileModule(source, {
            compilerOptions: {
              jsx: JsxEmit.ReactJSX,
              module: ModuleKind.ESNext,
              target: ScriptTarget.ES2022,
            },
            fileName: id,
          }).outputText,
          map: null,
        };
      },
    },
  ],
  test: {
    environment: "node",
    include: [
      "apps/web/src/features/integrations/**/*.test.ts",
      "apps/web/src/features/integrations/**/*.test.tsx",
    ],
    restoreMocks: true,
  },
});
