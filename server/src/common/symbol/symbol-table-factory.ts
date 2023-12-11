import { SymbolTable } from "antlr4-c3";
import { AbstractParseTreeVisitor, ParseTree, TerminalNode } from "antlr4ng";
import { EOPlusParserVisitor as OfficialEOPlusParserVisitor } from "../antlr/generated/official/EOPlusParserVisitor.js";
import { EOPlusParserVisitor as EoservEOPlusParserVisitor } from "../antlr/generated/eoserv/EOPlusParserVisitor.js";
import {
  DescContext as OfficialDescContext,
  StateBlockContext as OfficialStateBlockContext,
} from "../antlr/generated/official/EOPlusParser.js";
import {
  DescContext as EoservDescContext,
  StateBlockContext as EoservStateBlockContext,
} from "../antlr/generated/eoserv/EOPlusParser.js";
import { StateSymbol } from "../symbol/state-symbol.js";
import { Flavor } from "../flavor.js";
import { ActionSymbol } from "./action-symbol.js";
import { Parameter } from "./parameter.js";
import { Type } from "./type.js";
import { RuleSymbol } from "./rule-symbol.js";

const EOSERV_STAT_NAMES: string = [
  "level",
  "exp",
  "str",
  "int",
  "wis",
  "agi",
  "con",
  "cha",
  "statpoints",
  "skillpoints",
  "admin",
  "gender",
  "hairstyle",
  "haircolor",
  "race",
  "guildrank",
  "karma",
  "class",
]
  .map((stat) => "`" + stat + "`")
  .join(", ");

const EOSERV_RPN_STAT_NAMES: string = [
  "npc",
  "level",
  "experience",
  "hp",
  "maxhp",
  "tp",
  "maxtp",
  "maxsp",
  "weight",
  "maxweight",
  "karma",
  "mindam",
  "maxdam",
  "damage",
  "critical",
  "str",
  "int",
  "wis",
  "agi",
  "con",
  "cha",
  "base_str",
  "base_int",
  "base_wis",
  "base_agi",
  "base_con",
  "base_cha",
  "display_str",
  "display_int",
  "display_wis",
  "display_agi",
  "display_con",
  "display_cha",
  "accuracy",
  "evade",
  "armor",
  "bot",
  "usage",
  "class",
  "gender",
  "race",
  "hairstyle",
  "haircolor",
  "mapid",
  "x",
  "y",
  "direction",
  "sitting",
  "hidden",
  "whispers",
  "goldbank",
  "statpoints",
  "skillpoints",
]
  .map((stat) => "`" + stat + "`")
  .join(", ");

export class SymbolTableFactory {
  private readonly flavor: Flavor;

  public constructor(flavor: Flavor) {
    this.flavor = flavor;
  }

  public create(file: ParseTree): SymbolTable {
    const symbolTable = this.createVisitor().visit(file) as SymbolTable;

    this.addActions(symbolTable);
    this.addRules(symbolTable);

    return symbolTable;
  }

  private createVisitor(): SymbolTableVisitor {
    switch (this.flavor) {
      case Flavor.OFFICIAL:
        return new OfficialSymbolTableVisitor();
      case Flavor.EOSERV:
        return new EoservSymbolTableVisitor();
      default:
        throw new Error(`Unhandled flavor: ${this.flavor}`);
    }
  }

