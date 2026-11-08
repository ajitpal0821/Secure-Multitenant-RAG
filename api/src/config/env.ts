
import dotenv from "dotenv";
import path from "node:path";

// Load the .env file from the project root.
dotenv.config({
    path: path.resolve(process.cwd(), "../.env")
});

const requiredVariables = [
    "JWT_SECRET",
    "DB_HOST",
    "DB_USER",
    "DB_PASSWORD",
    "DB_NAME"
];

for (const variable of requiredVariables) {
    if (!process.env[variable]) {
        throw new Error(`Missing environment variable: ${variable}`);
    }
}

export const env = {
    nodeEnv: process.env.NODE_ENV || "development",

    securityMode: process.env.SECURITY_MODE || "vulnerable",

    jwtSecret: process.env.JWT_SECRET!,

    jwtExpiresIn: "7d",

    database: {
        host: process.env.DB_HOST!,
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER!,
        password: process.env.DB_PASSWORD!,
        database: process.env.DB_NAME!
    },

    geminiApiKey: process.env.GEMINI_API_KEY,

    embeddingModel:
        process.env.GEMINI_EMBEDDING_MODEL ||
        "gemini-embedding-001",

    chatModel:
        process.env.GEMINI_CHAT_MODEL ||
        "gemini-3.8-flash"
};
