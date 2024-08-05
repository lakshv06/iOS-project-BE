import express from "express";
import pool from "../db/database.js";
import { getConnection } from "../utility/webSocketManager.js";

const router = express.Router();

const toRadians = (degrees) => degrees * (Math.PI / 180);

const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Radius of the Earth in meters

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const lat1Rad = toRadians(lat1);
    const lat2Rad = toRadians(lat2);

    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
};

// Function to handle incoming WebSocket messages
const handleWebSocketMessage = async (message, resolve, hasAccepted, signInApproverLocation, ws, redisClient, email, approversDeviceIdentifier) => {
  try {
    const { response } = JSON.parse(message);
    console.log("eheheheh response: ", response.response);
    console.log("received location: ", response.location);
    console.log("approver's location: ", signInApproverLocation);

    let inVicinity = false;
    const distance = haversineDistance(
      response.location.latitude, response.location.longitude,
      signInApproverLocation.latitude, signInApproverLocation.longitude
    );

    console.log("Distance: ", distance);

    if (distance <= 40) {
      inVicinity = true;
    }

    console.log("inVicinity: ", inVicinity);

    // Normalize and trim device identifiers before comparison
    const normalizedApproversDeviceIdentifier = approversDeviceIdentifier.trim();

    if (response.response === "accept" && inVicinity) {
      hasAccepted = true;
      resolve({ accepted: true, signInApproverLocation });

      // Notify other devices to dismiss their notifications
      const connectionKey = `connections:${email}`;
      const devices = await redisClient.lRange(connectionKey, 0, -1);
      console.log("Devices list: ", devices);

      devices.forEach((deviceData) => {
        try {
          const { deviceIdentifier: otherDeviceIdentifier } = JSON.parse(deviceData);
          const normalizedOtherDeviceIdentifier = otherDeviceIdentifier.trim();
          console.log(`Comparing ${normalizedOtherDeviceIdentifier} with ${normalizedApproversDeviceIdentifier}`);

          if (normalizedOtherDeviceIdentifier !== normalizedApproversDeviceIdentifier) {
            const ws = getConnection(normalizedOtherDeviceIdentifier);
            console.log("WebSocket for dismissal: ", ws);
            if (ws && ws.readyState === 1) {
              ws.send(
                JSON.stringify({
                  type: "dismiss",
                  message: "Login attempt notification dismissed"
                })
              );
            }
          }
        } catch (err) {
          console.error("Error parsing device data", err);
        }
      });
    }
  } catch (error) {
    console.error("Error parsing WebSocket message:", error);
  }
};


router.post("/", async (req, res) => {
  console.log("Received post request to login route");
  const { email, password, device_name, device_model, device_identifier, latitude, longitude } =
    req.body;

  if(!latitude || !longitude){
    return res.status(400).send({error: "Location permissions needed"});
  }

  const signInLocation = {
    latitude: latitude,
    longitude: longitude
  }

  if (!email || !password) {
    return res.status(400).send({ error: "Email and Password are required!" });
  }

  if (!device_name || !device_model || !device_identifier) {
    return res.status(400).send({ error: "Device information is incomplete" });
  }

  const dbClient = await pool.connect();
  const redisClient = req.redisClient;

  try {
    await dbClient.query("BEGIN");

    // Check if the user exists
    const userQueryText = "SELECT * FROM users WHERE email = $1";
    const userQueryValues = [email];
    const userResult = await dbClient.query(userQueryText, userQueryValues);

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      const userPassword = user.password;

      // Verify Password
      const passwordMatch = userPassword === password;

      if (passwordMatch) {
        // Check if the user-device association already exists
        const userDeviceQueryText =
          "SELECT * FROM user_devices WHERE email = $1 AND device_identifier = $2";
        const userDeviceQueryValues = [email, device_identifier];
        const userDeviceResult = await dbClient.query(
          userDeviceQueryText,
          userDeviceQueryValues
        );

        if (userDeviceResult.rows.length === 0) {
          // Send notification to other devices using Redis
          const connectionKey = `connections:${email}`;
          const devices = await redisClient.lRange(connectionKey, 0, -1);
          console.log("Device list trying...:", devices);

          // Create a promise that resolves if any device accepts
          const responsePromise = new Promise((resolve) => {
            let hasAccepted = false;
            devices.forEach((deviceData) => {
              try {
                const { deviceIdentifier } = JSON.parse(deviceData);
                const ws = getConnection(deviceIdentifier);
                console.log("ws info: ", ws);

                if (ws && ws.readyState === 1) {
                  console.log(
                    `Notify device ${deviceIdentifier}: Login attempt from ${device_name} (${device_model})`
                  );
                  ws.send(
                    JSON.stringify({
                      type: "notification",
                      message: `Login attempt from ${device_name} (${device_model})`,
                    })
                  );

                  ws.on("message", (message) => {
                    handleWebSocketMessage(message, resolve, hasAccepted, signInLocation, ws, redisClient, email, deviceIdentifier);
                  });
                } else 
                if (ws) {
                  ws.on("open", () => {
                    console.log(
                      `Notify device ${deviceIdentifier}: Login attempt from ${device_name} (${device_model})`
                    );
                    ws.send(
                      JSON.stringify({
                        type: "notification",
                        message: `Login attempt from ${device_name} (${device_model})`,
                      })
                    );

                    ws.on("message", (message) => {
                      handleWebSocketMessage(message, resolve, hasAccepted, signInLocation, ws, redisClient, email, deviceIdentifier);
                    });
                  });
                } else {
                  console.log(
                    `No WebSocket connection found for deviceIdentifier: ${deviceIdentifier}`
                  );
                }
              } catch (err) {
                console.error("Error parsing device data", err);
              }
            });

            // Fallback if no device responds with acceptance within a timeout period
            setTimeout(() => {if(!hasAccepted){resolve(false)}}, 30000); // 30 seconds timeout
          });

          const isAccepted = await responsePromise;
          if (isAccepted) {
            // Check if the device exists in the deviceList table
            const deviceQueryText =
              "SELECT * FROM deviceList WHERE device_identifier = $1";
            const deviceQueryValues = [device_identifier];
            const deviceResult = await dbClient.query(
              deviceQueryText,
              deviceQueryValues
            );

            if (deviceResult.rows.length === 0) {
              // Insert the device into the deviceList table if it does not exist
              await dbClient.query(
                "INSERT INTO deviceList (device_identifier, device_name, device_model) VALUES ($1, $2, $3)",
                [device_identifier, device_name, device_model]
              );
            } else {
              // Update device information if necessary
              await dbClient.query(
                "UPDATE deviceList SET device_name = $1, device_model = $2 WHERE device_identifier = $3",
                [device_name, device_model, device_identifier]
              );
            }

            // Link user and device in user_devices table
            await dbClient.query(
              "INSERT INTO user_devices (email, device_identifier) VALUES ($1, $2)",
              [email, device_identifier]
            );

            await dbClient.query("COMMIT");
            return res.status(200).send({ message: "Login successful" });
          } else {
            return res.status(403).send({ error: "Authorization error" });
          }
        }

        await dbClient.query("COMMIT");
        res.status(200).send({ message: "Login successful" });
      } else {
        res.status(401).send({ error: "Invalid password" });
      }
    } else {
      res.status(404).send({
        error:
          "No account with this email exists. Please try signing up instead.",
      });
    }
  } catch (err) {
    console.error("Error during login", err);
    await dbClient.query("ROLLBACK");
    res.status(500).send({ error: "Internal Server Error" });
  } finally {
    dbClient.release();
  }
});

export default router;
