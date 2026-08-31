# Doraemon Desktop

Shimeji-style Doraemon companion for Windows: walks, climbs, falls, chases your cursor across monitors, and reminds you to drink water.

## Setup

```bash
npm install
npm start
```

Or double-click `start.cmd` (stops any previous instance first).

### Interact

| Action | What happens |
|--------|----------------|
| Autonomously | Walk, run, chase, sit, sleep, climb, fall, greet, play |
| Move near while sleeping | Wakes up |
| Click | Pet |
| Double-click | Happy jump |
| Drag | Pick up and throw |
| Right-click | Open tray menu |
| Away from mouse ~2 min | Naps; says “okaeri!” when you return |
| Overdue for water | Soft blue glow + thirsty chatter |

### Tray / shortcuts

| Control | What it does |
|---------|----------------|
| Pause / Resume | `Ctrl+Shift+P` |
| Drink now | `Ctrl+Shift+D` |
| Come here | `Ctrl+Shift+H` — walks to screen center |
| Follow cursor | `Ctrl+Shift+F` — keeps chasing the pointer |
| I drank water ✓ | Logs drink, daily count, streak milestones |
| Snooze / Quiet hours / Mute | Reminder options |
| Size / Animation speed | Small–Large, Slow–Fast |
| Start with Windows | Login item |

Settings are saved under Electron userData (`settings.json`).

### Credits

- Behavior inspired by [AlleyBo55/doraemon](https://github.com/AlleyBo55/doraemon) (MIT)
- Sprites from **Cachomon** — [Doraemon Shimeji FREE](https://www.deviantart.com/cachomon/art/Doraemon-Shimeji-FREE-505596307)
- Doraemon © Fujiko F. Fujio / Shogakukan — unofficial fan project
