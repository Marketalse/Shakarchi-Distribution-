/** Classify only explicit master-data tokens, never infer a type from the brand. */
export function catalogMode(line:string){return line.match(/(?:^|[\s_-])(DTL|MTL)(?:$|[\s_-])/i)?.[1]?.toUpperCase()||''}