  private addActions(symbolTable: SymbolTable): void {
    const actions = new Array<ActionSymbol>(
      action(
        "Reset",
        "Resets the quest to the `begin` state and removes the quest from the player's quest log.",
      ),
      action(
        "ResetDaily",
        "Resets the quest to the `begin` state and removes the quest from the player's quest log." +
          "\n\n" +
          "`ResetDaily` should be used when the player has completed a daily quest. It's used in" +
          " conjunction with the `DoneDaily` rule to track how many times a player has completed" +
          " the quest that day.",
      ),
      action(
        "End",
        "Removes the quest from the player's quest log." +
          "\n\n" +
          "`End` should be used when the player has completed the quest.",
      ),
      action(
        "AddNpcText",
        "Adds dialogue text to a specified quest NPC, which is displayed when the NPC is clicked.",
        param("behavior_id", Type.INTEGER, "The behavior ID of the quest NPC."),
        param("text", Type.STRING, "The dialogue text."),
      ),
      action(
        "AddNpcInput",
        "Adds a dialogue input to a specified quest NPC, which is displayed when the NPC is clicked.",
        param("behavior_id", Type.INTEGER, "The behavior ID of the quest NPC."),
        param(
          "input_id",
          Type.INTEGER,
          "The ID of the dialogue input, used in conjunction with the `InputNpc` rule.",
        ),
        param("text", Type.STRING, "The dialogue input text."),
      ),
      action(
        "ShowHint",
        "Displays a message to the player as a hint.",
        param(
          "message",
          Type.STRING,
          "The message to display to the player as a hint.",
        ),
      ),
      action(
        "Quake",
        "Plays the quake effect on the player's current map.",
        param(
          "intensity",
          Type.INTEGER,
          "The intensity of the quake effect. (range 1-8)",
          true,
        ),
      ),
      action(
        "SetMap",
        "Warps the player to the specified destination.",
        param("map", Type.INTEGER, "The destination map ID."),
        param("x", Type.INTEGER, "The destination X coordinate."),
        param("y", Type.INTEGER, "The destination Y coordinate."),
      ),
      action(
        "PlaySound",
        "Plays the specified sound effect for the player.",
        param(
          "sfx_id",
          Type.INTEGER,
          "The ID of the sound effect." +
            "\n\n" +
            "Corresponds to the number in the `sfx***.wav` filename in the client's `sfx` folder.",
        ),
      ),
      action(
        "GiveExp",
        "Increases the player's experience points by a specified amount.",
        param(
          "experience",
          Type.INTEGER,
          "The number of experience points to give to the player.",
        ),
      ),
      action(
        "GiveItem",
        "Adds an item to the player's inventory.",
        param(
          "item_id",
          Type.INTEGER,
          "The ID of the item to give to the player.",
        ),
        param(
          "amount",
          Type.INTEGER,
          "The number of items to give to the player.",
          true,
        ),
      ),
      action(
        "RemoveItem",
        "Removes an item from the player's inventory.",
        param(
          "item_id",
          Type.INTEGER,
          "The ID of the item to remove from the player.",
        ),
        param(
          "amount",
          Type.INTEGER,
          "The number of items to remove from the player.",
          true,
        ),
      ),
      action(
        "SetClass",
        "Changes the player's class.",
        param("class_id", Type.INTEGER, "The ID of the player's new class."),
      ),
      action(
        "RemoveKarma",
        "Decreases the player's karma points by a specified amount.",
        param(
          "karma",
          Type.INTEGER,
          "The number of karma points to remove from the player.",
        ),
      ),
      action(
        "GiveKarma",
        "Increases the player's karma points by a specified amount.",
        param(
          "karma",
          Type.INTEGER,
          "The number of karma points to give to the player.",
        ),
      ),
    );

    switch (this.flavor) {
      case Flavor.OFFICIAL:
        actions.push(
          action(
            "AddNpcChat",
            "Adds chat message to a specified quest NPC, which the NPC will occasionally say.",
            param(
              "behavior_id",
              Type.INTEGER,
              "The behavior ID of the quest NPC.",
            ),
            param("chat", Type.STRING, "The chat message for the NPC to say."),
          ),
        );
        break;

      case Flavor.EOSERV:
        actions.push(
          action(
            "SetState",
            "Sets this quest to a new quest state.",
            param("state", Type.STRING, "The name of the new quest state."),
          ),
          action(
            "StartQuest",
            "Starts the specified quest.",
            param("quest_id", Type.INTEGER, "The ID of the quest to start."),
            param(
              "state",
              Type.STRING,
              "The name of the quest state to start in.",
            ),
          ),
          action(
            "ResetQuest",
            "Resets the specified quest to the `begin` state and removes the quest from the" +
              " player's quest log.",
            param("quest_id", Type.INTEGER, "The ID of the quest to reset."),
          ),
          action(
            "SetQuestState",
            "Sets the specified quest to a new quest state.",
            param(
              "quest_id",
              Type.INTEGER,
              "The ID of the quest to set to a new quest state.",
            ),
            param("state", Type.STRING, "The name of the new quest state."),
          ),
          action(
            "AddNpcChat",
            "**Note:** `AddNpcChat` is not implemented in EOSERV." +
              "\n\n" +
              "Adds chat message to a specified quest NPC, which the NPC will occasionally say.",
            param(
              "behavior_id",
              Type.INTEGER,
              "The behavior ID of the quest NPC.",
            ),
            param("chat", Type.STRING, "The chat message for the NPC to say."),
          ),
          action(
            "QuakeWorld",
            "Plays the quake effect on every map in the game world.",
            param(
              "intensity",
              Type.INTEGER,
              "The intensity of the quake effect. (range 1-8)",
              true,
            ),
          ),
          action(
            "SetCoord",
            "Warps the player to the specified destination." +
              "\n\n" +
              "An alias to the `SetMap` action.",
            param("map", Type.INTEGER, "The destination map ID."),
            param("x", Type.INTEGER, "The destination X coordinate."),
            param("y", Type.INTEGER, "The destination Y coordinate."),
          ),
          action(
            "SetRace",
            "Changes the player's race.",
            param("race_id", Type.INTEGER, "The ID of the player's new race."),
          ),
          action(
            "SetTitle",
            "Changes the player's title.",
            param("title", Type.STRING, "The player's new title."),
          ),
          action(
            "SetFiance",
            "Changes the player's fiance.",
            param(
              "fiance",
              Type.STRING,
              "The name of the player's new fiance.",
            ),
          ),
          action(
            "SetPartner",
            "Changes the player's partner.",
            param(
              "partner",
              Type.STRING,
              "The name of the player's new partner.",
            ),
          ),
          action(
            "SetHome",
            "Changes the player's home.",
            param("home", Type.STRING, "The name of the player's new home."),
          ),
          action(
            "SetStat",
            "Changes the specified player stat to a new value.",
            param(
              "stat",
              Type.STRING,
              `The name of the stat to modify. Options are: ${EOSERV_STAT_NAMES}`,
            ),
            param("value", Type.STRING, "The new value of the stat."),
          ),
          action(
            "GiveStat",
            "Increases the specified player stat by a specified amount.",
            param(
              "stat",
              Type.STRING,
              `The name of the stat to increase. Options are: ${EOSERV_STAT_NAMES}`,
            ),
            param(
              "amount",
              Type.INTEGER,
              "The amount to increase the stat by.",
            ),
          ),
          action(
            "RemoveStat",
            "Decreases the specified player stat by a specified amount.",
            param(
              "stat",
              Type.STRING,
              `The name of the stat to decrease. Options are: ${EOSERV_STAT_NAMES}`,
            ),
            param(
              "amount",
              Type.INTEGER,
              "The amount to decrease the stat by.",
            ),
          ),
          action(
            "Roll",
            "Generates a random number between 1 and a specified maximum (inclusive), used in" +
              " conjunction with the `Rolled` rule.",
            param(
              "max",
              Type.INTEGER,
              "The largest number that can be rolled.",
            ),
          ),
        );
        break;

      default:
        throw new Error(`Unhandled flavor: ${this.flavor}`);
    }

    for (let action of actions) {
      symbolTable.addSymbol(action);
    }
  }

