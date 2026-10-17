import dotenv from "dotenv";
import { checkRenderEnvironment } from "./render-config.mjs";
// Deliberately inspect the Render import, never .env.local.
dotenv.config({ quiet: true });
const result = checkRenderEnvironment(process.env);
for (const warning of result.warnings) console.warn(`Notice: ${warning}`);
for (const error of result.errors) console.error(`Configuration: ${error}`);
if (result.errors.length) process.exitCode = 1;
else
    console.log(
        "Render environment checks passed. Secret values were not printed. Provider/network access still requires deployed verification.",
    );
