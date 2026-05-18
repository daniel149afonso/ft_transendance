import Phaser from "phaser";
import mapData from "../maps/map.json";

type EnemyState = "sleeping" | "chasing";

export default class MainScene extends Phaser.Scene {
    player!: Phaser.Physics.Arcade.Sprite;
    enemy!: Phaser.Physics.Arcade.Sprite;
    attackZone!: Phaser.Physics.Arcade.Image;
    enemyState: EnemyState = "sleeping";
    cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    wasd!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
    spaceKey!: Phaser.Input.Keyboard.Key;
    facingDir = "down";
    isAttacking = false;

    private readonly WAKE_DISTANCE = 120;
    private readonly ENEMY_SPEED   = 60;

    // Health system — 6 half-hearts = 3 full hearts
    private playerHP = 6;
    private isGameOver = false;
    private invincible = false;
    private hearts: Phaser.GameObjects.Image[] = [];
    private heartsBg: Phaser.GameObjects.Image[] = [];

    private enemyHP = 3;

    constructor() {
        super("MainScene");
    }

    init() {
        this.playerHP    = 6;
        this.isGameOver  = false;
        this.invincible  = false;
        this.isAttacking = false;
        this.facingDir   = "down";
        this.enemyState  = "sleeping";
        this.hearts      = [];
        this.heartsBg    = [];
        this.enemyHP     = 3;
    }

