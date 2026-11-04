# ascii bugs

```
                \\
                 \\
                  \\
    --             \\
      -----         \               --
           ----      \         ------
              --\    |       ---     --
       .`.``    \\    |     -      // -------
    .:;;:;;tt%X   \   |    /,`.'..//
   t;;:::t:ttS8@.  \`...::%::::%8;t:.
  ';t::t;;St%XX#;%t:::t:ttt:tttS#@`'',
  ,S%S%SSXSS#@##@#`X8X@%S88%%XX@#::;:t
   ,88XS#8#@@###  //  | `'.#@:t@%X@,
     `#@@@#@#@'  //   |    \     \\
                //   ||     \      \
              --/    /       ----   --------
           ---      //          ---
       ----        //              -----
 -------           /
                 //
                //
                /
```

Insects drawn as ASCII on a canvas, in the style of
[ascii-sharks](https://github.com/stackedlol/ascii-sharks). Zero runtime dependencies.
Three versions:

- **moths** (`#moths`): atlas, luna, polyphemus, death's-head hawkmoth and rosy maple
  moths around a lamp. The **fly / crawl** switch has them either circle the light with
  beating wings (clicking moves the lamp; the cursor is a second, weaker light) or land,
  fold their wings and walk in short bursts on six legs. Clicking a perched moth makes it
  flash its wings open and show its eyespots.
- **beetles** (`#beetles`): flower chafer, goliath, stag, rhinoceros, hercules, jewel
  beetle and ladybird. Horned males seek each other out and lock horns until one backs
  off. Click a beetle to startle it: the wing cases lift, the hindwings unfold and it
  flies off.
- **ants** (`#ants`): big, detailed ants (mandibles, elbowed antennae, a segmented
  gaster, six legs in a tripod gait). Click to drop food. Foragers smell it, bite off
  crumbs, carry them straight home and lay a pheromone trail that others follow. Ants
  that meet stop to touch antennae, and every 5 crumbs stored hatch another ant.

```sh
npm install && npm run dev
```

Then open http://localhost:5173/ and pick a bug at the top (or go straight to `#moths`, `#beetles`, `#ants`). Other options:

- `?mode=crawl#moths` starts the moths perched.
- `?kinds=stag,hercules#beetles` or `?kinds=luna,atlas#moths` picks the roster.

```ts
import { AntScene, BugEngine } from "./src";

const engine = new BugEngine(canvas, new AntScene());
// new MothScene(["luna", "atlas"], "crawl") · new BeetleScene(["stag", "rhino"])
```

`npm run typecheck` checks types. `npm run check` runs the three simulations headless and
checks that ants forage and the colony grows, beetles fight, fly and land, and moths
circle the lamp, land and flash their wings.

Respects `prefers-reduced-motion` (it draws a single still frame) and pauses when off-screen.

`src/engine.ts` and `src/math.ts` are adapted from ascii-sharks (MIT, © 2026 drewdi); see
`LICENSE-ascii-sharks`.
