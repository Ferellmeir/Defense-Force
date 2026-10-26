Game loop

The player spends credits and influence on the overview map to upgrade their units then a mission is selected from 1 of the factions, each faction offers 3 possible missions to choose from. The player prepares for the mission by choosing the units to bring and what equipment they have equipped and enters the mission. The game goes to the mission map where the player starts with an amount of force. Force is a resource used to deploy units, clear tiles and upgrade units. The player then spends their force as desired and starts the first wave. Enemies appear at the spawn and travel to the protected zone. When killed enemies give force to the player. The mission continues to victory or defeat. Victory awards credits and influence and defeat awards nothing to the player. 

Overview map 

The overview map is the base game screen and has several sections 

Main screen

Has deployed units displayed (mouse over to see stats and equipment)

All available missions 

Credit store

Has a random assortment of equipment, augments and units for credits, can restock for an increasing amount of credits

Units 

Units owned, which deploy, equipment, augments

Faction screens 

Influence stores, missions, Allegiance, maybe something else like directives?

Allegiance \= paying credits every turn for influence and benefits 

1 missions 

Enemies enter from an entry point on the edge of the map and move across a path to a point which is a protected zone on the other edge of the map  
Enemies come in waves of normally various kinds of enemies and 30 seconds after the last enemy from a wave is spawned on the map the next wave comes.  
The player is able to send the next wave before then gaining extra force depending on how early the wave is sent and what point in the mission it is.

bonus \= 1 × remaining seconds × wave number

Enemies must stay on the path and player placed units must not be on the path  
Enemies are spawned apart in 1 second increments 

Tiles  
The game board is divided up into squares called tiles. Most tiles are either enemy path tiles or unit tiles where a player can deploy units  
Elevation can make enemies go slower (incline) or faster (decline)   
Special zones like water puts out fire or cover makes enemies take less ranged damage

Units brought to a mission may be deployed multiple times, each time they are deployed as a separate unit or tower on the map with their own individual experience and veterancy.  
Every unit deploys at veterancy 0 and only persists for the duration of the mission.  
Some tiles have special effects that give the enemy or unit on the tile an additional effect.   
Units have a set range and attack enemies within that range. They do not move but stay on the tile where they were placed  
Enemies killed award the player with force specific to the enemy  
When a unit lands the killing damage on an enemy that unit gains experience according to the experience value of the enemy  
When a unit has enough experience it can increase veterancy at the cost of force  
Increasing veterancy increases several of the units stats by an amount (15% per veterancy) the cost of subsequent veterancy upgrades go up 60% every time   
Upgrading veterancy requires the player to choose to increase 1 of 3 upgrade paths that also improve the unit, only 2 of the 3 upgrade paths may be increased. When 2 paths have been fully upgraded the next 3 paths become available and only 2 of those may be increased. When 2 of those paths are fully upgraded 2 paths become available and only 1 may be increased. Every time a path has been finished (upgraded 3 times) a special extra bonus is also added to the unit.

Stats veterancy modifies  
Damage   
Attack speed modifier (percentage)  
Reload speed

Victory is achieved when the last enemy of the last wave is killed and defeat occurs when the number of enemies that reaches the protected zone equals the protected zone’s toughness score

Maps depend on the mission but generally they are algorithmically generated including how many waves, what kinds of enemies, how the path is laid out and where the special tiles are located  
On victory the credit and influence reward for the mission is given to the player and there is a chance to get equipment and a slight chance for a unit 

Force   
Every enemy killed grants the player at least 1 force, stronger enemies grant more force and experience and every 5th wave that force and xp is multiplied by 1.15 which becomes the new baseline 

Starting force  
Players start with 80 Force unless otherwise stated according to the mission  
Clearing a blocked tile costs 70 force

Enemy types  
Normal \- 2 force  
Xp same as force  
1 tile per second  
100 health   
Armor 0

Fast \- 4 force  
Xp same as force  
2 tiles per second  
75 health  
Armor 0

Armored \- 10 force  
Xp same as force  
.75 tiles per second  
200 health  
Armor 25  
Counts as 2 normal enemies  
Armored only has 15 armor before wave 5

Elite \- 20 force  
Xp same as force  
1 tile per second  
500 health   
Armor 20  
Doesnt show up before wave 5  
Counts as 3 normal enemies

