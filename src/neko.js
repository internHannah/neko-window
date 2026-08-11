(() => {
  const SPRITE = 32;
  const SPEED = 8;
  const TICK_MS = 100;

  const spriteSets = {
    idle: [[-3, -3]],
    alert: [[-7, -3]],
    scratchSelf: [
      [-5, 0],
      [-6, 0],
      [-7, 0],
    ],
    scratchWallN: [
      [0, 0],
      [0, -1],
    ],
    scratchWallS: [
      [-7, -1],
      [-6, -2],
    ],
    scratchWallE: [
      [-2, -2],
      [-2, -3],
    ],
    scratchWallW: [
      [-4, 0],
      [-4, -1],
    ],
    tired: [[-3, -2]],
    sleeping: [
      [-2, 0],
      [-2, -1],
    ],
    N: [
      [-1, -2],
      [-1, -3],
    ],
    NE: [
      [0, -2],
      [0, -3],
    ],
    E: [
      [-3, 0],
      [-3, -1],
    ],
    SE: [
      [-5, -1],
      [-5, -2],
    ],
    S: [
      [-6, -3],
      [-7, -2],
    ],
    SW: [
      [-5, -3],
      [-6, -1],
    ],
    W: [
      [-4, -2],
      [-4, -3],
    ],
    NW: [
      [-1, 0],
      [-1, -1],
    ],
  };

  /** @type {'idle' | 'walk' | 'sleep' | 'wake' | 'water'} */
  let state = "idle";
  let paused = false;
  let frameCount = 0;
  let stateFrame = 0;
  let idleTime = 0;
  let waterFramesLeft = 0;

  let nekoX = 80;
  let nekoY = 80;
  let targetX = 200;
  let targetY = 200;
  let mouseX = 0;
  let mouseY = 0;

  const nekoEl = document.getElementById("neko");
  const bubbleEl = document.getElementById("bubble");

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function setSprite(name, frame) {
    const frames = spriteSets[name];
    if (!frames) return;
    const sprite = frames[frame % frames.length];
    nekoEl.style.backgroundPosition = `${sprite[0] * SPRITE}px ${sprite[1] * SPRITE}px`;
  }

  function placeNeko() {
    nekoEl.style.left = `${nekoX - 16}px`;
    nekoEl.style.top = `${nekoY - 16}px`;
  }

  function placeBubble() {
    bubbleEl.style.left = `${nekoX}px`;
    bubbleEl.style.top = `${nekoY - 20}px`;
  }

  function pickNewTarget() {
    const margin = 40;
    targetX = margin + Math.random() * (window.innerWidth - margin * 2);
    targetY = margin + Math.random() * (window.innerHeight - margin * 2);
  }

  function directionToward(dx, dy, distance) {
    let direction = "";
    direction += dy / distance > 0.5 ? "N" : "";
    direction += dy / distance < -0.5 ? "S" : "";
    direction += dx / distance > 0.5 ? "W" : "";
    direction += dx / distance < -0.5 ? "E" : "";
    return direction || "idle";
  }

  function enterIdle() {
    state = "idle";
    stateFrame = 0;
    idleTime = 0;
  }

  function enterWalk() {
    state = "walk";
    stateFrame = 0;
    pickNewTarget();
  }

  function enterSleep() {
    state = "sleep";
    stateFrame = 0;
  }

  function enterWake() {
    state = "wake";
    stateFrame = 0;
  }

  function enterWater() {
    state = "water";
    stateFrame = 0;
    waterFramesLeft = 50; // ~5 seconds
    nekoEl.classList.add("water-mode");
    bubbleEl.classList.remove("hidden");
    placeBubble();
  }

  function leaveWaterVisual() {
    nekoEl.classList.remove("water-mode");
    bubbleEl.classList.add("hidden");
  }

  function tickIdle() {
    idleTime += 1;
    setSprite("idle", 0);

    // Occasional scratch
    if (idleTime > 20 && Math.floor(Math.random() * 40) === 0) {
      const anim = Math.random() < 0.5 ? "scratchSelf" : null;
      if (anim) {
        setSprite(anim, stateFrame);
        stateFrame += 1;
        if (stateFrame > 9) {
          stateFrame = 0;
        }
        return;
      }
    }

    // Sleep after ~8–12 seconds idle
    if (idleTime > 80 + Math.floor(Math.random() * 40)) {
      enterSleep();
      return;
    }

    // Start roaming
    if (idleTime > 25 && Math.floor(Math.random() * 30) === 0) {
      enterWalk();
    }
  }

  function tickWalk() {
    const dx = nekoX - targetX;
    const dy = nekoY - targetY;
    const distance = Math.hypot(dx, dy);

    // Soft interest in the mouse if nearby
    const mouseDist = Math.hypot(nekoX - mouseX, nekoY - mouseY);
    if (mouseDist < 120 && mouseDist > 48) {
      targetX = mouseX;
      targetY = mouseY;
    }

    if (distance < SPEED || distance < 16) {
      enterIdle();
      return;
    }

    const dir = directionToward(dx, dy, distance);
    if (dir === "idle") {
      setSprite("idle", 0);
    } else {
      setSprite(dir, frameCount);
    }

    nekoX -= (dx / distance) * SPEED;
    nekoY -= (dy / distance) * SPEED;
    nekoX = clamp(nekoX, 16, window.innerWidth - 16);
    nekoY = clamp(nekoY, 16, window.innerHeight - 16);
    placeNeko();

    // Sometimes stop mid-wander to nap
    stateFrame += 1;
    if (stateFrame > 120 && Math.floor(Math.random() * 80) === 0) {
      enterIdle();
    }
  }

  function tickSleep() {
    if (stateFrame < 8) {
      setSprite("tired", 0);
    } else {
      setSprite("sleeping", Math.floor(stateFrame / 4));
    }
    stateFrame += 1;

    // Wake after ~12–20 seconds
    if (stateFrame > 120 + Math.floor(Math.random() * 80)) {
      enterWake();
    }
  }

  function tickWake() {
    setSprite("alert", 0);
    stateFrame += 1;
    if (stateFrame > 8) {
      enterWalk();
    }
  }

  function tickWater() {
    setSprite("alert", 0);
    placeBubble();
    waterFramesLeft -= 1;
    stateFrame += 1;

    // Wiggle toward center-ish while reminding
    if (stateFrame % 5 === 0) {
      nekoY = clamp(nekoY + (Math.random() < 0.5 ? -2 : 2), 16, window.innerHeight - 16);
      placeNeko();
    }

    if (waterFramesLeft <= 0) {
      leaveWaterVisual();
      enterIdle();
    }
  }

  function frame() {
    if (paused && state !== "water") {
      setSprite("sleeping", Math.floor(frameCount / 8));
      return;
    }

    frameCount += 1;

    switch (state) {
      case "idle":
        tickIdle();
        break;
      case "walk":
        tickWalk();
        break;
      case "sleep":
        tickSleep();
        break;
      case "wake":
        tickWake();
        break;
      case "water":
        tickWater();
        break;
      default:
        enterIdle();
    }
  }

  document.addEventListener("mousemove", (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });

  window.addEventListener("resize", () => {
    nekoX = clamp(nekoX, 16, window.innerWidth - 16);
    nekoY = clamp(nekoY, 16, window.innerHeight - 16);
    placeNeko();
  });

  if (window.nekoBridge) {
    window.nekoBridge.onPause(({ paused: next }) => {
      paused = !!next;
      if (paused) {
        leaveWaterVisual();
        state = "sleep";
        stateFrame = 8;
      } else {
        enterWake();
      }
    });

    window.nekoBridge.onWater(() => {
      leaveWaterVisual();
      enterWater();
    });
  }

  placeNeko();
  setSprite("idle", 0);
  pickNewTarget();

  let last = 0;
  function loop(timestamp) {
    if (!last) last = timestamp;
    if (timestamp - last >= TICK_MS) {
      last = timestamp;
      frame();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
