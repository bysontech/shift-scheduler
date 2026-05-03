import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

export async function signJwt(sub: string, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret)
  return new SignJWT({ sub })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key)
}

export async function verifyJwt(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const key = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, key)
    return payload
  } catch {
    return null
  }
}
