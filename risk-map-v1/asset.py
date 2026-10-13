"""RISK world map: a 2 x 1 m game board with 42 raised territory tiles.

Territories are Voronoi cells of hand-placed seed points, clipped to simplified
continent / island outlines on a 100 x 50 unit map grid (north = +Y, away from
the viewer). Each territory is its own mesh, grouped under a continent pivot,
with a socket at its army-marker disc for pawn placement.
"""
import math

import bmesh
import bpy

import bkit
import texkit as tk

SIZE = int(PARAMS.get("texture_size", 512))

# ---------------------------------------------------------------- dimensions
BOARD_W, BOARD_D = 2.0, 1.0          # footprint: 2 x 1 grid cells
BASE_H = 0.02                        # wooden base plate
RAIL_W, RAIL_H = 0.04, 0.025         # raised frame rails
SEA_H = 0.01                         # ocean panel on the base
TILE_H = 0.012                       # territory tile thickness
GAP = 0.16                           # half border gap between tiles (map units)
SEAT = 0.0005                        # tiles and routes sit this deep in the sea panel
S = 0.0176                           # metres per map unit (100 x 50 units)

Z_SEA = BASE_H + SEA_H               # ocean surface
Z_TOP = Z_SEA + TILE_H               # territory top surface


def to_m(u, v):
    return ((u - 50.0) * S, (v - 25.0) * S)


# ---------------------------------------------------------------- map data
CONTINENTS = {
    "NorthAmerica": ("#E5B73E", "North America"),
    "SouthAmerica": ("#C83232", "South America"),
    "Europe": ("#2B6CC4", "Europe"),
    "Africa": ("#9C6E46", "Africa"),
    "Asia": ("#368A47", "Asia"),
    "Australia": ("#964796", "Australia"),
}
BONUS = {"NorthAmerica": 5, "SouthAmerica": 2, "Europe": 5,
         "Africa": 3, "Asia": 7, "Australia": 2}

# Land masses: (continent, outline, {territory: seed}).
LANDS = [
    ("NorthAmerica",
     [(2, 44), (8, 46), (14, 45), (20, 46), (26, 45), (28, 42), (31, 40), (34, 38),
      (33, 35), (30, 33), (27, 31), (26, 28), (22, 26), (20, 22), (22, 19), (20, 18),
      (17, 21), (14, 25), (11, 29), (9, 33), (7, 37), (4, 39), (2, 41)],
     {"Alaska": (5, 42), "NorthwestTerritory": (15, 42), "Alberta": (12, 36),
      "Ontario": (20, 37), "Quebec": (28, 37), "WesternUS": (15, 30),
      "EasternUS": (23, 31), "CentralAmerica": (19, 23)}),
    ("NorthAmerica",
     [(30, 44), (34, 48), (40, 49), (44, 47), (42, 43), (38, 41), (34, 41)],
     {"Greenland": (38, 45)}),
    ("SouthAmerica",
     [(20, 17), (24, 18), (28, 16), (32, 13), (33, 10), (30, 7), (27, 4), (24, 1),
      (22, 3), (22, 7), (20, 10), (18, 13), (18, 15)],
     {"Venezuela": (23, 15), "Peru": (22, 10), "Brazil": (28, 11), "Argentina": (25, 4)}),
    ("Europe",
     [(48, 29), (46, 31), (47, 34), (49, 36), (50, 39), (51, 42), (53, 45), (56, 46),
      (58, 44), (62, 45), (64, 42), (64, 36), (63, 32), (60, 29), (57, 28), (54, 29),
      (51, 28)],
     {"Scandinavia": (55, 42), "NorthernEurope": (53, 35), "WesternEurope": (48, 32),
      "SouthernEurope": (55, 30.5), "Ukraine": (60, 38)}),
    ("Europe",
     [(40, 40), (43, 41), (45, 40), (44, 38), (41, 38)],
     {"Iceland": (42.5, 39.5)}),
    ("Europe",
     [(42, 33), (42.5, 36), (44, 38), (46, 36), (45, 34), (44, 32.5)],
     {"GreatBritain": (44, 35)}),
    ("Africa",
     [(44, 26), (50, 27), (54, 26), (58, 25), (60, 21), (62, 17), (60, 15), (58, 10),
      (57, 5), (54, 2), (51, 3), (50, 8), (48, 13), (45, 15), (42, 17), (41, 21),
      (42, 24)],
     {"NorthAfrica": (46, 20), "Egypt": (53, 23.5), "EastAfrica": (57, 17),
      "Congo": (52, 13), "SouthAfrica": (53, 6)}),
    ("Africa",
     [(61, 5), (62, 10), (64, 9), (64.5, 6), (63, 3.5)],
     {"Madagascar": (62.8, 6.8)}),
    ("Asia",
     [(67, 47), (72, 48), (78, 47), (86, 48), (94, 46), (97, 43), (95, 40), (92, 38),
      (90, 34), (88, 30), (86, 26), (84, 22), (81, 19), (78, 21), (76, 18), (73, 21),
      (70, 22), (66, 22), (62, 24), (61, 27), (65, 30), (66, 33), (67, 37), (67, 42)],
     {"Ural": (70, 41), "Siberia": (76, 44), "Yakutsk": (84, 46), "Kamchatka": (91, 43),
      "Irkutsk": (82, 40.5), "Mongolia": (85, 35), "Afghanistan": (72, 33),
      "China": (79, 29.5), "MiddleEast": (65.5, 26), "India": (75, 23.5),
      "Siam": (83, 22.5)}),
    ("Asia",
     [(93.5, 33), (94.5, 36), (96.5, 38), (98, 36.5), (96.5, 33), (95, 31.5)],
     {"Japan": (95.8, 35)}),
    ("Australia",
     [(79, 13), (83, 15), (87, 13.5), (84, 11), (80, 11)],
     {"Indonesia": (83, 13)}),
    ("Australia",
     [(90, 15), (95, 15.5), (97, 13), (91, 12)],
     {"NewGuinea": (93.3, 13.8)}),
    ("Australia",
     [(82, 5), (83, 8), (86, 10), (90, 10), (94, 9), (97, 6), (96, 2), (92, 1),
      (88, 2), (84, 3)],
     {"WesternAustralia": (86.5, 5.5), "EasternAustralia": (93, 5.5)}),
]

