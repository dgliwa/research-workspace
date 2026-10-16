import type { ResearchDatabase, RecordRunInput, UpdateProjectRecord } from "./persistence/db.js";
import type { ProjectMode, ProjectStatus, QuestionStatus, ResearchDepth, ResearchProjectDetail, SubscriptionType } from "./types.js";
export declare class ResearchValidationError extends Error {
}
export interface AddProjectInput {
    title: string;
    mode?: ProjectMode;
    status?: ProjectStatus;
    depth?: ResearchDepth;
    objective?: string;
    deliverable?: string;
    template?: string;
    constraints?: string[];
    preferredSources?: string[];
    excludedSources?: string[];
    refreshIntervalDays?: number;
    questions?: string[];
}
export declare class ResearchService {
    private readonly database;
    private readonly clock;
    constructor(database: ResearchDatabase, clock?: () => Date);
    private now;
    add(input: AddProjectInput): ResearchProjectDetail;
    update(id: string, input: UpdateProjectRecord): ResearchProjectDetail;
    status(id: string): ResearchProjectDetail;
    list(options?: {
        status?: ProjectStatus;
        mode?: ProjectMode;
        query?: string;
        dueOnly?: boolean;
        limit?: number;
    }): ResearchProjectDetail[];
    due(limit?: number): ResearchProjectDetail[];
    addQuestion(projectId: string, question: string): import("./types.js").ResearchQuestion;
    updateQuestion(questionId: string, status: QuestionStatus, answer?: string): import("./types.js").ResearchQuestion;
    record(projectId: string, input: RecordRunInput): ResearchProjectDetail;
    updateArtifact(artifactId: string, title: string | undefined, contentMarkdown: string): import("./types.js").ResearchArtifact;
    addDecision(projectId: string, input: {
        runId?: string;
        decision: string;
        rationale: string;
        status?: "proposed" | "accepted" | "rejected" | "superseded";
    }): import("./types.js").ResearchDecision;
    addSubscription(projectId: string, input: {
        url: string;
        type: SubscriptionType;
        label?: string;
        checkIntervalHours?: number;
        enabled?: boolean;
    }): import("./types.js").ResearchSubscription;
    removeSubscription(id: string): {
        removed: boolean;
        id: string;
    };
    subscriptions(projectId?: string): import("./types.js").ResearchSubscription[];
    scanSubscriptions(input: {
        subscriptionId?: string;
        limit?: number;
    }, signal?: AbortSignal): Promise<{
        checked: number;
        results: ({
            subscription: import("./types.js").ResearchSubscription;
            feedTitle: string | undefined;
            finalUrl: string;
            newItems: import("./types.js").SubscriptionItem[];
            baselined: boolean;
            discoveredCount: number;
            error: undefined;
        } | {
            subscription: import("./types.js").ResearchSubscription;
            newItems: never[];
            error: string;
            feedTitle?: undefined;
            finalUrl?: undefined;
            baselined?: undefined;
            discoveredCount?: undefined;
        })[];
    }>;
}
export declare function researchInstructions(detail: ResearchProjectDetail): string[];
