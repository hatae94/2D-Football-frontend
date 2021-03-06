import Phaser from "phaser";

import store from "../../redux/store";

import {
  countPlayerScore, countOtherPlayerScore, pauseGame, restartGame,
} from "../../redux/slice/roomSlice";

import Ground from "../classes/Ground";
import Ball from "../objects/Ball";
import Player from "../objects/Player";
import AlignGrid from "../classes/util/AlignGrid";
import socket from "../../utils/socket";

import {
  TEXT_INFO, BALL_INFO, PLAYER_INFO, JOYSTICK,
} from "../../constants/game";

export default class SceneMain extends Phaser.Scene {
  constructor() {
    super("SceneMain");
  }

  preload() {
    const url =
      "https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexvirtualjoystickplugin.min.js";

    this.load.plugin("rexvirtualjoystickplugin", url, true);
  }

  create() {
    this.setGrid();

    this.createGround();

    this.createGoalpost(this.ground.background);

    const clientPlayers = {};
    const clientBalls = {};

    socket.emit("joinRoom");

    socket.on("loadPlayer", ({ roomInfo }) => {
      const players = roomInfo;

      for (const id in players) {
        if (!clientPlayers[id] && id !== socket.id && id !== "ball") {
          clientPlayers[id] = new Player(this, 0, 0, players[id].side);

          this.otherPlayer = clientPlayers[id];
          this.otherPlayer.id = id;
          this.otherPlayer.body.id = id;
          this.otherPlayer.side = players[id].side;
        }

        if (!clientPlayers[id] && id === socket.id && id !== "ball") {
          clientPlayers[id] = new Player(this, 0, 0, players[id].side);

          this.player = clientPlayers[id];
          this.player.id = id;
          this.player.body.id = id;
          this.player.side = players[id].side;
        }
      }

      this.createBall(clientBalls, players);

      this.createVirtualController(
        this.sys.canvas.width / 2,
        this.sys.canvas.height / 2,
        this.sys.canvas,
      );

      this.setOverlapToBall(this.player);

      this.createZoneGround(this.player, this.ball);

      this.createZoneGoalpost(this.player, this.ball);

      this.ballOriginPosition = {
        x: this.ball.body.x,
        y: this.ball.body.y,
      };

      this.playerOriginPosition = {
        x: this.player.body.x,
        y: this.player.body.y,
      };
    });

    socket.on("otherPlayerMove", ({
      x, y, anims, id,
    }) => {
      if (this.otherPlayer && this.otherPlayer.id === id) {
        this.otherPlayer.body.x = x;
        this.otherPlayer.body.y = y;

        this.otherPlayer.body.anims.play(anims, true);
      }
    });

    socket.on("ballMove", ({
      x, y, possession, isShoot,
    }) => {
      if (possession.length) {
        this.ball.move();
      } else {
        this.ball.stop();
      }

      this.ball.body.possession = possession;
      this.ball.body.isShoot = isShoot;

      this.ball.body.x = x;
      this.ball.body.y = y;

      this.ballOriginPosition.x = x;
      this.ballOriginPosition.y = y;
    });

    socket.on("resetGameObjects", () => {
      delete clientPlayers[socket.id];
      delete clientBalls[this.ball.id];

      this.goalpostDown.destroy();
      this.goalpostUp.destroy();
    });

    this.createGoalText();
  }

  update() {
    if (!this.player || !this.ball) {
      return;
    }

    this.player.handleMovement(this.joyStickRight.angle, this.joyStickRight.force);

    this.handleDragJoystickLeft(this.joyStickLeft.angle, this.joyStickLeft.force);

    if (this.player.body.x !== this.playerOriginPosition.x || this.player.body.y !== this.playerOriginPosition.y) {
      socket.emit("movePlayer", {
        x: this.player.body.x,
        y: this.player.body.y,
        anims: this.player.body.anims.currentAnim.key,
      });
    }

    if ((this.ball.body.x !== this.ballOriginPosition.x || this.ball.body.y !== this.ballOriginPosition.y) && this.ball.body.isShoot) {
      socket.emit("moveBall", {
        x: this.ball.body.x,
        y: this.ball.body.y,
        possession: this.ball.body.possession,
        isShoot: this.ball.body.isShoot,
      });
    }
  }

