import { CharStream, ParseTree, Parser, ParserRuleContext } from "antlr4ng";
import { DocumentSymbol, SymbolKind } from "vscode-languageserver";
import { Flavor } from "../flavor.js";
import { ParserFactory } from "../parser/parser-factory.js";
import { SymbolTableFactory } from "../symbol/symbol-table-factory.js";
import { StateSymbol } from "../symbol/state-symbol.js";
import { treeRange } from "../utils/range-utils.js";

export class DocumentSymbolGenerator {
  private readonly flavor: Flavor;

  constructor(flavor: Flavor) {
    this.flavor = flavor;
  }

  generate(code: CharStream): DocumentSymbol[] {
    const parser = new ParserFactory(this.flavor).create(code);
    const file = parser.file();
    const symbolTable = new SymbolTableFactory(this.flavor).create(file);

    const result = new Array<DocumentSymbol>();

    const mainBlock = this.findMainBlock(parser, file);
    if (mainBlock) {
      result.push({
        name: "main",
        kind: SymbolKind.Module,
        range: treeRange(mainBlock),
        selectionRange: treeRange(mainBlock.getChild(0)!),
      });
    }

    result.push(
      ...symbolTable.getNestedSymbolsOfTypeSync(StateSymbol).map((symbol) => {
        return {
          name: symbol.name,
          detail: symbol.desc ?? undefined,
          kind: SymbolKind.Module,
          range: treeRange(symbol.context!.parent!),
          selectionRange: treeRange(symbol.context!),
        };
      }),
    );

    return result;
  }

  private findMainBlock(
    parser: Parser,
    file: ParseTree,
  ): ParserRuleContext | null {
    for (let i = 0; i < file.getChildCount(); ++i) {
      const block = file.getChild(i);
      if (this.isRule(parser, block, "block")) {
        const mainBlock = block!.getChild(0);
        if (this.isRule(parser, mainBlock, "mainBlock")) {
          return mainBlock as ParserRuleContext;
        }
      }
    }
    return null;
  }

  private isRule(
    parser: Parser,
    tree: ParseTree | null,
    ruleName: string,
  ): boolean {
    return (
      tree instanceof ParserRuleContext &&
      parser.ruleNames[tree.ruleIndex] === ruleName
    );
  }
}
