import { Context } from "@deepseek-ai/cordis";
//#region src/client/index.d.ts
declare const inject: string[];
declare function apply(ctx: Context): void;
//#endregion
export { apply, inject };