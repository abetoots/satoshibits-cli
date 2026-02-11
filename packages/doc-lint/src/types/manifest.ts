export interface DocLintManifest {
  version: string;
  project: {
    name: string;
    description?: string;
  };
  documents: {
    required: DocumentRef[];
    optional?: DocumentRef[];
  };
  signals: {
    declared: string[];
  };
  options?: {
    contradiction?: boolean;
    concerns?: string[];
  };
}

export interface DocumentRef {
  role: string;
  path: string;
  label?: string;
}