ADJ = """Alaska NorthwestTerritory|Alaska Alberta|Alaska Kamchatka
NorthwestTerritory Alberta|NorthwestTerritory Ontario|NorthwestTerritory Greenland
Greenland Ontario|Greenland Quebec|Greenland Iceland|Alberta Ontario|Alberta WesternUS
Ontario WesternUS|Ontario EasternUS|Ontario Quebec|Quebec EasternUS
WesternUS EasternUS|WesternUS CentralAmerica|EasternUS CentralAmerica
CentralAmerica Venezuela|Venezuela Peru|Venezuela Brazil|Peru Brazil|Peru Argentina
Brazil Argentina|Brazil NorthAfrica|NorthAfrica WesternEurope|NorthAfrica SouthernEurope
NorthAfrica Egypt|NorthAfrica EastAfrica|NorthAfrica Congo|Egypt SouthernEurope
Egypt MiddleEast|Egypt EastAfrica|EastAfrica Congo|EastAfrica SouthAfrica
EastAfrica Madagascar|EastAfrica MiddleEast|Congo SouthAfrica|SouthAfrica Madagascar
Iceland GreatBritain|Iceland Scandinavia|GreatBritain Scandinavia
GreatBritain NorthernEurope|GreatBritain WesternEurope|Scandinavia NorthernEurope
Scandinavia Ukraine|NorthernEurope Ukraine|NorthernEurope SouthernEurope
NorthernEurope WesternEurope|WesternEurope SouthernEurope|SouthernEurope Ukraine
SouthernEurope MiddleEast|Ukraine MiddleEast|Ukraine Afghanistan|Ukraine Ural
Ural Afghanistan|Ural China|Ural Siberia|Siberia China|Siberia Mongolia
Siberia Irkutsk|Siberia Yakutsk|Yakutsk Irkutsk|Yakutsk Kamchatka|Kamchatka Irkutsk
Kamchatka Mongolia|Kamchatka Japan|Irkutsk Mongolia|Mongolia China|Mongolia Japan
Afghanistan China|Afghanistan India|Afghanistan MiddleEast|China Siam|China India
MiddleEast India|India Siam|Siam Indonesia|Indonesia NewGuinea
Indonesia WesternAustralia|NewGuinea WesternAustralia|NewGuinea EasternAustralia
WesternAustralia EasternAustralia"""
ADJACENCY = [tuple(p.split()) for line in ADJ.splitlines() for p in line.split("|")]

