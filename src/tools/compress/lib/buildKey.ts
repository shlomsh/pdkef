/** The state a build depends on, with the file's number so a new file never reuses an old result. */
export const buildKey = (fileSeq: number, level: string, targetKB: number, flatten: boolean) => `${fileSeq}|${level}|${targetKB}|${flatten}`;
