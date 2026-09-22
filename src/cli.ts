#!/usr/bin/env node
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  ExportError,
  exportNamedView,
  isExportFormat,
  type ExportFormat,
} from "./export.js";
import { loadPleinSource } from "./list-model.js";
import { checkPlein, ParseError } from "./parser.js";

function usage(): never {
  console.error(`Usage:
  plein check <file.plein>
  plein export <file.plein> [--view <name>] [--format html|svg|both] [-o <file>]

Export one named viewpoint to a self-contained HTML page and/or SVG.
Open the file in a browser; the Mac app does not need to be running.
--view is a viewpoint name or its title (default: the first named view).
--format defaults to html. both writes .html and .svg and requires -o.
Without -o, html or svg is written to stdout.`);
  process.exit(2);
}

function runCheck(fileArg: string): void {
  const file = resolve(fileArg);
  try {
    const source = readFileSync(file, "utf8");
    const model = checkPlein(source, fileArg);
    console.log(
      `ok ${fileArg} (${model.elements.length} elements, ${model.relationships.length} relationships, ${model.views.length} views)`,
    );
  } catch (error) {
    if (error instanceof ParseError) {
      console.error(error.message);
      process.exit(1);
    }
    if (isEnoent(error)) {
      console.error(`file not found: ${fileArg}`);
      process.exit(1);
    }
    throw error;
  }
}

type ExportArgs = {
  file: string;
  view?: string;
  format: ExportFormat;
  output?: string;
};

function parseExportArgs(argv: string[]): ExportArgs {
  let view: string | undefined;
  let format: ExportFormat = "html";
  let output: string | undefined;
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      usage();
    }
    const inline = splitInlineFlag(arg);
    if (inline) {
      const value = requireValue(inline.value);
      if (inline.flag === "--view") {
        view = value;
      } else if (inline.flag === "--format") {
        format = requireFormat(value);
      } else {
        output = value;
      }
      continue;
    }
    if (arg === "--view" || arg === "--format" || arg === "-o" || arg === "--output") {
      const value = requireValue(argv[++i]);
      if (arg === "--view") {
        view = value;
      } else if (arg === "--format") {
        format = requireFormat(value);
      } else {
        output = value;
      }
      continue;
    }
    if (arg.startsWith("-")) {
      usage();
    }
    positionals.push(arg);
  }

  if (positionals.length !== 1) {
    usage();
  }
  if (format === "both" && !output) {
    console.error("error: --format both requires -o <file>");
    process.exit(2);
  }
  return { file: positionals[0]!, view, format, output };
}

function splitInlineFlag(
  arg: string,
): { flag: "--view" | "--format" | "--output"; value: string } | undefined {
  for (const flag of ["--view", "--format", "--output"] as const) {
    const prefix = `${flag}=`;
    if (arg.startsWith(prefix)) {
      return { flag, value: arg.slice(prefix.length) };
    }
  }
  return undefined;
}

function requireValue(value: string | undefined): string {
  if (value === undefined || value === "" || value.startsWith("-")) {
    usage();
  }
  return value;
}

function requireFormat(value: string): ExportFormat {
  if (!isExportFormat(value)) {
    usage();
  }
  return value;
}

function readSource(fileArg: string): string {
  try {
    return readFileSync(resolve(fileArg), "utf8");
  } catch (error) {
    if (isEnoent(error)) {
      console.error(`file not found: ${fileArg}`);
      process.exit(1);
    }
    throw error;
  }
}

async function runExport(argv: string[]): Promise<void> {
  const args = parseExportArgs(argv);
  const source = readSource(args.file);
  const loaded = loadPleinSource(source, args.file);
  if (!loaded.ok) {
    console.error(loaded.error);
    process.exit(1);
  }

  let exported;
  try {
    exported = await exportNamedView(loaded.model, args.view, args.file);
  } catch (error) {
    if (error instanceof ExportError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  if (!args.output) {
    process.stdout.write(args.format === "svg" ? exported.svg : exported.html);
    return;
  }

  const targets = outputTargets(args.output, args.format, exported.viewName);
  if (targets.html) {
    writeText(targets.html, exported.html);
    console.log(`exported ${exported.viewName} html ${targets.html}`);
  }
  if (targets.svg) {
    writeText(targets.svg, exported.svg);
    console.log(`exported ${exported.viewName} svg ${targets.svg}`);
  }
}

function outputTargets(
  output: string,
  format: ExportFormat,
  viewName: string,
): { html?: string; svg?: string } {
  if (format === "html") {
    return { html: singlePath(output, viewName, "html") };
  }
  if (format === "svg") {
    return { svg: singlePath(output, viewName, "svg") };
  }
  if (isDirectoryPath(output)) {
    const dir = output.replace(/[\\/]+$/, "");
    const stem = safeFileStem(viewName);
    return { html: join(dir, `${stem}.html`), svg: join(dir, `${stem}.svg`) };
  }
  const stripped = output.replace(/\.(html|svg)$/i, "");
  return { html: `${stripped}.html`, svg: `${stripped}.svg` };
}

function singlePath(output: string, viewName: string, ext: "html" | "svg"): string {
  if (!isDirectoryPath(output)) {
    return output;
  }
  const dir = output.replace(/[\\/]+$/, "");
  return join(dir, `${safeFileStem(viewName)}.${ext}`);
}

function isDirectoryPath(output: string): boolean {
  if (output.endsWith("/") || output.endsWith("\\")) {
    return true;
  }
  try {
    return statSync(output).isDirectory();
  } catch {
    return false;
  }
}

function safeFileStem(viewName: string): string {
  const stem = viewName.replace(/[\\/]/g, "-").replace(/^\.+/, "");
  return stem.length > 0 ? stem : "view";
}

function writeText(path: string, body: string): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, body, "utf8");
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  if (command === "check") {
    if (args.length !== 2 || !args[1]) {
      usage();
    }
    runCheck(args[1]);
    return;
  }
  if (command === "export") {
    await runExport(args.slice(1));
    return;
  }
  usage();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
