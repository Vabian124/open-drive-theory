// SPDX-License-Identifier: AGPL-3.0-only
declare module "*.yaml?raw" {
  const content: string;
  export default content;
}
