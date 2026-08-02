import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const LAST_UPDATE_URL = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt";
const POLLING_INTERVAL_MS = 15 * 60 * 1000;
const MATERIAL_CONFLICT_ROOT_CODES = new Set(["18", "19", "20"]);

function classification(rootCode) {
    if (rootCode === "19") return { type: "Battles", subType: "GDELT CAMEO fight" };
    if (rootCode === "20") return { type: "Violence against civilians", subType: "GDELT CAMEO mass violence" };
    return { type: "Explosions/Remote violence", subType: "GDELT CAMEO assault" };
}

export function parseEventRow(row) {
    const fields = row.split("\t");
    if (fields.length < 61 || !MATERIAL_CONFLICT_ROOT_CODES.has(fields[28])) return null;
    const latitude = Number(fields[56]);
    const longitude = Number(fields[57]);
    const sourceUrl = fields[60]?.trim();
    if (!sourceUrl || !Number.isFinite(latitude) || !Number.isFinite(longitude)
        || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

    const { type, subType } = classification(fields[28]);
    const dateAdded = fields[59];
    const timestamp = /^\d{14}$/.test(dateAdded)
        ? `${dateAdded.slice(0, 4)}-${dateAdded.slice(4, 6)}-${dateAdded.slice(6, 8)}T${dateAdded.slice(8, 10)}:${dateAdded.slice(10, 12)}:${dateAdded.slice(12, 14)}Z`
        : null;
    return {
        id: `gdelt-${fields[0]}`,
        latitude,
        longitude,
        type,
        subType,
        location: fields[52] || "Unknown",
        country_code: fields[53] || null,
        date: timestamp,
        source: new URL(sourceUrl).hostname,
        source_url: sourceUrl,
        event_summary: [fields[6], fields[16]].filter(Boolean).join(" / ") || subType,
        verification: "machine_coded_source_report",
        fatalities: null,
        cameo_event_code: fields[26],
        cameo_root_code: fields[28],
        goldstein_scale: Number.isFinite(Number(fields[30])) ? Number(fields[30]) : null,
        mention_count: Number(fields[31]) || 0,
        source_count: Number(fields[32]) || 0,
        article_count: Number(fields[33]) || 0,
        feed_source: "GDELT Event Database 2.0",
    };
}

async function downloadExportUrl() {
    const response = await fetch(LAST_UPDATE_URL, {
        headers: { "User-Agent": "WorldWideView-ControlRoom/2.0" },
        signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`GDELT lastupdate returned HTTP ${response.status}`);
    const line = (await response.text()).split(/\r?\n/).find((value) => value.includes(".export.CSV.zip"));
    const url = line?.trim().split(/\s+/).at(-1);
    if (!url?.startsWith("http://data.gdeltproject.org/gdeltv2/")) throw new Error("GDELT export URL is missing or invalid");
    return url;
}

async function fetchConflictEvents() {
    const exportUrl = await downloadExportUrl();
    const response = await fetch(exportUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`GDELT export returned HTTP ${response.status}`);
    const zipPath = `/tmp/wwv-gdelt-${process.pid}.zip`;
    try {
        await fs.writeFile(zipPath, Buffer.from(await response.arrayBuffer()));
        const { stdout } = await execFileAsync("unzip", ["-p", zipPath], { maxBuffer: 64 * 1024 * 1024 });
        const deduplicated = new Map();
        for (const row of stdout.split(/\r?\n/)) {
            const event = parseEventRow(row);
            if (event) deduplicated.set(event.id, event);
        }
        return [...deduplicated.values()];
    } finally {
        await fs.rm(zipPath, { force: true });
    }
}

export { fetchConflictEvents };
export default { name: "conflict-events", interval: POLLING_INTERVAL_MS, fetch: fetchConflictEvents };
