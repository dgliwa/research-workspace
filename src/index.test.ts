import { describe, expect, it } from "vitest";
import entry from "./index.js";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";

describe("research-workspace",()=>{
  it("declares the complete tool surface",()=>{
    expect(getToolPluginMetadata(entry)?.tools.map(tool=>tool.name)).toEqual([
      "research_project_add","research_project_update","research_project_status","research_due",
      "research_question_add","research_question_update","research_search","research_source_read","research_run_record",
      "research_artifact_update","research_decision_add","research_subscription_add",
      "research_subscription_list","research_subscription_remove","research_subscription_scan",
    ]);
  });
});
