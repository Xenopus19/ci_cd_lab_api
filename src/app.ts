import express from "express";
import cors from "cors";
import catsRouter from "./controllers/catsController";
import cryptoRouter from "./controllers/cryptoController";
import authRouter from "./controllers/authController";
import secureRouter from "./controllers/secureController";
import sessionsRouter from "./controllers/sessionsController";
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { requireOidcAuth } from './middleware/requireOidcAuth';

const app = express();
const PORT = process.env.PORT || 3000;

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Cats API',
      version: '1.0.0',
      description: 'CI/CD lab docs',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
        localAuth: { type: 'apiKey', in: 'header', name: 'X-Local-Authorization' },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/**/*.ts'], 
};

const swaggerSpec = swaggerJsdoc(options);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

if (process.env.SPA_ORIGIN) {
  app.use("/api", cors({
    origin: process.env.SPA_ORIGIN,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Local-Authorization', 'X-Rsa-Id', 'X-Session-Id'],
  }));
}
app.use("/api", requireOidcAuth);
app.use(express.json());
app.use("/api/cats", catsRouter);
app.use("/api/crypto-keys", cryptoRouter);
app.use("/api/auth", authRouter);
app.use("/api/secure", secureRouter);
app.use("/api/sessions", sessionsRouter);

export default app;