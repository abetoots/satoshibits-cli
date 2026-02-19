import * as fs from "node:fs";
import * as path from "node:path";

// keyword-to-signal mapping for all signals used in concern triggers.
// each signal maps to a list of case-insensitive keywords/phrases that
// indicate presence of that concern area in documentation.
export const SIGNAL_KEYWORDS: Record<string, string[]> = {
  "acceptance-criteria": [
    "acceptance criteria",
    "acceptance test",
    "definition of done",
    "done criteria",
    "pass criteria",
  ],
  alerting: [
    "alerting",
    "alert rule",
    "alert threshold",
    "pagerduty",
    "opsgenie",
    "on-call",
    "notification rule",
  ],
  "api-keys": [
    "api key",
    "api token",
    "access key",
    "client secret",
    "api secret",
  ],
  "api-versioning": [
    "api versioning",
    "api version",
    "version header",
    "deprecation policy",
    "breaking change",
    "api compatibility",
  ],
  "approval-gates": [
    "approval gate",
    "approval workflow",
    "manual approval",
    "sign-off",
    "review gate",
    "change approval",
  ],
  "async-api": [
    "asyncapi",
    "async api",
    "event schema",
    "message schema",
    "event catalog",
  ],
  "async-workflows": [
    "async workflow",
    "asynchronous workflow",
    "background job",
    "job queue",
    "background worker",
    "job processing",
    "task queue",
  ],
  audit: [
    "audit log",
    "audit trail",
    "auditing",
    "audit event",
    "compliance audit",
    "change log",
  ],
  authentication: [
    "authentication",
    "login",
    "sign in",
    "signin",
    "auth token",
    "auth flow",
    "authentication flow",
    "mfa",
    "2fa",
    "two-factor",
    "multi-factor",
    "passkey",
    "webauthn",
    "totp",
  ],
  authorization: [
    "authorization",
    "access control",
    "permission",
    "privilege",
    "role-based",
    "policy enforcement",
  ],
  "auto-scaling": [
    "auto-scaling",
    "autoscaling",
    "scale out",
    "scale up",
    "horizontal scaling",
    "scaling policy",
    "elastic scaling",
  ],
  availability: [
    "availability",
    "high availability",
    "failover",
    "redundancy",
    "disaster recovery",
    "availability zone",
  ],
  "backward-compatibility": [
    "backward compatibility",
    "backwards compatible",
    "backward-compatible",
    "migration path",
    "deprecation",
  ],
  "batch-processing": [
    "batch processing",
    "batch job",
    "bulk operation",
    "batch import",
    "batch export",
    "scheduled job",
  ],
  caching: [ // no bundled concern yet
    "cache",
    "caching",
    "cache invalidation",
    "cache ttl",
    "memcached",
    "cdn",
    "content delivery network",
  ],
  certificates: [
    "certificate",
    "ssl certificate",
    "tls certificate",
    "cert rotation",
    "certificate authority",
    "x509",
  ],
  "ci-cd": [
    "ci/cd",
    "continuous integration",
    "continuous delivery",
    "continuous deployment",
    "build pipeline",
    "deployment pipeline",
    "github actions",
    "gitlab ci",
    "jenkins",
  ],
  compliance: [
    "compliance",
    "regulatory",
    "regulation",
    "compliance requirement",
    "compliance framework",
    "sox",
    "hipaa",
    "pci-dss",
  ],
  containerization: [ // no bundled concern yet
    "docker",
    "container",
    "dockerfile",
    "container image",
    "container registry",
    "oci",
    "containerd",
  ],
  credentials: [
    "credential",
    "password",
    "secret key",
    "access token",
    "service account",
    "credential rotation",
  ],
  "data-migration": [
    "data migration",
    "data transfer",
    "data import",
    "etl",
    "data pipeline",
    "data transformation",
  ],
  "data-retention": [
    "data retention",
    "retention policy",
    "retention period",
    "data lifecycle",
    "data purge",
    "data archival",
  ],
  database: [
    "database",
    "sql",
    "nosql",
    "postgres",
    "mysql",
    "mongodb",
    "dynamodb",
    "redis",
    "data store",
    "sqlite",
    "elasticsearch",
    "cassandra",
    "mariadb",
  ],
  "database-migration": [
    "database migration",
    "schema migration",
    "db migration",
    "migration script",
    "flyway",
    "liquibase",
    "alter table",
  ],
  deployment: [
    "deployment",
    "deploy",
    "release process",
    "rollout",
    "blue-green",
    "canary deploy",
    "deployment strategy",
  ],
  distributed: [
    "distributed system",
    "distributed architecture",
    "distributed computing",
    "compute cluster",
    "consensus algorithm",
    "distributed lock",
  ],
  "durable-execution": [
    "durable execution",
    "temporal",
    "durable task",
    "workflow engine",
    "step function",
    "state machine",
    "long-running process",
  ],
  encryption: [
    "encryption",
    "encrypt",
    "at-rest encryption",
    "in-transit encryption",
    "aes",
    "rsa",
    "kms",
    "key management",
  ],
  enterprise: [
    "enterprise",
    "enterprise-grade",
    "enterprise feature",
    "enterprise platform",
    "organization management",
  ],
  "error-handling": [
    "error handling",
    "error recovery",
    "exception handling",
    "error boundary",
    "fallback",
    "graceful degradation",
  ],
  "event-driven": [
    "event-driven",
    "event sourcing",
    "event bus",
    "event store",
    "cqrs",
    "domain event",
    "event handler",
  ],
  "eventual-consistency": [
    "eventual consistency",
    "eventually consistent",
    "consistency model",
    "read-after-write",
    "stale read",
    "consistency guarantee",
  ],
  "external-api": [
    "external api",
    "third-party api",
    "external service call",
    "api call",
    "api endpoint",
    "api client",
  ],
  "external-dependency": [
    "external dependency",
    "third-party dependency",
    "vendor",
    "external service",
    "third-party service",
    "upstream service",
  ],
  "fault-tolerance": [
    "fault tolerance",
    "fault-tolerant",
    "fault recovery",
    "self-healing",
    "failure recovery",
    "graceful failure",
  ],
  "feature-flags": [
    "feature flag",
    "feature toggle",
    "feature switch",
    "launchdarkly",
    "feature gate",
    "gradual rollout",
  ],
  "file-upload": [
    "file upload",
    "file storage",
    "upload endpoint",
    "multipart upload",
    "binary upload",
    "attachment",
    "s3 upload",
  ],
  gdpr: [
    "gdpr",
    "general data protection",
    "data subject",
    "right to erasure",
    "data portability",
    "consent management",
    "dpa",
  ],
  graphql: [
    "graphql",
    "graphql schema",
    "graphql query",
    "graphql mutation",
    "graphql subscription",
    "apollo",
  ],
  "high-traffic": [
    "high traffic",
    "high volume",
    "peak load",
    "traffic spike",
    "load test",
    "throughput",
    "requests per second",
  ],
  iac: [ // no bundled concern yet
    "terraform",
    "pulumi",
    "cloudformation",
    "ansible",
    "infrastructure as code",
  ],
  "human-in-loop": [
    "human-in-the-loop",
    "human in loop",
    "manual review",
    "human approval",
    "manual intervention",
    "human oversight",
  ],
  "inbound-events": [
    "inbound event",
    "incoming event",
    "event ingestion",
    "event receiver",
    "event listener",
    "event consumer",
  ],
  integration: [
    "system integration",
    "api integration",
    "integration point",
    "integration layer",
    "integration connector",
    "integration pattern",
  ],
  jwt: [
    "jwt",
    "json web token",
    "jwt token",
    "jwt verification",
    "jwt signing",
    "bearer token",
  ],
  kubernetes: [ // no bundled concern yet
    "kubernetes",
    "k8s",
    "helm",
    "kubectl",
    "pod",
    "ingress controller",
    "container orchestration",
  ],
  "legacy-system": [
    "legacy system",
    "legacy integration",
    "legacy api",
    "migration from",
    "legacy migration",
    "legacy support",
  ],
  limits: [
    "throttle",
    "limit enforcement",
    "usage limit",
    "request limit",
    "concurrency limit",
  ],
  "load-balancing": [
    "load balancing",
    "load balancer",
    "round robin",
    "request routing",
    "sticky session",
    "traffic distribution",
  ],
  logging: [
    "logging",
    "log level",
    "structured logging",
    "log aggregation",
    "log format",
    "application log",
    "centralized logging",
  ],
  "long-running": [
    "long-running",
    "long running process",
    "background process",
    "scheduled task",
    "cron job",
    "periodic task",
  ],
  "message-queue": [
    "message queue",
    "message broker",
    "rabbitmq",
    "kafka",
    "sqs",
    "pub/sub",
    "message bus",
    "amqp",
    "nats",
    "pulsar",
  ],
  microservices: [
    "microservice",
    "micro-service",
    "service mesh",
    "service discovery",
    "service-to-service",
    "inter-service",
  ],
  monitoring: [
    "monitoring",
    "health check",
    "metrics dashboard",
    "metrics",
    "prometheus",
    "grafana",
    "datadog",
    "apm",
  ],
  "multi-component": [
    "multi-component",
    "multiple components",
    "component interaction",
    "cross-component",
    "component boundary",
    "system component",
  ],
  "multi-tenant": [
    "multi-tenant",
    "tenant isolation",
    "tenant",
    "tenancy",
    "tenant-aware",
    "shared infrastructure",
  ],
  oauth: [
    "oauth",
    "oauth2",
    "oauth 2.0",
    "authorization code",
    "client credentials",
    "token exchange",
    "oidc",
    "openid connect",
    "pkce",
    "refresh token",
  ],
  observability: [
    "observability",
    "distributed tracing",
    "opentelemetry",
    "otel",
    "trace span",
    "trace context",
  ],
  orchestration: [
    "orchestration",
    "orchestrator",
    "workflow orchestration",
    "service orchestration",
    "choreography",
    "saga orchestrator",
  ],
  payments: [
    "payment",
    "charge",
    "payment transaction",
    "refund",
    "billing",
    "stripe",
    "paypal",
    "invoice",
    "checkout",
  ],
  performance: [
    "performance",
    "latency",
    "response time",
    "benchmark",
    "optimization",
    "performance budget",
  ],
  pii: [
    "pii",
    "personally identifiable",
    "personal data",
    "sensitive data",
    "data classification",
    "data masking",
  ],
  privacy: [
    "privacy",
    "privacy policy",
    "data privacy",
    "privacy by design",
    "privacy impact",
    "user consent",
  ],
  "public-api": [
    "public api",
    "developer api",
    "api documentation",
    "api reference",
    "open api",
    "api portal",
  ],
  qa: [
    "quality assurance",
    "qa process",
    "test plan",
    "test strategy",
    "qa environment",
    "staging environment",
  ],
  quotas: [
    "quota",
    "usage quota",
    "resource quota",
    "quota management",
    "quota enforcement",
    "billing quota",
  ],
  "rate-limiting": [
    "rate limiting",
    "rate limit",
    "throttling",
    "request throttle",
    "api rate limit",
    "sliding window",
    "token bucket",
  ],
  rbac: [
    "rbac",
    "role-based access",
    "role assignment",
    "permission model",
    "role hierarchy",
    "access matrix",
  ],
  "requirements-tracing": [
    "requirements tracing",
    "traceability",
    "traceability matrix",
    "requirement mapping",
    "requirements coverage",
    "trace link",
  ],
  resilience: [
    "resilience",
    "resilient",
    "chaos engineering",
    "failure injection",
    "bulkhead",
    "isolation pattern",
  ],
  "resilience-triad": [
    "resilience triad",
    "timeout",
    "circuit breaker",
    "retry pattern",
    "timeout policy",
  ],
  "rest-api": [
    "rest api",
    "restful",
    "rest endpoint",
    "http api",
    "resource endpoint",
    "crud api",
  ],
  "retry-policy": [
    "retry policy",
    "retry",
    "backoff",
    "exponential backoff",
    "retry limit",
    "retry strategy",
    "jitter",
  ],
  saga: [
    "saga",
    "saga pattern",
    "compensating transaction",
    "distributed transaction",
    "saga orchestration",
    "saga choreography",
  ],
  saml: [
    "saml",
    "saml 2.0",
    "saml assertion",
    "saml provider",
    "identity federation",
    "saml sso",
  ],
  scalability: [
    "scalability",
    "scalable",
    "scale horizontally",
    "scale vertically",
    "scaling strategy",
    "capacity planning",
  ],
  secrets: [
    "application secret",
    "secret management",
    "secrets vault",
    "hashicorp vault",
    "aws secrets manager",
    "secret rotation",
    "secret store",
  ],
  security: [
    "security",
    "security review",
    "security architecture",
    "threat model",
    "vulnerability",
    "penetration test",
    "security audit",
  ],
  sla: [
    "sla",
    "service level agreement",
    "slo",
    "service level objective",
    "sli",
    "service level indicator",
    "uptime sla",
  ],
  sso: [
    "sso",
    "single sign on",
    "federated login",
    "identity provider",
    "sso integration",
  ],
  testing: [
    "testing",
    "unit test",
    "integration test",
    "end-to-end test",
    "test coverage",
    "test automation",
    "test suite",
  ],
  "third-party": [
    "third party",
    "vendor integration",
    "external vendor",
    "partner api",
    "vendor dependency",
  ],
  uptime: [
    "uptime",
    "uptime requirement",
    "availability target",
    "nine nines",
    "downtime budget",
    "uptime guarantee",
  ],
  "user-data": [
    "user data",
    "customer data",
    "user information",
    "user profile",
    "data handling",
    "data processing",
  ],
  "user-input": [
    "user input",
    "form input",
    "user-provided input",
    "input sanitization",
    "user-submitted",
    "form submission",
  ],
  validation: [
    "validation",
    "input validation",
    "data validation",
    "schema validation",
    "request validation",
    "payload validation",
  ],
  webhooks: [
    "webhook",
    "callback url",
    "event notification",
    "webhook endpoint",
    "webhook delivery",
    "outbound webhook",
    "webhook signature",
    "webhook verification",
  ],
  websocket: [ // no bundled concern yet
    "websocket",
    "socket.io",
    "real-time connection",
    "persistent connection",
    "ws protocol",
    "wss",
  ],
  "workflow-approval": [
    "workflow approval",
    "approval process",
    "approval chain",
    "multi-step approval",
    "approval request",
    "sign-off workflow",
  ],
};

