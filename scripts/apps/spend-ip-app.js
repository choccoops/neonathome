import { HomeApp } from "./home-app.js";
import { features } from "./features.js";

/**
 * Spend IP on its own: a character's Skills, Role Abilities and Roles to buy with Improvement
 * Points (the "Spend IP" macro, Character Level Up 2.4.2), in a window of its own.
 */
export class SpendIPApp extends HomeApp {
  static instance = null;
  static _opening = null;

  static APP_ID = "spend-ip";
  static TITLE = "NEONHOME.IP.Title";
  static ICON = "fa-solid fa-angles-up";

  static DEFAULT_OPTIONS = {
    classes: ["nah-ip-window"],
    position: { width: 1080, height: 880 }
  };

  static featureList() {
    return features().filter((f) => f.id === "spendIp");
  }

  static defaultTab() {
    return "spendIp";
  }
}

HomeApp.windows.push(SpendIPApp);
