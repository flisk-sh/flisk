import chalk from "chalk";
import type { CheckResult, DoctorAction } from "../types/index.js";
import { formatFixFirst, rankDoctorFixes } from "./doctor-fix-first.js";
import { formatDoctorSummary, orderDoctorResults } from "./doctor-runner.js";

// Human-readable doctor output: results, repair actions and the "Fix first" list.

export function printFixActions(
  actions: DoctorAction[],
  dryRun: boolean,
  failedCheckCount: number = 0,
): void {
  if (actions.length === 0) {
    if (failedCheckCount > 0) {
      console.log(`Nothing to repair automatically; ${failedCheckCount} checks need your action\n`);
    } else {
      console.log(`${chalk.green("✓")} Nothing to repair\n`);
    }
    return;
  }
  for (const action of actions) {
    let label = chalk.gray("skipped");
    if (action.status === "planned") {
      label = `${chalk.cyan("would run")}`;
    } else if (action.status === "applied") {
      label = chalk.green("ran");
    } else if (action.status === "failed") {
      label = chalk.red("failed");
    }
    const detail = action.status === "planned" ? "" : ` (${action.reason})`;
    console.log(`${label}: ${action.command}${detail}`);
  }
  if (dryRun) console.log(chalk.gray("\nDry run: nothing was changed."));
  console.log("");
}

export function printDoctorResults(list: CheckResult[]): void {
  for (const result of orderDoctorResults(list)) {
    if (!result.didPass && !result.isSkipped && !result.isWarning) {
      console.log(`${chalk.red("✗")} ${result.message}`);
      if (result.fix) console.log(`${chalk.blue("ℹ")} Fix: ${result.fix}`);
    } else if (result.isWarning) {
      console.log(`${chalk.yellow("⚠")} ${chalk.yellow(result.message)}`);
      if (result.fix) console.log(`${chalk.blue("ℹ")} Fix: ${result.fix}`);
    } else if (result.isSkipped) {
      console.log(`${chalk.gray("○")} ${chalk.gray(result.message)}`);
      if (result.fix) console.log(`${chalk.blue("ℹ")} ${result.fix}`);
    } else {
      console.log(`${chalk.green("✓")} ${result.message}`);
    }
  }
}

export function renderDoctorOutput(
  machineResults: CheckResult[],
  projectResults: CheckResult[],
  inProject: boolean,
  options: { all?: boolean } = {},
  allResults?: CheckResult[],
): void {
  const results = allResults ?? [...machineResults, ...projectResults];
  const printFixFirst = (): void => {
    const lines = formatFixFirst(rankDoctorFixes(results));
    if (lines.length === 0) return;
    console.log(chalk.bold("Fix first"));
    for (const line of lines) console.log(line);
    console.log("");
  };
  if (options.all) {
    console.log(chalk.bold("Machine"));
    printDoctorResults(machineResults);

    console.log(`\n${chalk.bold("Project")}`);
    if (inProject) {
      if (projectResults.length > 0) {
        printDoctorResults(projectResults);
      }
    } else {
      console.log(
        `${chalk.gray("○")} ${chalk.gray("Not in a Flisk project, so project checks were skipped")}`,
      );
    }

    console.log("");
    console.log(formatDoctorSummary(results));
    printFixFirst();
  } else {
    printDoctorResults(results);
    console.log("");
    printFixFirst();

    const allPassed = results.every((check) => check.didPass || check.isSkipped || check.isWarning);
    if (allPassed && !inProject) {
      console.log(
        `${chalk.gray("○")} ${chalk.gray("Not in a Flisk project, so project checks were skipped")}`,
      );
      console.log("");
    }
  }
}