  private addRules(symbolTable: SymbolTable): void {
    const rules = new Array<RuleSymbol>(
      rule(
        "InputNpc",
        "Triggered when the player clicks a quest input with the specified `input_id`." +
          "\n\n" +
          "Used in conjunction with the `AddNpcInput` action.",
        param("input_id", Type.INTEGER, "The ID of the dialogue input."),
      ),
      rule(
        "TalkedToNpc",
        "Triggered after the player talks to a quest NPC with the specified `behavior_id`." +
          "\n\n" +
          "Used in conjunction with the `AddNpcText` action.",
        param("behavior_id", Type.INTEGER, "The behavior ID of the quest NPC."),
      ),
      rule(
        "Always",
        "Triggered unconditionally after the quest state's actions are completed.",
      ),
      rule(
        "DoneDaily",
        "Triggered if the player has completed the quest a specified number of times within the" +
          " last day.\n\n" +
          "Used in conjunction with the `ResetDaily` action.",
        param(
          "completions",
          Type.INTEGER,
          "The number of times that the player must complete the quest within a day.",
        ),
      ),
      rule(
        "EnterMap",
        "Triggered when the player enters the specified map.",
        param("map", Type.INTEGER, "The ID of the map that must be entered."),
      ),
      rule(
        "EnterCoord",
        "Triggered when the player enters the specified map coordinates.",
        param(
          "map",
          Type.INTEGER,
          "The ID of the map containing the specified coordinates.",
        ),
        param("x", Type.INTEGER, "The X coordinate that must be entered."),
        param("y", Type.INTEGER, "The Y coordinate that must be entered."),
      ),
      rule(
        "LeaveMap",
        "Triggered when the player leaves the specified map.",
        param("map", Type.INTEGER, "The ID of the map that must be left."),
      ),
      rule(
        "LeaveCoord",
        "Triggered when the player leaves the specified map coordinates.",
        param(
          "map",
          Type.INTEGER,
          "The ID of the map containing the specified coordinates.",
        ),
        param("x", Type.INTEGER, "The X coordinate that must be left."),
        param("y", Type.INTEGER, "The Y coordinate that must be left."),
      ),
      rule(
        "KilledNpcs",
        "Triggered when the player kills a specified NPC.",
        param("npc_id", Type.INTEGER, "The ID of the NPC that must be killed."),
        param(
          "amount",
          Type.INTEGER,
          "The number of NPCs that must be killed.",
          true,
        ),
      ),
      rule(
        "KilledPlayers",
        "Triggered when the player kills a player.",
        param(
          "amount",
          Type.INTEGER,
          "The number of players that must be killed.",
        ),
      ),
      rule(
        "GotItems",
        "Triggered when a specified item is in the player's inventory.",
        param(
          "item_id",
          Type.INTEGER,
          "The ID of the item that must be in the player's inventory.",
        ),
        param(
          "amount",
          Type.INTEGER,
          "The amount of the item that must be in the player's inventory.",
          true,
        ),
      ),
      rule(
        "LostItems",
        "Triggered when a specified item is not in the player's inventory.",
        param(
          "item_id",
          Type.INTEGER,
          "The ID of the item that must not be in the player's inventory.",
        ),
        param(
          "amount",
          Type.INTEGER,
          "The amount of the item that must not be in the player's inventory.",
          true,
        ),
      ),
    );

    switch (this.flavor) {
      case Flavor.OFFICIAL:
        // do nothing
        break;

      case Flavor.EOSERV:
        rules.push(
          rule(
            "UsedItem",
            "Triggered when a specified item is used.",
            param(
              "item_id",
              Type.INTEGER,
              "The ID of the item that must be used.",
            ),
            param(
              "amount",
              Type.INTEGER,
              "The number of times that the item must be used",
              true,
            ),
          ),
          rule(
            "IsGender",
            "Triggered if the player is the specified gender.",
            param(
              "gender_id",
              Type.INTEGER,
              "The ID of the gender that the player must be." +
                "\n\n" +
                "`0`: Female\n" +
                "`1`: Male",
            ),
          ),
          rule(
            "IsClass",
            "Triggered if the player is the specified class.",
            param(
              "class_id",
              Type.INTEGER,
              "The ID of the class that the player must be.",
            ),
          ),
          rule(
            "IsRace",
            "Triggered if the player is the specified race.",
            param(
              "race_id",
              Type.INTEGER,
              "The ID of the race that the player must be.",
            ),
          ),
          rule(
            "IsWearing",
            "Triggered if the player has the specified item equipped.",
            param(
              "item_id",
              Type.INTEGER,
              "The ID of the item that the player must be wearing.",
            ),
          ),
          rule(
            "GotSpell",
            "Triggered when a specified spell is known by the player.",
            param(
              "spell_id",
              Type.INTEGER,
              "The ID of the spell that must be known by the player.",
            ),
            param(
              "spell_level",
              Type.INTEGER,
              "The spell level requirement that must be met.",
              true,
            ),
          ),
          rule(
            "LostSpell",
            "Triggered when a specified spell is not known by the player.",
            param(
              "spell_id",
              Type.INTEGER,
              "The ID of the spell that must not be known by the player.",
            ),
          ),
          rule(
            "UsedSpell",
            "Triggered when a specified spell is used.",
            param(
              "spell_id",
              Type.INTEGER,
              "The ID of the spell that must be used.",
            ),
            param(
              "amount",
              Type.INTEGER,
              "The number of times that the spell must be used.",
              true,
            ),
          ),
          rule(
            "CitizenOf",
            "Triggered if the player is a citizen of the specified home.",
            param(
              "home",
              Type.STRING,
              "The name of the home that the player must be a citizen of.",
            ),
          ),
          rule(
            "Rolled",
            "Triggered when the `Roll` action generates the specified value.",
            param(
              "value",
              Type.INTEGER,
              "The value that the `Roll` action must generate.",
            ),
          ),
          rule(
            "StatIs",
            "Triggered when the specified player stat is the specified value.",
            param(
              "stat",
              Type.STRING,
              `The name of the stat. Options are: ${EOSERV_RPN_STAT_NAMES}`,
            ),
            param(
              "value",
              Type.INTEGER,
              "The value that the specified stat must be.",
            ),
          ),
          rule(
            "StatNot",
            "Triggered when the specified player stat is not the specified value.",
            param(
              "stat",
              Type.STRING,
              `The name of the stat. Options are: ${EOSERV_RPN_STAT_NAMES}`,
            ),
            param(
              "value",
              Type.INTEGER,
              "The value that the specified stat must not be.",
            ),
          ),
          rule(
            "StatGreater",
            "Triggered when the specified player stat is greater than the specified value.",
            param(
              "stat",
              Type.STRING,
              `The name of the stat. Options are: ${EOSERV_RPN_STAT_NAMES}`,
            ),
            param(
              "value",
              Type.INTEGER,
              "The value that the specified stat must be greater than.",
            ),
          ),
          rule(
            "StatLess",
            "Triggered when the specified player stat is less than the specified value.",
            param(
              "stat",
              Type.STRING,
              `The name of the stat. Options are: ${EOSERV_RPN_STAT_NAMES}`,
            ),
            param(
              "value",
              Type.INTEGER,
              "The value that the specified stat must be less than.",
            ),
          ),
          rule(
            "StatBetween",
            "Triggered when the specified player stat is between the specified values (inclusive).",
            param(
              "stat",
              Type.STRING,
              `The name of the stat. Options are: ${EOSERV_RPN_STAT_NAMES}`,
            ),
            param(
              "min",
              Type.INTEGER,
              "The value that the specified stat must be greater than or equal to.",
            ),
            param(
              "max",
              Type.INTEGER,
              "The value that the specified stat must be less than or equal to.",
            ),
          ),
          rule(
            "StatRpn",
            "Triggered when the specified rpn expression evaluates to true.",
            param(
              "expression",
              Type.STRING,
              "An expression in " +
                "[Reverse Polish notation](https://en.wikipedia.org/wiki/Reverse_Polish_notation)" +
                " that must evaluate to true." +
                "\n\n" +
                "Player stats may be referenced in the expression.\n" +
                ` Options are: ${EOSERV_RPN_STAT_NAMES}`,
            ),
          ),
        );
        break;

      default:
        throw new Error(`Unhandled flavor: ${this.flavor}`);
    }

    for (let rule of rules) {
      symbolTable.addSymbol(rule);
    }
  }
}

