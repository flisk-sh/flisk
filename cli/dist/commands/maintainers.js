// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
export const MIN_MAINTAINERS = 3;
export const MIN_COMPANIES = 2;
const REQUIRED_COLUMNS = ["name", "github id", "company"];
const PLACEHOLDER_COMPANIES = new Set(["", "tbd", "unknown", "flisk-sh"]);
function splitRow(line) {
    return line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim());
}
export function parseMaintainers(markdown) {
    const lines = markdown.split(/\r?\n/);
    const headerIndex = lines.findIndex((line) => {
        if (!line.includes("|"))
            return false;
        const cells = splitRow(line).map((cell) => cell.toLowerCase());
        return REQUIRED_COLUMNS.every((column) => cells.includes(column));
    });
    if (headerIndex === -1) {
        return {
            ok: false,
            error: "table with columns Name, GitHub id, Company not found",
        };
    }
    const header = splitRow(lines[headerIndex]).map((cell) => cell.toLowerCase());
    const nameAt = header.indexOf("name");
    const githubAt = header.indexOf("github id");
    const companyAt = header.indexOf("company");
    const rows = [];
    for (const line of lines.slice(headerIndex + 1)) {
        if (!line.includes("|"))
            break;
        const cells = splitRow(line);
        if (cells.every((cell) => /^:?-+:?$/.test(cell)))
            continue;
        rows.push({
            name: cells[nameAt] ?? "",
            githubId: cells[githubAt] ?? "",
            company: cells[companyAt] ?? "",
        });
    }
    return { ok: true, rows };
}
export function evaluateMaintainers(rows) {
    const seen = new Set();
    const valid = rows.filter((row) => {
        const id = row.githubId.toLowerCase();
        if (!row.name || !id || seen.has(id) || PLACEHOLDER_COMPANIES.has(row.company.toLowerCase())) {
            return false;
        }
        seen.add(id);
        return true;
    });
    const companies = new Set(valid.map((row) => row.company.toLowerCase()));
    const missingPeople = Math.max(0, MIN_MAINTAINERS - valid.length);
    const missingCompanies = Math.max(0, MIN_COMPANIES - companies.size);
    return {
        eligible: missingPeople === 0 && missingCompanies === 0,
        people: valid.length,
        companies: companies.size,
        missingPeople,
        missingCompanies,
    };
}
export function runMaintainersCheck(file) {
    const path = resolve(file);
    if (!existsSync(path)) {
        return { exitCode: 1, output: `${file} not found` };
    }
    const parsed = parseMaintainers(readFileSync(path, "utf8"));
    if (!parsed.ok) {
        return { exitCode: 1, output: `${file}: ${parsed.error}` };
    }
    const report = evaluateMaintainers(parsed.rows);
    if (report.eligible) {
        return {
            exitCode: 0,
            output: `${report.people} maintainers, ${report.companies} companies`,
        };
    }
    return {
        exitCode: 1,
        output: `not eligible: ${report.people} maintainers (${report.missingPeople} missing), ${report.companies} companies (${report.missingCompanies} missing)`,
    };
}
export const maintainersCommand = new Command("maintainers")
    .description("Maintainer file checks")
    .addCommand(new Command("check")
    .description("Check MAINTAINERS.md lists 3 maintainers from 2 companies (a gate, not a claim of eligibility)")
    .argument("[file]", "maintainers file", "MAINTAINERS.md")
    .action((file) => {
    const { exitCode, output } = runMaintainersCheck(file);
    (exitCode === 0 ? console.log : console.error)(output);
    process.exitCode = exitCode;
}));
