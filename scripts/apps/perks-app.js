import { HomeApp } from "./home-app.js";
import { features } from "./features.js";

/**
 * The Perk Tree on its own: a character's perks (Cyberpunk: The Unification Era, Chapter 16) as a
 * skill tree, with their Perk Points, in a window of its own.
 */
export class PerksApp extends HomeApp {
  static instance = null;
  static _opening = null;

  static APP_ID = "perks";
  static TITLE = "NEONHOME.Perks.Title";
  static ICON = "fa-solid fa-diagram-project";

  static DEFAULT_OPTIONS = {
    classes: ["nah-perks-window"],
    position: { width: 1240, height: 860 }
  };

  static featureList() {
    return features().filter((f) => f.id === "perks");
  }

  static defaultTab() {
    return "perks";
  }
}

HomeApp.windows.push(PerksApp);
