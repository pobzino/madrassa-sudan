// A tiny in-memory stand-in for the Supabase query builder, enough for the
// milestone route tests: select/insert/update/delete/upsert with eq/in/is
// filters, order/limit, maybeSingle/single, head counts, and an rpc hook.

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export interface FakeDb {
  tables: Record<string, Row[]>;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  calls: Array<{ table: string; op: string; values?: unknown }>;
}

export function createFakeDb(tables: Record<string, Row[]>, rpc?: FakeDb["rpc"]) {
  const db: FakeDb = {
    tables,
    rpc: rpc ?? (async () => ({ data: null, error: { message: "no rpc" } })),
    calls: [],
  };

  function builder(table: string) {
    const filters: Filter[] = [];
    let op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    let values: Row | Row[] | null = null;
    let upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    let head = false;
    let count = false;
    let order: { column: string; ascending: boolean } | null = null;
    let limit: number | null = null;
    let returnRows = false;

    const rows = () => (db.tables[table] ??= []);
    const run = () => {
      if (op === "insert" || op === "upsert") {
        const list = (Array.isArray(values) ? values : [values!]).map((value, i): Row => ({ id: value.id ?? `${table}-${rows().length + i + 1}`, ...value }));
        const inserted: Row[] = [];
        for (const row of list) {
          if (op === "upsert" && upsertOptions.onConflict) {
            const keys = upsertOptions.onConflict.split(",");
            const clash = rows().find((existing) => keys.every((key) => existing[key] === row[key]));
            if (clash) {
              if (!upsertOptions.ignoreDuplicates) Object.assign(clash, row);
              continue;
            }
          }
          rows().push(row);
          inserted.push(row);
        }
        db.calls.push({ table, op, values });
        return { data: returnRows ? inserted : null, error: null };
      }
      const matched = rows().filter((row) => filters.every((filter) => filter(row)));
      if (op === "update") {
        matched.forEach((row) => Object.assign(row, values));
        db.calls.push({ table, op, values });
        return { data: returnRows ? matched : null, error: null };
      }
      if (op === "delete") {
        db.tables[table] = rows().filter((row) => !matched.includes(row));
        db.calls.push({ table, op });
        return { data: null, error: null };
      }
      let result = [...matched];
      if (order) {
        const { column, ascending } = order;
        result.sort((a, b) => (a[column]! > b[column]! ? 1 : a[column]! < b[column]! ? -1 : 0) * (ascending ? 1 : -1));
      }
      if (limit !== null) result = result.slice(0, limit);
      if (head) return { data: null, count: result.length, error: null };
      return { data: result, count: count ? result.length : null, error: null };
    };

    const api = {
      select(_columns?: string, options?: { count?: string; head?: boolean }) {
        if (op !== "select") returnRows = true;
        if (options?.head) head = true;
        if (options?.count) count = true;
        return api;
      },
      insert(value: Row | Row[]) { op = "insert"; values = value; return api; },
      upsert(value: Row | Row[], options: typeof upsertOptions = {}) { op = "upsert"; values = value; upsertOptions = options; return api; },
      update(value: Row) { op = "update"; values = value; return api; },
      delete() { op = "delete"; return api; },
      eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return api; },
      in(column: string, list: unknown[]) { filters.push((row) => list.includes(row[column])); return api; },
      is(column: string, value: unknown) { filters.push((row) => (row[column] ?? null) === value); return api; },
      lt(column: string, value: unknown) { filters.push((row) => String(row[column] ?? "") < String(value)); return api; },
      gt(column: string, value: unknown) { filters.push((row) => String(row[column] ?? "") > String(value)); return api; },
      order(column: string, options: { ascending?: boolean } = {}) { order = { column, ascending: options.ascending !== false }; return api; },
      limit(value: number) { limit = value; return api; },
      returns() { return api; },
      async maybeSingle() {
        const result = run();
        const list = (result.data as Row[] | null) ?? [];
        return { data: list[0] ?? null, error: null };
      },
      async single() {
        const result = run();
        const list = (result.data as Row[] | null) ?? [];
        return list[0] ? { data: list[0], error: null } : { data: null, error: { message: "not found" } };
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        try {
          return Promise.resolve(run()).then(resolve, reject);
        } catch (error) {
          return Promise.reject(error).then(resolve, reject);
        }
      },
    };
    return api;
  }

  const client = {
    from: (table: string) => builder(table),
    rpc: (name: string, args: Record<string, unknown>) => db.rpc(name, args),
    storage: {
      from: () => ({
        list: async () => ({ data: [], error: null }),
        upload: async () => ({ error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }),
    },
    auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
  };
  return { db, client };
}
