import express from "express";
import pool from "../db/database.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { email, password, device_name, device_model, device_identifier } = req.body;

  if (!email || !password) {
    return res.status(400).send({ error: "Email and Password are required!" });
  }

  if (!device_name || !device_model || !device_identifier) {
    return res.status(400).send({ error: "Device information is incomplete" });
  }

  const dbClient = await pool.connect();

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
        // Check if the device exists in the deviceList table
        const deviceQueryText = "SELECT * FROM deviceList WHERE device_identifier = $1";
        const deviceQueryValues = [device_identifier];
        const deviceResult = await dbClient.query(deviceQueryText, deviceQueryValues);

        if (deviceResult.rows.length === 0) {
          // Insert the device into the deviceList table if it does not exist
          await dbClient.query(
            "INSERT INTO deviceList (device_identifier, device_name, device_model) VALUES ($1, $2, $3)",
            [device_identifier, device_name, device_model]
          );
        } else {
          // update device information if necessary
          await dbClient.query(
            "UPDATE deviceList SET device_name = $1, device_model = $2 WHERE device_identifier = $3",
            [device_name, device_model, device_identifier]
          );
        }

        // Check if the user-device association already exists
        const userDeviceQueryText = "SELECT * FROM user_devices WHERE email = $1 AND device_identifier = $2";
        const userDeviceQueryValues = [email, device_identifier];
        const userDeviceResult = await dbClient.query(userDeviceQueryText, userDeviceQueryValues);

        if (userDeviceResult.rows.length === 0) {
          // Link user and device in user_devices table
          await dbClient.query(
            "INSERT INTO user_devices (email, device_identifier) VALUES ($1, $2)",
            [email, device_identifier]
          );
        }

        await dbClient.query("COMMIT");
        res.status(200).send({ message: "Login successful" });
      } else {
        res.status(401).send({ error: "Invalid password" });
      }
    } else {
      res.status(404).send({
        error: "No account with this email exists. Please try signing up instead.",
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
