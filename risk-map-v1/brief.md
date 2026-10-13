# Asset brief: risk map

- Project: Risk game
- Kind: model3d (3D model)
- Version: v1 (branch main)
- Parameters (also in params.json, passed to your script as PARAMS): animations=, art_style=auto, atlas_size=2048, bake_ao=false, bake_detail=true, colliders=, finish=agent, fps=24, grid=1, height_cm=100, lods=0.5, 0.25, max_triangles=20000, reduce_to_budget=true, shape_keys=, slots=, softbody=auto, surface=smart, texture_size=512, textures=pbr
- Tags: map

## Materials

Texture every visible part with texkit at texture_size 512 (see the texturing section of the guide): pick a recipe per material and apply it with texkit.apply. The harness then bakes a smart surface into one 2048 px atlas: wear that follows the model (chipped edges, crevice grime, dust, mud, streaks, occlusion). Keep the recipes' own wear and grime low and steer the weathering with texkit.wear(...) per material and texkit.weathering(...) for the model, to suit the asset's story; check the result in preview/review.png.

## Grid fit

The asset must drop cleanly onto a game's placement grid with 1 m cells (see the grid section of the guide): metres, front faces -Y, origin at the footprint centre on the floor (bkit.sit_on_ground), and a footprint that fills whole cells — not a few centimetres over. Kit pieces (walls, floors, track) declare bkit.grid_piece("corner", cells=(x, y, z)) and are exactly that size. The harness reports GRID warnings.

## Project style guide (every asset in the project follows it)

2.5D of the world so everything is visible and the player can easily see and move their areas and their pawns. The world is split into 6 continents and 42 countries. Clear to view and identify colors based on the official risk colors.

Continent	Board Color	Hex Code
North America	Yellow / Gold	#E5B73E	
South America	Deep Red	#C83232	
Europe	Royal Blue	#2B6CC4	
Africa	Brown / Tan	#9C6E46	
Asia	Forest Green	#368A47	
Australia	Purple / Pink	#964796

## Request

a world map for the game RISK

## Your task

Write asset.py from scratch, render it with `python render.py`, look at preview/review.png, and improve it until it matches the request.

When you are done, reply with 2-4 sentences: what the asset is and the notable choices you made. That reply is stored as this version's notes.

## Memory

If this generation taught you something that will help FUTURE assets in this project — a preference the person showed in their request or correction, a technique that worked well in this project's style, a pitfall with the harness to avoid — write it to memory.md in this folder as 1-3 short bullet lines. Only lasting, project-wide lessons: nothing about this one asset alone, nothing already in the project memory. Skip memory.md when there is nothing new.
