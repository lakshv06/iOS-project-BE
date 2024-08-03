import redis from 'redis';

// Create Redis client
const redisClient = redis.createClient({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    // password: process.end.REDIS_PASSWORD,
  });
  

// Handle Redis client errors
redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});

// Log Redis connection
(async () => {
    await redisClient.connect();
  })();

export default redisClient;
