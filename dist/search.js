const record = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.trim() ? value.trim() : undefined;
function items(payload) { if (Array.isArray(payload.results))
    return payload.results; if (Array.isArray(payload.items))
    return payload.items; if (Array.isArray(payload.citations))
    return payload.citations; if (record(payload.data)) {
    if (Array.isArray(payload.data.results))
        return payload.data.results;
    if (Array.isArray(payload.data.items))
        return payload.data.items;
} return []; }
export async function multiAngleSearch(runtimeSearch, queries, count, signal) {
    const groups = await Promise.all(queries.map(async (query) => { signal?.throwIfAborted(); const response = await runtimeSearch({ args: { query, count }, signal }); return items(response.result).flatMap(item => { if (!record(item))
        return []; const url = text(item.url) ?? text(item.link); if (!url)
        return []; return [{ url, title: text(item.title) ?? text(item.name), snippet: text(item.snippet) ?? text(item.description) ?? text(item.content) ?? text(item.text), provider: response.provider, query }]; }); }));
    const seen = new Set();
    const results = groups.flat().filter(result => { try {
        const u = new URL(result.url);
        u.hash = "";
        const key = u.toString();
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    }
    catch {
        return false;
    } });
    return { queries, results };
}
