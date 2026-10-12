# Neon At Home: Loadout, Vehicle Bay, Biomonitor & Weaponbench for Cyberpunk RED

A home suite for each character in **Cyberpunk RED - CORE** on Foundry VTT: one window, opened
from the character sheet, with a tab for each part of their home.

- **Loadout.** What the character wears and carries, against the carry slots their armor gives
  them (the *Armor & Carrying 2.0* homebrew), plus a weight limit. Equip, carry or store things,
  move them to and from a **home stash**, and fit **armor upgrades**.
- **Vehicle Bay.** Their vehicles parked in the home's bays: HP, SP, speed, crew seats, mounted
  weapons, upgrades and cargo. Bays come from the home's parking in Neon Hub.
- **Biomonitor.** HP and wounds, armor, critical injuries, Humanity and Empathy, and the
  *Syndromes & Inspiration* homebrew: Empathy tiers, Syndromes and their Stressors, Catharsis,
  Antipathy, In The System and Inspiration.
- **Weaponbench.** A weapon's attachment slots, what each attachment does to it, and attaching
  and detaching them, including custom attachments.

| Requirement | Version |
| --- | --- |
| Foundry VTT | v12 (built with v13+ APIs in mind) |
| Cyberpunk RED - CORE | 0.92 (checked against the 0.92.4 source) |
| [Neon Hub](https://github.com/choccoops/neonredlanding) | optional: vehicle bays from the character's home or household |
| [MMuton's CPR Vehicle Actor Sheet](https://github.com/MMuton/MMutons-Cyberpunk-Vehicle-Actor-Sheet) | optional: crew seats, mounted weapons and upgrades on vehicle actors |
| [MMuton's CPR Weight System](https://github.com/MMuton/MMutons-Cyberpunk-Red-Weight-System) | optional: item weights set there are used here |

![The Loadout tab](docs/loadout.jpg)

It shares Neon Hub's look: black chrome, notched corners, `//` labels and the Tektur typeface.

## Install

In Foundry's **Install Module** window, paste this manifest URL:

```
https://github.com/choccoops/neonathome/releases/latest/download/module.json
```

Enable **Neon At Home** in your world. Updates come through Foundry's module updater.

## Opening it

- The **Home** button in a character sheet's header (owners and the GM).
- The **Home** button at the top of the Actors sidebar.
- The house button in the Token Controls toolbar.
- A macro, or a Neon Hub page button running one: `game.modules.get("cpr-neon-at-home").api.open()`.

Players see their own characters; the GM can pick anyone from the list in the header.

## Loadout

The middle column is everything on the character: the **carry slots** they're using, shown as a
bar with a tick per slot, filled by kind with a key of what uses them and what's free, any bonus slots (holster, ammo bag), the **weight** bar, and each item with
its slot cost, weight and an owned / carried / equipped switch. Items the sheet marks *owned* are
not on the character (that's what *owned* means in Cyberpunk RED) and sit on their own shelf,
uncounted, until they're carried or stored.

On the right is **home storage**: the character's stash, or a vehicle's cargo. **Set up a home
stash** makes a Cyberpunk RED container actor (in a *Home Stashes* folder, owned by the
character's players). Drag items between columns, or use the buttons: store, take, take and
equip. Stacks ask how many. Weapons go with their attachments and loaded ammo the way Cyberpunk
RED moves items between sheets. When a player doesn't own the stash or a vehicle, the GM's client
does the move for them (a GM has to be online). The GM can drop any container actor on the
storage column to use it as that character's stash.

On the left, the character's **armor, shield, weapons in hand and worn gear**. Click a piece of
armor to see its **upgrade slots** and fit upgrades from the character or the stash.

### Carry slots (Armor & Carrying 2.0)

The armor worn on the body sets the carry slots:

| Armor | Carry slots | Upgrade slots |
| --- | --- | --- |
| Unarmored / Mimic Kit | 10 | — |
| Light Armorjack | 15 | 4 |
| Medium Armorjack | 21 | 5 |
| Heavy Armorjack | 25 | 6 |
| Flak | 30 | 8 |
| Metal Gear | 42 | 10 |
| Shield | — | 4 |

What things cost:

| Kind | Slots |
| --- | --- |
| Heavy weapons, machine guns (Heavy Weapons skill, grenade and rocket launchers) | 4 |
| Two-handed weapons | 3 |
| One-handed weapons | 2 |
| Ammo, utility gear | 1 |
| Spare armor carried, not worn | 3 |

Worn armor and clothing, installed cyberware, attachments and Neon Hub lifestyle items (rent,
packages, memberships) cost nothing; lifestyle items are left out of the Loadout altogether. Armor is classed by
name (*Light Armorjack*, *Flak*, *Metalgear*...), else by its SP; the GM can set the class, the
slot kind or the slot cost on any item (see *Item settings* below).

The **Neon At Home: Carry Gear** compendium has the External Gear sheet's items: the
**Shoulder Holster** (4 slots for pistols and 2 for pistol ammo, no armor), **Weapon Sling**
(3 slots for a two-handed weapon, no armor), **Carryall Bag** (+10 slots), and the **Trench Coat**
and **Armored Trench Coat**. Only one holster and one sling count at a time.

Each **Subdermal Pocket** installed as cyberware adds 2 bonus slots for gear or a one-handed
weapon, shown like a Gear bag; two pockets give two. No other cyberware gives slots. The GM can
change a pocket's slots in its item settings.

**Carry slots are a hard limit.** Carrying or equipping something that would go past them, in the
Loadout or with the character sheet's equip toggle, is stopped with a pop-up saying what doesn't
fit; the GM's pop-up has *Carry it anyway*. Things arriving on the character (bought, looted,
dropped on the sheet) are never refused, so nothing paid for is lost: the pop-up just says they're
over. Storing things or marking them owned is always allowed. The GM can relax the limit to a
warning, or switch it off, in the module settings.

### Armor upgrades

The **Neon At Home: Armor Upgrades** compendium has every upgrade from the spreadsheet, each
limited to the armor classes that list it and to the body, head or shield. The Neuro-port goes in
before the AI Armor Interface; the two ACPA versions take a Cyberware option slot instead.
Fitting one sets the armor's upgrade slots from its class, then installs it through Cyberpunk RED.

While the armor is worn, Neon At Home keeps an effect on the character, *Neon At Home: armor
fit*, for what the upgrades do: Improved Flexibility and Reflexes cancel the armor penalty on DEX
and REF rolls, Plate Padding gives +2 Stealth, the AI Armor Interface +2 Concentration, and War
Paint on both head and body +2 Wardrobe & Style. The rest (Improved Mobility, Enviro-Shielding,
Fireproof Padding, the Neuro-port, Rocket Boosters...) are listed on the Loadout for the table.
The GM can turn the effect off.

### Weight

Modelled on MMuton's Weight System: a limit of **BODY × 3** (or a fixed number), equipped weapons
and armor weigh a third, worn clothes and installed cyberware nothing, attachments add to the
weapon they're on, and cyberware (or worn gear) set to *add to weight limit* raises it. Each item
can have its own weight; otherwise Neon At Home uses MMuton's weight if that module set one, then
a default for the item's type. All of it is in **Carry & Weight Rules** in the module settings.

**Encumbrance.** Over the weight limit, MOVE is **halved** (rounded down, at least 1); over double
the limit, MOVE is **1** and the GM may call for checks depending on the situation. It's a status
effect, **Encumbered** or **Overloaded**, shown on the token, that comes and goes with the load and
is applied after other effects such as cyberlegs, so walking and running speed follow it. The
player and the GM are told in chat when it starts, worsens or ends. The GM can turn it off in the
Weight rules, and choose whether going over weight is only shown, warned about, or blocked for
players.

Both statuses are also in the token HUD, so the GM can place one by hand (it carries the MOVE
penalty too); a status placed by hand is left alone by the automatic check.

**Condition Lab & Triggler.** In Condition Lab, add conditions named **Encumbered** and
**Overloaded** (the names are module settings; the icons are `modules/cpr-neon-at-home/assets/
encumbered.svg` and `overloaded.svg`). Neon At Home then applies and removes those conditions
through CLT instead of its own statuses, so their macros, chat output and Triggler triggers run,
and it adds the MOVE penalty to whatever the condition already does. Without CLT, or without
those conditions, it uses its own statuses. If CLT is set to remove Foundry's default status
effects, the two statuses won't be in the token HUD, but they still show on the token.

## Vehicle Bay

![The Vehicle Bay tab](docs/vehicle-bay.jpg)

The garage shows one bay per parking space at the character's home: the parking of their active
Neon Hub housing item, or of the Neon Hub household they live in. The GM can set the number on
the character (the field at the top right), and set a default for characters without a home.

Add vehicles by dropping vehicle actors from the sidebar onto a bay or the street, or with the
**Add vehicle** list. Cyberpunk RED vehicle items on the character show up by themselves. Drag
vehicles between bays (swapping), out to the street, or back. **Ride** marks the one the
character is using.

On [MMuton's Vehicle Actor Sheet](https://github.com/MMuton/MMutons-Cyberpunk-Vehicle-Actor-Sheet),
a vehicle shows its HP, SP, MOVE, its seats with who's in them and what weapons they control,
bulletproof glass, mounted upgrades and critical injuries; **Open** opens its sheet. Vehicle
actors also appear as storage in the Loadout, with a cargo weight limit (the rules' default, or a
vehicle's own `flags.cpr-neon-at-home.cargo`, or MMuton's per-vehicle capacity).

## Biomonitor

The left side is the body: a heartbeat that speeds up as wounds get worse, the HP bar with the
Seriously Wounded mark, armor SP, and a **trauma map**. Each critical injury is marked where it
is on the figure (eyes, ears, jaw, throat, skull, lungs, ribs, spine, arms, hands, legs); markers
grow and redden as injuries stack at one spot, lost limbs are blacked out, and lost eyes and ears
are crossed out. Paired parts take a side, which the injury list can flip. The trauma level
(Stable, Injured, Critical, Failing) comes from how many injuries there are and how many raise
the Death Save, and the scan reddens and flickers as it climbs. Each injury lists its quick fix
and treatment.

The right side is the mind: Humanity against its maximum (with 30, 20 and 10 marked), EMP, and
the **Syndromes & Inspiration** homebrew (the GM can turn it off):

| Tier | Humanity | Picks | Stays at 30+ | Antipathy | Catharsis |
| --- | --- | --- | --- | --- | --- |
| Functional | 30+ | — | — | — | — |
| Borderline dissociative (EMP 2) | 20–29 | 1 Mild | — | — | +8 |
| Borderline cyberpsychosis (EMP 1) | 10–19 | Upgrade the Mild or add a Mild, and add a Severe | 1 Mild | yes | +10 |
| Cyberpsychosis (EMP 0) | 1–9 | Upgrade or add a Severe, and add an Extreme | 1 Severe | yes | +12 |
| Extreme | 0 or less | Every Syndrome at its worst | 1 Extreme | yes | — |

- **Syndromes** are picked from the homebrew's thirteen (with their variants, like Paralogic
  Confabulation's NET Warrior or The Knight), from the GM's own list, or written up as custom.
  Each shows its Stressors. A Syndrome belongs to the tier it was picked at: it goes **dormant**
  when the character climbs above it and comes back if they fall again. The Biomonitor says when
  the current tier still needs picks, and once the character is functional again, which one stays
  as a **scar**.
- **Catharsis** is gained each time Humanity falls into a deeper tier, and (if the GM keeps that
  setting on) takes Humanity Loss before true Humanity does, with a note in the Humanity ledger.
  The GM is told in chat.
- **Antipathy**, **In The System** and a **complete break** are shown as badges.
- **Inspiration** is awarded by the GM and spent by the player on a reroll, a loot box roll or
  2 LUCK back (announced in chat).
- GM tools: In The System, a complete break regardless of Humanity, and **Intensive Therapy**
  (removes the lingering Syndromes and resets the scars).

## Weaponbench

Pick a weapon from the rack. The bench shows its attachment slots as sockets, its numbers before
and after attachments (attack, damage, ROF, magazine, slots, worked out as Cyberpunk RED does),
and what each attachment does: its modifiers, an underbarrel weapon, its Active Effects and any
custom lines. The drawer lists the attachments that fit, from the character and their stash
(those are brought over when attached). Drag them onto the bench, or drag one off. Attachments
marked **fixed** stay on.

**Custom attachment** makes a new attachment item: name, slots, modifiers (added or set), and
free-text benefits. Players can make their own if the GM allows it.

## Item settings (GM)

Every item sheet has a **Home** button for the GM, with Neon At Home's settings for that item:

- slot kind and cost, weight, and how much it adds to the weight limit;
- armor class (armor);
- bonus carry slots, *no armor* and *one per group* (carry gear like holsters and bags);
- where an armor upgrade fits, which classes, built-in effects, what it requires, bonus slots;
- benefit lines and *fixed* (weapon attachments).

## Module settings

- **Carry & Weight Rules**: the carry slots per armor class, upgrade slots, slot costs, the weight
  limit and default weights, and your own Syndromes. Each table shows the spreadsheet's numbers
  and can be put back to them.
- **Carry slots**: a hard limit with a pop-up (the default; the GM can override), a warning, or off.
- **Weight limit**: show only, warn, or block players (encumbrance applies either way).
- **Apply armor upgrade bonuses**, **Vehicle bays without a home**, **Players can make custom
  attachments**, **Syndromes & Inspiration**, **Catharsis takes Humanity Loss first**.

## For macros and other modules

```js
const home = game.modules.get("cpr-neon-at-home").api;
home.open(actor, "bench");          // open a tab: loadout, bay, biomonitor, bench
home.show("loadout");               // GM: open it on every player's screen
home.measure(actor);                // { carry, weight }
home.bays(actor);                   // { slots, source, homeName }
home.psyche(actor);                 // tier, Syndromes, Catharsis...
home.awardInspiration(actor, 1);    // GM
home.registerFeature({ id, icon, label, template, prepare, actions }); // add a tab
```

New sub-features plug into the same window: see `scripts/apps/features.js`.

## Data

- Actor flags `cpr-neon-at-home.home` (stash, vehicles, bays) and `cpr-neon-at-home.psyche`
  (Syndromes, Catharsis, Inspiration).
- Item flag `cpr-neon-at-home.item` (the item settings above).
- Stashes are Cyberpunk RED container actors flagged `cpr-neon-at-home.stashOf`.
- Cyberpunk RED data it reads: equip state, armor locations, SP and penalty, installed items,
  upgrade modifiers, HP, wound state, Humanity, EMP, LUCK and critical injuries.

## Development

```bash
npm install
npm test             # rules, operations and template rendering against mock documents
npm run check        # syntax, JSON and localization keys
npm run preview      # render each tab to preview/ with a test character
npm run build:packs  # compile the compendiums from packs/_source
```

See [PUBLISHING.md](PUBLISHING.md) for releases.

## License

MIT. The Tektur font is under the SIL Open Font License (`fonts/Tektur-OFL.txt`).
Cyberpunk RED is a trademark of R. Talsorian Games; this is unofficial fan content.
