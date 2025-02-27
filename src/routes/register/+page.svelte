<script lang="ts">
    import { supabase } from '$lib/supabaseClient';
    import { goto } from '$app/navigation';
    import { t } from 'svelte-i18n';
    let email = '';
    let password = '';
    let errorMsg = '';
  
    async function handleRegister() {
      errorMsg = '';
      const { data, error } = await supabase.auth.signUp({
        email,
        password
      });
  
      if (error) {
        errorMsg = error.message;
      } else {
        // 회원가입 성공 후 로그인 페이지로 이동
        goto('/login');
      }
    }
  </script>
  
  <div class="auth-page">
    <div class="auth-card">
      <h1>{$t('register')}</h1>
      <form on:submit|preventDefault={handleRegister}>
        <div class="input-group">
          <label for="email">{$t('email')}</label>
          <input id="email" type="email" bind:value={email} required />
        </div>
        <div class="input-group">
          <label for="password">{$t('password')}</label>
          <input id="password" type="password" bind:value={password} required />
        </div>
        {#if errorMsg}
          <p class="error">{errorMsg}</p>
        {/if}
        <button type="submit" class="btn">{$t('register')}</button>
      </form>
      <p>{$t('alreadyAccount')} <a href="/login">{$t('login')}</a></p>
    </div>
  </div>
  
  <style>
    .auth-page {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #f9f9f9;
    }
    .auth-card {
      max-width: 400px;
      width: 90%;
      background: #fff;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      text-align: center;
    }
    h1 {
      margin-bottom: 1.5rem;
    }
    .input-group {
      margin-bottom: 1rem;
      text-align: left;
    }
    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: bold;
    }
    input {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-sizing: border-box;
    }
    .btn {
      width: 100%;
      padding: 0.5rem 1rem;
      border: 1px solid #DDDDDD;
      background-color: #B7DDBF;
      color: #000;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
      margin-top: 1rem;
      transition: background-color 0.3s;
    }
    .btn:hover {
      background-color: #A3CBB1;
    }
    .error {
      color: red;
      margin-bottom: 1rem;
    }
    a {
      color: #0070f3;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>