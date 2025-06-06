import Fastify, { FastifyReply } from 'fastify';
import fastifyWebsocket, { type WebSocket } from '@fastify/websocket';
import { GameManager, MatchMaking, TournamentManager } from './pong';
import { PlayerBase } from './StateGame';
import { FastifyRequest } from 'fastify/types/request';
import fastifyCors from '@fastify/cors';
import { jwtDecode } from 'jwt-decode';
import { getAllStat, getUserById, getUserWinLose, getUsers } from './DB/dbQuerys';

interface DecodeToken {
  username: string;
  id: number;
}

const getGameManager = (player: PlayerBase, games: GameManager[]): GameManager | null => {
  let result = null;

  result = games.find((game: GameManager) => {
    return game.getPlayers().some((p: PlayerBase) => {
      return player.id === p.id;
    });
  });
  return result ?? null;
}

const getTournamentManager = (player: PlayerBase, tournaments: TournamentManager[]): TournamentManager | null => {
  let result = null;

  result = tournaments.find((tournament: TournamentManager) => {
    return tournament.getPlayers().some((p: PlayerBase) => {
      return player.id === p.id;
    });
  });
  return result ?? null;
}

const start = async () => {
  const server = Fastify({ logger: true });
  await server.register(fastifyWebsocket);
  await server.register(fastifyCors, { origin: true });

  const gameManagers: GameManager[] = [];
  const tournamentManagers: TournamentManager[] = [];
  const matchMaker = new MatchMaking(gameManagers, tournamentManagers);

  server.get('/health', () => ({ status: 'pong-server running' }));

  server.get('/users', async (req: FastifyRequest, rep: FastifyReply) => {
    req;
    try {
      const players = getUsers();
      return rep.status(200).send({ ok: true, players });

    } catch (error: any) {
      return rep.status(200).send({ ok: false, message: error.message });
    }
  });

  server.get('/match/win/:name', async (req: FastifyRequest, rep: FastifyReply) => {
    const name = req.params && (req.params as any).name;
    if (!name) {
      return rep.status(400).send({ error: { message: "name is required" } });
    }
    try {
      const winStat = getUserWinLose(name);
      return rep.status(200).send({ ok: true, winStat });
    } catch (error: any) {
      rep.status(200).send({ ok: false, message: error.message });
    }
  });

  server.get('/match/stat/:name', async (req: FastifyRequest, rep: FastifyReply) => {
    const name = req.params && (req.params as any).name;
    if (!name) {
      return rep.status(400).send({ error: { message: "name is required" } });
    }
    try {
      const winStat = getAllStat(name);
      return rep.status(200).send({ ok: true, winStat });
    } catch (error: any) {
      rep.status(200).send({ ok: false, message: error.message });
    }
  });

  server.get('/user', async (req: FastifyRequest, rep: FastifyReply) => {
    const token = req.query && (req.query as any).token;
    if (!token) {
      return rep.status(400).send({ error: 'Token is required' });
    }
    const decodeToken: DecodeToken = jwtDecode(token);
    console.log('decode Token', decodeToken);
    rep.status(200).send({ name: decodeToken.username, id: decodeToken.id });
  });

  server.get('/db/user/:id', async (req: FastifyRequest, rep: FastifyReply) => {
    try {
      const id = parseInt(req.params && (req.params as any).id);
      const user = getUserById(id);
      if (!user)
        return rep.status(404).send('Player not found !');
      return rep.status(200).send(user);
    } catch (error: any) {
      return rep.status(500).send('Erreur server');
    }
  })

  server.get('/ws',
    { websocket: true },
    (socket: WebSocket) => {

      let player: PlayerBase | null = null;

      socket.on('message', async (msg: string, isBinary: boolean) => {
        const msgStr = isBinary ? msg.toString() : msg as string;
        const message = JSON.parse(msgStr);
        const { type, data } = message;
        let result;
        switch (type) {
          case 'joinTournament':
            result = (matchMaker.addPlayer(
              socket,
              data.infoPlayer,
              new Map(),
              true
            ));
            player = result.player;
            if (result.tournament) {
              socket.send(JSON.stringify({ type: 'wait' }));
              tournamentManagers.push(result.tournament);
              result.tournament.startTournament();
            } else {
              socket.send(JSON.stringify({ type: 'wait' }));
            }
            break;
          case 'join':
            result = (matchMaker.addPlayer(
              socket,
              data.infoPlayer,
              new Map(),
              false
            ));
            player = result.player;
            if (result.game) {
              gameManagers.push(result.game);
              result.game.startGame();
            }
            else {
              socket.send(JSON.stringify({ type: 'wait' }));
            }
            break;
          case 'input':
            if (player) {
              const gameManager = getGameManager(player, gameManagers);
              if (gameManager) {
                gameManager.handlePlayerInput(player, data);
              }
            }
            break;
          case 'ready':
            if (player) {
              const gameManager = getGameManager(player, gameManagers);
              if (gameManager) {
                gameManager.addPlayerReady(player.id);
              }
            }
            break;
          default:
            break;
        }
      });

      socket.on('close', () => {
        if (player) {
          matchMaker.removePlayer(player.id);
          const gameManager = getGameManager(player, gameManagers);
          if (gameManager) {
            gameManager.removePlayer(player);
            if (gameManager.getPlayers().every((p) => {
              return p.socket === null;
            })) {
              const index = gameManagers.indexOf(gameManager);
              gameManagers.splice(index, 1);
            }
          }
          const tournamentManager = getTournamentManager(player, tournamentManagers);
          if (tournamentManager) {
            tournamentManager.removePlayer(player);
            if (tournamentManager.getPlayers().every((p) => {
              return p.socket === null;
            })) {
              const index = tournamentManagers.indexOf(tournamentManager);
              tournamentManagers.splice(index, 1);
            }
          }
        }
      });
    }
  );

  await server.listen({ port: 4000, host: '0.0.0.0' });
  console.log('Pong server listening on http://localhost:4000');
}

start();
