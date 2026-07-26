import { chmod, rm } from "node:fs/promises";
import { build } from "esbuild";

await rm("dist", { recursive: true, force: true });

for (const entry of ["index", "http"]) {
  const outfile = `dist/${entry}.js`;
  await build({
    entryPoints: [`src/${entry}.ts`],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: "external",
    sourcesContent: false,
    legalComments: "external",
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);'
    }
  });
  await chmod(outfile, 0o755);
}
