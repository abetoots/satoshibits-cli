export interface AssembleOptions {
  config?: string;
  format?: "human" | "json";
  contradiction?: boolean;
  concerns?: string;
  autoDetect?: boolean;
  warnOnMismatch?: boolean;
}

export interface InitOptions {
  yes?: boolean;
  ignore?: string[];
}

export interface LintOptions {
  engine?: "sdk";
  config?: string;
  format?: "human" | "json";
  contradiction?: boolean;
  concerns?: string;
  dryRun?: boolean;
  verbose?: boolean;
  severityThreshold?: string;
  allowImplicit?: boolean;
  allowExternalRefs?: boolean;
  autoDetect?: boolean;
  warnOnMismatch?: boolean;
}
