import net from "node:net";
import { env } from "../config/env.js";

const fallbackStore = new Map<
    string,
    { count: number; expiresAt: number }
>();

function encodeRespCommand(args: string[]): string {
    const parts = [`*${args.length}\r\n`];
    for (const arg of args) {
        const byteLength = Buffer.byteLength(arg, "utf8");
        parts.push(`$${byteLength}\r\n${arg}\r\n`);
    }
    return parts.join("");
}

function execRedisCommands(commands: string[][]): Promise<string> {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({
            host: env.redis.host,
            port: env.redis.port
        });

        let responseData = "";
        let settled = false;

        const finish = (err?: Error) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            if (err) {
                reject(err);
            } else {
                resolve(responseData);
            }
        };

        socket.setTimeout(500);

        socket.on("connect", () => {
            const payload = commands
                .map((cmd) => encodeRespCommand(cmd))
                .join("");
            socket.write(payload);
        });

        socket.on("data", (chunk) => {
            responseData += chunk.toString("utf8");
            const replies = responseData.match(/^[+:$-].*\r\n/gm);
            if (replies && replies.length >= commands.length) {
                finish();
            }
        });

        socket.on("end", () => {
            finish();
        });

        socket.on("timeout", () => {
            finish(new Error("Redis connection timeout"));
        });

        socket.on("error", (err) => {
            finish(err);
        });
    });
}

function incrementFallback(
    key: string,
    windowSeconds: number
): number {
    const now = Date.now();
    const existing = fallbackStore.get(key);

    if (!existing || existing.expiresAt <= now) {
        fallbackStore.set(key, {
            count: 1,
            expiresAt: now + windowSeconds * 1000
        });
        return 1;
    }

    existing.count += 1;
    return existing.count;
}

export async function incrementRateLimitKey(
    key: string,
    windowSeconds: number
): Promise<number> {
    try {
        const raw = await execRedisCommands([
            ["INCR", key],
            ["TTL", key]
        ]);

        const intMatches = [...raw.matchAll(/:(-?\d+)\r\n/g)].map(
            (m) => Number(m[1])
        );

        if (intMatches.length === 0) {
            throw new Error("Invalid Redis response");
        }

        const count = intMatches[0];
        const ttl = intMatches[1] ?? -1;

        if (count === 1 || ttl < 0) {
            await execRedisCommands([
                ["EXPIRE", key, String(windowSeconds)]
            ]);
        }

        return count;
    } catch {
        return incrementFallback(key, windowSeconds);
    }
}

export async function resetRateLimitKey(key: string): Promise<void> {
    fallbackStore.delete(key);

    try {
        await execRedisCommands([["DEL", key]]);
    } catch {
        // Fallback already cleared above.
    }
}
