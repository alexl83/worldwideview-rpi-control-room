import assert from "node:assert/strict";
import test from "node:test";
import { parseEventRow } from "../dist/index.mjs";

function row(rootCode = "19") {
  const fields = Array(61).fill("");
  fields[0] = "123456789";
  fields[6] = "ACTOR ONE";
  fields[16] = "ACTOR TWO";
  fields[26] = "190";
  fields[28] = rootCode;
  fields[30] = "-10";
  fields[31] = "4";
  fields[32] = "2";
  fields[33] = "3";
  fields[52] = "Rome, Lazio, Italy";
  fields[53] = "IT";
  fields[56] = "41.9";
  fields[57] = "12.5";
  fields[59] = "20260802110000";
  fields[60] = "https://example.invalid/report";
  return fields.join("\t");
}

test("parses a material-conflict event with stable provenance and no casualties", () => {
  const event = parseEventRow(row());
  assert.equal(event.id, "gdelt-123456789");
  assert.equal(event.type, "Battles");
  assert.equal(event.source_url, "https://example.invalid/report");
  assert.equal(event.fatalities, null);
  assert.equal(event.verification, "machine_coded_source_report");
});

test("rejects non-material CAMEO roots", () => {
  assert.equal(parseEventRow(row("14")), null);
});