# Adjacencies across water, printed on the board as dashed routes.
SEA_ROUTES = [
    ("Greenland", "NorthwestTerritory"), ("Greenland", "Ontario"), ("Greenland", "Quebec"),
    ("Greenland", "Iceland"), ("Iceland", "GreatBritain"), ("Iceland", "Scandinavia"),
    ("GreatBritain", "Scandinavia"), ("GreatBritain", "NorthernEurope"),
    ("GreatBritain", "WesternEurope"), ("Brazil", "NorthAfrica"),
    ("WesternEurope", "NorthAfrica"), ("SouthernEurope", "NorthAfrica"),
    ("SouthernEurope", "Egypt"), ("EastAfrica", "Madagascar"),
    ("SouthAfrica", "Madagascar"), ("Kamchatka", "Japan"), ("Mongolia", "Japan"),
    ("Siam", "Indonesia"), ("Indonesia", "NewGuinea"), ("Indonesia", "WesternAustralia"),
    ("NewGuinea", "WesternAustralia"), ("NewGuinea", "EasternAustralia"),
    ("CentralAmerica", "Venezuela"),
]


# ---------------------------------------------------------------- 2D polygon helpers
def area(poly):
    return 0.5 * sum(poly[i - 1][0] * poly[i][1] - poly[i][0] * poly[i - 1][1]
                     for i in range(len(poly)))


def chaikin(poly, rounds=2):
    for _ in range(rounds):
        out = []
        for i, a in enumerate(poly):
            b = poly[(i + 1) % len(poly)]
            out.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]))
            out.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
        poly = out
    return poly


def clip_half(poly, a, b):
    """Keep the part of poly closer to seed a than to seed b (Sutherland-Hodgman)."""
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    nx, ny = b[0] - a[0], b[1] - a[1]

    def side(p):
        return (p[0] - mx) * nx + (p[1] - my) * ny

    out = []
    for i, cur in enumerate(poly):
        prev = poly[i - 1]
        sc, sp = side(cur), side(prev)
        if (sc <= 0) != (sp <= 0):
            t = sp / (sp - sc)
            out.append((prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])))
        if sc <= 0:
            out.append(cur)
    return out


def clean(poly, eps=0.25):
    """Drop near-duplicate and collinear points."""
    pts = []
    for p in poly:
        if not pts or math.dist(p, pts[-1]) > eps:
            pts.append(p)
    if len(pts) > 1 and math.dist(pts[0], pts[-1]) <= eps:
        pts.pop()
    changed = True
    while changed and len(pts) > 3:
        changed = False
        for i in range(len(pts)):
            a, b, c = pts[i - 1], pts[i], pts[(i + 1) % len(pts)]
            cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
            if abs(cross) < 1e-3:
                pts.pop(i)
                changed = True
                break
    return pts


def inset(poly, d):
    """Miter-offset a CCW polygon inwards by d, dropping corners whose short
    edges would flip over (they would self-intersect)."""
    poly = list(poly)
    while True:
        out = miter(poly, d)
        n = len(poly)
        flipped = [i for i in range(n)
                   if (out[(i + 1) % n][0] - out[i][0]) * (poly[(i + 1) % n][0] - poly[i][0])
                   + (out[(i + 1) % n][1] - out[i][1]) * (poly[(i + 1) % n][1] - poly[i][1]) <= 0]
        if not flipped or n <= 4:
            return out
        poly.pop((flipped[0] + 1) % n)


def miter(poly, d):
    out = []
    n = len(poly)
    for i in range(n):
        p0, p1, p2 = poly[i - 1], poly[i], poly[(i + 1) % n]
        normals = []
        for a, b in ((p0, p1), (p1, p2)):
            dx, dy = b[0] - a[0], b[1] - a[1]
            ln = math.hypot(dx, dy)
            normals.append((-dy / ln, dx / ln))
        bx, by = normals[0][0] + normals[1][0], normals[0][1] + normals[1][1]
        bl = math.hypot(bx, by) or 1.0
        bx, by = bx / bl, by / bl
        k = min(d / max(bx * normals[0][0] + by * normals[0][1], 0.35), 3 * d)
        out.append((p1[0] + bx * k, p1[1] + by * k))
    return out


def inside(p, poly):
    x, y = p
    hit = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i - 1], poly[i]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            hit = not hit
    return hit


