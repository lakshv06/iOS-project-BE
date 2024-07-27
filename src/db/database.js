import pkg from 'pg';
import dotenv from 'dotenv';

// Destructure the Pool from the imported package
const { Pool } = pkg;

// Load environment variables from .env file
dotenv.config();

// Configure PostgreSQL connection pool
const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
});

const createUserTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
    email VARCHAR(100) PRIMARY KEY,
    password VARCHAR(255) NOT NULL
    );
`;

const createDeviceListTableQuery = `
    CREATE TABLE IF NOT EXISTS deviceList (
        device_identifier VARCHAR(255) PRIMARY KEY,
        device_name VARCHAR(255) NOT NULL,
        device_model VARCHAR(255) NOT NULL
    );
`;

const createUserDevicesTableQuery = `
    CREATE TABLE IF NOT EXISTS user_devices (
      email VARCHAR(255),
      device_identifier VARCHAR(255),
      PRIMARY KEY (email, device_identifier),
      FOREIGN KEY (email) REFERENCES users(email) ON DELETE CASCADE,
      FOREIGN KEY (device_identifier) REFERENCES deviceList(device_identifier) ON DELETE CASCADE
    );
`;

// Function to initialize the database and create tables
const initDb = async () => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        await client.query(createUserTableQuery);
        console.log('Table "users" created successfully');

        await client.query(createDeviceListTableQuery);
        console.log('Table "deviceList" created successfully');

        await client.query(createUserDevicesTableQuery);
        console.log('Table "user_devices" created successfully');

        await client.query("COMMIT");
    } catch (err) {
        console.error('Error creating tables', err);
        await client.query("ROLLBACK");
    } finally {
        client.release();
    }
};

initDb();

export default pool;