Boss \- 400 force  
Xp same as force  
.75 tiles per second   
10000 health  
Armor 20  
Doesnt show up before wave 15  
Counts as 100 normal enemies

Enemy health multiplied by 1.15 every 5th wave which becomes the new baseline 

Wave 1 starts with 30 enemies 90% are normal 10% are randomly armoured and/or fast

multiply the previous wave's count by 1.15 every wave

**Fractional enemy totals:** Keep the calculated total internally, but **spawn the nearest whole number of enemies** each wave. 

More alternate enemies besides normal are sent after the 4th wave  
5% less normal enemies each, the remaining % is split between the other enemies (not bosses) until all enemies have an equal chance to be sent 

After wave 4 there is a 10% chance each wave that the wave is 100% the same type of enemy (which enemy is chosen is according to the regular formula for which units are sent)

Enemies spawn in groups of the same kind together

Mission will have fast forward (x1 x2 x3 x4 options) and send next wave buttons

Boss enemies only show up 1 at a time and there is a 10% chance a boss will come every wave after 14  
If a boss does not show up the chance for a boss goes up 2% until a boss is spawned and the chance resets

All enemies deal 1 toughness damage to the protected zone except for boss enemies which deal 999 damage 

Difficulty

Enemy HP \*= 1 \+ 0.2 × (difficulty − 1\)

| Diff | Waves (Basic) |
| ----- | ----- |
| 1 | 10–12 |
| 2 | 12–15 |
| 3 | 16–19 |
| 4 | 20–24 |
| 5 | 25–25 |

**Final wave count:** Randomly select an integer within the difficulty's range when the mission is generated.

Mission types  

Missions have different difficulty ratings with increased rewards for harder missions

Basic mission  
Secure region  
Survive set number of waves without a certain number enemies reaching protected zone   
Around 10-25 waves  
10 toughness score for the protected zone

Barricade   
Enemies start close to protected zone but there is a fortification that takes time to break through   
50% less waves (rounded up)  
Map size \-65%  
Player starts with a certain amount of points they can buy special tower tiles with (9-mission difficulty)  
\+25% units sent  
\+10% starting credits  
Barricade 100 health   
Enemies deal their Counts as X normal enemies stat to barricade health every 2 seconds  
1 toughness score

Gauntlet  
Different types of missions like maybe 1 long wave that ramps up in difficulty that must be survived to complete, cant pause game  
1 wave  
15 toughness score

Dynamic engagement  
survive multiple phases with different maps \~3 average  
Units do not keep veterancy between maps (maybe introduce a version where they do later)  
Force, XP, deployed units or any other change the player has made does not transfer into the new map, the new map is a fresh start.  
10-15 waves per map  
5 toughness score

Different restrictions can be placed on missions  
No ranged weapons  
No melee weapons   
No aliens/alien tech  
wages/ammo/maintenance cost must be under a certain number  
Can only use units from certain faction  
Cant use units or equipment from certain faction   
and so on

A selection of missions are offered to the player which change after returning from a mission.  
3 missions per faction   
A mission from a faction will give credits and influence with that faction   
Influence gives access to different faction stores and grants a discount plus unique bonuses depending on the faction.

Mission expenses 

When choosing units and equipment to deploy for a mission the player is shown a wages and ammo/maintenance cost in credits. The more rare the equipment and units the higher the cost. This is only for bringing them to the mission not using them in the mission.

Random mission generation parameters 

Each mission has at least 1 special tile and there is a 96% chance for an additional special tile. Each time an additional special tile is rolled the chance decreases by half \-2   
`p = p/2 − 2`   
Maps will be 10-14 by 10-14 tiles per side (the sum of these numbers should be 23,24 or 25\) for a difficulty 1 and tiles per side will increase by 1 per higher difficulty level   
Special tiles must be placed 1-3 tiles of the path (if the special tile is melee only it should be placed next to the path)

Approximately 40% of the map should be unclearable tiles (prioritize the sections of the map which are further from the enemy path if possible)

The enemy path should wind through the map and should not be shorter in length than 22 (this number increases by 2 per increased difficulty level). The path may cross over itself.   
Tiles where the path crosses itself count twice toward the minimum length. The path only moves in the cardinal directions. There must be at least 1 tile of space between parallel moving paths.

