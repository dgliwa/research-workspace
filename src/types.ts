export const PROJECT_MODES = ["project", "watch"] as const;
export const PROJECT_STATUSES = ["active", "paused", "completed", "archived"] as const;
export const RESEARCH_DEPTHS = ["quick", "standard", "deep"] as const;
export const QUESTION_STATUSES = ["open", "answered", "blocked", "dismissed"] as const;
export const SOURCE_TIERS = ["primary", "established", "discovery", "excluded"] as const;
export const SOURCE_TYPES = ["official_docs", "release_notes", "repository", "paper", "independent_review", "practitioner_blog", "news", "forum", "other"] as const;
export const FINDING_KINDS = ["recommendation", "option", "claim", "risk", "change", "open_question"] as const;
export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export const ARTIFACT_TYPES = ["report", "living_guide", "comparison", "plan", "bill_of_materials", "procedure", "decklist", "digest", "notes", "other"] as const;
export const DECISION_STATUSES = ["proposed", "accepted", "rejected", "superseded"] as const;
export const SUBSCRIPTION_TYPES = ["rss", "atom", "web", "github_releases"] as const;

export type ProjectMode = typeof PROJECT_MODES[number];
export type ProjectStatus = typeof PROJECT_STATUSES[number];
export type ResearchDepth = typeof RESEARCH_DEPTHS[number];
export type QuestionStatus = typeof QUESTION_STATUSES[number];
export type SourceTier = typeof SOURCE_TIERS[number];
export type SourceType = typeof SOURCE_TYPES[number];
export type FindingKind = typeof FINDING_KINDS[number];
export type ConfidenceLevel = typeof CONFIDENCE_LEVELS[number];
export type ArtifactType = typeof ARTIFACT_TYPES[number];
export type DecisionStatus = typeof DECISION_STATUSES[number];
export type SubscriptionType = typeof SUBSCRIPTION_TYPES[number];

export interface ResearchProject {
  id: string;
  title: string;
  mode: ProjectMode;
  status: ProjectStatus;
  depth: ResearchDepth;
  objective: string;
  deliverable?: string;
  template?: string;
  constraints: string[];
  preferredSources: string[];
  excludedSources: string[];
  notificationTarget?: string;
  refreshIntervalDays?: number;
  lastResearchedAt?: string;
  nextResearchAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchQuestion {
  id: string;
  projectId: string;
  question: string;
  status: QuestionStatus;
  answer?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchSource {
  id: string;
  runId: string;
  url: string;
  title: string;
  publisher?: string;
  type: SourceType;
  tier: SourceTier;
  publishedAt?: string;
  retrievedAt: string;
  excerpt?: string;
  claim?: string;
}

export interface ResearchFinding {
  id: string;
  runId: string;
  kind: FindingKind;
  title: string;
  detail: string;
  confidence: ConfidenceLevel;
  sourceIds: string[];
}

export interface ResearchArtifact {
  id: string;
  projectId: string;
  runId?: string;
  type: ArtifactType;
  title: string;
  contentMarkdown: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchRun {
  id: string;
  projectId: string;
  depth: ResearchDepth;
  summary: string;
  methodology?: string;
  materialChange: boolean;
  changeSummary?: string;
  researchedAt: string;
  nextResearchAt?: string;
  notificationSentAt?: string;
  sources: ResearchSource[];
  findings: ResearchFinding[];
  artifacts: ResearchArtifact[];
}

export interface ResearchDecision {
  id: string;
  projectId: string;
  runId?: string;
  decision: string;
  rationale: string;
  status: DecisionStatus;
  createdAt: string;
}

export interface ResearchSubscription {
  id: string;
  projectId: string;
  url: string;
  type: SubscriptionType;
  label?: string;
  enabled: boolean;
  baselineComplete: boolean;
  checkIntervalHours: number;
  lastCheckedAt?: string;
  nextCheckAt: string;
  createdAt: string;
}

export interface SubscriptionItem {
  id: string;
  subscriptionId: string;
  guid: string;
  url?: string;
  title: string;
  summary?: string;
  publishedAt?: string;
  discoveredAt: string;
}

export interface ResearchProjectDetail {
  project: ResearchProject;
  due: boolean;
  questions: ResearchQuestion[];
  latestRun?: ResearchRun;
  runCount: number;
  artifacts: ResearchArtifact[];
  decisions: ResearchDecision[];
  subscriptions: ResearchSubscription[];
}
