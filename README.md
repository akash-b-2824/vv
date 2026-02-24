# 3D Car Racing (HTML/CSS/JS + Three.js)

## Run
- Open `index.html` in a modern browser (Chrome/Edge/Firefox) — no build needed.
- If you see CORS errors on some browsers when opening from file system, start a local server:

```bash
# Python 3
python -m http.server 8080
# then open http://localhost:8080/index.html
```

## Controls
- Keyboard: W / Up = accelerate, S / Down = brake, A / Left = steer left, D / Right = steer right, R = reset.
- Mobile: on-screen buttons.

## Notes
- Basic physics and simple track-boundary logic keep the car near the racing line.
- Complete 3 laps to finish; HUD shows speed, lap, and timer.
