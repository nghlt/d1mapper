import { D1Database } from '@cloudflare/workers-types';

/**
 * The result of a database operation.
 */
export interface DatabaseResult {
  success: boolean;
  changes?: number;
}

/**
 * Options for constructing a Database instance.
 * @template T - Record type representing table schema.
 */
export interface DatabaseOptions<T extends Record<string, any>> {
  db: D1Database;
  tableName: string;
  defaultProperties?: Partial<T>;
  primaryKeyName: keyof T;
}

/**
 * A wrapper around Cloudflare D1 providing basic CRUD operations.
 * @template T - Record type representing table schema.
 */
export class Database<T extends Record<string, any>> {
  private db: D1Database;
  private tableName: string;
  private defaultProperties: Partial<T>;
  private primaryKeyName: keyof T;

  /**
   * Construct a Database instance.
   * @param options - Options for the database instance.
   */
  constructor(options: DatabaseOptions<T>) {
    this.db = options.db;
    this.tableName = options.tableName;
    this.defaultProperties = options.defaultProperties ?? {};
    this.primaryKeyName = options.primaryKeyName;
  }

  /**
   * Execute a SQL query with positional parameters.
   * @param query - SQL query string.
   * @param params - Array of parameters to bind.
   * @returns DatabaseResult containing success status and change count.
   */
  private async exec(query: string, params: any[]): Promise<DatabaseResult> {
    const result = await this.db.prepare(query).bind(...params).run();
    if (!result.success) {
      throw new Error(`Query failed: ${query}`);
    }
    return { success: true, changes: result.meta?.changes };
  }

  /**
   * Insert a record into the table. Missing props use defaults.
   * @param record - Partial record to insert.
   * @returns Result of the insert operation.
   */
  async insert(record: Partial<T>): Promise<DatabaseResult> {
    // merge any defaults with provided record, omit undefined keys
    const combined: Partial<T> = { ...this.defaultProperties, ...record };
    const keys = Object.keys(combined) as (keyof T)[];
    const values = keys.map(k => combined[k]!);
    const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ');
    const query = `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
    return this.exec(query, values as any[]);
  }

  /**
   * Find one record matching a condition.
   * @param props - Column(s) to select.
   * @param conditionKey - Column to filter by.
   * @param conditionValue - Value to match.
   * @returns A single record or null.
   */
  async findOne<K extends keyof T>(
    props: K | K[],
    conditionKey: keyof T,
    conditionValue: T[keyof T]
  ): Promise<Pick<T, K> | null> {
    const columns = Array.isArray(props) ? props.join(', ') : (props as string);
    const query = `SELECT ${columns} FROM ${this.tableName} WHERE ${String(conditionKey)} = ?1 LIMIT 1`;
    return await this.db.prepare(query).bind(conditionValue).first<Pick<T, K>>();
  }

  /**
   * Retrieve all records selecting specified properties.
   * @param props - Column(s) to select.
   * @returns Array of records with selected properties.
   */
  async findAll<K extends keyof T>(props: K | K[]): Promise<Pick<T, K>[]> {
    const columns = Array.isArray(props) ? props.join(', ') : (props as string);
    const query = `SELECT ${columns} FROM ${this.tableName}`;
    const { results } = await this.db.prepare(query).all<Pick<T, K>>();
    return results;
  }

  /**
   * Find records matching a filter (all columns).
   * @param filter - Partial record for WHERE clause.
   */
  async findMany(filter: Partial<T>): Promise<T[]>;

  /**
   * Find records matching a filter with selected properties.
   * @param props - Column(s) to select.
   * @param filter - Partial record for WHERE clause.
   */
  async findMany<K extends keyof T>(props: K | K[], filter: Partial<T>): Promise<Pick<T, K>[]>;

  async findMany<K extends keyof T>(
    propsOrFilter: K | K[] | Partial<T>,
    filter?: Partial<T>
  ): Promise<any[]> {
    let columns: string;
    let whereObj: Partial<T>;

    if (filter === undefined) {
      // only filter provided, select all columns
      whereObj = propsOrFilter as Partial<T>;
      columns = '*';
    } else {
      // props and filter provided
      whereObj = filter;
      columns = Array.isArray(propsOrFilter)
        ? (propsOrFilter as K[]).join(', ')
        : (propsOrFilter as string);
    }

    const keys = Object.keys(whereObj) as (keyof T)[];
    const clauses = keys.map((k, i) => `${String(k)} = ?${i + 1}`).join(' AND ');
    const query = `SELECT ${columns} FROM ${this.tableName}` + (clauses ? ` WHERE ${clauses}` : '');
    const values = keys.map(k => whereObj[k]);
    const { results } = await this.db.prepare(query).bind(...values).all<any>();
    return results;
  }

  /**
   * Update records matching a condition.
   * @param record - Partial properties to update.
   * @param conditionKey - Column to filter by.
   * @param conditionValue - Value to match.
   * @returns Result containing change count.
   */
  async update(
    record: Partial<T>,
    conditionKey: keyof T,
    conditionValue: T[keyof T]
  ): Promise<DatabaseResult> {
    const keys = Object.keys(record) as (keyof T)[];
    if (keys.length === 0) {
      return { success: true, changes: 0 };
    }
    const setters = keys.map((key, i) => `${String(key)} = ?${i + 2}`).join(', ');
    const query = `UPDATE ${this.tableName} SET ${setters} WHERE ${String(conditionKey)} = ?1`;
    const values = [conditionValue, ...keys.map(k => record[k])];
    return this.exec(query, values);
  }

  /**
   * Delete records matching a condition.
   * @param conditionKey - Column to filter by.
   * @param conditionValue - Value to match.
   * @returns Result containing change count.
   */
  async delete(conditionKey: keyof T, conditionValue: T[keyof T]): Promise<DatabaseResult> {
    const query = `DELETE FROM ${this.tableName} WHERE ${String(conditionKey)} = ?1`;
    return this.exec(query, [conditionValue]);
  }

  /**
   * Increment a numeric column by a step for matching records.
   * @param column - Column to increment.
   * @param step - Amount to add.
   * @param conditionKey - Column to filter by.
   * @param conditionValue - Value to match.
   * @returns Result containing change count.
   */
  async increment(
    column: keyof T,
    step: number,
    conditionKey: keyof T,
    conditionValue: T[keyof T]
  ): Promise<DatabaseResult> {
    const query = `UPDATE ${this.tableName} SET ${String(column)} = ${String(column)} + ?1 WHERE ${String(conditionKey)} = ?2`;
    return this.exec(query, [step, conditionValue]);
  }

  /**
   * Check existence of a record matching a condition.
   * @param conditionKey - Column to filter by.
   * @param conditionValue - Value to match.
   * @returns True if record exists, else false.
   */
  async exists(conditionKey: keyof T, conditionValue: T[keyof T]): Promise<boolean> {
    const query = `SELECT 1 FROM ${this.tableName} WHERE ${String(conditionKey)} = ?1 LIMIT 1`;
    const result = await this.db.prepare(query).bind(conditionValue).first<{ '1': number }>();
    return Boolean(result);
  }
}
