/** Sprite animations adapted from AlleyBo55/doraemon (Cachomon Shimeji pack). */
window.DORA_SPRITES = {
  basePath: "../assets/dora-sprites/",
  size: 128,
  animations: {
    stand: {
      frames: ["shime1.png", "shime1.png", "shime1.png", "shime1a.png"],
      frameDelay: 150,
    },
    walk: {
      frames: ["shime1.png", "shime2.png", "shime1.png", "shime3.png"],
      frameDelay: 100,
    },
    run: {
      frames: ["shime1.png", "shime2.png", "shime1.png", "shime3.png"],
      frameDelay: 50,
    },
    fall: { frames: ["shime4.png"], frameDelay: 250 },
    jump: { frames: ["shime22.png"], frameDelay: 250 },
    bounce: { frames: ["shime18.png", "shime19.png"], frameDelay: 67 },
    trip: {
      frames: ["shime19.png", "shime18.png", "shime20.png", "shime20.png", "shime19.png"],
      frameDelay: 100,
    },
    drag: { frames: ["shimeX.png", "shimeXa.png"], frameDelay: 67 },
    drag_left: { frames: ["shime7.png"], frameDelay: 83 },
    drag_right: { frames: ["shime6.png"], frameDelay: 83 },
    resist: {
      frames: ["shime5.png", "shime6.png", "shime5.png", "shime6.png", "shimeX.png"],
      frameDelay: 83,
    },
    sit: {
      frames: [
        "shime11.png",
        "shime11a.png",
        "shime11b.png",
        "shime11c.png",
        "shime11b.png",
        "shime11c.png",
        "shime11d.png",
      ],
      frameDelay: 120,
    },
    grab_wall: {
      frames: ["shime13.png", "shime13.png", "shime13.png", "shime13a.png"],
      frameDelay: 150,
    },
    climb_wall: {
      frames: [
        "shime14.png",
        "shime14.png",
        "shime13.png",
        "shime12.png",
        "shime12.png",
        "shime13.png",
      ],
      frameDelay: 67,
    },
    grab_ceiling: {
      frames: ["shime23.png", "shime23a.png"],
      frameDelay: 100,
    },
    climb_ceiling: {
      frames: ["shime23c.png", "shime24.png", "shime25.png"],
      frameDelay: 67,
    },
    fly: {
      frames: ["shime15.png", "shime16.png", "shime15.png", "shime17.png"],
      frameDelay: 100,
    },
    sleep: {
      frames: ["shime20.png", "shime20a.png", "shime20b.png"],
      frameDelay: 800,
    },
    water: {
      frames: ["shime22.png", "shime1a.png", "shime22.png", "action-greeting-01.png"],
      frameDelay: 140,
    },
    pet: {
      frames: ["shime11b.png", "shime11c.png", "emotion-joy-01.png", "shime11c.png"],
      frameDelay: 120,
    },
  },
};
