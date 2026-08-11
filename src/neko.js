(() => {
  const WIDTH = 96;
  const HEIGHT = 120;
  const HALF_W = WIDTH / 2;
  const HALF_H = HEIGHT / 2;
  const SPEED = 11;
  const TICK_MS = 100;
  const CATCH_DISTANCE = 72;
  const DRAG_THRESHOLD = 5;

  /** @type {'idle' | 'chase' | 'sleep' | 'wake' | 'water' | 'pet' | 'drag'} */
  let state = "idle";
  let paused = false;
  let frameCount = 0;
  let stateFrame = 0;
  let idleTime = 0;
  let waterFramesLeft = 0;
  let petFramesLeft = 0;

  let nekoX = 140;
  let nekoY = 140;
  let mouseX = 140;
  let mouseY = 140;

  let pointerDown = false;
  let didDrag = false;
  let downX = 0;
  let downY = 0;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const nekoEl = document.getElementById("neko");
  const bubbleEl = document.getElementById("bubble");
  const faceClasses = [
    "face-n",
    "face-ne",
    "face-e",
    "face-se",
    "face-s",
    "face-sw",
    "face-w",
    "face-nw",
  ];
  const poseClasses = ["chasing", "sleeping", "alert"];

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function clearPose() {
    nekoEl.classList.remove(...poseClasses);
  }

  function setFace(dir) {
    const map = {
      N: "face-n",
      NE: "face-ne",
      E: "face-e",
      SE: "face-se",
      S: "face-s",
      SW: "face-sw",
      W: "face-w",
      NW: "face-nw",
      idle: "face-s",
      alert: "face-s",
    };
    nekoEl.classList.remove(...faceClasses);
    nekoEl.classList.add(map[dir] || "face-s");
  }

  function setPose(pose) {
    clearPose();
    if (pose) nekoEl.classList.add(pose);
  }

  function reportBounds() {
    if (window.nekoBridge) {
      window.nekoBridge.reportBounds({
        x: nekoX - HALF_W,
        y: nekoY - HALF_H,
        w: WIDTH,
        h: HEIGHT,
      });
    }
  }

  function placeNeko() {
    nekoEl.style.left = `${nekoX - HALF_W}px`;
    nekoEl.style.top = `${nekoY - HALF_H}px`;
    reportBounds();
  }

  function placeBubble() {
    bubbleEl.style.left = `${nekoX}px`;
    bubbleEl.style.top = `${nekoY - HALF_H - 8}px`;
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
      x >= nekoX - HALF_W - 8 &&
      x <= nekoX + HALF_W + 8 &&
      y >= nekoY - HALF_H - 8 &&
      y <= nekoY + HALF_H + 8
    );
  }

  function enterIdle() {
    state = "idle";
    stateFrame = 0;
    idleTime = 0;
    setPose(null);
    setFace("idle");
    nekoEl.classList.remove("pet-mode", "drag-mode");
  }

  function enterChase() {
    state = "chase";
    stateFrame = 0;
    idleTime = 0;
    setPose("chasing");
    nekoEl.classList.remove("pet-mode", "drag-mode");
  }

  function enterSleep() {
    state = "sleep";
    stateFrame = 0;
    setPose("sleeping");
  }

  function enterWake() {
    state = "wake";
    stateFrame = 0;
    setPose("alert");
  }

  function enterWater() {
    state = "water";
    stateFrame = 0;
    waterFramesLeft = 50;
    setPose("alert");
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
    petFramesLeft = 22;
    idleTime = 0;
    setPose(null);
    setFace("idle");
    nekoEl.classList.add("pet-mode");
    nekoEl.classList.remove("drag-mode");
  }

  function enterDrag() {
    state = "drag";
    stateFrame = 0;
    idleTime = 0;
    leaveWaterVisual();
    setPose("alert");
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
        setPose("alert");
        idleTime = Math.min(idleTime, 7);
        idleTime -= 1;
        if (idleTime <= 1) enterChase();
        return;
      }
      enterChase();
      return;
    }

    setPose(null);
    setFace("idle");
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
    setPose("chasing");
    setFace(dir);

    nekoX -= (dx / distance) * SPEED;
    nekoY -= (dy / distance) * SPEED;
    nekoX = clamp(nekoX, HALF_W, window.innerWidth - HALF_W);
    nekoY = clamp(nekoY, HALF_H, window.innerHeight - HALF_H);
    placeNeko();
  }

  function tickSleep() {
    if (Math.hypot(nekoX - mouseX, nekoY - mouseY) >= CATCH_DISTANCE + 24) {
      enterWake();
      return;
    }
    setPose("sleeping");
    stateFrame += 1;
    if (stateFrame > 160) enterWake();
  }

  function tickWake() {
    setPose("alert");
    stateFrame += 1;
    if (stateFrame > 8) enterChase();
  }

  function tickWater() {
    setPose("alert");
    placeBubble();
    waterFramesLeft -= 1;
    stateFrame += 1;
    if (waterFramesLeft <= 0) {
      leaveWaterVisual();
      enterIdle();
    }
  }

  function tickPet() {
    stateFrame += 1;
    petFramesLeft -= 1;
    if (petFramesLeft <= 0) {
      nekoEl.classList.remove("pet-mode");
      enterIdle();
    }
  }

  function tickDrag() {
    setPose("alert");
  }

  function frame() {
    if (paused && state !== "water" && state !== "drag" && state !== "pet") {
      setPose("sleeping");
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
      nekoX = clamp(event.clientX - dragOffsetX, HALF_W, window.innerWidth - HALF_W);
      nekoY = clamp(event.clientY - dragOffsetY, HALF_H, window.innerHeight - HALF_H);
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
    nekoX = clamp(nekoX, HALF_W, window.innerWidth - HALF_W);
    nekoY = clamp(nekoY, HALF_H, window.innerHeight - HALF_H);
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
        setPose("sleeping");
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
  enterIdle();

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
