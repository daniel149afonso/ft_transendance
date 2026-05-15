import Phaser from "phaser";
import mapData from "../maps/map.json";

export default class MainScene extends Phaser.Scene {
    player!: Phaser.Physics.Arcade.Sprite;
    cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

    constructor() {
        super("MainScene");
    }

    preload() {
        this.load.image("map", "src/game/assets/map.png");
        this.load.spritesheet("player", "src/game/assets/player.png", {
            frameWidth: 16,
            frameHeight: 32,
        });
    }

    create() {
        const MAP_W = 800;
        const MAP_H = 600;
        const COLS = 30;
        const ROWS = 20;
        const tileW = MAP_W / COLS;
        const tileH = MAP_H / ROWS;

        // MAP
        this.add.image(0, 0, "map").setOrigin(0, 0).setDisplaySize(MAP_W, MAP_H);

        // COLLISION WALLS — obstacle layers (grass, ground and fences are walkable)
        const OBSTACLE_LAYERS = ["Trees", "Houses", "Rocks", "Water", "Tower", "Fences"];

        const gfx = this.add.graphics();
        gfx.fillStyle(0xffffff);
        gfx.fillRect(0, 0, 1, 1);
        gfx.generateTexture("pixel", 1, 1);
        gfx.destroy();

        const walls = this.physics.add.staticGroup();
        const layers = mapData.layers as { name: string; data: number[] }[];

        layers
            .filter(l => OBSTACLE_LAYERS.includes(l.name))
            .forEach(layer => {
                layer.data.forEach((tile, index) => {
                    if (tile === 0) return;
                    const col = index % COLS;
                    const row = Math.floor(index / COLS);
                    const x = col * tileW + tileW / 2;
                    const y = row * tileH + tileH / 2;
                    (walls.create(x, y, "pixel") as Phaser.Physics.Arcade.Sprite)
                        .setVisible(false)
                        .setDisplaySize(tileW, tileH)
                        .refreshBody();
                });
            });

        // PLAYER
        this.player = this.physics.add.sprite(240, 240, "player");
        this.player.setScale(1.8);
        this.player.setCollideWorldBounds(true);
        (this.player.body as Phaser.Physics.Arcade.Body).setSize(10, 8).setOffset(3, 24);

        // ANIMATIONS — 17 cols per row, 3 frames per direction
        const COLS_PER_ROW = 17;
        const fps = 8;
        const dirs: { key: string; row: number }[] = [
            { key: "down",  row: 0 },
            { key: "right", row: 1 },
            { key: "up",    row: 2 },
            { key: "left",  row: 3 },
        ];
        dirs.forEach(({ key, row }) => {
            const start = row * COLS_PER_ROW;
            this.anims.create({
                key: `walk-${key}`,
                frames: this.anims.generateFrameNumbers("player", { frames: [start, start + 1, start + 2] }),
                frameRate: fps,
                repeat: -1,
            });
        });
        this.player.anims.play("walk-down");

        // COLLIDER
        this.physics.add.collider(this.player, walls);

        // CAMERA
        this.physics.world.setBounds(0, 0, MAP_W, MAP_H);
        this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
        this.cameras.main.startFollow(this.player);

        // INPUT
        this.cursors = this.input.keyboard!.createCursorKeys();
    }

    update() {
        const speed = 150;
        const left  = this.cursors.left.isDown;
        const right = this.cursors.right.isDown;
        const up    = this.cursors.up.isDown;
        const down  = this.cursors.down.isDown;

        let vx = 0;
        let vy = 0;
        if (left)  vx -= speed;
        if (right) vx += speed;
        if (up)    vy -= speed;
        if (down)  vy += speed;

        // Normalize diagonal so speed stays consistent
        if (vx !== 0 && vy !== 0) {
            vx *= Math.SQRT1_2;
            vy *= Math.SQRT1_2;
        }

        this.player.setVelocity(vx, vy);

        // Animation priority: horizontal > vertical
        if (left)       this.player.anims.play("walk-left",  true);
        else if (right) this.player.anims.play("walk-right", true);
        else if (up)    this.player.anims.play("walk-up",    true);
        else if (down)  this.player.anims.play("walk-down",  true);
        else            this.player.anims.stop();
    }
}
