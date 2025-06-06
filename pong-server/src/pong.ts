import { type WebSocket } from "@fastify/websocket";
import { v4 as uuidv4 } from "uuid";
import { defaultConfig } from "./DefaultConf";
import { createInitialState } from "./createInitialState";
import { PhysicsEngine } from "./PhysicsEngine";
import { StateGame, PlayerBase, Player } from "./StateGame";
import { StateEngine } from "./StateEngine";

type MadeMatch = {
  player: PlayerBase;
  game: GameManager | null;
  tournament : TournamentManager | null;
};

export class MatchMaking {
  private waitingPlayers: Map<string, PlayerBase>;
  private gameManagers: GameManager[];
  private waitingPlayersTournament: Map<string, PlayerBase>;
  private tournamentManagers: TournamentManager[];

  constructor(gameManagers: GameManager[], tournamentManagers: TournamentManager[]) {
    this.waitingPlayers = new Map();
    this.waitingPlayersTournament = new Map();
    this.gameManagers = gameManagers;
    this.tournamentManagers = tournamentManagers;
  }

  addPlayer(
    socket: WebSocket,
    infoPlayer: { name: string; id: number | null; avatar: string },
    playerKeys: Map<string, boolean> | null,
    tournament: boolean
  ): MadeMatch {
    const idPlayer =
      infoPlayer.id !== null ? infoPlayer.id.toString() : uuidv4();
    const existPlayer = this.waitingPlayers.get(idPlayer);
    if (existPlayer)
      return { player: existPlayer, game: null, tournament: null};
    const player: PlayerBase = {
      id: idPlayer,
      socket,
      name: infoPlayer.name,
      avatar: infoPlayer.avatar,
      playerKeys,
    };
    if (Array.from(this.waitingPlayers.values()).some((p) => {
      return p.socket === socket;
    }))
      return { player, game: null, tournament: null};
    if (tournament)
      this.waitingPlayersTournament.set(idPlayer, player);
    else
      this.waitingPlayers.set(idPlayer, player);
    if (this.waitingPlayers.size >= 2) {
      const [p1, p2] = Array.from(this.waitingPlayers.values()).slice(0, 2);
      const newGame = new GameManager(p1, p2, false);
      this.gameManagers.push(newGame);
      this.waitingPlayers.delete(p1.id);
      this.waitingPlayers.delete(p2.id);
      return { player, game: newGame, tournament: null};
    }
    if (this.waitingPlayersTournament.size >= 4) {
      const pArr = Array.from(this.waitingPlayersTournament.values()).slice(0, 4);
      const newTournament = new TournamentManager(pArr, this.gameManagers);
      this.tournamentManagers.push(newTournament);
      pArr.forEach(player => this.waitingPlayersTournament.delete(player.id));
      return { player, game: null, tournament: newTournament };
    }
    return { player, game: null, tournament: null };
  }

  public removePlayer(id: string) {
    let player = this.waitingPlayers.get(id);
    if (player) {
      this.waitingPlayers.delete(id);
    }
    player = this.waitingPlayersTournament.get(id);
    if (player) {
      this.waitingPlayersTournament.delete(id);
    }
  }
}

export class TournamentManager {
  private players: PlayerBase[];
  private games: GameManager[];
  private gameManagers: GameManager[];
  private completedSemiFinals: number = 0;

  constructor(pArr: PlayerBase[], gameManagers: GameManager[]) {
    this.players = pArr;
    this.games = [];
    this.gameManagers = gameManagers;
  }

  public getPlayers(): PlayerBase[] {
    return this.players;
  }

  removePlayer(player: PlayerBase) {
    const tournamentPlayer = this.players.find(p => p.id === player.id);
    if (tournamentPlayer)
      tournamentPlayer.socket = null;
  }

  startTournament(): void {
    const waitingPlayers = this.players.map(p => p.name);
    this.players.forEach(player => {
      if (player.socket && player.socket?.readyState === player.socket.OPEN) {
        player.socket.send(JSON.stringify({
          type: 'names',
          data: { waitingPlayers }
        }));
      }
    });
    setTimeout(() => {
      this.createFirstGame();
      this.createSecondGame();
  }, 7000);
  }

