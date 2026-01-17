/**
 * create-docs CLI types
 */

export type ProjectProfile = 'greenfield' | 'migration' | 'library';

export type DocumentType =
  | 'brd'
  | 'frd'
  | 'add'
  | 'tsd'
  | 'adr'
  | 'spec'
  | 'guideline'
  | 'basic';

export type DocumentStatus = 'Draft' | 'Review' | 'Approved' | 'Deprecated';

// Decision point type definitions with expert-aligned options

export type DatabaseEngine = 'postgres' | 'mysql' | 'mongodb' | 'none';
export type OrmStrategy = 'prisma' | 'query-builder' | 'raw-sql';
export type CacheLayer = 'redis' | 'memcached' | 'none';
export type ApiStyle = 'rest' | 'graphql' | 'grpc';
export type ApiVersioning = 'url-path' | 'header' | 'none';
export type MessagingPattern = 'pubsub' | 'queue' | 'none';
export type MessageBroker = 'redis' | 'sqs' | 'nats' | 'kafka' | 'none';
export type IdentityProvider = 'auth0' | 'keycloak' | 'cognito' | 'custom' | 'none';
export type AuthStrategy = 'jwt' | 'session';
export type CloudProvider = 'aws' | 'gcp' | 'azure' | 'self-hosted';
export type ContainerOrchestration = 'serverless' | 'kubernetes' | 'paas' | 'none';
export type IacTool = 'terraform' | 'pulumi' | 'cdk' | 'none';
export type ObservabilityStack = 'cloud-native' | 'lgtm' | 'elk' | 'custom';
export type ErrorTracking = 'sentry' | 'rollbar' | 'none';
export type GitStrategy = 'trunk-based' | 'gitflow';
export type TestingFramework = 'vitest' | 'jest';
export type E2eFramework = 'playwright' | 'cypress';
export type FrontendFramework = 'react' | 'vue' | 'svelte' | 'none';
export type StylingApproach = 'tailwind' | 'css-modules' | 'styled-components';
export type DeploymentStrategy = 'rolling' | 'blue-green' | 'canary';
export type FeatureFlags = 'launchdarkly' | 'flagsmith' | 'env-vars' | 'none';

export interface VarianceConfig {
  // Legacy boolean flags (kept for backward compatibility)
  hasApi: boolean;
  hasDatabase: boolean;
  hasAsyncProcessing: boolean;
  isRegulated: boolean;
  hasFrontend?: boolean;

  // Tier 1: Core Decisions (always asked)
  databaseEngine?: DatabaseEngine;
  ormStrategy?: OrmStrategy;
  apiStyle?: ApiStyle;
  identityProvider?: IdentityProvider;
  cloudProvider?: CloudProvider;
  gitStrategy?: GitStrategy;

  // Tier 2: Conditional Decisions
  cacheLayer?: CacheLayer;
  messagingPattern?: MessagingPattern;
  messageBroker?: MessageBroker;
  apiVersioning?: ApiVersioning;
  frontendFramework?: FrontendFramework;
  stylingApproach?: StylingApproach;

  // Tier 3: Advanced Config
  containerOrchestration?: ContainerOrchestration;
  iacTool?: IacTool;
  observabilityStack?: ObservabilityStack;
  errorTracking?: ErrorTracking;
  testingFramework?: TestingFramework;
  e2eFramework?: E2eFramework;
  deploymentStrategy?: DeploymentStrategy;
  featureFlags?: FeatureFlags;
  authStrategy?: AuthStrategy;
}

export interface CreateDocsConfig {
  projectName: string;
  profile: ProjectProfile;
  owner: string;
  adrCounter: number;
  variance: VarianceConfig;
  createdAt: string;
}

export type DocumentAudience = 'technical' | 'business' | 'all';

export interface DocumentMetadata {
  id: string;
  title: string;
  type: string;
  status: DocumentStatus;
  version: string;
  created_date: string;
  last_updated: string;
  owner: string;
  audience?: DocumentAudience;
  reviewers?: string[];
  related_reqs?: string[];
}

export interface TemplateContext {
  projectName: string;
  title: string;
  docType: string;
  owner: string;
  currentDate: string;
  variance: VarianceConfig;
  audience?: DocumentAudience;
  adrNumber?: string;
  specName?: string;
}

export interface LintResult {
  file: string;
  errors: LintError[];
  warnings: LintWarning[];
}

export interface LintError {
  type: 'missing-field' | 'invalid-value' | 'broken-link' | 'invalid-req-id';
  message: string;
  field?: string;
}

export interface LintWarning {
  type: 'stale-document' | 'missing-reviewer' | 'orphan-req';
  message: string;
}

export interface StatusEntry {
  document: string;
  status: DocumentStatus;
  owner: string;
  lastUpdated: string;
  version: string;
}
