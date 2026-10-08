import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The kitchen PC runs Windows 8.1, which caps Chrome at version 109. Anything newer is
// silently dropped there: oklch() colours, for one, left the whole till without
// backgrounds or borders. Keep the shipped front end inside what Chrome 109 understands.
const TOO_NEW = /oklch\(|oklab\(|color-mix\(|light-dark\(|(?:rgb|hsl)\(from |@starting-style|\bsubgrid\b|\.toSorted\(|\.toReversed\(|\.toSpliced\(|Object\.groupBy|Promise\.withResolvers/;

describe("front end stays compatible with Chrome 109", () => {
  const dir = join(__dirname, "..", "pos");
  const files = [...readdirSync(dir).filter(f => /\.(css|js|html)$/.test(f)).map(f => join(dir, f)), join(dir, "dashboard", "index.html"), join(__dirname, "..", "index.html")];
  it.each(files)("%s uses nothing newer", file => {
    const hit = readFileSync(file, "utf8").match(TOO_NEW);
    expect(hit && hit[0]).toBeNull();
  });
});
