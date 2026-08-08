import { JsxEmit, ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      enforce: "pre",
      name: "transform-product-shell-tsx-for-focused-tests",
      transform(code, id) {
        if (!id.endsWith(".tsx")) {
          return;
        }
        return {
          code: transpileModule(code, {
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
    include: ["apps/web/src/components/product-shell/**/*.test.ts"],
    restoreMocks: true,
  },
});