  createGoalText() {
    this.goalText = this.add.text(TEXT_INFO.PIXEL_POSITION.X, TEXT_INFO.PIXEL_POSITION.Y, "Goal!", { fontSize: "3rem" });

    this.alignGrid.placeAt(TEXT_INFO.GRID_POSITION.X, TEXT_INFO.GRID_POSITION.Y, this.goalText);

    this.goalText.visible = false;
  }

  createZoneGoalpost(player, ball) {
    const goalpostWidth = this.goalpostUp.width * this.goalpostUp.scaleX;

    const goalpostUpHeight = this.goalpostUp.height;
    const goalpostUpX = this.goalpostUp.x;
    const goalpostUpY = this.goalpostUp.y - this.goalpostUp.height / 2;
    const goalpostUpLeftX = goalpostUpX - goalpostWidth / 2;
    const goalpostUpRightX = goalpostUpX + goalpostWidth / 2;
    const goalpostUpUpY = goalpostUpY - goalpostUpHeight / 2;

    const goalpostDownX = this.goalpostDown.x;
    const goalpostDownY = this.goalpostDown.y;
    const goalpostDownHeight = this.goalpostUp.height;
    const goalpostDownLeftX = goalpostDownX - goalpostWidth / 2;
    const goalpostDownRightX = goalpostDownX + goalpostWidth / 2;
    const goalpostDownDownY = goalpostDownY + goalpostDownHeight / 2;

    const zone = this.physics.add.staticGroup();

    zone.add(this.add.zone(goalpostUpX, goalpostUpUpY, goalpostWidth, 1));
    zone.add(this.add.zone(goalpostUpLeftX, goalpostUpY, 1, goalpostUpHeight));
    zone.add(this.add.zone(goalpostUpRightX, goalpostUpY, 1, goalpostUpHeight));
    zone.add(this.add.zone(goalpostDownX, goalpostDownDownY, goalpostWidth, 1));
    zone.add(
      this.add.zone(
        goalpostDownLeftX,
        goalpostDownY + goalpostDownHeight / 4,
        1,
        goalpostDownHeight / 2,
      ),
    );
    zone.add(
      this.add.zone(
        goalpostDownRightX,
        goalpostDownY + goalpostDownHeight / 4,
        1,
        goalpostDownHeight / 2,
      ),
    );

    this.physics.add.collider(ball.body, zone);
    this.physics.add.collider(player.body, zone);
  }

  createZoneGround(player, ball) {
    const groundWidth =
      this.ground.background.width * this.ground.background.scaleX;
    const groundHeight =
      this.ground.background.height * this.ground.background.scaleY;
    const groundX = this.ground.background.x;
    const groundY = this.ground.background.y;

    const leftX = groundX - groundWidth / 2;
    const rightX = groundX + groundWidth / 2;
    const upY = groundY - groundHeight / 2;
    const downY = groundY + groundHeight / 2;

    const goalpostWidth =
      groundWidth / 2 - (this.goalpostUp.width * this.goalpostUp.scaleX) / 2;
    const goalPostUpLeftSideCenterX = leftX + goalpostWidth / 2;
    const goalPostUpRightSideCenterX = rightX - goalpostWidth / 2;

    const zone = this.physics.add.staticGroup();

    zone.add(this.add.zone(leftX, groundY, 1, groundHeight));
    zone.add(this.add.zone(rightX, groundY, 1, groundHeight));
    zone.add(this.add.zone(goalPostUpLeftSideCenterX, upY, goalpostWidth, 1));
    zone.add(this.add.zone(goalPostUpRightSideCenterX, upY, goalpostWidth, 1));
    zone.add(this.add.zone(goalPostUpLeftSideCenterX, downY, goalpostWidth, 1));
    zone.add(
      this.add.zone(goalPostUpRightSideCenterX, downY, goalpostWidth, 1),
    );

    this.physics.add.collider(player.body, zone);
    this.physics.add.collider(ball.body, zone);
  }

  createBall(clientBalls, players) {
    const matchBallId = players.ball.id;

    if (!clientBalls[matchBallId]) {
      clientBalls[matchBallId] = new Ball(this, this.centerX, this.centerY);
    } else {
      return;
    }

    this.ball = clientBalls[matchBallId];
    this.ball.id = matchBallId;

    this.ball.body.setBounce(BALL_INFO.BOUNCE.X, BALL_INFO.BOUNCE.Y);
    this.ball.body.setCollideWorldBounds(true);

    [this.goalpostUp, this.goalpostDown].forEach((goalpost) => {
      this.physics.add.overlap(
        this.ball.body,
        goalpost,
        this.HandleGoalCount,
        this.checkIsBallIn(this.ball),
        this,
      );
    });
  }

