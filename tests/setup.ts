process.env.NODE_ENV = "test";
process.env.PORT = "3001";
process.env.DATABASE_URL = "postgresql://rescuebite:rescuebite@localhost:5432/rescuebite";
process.env.REDIS_URL = "redis://:redis_secret@localhost:6379";
process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-characters-long";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-at-least-32-characters-long";
process.env.JWT_ACCESS_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";
process.env.DECAY_INTERVAL_MINUTES = "15";
process.env.DECAY_PERCENTAGE = "10";
process.env.MIN_FOOD_PRICE_CENTS = "50000";
process.env.AUCTION_TRIGGER_MINUTES = "30";
process.env.CORS_ORIGIN = "http://localhost:3001";

