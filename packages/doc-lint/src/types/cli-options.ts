export interface AssembleOptions {
  config?: string;
  format?: "human" | "json";
  contradiction?: boolean;
  concerns?: string;
}

export interface LintOptions {
  engine?: "sdk";
  config?: string;
  format?: "human" | "json";
  contradiction?: boolean;
  concerns?: string;
  dryRun?: boolean;
  verbose?: boolean;
}
