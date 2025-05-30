import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import pingRoutes from './ping';
import loginRoutes from './login';
import googleLoginRoutes from './google-login';
import registerRoutes from './register';
import userRoutes from './users';
import verifyRoute from './verify-jwt';
import matchesRoutes from './matches';
import twoFARoutes from './2fa';
import cloudinaryUserAvatarRoutes from './cloudinary';
import friendsRoutes from './friends';
import fastifyMultipart from '@fastify/multipart';
import dotenv from 'dotenv';

dotenv.config();

export default function apiIndex(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
    },
  });
  fastify.register(pingRoutes);
  fastify.register(loginRoutes);
  fastify.register(registerRoutes);
  fastify.register(userRoutes);
  fastify.register(verifyRoute);
  fastify.register(matchesRoutes);
  fastify.register(googleLoginRoutes);
  fastify.register(cloudinaryUserAvatarRoutes);
  fastify.register(twoFARoutes);
  fastify.register(friendsRoutes);

  fastify.log.info(
    'Registered API routes: ping, login, register, users, verify-jwt, matches, 2fa, cloudinary-avatar, friends'
  );
}
