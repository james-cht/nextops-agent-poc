import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ErrorCode, createErrorResponse, statusToErrorCode } from './errors.ts'

describe('error helpers', () => {
  it('maps status codes to error codes', () => {
    assert.strictEqual(statusToErrorCode(404), ErrorCode.NOT_FOUND)
    assert.strictEqual(statusToErrorCode(429), ErrorCode.RATE_LIMITED)
  })

  it('creates error response', () => {
    assert.deepStrictEqual(
      createErrorResponse(ErrorCode.BAD_REQUEST, 'x'),
      {
        error: 'x',
        code: ErrorCode.BAD_REQUEST,
      }
    )
  })
})
