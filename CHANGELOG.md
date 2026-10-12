# Changelog

## 1.0.2

- **Fixed: Add Syndrome didn't open its window** on Foundry v12 (it read the dialog the v13 way).
- **The window can't get stuck "busy" any more.** After a change (like raising Catharsis) the window always comes back, it no longer redraws twice for one change, and a tab that fails says so instead of going blank (with the details in the console).
- **New body figure** for the Loadout and the Biomonitor: one clean outline with the neck joined to the shoulders, and no doubled upper body on the Biomonitor scan.
- **Loadout:** the figure has its own column, with the head, body, shield and hands slots stacked beside it on leader lines instead of covering it.

## 1.0.1

- **Fixed: the Home window didn't open** from the Token Controls button, the character sheet or the Actors sidebar. The window kept its tab state in a property Foundry's application class already reserves, which stopped it from being created.

## 1.0.0

First release: a home suite for each Cyberpunk RED character, opened from the character sheet.

- **Loadout.** Carry slots by worn armor class from the Armor & Carrying 2.0 homebrew (10 to 42), slot costs by kind (heavy weapons 4, two-handed 3, one-handed 2, ammo and gear 1), bonus slots from carry gear and armor upgrades, and a weight limit modelled on MMuton's Weight System. Equip, carry or store items; a home stash (a Cyberpunk RED container actor) and vehicle cargo as storage, with drag and drop. The GM chooses to show, warn or block going over.
- **Armor upgrades.** The spreadsheet's upgrades in a compendium, limited by armor class and location, installed into the upgrade slots each class gives. Worn upgrades keep an *armor fit* effect on the character (penalty relief, Plate Padding, War Paint, AI Armor Interface).
- **Carry gear.** Shoulder Holster, Weapon Sling, Carryall Bag, Trench Coat and Armored Trench Coat.
- **Vehicle Bay.** Bays from the parking of the character's Neon Hub home or household (or set by the GM); vehicle actors and vehicle items parked in them or on the street; the ride in use; HP, SP, speed, crew seats, mounted weapons, upgrades and cargo from MMuton's Vehicle Actor Sheet.
- **Biomonitor.** HP and wounds, armor, critical injuries, Humanity and EMP, and the Syndromes & Inspiration homebrew: Empathy tiers, the thirteen Syndromes and their Stressors (plus the GM's own and custom ones), dormant Syndromes and scars, Catharsis (gained on falling a tier, taking Humanity Loss first), Antipathy, In The System, a complete break, Inspiration and Intensive Therapy.
- **Weaponbench.** A weapon's attachment slots, its numbers with and without attachments, what each attachment does, attaching from the character or the stash, detaching (except fixed ones), and custom attachments.
- **Settings.** Carry & Weight Rules (every number from the spreadsheet, editable, with a reset), item settings for the GM on every item sheet, and an API for macros and new sub-features.
