import * as vscode from "vscode";

export class FlavorService {
  private static INSTANCE: FlavorService;

  private static CHANGE_FLAVOR_COMMAND = "eoplus.changeFlavor";
  private static DEFAULT_FLAVOR = "EOSERV";

  private flavorStatusBarItem: vscode.StatusBarItem;
  private flavor: string;

  static init(context: vscode.ExtensionContext): void {
    FlavorService.INSTANCE = new FlavorService();
    FlavorService.INSTANCE.createFlavorStatusBarItem(context);
  }

  static get instance(): FlavorService {
    return FlavorService.INSTANCE;
  }

  createFlavorStatusBarItem(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        FlavorService.CHANGE_FLAVOR_COMMAND,
        () => {
          const quickPick = vscode.window.createQuickPick();
          quickPick.items = [
            {
              label: "Official",
              description: "Flavor used by classic Endless Online.",
            },
            {
              label: "EOSERV",
              description: "Flavor used by the EOSERV project.",
            },
          ];
          quickPick.activeItems = quickPick.items.filter(
            (item) => item.label === this.flavor,
          );
          quickPick.onDidChangeSelection(async () => {
            this.flavor = quickPick.selectedItems[0].label;
            await vscode.workspace
              .getConfiguration("eoplus")
              .update(
                "language.flavor",
                this.flavor,
                vscode.ConfigurationTarget.Global,
              );
            quickPick.hide();
          });

          quickPick.show();
        },
      ),
    );

    this.flavor = this.getFlavorFromConfiguration();
    this.flavorStatusBarItem = vscode.window.createStatusBarItem(
      "eoplus-flavor-status-bar-item",
      vscode.StatusBarAlignment.Left,
      0,
    );
    this.flavorStatusBarItem.tooltip =
      "Change the flavor of the EO+ scripting language";
    this.flavorStatusBarItem.command = FlavorService.CHANGE_FLAVOR_COMMAND;

    context.subscriptions.push(this.flavorStatusBarItem);

    this.updateFlavorStatusBarItem(vscode.window.activeTextEditor?.document);
  }

  updateFlavorStatusBarItem(textDocument?: vscode.TextDocument) {
    const languageId = textDocument?.languageId;
    if (languageId !== "eoplus") {
      this.flavorStatusBarItem.hide();
      return;
    }

    this.flavorStatusBarItem.text = `EO+ flavor: ${this.flavor}`;
    this.flavorStatusBarItem.show();
  }

  updateFlavorState() {
    this.flavor = this.getFlavorFromConfiguration();
    this.updateFlavorStatusBarItem(vscode.window.activeTextEditor?.document);
  }

  private getFlavorFromConfiguration() {
    return vscode.workspace
      .getConfiguration("eoplus")
      .get("language.flavor", FlavorService.DEFAULT_FLAVOR);
  }
}
