import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.ts";

const connectionString =
	process.env.DATABASE_URL ??
	"postgresql://realtime_board:realtime_board@localhost:5432/realtime_board";

export const pool = new Pool({ connectionString });
export const db = drizzle({ client: pool, schema });
