import { fetchWithSsrFGuard } from "openclaw/plugin-sdk/ssrf-runtime";
function decode(text) { return text.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))); }
function readableHtml(html) {
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const body = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ").replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article)>/gi, "\n").replace(/<[^>]+>/g, " ");
    return decode(`${title ? `${title}\n\n` : ""}${body}`).replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
export async function readPublicSource(url, maxChars = 20_000, signal) {
    const parsed = new URL(url);
    if (!["https:"].includes(parsed.protocol) || parsed.username || parsed.password)
        throw new Error("Source URL must be credential-free HTTPS.");
    const guarded = await fetchWithSsrFGuard({ url, signal, timeoutMs: 20_000, maxRedirects: 3, requireHttps: true, auditContext: "research-workspace-source" });
    try {
        if (!guarded.response.ok)
            throw new Error(`Source request failed with HTTP ${guarded.response.status}.`);
        const length = Number(guarded.response.headers.get("content-length") ?? 0);
        if (length > 3_000_000)
            throw new Error("Source exceeds 3 MB limit.");
        const body = await guarded.response.text();
        if (Buffer.byteLength(body, "utf8") > 3_000_000)
            throw new Error("Source exceeds 3 MB limit.");
        const contentType = (guarded.response.headers.get("content-type") ?? "text/plain").split(";")[0].toLowerCase();
        if (!contentType.startsWith("text/") && !contentType.includes("json") && !contentType.includes("xml"))
            throw new Error(`Unsupported source content type ${contentType}.`);
        const readable = contentType.includes("html") ? readableHtml(body) : body.trim();
        return { url, finalUrl: guarded.finalUrl, contentType, text: readable.slice(0, maxChars), truncated: readable.length > maxChars };
    }
    finally {
        await guarded.release();
    }
}
