import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  SIGNAL_KEYWORDS,
  detectSignals,
  getAllSignalNames,
  resolveDocumentPaths,
  preprocessContent,
} from "../../src/core/signal-keywords.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-lint-signals-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeDoc(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

describe("SIGNAL_KEYWORDS", () => {
  it("has entries for all 89 known signals", () => {
    // the concern YAML files use 84 core signals + 5 new taxonomy signals
    const signalCount = Object.keys(SIGNAL_KEYWORDS).length;
    expect(signalCount).toBe(89);
  });

  it("every signal has at least 3 keywords", () => {
    for (const [signal, keywords] of Object.entries(SIGNAL_KEYWORDS)) {
      expect(keywords.length, `signal "${signal}" should have >= 3 keywords`).toBeGreaterThanOrEqual(3);
    }
  });

  it("all keywords are lowercase strings", () => {
    for (const [signal, keywords] of Object.entries(SIGNAL_KEYWORDS)) {
      for (const kw of keywords) {
        expect(kw, `keyword in "${signal}" should be lowercase`).toBe(kw.toLowerCase());
      }
    }
  });
});

describe("detectSignals", () => {
  it("detects payment-related signals from content", () => {
    const doc = writeDoc("brd.md", `
      # Business Requirements
      The system processes payment transactions via Stripe.
      Users can request a refund within 30 days.
      Billing is handled monthly with invoice generation.
      Stripe sends webhook notifications on payment completion.
      The checkout flow must complete within 5 seconds.
    `);

    const detected = detectSignals([doc]);
    const signalNames = detected.map((s) => s.signal);

    expect(signalNames).toContain("payments");
    expect(signalNames).toContain("webhooks");
  });

  it("assigns high confidence when most keywords match", () => {
    // payments has keywords: payment, charge, payment transaction, refund, billing, stripe, paypal, invoice, checkout
    const doc = writeDoc("brd.md", `
      Payment processing with charge creation.
      Transaction tracking and refund handling.
      Billing system with Stripe integration.
      PayPal support and invoice generation.
      Checkout flow optimization.
    `);

    const detected = detectSignals([doc]);
    const payments = detected.find((s) => s.signal === "payments");

    expect(payments).toBeDefined();
    expect(payments!.confidence).toBe("high");
  });

  it("assigns medium confidence when some keywords match", () => {
    // payments: need 30-59% match. 9 keywords total, so 3-5 matches = medium
    const doc = writeDoc("brd.md", `
      The system handles payment transactions.
      Users can request a refund.
      Monthly billing is generated automatically.
    `);

    const detected = detectSignals([doc]);
    const payments = detected.find((s) => s.signal === "payments");

    expect(payments).toBeDefined();
    expect(payments!.confidence).toBe("medium");
  });

  it("assigns low confidence when few keywords match", () => {
    // payments: need <30% match. 9 keywords total, so 1-2 matches = low
    const doc = writeDoc("brd.md", `
      The system processes a single payment.
    `);

    const detected = detectSignals([doc]);
    const payments = detected.find((s) => s.signal === "payments");

    expect(payments).toBeDefined();
    expect(payments!.confidence).toBe("low");
  });

  it("returns empty for content with no signal keywords", () => {
    const doc = writeDoc("random.md", `
      # A Random Document
      This document has no relevant technical keywords.
      Just some general text about nothing specific.
    `);

    const detected = detectSignals([doc]);
    expect(detected).toHaveLength(0);
  });

  it("aggregates keywords across multiple documents", () => {
    const doc1 = writeDoc("brd.md", `
      The system calls an external API for payment processing.
    `);
    const doc2 = writeDoc("add.md", `
      The REST API endpoint handles API calls to third-party API services.
      The API client manages connections to the API integration layer.
    `);

    const detected = detectSignals([doc1, doc2]);
    const externalApi = detected.find((s) => s.signal === "external-api");

    expect(externalApi).toBeDefined();
    // should have more matched keywords due to aggregation
    expect(externalApi!.matchedKeywords.length).toBeGreaterThan(1);
  });

  it("uses case-insensitive matching", () => {
    const doc = writeDoc("brd.md", `
      PAYMENT processing with STRIPE integration.
      The WEBHOOK handler receives events.
    `);

    const detected = detectSignals([doc]);
    const signalNames = detected.map((s) => s.signal);

    expect(signalNames).toContain("payments");
    expect(signalNames).toContain("webhooks");
  });

  it("uses word-boundary matching (positive)", () => {
    const doc = writeDoc("brd.md", `
      We use the retry mechanism for network resilience.
    `);

    const detected = detectSignals([doc]);
    const retryPolicy = detected.find((s) => s.signal === "retry-policy");

    expect(retryPolicy).toBeDefined();
    expect(retryPolicy!.matchedKeywords).toContain("retry");
  });

  it("rejects keywords embedded in larger words (negative boundary)", () => {
    const doc = writeDoc("brd.md", `
      The repayment schedule is monthly.
      We need to predeploy the hooks.
    `);

    const detected = detectSignals([doc]);
    const payments = detected.find((s) => s.signal === "payments");
    const deployment = detected.find((s) => s.signal === "deployment");

    // "repayment" should NOT match "payment" keyword
    expect(payments?.matchedKeywords ?? []).not.toContain("payment");
    // "predeploy" should NOT match deployment keywords
    expect(deployment).toBeUndefined();
  });

  it("matches keywords in snake_case identifiers", () => {
    const doc = writeDoc("brd.md", `
      Configure KAFKA_BROKER_URL and REDIS_HOST env vars.
      Set retry_count to 3 for the message queue.
    `);

    const detected = detectSignals([doc]);
    const signalNames = detected.map((s) => s.signal);

    // "kafka" in snake_case should match message-queue signal
    expect(signalNames).toContain("message-queue");
  });

  it("matches plural forms of keywords", () => {
    const doc = writeDoc("brd.md", `
      The microservices communicate via message queues.
      Multiple webhooks are configured for event delivery.
      Database transactions are logged.
    `);

    const detected = detectSignals([doc]);
    const signalNames = detected.map((s) => s.signal);

    expect(signalNames).toContain("microservices");
    expect(signalNames).toContain("webhooks");
  });

  it("matches hyphenated terms via normalization", () => {
    const doc = writeDoc("brd.md", `
      Users sign-in through the SSO provider.
      The event-driven architecture uses domain events.
    `);

    const detected = detectSignals([doc]);
    const signalNames = detected.map((s) => s.signal);

    // "sign-in" should match "sign in" keyword after normalization
    expect(signalNames).toContain("authentication");
    expect(signalNames).toContain("event-driven");
  });

  it("sorts results by confidence tier (high first)", () => {
    // create content that gives different confidence levels for different signals
    const doc = writeDoc("brd.md", `
      Payment processing with charge creation and transaction tracking.
      Refund handling via billing system with Stripe and PayPal.
      Invoice generation and checkout flow.
      Also uses a single webhook endpoint.
    `);

    const detected = detectSignals([doc]);

    // verify ordering: high before medium before low
    for (let i = 1; i < detected.length; i++) {
      const order = { high: 0, medium: 1, low: 2 } as const;
      expect(order[detected[i]!.confidence]).toBeGreaterThanOrEqual(
        order[detected[i - 1]!.confidence],
      );
    }
  });

  it("skips files over 1MB", () => {
    const bigDoc = writeDoc("huge.md", "payment ".repeat(200_000));
    const smallDoc = writeDoc("small.md", "webhook endpoint delivery");

    const detected = detectSignals([bigDoc, smallDoc]);
    const signalNames = detected.map((s) => s.signal);

    // should still detect from the small doc
    expect(signalNames).toContain("webhooks");
  });

  it("skips unreadable files gracefully", () => {
    const validDoc = writeDoc("brd.md", "payment transaction");
    const badPath = path.join(tmpDir, "nonexistent.md");

    const detected = detectSignals([validDoc, badPath]);
    const signalNames = detected.map((s) => s.signal);

    expect(signalNames).toContain("payments");
  });

  it("returns empty for empty document list", () => {
    const detected = detectSignals([]);
    expect(detected).toHaveLength(0);
  });

  it("ignores keywords inside code fences", () => {
    const doc = writeDoc("brd.md", `
      # Architecture
      Here is example code:
      \`\`\`
      const payment = stripe.charges.create({ amount: 100 });
      const webhook = setupWebhook();
      \`\`\`
      The actual system handles user profiles only.
    `);

    const detected = detectSignals([doc]);
    const signalNames = detected.map((s) => s.signal);

    // "payment", "webhook" are inside code fence — should not trigger
    expect(signalNames).not.toContain("payments");
    expect(signalNames).not.toContain("webhooks");
  });

  it("ignores keywords inside inline code", () => {
    const doc = writeDoc("brd.md", `
      Run \`kafka-console-consumer\` to test.
      The \`redis\` client connects on port 6379.
    `);

    const detected = detectSignals([doc]);
    const signalNames = detected.map((s) => s.signal);

    // keywords in inline code should not trigger signals
    expect(signalNames).not.toContain("message-queue");
    expect(signalNames).not.toContain("database");
  });

  it("ignores keywords inside URLs", () => {
    const doc = writeDoc("brd.md", `
      See https://kafka.apache.org for details.
      Visit https://dashboard.grafana.com to view.
    `);

    const detected = detectSignals([doc]);
    const signalNames = detected.map((s) => s.signal);

    // "kafka" and "grafana" are inside URLs — should not trigger
    expect(signalNames).not.toContain("message-queue");
    expect(signalNames).not.toContain("monitoring");
  });

  it("does not have duplicate keywords across signals", () => {
    const keywordToSignals: Record<string, string[]> = {};
    for (const [signal, keywords] of Object.entries(SIGNAL_KEYWORDS)) {
      for (const kw of keywords) {
        if (!keywordToSignals[kw]) keywordToSignals[kw] = [];
        keywordToSignals[kw].push(signal);
      }
    }
    const duplicates = Object.entries(keywordToSignals)
      .filter(([, signals]) => signals.length > 1)
      .map(([kw, signals]) => `"${kw}" in [${signals.join(", ")}]`);

    expect(duplicates, `Duplicate keywords found:\n${duplicates.join("\n")}`).toHaveLength(0);
  });

  it("does not have within-signal normalized duplicates", () => {
    for (const [signal, keywords] of Object.entries(SIGNAL_KEYWORDS)) {
      const normalized = keywords.map((k) => k.replace(/-/g, " "));
      const unique = new Set(normalized);
      expect(unique.size, `signal "${signal}" has normalized duplicates`).toBe(normalized.length);
    }
  });

  it("rejects hyphenated-prefix compounds via boundary", () => {
    const doc = writeDoc("brd.md", `
      The re-payment schedule is monthly.
      We need to pre-deploy the hooks.
    `);

    const detected = detectSignals([doc]);
    const payments = detected.find((s) => s.signal === "payments");
    const deployment = detected.find((s) => s.signal === "deployment");

    // "re-payment" should NOT match "payment" — hyphen is in the boundary class
    expect(payments?.matchedKeywords ?? []).not.toContain("payment");
    // "pre-deploy" should NOT match deployment keywords
    expect(deployment).toBeUndefined();
  });

  it("ignores keywords inside HTML comments", () => {
    const doc = writeDoc("brd.md", `
      This is a simple project.
      <!-- TODO: payment webhook kafka integration -->
    `);

    const detected = detectSignals([doc]);
    const signalNames = detected.map((s) => s.signal);

    expect(signalNames).not.toContain("payments");
    expect(signalNames).not.toContain("webhooks");
  });

  it("handles unclosed code fences safely", () => {
    const doc = writeDoc("brd.md", `
      Simple project overview.
      \`\`\`
      const payment = stripe.charges.create({ amount: 100 });
      webhook.send(event);
    `);

    const detected = detectSignals([doc]);
    const signalNames = detected.map((s) => s.signal);

    // everything after unclosed fence should be stripped
    expect(signalNames).not.toContain("payments");
    expect(signalNames).not.toContain("webhooks");
  });

  it("ignores keywords inside YAML front matter", () => {
    const doc = writeDoc("brd.md", `---
title: Payment Gateway
tags: [webhook, kafka]
---
This is a simple project.
`);

    const detected = detectSignals([doc]);
    const signalNames = detected.map((s) => s.signal);

    expect(signalNames).not.toContain("payments");
    expect(signalNames).not.toContain("webhooks");
  });

  it("ignores keywords inside tilde code fences", () => {
    const doc = writeDoc("brd.md", `
      # Architecture
      Here is example code:
      ~~~
      const payment = stripe.charges.create({ amount: 100 });
      const webhook = setupWebhook();
      ~~~
      The actual system handles user profiles only.
    `);

    const detected = detectSignals([doc]);
    const signalNames = detected.map((s) => s.signal);

    expect(signalNames).not.toContain("payments");
    expect(signalNames).not.toContain("webhooks");
  });

  it("detects caching signal", () => {
    const doc = writeDoc("add.md", `
      The system uses a caching layer with TTL-based cache invalidation.
      Static assets are served via a CDN for low-latency delivery.
    `);

    const detected = detectSignals([doc]);
    const caching = detected.find((s) => s.signal === "caching");

    expect(caching).toBeDefined();
    expect(caching!.matchedKeywords).toContain("caching");
    expect(caching!.matchedKeywords).toContain("cache invalidation");
    expect(caching!.matchedKeywords).toContain("cdn");
  });

  it("detects containerization signal", () => {
    const doc = writeDoc("add.md", `
      Services are packaged as Docker containers and pushed to
      the container registry. Each container image is scanned for
      vulnerabilities before deployment.
    `);

    const detected = detectSignals([doc]);
    const signal = detected.find((s) => s.signal === "containerization");

    expect(signal).toBeDefined();
    expect(signal!.matchedKeywords).toContain("docker");
    expect(signal!.matchedKeywords).toContain("container registry");
  });

  it("detects iac signal", () => {
    const doc = writeDoc("add.md", `
      All infrastructure is defined as Terraform modules.
      CloudFormation is used for legacy AWS resources.
      The infrastructure as code approach ensures repeatability.
    `);

    const detected = detectSignals([doc]);
    const signal = detected.find((s) => s.signal === "iac");

    expect(signal).toBeDefined();
    expect(signal!.matchedKeywords).toContain("terraform");
    expect(signal!.matchedKeywords).toContain("cloudformation");
    expect(signal!.matchedKeywords).toContain("infrastructure as code");
  });

  it("detects kubernetes signal", () => {
    const doc = writeDoc("add.md", `
      The application runs on Kubernetes (k8s) with Helm charts
      managing deployments. Ingress controllers handle routing.
    `);

    const detected = detectSignals([doc]);
    const signal = detected.find((s) => s.signal === "kubernetes");

    expect(signal).toBeDefined();
    expect(signal!.matchedKeywords).toContain("kubernetes");
    expect(signal!.matchedKeywords).toContain("k8s");
    expect(signal!.matchedKeywords).toContain("helm");
  });

  it("detects websocket signal", () => {
    const doc = writeDoc("add.md", `
      Real-time updates use WebSocket connections with automatic
      reconnection. The Socket.IO library handles transport fallback.
    `);

    const detected = detectSignals([doc]);
    const signal = detected.find((s) => s.signal === "websocket");

    expect(signal).toBeDefined();
    expect(signal!.matchedKeywords).toContain("websocket");
    expect(signal!.matchedKeywords).toContain("socket.io");
  });

  it("does not match CamelCase-embedded keywords (known limitation)", () => {
    const doc = writeDoc("brd.md", `
      The WebhookEndpoint class processes PaymentCallback events.
    `);

    const detected = detectSignals([doc]);
    const signalNames = detected.map((s) => s.signal);

    // CamelCase compounds merge keywords on lowercasing — accepted limitation
    expect(signalNames).not.toContain("webhooks");
    expect(signalNames).not.toContain("payments");
  });

  it("requires minimum absolute matches for medium/high confidence", () => {
    // A signal with 5 keywords where only 1 matches (20%) should be "low"
    // even though 1/5 > 0%. And if 2 match (40%) that's >= 30% AND >= 2 min → medium
    const doc = writeDoc("brd.md", `
      We handle api key rotation carefully.
    `);

    const detected = detectSignals([doc]);
    const apiKeys = detected.find((s) => s.signal === "api-keys");

    // 1 match out of 5 keywords = 20% with only 1 absolute match → low
    expect(apiKeys).toBeDefined();
    expect(apiKeys!.confidence).toBe("low");
  });
});

