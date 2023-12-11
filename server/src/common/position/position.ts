import { ParseTree } from "antlr4ng";

export type CaretPosition = { line: number; column: number };
export type TokenPosition = { index: number; context: ParseTree; text: string };
