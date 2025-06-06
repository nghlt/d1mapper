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
   * Find one record matching a condition and return the full record.
   * 
   * @param props - An empty array indicating all columns should be selected (`SELECT *`).
   * @param conditionKey - Column to filter by.
   * @param conditionValue - Value to match.
   * @returns The full record (`T`) if found, or null.
   */
  async findOne(
    props: [],
    conditionKey: keyof T,
    conditionValue: T[keyof T]
  ): Promise<T | null>;
  /**
   * Find one record matching a condition and select specific columns.
   * 
   * @param props - Column(s) to select.
   * @param conditionKey - Column to filter by.
   * @param conditionValue - Value to match.
   * @returns The record with selected properties if found, or null.
   */
  async findOne<K extends keyof T>(
    props: K | K[],
    conditionKey: keyof T,
    conditionValue: T[keyof T]
  ): Promise<Pick<T, K> | null>;


  async findOne<K extends keyof T>(
    props: K | K[] | [],
    conditionKey: keyof T,
    conditionValue: T[keyof T]
  ): Promise<any> {
    let columns: string;
    if (Array.isArray(props)) {
      columns = props.length > 0 ? props.join(', ') : '*';
    } else {
      columns = props as string;
    }
    const query = `SELECT ${columns} FROM ${this.tableName} WHERE ${String(conditionKey)} = ?1 LIMIT 1`;
    return await this.db.prepare(query).bind(conditionValue).first<Pick<T, K>>();
  }
  /**
   * Retrieve all records with all columns.
   * 
   * @param props - An empty array indicating all columns should be selected (`SELECT *`).
   * @returns Array of full records (`T[]`).
   */
  async findAll(props: []): Promise<T[]>;
  /**
   * Retrieve all records with selected properties.
   * 
   * @param props - Column(s) to select.
   * @returns Array of records with selected properties.
   */
  async findAll<K extends keyof T>(props: K | K[]): Promise<Pick<T, K>[]>;
  async findAll<K extends keyof T>(props: K | K[] | []): Promise<any[]> {
    let columns: string;
    if (Array.isArray(props)) {
      columns = props.length > 0 ? props.join(', ') : '*';
    } else {
      columns = props as string;
    }
    const query = `SELECT ${columns} FROM ${this.tableName}`;
    const { results } = await this.db.prepare(query).all<any>();
    return results;
  }

  /**
   * Find records matching a filter (all columns).
   * @param props - An empty array indicating all columns should be selected (`SELECT *`).
   * @param filter - Partial record for WHERE clause.
   */
  async findMany(props: [], filter: Partial<T>): Promise<T[]>;

  /**
   * Find records matching a filter with selected properties.
   * @param props - Column(s) to select.
   * @param filter - Partial record for WHERE clause.
   */
  async findMany<K extends keyof T>(props: K | K[], filter: Partial<T>): Promise<Pick<T, K>[]>;

  async findMany<K extends keyof T>(
    props: K | K[] | [],
    filter: Partial<T>
  ): Promise<any[]> {
    let columns: string;

    if (Array.isArray(props)) {
      columns = props.length > 0 ? props.join(', ') : '*';
    } else {
      columns = props as string;
    }
    const keys = Object.keys(filter) as (keyof T)[];
    const clauses = keys.map((k, i) => `${String(k)} = ?${i + 1}`).join(' AND ');
    const query = `SELECT ${columns} FROM ${this.tableName}` + (clauses ? ` WHERE ${clauses}` : '');
    const values = keys.map(k => filter[k]);
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

  /**
   * Find a record by primary key returning full record.
   * @param props - An empty array to select all columns.
   * @param id - Primary key value.
   */
  async findById<K extends keyof T>(props: [], id: T[keyof T]): Promise<T | null>;
  /**
     * Find a record by primary key.
     * @param props - Column(s) to select.
     * @param id - Primary key value.
     */
  async findById<K extends keyof T>(props: K | K[], id: T[keyof T]): Promise<Pick<T, K> | null>

  async findById<K extends keyof T>(props: K | K[], id: T[keyof T]): Promise<any> {
    return this.findOne(props, this.primaryKeyName, id);
  }

  /**
   * Update a record by primary key.
   * @param record - Partial properties to update.
   * @param id - Primary key value.
   */
  async updateById(record: Partial<T>, id: T[keyof T]): Promise<DatabaseResult> {
    return this.update(record, this.primaryKeyName, id);
  }

  /**
   * Delete a record by primary key.
   * @param id - Primary key value.
   */
  async deleteById(id: T[keyof T]): Promise<DatabaseResult> {
    return this.delete(this.primaryKeyName, id);
  }

  /**
   * Increment a numeric column by primary key.
   * @param column - Column to increment.
   * @param step - Amount to add.
   * @param id - Primary key value.
   */
  async incrementById(column: keyof T, step: number, id: T[keyof T]): Promise<DatabaseResult> {
    return this.increment(column, step, this.primaryKeyName, id);
  }

  /**
   * Check existence by primary key.
   * @param id - Primary key value.
   */
  async existsById(id: T[keyof T]): Promise<boolean> {
    return this.exists(this.primaryKeyName, id);
  }
}
