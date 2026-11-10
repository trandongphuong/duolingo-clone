import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(".next/standalone");
await mkdir(path.join(root, ".next"), { recursive: true });
await cp("public", path.join(root, "public"), { recursive: true });
await cp(".next/static", path.join(root, ".next/static"), { recursive: true });
await cp("templates", path.join(root, "templates"), { recursive: true });
console.log(
  "Standalone: static/public/templates đã sẵn sàng, không chứa dữ liệu vận hành."
);
