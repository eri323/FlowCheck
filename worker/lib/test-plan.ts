import { z } from "zod";

export const testStepActionSchema = z.enum([
  "goto",
  "click",
  "fill",
  "expect_visible",
  "expect_text",
  "expect_url",
]);

export type TestStepAction = z.infer<typeof testStepActionSchema>;

export const testStepSchema = z.object({
  action: testStepActionSchema,
  description: z.string().min(1).max(500),
  selector: z.string().max(500).optional(),
  value: z.string().max(2000).optional(),
});

export type TestStepDraft = z.infer<typeof testStepSchema>;

export const testCaseSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  steps: z.array(testStepSchema).min(1).max(50),
});

export type TestCaseDraft = z.infer<typeof testCaseSchema>;

export const testPlanSchema = z.object({
  test_cases: z.array(testCaseSchema).min(1).max(20),
});

export type TestPlan = z.infer<typeof testPlanSchema>;
