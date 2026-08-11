(() => {
  const cfg = window.DORA_SPRITES;
  const SIZE = cfg.size;
  const GROUND_MARGIN = 8;
  const WALK_SPEED = 2.2;
  const RUN_SPEED = 4;
  const CLIMB_SPEED = 2;
  const GRAVITY = 0.55;
  const MAX_FALL = 14;
  const DRAG_THRESHOLD = 5;

  const nekoEl = document.getElementById("neko");
  const spriteEl = document.getElementById("sprite");
  const bubbleEl = document.getElementById("bubble");

  /** @type {string} */
  let state = "stand";
  let paused = false;
  let facingRight = true;
  let animFrame = 0;
  let animAccum = 0;
  let behaviorTimer = 0;
  let behaviorDuration = 2000;
  let waterFramesLeft = 0;
  let petFramesLeft = 0;

  let x = 120;
  let y = 120;
  let vx = 0;
  let vy = 0;
  let onGround = true;
  let onWall = /** @type {null | 'left' | 'right'} */ (null);
  let onCeiling = false;

  let mouseX = 120;
  let mouseY = 120;
  let pointerDown = false;
  let didDrag = false;
  let downX = 0;
  let downY = 0;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let lastFrameTs = 0;

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  function groundY() {
    return window.innerHeight - SIZE - GROUND_MARGIN;
  }

  function reportBounds() {
    if (window.nekoBridge) {
      window.nekoBridge.reportBounds({ x, y, w: SIZE, h: SIZE });
    }
  }

  function place() {
    nekoEl.style.left = `${x}px`;
    nekoEl.style.top = `${y}px`;
    nekoEl.classList.toggle("flip", facingRight);
    reportBounds();
  }

  function placeBubble() {
    bubbleEl.style.left = `${x + SIZE / 2}px`;
    bubbleEl.style.top = `${y - 4}px`;
  }

  function setInteractive(active) {
    window.nekoBridge?.setInteractive(active);
  }

  function setState(next, durationMs) {
    if (state === next && durationMs == null) return;
    state = next;
    animFrame = 0;
    animAccum = 0;
    if (durationMs != null) {
      behaviorDuration = durationMs;
      behaviorTimer = 0;
    }
    paintFrame(true);
  }

  function currentAnim() {
    return cfg.animations[state] || cfg.animations.stand;
  }

  function paintFrame(force) {
    const anim = currentAnim();
    const frames = anim.frames;
    const name = frames[animFrame % frames.length];
    const src = cfg.basePath + name;
    if (force || spriteEl.getAttribute("data-frame") !== name) {
      spriteEl.src = src;
      spriteEl.setAttribute("data-frame", name);
    }
  }

  function advanceAnim(dt) {
    const anim = currentAnim();
    animAccum += dt;
    if (animAccum >= anim.frameDelay) {
      animAccum = 0;
      animFrame = (animFrame + 1) % anim.frames.length;
      paintFrame(false);
    }
  }

  function randDuration(min, max) {
    return min + Math.random() * (max - min);
  }

  function pickWeighted(items) {
    const total = items.reduce((s, i) => s + i.w, 0);
    let r = Math.random() * total;
    for (const item of items) {
      r -= item.w;
      if (r <= 0) return item;
    }
    return items[items.length - 1];
  }

  function chooseBehavior() {
    if (state === "water" || state === "pet" || state === "drag" || state === "resist") {
      return;
    }

    let choices;
    if (onCeiling) {
      choices = [
        { state: "grab_ceiling", w: 80, d: [800, 2000] },
        { state: "climb_ceiling", w: 100, d: [1500, 3500] },
        { state: "fall", w: 60, d: [200, 400] },
      ];
    } else if (onWall) {
      choices = [
        { state: "grab_wall", w: 80, d: [600, 1600] },
        { state: "climb_wall", w: 120, d: [1800, 4000] },
        { state: "fall", w: 50, d: [200, 400] },
      ];
    } else if (onGround) {
      choices = [
        { state: "stand", w: 120, d: [1200, 2800] },
        { state: "sit", w: 90, d: [2000, 4500] },
        { state: "walk", w: 140, d: [2200, 4500] },
        { state: "run", w: 50, d: [1200, 2500] },
        { state: "sleep", w: 35, d: [4000, 8000] },
        { state: "jump", w: 25, d: [600, 900] },
        { state: "fly", w: 20, d: [2000, 3500] },
      ];
    } else {
      setState("fall", 400);
      return;
    }

    const pick = pickWeighted(choices);
    if (pick.state === "walk" || pick.state === "run" || pick.state === "fly") {
      if (Math.random() < 0.35) facingRight = !facingRight;
    }
    if (pick.state === "jump" && onGround) {
      vy = -11;
      onGround = false;
    }
    if (pick.state === "fall") {
      onWall = null;
      onCeiling = false;
    }
    setState(pick.state, randDuration(pick.d[0], pick.d[1]));
  }

  function applyPhysics() {
    const stationary = new Set([
      "stand",
      "sit",
      "sleep",
      "grab_wall",
      "grab_ceiling",
      "bounce",
      "pet",
      "water",
    ]);

    if (stationary.has(state)) {
      vx = 0;
      vy = 0;
      if (!onGround && !onWall && !onCeiling && state !== "water" && state !== "pet") {
        setState("fall", 400);
      }
      return;
    }

    switch (state) {
      case "walk":
        vx = facingRight ? WALK_SPEED : -WALK_SPEED;
        vy = 0;
        if (!onGround) setState("fall", 400);
        break;
      case "run":
        vx = facingRight ? RUN_SPEED : -RUN_SPEED;
        vy = 0;
        if (!onGround) setState("fall", 400);
        break;
      case "climb_wall":
        vx = 0;
        vy = -CLIMB_SPEED;
        break;
      case "climb_ceiling":
        vx = facingRight ? WALK_SPEED : -WALK_SPEED;
        vy = 0;
        break;
      case "fly":
        vx = facingRight ? RUN_SPEED : -RUN_SPEED;
        vy = -0.8;
        onGround = false;
        break;
      case "jump":
        vy += GRAVITY;
        if (vy > 0) setState("fall", 500);
        break;
      case "fall":
        vy = Math.min(vy + GRAVITY, MAX_FALL);
        vx *= 0.96;
        break;
      case "trip":
        vx = facingRight ? -6 : 6;
        vy = 0;
        break;
      case "drag":
      case "resist":
      case "drag_left":
      case "drag_right":
        vx = 0;
        vy = 0;
        break;
      default:
        break;
    }
  }

  function checkBoundaries() {
    const minX = 0;
    const maxX = window.innerWidth - SIZE;
    const minY = 0;
    const gY = groundY();

    if (y >= gY) {
      y = gY;
      vy = 0;
      onGround = true;
      onCeiling = false;
      if (state === "fall") {
        setState("bounce", 220);
      }
    } else {
      onGround = false;
    }

    if (x <= minX) {
      x = minX;
      onWall = "left";
      facingRight = true;
      if (["walk", "run"].includes(state) && Math.random() > 0.4) {
        setState("climb_wall", randDuration(1800, 4000));
      } else if (["walk", "run"].includes(state)) {
        facingRight = true;
      }
    } else if (x >= maxX) {
      x = maxX;
      onWall = "right";
      facingRight = false;
      if (["walk", "run"].includes(state) && Math.random() > 0.4) {
        setState("climb_wall", randDuration(1800, 4000));
      } else if (["walk", "run"].includes(state)) {
        facingRight = false;
      }
    } else {
      onWall = null;
    }

    if (y <= minY) {
      y = minY;
      onCeiling = true;
      if (state === "climb_wall" || state === "jump" || state === "fall" || state === "fly") {
        setState("grab_ceiling", randDuration(600, 1600));
        vy = 0;
      }
    } else {
      onCeiling = false;
    }

    if ((state === "climb_wall" || state === "grab_wall") && !onWall) {
      setState("fall", 400);
    }
    if ((state === "grab_ceiling" || state === "climb_ceiling") && !onCeiling) {
      setState("fall", 400);
    }
  }

  function enterWater() {
    waterFramesLeft = 50;
    nekoEl.classList.add("water-mode");
    bubbleEl.classList.remove("hidden");
    placeBubble();
    setState("water", 5000);
    vx = 0;
    vy = 0;
  }

  function leaveWater() {
    nekoEl.classList.remove("water-mode");
    bubbleEl.classList.add("hidden");
  }

  function enterPet() {
    petFramesLeft = 24;
    nekoEl.classList.add("pet-mode");
    setState("pet", 2400);
    vx = 0;
    vy = 0;
  }

  function isOver(px, py) {
    return px >= x && px <= x + SIZE && py >= y && py <= y + SIZE;
  }

  function tick(dt) {
    if (paused && state !== "water" && state !== "drag" && state !== "pet" && state !== "resist") {
      setState("sleep");
      advanceAnim(dt);
      return;
    }

    if (state === "water") {
      placeBubble();
      waterFramesLeft -= 1;
      if (waterFramesLeft <= 0) {
        leaveWater();
        setState("stand", 1500);
      }
      advanceAnim(dt);
      place();
      return;
    }

    if (state === "pet") {
      petFramesLeft -= 1;
      if (petFramesLeft <= 0) {
        nekoEl.classList.remove("pet-mode");
        setState("stand", 1200);
      }
      advanceAnim(dt);
      place();
      return;
    }

    if (state === "drag" || state === "resist" || state === "drag_left" || state === "drag_right") {
      advanceAnim(dt);
      place();
      return;
    }

    behaviorTimer += dt;
    if (behaviorTimer >= behaviorDuration) chooseBehavior();

    applyPhysics();
    x += vx;
    y += vy;
    checkBoundaries();
    advanceAnim(dt);
    place();
  }

  function onPointerMove(event) {
    mouseX = event.clientX;
    mouseY = event.clientY;

    if (pointerDown && !didDrag) {
      if (Math.hypot(mouseX - downX, mouseY - downY) >= DRAG_THRESHOLD) {
        didDrag = true;
        nekoEl.classList.add("drag-mode");
        setState("drag");
        setInteractive(true);
      }
    }

    if (pointerDown && didDrag) {
      x = clamp(mouseX - dragOffsetX, 0, window.innerWidth - SIZE);
      y = clamp(mouseY - dragOffsetY, 0, window.innerHeight - SIZE);
      onGround = false;
      onWall = null;
      onCeiling = false;
      const lean = mouseX - downX;
      if (lean < -40) setState("drag_left");
      else if (lean > 40) setState("drag_right");
      else setState("drag");
      place();
    }
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    if (!isOver(event.clientX, event.clientY)) return;
    event.preventDefault();
    pointerDown = true;
    didDrag = false;
    downX = event.clientX;
    downY = event.clientY;
    dragOffsetX = event.clientX - x;
    dragOffsetY = event.clientY - y;
    setInteractive(true);
  }

  function onPointerUp(event) {
    if (!pointerDown) return;
    pointerDown = false;
    nekoEl.classList.remove("drag-mode");

    if (didDrag) {
      didDrag = false;
      setInteractive(false);
      // Throw / fall after drag
      vx = clamp((event.clientX - downX) * 0.08, -12, 12);
      vy = clamp((event.clientY - downY) * 0.05, -10, 8);
      onGround = false;
      setState("fall", 800);
    } else if (isOver(event.clientX, event.clientY)) {
      leaveWater();
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
    nekoEl.classList.remove("drag-mode");
    setInteractive(false);
  });

  window.addEventListener("resize", () => {
    x = clamp(x, 0, window.innerWidth - SIZE);
    y = clamp(y, 0, groundY());
    place();
  });

  if (window.nekoBridge) {
    window.nekoBridge.onCursor(({ x: cx, y: cy }) => {
      if (pointerDown || didDrag) return;
      mouseX = cx;
      mouseY = cy;
    });

    window.nekoBridge.onPause(({ paused: next }) => {
      paused = !!next;
      if (paused) {
        leaveWater();
        nekoEl.classList.remove("pet-mode", "drag-mode");
        setInteractive(false);
        setState("sleep", 999999);
      } else {
        setState("stand", 1000);
      }
    });

    window.nekoBridge.onWater(() => {
      if (didDrag || state === "drag") return;
      leaveWater();
      enterWater();
    });
  }

  // Start on the ground
  x = Math.max(40, Math.random() * (window.innerWidth - SIZE - 80));
  y = groundY();
  place();
  setState("stand", 1500);
  paintFrame(true);

  function loop(ts) {
    if (!lastFrameTs) lastFrameTs = ts;
    const dt = Math.min(50, ts - lastFrameTs);
    lastFrameTs = ts;
    tick(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
