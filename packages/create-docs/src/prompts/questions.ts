/**
 * inquirer question definitions for interactive prompts
 * implements tiered decision points with expert-aligned recommendations
 */

import inquirer from 'inquirer';
import type { DistinctQuestion } from 'inquirer';
import type {
  ProjectProfile,
  VarianceConfig,
  DatabaseEngine,
  OrmStrategy,
  CacheLayer,
  ApiStyle,
  ApiVersioning,
  MessagingPattern,
  MessageBroker,
  IdentityProvider,
  CloudProvider,
  ContainerOrchestration,
  IacTool,
  ObservabilityStack,
  ErrorTracking,
  GitStrategy,
  TestingFramework,
  E2eFramework,
  FrontendFramework,
  StylingApproach,
  DeploymentStrategy,
  FeatureFlags,
  AuthStrategy,
} from '../types.js';

const { Separator } = inquirer;

export interface InitAnswers {
  // required fields
  projectName: string;
  profile: ProjectProfile;
  owner: string;
  // tier 1: core boolean flags (always asked)
  hasApi: boolean;
  hasAsyncProcessing: boolean;
  isRegulated: boolean;
  cloudProvider: CloudProvider;
  gitStrategy: GitStrategy;
  // tier 1: database decisions (always asked but databaseEngine can be 'none')
  databaseEngine: DatabaseEngine;
  identityProvider: IdentityProvider;
  // tier 1: conditional on prior answers
  ormStrategy?: OrmStrategy;
  apiStyle?: ApiStyle;
  apiVersioning?: ApiVersioning;
  authStrategy?: AuthStrategy;
  // tier 2: conditional decisions
  cacheLayer?: CacheLayer;
  messagingPattern?: MessagingPattern;
  messageBroker?: MessageBroker;
  hasFrontend?: boolean;
  frontendFramework?: FrontendFramework;
  stylingApproach?: StylingApproach;
  // tier 3: advanced config (conditional on advancedConfig flag)
  advancedConfig?: boolean;
  observabilityStack?: ObservabilityStack;
  errorTracking?: ErrorTracking;
  testingFramework?: TestingFramework;
  e2eFramework?: E2eFramework;
  deploymentStrategy?: DeploymentStrategy;
  featureFlags?: FeatureFlags;
  containerOrchestration?: ContainerOrchestration;
  iacTool?: IacTool;
}

/**
 * question name constants for type-safe references
 * used by init.ts to map spec files to questions
 */
export const QuestionNames = {
  // database-related
  databaseEngine: 'databaseEngine',
  ormStrategy: 'ormStrategy',
  // api-related
  hasApi: 'hasApi',
  apiStyle: 'apiStyle',
  apiVersioning: 'apiVersioning',
  // authentication-related
  identityProvider: 'identityProvider',
  authStrategy: 'authStrategy',
  // async processing-related
  hasAsyncProcessing: 'hasAsyncProcessing',
  messagingPattern: 'messagingPattern',
  messageBroker: 'messageBroker',
} as const;

export type QuestionName = (typeof QuestionNames)[keyof typeof QuestionNames];


