import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { sendDurableMessageBatch } from "openclaw/plugin-sdk/channel-outbound";
import type { ResearchDatabase } from "./persistence/db.js";
import type { ResearchProjectDetail } from "./types.js";
export declare function formatResearchNotification(detail: ResearchProjectDetail): string;
export declare function sendLatestResearchNotification(options: {
    database: ResearchDatabase;
    projectId: string;
    defaultTarget?: string;
    config: OpenClawConfig;
    signal?: AbortSignal;
    now?: () => Date;
    durableSend?: typeof sendDurableMessageBatch;
}): Promise<{
    status: string;
    target: string | undefined;
    runId: string;
    deliveryIntentId?: undefined;
} | {
    status: string;
    target: string;
    runId: string;
    deliveryIntentId: string | undefined;
}>;