Special enemy tiles  
Elevation   
Maps should have 2 upward elevation tiles in a row and w downward elevation tiles in a row (difficulties 3,4 and 5 should have 2 of each section)  
Upward elevation makes enemies move at half speed and downward makes them move at double speed.

The spawn point and protected zone must be on the edge of the mission map but can be any tile (but not directly adjacent)

40 to 60% of the remaining tiles (after accounting for the special tiles, enemy path and unclearable tiles) should consist of blocked but clearable tiles   
Any remaining tiles should be clear tiles the player may deploy on.

All decimal numbers involving tiles rounds to the nearest whole number

Special tiles

Thermal enhancement tile  
Fire dot damage increased 50%  
Snipers nest  
Range \+1  
Deal \+5% per tile of distance between the unit and its target  
Toxin synthesizers   
25% chance to poison target on hit  
Tactical indoctrination tile   
Reload speed \-50%  
Adaptability network  
\+5% chance to all % chances   
Dark alley  
\+10% stun on hit .5 stun duration, melee only

Generation order

1. Pick the size, then the spawn and protected zone.  
2. Generate the path, retrying with a new seed if it can’t reach the minimum length.  
3. Place the special tiles.  
4. Place the unclearable tiles (25% of the map, farthest from the path first).  
5. Of the remaining tiles, make 40-60% blocked and the rest clear.

Equipment 

A unit’s attack is dictated by what weapon is equipped  
Each unit generally has 3 equipment slots 2 hand slots and 1 utility slot  
Weapons can be 1 handed and go in either slot of 2 handed and take up both slots  
When using 2 1 handed weapons units attack with both independently  
Weapons are looted from completing missions and can be bought with credits from stores between runs   
Each equipment has an associated rarity and value   
Most equipment does not belong to any faction   
Some equipment can be associated with a faction

Weapons

Laser pistol   
Ballistic rifle  
Rail gun  
Beam rifle  
Lasertana   
Combat knife   
Standard issue sidearm  
Granades   
RPG   
Toxin injector  
Vibro spear   
Light halberd  
Electrified lance  
Shurikens

As well as lower quality weapons, makeshift weapons that can always be brought but are inferior 

There are makeshift versions of every weapon  
pipe   
Knife   
Makeshift pistol   
Antique rifle   
Makeshift spear   
And so on

Weapon stats  
Damage  
Damage type  
Crit chance  
Crit modifier   
Range  
Attacks per second  
Attack type  
Armor penetration   
Ammo  
Sometimes status effects like slow, fire, poison   
Special property  
Reload speed  
cost

Weapons with ammunition have a magazine capacity. Ammunition represents shots remaining in the current magazine; there is no finite reserve ammunition pool. When the magazine is empty, the weapon must reload before firing again.   
Ranged weapons have 2 possible projectile speeds fired \- fast 12 or thrown \- slow 4 

After every mission equipment has a % chance to break depending on the rarity  
Makeshift \- free so it doesnt break there would be no point  
Common 15%  
Uncommon 10%  
Rare 5%  
Exotic 2.5%  
Legendary can't break

Equipment rare and above can be repaired in any store for its purchase cost  
Equipment break chance is rolled once after each attempted mission for each piece of equipment brought into the mission. 

Weapons increase the deployment force cost of a unit by the credit cost divided by 4.2 to a minimum of 4 (minimum of 8 for a 2 handed weapon)   
Utility equipment increases the cost a unit by credit cost divided by 8.4 with a minimum of 1  
Augments do not increase deployment force cost unless specified

Combat 

Every hit is rolled to see if it is a critical (if a crit is possible)  
The critical hit chance is the critical chance value of the weapon \+ the critical chance value of the unit \+ any other modifiers  
Critical hit damage is critical modifier value of the weapon \+ the critical modifier value of the unit \+ any other modifiers  
When a critical hit is triggered the damage after the armor mitigation from the target is multiplied by the critical modifier   
Ranged and melee skill add a % modifier to attack speed with ranged or melee weapons respectively  
Armor penetration negates a percentage of armor for the damage dealt  
Damage types interact with armor normally unless otherwise stated  
When a weapon reaches 0 ammo in its magazine the unit reloads for the reload time of the weapon modified by the unit's reload speed. This triggers a clock graphic with the time left reloading displayed  
Status effect stacks will function as stated where the effect is denoted  
Attacks deal 1 damage minimum regardless of mitigation or armor.

Damage types, energy, fire, acid, physical