export type SignalConfidence = "high" | "medium" | "low";

export interface DetectedSignal {
  signal: string;
  confidence: SignalConfidence;
  matchedKeywords: string[];
  totalKeywords: number;
}

// strip non-prose content that causes false positives (URLs, code blocks, etc.)
export function preprocessContent(content: string): string {
  return content
    .replace(/^---\s*\n[\s\S]*?\n---/, " ") // remove YAML front matter (anchored to file start)
    .replace(/<!--[\s\S]*?-->/g, " ")  // remove HTML comments
    .replace(/```[\s\S]*?```/g, " ")   // remove paired fenced code blocks
    .replace(/```[\s\S]*/g, " ")       // remove unclosed fence + everything after
    .replace(/~~~[\s\S]*?~~~/g, " ")   // remove paired tilde code fences
    .replace(/~~~[\s\S]*/g, " ")       // remove unclosed tilde fence + everything after
    .replace(/`[^`]+`/g, " ")          // remove inline code
    .replace(/https?:\/\/\S+/g, " ")   // remove URLs
    .toLowerCase();
}

// build regex pattern for a keyword:
// - uses [a-zA-Z0-9-] in lookaround so hyphens JOIN words (preventing
//   "pre-deploy" from matching bare "deploy") while underscores, apostrophes,
//   and other punctuation act as word boundaries
// - spaces in keywords match either space or hyphen (so "sign in" matches "sign-in")
// - allows optional plural suffix (s|es) on the last word
function buildPattern(keyword: string): RegExp {
  const normalized = keyword.replace(/-/g, " ");
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // replace spaces with [ -] so "sign in" matches both "sign in" and "sign-in"
  const spaceFlexible = escaped.replace(/ /g, "[ -]");
  return new RegExp(`(?<![a-zA-Z0-9-])${spaceFlexible}(?:s|es)?(?![a-zA-Z0-9-])`);
}

// precompile regex patterns at module load time (avoids recompilation per call)
const COMPILED_PATTERNS: Record<string, [string, RegExp][]> = {};
for (const [signal, keywords] of Object.entries(SIGNAL_KEYWORDS)) {
  COMPILED_PATTERNS[signal] = keywords.map((kw) => [kw, buildPattern(kw)]);
}

// scan preprocessed content for signal keywords using precompiled patterns
function findKeywordMatches(content: string, signalKey: string): string[] {
  const patterns = COMPILED_PATTERNS[signalKey];
  if (!patterns) return [];
  const matched: string[] = [];
  for (const [keyword, pattern] of patterns) {
    if (pattern.test(content)) {
      matched.push(keyword);
    }
  }
  return matched;
}

// compute confidence tier from match ratio with minimum absolute match counts.
// requires >=3 matches for high confidence and >=2 for medium to prevent
// small keyword lists from reaching high confidence on few accidental matches.
function getConfidence(matched: number, total: number): SignalConfidence {
  const ratio = matched / total;
  if (ratio >= 0.6 && matched >= 3) return "high";
  if (ratio >= 0.3 && matched >= 2) return "medium";
  return "low";
}

// detect signals by scanning document files for keyword matches.
// scans each document independently to prevent cross-document boundary matches,
// then aggregates unique keyword matches per signal.
export function detectSignals(documentPaths: string[]): DetectedSignal[] {
  const processedContents: string[] = [];
  for (const docPath of documentPaths) {
    try {
      const stat = fs.statSync(docPath);
      if (stat.size > 1024 * 1024) continue;
      const content = fs.readFileSync(docPath, "utf8");
      processedContents.push(preprocessContent(content));
    } catch {
      continue;
    }
  }

  if (processedContents.length === 0) return [];

  const detected: DetectedSignal[] = [];

  for (const signal of Object.keys(SIGNAL_KEYWORDS)) {
    const allMatched = new Set<string>();
    for (const content of processedContents) {
      const matches = findKeywordMatches(content, signal);
      for (const m of matches) allMatched.add(m);
    }
    if (allMatched.size === 0) continue;

    const total = SIGNAL_KEYWORDS[signal]!.length;
    detected.push({
      signal,
      confidence: getConfidence(allMatched.size, total),
      matchedKeywords: [...allMatched],
      totalKeywords: total,
    });
  }

  const order: Record<SignalConfidence, number> = { high: 0, medium: 1, low: 2 };
  detected.sort((a, b) => order[a.confidence] - order[b.confidence]);

  return detected;
}

// get all known signal names
export function getAllSignalNames(): string[] {
  return Object.keys(SIGNAL_KEYWORDS).sort();
}

// resolve absolute paths for document files relative to a project path
export function resolveDocumentPaths(
  projectPath: string,
  relativePaths: string[],
): string[] {
  return relativePaths.map((p) => path.resolve(projectPath, p));
}
