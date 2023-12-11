import { BufferedTokenStream, ParseTree, Parser } from "antlr4ng";
import { Flavor } from "../flavor.js";

export interface FlavorAwareParser extends Parser {
  file(): ParseTree;
  isKeyword(tokenType: number): boolean;

  get flavor(): Flavor;
}
