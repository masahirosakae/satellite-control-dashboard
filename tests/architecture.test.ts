/**
 * AST-based dependency-boundary tests for the Control Plane. These rules
 * enforce, at the source-file level, that the Control Plane boundary
 * (src/services/control/) is truly isolated: it cannot reach providers,
 * MissionApi, the store, or rehearsal code; it never references I/O
 * globals; and no client code in src/ references server secrets.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";

const SRC_ROOT = path.resolve(__dirname, "..", "src");

interface FileInfo {
  relPath: string; // posix-style, relative to src/
  absPath: string;
  imports: string[]; // module specifiers from ImportDeclaration / ExportDeclaration
  identifiers: Set<string>; // all Identifier names in the file
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (toPosix(full).includes("/src/assets")) continue;
      walk(full, out);
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      out.push(full);
    }
  }
}

function collectFiles(): FileInfo[] {
  const absFiles: string[] = [];
  walk(SRC_ROOT, absFiles);

  return absFiles.map((absPath) => {
    const text = fs.readFileSync(absPath, "utf-8");
    const sourceFile = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true);
    const imports: string[] = [];
    const identifiers = new Set<string>();

    function visit(node: ts.Node): void {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        imports.push(node.moduleSpecifier.text);
      }
      // Dynamic import("...") and require("...") calls — both are ways to
      // reach another module that a static ImportDeclaration/ExportDeclaration
      // scan alone would miss. Rules 1/3/4 rely on `imports` being complete.
      if (ts.isCallExpression(node)) {
        const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
        const isRequireCall = ts.isIdentifier(node.expression) && node.expression.text === "require";
        if (isDynamicImport || isRequireCall) {
          const arg = node.arguments[0];
          if (arg && ts.isStringLiteral(arg)) {
            imports.push(arg.text);
          }
        }
      }
      if (ts.isIdentifier(node)) {
        identifiers.add(node.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);

    const relPath = toPosix(path.relative(path.resolve(SRC_ROOT, ".."), absPath));
    return { relPath, absPath, imports, identifiers };
  });
}

const files = collectFiles();

/** Resolve a relative import specifier against the importing file's directory to a normalized src/-relative path (no guarantee of extension). */
function resolveImport(fromFile: FileInfo, spec: string): string | null {
  if (!spec.startsWith(".")) return null; // package import, not local
  const fromDir = path.posix.dirname(fromFile.relPath);
  const resolved = path.posix.normalize(path.posix.join(fromDir, spec));
  return resolved;
}

