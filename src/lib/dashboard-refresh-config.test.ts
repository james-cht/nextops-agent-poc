import { describe, expect, it } from 'vitest'
import {
  DASHBOARD_REFRESH_CONFIG_KEY,
  DASHBOARD_REFRESH_OPTIONS,
  DEFAULT_DASHBOARD_REFRESH_SEC,
} from './dashboard-refresh-config'

describe('dashboard-refresh-config', () => {
  it('has DEFAULT_DASHBOARD_REFRESH_SEC within DASHBOARD_REFRESH_OPTIONS', () => {
    expect(DASHBOARD_REFRESH_OPTIONS).toContain(DEFAULT_DASHBOARD_REFRESH_SEC)
  })

  it('has DASHBOARD_REFRESH_CONFIG_KEY set to dashboard_refresh_sec', () => {
    expect(DASHBOARD_REFRESH_CONFIG_KEY).toBe('dashboard_refresh_sec')
  })
})
