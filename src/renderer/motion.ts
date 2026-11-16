// SPDX-License-Identifier: AGPL-3.0-only

/** Five-second approach. The drawing stays the same scenario; only the motion is added. */
export function withApproachMotion(svg: string): string {
  const motion = `<style>@keyframes odt-approach{from{opacity:.4}to{opacity:1}}[data-layer="actors"]{animation:odt-approach 5s linear 1}@media (prefers-reduced-motion:reduce){[data-layer="actors"]{animation:none}}</style>`;
  return svg
    .replace("<svg ", '<svg data-hazard-seconds="5" ')
    .replace("</svg>", `${motion}</svg>`);
}
