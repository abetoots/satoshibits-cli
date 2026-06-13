import type { Confidence } from "./findings.js";

// a single parsed package.json — the framework/dependency fingerprint
export interface PackageInfo {
  name: string;
  path: string; // relative to project root
  dependencies: string[];
  devDependencies: string[];
  scripts: Record<string, string>;
  engines: Record<string, string>;
}

// a route discovered via regex (express/fastify/nest/next patterns)
export interface RouteInfo {
  method: string; // GET, POST, ... or "decorator" for framework decorators
  path: string;
  file: string;
  line: number;
  confidence: Confidence;
}

// a persisted entity discovered via ORM patterns
export interface ModelInfo {
  name: string;
  orm: string; // prisma | mongoose | drizzle | typeorm | unknown
  file: string;
  line: number;
  confidence: Confidence;
}

// an outbound call to an external service
export interface ExternalCallInfo {
  target: string; // sdk name, url, or client constructor
  kind: string; // http | sdk | url
  file: string;
  line: number;
  confidence: Confidence;
}

// an exported function/class signature (snippet only, never the body)
export interface ApiSurfaceItem {
  name: string;
  kind: string; // function | class | const
  snippet: string;
  file: string;
  line: number;
  confidence: Confidence;
}

// the evidence/coverage model — CodeMap is a sampled, best-effort view,
// not ground truth. Consumers must treat "absent from map" as "not scanned",
// not "absent from code".
export interface CodeCoverage {
  scannedPaths: string[];
  ignoredPaths: string[];
  sampledOutPaths: string[]; // dropped by token budget — drives completeness gates
  unsupportedLanguages: string[];
}

export interface CodeMap {
  root: string;
  tree: string; // depth/width-capped directory tree
  packages: PackageInfo[];
  entrypoints: string[]; // bin, main, exports, scripts.start/dev
  routes: RouteInfo[];
  models: ModelInfo[];
  externalCalls: ExternalCallInfo[];
  apiSurface: ApiSurfaceItem[];
  envVars: string[]; // process.env.* references
  configSignals: string[]; // Dockerfile, k8s, terraform, ci files present
  fileCount: number;
  sampledFiles: number; // token-budget transparency
  coverage: CodeCoverage;
}

export interface CodeScanOptions {
  // source roots relative to projectPath; defaults to ["."]
  paths?: string[];
  // additional ignore globs
  ignore?: string[];
  // entrypoint hints
  entrypoints?: string[];
  // soft cap used by tier-2 summarization (phase 4); tier-1 is always bounded
  maxInputTokens?: number;
}
