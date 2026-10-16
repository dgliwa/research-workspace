export declare function readPublicSource(url: string, maxChars?: number, signal?: AbortSignal): Promise<{
    url: string;
    finalUrl: string;
    contentType: string;
    text: string;
    truncated: boolean;
}>;
