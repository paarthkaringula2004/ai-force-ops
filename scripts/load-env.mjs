import dotenv from "dotenv";
import { homedir } from "node:os";
import { join } from "node:path";
// Hosting-provided values always win. Keep laptop settings out of the Render import.
if (process.env.RENDER !== "true") dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

// Local credentials can live outside the source checkout. Production continues
// to use the hosting service's environment settings, never a laptop-only file.
if (process.env.RENDER !== "true") {
    dotenv.config({
        path: process.env.AIFORCE_ENV_FILE || join(homedir(), ".config", "AIForce-Ops", "secrets.env"),
        quiet: true,
    });
}
