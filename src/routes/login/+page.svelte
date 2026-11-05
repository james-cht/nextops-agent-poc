<script lang="ts">
  import { goto } from '$app/navigation';
  import { publicHref } from '$lib/kit-public-href';

  let username = $state('');
  let password = $state('');
  let totpCode = $state('');
  let errorMessage = $state('');
  let loading = $state(false);

  async function handleLogin() {
    loading = true;
    errorMessage = '';

    if (!username.trim() || !password) {
      errorMessage = '請輸入 Username 與密碼';
      loading = false;
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          totpCode: totpCode.trim() || undefined,
        }),
      });

      if (res.ok) {
        goto(publicHref('/'));
      } else {
        const data = await res.json().catch(() => ({}));
        if (res.status === 429) {
          errorMessage = '登入暫時鎖定，請稍後再試';
        } else if (res.status === 401) {
          errorMessage = '帳號或密碼錯誤';
        } else {
          errorMessage = data?.error || '登入失敗，請稍後再試';
        }
      }
    } catch {
      errorMessage = '網路連接失敗，請檢查網路';
    } finally {
      loading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleLogin();
    }
  }
</script>

<div class="login-page">
  <div class="login-card">
    <!-- Logo -->
    <div class="logo-wrapper">
      <div class="logo-gradient">
        <span class="logo-n">N</span>
      </div>
    </div>

    <!-- Branding -->
    <h1 class="brand-name">NEXTOPS</h1>
    <p class="brand-subtitle">AI OPS PLATFORM · Operator Account 登入</p>

    <!-- Form -->
    <form class="login-form" onsubmit={(e) => { e.preventDefault(); handleLogin(); }}>
      <div class="input-group">
        <label for="username">Username</label>
        <input
          type="text"
          id="username"
          autocomplete="username"
          bind:value={username}
          placeholder="Username"
          onkeydown={handleKeydown}
          autofocus
        />
      </div>
      <div class="input-group">
        <label for="password">Lasting Password</label>
        <input
          type="password"
          id="password"
          autocomplete="current-password"
          bind:value={password}
          placeholder="請輸入密碼"
          onkeydown={handleKeydown}
        />
      </div>

      <div class="input-group">
        <label for="totp">Second Factor（若已註冊 TOTP）</label>
        <input
          type="text"
          id="totp"
          inputmode="numeric"
          autocomplete="one-time-code"
          bind:value={totpCode}
          placeholder="6 位代碼"
          onkeydown={handleKeydown}
        />
      </div>

      {#if errorMessage}
        <p class="error-text">{errorMessage}</p>
      {/if}

      <button type="submit" class="login-btn" disabled={loading}>
        {loading ? '登入中...' : '登入系統'}
      </button>
    </form>
  </div>
</div>

<style>
  .login-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: var(--theme-page);
    padding: 24px;
  }

  .login-card {
    width: 100%;
    max-width: 420px;
    border-radius: 28px;
    background: var(--theme-login-card);
    border: 1px solid rgba(139, 92, 246, 0.15);
    box-shadow:
      0 0 80px rgba(139, 92, 246, 0.08),
      0 0 20px rgba(139, 92, 246, 0.05),
      inset 0 1px 0 color-mix(in srgb, var(--theme-fg) 3%, transparent);
    padding: 48px 40px 40px;
    text-align: center;
  }

  /* Logo */
  .logo-wrapper {
    display: flex;
    justify-content: center;
    margin-bottom: 24px;
  }

  .logo-gradient {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 50%, #818cf8 100%);
    box-shadow:
      0 8px 32px rgba(139, 92, 246, 0.3),
      0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  }

  .logo-n {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    font-size: 32px;
    font-weight: 800;
    color: #fff;
    letter-spacing: -1px;
    line-height: 1;
  }

  /* Branding */
  .brand-name {
    font-family: inherit;
    font-size: 22px;
    font-weight: 700;
    color: var(--theme-fg);
    letter-spacing: 2px;
    margin: 0 0 8px 0;
  }

  .brand-subtitle {
    font-family: inherit;
    font-size: 13px;
    color: var(--theme-muted);
    letter-spacing: 0.4px;
    margin: 0 0 36px 0;
  }

  /* Form */
  .login-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
    text-align: left;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .input-group label {
    font-size: 13px;
    font-weight: 600;
    color: var(--theme-muted-strong);
  }

  .input-group input {
    width: 100%;
    padding: 14px 16px;
    background: var(--theme-input);
    border: 1px solid var(--theme-line);
    border-radius: 12px;
    color: var(--theme-fg);
    font-size: 14px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-sizing: border-box;
  }

  .input-group input::placeholder {
    color: var(--theme-muted);
  }

  .input-group input:focus {
    border-color: rgba(139, 92, 246, 0.4);
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
  }

  .error-text {
    font-size: 12px;
    color: var(--theme-danger);
    margin: 0;
  }

  /* Button */
  .login-btn {
    width: 100%;
    padding: 14px 24px;
    background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 50%, #818cf8 100%);
    border: none;
    border-radius: 12px;
    color: #fff;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    letter-spacing: 0.5px;
    margin-top: 4px;
  }

  .login-btn:hover:not(:disabled) {
    box-shadow: 0 4px 20px rgba(139, 92, 246, 0.35);
    transform: translateY(-1px);
  }

  .login-btn:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(139, 92, 246, 0.2);
  }

  .login-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