export const initQuestions: DistinctQuestion<InitAnswers>[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // PROJECT BASICS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    type: 'input',
    name: 'projectName',
    message: 'What is the name of this project?',
    validate: (input: string) => {
      if (!input.trim()) {
        return 'Project name is required';
      }
      return true;
    },
  },
  {
    type: 'select',
    name: 'profile',
    message: 'Select a project profile:',
    choices: [
      {
        name: 'Greenfield Application - New project from scratch (Recommended)',
        value: 'greenfield',
      },
      {
        name: 'Existing System Migration - Documenting a migration effort',
        value: 'migration',
      },
      {
        name: 'Library / SDK - Developer-facing package',
        value: 'library',
      },
    ],
    default: 'greenfield',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 1: CORE DECISIONS (Always asked)
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Data Layer ---
  {
    type: 'select',
    name: 'databaseEngine',
    message: 'Primary database engine:',
    choices: [
      {
        name: 'PostgreSQL (Recommended) - Universal, JSONB support, scalable',
        value: 'postgres',
      },
      {
        name: 'MySQL - Popular relational database',
        value: 'mysql',
      },
      {
        name: 'MongoDB - Document store for flexible schemas',
        value: 'mongodb',
      },
      new Separator(),
      {
        name: 'None - No database for this project',
        value: 'none',
      },
    ],
    default: 'postgres',
  },
  {
    type: 'select',
    name: 'ormStrategy',
    message: 'Database access strategy:',
    when: (answers) => answers.databaseEngine !== 'none',
    choices: [
      {
        name: 'Prisma (Recommended) - Type-safe ORM with migrations',
        value: 'prisma',
      },
      {
        name: 'Query Builder (Kysely/Drizzle) - More control, avoids N+1',
        value: 'query-builder',
      },
      {
        name: 'Raw SQL - Maximum control and performance',
        value: 'raw-sql',
      },
    ],
    default: 'prisma',
  },

  // --- API Layer ---
  {
    type: 'confirm',
    name: 'hasApi',
    message: 'Does this project expose an API?',
    default: true,
  },
  {
    type: 'select',
    name: 'apiStyle',
    message: 'API architecture style:',
    when: (answers) => answers.hasApi,
    choices: [
      {
        name: 'REST (Recommended) - Universal, cacheable, mature tooling',
        value: 'rest',
      },
      {
        name: 'GraphQL - Flexible queries, good for complex data graphs',
        value: 'graphql',
      },
      {
        name: 'gRPC - High-performance, ideal for internal services',
        value: 'grpc',
      },
    ],
    default: 'rest',
  },
  {
    type: 'select',
    name: 'apiVersioning',
    message: 'API versioning strategy:',
    when: (answers) => answers.hasApi,
    choices: [
      {
        name: 'URL Path /v1/ (Recommended) - Explicit and debuggable',
        value: 'url-path',
      },
      {
        name: 'Header-based - Cleaner URLs, harder to debug',
        value: 'header',
      },
      {
        name: 'No versioning - Small/internal APIs only',
        value: 'none',
      },
    ],
    default: 'url-path',
  },

  // --- Authentication ---
  {
    type: 'select',
    name: 'identityProvider',
    message: 'Identity provider:',
    choices: (answers) => {
      const isEnterprise = answers.isRegulated;
      return [
        {
          name: isEnterprise
            ? 'Keycloak (Recommended for Enterprise) - Self-hosted, compliant'
            : 'Auth0/Clerk (Recommended) - Managed, fast setup, secure',
          value: isEnterprise ? 'keycloak' : 'auth0',
        },
        {
          name: isEnterprise
            ? 'Auth0/Clerk - Managed SaaS option'
            : 'Keycloak - Self-hosted, data sovereignty',
          value: isEnterprise ? 'auth0' : 'keycloak',
        },
        {
          name: 'AWS Cognito - Best for AWS-native projects',
          value: 'cognito',
        },
        new Separator(),
        {
          name: 'Custom - Build your own (Not recommended)',
          value: 'custom',
        },
        {
          name: 'None - No authentication needed',
          value: 'none',
        },
      ];
    },
    default: 'auth0',
  },
  {
    type: 'select',
    name: 'authStrategy',
    message: 'Authentication token strategy:',
    when: (answers) => answers.identityProvider !== 'none',
    choices: [
      {
        name: 'JWT (Recommended) - Stateless, scalable',
        value: 'jwt',
      },
      {
        name: 'Server Sessions - Stateful, easier revocation',
        value: 'session',
      },
    ],
    default: 'jwt',
  },

  // --- Infrastructure ---
  {
    type: 'select',
    name: 'cloudProvider',
    message: 'Primary cloud provider:',
    choices: [
      {
        name: 'AWS (Recommended) - Largest ecosystem, most mature',
        value: 'aws',
      },
      {
        name: 'GCP - Strong Kubernetes, ML/AI services',
        value: 'gcp',
      },
      {
        name: 'Azure - Best for Microsoft ecosystem',
        value: 'azure',
      },
      {
        name: 'Self-hosted - On-premise or multi-cloud',
        value: 'self-hosted',
      },
    ],
    default: 'aws',
  },
  {
    type: 'select',
    name: 'gitStrategy',
    message: 'Git branching strategy:',
    choices: [
      {
        name: 'Trunk-Based (Recommended) - Small PRs, faster CI/CD',
        value: 'trunk-based',
      },
      {
        name: 'GitFlow - Long-lived branches, release management',
        value: 'gitflow',
      },
    ],
    default: 'trunk-based',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 2: CONDITIONAL DECISIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Caching ---
  {
    type: 'select',
    name: 'cacheLayer',
    message: 'Caching layer:',
    when: (answers) => answers.databaseEngine !== 'none',
    choices: [
      {
        name: 'Redis (Recommended) - Versatile, also supports pub/sub',
        value: 'redis',
      },
      {
        name: 'Memcached - Simple key-value caching',
        value: 'memcached',
      },
      {
        name: 'None - No caching layer',
        value: 'none',
      },
    ],
    default: 'redis',
  },

  // --- Async Processing ---
  {
    type: 'confirm',
    name: 'hasAsyncProcessing',
    message: 'Will the system involve async background jobs?',
    default: false,
  },
  {
    type: 'select',
    name: 'messagingPattern',
    message: 'Async messaging pattern:',
    when: (answers) => answers.hasAsyncProcessing,
    choices: [
      {
        name: 'Job Queue (Recommended) - Simple task distribution',
        value: 'queue',
      },
      {
        name: 'Pub/Sub - Event-driven, multiple consumers',
        value: 'pubsub',
      },
    ],
    default: 'queue',
  },
  {
    type: 'select',
    name: 'messageBroker',
    message: 'Message broker:',
    when: (answers) => answers.hasAsyncProcessing,
    choices: (answers) => {
      const isAws = answers.cloudProvider === 'aws';
      return [
        {
          name: isAws
            ? 'AWS SQS/SNS (Recommended for AWS) - Zero maintenance'
            : 'Redis (Recommended) - Simple, if already using Redis',
          value: isAws ? 'sqs' : 'redis',
        },
        {
          name: isAws ? 'Redis - Simple, if already using Redis' : 'AWS SQS/SNS - Zero maintenance',
          value: isAws ? 'redis' : 'sqs',
        },
        {
          name: 'NATS JetStream - Lightweight, self-hosted',
          value: 'nats',
        },
        {
          name: 'Kafka - High-throughput event streaming',
          value: 'kafka',
        },
      ];
    },
    default: (answers: Partial<InitAnswers>) => (answers.cloudProvider === 'aws' ? 'sqs' : 'redis'),
  },

  // --- Frontend ---
  {
    type: 'confirm',
    name: 'hasFrontend',
    message: 'Does this project include a frontend UI?',
    default: false,
    when: (answers) => answers.profile !== 'library',
  },
  {
    type: 'select',
    name: 'frontendFramework',
    message: 'Frontend framework:',
    when: (answers) => answers.hasFrontend,
    choices: [
      {
        name: 'React (Recommended) - Largest ecosystem and talent pool',
        value: 'react',
      },
      {
        name: 'Vue - Approachable, great documentation',
        value: 'vue',
      },
      {
        name: 'Svelte - Compiled, excellent performance',
        value: 'svelte',
      },
    ],
    default: 'react',
  },
  {
    type: 'select',
    name: 'stylingApproach',
    message: 'Styling approach:',
    when: (answers) => answers.hasFrontend,
    choices: [
      {
        name: 'Tailwind CSS (Recommended) - Utility-first, rapid development',
        value: 'tailwind',
      },
      {
        name: 'CSS Modules - Scoped styles, no runtime',
        value: 'css-modules',
      },
      {
        name: 'Styled Components - CSS-in-JS, dynamic styling',
        value: 'styled-components',
      },
    ],
    default: 'tailwind',
  },

  // --- Compliance ---
  {
    type: 'confirm',
    name: 'isRegulated',
    message: 'Is this for a regulated industry (FinTech, Health, etc.)?',
    default: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3: ADVANCED CONFIG (Optional)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    type: 'confirm',
    name: 'advancedConfig',
    message: 'Configure advanced options (observability, deployment, etc.)?',
    default: false,
  },

  // --- Observability ---
  {
    type: 'select',
    name: 'observabilityStack',
    message: 'Observability stack:',
    when: (answers) => answers.advancedConfig,
    choices: (answers) => {
      const isCloudNative = answers.cloudProvider != null && ['aws', 'gcp', 'azure'].includes(answers.cloudProvider);
      return [
        {
          name: isCloudNative
            ? 'Cloud-native (Recommended) - CloudWatch/Cloud Logging, zero setup'
            : 'LGTM Stack (Recommended) - Loki/Grafana/Tempo/Mimir',
          value: isCloudNative ? 'cloud-native' : 'lgtm',
        },
        {
          name: isCloudNative
            ? 'LGTM Stack - Loki/Grafana/Tempo/Mimir, vendor-neutral'
            : 'Cloud-native - CloudWatch/Cloud Logging',
          value: isCloudNative ? 'lgtm' : 'cloud-native',
        },
        {
          name: 'ELK Stack - Elasticsearch/Logstash/Kibana',
          value: 'elk',
        },
        {
          name: 'Custom - Define your own stack',
          value: 'custom',
        },
      ];
    },
    default: 'cloud-native',
  },
  {
    type: 'select',
    name: 'errorTracking',
    message: 'Error tracking service:',
    when: (answers) => answers.advancedConfig,
    choices: [
      {
        name: 'Sentry (Recommended) - Rich context, excellent SDKs',
        value: 'sentry',
      },
      {
        name: 'Rollbar - Similar capabilities',
        value: 'rollbar',
      },
      {
        name: 'None - Rely on logs only',
        value: 'none',
      },
    ],
    default: 'sentry',
  },

  // --- Testing ---
  {
    type: 'select',
    name: 'testingFramework',
    message: 'Unit testing framework:',
    when: (answers) => answers.advancedConfig,
    choices: [
      {
        name: 'Vitest (Recommended) - Fast, Vite-powered, Jest-compatible',
        value: 'vitest',
      },
      {
        name: 'Jest - Mature, large ecosystem',
        value: 'jest',
      },
    ],
    default: 'vitest',
  },
  {
    type: 'select',
    name: 'e2eFramework',
    message: 'E2E testing framework:',
    when: (answers) => answers.advancedConfig,
    choices: [
      {
        name: 'Playwright (Recommended) - Modern, cross-browser, reliable',
        value: 'playwright',
      },
      {
        name: 'Cypress - Developer-friendly, component testing',
        value: 'cypress',
      },
    ],
    default: 'playwright',
  },

  // --- Deployment ---
  {
    type: 'select',
    name: 'containerOrchestration',
    message: 'Container orchestration:',
    when: (answers) => answers.advancedConfig,
    choices: [
      {
        name: 'Serverless Containers (Recommended) - Fargate/Cloud Run, low ops',
        value: 'serverless',
      },
      {
        name: 'Kubernetes - Full control, higher complexity',
        value: 'kubernetes',
      },
      {
        name: 'PaaS (Heroku/Render) - Simplest, limited control',
        value: 'paas',
      },
      {
        name: 'None - No containerization',
        value: 'none',
      },
    ],
    default: 'serverless',
  },
  {
    type: 'select',
    name: 'iacTool',
    message: 'Infrastructure as Code tool:',
    when: (answers) => answers.advancedConfig && answers.containerOrchestration !== 'paas',
    choices: [
      {
        name: 'Terraform (Recommended) - Cloud-agnostic standard',
        value: 'terraform',
      },
      {
        name: 'Pulumi - Use real programming languages',
        value: 'pulumi',
      },
      {
        name: 'CDK - AWS-native, TypeScript',
        value: 'cdk',
      },
      {
        name: 'None - Manual or platform-managed',
        value: 'none',
      },
    ],
    default: 'terraform',
  },
  {
    type: 'select',
    name: 'deploymentStrategy',
    message: 'Deployment strategy:',
    when: (answers) => answers.advancedConfig,
    choices: [
      {
        name: 'Rolling (Recommended) - Gradual replacement, simple',
        value: 'rolling',
      },
      {
        name: 'Blue/Green - Zero-downtime, instant rollback',
        value: 'blue-green',
      },
      {
        name: 'Canary - Gradual traffic shift, risk reduction',
        value: 'canary',
      },
    ],
    default: 'rolling',
  },
  {
    type: 'select',
    name: 'featureFlags',
    message: 'Feature flag management:',
    when: (answers) => answers.advancedConfig,
    choices: [
      {
        name: 'Environment Variables (Recommended for MVP) - Simple, free',
        value: 'env-vars',
      },
      {
        name: 'Flagsmith - Open-source, self-hostable',
        value: 'flagsmith',
      },
      {
        name: 'LaunchDarkly - Enterprise features, paid',
        value: 'launchdarkly',
      },
      {
        name: 'None - No feature flags',
        value: 'none',
      },
    ],
    default: 'env-vars',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OWNER
  // ═══════════════════════════════════════════════════════════════════════════
  {
    type: 'input',
    name: 'owner',
    message: 'Who is the primary owner? (e.g., @username or email)',
    default: '@lead-engineer',
    validate: (input: string) => {
      if (!input.trim()) {
        return 'Owner is required';
      }
      return true;
    },
  },
];

/**
 * converts init answers to variance config with all decision points
 */
export function answersToVariance(answers: InitAnswers): VarianceConfig {
  return {
    // legacy boolean flags
    hasApi: answers.hasApi,
    hasDatabase: answers.databaseEngine !== 'none',
    hasAsyncProcessing: answers.hasAsyncProcessing,
    isRegulated: answers.isRegulated,
    hasFrontend: answers.hasFrontend ?? false,

    // tier 1: core decisions
    databaseEngine: answers.databaseEngine,
    ormStrategy: answers.ormStrategy,
    apiStyle: answers.apiStyle,
    identityProvider: answers.identityProvider,
    cloudProvider: answers.cloudProvider,
    gitStrategy: answers.gitStrategy,

    // tier 2: conditional decisions
    cacheLayer: answers.cacheLayer,
    messagingPattern: answers.messagingPattern,
    messageBroker: answers.messageBroker,
    apiVersioning: answers.apiVersioning,
    frontendFramework: answers.frontendFramework,
    stylingApproach: answers.stylingApproach,

    // tier 3: advanced config (with defaults if not asked)
    containerOrchestration: answers.containerOrchestration ?? 'serverless',
    iacTool: answers.iacTool ?? 'terraform',
    observabilityStack: answers.observabilityStack ?? 'cloud-native',
    errorTracking: answers.errorTracking ?? 'sentry',
    testingFramework: answers.testingFramework ?? 'vitest',
    e2eFramework: answers.e2eFramework ?? 'playwright',
    deploymentStrategy: answers.deploymentStrategy ?? 'rolling',
    featureFlags: answers.featureFlags ?? 'env-vars',
    authStrategy: answers.authStrategy ?? 'jwt',
  };
}

export interface NewDocAnswers {
  title: string;
}

export const newDocQuestions: DistinctQuestion<NewDocAnswers>[] = [
  {
    type: 'input',
    name: 'title',
    message: 'What is the title of this document?',
    validate: (input: string) => {
      if (!input.trim()) {
        return 'Title is required';
      }
      return true;
    },
  },
];