# ---------------------------------------------------------------- mesh helpers
def slab(name, poly_m, z0, h):
    """Closed prism from a CCW outline in metres, caps triangulated."""
    bm = bmesh.new()
    bot = [bm.verts.new((x, y, z0)) for x, y in poly_m]
    top = [bm.verts.new((x, y, z0 + h)) for x, y in poly_m]
    caps = [bm.faces.new(top), bm.faces.new(list(reversed(bot)))]
    n = len(poly_m)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bmesh.ops.triangulate(bm, faces=caps, quad_method="BEAUTY", ngon_method="BEAUTY")
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def soft_bevel(obj, width, segments=2):
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(50)
    mod.harden_normals = False
    bkit.apply_modifiers(obj)
    bkit.smooth(obj, angle=40)


# ---------------------------------------------------------------- materials
def plastic(name, color, seed):
    ts = tk.physical("plastic_moulded", SIZE, wear=0.1, seed=seed, color=color)
    return tk.material(name, ts)


mat_wood = tk.material("BoardWood", tk.physical("wood_weathered", SIZE, wear=0.05,
                                                seed=3, color="#6b4428"))
mat_sea = plastic("Ocean", "#6fa3c2", 5)
mat_route = plastic("SeaRoute", "#eef3f5", 7)
mat_marker = plastic("ArmyMarker", "#f1e8cf", 9)
mat_land = {key: plastic(f"Land_{key}", col, 11 + i)
            for i, (key, (col, _)) in enumerate(CONTINENTS.items())}

# ---------------------------------------------------------------- board + frame
board = bkit.rounded_box("Board", (BOARD_W, BOARD_D, BASE_H), radius=0.008)
board.location = (0, 0, BASE_H / 2)
bkit.apply_transforms(board)
tk.apply(board, mat_wood)

rails = []
for side, (sx, sy, lx, ly) in {
    "N": (BOARD_W, RAIL_W, 0, BOARD_D / 2 - RAIL_W / 2),
    "S": (BOARD_W, RAIL_W, 0, -BOARD_D / 2 + RAIL_W / 2),
    "E": (RAIL_W, BOARD_D - 2 * RAIL_W, BOARD_W / 2 - RAIL_W / 2, 0),
    "W": (RAIL_W, BOARD_D - 2 * RAIL_W, -BOARD_W / 2 + RAIL_W / 2, 0),
}.items():
    r = bkit.box(f"FrameRail_{side}", size=(sx, sy, RAIL_H),
                 location=(lx, ly, BASE_H + RAIL_H / 2))
    soft_bevel(r, 0.004)
    tk.apply(r, mat_wood)
    rails.append(r)

ocean = bkit.box("Ocean", size=(BOARD_W - 2 * RAIL_W, BOARD_D - 2 * RAIL_W, SEA_H),
                 location=(0, 0, BASE_H + SEA_H / 2))
tk.apply(ocean, mat_sea)

# ---------------------------------------------------------------- territories
territories = {}      # name -> dict(continent, outline, seed)
coast_polys = []      # land outlines (map units) for the sea-route test
for cont, outline, seeds in LANDS:
    poly = chaikin(outline)
    if area(poly) < 0:
        poly.reverse()
    coast_polys.append(poly)
    for name, seed in seeds.items():
        cell = poly
        for other, oseed in seeds.items():
            if other != name:
                cell = clip_half(cell, seed, oseed)
        cell = clean(cell)
        if area(cell) < 0:
            cell.reverse()
        territories[name] = {"continent": cont, "outline": inset(cell, GAP), "seed": seed}

groups = {key: [] for key in CONTINENTS}
meta_territories = []
for name, t in territories.items():
    cont = t["continent"]
    poly_m = [to_m(u, v) for u, v in t["outline"]]
    tile = slab(f"Territory_{name}", poly_m, Z_SEA - SEAT, TILE_H + SEAT)
    soft_bevel(tile, 0.0025)

    # army marker disc where the pawns stand
    sx, sy = to_m(*t["seed"])
    disc = bkit.cylinder(f"Marker_{name}", radius=0.016, depth=0.002,
                         location=(sx, sy, Z_TOP + 0.001), vertices=16)
    soft_bevel(disc, 0.0006, segments=1)
    disc.modifiers.new("Tris", "TRIANGULATE")
    bkit.apply_modifiers(disc)
    tk.apply(tile, mat_land[cont])
    tk.apply(disc, mat_marker)
    tile = bkit.join(f"Territory_{name}", tile, disc)
    bkit.set_origin(tile, (sx, sy, Z_SEA))
    bkit.socket(f"socket_{name}", (sx, sy, Z_TOP + 0.002), tile)
    bkit.allow_overlap(ocean, tile, "tile base seated 0.5 mm into the sea panel")
    groups[cont].append(tile)
    meta_territories.append({
        "name": name, "continent": CONTINENTS[cont][1], "node": f"Territory_{name}",
        "socket": f"socket_{name}",
        # glTF axes: +Y up, front +Z
        "pawn_position": [round(sx, 4), round(Z_TOP + 0.002, 4), round(-sy, 4)],
    })