  setToStartPosition(player, otherPlayer, ball) {
    ball.body.possession = "";

    this.alignGrid.placeAtIndex(player.body.gridPosition, player.body);
    this.alignGrid.placeAtIndex(otherPlayer.body.gridPosition, otherPlayer.body);
    this.alignGrid.placeAt(BALL_INFO.POSITION.X, BALL_INFO.POSITION.Y, ball.body);

    socket.emit("movePlayer", {
      x: this.player.body.x,
      y: this.player.body.y,
      anims: this.player.body.anims.currentAnim.key,
    });
  }

  HandleGoalCount(ball, goalpost) {
    const goalpostKey = goalpost.texture.key;

    if (goalpostKey === "goalpostUp") {
      if (this.player.side === "player1") {
        store.dispatch(countPlayerScore());
      } else {
        store.dispatch(countOtherPlayerScore());
      }
    } else if (goalpostKey === "goalpostDown") {
      if (this.player.side === "player2") {
        store.dispatch(countPlayerScore());
      } else {
        store.dispatch(countOtherPlayerScore());
      }
    }

    ball.setVelocity(0, 0);

    store.dispatch(pauseGame());
    this.goalText.visible = true;
    this.physics.pause();

    setTimeout(() => {
      store.dispatch(restartGame());
      this.physics.resume();
      this.goalText.visible = false;

      this.setToStartPosition(this.player, this.otherPlayer, this.ball);
    }, 1000);
  }

  checkIsBallIn(ball) {
    return (_, goalpost) => {
      if (!ball) {
        return false;
      }

      return ball.isInGoalpost(goalpost);
    };
  }

  createGround() {
    this.ground = new Ground({ scene: this });
    this.ground.depth = -1;
  }

  setGrid() {
    const gridConfig = { row: 5, col: 5, scene: this };
    this.alignGrid = new AlignGrid(gridConfig);
  }

  createGoalpost(background) {
    const goalposts = [
      {
        key: "goalpostUp",
        x: background.x,
        y: background.y - (background.height / 2) * background.scale,
        scale: 2,
      },
      {
        key: "goalpostDown",
        x: background.x,
        y: background.y + (background.height / 2) * background.scale,
        scale: 2,
      },
    ];

    goalposts.forEach((goalpost) => {
      this[goalpost.key] = this.physics.add.image(
        goalpost.x,
        goalpost.y,
        goalpost.key,
      );
      this[goalpost.key].scale = goalpost.scale;
      this[goalpost.key].depth = 1;
    });
  }

  createVirtualController(x, y, canvas) {
    this.input.addPointer(1);

    this.joyStickRight = this.plugins.get("rexvirtualjoystickplugin").add(this, {
      x: x + canvas.width / 4,
      y: y + canvas.height / 3,
      radius: 50,
      base: this.add.circle(0, 0, 50, 0x888888),
      thumb: this.add.circle(0, 0, 30, 0xcccccc),
    });

    this.joyStickLeft = this.plugins.get("rexvirtualjoystickplugin").add(this, {
      x: x - canvas.width / 4 + this.cameras.main.scrollX,
      y: y + canvas.height / 3 + this.cameras.main.scrollY,
      radius: 50,
      base: this.add.circle(0, 0, 50, 0x888888),
      thumb: this.add.circle(0, 0, 30, 0xcccccc),
    });

    this.alignGrid.placeAt(JOYSTICK.POSITION.X, JOYSTICK.POSITION.Y, this.joyStickRight);
    this.alignGrid.placeAt(JOYSTICK.BUTTON_POSITION.X, JOYSTICK.BUTTON_POSITION.Y, this.joyStickLeft);
  }

