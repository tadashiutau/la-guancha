# La Guancha Street View reference index

For Claude's visual pass on **Chavos en La Guancha**. Open the panorama links in
Google Maps and compare the view with the corresponding place in the game. This
folder stores links and location metadata, not Google imagery.

## How to use it

1. Open [`panoramas.csv`](panoramas.csv) or a link in the table below.
2. Locate the reference in the level using `game_x` and `game_z` from the CSV.
   These are ground-plane coordinates used by `js/level.js`, rounded to 0.1
   game units. The panorama camera is often on a road beside the named area,
   not at the center of the in-game landmark.
3. Rotate the live panorama to inspect the whole surroundings. Use its capture
   date before choosing details for the game: **2016 views are historical**;
   the **2025 views** are more useful for current approaches and park edges.
4. Use the views for a stylized sense of place. Check present-day structures
   against the game's existing OpenStreetMap and satellite-derived data. Do not
   trace geometry or copy texture pixels from Street View.

The local-to-game conversion follows the repository's `tools/common.py`,
`js/data.js` and `js/level.js`:

```text
real_x_east_m = (longitude - (-66.6135)) * 111320 * cos(17.9655°)
real_y_north_m = (latitude  - 17.9655)   * 110600
game_x = real_x_east_m * 0.6
game_z = -real_y_north_m * 0.6
```

Coordinates identify the panorama camera, not a surveyed building footprint.
The `area` labels are approximate game navigation tags. A few Maps panorama
pages carry broad or misleading place titles; use their coordinates and the
map pin to orient yourself.

## Start here

| Area in game | Capture | Live panorama | What to inspect |
| --- | --- | --- | --- |
| Park's north road | Apr 2025 | [Park approach](https://www.google.com/maps/@?api=1&map_action=pano&pano=JhM_LI_PQBghJ4oOxUMn6Q&viewpoint=17.9664127%2C-66.612913&heading=111.37&pitch=0&fov=80) | Park boundary and approach |
| Park's south road | Apr 2016 | [Park edge](https://www.google.com/maps/@?api=1&map_action=pano&pano=bWfsy35VdOZyt7R89btN0w&viewpoint=17.9657532%2C-66.6133916&heading=85.18&pitch=0&fov=80) | Historical park edge |
| North entrance | Apr 2025 | [Entrance road](https://www.google.com/maps/@?api=1&map_action=pano&pano=wJfrlqLbE9lFzO6YMZ3PPg&viewpoint=17.9661478%2C-66.6134706&heading=58.06&pitch=0&fov=80) | Entrance and park direction |
| Main plaza / parking | Apr 2025 | [Plaza approach](https://www.google.com/maps/@?api=1&map_action=pano&pano=LOGU5M9pmg16k8DurBCoNA&viewpoint=17.9659976%2C-66.6137251&heading=273.70&pitch=0&fov=80) | Open space near the kiosks |
| North boardwalk | May 2016 | [North end](https://www.google.com/maps/@?api=1&map_action=pano&pano=06mkT5Y7XOILdJxFFbswmw&viewpoint=17.9666356%2C-66.6157699&heading=27.36&pitch=0&fov=80) | Historical waterfront end |
| North boardwalk | May 2016 | [Boardwalk walk](https://www.google.com/maps/@?api=1&map_action=pano&pano=nv8xU50_hIi6D4x2U88zBA&viewpoint=17.9655381%2C-66.6150273&heading=54.78&pitch=0&fov=80) | Walking level and water edge |
| North / middle kiosks | May 2016 | [Kiosk frontage](https://www.google.com/maps/@?api=1&map_action=pano&pano=MRTtacufePICGFg0Wbzwhw&viewpoint=17.9657512%2C-66.6151272&heading=50.99&pitch=0&fov=80) | Kiosk scale from the walk |
| Middle boardwalk | May 2016 | [Land-facing walk](https://www.google.com/maps/@?api=1&map_action=pano&pano=xpHNYndtC8JNPWZ8_swnvw&viewpoint=17.9658949%2C-66.6151407&heading=307.33&pitch=0&fov=80) | Kiosk-side public space |
| South boardwalk | May 2016 | [South kiosks](https://www.google.com/maps/@?api=1&map_action=pano&pano=iBtQZrdesLDqBVvAYfOAgg&viewpoint=17.9652529%2C-66.6147599&heading=59.48&pitch=0&fov=80) | Southern kiosk stretch |
| Tower approach | May 2016 | [Tower-side walk](https://www.google.com/maps/@?api=1&map_action=pano&pano=Rj8BEgULaxbZmOv9e-UXXw&viewpoint=17.964525%2C-66.6139987&heading=207.85&pitch=0&fov=80) | Southern promenade; lower image quality |
| Tower / south terminus | May 2016 | [South terminus](https://www.google.com/maps/@?api=1&map_action=pano&pano=lQ1Kw1mfHc4PXUvDx_JiYA&viewpoint=17.9642938%2C-66.6139411&heading=317.95&pitch=0&fov=80) | Tower-area ground treatment |

To browse additional live coverage, [open the area in satellite mode](https://www.google.com/maps/@?api=1&map_action=map&center=17.9657%2C-66.6148&zoom=18&basemap=satellite) and select **Browse Street View images**. Blue lines mark imagery; coverage on the boardwalk is substantially older than imagery on some nearby roads.

## Source and reuse

These links were checked in Google Maps on 2026-09-25. Capture dates are the
dates displayed in Maps, not the date of this catalog. The views remain hosted
by Google; a panorama ID may disappear or be replaced. Google and any
contributing imagery providers retain their imagery rights and attribution in
the Google Maps viewer.

Google's [Geo Guidelines](https://about.google/brand-resource-center/products-and-services/geo-guidelines/)
allow linking to Street View, but disallow screenshots, downloading images for
offline use, or extracting/tracing information from the imagery. The links use
Google's documented [Maps panorama URL format](https://developers.google.com/maps/documentation/urls/get-started#displaying-a-street-view-panorama).