    preload() {
        this.load.image("map", "src/game/assets/map.png");
        this.load.spritesheet("player", "src/game/assets/player.png", {
            frameWidth: 16,
            frameHeight: 32,
        });
        this.load.spritesheet("player-atk", "src/game/assets/player.png", {
            frameWidth: 32,
            frameHeight: 32,
        });
        this.load.spritesheet("enemy", "src/game/assets/enemy.png", {
            frameWidth: 32,
            frameHeight: 32,
        });
        this.load.spritesheet("objects", "src/game/assets/objects.png", {
            frameWidth: 16,
            frameHeight: 16,
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

        // COLLISION WALLS
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
        const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
        playerBody.setSize(10, 19).setOffset(3, 8);
        playerBody.pushable = false;

        const COLS_PER_ROW = 17;

        // WALK ANIMATIONS — rows 0-3, 3 frames each
        const walkDirs: { key: string; row: number }[] = [
            { key: "down",  row: 0 },
            { key: "right", row: 1 },
            { key: "up",    row: 2 },
            { key: "left",  row: 3 },
        ];
        walkDirs.forEach(({ key, row }) => {
            const start = row * COLS_PER_ROW;
            this.anims.create({
                key: `walk-${key}`,
                frames: this.anims.generateFrameNumbers("player", { frames: [start, start + 1, start + 2] }),
                frameRate: 8,
                repeat: -1,
            });
        });

        // ATTACK ANIMATIONS — "player-atk" texture, frameWidth 32px
        const attackDirs: { key: string; row: number }[] = [
            { key: "down",  row: 4 },
            { key: "up",    row: 5 },
            { key: "right", row: 6 },
            { key: "left",  row: 7 },
        ];
        attackDirs.forEach(({ key, row }) => {
            const start = row * 8;
            this.anims.create({
                key: `attack-${key}`,
                frames: this.anims.generateFrameNumbers("player-atk", {
                    frames: [start, start+1, start+2, start+3],
                }),
                frameRate: 10,
                repeat: 0,
            });
        });

        this.player.anims.play("walk-down");

        this.player.on("animationcomplete", (anim: Phaser.Animations.Animation) => {
            if (anim.key.startsWith("attack-")) {
                this.isAttacking = false;
                this.resetHitbox();
                this.player.anims.play(`walk-${this.facingDir}`, true);
            }
        });

        // ENEMY ANIMATIONS
        this.anims.create({
            key: "enemy-sleep",
            frames: this.anims.generateFrameNumbers("enemy", { frames: [4] }),
            frameRate: 1,
            repeat: -1,
        });
        this.anims.create({
            key: "enemy-walk",
            frames: this.anims.generateFrameNumbers("enemy", { frames: [0, 1, 2, 3] }),
            frameRate: 6,
            repeat: -1,
        });

        // ENEMY SPRITE
        this.enemy = this.physics.add.sprite(400, 300, "enemy");
        this.enemy.setScale(1.8);
        this.enemy.setCollideWorldBounds(true);
        const enemyBody = this.enemy.body as Phaser.Physics.Arcade.Body;
        enemyBody.setSize(16, 20).setOffset(8, 9);
        enemyBody.pushable = false;
        this.enemy.anims.play("enemy-sleep");

        // ATTACK ZONE — separate invisible body used only for attack hit detection
        this.attackZone = this.physics.add.image(0, 0, "pixel");
        this.attackZone.setVisible(false);
        this.attackZone.setActive(false);
        const attackBody = this.attackZone.body as Phaser.Physics.Arcade.Body;
        attackBody.setEnable(false);

        // COLLIDERS — player-walls last so it corrects any position pushed by enemy
        this.physics.add.collider(this.enemy, walls);
        this.physics.add.collider(this.player, this.enemy, () => {
            (this.enemy.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
            this.damagePlayer();
        });
        this.physics.add.collider(this.player, walls);

        // Attack zone overlaps with enemy — does not affect player body
        this.physics.add.overlap(this.attackZone, this.enemy, () => {
            if (!this.enemy.active) return;
            // Disable attack zone immediately so one swing counts as one hit
            (this.attackZone.body as Phaser.Physics.Arcade.Body).setEnable(false);

            this.enemyHP -= 1;

            // Knockback
            const dir = new Phaser.Math.Vector2(
                this.enemy.x - this.player.x,
                this.enemy.y - this.player.y
            ).normalize();
            (this.enemy.body as Phaser.Physics.Arcade.Body).setVelocity(dir.x * 200, dir.y * 200);

            if (this.enemyHP <= 0) {
                // Flash then disappear
                this.tweens.add({
                    targets: this.enemy,
                    alpha: 0,
                    duration: 60,
                    repeat: 3,
                    yoyo: true,
                    onComplete: () => {
                        this.enemy.setActive(false).setVisible(false);
                        (this.enemy.body as Phaser.Physics.Arcade.Body).setEnable(false);
                    },
                });
            } else {
                // Brief flash on hit
                this.tweens.add({
                    targets: this.enemy,
                    alpha: 0.3,
                    duration: 60,
                    yoyo: true,
                    onComplete: () => this.enemy.setAlpha(1),
                });
            }
        });

        // CAMERA
        this.physics.world.setBounds(0, 0, MAP_W, MAP_H);
        this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
        this.cameras.main.setLerp(0.1, 0.1);
        this.cameras.main.startFollow(this.player, true);

        // INPUT
        this.cursors  = this.input.keyboard!.createCursorKeys();
        this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.wasd = {
            up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };

        // HUD — 3 hearts fixed to camera top-left (frame 1 = full red heart)
        const HUD_X = 20;
        const HUD_Y = 20;
        const HEART_SPACING = 36;
        for (let i = 0; i < 3; i++) {
            const hx = HUD_X + i * HEART_SPACING;
            // Background: darkened heart = empty slot
            const bg = this.add.image(hx, HUD_Y, "objects", 1)
                .setScrollFactor(0)
                .setScale(2)
                .setTint(0x333333)
                .setDepth(100);
            this.heartsBg.push(bg);
            // Foreground: red heart, cropped to represent fill level
            const fg = this.add.image(hx, HUD_Y, "objects", 1)
                .setScrollFactor(0)
                .setScale(2)
                .setDepth(101);
            this.hearts.push(fg);
        }
        this.updateHeartsHUD();
    }

    update() {
        if (this.isGameOver) return;

        if (Phaser.Input.Keyboard.JustDown(this.spaceKey) && !this.isAttacking) {
            this.isAttacking = true;
            this.player.setVelocity(0);
            this.player.anims.play(`attack-${this.facingDir}`, true);
            this.setAttackHitbox();
        }

        if (this.isAttacking) return;

        const speed = 150;
        const left  = this.cursors.left.isDown  || this.wasd.left.isDown;
        const right = this.cursors.right.isDown || this.wasd.right.isDown;
        const up    = this.cursors.up.isDown    || this.wasd.up.isDown;
        const down  = this.cursors.down.isDown  || this.wasd.down.isDown;

        let vx = 0;
        let vy = 0;
        if (left)  vx -= speed;
        if (right) vx += speed;
        if (up)    vy -= speed;
        if (down)  vy += speed;

        if (vx !== 0 && vy !== 0) {
            vx *= Math.SQRT1_2;
            vy *= Math.SQRT1_2;
        }

        this.player.setVelocity(vx, vy);

        if (left)       { this.facingDir = "left";  this.player.anims.play("walk-left",  true); }
        else if (right) { this.facingDir = "right"; this.player.anims.play("walk-right", true); }
        else if (up)    { this.facingDir = "up";    this.player.anims.play("walk-up",    true); }
        else if (down)  { this.facingDir = "down";  this.player.anims.play("walk-down",  true); }
        else            { this.player.anims.stop(); }

        this.updateEnemy();
    }

    private resetHitbox() {
        const body = this.attackZone.body as Phaser.Physics.Arcade.Body;
        body.setEnable(false);
        this.attackZone.setActive(false);
    }

    private setAttackHitbox() {
        const px = this.player.x;
        const py = this.player.y;
        const offset = 22;

        let zx = px, zy = py;
        switch (this.facingDir) {
            case "down":  zy = py + offset; break;
            case "up":    zy = py - offset; break;
            case "right": zx = px + offset; break;
            case "left":  zx = px - offset; break;
        }

        this.attackZone.setPosition(zx, zy);
        this.attackZone.setActive(true);
        const body = this.attackZone.body as Phaser.Physics.Arcade.Body;
        body.reset(zx, zy);
        body.setSize(18, 18);
        body.setEnable(true);
    }

    private damagePlayer() {
        if (this.invincible || this.isGameOver) return;
        this.playerHP = Math.max(0, this.playerHP - 1);
        this.updateHeartsHUD();
        if (this.playerHP <= 0) {
            this.showGameOver();
            return;
        }
        // Invincibility frames with flashing effect
        this.invincible = true;
        this.tweens.add({
            targets: this.player,
            alpha: 0.3,
            duration: 80,
            repeat: 5,
            yoyo: true,
            onComplete: () => {
                this.player.setAlpha(1);
                this.invincible = false;
            },
        });
    }

    private updateHeartsHUD() {
        for (let i = 0; i < 3; i++) {
            // How many half-hearts remain for this heart slot
            const remaining = this.playerHP - i * 2;
            const heart = this.hearts[i];
            if (remaining >= 2) {
                heart.setVisible(true).setCrop(0, 0, 16, 16);
            } else if (remaining === 1) {
                // Left half only = half heart
                heart.setVisible(true).setCrop(0, 0, 8, 16);
            } else {
                heart.setVisible(false);
            }
        }
    }

    private showGameOver() {
        this.isGameOver = true;
        this.physics.pause();
        this.player.setAlpha(0.4);

        const cx = this.cameras.main.width / 2;
        const cy = this.cameras.main.height / 2;

        // Semi-transparent dark overlay
        this.add.rectangle(cx, cy, this.cameras.main.width, this.cameras.main.height, 0x000000, 0.72)
            .setScrollFactor(0)
            .setDepth(200);

        // GAME OVER title
        this.add.text(cx, cy - 50, "GAME OVER", {
            fontSize: "48px",
            color: "#ff3333",
            fontStyle: "bold",
            stroke: "#000000",
            strokeThickness: 6,
        })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(201);

        // Restart button
        const btnBg = this.add.rectangle(cx, cy + 40, 160, 48, 0xffffff)
            .setScrollFactor(0)
            .setDepth(201)
            .setInteractive({ useHandCursor: true });

        this.add.text(cx, cy + 40, "Restart", {
            fontSize: "22px",
            color: "#222222",
            fontStyle: "bold",
        })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(202);

        btnBg.on("pointerover", () => btnBg.setFillStyle(0xdddddd));
        btnBg.on("pointerout",  () => btnBg.setFillStyle(0xffffff));
        btnBg.on("pointerdown", () => this.scene.restart());
    }

    private updateEnemy() {
        const dist = Phaser.Math.Distance.Between(
            this.enemy.x, this.enemy.y,
            this.player.x, this.player.y
        );

        if (this.enemyState === "sleeping") {
            (this.enemy.body as Phaser.Physics.Arcade.Body).setImmovable(true);
            if (dist < this.WAKE_DISTANCE) {
                this.enemyState = "chasing";
                (this.enemy.body as Phaser.Physics.Arcade.Body).setImmovable(false);
                this.enemy.anims.play("enemy-walk", true);
            }
        } else if (this.enemyState === "chasing") {
            this.physics.moveToObject(this.enemy, this.player, this.ENEMY_SPEED);
            this.enemy.setFlipX(this.player.x < this.enemy.x);
        }
    }
}