Physical \- basic  
Energy \- reduced by armor in a % instead of a flat number so if a unit has 10 armor an energy weapon deals 10% less damage  
Acid \- reduce armor every hit .5 armor per 100 damage dealt per hit  
Fire \- % of damage dealt on attack as dot (stacking) 15% over 5 seconds,  not reduced by armor

Status effects

bleed 10% of current health over 5 seconds additional hits refresh duration but dont stack, the damage is totalled and reduced by armor once (can be more than 10% if specified)  
fire  % of damage dealt on attack as dot (stacking) 15% over 5 seconds,  not reduced by armor  
poison 5% of max health over 5 seconds additional hits refresh duration but dont stack, not effected by armor  
Exposed attacks against the target have a \+(x) chance to crit, duration 5 seconds, additional hits refresh duration but dont stack  
Vulnerable attacks (not damage from dots) against the target deal \+15% damage (can be more than 10% if specified), duration 5 seconds, additional hits refresh duration but dont stack  
Weakened damage from status effects deals \+15% damage (can be more than 10% if specified), duration 5 seconds, additional hits refresh duration but dont stack

Damage from all effects does not crit and is divided by 5 and dealt in 1 second increments called ticks  
Each tick deals 1 damage minimum

If an effect extends the duration of a dot status the damage is calculated the same (total damage divided by 5 and applied 1ce per second) but applied an additional time per second the duration is extended rounded up

Units 

Units can be rewards from completing missions and bought from stores

unit stats   
Attack speed modifier (percentage)  
Critical chance   
Critical modifier   
Ranged skill   
Melee skill  
Reload speed  
Passive ability  
3 upgrade paths  
Cost

Melee and ranged skill modify attack speed with the relevant weapons

Obtaining more copies of a unit ranks that unit up  
In a mission the same unit can be played many times regardless of copies obtained  
Units are ranked 0 stars to 5 stars  
At 5 stars an additional passive is unlocked  
Increasing a units rank gives them a small stat increase  
Obtaining 1 copy counts as 0 star obtaining a second copy grants a 1 star  
2 copies must be obtained to increase the rank from 1 to 2   
…  
5 copies must be obtained to increase the rank from 4 to 5   
When a star rank increases the extra copies count resets to 0

Rank increases stats by 6%

Character stats   
Attack speed modifier (percentage)  
Critical chance   
Critical modifier   
Ranged skill   
Melee skill  
Reload speed  
Passive ability  
3 upgrade paths  
Cost

Units can be sold in a mission for 70% of the force invested

Final combat stats are calculated from the unit's base stats and persistent modifiers, then the deployed unit's mission-specific veterancy, upgrade paths, and tile effects are applied. 

I want the lowest costing you need to be roughly 10 the highest costing unit to be roughly 50

Player can set unit targeting  
Highest health  
Lowest health   
First enemy in range  
Last enemy in range

Deployed units cannot be damaged or killed by enemies. They remain on their tile for the duration of the mission. 

Veterancy 

10 XP is required for veterancy 1\. The XP requirement is multiplied by 1.6 for subsequent veterancy  
XP is retained after reaching the threshold and veterancy does not increase until the player spends the necessary force   
The 15% stat increase is multiplicative 

The cost of force to upgrade veterancy the first time is 50% of the cost to deploy the unit. The force cost is multiplied by 1.6 for subsequent veterancy

Stats veterancy modifies  
Damage   
Attack speed modifier (percentage)  
Reload speed

When increasing veterancy the player chooses an upgrade path.

Upgrade paths consist of three tiers:

**Tier 1:** 3 paths available; player may upgrade 2\.  
 **Tier 2:** 3 new paths become available after two Tier 1 paths are completed; player may upgrade 2\.  
 **Tier 3:** 2 new paths become available after two Tier 2 paths are completed; player may upgrade 1\.

Each path has 3 upgrade levels. Completing a path grants its completion bonus.

Path choices are permanent for the deployed unit.

Augments 

Augments are installed in a unit and cannot be removed without destroying the augment until the rarity is rare or above  
Units have 1 augment slot   
A rare or higher augment can be removed for the price of the augment in credits  
Augments can be bought in stores or found after missions   
Augments have the following rarities  
Common   
Uncommon   
Rare  
Exotic   
Legendary

