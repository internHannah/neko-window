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
    "greet",
    "curious",
    "play",
  ]);

  let insets = { top: 0, left: 0, right: 0, bottom: 0 };
  let chatterMsLeft = 0;
  let chatterCooldown = 20000 + Math.random() * 20000;
  let speedMul = 1;
  let petCount = 0;

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
  let hoverMs = 0;
  let curiousCooldown = 8000;
  let dragStartedAt = 0;
  let climbDir = -1;
  let pointerId = null;
  let userIdle = false;
  let pageHidden = false;

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
    bubbleEl.classList.remove("pop");
    void bubbleEl.offsetWidth;
    bubbleEl.classList.add("pop");
    placeBubble();
  }

  function hideBubble() {
    if (state === "water" || chatterMsLeft > 0) return;
    bubbleEl.classList.add("hidden");
    bubbleEl.classList.remove("water", "pop");
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
    const bw = bubbleEl.offsetWidth || 96;
    const bh = bubbleEl.offsetHeight || 36;
    const minLeft = insets.left + bw / 2 + 8;
    const maxLeft = window.innerWidth - insets.right - bw / 2 - 8;
    bubbleEl.style.left = `${clamp(x + SIZE / 2, minLeft, Math.max(minLeft, maxLeft))}px`;
    bubbleEl.style.top = `${Math.max(insets.top + bh + 8, y - 4)}px`;
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
    const delay = Math.max(30, anim.frameDelay / speedMul);
    animAccum += dt;
    while (animAccum >= delay) {
      animAccum -= delay;
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
      const nearTop = y <= minY() + 40;
      const nearGround = y >= groundY() - 40;
      choices = [
        { state: "grab_wall", w: 80, d: [600, 1600] },
        { state: "climb_wall", w: nearTop || nearGround ? 140 : 120, d: [1800, 4000] },
        { state: "fall", w: 50, d: [200, 400] },
      ];
    } else if (onGround) {
      const mouseDist = Math.hypot(mouseX - (x + SIZE / 2), mouseY - (y + SIZE / 2));
      const hour = new Date().getHours();
      const night = hour >= 22 || hour < 8;
      const sleepy = night || userIdle;
      choices = [
        { state: "stand", w: 110, d: [1200, 2800] },
        { state: "sit", w: 80, d: [2000, 4500] },
        { state: "walk", w: 120, d: [2200, 4500] },
        { state: "run", w: 40, d: [1200, 2500] },
        { state: "chase", w: userIdle ? 8 : mouseDist > 160 ? 90 : 35, d: [1600, 3800] },
        { state: "sleep", w: sleepy ? 90 : 30, d: sleepy ? [6000, 12000] : [4000, 8000] },
        { state: "jump", w: 22, d: [600, 900] },
        { state: "fly", w: 18, d: [2000, 3500] },
        { state: "play", w: 28, d: [1600, 3000] },
        { state: "greet", w: 12, d: [1600, 2200] },
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
    if (pick.state === "climb_wall") {
      if (y <= minY() + 40) climbDir = 1;
      else if (y >= groundY() - 40) climbDir = -1;
      else climbDir = Math.random() < 0.45 ? 1 : -1;
    }
    if (pick.state === "greet" && chatterMsLeft <= 0) {
      chatterMsLeft = 2200;
      showBubble("hi!");
    }
    setState(pick.state, randDuration(pick.d[0], pick.d[1]) / speedMul);
  }

  function applyPhysics(scale) {
    const moveScale = scale * speedMul;
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
      case "chase": {
        const dx = mouseX - (x + SIZE / 2);
        const dist = Math.hypot(dx, mouseY - (y + SIZE / 2));
        if (dist < SIZE * 0.55) {
          vx = 0;
          vy = 0;
          setState("stand", 900);
          break;
        }
        facingRight = dx >= 0;
        const speed = dist > 200 ? RUN_SPEED : WALK_SPEED;
        vx = facingRight ? speed : -speed;
        vy = 0;
        if (!onGround) setState("fall", 400);
        break;
      }
      case "climb_wall":
        vx = 0;
        vy = climbDir * CLIMB_SPEED;
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
        vy += GRAVITY * moveScale;
        if (vy > 0) setState("fall", 500);
        break;
      case "fall":
        vy = Math.min(vy + GRAVITY * moveScale, MAX_FALL);
        vx *= Math.pow(0.96, moveScale);
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
    if (!(state === "walk" || state === "run" || state === "chase")) return;
    if (Math.random() > 0.4) {
      climbDir = -1;
      setState("climb_wall", randDuration(1800, 4000));
    }
  }

  function checkBoundaries() {
    const left = minX();
    const right = maxX();
    const top = minY();
    const gY = groundY();

    if (y >= gY) {
      const impact = vy;
      y = gY;
      vy = 0;
      onGround = true;
      onCeiling = false;
      if (state === "fall") {
        if (impact >= 10 || Math.abs(vx) >= 9) setState("trip", 560);
        else setState("bounce", 220);
      } else if (state === "climb_wall" && climbDir > 0) {
        setState("stand", 900);
      }
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
    petCount += 1;
    petMsLeft = 2400;
    nekoEl.classList.add("pet-mode");
    chatterMsLeft = 2200;
    showBubble(petCount === 1 ? "hehe~" : `thanks! ×${petCount}`, { water: false });
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
      if (isOver(mouseX, mouseY)) {
        hoverMs += dt;
        curiousCooldown -= dt;
        if (hoverMs > 650 && curiousCooldown <= 0) {
          setState("curious", randDuration(1200, 2000));
          hoverMs = 0;
          curiousCooldown = 10000 + Math.random() * 8000;
        }
      } else {
        hoverMs = 0;
      }
    } else {
      hoverMs = 0;
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
      nekoEl.classList.add("sleepy");
      advanceAnim(dt);
      place();
      return;
    }
    nekoEl.classList.toggle("sleepy", state === "sleep");

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
    x += vx * scale * speedMul;
    y += vy * scale * speedMul;
    checkBoundaries();
    advanceAnim(dt);
    place();
  }

  function releasePointer(event) {
    const id = event?.pointerId ?? pointerId;
    if (id != null) {
      try {
        if (nekoEl.hasPointerCapture(id)) nekoEl.releasePointerCapture(id);
      } catch {
        /* already released */
      }
    }
    pointerId = null;
  }

  function onPointerMove(event) {
    if (pointerDown && pointerId != null && event.pointerId !== pointerId) return;
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
      if (performance.now() - dragStartedAt > 1700) setState("resist");
      else if (lean < -40) setState("drag_left");
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
    dragStartedAt = performance.now();
    pointerId = event.pointerId;
    try {
      nekoEl.setPointerCapture(event.pointerId);
    } catch {
      /* capture unsupported */
    }
    setInteractive(true);
  }

  function onPointerUp(event) {
    if (!pointerDown) return;
    if (pointerId != null && event.pointerId !== pointerId) return;
    pointerDown = false;
    nekoEl.classList.remove("drag-mode");
    releasePointer(event);

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
        window.nekoBridge?.drankWater();
        chatterMsLeft = 2500;
        showBubble("good job!", { water: false });
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

  nekoEl.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerUp);
  nekoEl.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    window.nekoBridge?.openMenu();
  });
  window.addEventListener("blur", () => {
    pointerDown = false;
    didDrag = false;
    nekoEl.classList.remove("drag-mode");
    releasePointer();
    setInteractive(false);
  });

  window.addEventListener("resize", () => {
    x = clamp(x, minX(), maxX());
    y = clamp(y, minY(), groundY());
    place(true);
  });

  document.addEventListener("visibilitychange", () => {
    pageHidden = document.hidden;
    if (!pageHidden) lastFrameTs = 0;
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

    window.nekoBridge.onSpawn((pos) => {
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
      x = clamp(pos.x, minX(), maxX());
      y = clamp(pos.y, minY(), groundY());
      place(true);
    });

    window.nekoBridge.onIdle(({ idle }) => {
      userIdle = !!idle;
      if (
        userIdle &&
        onGround &&
        !paused &&
        !DRAG_STATES.has(state) &&
        state !== "water" &&
        state !== "pet"
      ) {
        setState("sleep", 20000);
      }
    });

    window.nekoBridge.onSpeed(({ multiplier }) => {
      if (Number.isFinite(multiplier) && multiplier > 0) {
        speedMul = Math.min(2, Math.max(0.4, multiplier));
      }
    });

    window.nekoBridge.onDrank(() => {
      leaveWater();
      chatterMsLeft = 2800;
      showBubble("nice! 💧", { water: false });
      if (state === "water") setState("stand", 1200);
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
  chatterMsLeft = 2600;
  showBubble("hello!");
  setState("greet", 2000);
  paintFrame(true);

  function loop(ts) {
    if (pageHidden) {
      lastFrameTs = 0;
      requestAnimationFrame(loop);
      return;
    }
    if (!lastFrameTs) lastFrameTs = ts;
    const dt = Math.min(50, ts - lastFrameTs);
    lastFrameTs = ts;
    if (dt > 0) tick(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
