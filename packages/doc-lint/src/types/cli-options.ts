interface BaseCommandOptions {
  config?: string;
  format?: "human" | "json";
}

export interface AssembleOptions extends BaseCommandOptions {
  tier: string;
  contradiction?: boolean;
  concerns?: string;
  autoDetect?: boolean;
  warnOnMismatch?: boolean;
  outputDir?: string;
}

export interface DetectOptions extends BaseCommandOptions {
  outputDir?: string;
}

export interface InitOptions {
  yes?: boolean;
  ignore?: string[];
}

export interface LintOptions extends BaseCommandOptions {
  tier: string;
  engine?: "sdk";
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
