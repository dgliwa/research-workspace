type RuntimeSearch = (params: {
    args: Record<string, unknown>;
    signal?: AbortSignal;
}) => Promise<{
    provider: string;
    result: Record<string, unknown>;
}>;
export interface SearchResult {
    url: string;
    title?: string;
    snippet?: string;
    provider: string;
    query: string;
}
export declare function multiAngleSearch(runtimeSearch: RuntimeSearch, queries: string[], count: number, signal?: AbortSignal): Promise<{
    queries: string[];
    results: SearchResult[];
}>;
export {};