  createFirstGame(): MadeMatch {
    const newGame = new GameManager(
      this.players[0],
      this.players[1],
      true,
      () => this.handleSemiFinalCompletion()
    );
    this.gameManagers.push(newGame);
    this.games.push(newGame);
    newGame.startGame();
    if (this.players[0].socket === null)
      newGame.removePlayer(this.players[0]);
    if (this.players[1].socket === null)
      newGame.removePlayer(this.players[1]);
    return { player: this.players[0], game: newGame, tournament: this };
  }

  createSecondGame(): MadeMatch {
    const newGame = new GameManager(
      this.players[2],
      this.players[3],
      true,
      () => this.handleSemiFinalCompletion()
    );
    this.gameManagers.push(newGame);
    this.games.push(newGame);
    newGame.startGame();
    if (this.players[2].socket === null)
      newGame.removePlayer(this.players[2]);
    if (this.players[3].socket === null)
      newGame.removePlayer(this.players[3]);
    return { player: this.players[2], game: newGame, tournament: this };
  }

  private handleSemiFinalCompletion() {
    this.completedSemiFinals++;
        if (this.completedSemiFinals === 2) {
      setTimeout(() => {
        this.createLastGame();
      }, 5000);
    }
}

  createLastGame(): MadeMatch {
    const p1 = this.games[0].getWinner();
    const p2 = this.games[1].getWinner();
    if (!p1 || !p2) {
      return { player: this.players[0], game: null, tournament: null };
    }
    const newGame = new GameManager(p1, p2, false, () => this.handleFinalCompletion());
    this.gameManagers.push(newGame);
    this.games.push(newGame);
    const semiFinals = this.games.splice(0, 2);
    semiFinals.forEach(game => {
      const index = this.gameManagers.indexOf(game);
      if (index !== -1) {
        this.gameManagers.splice(index, 1);
    }
  });

    newGame.startGame();
    setTimeout(() => {
      newGame.addPlayerReady(p1.id);
      newGame.addPlayerReady(p2.id);
      if (p1.socket === null)
        newGame.removePlayer(p1);
      if (p2.socket === null)
        newGame.removePlayer(p2);
    }, 5000);
    return { player: p1, game: newGame, tournament: this };
  }

  private handleFinalCompletion() {
    console.log('super');
  }
}


export class GameManager {
  private game: StateGame = createInitialState();
  private gameInterval: NodeJS.Timeout | null = null;
  private physicsEngine: PhysicsEngine;
  private statesEngine: StateEngine;
  private finished: boolean = false;
  private playersReady: Map<string, boolean> = new Map();
  private isTournament: boolean;
  private onGameOver?: () => void;

  constructor(player1: PlayerBase, player2: PlayerBase, tournament: boolean, onGameOver?: () => void) {
    this.game.players[0].id = player1.id;
    this.game.players[0].socket = player1.socket;
    this.game.players[0].name = player1.name;
    this.game.paddles[0].id = player1.id;
    this.game.paddles[0].playerName = player1.name;
    this.game.players[0].playerKeys = player1.playerKeys;
    this.game.players[0].avatar = player1.avatar;
    this.game.players[1].id = player2.id;
    this.game.players[1].socket = player2.socket;
    this.game.players[1].name = player2.name;
    this.game.paddles[1].id = player2.id;
    this.game.paddles[1].playerName = player2.name;
    this.game.players[1].playerKeys = player2.playerKeys;
    this.game.players[1].avatar = player2.avatar;
    this.statesEngine = new StateEngine(this, this.game);
    this.statesEngine.updateTime(true);
    this.physicsEngine = new PhysicsEngine(defaultConfig, this.statesEngine);
    this.startGameLoop();
    this.onGameOver = onGameOver;
    this.isTournament = tournament;
  }

