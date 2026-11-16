// SPDX-License-Identifier: AGPL-3.0-only
import { z } from "zod";

export const NarrationSchema = z
  .object({
    question: z.string().min(1),
    options: z.array(z.string().min(1)).length(4),
    correctIndex: z.number().int().min(0).max(3),
    explanation: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((narration, ctx) => {
    if (new Set(narration.options).size !== 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Answer options must be unique",
        path: ["options"],
      });
    }
  });

export type Narration = z.infer<typeof NarrationSchema>;
