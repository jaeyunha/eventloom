import { JsxEmit, ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "agenda-test-jsx-transform",
      enforce: "pre",
      transform(source, id) {
        if (!id.includes("/features/agenda/") || !id.endsWith(".tsx")) {
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
      "apps/web/src/features/agenda/**/*.test.ts",
      "apps/web/src/features/agenda/**/*.test.tsx",
    ],
    restoreMocks: true,
  },
});