describe("preprocessContent", () => {
  it("strips fenced code blocks", () => {
    const input = "before\n```\ncode payment\n```\nafter";
    const result = preprocessContent(input);
    expect(result).not.toContain("code payment");
    expect(result).toContain("before");
    expect(result).toContain("after");
  });

  it("strips inline code", () => {
    const input = "run `kafka-consumer` now";
    const result = preprocessContent(input);
    expect(result).not.toContain("kafka");
    expect(result).toContain("run");
    expect(result).toContain("now");
  });

  it("strips URLs", () => {
    const input = "see https://kafka.apache.org for info";
    const result = preprocessContent(input);
    expect(result).not.toContain("kafka");
    expect(result).toContain("see");
    expect(result).toContain("for info");
  });

  it("preserves hyphens (normalization handled in regex patterns)", () => {
    const input = "sign-in flow";
    const result = preprocessContent(input);
    // hyphens stay in content; buildPattern uses [ -] to match either form
    expect(result).toContain("sign-in flow");
  });

  it("strips HTML comments", () => {
    const input = "before <!-- payment webhook kafka --> after";
    const result = preprocessContent(input);
    expect(result).not.toContain("payment");
    expect(result).not.toContain("webhook");
    expect(result).toContain("before");
    expect(result).toContain("after");
  });

  it("strips unclosed code fences and everything after", () => {
    const input = "real text\n```\npayment webhook kafka\nmore code";
    const result = preprocessContent(input);
    expect(result).not.toContain("payment");
    expect(result).not.toContain("webhook");
    expect(result).toContain("real text");
  });

  it("strips YAML front matter", () => {
    const input = "---\ntitle: Payment Gateway\ntags: [webhook, kafka]\n---\nActual content here";
    const result = preprocessContent(input);
    expect(result).not.toContain("payment");
    expect(result).not.toContain("webhook");
    expect(result).toContain("actual content here");
  });

  it("preserves content between mid-document thematic breaks (---)", () => {
    const input = "Intro text\n---\nPayment processing via Stripe\n---\nMore content";
    const result = preprocessContent(input);
    expect(result).toContain("payment processing via stripe");
  });

  it("strips paired tilde code fences", () => {
    const input = "before\n~~~\npayment webhook kafka\n~~~\nafter";
    const result = preprocessContent(input);
    expect(result).not.toContain("payment");
    expect(result).not.toContain("webhook");
    expect(result).toContain("before");
    expect(result).toContain("after");
  });

  it("strips unclosed tilde code fences and everything after", () => {
    const input = "real text\n~~~\npayment webhook kafka\nmore code";
    const result = preprocessContent(input);
    expect(result).not.toContain("payment");
    expect(result).not.toContain("webhook");
    expect(result).toContain("real text");
  });

  it("lowercases content", () => {
    const input = "PAYMENT Processing";
    const result = preprocessContent(input);
    expect(result).toBe("payment processing");
  });
});

describe("getAllSignalNames", () => {
  it("returns sorted list of all signal names", () => {
    const names = getAllSignalNames();
    expect(names.length).toBe(89);
    // verify sorted
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });
});

describe("resolveDocumentPaths", () => {
  it("resolves relative paths to absolute paths", () => {
    const resolved = resolveDocumentPaths("/project", ["docs/brd.md", "docs/frd.md"]);
    expect(resolved).toEqual(["/project/docs/brd.md", "/project/docs/frd.md"]);
  });
});
