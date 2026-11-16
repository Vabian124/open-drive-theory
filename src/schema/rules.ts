// SPDX-License-Identifier: AGPL-3.0-only
import { z } from "zod";

export const RuleCardSchema = z
  .object({
    rank: z.number(),
    rule_id: z.string().min(1),
    topic: z.string().min(1),
    title: z.string().min(1),
    statutory_text_placeholder: z.string(),
    condition_spec: z.string(),
    overrides: z.array(z.string()),
    verified: z.boolean(),
    required_visual_cues: z.array(z.string()).optional(),
  })
  .strict();

export const RuleFileSchema = z
  .object({
    meta: z
      .object({
        jurisdiction: z.string(),
        source_law: z.string(),
        version: z.string(),
      })
      .strict(),
    hierarchy: z.array(RuleCardSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const ids = new Set<string>();
    for (const [index, card] of file.hierarchy.entries()) {
      if (ids.has(card.rule_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate rule_id ${card.rule_id}`,
          path: ["hierarchy", index, "rule_id"],
        });
      }
      ids.add(card.rule_id);
    }
  });

export type RuleCard = z.infer<typeof RuleCardSchema>;
export type RuleFile = z.infer<typeof RuleFileSchema>;
