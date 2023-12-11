import { ParseTree, ParserRuleContext } from "antlr4ng";
import { FlavorAwareParser } from "../parser/flavor-aware-parser.js";
import { ReferenceKind } from "./reference-kind.js";
import { Flavor } from "../flavor.js";

export class ReferenceIdentificationHelper {
  private readonly parser: FlavorAwareParser;

  constructor(parser: FlavorAwareParser) {
    this.parser = parser;
  }

  identify(tree: ParseTree): ReferenceKind | null {
    switch (this.parser.flavor) {
      case Flavor.OFFICIAL:
        return this.identifyOfficial(tree);
      case Flavor.EOSERV:
        return this.identifyEoserv(tree);
      default:
        throw new Error(`Unhandled flavor: ${this.parser.flavor}`);
    }
  }

  private identifyOfficial(tree: ParseTree): ReferenceKind | null {
    const parent = tree.parent;
    const parentName = this.ruleName(parent);

    switch (parentName) {
      case "rule": {
        if (this.childIndex(tree) == 1) {
          return ReferenceKind.RULE;
        }

        if (
          this.childIndex(tree) === 4 &&
          parent?.getChild(3)?.getText().toLowerCase() === "goto"
        ) {
          return ReferenceKind.STATE;
        }

        break;
      }

      case "action": {
        if (this.childIndex(tree) == 1) {
          return ReferenceKind.ACTION;
        }
        break;
      }
    }

    return null;
  }

  private identifyEoserv(tree: ParseTree): ReferenceKind | null {
    const parent = tree.parent;
    const parentName = this.ruleName(parent);

    switch (parentName) {
      case "invocationExpression":
        return this.identifyInvocationExpression(parent as ParseTree);

      case "gotoExpression":
        return this.identifyGotoExpression(tree, parent as ParseTree);
    }

    return null;
  }

  private identifyInvocationExpression(
    invocationExpression: ParseTree,
  ): ReferenceKind | null {
    const expression = invocationExpression.parent;

    if (expression && this.childIndex(invocationExpression) === 0) {
      const ruleName = this.ruleName(expression.parent);
      switch (ruleName) {
        case "rule":
        case "goal":
        case "if":
        case "elseif":
          switch (this.childIndex(expression)) {
            case 1:
              return ReferenceKind.RULE;
            case 2:
              return ReferenceKind.ACTION;
            default:
              return null;
          }
        case "action":
        case "else":
          if (this.childIndex(expression) === 1) {
            return ReferenceKind.ACTION;
          }
      }
    }

    return null;
  }

  private identifyGotoExpression(
    tree: ParseTree,
    gotoExpression: ParseTree,
  ): ReferenceKind | null {
    const childCount = gotoExpression.getChildCount();

    if (
      this.childIndex(tree) === childCount - 1 &&
      gotoExpression
        .getChild(childCount - 2)
        ?.getText()
        .toLowerCase() === "goto"
    ) {
      return ReferenceKind.STATE;
    }

    return null;
  }

  private ruleName(tree: ParseTree | null): string | null {
    if (tree instanceof ParserRuleContext) {
      return this.parser.ruleNames[tree.ruleIndex] ?? null;
    }
    return null;
  }

  private childIndex(tree: ParseTree | null): number | null {
    if (tree != null && tree.parent instanceof ParserRuleContext) {
      return (tree.parent.children as Array<ParseTree>).indexOf(tree);
    }
    return null;
  }
}
