import path from "node:path";
import { pathToFileURL } from "node:url";

const runtimeRoot = path.resolve(process.argv[2]);
const controlRoot = path.resolve(process.argv[3]);

const databaseModule = await import(
  pathToFileURL(path.join(runtimeRoot, "node_modules", "better-sqlite3", "lib", "index.js")).href
);
const schemaModule = await import(
  pathToFileURL(path.join(runtimeRoot, "src", "tools", "pennyone", "intel", "schema.ts")).href
);

const Database = databaseModule.default;
const databasePath = path.join(controlRoot, ".stats", "pennyone.db");
const database = new Database(databasePath);
schemaModule.ensureHallSchema(database, controlRoot);
database.close();
