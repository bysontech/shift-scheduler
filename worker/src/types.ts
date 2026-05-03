export type Env = {
  DB: D1Database
  JWT_SECRET: string
}

export type AuthVariables = {
  userId: string
  workspaceId: string
}