  removePlayer(player: PlayerBase) {
    if (this.finished) return;

    const forfeitingPlayerIndex = this.game.players.findIndex(
      (p) => p.id === player.id
    );
    if (forfeitingPlayerIndex === -1) return;

    const forfeitingPlayer = this.game.players[forfeitingPlayerIndex];
    forfeitingPlayer.socket = null;
    forfeitingPlayer.score = -1;

    const remainingPlayer = this.game.players.find(
      (p) => p.id !== player.id && p.socket !== null
    );

    if (remainingPlayer) {
      const winnerPlayerObj = this.game.players.find(
        (p) => p.id === remainingPlayer.id
      )!;
      const loserPlayerObj = this.game.players.find(
        (p) => p.id === forfeitingPlayer.id
      )!;

      this.statesEngine.handleGameConclusion(
        winnerPlayerObj,
        loserPlayerObj,
        true,
        this.isTournament
      );

      if (this.isTournament)
      {remainingPlayer.socket?.send(
        JSON.stringify({
          type: "wait",
          data: {
            message: `${player.name} left the game! You win by forfeit.`,
          },
        })
      );
    }
      else {
      remainingPlayer.socket?.send(
        JSON.stringify({
          type: "win",
          data: {
            message: `${player.name} left the game! You win by forfeit.`,
          },
        })
      );
    }
    } else {
      console.log(
        `[PongServer] Player ${player.name} disconnected. No remaining active players. Game ending.`
      );
      this.gameOver();
    }
  }

  public handlePlayerInput(
    player: PlayerBase,
    data: { key: string; type: boolean }
  ) {
    if (this.finished) return;
    this.physicsEngine.handlePlayerInput(player, data);
  }

  public getPlayers(): StateGame["players"] {
    return this.game.players;
  }

  public getPaddles(): StateGame["paddles"] {
    return this.game.paddles;
  }

  public startGame(): void {
    if (this.finished) return;
    this.broadcast("start", {
      players: {
        player1: this.createDataPlayer(this.game.players[0]),
        player2: this.createDataPlayer(this.game.players[1]),
      },
    });
    setTimeout(() => {
      this.forceStart();
    }, 15000);
  }

  private forceStart() : void {
    this.addPlayerReady(this.game.players[0].id);
    this.addPlayerReady(this.game.players[1].id);
  }

  public gameOver(): void {
    if (this.finished) return;
    console.log("[PongServer] GameManager: gameOver called.");
    if (this.gameInterval) {
      clearInterval(this.gameInterval);
      this.gameInterval = null;
    }
    this.finished = true;
    if (this.onGameOver) {
      this.onGameOver();
    }
  }

  public getWinner(): PlayerBase | null {
    if (!this.finished)
      return null;
    if (this.game.players[0].score > this.game.players[1].score)
      return this.game.players[0];
    return this.game.players[1];
  }

  public addPlayerReady = (id: string) => {
    if (this.finished || this.playersReady.size === 2) return;
    this.playersReady.set(id, true);
    if (this.playersReady.size === 2) {
      this.physicsEngine.startPhysics();
    }
  };

  private createDataPlayer(player: PlayerBase): {
    name: string;
    id: string;
    avatar: string;
  } {
    return {
      name: player.name,
      id: player.id,
      avatar: player.avatar,
    };
  }

  private startGameLoop() {
    this.gameInterval = setInterval(() => {
      if (this.finished) {
        if (this.gameInterval) clearInterval(this.gameInterval);
        return;
      }
      this.physicsEngine.update(this.game, this.isTournament);
      this.statesEngine.updateTime(false);
      const state = {
        paddles: this.game.paddles,
        ball: this.game.ball,
        players: this.game.players.map((p) => ({ score: p.score })),
        time: this.statesEngine.getElapsedTime(),
      };
      this.broadcast("update", state);
    }, 1000 / 30); // 30 FPS
  }

  private broadcast(type: string, data: any) {
    if (this.finished) return;
    const players: StateGame["players"] = this.getPlayers();
    for (const player of players) {
      if (player.socket && player.socket.readyState === player.socket.OPEN) {
        try {
          player.socket.send(JSON.stringify({ type: `${type}`, data }));
        } catch (error) {
          console.error(
            `[PongServer] Error broadcasting to player ${player.id}:`,
            error
          );
        }
      }
    }
  }
}
