import { HomeApp } from "./home-app.js";
import { features } from "./features.js";

/**
 * The Biomonitor on its own: HP and wounds, critical injuries, the cyberware monitor, Humanity and
 * Syndromes, in a window of its own (it isn't part of the home, and isn't held back by downtime).
 */
export class BiomonitorApp extends HomeApp {
  static instance = null;
  static _opening = null;

  static APP_ID = "biomonitor";
  static TITLE = "NEONHOME.Bio.Title";
  static ICON = "fa-solid fa-heart-pulse";

  static DEFAULT_OPTIONS = {
    classes: ["nah-biomonitor-window"],
    position: { width: 1120, height: 820 }
  };

  static featureList() {
    return features().filter((f) => f.id === "biomonitor");
  }

  static defaultTab() {
    return "biomonitor";
  }
}

HomeApp.windows.push(BiomonitorApp);
