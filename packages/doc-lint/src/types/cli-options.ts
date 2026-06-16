interface BaseCommandOptions {
  config?: string;
  format?: "human" | "json";
}

export interface AssembleOptions extends BaseCommandOptions {
  tier: string;
  tierCumulative?: boolean;
  contradiction?: boolean;
  drift?: boolean;
  concerns?: string;
  autoDetect?: boolean;
  warnOnMismatch?: boolean;
  outputDir?: string;
  inline?: boolean;
  mode?: string;
  code?: string;
  lens?: string;
}

export interface DetectOptions extends BaseCommandOptions {
  outputDir?: string;
  inline?: boolean;
}

export interface InitOptions {
  yes?: boolean;
  ignore?: string[];
}

export interface LintOptions extends BaseCommandOptions {
  tier: string;
  tierCumulative?: boolean;
  engine?: "sdk" | "agent";
  lens?: string;
  contradiction?: boolean;
  drift?: boolean;
  concerns?: string;
  dryRun?: boolean;
  verbose?: boolean;
  severityThreshold?: string;
  allowImplicit?: boolean;
  allowExternalRefs?: boolean;
  autoDetect?: boolean;
  warnOnMismatch?: boolean;
  mode?: string;
  code?: string;
}
