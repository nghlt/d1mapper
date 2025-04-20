# d1mapper

A simple ORM-like wrapper for Cloudflare D1 databases in TypeScript.

## Defining your schema

First, declare a TypeScript interface for your table, listing all columns and their types:

```ts
interface UserRow {
  id: number;
  name: string;
  age?: number;      // optional column
  bio?: string;      // optional column
}
```

## Installation

```bash
npm install d1mapper
```

## Usage

```ts
import { Database } from 'd1mapper';
import { D1Database } from '@cloudflare/workers-types';

// instantiate with your full schema type
const db = new Database<UserRow>({
  db: env.D1,             // from your worker environment
  tableName: 'users',
  primaryKeyName: 'id',   // required
  // you can omit defaultProperties to let D1 use column defaults
  // or supply only those you want:
  defaultProperties: { name: 'Anonymous' },
});

// insert a record (only provided fields are saved)
await db.insert({ id: 1, name: 'Alice' });

// find one
const user = await db.findOne(['id', 'name', 'age'], 'id', 1);

// update
await db.update({ score: 10 }, 'id', 1);

// increment
await db.increment('score', 5, 'id', 1);

// exists
const has = await db.exists('id', 1);

// delete
await db.delete('id', 1);
```

## API Reference

Here is a summary of the available methods on `Database<T>`:

### insert
- **Signature**: `insert(record: Partial<T>): Promise<DatabaseResult>`
- **Description**: Insert a new record into the table. Merges provided fields with default properties, omitting undefined values.
- **Parameters**:
  - `record`: Partial object containing columns to set.
- **Returns**: `Promise<DatabaseResult>` indicating success and number of changes.

### findOne
- **Signature**: `findOne<K extends keyof T>(props: K | K[], conditionKey: keyof T, conditionValue: T[keyof T]): Promise<Pick<T, K> | null>`
- **Description**: Retrieve a single record matching the given condition.
- **Parameters**:
  - `props`: Column(s) to select.
  - `conditionKey`: Column to filter by.
  - `conditionValue`: Value to match.
- **Returns**: A single record object or `null` if not found.

### findAll
- **Signature**: `findAll<K extends keyof T>(props: K | K[]): Promise<Pick<T, K>[]>`
- **Description**: Fetch all records selecting the specified properties.
- **Parameters**:
  - `props`: Column(s) to select.
- **Returns**: Array of records.

### update
- **Signature**: `update(record: Partial<T>, conditionKey: keyof T, conditionValue: T[keyof T]): Promise<DatabaseResult>`
- **Description**: Update records that match the condition. No-op if no fields provided.
- **Parameters**:
  - `record`: Partial object of columns to update.
  - `conditionKey`: Column to filter by.
  - `conditionValue`: Value to match.
- **Returns**: `Promise<DatabaseResult>` indicating success and number of changes.

### delete
- **Signature**: `delete(conditionKey: keyof T, conditionValue: T[keyof T]): Promise<DatabaseResult>`
- **Description**: Delete records matching the given condition.
- **Parameters**:
  - `conditionKey`: Column to filter by.
  - `conditionValue`: Value to match.
- **Returns**: `Promise<DatabaseResult>`.

### increment
- **Signature**: `increment(column: keyof T, step: number, conditionKey: keyof T, conditionValue: T[keyof T]): Promise<DatabaseResult>`
- **Description**: Increment a numeric column by a specified amount for matching records.
- **Parameters**:
  - `column`: Column to increment.
  - `step`: Amount to add.
  - `conditionKey`: Column to filter by.
  - `conditionValue`: Value to match.
- **Returns**: `Promise<DatabaseResult>`.

### exists
- **Signature**: `exists(conditionKey: keyof T, conditionValue: T[keyof T]): Promise<boolean>`
- **Description**: Check if a record exists matching the given condition.
- **Parameters**:
  - `conditionKey`: Column to filter by.
  - `conditionValue`: Value to match.
- **Returns**: `Promise<boolean>`.

## Full Cloudflare Worker Example

```ts
import { Database } from 'd1mapper';
import { D1Database } from '@cloudflare/workers-types';

interface UserRow {
  id: number;
  name: string;
  age?: number;
  bio?: string;
}

export default {
  async fetch(request: Request, env: any) {
    const db = new Database<UserRow>({
      db: env.D1,
      tableName: 'users',
      primaryKeyName: 'id'
    });

    // Insert a new user
    await db.insert({ id: 2, name: 'Bob', age: 30 });

    // Get the user
    const bob = await db.findOne(['id', 'name', 'age'], 'id', 2);

    // Update the user
    await db.update({ bio: 'Hello!' }, 'id', 2);

    // List all users
    const allUsers = await db.findAll(['id', 'name', 'age', 'bio']);

    // Delete the user
    await db.delete('id', 2);

    return new Response(JSON.stringify({ bob, allUsers }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
```


## Support this project

<a href="https://paypal.me/ltn119412" target="_blank"><img src="https://raw.githubusercontent.com/trungnghiatn/Downgrade-MAS-Applications/main/Images/buy-me-a-coffee.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

## License
This project is licensed under the MIT License.
