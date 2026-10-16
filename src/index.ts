import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { sendLatestResearchNotification } from "./notification.js";
import { ResearchDatabase } from "./persistence/db.js";
import { resolveResearchDatabasePath } from "./persistence/path.js";
import { multiAngleSearch } from "./search.js";
import { readPublicSource } from "./source-reader.js";
import { ResearchService, researchInstructions } from "./service.js";
import {
  ARTIFACT_TYPES, CONFIDENCE_LEVELS, DECISION_STATUSES, FINDING_KINDS, PROJECT_MODES,
  PROJECT_STATUSES, QUESTION_STATUSES, RESEARCH_DEPTHS, SOURCE_TIERS, SOURCE_TYPES, SUBSCRIPTION_TYPES,
} from "./types.js";

const literalUnion=<T extends readonly string[]>(values:T)=>Type.Union(values.map(value=>Type.Literal(value)));
const projectModeSchema=literalUnion(PROJECT_MODES); const projectStatusSchema=literalUnion(PROJECT_STATUSES);
const depthSchema=literalUnion(RESEARCH_DEPTHS); const questionStatusSchema=literalUnion(QUESTION_STATUSES);
const sourceTierSchema=literalUnion(SOURCE_TIERS); const sourceTypeSchema=literalUnion(SOURCE_TYPES);
const findingKindSchema=literalUnion(FINDING_KINDS); const confidenceSchema=literalUnion(CONFIDENCE_LEVELS);
const artifactTypeSchema=literalUnion(ARTIFACT_TYPES); const decisionStatusSchema=literalUnion(DECISION_STATUSES);
const subscriptionTypeSchema=literalUnion(SUBSCRIPTION_TYPES);
const idSchema=Type.String({minLength:1,maxLength:100});
const nullableText=Type.Union([Type.String({minLength:1}),Type.Null()]);

function withService<T>(api:any,databasePath:string|undefined,operation:(service:ResearchService)=>T):T{
  const stateDir=api.runtime.state.resolveStateDir(process.env);
  const database=new ResearchDatabase(resolveResearchDatabasePath(stateDir,databasePath));
  try{return operation(new ResearchService(database));}finally{database.close();}
}

