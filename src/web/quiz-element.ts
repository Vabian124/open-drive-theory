// SPDX-License-Identifier: AGPL-3.0-only
import { createFsrsTracker, type FsrsTracker, type RuleMastery } from "../learning/fsrs_tracker.js";
import { narrateHazard, narratePosition } from "../narrator/explain.js";
import { withApproachMotion } from "../renderer/motion.js";
import type { RuleFile } from "../schema/rules.js";
import type { Category } from "../schema/scenario.js";
import {
  createQuizController,
  type QuizController,
  type QuizFeedback,
  type QuizMode,
  type QuizView,
} from "./controller.js";
import { QUIZ_SOURCE_URL } from "./source.js";

const RULE_TITLES: Record<string, string> = {
  "RVV-15.1": "Voorrang van rechts",
  "RVV-15.2a": "Onverharde weg",
  "RVV-15.2b": "Voorrang voor de tram",
  "RVV-18.1": "Rechtdoor op dezelfde weg",
  "RVV-18.2": "Korte bocht voor lange bocht",
  "RVV-54": "Uitrit",
  "RVV-SIGNS-B1-B7": "Borden en haaientanden",
  "RVV-49": "Voetgangersoversteekplaats",
  "RVV-50": "Voorrangsvoertuig",
  "RVV-16": "Militaire kolonne",
};

const LETTERS = ["A", "B", "C", "D"] as const;

let sharedRules: RuleFile | null = null;