  handleDragJoystickLeft(angle, force) {
    const player = this.player.body;
    const ball = this.ball.body;

    const uniformVelocityX = BALL_INFO.SPEED * Math.cos((angle * Math.PI) / 180);
    const uniformVelocityY = BALL_INFO.SPEED * Math.sin((angle * Math.PI) / 180);

    if (force < 45) {
      return;
    }

    if (ball.possession !== player.id) {
      this.player.speed = PLAYER_INFO.EXTRA_SPEED;
      this.joyStickLeft.setEnable(false);

      setTimeout(() => {
        this.player.speed = PLAYER_INFO.DONW_SPEED;

        setTimeout(() => {
          this.player.speed = PLAYER_INFO.NORMAL_SPEED;
          this.joyStickLeft.setEnable(true);
        }, 500);
      }, 2000);

      return;
    }

    ball.isShoot = true;

    switch (true) {
      case angle < JOYSTICK.RIGHT_RANGE.FROM && angle > JOYSTICK.RIGHT_RANGE.TO:
        ball.x = player.x + player.width * 2;
        ball.y = player.y + player.height * 1.5;

        ball.setVelocity(uniformVelocityX, uniformVelocityY);
        setTimeout(() => {
          ball.setVelocity(0, 0);
          ball.stop();

          ball.possession = "";
          ball.isShoot = false;

          socket.emit("moveBall", {
            x: this.ball.body.x,
            y: this.ball.body.y,
            possession: this.ball.body.possession,
            isShoot: this.ball.body.isShoot,
          });
        }, 300);
        break;
      case angle < JOYSTICK.RIGHT_UP_RANGE.FROM && angle > JOYSTICK.RIGHT_UP_RANGE.TO:
        ball.x = player.x + player.width * 2;
        ball.y = player.y + player.height * 1.5;

        ball.setVelocity(uniformVelocityX, uniformVelocityY);
        setTimeout(() => {
          ball.setVelocity(0, 0);
          ball.stop();

          ball.possession = "";
          ball.isShoot = false;

          socket.emit("moveBall", {
            x: this.ball.body.x,
            y: this.ball.body.y,
            possession: this.ball.body.possession,
            isShoot: this.ball.body.isShoot,
          });
        }, 1000);
        break;
      case angle < JOYSTICK.UP_RANGE.FROM && angle > JOYSTICK.UP_RANGE.TO:
        ball.x = player.x;
        ball.y = player.y - player.height * 2;

        ball.setVelocity(uniformVelocityX, uniformVelocityY);
        setTimeout(() => {
          ball.setVelocity(0, 0);
          ball.stop();

          ball.possession = "";
          ball.isShoot = false;

          socket.emit("moveBall", {
            x: this.ball.body.x,
            y: this.ball.body.y,
            possession: this.ball.body.possession,
            isShoot: this.ball.body.isShoot,
          });
        }, 1000);
        break;
      case angle < JOYSTICK.LEFT_UP_RANGE.FROM && angle > JOYSTICK.LEFT_UP_RANGE.TO:
        ball.x = player.x - player.width * 2;
        ball.y = player.y - player.height * 1.5;

        ball.setVelocity(uniformVelocityX, uniformVelocityY);
        setTimeout(() => {
          ball.setVelocity(0, 0);
          ball.stop();

          ball.possession = "";
          ball.isShoot = false;

          socket.emit("moveBall", {
            x: this.ball.body.x,
            y: this.ball.body.y,
            possession: this.ball.body.possession,
            isShoot: this.ball.body.isShoot,
          });
        }, 1000);
        break;
      case angle < JOYSTICK.LEFT_RANGE.FROM || angle > JOYSTICK.LEFT_RANGE.TO:
        ball.x = player.x - player.width * 2;
        ball.y = player.y + player.height * 1.5;

        ball.setVelocity(uniformVelocityX, uniformVelocityY);
        setTimeout(() => {
          ball.setVelocity(0, 0);
          ball.stop();

          ball.possession = "";
          ball.isShoot = false;

          socket.emit("moveBall", {
            x: this.ball.body.x,
            y: this.ball.body.y,
            possession: this.ball.body.possession,
            isShoot: this.ball.body.isShoot,
          });
        }, 1000);
        break;
      case angle < JOYSTICK.LEFT_DOWN_RANGE.FROM && angle > JOYSTICK.LEFT_DOWN_RANGE.TO:
        ball.x = player.x - player.width * 2;
        ball.y = player.y + player.height * 1.5;

        ball.setVelocity(uniformVelocityX, uniformVelocityY);
        setTimeout(() => {
          ball.setVelocity(0, 0);
          ball.stop();

          ball.possession = "";
          ball.isShoot = false;

          socket.emit("moveBall", {
            x: this.ball.body.x,
            y: this.ball.body.y,
            possession: this.ball.body.possession,
            isShoot: this.ball.body.isShoot,
          });
        }, 1000);
        break;
      case angle < JOYSTICK.DOWN_RANGE.FROM && angle > JOYSTICK.DOWN_RANGE.TO:
        ball.x = player.x;
        ball.y = player.y + player.height * 2;

        ball.setVelocity(uniformVelocityX, uniformVelocityY);
        setTimeout(() => {
          ball.setVelocity(0, 0);
          ball.stop();

          ball.possession = "";
          ball.isShoot = false;

          socket.emit("moveBall", {
            x: this.ball.body.x,
            y: this.ball.body.y,
            possession: this.ball.body.possession,
            isShoot: this.ball.body.isShoot,
          });
        }, 1000);
        break;
      case angle < JOYSTICK.RIGHT_DOWN_RANGE.FROM && angle > JOYSTICK.RIGHT_DOWN_RANGE.TO:
        ball.x = player.x + player.width * 2;
        ball.y = player.y + player.height * 1.5;

        ball.setVelocity(uniformVelocityX, uniformVelocityY);
        setTimeout(() => {
          ball.setVelocity(0, 0);
          ball.stop();

          ball.possession = "";
          ball.isShoot = false;

          socket.emit("moveBall", {
            x: this.ball.body.x,
            y: this.ball.body.y,
            possession: this.ball.body.possession,
            isShoot: this.ball.body.isShoot,
          });
        }, 1000);
        break;
      default:
        ball.x = player.x;
        ball.y = player.y + player.height * 2;

        ball.setVelocity(uniformVelocityX, uniformVelocityY);

        setTimeout(() => {
          ball.setVelocity(0, 0);
          ball.stop();

          ball.possession = "";
          ball.isShoot = false;

          socket.emit("moveBall", {
            x: this.ball.body.x,
            y: this.ball.body.y,
            possession: this.ball.body.possession,
            isShoot: this.ball.body.isShoot,
          });
        }, 1000);
        break;
    }

    socket.emit("moveBall", {
      x: this.ball.body.x,
      y: this.ball.body.y,
      possession: this.ball.body.possession,
      isShoot: this.ball.body.isShoot,
    });
  }