const plugin=defineToolPlugin({
  id:"research-workspace",
  name:"Research Workspace",
  description:"Execute and preserve evidence-backed one-shot and recurring research projects, living guides, plans, comparisons, and source watches.",
  configSchema:Type.Object({databasePath:Type.Optional(Type.String({description:"Absolute or OpenClaw-state-relative SQLite path."})),defaultDiscordTarget:Type.Optional(Type.String({pattern:"^channel:[0-9]{10,25}$",description:"Fallback Discord channel target for projects without a remembered request channel."}))},{additionalProperties:false}),
  tools:(tool)=>[
    tool({name:"research_project_add",description:"Create a durable one-shot research project or recurring watch. The OpenClaw agent executes the research; this project preserves its brief, evidence, runs, and artifacts.",parameters:Type.Object({
      title:Type.String({minLength:1,maxLength:500}),mode:Type.Optional(projectModeSchema),status:Type.Optional(projectStatusSchema),depth:Type.Optional(depthSchema),objective:Type.Optional(Type.String({minLength:1,maxLength:20_000})),deliverable:Type.Optional(Type.String({minLength:1,maxLength:20_000})),template:Type.Optional(Type.String({minLength:1,maxLength:200})),constraints:Type.Optional(Type.Array(Type.String({minLength:1,maxLength:2_000}),{maxItems:100})),preferredSources:Type.Optional(Type.Array(Type.String({minLength:1,maxLength:2_000}),{maxItems:100})),excludedSources:Type.Optional(Type.Array(Type.String({minLength:1,maxLength:2_000}),{maxItems:100})),notificationTarget:Type.Optional(Type.String({pattern:"^channel:[0-9]{10,25}$",description:"Discord request channel to remember for future research results. When called from Discord, use the current channel unless the user specifies another destination."})),refreshIntervalDays:Type.Optional(Type.Integer({minimum:1,maximum:3650})),questions:Type.Optional(Type.Array(Type.String({minLength:1,maxLength:2_000}),{maxItems:50})),
    },{additionalProperties:false}),execute:async(input,config,{api,signal})=>{signal?.throwIfAborted();return withService(api,config.databasePath,s=>{const detail=s.add(input);return{...detail,instructions:researchInstructions(detail)};});}}),

    tool({name:"research_project_update",description:"Correct a research brief, change depth or cadence, or pause, resume, complete, or archive it. History and artifacts remain preserved.",parameters:Type.Object({projectId:idSchema,title:Type.Optional(Type.String({minLength:1,maxLength:500})),mode:Type.Optional(projectModeSchema),status:Type.Optional(projectStatusSchema),depth:Type.Optional(depthSchema),objective:Type.Optional(Type.String({minLength:1,maxLength:20_000})),deliverable:Type.Optional(nullableText),template:Type.Optional(nullableText),constraints:Type.Optional(Type.Array(Type.String({minLength:1,maxLength:2_000}),{maxItems:100})),preferredSources:Type.Optional(Type.Array(Type.String({minLength:1,maxLength:2_000}),{maxItems:100})),excludedSources:Type.Optional(Type.Array(Type.String({minLength:1,maxLength:2_000}),{maxItems:100})),notificationTarget:Type.Optional(Type.Union([Type.String({pattern:"^channel:[0-9]{10,25}$"}),Type.Null()])),refreshIntervalDays:Type.Optional(Type.Union([Type.Integer({minimum:1,maximum:3650}),Type.Null()])),nextResearchAt:Type.Optional(nullableText)},{additionalProperties:false}),execute:async({projectId,...input},config,{api,signal})=>{signal?.throwIfAborted();return withService(api,config.databasePath,s=>s.update(projectId,input));}}),

    tool({name:"research_project_status",description:"Read one research project or list the workspace with briefs, open questions, latest evidence-backed run, versioned artifacts, decisions, subscriptions, and due state.",parameters:Type.Object({projectId:Type.Optional(idSchema),status:Type.Optional(projectStatusSchema),mode:Type.Optional(projectModeSchema),query:Type.Optional(Type.String({minLength:1})),dueOnly:Type.Optional(Type.Boolean({default:false})),limit:Type.Optional(Type.Integer({minimum:1,maximum:100,default:50}))},{additionalProperties:false}),execute:async({projectId,...options},config,{api,signal})=>{signal?.throwIfAborted();return withService(api,config.databasePath,s=>{if(projectId){const detail=s.status(projectId);return{...detail,instructions:researchInstructions(detail)};}return{projects:s.list(options)};});}}),

    tool({name:"research_due",description:"List active one-shot or recurring research projects whose next research pass is due. Paused and archived projects are excluded.",parameters:Type.Object({limit:Type.Optional(Type.Integer({minimum:1,maximum:100,default:20}))},{additionalProperties:false}),execute:async({limit},config,{api,signal})=>{signal?.throwIfAborted();return withService(api,config.databasePath,s=>({due:s.due(limit)}));}}),

    tool({name:"research_question_add",description:"Add a durable open question or missing constraint to a research project.",parameters:Type.Object({projectId:idSchema,question:Type.String({minLength:1,maxLength:2_000})},{additionalProperties:false}),execute:async({projectId,question},config,{api,signal})=>{signal?.throwIfAborted();return withService(api,config.databasePath,s=>s.addQuestion(projectId,question));}}),
    tool({name:"research_question_update",description:"Answer, block, dismiss, or reopen a research question while retaining it in project history.",parameters:Type.Object({questionId:idSchema,status:questionStatusSchema,answer:Type.Optional(Type.String({minLength:1,maxLength:20_000}))},{additionalProperties:false}),execute:async({questionId,status,answer},config,{api,signal})=>{signal?.throwIfAborted();return withService(api,config.databasePath,s=>s.updateQuestion(questionId,status,answer));}}),

    tool({name:"research_search",description:"Execute current multi-angle web searches for a research project. Follow with source reading and research_run_record; search snippets alone are not sufficient evidence.",parameters:Type.Object({projectId:idSchema,queries:Type.Optional(Type.Array(Type.String({minLength:1,maxLength:2_000}),{minItems:1,maxItems:10})),resultsPerQuery:Type.Optional(Type.Integer({minimum:1,maximum:20,default:8}))},{additionalProperties:false}),execute:async({projectId,queries,resultsPerQuery},config,{api,signal})=>{
      signal?.throwIfAborted();const detail=withService(api,config.databasePath,s=>s.status(projectId));const year=new Date().getUTCFullYear();
      const generated=[detail.project.objective,`${detail.project.objective} official documentation primary sources`,`${detail.project.objective} best practices ${year}`,`${detail.project.objective} independent analysis pitfalls`,...(detail.project.mode==="watch"?[`${detail.project.objective} latest changes updates ${year}`]:[]),...detail.project.preferredSources.map(source=>`${detail.project.objective} ${source}`)];
      const max={quick:3,standard:5,deep:8}[detail.project.depth];const selected=(queries?.map(q=>q.trim()).filter(Boolean)??generated).slice(0,max);
      const searched=await multiAngleSearch(({args,signal:searchSignal})=>api.runtime.webSearch.search({config:api.config,args,signal:searchSignal}),selected,resultsPerQuery??8,signal);
      return{project:detail.project,instructions:researchInstructions(detail),...searched};
    }}),

    tool({name:"research_source_read",description:"Fetch and extract bounded readable text from a public HTTPS research source using SSRF protection. Use this to verify important claims instead of relying only on search snippets.",parameters:Type.Object({url:Type.String({format:"uri"}),maxChars:Type.Optional(Type.Integer({minimum:1_000,maximum:50_000,default:20_000}))},{additionalProperties:false}),execute:async({url,maxChars},_config,{signal})=>readPublicSource(url,maxChars??20_000,signal)}),

    tool({name:"research_run_record",description:"Transactionally persist a completed research pass with cited sources, findings, material-change assessment, and versioned deliverables. Use source keys to connect findings to evidence.",parameters:Type.Object({
      projectId:idSchema,depth:Type.Optional(depthSchema),summary:Type.String({minLength:1,maxLength:20_000}),methodology:Type.Optional(Type.String({minLength:1,maxLength:10_000})),materialChange:Type.Boolean(),changeSummary:Type.Optional(Type.String({minLength:1,maxLength:5_000})),
      sources:Type.Array(Type.Object({key:Type.String({minLength:1,maxLength:100}),url:Type.String({format:"uri"}),title:Type.String({minLength:1,maxLength:1_000}),publisher:Type.Optional(Type.String({minLength:1,maxLength:500})),type:sourceTypeSchema,tier:sourceTierSchema,publishedAt:Type.Optional(Type.String()),excerpt:Type.Optional(Type.String({minLength:1,maxLength:10_000})),claim:Type.Optional(Type.String({minLength:1,maxLength:5_000}))},{additionalProperties:false}),{minItems:2,maxItems:100}),
      findings:Type.Array(Type.Object({kind:findingKindSchema,title:Type.String({minLength:1,maxLength:1_000}),detail:Type.String({minLength:1,maxLength:10_000}),confidence:confidenceSchema,sourceKeys:Type.Array(Type.String({minLength:1,maxLength:100}),{maxItems:50})},{additionalProperties:false}),{minItems:1,maxItems:100}),
      artifacts:Type.Array(Type.Object({type:artifactTypeSchema,title:Type.String({minLength:1,maxLength:1_000}),contentMarkdown:Type.String({minLength:1,maxLength:100_000})},{additionalProperties:false}),{minItems:1,maxItems:20}),
    },{additionalProperties:false}),execute:async({projectId,depth,...input},config,{api,signal})=>{signal?.throwIfAborted();return withService(api,config.databasePath,s=>{const project=s.status(projectId).project;return s.record(projectId,{...input,depth:depth??project.depth});});}}),

    tool({name:"research_notification_send",description:"Deliver the latest completed research result to the project's remembered Discord request channel, falling back to the configured general research channel. Initial runs and material changes are delivered once; unchanged recurring runs are suppressed.",parameters:Type.Object({projectId:idSchema},{additionalProperties:false}),execute:async({projectId},config,{api,signal})=>{
      const stateDir=api.runtime.state.resolveStateDir(process.env);const database=new ResearchDatabase(resolveResearchDatabasePath(stateDir,config.databasePath));
      try{return await sendLatestResearchNotification({database,projectId,defaultTarget:config.defaultDiscordTarget,config:api.config,signal});}finally{database.close();}
    }}),

    tool({name:"research_artifact_update",description:"Create a new immutable version of an existing research report, living guide, plan, decklist, bill of materials, or other artifact.",parameters:Type.Object({artifactId:idSchema,title:Type.Optional(Type.String({minLength:1,maxLength:1_000})),contentMarkdown:Type.String({minLength:1,maxLength:100_000})},{additionalProperties:false}),execute:async({artifactId,title,contentMarkdown},config,{api,signal})=>{signal?.throwIfAborted();return withService(api,config.databasePath,s=>s.updateArtifact(artifactId,title,contentMarkdown));}}),
    tool({name:"research_decision_add",description:"Record a proposed, accepted, rejected, or superseded decision and its rationale without rewriting research evidence.",parameters:Type.Object({projectId:idSchema,runId:Type.Optional(idSchema),decision:Type.String({minLength:1,maxLength:5_000}),rationale:Type.String({minLength:1,maxLength:10_000}),status:Type.Optional(decisionStatusSchema)},{additionalProperties:false}),execute:async({projectId,...input},config,{api,signal})=>{signal?.throwIfAborted();return withService(api,config.databasePath,s=>s.addDecision(projectId,input));}}),

    tool({name:"research_subscription_add",description:"Subscribe a recurring research watch to a credential-free RSS, Atom, web, or GitHub releases URL. Feed subscriptions can be scanned deterministically for new entries.",parameters:Type.Object({projectId:idSchema,url:Type.String({format:"uri"}),type:subscriptionTypeSchema,label:Type.Optional(Type.String({minLength:1,maxLength:500})),checkIntervalHours:Type.Optional(Type.Integer({minimum:1,maximum:8760,default:24})),enabled:Type.Optional(Type.Boolean({default:true}))},{additionalProperties:false}),execute:async({projectId,...input},config,{api,signal})=>{signal?.throwIfAborted();return withService(api,config.databasePath,s=>s.addSubscription(projectId,input));}}),
    tool({name:"research_subscription_list",description:"List exact source subscriptions for one research project or the whole workspace.",parameters:Type.Object({projectId:Type.Optional(idSchema)},{additionalProperties:false}),execute:async({projectId},config,{api,signal})=>{signal?.throwIfAborted();return withService(api,config.databasePath,s=>({subscriptions:s.subscriptions(projectId)}));}}),
    tool({name:"research_subscription_remove",description:"Remove a source subscription and its collected feed entries.",parameters:Type.Object({subscriptionId:idSchema},{additionalProperties:false}),execute:async({subscriptionId},config,{api,signal})=>{signal?.throwIfAborted();return withService(api,config.databasePath,s=>s.removeSubscription(subscriptionId));}}),
    tool({name:"research_subscription_scan",description:"Fetch due RSS or Atom subscriptions with SSRF protection, persist newly discovered entries, and return only new items for research triage.",parameters:Type.Object({subscriptionId:Type.Optional(idSchema),limit:Type.Optional(Type.Integer({minimum:1,maximum:100,default:20}))},{additionalProperties:false}),execute:async(input,config,{api,signal})=>{
      const stateDir=api.runtime.state.resolveStateDir(process.env);const database=new ResearchDatabase(resolveResearchDatabasePath(stateDir,config.databasePath));try{return await new ResearchService(database).scanSubscriptions(input,signal);}finally{database.close();}
    }}),
  ],
});

export default plugin;
