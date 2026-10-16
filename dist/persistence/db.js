import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
const SCHEMA_VERSION = 2;
function text(value) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}
function jsonStrings(value) {
    if (typeof value !== "string")
        return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    }
    catch {
        return [];
    }
}
function bool(value) { return Number(value) === 1; }
function rows(statement, ...params) {
    return statement.all(...params);
}
export class ResearchDatabase {
    db;
    constructor(path) {
        if (path !== ":memory:") {
            mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
            if (existsSync(path) && !lstatSync(path).isFile())
                throw new Error("Research database destination must be a regular file.");
        }
        this.db = new DatabaseSync(path);
        this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
        this.migrate();
        if (path !== ":memory:") {
            try {
                chmodSync(path, 0o600);
            }
            catch { /* best effort */ }
        }
    }
    close() { this.db.close(); }
    schemaVersion() { return Number(this.db.prepare("PRAGMA user_version").get().user_version); }
    quickCheck() { return rows(this.db.prepare("PRAGMA quick_check")).map((row) => String(Object.values(row)[0])); }
    migrate() {
        const version = this.schemaVersion();
        if (version > SCHEMA_VERSION)
            throw new Error(`Database schema ${version} is newer than supported schema ${SCHEMA_VERSION}.`);
        if (version === 0) {
            this.db.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE research_projects (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL,
          depth TEXT NOT NULL, objective TEXT NOT NULL, deliverable TEXT, template TEXT,
          constraints_json TEXT NOT NULL, preferred_sources_json TEXT NOT NULL, excluded_sources_json TEXT NOT NULL,
          notification_target TEXT, refresh_interval_days INTEGER, last_researched_at TEXT, next_research_at TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          CHECK (mode IN ('project','watch')),
          CHECK (status IN ('active','paused','completed','archived')),
          CHECK (depth IN ('quick','standard','deep')),
          CHECK (refresh_interval_days IS NULL OR refresh_interval_days BETWEEN 1 AND 3650)
        );
        CREATE TABLE research_questions (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
          question TEXT NOT NULL, status TEXT NOT NULL, answer TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          CHECK (status IN ('open','answered','blocked','dismissed'))
        );
        CREATE TABLE research_runs (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
          depth TEXT NOT NULL, summary TEXT NOT NULL, methodology TEXT, material_change INTEGER NOT NULL,
          change_summary TEXT, researched_at TEXT NOT NULL, next_research_at TEXT, notification_sent_at TEXT,
          CHECK (depth IN ('quick','standard','deep')), CHECK (material_change IN (0,1))
        );
        CREATE TABLE research_sources (
          id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
          url TEXT NOT NULL, title TEXT NOT NULL, publisher TEXT, source_type TEXT NOT NULL, tier TEXT NOT NULL,
          published_at TEXT, retrieved_at TEXT NOT NULL, excerpt TEXT, claim TEXT,
          UNIQUE(run_id, url)
        );
        CREATE TABLE research_findings (
          id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
          kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, confidence TEXT NOT NULL,
          source_ids_json TEXT NOT NULL
        );
        CREATE TABLE research_artifacts (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
          run_id TEXT REFERENCES research_runs(id) ON DELETE SET NULL, artifact_type TEXT NOT NULL,
          title TEXT NOT NULL, content_markdown TEXT NOT NULL, version INTEGER NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          UNIQUE(project_id, artifact_type, version)
        );
        CREATE TABLE research_decisions (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
          run_id TEXT REFERENCES research_runs(id) ON DELETE SET NULL, decision TEXT NOT NULL,
          rationale TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE research_subscriptions (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
          url TEXT NOT NULL, subscription_type TEXT NOT NULL, label TEXT, enabled INTEGER NOT NULL,
          baseline_completed INTEGER NOT NULL DEFAULT 0, check_interval_hours INTEGER NOT NULL, last_checked_at TEXT, next_check_at TEXT NOT NULL, created_at TEXT NOT NULL,
          UNIQUE(project_id, url), CHECK (enabled IN (0,1)), CHECK (check_interval_hours BETWEEN 1 AND 8760)
        );
        CREATE TABLE research_subscription_items (
          id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL REFERENCES research_subscriptions(id) ON DELETE CASCADE,
          guid TEXT NOT NULL, url TEXT, title TEXT NOT NULL, summary TEXT, published_at TEXT, discovered_at TEXT NOT NULL,
          UNIQUE(subscription_id, guid)
        );
        CREATE INDEX research_projects_due_idx ON research_projects(status, next_research_at);
        CREATE INDEX research_runs_project_idx ON research_runs(project_id, researched_at DESC);
        CREATE INDEX research_artifacts_project_idx ON research_artifacts(project_id, artifact_type, version DESC);
        CREATE INDEX research_subscriptions_due_idx ON research_subscriptions(enabled, next_check_at);
        PRAGMA user_version = 2;
        COMMIT;
      `);
        }
        if (version === 1) {
            this.db.exec(`
        BEGIN IMMEDIATE;
        ALTER TABLE research_projects ADD COLUMN notification_target TEXT;
        ALTER TABLE research_runs ADD COLUMN notification_sent_at TEXT;
        PRAGMA user_version = 2;
        COMMIT;
      `);
        }
    }
    createProject(input, now) {
        const id = randomUUID();
        this.db.exec("BEGIN IMMEDIATE");
        try {
            this.db.prepare(`INSERT INTO research_projects
        (id,title,mode,status,depth,objective,deliverable,template,constraints_json,preferred_sources_json,excluded_sources_json,notification_target,refresh_interval_days,next_research_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, input.title, input.mode, input.status, input.depth, input.objective, input.deliverable ?? null, input.template ?? null, JSON.stringify(input.constraints), JSON.stringify(input.preferredSources), JSON.stringify(input.excludedSources), input.notificationTarget ?? null, input.refreshIntervalDays ?? null, input.nextResearchAt ?? null, now, now);
            const insertQuestion = this.db.prepare("INSERT INTO research_questions (id,project_id,question,status,created_at,updated_at) VALUES (?,?,?,?,?,?)");
            for (const question of input.questions)
                insertQuestion.run(randomUUID(), id, question, "open", now, now);
            this.db.exec("COMMIT");
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
        return this.getProjectDetail(id, now);
    }
    updateProject(id, input, now) {
        const current = this.getProject(id);
        if (!current)
            return undefined;
        this.db.prepare(`UPDATE research_projects SET title=?,mode=?,status=?,depth=?,objective=?,deliverable=?,template=?,
      constraints_json=?,preferred_sources_json=?,excluded_sources_json=?,notification_target=?,refresh_interval_days=?,next_research_at=?,updated_at=? WHERE id=?`).run(input.title ?? current.title, input.mode ?? current.mode, input.status ?? current.status, input.depth ?? current.depth, input.objective ?? current.objective, input.deliverable === undefined ? current.deliverable ?? null : input.deliverable, input.template === undefined ? current.template ?? null : input.template, JSON.stringify(input.constraints ?? current.constraints), JSON.stringify(input.preferredSources ?? current.preferredSources), JSON.stringify(input.excludedSources ?? current.excludedSources), input.notificationTarget === undefined ? current.notificationTarget ?? null : input.notificationTarget, input.refreshIntervalDays === undefined ? current.refreshIntervalDays ?? null : input.refreshIntervalDays, input.nextResearchAt === undefined ? current.nextResearchAt ?? null : input.nextResearchAt, now, id);
        return this.getProjectDetail(id, now);
    }
    getProject(id) {
        const row = this.db.prepare("SELECT * FROM research_projects WHERE id=?").get(id);
        return row ? this.mapProject(row) : undefined;
    }
    listProjects(options, now) {
        const where = [];
        const params = [];
        if (options.status) {
            where.push("status=?");
            params.push(options.status);
        }
        if (options.mode) {
            where.push("mode=?");
            params.push(options.mode);
        }
        if (options.query) {
            where.push("(lower(title) LIKE ? OR lower(objective) LIKE ?)");
            const q = `%${options.query.toLowerCase()}%`;
            params.push(q, q);
        }
        if (options.dueBefore) {
            where.push("next_research_at IS NOT NULL AND next_research_at<=?");
            params.push(options.dueBefore);
        }
        params.push(options.limit);
        const sql = `SELECT id FROM research_projects ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, COALESCE(next_research_at,'9999') ASC, updated_at DESC LIMIT ?`;
        return rows(this.db.prepare(sql), ...params).map((row) => this.getProjectDetail(String(row.id), now));
    }
    getProjectDetail(id, now) {
        const project = this.getProject(id);
        if (!project)
            return undefined;
        const questions = rows(this.db.prepare("SELECT * FROM research_questions WHERE project_id=? ORDER BY created_at,id"), id).map((row) => this.mapQuestion(row));
        const latestRunRow = this.db.prepare("SELECT * FROM research_runs WHERE project_id=? ORDER BY researched_at DESC,rowid DESC LIMIT 1").get(id);
        const latestRun = latestRunRow ? this.hydrateRun(latestRunRow) : undefined;
        const runCount = Number(this.db.prepare("SELECT count(*) count FROM research_runs WHERE project_id=?").get(id).count);
        const artifacts = rows(this.db.prepare("SELECT * FROM research_artifacts WHERE project_id=? ORDER BY created_at DESC"), id).map((row) => this.mapArtifact(row));
        const decisions = rows(this.db.prepare("SELECT * FROM research_decisions WHERE project_id=? ORDER BY created_at DESC"), id).map((row) => this.mapDecision(row));
        const subscriptions = this.listSubscriptions(id);
        return { project, due: project.status === "active" && Boolean(project.nextResearchAt && project.nextResearchAt <= now), questions, latestRun, runCount, artifacts, decisions, subscriptions };
    }
    addQuestion(projectId, question, now) {
        const id = randomUUID();
        this.db.prepare("INSERT INTO research_questions (id,project_id,question,status,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(id, projectId, question, "open", now, now);
        return this.mapQuestion(this.db.prepare("SELECT * FROM research_questions WHERE id=?").get(id));
    }
    updateQuestion(id, status, answer, now) {
        const result = this.db.prepare("UPDATE research_questions SET status=?,answer=?,updated_at=? WHERE id=?").run(status, answer ?? null, now, id);
        return Number(result.changes) ? this.mapQuestion(this.db.prepare("SELECT * FROM research_questions WHERE id=?").get(id)) : undefined;
    }
    recordRun(projectId, input, now) {
        const project = this.getProject(projectId);
        if (!project)
            throw new Error(`Unknown research project ${projectId}.`);
        const runId = randomUUID();
        const next = project.refreshIntervalDays ? new Date(new Date(now).getTime() + project.refreshIntervalDays * 86_400_000).toISOString() : undefined;
        this.db.exec("BEGIN IMMEDIATE");
        try {
            this.db.prepare("INSERT INTO research_runs (id,project_id,depth,summary,methodology,material_change,change_summary,researched_at,next_research_at) VALUES (?,?,?,?,?,?,?,?,?)").run(runId, projectId, input.depth, input.summary, input.methodology ?? null, input.materialChange ? 1 : 0, input.changeSummary ?? null, now, next ?? null);
            const sourceIds = new Map();
            const insertSource = this.db.prepare("INSERT INTO research_sources (id,run_id,url,title,publisher,source_type,tier,published_at,retrieved_at,excerpt,claim) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
            for (const source of input.sources) {
                const id = randomUUID();
                sourceIds.set(source.key, id);
                insertSource.run(id, runId, source.url, source.title, source.publisher ?? null, source.type, source.tier, source.publishedAt ?? null, now, source.excerpt ?? null, source.claim ?? null);
            }
            const insertFinding = this.db.prepare("INSERT INTO research_findings (id,run_id,kind,title,detail,confidence,source_ids_json) VALUES (?,?,?,?,?,?,?)");
            for (const finding of input.findings) {
                const ids = finding.sourceKeys.map((key) => sourceIds.get(key)).filter((value) => Boolean(value));
                insertFinding.run(randomUUID(), runId, finding.kind, finding.title, finding.detail, finding.confidence, JSON.stringify(ids));
            }
            const insertArtifact = this.db.prepare("INSERT INTO research_artifacts (id,project_id,run_id,artifact_type,title,content_markdown,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)");
            for (const artifact of input.artifacts) {
                const version = Number(this.db.prepare("SELECT COALESCE(max(version),0)+1 version FROM research_artifacts WHERE project_id=? AND artifact_type=?").get(projectId, artifact.type).version);
                insertArtifact.run(randomUUID(), projectId, runId, artifact.type, artifact.title, artifact.contentMarkdown, version, now, now);
            }
            this.db.prepare("UPDATE research_projects SET last_researched_at=?,next_research_at=?,status=?,updated_at=? WHERE id=?").run(now, next ?? null, next ? "active" : "completed", now, projectId);
            this.db.exec("COMMIT");
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
        return this.getProjectDetail(projectId, now);
    }
    updateArtifact(id, title, contentMarkdown, now) {
        const current = this.db.prepare("SELECT * FROM research_artifacts WHERE id=?").get(id);
        if (!current)
            return undefined;
        const projectId = String(current.project_id);
        const artifactType = String(current.artifact_type);
        const runId = text(current.run_id);
        const currentTitle = String(current.title);
        const version = Number(this.db.prepare("SELECT COALESCE(max(version),0)+1 version FROM research_artifacts WHERE project_id=? AND artifact_type=?").get(projectId, artifactType).version);
        const nextId = String(randomUUID());
        this.db.prepare("INSERT INTO research_artifacts (id,project_id,run_id,artifact_type,title,content_markdown,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run(nextId, projectId, runId ?? null, artifactType, title ?? currentTitle, contentMarkdown, version, now, now);
        return this.mapArtifact(this.db.prepare("SELECT * FROM research_artifacts WHERE id=?").get(nextId));
    }
    addDecision(projectId, runId, decision, rationale, status, now) {
        const id = randomUUID();
        this.db.prepare("INSERT INTO research_decisions (id,project_id,run_id,decision,rationale,status,created_at) VALUES (?,?,?,?,?,?,?)").run(id, projectId, runId ?? null, decision, rationale, status, now);
        return this.mapDecision(this.db.prepare("SELECT * FROM research_decisions WHERE id=?").get(id));
    }
    addSubscription(projectId, input, now) {
        const id = randomUUID();
        this.db.prepare("INSERT INTO research_subscriptions (id,project_id,url,subscription_type,label,enabled,check_interval_hours,next_check_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(id, projectId, input.url, input.type, input.label ?? null, input.enabled ? 1 : 0, input.checkIntervalHours, now, now);
        return this.getSubscription(id);
    }
    removeSubscription(id) { return Number(this.db.prepare("DELETE FROM research_subscriptions WHERE id=?").run(id).changes) > 0; }
    getSubscription(id) { const row = this.db.prepare("SELECT * FROM research_subscriptions WHERE id=?").get(id); return row ? this.mapSubscription(row) : undefined; }
    listSubscriptions(projectId) {
        const statement = projectId ? this.db.prepare("SELECT * FROM research_subscriptions WHERE project_id=? ORDER BY created_at") : this.db.prepare("SELECT * FROM research_subscriptions ORDER BY created_at");
        return rows(statement, ...(projectId ? [projectId] : [])).map((row) => this.mapSubscription(row));
    }
    dueSubscriptions(now, limit) { return rows(this.db.prepare("SELECT * FROM research_subscriptions WHERE enabled=1 AND next_check_at<=? ORDER BY next_check_at LIMIT ?"), now, limit).map((row) => this.mapSubscription(row)); }
    completeSubscriptionScan(id, items, now) {
        const subscription = this.getSubscription(id);
        if (!subscription)
            throw new Error(`Unknown subscription ${id}.`);
        const baselined = !subscription.baselineComplete;
        const next = new Date(new Date(now).getTime() + subscription.checkIntervalHours * 3_600_000).toISOString();
        const discovered = [];
        this.db.exec("BEGIN IMMEDIATE");
        try {
            const insert = this.db.prepare("INSERT OR IGNORE INTO research_subscription_items (id,subscription_id,guid,url,title,summary,published_at,discovered_at) VALUES (?,?,?,?,?,?,?,?)");
            for (const item of items) {
                const itemId = randomUUID();
                const result = insert.run(itemId, id, item.guid, item.url ?? null, item.title, item.summary ?? null, item.publishedAt ?? null, now);
                if (Number(result.changes))
                    discovered.push({ id: itemId, subscriptionId: id, ...item, discoveredAt: now });
            }
            this.db.prepare("UPDATE research_subscriptions SET baseline_completed=1,last_checked_at=?,next_check_at=? WHERE id=?").run(now, next, id);
            this.db.exec("COMMIT");
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
        return { subscription: this.getSubscription(id), newItems: baselined ? [] : discovered, baselined, discoveredCount: discovered.length };
    }
    markRunNotified(runId, now) {
        return Number(this.db.prepare("UPDATE research_runs SET notification_sent_at=? WHERE id=? AND notification_sent_at IS NULL").run(now, runId).changes) > 0;
    }
    hydrateRun(row) {
        const id = String(row.id);
        return { id, projectId: String(row.project_id), depth: String(row.depth), summary: String(row.summary), methodology: text(row.methodology), materialChange: bool(row.material_change), changeSummary: text(row.change_summary), researchedAt: String(row.researched_at), nextResearchAt: text(row.next_research_at), notificationSentAt: text(row.notification_sent_at), sources: rows(this.db.prepare("SELECT * FROM research_sources WHERE run_id=? ORDER BY retrieved_at,id"), id).map((source) => this.mapSource(source)), findings: rows(this.db.prepare("SELECT * FROM research_findings WHERE run_id=? ORDER BY rowid"), id).map((finding) => this.mapFinding(finding)), artifacts: rows(this.db.prepare("SELECT * FROM research_artifacts WHERE run_id=? ORDER BY rowid"), id).map((artifact) => this.mapArtifact(artifact)) };
    }
    mapProject(row) { return { id: String(row.id), title: String(row.title), mode: String(row.mode), status: String(row.status), depth: String(row.depth), objective: String(row.objective), deliverable: text(row.deliverable), template: text(row.template), constraints: jsonStrings(row.constraints_json), preferredSources: jsonStrings(row.preferred_sources_json), excludedSources: jsonStrings(row.excluded_sources_json), notificationTarget: text(row.notification_target), refreshIntervalDays: row.refresh_interval_days == null ? undefined : Number(row.refresh_interval_days), lastResearchedAt: text(row.last_researched_at), nextResearchAt: text(row.next_research_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; }
    mapQuestion(row) { return { id: String(row.id), projectId: String(row.project_id), question: String(row.question), status: String(row.status), answer: text(row.answer), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; }
    mapSource(row) { return { id: String(row.id), runId: String(row.run_id), url: String(row.url), title: String(row.title), publisher: text(row.publisher), type: String(row.source_type), tier: String(row.tier), publishedAt: text(row.published_at), retrievedAt: String(row.retrieved_at), excerpt: text(row.excerpt), claim: text(row.claim) }; }
    mapFinding(row) { return { id: String(row.id), runId: String(row.run_id), kind: String(row.kind), title: String(row.title), detail: String(row.detail), confidence: String(row.confidence), sourceIds: jsonStrings(row.source_ids_json) }; }
    mapArtifact(row) { return { id: String(row.id), projectId: String(row.project_id), runId: text(row.run_id), type: String(row.artifact_type), title: String(row.title), contentMarkdown: String(row.content_markdown), version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; }
    mapDecision(row) { return { id: String(row.id), projectId: String(row.project_id), runId: text(row.run_id), decision: String(row.decision), rationale: String(row.rationale), status: String(row.status), createdAt: String(row.created_at) }; }
    mapSubscription(row) { return { id: String(row.id), projectId: String(row.project_id), url: String(row.url), type: String(row.subscription_type), label: text(row.label), enabled: bool(row.enabled), baselineComplete: bool(row.baseline_completed), checkIntervalHours: Number(row.check_interval_hours), lastCheckedAt: text(row.last_checked_at), nextCheckAt: String(row.next_check_at), createdAt: String(row.created_at) }; }
}
