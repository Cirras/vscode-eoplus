import { BaseSymbol, SymbolConstructor } from "antlr4-c3";
import {
  CharStream,
  ParseTree,
  ParserRuleContext,
  TerminalNode,
} from "antlr4ng";
import { Hover, MarkupKind } from "vscode-languageserver";
import { Flavor } from "../flavor.js";
import { SymbolTableFactory } from "../symbol/symbol-table-factory.js";
import { CaretPosition } from "../position/position.js";
import { ParserFactory } from "../parser/parser-factory.js";
import { computeTokenPosition } from "../position/compute-token-position.js";
import { ReferenceIdentificationHelper } from "../reference/reference-identification-helper.js";
import { ReferenceKind } from "../reference/reference-kind.js";
import { RuleSymbol } from "../symbol/rule-symbol.js";
import { ActionSymbol } from "../symbol/action-symbol.js";
import { InvocableSymbol } from "../symbol/invocable-symbol.js";
import { caseInsensitiveEquals } from "../utils/string-utils.js";
import { StateSymbol } from "../symbol/state-symbol.js";
import { FlavorAwareParser } from "../parser/flavor-aware-parser.js";

export class HoverGenerator {
  private readonly flavor: Flavor;
  private parser: FlavorAwareParser;

  public constructor(flavor: Flavor) {
    this.flavor = flavor;
  }

  public generate(
    code: CharStream,
    caretPosition: CaretPosition,
  ): Hover | null {
    const parserFactory = new ParserFactory(this.flavor);
    this.parser = parserFactory.create(code);
    const file = this.parser.file();

    const position = computeTokenPosition(
      file,
      this.parser.tokenStream,
      caretPosition,
    );

    if (!position) {
      return null;
    }

    let tree = position.context;

    if (this.isStateNameDeclaration(tree)) {
      return this.createHoverFor(StateSymbol, file, "state", tree.getText());
    }

    const helper = new ReferenceIdentificationHelper(this.parser);
    const referenceKind = helper.identify(tree);

    switch (referenceKind) {
      case ReferenceKind.RULE:
        return this.createHoverFor(RuleSymbol, file, "rule", tree.getText());
      case ReferenceKind.ACTION:
        return this.createHoverFor(
          ActionSymbol,
          file,
          "action",
          tree.getText(),
        );
      case ReferenceKind.STATE:
        return this.createHoverFor(StateSymbol, file, "state", tree.getText());
      default:
        return null;
    }
  }

  private isStateNameDeclaration(tree: ParseTree): boolean {
    const vocabulary = this.parser.vocabulary;
    return (
      tree instanceof TerminalNode &&
      vocabulary.getSymbolicName(tree.symbol.type) === "Identifier" &&
      tree.parent instanceof ParserRuleContext &&
      this.parser.ruleNames[tree.parent.ruleIndex] === "stateBlock"
    );
  }

  private createHoverFor<T extends BaseSymbol, Args extends unknown[]>(
    type: SymbolConstructor<T, Args>,
    file: ParseTree,
    kind: string,
    name: string,
  ): Hover | null {
    const symbolTable = new SymbolTableFactory(this.flavor).create(file);
    const symbols = symbolTable.getAllSymbolsSync(type, true);
    const symbol = symbols.find((s) => caseInsensitiveEquals(s.name, name));

    if (symbol) {
      let value = `(${kind}) ${symbol.name}`;

      if (symbol instanceof InvocableSymbol) {
        value += `(${symbol.parameters.map((p) => p.signature).join(", ")})`;
      }

      value = "```\n" + value + "\n```";

      if (symbol instanceof StateSymbol && symbol.desc) {
        value += "\n```\n" + symbol.desc + "\n```";
      }

      if (symbol instanceof InvocableSymbol) {
        value += "\n---\n";
        value += symbol.documentation;
        for (let param of symbol.parameters) {
          value += "\n\n";
          value += "`" + param.name + "`";
          if (param.optional) {
            value += " *(optional)*";
          }
          value += "  \n";
          value += param.documentation;
        }
      }

      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: value,
        },
      };
    }

    return null;
  }
}
