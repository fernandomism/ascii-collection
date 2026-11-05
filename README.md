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
Three versions, each in colour or in the sharks' grey with flickering rainbow glyphs (the
**color / grey** switch at the top). Like the sharks, the bugs aren't fenced in: they dip past
the edges, and now and then leave the scene altogether and come back in somewhere else.

- **moths** (`#moths`): atlas, luna, polyphemus, death's-head hawkmoth and rosy maple
  moths. The **fly / crawl** switch has them either fly with beating wings or land, fold
  their wings and walk in short bursts on six legs, now and then fluttering off to land
  somewhere else. **lamp** and **cursor light** switch the two lights on and off: flying
  moths circle the nearest one (click to move the lamp; the cursor light is a second lamp
  that follows your mouse), and with no light they roam in and out of the scene. Clicking a perched moth makes it flash its wings open to show its eyespots.
- **beetles** (`#beetles`): flower chafer, goliath, stag, rhinoceros, hercules, jewel
  beetle and ladybird. Like the sharks, they never stop: each walks its own lazy loop
  round the scene, wide enough to carry it out past the edges and back. Horned males that
  meet lock horns until one gives up and storms off. Click a beetle to startle it: the wing cases lift, the hindwings unfold and it
  flies off.
- **ants** (`#ants`): a colony of detailed ants (mandibles, elbowed antennae, a segmented
  gaster, six legs in a tripod gait). Click to drop food. Foragers smell it, bite off
  crumbs, carry them straight home and lay a pheromone trail that others follow. Ants
  that meet stop to touch antennae, and every 3 crumbs stored hatch another ant. With no
  food about, foragers set off out of the scene and later walk back in to the nest.

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
checks that ants forage and the colony grows, beetles fight, fly and land, moths
circle the lamp or roam with it off, land and flash their wings, and that bugs leave the
scene and come back in.

Respects `prefers-reduced-motion` (it draws a single still frame) and pauses when off-screen.

`src/engine.ts` and `src/math.ts` are adapted from ascii-sharks (MIT, © 2026 drewdi); see
`LICENSE-ascii-sharks`.
