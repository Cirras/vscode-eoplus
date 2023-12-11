import { ParseTree, TerminalNode, Token } from "antlr4ng";
import { Range } from "vscode-languageserver";

export function treeRange(tree: ParseTree): Range {
  if (tree instanceof TerminalNode) {
    return tokenRange(tree.symbol);
  }

  try {
    const { start } = treeRange(tree.getChild(0)!);
    const { end } = treeRange(tree.getChild(tree.getChildCount() - 1)!);

    return { start, end };
  } catch (e) {
    console.error(`error in treeRange(${tree.getText()})`);
    throw e;
  }
}

export function tokenRange(token: Token): Range {
  return Range.create(
    token.line - 1,
    token.column,
    token.line - 1,
    token.column + token.text!.length,
  );
}
