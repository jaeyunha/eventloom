import { JsxEmit, ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      enforce: "pre",
      name: "transform-organizer-review-tsx",
      transform(source, id) {
        if (!id.endsWith(".tsx")) {
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
      "apps/web/src/features/admin/**/*.test.tsx",
      "apps/web/src/features/reviews/**/*.test.tsx",
    ],
    restoreMocks: true,
  },
});
