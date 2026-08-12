import { fileURLToPath } from "node:url";
import { JsxEmit, ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "web-test-jsx-transform",
      enforce: "pre",
      transform(source, id) {
        if (!id.includes("/apps/web/") || !id.endsWith(".tsx")) return undefined;
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
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["apps/**/*.test.{ts,tsx}", "packages/**/*.test.ts", "scripts/**/*.test.ts"],
    passWithNoTests: false,
    restoreMocks: true,
  },
});