describe("Control Plane architecture boundaries", () => {
  const controlFiles = files.filter((f) => f.relPath.startsWith("src/services/control/"));

  it("has at least the expected Control Plane files present (sanity check)", () => {
    expect(controlFiles.length).toBeGreaterThanOrEqual(2);
  });

  it("collector sanity check: a known file with a real import is not silently collected as importing nothing", () => {
    // Guards against the AST visitor regressing to a no-op (e.g. a typo'd
    // ts.is* predicate) that would make every rule below vacuously pass.
    const known = files.find((f) => f.relPath === "src/services/control/DisabledControlPlane.ts");
    expect(known).toBeDefined();
    expect(known!.imports.length).toBeGreaterThanOrEqual(1);
  });

  it("rule 1: files under src/services/control/ import nothing outside src/services/control/ and src/domain/ types", () => {
    const violations: string[] = [];
    for (const f of controlFiles) {
      for (const spec of f.imports) {
        const resolved = resolveImport(f, spec);
        if (resolved === null) {
          // non-relative (package) import — not allowed either, since the
          // only permitted targets are local control/ and domain/ files.
          violations.push(`${f.relPath} imports package "${spec}"`);
          continue;
        }
        const allowed =
          resolved.startsWith("src/services/control/") || resolved.startsWith("src/domain/");
        const forbidden =
          resolved.startsWith("src/services/providers/") ||
          resolved.startsWith("src/services/api/") ||
          resolved.startsWith("src/store/") ||
          resolved.startsWith("src/domain/commandRehearsal");
        if (!allowed || forbidden) {
          violations.push(`${f.relPath} imports "${spec}" (resolved: ${resolved})`);
        }
      }
    }
    expect(violations, `Forbidden imports found:\n${violations.join("\n")}`).toEqual([]);
  });

  it("rule 2: no file under src/services/control/ contains fetch, XMLHttpRequest, WebSocket, sendBeacon, EventSource, WebTransport, or require identifiers", () => {
    const forbiddenIds = ["fetch", "XMLHttpRequest", "WebSocket", "sendBeacon", "EventSource", "WebTransport", "require"];
    const violations: string[] = [];
    for (const f of controlFiles) {
      for (const id of forbiddenIds) {
        if (f.identifiers.has(id)) {
          violations.push(`${f.relPath} contains identifier "${id}"`);
        }
      }
    }
    expect(violations, `I/O identifiers found in control plane:\n${violations.join("\n")}`).toEqual([]);
  });

  it("rule 3: src/domain/commandRehearsal.ts and src/components/command/ do not import from src/services/control/", () => {
    const candidates = files.filter(
      (f) => f.relPath === "src/domain/commandRehearsal.ts" || f.relPath.startsWith("src/components/command/")
    );
    const violations: string[] = [];
    for (const f of candidates) {
      for (const spec of f.imports) {
        const resolved = resolveImport(f, spec);
        if (resolved && resolved.startsWith("src/services/control/")) {
          violations.push(`${f.relPath} imports "${spec}"`);
        }
      }
    }
    expect(violations, `Rehearsal code imports Control Plane:\n${violations.join("\n")}`).toEqual([]);
  });

  it("rule 4: src/services/providers/ and src/services/api/ do not import from src/services/control/", () => {
    const candidates = files.filter(
      (f) => f.relPath.startsWith("src/services/providers/") || f.relPath.startsWith("src/services/api/")
    );
    const violations: string[] = [];
    for (const f of candidates) {
      for (const spec of f.imports) {
        const resolved = resolveImport(f, spec);
        if (resolved && resolved.startsWith("src/services/control/")) {
          violations.push(`${f.relPath} imports "${spec}"`);
        }
      }
    }
    expect(violations, `Providers/api import Control Plane:\n${violations.join("\n")}`).toEqual([]);
  });

  it("rule 5: no file under src/ references process.env or SATNOGS_API_TOKEN", () => {
    // Note: this checks for actual programmatic references (process.env.X
    // access, the bare identifier SATNOGS_API_TOKEN, or an exact-match
    // string literal "SATNOGS_API_TOKEN" as in process.env["..."]) — NOT
    // human-readable operator-facing messages that merely *mention* the
    // env var name (e.g. "set SATNOGS_API_TOKEN on the server"), which
    // exist today in advisory/warning copy and are not secret access.
    const violations: string[] = [];
    for (const f of files) {
      const text = fs.readFileSync(f.absPath, "utf-8");
      const sourceFile = ts.createSourceFile(f.absPath, text, ts.ScriptTarget.Latest, true);

      function visit(node: ts.Node): void {
        if (
          ts.isPropertyAccessExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "process" &&
          node.name.text === "env"
        ) {
          violations.push(`${f.relPath} references process.env`);
        }
        if (ts.isIdentifier(node) && node.text === "SATNOGS_API_TOKEN") {
          violations.push(`${f.relPath} references identifier SATNOGS_API_TOKEN`);
        }
        if (ts.isStringLiteralLike(node) && node.text === "SATNOGS_API_TOKEN") {
          violations.push(`${f.relPath} references string literal "SATNOGS_API_TOKEN"`);
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);
    }
    expect(violations, `Client code references server secrets:\n${violations.join("\n")}`).toEqual([]);
  });
});
