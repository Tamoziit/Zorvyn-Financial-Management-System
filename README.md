# Zorvyn Finance Management System — Backend API

> REST API backend powering the Zorvyn Financial Management System. Built with **Node.js + Express + TypeScript**, persisted in **MongoDB**, and session-managed via **Redis** with **JWT** authentication.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack](#2-tech-stack)
3. [Environment Variables](#3-environment-variables)
4. [Authentication & Token Flow](#4-authentication--token-flow)
5. [RBAC Enforcement](#5-rbac-enforcement)
6. [Data Schemas](#6-data-schemas)
7. [API Reference](#7-api-reference)
   - [Health Check](#health-check)
   - [Master Routes](#master-routes--apiv1master)
   - [Auth Routes](#auth-routes--apiv1auth)
   - [User Routes](#user-routes--apiv1user)
   - [Account Routes](#account-routes--apiv1account)
   - [Transaction Routes](#transaction-routes--apiv1transactions)
   - [Analytics Routes](#analytics-routes--apiv1analytics)
   - [Test Routes](#test-routes--apiv1test)
8. [Running Locally](#8-running-locally)

---

## 1. Architecture Overview

```
Client
  │
  ├── HTTP Request (Bearer token in Authorization header)
  │
  ▼
Express App (server.ts)
  │
  ├── Global Middleware: CORS, Helmet, Morgan, Body-Parser, Cookie-Parser
  │
  ├── /api/v1/master  ──►  verifyMaster  ──►  Master Controller
  ├── /api/v1/auth    ──►  verifyToken? + requireAdminRole?  ──►  Auth Controller
  ├── /api/v1/user    ──►  verifyToken + requireAdminRole  ──►  User Controller
  ├── /api/v1/account ──►  verifyToken + requireAdminRole?  ──►  Account Controller
  └── /api/v1/test    ──►  Test Controller
        │
        ▼
  Business Logic
        │
        ├── MongoDB (Mongoose) — persistent storage
        └── Redis (ioredis)    — session store / user payload cache
```

**Design rationale:**
- The application follows a **layered architecture**: routes → middlewares → controllers → models. This keeps each layer's concern isolated and swap-friendly.
- `helmet` and explicit `cors` configuration protect against common HTTP vulnerabilities out of the box.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express 5 |
| Database | MongoDB |
| Cache / Session | Redis via ioredis & Upstash |
| Auth | JSON Web Tokens (jsonwebtoken) |
| Password Hashing | bcryptjs (salt rounds: 12) |
| Email | Resend |
| Security | Helmet, CORS, JWT & Session-cookies |
| Logging | Morgan (`common` format) |
| Dev tooling | ts-node, nodemon, tsx |

---

## 3. Environment Variables

Copy `.env.example` to `.env` and fill in the values before starting the server.

```env
PORT=5000
MONGODB_URI=<your MongoDB connection string>
JWT_SECRET=<strong random secret>
RESEND_API_KEY=<your Resend API key>
REDIS_URL=<your_Upstah_URL>
NODE_ENV=development   # or production
MASTER_PASSWORD=<secure master bootstrap password>
```

> **Why `MASTER_PASSWORD`?** The very first admin cannot be created through the ordinary `/auth/signup` flow (which itself requires admin privileges). The `MASTER_PASSWORD` acts as an out-of-band secret used exclusively by the `/master` route family, enabling a chicken-and-egg-free bootstrap of the admin hierarchy.

---

## 4. Authentication & Token Flow

### Overview

The system uses a **stateful-JWT hybrid** pattern:

```
Login / Signup
     │
     ▼
1. Validate credentials against MongoDB
2. Call generateTokenAndSetCookie(userId)
     │   └── jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' })
     │   └── Set HttpOnly cookie "ZN-jwt" (30 days)
     │   └── Return raw token string
     │
3. Build user payload:
   { token, _id, role, name, email, mobileNo, gender }
     │
4. Store payload in Redis:
   SET  "ZN-user:{userId}"  JSON.stringify(payload)
   EXPIRE               30 * 24 * 60 * 60  (30 days)
     │
5. Respond with:
   - 201 JSON body (user info + token)
   - Authorization: Bearer <token> response header
   - ZN-jwt HttpOnly cookie
```

### Request Authentication (verifyToken middleware)

Every protected route runs `verifyToken` before any RBAC check:

```
Incoming Request
     │
     ▼
1. Extract token from  Authorization: Bearer <token>  header
2. jwt.verify(token, JWT_SECRET)  →  { userId }
3. Redis GET "ZN-user:{userId}"
     ├── Not found → 401 "No User Data in Cache"
     └── Found → parse JSON payload
4. Compare payload.token === incoming token
     └── Mismatch → 401 "Token Mismatch"   (prevents replay after re-login)
5. User.findById(userId).populate("role")
     └── Not found → 404
6. Attach user to req.user  →  next()
```

**Why Redis token binding?**
Storing the active token in Redis allows instant session invalidation on logout (`DEL "ZN-user:{userId}"`) without waiting for JWT expiry. It also naturally solves the single-device session constraint: a new login overwrites the Redis key, making the old token fail the token-mismatch check even though the JWT itself is still cryptographically valid.

**Why dual delivery (cookie + header)?**
- The `ZN-jwt` **HttpOnly cookie** protects browser-based clients from XSS token theft.
- The `Authorization` **response header** + body `token` field support API clients (mobile apps, Postman) that manage tokens manually.

### Role Update Without Re-Login

When an admin updates a user's role via `PATCH /api/v1/user/update-user-state/:id`, the controller:
1. Updates the `role` field in MongoDB.
2. Fetches the live Redis payload for that user.
3. Patches `payload.role` in-place and re-writes it to Redis (resetting the 30-day TTL).

This means the role change takes effect **on the user's next request** without forcing them to log out and back in — preserving UX continuity while keeping Redis as the single source of truth for runtime role data.

---

## 5. RBAC Enforcement

The system defines three roles in order of ascending privilege:

| Role | Middleware | Allowed By |
|---|---|---|
| `viewer` | `verifyToken` | viewer, analyst, admin |
| `analyst` | `requireAnalyst` | analyst, admin |
| `admin` | `requireAdminRole` | admin only |

### Permitted Operations Overview

- **viewer**: `read_record`, `view_summary`
- **analyst**: `read_record`, `view_summary`, `view_trends`, `view_category_breakdown`
- **admin**: `manage_users`, `create_record`, `read_record`, `update_record`, `delete_record`, `view_summary`, `view_trends`, `view_category_breakdown`

RBAC middlewares always run **after** `verifyToken` (which populates `req.user`). They read `req.user.role.name` directly from the freshly-fetched MongoDB document — not from the JWT payload — so there is no risk of stale role data inside the token itself.

The `Role` document stores a `permissions[]` array (see [Schemas](#6-data-schemas)) for fine-grained future use, while current route-level enforcement is coarse-grained (role name matching).

> **Why not encode role in the JWT?** Encoding the role in the JWT would require token rotation on every role change. The current design keeps the JWT as a pure identity proof (`userId` only) and delegates role/session state entirely to Redis, giving administrators the ability to change roles (and have them take effect) without disrupting active sessions.

---

## 6. Data Schemas

### User
```
_id          ObjectId
role         ObjectId → Role
status       String   enum: ["active", "inactive"]   default: "active"
name         String   required
email        String   required, unique, lowercase
password     String   required (bcrypt hash, min 6 chars)
mobileNo     String   required, length: 10
gender       String   enum: ["M", "F", "O"]
address:
  addressLine1  String  required
  addressLine2  String  optional
  VTC           String  required  (Village / Town / City)
  district      String  required
  state         String  required
  country       String  required
  pincode       String  required
createdAt    Date  (auto)
updatedAt    Date  (auto)
```

### Role
```
_id          ObjectId
name         String  enum: ["viewer", "analyst", "admin"], unique
permissions  String[]
             Allowed values: manage_users | create_record | read_record |
                             update_record | delete_record | view_summary |
                             view_trends | view_category_breakdown
createdAt    Date  (auto)
updatedAt    Date  (auto)
```

### Account
```
_id          ObjectId
userId       ObjectId → User
accountNo    String   unique, 12 chars (auto-generated)
IFSC         String   unique, 10 chars (auto-generated)
balance      Number   default: 2000
transactions ObjectId[] → Transaction
createdAt    Date  (auto)
updatedAt    Date  (auto)
```

### Transaction
```
_id          ObjectId
accountId    ObjectId → Account
amount       Number   required
type         String   enum: ["income", "expense"]
category     String   enum: ["salary","rent","luxury","essentials","loan","tax","others"]
note         String   optional, trimmed
createdBy    ObjectId → User
createdAt    Date  (auto)
updatedAt    Date  (auto)
```

### DeletedUser
> Soft-delete archive. When a user is deleted, their document is copied here before removal from the `users` collection. Preserves audit trail.
```
_id          ObjectId  (same as original user _id)
role         ObjectId → Role
status       String   default: "inactive"
name, email, password, mobileNo, gender, address  (same as User)
deletedBy    ObjectId → User  (admin who performed deletion)
deletedAt    Date
createdAt    Date  (auto)
updatedAt    Date  (auto)
```

### DeletedTransaction
> Soft-delete archive. When a transaction is deleted, its document is copied here before removal from the `transactions` collection. Preserves audit trail.
```
_id          ObjectId  (same as original transaction _id)
accountId    ObjectId → Account
amount       Number   required
type         String   enum: ["income", "expense"]
category     String   enum: ["salary","rent","luxury","essentials","loan","tax","others"]
note         String   optional, trimmed
createdBy    ObjectId → User
deletedBy    ObjectId → User  (admin who performed deletion)
deletedAt    Date
createdAt    Date  (auto)
updatedAt    Date  (auto)
```

---

## 7. API Reference

**Base URL:** `http://localhost:{PORT}/api/v1`

**Common Request Headers:**

| Header | Value | Required On |
|---|---|---|
| `Content-Type` | `application/json` | All POST / PATCH |
| `Authorization` | `Bearer <token>` | All protected routes |

**Common Error Responses:**

| Status | Body | Meaning |
|---|---|---|
| `400` | `{ "error": "..." }` | Validation or business logic failure |
| `401` | `{ "error": "..." }` | Missing / invalid / expired token |
| `403` | `{ "message": "..." }` | Authenticated but insufficient role |
| `404` | `{ "error": "User Not Found!" }` | Resource not found |
| `500` | `{ "error": "Internal Server Error" }` | Unexpected server error |

---

### Health Check

#### `GET /`
Renders this README as a styled HTML page (served by `root.controller.ts` via `marked`).

#### `GET /api/v1`
Simple liveness probe.

**Response `200`:**
```
Server Up & Running!
```

---

### Master Routes — `/api/v1/master`

> These routes bootstrap the very first admin user. They are protected by a separate `verifyMaster` middleware that validates a short-lived master JWT (not a user JWT).

---

#### `POST /api/v1/master/get-token`

Authenticates with the master password and returns a short-lived JWT to be used as a Bearer token for the `/add-admin` route.

**Auth:** None

**Request Body:**
```json
{
  "password": "your_master_password"
}
```

**Response `200`:**
```
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```
> Raw JWT string (not wrapped in an object). This token embeds `{ masterPassword }` and expires in **5 hours**.

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `401` | `{ "error": "Invalid Admin Credentials" }` | Wrong or missing password |
| `500` | `{ "error": "Internal Server error" }` | Unexpected error |

---

#### `POST /api/v1/master/add-admin`

Creates the first (or any subsequent) admin user. Functionally identical to `/auth/signup` but hardcodes `role = "admin"` and is guarded by the master token instead of a user JWT.

**Auth:** `Authorization: Bearer <master_token>`

**Request Body:**
```json
{
  "name": "Alice Admin",
  "email": "alice@zorvyn.com",
  "password": "secureP@ss1",
  "mobileNo": "9876543210",
  "gender": "F",
  "addressLine1": "42 Fintech Lane",
  "addressLine2": "Suite 7",
  "VTC": "Kolkata",
  "district": "Kolkata",
  "state": "West Bengal",
  "country": "India",
  "pincode": "700001"
}
```

**Response `201`:**
```json
{
  "_id": "663f1a2b4c5d6e7f8a9b0c1d",
  "role": "admin",
  "name": "Alice Admin",
  "email": "alice@zorvyn.com",
  "mobileNo": "9876543210",
  "gender": "F",
  "address": {
    "addressLine1": "42 Fintech Lane",
    "addressLine2": "Suite 7",
    "VTC": "Kolkata",
    "district": "Kolkata",
    "state": "West Bengal",
    "country": "India",
    "pincode": "700001"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

> A welcome email with credentials is dispatched asynchronously via Resend. The user session is simultaneously written to Redis (`ZN-user:{id}`, TTL 30 days).

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "All fields are required" }` | Any required field missing |
| `400` | `{ "error": "Password should be at least 6 characters long" }` | Short password |
| `400` | `{ "error": "Enter a valid Mobile Number" }` | mobileNo ≠ 10 digits |
| `400` | `{ "error": "Enter a gender" }` | gender not M / F / O |
| `400` | `{ "error": "A user with this mobile no. already exists..." }` | Duplicate mobileNo |
| `400` | `{ "error": "A user with this Email. already exists..." }` | Duplicate email |
| `400` | `{ "error": "Error in fetching Admin role" }` | `admin` role not seeded in DB |
| `401` | `{ "message": "Unauthorized: No token provided" }` | Missing Authorization header |
| `401` | `{ "message": "Unauthorized: Invalid token" }` | Malformed / expired master JWT |
| `403` | `{ "message": "Forbidden: Invalid admin password" }` | masterPassword mismatch in token |
| `500` | `{ "error": "Internal Server error" }` | Unexpected error |

---

### Authentication Routes — `/api/v1/auth`

---

#### `POST /api/v1/auth/signup`

Creates a new user with the specified role. **Restricted to admin users only.** Sends a welcome email with credentials.

**Auth:** `Authorization: Bearer <admin_user_token>` → `verifyToken` + `requireAdminRole`

**Request Body:**
```json
{
  "roleName": "analyst",
  "name": "Bob Analyst",
  "email": "bob@zorvyn.com",
  "password": "pass1234",
  "mobileNo": "9123456780",
  "gender": "M",
  "addressLine1": "10 Data Street",
  "addressLine2": "",
  "VTC": "Mumbai",
  "district": "Mumbai",
  "state": "Maharashtra",
  "country": "India",
  "pincode": "400001"
}
```

> `roleName` must be one of: `"viewer"`, `"analyst"`, `"admin"`

**Response `201`:**
```json
{
  "_id": "663f1a2b4c5d6e7f8a9b0c2e",
  "role": "analyst",
  "name": "Bob Analyst",
  "email": "bob@zorvyn.com",
  "mobileNo": "9123456780",
  "gender": "M",
  "address": {
    "addressLine1": "10 Data Street",
    "addressLine2": "",
    "VTC": "Mumbai",
    "district": "Mumbai",
    "state": "Maharashtra",
    "country": "India",
    "pincode": "400001"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "All fields are required" }` | Any required field missing |
| `400` | `{ "error": "Password should be at least 6 characters long" }` | Short password |
| `400` | `{ "error": "Name should be at least 2 characters long" }` | Short name |
| `400` | `{ "error": "Enter a valid Mobile Number" }` | mobileNo ≠ 10 digits |
| `400` | `{ "error": "Enter a gender" }` | gender not M / F / O |
| `400` | `{ "error": "A user with this mobile no. already exists..." }` | Duplicate mobileNo |
| `400` | `{ "error": "A user with this Email. already exists..." }` | Duplicate email |
| `400` | `{ "error": "Error in fetching user role" }` | roleName not found in DB |
| `401` | `{ "error": "Unauthorized - No Token Provided" }` | Missing Bearer token |
| `401` | `{ "error": "Unauthorized - Invalid Token" }` | JWT verification failed |
| `401` | `{ "error": "Unauthorized - No User Data in Cache, Login first" }` | Redis key missing |
| `401` | `{ "error": "Unauthorized - Token Mismatch" }` | Token replaced by re-login |
| `403` | `{ "message": "Forbidden - Requires Admin role" }` | Caller is not admin |
| `500` | `{ "error": "Internal Server Error" }` | Unexpected error |

---

#### `POST /api/v1/auth/login`

Authenticates a user by email and password. Issues a new JWT, repopulates the Redis session, and clears any stale cookie.

**Auth:** None

**Request Body:**
```json
{
  "email": "bob@zorvyn.com",
  "password": "pass1234"
}
```

**Response `201`:**
```json
{
  "_id": "663f1a2b4c5d6e7f8a9b0c2e",
  "role": "analyst",
  "name": "Bob Analyst",
  "email": "bob@zorvyn.com",
  "mobileNo": "9123456780",
  "gender": "M",
  "address": { "..." : "..." },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

> Response also sets the `ZN-jwt` HttpOnly cookie and includes `Authorization: Bearer <token>` in the response header.

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "Cannot find User" }` | Email not registered |
| `400` | `{ "error": "Invalid Login Credentials" }` | Password mismatch |
| `400` | `{ "error": "Error in fetching user role" }` | Role reference broken |
| `500` | `{ "error": "Internal Server Error" }` | Unexpected error |

---

#### `POST /api/v1/auth/logout/:id`

Logs out the specified user by clearing their `ZN-jwt` cookie and deleting their Redis session key. The JWT becomes effectively invalid on all subsequent requests even though it hasn't expired.

**Auth:** `Authorization: Bearer <token>` → `verifyToken`

**URL Params:**

| Param | Type | Description |
|---|---|---|
| `id` | `string` | MongoDB `_id` of the user to log out |

**Request Body:** None

**Response `200`:**
```json
{
  "message": "Logged out successfully"
}
```

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `401` | `{ "error": "Unauthorized - No Token Provided" }` | Missing Bearer token |
| `401` | `{ "error": "Unauthorized - Invalid Token" }` | JWT verification failed |
| `401` | `{ "error": "Unauthorized - No User Data in Cache, Login first" }` | Already logged out |
| `401` | `{ "error": "Unauthorized - Token Mismatch" }` | Stale token |
| `500` | `{ "error": "Internal Server Error" }` | Unexpected error |

---

### User Management Routes — `/api/v1/user`

> All routes in this group require `verifyToken` + `requireAdminRole`. Only `admin` users can manage other users.

---

#### `GET /api/v1/user`

Retrieves a paginated list of all users. Supports optional filtering by `status` and `role`.

**Auth:** Admin token required

**Query Params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | `1` | Page number |
| `limit` | number | `10` | Results per page |
| `status` | string | — | Filter by `"active"` or `"inactive"` |
| `role` | string | — | Filter by role name (`"admin"`, `"analyst"`, `"viewer"`) |

**Response `200`:**
```json
{
  "users": [
    {
      "_id": "663f1a2b4c5d6e7f8a9b0c2e",
      "role": { "_id": "...", "name": "analyst" },
      "status": "active",
      "name": "Bob Analyst",
      "email": "bob@zorvyn.com",
      "mobileNo": "9123456780",
      "gender": "M",
      "address": { "..." : "..." },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "currentPage": 1,
  "totalPages": 3,
  "totalUsers": 27
}
```

> `password` is always excluded from user responses.

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `401` | `{ "error": "..." }` | Auth failure (see verifyToken) |
| `403` | `{ "message": "Forbidden - Requires Admin role" }` | Non-admin caller |
| `500` | `{ "error": "Internal Server Error" }` | Unexpected error |

---

#### `GET /api/v1/user/:id`

Retrieves a single user document by their MongoDB `_id`.

**Auth:** Admin token required

**URL Params:**

| Param | Type | Description |
|---|---|---|
| `id` | `string` | MongoDB `_id` of the user |

**Response `200`:**
```json
{
  "_id": "663f1a2b4c5d6e7f8a9b0c2e",
  "role": { "_id": "...", "name": "analyst" },
  "status": "active",
  "name": "Bob Analyst",
  "email": "bob@zorvyn.com",
  "mobileNo": "9123456780",
  "gender": "M",
  "address": { "..." : "..." },
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "User not found" }` | No user with given ID |
| `401` | `{ "error": "..." }` | Auth failure |
| `403` | `{ "message": "Forbidden - Requires Admin role" }` | Non-admin caller |
| `500` | `{ "error": "Internal Server Error" }` | Unexpected error |

---

#### `PATCH /api/v1/user/update-user-state/:id`

Updates a user's `role` and/or `status`. If the role is changed, the user's active Redis session is patched in-place so the change takes effect without forcing re-login.

**Auth:** Admin token required

**URL Params:**

| Param | Type | Description |
|---|---|---|
| `id` | `string` | MongoDB `_id` of the user to update |

**Request Body** (all fields optional, at least one required):
```json
{
  "roleName": "viewer",
  "status": "inactive"
}
```

> `roleName` must be one of: `"viewer"`, `"analyst"`, `"admin"`  
> `status` must be one of: `"active"`, `"inactive"`

**Response `200`:**
```json
{
  "message": "User updated successfully",
  "user": {
    "_id": "663f1a2b4c5d6e7f8a9b0c2e",
    "role": "663f000000000000000000ab",
    "status": "inactive",
    "name": "Bob Analyst",
    "email": "bob@zorvyn.com",
    "mobileNo": "9123456780",
    "gender": "M",
    "address": { "..." : "..." },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-04-03T12:00:00.000Z"
  }
}
```

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "Role not found" }` | roleName not in DB |
| `400` | `{ "error": "User not found" }` | No user with given ID |
| `401` | `{ "error": "..." }` | Auth failure |
| `403` | `{ "message": "Forbidden - Requires Admin role" }` | Non-admin caller |
| `500` | `{ "error": "Internal Server Error" }` | Unexpected error |

---

#### `DELETE /api/v1/user/delete-user/:id`

Soft-deletes a user. The user document is archived in the `DeletedUser` collection (with `deletedBy` set to the admin's ID) before being removed from the `User` collection.

**Auth:** Admin token required

**URL Params:**

| Param | Type | Description |
|---|---|---|
| `id` | `string` | MongoDB `_id` of the user to delete |

**Request Body:** None

**Response `200`:**
```json
{
  "message": "User deleted successfully",
  "user": {
    "_id": "663f1a2b4c5d6e7f8a9b0c2e",
    "role": "663f000000000000000000ab",
    "status": "inactive",
    "name": "Bob Analyst",
    "email": "bob@zorvyn.com",
    "mobileNo": "9123456780",
    "gender": "M",
    "address": { "..." : "..." },
    "deletedBy": "663f1a2b4c5d6e7f8a9b0c1d",
    "deletedAt": "2024-04-03T12:05:00.000Z"
  }
}
```

> **Why soft delete?** Financial systems require a complete audit trail. Permanently erasing user records could destroy the referential integrity of transaction and account history. The `DeletedUser` collection acts as an immutable archive.

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "User ID is required" }` | Missing `:id` param |
| `400` | `{ "error": "User not found" }` | No user with given ID |
| `400` | `{ "error": "Error in deleting user" }` | Archive document creation failure |
| `401` | `{ "error": "..." }` | Auth failure |
| `403` | `{ "message": "Forbidden - Requires Admin role" }` | Non-admin caller |
| `500` | `{ "error": "Internal Server Error" }` | Unexpected error |

---

### Account Management Routes — `/api/v1/account`

---

#### `POST /api/v1/account/create-account/:id`

Creates a new bank account for the specified user. Account number (12 digits) and IFSC code (10 chars) are auto-generated.

**Auth:** Admin token required

**URL Params:**

| Param | Type | Description |
|---|---|---|
| `id` | `string` | MongoDB `_id` of the user to create an account for |

**Request Body** (optional):
```json
{
  "balance": 5000
}
```

> If `balance` is omitted, defaults to `2000`.

**Response `201`:**
```json
{
  "_id": "663f2b3c4d5e6f7a8b9c0d1e",
  "userId": "663f1a2b4c5d6e7f8a9b0c2e",
  "accountNo": "481923756034",
  "IFSC": "ZRVN0012AB",
  "balance": 5000,
  "transactions": [],
  "createdAt": "2024-04-03T12:10:00.000Z",
  "updatedAt": "2024-04-03T12:10:00.000Z"
}
```

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "User not found" }` | No user with given ID |
| `400` | `{ "error": "Error in creating Account" }` | Account document save failure |
| `401` | `{ "error": "..." }` | Auth failure |
| `403` | `{ "message": "Forbidden - Requires Admin role" }` | Non-admin caller |
| `500` | `{ "error": "Internal Server Error" }` | Unexpected error |

---

#### `GET /api/v1/account/user/:id`

Retrieves all accounts belonging to a specific user. Admin only.

**Auth:** Admin token required

**URL Params:**

| Param | Type | Description |
|---|---|---|
| `id` | `string` | MongoDB `_id` of the user whose accounts to fetch |

**Response `200`:**
```json
[
  {
    "_id": "663f2b3c4d5e6f7a8b9c0d1e",
    "userId": "663f1a2b4c5d6e7f8a9b0c2e",
    "accountNo": "481923756034",
    "IFSC": "ZRVN0012AB",
    "balance": 5000,
    "transactions": [],
    "createdAt": "2024-04-03T12:10:00.000Z",
    "updatedAt": "2024-04-03T12:10:00.000Z"
  }
]
```

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "Cannot find Accounts for this User ID" }` | No accounts found |
| `401` | `{ "error": "..." }` | Auth failure |
| `403` | `{ "message": "Forbidden - Requires Admin role" }` | Non-admin caller |
| `500` | `{ "error": "Internal Server Error" }` | Unexpected error |

---

#### `GET /api/v1/account/my-accounts`

Retrieves all accounts belonging to the currently authenticated user (derived from `req.user._id`).

**Auth:** Any valid user token (`verifyToken` only, no RBAC gate)

**Response `200`:**
```json
[
  {
    "_id": "663f2b3c4d5e6f7a8b9c0d1e",
    "userId": "663f1a2b4c5d6e7f8a9b0c2e",
    "accountNo": "481923756034",
    "IFSC": "ZRVN0012AB",
    "balance": 2000,
    "transactions": [],
    "createdAt": "2024-04-03T12:10:00.000Z",
    "updatedAt": "2024-04-03T12:10:00.000Z"
  }
]
```

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "Cannot find Accounts. Try again later." }` | Unexpected query failure |
| `401` | `{ "error": "..." }` | Auth failure |
| `500` | `{ "error": "Internal Server Error" }` | Unexpected error |

---

#### `GET /api/v1/account/:id`

Retrieves details of a single account by its `_id`. Enforces ownership for `viewer` and `analyst` roles — they can only view their own accounts. Admins can view any account.

**Auth:** Any valid user token

**URL Params:**

| Param | Type | Description |
|---|---|---|
| `id` | `string` | MongoDB `_id` of the account |

**Response `200`:**
```json
{
  "_id": "663f2b3c4d5e6f7a8b9c0d1e",
  "userId": "663f1a2b4c5d6e7f8a9b0c2e",
  "accountNo": "481923756034",
  "IFSC": "ZRVN0012AB",
  "balance": 5000,
  "transactions": ["663faa..."],
  "createdAt": "2024-04-03T12:10:00.000Z",
  "updatedAt": "2024-04-03T12:10:00.000Z"
}
```

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "Cannot find Account with this ID" }` | No account with given ID |
| `401` | `{ "error": "..." }` | Auth failure |
| `403` | `{ "error": "Forbidden - You are not allowed to view any other account other than yours" }` | viewer/analyst accessing another user's account |
| `500` | `{ "error": "Internal Server Error" }` | Unexpected error |

---

### Transactions & Financial Record Management Routes — `/api/v1/transactions`

> All endpoints require at minimum a valid `verifyToken` session. Create and admin-scoped list routes additionally require `requireAdminRole`.

**Shared filter query params** (available on all three list endpoints):

| Param | Type | Example | Description |
|---|---|---|---|
| `page` | number | `1` | Page number (default: `1`) |
| `limit` | number | `10` | Results per page (default: `10`) |
| `type` | string | `expense` | Filter by `income` or `expense` |
| `category` | string | `rent` | Filter by category enum value |
| `startDate` | string | `2026-01-01` | Include records on or after this date (ISO 8601, UTC) |
| `endDate` | string | `2026-04-01` | Include records on or before end of this date (ISO 8601, UTC) |

---

#### `POST /api/v1/transactions/create-record/:id`

Creates a new transaction record against an account. Updates the account balance atomically (deducts for `expense`, adds for `income`). Admin only.

**Auth:** Admin token required

**URL Params:**

| Param | Type | Description |
|---|---|---|
| `id` | `string` | MongoDB `_id` of the **account** to record the transaction on |

**Request Body:**
```json
{
  "amount": 1500,
  "type": "expense",
  "category": "rent",
  "note": "Monthly rent for April"
}
```

> `type`: `"income"` | `"expense"`  
> `category`: `"salary"` | `"rent"` | `"luxury"` | `"essentials"` | `"loan"` | `"tax"` | `"others"`  
> `note`: optional free-text annotation

**Response `201`:**
```json
{
  "_id": "663faa1b2c3d4e5f6a7b8c9d",
  "accountId": "663f2b3c4d5e6f7a8b9c0d1e",
  "amount": 1500,
  "type": "expense",
  "category": "rent",
  "note": "Monthly rent for April",
  "createdBy": "663f1a2b4c5d6e7f8a9b0c1d",
  "createdAt": "2026-04-04T00:00:00.000Z",
  "updatedAt": "2026-04-04T00:00:00.000Z"
}
```

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "Cannot find account with this ID" }` | Account not found |
| `400` | `{ "error": "All fields are required" }` | `amount`, `type`, or `category` missing |
| `400` | `{ "error": "Enter a valid Transaction amount" }` | `amount` ≤ 0 |
| `400` | `{ "error": "Enter a valid Transaction type" }` | `type` not `income`/`expense` |
| `400` | `{ "error": "Enter a valid Transaction category" }` | Unknown category value |
| `400` | `{ "error": "Insufficient Balance" }` | Expense exceeds account balance |
| `401` | `{ "error": "..." }` | Auth failure |
| `403` | `{ "message": "Forbidden - Requires Admin role" }` | Non-admin caller |
| `500` | `{ "error": "Internal Server Error" }` | Unexpected error |

---

#### `GET /api/v1/transactions/my-transactions`

Returns the paginated, filterable list of **all transactions belonging to the authenticated user** across all their accounts (resolved server-side via account ownership lookup).

**Auth:** Any valid user token

**Query Params:** See shared filter params table above.

**Example:**
```
GET /api/v1/transactions/my-transactions?type=expense&category=rent&startDate=2026-01-01&endDate=2026-04-01&page=1&limit=5
```

**Response `200`:**
```json
{
  "transactions": [
    {
      "_id": "663faa1b2c3d4e5f6a7b8c9d",
      "accountId": { "_id": "663f2b3c4d5e6f7a8b9c0d1e", "userId": "663f1a2b4c5d6e7f8a9b0c2e" },
      "amount": 1500,
      "type": "expense",
      "category": "rent",
      "note": "Monthly rent for April",
      "createdBy": "663f1a2b4c5d6e7f8a9b0c1d",
      "createdAt": "2026-04-04T00:00:00.000Z",
      "updatedAt": "2026-04-04T00:00:00.000Z"
    }
  ],
  "currentPage": 1,
  "totalPages": 3,
  "totalTransactions": 14
}
```

> Returns `{ transactions: [], currentPage, totalPages: 0, totalTransactions: 0 }` if the user has no accounts.

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `401` | `{ "error": "..." }` | Auth failure |
| `500` | `{ "error": "Internal Server Error" }` | Unexpected error |

---

#### `GET /api/v1/transactions/user/:id`

Returns the paginated, filterable transaction history of a **specific user** (identified by their user `_id`). Admin only.

**Auth:** Admin token required

**URL Params:**

| Param | Type | Description |
|---|---|---|
| `id` | `string` | MongoDB `_id` of the **user** whose transactions to fetch |

**Query Params:** See shared filter params table above.

**Response `200`:** Same shape as `GET /my-transactions`.

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `401` | `{ "error": "..." }` | Auth failure |
| `403` | `{ "message": "Forbidden - Requires Admin role" }` | Non-admin caller |
| `500` | `{ "error": "Internal Server Error" }` | Unexpected error |

---

#### `GET /api/v1/transactions`

Returns a paginated, filterable list of **every transaction in the system**. Admin only.

**Auth:** Admin token required

**Query Params:** See shared filter params table above.

**Response `200`:** Same shape as `GET /my-transactions`.

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `401` | `{ "error": "..." }` | Auth failure |
| `403` | `{ "message": "Forbidden - Requires Admin role" }` | Non-admin caller |
| `500` | `{ "error": "Internal Server Error" }` | Unexpected error |

---

#### `GET /api/v1/transactions/:id`

Returns a **single transaction** by its `_id`. `viewer` and `analyst` roles can only access transactions tied to their own accounts; admins can access any.

**Auth:** Any valid user token

**URL Params:**

| Param | Type | Description |
|---|---|---|
| `id` | `string` | MongoDB `_id` of the transaction |

**Response `200`:**
```json
{
  "_id": "663faa1b2c3d4e5f6a7b8c9d",
  "accountId": { "_id": "663f2b3c4d5e6f7a8b9c0d1e", "userId": "663f1a2b4c5d6e7f8a9b0c2e" },
  "amount": 1500,
  "type": "expense",
  "category": "rent",
  "note": "Monthly rent for April",
  "createdBy": "663f1a2b4c5d6e7f8a9b0c1d",
  "createdAt": "2026-04-04T00:00:00.000Z",
  "updatedAt": "2026-04-04T00:00:00.000Z"
}
```

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "Cannot find Transaction with this ID" }` | No transaction with given ID |
| `401` | `{ "error": "..." }` | Auth failure |
| `403` | `{ "error": "Forbidden - You are not allowed to view any other transaction other than yours" }` | viewer/analyst accessing another user's transaction |
| `500` | `{ "error": "Internal Server Error" }` | Unexpected error |

---

#### `PATCH /api/v1/transactions/update/:id`

Updates an existing transaction. Provides automatic and consistent account balance tracking, including reversing the original balance payload, migrating transaction to a different authorized account, and processing the updated payload securely. Admin only.

**Auth:** Admin token required

**URL Params:**

| Param | Type | Description |
|---|---|---|
| `id` | `string` | MongoDB `_id` of the transaction |

**Request Body** (all fields optional):
```json
{
  "accountId": "663f2b3c4d5e6f7a8b9c0d1e",
  "amount": 2000,
  "type": "expense",
  "category": "rent",
  "note": "Updated rent amount"
}
```

**Response `200`:**
```json
{
  "message": "Transaction updated successfully",
  "transaction": { ...updated transaction object... }
}
```

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "Transaction not found" }` | No transaction with given ID |
| `400` | `{ "error": "Original account not found" }` | Missing underlying source account |
| `400` | `{ "error": "Reverting this transaction would cause a negative balance on the original account" }` | Changing income into expense causes deficit |
| `400` | `{ "error": "Insufficient Balance" }` | Updating expense to larger amount exceeds balance |
| `403` | `{ "error": "Cannot move a transaction to another user's account" }` | Inter-account migration targets another user |

---

#### `DELETE /api/v1/transactions/delete/:id`

Soft-deletes a transaction, keeping full audit logs in `DeletedTransactions`, removing its payload effect on the linked `Account`, and unbinding it from the related collections. Admin only.

**Auth:** Admin token required

**URL Params:**

| Param | Type | Description |
|---|---|---|
| `id` | `string` | MongoDB `_id` of the transaction |

**Response `200`:**
```json
{
  "message": "Transaction deleted successfully",
  "transaction": { ...deleted transaction object... }
}
```

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "Transaction not found" }` | No transaction with given ID |
| `400` | `{ "error": "Cannot delete this income transaction: it would result in a negative account balance." }` | Reverse of income causes negative balance |
| `403` | `{ "message": "Forbidden - Requires Admin role" }` | Non-admin caller |

---
### Analytics & Dashboard Routes — `/api/v1/analytics`
---

#### `GET /api/v1/analytics/my-summary`
Calculates and returns the total financial summary strictly for the logged-in user's own accounts.

**Auth:** Any valid user token

**Response `200`:**
```json
{
  "totalIncome": 45000,
  "totalExpenses": 12500.5,
  "netBalance": 32150.2
}
```
---
#### `GET /api/v1/analytics/summary/account/:id`
Calculates and returns the total financial summary for a single, specific account.
For `viewer` roles, they are restricted strictly to calculations on accounts they own.

**Auth:** Any valid user token

**URL Params:**
| Param | Type | Description |
|---|---|---|
| `id` | `string` | MongoDB `_id` of the account to query |

**Response `200`:**
```json
{
  "totalIncome": 10000,
  "totalExpenses": 3000,
  "netBalance": 7000
}
```

**Error Codes:**
| Status | Body | Condition |
|---|---|---|
| `401` | `{ "error": "..." }` | Auth failure |
| `403` | `{ "error": "Forbidden - You can only view summary for your own account" }` | Viewer attempts to access an account they do not own |
| `404` | `{ "error": "Account not found" }` | No account found with given ID |
---
#### `GET /api/v1/analytics/summary/categories`
Calculates and returns an aggregated transaction breakdown grouped by category for analytics.
Supports transaction filtering query parameters via `req.query`.

**Auth:** `requireAnalyst` token required

**Response `200`:**
```json
{
  "summary": [
    { "category": "rent", "income": 0, "expense": 1500, "total": 1500 }
  ]
}
```
---
#### `GET /api/v1/analytics/trends`
Calculates and returns transactional volume grouped by `yearly` or `monthly` periods.

**Auth:** `requireAnalyst` token required

**Query Params:**
| Param | Type | Description |
|---|---|---|
| `period` | `string` | Use `"yearly"` for yearly grouping, `"monthly"` (default behavior) for monthly grouping |

**Response `200`:**
```json
[
  { "month": "Jan", "year": 2026, "income": 5000, "expense": 1500 }
]
```
---
#### `GET /api/v1/analytics/recent`
Fetches the latest transactions over the last 7 days natively unless bounded by filter query parameters.

**Auth:** `requireAnalyst` token required

**Response `200`:** Returns array of Transaction objects.

---
### Test Routes — `/api/v1/test`

> Development/staging utility routes. Not guarded by auth — **Not to be exposed in production.**

---

#### `POST /api/v1/test/send-email`

Sends a test email via Resend to validate the email service integration.

**Auth:** None

**Request Body:**
```json
{
  "to": "recipient@example.com",
  "subject": "Hello from Zorvyn",
  "message": "This is a test email body."
}
```

**Response `200`:**
```json
{
  "success": true,
  "response": { "id": "re_abc123xyz" }
}
```

**Error Codes:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "All fields required" }` | `to`, `subject`, or `message` missing |
| `500` | `{ "error": "Internal Server error" }` | Resend API failure or unexpected error |

---

## 8. Running Locally

```bash
# 1. Clone the repository
git clone <repo-url>
cd Zorvyn_Finance_Management

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your MongoDB URI, JWT secret, Resend API key, Redis URL (Upstash), Master Password

# 5. Seed roles into MongoDB (viewer, analyst, admin)
cd seed
pip install -r requirements.txt
python seedRoles.py

# 6. Start the dev server
npm run dev
```

Server starts on `http://localhost:{PORT}` (default **5000**).  
Visit `http://localhost:5000/` in a browser to view this documentation page rendered as HTML.

### Bootstrap Flow (First Run)

```
1. POST /api/v1/master/get-token   { "password": "<MASTER_PASSWORD>" }
   → Save the returned JWT

2. POST /api/v1/master/add-admin   Authorization: Bearer <master_jwt>
   { full user body }
   → First admin created, save the returned user token

3. POST /api/v1/auth/signup        Authorization: Bearer <admin_user_token>
   { "roleName": "analyst", ... }
   → Create additional users as needed
```
