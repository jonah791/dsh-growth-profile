import { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
//#region src/client/index.d.ts
declare const inject: string[];
declare function apply(ctx: ClientContext): void;
//#endregion
export { apply, inject };