# ---------------------------------------------------------------- sea routes
def on_water(p, margin=0.9):
    for poly in coast_polys:
        if inside(p, poly):
            return False
        for q in poly:
            if math.dist(p, q) < margin:
                return False
    return True


DASH, PITCH = 0.9, 1.6                 # map units
DASH_W, DASH_H = 0.004, 0.0012         # metres
dash_verts, dash_faces = [], []


def add_dash(p0, p1):
    """Thin printed bar from p0 to p1 (map units), seated 0.5 mm into the sea."""
    (x0, y0), (x1, y1) = to_m(*p0), to_m(*p1)
    ln = math.hypot(x1 - x0, y1 - y0)
    nx, ny = -(y1 - y0) / ln * DASH_W / 2, (x1 - x0) / ln * DASH_W / 2
    base = len(dash_verts)
    for z in (Z_SEA - 0.0005, Z_SEA + DASH_H - 0.0005):
        dash_verts.extend([(x0 - nx, y0 - ny, z), (x1 - nx, y1 - ny, z),
                           (x1 + nx, y1 + ny, z), (x0 + nx, y0 + ny, z)])
    b = base
    dash_faces.extend([(b + 3, b + 2, b + 1, b), (b + 4, b + 5, b + 6, b + 7),
                       (b, b + 1, b + 5, b + 4), (b + 1, b + 2, b + 6, b + 5),
                       (b + 2, b + 3, b + 7, b + 6), (b + 3, b, b + 4, b + 7)])


def route(a, b):
    length = math.dist(a, b)
    dx, dy = (b[0] - a[0]) / length, (b[1] - a[1]) / length
    t = 0.0
    while t + DASH <= length:
        p0 = (a[0] + dx * t, a[1] + dy * t)
        p1 = (a[0] + dx * (t + DASH), a[1] + dy * (t + DASH))
        if on_water(p0) and on_water(p1) and -1.5 < p0[0] < 101.5 and -1.5 < p1[0] < 101.5:
            add_dash(p0, p1)
        t += PITCH


for a, b in SEA_ROUTES:
    route(territories[a]["seed"], territories[b]["seed"])
# Alaska - Kamchatka wraps around the board edges
route(territories["Alaska"]["seed"], (-2.0, territories["Alaska"]["seed"][1]))
route(territories["Kamchatka"]["seed"], (102.0, territories["Kamchatka"]["seed"][1]))
routes = bkit.mesh_from("SeaRoutes", dash_verts, dash_faces, (0, 0, 0))
tk.apply(routes, mat_route)
bkit.allow_overlap(ocean, routes, "printed route bars seated 0.5 mm into the sea panel")

# ---------------------------------------------------------------- hierarchy
for r in rails:
    bkit.parent(r, board)
bkit.parent(ocean, board)
bkit.parent(routes, ocean)
for key, tiles in groups.items():
    piv = bkit.pivot(f"Continent_{key}", (0, 0, Z_SEA), children=tiles)
    bkit.parent(piv, ocean)
root = bkit.root("RiskMap", children=[board])

# ---------------------------------------------------------------- weathering + meta
tk.weathering(0.25, rust=0, mud=0, streaks=0.1, dust=0.3)
bkit.meta("risk_map", {
    "continents": [{"name": CONTINENTS[k][1], "color": CONTINENTS[k][0],
                    "bonus": BONUS[k], "node": f"Continent_{k}",
                    "territories": [t["name"] for t in meta_territories
                                    if t["continent"] == CONTINENTS[k][1]]}
                   for k in CONTINENTS],
    "territories": meta_territories,
    "adjacency": [list(p) for p in ADJACENCY],
    "sea_routes": [list(p) for p in SEA_ROUTES] + [["Alaska", "Kamchatka"]],
})

bkit.sit_on_ground()

RENDER = {"azimuth": 0, "elevation": 55, "zoom": 1.0}
