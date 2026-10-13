# Changelog

## 1.4.0

- **Cyberware monitor in the Biomonitor.** A Vitals / Cyberware switch at the top of the tab. The cyberware view shows every piece installed in the body by type, in the character sheet's order (neuralware, cybereyes, cyberaudio, cyberarms, cyberlegs, internal, external, fashionware, borgware): each foundational piece or built-in container with its option slots as sockets (used and total, with slot upgrades), and what's installed in it, nested. A scan marks each piece on the body and draws cyberlimbs in chrome on their side (meat limbs stay flesh).
- **EMP'd and broken / worn-out cyberware.** Any piece can be marked working, EMP'd or broken. Offline cyberware, and everything installed in it, flickers yellow (EMP) or shows red (broken) on the scan and in the list, its bonuses switch off until it's marked working again, and the player and GM are told in chat. The Cyberware switch shows how many pieces are offline.

## 1.3.1

- **Fixed: the character sheet wouldn't open** ("can't access property \"changes\"") after Encumbered or Overloaded was applied through Condition Lab & Triggler, or placed from the token HUD. Cyberpunk RED's sheet needs its own bookkeeping on every effect change, and the MOVE penalty added to those effects didn't have it. Every effect carrying the penalty now does, however it's made, and effects already broken in your world are repaired when the GM loads it.

## 1.3.0

- **Subdermal Pockets give carry slots.** Each Subdermal Pocket installed as cyberware adds 2 bonus slots that take gear/utility or a one-handed weapon, shown in the Loadout like a Gear bag (two pockets: two bars, numbered). It's found by name, so the core item works as is; an uninstalled pocket gives nothing.
- Only the Subdermal Pocket does this; no other cyberware gives carry slots. The GM can change a pocket's slots in its item settings.
- **The "No room to carry it" pop-up explains bonus slots that didn't help.** When a bonus pool still has room but only takes other things (a Gear bag offered a pistol, a holster offered a rifle), the pop-up now says so, e.g. "Gear bag has 2 free, but only for Gear / utility."

## 1.2.2

- **Fixed: cyberware installed in the body took carry slots and weight.** Cyberpunk RED lists cyberware installed in the body on the character itself rather than inside another item, and the Loadout didn't look there, so each piece counted as a hidden 1-slot, 0.5-unit item. It also filled gear-only bonus slots like the Gear bag. Installed cyberware is now free, and any weight-limit bonus it gives applies.
- The carry summary names the bonus slots that only take certain things, e.g. "+2 Gear bag (Gear / utility only)".

## 1.2.1

- **Carry bar colours always show.** Used slots are filled in their kind's colour (set on the bar itself, so no other stylesheet can grey them out), brighter, against a darker empty track.
- **Encumbered and Overloaded icons are full size on tokens.** They're now 512×512 like Cyberpunk RED's own status icons, filling the frame; before, without a set size, they drew small. If you made Condition Lab conditions with these icons, they pick up the new ones automatically.

## 1.2.0

- **Carry slots are a hard limit.** Carrying or equipping something that would go past a character's carry slots is stopped with a pop-up saying what doesn't fit and why, in the Loadout and with the Cyberpunk RED sheet's equip toggle. The GM's pop-up can carry it anyway. Things arriving on a character (bought, looted, dropped on the sheet) aren't refused, so nothing paid for is lost; the pop-up says they're over. Fitting an upgrade or attachment from the stash isn't stopped by full slots, since it costs nothing once installed. The setting still offers warn or off.
- **Encumbrance.** Over the weight limit MOVE is halved (rounded down, at least 1); over double the limit MOVE is 1 and the GM may call for checks. It's applied after other effects, the player and GM are told in chat when it changes, the Loadout shows it under the weight bar, and the GM can turn it off in the Weight rules.
- **Encumbered and Overloaded status effects**, with their own icons, shown on the token and in the token HUD (placing one by hand applies the MOVE penalty too, and the automatic check leaves it alone).
- **Condition Lab & Triggler.** If Condition Lab has conditions named Encumbered and Overloaded (names set in the module settings), Neon At Home applies and removes them through CLT, so their macros, chat and Triggler triggers run, and adds the MOVE penalty to them.
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
