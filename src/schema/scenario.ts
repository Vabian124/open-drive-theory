// SPDX-License-Identifier: AGPL-3.0-only
import { z } from "zod";

export const IntersectionTypeSchema = z.enum(["four_way", "t_junction", "exit_construction", "roundabout"]);
export const SurfaceSchema = z.enum(["paved", "unpaved"]);
export const CurbTypeSchema = z.enum(["standard", "beveled"]);
export const CyclewaySchema = z.enum(["none", "lane", "track"]);
export const TurnSchema = z.enum(["straight", "right", "left"]);
export const SignCodeSchema = z.enum([
  "NL:B1",
  "NL:B3",
  "NL:B4",
  "NL:B5",
  "NL:B6",
  "NL:B7",
  "NL:G11",
  "NL:G12a",
]);
export const MarkingTypeSchema = z.enum([
  "give_way_triangles",
  "stop_line",
  "crosswalk",
  "continuous_line",
]);
export const TrafficLightsSchema = z.enum(["none", "active", "flashing_amber"]);
export const RoadConditionSchema = z.enum(["dry", "wet", "icy"]);
export const ObstructionTypeSchema = z.enum(["building", "parked_truck", "hedges"]);
export const ActorTypeSchema = z.enum([
  "car",
  "motorcycle",
  "moped",
  "tram",
  "cyclist",
  "pedestrian",
  "emergency",
  "military_column",
  "funeral_procession",
]);
export const SignalSchema = z.enum(["red", "amber", "green"]);
export const OfficerOrderSchema = z.enum(["stop", "go"]);
export const CategorySchema = z.enum(["B", "AM", "A"]);

export const ArmSchema = z
  .object({
    arm_id: z.string().min(1),
    angle_deg: z.number(),
    surface: SurfaceSchema,
    curb_type: CurbTypeSchema,
    cycleway: CyclewaySchema,
  })
  .strict();

export const ConnectorSchema = z
  .object({
    from_arm: z.string().min(1),
    to_arm: z.string().min(1),
    turn: TurnSchema,
  })
  .strict();

export const InfraSchema = z
  .object({
    intersection_type: IntersectionTypeSchema,
    arms: z.array(ArmSchema).min(2),
    connectors: z.array(ConnectorSchema),
  })
  .strict();

export const SignSchema = z
  .object({
    arm_id: z.string().min(1),
    code: SignCodeSchema,
    sub_sign: z.string().min(1).optional(),
  })
  .strict();

export const MarkingSchema = z
  .object({
    arm_id: z.string().min(1),
    type: MarkingTypeSchema,
  })
  .strict();

export const StaticSignsSchema = z
  .object({
    signs: z.array(SignSchema),
    markings: z.array(MarkingSchema),
  })
  .strict();

export const ObstructionSchema = z
  .object({
    type: ObstructionTypeSchema,
    near_arm: z.string().min(1),
  })
  .strict();

export const EnvironmentSchema = z
  .object({
    traffic_officer: z.boolean(),
    traffic_lights: TrafficLightsSchema,
    built_up_area: z.boolean(),
    road_condition: RoadConditionSchema,
    obstructions: z.array(ObstructionSchema),
  })
  .strict();

export const ActorSchema = z
  .object({
    id: z.string().min(1),
    type: ActorTypeSchema,
    from_arm: z.string().min(1),
    to_arm: z.string().min(1),
    speed_kmh: z.number().nonnegative(),
    is_candidate: z.boolean(),
    signal: SignalSchema.optional(),
    officer_order: OfficerOrderSchema.optional(),
  })
  .strict();

function knownArm(ids: Set<string>, armId: string): boolean {
  return ids.has(armId);
}

const ScenarioObjectSchema = z
  .object({
    infra: InfraSchema,
    static_signs: StaticSignsSchema,
    environment: EnvironmentSchema,
    actors: z.array(ActorSchema).min(1),
  })
  .strict();

function refineScenario(scenario: z.infer<typeof ScenarioObjectSchema>, ctx: z.RefinementCtx): void {
    const ids = new Set(scenario.infra.arms.map((arm) => arm.arm_id));
    if (ids.size !== scenario.infra.arms.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate arm_id", path: ["infra", "arms"] });
    }
    const actorIds = new Set(scenario.actors.map((actor) => actor.id));
    if (actorIds.size !== scenario.actors.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate actor id", path: ["actors"] });
    }
    if (scenario.actors.filter((actor) => actor.is_candidate).length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one actor must be the candidate",
        path: ["actors"],
      });
    }
    for (const [index, connector] of scenario.infra.connectors.entries()) {
      if (!knownArm(ids, connector.from_arm) || !knownArm(ids, connector.to_arm)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Connector references an unknown arm",
          path: ["infra", "connectors", index],
        });
      }
    }
    for (const [index, actor] of scenario.actors.entries()) {
      if (!knownArm(ids, actor.from_arm) || !knownArm(ids, actor.to_arm)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Actor references an unknown arm",
          path: ["actors", index],
        });
      }
    }
    for (const [index, sign] of scenario.static_signs.signs.entries()) {
      if (!knownArm(ids, sign.arm_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Sign references an unknown arm",
          path: ["static_signs", "signs", index],
        });
      }
    }
    for (const [index, marking] of scenario.static_signs.markings.entries()) {
      if (!knownArm(ids, marking.arm_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Marking references an unknown arm",
          path: ["static_signs", "markings", index],
        });
      }
    }
}

export const ScenarioSchema = ScenarioObjectSchema.superRefine(refineScenario);

export const ExpectedSchema = z
  .object({
    priority_order: z.array(z.string()),
    candidate_yields_to: z.array(z.string()),
    applied_rule_ids: z.array(z.string()),
  })
  .strict();

export const GoldenCaseSchema = ScenarioObjectSchema.extend({
  id: z.string().min(1),
  description: z.string(),
  category: CategorySchema,
  expected: ExpectedSchema,
}).superRefine(refineScenario);

export const GoldenFileSchema = z
  .object({
    cases: z.array(GoldenCaseSchema).min(1),
  })
  .strict();

export const EvaluationSchema = z
  .object({
    gaps: z.array(z.string()),
    priority_order: z.array(z.string()),
    candidate_yields_to: z.array(z.string()),
    applied_rule_ids: z.array(z.string()),
  })
  .strict();

export type Category = z.infer<typeof CategorySchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type Evaluation = z.infer<typeof EvaluationSchema>;
export type GoldenCase = z.infer<typeof GoldenCaseSchema>;
export type GoldenFile = z.infer<typeof GoldenFileSchema>;
export type Actor = z.infer<typeof ActorSchema>;
export type Arm = z.infer<typeof ArmSchema>;
