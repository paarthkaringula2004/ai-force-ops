import dotenv from "dotenv";
// Hosting-provided values always win. Keep laptop settings out of the Render import.
if (process.env.RENDER !== "true") dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
