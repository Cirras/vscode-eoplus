import { SymbolConstructor } from "antlr4-c3";
import {
  CharStream,
  ParseTree,
  Parser,
  ParserRuleContext,
  TerminalNode,
} from "antlr4ng";
import {
  MarkupKind,
  ParameterInformation,
  SignatureHelp,
  SignatureInformation,
} from "vscode-languageserver";
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
import { Parameter } from "../symbol/parameter.js";
import { caseInsensitiveEquals } from "../utils/string-utils.js";

export class SignatureHelpGenerator {
  private readonly flavor: Flavor;

  public constructor(flavor: Flavor) {
    this.flavor = flavor;
  }

  public generate(
    code: CharStream,
    caretPosition: CaretPosition,
  ): SignatureHelp | null {
    const parserFactory = new ParserFactory(this.flavor);
    const parser = parserFactory.create(code);
    const file = parser.file();

    const position = computeTokenPosition(
      file,
      parser.tokenStream,
      caretPosition,
    );

    if (!position) {
      return null;
    }

    let tree = this.findArgumentExpression(parser, position.context);

    if (
      tree instanceof ParserRuleContext &&
      parser.ruleNames[tree.ruleIndex] === "argumentList"
    ) {
      const child = tree.getChild(1);
      if (child === null) {
        return null;
      }
      tree = child;
    }

    if (!(tree.parent instanceof ParserRuleContext)) {
      return null;
    }

    let argumentListChild: ParseTree;
    if (
      tree.parent !== null &&
      parser.ruleNames[tree.parent.ruleIndex] === "arguments"
    ) {
      argumentListChild = tree.parent;
    } else {
      argumentListChild = tree;
    }

    let argumentList = argumentListChild.parent;

    if (!(argumentList instanceof ParserRuleContext)) {
      return null;
    }

    if (parser.ruleNames[argumentList.ruleIndex] !== "argumentList") {
      return null;
    }

    const paren = argumentList.getChild(argumentList.getChildCount() - 1);

    if (
      paren instanceof TerminalNode &&
      paren.getText() === ")" &&
      caretPosition.column > paren.symbol.column
    ) {
      return null;
    }

    const activeParameter = this.findActiveParameter(
      parser,
      caretPosition,
      tree,
      argumentListChild,
      argumentList,
    );

    const parent = argumentList.parent;
    if (!(parent instanceof ParserRuleContext)) {
      return null;
    }

    const nameIndex =
      (parent.children as Array<ParseTree>).indexOf(argumentList) - 1;

    const name = parent.getChild(nameIndex);
    if (name === null) {
      return null;
    }

    const helper = new ReferenceIdentificationHelper(parser);
    const referenceKind = helper.identify(name);

    switch (referenceKind) {
      case ReferenceKind.RULE:
        return this.createSignatureHelpFor(
          RuleSymbol,
          file,
          name.getText(),
          activeParameter,
        );
      case ReferenceKind.ACTION:
        return this.createSignatureHelpFor(
          ActionSymbol,
          file,
          name.getText(),
          activeParameter,
        );
      default:
        return null;
    }
  }

  private findActiveParameter(
    parser: Parser,
    caretPosition: CaretPosition,
    tree: ParseTree,
    argumentListChild: ParseTree,
    argumentList: ParseTree,
  ): number {
    if (
      argumentListChild.getText() === ")" &&
      argumentList.getChildCount() === 3
    ) {
      const argumentExpressions = argumentList.getChild(1) as ParseTree;
      let result = 0;
      let foundArgument = false;
      for (let i = 0; i < argumentExpressions.getChildCount(); ++i) {
        const child = argumentExpressions.getChild(i);
        if (foundArgument && child?.getText() === ",") {
          ++result;
          foundArgument = false;
        } else {
          foundArgument = child?.getText() !== ",";
        }
      }
      return result;
    }

    if (
      argumentListChild instanceof ParserRuleContext &&
      parser.ruleNames[argumentListChild.ruleIndex] === "arguments"
    ) {
      let result = 0;
      let foundArgument = false;
      for (let i = 0; i < argumentListChild.getChildCount(); ++i) {
        const child = argumentListChild.getChild(i);
        if (
          foundArgument &&
          child?.getText() === "," &&
          child instanceof TerminalNode &&
          child.symbol.column < caretPosition.column
        ) {
          ++result;
          foundArgument = false;
        } else {
          foundArgument = child?.getText() !== ",";
        }
        if (tree === child) {
          break;
        }
      }
      return result;
    }

    if (
      parser.ruleNames[(argumentListChild as ParserRuleContext).ruleIndex] ===
      "argumentList"
    ) {
      return 0;
    }

    return 0;
  }

  private findArgumentExpression(parser: Parser, tree: ParseTree): ParseTree {
    let result: ParseTree | null = tree;
    while (
      result !== null &&
      parser.ruleNames[(result as ParserRuleContext).ruleIndex] !==
        "argumentExpression"
    ) {
      result = result.parent;
    }
    return result ?? tree;
  }

  private createSignatureHelpFor<
    T extends InvocableSymbol,
    Args extends unknown[],
  >(
    type: SymbolConstructor<T, Args>,
    file: ParseTree,
    name: string,
    activeParameter: number,
  ): SignatureHelp | null {
    const symbolTable = new SymbolTableFactory(this.flavor).create(file);
    const symbols = symbolTable.getAllSymbolsSync(type, true);
    const symbol = symbols.find((s) => caseInsensitiveEquals(s.name, name));

    if (symbol) {
      return {
        signatures: [this.createSignatureInformation(symbol)],
        activeSignature: 0,
        activeParameter: activeParameter,
      };
    }

    return null;
  }

  private createSignatureInformation(
    symbol: InvocableSymbol,
  ): SignatureInformation {
    return {
      label:
        symbol.name +
        "(" +
        symbol.parameters.map((p) => p.signature).join(", ") +
        ")",
      documentation: {
        kind: MarkupKind.Markdown,
        value: symbol.documentation,
      },
      parameters: symbol.parameters.map((p) =>
        this.createParameterInformation(p),
      ),
    };
  }

  private createParameterInformation(
    parameter: Parameter,
  ): ParameterInformation {
    return {
      label: parameter.signature,
      documentation: {
        kind: MarkupKind.Markdown,
        value: parameter.documentation,
      },
    };
  }
}
