(() => {
  const SPRITE = 32;
  const DISPLAY = 64; // 2x for easier petting
  const SPEED = 12;
  const TICK_MS = 100;
  const CATCH_DISTANCE = 56;
  const DRAG_THRESHOLD = 5;

  const spriteSets = {
    idle: [[-3, -3]],
    alert: [[-7, -3]],
    scratchSelf: [
      [-5, 0],
      [-6, 0],
      [-7, 0],
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

  /** @type {'idle' | 'chase' | 'sleep' | 'wake' | 'water' | 'pet' | 'drag'} */
  let state = "idle";
  let paused = false;
  let frameCount = 0;
  let stateFrame = 0;
  let idleTime = 0;
  let waterFramesLeft = 0;
  let petFramesLeft = 0;

  let nekoX = 120;
  let nekoY = 120;
  let mouseX = 120;
  let mouseY = 120;

  let pointerDown = false;
  let didDrag = false;
  let downX = 0;
  let downY = 0;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const nekoEl = document.getElementById("neko");
  const bubbleEl = document.getElementById("bubble");
  const half = DISPLAY / 2;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function setSprite(name, frame) {
    const frames = spriteSets[name];
    if (!frames) return;
    const sprite = frames[frame % frames.length];
    const scale = DISPLAY / SPRITE;
    nekoEl.style.backgroundPosition = `${sprite[0] * SPRITE * scale}px ${
      sprite[1] * SPRITE * scale
    }px`;
  }

  function reportBounds() {
    if (window.nekoBridge) {
      window.nekoBridge.reportBounds({
        x: nekoX - half,
        y: nekoY - half,
        w: DISPLAY,
        h: DISPLAY,
      });
    }
  }

  function placeNeko() {
    nekoEl.style.left = `${nekoX - half}px`;
    nekoEl.style.top = `${nekoY - half}px`;
    reportBounds();
  }

  function placeBubble() {
    bubbleEl.style.left = `${nekoX}px`;
    bubbleEl.style.top = `${nekoY - half - 8}px`;
  }

  function setInteractive(active) {
    if (window.nekoBridge) {
      window.nekoBridge.setInteractive(active);
    }
  }

  function directionToward(dx, dy, distance) {
    let direction = "";
    direction += dy / distance > 0.5 ? "N" : "";
    direction += dy / distance < -0.5 ? "S" : "";
    direction += dx / distance > 0.5 ? "W" : "";
    direction += dx / distance < -0.5 ? "E" : "";
    return direction || "idle";
  }

  function isOverNeko(x, y) {
    return (
      x >= nekoX - half - 10 &&
      x <= nekoX + half + 10 &&
      y >= nekoY - half - 10 &&
      y <= nekoY + half + 10
    );
  }

  function enterIdle() {
    state = "idle";
    stateFrame = 0;
    idleTime = 0;
    nekoEl.classList.remove("pet-mode", "drag-mode");
  }

  function enterChase() {
    state = "chase";
    stateFrame = 0;
    idleTime = 0;
    nekoEl.classList.remove("pet-mode", "drag-mode");
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
    waterFramesLeft = 50;
    nekoEl.classList.remove("pet-mode", "drag-mode");
    nekoEl.classList.add("water-mode");
    bubbleEl.classList.remove("hidden");
    placeBubble();
  }

  function leaveWaterVisual() {
    nekoEl.classList.remove("water-mode");
    bubbleEl.classList.add("hidden");
  }

  function enterPet() {
    state = "pet";
    stateFrame = 0;
    petFramesLeft = 20;
    idleTime = 0;
    nekoEl.classList.add("pet-mode");
    nekoEl.classList.remove("drag-mode");
  }

  function enterDrag() {
    state = "drag";
    stateFrame = 0;
    idleTime = 0;
    leaveWaterVisual();
    nekoEl.classList.remove("pet-mode");
    nekoEl.classList.add("drag-mode");
    setInteractive(true);
  }

  function tickIdle() {
    idleTime += 1;
    const dx = nekoX - mouseX;
    const dy = nekoY - mouseY;
    const distance = Math.hypot(dx, dy);

    if (distance >= CATCH_DISTANCE) {
      if (idleTime > 1) {
        setSprite("alert", 0);
        idleTime = Math.min(idleTime, 7);
        idleTime -= 1;
        if (idleTime <= 1) enterChase();
        return;
      }
      enterChase();
      return;
    }

    if (idleTime > 20 && Math.floor(Math.random() * 80) === 0) {
      setSprite("scratchSelf", stateFrame);
      stateFrame += 1;
      if (stateFrame > 9) stateFrame = 0;
      return;
    }

    setSprite("idle", 0);
    if (idleTime > 120 + Math.floor(Math.random() * 40)) {
      enterSleep();
    }
  }

  function tickChase() {
    const dx = nekoX - mouseX;
    const dy = nekoY - mouseY;
    const distance = Math.hypot(dx, dy);

    if (distance < SPEED || distance < CATCH_DISTANCE) {
      enterIdle();
      return;
    }

    const dir = directionToward(dx, dy, distance);
    if (dir === "idle") setSprite("idle", 0);
    else setSprite(dir, frameCount);

    nekoX -= (dx / distance) * SPEED;
    nekoY -= (dy / distance) * SPEED;
    nekoX = clamp(nekoX, half, window.innerWidth - half);
    nekoY = clamp(nekoY, half, window.innerHeight - half);
    placeNeko();
  }

  function tickSleep() {
    if (Math.hypot(nekoX - mouseX, nekoY - mouseY) >= CATCH_DISTANCE + 24) {
      enterWake();
      return;
    }
    if (stateFrame < 8) setSprite("tired", 0);
    else setSprite("sleeping", Math.floor(stateFrame / 4));
    stateFrame += 1;
    if (stateFrame > 160) enterWake();
  }

  function tickWake() {
    setSprite("alert", 0);
    stateFrame += 1;
    if (stateFrame > 8) enterChase();
  }

  function tickWater() {
    setSprite("alert", 0);
    placeBubble();
    waterFramesLeft -= 1;
    stateFrame += 1;
    if (waterFramesLeft <= 0) {
      leaveWaterVisual();
      enterIdle();
    }
  }

  function tickPet() {
    setSprite("scratchSelf", Math.floor(stateFrame / 2));
    stateFrame += 1;
    petFramesLeft -= 1;
    if (petFramesLeft <= 0) {
      nekoEl.classList.remove("pet-mode");
      enterIdle();
    }
  }

  function tickDrag() {
    setSprite("alert", 0);
  }

  function frame() {
    if (paused && state !== "water" && state !== "drag" && state !== "pet") {
      setSprite("sleeping", Math.floor(frameCount / 8));
      return;
    }

    frameCount += 1;
    switch (state) {
      case "idle":
        tickIdle();
        break;
      case "chase":
        tickChase();
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
      case "pet":
        tickPet();
        break;
      case "drag":
        tickDrag();
        break;
      default:
        enterIdle();
    }
  }

  function onPointerMove(event) {
    // Prefer OS cursor from main; still track local events while interactive
    if (pointerDown || state === "drag" || !window.nekoBridge) {
      mouseX = event.clientX;
      mouseY = event.clientY;
    }

    if (pointerDown && !didDrag) {
      if (Math.hypot(event.clientX - downX, event.clientY - downY) >= DRAG_THRESHOLD) {
        didDrag = true;
        enterDrag();
      }
    }

    if (state === "drag" || (pointerDown && didDrag)) {
      mouseX = event.clientX;
      mouseY = event.clientY;
      nekoX = clamp(event.clientX - dragOffsetX, half, window.innerWidth - half);
      nekoY = clamp(event.clientY - dragOffsetY, half, window.innerHeight - half);
      placeNeko();
    }
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    if (!isOverNeko(event.clientX, event.clientY)) return;

    event.preventDefault();
    event.stopPropagation();
    pointerDown = true;
    didDrag = false;
    downX = event.clientX;
    downY = event.clientY;
    dragOffsetX = event.clientX - nekoX;
    dragOffsetY = event.clientY - nekoY;
    setInteractive(true);
  }

  function onPointerUp(event) {
    if (!pointerDown) return;
    pointerDown = false;

    if (didDrag || state === "drag") {
      didDrag = false;
      nekoEl.classList.remove("drag-mode");
      setInteractive(false);
      enterIdle();
    } else if (isOverNeko(event.clientX, event.clientY)) {
      leaveWaterVisual();
      enterPet();
      setInteractive(false);
    } else {
      setInteractive(false);
    }
  }

  nekoEl.addEventListener("mousedown", onPointerDown);
  document.addEventListener("mousemove", onPointerMove);
  document.addEventListener("mouseup", onPointerUp);
  window.addEventListener("blur", () => {
    pointerDown = false;
    didDrag = false;
    setInteractive(false);
    if (state === "drag") {
      nekoEl.classList.remove("drag-mode");
      enterIdle();
    }
  });

  window.addEventListener("resize", () => {
    nekoX = clamp(nekoX, half, window.innerWidth - half);
    nekoY = clamp(nekoY, half, window.innerHeight - half);
    placeNeko();
  });

  if (window.nekoBridge) {
    window.nekoBridge.onCursor(({ x, y }) => {
      if (state === "drag" || pointerDown) return;
      mouseX = x;
      mouseY = y;
    });

    window.nekoBridge.onPause(({ paused: next }) => {
      paused = !!next;
      if (paused) {
        leaveWaterVisual();
        nekoEl.classList.remove("pet-mode", "drag-mode");
        setInteractive(false);
        state = "sleep";
        stateFrame = 8;
      } else {
        enterWake();
      }
    });

    window.nekoBridge.onWater(() => {
      if (state === "drag") return;
      leaveWaterVisual();
      enterWater();
    });
  }

  placeNeko();
  setSprite("idle", 0);

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
