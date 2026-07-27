// Smoke test: exercises DB + Obsidian sync end-to-end in a temp dir.
// Run: bun run check
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "lifeos-"));
process.env.DB_PATH = join(tmp, "t.db");
process.env.VAULT_PATH = tmp;
process.env.JOURNAL_SUBDIR = "J";

const { run } = await import("./db.ts");
const { syncDay } = await import("./obsidian.ts");

const now = new Date().toISOString();
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
const day = localDate();

run("INSERT INTO journals(day,content,updated_at) VALUES(?,?,?)", day, "hello world", now);
run("INSERT INTO moods(ts,score,note) VALUES(?,?,?)", now, 8, "good day");
run("INSERT INTO transactions(ts,amount,category,note,kind) VALUES(?,?,?,?,?)", now, 12.5, "food", "lunch", "expense");
run("INSERT INTO transactions(ts,amount,category,note,kind) VALUES(?,?,?,?,?)", now, 100, "salary", "", "income");
run("INSERT INTO time_sessions(label,category,started_at,ended_at) VALUES(?,?,?,?)",
    "deep work", "work", new Date(Date.now() - 3600_000).toISOString(), now);

const mdPath = await syncDay(day);
const md = readFileSync(mdPath, "utf-8");

function assert(cond: unknown, msg: string) { if (!cond) { console.error("FAIL:", msg, "\n---\n", md); process.exit(1); } }

assert(existsSync(mdPath),        "markdown file created");
assert(md.includes("mood: 8"),    "avg mood in frontmatter");
assert(md.includes("spent: 12.50"),  "spend in frontmatter");
assert(md.includes("income: 100.00"),"income in frontmatter");
assert(/work_hours: 1\.\d+/.test(md),"hours in frontmatter");
assert(md.includes("hello world"),"journal body");
assert(md.includes("deep work"),  "time session");
assert(md.includes("food"),       "transaction");
assert(md.includes("8/10"),       "mood entry");

rmSync(tmp, { recursive: true, force: true });
console.log("✅ selfcheck ok");
