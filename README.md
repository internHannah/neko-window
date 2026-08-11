# Pink Neko Window

A pink desktop neko that stays on top of your Windows desktop, roams around, naps, and reminds you to drink water.

## Requirements

- Node.js 18+ (LTS recommended)
- Windows 10/11

## Setup

Needs Node.js 18+ on your PATH (or the portable copy under `.tools/node` if you used that).

```bash
npm install
npm start
```

Or double-click `start.cmd` after `npm install`.

The neko appears as a transparent always-on-top overlay.

### Interact with the cat

| Action | What happens |
|--------|----------------|
| Move the mouse | Neko **chases** your cursor (classic oneko style) |
| Click the neko | **Pet** — happy scratch + wiggle |
| Drag the neko | Pick it up and place it somewhere else |
| Elsewhere on screen | Clicks pass through so you can keep working |

Also control it from the **system tray** icon:

| Tray action | What it does |
|-------------|----------------|
| Pause / Resume | Freezes or wakes the neko |
| Drink now | Cute water cue + Windows toast |
| Water every… | 30 / 45 / 60 minute reminder interval |
| Quit | Exit the app |

## How it works

- **Electron main** (`electron/main.js`) creates the overlay window, tray menu, reminder timer, and Windows notifications.
- **Renderer** (`src/neko.js`) runs chase / idle / sleep / wake / pet / drag / water using a classic oneko-style sprite sheet tinted pink.
- The overlay is click-through except when the cursor is over the neko (or while dragging).

## Manual test checklist

1. `npm start` — pink neko appears over the desktop.
2. Watch it walk, idle, sleep, and wake.
3. Tray → **Drink now** — bubble + bounce animation and a Windows toast.
4. Confirm other apps still receive clicks (click-through).

## Credits

Sprite layout compatible with [adryd325/oneko.js](https://github.com/adryd325/oneko.js) (MIT).
