// Explicit artifact allowlist: never copy .env, work data, user DB, or media.
const fs = require("node:fs/promises");
const path = require("node:path");
const { createRequire } = require("node:module");

async function main() {
  const source = process.cwd();
  const destination = path.resolve(process.argv[2] || "work/docker-runtime");
  if (!destination.startsWith(path.join(source, "work") + path.sep)) {
    throw new Error("Artifact destination must be a generated directory under work/.");
  }
  await fs.access(path.join(source, ".next/standalone/server.js"));
  await fs.rm(destination, { recursive: true, force: true });
  const staging = path.join(destination, "app");
  await fs.mkdir(staging, { recursive: true });
  for (const [from, to] of [
    [".next/standalone", "."], [".next/static", ".next/static"],
    ["public", "public"], ["templates", "templates"], ["drizzle", "drizzle"],
    ["scripts/render-start.mjs", "render-start.mjs"],
  ]) await fs.cp(path.join(source, from), path.join(staging, to), { recursive: true, verbatimSymlinks: true });
  await fs.copyFile(path.join(source, "LICENSE"), path.join(staging, "LICENSE"));
  await fs.mkdir(path.join(destination, "data/media"), { recursive: true });
  const esbuild = createRequire(require.resolve("tsx/package.json"))("esbuild");
  await esbuild.build({
    entryPoints: ["scripts/migrate.ts", "scripts/seed.ts", "scripts/create-user.ts", "scripts/demo-bootstrap.ts"],
    outdir: path.join(staging, "maintenance"), outExtension: { ".js": ".cjs" },
    bundle: true, platform: "node", target: "node24", format: "cjs",
    external: ["pg-native"], sourcemap: false, logLevel: "warning",
  });
  const packagePath = path.join(staging, "package.json");
  const pkg = JSON.parse(await fs.readFile(packagePath, "utf8"));
  pkg.scripts = {
    "db:migrate": "node maintenance/migrate.cjs",
    "db:seed": "node maintenance/seed.cjs",
    "auth:create": "node maintenance/create-user.cjs",
    "demo:bootstrap": "node maintenance/demo-bootstrap.cjs",
    "demo:render": "node render-start.mjs",
  };
  await fs.writeFile(packagePath, JSON.stringify(pkg, null, 2) + "\n");
  // Defense in depth: traces must not smuggle development secrets/test data.
  async function inspect(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.name === "work" || entry.name === ".git" || /^\.env(?:\.|$)/.test(entry.name)) {
        throw new Error(`Forbidden runtime artifact: ${path.relative(destination, path.join(directory, entry.name))}`);
      }
      if (entry.isDirectory()) await inspect(path.join(directory, entry.name));
      else if (entry.isSymbolicLink()) {
        const target = await fs.readlink(path.join(directory, entry.name));
        const resolved = path.resolve(directory, target);
        if (path.isAbsolute(target) || !resolved.startsWith(destination + path.sep)) {
          throw new Error(`Runtime symlink escapes artifact: ${path.relative(destination, path.join(directory, entry.name))}`);
        }
      }
    }
  }
  await inspect(destination);
  console.log("Prepared allowlisted standalone runtime and bundled offline maintenance commands.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
