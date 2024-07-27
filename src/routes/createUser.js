import express from "express";
import pool from "../db/database.js";

const router = express.Router();

router.post("/", async (req, res) => {
  console.log("Received POST request to /sign-up");

  const { email, password, confirm_password, device_name, device_model, device_identifier } = req.body;

  if (!email || !password) {
    return res.status(400).send({ error: "Email and password are required" });
  }

  if (password !== confirm_password) {
    return res
      .status(400)
      .send({ error: "Password and confirm password should be the same" });
  }

  if (!device_name || !device_model || !device_identifier) {
    return res.status(400).send({ error: "Device information is incomplete" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Check if the email already exists
    const userResult = await client.query(
      "SELECT email FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length > 0) {
      // Email already exists
      return res.status(400).send({ error: "Email already exists" });
    }

    // Insert user into `users` table
    await client.query(
      "INSERT INTO users (email, password) VALUES ($1, $2)",
      [email, password]
    );

    // Insert device into `deviceList` table
    await client.query(
      "INSERT INTO deviceList (device_identifier, device_name, device_model) VALUES ($1, $2, $3) ON CONFLICT (device_identifier) DO NOTHING",
      [device_identifier, device_name, device_model]
    );

    // Link user and device in `user_devices` table
    await client.query(
      "INSERT INTO user_devices (email, device_identifier) VALUES ($1, $2) ON CONFLICT (email, device_identifier) DO NOTHING",
      [email, device_identifier]
    );

    await client.query("COMMIT");

    res.status(201).send({ message: "User and device registered successfully" });
  } catch (err) {
    console.error("Error inserting user", err);
    await client.query("ROLLBACK");
    res.status(500).send({ error: "Internal Server Error" });
  } finally {
    client.release();
  }
});

export default router;
