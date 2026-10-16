export interface FeedItem {
    guid: string;
    url?: string;
    title: string;
    summary?: string;
    publishedAt?: string;
}
export declare function fetchFeed(url: string, signal?: AbortSignal): Promise<{
    finalUrl: string;
    title?: string;
    items: FeedItem[];
}>;