function action(
  name: string,
  documentation: string,
  ...parameters: Array<Parameter>
): ActionSymbol {
  return new ActionSymbol(name, documentation, parameters);
}

function rule(
  name: string,
  documentation: string,
  ...parameters: Array<Parameter>
): RuleSymbol {
  return new RuleSymbol(name, documentation, parameters);
}

function param(
  name: string,
  type: Type,
  documentation: string,
  optional: boolean = false,
) {
  return new Parameter(name, type, documentation, optional);
}

abstract class SymbolTableVisitor extends AbstractParseTreeVisitor<SymbolTable> {
  private readonly symbolTable = new SymbolTable("", {
    allowDuplicateSymbols: true,
  });
  private lastState: StateSymbol | null;

  protected defaultResult(): SymbolTable {
    return this.symbolTable;
  }

  protected newStateSymbol(context: ParseTree | null) {
    if (context === null) {
      this.lastState = null;
      return;
    }

    this.lastState = this.symbolTable.addNewSymbolOfType(
      StateSymbol,
      undefined,
      context.getText(),
    );

    this.lastState.context = context;
  }

  protected handleDesc(tree: ParseTree) {
    if (this.lastState && this.isStringLiteral(tree)) {
      this.lastState.desc = tree.getText();
    }
  }

  private isStringLiteral(tree: ParseTree): boolean {
    return tree instanceof TerminalNode && tree.getText().startsWith('"');
  }
}

class OfficialSymbolTableVisitor
  extends SymbolTableVisitor
  implements OfficialEOPlusParserVisitor<SymbolTable>
{
  visitStateBlock = (ctx: OfficialStateBlockContext) => {
    this.newStateSymbol(ctx.Identifier());
    return this.visitChildren(ctx) as SymbolTable;
  };

  visitDesc = (ctx: OfficialDescContext) => {
    this.handleDesc(ctx.StringLiteral());
    return this.visitChildren(ctx) as SymbolTable;
  };
}

class EoservSymbolTableVisitor
  extends SymbolTableVisitor
  implements EoservEOPlusParserVisitor<SymbolTable>
{
  visitStateBlock = (ctx: EoservStateBlockContext) => {
    this.newStateSymbol(ctx.Identifier());
    return this.visitChildren(ctx) as SymbolTable;
  };

  visitDesc = (ctx: EoservDescContext) => {
    this.handleDesc(ctx.StringLiteral());
    return this.visitChildren(ctx) as SymbolTable;
  };
}
