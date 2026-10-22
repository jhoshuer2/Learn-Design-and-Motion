import { z } from "zod";

/** What the model returns. It contains NO overall score or pass/fail: the server computes those. */
export const criterionResult = z.object({
  criterionId: z.string().min(1), // the rubric criterion key
  score: z.number().int().min(0).max(100),
  evidence: z.string().min(10), // what is observable in the submitted work
  where: z.string().min(2), // where in the work it happens
  explanation: z.string().min(10), // why it matters
  principle: z.string().min(2), // the relevant design principle
  improvement: z.string().min(10), // how to improve
  verify: z.string().min(10), // how the learner can check the improvement worked
});

export const modelOutput = z
  .object({
    status: z.enum(["complete", "needs_evidence"]),
    missingEvidence: z.array(z.string()),
    criteria: z.array(criterionResult),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    missingRequirements: z.array(z.string()),
    criticalFailures: z.array(z.string()),
    confidence: z.enum(["high", "medium", "low"]),
    reviewFlag: z.boolean(),
  })
  .superRefine((o, ctx) => {
    if (o.status === "needs_evidence" && o.missingEvidence.length === 0) {
      ctx.addIssue({ code: "custom", message: "needs_evidence must say what evidence is missing" });
    }
    if (o.status === "complete" && o.criteria.length === 0) {
      ctx.addIssue({ code: "custom", message: "a complete evaluation must score the criteria" });
    }
  });

export type ModelOutput = z.infer<typeof modelOutput>;
export type CriterionResult = z.infer<typeof criterionResult>;

const str = { type: "string" };
const strs = { type: "array", items: str };

/** JSON Schema sent to the API as the structured-output format. The server still validates with zod above. */
export const MODEL_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "missingEvidence", "criteria", "strengths", "weaknesses", "missingRequirements", "criticalFailures", "confidence", "reviewFlag"],
  properties: {
    status: { type: "string", enum: ["complete", "needs_evidence"] },
    missingEvidence: strs,
    criteria: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["criterionId", "score", "evidence", "where", "explanation", "principle", "improvement", "verify"],
        properties: {
          criterionId: str, score: { type: "integer" }, evidence: str, where: str,
          explanation: str, principle: str, improvement: str, verify: str,
        },
      },
    },
    strengths: strs, weaknesses: strs, missingRequirements: strs, criticalFailures: strs,
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    reviewFlag: { type: "boolean" },
  },
} as const;
