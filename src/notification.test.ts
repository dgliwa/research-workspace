import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { sendLatestResearchNotification } from "./notification.js";
import { ResearchDatabase } from "./persistence/db.js";
import { ResearchService } from "./service.js";

const source=(key:string)=>({key,url:`https://example.com/${key}`,title:`Source ${key}`,type:"official_docs" as const,tier:"primary" as const});
function completed(database:ResearchDatabase,target?:string){
 const service=new ResearchService(database,()=>new Date("2026-10-15T12:00:00.000Z"));
 const project=service.add({title:"Coffee research",depth:"quick",notificationTarget:target});
 return service.record(project.project.id,{depth:"quick",summary:"A compact scale is the best fit.",materialChange:true,changeSummary:"Initial recommendation.",sources:[source("a"),source("b")],findings:[{kind:"recommendation",title:"Use compact scale",detail:"It fits the available space.",confidence:"high",sourceKeys:["a"]}],artifacts:[{type:"report",title:"Scale report",contentMarkdown:"# Report"}]});
}
describe("research notifications",()=>{
 it("delivers once to the remembered request channel",async()=>{
  const database=new ResearchDatabase(":memory:");
  try{
   const detail=completed(database,"channel:123456789012345678");
   const send=vi.fn(async(input:any)=>{input.onDeliveryIntent?.({id:"intent-1"});return{status:"sent",results:[{channel:"discord",messageId:"message-1"}]};});
   const first=await sendLatestResearchNotification({database,projectId:detail.project.id,defaultTarget:"channel:999999999999999999",config:{} as OpenClawConfig,durableSend:send as any,now:()=>new Date("2026-10-15T12:05:00.000Z")});
   const second=await sendLatestResearchNotification({database,projectId:detail.project.id,defaultTarget:"channel:999999999999999999",config:{} as OpenClawConfig,durableSend:send as any});
   expect(first).toMatchObject({status:"sent",target:"channel:123456789012345678"});
   expect(send.mock.calls[0]?.[0]).toMatchObject({to:"channel:123456789012345678",deliveryIntentId:`research-workspace:${detail.latestRun!.id}`});
   expect(second.status).toBe("already_sent");
   expect(send).toHaveBeenCalledTimes(1);
  }finally{database.close();}
 });
});
