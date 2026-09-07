#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { checkPlein, ParseError } from "./parser.js";

function usage(): never {
  console.error("Usage: plein check <file.plein>");
  process.exit(2);
}

const args = process.argv.slice(2);
const command = args[0];
const fileArg = args[1];

if (command !== "check" || !fileArg || args.length !== 2) {
  usage();
}

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
  if (error instanceof Error && "code" in error && error.code === "ENOENT") {
    console.error(`file not found: ${fileArg}`);
    process.exit(1);
  }
  throw error;
}
