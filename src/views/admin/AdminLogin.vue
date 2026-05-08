<script setup>
import { ref } from 'vue'

const props = defineProps(['loginForm', 'isDashboardLoading'])
const emit = defineEmits(['login', 'navigate'])

const handleLogin = () => {
  emit('login')
}

const navigateTo = (page) => {
  emit('navigate', page)
}
</script>

<template>
  <div class="page-container">
    <div class="container login-content">
      <div class="login-card animate-fade-up">
        <div class="login-header-section">
          <h2>Selamat Datang Kembali 🍕</h2>
          <p>Login untuk mengakses dashboard Anda</p>
        </div>
        <form @submit.prevent="handleLogin" class="login-form-ui">
          <div class="form-group">
            <label>Nama</label>
            <input type="text" v-model="loginForm.email" placeholder="Admin Name" required />
          </div>
          <div class="form-group">
            <label>Kata Sandi</label>
            <input type="password" v-model="loginForm.password" placeholder="••••••••" required />
          </div>
          <button type="submit" class="btn btn-primary w-full" :disabled="isDashboardLoading">
            {{ isDashboardLoading ? 'Masuk...' : 'Masuk' }}
          </button>
        </form>
        <button class="btn btn-outline w-full mt-3" @click="navigateTo('home')">Kembali ke Beranda</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-content {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 80vh;
}
.login-card {
  background: white;
  padding: 3rem;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  width: 100%;
  max-width: 450px;
  border: 1px solid var(--border);
}
.login-header-section {
  text-align: center;
  margin-bottom: 2.5rem;
}
.login-form-ui .form-group {
  margin-bottom: 1.5rem;
}
.login-form-ui label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: var(--text-dark);
}
.login-form-ui input {
  width: 100%;
  padding: 0.8rem 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  font-size: 1rem;
  transition: border-color 0.2s;
}
.login-form-ui input:focus {
  outline: none;
  border-color: var(--primary);
}
</style>