export function setQuizRules(rules: RuleFile): void {
  sharedRules = rules;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function asCategory(value: string | null): Category {
  if (value === "AM" || value === "A" || value === "B") {
    return value;
  }
  return "B";
}

function asMode(value: string | null): QuizMode {
  return value === "random" ? "random" : "adaptive";
}

export class OpenDriveTheoryQuiz extends HTMLElement {
  private controller: QuizController | null = null;
  private tracker: FsrsTracker | null = null;
  private view: QuizView | null = null;
  private feedback: QuizFeedback | null = null;
  private rendering = false;
  private seedConsumed = false;

  static get observedAttributes(): string[] {
    return ["category", "mode", "seed"];
  }

  connectedCallback(): void {
    if (this.shadowRoot) {
      return;
    }
    if (!sharedRules) {
      throw new Error("setQuizRules() moet vóór het element worden aangeroepen.");
    }
    const shadow = this.attachShadow({ mode: "open" });
    shadow.addEventListener("click", (event: Event) => {
      this.onClick(event);
    });
    this.tracker = createFsrsTracker();
    this.controller = createQuizController({ rules: sharedRules, tracker: this.tracker });
    this.showQuestion();
  }

  attributeChangedCallback(name: string): void {
    if (this.rendering || !this.controller || !this.isConnected) {
      return;
    }
    if (name === "category" || name === "mode") {
      this.showQuestion();
    }
  }

  private takeSeed(): string | undefined {
    if (this.seedConsumed) {
      return undefined;
    }
    this.seedConsumed = true;
    const attribute = this.getAttribute("seed");
    if (attribute) {
      return attribute;
    }
    if (typeof location !== "undefined") {
      return new URLSearchParams(location.search).get("seed") ?? undefined;
    }
    return undefined;
  }

  private showQuestion(): void {
    if (!this.controller) {
      return;
    }
    this.rendering = true;
    try {
      const view = this.controller.start({
        category: asCategory(this.getAttribute("category")),
        mode: asMode(this.getAttribute("mode")),
        seed: this.takeSeed(),
      });
      if (this.getAttribute("category") !== view.category) {
        this.setAttribute("category", view.category);
      }
      this.view = view;
      this.feedback = null;
      this.paint();
    } catch (error) {
      const message = error instanceof Error ? error.message : "De vraag kon niet worden opgebouwd.";
      this.paintError(message);
    } finally {
      this.rendering = false;
    }
  }

  private onClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest("button");
    if (!button || !this.controller || !this.view) {
      return;
    }
    const category = button.dataset.category;
    if (category === "B" || category === "AM" || category === "A") {
      this.setAttribute("category", category);
      return;
    }
    const mode = button.dataset.mode;
    if (mode === "adaptive" || mode === "random") {
      this.setAttribute("mode", mode);
      return;
    }
    const optionId = button.dataset.option;
    if (optionId && !this.feedback) {
      this.feedback = this.controller.answer(optionId);
      this.paint();
      return;
    }
    const action = button.dataset.action;
    if (action === "next" && this.feedback) {
      this.rendering = true;
      try {
        this.view = this.controller.next();
        this.feedback = null;
        if (this.getAttribute("category") !== this.view.category) {
          this.setAttribute("category", this.view.category);
        }
        this.paint();
      } finally {
        this.rendering = false;
      }
      return;
    }
    if (action === "copy-seed") {
      void this.copy(this.view.seed, button, "Seed gekopieerd");
      return;
    }
    if (action === "scene" && this.view) {
      const host = this.shadowRoot?.querySelector("[data-scene]");
      const scenario = this.view.scenario;
      if (host instanceof HTMLElement) {
        host.hidden = false;
        host.textContent = "3D-aanzicht laden…";
        void import("./mount_3d.js")
          .then((mod) => {
            mod.mountScene(host, scenario);
          })
          .catch(() => {
            host.textContent = "Het 3D-aanzicht kon niet starten.";
          });
      }
      return;
    }
    if (action === "report") {
      const report = JSON.stringify(this.controller.bugReport(), null, 2);
      const slot = this.shadowRoot?.querySelector("[data-report]");
      if (slot) {
        slot.textContent = report;
        slot.removeAttribute("hidden");
      }
      void this.copy(report, button, "Rapport gekopieerd");
    }
  }

  private paint(): void {
    const view = this.view;
    const root = this.shadowRoot;
    const tracker = this.tracker;
    if (!view || !root || !tracker) {
      return;
    }
    const feedback = this.feedback;
    const hazard = narrateHazard(view.scenario);
    const position = narratePosition(view.scenario);
    const picture = hazard ? withApproachMotion(view.svg) : view.svg;
    const mastery = tracker.getRuleMastery();
    const focus = tracker.getNextFocusRule();
    const category = view.category;
    const mode = view.mode;
    root.innerHTML = `${style()}<div class="app">
      <header>
        <p class="eyebrow">Nederlandse verkeerstheorie</p>
        <h1>open-drive-theory</h1>
        <div class="controls" role="group" aria-label="Rijbewijscategorie">
          ${choice("category", "B", "Auto B", category === "B")}
          ${choice("category", "AM", "Bromfiets AM", category === "AM")}
          ${choice("category", "A", "Motor A", category === "A")}
        </div>
        <div class="controls" role="group" aria-label="Oefenmodus">
          ${choice("mode", "adaptive", "Adaptief op fouten", mode === "adaptive")}
          ${choice("mode", "random", "Willekeurig", mode === "random")}
        </div>
      </header>
      <figure class="drawing">${picture}</figure>
      ${studyBlock("hazard", "Gevaarherkenning", hazard)}
      ${studyBlock("position", "Positie op de weg", position)}
      <p class="question">${esc(view.question)}</p>
      <div class="options">${view.options
        .map((option, index) => optionButton(option.id, LETTERS[index] ?? String(index + 1), option.text, feedback))
        .join("")}</div>
      <section class="feedback" aria-live="polite"${feedback ? "" : " hidden"}>
        ${feedback ? feedbackBlock(feedback) : ""}
      </section>
      <p class="seed"><span>Seed</span> <code>${esc(view.seed)}</code>
        <button type="button" data-action="copy-seed">Kopieer</button></p>
      <section class="mastery">
        <h2>Regelbeheersing</h2>
        <ol>${mastery.map((item) => masteryItem(item, focus)).join("")}</ol>
      </section>
      <div class="actions">
        <button type="button" data-action="next"${feedback ? "" : " disabled"}>Volgende vraag</button>
        <button type="button" data-action="scene">3D-aanzicht</button>
        <button type="button" data-action="report">Meld twijfelgeval</button>
      </div>
      <div data-scene hidden></div>
      <pre data-report hidden></pre>
      <footer>
        Aangedreven door open-drive-theory (AGPL-3.0) — <a href="${esc(QUIZ_SOURCE_URL)}" target="_blank" rel="noopener noreferrer">Bekijk broncode</a>
      </footer>
    </div>`;
  }

  private paintError(message: string): void {
    const root = this.shadowRoot;
    if (!root) {
      return;
    }
    root.innerHTML = `${style()}<div class="app"><p class="question">${esc(message)}</p>
      <footer>Aangedreven door open-drive-theory (AGPL-3.0) — <a href="${esc(QUIZ_SOURCE_URL)}" target="_blank" rel="noopener noreferrer">Bekijk broncode</a></footer></div>`;
  }

  private async copy(text: string, button: HTMLButtonElement, doneLabel: string): Promise<void> {
    const original = button.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      this.shadowRoot?.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    button.textContent = doneLabel;
    window.setTimeout(() => {
      button.textContent = original;
    }, 1600);
  }
}

function choice(kind: "category" | "mode", value: string, label: string, pressed: boolean): string {
  const data = kind === "category" ? `data-category="${value}"` : `data-mode="${value}"`;
  return `<button type="button" ${data} aria-pressed="${pressed ? "true" : "false"}">${esc(label)}</button>`;
}

function optionButton(id: string, letter: string, text: string, feedback: QuizFeedback | null): string {
  let mark = "";
  if (feedback?.selectedOptionId === id && feedback.correct) {
    mark = " is-correct";
  } else if (feedback?.selectedOptionId === id) {
    mark = " is-wrong";
  } else if (feedback && feedback.correctOptionId === id) {
    mark = " is-correct";
  }
  const disabled = feedback ? " disabled" : "";
  return `<button type="button" class="option${mark}" data-option="${esc(id)}"${disabled}><span>${esc(letter)}</span>${esc(text)}</button>`;
}

