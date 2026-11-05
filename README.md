# ascii collection

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

Living ASCII scenes drawn on a canvas, in the style of
[ascii-sharks](https://github.com/stackedlol/ascii-sharks). Each page is just the scene:
no text, buttons or HUD.

## Insects

| Page | |
| --- | --- |
| `insects/moths-fly-color.html`, `insects/moths-fly-grey.html` | Atlas, luna, polyphemus, death's-head and rosy maple moths circling a lamp; your cursor is a second lamp. Click to move the lamp. |
| `insects/moths-crawl-color.html`, `insects/moths-crawl-grey.html` | The same moths perched and walking, now and then fluttering off. Click one to make it flash its wings. |
| `insects/moths-swarm.html` | Dozens of small, plain moths spiralling round a lamp, like the sharks' fish; your cursor is a second light. Click to scatter them. |
| `insects/beetles-color.html`, `insects/beetles-grey.html` | Flower chafer, goliath, stag, rhinoceros, hercules, jewel beetle and ladybird walking their loops in and out of the scene, with gnat swarms drifting over. Click a beetle to startle it into flight. |
| `insects/ants-color.html`, `insects/ants-grey.html` | Detailed ants exploring in and out of the scene. Click to drop food; they carry it home along a pheromone trail. |

The grey versions use the sharks' blue-grey with flickering rainbow glyphs.

## Nature

| Page | |
| --- | --- |
| `nature/leaves.html` | Maple, oak, birch and ginkgo leaves tumbling down an autumn grid. |
| `nature/pond.html` | A koi pond seen from a second-floor window. Click the water to ripple it and feed the koi. Sakura petals drift down now and then, lily pads carry pink water lilies, small fish swim deep below, a few flies wander and red and blue dragonflies come by. |

## Use

```sh
npm install
npm run dev     # then open http://localhost:5173/ for the home page with every version
npm run build   # dist/ gets one self-contained HTML file per page (and the home page): open with a double-click
```

`npm run typecheck` checks types; `npm run check` runs every scene headless and checks its
behaviour (ants forage, beetles keep walking, moths circle the lamp and land, leaves keep
falling, koi eat, petals land, the dragonfly visits, and bugs that leave come back).

## Layout

```
src/core/      engine (loop, resize, input), renderer (supersampled ASCII cells), math, anatomy, flock
src/insects/   moths, moth-swarm, beetles, ants, dragonfly
src/nature/    leaves, pond, koi
src/main.ts    starts the scene a page names on its canvas, e.g.
               <canvas data-scene="moths" data-mode="crawl" data-look="grey">
insects/, nature/   the pages
```

A new scene is a class implementing `Scene` (`src/core/engine.ts`) plus a page that names it.

`src/core/engine.ts` and `src/core/math.ts` are adapted from ascii-sharks (MIT, © 2026 drewdi);
see `LICENSE-ascii-sharks`.
