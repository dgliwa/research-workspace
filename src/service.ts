import type { ResearchDatabase, RecordRunInput, UpdateProjectRecord } from "./persistence/db.js";
import { fetchFeed } from "./subscriptions/feed.js";
import type {
  ProjectMode, ProjectStatus, QuestionStatus, ResearchDepth, ResearchProjectDetail,
  SubscriptionType,
} from "./types.js";

export class ResearchValidationError extends Error {}

function required(value: string, label: string, max=20_000): string {
  const normalized=value.trim();
  if(!normalized) throw new ResearchValidationError(`${label} cannot be blank.`);
  if(normalized.length>max) throw new ResearchValidationError(`${label} must be at most ${max} characters.`);
  return normalized;
}
function unique(values: readonly string[] | undefined, label: string, maxItems=100): string[] {
  if(!values) return [];
  if(values.length>maxItems) throw new ResearchValidationError(`${label} can contain at most ${maxItems} values.`);
  const result:string[]=[]; const seen=new Set<string>();
  for(const input of values){ const item=required(input,label,2_000); const key=item.toLowerCase(); if(!seen.has(key)){seen.add(key);result.push(item);} }
  return result;
}
function credentialFreeUrl(input: string): string {
  let url:URL; try{url=new URL(input);}catch{throw new ResearchValidationError("URL must be an absolute HTTP(S) URL.");}
  if(!["http:","https:"].includes(url.protocol) || url.username || url.password) throw new ResearchValidationError("URL must be credential-free HTTP(S).");
  url.hash=""; return url.toString();
}
function optionalIso(input: string | null | undefined, label: string): string | null | undefined {
  if(input===null || input===undefined) return input;
  const date=new Date(input); if(Number.isNaN(date.getTime())) throw new ResearchValidationError(`${label} must be an ISO timestamp.`);
  return date.toISOString();
}
function notificationTarget(input: string | null | undefined): string | null | undefined {
  if(input===null || input===undefined) return input;
  const target=input.trim();
  if(!/^channel:\d{10,25}$/.test(target)) throw new ResearchValidationError("notificationTarget must use Discord channel:<id> format.");
  return target;
}

export interface AddProjectInput {
  title: string; mode?: ProjectMode; status?: ProjectStatus; depth?: ResearchDepth; objective?: string;
  decision?: string; budget?: string; fitConstraints?: string[]; evidenceStandard?: string;
  deliverable?: string; template?: string; constraints?: string[]; preferredSources?: string[];
  excludedSources?: string[]; notificationTarget?: string; refreshIntervalDays?: number; questions?: string[];
}

export class ResearchService {
  constructor(private readonly database: ResearchDatabase, private readonly clock:()=>Date=()=>new Date()) {}
  private now():string{return this.clock().toISOString();}

  add(input:AddProjectInput):ResearchProjectDetail {
    const now=this.now(); const mode=input.mode ?? "project"; const status=input.status ?? "active";
    const refresh=input.refreshIntervalDays ?? (mode==="watch" ? 7 : undefined);
    return this.database.createProject({
      title:required(input.title,"title",500), mode, status, depth:input.depth ?? "standard",
      objective:required(input.objective ?? input.title,"objective"),
      decision:required(input.decision ?? input.objective ?? input.title,"decision"),
      budget:input.budget?required(input.budget,"budget",2_000):undefined,
      fitConstraints:unique(input.fitConstraints ?? input.constraints,"fitConstraints"),
      evidenceStandard:required(input.evidenceStandard ?? "Use primary or established sources for consequential claims; separate documented facts, measurements, practitioner opinion, and uncertainty.","evidenceStandard",5_000),
      deliverable:input.deliverable?required(input.deliverable,"deliverable"):undefined,
      template:input.template?required(input.template,"template",200):undefined,
      constraints:unique(input.constraints,"constraints"), preferredSources:unique(input.preferredSources,"preferredSources"),
      excludedSources:unique(input.excludedSources,"excludedSources"), notificationTarget:notificationTarget(input.notificationTarget)??undefined, refreshIntervalDays:refresh,
      nextResearchAt:status==="active"?now:undefined, questions:unique(input.questions,"questions",50),
    },now);
  }

