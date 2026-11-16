// SPDX-License-Identifier: AGPL-3.0-only
import { parse } from "yaml";
import rulesYaml from "../../rules/rvv_1990.example.yaml?raw";
import { RuleFileSchema } from "../schema/rules.js";
import { defineQuiz, setQuizRules } from "./quiz-element.js";

setQuizRules(RuleFileSchema.parse(parse(rulesYaml)));
defineQuiz();
