/**
 * Type definitions for create-github-workflows CLI
 */

// ═══════════════════════════════════════════════════════════════════════════
// PRESET TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type Preset = 'library' | 'docker-app' | 'monorepo';

export type ReleaseStrategy = 'release-please' | 'changesets';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export type DockerRegistry = 'ghcr' | 'dockerhub' | 'ecr';

export type DeploymentPlatform = 'digitalocean' | 'kubernetes' | 'aws-ecs';

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type WorkflowCategory = 'ci' | 'release' | 'publish' | 'deploy' | 'security' | 'maintenance' | 'docs';

export type CIWorkflow = 'pr-validation' | 'build';

export type ReleaseWorkflow = 'release-please' | 'changesets';

export type PublishWorkflow = 'npm' | 'docker';

export type DeployWorkflow = 'staging' | 'preview' | 'production';

export type SecurityWorkflow = 'codeql' | 'dependency-audit';

export type MaintenanceWorkflow = 'dependabot' | 'stale';

export type DocsWorkflow = 'docs-deploy';

export type WorkflowName = CIWorkflow | ReleaseWorkflow | PublishWorkflow | DeployWorkflow | SecurityWorkflow | MaintenanceWorkflow | DocsWorkflow;

export interface WorkflowInfo {
  name: WorkflowName;
  category: WorkflowCategory;
  description: string;
  templateFile: string;
  outputFile: string;
  /** defaults to '.github/workflows', override for non-workflow files like dependabot.yml */
  outputDir?: string;
  requiredSecrets: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export interface DetectedProject {
  packageManager: PackageManager;
  isMonorepo: boolean;
  /** Path to Dockerfile if found, null otherwise */
  dockerfilePath: string | null;
  nodeVersion: string | null;
  hasExistingWorkflows: boolean;
  existingWorkflows: string[];
  projectName: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface WorkflowConfig {
  /** config schema version for future migrations */
  version: number;
  /** project name for workflow names */
  projectName: string;
  /** selected preset */
  preset: Preset;
  /** package manager to use */
  packageManager: PackageManager;
  /** release strategy */
  releaseStrategy: ReleaseStrategy;
  /** node version for workflows */
  nodeVersion: string;
  /** whether the project is a monorepo */
  isMonorepo: boolean;
  /** docker configuration */
  docker: DockerConfig | null;
  /** deployment environments */
  deployEnvironments: DeployEnvironment[];
  /** selected workflows */
  workflows: WorkflowName[];
  /** npm publishing configuration */
  npm: NpmConfig | null;
  /** docs deployment configuration */
  docs: DocsConfig | null;
  /** timestamp when created */
  createdAt: string;
}

export interface DockerConfig {
  /** docker registry */
  registry: DockerRegistry;
  /** image name (without registry prefix) */
  imageName: string;
  /** dockerfile path */
  dockerfilePath: string;
  /** build targets (for multi-stage builds) */
  buildTargets: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// DEPLOYMENT PLATFORM CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface DigitalOceanConfig {
  appName: string;
}

export interface KubernetesConfig {
  clusterName: string;
  namespace: string;
  deploymentName: string;
}

export interface AwsEcsConfig {
  clusterName: string;
  serviceName: string;
  region: string;
}

export interface DeployEnvironment {
  name: 'staging' | 'preview' | 'production';
  /** whether this environment is enabled */
  enabled: boolean;
  /** deployment platform */
  platform: DeploymentPlatform;
  /** digitalocean configuration (if platform is digitalocean) */
  digitalocean?: DigitalOceanConfig;
  /** kubernetes configuration (if platform is kubernetes) */
  kubernetes?: KubernetesConfig;
  /** aws ecs configuration (if platform is aws-ecs) */
  awsEcs?: AwsEcsConfig;
}

export interface NpmConfig {
  /** whether to publish to npm */
  publish: boolean;
  /** npm access level */
  access: 'public' | 'restricted';
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

export interface DocsConfig {
  /** build script name, e.g. "build:docs" */
  buildScript: string;
  /** output directory for built docs, e.g. "./docs/.vitepress/dist" */
  outputDir: string;
}

export interface TemplateContext {
  /** project name */
  projectName: string;
  /** package manager */
  packageManager: PackageManager;
  /** node version */
  nodeVersion: string;
  /** whether project is a monorepo */
  isMonorepo: boolean;
  /** docker configuration */
  docker: DockerConfig | null;
  /** deployment environments */
  deployEnvironments: DeployEnvironment[];
  /** release strategy */
  releaseStrategy: ReleaseStrategy;
  /** npm configuration */
  npm: NpmConfig | null;
  /** docs deployment configuration */
  docs: DocsConfig | null;
  /** additional context from preset */
  [key: string]: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESET DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

export interface PresetDefinition {
  name: Preset;
  description: string;
  releaseStrategy: ReleaseStrategy;
  workflows: WorkflowName[];
  hasDocker: boolean;
  hasNpm: boolean;
  deployEnvironments: ('staging' | 'preview' | 'production')[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI OPTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface InitOptions {
  preset?: Preset;
  yes?: boolean;
  force?: boolean;
}

export interface AddOptions {
  force?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECRETS INFORMATION
// ═══════════════════════════════════════════════════════════════════════════

export interface SecretInfo {
  name: string;
  description: string;
  required: boolean;
  workflows: WorkflowName[];
}

/**
 * Secrets required by each Docker registry.
 * These are dynamically included based on selected registry.
 */
export const DOCKER_REGISTRY_SECRETS: Record<DockerRegistry, SecretInfo[]> = {
  ghcr: [
    {
      name: 'GITHUB_TOKEN',
      description: 'Automatically provided by GitHub Actions (for GHCR)',
      required: true,
      workflows: ['build', 'docker'],
    },
  ],
  dockerhub: [
    {
      name: 'DOCKERHUB_USERNAME',
      description: 'Docker Hub username for authentication',
      required: true,
      workflows: ['build', 'docker'],
    },
    {
      name: 'DOCKERHUB_TOKEN',
      description: 'Docker Hub access token for authentication',
      required: true,
      workflows: ['build', 'docker'],
    },
  ],
  ecr: [
    {
      name: 'AWS_ACCESS_KEY_ID',
      description: 'AWS access key for ECR authentication',
      required: true,
      workflows: ['build', 'docker'],
    },
    {
      name: 'AWS_SECRET_ACCESS_KEY',
      description: 'AWS secret key for ECR authentication',
      required: true,
      workflows: ['build', 'docker'],
    },
    {
      name: 'AWS_REGION',
      description: 'AWS region for ECR',
      required: true,
      workflows: ['build', 'docker'],
    },
    {
      name: 'AWS_ACCOUNT_ID',
      description: 'AWS account ID for ECR registry URL',
      required: true,
      workflows: ['build', 'docker'],
    },
  ],
};

/**
 * Secrets required by each deployment platform.
 * These are dynamically included based on selected platforms.
 */
export const PLATFORM_SECRETS: Record<DeploymentPlatform, SecretInfo[]> = {
  digitalocean: [
    {
      name: 'DIGITALOCEAN_ACCESS_TOKEN',
      description: 'DigitalOcean API token for App Platform deployment',
      required: true,
      workflows: ['staging', 'preview', 'production'],
    },
  ],
  kubernetes: [
    {
      name: 'KUBE_CONFIG',
      description: 'Base64-encoded kubeconfig for cluster access',
      required: true,
      workflows: ['staging', 'preview', 'production'],
    },
  ],
  'aws-ecs': [
    {
      name: 'AWS_ACCESS_KEY_ID',
      description: 'AWS access key for ECS deployment',
      required: true,
      workflows: ['staging', 'preview', 'production'],
    },
    {
      name: 'AWS_SECRET_ACCESS_KEY',
      description: 'AWS secret key for ECS deployment',
      required: true,
      workflows: ['staging', 'preview', 'production'],
    },
  ],
};

export const WORKFLOW_SECRETS: Record<WorkflowName, SecretInfo[]> = {
  'pr-validation': [],
  'build': [
    {
      name: 'GITHUB_TOKEN',
      description: 'Automatically provided by GitHub Actions',
      required: true,
      workflows: ['build'],
    },
  ],
  'release-please': [
    {
      name: 'RELEASE_PAT',
      description: 'Personal Access Token with contents:write permission (to trigger other workflows)',
      required: true,
      workflows: ['release-please'],
    },
  ],
  'changesets': [
    {
      name: 'NPM_TOKEN',
      description: 'NPM authentication token for publishing',
      required: true,
      workflows: ['changesets'],
    },
  ],
  'npm': [
    {
      name: 'NPM_TOKEN',
      description: 'NPM authentication token for publishing',
      required: true,
      workflows: ['npm'],
    },
  ],
  'docker': [
    {
      name: 'GITHUB_TOKEN',
      description: 'Automatically provided (for GHCR)',
      required: true,
      workflows: ['docker'],
    },
  ],
  // deploy workflow secrets are now computed dynamically via PLATFORM_SECRETS
  'staging': [],
  'preview': [],
  'production': [],
  // security workflows — use GITHUB_TOKEN automatically
  'codeql': [],
  'dependency-audit': [],
  // maintenance workflows — no secrets needed
  'dependabot': [],
  'stale': [],
  // docs workflows — uses GITHUB_TOKEN via Pages permissions
  'docs-deploy': [],
};

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

export const WORKFLOW_REGISTRY: Record<WorkflowName, WorkflowInfo> = {
  'pr-validation': {
    name: 'pr-validation',
    category: 'ci',
    description: 'Fast PR feedback with lint, typecheck, and unit tests',
    templateFile: 'ci/pr-validation.yml.hbs',
    outputFile: 'pr-validation.yml',
    requiredSecrets: [],
  },
  'build': {
    name: 'build',
    category: 'ci',
    description: 'Main branch protection with Docker image build and validation',
    templateFile: 'ci/build.yml.hbs',
    outputFile: 'build.yml',
    requiredSecrets: ['GITHUB_TOKEN'],
  },
  'release-please': {
    name: 'release-please',
    category: 'release',
    description: 'Automated version and changelog management',
    templateFile: 'release/release-please.yml.hbs',
    outputFile: 'release-please.yml',
    requiredSecrets: ['RELEASE_PAT'],
  },
  'changesets': {
    name: 'changesets',
    category: 'release',
    description: 'Monorepo release management with changesets',
    templateFile: 'release/changesets.yml.hbs',
    outputFile: 'changesets.yml',
    requiredSecrets: ['NPM_TOKEN'],
  },
  'npm': {
    name: 'npm',
    category: 'publish',
    description: 'NPM package publishing',
    templateFile: 'publish/npm.yml.hbs',
    outputFile: 'publish-npm.yml',
    requiredSecrets: ['NPM_TOKEN'],
  },
  'docker': {
    name: 'docker',
    category: 'publish',
    description: 'Docker image promotion with version tags',
    templateFile: 'publish/docker.yml.hbs',
    outputFile: 'publish-docker.yml',
    requiredSecrets: ['GITHUB_TOKEN'],
  },
  // deploy workflow secrets are now computed dynamically based on selected platform
  'staging': {
    name: 'staging',
    category: 'deploy',
    description: 'Manual staging deployment',
    templateFile: 'deploy/staging.yml.hbs',
    outputFile: 'deploy-staging.yml',
    requiredSecrets: [],
  },
  'preview': {
    name: 'preview',
    category: 'deploy',
    description: 'Manual preview deployment from any branch',
    templateFile: 'deploy/preview.yml.hbs',
    outputFile: 'deploy-preview.yml',
    requiredSecrets: [],
  },
  'production': {
    name: 'production',
    category: 'deploy',
    description: 'Tag-triggered production deployment',
    templateFile: 'deploy/production.yml.hbs',
    outputFile: 'deploy-production.yml',
    requiredSecrets: [],
  },
  // security
  'codeql': {
    name: 'codeql',
    category: 'security',
    description: 'GitHub CodeQL static analysis for security vulnerabilities',
    templateFile: 'security/codeql.yml.hbs',
    outputFile: 'codeql.yml',
    requiredSecrets: [],
  },
  'dependency-audit': {
    name: 'dependency-audit',
    category: 'security',
    description: 'Scheduled dependency vulnerability audit with issue reporting',
    templateFile: 'security/dependency-audit.yml.hbs',
    outputFile: 'dependency-audit.yml',
    requiredSecrets: [],
  },
  // maintenance
  'dependabot': {
    name: 'dependabot',
    category: 'maintenance',
    description: 'Automated dependency updates via Dependabot',
    templateFile: 'maintenance/dependabot.yml.hbs',
    outputFile: 'dependabot.yml',
    outputDir: '.github',
    requiredSecrets: [],
  },
  'stale': {
    name: 'stale',
    category: 'maintenance',
    description: 'Automatically close stale issues and PRs',
    templateFile: 'maintenance/stale.yml.hbs',
    outputFile: 'stale.yml',
    requiredSecrets: [],
  },
  // docs
  'docs-deploy': {
    name: 'docs-deploy',
    category: 'docs',
    description: 'Deploy documentation to GitHub Pages',
    templateFile: 'docs/deploy-docs.yml.hbs',
    outputFile: 'deploy-docs.yml',
    requiredSecrets: [],
  },
};
