import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { fetchWithSsrFGuard } from "openclaw/plugin-sdk/ssrf-runtime";
function array(value) { return value === undefined ? [] : Array.isArray(value) ? value : [value]; }
function value(input) {
    if (typeof input === "string" || typeof input === "number")
        return String(input).trim() || undefined;
    if (input && typeof input === "object") {
        const record = input;
        return value(record["#text"]) ?? value(record.href) ?? value(record._text);
    }
    return undefined;
}
function clean(value) {
    const result = value === undefined ? undefined : String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return result || undefined;
}
function isoDate(input) { const raw = value(input); if (!raw)
    return undefined; const date = new Date(raw); return Number.isNaN(date.getTime()) ? undefined : date.toISOString(); }
function guidFor(title, url, publishedAt) { return createHash("sha256").update(`${url ?? ""}\n${title}\n${publishedAt ?? ""}`).digest("hex"); }
export async function fetchFeed(url, signal) {
    const guarded = await fetchWithSsrFGuard({ url, signal, timeoutMs: 15_000, maxRedirects: 3, requireHttps: true, auditContext: "research-workspace-feed" });
    try {
        if (!guarded.response.ok)
            throw new Error(`Feed request failed with HTTP ${guarded.response.status}.`);
        const length = Number(guarded.response.headers.get("content-length") ?? 0);
        if (length > 5_000_000)
            throw new Error("Feed exceeds 5 MB limit.");
        const body = await guarded.response.text();
        if (Buffer.byteLength(body, "utf8") > 5_000_000)
            throw new Error("Feed exceeds 5 MB limit.");
        const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", textNodeName: "#text" }).parse(body);
        const rss = parsed.rss?.channel;
        const atom = parsed.feed;
        const rawItems = rss ? array(rss.item) : atom ? array(atom.entry) : [];
        const items = rawItems.flatMap((raw) => {
            if (!raw || typeof raw !== "object")
                return [];
            const item = raw;
            const title = clean(item.title);
            if (!title)
                return [];
            const links = array(item.link).map(value).filter((entry) => Boolean(entry));
            const itemUrl = links[0] ?? value(item.guid) ?? value(item.id);
            const publishedAt = isoDate(item.pubDate ?? item.published ?? item.updated ?? item.date);
            const guid = value(item.guid ?? item.id) ?? guidFor(title, itemUrl, publishedAt);
            return [{ guid, url: itemUrl, title, summary: clean(item.description ?? item.summary ?? item.content), publishedAt }];
        });
        return { finalUrl: guarded.finalUrl, title: clean(rss?.title ?? atom?.title), items: items.slice(0, 200) };
    }
    finally {
        await guarded.release();
    }
}
