import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// This Node-only test helper does not add Node globals to the shared client types.
export function readUtf8FileRoundtrip(bytes) {
  const directory = mkdtempSync(join(tmpdir(), "diary-csv-"));
  try {
    const file = join(directory, "records.csv");
    writeFileSync(file, bytes);
    return readFileSync(file, "utf8");
  } finally { rmSync(directory, { recursive: true }); }
}
