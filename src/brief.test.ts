import { describe, expect, it } from "vitest";
import { ResearchDatabase } from "./persistence/db.js";
import { ResearchService, researchInstructions } from "./service.js";

describe("research brief", () => {
  it("persists locked decision criteria and emits bounded recommendation guidance", () => {
    const database = new ResearchDatabase(":memory:");
    try {
      const service = new ResearchService(database, () => new Date("2026-10-19T12:00:00.000Z"));
      const detail = service.add({
        title: "Compact espresso scale",
        decision: "Choose one scale for a stock Gaggia drip tray",
        budget: "Under $100",
        fitConstraints: ["Height under 20 mm", "0.1 g resolution"],
        evidenceStandard: "Verify dimensions with manufacturers and corroborate usability independently.",
      });
      expect(detail.project).toMatchObject({
        decision: "Choose one scale for a stock Gaggia drip tray",
        budget: "Under $100",
        fitConstraints: ["Height under 20 mm", "0.1 g resolution"],
      });
      const instructions = researchInstructions(detail).join("\n");
      expect(instructions).toContain("Treat these four brief fields as locked");
      expect(instructions).toContain("one recommendation, no more than two credible alternatives");
      expect(instructions).toContain("verified fit, likely fit, or unverified candidate");
    } finally {
      database.close();
    }
  });
});
