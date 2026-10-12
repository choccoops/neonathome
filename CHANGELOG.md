# Changelog

## 1.2.0

- **Carry slots are a hard limit.** Carrying or equipping something that would go past a character's carry slots is stopped with a pop-up saying what doesn't fit and why, in the Loadout and with the Cyberpunk RED sheet's equip toggle. The GM's pop-up can carry it anyway. Things arriving on a character (bought, looted, dropped on the sheet) aren't refused, so nothing paid for is lost; the pop-up says they're over. Fitting an upgrade or attachment from the stash isn't stopped by full slots, since it costs nothing once installed. The setting still offers warn or off.
- **Encumbrance.** Over the weight limit MOVE is halved (rounded down, at least 1); over double the limit MOVE is 1 and the GM may call for checks. It's an effect on the character that follows the load, applied after other effects, and the player and GM are told in chat when it changes. The Loadout shows it under the weight bar; the GM can turn it off in the Weight rules.
- **Lifestyle items are left out of the Loadout.** Neon Hub's lifestyle items (Kibble, apartments, memberships, transit...) are monthly expenses, not things you carry: they no longer take carry slots, weigh nothing, and don't appear on you, on the shelf or in storage, even when equipped.
- **Clearer carry bar.** One bar with a tick per slot, filled in colour by kind (weapons, ammo, gear...), with a key of how many slots each kind uses, how many are free, and how many over (with a mark where the slots end). Bonus slots (holster, ammo bag) get the same smaller bar.

## 1.1.0

- **Trauma map on the Biomonitor.** Each critical injury is marked where it is on the body: eyes, ears, jaw, throat, skull and brain, lungs, ribs, spine, arms, hands and legs. Homebrew injuries with similar names land in the right place; anything else goes to the head or torso. Markers pulse, and grow and redden as injuries stack at one spot (with a ×2, ×3 count). Hover one for the injuries there and their quick fix; click it to open the injury.
- **Lost limbs show.** A dismembered arm, hand or leg is blacked out and cut on the figure; a lost eye or ear is marked with an ✕.
- **Left and right.** Injuries to paired parts spread across both sides; the arrows button in the injury list moves one to the other side.
- **Trauma level** (Stable, Injured, Critical, Failing) from how many injuries there are and how many raise the Death Save. Critical and Failing redden the scan and make the figure flicker. Head and body light up more strongly as their injuries stack.
- **Opening the window:** a second click while the window is still opening no longer starts it again, and if opening fails it says so (with the details in the console).

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
