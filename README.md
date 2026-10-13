# Roomfit AR

A phone web app that uses your iPhone camera to scan a wall, check whether an
object fits, and pin it in place. Turn away and come back, and it's still there.

**Objects included:** Clock (shows the real time), Painting, Mirror, Wall shelf
(wall items) · Dresser, Bookcase, Floor plant, Floor lamp (floor items).

---

## Run it

You need [Node.js](https://nodejs.org) 20 or newer on your computer.

```bash
cd room-ar
npm install
npm run dev
```

The terminal prints something like:

```
➜  Local:   https://localhost:5173/
➜  Network: https://192.168.1.23:5173/
```

1. Make sure your iPhone is on the **same Wi‑Fi** as the computer.
2. Open the **Network** address (the `https://192.168…` one) in iPhone Safari.
3. Safari warns "This Connection Is Not Private" (the dev certificate is self-signed).
   Tap **Show Details → visit this website → Visit Website**.
4. Tap **Start camera**, then **Allow** for both Motion & Orientation and Camera.

> It must be `https://`. iPhone Safari blocks the camera and motion sensors on plain `http://` pages.

### No-warning option: put it online (free)

```bash
npm run build
```

Drag the `dist` folder onto <https://app.netlify.com/drop>. You get a proper
`https://….netlify.app` link that opens on any phone with no certificate warning.

**Tip:** In Safari, tap Share → **Add to Home Screen** for a full-screen app icon.

---

## How to use it

1. **Stand in one spot.** You can turn and tilt the phone, but don't walk around.
2. **Lock a wall:** put the circle on the line where the wall meets the floor and tap **Lock wall**.
   Repeat with **+ Wall** for other walls (re-locking the same wall just updates it).
3. **Pick an object** from the tray. A see-through preview follows the circle:
   - **Green**: it fits. Tap **Place**.
   - **Red**: the hint explains why, e.g. *"Won't fit — dresser is 1.22 m wide, space is 85 cm"*,
     *"Wall isn't clear here"*, or *"Overlaps the clock"*.
4. Floor items show a bar along the wall with the free width they found.
5. **Measure** lets you mark the left and right edges of a space by hand. Floor items
   placed inside a measured space use your measurement instead of the automatic scan.
6. Tap a placed object to select it: **Remove**, or **View in AR**.

### View in AR (Apple Quick Look)

Opens the selected object in iOS's built-in AR viewer, which has full
world tracking. You can walk around it there, and it detects real walls and floors.

---

## How it works (and its limits)

iPhone Safari doesn't give web pages access to Apple's ARKit world tracking, so the
main view is built from what Safari *does* allow:

| Piece | What it does |
|---|---|
| **Gyroscope** (`orientation.js`) | Rotates the 3D camera exactly as the phone rotates, so objects stay pinned in the room when you turn. |
| **Distance from tilt** | Aiming at the wall's base, the phone's tilt plus its height above the floor gives the distance to the wall (simple trigonometry). |
| **Scan** (`vision.js`) | Finds edges in the camera image. Plain wall has few edges; furniture, frames, switches, door frames and corners have many. The red cells on screen are "occupied", the dots are "clear". |
| **Fit check** (`room.js`) | Wall items: is the area under the object clear? Floor items: how far does clear wall extend left and right? Compares that with the object's real width. Also checks for collisions with things you've already placed. |

Because of this:

- **Walking breaks the illusion.** Turning in place is fine. If you move, tap **+ Wall** and
  re-lock the walls, or use **View in AR** for walk-around viewing.
- **Distances are estimates.** If sizes look off, open Settings and set **Phone height**
  to how high you actually hold the phone. **Measure** gives the most reliable widths.
- **If objects slide when you turn**, adjust **Camera field of view** in Settings.
- **If plain wall shows as occupied** (or furniture shows as clear), adjust **Scan sensitivity**.
- Placed objects last until you reload the page.

## Project layout

```
room-ar/
├── index.html            app shell and UI
├── vite.config.js        HTTPS dev server reachable from your phone
├── public/               app icon + home-screen manifest
└── src/
    ├── main.js           app flow, UI, render loop
    ├── orientation.js    gyroscope → camera rotation
    ├── camera.js         rear camera + matching the 3D view to it
    ├── vision.js         edge-based "is this area empty?" scan
    ├── room.js           walls, placed objects, fit checks
    ├── objects.js        the 8 built-in 3D objects (real-world sizes)
    ├── quicklook.js      export to USDZ for Apple AR Quick Look
    └── style.css
```

**Add your own object:** write a `build` function in `src/objects.js` that returns a
`THREE.Group` sized in metres, and add an entry to `CATALOG` with `mount: 'wall'` or
`mount: 'floor'`. The fit checks read the size from the model automatically.