  setOverlapToBall(player) {
    this.physics.add.overlap(
      player.body,
      this.ball.body,
      this.handlePlayerDribbleBall,
      this.checkHasBall(player),
      this,
    );
  }

  handlePlayerDribbleBall(player, ball) {
    this.ball.move();

    this.ball.body.possession = player.id;

    const { direction } = player;

    switch (direction) {
      case "right":
        ball.x = player.x + player.width * 1.2;
        ball.y = player.y + player.height * 1.2;

        break;
      case "rightDown":
        ball.x = player.x + player.width * 1.2;
        ball.y = player.y + player.height * 1.2;
        break;
      case "down":
        ball.x = player.x;
        ball.y = player.y + player.height * 1.7;
        break;
      case "leftDown":
        ball.x = player.x - player.width * 1.2;
        ball.y = player.y + player.height * 1.2;
        break;
      case "left":
        ball.x = player.x - player.width * 1.2;
        ball.y = player.y + player.height * 1.2;
        break;
      case "leftUp":
        ball.x = player.x - player.width * 1.2;
        ball.y = player.y;
        break;
      case "up":
        ball.x = player.x;
        ball.y = player.y - player.height * 1.7;
        break;
      case "rightUp":
        ball.x = player.x + player.width * 1.2;
        ball.y = player.y;
        break;
      default:
        ball.x = player.x + player.width * 1.2;
        ball.y = player.y + player.height * 1.2;
        this.ball.stop();
    }

    if (!this.ball.body.isShoot) {
      socket.emit("moveBall", {
        x: this.ball.body.x,
        y: this.ball.body.y,
        possession: this.ball.body.possession,
        isShoot: this.ball.body.isShoot,
      });
    }
  }

  checkHasBall(player) {
    return (_, ball) => {
      if (!player) {
        return false;
      }

      if (ball.isShoot) {
        return false;
      }

      return player.canHaveBall(ball);
    };
  }
}
