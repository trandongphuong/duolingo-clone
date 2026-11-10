#!/usr/bin/env bash
# Run after images/migration/seed/bootstrap. This checks network isolation and
# readiness; acceptance still requires browser learner/author flows and restore.
set -euo pipefail
docker compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose exec -T ingress wget -Y off -q -O /dev/null http://127.0.0.1:8080/
docker compose exec -T app node <<'NODE'
const fs = require("node:fs");
const net = require("node:net");
(async () => {
  const routes = fs.readFileSync("/proc/net/route", "utf8").trim().split("\n").slice(1);
  if (routes.some(line => line.trim().split(/\s+/)[1] === "00000000")) {
    throw new Error("FAIL: app has a default IPv4 route; expected internal-only backend.");
  }
  const response = await fetch("http://127.0.0.1:3000/");
  if (!response.ok) throw new Error(`FAIL: app HTTP ${response.status}`);
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host: "1.1.1.1", port: 443 });
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("Unexpected probe timeout; inspect routing/firewall before claiming PASS.")); }, 4000);
    socket.on("connect", () => { clearTimeout(timer); socket.destroy(); reject(new Error("FAIL: app connected to public Internet.")); });
    socket.on("error", error => {
      clearTimeout(timer);
      if (error.code === "ENETUNREACH") resolve();
      else reject(new Error(`Unexpected egress error ${error.code}; expected ENETUNREACH.`));
    });
  });
  console.log("PASS app HTTP200, no default IPv4 route, public TCP blocked ENETUNREACH; DB and ingress ready.");
  console.log("Browser auth/import/quiz/persistence/network audit and real LAN acceptance must be tested separately.");
})().catch(error => { console.error(error.message); process.exitCode = 1; });
NODE