Augments are items like   
Stimpacks  
Cybernetic eye   
Synthetic trigger finger  
Robotic arm reinforcement

Factions 

Factions have stores that sell items for influence that you gain from completing missions for that faction  
Faction stores carry equipment and units that are not available from the credit store incentivizing building faction influence

Factions can offer tasks to gain bonus influence like take a certain high difficulty mission or use a certain amount of faction units or equipment for the next mission

Allegiance   
Allegiance can be bought from each faction but only 1 at a time and it gives you a boost to influence gain but costs credits every turn  
Allegiance cost \= 2 × current baseline upkeep.   
Grants the same amount of influence as the credit cost per turn with the faction you have allegiance with  
Allegiance is cancelled if the player cannot pay the cost and the player gains no extra influence that turn

Finances

Every turn a player must pay a baseline credit cost which goes up the more units he has, (a small amount maybe 2.5% of the cost of all units)   
A players credits can go negative 

Debt  
If a player goes into the red allegiance will be cancelled and they will not be able to buy anything new with credits until the debt is paid, ammo/maintenance costs and wage costs will still be payable but will drive the debt larger.   
Interest will be charged to the player on the debt at 10% per turn

Interest: if credits \< 0 when the report closes, charge 10% of the debt amount (debt 200 → 20). Then baseline. Then allegiance only if credits ≥ 0 after that.

Credits are earned by successfully completing missions

| Diff | Credits | Influence |  |
| ----- | ----- | ----- | :---- |
| 1 | 100 | 14 |  |
| 2 | 150 | 20 |  |
| 3 | 200 | 26 |  |
| 4 | 300 | 40 |  |
| 5 | 500 | 56 |  |

Difficulty 1 missions successfully completed give a 25% chance to find an equipment and 10% chance to find a unit  
Chance for both increase 12.5% and 10% respectively per difficulty level up to   
75% for equipment and 50% for units

Stores  
Unit costs are 4.2x(in mission force cost to deploy)   
Unit costs in influence stores are equal to the force cost of the unit but the player must pay in influence with that faction

Credit store  
6 equipment options   
4 unit options  
2 augment options  
Restock costs 15 credits and an additional 10 for every restock after the first

Inventory also refreshes on turn advance.

While in debt: grey out credit buys. Influence store still works (spend influence, not credits).

Influence store

The influence store carries   
3 equipment options   
2 unit options  
1 augment options  
Restock costs 2 influence and can only be refreshed once  
All stock is faction specific to the faction where the store is   
Refreshes on turn advance

| Influence | What you get |
| ----- | ----- |
| 0 | nothing |
| 25 | faction common/uncommon equipment and augments in influence store |
| 50 | 10% discount in that store, units available in influence store |
| 100 | faction rare equipment and augments in influence store |
| 200 | exotic and legendary equipment and augments in influence store |
| 250 | Unique bonus unlocked |

These are milestones unlocked by reaching a number of total influence  
wages/maintenance cost  
Each unit selected for the mission costs 25% of the credit cost of the unit  
ammo/maintenance cost of equipment corresponds to the rarity of the equipment

| Rarity | % of item cost |
| ----- | ----- |
| Common | 10% |
| Uncommon | 8% |
| Rare | 6% |
| Exotic | 4% |
| Legendary | 3% |

Find chance  
Equipment and augments have the following chance to find them at specific rarities in stores and from mission rewards

Common 50%  
Uncommon 38.5%  
Rare 10%  
Exotic 1%  
Legendary .5%

Units do not have rarity and are found equally

Upkeep 

Baseline \= 2.5% of (sum of owned unit credit values).

A unit with Additional stars costs 20% more in upkeep per star

Starting point  
The player starts the game with 200 in credits  
The first unit the player buys is half off  
The player should be made aware of this so he can make an informed decision   
No equipment or units are owned but he can take free makeshift equipment 

Turns 

Every time a mission is concluded that marks the start of a new turn

Order   
Select mission, when a mission is started the game goes to a mission map screen  
Mission costs are paid as soon as the mission begins   
The mission is concluded and the player is shown an after mission report  
Victory/defeat, equipment break rolls, rewards all happen at the after mission report screen  
The turn advances as soon as the player closes the after mission report  
Debt interest is charged then baseline credit cost is charged then allegiance payment and mission selection is refreshed

Rounding  
The system shouldnt round at all and the player should only see whole numbers 