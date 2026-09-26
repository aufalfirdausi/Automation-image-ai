import dotenv from "dotenv";

dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigin: string;
  database: {
    host: string;
    port: number;
    user: string;
    password?: string;
    database: string;
    connectionLimit: number;
  };
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || "5001", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  database: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "orchestrator_local",
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || "10", 10),
  },
};
