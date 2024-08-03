import express from "express";
import bodyParser from "body-parser";
import { WebSocketServer } from "ws";
import createUserRoute from "./routes/createUser.js";
import loginRoute from "./routes/loginRoute.js";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import redisClient from "./redis/redis-server.js";
import { addConnection, removeConnection } from "./utility/webSocketManager.js"; // Import functions

// Load environment variables from .env file
dotenv.config();

function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  // Middleware to parse JSON bodies
  app.use(bodyParser.json());

  // Middleware to parse URL-encoded bodies
  app.use(bodyParser.urlencoded({ extended: true }));

  // Middleware to enable CORS
  app.use(cors());

  app.get("/", (req, res) => {
    res.send("Hello World!");
    console.log("GET method for / route called");
  });

  app.use("/sign-up", createUserRoute);
  app.use(
    "/sign-in",
    (req, res, next) => {
      req.redisClient = redisClient;
      next();
    },
    loginRoute
  );

  // Handle WebSocket connections
  wss.on("connection", (ws, req) => {
    console.log("WebSocket connected");

    ws.on("message", async (message) => {
      try {
        const { type, email, deviceIdentifier } = JSON.parse(message);

        if (type === "register") {
          ws.deviceIdentifier = deviceIdentifier; // Store deviceIdentifier in the WebSocket object

          addConnection(deviceIdentifier, ws); // Add connection to wsMap

          const connectionKey = `connections:${email}`;
          const deviceData = JSON.stringify({ deviceIdentifier });

          // Check if the deviceIdentifier is already in Redis
          const existingDevices = await redisClient.lRange(
            connectionKey,
            0,
            -1
          );
          const isDeviceAlreadyRegistered = existingDevices.some(
            (deviceData) => {
              const parsedData = JSON.parse(deviceData);
              return parsedData.deviceIdentifier === deviceIdentifier;
            }
          );

          if (!isDeviceAlreadyRegistered) {
            await redisClient.rPush(connectionKey, deviceData);
            console.log(`Redis Registered device: ${deviceIdentifier} for email: ${email}`);
        } else {
            console.log(`Device: ${deviceIdentifier} is already registered for email: ${email}`);
        }
          logActiveConnections();
        }
      } catch (err) {
        console.error("Error parsing message", err);
      }
    });

    ws.on("close", async () => {
      try {
        const { deviceIdentifier } = ws; // Access stored deviceIdentifier

        if (!deviceIdentifier) {
          console.error("No deviceIdentifier found for the closed connection");
          return;
        }

        console.log(`WebSocket disconnected for device: ${deviceIdentifier}`);

        removeConnection(deviceIdentifier); // Remove connection from wsMap

        const emailKeysPattern = "connections:*";
        const keys = await redisClient.keys(emailKeysPattern);

        for (const key of keys) {
          const devices = await redisClient.lRange(key, 0, -1);
          const updatedDevices = devices.filter((deviceData) => {
            const parsedData = JSON.parse(deviceData);
            return parsedData.deviceIdentifier !== deviceIdentifier;
          });

          if (updatedDevices.length > 0) {
            await redisClient.del(key);
            await redisClient.rPush(key, ...updatedDevices);
          } else {
            await redisClient.del(key);
          }
        }

        logActiveConnections();
      } catch (err) {
        console.error("Error handling WebSocket closure:", err);
      }
    });
  });

  async function logActiveConnections() {
    console.log("Active WebSocket Connections:");
    try {
      const keys = await redisClient.keys("connections:*");
      keys.forEach(async (key, index) => {
        const email = key.split(":")[1];
        const devices = await redisClient.lRange(key, 0, -1);
        console.log(
          `${index}: Email: ${email}, Devices: ${devices.join(", ")}`
        );
      });
    } catch (err) {
      console.error("Error fetching connections from Redis:", err);
    }
  }

  return server;
}

export default startServer;
