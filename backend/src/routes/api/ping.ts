import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
  FastifyReply,
} from 'fastify';

export default function (fastify: FastifyInstance, opts: FastifyPluginOptions) {
  fastify.get('/ping', async (request: FastifyRequest, reply: FastifyReply) => {
    return { pong: true, timestamp: new Date().toISOString() };
  });
}
