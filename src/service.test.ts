import { describe, expect, it } from "vitest";
import { ResearchDatabase } from "./persistence/db.js";
import { ResearchService } from "./service.js";

function source(key:string){return {key,url:`https://example.com/${key}`,title:`Source ${key}`,type:"official_docs" as const,tier:"primary" as const,claim:`Evidence ${key}`};}
function setup(initial="2026-10-15T12:00:00.000Z"){
  const database=new ResearchDatabase(":memory:");let now=initial;const clock=()=>new Date(now);return{database,service:new ResearchService(database,clock),advance(value:string){now=value;}};
}

describe("ResearchService",()=>{
  it("creates and completes a bounded one-shot project with cited artifacts",()=>{
    const {database,service}=setup();
    try{
      const created=service.add({title:"Home nitro cold brew setup",objective:"Design a safe home nitro cold brew setup under $500",questions:["How many servings per day?"],constraints:["Budget under $500"],notificationTarget:"channel:1560493947715850270"});
      expect(created).toMatchObject({due:true,project:{mode:"project",depth:"standard",status:"active",notificationTarget:"channel:1560493947715850270"}});
      expect(service.due()).toHaveLength(1);
      const question=service.updateQuestion(created.questions[0]!.id,"answered","Two servings per day.");
      expect(question.status).toBe("answered");
      const completed=service.record(created.project.id,{
        depth:"standard",summary:"A compact mini-keg system is the best fit.",methodology:"Compared official equipment documentation and sanitation guidance.",materialChange:true,changeSummary:"Initial recommendation.",
        sources:[source("a"),source("b"),source("c"),source("d")],
        findings:[{kind:"recommendation",title:"Use a mini-keg",detail:"It meets volume and budget constraints.",confidence:"high",sourceKeys:["a","b"]}],
        artifacts:[{type:"plan",title:"Nitro cold brew plan",contentMarkdown:"# Plan\n\nParts, sanitation, and operating steps."}],
      });
      expect(completed.project.status).toBe("completed");
      expect(completed.due).toBe(false);
      expect(completed.latestRun?.sources).toHaveLength(4);
      expect(completed.latestRun?.notificationSentAt).toBeUndefined();
      expect(database.markRunNotified(completed.latestRun!.id,"2026-10-15T12:05:00.000Z")).toBe(true);
      expect(service.status(created.project.id).latestRun?.notificationSentAt).toBe("2026-10-15T12:05:00.000Z");
      expect(completed.artifacts[0]).toMatchObject({type:"plan",version:1});
      const revised=service.updateArtifact(completed.artifacts[0]!.id,undefined,"# Revised plan");
      expect(revised.version).toBe(2);
    }finally{database.close();}
  });

  it("validates and can clear remembered notification channels",()=>{
    const {database,service}=setup();
    try{
      const project=service.add({title:"Coffee research",notificationTarget:"channel:1560493947715850270"});
      expect(service.update(project.project.id,{notificationTarget:null}).project.notificationTarget).toBeUndefined();
      expect(()=>service.add({title:"Bad target",notificationTarget:"general"})).toThrow(/channel:<id>/);
    }finally{database.close();}
  });

  it("keeps watch projects active and schedules recurring refreshes",()=>{
    const {database,service,advance}=setup();
    try{
      const project=service.add({title:"AI development best practices",mode:"watch",depth:"quick",refreshIntervalDays:7,preferredSources:["official model provider release notes","established practitioner blogs"]});
      const refreshed=service.record(project.project.id,{depth:"quick",summary:"Weekly synthesis.",materialChange:false,sources:[source("a"),source("b")],findings:[{kind:"claim",title:"No material architecture change",detail:"Current guidance remains supported.",confidence:"medium",sourceKeys:["a","b"]}],artifacts:[{type:"digest",title:"Weekly AI development digest",contentMarkdown:"# No material changes"}]});
      expect(refreshed.project).toMatchObject({status:"active",nextResearchAt:"2026-10-22T12:00:00.000Z"});
      expect(service.due()).toEqual([]);
      advance("2026-10-22T12:00:01.000Z");
      expect(service.due()).toHaveLength(1);
      const paused=service.update(project.project.id,{status:"paused"});
      expect(paused.due).toBe(false);
    }finally{database.close();}
  });

  it("validates evidence minimums and source references",()=>{
    const {database,service}=setup();
    try{
      const project=service.add({title:"DIY workbench",depth:"standard"});
      expect(()=>service.record(project.project.id,{depth:"standard",summary:"Too shallow",materialChange:true,sources:[source("a")],findings:[{kind:"recommendation",title:"Build it",detail:"Insufficient evidence",confidence:"low",sourceKeys:["missing"]}],artifacts:[{type:"plan",title:"Plan",contentMarkdown:"# Plan"}]})).toThrow("at least 4 sources");
    }finally{database.close();}
  });

  it("stores source subscriptions and deduplicates discovered entries",()=>{
    const {database,service}=setup();
    try{
      const project=service.add({title:"AI engineering blogs",mode:"watch",depth:"quick"});
      const subscription=service.addSubscription(project.project.id,{url:"https://example.com/feed.xml",type:"rss",label:"Example feed"});
      const first=database.completeSubscriptionScan(subscription.id,[{guid:"post-1",url:"https://example.com/post-1",title:"Post one"}],"2026-10-15T12:00:00.000Z");
      const second=database.completeSubscriptionScan(subscription.id,[{guid:"post-1",url:"https://example.com/post-1",title:"Post one"},{guid:"post-2",url:"https://example.com/post-2",title:"Post two"}],"2026-10-16T12:00:00.000Z");
      expect(first).toMatchObject({baselined:true,discoveredCount:1,newItems:[]});
      expect(second.newItems).toHaveLength(1); expect(second.newItems[0]?.title).toBe("Post two");
    }finally{database.close();}
  });
});