  update(id:string,input:UpdateProjectRecord):ResearchProjectDetail {
    const normalized:UpdateProjectRecord={...input};
    if(input.title!==undefined) normalized.title=required(input.title,"title",500);
    if(input.objective!==undefined) normalized.objective=required(input.objective,"objective");
    if(input.decision!==undefined) normalized.decision=required(input.decision,"decision");
    if(typeof input.budget==="string") normalized.budget=required(input.budget,"budget",2_000);
    if(input.fitConstraints) normalized.fitConstraints=unique(input.fitConstraints,"fitConstraints");
    if(input.evidenceStandard!==undefined) normalized.evidenceStandard=required(input.evidenceStandard,"evidenceStandard",5_000);
    if(typeof input.deliverable==="string") normalized.deliverable=required(input.deliverable,"deliverable");
    if(typeof input.template==="string") normalized.template=required(input.template,"template",200);
    if(input.constraints) normalized.constraints=unique(input.constraints,"constraints");
    if(input.preferredSources) normalized.preferredSources=unique(input.preferredSources,"preferredSources");
    if(input.excludedSources) normalized.excludedSources=unique(input.excludedSources,"excludedSources");
    normalized.notificationTarget=notificationTarget(input.notificationTarget);
    normalized.nextResearchAt=optionalIso(input.nextResearchAt,"nextResearchAt");
    if(input.status==="active" && input.nextResearchAt===undefined){ const current=this.status(id); if(current.project.status!=="active") normalized.nextResearchAt=this.now(); }
    const result=this.database.updateProject(id,normalized,this.now()); if(!result) throw new ResearchValidationError(`Unknown research project ${id}.`); return result;
  }

  status(id:string):ResearchProjectDetail { const result=this.database.getProjectDetail(id,this.now()); if(!result) throw new ResearchValidationError(`Unknown research project ${id}.`); return result; }
  list(options:{status?:ProjectStatus;mode?:ProjectMode;query?:string;dueOnly?:boolean;limit?:number}={}):ResearchProjectDetail[]{
    const now=this.now(); return this.database.listProjects({status:options.status ?? (options.dueOnly?"active":undefined),mode:options.mode,query:options.query?.trim(),dueBefore:options.dueOnly?now:undefined,limit:options.limit ?? 50},now);
  }
  due(limit=20):ResearchProjectDetail[]{return this.list({status:"active",dueOnly:true,limit});}

  addQuestion(projectId:string,question:string){this.status(projectId);return this.database.addQuestion(projectId,required(question,"question",2_000),this.now());}
  updateQuestion(questionId:string,status:QuestionStatus,answer?:string){const result=this.database.updateQuestion(questionId,status,answer?required(answer,"answer"):undefined,this.now());if(!result)throw new ResearchValidationError(`Unknown research question ${questionId}.`);return result;}

  record(projectId:string,input:RecordRunInput):ResearchProjectDetail {
    const project=this.status(projectId).project;
    const keys=new Set<string>();
    const sources=input.sources.map((source)=>{
      const key=required(source.key,"source key",100); if(keys.has(key))throw new ResearchValidationError(`Duplicate source key ${key}.`); keys.add(key);
      return {...source,key,url:credentialFreeUrl(source.url),title:required(source.title,"source title",1_000),publisher:source.publisher?required(source.publisher,"publisher",500):undefined,excerpt:source.excerpt?required(source.excerpt,"excerpt",10_000):undefined,claim:source.claim?required(source.claim,"claim",5_000):undefined};
    });
    const minimum={quick:2,standard:4,deep:8}[input.depth];
    if(sources.length<minimum) throw new ResearchValidationError(`${input.depth} research requires at least ${minimum} sources.`);
    if(input.findings.length===0)throw new ResearchValidationError("A research run requires at least one finding.");
    if(input.artifacts.length===0)throw new ResearchValidationError("A research run requires at least one artifact.");
    const findings=input.findings.map((finding)=>{
      const sourceKeys=unique(finding.sourceKeys,"finding source keys",50); for(const key of sourceKeys)if(!keys.has(key))throw new ResearchValidationError(`Finding references unknown source key ${key}.`);
      if(finding.kind!=="open_question" && sourceKeys.length===0)throw new ResearchValidationError(`Finding ${finding.title} requires source evidence.`);
      return {...finding,title:required(finding.title,"finding title",1_000),detail:required(finding.detail,"finding detail",10_000),sourceKeys};
    });
    const artifacts=input.artifacts.map((artifact)=>({...artifact,title:required(artifact.title,"artifact title",1_000),contentMarkdown:required(artifact.contentMarkdown,"artifact content",100_000)}));
    return this.database.recordRun(projectId,{...input,depth:input.depth ?? project.depth,summary:required(input.summary,"summary",20_000),methodology:input.methodology?required(input.methodology,"methodology",10_000):undefined,changeSummary:input.changeSummary?required(input.changeSummary,"changeSummary",5_000):undefined,sources,findings,artifacts},this.now());
  }

