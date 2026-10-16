import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { sendDurableMessageBatch } from "openclaw/plugin-sdk/channel-outbound";
import type { ResearchDatabase } from "./persistence/db.js";
import type { ResearchProjectDetail } from "./types.js";

export function formatResearchNotification(detail:ResearchProjectDetail):string{
 const run=detail.latestRun;if(!run)throw new Error("Research project has no completed run.");
 const lines=[`🔬 **${detail.project.title}**`,"",run.summary];
 if(run.changeSummary)lines.push("",`**What changed:** ${run.changeSummary}`);
 const findings=run.findings.filter(f=>f.kind==="recommendation"||f.kind==="change"||f.kind==="risk").slice(0,4);
 if(findings.length){lines.push("","**Key findings**",...findings.map(f=>`- **${f.title}:** ${f.detail}`));}
 const links=run.sources.slice(0,5).map(source=>`[${source.title}](${source.url})`);
 if(links.length)lines.push("",`**Sources:** ${links.join(" · ")}`);
 return lines.join("\n");
}

export async function sendLatestResearchNotification(options:{
 database:ResearchDatabase;
 projectId:string;
 defaultTarget?:string;
 config:OpenClawConfig;
 signal?:AbortSignal;
 now?:()=>Date;
 durableSend?:typeof sendDurableMessageBatch;
}){
 const detail=options.database.getProjectDetail(options.projectId,(options.now??(()=>new Date()))().toISOString());
 if(!detail)throw new Error(`Unknown research project ${options.projectId}.`);
 const run=detail.latestRun;if(!run)throw new Error("Research project has no completed run.");
 if(run.notificationSentAt)return{status:"already_sent",target:detail.project.notificationTarget??options.defaultTarget,runId:run.id};
 if(detail.runCount>1&&!run.materialChange)return{status:"unchanged",target:detail.project.notificationTarget??options.defaultTarget,runId:run.id};
 const target=detail.project.notificationTarget??options.defaultTarget;
 if(!target)throw new Error("No project notification target or defaultDiscordTarget is configured.");
 let intentId:string|undefined;
 const result=await (options.durableSend??sendDurableMessageBatch)({
  cfg:options.config,channel:"discord",to:target,payloads:[{text:formatResearchNotification(detail)}],durability:"required",signal:options.signal,
  deliveryIntentId:`research-workspace:${run.id}`,reusePendingDeliveryIntent:true,maxRetries:6,
  completionRetention:{idPrefix:"research-workspace:",maxAgeMs:90*24*60*60_000,maxEntries:100_000},
  onDeliveryIntent:(intent)=>{intentId=intent.id;},
 });
 const delivered=result.status==="sent"||(result.status==="partial_failed"&&result.results.some(item=>item.messageId));
 if(delivered)options.database.markRunNotified(run.id,(options.now??(()=>new Date()))().toISOString());
 return{status:delivered?"sent":result.status,target,runId:run.id,deliveryIntentId:intentId};
}
