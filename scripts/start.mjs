import path from "node:path";
import dotenv from "dotenv";
dotenv.config({path:".env.local",quiet:true});
dotenv.config({quiet:true});
process.env.NEXT_TELEMETRY_DISABLED="1";
// Resolve durable storage before Next standalone changes its working directory.
process.env.MEDIA_DIR=path.resolve(process.env.MEDIA_DIR || "work/media");
// Bare-host preview defaults to loopback; Docker runs server.js with its own binding.
process.env.HOSTNAME=process.env.LISTEN_HOST || "127.0.0.1";
await import("../.next/standalone/server.js");
