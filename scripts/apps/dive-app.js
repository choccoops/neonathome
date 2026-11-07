import { HomeApp } from "./home-app.js";
import { features } from "./features.js";

/**
 * The Deep Dive on its own: a netrunner under in a NET Architecture (Chapter 10), floor by floor,
 * and, for the GM, the Architect that rolls and edits architectures, in a window of its own.
 */
export class DiveApp extends HomeApp {
  static instance = null;
  static _opening = null;

  static APP_ID = "dive";
  static TITLE = "NEONHOME.Dive.Title";
  static ICON = "fa-solid fa-network-wired";

  static DEFAULT_OPTIONS = {
    classes: ["nah-dive-window"],
    position: { width: 1280, height: 880 }
  };

  static featureList() {
    return features().filter((f) => f.id === "dive");
  }

  static defaultTab() {
    return "dive";
  }
}

HomeApp.windows.push(DiveApp);
