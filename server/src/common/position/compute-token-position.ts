import { CaretPosition, TokenPosition } from "./position.js";
import {
  ParseTree,
  ErrorNode,
  TerminalNode,
  ParserRuleContext,
  Token,
  TokenStream,
  RuleContext,
} from "antlr4ng";

export function computeTokenPosition(
  parseTree: ParseTree,
  tokens: TokenStream,
  caretPosition: CaretPosition,
): TokenPosition | null {
  if (parseTree instanceof TerminalNode) {
    return computeTokenPositionOfTerminal(parseTree, caretPosition);
  } else {
    return computeTokenPositionOfChildNode(
      parseTree as ParserRuleContext,
      tokens,
      caretPosition,
    );
  }
}

function positionOfToken(
  token: Token,
  text: string,
  caretPosition: CaretPosition,
  parseTree: ParseTree,
): TokenPosition | null {
  let start = token.column;
  let stop = token.column + text.length;
  if (
    token.line == caretPosition.line &&
    start <= caretPosition.column &&
    stop >= caretPosition.column
  ) {
    return {
      index: token.tokenIndex,
      context: parseTree,
      text: text.substring(0, caretPosition.column - start),
    };
  } else {
    return null;
  }
}

function computeTokenPositionOfTerminal(
  parseTree: TerminalNode,
  caretPosition: CaretPosition,
): TokenPosition | null {
  let token = parseTree.symbol;
  let text = parseTree.getText();
  return positionOfToken(token, text, caretPosition, parseTree);
}

function computeTokenPositionOfChildNode(
  parseTree: ParserRuleContext,
  tokens: TokenStream,
  caretPosition: CaretPosition,
): TokenPosition | null {
  if (
    (parseTree.start && parseTree.start.line > caretPosition.line) ||
    (parseTree.stop && parseTree.stop.line < caretPosition.line)
  ) {
    return null;
  }

  for (let i = 0; i < parseTree.getChildCount(); i++) {
    let child = parseTree.getChild(i) as RuleContext;

    if (child instanceof ErrorNode && child.symbol.tokenIndex === -1) {
      continue;
    }

    let position = computeTokenPosition(
      parseTree.getChild(i) as RuleContext,
      tokens,
      caretPosition,
    );

    if (position) {
      return position;
    }
  }

  if (parseTree.start && parseTree.stop) {
    const startIndex = parseTree.start.tokenIndex;
    const stopIndex = parseTree.stop.tokenIndex;
    for (let i = startIndex; i <= stopIndex; i++) {
      let position = positionOfToken(
        tokens.get(i),
        tokens.get(i).text ?? "",
        caretPosition,
        parseTree,
      );

      if (position) {
        return position;
      }
    }
  }

  return null;
}
