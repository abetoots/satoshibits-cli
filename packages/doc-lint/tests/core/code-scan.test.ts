import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { buildCodeMap } from "../../src/core/code-scan.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-lint-codescan-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relativePath: string, content: string): void {
  const abs = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

describe("buildCodeMap", () => {
  it("parses package.json dependencies into a fingerprint", async () => {
    writeFile(
      "package.json",
      JSON.stringify({
        name: "sample-app",
        dependencies: { express: "^4", stripe: "^14" },
        devDependencies: { vitest: "^1" },
        scripts: { start: "node dist/index.js", dev: "tsx src/index.ts" },
      }),
    );

    const map = await buildCodeMap(tmpDir);

    expect(map.packages).toHaveLength(1);
    expect(map.packages[0]!.name).toBe("sample-app");
    expect(map.packages[0]!.dependencies).toContain("express");
    expect(map.packages[0]!.dependencies).toContain("stripe");
    expect(map.entrypoints.some((e) => e.includes("start"))).toBe(true);
  });

  it("extracts express routes with file:line", async () => {
    writeFile(
      "src/server.ts",
      [
        "const app = express();",
        "app.get('/users', handler);",
        "app.post('/payments/charge', chargeHandler);",
      ].join("\n"),
    );

    const map = await buildCodeMap(tmpDir);

    const paths = map.routes.map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain("GET /users");
    expect(paths).toContain("POST /payments/charge");
    const charge = map.routes.find((r) => r.path === "/payments/charge")!;
    expect(charge.file).toBe("src/server.ts");
    expect(charge.line).toBe(3);
  });

  it("extracts prisma and mongoose models", async () => {
    writeFile("prisma/schema.prisma", "model User {\n  id Int @id\n}\n\nmodel Order {\n  id Int @id\n}");
    writeFile("src/models/cart.ts", "const Cart = mongoose.model('Cart', schema);");

    const map = await buildCodeMap(tmpDir);

    const names = map.models.map((m) => m.name);
    expect(names).toContain("User");
    expect(names).toContain("Order");
    expect(names).toContain("Cart");
    expect(map.models.find((m) => m.name === "User")!.orm).toBe("prisma");
  });

  it("detects external calls and ignores localhost urls", async () => {
    writeFile(
      "src/pay.ts",
      [
        "const stripe = new Stripe(key);",
        "await axios.get('https://api.example.com/data');",
        "await fetch('http://localhost:3000/health');",
      ].join("\n"),
    );

    const map = await buildCodeMap(tmpDir);

    const targets = map.externalCalls.map((c) => c.target);
    expect(targets).toContain("stripe");
    expect(map.externalCalls.some((c) => c.target.includes("api.example.com"))).toBe(true);
    // localhost url should not be captured as a url-literal external call
    expect(map.externalCalls.some((c) => c.target.includes("localhost"))).toBe(false);
  });

  it("collects env vars and exported api surface", async () => {
    writeFile(
      "src/config.ts",
      [
        "export const PORT = process.env.PORT;",
        "export function connect() {}",
        "const secret = process.env['API_SECRET'];",
      ].join("\n"),
    );

    const map = await buildCodeMap(tmpDir);

    expect(map.envVars).toContain("PORT");
    expect(map.envVars).toContain("API_SECRET");
    expect(map.apiSurface.map((a) => a.name)).toContain("connect");
    expect(map.apiSurface.map((a) => a.name)).toContain("PORT");
  });

  it("ignores node_modules, tests, and fixtures", async () => {
    writeFile("node_modules/pkg/index.js", "app.get('/leak', h);");
    writeFile("src/foo.test.ts", "app.get('/test-route', h);");
    writeFile("tests/fixtures/sample.ts", "app.get('/fixture-route', h);");
    writeFile("src/real.ts", "app.get('/real', h);");

    const map = await buildCodeMap(tmpDir);

    const paths = map.routes.map((r) => r.path);
    expect(paths).toContain("/real");
    expect(paths).not.toContain("/leak");
    expect(paths).not.toContain("/test-route");
    expect(paths).not.toContain("/fixture-route");
  });

  it("flags unsupported languages in coverage but still records them", async () => {
    writeFile("src/main.py", "def handler():\n    pass");
    writeFile("src/app.ts", "export const x = 1;");

    const map = await buildCodeMap(tmpDir);

    expect(map.coverage.unsupportedLanguages).toContain(".py");
    expect(map.coverage.scannedPaths).toContain("src/main.py");
  });

  it("tolerates a malformed package.json without crashing", async () => {
    writeFile("package.json", "{ this is not valid json ");
    writeFile("src/app.ts", "app.get('/ok', h);");

    const map = await buildCodeMap(tmpDir);

    // bad package.json is skipped (no package entry), but scanning still proceeds
    expect(map.packages).toHaveLength(0);
    expect(map.routes.map((r) => r.path)).toContain("/ok");
  });

  it("records config/infra signals by presence", async () => {
    writeFile("Dockerfile", "FROM node:20");
    writeFile(".github/workflows/ci.yml", "name: ci");
    writeFile("src/app.ts", "export const x = 1;");

    const map = await buildCodeMap(tmpDir);

    expect(map.configSignals).toContain("docker");
    expect(map.configSignals).toContain("github-actions");
  });

  it("produces a deterministic, bounded tree", async () => {
    writeFile("src/a.ts", "export const a = 1;");
    writeFile("src/b.ts", "export const b = 1;");
    writeFile("src/nested/c.ts", "export const c = 1;");

    const map1 = await buildCodeMap(tmpDir);
    const map2 = await buildCodeMap(tmpDir);

    expect(map1.tree).toBe(map2.tree);
    expect(map1.tree).toContain("src/");
    expect(map1.tree).toContain("nested/");
  });

  it("respects custom source roots", async () => {
    writeFile("src/included.ts", "app.get('/in', h);");
    writeFile("scripts/excluded.ts", "app.get('/out', h);");

    const map = await buildCodeMap(tmpDir, { paths: ["src"] });

    const paths = map.routes.map((r) => r.path);
    expect(paths).toContain("/in");
    expect(paths).not.toContain("/out");
  });
});
