import type { ArtifactType, ConfidenceLevel, DecisionStatus, FindingKind, ProjectMode, ProjectStatus, QuestionStatus, ResearchArtifact, ResearchDecision, ResearchDepth, ResearchProject, ResearchProjectDetail, ResearchQuestion, ResearchSubscription, SourceTier, SourceType, SubscriptionItem, SubscriptionType } from "../types.js";
export interface CreateProjectRecord {
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
    nextResearchAt?: string;
    questions: string[];
}
export interface UpdateProjectRecord {
    title?: string;
    mode?: ProjectMode;
    status?: ProjectStatus;
    depth?: ResearchDepth;
    objective?: string;
    deliverable?: string | null;
    template?: string | null;
    constraints?: string[];
    preferredSources?: string[];
    excludedSources?: string[];
    notificationTarget?: string | null;
    refreshIntervalDays?: number | null;
    nextResearchAt?: string | null;
}
export interface RecordRunInput {
    depth: ResearchDepth;
    summary: string;
    methodology?: string;
    materialChange: boolean;
    changeSummary?: string;
    sources: Array<{
        key: string;
        url: string;
        title: string;
        publisher?: string;
        type: SourceType;
        tier: SourceTier;
        publishedAt?: string;
        excerpt?: string;
        claim?: string;
    }>;
    findings: Array<{
        kind: FindingKind;
        title: string;
        detail: string;
        confidence: ConfidenceLevel;
        sourceKeys: string[];
    }>;
    artifacts: Array<{
        type: ArtifactType;
        title: string;
        contentMarkdown: string;
    }>;
}
export declare class ResearchDatabase {
    private readonly db;
    constructor(path: string);
    close(): void;
    schemaVersion(): number;
    quickCheck(): string[];
    private migrate;
    createProject(input: CreateProjectRecord, now: string): ResearchProjectDetail;
    updateProject(id: string, input: UpdateProjectRecord, now: string): ResearchProjectDetail | undefined;
    getProject(id: string): ResearchProject | undefined;
    listProjects(options: {
        status?: ProjectStatus;
        mode?: ProjectMode;
        query?: string;
        dueBefore?: string;
        limit: number;
    }, now: string): ResearchProjectDetail[];
    getProjectDetail(id: string, now: string): ResearchProjectDetail | undefined;
    addQuestion(projectId: string, question: string, now: string): ResearchQuestion;
    updateQuestion(id: string, status: QuestionStatus, answer: string | undefined, now: string): ResearchQuestion | undefined;
    recordRun(projectId: string, input: RecordRunInput, now: string): ResearchProjectDetail;
    updateArtifact(id: string, title: string | undefined, contentMarkdown: string, now: string): ResearchArtifact | undefined;
    addDecision(projectId: string, runId: string | undefined, decision: string, rationale: string, status: DecisionStatus, now: string): ResearchDecision;
    addSubscription(projectId: string, input: {
        url: string;
        type: SubscriptionType;
        label?: string;
        checkIntervalHours: number;
        enabled: boolean;
    }, now: string): ResearchSubscription;
    removeSubscription(id: string): boolean;
    getSubscription(id: string): ResearchSubscription | undefined;
    listSubscriptions(projectId?: string): ResearchSubscription[];
    dueSubscriptions(now: string, limit: number): ResearchSubscription[];
    completeSubscriptionScan(id: string, items: Array<Omit<SubscriptionItem, "id" | "subscriptionId" | "discoveredAt">>, now: string): {
        subscription: ResearchSubscription;
        newItems: SubscriptionItem[];
        baselined: boolean;
        discoveredCount: number;
    };
    markRunNotified(runId: string, now: string): boolean;
    private hydrateRun;
    private mapProject;
    private mapQuestion;
    private mapSource;
    private mapFinding;
    private mapArtifact;
    private mapDecision;
    private mapSubscription;
}
