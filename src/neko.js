(() => {
  const cfg = window.DORA_SPRITES;
  const nekoEl = document.getElementById("neko");
  const spriteEl = document.getElementById("sprite");
  const bubbleEl = document.getElementById("bubble");

  if (!cfg || !nekoEl || !spriteEl || !bubbleEl) {
    console.error("[doraemon] Missing sprites config or DOM nodes");
    return;
  }

  const SIZE = cfg.size;
  const GROUND_MARGIN = 8;
  const FRAME_MS = 16.67;
  const WALK_SPEED = 2.2;
  const RUN_SPEED = 4;
  const CLIMB_SPEED = 2;
  const GRAVITY = 0.55;
  const MAX_FALL = 14;
  const DRAG_THRESHOLD = 5;
  const BOUNDS_REPORT_MS = 50;
  const CHATTER = [
    "hi!",
    "dorayaki…",
    "ganbatte!",
    "need a gadget?",
    "stay hydrated!",
    "にゃー",
  ];
  const DRAG_STATES = new Set(["drag", "resist", "drag_left", "drag_right"]);
  const STATIONARY = new Set([
    "stand",
    "sit",
    "sleep",
    "grab_wall",
    "grab_ceiling",
    "bounce",
    "pet",
    "water",
  ]);

  let insets = { top: 0, left: 0, right: 0, bottom: 0 };
  let chatterMsLeft = 0;
  let chatterCooldown = 20000 + Math.random() * 20000;

  let state = "stand";
  let paused = false;
  let facingRight = true;
  let animFrame = 0;
  let animAccum = 0;
  let behaviorTimer = 0;
  let behaviorDuration = 2000;
  let waterMsLeft = 0;
  let petMsLeft = 0;

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
  let lastMoveX = 0;
  let lastMoveY = 0;
  let lastMoveTs = 0;
  let throwVx = 0;
  let throwVy = 0;
  let lastFrameTs = 0;
  let lastBoundsReport = 0;

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  function groundY() {
    return window.innerHeight - SIZE - GROUND_MARGIN - insets.bottom;
  }

  function minX() {
    return insets.left;
  }

  function maxX() {
    return Math.max(minX(), window.innerWidth - SIZE - insets.right);
  }

  function minY() {
    return insets.top;
  }

  function showBubble(text, { water = false } = {}) {
    bubbleEl.textContent = text;
    bubbleEl.classList.toggle("water", water);
    bubbleEl.classList.remove("hidden");
    placeBubble();
  }

  function hideBubble() {
    if (state === "water" || chatterMsLeft > 0) return;
    bubbleEl.classList.add("hidden");
    bubbleEl.classList.remove("water");
  }

  function showChatter() {
    if (state === "water" || paused) return;
    const line = CHATTER[Math.floor(Math.random() * CHATTER.length)];
    chatterMsLeft = 3200;
    showBubble(line, { water: false });
  }

  function reportBounds(force = false) {
    const now = performance.now();
    if (!force && now - lastBoundsReport < BOUNDS_REPORT_MS) return;
    lastBoundsReport = now;
    window.nekoBridge?.reportBounds({ x, y, w: SIZE, h: SIZE });
  }

  function place(forceBounds = false) {
    nekoEl.style.left = `${x}px`;
    nekoEl.style.top = `${y}px`;
    nekoEl.classList.toggle("flip", facingRight);
    reportBounds(forceBounds);
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
    const changed = state !== next;
    state = next;
    if (changed) {
      animFrame = 0;
      animAccum = 0;
      paintFrame(true);
    }
    if (durationMs != null) {
      behaviorDuration = durationMs;
      behaviorTimer = 0;
    }
  }

  function currentAnim() {
    return cfg.animations[state] || cfg.animations.stand;
  }

  function paintFrame(force) {
    const anim = currentAnim();
    const name = anim.frames[animFrame % anim.frames.length];
    if (force || spriteEl.dataset.frame !== name) {
      spriteEl.src = cfg.basePath + name;
      spriteEl.dataset.frame = name;
    }
  }

  function advanceAnim(dt) {
    const anim = currentAnim();
    animAccum += dt;
    while (animAccum >= anim.frameDelay) {
      animAccum -= anim.frameDelay;
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

  function preloadSprites() {
    const names = new Set();
    for (const anim of Object.values(cfg.animations)) {
      for (const frame of anim.frames) names.add(frame);
    }
    for (const name of names) {
      const img = new Image();
      img.src = cfg.basePath + name;
    }
  }

  function chooseBehavior() {
    if (state === "water" || state === "pet" || DRAG_STATES.has(state)) return;

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

  function applyPhysics(scale) {
    if (STATIONARY.has(state)) {
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
        vy += GRAVITY * scale;
        if (vy > 0) setState("fall", 500);
        break;
      case "fall":
        vy = Math.min(vy + GRAVITY * scale, MAX_FALL);
        vx *= Math.pow(0.96, scale);
        break;
      case "trip":
        vx = facingRight ? -6 : 6;
        vy = 0;
        break;
      default:
        if (DRAG_STATES.has(state)) {
          vx = 0;
          vy = 0;
        }
        break;
    }
  }

  function tryClimbFromEdge() {
    if (!(state === "walk" || state === "run")) return;
    if (Math.random() > 0.4) {
      setState("climb_wall", randDuration(1800, 4000));
    }
  }

  function checkBoundaries() {
    const left = minX();
    const right = maxX();
    const top = minY();
    const gY = groundY();

    if (y >= gY) {
      y = gY;
      vy = 0;
      onGround = true;
      onCeiling = false;
      if (state === "fall") setState("bounce", 220);
    } else {
      onGround = false;
    }

    if (x <= left) {
      x = left;
      onWall = "left";
      facingRight = true;
      tryClimbFromEdge();
    } else if (x >= right) {
      x = right;
      onWall = "right";
      facingRight = false;
      tryClimbFromEdge();
    } else {
      onWall = null;
    }

    if (y <= top) {
      y = top;
      onCeiling = true;
      if (["climb_wall", "jump", "fall", "fly"].includes(state)) {
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
    waterMsLeft = 5000;
    chatterMsLeft = 0;
    nekoEl.classList.add("water-mode");
    if (!onGround) {
      onWall = null;
      onCeiling = false;
      y = Math.min(y, groundY());
    }
    showBubble("💧 drink water!", { water: true });
    setState("water", 5000);
    vx = 0;
    vy = 0;
  }

  function leaveWater() {
    waterMsLeft = 0;
    nekoEl.classList.remove("water-mode");
    if (chatterMsLeft <= 0) {
      bubbleEl.classList.add("hidden");
      bubbleEl.classList.remove("water");
    }
  }

  function enterPet() {
    petMsLeft = 2400;
    nekoEl.classList.add("pet-mode");
    setState("pet", 2400);
    vx = 0;
    vy = 0;
  }

  function isOver(px, py) {
    return px >= x && px <= x + SIZE && py >= y && py <= y + SIZE;
  }

  function tick(dt) {
    const scale = dt / FRAME_MS;

    // Look toward the cursor while idle on the ground
    if (
      !paused &&
      onGround &&
      (state === "stand" || state === "sit") &&
      !pointerDown
    ) {
      const dx = mouseX - (x + SIZE / 2);
      if (Math.abs(dx) > 24) facingRight = dx > 0;
    }

    // Wake up if the cursor comes close while sleeping
    if (!paused && state === "sleep" && onGround) {
      const dist = Math.hypot(mouseX - (x + SIZE / 2), mouseY - (y + SIZE / 2));
      if (dist < SIZE * 0.9) {
        setState("stand", 1200);
      }
    }

    if (paused && state !== "water" && !DRAG_STATES.has(state) && state !== "pet") {
      if (state !== "sleep") setState("sleep", 999999);
      advanceAnim(dt);
      return;
    }

    if (state === "water") {
      placeBubble();
      waterMsLeft -= dt;
      if (waterMsLeft <= 0) {
        leaveWater();
        setState("stand", 1500);
      }
      advanceAnim(dt);
      place();
      return;
    }

    if (chatterMsLeft > 0) {
      chatterMsLeft -= dt;
      placeBubble();
      if (chatterMsLeft <= 0) hideBubble();
    } else if (
      !paused &&
      onGround &&
      (state === "stand" || state === "sit")
    ) {
      chatterCooldown -= dt;
      if (chatterCooldown <= 0) {
        showChatter();
        chatterCooldown = 45000 + Math.random() * 45000;
      }
    }

    if (state === "pet") {
      petMsLeft -= dt;
      if (petMsLeft <= 0) {
        nekoEl.classList.remove("pet-mode");
        setState("stand", 1200);
      }
      advanceAnim(dt);
      place();
      return;
    }

    if (DRAG_STATES.has(state)) {
      advanceAnim(dt);
      place();
      return;
    }

    behaviorTimer += dt;
    if (behaviorTimer >= behaviorDuration) chooseBehavior();

    applyPhysics(scale);
    x += vx * scale;
    y += vy * scale;
    checkBoundaries();
    advanceAnim(dt);
    place();
  }

  function onPointerMove(event) {
    mouseX = event.clientX;
    mouseY = event.clientY;
    const now = performance.now();
    if (lastMoveTs > 0) {
      const sampleDt = Math.max(1, now - lastMoveTs);
      throwVx = ((mouseX - lastMoveX) / sampleDt) * 16;
      throwVy = ((mouseY - lastMoveY) / sampleDt) * 16;
    }
    lastMoveX = mouseX;
    lastMoveY = mouseY;
    lastMoveTs = now;

    if (pointerDown && !didDrag) {
      if (Math.hypot(mouseX - downX, mouseY - downY) >= DRAG_THRESHOLD) {
        didDrag = true;
        nekoEl.classList.add("drag-mode");
        setState("drag");
        setInteractive(true);
      }
    }

    if (pointerDown && didDrag) {
      x = clamp(mouseX - dragOffsetX, minX(), maxX());
      y = clamp(mouseY - dragOffsetY, minY(), groundY());
      onGround = false;
      onWall = null;
      onCeiling = false;
      const lean = mouseX - downX;
      if (lean < -40) setState("drag_left");
      else if (lean > 40) setState("drag_right");
      else setState("drag");
      place(true);
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
    lastMoveX = event.clientX;
    lastMoveY = event.clientY;
    lastMoveTs = performance.now();
    throwVx = 0;
    throwVy = 0;
    setInteractive(true);
  }

  function onPointerUp(event) {
    if (!pointerDown) return;
    pointerDown = false;
    nekoEl.classList.remove("drag-mode");

    if (didDrag) {
      didDrag = false;
      setInteractive(false);
      const flickAged = performance.now() - lastMoveTs > 120;
      vx = clamp(flickAged ? (event.clientX - downX) * 0.08 : throwVx * 0.9, -14, 14);
      vy = clamp(flickAged ? (event.clientY - downY) * 0.05 : throwVy * 0.9, -12, 10);
      onGround = false;
      setState("fall", 800);
    } else if (isOver(event.clientX, event.clientY)) {
      if (state === "water") {
        leaveWater();
        window.nekoBridge?.snooze(10);
        setState("stand", 1200);
      } else {
        leaveWater();
        enterPet();
      }
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
    x = clamp(x, minX(), maxX());
    y = clamp(y, minY(), groundY());
    place(true);
  });

  if (window.nekoBridge) {
    window.nekoBridge.onCursor(({ x: cx, y: cy }) => {
      if (pointerDown || didDrag) return;
      mouseX = cx;
      mouseY = cy;
    });

    window.nekoBridge.onInsets((next) => {
      if (!next) return;
      insets = {
        top: Number(next.top) || 0,
        left: Number(next.left) || 0,
        right: Number(next.right) || 0,
        bottom: Number(next.bottom) || 0,
      };
      x = clamp(x, minX(), maxX());
      y = clamp(y, minY(), groundY());
      place(true);
    });

    window.nekoBridge.onPause(({ paused: next }) => {
      paused = !!next;
      if (paused) {
        leaveWater();
        chatterMsLeft = 0;
        hideBubble();
        nekoEl.classList.remove("pet-mode", "drag-mode");
        setInteractive(false);
        setState("sleep", 999999);
      } else {
        setState("stand", 1000);
      }
    });

    window.nekoBridge.onWater(() => {
      if (didDrag || DRAG_STATES.has(state)) return;
      leaveWater();
      enterWater();
    });
  }

  preloadSprites();
  x = clamp(
    minX() + 40 + Math.random() * Math.max(0, maxX() - minX() - 80),
    minX(),
    maxX()
  );
  y = groundY();
  place(true);
  setState("stand", 1500);
  paintFrame(true);

  function loop(ts) {
    if (!lastFrameTs) lastFrameTs = ts;
    const dt = Math.min(50, ts - lastFrameTs);
    lastFrameTs = ts;
    if (dt > 0) tick(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