  updateArtifact(artifactId:string,title:string|undefined,contentMarkdown:string){const result=this.database.updateArtifact(artifactId,title?required(title,"title",1_000):undefined,required(contentMarkdown,"contentMarkdown",100_000),this.now());if(!result)throw new ResearchValidationError(`Unknown research artifact ${artifactId}.`);return result;}
  addDecision(projectId:string,input:{runId?:string;decision:string;rationale:string;status?:"proposed"|"accepted"|"rejected"|"superseded"}){this.status(projectId);return this.database.addDecision(projectId,input.runId,required(input.decision,"decision",5_000),required(input.rationale,"rationale",10_000),input.status ?? "proposed",this.now());}

  addSubscription(projectId:string,input:{url:string;type:SubscriptionType;label?:string;checkIntervalHours?:number;enabled?:boolean}){this.status(projectId);return this.database.addSubscription(projectId,{url:credentialFreeUrl(input.url),type:input.type,label:input.label?required(input.label,"label",500):undefined,checkIntervalHours:input.checkIntervalHours ?? 24,enabled:input.enabled ?? true},this.now());}
  removeSubscription(id:string){if(!this.database.removeSubscription(id))throw new ResearchValidationError(`Unknown research subscription ${id}.`);return {removed:true,id};}
  subscriptions(projectId?:string){if(projectId)this.status(projectId);return this.database.listSubscriptions(projectId);}
  async scanSubscriptions(input:{subscriptionId?:string;limit?:number},signal?:AbortSignal){
    const now=this.now(); const targets=input.subscriptionId ? [this.database.getSubscription(input.subscriptionId)].filter(Boolean) : this.database.dueSubscriptions(now,input.limit ?? 20);
    const results=[];
    for(const target of targets){
      if(!target)continue; signal?.throwIfAborted();
      try{const feed=await fetchFeed(target.url,signal);const stored=this.database.completeSubscriptionScan(target.id,feed.items,now);results.push({subscription:stored.subscription,feedTitle:feed.title,finalUrl:feed.finalUrl,newItems:stored.newItems,baselined:stored.baselined,discoveredCount:stored.discoveredCount,error:undefined});}
      catch(error){results.push({subscription:target,newItems:[],error:error instanceof Error?error.message:String(error)});}
    }
    return {checked:results.length,results};
  }
}

export function researchInstructions(detail:ResearchProjectDetail):string[] {
  const sourceCount={quick:"5-10",standard:"10-25",deep:"25-60"}[detail.project.depth];
  const fit = detail.project.fitConstraints.length ? detail.project.fitConstraints.join("; ") : "No explicit fit constraints recorded; do not invent them.";
  return [
    `Decision to support: ${detail.project.decision}`,
    `Budget: ${detail.project.budget ?? "Not specified; do not assume a price ceiling."}`,
    `Fit constraints: ${fit}`,
    `Evidence standard: ${detail.project.evidenceStandard}`,
    "Treat these four brief fields as locked. If a missing answer would materially change the recommendation, add one concise open question before exhaustive research instead of guessing.",
    `Execute ${detail.project.depth} research using roughly ${sourceCount} substantive sources when available.`,
    "Prefer primary sources, official documentation, repositories, papers, independent reviews, and established practitioners.",
    "Grade candidates as verified fit, likely fit, or unverified candidate; never collapse uncertainty into a recommendation.",
    "Distinguish documented facts, measurements, practitioner opinion, and unresolved uncertainty. Open important sources; do not synthesize solely from search snippets.",
    "Default deliverable: one recommendation, no more than two credible alternatives, the principal caveat, and concise confidence labels unless the project explicitly requests a broader comparison.",
    "Record sources, evidence-backed findings, and at least one versioned artifact with research_run_record.",
    detail.project.mode==="watch" ? "Compare against the prior run and report only material changes." : "Answer the bounded decision and preserve unresolved questions; do not convert a one-shot project into a watch unless explicitly requested.",
  ];
}