function studyBlock(kind: string, title: string, narration: { question: string; options: readonly string[]; correctIndex: number; explanation: readonly string[] } | null): string {
  if (!narration) {
    return "";
  }
  const answer = narration.options[narration.correctIndex] ?? "";
  const lines = narration.explanation.map((line) => `<p>${esc(line)}</p>`).join("");
  return `<section class="study" data-study="${kind}"><h2>${esc(title)}</h2><p>${esc(narration.question)}</p><p class="study-answer">${esc(answer)}</p>${lines}</section>`;
}

function feedbackBlock(feedback: QuizFeedback): string {
  const rules = feedback.appliedRuleIds.length > 0 ? feedback.appliedRuleIds.join(", ") : "geen vrijgegeven regel";
  const lines = feedback.explanation.map((line) => `<p>${esc(line)}</p>`).join("");
  return `<h2>${feedback.correct ? "Goed." : "Niet goed."}</h2><p>Toegepaste regels: ${esc(rules)}</p>${lines}`;
}

function masteryItem(item: RuleMastery, focus: string): string {
  const width = Math.max(0, Math.min(100, Math.round(item.retrievability * 100)));
  const status = item.reps === 0 ? "nieuw" : `${item.misses} fout · ${width}%`;
  const current = item.ruleId === focus ? " is-next" : "";
  const title = RULE_TITLES[item.ruleId] ?? item.ruleId;
  return `<li class="${current.trim()}"><span class="rule">${esc(item.ruleId)}</span><span>${esc(title)}</span><span class="bar" aria-hidden="true"><i style="width:${width}%"></i></span><span class="status">${esc(status)}</span></li>`;
}

function style(): string {
  return `<style>
    :host { display: block; color: #1c1915; font-family: "Segoe UI", sans-serif; background: #f4f1ea; }
    .app { max-width: 920px; margin: 0 auto; padding: 20px 16px 28px; }
    .eyebrow { margin: 0; letter-spacing: 0.04em; text-transform: uppercase; font-size: 0.75rem; color: #6b6256; }
    h1 { margin: 4px 0 16px; font-size: 1.6rem; }
    h2 { margin: 0 0 8px; font-size: 1.05rem; }
    .controls { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
    button { font: inherit; cursor: pointer; }
    .controls button { border: 1px solid #c9bfb0; background: #fff; color: #1c1915; border-radius: 999px; padding: 8px 14px; }
    .controls button[aria-pressed="true"] { background: #1c1915; color: #f4f1ea; border-color: #1c1915; }
    .drawing { margin: 16px 0; background: #fff; border: 1px solid #ddd4c6; }
    .drawing svg { display: block; width: 100%; height: auto; }
    .study { margin: 12px 0; padding: 12px 14px; background: #fff; border-left: 4px solid #1d4e89; }
    .study-answer { font-weight: 700; }
    [data-scene] { margin: 12px 0; background: #fff; border: 1px solid #ddd4c6; }
    [data-scene] canvas { display: block; width: 100%; height: auto; }
    .question { font-size: 1.15rem; line-height: 1.45; }
    .options { display: grid; gap: 8px; }
    .option { display: flex; gap: 12px; align-items: flex-start; text-align: left; width: 100%; padding: 12px 14px; border: 1px solid #c9bfb0; background: #fff; border-radius: 8px; }
    .option span { flex: 0 0 auto; font-weight: 700; }
    .option.is-correct { border-color: #1f7a46; background: #e7f6ec; }
    .option.is-wrong { border-color: #a33b32; background: #fdeceb; }
    .feedback { margin-top: 16px; padding: 12px 14px; background: #fff; border-left: 4px solid #1c1915; }
    .feedback p { margin: 6px 0; line-height: 1.45; }
    .seed { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    code { background: #fff; padding: 2px 6px; border: 1px solid #ddd4c6; }
    .mastery { margin-top: 8px; }
    .mastery ol { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
    .mastery li { display: grid; grid-template-columns: minmax(8rem, 11rem) 1fr 5rem auto; gap: 8px; align-items: center; font-size: 0.92rem; }
    .mastery li.is-next .rule { font-weight: 700; }
    .bar { display: block; height: 8px; background: #e4dcd0; }
    .bar i { display: block; height: 100%; background: #2f6f4e; }
    .status { color: #6b6256; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
    .actions button { padding: 10px 14px; border-radius: 8px; border: 1px solid #1c1915; background: #1c1915; color: #f4f1ea; }
    .actions button[disabled] { opacity: 0.45; cursor: default; }
    .actions button[data-action="report"], .actions button[data-action="scene"] { background: #fff; color: #1c1915; }
    pre { white-space: pre-wrap; background: #fff; border: 1px solid #ddd4c6; padding: 12px; font-size: 0.8rem; }
    footer { display: block; margin-top: 20px; padding-top: 12px; border-top: 1px solid #c9bfb0; font-size: 0.95rem; }
    footer a { color: #1d4e89; }
    @media (max-width: 640px) {
      .mastery li { grid-template-columns: 1fr; }
    }
  </style>`;
}

export function defineQuiz(): void {
  if (typeof customElements === "undefined" || customElements.get("open-drive-theory-quiz")) {
    return;
  }
  customElements.define("open-drive-theory-quiz", OpenDriveTheoryQuiz);
}
